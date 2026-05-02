import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canManageCustomDomainSettings,
  hasPremiumSettingsAccess,
  isSettingsBillingPending,
} from './settings-access.ts';

test('settings billing stays pending until billing data exists', () => {
  assert.equal(isSettingsBillingPending(undefined, true), true);
  assert.equal(
    isSettingsBillingPending(
      {
        plan: 'PREMIUM',
        subscriptionStatus: 'ACTIVE',
        currentPeriodEnd: '2099-01-01T00:00:00.000Z',
      },
      true
    ),
    false
  );
});

test('premium access is only granted after billing status resolves', () => {
  assert.equal(hasPremiumSettingsAccess(undefined), false);
  assert.equal(
    hasPremiumSettingsAccess({
      plan: 'PREMIUM',
      subscriptionStatus: 'ACTIVE',
      currentPeriodEnd: '2099-01-01T00:00:00.000Z',
    }),
    true
  );
});

test('custom domain access respects grandfathered servers after billing resolves', () => {
  assert.equal(canManageCustomDomainSettings(undefined), false);
  assert.equal(
    canManageCustomDomainSettings({
      plan: 'FREE',
      subscriptionStatus: 'INACTIVE',
      customDomainGrandfathered: true,
    }),
    true
  );
});
