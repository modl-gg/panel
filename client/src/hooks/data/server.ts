import { useQuery } from '@tanstack/react-query';
import { StorageQuotaResponseSchema } from '@modl-gg/proto/modl/v1/storage_pb.ts';
import { protoFetch } from '@/lib/proto-fetch';
import { PERMISSIONS, usePermissions } from '@/hooks/use-permissions';

export function useServerPremium(): boolean | undefined {
  const { hasPermission } = usePermissions();

  const { data } = useQuery({
    queryKey: ['/v1/panel/storage/quota'],
    queryFn: () => protoFetch(StorageQuotaResponseSchema, '/v1/panel/storage/quota'),
    enabled: hasPermission(PERMISSIONS.ADMIN_SETTINGS_VIEW_STORAGE),
    staleTime: 1000 * 60 * 5,
  });

  return data?.isPremium;
}
