import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { protoFetch } from '@/lib/proto-fetch';
import {
  SubscriptionUpdatesResponseSchema,
  type SubscriptionUpdateResponse,
  DeleteTicketSubscriptionResponseSchema,
  MarkSubscriptionUpdateReadResponseSchema,
  MarkTicketSubscriptionReadResponseSchema,
} from '@modl-gg/proto/modl/v1/ticket_pb.ts';

// Consumers render the bare updates array and feed replyAt through formatTimeAgo
// (which calls `new Date(...)`). The legacy JSON delivered replyAt as a Date string,
// while proto decodes int64 epoch millis to bigint — convert it back to an ISO string.
function mapUpdate(update: SubscriptionUpdateResponse) {
  return { ...update, replyAt: new Date(Number(update.replyAt)).toISOString() };
}

export function useTicketSubscriptionUpdates(limit: number = 10) {
  return useQuery({
    queryKey: ['/v1/panel/ticket-subscriptions/updates', limit],
    queryFn: async () => {
      const response = await protoFetch(
        SubscriptionUpdatesResponseSchema,
        `/v1/panel/ticket-subscriptions/updates?limit=${limit}`,
      );
      return response.updates.map(mapUpdate);
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useUnsubscribeFromTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ticketId: string): Promise<any> =>
      protoFetch(
        DeleteTicketSubscriptionResponseSchema,
        `/v1/panel/ticket-subscriptions/${ticketId}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/ticket-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/ticket-subscriptions/updates'] });
    },
  });
}

export function useMarkSubscriptionUpdateAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updateId: string): Promise<any> =>
      protoFetch(
        MarkSubscriptionUpdateReadResponseSchema,
        `/v1/panel/ticket-subscriptions/updates/${encodeURIComponent(updateId)}/read`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/ticket-subscriptions/updates'] });
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/ticket-subscriptions/assigned-updates'] });
    },
  });
}

export function useMarkTicketAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ticketId: string): Promise<any> =>
      protoFetch(
        MarkTicketSubscriptionReadResponseSchema,
        `/v1/panel/ticket-subscriptions/tickets/${encodeURIComponent(ticketId)}/read`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/ticket-subscriptions/updates'] });
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/ticket-subscriptions/assigned-updates'] });
    },
  });
}

export function useAssignedTicketUpdates(limit: number = 10) {
  return useQuery({
    queryKey: ['/v1/panel/ticket-subscriptions/assigned-updates', limit],
    queryFn: async () => {
      const response = await protoFetch(
        SubscriptionUpdatesResponseSchema,
        `/v1/panel/ticket-subscriptions/assigned-updates?limit=${limit}`,
      );
      return response.updates.map(mapUpdate);
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
}
