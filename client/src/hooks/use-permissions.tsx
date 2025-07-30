import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './use-auth';

// Define permissions that match the backend permission system
export const PERMISSIONS = {
  // Admin settings permissions
  ADMIN_SETTINGS_VIEW: 'admin.settings.view',
  ADMIN_SETTINGS_MODIFY: 'admin.settings.modify',
  ADMIN_STAFF_MANAGE: 'admin.staff.manage',
  ADMIN_AUDIT_VIEW: 'admin.audit.view',
  
  // Punishment permissions
  PUNISHMENT_MODIFY: 'punishment.modify',
  
  // Ticket permissions
  TICKET_VIEW_ALL: 'ticket.view.all',
  TICKET_REPLY_ALL: 'ticket.reply.all',
  TICKET_CLOSE_ALL: 'ticket.close.all',
  TICKET_DELETE_ALL: 'ticket.delete.all',
} as const;

// Settings-specific permissions map
export const SETTINGS_PERMISSIONS = {
  account: [], // Everyone can access account settings
  general: [PERMISSIONS.ADMIN_SETTINGS_VIEW], // Server & Billing
  punishment: [PERMISSIONS.ADMIN_SETTINGS_VIEW], // Punishment Types
  tags: [PERMISSIONS.ADMIN_SETTINGS_VIEW], // Tickets - requires settings view
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
        const response = await fetch('/api/auth/permissions');
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
    
    // If serverPermissions is explicitly null, it means fetch failed - use fallback
    // If serverPermissions is undefined, query is still loading - also use fallback
    // Fallback to default role permissions for backward compatibility
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

  // Check if user has a specific permission
  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    return userPermissions.includes(permission);
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

  // Check if user can access a specific settings tab
  const canAccessSettingsTab = (tabName: keyof typeof SETTINGS_PERMISSIONS): boolean => {
    if (!user) return false;
    const requiredPermissions = SETTINGS_PERMISSIONS[tabName];
    if (!requiredPermissions || !Array.isArray(requiredPermissions)) return false; // Defensive check
    return requiredPermissions.length === 0 || hasAllPermissions(requiredPermissions);
  };

  // Get accessible settings tabs
  const getAccessibleSettingsTabs = (): string[] => {
    if (!user) return ['account']; // Default to account only if no user
    
    const allTabs = Object.keys(SETTINGS_PERMISSIONS) as (keyof typeof SETTINGS_PERMISSIONS)[];
    return allTabs.filter(tab => canAccessSettingsTab(tab));
  };

  return {
    userPermissions,
    hasPermission,
    hasAllPermissions,
    hasAnyPermission,
    canAccessSettingsTab,
    getAccessibleSettingsTabs,
  };
}