import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface PublicSettingsData {
  serverExists: boolean;
  serverDisplayName: string | null;
  panelIconUrl: string | null;
  homepageIconUrl: string | null;
  ticketForms?: Record<string, unknown>;
  maintenanceMode?: boolean;
  maintenanceMessage?: string;
}

export function usePublicSettings() {
  return useQuery<PublicSettingsData>({
    queryKey: ['/v1/public/settings'],
    queryFn: async () => {
      try {
        const res = await apiFetch('/v1/public/settings');

        if (!res.ok) {
          return {
            serverExists: false,
            serverDisplayName: null,
            panelIconUrl: null,
            homepageIconUrl: null,
          };
        }

        return await res.json() as PublicSettingsData;
      } catch {
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
