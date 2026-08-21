import {
  BookOpen,
  Bot,
  CreditCard,
  Database,
  Globe,
  Home,
  Layers,
  MessageCircle,
  Scale,
  Settings as SettingsIcon,
  Shield,
  Tag,
  User as UserIcon,
  type LucideIcon,
} from 'lucide-react';
import { PERMISSIONS } from './permissions.ts';

export interface SettingsSubCategoryAccess {
  isSuperAdmin: boolean;
  hasPermission: (permissionId: string) => boolean;
}

export interface SettingsSubCategoryDefinition {
  id: string;
  titleKey: string;
  icon: LucideIcon;
  canAccess?: (access: SettingsSubCategoryAccess) => boolean;
  requiresPremium?: boolean;
}

const superAdminOnly = (access: SettingsSubCategoryAccess) => access.isSuperAdmin;
const requiring = (permissionId: string) => (access: SettingsSubCategoryAccess) => access.hasPermission(permissionId);
const adminSettingsOnly = requiring(PERMISSIONS.ADMIN_SETTINGS_VIEW);

export const SETTINGS_SUB_CATEGORIES: Record<string, SettingsSubCategoryDefinition[]> = {
  general: [
    { id: 'billing', titleKey: 'settings.page.billing', icon: CreditCard, canAccess: superAdminOnly },
    { id: 'usage', titleKey: 'settings.page.usage', icon: Globe, canAccess: requiring(PERMISSIONS.ADMIN_SETTINGS_VIEW_STORAGE) },
    { id: 'server-config', titleKey: 'settings.page.serverConfig', icon: SettingsIcon, canAccess: superAdminOnly },
    { id: 'domain', titleKey: 'settings.page.domain', icon: Globe, canAccess: requiring(PERMISSIONS.ADMIN_SETTINGS_VIEW_DOMAIN) },
    { id: 'webhooks', titleKey: 'settings.page.webhooks', icon: MessageCircle, canAccess: adminSettingsOnly },
    { id: 'migration', titleKey: 'settings.page.migrationTool', icon: Database, canAccess: superAdminOnly },
  ],
  punishment: [
    { id: 'thresholds', titleKey: 'settings.page.thresholds', icon: Layers },
    { id: 'types', titleKey: 'settings.page.types', icon: Scale },
  ],
  tickets: [
    { id: 'quick-responses', titleKey: 'settings.page.quickResponses', icon: MessageCircle, canAccess: adminSettingsOnly },
    { id: 'label-management', titleKey: 'settings.page.labelManagement', icon: Tag, canAccess: adminSettingsOnly },
    { id: 'ticket-forms', titleKey: 'settings.page.ticketForms', icon: Layers, canAccess: adminSettingsOnly },
    { id: 'ai-moderation', titleKey: 'settings.page.aiModeration', icon: Bot, canAccess: adminSettingsOnly, requiresPremium: true },
  ],
  staff: [
    { id: 'staff-management', titleKey: 'settings.page.staffManagement', icon: UserIcon },
    { id: 'roles-permissions', titleKey: 'settings.page.rolesPermissions', icon: Shield },
  ],
  knowledgebase: [
    { id: 'knowledgebase-articles', titleKey: 'settings.page.knowledgebase', icon: BookOpen },
    { id: 'homepage-cards', titleKey: 'settings.page.homepageCards', icon: Home },
  ],
};

export function accessibleSubCategories(
  categoryId: string,
  access: SettingsSubCategoryAccess
): SettingsSubCategoryDefinition[] {
  return (SETTINGS_SUB_CATEGORIES[categoryId] ?? []).filter((sub) => !sub.canAccess || sub.canAccess(access));
}

export function resolveSubCategoryId(
  categoryId: string,
  requested: string | null,
  access: SettingsSubCategoryAccess
): string | null {
  const subs = accessibleSubCategories(categoryId, access);
  if (requested && subs.some((sub) => sub.id === requested)) {
    return requested;
  }
  return subs[0]?.id ?? null;
}

export function isSubCategoryPremiumLocked(
  sub: SettingsSubCategoryDefinition,
  isPremium: boolean | undefined
): boolean {
  return Boolean(sub.requiresPremium) && isPremium === false;
}
