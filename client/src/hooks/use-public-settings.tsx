import { useQuery } from '@tanstack/react-query';
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

export interface PublicSettingsData {
  serverExists: boolean;
  serverDisplayName: string | null;
  panelIconUrl: string | null;
  homepageIconUrl: string | null;
  ticketForms?: Record<string, unknown>;
  maintenanceMode?: boolean;
  maintenanceMessage?: string;
}

/**
 * Hook to fetch basic server settings from the public API
 * This is used for unprotected pages like homepage and auth page
 */
export function usePublicSettings() {
  return useQuery<PublicSettingsData>({
    queryKey: ['/v1/public/settings'],
    queryFn: async () => {
      try {
        const res = await apiFetch('/v1/public/settings');

        if (!res.ok) {
          console.error('[usePublicSettings] Request failed:', res.status);
          return {
            serverExists: false,
            serverDisplayName: null,
            panelIconUrl: null,
            homepageIconUrl: null,
          };
        }

        const data = await res.json();
        return data as PublicSettingsData;
      } catch (error) {
        console.error('[usePublicSettings] Error occurred:', error);
        return {
          serverExists: false,
          serverDisplayName: null,
          panelIconUrl: null,
          homepageIconUrl: null,
        };
      }
    },
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: true,
    refetchInterval: 1000 * 60,
    retry: 1,
  });
}
