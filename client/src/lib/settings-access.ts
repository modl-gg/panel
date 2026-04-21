import { hasPremiumAccess } from './backend-enums.ts';

interface BillingStatusSnapshot {
  plan?: string | null;
  subscriptionStatus?: string | null;
  currentPeriodEnd?: string | Date | null;
  customDomainGrandfathered?: boolean | null;
}

export function isSettingsBillingPending(
  billingStatus: BillingStatusSnapshot | undefined,
  isBillingLoading: boolean
): boolean {
  return isBillingLoading && !billingStatus;
}

export function hasPremiumSettingsAccess(
  billingStatus: BillingStatusSnapshot | undefined
): boolean {
  if (!billingStatus) {
    return false;
  }

  return hasPremiumAccess({
    plan: billingStatus.plan,
    subscriptionStatus: billingStatus.subscriptionStatus,
    currentPeriodEnd: billingStatus.currentPeriodEnd,
  });
}

export function canManageCustomDomainSettings(
  billingStatus: BillingStatusSnapshot | undefined
): boolean {
  if (!billingStatus) {
    return false;
  }

  return hasPremiumSettingsAccess(billingStatus) || Boolean(billingStatus.customDomainGrandfathered);
}
