import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { create, fromJson, toJson, type JsonObject, type MessageInitShape } from '@bufbuild/protobuf';
import type { Timestamp } from '@bufbuild/protobuf/wkt';
import { queryClient } from '../../lib/queryClient';
import { apiFetch } from '@/lib/api';
import { protoFetch, protoFetchOrNull, protoSend } from '@/lib/proto-fetch';
import { tsToDate } from '@/lib/proto-ui';
import { getApiErrorMessage } from '@/utils/email-validation';
import {
  PaginatedTicketsResponseSchema,
  type PaginatedTicketsResponse,
  type TicketListItemResponse,
  TicketResponseSchema,
  type TicketResponse,
  type TicketReply,
  type TicketNote,
  TicketCountsResponseSchema,
  CreateTicketRequestSchema,
  CreateTicketResponseSchema,
  UpdateTicketRequestSchema,
  AddReplyRequestSchema,
  AddNoteRequestSchema,
  AddTicketReplyResponseSchema,
  SubmitTicketFormRequestSchema,
  SubmitPublicTicketResponseSchema,
  PublicTicketVerificationRequestResponseSchema,
  VerifyTicketCodeRequestSchema,
  PublicTicketVerificationResponseSchema,
  BulkTicketUpdateRequestSchema,
  BulkTicketUpdateResponseSchema,
  PublicTicketResponseSchema,
  type PublicTicketResponse,
  type PublicTicketReply,
  type PublicTicketNote,
} from '@modl-gg/proto/modl/v1/ticket_pb.ts';

const READ_OPTS = { ignoreUnknownFields: true } as const;

export function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

// The legacy panel JSON serialized java.util.Date as epoch millis; consumers feed those
// values straight into `new Date(...)`. Proto int64 date fields decode to bigint millis,
// so convert them back to a Number that `new Date()` accepts.
const millisToNumber = (v: bigint): number => Number(v);

// PublicTicket* messages carry google.protobuf.Timestamp; the public ticket page feeds
// these dates through `new Date(...)`, so emit ISO strings (the prior wire shape).
const timestampToIso = (t?: Timestamp): string | undefined => {
  const date = tsToDate(t);
  return date ? date.toISOString() : undefined;
};

function mapReply(reply: TicketReply) {
  return { ...reply, created: millisToNumber(reply.created) };
}

function mapNote(note: TicketNote) {
  return { ...note, date: millisToNumber(note.date) };
}

// Returns `any` on purpose: the legacy hook returned res.json() (untyped), and consumers
// (including the frozen ticket-detail.tsx) read fields the proto message does not model.
// Keeping the loose contract leaves those consumers untouched.
function mapTicketResponse(ticket: TicketResponse): any {
  return {
    ...ticket,
    _id: ticket.id,
    date: millisToNumber(ticket.date),
    messages: ticket.messages.map(mapReply),
    notes: ticket.notes.map(mapNote),
  };
}

function mapListItem(item: TicketListItemResponse) {
  return {
    ...item,
    date: millisToNumber(item.date),
    lastReply: item.lastReply ? mapReply(item.lastReply) : undefined,
  };
}

// Returns `any` to preserve the legacy untyped contract; the tickets page maps the items
// onto its own local Ticket interface (string date fields) without further hook edits.
function mapPaginatedTickets(response: PaginatedTicketsResponse): any {
  return {
    tickets: response.tickets.map(mapListItem),
    pagination: response.pagination
      ? { ...response.pagination, totalTickets: Number(response.pagination.totalTickets) }
      : undefined,
    filters: response.filters,
  };
}

function mapPublicReply(reply: PublicTicketReply) {
  return { ...reply, created: timestampToIso(reply.created) };
}

function mapPublicNote(note: PublicTicketNote) {
  return { ...note, date: timestampToIso(note.date) };
}

// Returns `any` to keep the legacy untyped contract; the public ticket page reads several
// fields the proto message does not model and feeds dates straight into `new Date(...)`.
function mapPublicTicketResponse(ticket: PublicTicketResponse): any {
  return {
    ...ticket,
    _id: ticket.id,
    created: timestampToIso(ticket.created),
    date: timestampToIso(ticket.date),
    replies: ticket.replies.map(mapPublicReply),
    messages: ticket.messages.map(mapPublicReply),
    notes: ticket.notes.map(mapPublicNote),
    chatMessages: ticket.chatMessages.map((m) => ({ ...m, timestamp: timestampToIso(m.timestamp) })),
  };
}

// Backend normalizeAttachments accepts either a url string or a {url} object; proto-JSON
// Struct values must be objects, so wrap raw url strings into {url} before encoding.
function toAttachmentStructs(attachments: unknown): JsonObject[] {
  if (!Array.isArray(attachments)) return [];
  return attachments.map((attachment) =>
    typeof attachment === 'string' ? { url: attachment } : (attachment as JsonObject),
  );
}

export function useTickets(options?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  types?: string[];
  author?: string;
  labels?: string[];
  assignees?: string[];
  sort?: string;
}) {
  const { page = 1, limit = 10, search = '', status = '', types = [], author = '', labels = [], assignees = [], sort = 'newest' } = options || {};

  return useQuery({
    queryKey: ['/v1/panel/tickets', { page, limit, search, status, types, author, labels, assignees, sort }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', limit.toString());
      if (search) params.append('search', search);
      if (status) params.append('status', status);
      if (types.length > 0) {
        types.forEach(type => params.append('type', type));
      }
      if (author) params.append('author', author);
      if (labels.length > 0) {
        labels.forEach(label => params.append('labels', label));
      }
      if (assignees.length > 0) {
        assignees.forEach(assignee => params.append('assignee', assignee));
      }
      if (sort) params.append('sort', sort);

      const response = await protoFetch(PaginatedTicketsResponseSchema, `/v1/panel/tickets?${params.toString()}`);
      return mapPaginatedTickets(response);
    },
    staleTime: 30000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  });
}

export function useTicket(id: string) {
  return useQuery({
    queryKey: ['/v1/public/tickets', id],
    queryFn: async () => {
      const tokenKey = `ticket_auth_${id}`;
      const token = getCookie(tokenKey);

      const url = token
        ? `/v1/public/tickets/${id}?token=${encodeURIComponent(token)}`
        : `/v1/public/tickets/${id}`;

      const res = await apiFetch(url);
      if (!res.ok) {
        if (res.status === 404) {
          return null;
        }
        if (res.status === 403) {
          const data = await res.json().catch(() => ({ requiresVerification: true }));
          if (data.requiresVerification) {
            return { requiresVerification: true, emailHint: data.emailHint || '', ticketId: id };
          }
        }
        throw new Error('Failed to fetch ticket');
      }
      return mapPublicTicketResponse(fromJson(PublicTicketResponseSchema, await res.json(), READ_OPTS));
    },
    enabled: !!id,
    retry: false,
    staleTime: 30000,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: true
  });
}

export function useCreateTicket() {
  return useMutation({
    mutationFn: (ticketData: MessageInitShape<typeof CreateTicketRequestSchema>) =>
      protoSend(
        'POST',
        '/v1/panel/tickets',
        CreateTicketRequestSchema,
        create(CreateTicketRequestSchema, ticketData),
        CreateTicketResponseSchema,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/tickets'] });
    }
  });
}

export function useUpdateTicket() {
  return useMutation({
    mutationFn: async ({ id, data }: { id: string, data: any }) => {
      const request = create(UpdateTicketRequestSchema, {
        status: data.status,
        locked: data.locked,
        hidden: data.hidden,
        tags: data.tags,
        assignedTo: data.assignedTo,
        data: data.data,
        newReply: data.newReply
          ? create(AddReplyRequestSchema, {
              name: data.newReply.name,
              content: data.newReply.content,
              type: data.newReply.type,
              staff: data.newReply.staff,
              avatar: data.newReply.avatar,
              attachments: toAttachmentStructs(data.newReply.attachments),
              action: data.newReply.action,
              creatorIdentifier: data.newReply.creatorIdentifier,
            })
          : undefined,
        newNote: data.newNote
          ? create(AddNoteRequestSchema, {
              text: data.newNote.text,
              issuerName: data.newNote.issuerName,
              issuerAvatar: data.newNote.issuerAvatar,
            })
          : undefined,
      });
      const response = await protoSend(
        'PATCH',
        `/v1/panel/tickets/${id}`,
        UpdateTicketRequestSchema,
        request,
        TicketResponseSchema,
      );
      return mapTicketResponse(response);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/tickets', data._id] });
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/tickets'] });
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/tickets/counts'] });
    }
  });
}

export function useAddTicketReply() {
  return useMutation({
    mutationFn: ({ id, reply }: { id: string, reply: any }) => {
      const tokenKey = `ticket_auth_${id}`;
      const token = getCookie(tokenKey);

      const url = token
        ? `/v1/public/tickets/${id}/replies?token=${encodeURIComponent(token)}`
        : `/v1/public/tickets/${id}/replies`;

      const request = create(AddReplyRequestSchema, {
        name: reply.name,
        content: reply.content,
        type: reply.type,
        staff: !!reply.staff,
        avatar: reply.avatar,
        attachments: toAttachmentStructs(reply.attachments),
        action: reply.action,
        creatorIdentifier: reply.creatorIdentifier,
      });

      return protoSend('POST', url, AddReplyRequestSchema, request, AddTicketReplyResponseSchema);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/v1/public/tickets', variables.id] });
    }
  });
}

export function useSubmitTicketForm() {
  return useMutation({
    mutationFn: async ({ id, formData }: { id: string, formData: any }) => {
      const request = create(SubmitTicketFormRequestSchema, {
        subject: formData.subject,
        creatorEmail: formData.creatorEmail,
        formData: formData.formData,
        attachments: toAttachmentStructs(formData.attachments),
        creatorIdentifier: formData.creatorIdentifier,
        fieldLabels: formData.fieldLabels,
      });

      const res = await apiFetch(`/v1/public/tickets/${id}/submit`, {
        method: 'POST',
        body: toJson(SubmitTicketFormRequestSchema, request),
      });

      if (!res.ok) {
        const errorPayload = await res.json().catch(() => null);
        throw new Error(getApiErrorMessage(errorPayload, 'Failed to submit ticket form'));
      }

      return fromJson(SubmitPublicTicketResponseSchema, await res.json(), READ_OPTS);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/v1/public/tickets', variables.id] });
    }
  });
}

export function useRequestTicketVerification() {
  return useMutation({
    mutationFn: async (ticketId: string) => {
      const res = await apiFetch(`/v1/public/tickets/${ticketId}/request-verification`, {
        method: 'POST',
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || 'Failed to request verification');
      }

      return fromJson(PublicTicketVerificationRequestResponseSchema, await res.json(), READ_OPTS);
    }
  });
}

export function useVerifyTicketCode() {
  return useMutation({
    mutationFn: async ({ ticketId, code }: { ticketId: string, code: string }) => {
      const request = create(VerifyTicketCodeRequestSchema, { code });

      const res = await apiFetch(`/v1/public/tickets/${ticketId}/verify`, {
        method: 'POST',
        body: toJson(VerifyTicketCodeRequestSchema, request),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || 'Invalid or expired code');
      }

      return fromJson(PublicTicketVerificationResponseSchema, await res.json(), READ_OPTS);
    }
  });
}

export function usePanelTicket(id: string) {
  return useQuery({
    queryKey: ['/v1/panel/tickets', id],
    queryFn: async () => {
      const response = await protoFetchOrNull(TicketResponseSchema, `/v1/panel/tickets/${id}`);
      return response ? mapTicketResponse(response) : null;
    },
    enabled: !!id,
    staleTime: 30000,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: true
  });
}

export function usePlayerAllTickets(uuid: string) {
  return useQuery({
    queryKey: ['/v1/panel/tickets/player', uuid],
    queryFn: async () => {
      const res = await apiFetch(`/v1/panel/tickets/player/${uuid}`);
      if (!res.ok) {
        if (res.status === 404) {
          return [];
        }
        throw new Error('Failed to fetch player tickets');
      }
      return res.json();
    },
    enabled: !!uuid,
    staleTime: 30000,
    refetchOnWindowFocus: true
  });
}

export function useTicketStatusCounts(options?: {
  search?: string;
  types?: string[];
  author?: string;
  labels?: string[];
  assignees?: string[];
}) {
  const { search = '', types = [], author = '', labels = [], assignees = [] } = options || {};

  return useQuery({
    queryKey: ['/v1/panel/tickets/counts', { search, types, author, labels, assignees }],
    queryFn: async (): Promise<{ open: number; closed: number }> => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (types.length > 0) {
        types.forEach(type => params.append('type', type));
      }
      if (author) params.append('author', author);
      if (labels.length > 0) {
        labels.forEach(label => params.append('labels', label));
      }
      if (assignees.length > 0) {
        assignees.forEach(assignee => params.append('assignee', assignee));
      }

      const response = await protoFetch(TicketCountsResponseSchema, `/v1/panel/tickets/counts?${params.toString()}`);
      return { open: Number(response.open), closed: Number(response.closed) };
    },
    staleTime: 30000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  });
}

export function useBulkUpdateTickets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: {
      ticketIds: string[];
      locked?: boolean;
      addLabels?: string[];
      removeLabels?: string[];
      assignTo?: string;
    }) =>
      protoSend(
        'POST',
        '/v1/panel/tickets/bulk',
        BulkTicketUpdateRequestSchema,
        create(BulkTicketUpdateRequestSchema, request),
        BulkTicketUpdateResponseSchema,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/tickets'] });
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/tickets/counts'] });
    },
  });
}
