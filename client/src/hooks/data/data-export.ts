import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { ApiHttpError } from '@/lib/http-error';

export type DataExportState = 'QUEUED' | 'RUNNING' | 'READY' | 'FAILED' | 'EXPIRED';
export type DataExportPhase = 'PREPARING' | 'DATABASE' | 'STORAGE' | 'FINALIZING';
export type DataExportFailure =
  | 'SERVER_UNAVAILABLE'
  | 'SUPER_ADMIN_CHANGED'
  | 'TOO_LARGE'
  | 'DELIVERY_FAILED'
  | 'INTERRUPTED'
  | 'INTERNAL_ERROR';

export interface DataExportRecord {
  id: string;
  status: DataExportState;
  requestedAt: string;
  phase?: DataExportPhase;
  processedItems?: number;
  totalItems?: number;
  completedAt?: string;
  expiresAt?: string;
  sizeBytes?: number;
  failure?: DataExportFailure;
}

export interface DataExportOverview {
  available: boolean;
  canRequest: boolean;
  nextAllowedAt?: string;
  cooldownSeconds: number;
  linkLifetimeSeconds: number;
  latest?: DataExportRecord;
}

const DATA_EXPORT_PATH = '/v1/panel/data-export';
const DATA_EXPORT_QUERY_KEY = [DATA_EXPORT_PATH];
const ACTIVE_POLL_INTERVAL_MS = 5000;
const IDLE_POLL_INTERVAL_MS = 60000;

export function isDataExportActive(record: DataExportRecord | undefined): boolean {
  return record?.status === 'QUEUED' || record?.status === 'RUNNING';
}

async function fetchDataExport(method: 'GET' | 'POST'): Promise<DataExportOverview> {
  const res = await apiFetch(DATA_EXPORT_PATH, { method });
  if (!res.ok) {
    throw new ApiHttpError(res.status, res.statusText, await res.text());
  }
  return res.json();
}

export function useDataExport() {
  return useQuery({
    queryKey: DATA_EXPORT_QUERY_KEY,
    queryFn: () => fetchDataExport('GET'),
    staleTime: 0,
    refetchInterval: (query) =>
      isDataExportActive(query.state.data?.latest) ? ACTIVE_POLL_INTERVAL_MS : IDLE_POLL_INTERVAL_MS,
  });
}

export function useRequestDataExport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => fetchDataExport('POST'),
    onMutate: () => queryClient.cancelQueries({ queryKey: DATA_EXPORT_QUERY_KEY }),
    onSuccess: async (overview) => {
      await queryClient.cancelQueries({ queryKey: DATA_EXPORT_QUERY_KEY });
      queryClient.setQueryData(DATA_EXPORT_QUERY_KEY, overview);
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: DATA_EXPORT_QUERY_KEY });
    },
  });
}
