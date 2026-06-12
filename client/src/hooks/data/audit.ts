import { useQuery } from '@tanstack/react-query';
import { PanelLogsResponseSchema } from '@modl-gg/proto/modl/v1/admin_pb.ts';
import { protoFetch } from '@/lib/proto-fetch';
import { tsToDate } from '@/lib/proto-ui';

export interface PanelLog {
  id: string;
  description: string;
  level: string;
  source: string;
  created: Date | null;
}

export function useLogs() {
  return useQuery({
    queryKey: ['/v1/panel/logs'],
    queryFn: async (): Promise<PanelLog[]> => {
      const res = await protoFetch(PanelLogsResponseSchema, '/v1/panel/logs');
      return res.logs.map((log) => ({
        id: log.id,
        description: log.description,
        level: log.level,
        source: log.source,
        created: tsToDate(log.created),
      }));
    },
  });
}
