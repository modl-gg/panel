import express from 'express';
import Stripe from 'stripe';
import { isAuthenticated } from '../middleware/auth-middleware';
import { connectToGlobalModlDb } from '../db/connectionManager';
import { ModlServerSchema } from '@modl-gg/shared-web';

const router = express.Router();

// Initialize Stripe only if keys are available
let stripe: Stripe | null = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
} else {
  console.warn('STRIPE_SECRET_KEY not found. Billing features will be disabled.');
}

router.post('/create-checkout-session', isAuthenticated, async (req, res) => {
  if (!stripe) {
    return res.status(503).send('Billing service unavailable. Stripe not configured.');
  }

  const server = req.modlServer;

  if (!server) {
    return res.status(400).send('Server context not found in request.');
  }

  try {
    let customerId = server.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: server.adminEmail,
        name: server.serverName,
        metadata: {
          serverName: server.customDomain,
        },
      });
      customerId = customer.id;
      server.stripe_customer_id = customerId;
      await server.save();
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      allow_promotion_codes: true,
      consent_collection: {
        terms_of_service: "required"
      },
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      customer: customerId,
      success_url: `https://${server.customDomain}.${process.env.DOMAIN}/panel/settings?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://${server.customDomain}.${process.env.DOMAIN}/panel/settings`,
    });

    res.send({ sessionId: session.id });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).send('Internal Server Error');
  }
});

router.post('/create-portal-session', isAuthenticated, async (req, res) => {
  if (!stripe) {
    return res.status(503).send('Billing service unavailable. Stripe not configured.');
  }

  const server = req.modlServer;

  if (!server) {
    return res.status(400).send('Server context not found in request.');
  }

  try {
    if (!server.stripe_customer_id) {
      return res.status(404).send('Customer ID not found for server');
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: server.stripe_customer_id,
      return_url: `https://${server.customDomain}.${process.env.DOMAIN}/panel/settings`,
    });

    res.send({ url: portalSession.url });
  } catch (error) {
    console.error('Error creating portal session:', error);
    res.status(500).send('Internal Server Error');
  }
});

router.post('/cancel-subscription', isAuthenticated, async (req, res) => {
  if (!stripe) {
    return res.status(503).send('Billing service unavailable. Stripe not configured.');
  }

  const server = req.modlServer;

  if (!server) {
    return res.status(400).send('Server context not found in request.');
  }

  try {
    if (!server.stripe_subscription_id) {
      return res.status(404).send('No active subscription found to cancel');
    }

    // Cancel the subscription at period end (so user keeps access until billing period ends)
    const canceledSubscription = await stripe.subscriptions.update(server.stripe_subscription_id, {
      cancel_at_period_end: true
    }) as any;

    // Update our database to reflect the cancellation
    const globalDb = await connectToGlobalModlDb();
    const Server = globalDb.models.ModlServer || globalDb.model('ModlServer', ModlServerSchema);

    // Ensure we have the current_period_end set properly
    let periodEndDate = server.current_period_end;
    if (!periodEndDate && canceledSubscription.current_period_end) {
      periodEndDate = new Date(canceledSubscription.current_period_end * 1000);
    }

    const updateData: any = {
      subscription_status: 'canceled'
    };
    
    // Update period end if we have it
    if (periodEndDate) {
      updateData.current_period_end = periodEndDate;
    }

    await Server.findOneAndUpdate(
      { _id: server._id },
      updateData
    );

    res.json({ 
      success: true, 
      message: 'Subscription cancelled successfully. Access will continue until the end of your current billing period.',
      cancels_at: canceledSubscription.current_period_end ? new Date(canceledSubscription.current_period_end * 1000) : null
    });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).send('Failed to cancel subscription. Please try again or contact support.');
  }
});

router.get('/status', isAuthenticated, async (req, res) => {
  const server = req.modlServer;

  if (!server) {
    return res.status(400).send('Server context not found in request.');
  }

  try {
    // If we have a Stripe subscription ID, fetch the latest status directly from Stripe as a fallback
    let currentStatus = server.subscription_status;
    let currentPeriodEnd = server.current_period_end;
    let currentPeriodStart = server.current_period_start;

    if (server.stripe_subscription_id && (!currentStatus || ['active', 'canceled'].includes(currentStatus))) {
      if (!stripe) {
        console.warn('[BILLING STATUS] Cannot sync with Stripe - Stripe not configured');
      } else {
        try {
          const subscription = await stripe.subscriptions.retrieve(server.stripe_subscription_id) as any;

          // Determine effective status - if cancel_at_period_end is true, treat as canceled
          let effectiveStatus = subscription.status;
          if (subscription.cancel_at_period_end === true && subscription.status === 'active') {
            effectiveStatus = 'canceled';
          }

          // Parse period dates from Stripe
          let periodStartDate = null;
          let periodEndDate = null;
          
          if (subscription.current_period_start && typeof subscription.current_period_start === 'number') {
            periodStartDate = new Date(subscription.current_period_start * 1000);
            if (isNaN(periodStartDate.getTime())) {
              console.error(`[BILLING STATUS] Invalid start date from Stripe timestamp: ${subscription.current_period_start}`);
              periodStartDate = null;
            }
          }
          
          if (subscription.current_period_end && typeof subscription.current_period_end === 'number') {
            periodEndDate = new Date(subscription.current_period_end * 1000);
            if (isNaN(periodEndDate.getTime())) {
              console.error(`[BILLING STATUS] Invalid end date from Stripe timestamp: ${subscription.current_period_end}`);
              periodEndDate = null;
            }
          }

          // If there's a discrepancy or missing period data, update our database
          const needsUpdate = effectiveStatus !== server.subscription_status || 
                             (periodEndDate && (!server.current_period_end || Math.abs(new Date(server.current_period_end).getTime() - periodEndDate.getTime()) > 1000)) ||
                             (periodStartDate && (!server.current_period_start || Math.abs(new Date(server.current_period_start).getTime() - periodStartDate.getTime()) > 1000)) ||
                             // Also update if we have period data from Stripe but missing in DB
                             (!server.current_period_end && periodEndDate) ||
                             (!server.current_period_start && periodStartDate);

          if (needsUpdate) {
            const globalDb = await connectToGlobalModlDb();
            const Server = globalDb.models.ModlServer || globalDb.model('ModlServer', ModlServerSchema);

            const updateData: any = {
              subscription_status: effectiveStatus,
            };

            // Always update period dates when syncing, but only if we have valid dates
            if (periodStartDate) {
              updateData.current_period_start = periodStartDate;
            }
            if (periodEndDate) {
              updateData.current_period_end = periodEndDate;
            }

            await Server.findOneAndUpdate(
              { _id: server._id },
              updateData
            );
            
            // Update our local variables to return the latest data
            currentStatus = effectiveStatus;
            if (periodStartDate) {
              currentPeriodStart = periodStartDate;
            }
            if (periodEndDate) {
              currentPeriodEnd = periodEndDate;
            }
            
            // Special logging for cancelled subscriptions
            if (effectiveStatus === 'canceled') {
              
            }
          }
        } catch (stripeError) {
          console.error('Error fetching subscription from Stripe:', stripeError);
          // Continue with database values if Stripe API fails
        }
      }
    }

    res.send({
      plan: server.plan,
      subscription_status: currentStatus,
      current_period_end: currentPeriodEnd,
      current_period_start: currentPeriodStart,
    });
  } catch (error) {
    console.error('Error fetching billing status:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Get usage statistics for CDN and AI
router.get('/usage', isAuthenticated, async (req, res) => {
  const server = req.modlServer;

  if (!server) {
    return res.status(400).send('Server context not found in request.');
  }

  try {
    const globalDb = await connectToGlobalModlDb();
    const Server = globalDb.models.ModlServer || globalDb.model('ModlServer', ModlServerSchema);

    // Fetch fresh server data from database to get latest usage billing settings
    const freshServer = await Server.findById(server._id);
    if (!freshServer) {
      return res.status(404).send('Server not found in database.');
    }

    

    // Get current billing period start and end dates
    const currentPeriodStart = freshServer.current_period_start || new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)); // Default to 30 days ago
    const currentPeriodEnd = freshServer.current_period_end || new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)); // Default to 30 days from now

    // For now, return mock data since nothing tracks usage yet
    // TODO: Replace with actual usage tracking from your CDN and AI service logs
    const cdnUsageGB = freshServer.cdn_usage_current_period || 0;
    const aiRequestsUsed = freshServer.ai_requests_current_period || 0;

    // Premium limits
    const CDN_LIMIT_GB = 200;
    const AI_LIMIT_REQUESTS = 10000;
    const CDN_OVERAGE_RATE = 0.05; // $0.05 per GB
    const AI_OVERAGE_RATE = 0.01; // $0.01 per request

    // Calculate overages
    const cdnOverageGB = Math.max(0, cdnUsageGB - CDN_LIMIT_GB);
    const aiOverageRequests = Math.max(0, aiRequestsUsed - AI_LIMIT_REQUESTS);

    // Calculate overage costs
    const cdnOverageCost = cdnOverageGB * CDN_OVERAGE_RATE;
    const aiOverageCost = aiOverageRequests * AI_OVERAGE_RATE;
    const totalOverageCost = cdnOverageCost + aiOverageCost;

    res.json({
      period: {
        start: currentPeriodStart,
        end: currentPeriodEnd
      },
      cdn: {
        used: cdnUsageGB,
        limit: CDN_LIMIT_GB,
        overage: cdnOverageGB,
        overageRate: CDN_OVERAGE_RATE,
        overageCost: cdnOverageCost,
        percentage: Math.min(100, (cdnUsageGB / CDN_LIMIT_GB) * 100)
      },
      ai: {
        used: aiRequestsUsed,
        limit: AI_LIMIT_REQUESTS,
        overage: aiOverageRequests,
        overageRate: AI_OVERAGE_RATE,
        overageCost: aiOverageCost,
        percentage: Math.min(100, (aiRequestsUsed / AI_LIMIT_REQUESTS) * 100)
      },
      totalOverageCost,
      usageBillingEnabled: freshServer.usage_billing_enabled || false
    });
  } catch (error) {
    console.error('Error fetching usage statistics:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Enable/disable usage billing and setup automatic payments
router.post('/usage-billing-settings', isAuthenticated, async (req, res) => {
  if (!stripe) {
    return res.status(503).send('Billing service unavailable. Stripe not configured.');
  }

  const server = req.modlServer;
  const { enabled } = req.body;

  if (!server) {
    return res.status(400).send('Server context not found in request.');
  }

  

  try {
    const globalDb = await connectToGlobalModlDb();
    const Server = globalDb.models.ModlServer || globalDb.model('ModlServer', ModlServerSchema);

    if (enabled && !server.stripe_customer_id) {
      return res.status(400).send('No Stripe customer ID found. Please ensure you have an active subscription.');
    }

    // Update the server's usage billing setting
    const updateResult = await Server.findOneAndUpdate(
      { _id: server._id },
      { 
        $set: {
          usage_billing_enabled: enabled,
          usage_billing_updated_at: new Date()
        }
      },
      { 
        new: true, // Return the updated document
        upsert: false // Don't create if not found
      }
    );

    // If enabling usage billing, we could set up Stripe metering here
    // For now, we'll just track the setting in our database
    
    res.json({ 
      success: true, 
      message: enabled 
        ? 'Usage billing has been enabled. You will be charged for overages at the end of each billing period.'
        : 'Usage billing has been disabled. Overages will not be charged.',
      usageBillingEnabled: enabled
    });
  } catch (error) {
    console.error('Error updating usage billing settings:', error);
    res.status(500).send('Failed to update usage billing settings. Please try again.');
  }
});

// Function to check for and update expired cancelled subscriptions
async function checkExpiredSubscriptions() {
  try {
    const globalDb = await connectToGlobalModlDb();
    const Server = globalDb.models.ModlServer || globalDb.model('ModlServer', ModlServerSchema);

    // Find all servers with cancelled subscriptions that have a period end date
    const cancelledServers = await Server.find({
      subscription_status: 'canceled',
      current_period_end: { $exists: true, $ne: null }
    });

    const now = new Date();
    let expiredCount = 0;
    
    for (const server of cancelledServers) {
      const endDate = new Date(server.current_period_end);
      if (endDate <= now) {
        // This subscription has expired, update it to free
        await Server.findOneAndUpdate(
          { _id: server._id },
          { 
            subscription_status: 'inactive',
            plan: 'free',
            current_period_end: null
          }
        );
        
        expiredCount++;
        
      }
    }

    if (expiredCount > 0) {
      
    }
  } catch (error) {
    console.error('[AUTO EXPIRED CHECK] Error checking for expired subscriptions:', error);
  }
}

// Start periodic check for expired subscriptions (every hour)
const expiredCheckInterval = setInterval(checkExpiredSubscriptions, 60 * 60 * 1000); // 1 hour

// Run initial check after 30 seconds to allow server to fully start
setTimeout(checkExpiredSubscriptions, 30 * 1000);

router.post('/resubscribe', isAuthenticated, async (req, res) => {
  if (!stripe) {
    return res.status(503).send('Billing service unavailable. Stripe not configured.');
  }

  const server = req.modlServer;

  if (!server) {
    return res.status(400).send('Server context not found in request.');
  }

  try {
    // Check if the server has a cancelled subscription
    if (server.subscription_status !== 'canceled') {
      return res.status(400).json({ 
        error: 'No cancelled subscription found to reactivate.' 
      });
    }

    let subscriptionResult;
    
    if (server.stripe_subscription_id) {
      try {
        // First, try to retrieve the existing subscription
        const existingSubscription = await stripe.subscriptions.retrieve(server.stripe_subscription_id) as any;
        
        if (existingSubscription.status === 'active' && existingSubscription.cancel_at_period_end) {
          // Subscription is active but set to cancel at period end - just remove the cancellation
          subscriptionResult = await stripe.subscriptions.update(server.stripe_subscription_id, {
            cancel_at_period_end: false
          }) as any;
          
          
        } else if (existingSubscription.status === 'canceled') {
          // Subscription was fully cancelled, need to create a new one
          throw new Error('Subscription was fully cancelled, creating new one');
        } else {
          return res.status(400).json({ 
            error: 'Subscription is not in a cancelled state that can be reactivated.' 
          });
        }
      } catch (stripeError: any) {
        if (stripeError.code === 'resource_missing') {
          // Subscription was deleted, create a new one
          
        }
        
        // Create new subscription
        if (!server.stripe_customer_id) {
          return res.status(400).json({ 
            error: 'No Stripe customer ID found. Cannot create new subscription.' 
          });
        }
        
        subscriptionResult = await stripe.subscriptions.create({
          customer: server.stripe_customer_id,
          items: [{ price: process.env.STRIPE_PRICE_ID }],
        }) as any;
        
        
      }
    } else {
      // No subscription ID stored, create a new subscription
      if (!server.stripe_customer_id) {
        return res.status(400).json({ 
          error: 'No Stripe customer ID found. Cannot create subscription.' 
        });
      }
      
      subscriptionResult = await stripe.subscriptions.create({
        customer: server.stripe_customer_id,
        items: [{ price: process.env.STRIPE_PRICE_ID }],
      }) as any;
      
      
    }

    // Update our database with the new subscription details
    const globalDb = await connectToGlobalModlDb();
    const Server = globalDb.models.ModlServer || globalDb.model('ModlServer', ModlServerSchema);

    // Parse period dates from the subscription
    let periodStartDate = null;
    let periodEndDate = null;
    
    if (subscriptionResult.current_period_start && typeof subscriptionResult.current_period_start === 'number') {
      periodStartDate = new Date(subscriptionResult.current_period_start * 1000);
      if (isNaN(periodStartDate.getTime())) {
        console.error(`[RESUBSCRIBE] Invalid start date from Stripe timestamp: ${subscriptionResult.current_period_start}`);
        periodStartDate = null;
      }
    }
    
    if (subscriptionResult.current_period_end && typeof subscriptionResult.current_period_end === 'number') {
      periodEndDate = new Date(subscriptionResult.current_period_end * 1000);
      if (isNaN(periodEndDate.getTime())) {
        console.error(`[RESUBSCRIBE] Invalid end date from Stripe timestamp: ${subscriptionResult.current_period_end}`);
        periodEndDate = null;
      }
    }

    const updateData: any = {
      stripe_subscription_id: subscriptionResult.id,
      subscription_status: subscriptionResult.status,
      plan: 'premium'
    };
    
    if (periodStartDate) {
      updateData.current_period_start = periodStartDate;
    }
    if (periodEndDate) {
      updateData.current_period_end = periodEndDate;
    }

    await Server.findOneAndUpdate(
      { _id: server._id },
      updateData
    );

    

    res.json({ 
      success: true, 
      message: 'Subscription reactivated successfully! Your premium features are now active.',
      subscription: {
        id: subscriptionResult.id,
        status: subscriptionResult.status,
        current_period_end: periodEndDate
      }
    });
  } catch (error) {
    console.error('Error resubscribing:', error);
    res.status(500).json({ 
      error: 'Failed to reactivate subscription. Please try again or contact support.',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;

// Stripe webhook handler - this needs to be separate from the authenticated routes
const webhookRouter = express.Router();

// Webhook handler for Stripe events
webhookRouter.post('/stripe-webhooks', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe) {
    console.warn('[WEBHOOK] Stripe not configured, ignoring webhook');
    return res.status(503).send('Stripe not configured');
  }

  if (!webhookSecret) {
    console.error('[WEBHOOK] STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).send('Webhook secret not configured');
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig as string, webhookSecret);
    
  } catch (err: any) {
    console.error('[WEBHOOK] Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    const globalDb = await connectToGlobalModlDb();
    const Server = globalDb.models.ModlServer || globalDb.model('ModlServer', ModlServerSchema);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        

        if (session.customer && session.subscription) {
          const server = await Server.findOne({ stripe_customer_id: session.customer });
          if (server) {
            // Fetch the subscription details to get period information
            const subscription = await stripe.subscriptions.retrieve(session.subscription as string) as any;
            
            let item = subscription.items.data[0];
            let periodStartDate = null;
            let periodEndDate = null;
            if (item.current_period_start && typeof item.current_period_start === 'number') {
              periodStartDate = new Date(item.current_period_start * 1000);
              if (isNaN(periodStartDate.getTime())) {
                console.error(`[WEBHOOK] Invalid start date from Stripe timestamp: ${item.current_period_start}`);
                periodStartDate = null;
              }
            }
            if (item.current_period_end && typeof item.current_period_end === 'number') {
              periodEndDate = new Date(item.current_period_end * 1000);
              if (isNaN(periodEndDate.getTime())) {
                console.error(`[WEBHOOK] Invalid end date from Stripe timestamp: ${item.current_period_end}`);
                periodEndDate = null;
              }
            }

            const updateData: any = {
              stripe_subscription_id: session.subscription,
              subscription_status: 'active',
              plan: 'premium' // Assuming checkout means premium plan
            };
            
            if (periodStartDate) {
              updateData.current_period_start = periodStartDate;
            }
            if (periodEndDate) {
              updateData.current_period_end = periodEndDate;
            }

            await Server.findOneAndUpdate(
              { _id: server._id },
              updateData
            );
            
          } else {
            console.warn(`[WEBHOOK] No server found for customer: ${session.customer}`);
          }
        }
        break;
      }
      
      case 'customer.subscription.created': {
        const subscription = event.data.object as any; // Stripe.Subscription
        

        const server = await Server.findOne({ stripe_customer_id: subscription.customer });
        if (server) {
          let periodStartDate = null;
          let periodEndDate = null;
          
          let item = subscription.items.data[0];
          if (item.current_period_start && typeof item.current_period_start === 'number') {
            periodStartDate = new Date(item.current_period_start * 1000);
            if (isNaN(periodStartDate.getTime())) {
              console.error(`[WEBHOOK] Invalid start date from Stripe timestamp for created subscription: ${item.current_period_start}`);
              periodStartDate = null;
            }
          }
          
          if (item.current_period_end && typeof item.current_period_end === 'number') {
            periodEndDate = new Date(item.current_period_end * 1000);
            if (isNaN(periodEndDate.getTime())) {
              console.error(`[WEBHOOK] Invalid end date from Stripe timestamp for created subscription: ${item.current_period_end}`);
              periodEndDate = null;
            }
          }

          const updateData: any = {
            stripe_subscription_id: subscription.id,
            subscription_status: subscription.status, // Use status from the event
          };

          // Set plan based on subscription status
          if (subscription.status === 'active') {
            updateData.plan = 'premium';
          } else if (subscription.status === 'past_due' || subscription.status === 'unpaid' || subscription.status === 'incomplete' || subscription.status === 'incomplete_expired') {
            updateData.plan = 'free';
          } else {
            // For trialing, paused, etc., keep as premium since user should have access
            updateData.plan = 'premium';
          }
          
          if (periodStartDate) {
            updateData.current_period_start = periodStartDate;
          }
          if (periodEndDate) {
            updateData.current_period_end = periodEndDate;
          }

          await Server.findOneAndUpdate(
            { _id: server._id },
            updateData
          );
          
        } else {
          console.warn(`[WEBHOOK] No server found for customer: ${subscription.customer} during subscription.created event for subscription ${subscription.id}`);
        }
        break;
      }
      
      case 'customer.subscription.updated': {
        const subscription = event.data.object as any; // Stripe.Subscription
        

        const server = await Server.findOne({ stripe_subscription_id: subscription.id });
        if (server) {
          // Validate and convert period dates
          let periodStartDate = null;
          let periodEndDate = null;
          
          let item = subscription.items.data[0];
          if (item.current_period_start && typeof item.current_period_start === 'number') {
            periodStartDate = new Date(item.current_period_start * 1000);
            if (isNaN(periodStartDate.getTime())) {
              console.error(`[WEBHOOK] Invalid start date from Stripe timestamp: ${item.current_period_start}`);
              periodStartDate = null;
            }
          }
          
          if (item.current_period_end && typeof item.current_period_end === 'number') {
            periodEndDate = new Date(item.current_period_end * 1000);
            if (isNaN(periodEndDate.getTime())) {
              console.error(`[WEBHOOK] Invalid end date from Stripe timestamp: ${item.current_period_end}`);
              periodEndDate = null;
            }
          }

          // Determine effective status - if cancel_at_period_end is true, treat as canceled
          let effectiveStatus = subscription.status;
          if (subscription.cancel_at_period_end === true && subscription.status === 'active') {
            effectiveStatus = 'canceled';
          }

          const updateData: any = {
            subscription_status: effectiveStatus,
          };

          // Set plan based on subscription status
          if (effectiveStatus === 'active') {
            updateData.plan = 'premium';
          } else if (effectiveStatus === 'past_due' || effectiveStatus === 'unpaid' || effectiveStatus === 'incomplete' || effectiveStatus === 'incomplete_expired') {
            updateData.plan = 'free';
          } else if (effectiveStatus === 'canceled') {
            // Don't change plan for canceled - let the existing logic handle it based on period end
            // The plan will be set to free when the period actually ends
          }

          // Always update period dates if we have valid dates, even for canceled subscriptions
          // This is important for canceled subscriptions so users know when access ends
          if (periodStartDate) {
            updateData.current_period_start = periodStartDate;
          }
          if (periodEndDate) {
            updateData.current_period_end = periodEndDate;
          }

          await Server.findOneAndUpdate(
            { _id: server._id },
            updateData
          );
          
          // Special logging for cancelled subscriptions
          if (effectiveStatus === 'canceled') {
            
          }
        } else {
          console.warn(`[WEBHOOK] No server found for subscription: ${subscription.id}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as any; // Use any to access Stripe properties
        

        const server = await Server.findOne({ stripe_subscription_id: subscription.id });
        if (server) {
          await Server.findOneAndUpdate(
            { _id: server._id },
            {
              subscription_status: 'canceled',
              plan: 'free',
              current_period_end: null
            }
          );
          
        } else {
          console.warn(`[WEBHOOK] No server found for deleted subscription: ${subscription.id}`);
        }
        break;
      } 
      
      case 'invoice.payment_failed': {
        const invoice = event.data.object as any; // Use any to access Stripe properties
        

        if (invoice.subscription) {
          const server = await Server.findOne({ stripe_subscription_id: invoice.subscription });
          if (server) {
            await Server.findOneAndUpdate(
              { _id: server._id },
              { 
                subscription_status: 'past_due',
                plan: 'free'
              }
            );
            
          }
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as any; // Use any to access Stripe properties
        

        if (invoice.subscription) {
          const server = await Server.findOne({ stripe_subscription_id: invoice.subscription });
          if (server && server.subscription_status === 'past_due') {
            // Payment succeeded for a past due subscription, restore to premium
            await Server.findOneAndUpdate(
              { _id: server._id },
              { 
                subscription_status: 'active',
                plan: 'premium'
              }
            );
            
          }
        }
        break;
      }

      case 'customer.subscription.trial_will_end': {
        const subscription = event.data.object as any;
        
        // Could send notification email here
        break;
      }

      default:
        
    }

    res.json({ received: true });
  } catch (error) {
    console.error('[WEBHOOK] Error processing webhook:', error);
    res.status(500).send('Webhook processing error');
  }
});

export { webhookRouter };