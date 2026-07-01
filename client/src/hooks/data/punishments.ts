import { useQuery, useMutation } from '@tanstack/react-query';
import { create, fromJson, type JsonValue } from '@bufbuild/protobuf';
import { queryClient } from '../../lib/queryClient';
import { useAuth } from '../use-auth';
import { protoFetch, protoSend, protoFetchOrNull, ProtoHttpError } from '@/lib/proto-fetch';
import { SimpleResponseSchema } from '@modl-gg/proto/modl/v1/common_pb.ts';
import {
  PanelCreatePunishmentRequestSchema,
  PanelAddModificationRequestSchema,
  PanelAddPunishmentNoteRequestSchema,
  ModifyPunishmentTicketsRequestSchema,
  PunishmentResponseSchema,
} from '@modl-gg/proto/modl/v1/punishment_pb.ts';
import { mapPunishment } from '@/lib/punishment-mapping';
import {
  PanelLinkedBansResponseSchema,
} from '@modl-gg/proto/modl/v1/player_pb.ts';
import {
  PanelPunishmentTypesResponseSchema,
} from '@modl-gg/proto/modl/v1/settings_pb.ts';

// The /v1 error envelope stays the legacy {status,error,...} JSON, so the rich permission-denied
// message the punishment UI relies on must be reconstructed from the raw body text.
function applyPunishmentError(error: unknown): Error {
  if (error instanceof ProtoHttpError) {
    let parsed: { error?: string; message?: string; punishmentType?: string } | null = null;
    try {
      parsed = JSON.parse(error.bodyText);
    } catch {
      parsed = null;
    }

    if (error.status === 403) {
      let message = `Permission denied: ${parsed?.error || 'You do not have permission to apply this punishment type'}`;
      if (parsed?.punishmentType) {
        message += ` (${parsed.punishmentType})`;
      }
      return new Error(message);
    }

    const message = parsed?.error || parsed?.message
      || error.bodyText
      || `Failed to apply punishment: ${error.status} ${error.statusText}`;
    return new Error(message);
  }

  return error instanceof Error ? error : new Error('Failed to apply punishment');
}

export function useApplyPunishment() {
  return useMutation({
    mutationFn: async ({ uuid, punishmentData }: { uuid: string, punishmentData: any }) => {
      // punishmentData keeps the legacy `any` contract (the player/ticket pages build it in
      // proto-JSON shape with a free-form `data` Struct and number-typed int64 fields). fromJson
      // coerces those natively; create() cannot. Strip undefined keys, which fromJson rejects.
      const json: Record<string, JsonValue> = {};
      for (const [key, value] of Object.entries(punishmentData)) {
        if (value !== undefined && value !== null) {
          json[key] = value as JsonValue;
        }
      }

      try {
        return await protoSend(
          'POST',
          `/v1/panel/players/${uuid}/punishments`,
          PanelCreatePunishmentRequestSchema,
          fromJson(PanelCreatePunishmentRequestSchema, json, { ignoreUnknownFields: true }),
          SimpleResponseSchema,
        );
      } catch (error) {
        throw applyPunishmentError(error);
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/players', variables.uuid] });
    },
    onError: (error) => {
      console.error('Error applying punishment:', error);
    }
  });
}

export function useModifyPunishment() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      uuid,
      punishmentId,
      modificationType,
      reason,
      newDuration,
      appealTicketId
    }: {
      uuid: string,
      punishmentId: string,
      modificationType: string,
      reason: string,
      newDuration?: { value: number; unit: string },
      appealTicketId?: string
    }) => {
      const request = create(PanelAddModificationRequestSchema, {
        type: modificationType,
        issuerName: user?.username || 'Unknown User',
        issuerId: user?.id,
        reason
      });

      if (appealTicketId) {
        request.appealTicketId = appealTicketId;
      }

      if ((modificationType === 'MANUAL_DURATION_CHANGE' || modificationType === 'APPEAL_DURATION_CHANGE') && newDuration) {
        const multipliers = {
          'seconds': 1000,
          'minutes': 60 * 1000,
          'hours': 60 * 60 * 1000,
          'days': 24 * 60 * 60 * 1000,
          'weeks': 7 * 24 * 60 * 60 * 1000,
          'months': 30 * 24 * 60 * 60 * 1000
        };

        // An unrecognized unit must NOT silently fall back to 0ms: the backend treats
        // effectiveDuration <= 0 as PERMANENT, so a typo/casing drift would convert a finite
        // duration change into a permanent punishment with no feedback. Validate and throw instead.
        const multiplier = multipliers[newDuration.unit as keyof typeof multipliers];
        if (multiplier === undefined) {
          throw new Error(`Invalid duration unit: "${newDuration.unit}". Expected one of ${Object.keys(multipliers).join(', ')}.`);
        }

        const durationMs = newDuration.value * multiplier;
        request.effectiveDuration = BigInt(Math.trunc(durationMs));
      }

      return protoSend(
        'POST',
        `/v1/panel/players/${uuid}/punishments/${punishmentId}/modifications`,
        PanelAddModificationRequestSchema,
        request,
        SimpleResponseSchema,
      );
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/players', variables.uuid] });
    },
    onError: (error) => {
      console.error('Error modifying punishment:', error);
    }
  });
}

export function useAddPunishmentNote() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      uuid,
      punishmentId,
      noteText
    }: {
      uuid: string,
      punishmentId: string,
      noteText: string
    }) => {
      const request = create(PanelAddPunishmentNoteRequestSchema, {
        text: noteText,
        issuerName: user?.username || 'Unknown User',
        issuerId: user?.id
      });

      return protoSend(
        'POST',
        `/v1/panel/players/${uuid}/punishments/${punishmentId}/notes`,
        PanelAddPunishmentNoteRequestSchema,
        request,
        SimpleResponseSchema,
      );
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/players', variables.uuid] });
    },
    onError: (error) => {
      console.error('Error adding punishment note:', error);
    }
  });
}

export function useModifyPunishmentTickets() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      uuid,
      punishmentId,
      addTicketIds,
      removeTicketIds,
      modifyAssociatedTickets
    }: {
      uuid: string,
      punishmentId: string,
      addTicketIds?: string[],
      removeTicketIds?: string[],
      modifyAssociatedTickets: boolean
    }) => {
      const request = create(ModifyPunishmentTicketsRequestSchema, {
        punishmentId,
        issuerName: user?.username || 'Unknown User',
        issuerId: user?.id,
        addTicketIds: addTicketIds ?? [],
        removeTicketIds: removeTicketIds ?? [],
        modifyAssociatedTickets
      });

      return protoSend(
        'POST',
        `/v1/panel/players/${uuid}/punishments/${punishmentId}/tickets`,
        ModifyPunishmentTicketsRequestSchema,
        request,
        SimpleResponseSchema,
      );
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/players', variables.uuid] });
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/tickets'] });
    },
    onError: (error) => {
      console.error('Error modifying punishment tickets:', error);
    }
  });
}

export function usePunishmentById(punishmentId: string | null) {
  return useQuery({
    queryKey: ['/v1/panel/players/punishments', punishmentId],
    queryFn: async (): Promise<any> => {
      if (!punishmentId) return null;
      const response = await protoFetchOrNull(
        PunishmentResponseSchema,
        `/v1/panel/players/punishments/${punishmentId}`,
      );
      return response ? mapPunishment(response) : null;
    },
    enabled: !!punishmentId,
    staleTime: 30000,
  });
}

export function useLinkedBansForPunishment(punishmentId: string | null) {
  return useQuery({
    queryKey: ['/v1/panel/players/punishments', punishmentId, 'linked-bans'],
    queryFn: async () => {
      if (!punishmentId) return [];
      const response = await protoFetchOrNull(
        PanelLinkedBansResponseSchema,
        `/v1/panel/players/punishments/${punishmentId}/linked-bans`,
      );
      return response?.linkedBans ?? [];
    },
    enabled: !!punishmentId,
    staleTime: 30000,
  });
}

export function usePunishmentTypes() {
  return useQuery({
    queryKey: ['/v1/panel/settings/punishment-types'],
    queryFn: async () => {
      const response = await protoFetch(
        PanelPunishmentTypesResponseSchema,
        '/v1/panel/settings/punishment-types',
      );
      // Loose array: consumers bucket these into their own local PunishmentType shape (a different
      // type than the proto message), so keep the legacy untyped contract to avoid new errors.
      return response.punishmentTypes as any[];
    },
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false
  });
}
