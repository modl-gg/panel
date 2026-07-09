import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';
import {
  MigrationStatusResponseSchema,
  StartMigrationRequestSchema,
  MigrationOperationResponseSchema,
  type MigrationStatusResponse,
} from '@modl-gg/proto/modl/v1/migration_pb.ts';
import { protoFetch, protoSend, ProtoHttpError } from '@/lib/proto-fetch';
import { tsToMillis, toNum } from '@/lib/proto-ui';

function remapMigrationStatus(res: MigrationStatusResponse) {
  const current = res.currentMigration;
  const cooldown = res.cooldown;
  return {
    currentMigration: current
      ? {
          taskId: current.taskId,
          type: current.type,
          status: current.status,
          progress: current.progress
            ? {
                message: current.progress.message,
                recordsProcessed: current.progress.recordsProcessed,
                recordsSkipped: current.progress.recordsSkipped,
                totalRecords: current.progress.totalRecords,
              }
            : undefined,
          startedAt: tsToMillis(current.startedAt),
          completedAt: tsToMillis(current.completedAt),
          error: current.error,
        }
      : undefined,
    cooldown: cooldown
      ? {
          onCooldown: cooldown.onCooldown,
          remainingTime: cooldown.remainingTime !== undefined ? toNum(cooldown.remainingTime) : undefined,
        }
      : undefined,
  };
}

export function useMigrationStatus() {
  return useQuery({
    queryKey: ['/v1/panel/migration/status'],
    queryFn: async () => {
      const res = await protoFetch(MigrationStatusResponseSchema, '/v1/panel/migration/status');
      return remapMigrationStatus(res);
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      const currentMigration = data?.currentMigration;
      const isActive = currentMigration &&
        currentMigration.status !== 'completed' &&
        currentMigration.status !== 'failed';

      return isActive ? 5000 : 30000;
    }
  });
}

export function useStartMigration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ migrationType }: { migrationType: string }) => {
      try {
        return await protoSend(
          'POST',
          '/v1/panel/migration/start',
          StartMigrationRequestSchema,
          create(StartMigrationRequestSchema, { migrationType }),
          MigrationOperationResponseSchema,
        );
      } catch (error) {
        throw migrationOperationError(error, 'Failed to start migration');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/migration/status'] });
    }
  });
}

export function useCancelMigration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      try {
        return await protoFetch(
          MigrationOperationResponseSchema,
          '/v1/panel/migration/cancel',
          { method: 'POST' },
        );
      } catch (error) {
        throw migrationOperationError(error, 'Failed to cancel migration');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/migration/status'] });
    }
  });
}

// /v1 error bodies stay the legacy {status,error} JSON envelope, so parse the raw body text
// to preserve the original `errorData.error || fallback` message surfaced to the user.
function migrationOperationError(error: unknown, fallback: string): Error {
  if (error instanceof ProtoHttpError) {
    try {
      const body = JSON.parse(error.bodyText);
      return new Error(body?.error || fallback);
    } catch {
      return new Error(fallback);
    }
  }
  return error instanceof Error ? error : new Error(fallback);
}
