import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@modl-gg/shared-web/components/ui/card';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import { useToast } from '@modl-gg/shared-web/hooks/use-toast';
import { loadStripe } from '@stripe/stripe-js';
import { apiFetch } from '@/lib/api';
import { errorMessageOr } from '@/utils/errors';
import { protoErrorMessage } from '@/lib/proto-fetch';
import {
  useBillingStatus,
  useCancelSubscription,
  useCreateCheckoutSession,
  useCreatePortalSession,
  useResubscribe,
  type BillingStatus,
} from '@/hooks/use-data';
import {
  formatSubscriptionStatusLabel,
  hasPremiumAccess,
  normalizeSubscriptionStatus,
  type SubscriptionStatus,
} from '@/lib/backend-enums';
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
  AlertTriangle,
  CreditCard,
  Settings,
  CheckCircle,
  Clock
} from 'lucide-react';
import { StatusBanner } from '@modl-gg/shared-web/components/ui/status-banner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@modl-gg/shared-web/components/ui/alert-dialog';
import { Slider } from '@modl-gg/shared-web/components/ui/slider';
import { Label } from '@modl-gg/shared-web/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';

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
      { text: '1GB CDN storage', included: true, icon: <HardDrive className="h-4 w-4" /> },
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
      { text: 'Extended service limits', included: true, icon: <Zap className="h-4 w-4" /> },
      { text: '200GB CDN storage ($0.08/GB/month past 200GB)', included: true, icon: <HardDrive className="h-4 w-4" /> },
      { text: 'AI moderation', included: true, icon: <Brain className="h-4 w-4" /> },
      { text: 'Priority support', included: true, icon: <Crown className="h-4 w-4" /> }
    ],
    buttonText: 'Upgrade Now',
    buttonVariant: 'default'
  }
];

// Hoisted to module scope so their component identity is stable across renders
// of BillingSettings. Previously these were declared inside the BillingSettings
// body, so every parent re-render (billing-status refetch, toast, etc.) created
// a new component type and remounted the subtree — resetting the overage slider
// state mid-edit and dropping input focus.

interface PremiumBillingViewProps {
  billingStatus: BillingStatus | undefined;
  t: TFunction;
  toast: ReturnType<typeof useToast>['toast'];
  queryClient: ReturnType<typeof useQueryClient>;
  isLoading: boolean;
  handleCreatePortalSession: () => void;
  handleCancelSubscription: () => void;
  handleResubscribe: () => void;
  cancelSubscriptionMutation: ReturnType<typeof useCancelSubscription>;
  resubscribeMutation: ReturnType<typeof useResubscribe>;
  getSubscriptionStatusBadge: () => React.ReactNode;
}

const PremiumBillingView: React.FC<PremiumBillingViewProps> = ({
  billingStatus,
  t,
  toast,
  queryClient,
  isLoading,
  handleCreatePortalSession,
  handleCancelSubscription,
  handleResubscribe,
  cancelSubscriptionMutation,
  resubscribeMutation,
  getSubscriptionStatusBadge,
}) => {
  const currentPeriodEnd = billingStatus?.currentPeriodEnd;
  const maxStorageLimitBytes = billingStatus?.maxStorageLimitBytes;
  const maxAiOverageRequests = billingStatus?.maxAiOverageRequests;
  const normalizedStatus: SubscriptionStatus = normalizeSubscriptionStatus(billingStatus?.subscriptionStatus);
  const [storageOverageGB, setStorageOverageGB] = useState<number>(
    maxStorageLimitBytes ? Math.max(0, Math.round(maxStorageLimitBytes / (1024 * 1024 * 1024)) - 200) : 0
  );
  const [aiOverageRequests, setAiOverageRequests] = useState<number>(maxAiOverageRequests ?? 0);
  const [savingOverageLimits, setSavingOverageLimits] = useState(false);
  const hasPaymentIssue = normalizedStatus === 'PAST_DUE' || normalizedStatus === 'UNPAID';

  useEffect(() => {
    if (maxStorageLimitBytes) {
      setStorageOverageGB(Math.max(0, Math.round(maxStorageLimitBytes / (1024 * 1024 * 1024)) - 200));
    }
  }, [maxStorageLimitBytes]);

  useEffect(() => {
    setAiOverageRequests(maxAiOverageRequests ?? 0);
  }, [maxAiOverageRequests]);

  const handleSaveOverageLimits = async () => {
    setSavingOverageLimits(true);
    try {
      const response = await apiFetch('/v1/panel/billing/overage-limits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxStorageOverageGB: storageOverageGB, maxAiOverageRequests: aiOverageRequests }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update overage limits');
      }
      toast({
        title: t('settings.billing.overageLimitsUpdated'),
        description: t('settings.billing.overageLimitsUpdatedDesc', { storageGB: storageOverageGB, aiRequests: aiOverageRequests }),
      });
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/billing/status'] });
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/billing/usage'] });
    } catch (error) {
      toast({
        title: t('toast.error'),
        description: errorMessageOr(error, t('settings.billing.overageLimitsFailed')),
        variant: 'destructive',
      });
    } finally {
      setSavingOverageLimits(false);
    }
  };

  return (
    <div className="space-y-6">
      {hasPaymentIssue && (
        <StatusBanner
          variant="error"
          title={t('settings.billing.paymentIssue')}
          action={
            <Button
              onClick={handleCreatePortalSession}
              disabled={isLoading}
              className="btn-pill"
              size="sm"
            >
              <CreditCard className="h-4 w-4 mr-2" />
              {isLoading ? t('common.loading') : t('settings.billing.updatePaymentMethod')}
            </Button>
          }
        >
          {t('settings.billing.paymentIssueDesc')}
        </StatusBanner>
      )}

      <Card className="rounded-card shadow-card-inner bg-surface-2">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Crown className="h-10 w-10 text-warning" />
                {t('settings.billing.premiumSubscription')}
                <span className="text-muted-foreground mx-2">—</span>
                <span className="text-2xl font-bold text-primary">$9.99/month</span>
              </CardTitle>
              <CardDescription className='mt-4'>
                {hasPaymentIssue
                  ? t('settings.billing.paymentIssueStatusDesc')
                  : normalizedStatus === 'CANCELED' && currentPeriodEnd
                  ? t('settings.billing.accessEnds', { date: new Date(currentPeriodEnd).toLocaleDateString() })
                  : normalizedStatus === 'CANCELED' && !currentPeriodEnd
                  ? t('settings.billing.subscriptionCancelledAccessEnded')
                  : currentPeriodEnd
                  ? t(normalizedStatus === 'TRIALING' ? 'settings.billing.trialEnds' : 'settings.billing.nextBilling', { date: new Date(currentPeriodEnd).toLocaleDateString() })
                  : normalizedStatus === 'ACTIVE'
                  ? t('settings.billing.subscriptionActive')
                  : t('settings.billing.stripeManageDesc')
                }
              </CardDescription>
            </div>
            <div>
              {getSubscriptionStatusBadge()}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex gap-3">
            {normalizedStatus !== 'CANCELED' && (
              <Button
                onClick={handleCreatePortalSession}
                disabled={isLoading}
                className="flex items-center gap-2 btn-pill"
              >
                <CreditCard className="h-4 w-4" />
                {isLoading ? t('common.loading') : t('settings.billing.manageBilling')}
              </Button>
            )}

            {normalizedStatus === 'ACTIVE' && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={cancelSubscriptionMutation.isPending}
                    className="flex items-center gap-2"
                  >
                    <AlertTriangle className="h-4 w-4" />
                    {cancelSubscriptionMutation.isPending ? t('settings.billing.cancelling') : t('settings.billing.cancelPlan')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('settings.billing.cancelPremiumTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('settings.billing.cancelPremiumDesc', { date: currentPeriodEnd ? new Date(currentPeriodEnd).toLocaleDateString() : '' })}
                      <br /><br />
                      {t('settings.billing.cancelPremiumDowngrade')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('settings.billing.keepSubscription')}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleCancelSubscription}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {t('settings.billing.yesCancelSubscription')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {normalizedStatus === 'CANCELED' && (
              <>
                <Button
                  onClick={handleCreatePortalSession}
                  disabled={isLoading}
                  className="flex items-center gap-2 btn-pill"
                >
                  <CreditCard className="h-4 w-4" />
                  {isLoading ? t('common.loading') : t('settings.billing.manageBilling')}
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      disabled={resubscribeMutation.isPending}
                      className="flex items-center gap-2"
                    >
                      <RefreshCw className="h-4 w-4" />
                      {resubscribeMutation.isPending ? t('settings.billing.resubscribing') : t('settings.billing.resubscribe')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('settings.billing.reactivatePremiumTitle')}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('settings.billing.reactivatePremiumDesc')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleResubscribe}
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        {t('settings.billing.yesReactivateSubscription')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>

        </CardContent>
      </Card>

      {/* Usage Overage Limits */}
      <Card className="rounded-card shadow-card-inner bg-surface-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {t('settings.billing.usageOverageLimits')}
          </CardTitle>
          <CardDescription>
            {t('settings.billing.usageOverageLimitsDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Storage Overage Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                {t('settings.billing.storageOverageLimit')}
              </Label>
              <span className="text-sm font-medium">{storageOverageGB} GB</span>
            </div>
            <Slider
              value={[storageOverageGB]}
              onValueChange={([v]) => { if (v !== undefined) setStorageOverageGB(v); }}
              min={0}
              max={2000}
              step={10}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t('settings.billing.noOverage', { unit: 'GB' })}</span>
              <span>2,000 GB</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('settings.billing.storageOverageRate', { maxCost: (storageOverageGB * 0.08).toFixed(2) })}
            </p>
          </div>

          {/* AI Request Overage Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Brain className="h-4 w-4" />
                {t('settings.billing.aiOverageLimit')}
              </Label>
              <span className="text-sm font-medium">{aiOverageRequests.toLocaleString()} {t('settings.billing.requests')}</span>
            </div>
            <Slider
              value={[aiOverageRequests]}
              onValueChange={([v]) => { if (v !== undefined) setAiOverageRequests(v); }}
              min={0}
              max={5000}
              step={100}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t('settings.billing.noOverage', { unit: t('settings.billing.requests') })}</span>
              <span>5,000 {t('settings.billing.requests')}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('settings.billing.aiOverageRate', { maxCost: (aiOverageRequests * 0.02).toFixed(2) })}
            </p>
          </div>

          <p className="text-sm text-muted-foreground">
            {t('settings.billing.higherLimitsContact')}
          </p>

          <Button
            onClick={handleSaveOverageLimits}
            disabled={savingOverageLimits}
            className="btn-pill"
          >
            {savingOverageLimits ? t('common.saving') : t('common.save')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

interface FreePlanViewProps {
  t: TFunction;
  isLoading: boolean;
  handleCreateCheckoutSession: () => void;
}

const FreePlanView: React.FC<FreePlanViewProps> = ({ t, isLoading, handleCreateCheckoutSession }) => {
  const premiumPlan = plans.find(p => p.id === 'premium');
  const premiumFeatures = premiumPlan?.features ?? [];

  return (
    <div className="space-y-6">
      {/* Upgrade to Premium Card */}
      <Card className="rounded-card shadow-card-inner bg-surface-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Crown className="h-10 w-10 text-warning" />
                {t('settings.billing.upgradeToPremium')}
              </CardTitle>
              <CardDescription className="mt-1">{t('settings.billing.upgradeToPremiumDesc')}</CardDescription>
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
                <div className="text-sm text-muted-foreground">{t('settings.billing.perMonth')}</div>
              </div>

              <Button
                onClick={handleCreateCheckoutSession}
                disabled={isLoading}
                className="w-full flex items-center gap-2 btn-pill"
                size="lg"
              >
                {isLoading ? t('settings.billing.processing') : t('settings.billing.upgradeNow')}
              </Button>
            </div>

            {/* Premium Features */}
            <div className="lg:col-span-2 flex flex-col justify-center ml-0 lg:ml-8 mt-0 lg:mt-[-80px]">
              <h4 className="font-medium text-sm text-muted-foreground mb-4">{t('settings.billing.premiumFeatures')}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {premiumFeatures.map((feature, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <Check className="h-4 w-4 text-success flex-shrink-0" />
                    {feature.icon && (
                      <div className="text-foreground">
                        {feature.icon}
                      </div>
                    )}
                    <span className="text-sm">{feature.text}</span>
                  </div>
                ))}
              </div>
              {premiumFeatures.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('settings.billing.premiumFeaturesUnavailable')}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const BillingSettings = () => {
  const { data: billingStatus, isLoading: isBillingLoading } = useBillingStatus();
  const cancelSubscriptionMutation = useCancelSubscription();
  const resubscribeMutation = useResubscribe();
  const checkoutSessionMutation = useCreateCheckoutSession();
  const portalSessionMutation = useCreatePortalSession();
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isRedirectingToStripe, setIsRedirectingToStripe] = useState(false);

  const handleCreateCheckoutSession = async () => {
    setIsRedirectingToStripe(true);
    try {
      const session = await checkoutSessionMutation.mutateAsync();

      if (session.url) {
        window.location.href = session.url;
        return;
      }

      if (session.sessionId) {
        const stripe = await getStripe();
        if (!stripe) {
          setIsRedirectingToStripe(false);
          toast({
            title: t('settings.billing.configurationError'),
            description: t('settings.billing.stripeNotConfigured'),
            variant: 'destructive',
          });
          return;
        }
        const { error } = await stripe.redirectToCheckout({ sessionId: session.sessionId });
        if (error) {
          setIsRedirectingToStripe(false);
          toast({
            title: t('toast.error'),
            description: error.message || t('settings.billing.stripeRedirectFailed'),
            variant: 'destructive',
          });
        }
        return;
      }

      setIsRedirectingToStripe(false);
      toast({
        title: t('toast.error'),
        description: t('settings.billing.checkoutSessionFailed'),
        variant: 'destructive',
      });
    } catch (error) {
      setIsRedirectingToStripe(false);
      toast({
        title: t('toast.error'),
        description: protoErrorMessage(error, t('settings.billing.checkoutSessionFailed')),
        variant: 'destructive',
      });
    }
  };

  const handleCreatePortalSession = async () => {
    setIsRedirectingToStripe(true);
    try {
      const session = await portalSessionMutation.mutateAsync();
      if (!session.url) {
        setIsRedirectingToStripe(false);
        toast({
          title: t('toast.error'),
          description: t('settings.billing.portalFailed'),
          variant: 'destructive',
        });
        return;
      }
      window.location.href = session.url;
    } catch (error) {
      setIsRedirectingToStripe(false);
      toast({
        title: t('toast.error'),
        description: protoErrorMessage(error, t('settings.billing.portalFailed')),
        variant: 'destructive',
      });
    }
  };

  const handleCancelSubscription = async () => {
    try {
      const response = await cancelSubscriptionMutation.mutateAsync();

      toast({
        title: t('settings.billing.subscriptionCancelled'),
        description: response.message || t('settings.billing.subscriptionCancelledDesc'),
        variant: 'default',
      });
    } catch (error) {
      toast({
        title: t('toast.error'),
        description: errorMessageOr(error, t('settings.billing.cancelFailed')),
        variant: 'destructive',
      });
    }
  };

  const handleResubscribe = async () => {
    try {
      const response = await resubscribeMutation.mutateAsync();

      toast({
        title: t('settings.billing.subscriptionReactivated'),
        description: response.message || t('settings.billing.subscriptionReactivatedDesc'),
        variant: 'default',
      });
    } catch (error) {
      toast({
        title: t('toast.error'),
        description: errorMessageOr(error, t('settings.billing.reactivateFailed')),
        variant: 'destructive',
      });
    }
  };

  const getCurrentPlan = () => {
    if (!billingStatus) return 'free';
    return hasPremiumAccess({
      plan: billingStatus.plan,
      subscriptionStatus: billingStatus.subscriptionStatus,
      currentPeriodEnd: billingStatus.currentPeriodEnd,
    })
      ? 'premium'
      : 'free';
  };

  const isPremiumUser = () => {
    return getCurrentPlan() === 'premium';
  };

  const hasActiveSubscription = () => {
    if (!billingStatus) return false;
    const normalizedStatus = normalizeSubscriptionStatus(billingStatus.subscriptionStatus);
    return ['ACTIVE', 'TRIALING', 'PAST_DUE', 'UNPAID', 'CANCELED'].includes(normalizedStatus);
  };

  const getSubscriptionAlert = () => {
    if (isBillingLoading || !billingStatus) return null;

    const { currentPeriodEnd } = billingStatus;
    const normalizedStatus = normalizeSubscriptionStatus(billingStatus.subscriptionStatus);

    if (normalizedStatus === 'CANCELED') {
      if (!currentPeriodEnd) {
        return (
          <StatusBanner variant="error" title={t('settings.billing.subscriptionExpired')}>
            {t('settings.billing.subscriptionExpiredDesc')}
          </StatusBanner>
        );
      }

      const endDate = new Date(currentPeriodEnd);
      const today = new Date();

      if (endDate <= today) {
        return (
          <StatusBanner variant="error" title={t('settings.billing.subscriptionExpired')}>
            {t('settings.billing.subscriptionExpiredOn', { date: endDate.toLocaleDateString() })}
          </StatusBanner>
        );
      } else {
        return (
          <StatusBanner variant="warning" title={t('settings.billing.subscriptionCancelledAlert')}>
            {t('settings.billing.accessEndsOn', { date: endDate.toLocaleDateString() })}
          </StatusBanner>
        );
      }
    }

    return null;
  };

  const getSubscriptionStatusBadge = () => {
    if (!billingStatus) return null;
    
    const { currentPeriodEnd } = billingStatus;
    const normalizedStatus = normalizeSubscriptionStatus(billingStatus.subscriptionStatus);
    
    // Special handling for cancelled subscriptions
    if (normalizedStatus === 'CANCELED') {
      if (!currentPeriodEnd) {
        return <StatusBadge intent="destructive"><AlertTriangle className="h-3 w-3 mr-1" />{t('settings.billing.expired')}</StatusBadge>;
      }
      const endDate = new Date(currentPeriodEnd);
      const today = new Date();
      if (endDate <= today) {
        return <StatusBadge intent="destructive"><AlertTriangle className="h-3 w-3 mr-1" />{t('settings.billing.expired')}</StatusBadge>;
      } else {
        return <StatusBadge intent="warning"><AlertTriangle className="h-3 w-3 mr-1" />{t('settings.billing.cancelled')}</StatusBadge>;
      }
    }

    switch (normalizedStatus) {
      case 'ACTIVE':
        return <StatusBadge intent="success"><CheckCircle className="h-3 w-3 mr-1" />{t('status.active')}</StatusBadge>;
      case 'TRIALING':
        return <StatusBadge intent="info"><Clock className="h-3 w-3 mr-1" />{t('settings.billing.trial')}</StatusBadge>;
      case 'PAST_DUE':
        return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />{t('settings.billing.pastDue')}</Badge>;
      default:
        return <Badge variant="outline">{formatSubscriptionStatusLabel(normalizedStatus)}</Badge>;
    }
  };

  if (isBillingLoading) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold mb-2">{t('settings.billing.title')}</h2>
          <p className="text-muted-foreground">{t('settings.billing.description')}</p>
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

  const renderBillingContent = () => {
    if (isPremiumUser() || hasActiveSubscription()) {
      return (
        <PremiumBillingView
          billingStatus={billingStatus}
          t={t}
          toast={toast}
          queryClient={queryClient}
          isLoading={portalSessionMutation.isPending || isRedirectingToStripe}
          handleCreatePortalSession={handleCreatePortalSession}
          handleCancelSubscription={handleCancelSubscription}
          handleResubscribe={handleResubscribe}
          cancelSubscriptionMutation={cancelSubscriptionMutation}
          resubscribeMutation={resubscribeMutation}
          getSubscriptionStatusBadge={getSubscriptionStatusBadge}
        />
      );
    }

    return (
      <FreePlanView
        t={t}
        isLoading={checkoutSessionMutation.isPending || isRedirectingToStripe}
        handleCreateCheckoutSession={handleCreateCheckoutSession}
      />
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">{t('settings.billing.title')}</h2>
          <p className="text-muted-foreground">{t('settings.billing.description')}</p>
        </div>
      </div>

      {getSubscriptionAlert()}

      {renderBillingContent()}
    </div>
  );
};

export default BillingSettings;
