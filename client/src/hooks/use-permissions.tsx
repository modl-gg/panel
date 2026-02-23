import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './use-auth';
import { buildRoleHierarchy, canModifyRole, canRemoveUser, canAssignMinecraftPlayer } from '@/utils/role-hierarchy';
import { getApiUrl, getCurrentDomain } from '@/lib/api';

async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const fullUrl = getApiUrl(url);
  const response = await fetch(fullUrl, {
    ...options,
    credentials: "include",
    headers: {
      ...options.headers,
      "X-Server-Domain": getCurrentDomain(),
    },
  });
  if (response.status === 429) {
    const { handleRateLimitResponse, getCurrentPath } = await import('../utils/rate-limit-handler');
    await handleRateLimitResponse(response, getCurrentPath());
    throw new Error('Rate limit exceeded');
  }
  return response;
}

// Define permissions that match the backend permission system
export const PERMISSIONS = {
  // Admin settings permissions
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

  // Punishment permissions
  PUNISHMENT_MODIFY: 'punishment.modify',
  PUNISHMENT_MODIFY_PARDON: 'punishment.modify.pardon',
  PUNISHMENT_MODIFY_DURATION: 'punishment.modify.duration',
  PUNISHMENT_MODIFY_NOTE: 'punishment.modify.note',
  PUNISHMENT_MODIFY_EVIDENCE: 'punishment.modify.evidence',
  PUNISHMENT_MODIFY_OPTIONS: 'punishment.modify.options',

  // Ticket permissions
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

// Settings-specific permissions map
export const SETTINGS_PERMISSIONS = {
  account: [], // Everyone can access account settings
  general: [PERMISSIONS.ADMIN_SETTINGS_VIEW], // Server & Billing
  punishment: [PERMISSIONS.ADMIN_SETTINGS_VIEW], // Punishment Types
  tags: [], // Tickets tab has mixed permission gates by sub-section
  staff: [PERMISSIONS.ADMIN_STAFF_MANAGE], // Staff Management
  knowledgebase: [PERMISSIONS.ADMIN_SETTINGS_VIEW], // Knowledgebase - requires settings view
  homepage: [PERMISSIONS.ADMIN_SETTINGS_VIEW], // Homepage Cards
} as const;

export function usePermissions() {
  const { user } = useAuth();
  
  // Fetch user permissions from server (with fallback to defaults)
  const { data: serverPermissions, error } = useQuery({
    queryKey: ['userPermissions', user?.role],
    queryFn: async () => {
      if (!user?.role) return [];
      try {
        const response = await apiFetch('/v1/panel/auth/permissions');
        if (!response.ok) {
          // If server returns 401, user is not authenticated - return empty array
          if (response.status === 401) return [];
          throw new Error('Failed to fetch permissions');
        }
        return response.json();
      } catch (error) {
        console.warn('Failed to fetch user permissions from server, using fallback:', error);
        return null; // Signal to use fallback permissions
      }
    },
    enabled: !!user?.role,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: false, // Don't retry on error, fallback to default permissions
  });
  
  // Log any permission fetch errors for debugging
  if (error) {
    console.warn('Permission query error:', error);
  }

  // Get user permissions (from server or fallback to defaults)
  const userPermissions = useMemo(() => {
    if (!user || !user.role) return [];
    
    // Use server permissions if available and valid
    if (serverPermissions && Array.isArray(serverPermissions)) {
      return serverPermissions;
    }
    
    // If serverPermissions is explicitly null, it means fetch failed - deny all permissions
    // Server is the authority; on failure, grant no permissions for security
    if (serverPermissions === null) {
      return [];
    }

    // If serverPermissions is undefined, query is still loading - use default role permissions
    // only for the initial load before the first fetch completes
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

  // Check if user has a specific permission (with hierarchical matching)
  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    return userPermissions.some(p => p === permission || permission.startsWith(p + '.'));
  };

  // Check if user has all required permissions
  const hasAllPermissions = (permissions: string[]): boolean => {
    if (!user) return false;
    if (!permissions || !Array.isArray(permissions)) return false; // Defensive check
    return permissions.every(permission => hasPermission(permission));
  };

  // Check if user has any of the required permissions
  const hasAnyPermission = (permissions: string[]): boolean => {
    if (!user) return false;
    if (!permissions || !Array.isArray(permissions)) return false; // Defensive check
    return permissions.some(permission => hasPermission(permission));
  };

  // Check if user has a permission OR any child of it
  // e.g. hasPermissionOrChild('admin.settings.view') returns true if user has
  // 'admin.settings.view' itself OR 'admin.settings.view.punishments', etc.
  const hasPermissionOrChild = (permission: string): boolean => {
    if (!user) return false;
    if (hasPermission(permission)) return true;
    return userPermissions.some(p => p.startsWith(permission + '.'));
  };

  // Check if user can access a specific settings tab
  const canAccessSettingsTab = (tabName: keyof typeof SETTINGS_PERMISSIONS): boolean => {
    if (!user) return false;
    if (tabName === 'tags') {
      return hasAnyPermission([
        PERMISSIONS.ADMIN_SETTINGS_VIEW,
        PERMISSIONS.TICKET_VIEW_ALL,
        PERMISSIONS.TICKET_MANAGE_TAGS,
      ]) || userPermissions.some(p => p.startsWith(PERMISSIONS.ADMIN_SETTINGS_VIEW + '.'));
    }
    const requiredPermissions = SETTINGS_PERMISSIONS[tabName];
    if (!requiredPermissions || !Array.isArray(requiredPermissions)) return false; // Defensive check
    if (requiredPermissions.length === 0) return true;
    return requiredPermissions.every(perm => hasPermissionOrChild(perm));
  };

  // Get accessible settings tabs
  const getAccessibleSettingsTabs = (): string[] => {
    if (!user) return ['account']; // Default to account only if no user
    
    const allTabs = Object.keys(SETTINGS_PERMISSIONS) as (keyof typeof SETTINGS_PERMISSIONS)[];
    return allTabs.filter(tab => canAccessSettingsTab(tab));
  };

  // Role hierarchy helper functions integrated with existing permission system
  const { data: rolesData } = useQuery({
    queryKey: ['/v1/panel/roles'],
    queryFn: async () => {
      const response = await apiFetch('/v1/panel/roles');
      if (!response.ok) throw new Error('Failed to fetch roles');
      return response.json();
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const roleHierarchy = useMemo(() => {
    return rolesData?.roles ? buildRoleHierarchy(rolesData.roles) : new Map();
  }, [rolesData]);

  // Role hierarchy functions
  const canModifyUserRole = (targetUserRole: string, newRole?: string, targetUserId?: string): boolean => {
    if (!user) return false;
    // If no newRole specified, check if user can modify this role at all
    // For checking general ability to change role, we'll use a dummy check
    if (!newRole) {
      // Super Admin can modify any non-Super Admin role
      if (user.role === 'Super Admin' && targetUserRole !== 'Super Admin') {
        return true;
      }
      // For others, check if they have higher authority than the target
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
    
    // Super Admin can change anyone's minecraft player
    if (user.role === 'Super Admin') {
      return true;
    }
    
    // For other roles, they can only change their own
    return user.id === targetUserId;
  };

  return {
    userPermissions,
    hasPermission,
    hasAllPermissions,
    hasAnyPermission,
    canAccessSettingsTab,
    getAccessibleSettingsTabs,
    // Role hierarchy functions
    canModifyUserRole,
    canRemoveStaffUser,
    canAssignStaffMinecraftPlayer,
    roleHierarchy,
  };
}
