import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@modl-gg/shared-web/components/ui/card';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import { useToast } from '@modl-gg/shared-web/hooks/use-toast';
import { loadStripe } from '@stripe/stripe-js';
import { useBillingStatus, useCancelSubscription, useResubscribe } from '@/hooks/use-data';
import { useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@modl-gg/shared-web/components/ui/skeleton';
import { 
  RefreshCw, 
  Check, 
  Crown, 
  Zap, 
  Shield, 
  Users, 
  HardDrive,
  Headphones,
  Brain,
  Calendar,
  DollarSign,
  AlertTriangle,
  CreditCard,
  Settings,
  CheckCircle,
  Clock
} from 'lucide-react';
import { Alert, AlertDescription } from '@modl-gg/shared-web/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@modl-gg/shared-web/components/ui/alert-dialog';
import { Progress } from '@modl-gg/shared-web/components/ui/progress';
import { Switch } from '@modl-gg/shared-web/components/ui/switch';
import { Label } from '@modl-gg/shared-web/components/ui/label';

// Initialize Stripe lazily - only when a valid key is present
let stripePromise: ReturnType<typeof loadStripe> | null = null;
const getStripe = () => {
  const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
  if (!stripePromise && key) {
    stripePromise = loadStripe(key);
  }
  return stripePromise;
};

interface PlanFeature {
  text: string;
  included: boolean;
  icon?: React.ReactNode;
}

interface Plan {
  id: 'free' | 'premium';
  name: string;
  price: number;
  period: string;
  description: string;
  features: PlanFeature[];
  buttonText: string;
  buttonVariant: 'default' | 'outline';
}

const plans: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    period: 'forever',
    description: 'Perfect for small communities getting started',
    features: [
      { text: 'Up to 50 players', included: true, icon: <Users className="h-4 w-4" /> },
      { text: 'Basic ticket system', included: true, icon: <Shield className="h-4 w-4" /> },
      { text: 'Up to 5 staff members', included: true, icon: <Users className="h-4 w-4" /> },
      { text: '100k API requests per month', included: true, icon: <Zap className="h-4 w-4" /> },
      { text: 'Community support', included: true, icon: <Headphones className="h-4 w-4" /> },
      { text: '2GB CDN storage', included: true, icon: <HardDrive className="h-4 w-4" /> },
      { text: 'AI moderation', included: false, icon: <Brain className="h-4 w-4" /> }
    ],
    buttonText: 'Current Plan',
    buttonVariant: 'outline'
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 9.99,
    period: 'per month',
    description: 'For growing communities that need advanced features',
    features: [
      { text: 'Unlimited players', included: true, icon: <Users className="h-4 w-4" /> },
      { text: 'Advanced ticket system', included: true, icon: <Shield className="h-4 w-4" /> },
      { text: 'Unlimited staff members', included: true, icon: <Users className="h-4 w-4" /> },
      { text: '500k API requests per month', included: true, icon: <Zap className="h-4 w-4" /> },
      { text: '200GB CDN storage', included: true, icon: <HardDrive className="h-4 w-4" /> },
      { text: 'AI moderation', included: true, icon: <Brain className="h-4 w-4" /> },
      { text: 'Priority support', included: true, icon: <Crown className="h-4 w-4" /> }
    ],
    buttonText: 'Upgrade Now',
    buttonVariant: 'default'
  }
];

const BillingSettings = () => {
  const { data: billingStatus, isLoading: isBillingLoading } = useBillingStatus();
  const cancelSubscriptionMutation = useCancelSubscription();
  const resubscribeMutation = useResubscribe();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const queryClient = useQueryClient();

  const handleCreateCheckoutSession = async () => {
    setIsLoading(true);
    try {
      const { csrfFetch } = await import('@/utils/csrf');
      const response = await csrfFetch('/v1/panel/billing/checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const data = await response.json();

      // Prefer using the URL directly (modern approach)
      if (data.url) {
        window.location.href = data.url;
        return;
      }

      // Fallback to redirectToCheckout if no URL provided
      if (data.sessionId) {
        const stripe = await getStripe();
        if (!stripe) {
          toast({
            title: 'Configuration Error',
            description: 'Stripe is not configured. Please contact support.',
            variant: 'destructive',
          });
          return;
        }
        const { error } = await stripe.redirectToCheckout({ sessionId: data.sessionId });
        if (error) {
          toast({
            title: 'Error',
            description: error.message || 'Failed to redirect to Stripe Checkout.',
            variant: 'destructive',
          });
        }
      } else {
        throw new Error('No checkout URL or session ID returned from server');
      }
    } catch (error) {
      console.error(error);
      toast({
        title: 'Error',
        description: 'Could not create checkout session. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreatePortalSession = async () => {
    setIsLoading(true);
    try {
      const { csrfFetch } = await import('@/utils/csrf');
      const response = await csrfFetch('/v1/panel/billing/portal-session', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to create portal session');
      }

      const data = await response.json();
      if (!data.url) {
        throw new Error('No portal URL returned from server');
      }
      window.location.href = data.url;
    } catch (error) {
      console.error(error);
      toast({
        title: 'Error',
        description: 'Could not open billing portal. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshBillingStatus = async () => {
    setIsSpinning(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['/v1/panel/billing/status'] });

      toast({
        title: 'Billing Status Refreshed',
        description: 'Your billing information has been updated.',
      });
    } catch (error) {
      console.error('Error refreshing billing status:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not refresh billing status. Please try again.',
      });
    } finally {
      setIsSpinning(false);
    }
  };

  const handleCancelSubscription = async () => {
    try {
      const response = await cancelSubscriptionMutation.mutateAsync();
      
      toast({
        title: 'Subscription Cancelled',
        description: response.message || 'Your subscription has been cancelled successfully.',
        variant: 'default',
      });
    } catch (error: any) {
      console.error('Error cancelling subscription:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to cancel subscription. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleResubscribe = async () => {
    try {
      const response = await resubscribeMutation.mutateAsync();
      
      toast({
        title: 'Subscription Reactivated!',
        description: response.message || 'Your premium subscription has been reactivated successfully.',
        variant: 'default',
      });
    } catch (error: any) {
      console.error('Error resubscribing:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to reactivate subscription. Please try again.',
        variant: 'destructive',
      });
    }
  };


  const getCurrentPlan = () => {
    if (!billingStatus) return 'free';
    const { subscription_status, current_period_end } = billingStatus;
    
    // For cancelled subscriptions, check if the period has ended
    if (subscription_status === 'canceled') {
      if (!current_period_end) {
        return 'free'; // No end date means it's already expired
      }
      const endDate = new Date(current_period_end);
      const now = new Date();
      if (endDate <= now) {
        return 'free'; // Cancellation period has ended
      }
      return 'premium'; // Still has access until end date
    }
    
    // Active and trialing are clearly premium
    if (['active', 'trialing'].includes(subscription_status)) {
      return 'premium';
    }
    
    // For payment issues (past_due, unpaid), check if still within period
    if (['past_due', 'unpaid', 'incomplete'].includes(subscription_status)) {
      if (current_period_end) {
        const endDate = new Date(current_period_end);
        const now = new Date();
        if (endDate > now) {
          return 'premium'; // Still within paid period despite payment issues
        }
      }
    }
    
    return 'free';
  };

  const isPremiumUser = () => {
    return getCurrentPlan() === 'premium';
  };

  const getSubscriptionAlert = () => {
    if (isBillingLoading || !billingStatus) return null;

    const { subscription_status, current_period_end } = billingStatus;

    // Special handling for cancelled subscriptions
    if (subscription_status === 'canceled') {
      if (!current_period_end) {
        // No end date means it's already expired - show expired message
        return (
          <Alert className="flex items-center border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800 dark:text-red-200">
              <strong>Subscription Expired:</strong> Your premium subscription has ended. You are now on the free plan.
            </AlertDescription>
          </Alert>
        );
      }
      
      const endDate = new Date(current_period_end);
      const today = new Date();
      
      if (endDate <= today) {
        // Cancellation period has ended
        return (
          <Alert className="flex items-center border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800 dark:text-red-200">
              <strong>Subscription Expired:</strong> Your premium subscription ended on{' '}
              <strong>{endDate.toLocaleDateString()}</strong>. You are now on the free plan.
            </AlertDescription>
          </Alert>
        );
      } else {
        // Still has access until end date
        return (
          <Alert className="flex items-center border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-orange-800 dark:text-orange-200">
              <strong>Subscription Cancelled:</strong> Your premium access will end on{' '}
              <strong>{endDate.toLocaleDateString()}</strong>. You can still use all premium features until then.
            </AlertDescription>
          </Alert>
        );
      }
    }

    // Handle other problematic statuses
    if (['past_due', 'unpaid'].includes(subscription_status)) {
      return (
        <Alert variant="destructive" className="flex items-center">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Payment Issue:</strong> There's an issue with your payment method. Please update it to continue using premium features.
          </AlertDescription>
        </Alert>
      );
    }

    return null;
  };

  const getSubscriptionStatusBadge = () => {
    if (!billingStatus) return null;
    
    const { subscription_status, current_period_end } = billingStatus;
    
    // Special handling for cancelled subscriptions
    if (subscription_status === 'canceled') {
      if (!current_period_end) {
        return <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100"><AlertTriangle className="h-3 w-3 mr-1" />Expired</Badge>;
      }
      const endDate = new Date(current_period_end);
      const today = new Date();
      if (endDate <= today) {
        return <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100"><AlertTriangle className="h-3 w-3 mr-1" />Expired</Badge>;
      } else {
        return <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100"><AlertTriangle className="h-3 w-3 mr-1" />Cancelled</Badge>;
      }
    }
    
    switch (subscription_status) {
      case 'active':
        return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"><CheckCircle className="h-3 w-3 mr-1" />Active</Badge>;
      case 'trialing':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100"><Clock className="h-3 w-3 mr-1" />Trial</Badge>;
      case 'past_due':
        return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Past Due</Badge>;
      default:
        return <Badge variant="outline">{subscription_status}</Badge>;
    }
  };

  const PlanCard: React.FC<{ plan: Plan }> = ({ plan }) => {
    const isCurrent = getCurrentPlan() === plan.id;
    const canUpgrade = plan.id === 'premium' && getCurrentPlan() === 'free';
    
      return (
      <Card className={`relative ${isCurrent && plan.id === 'premium' ? 'ring-2 ring-primary' : ''}`}>
        {isCurrent && plan.id === 'premium' && (
          <div className="absolute -top-3 right-4">
            <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
              <Check className="h-3 w-3 mr-1" />
              Current Plan
            </Badge>
          </div>
        )}
        
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-2xl">{plan.name}</CardTitle>
          <div className="text-3xl font-bold">
            ${plan.price}
            <span className="text-sm font-normal text-muted-foreground">/{plan.period}</span>
          </div>
          <CardDescription>{plan.description}</CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {plan.features.map((feature, index) => (
              <div key={index} className={`flex items-center gap-3 ${!feature.included ? 'opacity-50' : ''}`}>
                {feature.included ? (
                  <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                ) : (
                  <div className="h-4 w-4 flex-shrink-0" />
                )}
                {feature.icon && (
                  <div className={feature.included ? 'text-foreground' : 'text-muted-foreground'}>
                    {feature.icon}
                  </div>
                )}
                <span className={`text-sm ${feature.included ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                  {feature.text}
                </span>
              </div>
            ))}
          </div>
          
          <div className="pt-4">
            {isCurrent ? (
              <Button variant="outline" className="w-full" disabled>
                {plan.buttonText}
              </Button>
            ) : canUpgrade ? (
              <Button 
                variant={plan.buttonVariant} 
                className="w-full" 
                onClick={handleCreateCheckoutSession}
                disabled={isLoading}
              >
                {isLoading ? 'Processing...' : plan.buttonText}
              </Button>
            ) : (
              <Button variant="outline" className="w-full" disabled>
                {plan.buttonText}
              </Button>
            )}
        </div>
        </CardContent>
      </Card>
      );
  };

  const PremiumBillingView = () => {
    const { subscription_status, current_period_end } = billingStatus || {};


    return (
      <div className="space-y-6">
        {/* Combined Premium Subscription & Usage */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="h-5 w-5 text-yellow-600" />
                  Premium Subscription
                  <span className="text-muted-foreground mx-2">—</span>
                  <span className="text-2xl font-bold text-primary">$9.99/month</span>
                </CardTitle>
                <CardDescription className='mt-4'>
                  {subscription_status === 'canceled' && current_period_end
                    ? `Access ends ${new Date(current_period_end).toLocaleDateString()}`
                    : subscription_status === 'canceled' && !current_period_end
                    ? 'Your subscription has been cancelled and access has ended.'
                    : current_period_end 
                    ? `${subscription_status === 'trialing' ? 'Trial ends' : 'Next billing'} ${new Date(current_period_end).toLocaleDateString()}`
                    : subscription_status === 'active'
                    ? 'Your premium subscription is active. Billing information is being synced with Stripe.'
                    : 'Modl uses Stripe to handle billing. Use the buttons below to manage your subscription.'
                  }
                </CardDescription>
              </div>
              <div>
                {getSubscriptionStatusBadge()}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Billing Management Buttons */}
            <div className="flex gap-3">
              {subscription_status !== 'canceled' && (
                <Button 
                  onClick={handleCreatePortalSession}
                  disabled={isLoading}
                  className="flex items-center gap-2"
                >
                  <CreditCard className="h-4 w-4" />
                  {isLoading ? 'Loading...' : 'Manage Billing'}
                </Button>
              )}
              
              {subscription_status === 'active' && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="outline"
                      disabled={cancelSubscriptionMutation.isPending}
                      className="flex items-center gap-2"
                    >
                      <AlertTriangle className="h-4 w-4" />
                      {cancelSubscriptionMutation.isPending ? 'Cancelling...' : 'Cancel Plan'}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel Premium Subscription</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to cancel your Premium subscription? You'll continue to have access to all Premium features until the end of your current billing period{current_period_end ? ` (${new Date(current_period_end).toLocaleDateString()})` : ''}.
                        <br /><br />
                        After that, your server will be downgraded to the Free plan.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={handleCancelSubscription}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Yes, Cancel Subscription
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              
              {subscription_status === 'canceled' && (
                <>
                  <Button 
                    onClick={handleCreatePortalSession}
                    disabled={isLoading}
                    className="flex items-center gap-2"
                  >
                    <CreditCard className="h-4 w-4" />
                    {isLoading ? 'Loading...' : 'Manage Billing'}
                  </Button>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="outline"
                        disabled={resubscribeMutation.isPending}
                        className="flex items-center gap-2"
                      >
                        <RefreshCw className="h-4 w-4" />
                        {resubscribeMutation.isPending ? 'Resubscribing...' : 'Resubscribe'}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Reactivate Premium Subscription</AlertDialogTitle>
                        <AlertDialogDescription>
                          Reactiviting Premium Subscription will bill you automatically when your current billing period ends.
                          Your subscription will automatically renew each month unless cancelled.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={handleResubscribe}
                          className="bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                          Yes, Reactivate Subscription
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </div>

          </CardContent>
        </Card>
      </div>
    );
  };

  const FreePlanView = () => {
    const premiumPlan = plans.find(p => p.id === 'premium')!;
    
  return (
      <div className="space-y-6">
        {/* Upgrade to Premium Card */}
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="h-5 w-5 text-yellow-600" />
                  Upgrade to Premium
                </CardTitle>
                <CardDescription className="mt-1">Unlock advanced features for your growing community</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Plan Details */}
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-4xl font-bold text-primary">
                    $9.99
                  </div>
                  <div className="text-sm text-muted-foreground">per month</div>
                </div>
                
                <Button 
                  onClick={handleCreateCheckoutSession}
                  disabled={isLoading}
                  className="w-full flex items-center gap-2"
                  size="lg"
                >
                  {isLoading ? 'Processing...' : 'Upgrade Now'}
                </Button>
              </div>
              
              {/* Premium Features */}
              <div className="lg:col-span-2 flex flex-col justify-center ml-0 lg:ml-8 mt-0 lg:mt-[-80px]">
                <h4 className="font-medium text-sm text-muted-foreground mb-4">Premium Features</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {premiumPlan.features.map((feature, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                      {feature.icon && (
                        <div className="text-foreground">
                          {feature.icon}
                        </div>
                      )}
                      <span className="text-sm">{feature.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  if (isBillingLoading) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold mb-2">Billing & Subscription</h2>
          <p className="text-muted-foreground">Manage your subscription and billing details.</p>
        </div>
        
        <div className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-96 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Billing & Subscription</h2>
          <p className="text-muted-foreground">Manage your subscription and billing details.</p>
        </div>
      </div>

      {/* Subscription Alert */}
      {getSubscriptionAlert()}

      {/* Conditional rendering based on plan */}
      {isPremiumUser() ? <PremiumBillingView /> : <FreePlanView />}
        </div>
  );
};

export default BillingSettings;