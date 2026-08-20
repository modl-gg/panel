import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SETTINGS_SUB_CATEGORIES,
  accessibleSubCategories,
  isSubCategoryPremiumLocked,
  resolveSubCategoryId,
  type SettingsSubCategoryAccess,
  type SettingsSubCategoryDefinition,
} from './settings-access.ts';

const grants = (isSuperAdmin: boolean, ...permissions: string[]): SettingsSubCategoryAccess => ({
  isSuperAdmin,
  hasPermission: (permissionId) => permissions.includes(permissionId),
});

const SUPER_ADMIN = grants(
  true,
  'admin.settings.view',
  'admin.settings.view.storage',
  'admin.settings.view.domain'
);
const SETTINGS_ADMIN = grants(
  false,
  'admin.settings.view',
  'admin.settings.view.storage',
  'admin.settings.view.domain'
);
const BILLING_ONLY = grants(false, 'admin.settings.view.billing');

const subCategory = (categoryId: string, subId: string): SettingsSubCategoryDefinition => {
  const found = SETTINGS_SUB_CATEGORIES[categoryId]?.find((sub) => sub.id === subId);
  assert.ok(found, `missing sub-category ${categoryId}/${subId}`);
  return found;
};

const ids = (categoryId: string, access: SettingsSubCategoryAccess) =>
  accessibleSubCategories(categoryId, access).map((sub) => sub.id);

test('nothing is locked while the premium signal is unresolved', () => {
  assert.equal(isSubCategoryPremiumLocked(subCategory('tickets', 'ai-moderation'), undefined), false);
});

test('ai moderation locks only once the server is known not to be premium', () => {
  const aiModeration = subCategory('tickets', 'ai-moderation');
  assert.equal(isSubCategoryPremiumLocked(aiModeration, false), true);
  assert.equal(isSubCategoryPremiumLocked(aiModeration, true), false);
});

test('custom domain is never premium locked because the server owns that rule', () => {
  const domain = subCategory('general', 'domain');
  assert.equal(isSubCategoryPremiumLocked(domain, false), false);
  assert.equal(isSubCategoryPremiumLocked(domain, undefined), false);
});

test('sub-categories without a premium requirement never lock', () => {
  assert.equal(isSubCategoryPremiumLocked(subCategory('tickets', 'label-management'), false), false);
  assert.equal(isSubCategoryPremiumLocked(subCategory('general', 'webhooks'), false), false);
});

test('super admin only sub-categories are hidden from other staff', () => {
  assert.deepEqual(ids('general', SUPER_ADMIN), [
    'billing',
    'usage',
    'server-config',
    'domain',
    'webhooks',
    'migration',
  ]);
  assert.deepEqual(ids('general', SETTINGS_ADMIN), ['usage', 'domain', 'webhooks']);
});

test('general sub-categories require the permission their section actually calls', () => {
  assert.deepEqual(ids('general', BILLING_ONLY), []);
  assert.deepEqual(ids('general', grants(false, 'admin.settings.view.storage')), ['usage']);
  assert.deepEqual(ids('general', grants(false, 'admin.settings.view.domain')), ['domain']);
});

test('ticket sub-categories require settings view access', () => {
  assert.deepEqual(ids('tickets', BILLING_ONLY), []);
  assert.deepEqual(ids('tickets', SETTINGS_ADMIN), [
    'quick-responses',
    'label-management',
    'ticket-forms',
    'ai-moderation',
  ]);
});

test('a requested sub-category the user cannot access falls back to the first accessible one', () => {
  assert.equal(resolveSubCategoryId('general', 'billing', SETTINGS_ADMIN), 'usage');
  assert.equal(resolveSubCategoryId('general', 'billing', SUPER_ADMIN), 'billing');
  assert.equal(resolveSubCategoryId('general', 'not-a-section', SETTINGS_ADMIN), 'usage');
  assert.equal(resolveSubCategoryId('tickets', 'label-management', BILLING_ONLY), null);
  assert.equal(resolveSubCategoryId('unknown-category', null, SUPER_ADMIN), null);
});
