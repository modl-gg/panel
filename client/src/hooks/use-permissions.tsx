import { useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './use-auth';
import { buildRoleHierarchy, canModifyRole, canRemoveUser } from '@/utils/role-hierarchy';
import { apiFetch } from '@/lib/api';

export const PERMISSIONS = {
  ADMIN_SETTINGS_VIEW: 'admin.settings.view',
  ADMIN_SETTINGS_VIEW_PUNISHMENTS: 'admin.settings.view.punishments',
  ADMIN_SETTINGS_VIEW_CONTENT: 'admin.settings.view.content',
  ADMIN_SETTINGS_VIEW_DOMAIN: 'admin.settings.view.domain',
  ADMIN_SETTINGS_VIEW_BILLING: 'admin.settings.view.billing',
  ADMIN_SETTINGS_VIEW_MIGRATION: 'admin.settings.view.migration',
  ADMIN_SETTINGS_VIEW_STORAGE: 'admin.settings.view.storage',
  ADMIN_SETTINGS_MODIFY: 'admin.settings.modify',
  ADMIN_SETTINGS_MODIFY_PUNISHMENTS: 'admin.settings.modify.punishments',
  ADMIN_SETTINGS_MODIFY_CONTENT: 'admin.settings.modify.content',
  ADMIN_SETTINGS_MODIFY_DOMAIN: 'admin.settings.modify.domain',
  ADMIN_SETTINGS_MODIFY_BILLING: 'admin.settings.modify.billing',
  ADMIN_SETTINGS_MODIFY_MIGRATION: 'admin.settings.modify.migration',
  ADMIN_SETTINGS_MODIFY_STORAGE: 'admin.settings.modify.storage',
  ADMIN_STAFF_MANAGE: 'admin.staff.manage',
  ADMIN_STAFF_MANAGE_MEMBERS: 'admin.staff.manage.members',
  ADMIN_STAFF_MANAGE_ROLES: 'admin.staff.manage.roles',
  ADMIN_AUDIT_VIEW: 'admin.audit.view',
  ADMIN_AUDIT_VIEW_DASHBOARD: 'admin.audit.view.dashboard',
  ADMIN_AUDIT_VIEW_ANALYTICS: 'admin.audit.view.analytics',
  ADMIN_AUDIT_VIEW_LOGS: 'admin.audit.view.logs',

  PUNISHMENT_MODIFY: 'punishment.modify',
  PUNISHMENT_MODIFY_PARDON: 'punishment.modify.pardon',
  PUNISHMENT_MODIFY_DURATION: 'punishment.modify.duration',
  PUNISHMENT_MODIFY_NOTE: 'punishment.modify.note',
  PUNISHMENT_MODIFY_EVIDENCE: 'punishment.modify.evidence',
  PUNISHMENT_MODIFY_OPTIONS: 'punishment.modify.options',

  STAFF_CHAT_TOGGLE: 'staff.chat.toggle',
  STAFF_CHAT_CLEAR: 'staff.chat.clear',
  STAFF_CHAT_SLOW: 'staff.chat.slow',
  STAFF_MAINTENANCE: 'staff.maintenance',
  STAFF_MODACTIONS: 'staff.modactions',
  STAFF_INTERCEPT: 'staff.intercept',
  STAFF_CHATLOGS: 'staff.chatlogs',
  STAFF_COMMANDLOGS: 'staff.commandlogs',

  TICKET_VIEW_ALL: 'ticket.view.all',
  TICKET_VIEW_ALL_NOTES: 'ticket.view.all.notes',
  TICKET_REPLY_ALL: 'ticket.reply.all',
  TICKET_REPLY_ALL_NOTES: 'ticket.reply.all.notes',
  TICKET_CLOSE_ALL: 'ticket.close.all',
  TICKET_CLOSE_ALL_LOCK: 'ticket.close.all.lock',
  TICKET_MANAGE: 'ticket.manage',
  TICKET_MANAGE_TAGS: 'ticket.manage.tags',
  TICKET_MANAGE_HIDE: 'ticket.manage.hide',
  TICKET_MANAGE_SUBSCRIBE: 'ticket.manage.subscribe',
  TICKET_DELETE_ALL: 'ticket.delete.all',
} as const;

// Each tab lists ALL permissions that grant access (matched with hasAnyPermission)
export const SETTINGS_PERMISSIONS = {
  account: [],
  general: [PERMISSIONS.ADMIN_SETTINGS_VIEW, PERMISSIONS.ADMIN_SETTINGS_VIEW_BILLING, PERMISSIONS.ADMIN_SETTINGS_VIEW_DOMAIN, PERMISSIONS.ADMIN_SETTINGS_VIEW_STORAGE, PERMISSIONS.ADMIN_SETTINGS_VIEW_MIGRATION],
  punishment: [PERMISSIONS.ADMIN_SETTINGS_VIEW, PERMISSIONS.ADMIN_SETTINGS_VIEW_PUNISHMENTS],
  tags: [],
  staff: [PERMISSIONS.ADMIN_STAFF_MANAGE],
  knowledgebase: [PERMISSIONS.ADMIN_SETTINGS_VIEW, PERMISSIONS.ADMIN_SETTINGS_VIEW_CONTENT],
  homepage: [PERMISSIONS.ADMIN_SETTINGS_VIEW, PERMISSIONS.ADMIN_SETTINGS_VIEW_CONTENT],
} as const;

export function usePermissions() {
  const { user } = useAuth();
  
  const { data: serverPermissions } = useQuery({
    queryKey: ['userPermissions', user?.role],
    queryFn: async () => {
      if (!user?.role) return [];
      try {
        const response = await apiFetch('/v1/panel/auth/permissions');
        if (!response.ok) {
          if (response.status === 401) return [];
          throw new Error('Failed to fetch permissions');
        }
        return response.json();
      } catch {
        return null;
      }
    },
    enabled: !!user?.role,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const userPermissions = useMemo(() => {
    if (!user || !user.role) return [];

    if (serverPermissions && Array.isArray(serverPermissions)) {
      return serverPermissions;
    }
    
    // Server is the authority; on failure, grant no permissions for security
    if (serverPermissions === null) {
      return [];
    }

    // Query still loading - use default role permissions until first fetch completes
    const defaultPermissions: Record<string, string[]> = {
      'Super Admin': [
        PERMISSIONS.ADMIN_SETTINGS_VIEW,
        PERMISSIONS.ADMIN_SETTINGS_MODIFY,
        PERMISSIONS.ADMIN_STAFF_MANAGE,
        PERMISSIONS.ADMIN_AUDIT_VIEW,
        PERMISSIONS.TICKET_VIEW_ALL,
        PERMISSIONS.TICKET_REPLY_ALL,
        PERMISSIONS.TICKET_CLOSE_ALL,
        PERMISSIONS.TICKET_DELETE_ALL,
      ],
      'Admin': [
        PERMISSIONS.ADMIN_SETTINGS_VIEW,
        PERMISSIONS.ADMIN_STAFF_MANAGE,
        PERMISSIONS.ADMIN_AUDIT_VIEW,
        PERMISSIONS.TICKET_VIEW_ALL,
        PERMISSIONS.TICKET_REPLY_ALL,
        PERMISSIONS.TICKET_CLOSE_ALL,
      ],
      'Moderator': [
        PERMISSIONS.TICKET_VIEW_ALL,
        PERMISSIONS.TICKET_REPLY_ALL,
        PERMISSIONS.TICKET_CLOSE_ALL,
      ],
      'Helper': [
        PERMISSIONS.TICKET_VIEW_ALL,
        PERMISSIONS.TICKET_REPLY_ALL,
      ],
    };

    return defaultPermissions[user.role] || [];
  }, [user, serverPermissions]);

  const hasPermission = useCallback((permission: string): boolean => {
    if (!user) return false;
    return userPermissions.some(p => p === permission || permission.startsWith(p + '.'));
  }, [user, userPermissions]);

  const hasAllPermissions = useCallback((permissions: string[]): boolean => {
    if (!user) return false;
    if (!permissions || !Array.isArray(permissions)) return false;
    return permissions.every(permission => hasPermission(permission));
  }, [user, hasPermission]);

  const hasAnyPermission = useCallback((permissions: string[]): boolean => {
    if (!user) return false;
    if (!permissions || !Array.isArray(permissions)) return false;
    return permissions.some(permission => hasPermission(permission));
  }, [user, hasPermission]);

  const canAccessSettingsTab = (tabName: keyof typeof SETTINGS_PERMISSIONS): boolean => {
    if (!user) return false;
    if (tabName === 'tags') {
      return hasAnyPermission([
        PERMISSIONS.ADMIN_SETTINGS_VIEW,
        PERMISSIONS.TICKET_VIEW_ALL,
        PERMISSIONS.TICKET_MANAGE_TAGS,
      ]);
    }
    const requiredPermissions = SETTINGS_PERMISSIONS[tabName];
    if (!requiredPermissions || !Array.isArray(requiredPermissions)) return false;
    if (requiredPermissions.length === 0) return true;
    return hasAnyPermission(requiredPermissions as unknown as string[]);
  };

  const getAccessibleSettingsTabs = (): string[] => {
    if (!user) return ['account'];
    
    const allTabs = Object.keys(SETTINGS_PERMISSIONS) as (keyof typeof SETTINGS_PERMISSIONS)[];
    return allTabs.filter(tab => canAccessSettingsTab(tab));
  };

  const { data: rolesData } = useQuery({
    queryKey: ['/v1/panel/roles'],
    queryFn: async () => {
      const response = await apiFetch('/v1/panel/roles');
      if (!response.ok) throw new Error('Failed to fetch roles');
      return response.json();
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const roleHierarchy = useMemo(() => {
    return rolesData?.roles ? buildRoleHierarchy(rolesData.roles) : new Map();
  }, [rolesData]);

  const canModifyUserRole = (targetUserRole: string, newRole?: string, targetUserId?: string): boolean => {
    if (!user) return false;
    if (!newRole) {
      if (user.role === 'Super Admin' && targetUserRole !== 'Super Admin') {
        return true;
      }
      const currentRoleInfo = roleHierarchy.get(user.role);
      const targetRoleInfo = roleHierarchy.get(targetUserRole);
      if (!currentRoleInfo || !targetRoleInfo) return false;
      return currentRoleInfo.order < targetRoleInfo.order;
    }
    return canModifyRole(user.role, targetUserRole, newRole, roleHierarchy);
  };

  const canRemoveStaffUser = (targetUserRole: string): boolean => {
    if (!user) return false;
    return canRemoveUser(user.role, targetUserRole, roleHierarchy);
  };

  const canAssignStaffMinecraftPlayer = (targetUserRole: string, targetUserId: string): boolean => {
    if (!user) return false;
    if (user.role === 'Super Admin') return true;
    return user.id === targetUserId;
  };

  return {
    userPermissions,
    hasPermission,
    hasAllPermissions,
    hasAnyPermission,
    canAccessSettingsTab,
    getAccessibleSettingsTabs,
    canModifyUserRole,
    canRemoveStaffUser,
    canAssignStaffMinecraftPlayer,
    roleHierarchy,
  };
}
