import { useQuery } from '@tanstack/react-query';
import { usePermissions, PERMISSIONS } from './use-permissions';
import { getApiUrl, getCurrentDomain } from '@/lib/api';

async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const fullUrl = getApiUrl(url);
  return fetch(fullUrl, {
    ...options,
    credentials: "include",
    headers: {
      ...options.headers,
      "X-Server-Domain": getCurrentDomain(),
    },
  });
}

// Permission-aware version of useBillingStatus
export function useBillingStatusWithPermissions() {
  const { hasPermission } = usePermissions();
  
  return useQuery({
    queryKey: ['/v1/panel/billing/status'],
    queryFn: async () => {
      const res = await apiFetch('/v1/panel/billing/status');
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
    queryKey: ['/v1/panel/billing/usage'],
    queryFn: async () => {
      const res = await apiFetch('/v1/panel/billing/usage');
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
    queryKey: ['/v1/panel/staff'],
    queryFn: async () => {
      const res = await apiFetch('/v1/panel/staff');
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
    queryKey: ['/v1/panel/settings/punishment-types'],
    queryFn: async () => {
      const res = await apiFetch('/v1/panel/settings/punishment-types');
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
    queryKey: ['/v1/panel/analytics'],
    queryFn: async () => {
      const res = await apiFetch('/v1/panel/analytics');
      if (!res.ok) {
        throw new Error('Failed to fetch analytics data');
      }
      return res.json();
    },
    enabled: hasPermission(PERMISSIONS.ADMIN_ANALYTICS_VIEW), // Only run if user has permission
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}