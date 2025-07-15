import express from 'express';

const router = express.Router();

// Middleware to ensure database connection
router.use((req, res, next) => {
  if (!req.serverDbConnection) {
    return res.status(503).json({ error: 'Database connection not available' });
  }
  next();
});

// GET /api/panel/ticket-subscriptions - Get user's active subscriptions
router.get('/', async (req, res) => {
  try {
    const db = req.serverDbConnection;
    const staffUsername = req.session?.username;

    if (!staffUsername) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const Staff = db.model('Staff');
    const Ticket = db.model('Ticket');

    // Get staff member with their subscriptions
    const staff = await Staff.findOne({ username: staffUsername }).lean();
    
    if (!staff || !staff.subscribedTickets) {
      return res.json([]);
    }

    // Filter active subscriptions and get ticket details
    const subscriptionsWithDetails = [];
    
    for (const subscription of staff.subscribedTickets) {
      if (!subscription.active) continue;
      
      try {
        const ticket = await Ticket.findById(subscription.ticketId).lean();
        if (ticket) {
          subscriptionsWithDetails.push({
            ticketId: subscription.ticketId.toString(),
            ticketTitle: `${ticket._id}: ${ticket.subject || ticket.title || 'Untitled Ticket'}`,
            subscribedAt: subscription.subscribedAt
          });
        }
      } catch (error) {
        console.error(`Error fetching ticket ${subscription.ticketId}:`, error);
      }
    }

    res.json(subscriptionsWithDetails);
  } catch (error) {
    console.error('Ticket subscriptions error:', error);
    res.status(500).json({ message: 'Failed to fetch ticket subscriptions' });
  }
});

// DELETE /api/panel/ticket-subscriptions/:ticketId - Unsubscribe from ticket
router.delete('/:ticketId', async (req, res) => {
  try {
    const db = req.serverDbConnection;
    const { ticketId } = req.params;
    const staffUsername = req.session?.username;

    if (!staffUsername) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const Staff = db.model('Staff');

    // Find and deactivate the subscription in the staff document
    // Try string ticketId first, then ObjectId for compatibility
    let result = await Staff.updateOne(
      { 
        username: staffUsername,
        'subscribedTickets.ticketId': ticketId,
        'subscribedTickets.active': true
      },
      { 
        $set: {
          'subscribedTickets.$.active': false
        }
      }
    );

    // If no documents were modified, try with ObjectId
    if (result.matchedCount === 0) {
      try {
        const ObjectId = db.base.Types.ObjectId;
        result = await Staff.updateOne(
          { 
            username: staffUsername,
            'subscribedTickets.ticketId': new ObjectId(ticketId),
            'subscribedTickets.active': true
          },
          { 
            $set: {
              'subscribedTickets.$.active': false
            }
          }
        );
      } catch (objectIdError) {
        // ObjectId approach failed, continue
      }
    }

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Subscription not found' });
    }

    res.json({ message: 'Successfully unsubscribed from ticket' });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    res.status(500).json({ message: 'Failed to unsubscribe from ticket' });
  }
});

// GET /api/panel/ticket-subscription-updates?limit=10 - Get recent updates for subscribed tickets  
router.get('/updates', async (req, res) => {
  try {
    const db = req.serverDbConnection;
    const { limit = 10 } = req.query;
    const staffUsername = req.session?.username;

    if (!staffUsername) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const Staff = db.model('Staff');
    const Ticket = db.model('Ticket');

    // Get staff member with their subscriptions
    const staff = await Staff.findOne({ username: staffUsername }).lean();
    
    if (!staff || !staff.subscribedTickets) {
      return res.json([]);
    }

    const subscribedTicketIds = staff.subscribedTickets
      .filter(sub => sub.active)
      .map(sub => sub.ticketId);

    if (subscribedTicketIds.length === 0) {
      return res.json([]);
    }

    // Get tickets with recent activity
    const tickets = await Ticket.find({
      _id: { $in: subscribedTicketIds },
      $or: [
        { 'replies.0': { $exists: true } },
        { 'messages.0': { $exists: true } }
      ]
    }).sort({ updatedAt: -1 }).limit(parseInt(limit as string) * 2).lean();

    const updatesWithDetails = [];
    
    for (const ticket of tickets) {
      const subscription = staff.subscribedTickets.find(
        sub => sub.ticketId.toString() === ticket._id.toString()
      );
      
      if (!subscription) continue;

      // Get recent replies/messages
      const replies = ticket.replies || ticket.messages || [];
      const recentReplies = replies
        .filter(reply => new Date(reply.created || reply.timestamp || reply.replyAt) > new Date(subscription.subscribedAt))
        .sort((a, b) => new Date(b.created || b.timestamp || b.replyAt).getTime() - new Date(a.created || a.timestamp || a.replyAt).getTime());

      // Filter out read replies
      const unreadReplies = recentReplies.filter(reply => {
        const replyDate = new Date(reply.created || reply.timestamp || reply.replyAt);
        return !subscription.lastReadAt || replyDate > new Date(subscription.lastReadAt);
      });

      // Only show if there are unread replies
      if (unreadReplies.length > 0) {
        // Show only the latest unread reply
        const latestReply = unreadReplies[0];
        const replyDate = new Date(latestReply.created || latestReply.timestamp || latestReply.replyAt);
        
        // Calculate additional unread count
        const additionalCount = unreadReplies.length - 1;
        
        updatesWithDetails.push({
          id: `${ticket._id}-${latestReply.id || latestReply._id || Date.now()}`,
          ticketId: ticket._id.toString(),
          ticketTitle: `${ticket._id}: ${ticket.subject || ticket.title || 'Untitled Ticket'}`,
          replyContent: latestReply.content || latestReply.message || latestReply.text || 'No content',
          replyBy: latestReply.name || latestReply.sender || latestReply.author || 'Unknown',
          replyAt: replyDate,
          isStaffReply: latestReply.staff || latestReply.senderType === 'staff' || false,
          isRead: false, // Always false since we filtered out read replies
          additionalCount: additionalCount > 0 ? additionalCount : undefined
        });
      }

      if (updatesWithDetails.length >= parseInt(limit as string)) {
        break;
      }
    }

    // Sort all updates by date and limit
    updatesWithDetails.sort((a, b) => new Date(b.replyAt).getTime() - new Date(a.replyAt).getTime());
    
    res.json(updatesWithDetails.slice(0, parseInt(limit as string)));
  } catch (error) {
    console.error('Subscription updates error:', error);
    res.status(500).json({ message: 'Failed to fetch subscription updates' });
  }
});

// POST /api/panel/ticket-subscription-updates/:updateId/read - Mark update as read
router.post('/updates/:updateId/read', async (req, res) => {
  try {
    const db = req.serverDbConnection;
    const { updateId } = req.params;
    const staffUsername = req.session?.username;

    if (!staffUsername) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Extract ticketId from updateId (format: ticketId-replyId)
    const ticketId = updateId.split('-')[0];
    
    if (!ticketId) {
      return res.status(400).json({ message: 'Invalid update ID' });
    }

    const Staff = db.model('Staff');

    // Update the lastReadAt timestamp for this ticket subscription
    // Try string ticketId first, then ObjectId for compatibility
    let result = await Staff.updateOne(
      { 
        username: staffUsername,
        'subscribedTickets.ticketId': ticketId,
        'subscribedTickets.active': true
      },
      { 
        $set: {
          'subscribedTickets.$.lastReadAt': new Date()
        }
      }
    );

    // If no documents were modified, try with ObjectId
    if (result.modifiedCount === 0) {
      try {
        const ObjectId = db.base.Types.ObjectId;
        result = await Staff.updateOne(
          { 
            username: staffUsername,
            'subscribedTickets.ticketId': new ObjectId(ticketId),
            'subscribedTickets.active': true
          },
          { 
            $set: {
              'subscribedTickets.$.lastReadAt': new Date()
            }
          }
        );
      } catch (objectIdError) {
        // ObjectId approach failed, continue
      }
    }

    res.json({ message: 'Update marked as read', modified: result.matchedCount > 0 });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ message: 'Failed to mark update as read' });
  }
});

// Helper function to create or ensure ticket subscription exists
export async function ensureTicketSubscription(db: any, ticketId: string, staffUsername: string) {
  try {
    
    const Staff = db.model('Staff');
    
    // First check if the staff member exists and if they already have this subscription
    const staff = await Staff.findOne({ username: staffUsername }).lean();
    
    if (!staff) {
      console.error(`Staff member ${staffUsername} not found`);
      return;
    }


    // Check if subscription already exists - handle both string and ObjectId comparison
    const existingSubscription = staff.subscribedTickets?.find(
      sub => (sub.ticketId === ticketId || sub.ticketId?.toString() === ticketId) && sub.active
    );

    if (existingSubscription) {
      return;
    }

    // Prepare subscription data - try both approaches to handle schema variations
    let subscriptionData;
    try {
      // First try with ObjectId (in case schema expects ObjectId)
      const ObjectId = db.base.Types.ObjectId;
      subscriptionData = {
        ticketId: new ObjectId(ticketId),
        subscribedAt: new Date(),
        active: true
      };
    } catch (objectIdError) {
      // If ObjectId conversion fails, use string (ticket IDs like "BUG-123456")
      // ObjectId conversion failed, using string ticketId
      subscriptionData = {
        ticketId: ticketId,
        subscribedAt: new Date(),
        active: true
      };
    }


    const result = await Staff.updateOne(
      { username: staffUsername },
      { 
        $addToSet: { 
          subscribedTickets: subscriptionData
        }
      }
    );

    if (result.modifiedCount > 0) {
      console.log(`[SUCCESS] Created ticket subscription for ${staffUsername} on ticket ${ticketId}`);
    } else {
      console.log(`[INFO] No modification needed for ${staffUsername} on ticket ${ticketId} (may already exist)`);
    }

  } catch (error) {
    console.error('Error ensuring ticket subscription:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Helper function to mark ticket as read when staff opens it
export async function markTicketAsRead(db: any, ticketId: string, staffUsername: string) {
  try {
    
    const Staff = db.model('Staff');
    
    // Try to update with string ticketId first
    let result = await Staff.updateOne(
      { 
        username: staffUsername,
        'subscribedTickets.ticketId': ticketId,
        'subscribedTickets.active': true
      },
      { 
        $set: {
          'subscribedTickets.$.lastReadAt': new Date()
        }
      }
    );
    
    // If no documents were modified, try with ObjectId (for backward compatibility)
    if (result.modifiedCount === 0) {
      try {
        const ObjectId = db.base.Types.ObjectId;
        result = await Staff.updateOne(
          { 
            username: staffUsername,
            'subscribedTickets.ticketId': new ObjectId(ticketId),
            'subscribedTickets.active': true
          },
          { 
            $set: {
              'subscribedTickets.$.lastReadAt': new Date()
            }
          }
        );
      } catch (objectIdError) {
        // ObjectId approach failed, using string approach
      }
    }
    
    if (result.modifiedCount > 0) {
      console.log(`[SUCCESS] Marked ticket ${ticketId} as read for ${staffUsername}`);
    } else {
      console.log(`[INFO] No subscription found to mark as read for ${staffUsername} on ticket ${ticketId}`);
    }
  } catch (error) {
    console.error('Error marking ticket as read:', error);
    console.error('Stack trace:', error.stack);
  }
}

export default router;