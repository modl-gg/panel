import { useQuery, useMutation } from '@tanstack/react-query';
import { fromJson, type JsonValue } from '@bufbuild/protobuf';
import { queryClient } from '../../lib/queryClient';
import { protoFetch, protoFetchOrNull, protoSend } from '@/lib/proto-fetch';
import {
  AppealTicketsResponseSchema,
  CreateAppealRequestSchema,
  CreatePublicAppealResponseSchema,
} from '@modl-gg/proto/modl/v1/appeal_pb.ts';
import type { TicketResponse } from '@modl-gg/proto/modl/v1/ticket_pb.ts';
import { publicAuthTokenKey, requestPublicVerification, verifyPublicCode, withPublicAuthToken } from './public-verification';

export function appealAuthTokenKey(appealId: string): string {
  return publicAuthTokenKey('appeal', appealId);
}

export function withAppealAuthToken(path: string, appealId: string): string {
  return withPublicAuthToken(path, 'appeal', appealId);
}

// Appeals reuse the ticket TicketResponse message; its int64 date fields decode to
// bigint epoch millis, while the legacy JSON delivered them as numbers that consumers
// pass to `new Date(...)`. Convert each date back to a Number.
function mapAppealTicket(ticket: TicketResponse) {
  return {
    ...ticket,
    _id: ticket.id,
    date: Number(ticket.date),
    messages: ticket.messages.map((reply) => ({ ...reply, created: Number(reply.created) })),
    notes: ticket.notes.map((note) => ({ ...note, date: Number(note.date) })),
  };
}

export function useAppeals() {
  return useQuery({
    queryKey: ['/v1/panel/appeals'],
    queryFn: async () => {
      const response = await protoFetch(AppealTicketsResponseSchema, '/v1/panel/appeals');
      return response.tickets.map(mapAppealTicket);
    }
  });
}

export function useAppealsByPunishment(punishmentId: string) {
  return useQuery({
    queryKey: ['/v1/panel/appeals/punishment', punishmentId],
    queryFn: async () => {
      const response = await protoFetchOrNull(
        AppealTicketsResponseSchema,
        `/v1/panel/appeals/punishment/${punishmentId}`,
      );
      return response ? response.tickets.map(mapAppealTicket) : [];
    },
    enabled: !!punishmentId
  });
}

interface CreateAppealInput {
  punishmentId: JsonValue;
  playerUuid: JsonValue;
  email: JsonValue;
  attachments?: JsonValue;
  reason?: JsonValue;
  evidence?: JsonValue;
  additionalData?: JsonValue;
  fieldLabels?: JsonValue;
}

export function useCreateAppeal() {
  return useMutation({
    mutationFn: (appealData: CreateAppealInput) => {
      // CreateAppealRequest carries google.protobuf.Value/Struct fields that create()
      // cannot build from free-form JSON; fromJson coerces them natively from proto-JSON.
      // fromJson rejects undefined values, so only include keys that are present.
      const json: Record<string, JsonValue> = {
        punishmentId: appealData.punishmentId,
        playerUuid: appealData.playerUuid,
        email: appealData.email,
        attachments: (appealData.attachments ?? []) as JsonValue,
      };
      if (appealData.reason !== undefined) json.reason = appealData.reason;
      if (appealData.evidence !== undefined) json.evidence = appealData.evidence;
      if (appealData.additionalData !== undefined) json.additionalData = appealData.additionalData as JsonValue;
      if (appealData.fieldLabels !== undefined) json.fieldLabels = appealData.fieldLabels;

      return protoSend(
        'POST',
        '/v1/public/appeals',
        CreateAppealRequestSchema,
        fromJson(CreateAppealRequestSchema, json, { ignoreUnknownFields: true }),
        CreatePublicAppealResponseSchema,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/appeals'] });
    }
  });
}

export function useRequestAppealVerification() {
  return useMutation({
    mutationFn: (appealId: string) => requestPublicVerification(`/v1/public/appeals/${appealId}`)
  });
}

export function useVerifyAppealCode() {
  return useMutation({
    mutationFn: ({ appealId, code }: { appealId: string, code: string }) =>
      verifyPublicCode(`/v1/public/appeals/${appealId}`, code)
  });
}
