import { useQuery } from '@tanstack/react-query';
import { usePermissions, PERMISSIONS } from './use-permissions';

// Permission-aware version of useBillingStatus
export function useBillingStatusWithPermissions() {
  const { hasPermission } = usePermissions();
  
  return useQuery({
    queryKey: ['/api/panel/billing/status'],
    queryFn: async () => {
      const res = await fetch('/api/panel/billing/status');
      if (!res.ok) {
        throw new Error('Failed to fetch billing status');
      }
      return res.json();
    },
    enabled: hasPermission(PERMISSIONS.ADMIN_SETTINGS_VIEW), // Only run if user has permission
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// Permission-aware version of useUsageData
export function useUsageDataWithPermissions() {
  const { hasPermission } = usePermissions();
  
  return useQuery({
    queryKey: ['/api/panel/billing/usage'],
    queryFn: async () => {
      const res = await fetch('/api/panel/billing/usage');
      if (!res.ok) {
        throw new Error('Failed to fetch usage data');
      }
      return res.json();
    },
    enabled: hasPermission(PERMISSIONS.ADMIN_SETTINGS_VIEW), // Only run if user has permission
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// Permission-aware version of staff-related data fetching
export function useStaffDataWithPermissions() {
  const { hasPermission } = usePermissions();
  
  return useQuery({
    queryKey: ['/api/panel/staff'],
    queryFn: async () => {
      const res = await fetch('/api/panel/staff');
      if (!res.ok) {
        throw new Error('Failed to fetch staff data');
      }
      return res.json();
    },
    enabled: hasPermission(PERMISSIONS.ADMIN_STAFF_MANAGE), // Only run if user has permission
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}

// Permission-aware version of punishment settings
export function usePunishmentSettingsWithPermissions() {
  const { hasPermission } = usePermissions();
  
  return useQuery({
    queryKey: ['/api/panel/settings/punishments'],
    queryFn: async () => {
      const res = await fetch('/api/panel/settings/punishments');
      if (!res.ok) {
        throw new Error('Failed to fetch punishment settings');
      }
      return res.json();
    },
    enabled: hasPermission(PERMISSIONS.ADMIN_SETTINGS_VIEW), // Only run if user has permission
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// Permission-aware version of analytics data
export function useAnalyticsDataWithPermissions() {
  const { hasPermission } = usePermissions();
  
  return useQuery({
    queryKey: ['/api/panel/analytics'],
    queryFn: async () => {
      const res = await fetch('/api/panel/analytics');
      if (!res.ok) {
        throw new Error('Failed to fetch analytics data');
      }
      return res.json();
    },
    enabled: hasPermission(PERMISSIONS.ADMIN_ANALYTICS_VIEW), // Only run if user has permission
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}