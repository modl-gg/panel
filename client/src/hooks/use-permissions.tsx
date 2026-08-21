import { useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './use-auth';
import { buildRoleHierarchy, canModifyRole, canRemoveUser } from '@/utils/role-hierarchy';
import { apiFetch } from '@/lib/api';
import { PERMISSIONS, SUPER_ADMIN_EXCLUSIVE_PERMISSION } from '@/lib/permissions';

export { PERMISSIONS };

// Each tab lists ALL permissions that grant access (matched with hasAnyPermission)
export const SETTINGS_PERMISSIONS = {
  account: [],
  general: [PERMISSIONS.ADMIN_SETTINGS_VIEW, PERMISSIONS.ADMIN_SETTINGS_VIEW_DOMAIN, PERMISSIONS.ADMIN_SETTINGS_VIEW_STORAGE, PERMISSIONS.ADMIN_SETTINGS_VIEW_MIGRATION],
  punishment: [PERMISSIONS.ADMIN_SETTINGS_VIEW, PERMISSIONS.ADMIN_SETTINGS_VIEW_PUNISHMENTS],
  tags: [],
  staff: [PERMISSIONS.ADMIN_STAFF_MANAGE],
  knowledgebase: [PERMISSIONS.ADMIN_SETTINGS_VIEW, PERMISSIONS.ADMIN_SETTINGS_VIEW_CONTENT],
  homepage: [PERMISSIONS.ADMIN_SETTINGS_VIEW, PERMISSIONS.ADMIN_SETTINGS_VIEW_CONTENT],
} as const;

export type SettingsTab = keyof typeof SETTINGS_PERMISSIONS;

export const SUPER_ADMIN_ROLE = 'Super Admin';

export function usePermissions() {
  const { user } = useAuth();

  const { data: serverPermissions, isPending: isPermissionsQueryPending } = useQuery({
    queryKey: ['userPermissions', user?.role],
    queryFn: async () => {
      if (!user?.role) return [];
      try {
        const response = await apiFetch('/v1/panel/auth/permissions');
        if (!response.ok) {
          if (response.status === 401) return [];
          throw new Error('Failed to fetch permissions');
        }
        const data = await response.json();
        return Array.isArray(data) ? data : (data?.permissions ?? []);
      } catch {
        return null;
      }
    },
    enabled: !!user?.role,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const isPermissionsLoading = Boolean(user?.role) && isPermissionsQueryPending;

  const userPermissions = useMemo<string[]>(
    () => (Array.isArray(serverPermissions) ? serverPermissions : []),
    [serverPermissions]
  );

  const grantedPermissions = useMemo(() => new Set(userPermissions), [userPermissions]);

  const isSuperAdmin = grantedPermissions.has(SUPER_ADMIN_EXCLUSIVE_PERMISSION);

  const hasPermission = useCallback((permission: string): boolean => {
    if (!user) return false;
    return grantedPermissions.has(permission);
  }, [user, grantedPermissions]);

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

  const canAccessSettingsTab = useCallback((tabName: SettingsTab): boolean => {
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
  }, [user, hasAnyPermission]);

  const getAccessibleSettingsTabs = useCallback((): string[] => {
    if (!user) return ['account'];

    const allTabs = Object.keys(SETTINGS_PERMISSIONS) as (keyof typeof SETTINGS_PERMISSIONS)[];
    return allTabs.filter(tab => canAccessSettingsTab(tab));
  }, [user, canAccessSettingsTab]);

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
  }, [rolesData?.roles]);

  const canModifyUserRole = (targetUserRole: string, newRole?: string, _targetUserId?: string): boolean => {
    if (!user) return false;
    if (!newRole) {
      if (isSuperAdmin && targetUserRole !== SUPER_ADMIN_ROLE) {
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

  const canAssignStaffMinecraftPlayer = (_targetUserRole: string, targetUserId: string): boolean => {
    if (!user) return false;
    if (isSuperAdmin) return true;
    return user.id === targetUserId;
  };

  return {
    userPermissions,
    isPermissionsLoading,
    isSuperAdmin,
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
