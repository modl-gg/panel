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
  type TicketChatMessage,
  TicketCountsResponseSchema,
  CreateTicketRequestSchema,
  CreateTicketResponseSchema,
  UpdateTicketRequestSchema,
  AddReplyRequestSchema,
  AddNoteRequestSchema,
  AddTagRequestSchema,
  TicketTagsResponseSchema,
  AddTicketReplyResponseSchema,
  SubmitTicketFormRequestSchema,
  SubmitPublicTicketResponseSchema,
  BulkTicketUpdateRequestSchema,
  BulkTicketUpdateResponseSchema,
  PublicTicketResponseSchema,
  type PublicTicketResponse,
  type PublicTicketReply,
  type PublicTicketNote,
} from '@modl-gg/proto/modl/v1/ticket_pb.ts';

import { requestPublicVerification, verifyPublicCode, withPublicAuthToken } from './public-verification';

const READ_OPTS = { ignoreUnknownFields: true } as const;

export { setCookie, getCookie, publicAuthTokenKey } from './public-verification';

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

function mapChatMessage(message: TicketChatMessage) {
  return { content: message.content, sender: message.sender, timestamp: millisToNumber(message.timestamp) };
}

function readCreatorEmail(data: JsonObject | undefined): string | undefined {
  const raw = data?.creatorEmail ?? data?.contactEmail;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;
}

function mapTicketResponse(ticket: TicketResponse) {
  return {
    ...ticket,
    _id: ticket.id,
    date: millisToNumber(ticket.date),
    creatorEmail: readCreatorEmail(ticket.data),
    messages: ticket.messages.map(mapReply),
    notes: ticket.notes.map(mapNote),
    chatMessages: ticket.chatMessages.map(mapChatMessage),
  };
}

function mapListItem(item: TicketListItemResponse) {
  return {
    ...item,
    date: millisToNumber(item.date),
    lastReply: item.lastReply ? mapReply(item.lastReply) : undefined,
  };
}

function mapPaginatedTickets(response: PaginatedTicketsResponse) {
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

function mapPublicTicketResponse(ticket: PublicTicketResponse) {
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
      const res = await apiFetch(withPublicAuthToken(`/v1/public/tickets/${id}`, 'ticket', id));
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

interface TicketReplyInput {
  name?: string;
  content?: string;
  type?: string;
  staff?: boolean;
  avatar?: string;
  attachments?: unknown;
  action?: string;
  creatorIdentifier?: string;
}

interface TicketNoteInput {
  text?: string;
  issuerName?: string;
  issuerAvatar?: string;
}

interface UpdateTicketInput {
  status?: string;
  locked?: boolean;
  hidden?: boolean;
  tags?: string[];
  assignedTo?: string[];
  data?: JsonObject;
  newReply?: TicketReplyInput;
  newNote?: TicketNoteInput;
}

interface SubmitTicketFormInput {
  subject?: string;
  creatorEmail?: string;
  formData?: JsonObject;
  attachments?: unknown;
  creatorIdentifier?: string;
  fieldLabels?: { [key: string]: string };
}

type PlayerTicketRecord = { created?: string | number | Date | null } & Record<string, unknown>;

export function useUpdateTicket() {
  return useMutation({
    mutationFn: async ({ id, data }: { id: string, data: UpdateTicketInput }) => {
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

function invalidateTicketTags(id: string) {
  queryClient.invalidateQueries({ queryKey: ['/v1/panel/tickets', id] });
  queryClient.invalidateQueries({ queryKey: ['/v1/panel/tickets'] });
}

export function useAddTicketTag() {
  return useMutation({
    mutationFn: async ({ id, tag }: { id: string, tag: string }) => {
      const response = await protoSend(
        'POST',
        `/v1/panel/tickets/${id}/tags`,
        AddTagRequestSchema,
        create(AddTagRequestSchema, { tag }),
        TicketTagsResponseSchema,
      );
      return response.tags;
    },
    onSuccess: (_tags, { id }) => invalidateTicketTags(id),
  });
}

export function useRemoveTicketTag() {
  return useMutation({
    mutationFn: async ({ id, tag }: { id: string, tag: string }) => {
      const response = await protoFetch(
        TicketTagsResponseSchema,
        `/v1/panel/tickets/${id}/tags/${encodeURIComponent(tag)}`,
        { method: 'DELETE' },
      );
      return response.tags;
    },
    onSuccess: (_tags, { id }) => invalidateTicketTags(id),
  });
}

export function useAddTicketReply() {
  return useMutation({
    mutationFn: ({ id, reply }: { id: string, reply: TicketReplyInput }) => {
      const url = withPublicAuthToken(`/v1/public/tickets/${id}/replies`, 'ticket', id);

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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/v1/public/tickets', variables.id] });
    }
  });
}

export function useSubmitTicketForm() {
  return useMutation({
    mutationFn: async ({ id, formData }: { id: string, formData: SubmitTicketFormInput }) => {
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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/v1/public/tickets', variables.id] });
    }
  });
}

export function useRequestTicketVerification() {
  return useMutation({
    mutationFn: (ticketId: string) => requestPublicVerification(`/v1/public/tickets/${ticketId}`)
  });
}

export function useVerifyTicketCode() {
  return useMutation({
    mutationFn: ({ ticketId, code }: { ticketId: string, code: string }) =>
      verifyPublicCode(`/v1/public/tickets/${ticketId}`, code)
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
      const data = await res.json();
      const items = Array.isArray(data) ? data : [];
      return items.map((ticket: PlayerTicketRecord) => {
        const createdDate = ticket.created ? new Date(ticket.created) : null;
        const created = createdDate && !isNaN(createdDate.getTime()) ? createdDate.toISOString() : null;
        return { ...ticket, created };
      });
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
