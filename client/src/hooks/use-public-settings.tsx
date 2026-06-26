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
      // A non-ok response is a definitive answer from the server, so fall back to
      // serverExists:false. A thrown transport/network error, by contrast, is transient:
      // re-throw it so react-query's `retry` actually fires (it never could when the
      // catch swallowed everything into a resolved success), giving a retry buffer before
      // refetchOnWindowFocus can flip the UI to serverExists:false on a single blip.
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
    },
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}
