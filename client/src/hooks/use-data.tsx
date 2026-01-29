import React from 'react';
import { useQuery, useMutation, useQueryClient, QueryClient, useQueries } from '@tanstack/react-query';
import { queryClient } from '../lib/queryClient';
import { useAuth } from './use-auth';
import { getApiUrl, getCurrentDomain } from '@/lib/api';

// Helper function to make API requests with the X-Server-Domain header
async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(getApiUrl(url), {
    ...options,
    credentials: 'include',
    headers: {
      ...options.headers,
      'X-Server-Domain': getCurrentDomain(),
    },
  });
}

export function usePlayer(uuid: string) {
  return useQuery({
    queryKey: ['/v1/panel/players', uuid],
    queryFn: async () => {
      const res = await apiFetch(`/v1/panel/players/${uuid}`);
      if (!res.ok) {
        if (res.status === 404) {
          return null;
        }
        throw new Error('Failed to fetch player');
      }
      return res.json();
    },
    enabled: !!uuid,
    staleTime: 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true
  });
}

export function useLinkedAccounts(uuid: string) {
  return useQuery({
    queryKey: ['/v1/panel/players/linked', uuid],
    queryFn: async () => {
      const res = await apiFetch(`/v1/panel/players/${uuid}/linked`);
      if (!res.ok) {
        if (res.status === 404) {
          return { linkedAccounts: [] };
        }
        throw new Error('Failed to fetch linked accounts');
      }
      return res.json();
    },
    enabled: !!uuid,
    staleTime: 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true
  });
}

export function useFindLinkedAccounts() {
  return useMutation({
    mutationFn: async (minecraftUuid: string) => {
      const res = await apiFetch(`/v1/panel/players/${minecraftUuid}/find-linked`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) {
        throw new Error('Failed to trigger linked account search');
      }

      return res.json();
    },
    onSuccess: (data, minecraftUuid) => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/players/linked', minecraftUuid] });
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/players', minecraftUuid] });
    }
  });
}

export function useTickets(options?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  type?: string;
}) {
  const { page = 1, limit = 10, search = '', status = '', type = '' } = options || {};

  return useQuery({
    queryKey: ['/v1/panel/tickets', { page, limit, search, status, type }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', limit.toString());
      if (search) params.append('search', search);
      if (status) params.append('status', status);
      if (type) params.append('type', type);

      const res = await apiFetch(`/v1/panel/tickets?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to fetch tickets');
      }
      return res.json();
    },
    staleTime: 30000,
    refetchOnMount: true,
    refetchOnWindowFocus: true
  });
}

export function useTicket(id: string) {
  return useQuery({
    queryKey: ['/v1/public/tickets', id],
    queryFn: async () => {
      const res = await apiFetch(`/v1/public/tickets/${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          return null;
        }
        throw new Error('Failed to fetch ticket');
      }
      return res.json();
    },
    enabled: !!id,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true
  });
}

export function useCreateTicket() {
  return useMutation({
    mutationFn: async (ticketData: any) => {
      const res = await apiFetch('/v1/panel/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(ticketData)
      });

      if (!res.ok) {
        throw new Error('Failed to create ticket');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/tickets'] });
    }
  });
}

export function useUpdateTicket() {
  return useMutation({
    mutationFn: async ({ id, data }: { id: string, data: any }) => {
      const res = await apiFetch(`/v1/panel/tickets/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      if (!res.ok) {
        throw new Error('Failed to update ticket');
      }

      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/tickets', data._id] });
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/tickets'] });
    }
  });
}

export function useAddTicketReply() {
  return useMutation({
    mutationFn: async ({ id, reply }: { id: string, reply: any }) => {
      const res = await apiFetch(`/v1/public/tickets/${id}/replies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(reply)
      });

      if (!res.ok) {
        throw new Error('Failed to add reply');
      }

      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/v1/public/tickets', variables.id] });
    }
  });
}

export function useSubmitTicketForm() {
  return useMutation({
    mutationFn: async ({ id, formData }: { id: string, formData: any }) => {
      const res = await apiFetch(`/v1/public/tickets/${id}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        throw new Error('Failed to submit ticket form');
      }

      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/v1/public/tickets', variables.id] });
    }
  });
}

export function useAppeals() {
  return useQuery({
    queryKey: ['/v1/panel/appeals'],
    queryFn: async () => {
      const res = await apiFetch('/v1/panel/appeals');
      if (!res.ok) {
        throw new Error('Failed to fetch appeals');
      }
      return res.json();
    }
  });
}

export function useAppealsByPunishment(punishmentId: string) {
  return useQuery({
    queryKey: ['/v1/panel/appeals/punishment', punishmentId],
    queryFn: async () => {
      const res = await apiFetch(`/v1/panel/appeals/punishment/${punishmentId}`);
      if (!res.ok) {
        if (res.status === 404) {
          return [];
        }
        throw new Error('Failed to fetch appeals');
      }
      return res.json();
    },
    enabled: !!punishmentId
  });
}

export function useCreateAppeal() {
  return useMutation({
    mutationFn: async (appealData: any) => {
      const res = await apiFetch('/v1/public/appeals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(appealData)
      });

      if (!res.ok) {
        throw new Error('Failed to create appeal');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/appeals'] });
    }
  });
}

export function useStaff() {
  return useQuery({
    queryKey: ['/v1/panel/staff'],
    queryFn: async () => {
      const res = await apiFetch('/v1/panel/staff');
      if (!res.ok) {
        throw new Error('Failed to fetch staff');
      }
      return res.json();
    },
    staleTime: 1000 * 60,
  });
}

export function useLogs() {
  return useQuery({
    queryKey: ['/v1/panel/logs'],
    queryFn: async () => {
      const res = await apiFetch('/v1/panel/logs');
      if (!res.ok) {
        throw new Error('Failed to fetch logs');
      }
      return res.json();
    }
  });
}

export function usePunishmentTypes() {
  return useQuery({
    queryKey: ['/v1/panel/settings/punishment-types'],
    queryFn: async () => {
      const res = await apiFetch('/v1/panel/settings/punishment-types');
      if (!res.ok) {
        throw new Error('Failed to fetch punishment types');
      }
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ['/v1/settings'],
    queryFn: async () => {
      const currentPath = window.location.pathname;
      const isPublicPage = currentPath.startsWith('/ticket/') ||
                          currentPath.startsWith('/appeal') ||
                          currentPath.startsWith('/submit-ticket') ||
                          currentPath === '/' ||
                          currentPath.startsWith('/knowledgebase') ||
                          currentPath.startsWith('/article/');

      try {
        if (isPublicPage) {
          const publicRes = await apiFetch('/v1/public/settings');

          if (publicRes.ok) {
            const publicData = await publicRes.json();
            return {
              settings: {
                general: {
                  serverDisplayName: publicData.serverDisplayName,
                  panelIconUrl: publicData.panelIconUrl,
                  homepageIconUrl: publicData.homepageIconUrl
                },
                ticketForms: publicData.ticketForms || {}
              }
            };
          }
        } else {
          const res = await apiFetch('/v1/panel/settings/general');

          if (res.ok) {
            const data = await res.json();

            return {
              settings: data
            };
          }

          if (res.status === 401) {
            const publicRes = await apiFetch('/v1/public/settings');

            if (publicRes.ok) {
              const publicData = await publicRes.json();
              return {
                settings: {
                  general: {
                    serverDisplayName: publicData.serverDisplayName,
                    panelIconUrl: publicData.panelIconUrl,
                    homepageIconUrl: publicData.homepageIconUrl
                  },
                  ticketForms: publicData.ticketForms || {}
                }
              };
            }
          }
        }

        throw new Error('Failed to fetch settings from all available endpoints');
      } catch (error) {
        try {
          const fallbackUrl = isPublicPage ? '/v1/panel/settings/general' : '/v1/public/settings';
          const fallbackRes = await apiFetch(fallbackUrl);

          if (fallbackRes.ok) {
            if (isPublicPage) {
              const data = JSON.parse(await fallbackRes.text());
              return { settings: data.settings || {} };
            } else {
              const publicData = await fallbackRes.json();
              return {
                settings: {
                  general: {
                    serverDisplayName: publicData.serverDisplayName,
                    panelIconUrl: publicData.panelIconUrl,
                    homepageIconUrl: publicData.homepageIconUrl
                  },
                  ticketForms: publicData.ticketForms || {}
                }
              };
            }
          }
        } catch (fallbackError) {
          return {
            settings: {
              general: {
                serverDisplayName: 'modl',
                panelIconUrl: null,
                homepageIconUrl: null
              },
              ticketForms: {}
            }
          };
        }

        throw error;
      }
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    gcTime: 1000 * 60 * 5,
    refetchInterval: false,
    refetchOnReconnect: false
  });
}

export function useTicketFormSettings() {
  return useQuery({
    queryKey: ['/v1/panel/settings/ticket-forms'],
    queryFn: async () => {
      const res = await apiFetch('/v1/panel/settings/ticket-forms');
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          return null;
        }
        throw new Error('Failed to fetch ticket form settings');
      }
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false
  });
}

export function useQuickResponses() {
  return useQuery({
    queryKey: ['/v1/panel/settings/quick-responses'],
    queryFn: async () => {
      const res = await apiFetch('/v1/panel/settings/quick-responses');
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          return null;
        }
        throw new Error('Failed to fetch quick responses');
      }
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false
  });
}

export function useStats() {
  return useQuery({
    queryKey: ['/v1/panel/stats'],
    queryFn: async () => {
      const res = await apiFetch('/v1/panel/stats');
      if (!res.ok) {
        throw new Error('Failed to fetch stats');
      }
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

interface ClientActivityAction {
  label: string;
  link?: string;
  primary?: boolean;
}

export interface ClientActivity {
  id: string | number;
  type: string;
  color: string;
  title: string;
  time: string;
  description: string;
  actions: ClientActivityAction[];
}

export function useRecentActivity(limit: number = 20, days: number = 7) {
  return useQuery<ClientActivity[]>({
    queryKey: ['/v1/panel/activity/recent', limit, days],
    queryFn: async () => {
      const res = await apiFetch(`/v1/panel/dashboard/activity/recent?limit=${limit}&days=${days}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: 'Failed to fetch recent activity and could not parse error response.' }));
        throw new Error(errorData.message || 'Failed to fetch recent activity');
      }
      return res.json();
    },
    staleTime: 1000 * 60 * 1,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });
}

export function useBillingStatus() {
  return useQuery({
    queryKey: ['/v1/panel/billing/status'],
    queryFn: async () => {
      const res = await apiFetch('/v1/panel/billing/status');
      if (!res.ok) {
        throw new Error('Failed to fetch billing status');
      }
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/v1/panel/billing/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Failed to cancel subscription');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/billing/status'] });
    },
  });
}

export function useUsageData() {
  return useQuery({
    queryKey: ['/v1/panel/billing/usage'],
    queryFn: async () => {
      const res = await apiFetch('/v1/panel/billing/usage');
      if (!res.ok) {
        throw new Error('Failed to fetch usage data');
      }
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useUpdateUsageBillingSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ enabled }: { enabled: boolean }) => {
      const res = await apiFetch('/v1/panel/billing/usage-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ enabled })
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('[FRONTEND] Usage billing update failed:', errorText);
        throw new Error(errorText || 'Failed to update usage billing settings');
      }

      const result = await res.json();
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/billing/usage'] });
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/billing/status'] });
    },
    onError: (error) => {
      console.error('[FRONTEND] Usage billing update mutation error:', error);
    }
  });
}

export function useResubscribe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/v1/panel/billing/resubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Failed to resubscribe');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/billing/status'] });
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/billing/usage'] });
    },
  });
}

export function useApplyPunishment() {
  return useMutation({
    mutationFn: async ({ uuid, punishmentData }: { uuid: string, punishmentData: any }) => {
      const res = await apiFetch(`/v1/panel/players/${uuid}/punishments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(punishmentData)
      });

      if (!res.ok) {
        let errorMessage = `Failed to apply punishment: ${res.status} ${res.statusText}`;

        try {
          const errorData = await res.json();
          if (res.status === 403) {
            errorMessage = `Permission denied: ${errorData.error || 'You do not have permission to apply this punishment type'}`;
            if (errorData.punishmentType) {
              errorMessage += ` (${errorData.punishmentType})`;
            }
          } else {
            errorMessage = errorData.error || errorData.message || errorMessage;
          }
        } catch (parseError) {
          const errorText = await res.text();
          console.error('Punishment API error:', errorText);
          if (res.status === 403) {
            errorMessage = 'Permission denied: You do not have permission to apply this punishment type';
          } else {
            errorMessage = errorText || errorMessage;
          }
        }

        throw new Error(errorMessage);
      }

      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/players', variables.uuid] });
    },
    onError: (error) => {
      console.error('Error applying punishment:', error);
    }
  });
}

export function usePanelTicket(id: string) {
  return useQuery({
    queryKey: ['/v1/panel/tickets', id],
    queryFn: async () => {
      const res = await apiFetch(`/v1/panel/tickets/${id}`);

      if (!res.ok) {
        const errorText = await res.text();

        if (res.status === 404) {
          return null;
        }
        throw new Error(`Failed to fetch ticket: ${res.status} ${errorText}`);
      }

      const data = await res.json();

      return data;
    },
    enabled: !!id,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true
  });
}

export function usePlayerTickets(uuid: string) {
  return useQuery({
    queryKey: ['/v1/panel/tickets/creator', uuid],
    queryFn: async () => {
      const res = await apiFetch(`/v1/panel/tickets/creator/${uuid}`);
      if (!res.ok) {
        if (res.status === 404) {
          return [];
        }
        throw new Error('Failed to fetch player tickets');
      }
      return res.json();
    },
    enabled: !!uuid,
    staleTime: 0,
    refetchOnMount: true,
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
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true
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
      const body: any = {
        type: modificationType,
        issuerName: user?.username || 'Unknown User',
        reason: reason
      };

      if (appealTicketId) {
        body.appealTicketId = appealTicketId;
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

        const durationMs = newDuration.value * (multipliers[newDuration.unit as keyof typeof multipliers] || 0);
        body.effectiveDuration = durationMs;
      }

      const res = await apiFetch(`/v1/panel/players/${uuid}/punishments/${punishmentId}/modifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Modify punishment API error:', errorText);
        throw new Error(`Failed to modify punishment: ${res.status} ${res.statusText}`);
      }

      return res.json();
    },
    onSuccess: (data, variables) => {
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
      const res = await apiFetch(`/v1/panel/players/${uuid}/punishments/${punishmentId}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: noteText,
          issuerName: user?.username || 'Unknown User'
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Add punishment note API error:', errorText);
        throw new Error(`Failed to add punishment note: ${res.status} ${res.statusText}`);
      }

      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/players', variables.uuid] });
    },
    onError: (error) => {
      console.error('Error adding punishment note:', error);
    }
  });
}

export function useRoles() {
  return useQuery({
    queryKey: ['/v1/panel/roles'],
    queryFn: async () => {
      const res = await apiFetch('/v1/panel/roles');
      if (!res.ok) {
        throw new Error('Failed to fetch roles');
      }
      return res.json();
    }
  });
}

export function usePermissions() {
  return useQuery({
    queryKey: ['/v1/panel/roles/permissions'],
    queryFn: async () => {
      const res = await apiFetch('/v1/panel/roles/permissions');
      if (!res.ok) {
        throw new Error('Failed to fetch permissions');
      }
      return res.json();
    }
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (roleData: { name: string; description: string; permissions: string[] }) => {
      const res = await apiFetch('/v1/panel/roles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(roleData),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to create role: ${res.status} ${res.statusText}`);
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/roles'] });
    },
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...roleData }: { id: string; name: string; description: string; permissions: string[] }) => {
      const res = await apiFetch(`/v1/panel/roles/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(roleData),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to update role: ${res.status} ${res.statusText}`);
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/roles'] });
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (roleId: string) => {
      const res = await apiFetch(`/v1/panel/roles/${roleId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to delete role: ${res.status} ${res.statusText}`);
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/roles'] });
    },
  });
}

export function useAvailablePlayers() {
  return useQuery({
    queryKey: ['/v1/panel/staff/available-players'],
    queryFn: async () => {
      const res = await apiFetch('/v1/panel/staff/available-players');
      if (!res.ok) {
        throw new Error('Failed to fetch available players');
      }
      return res.json();
    },
    staleTime: 1000 * 30,
  });
}

export function useAssignMinecraftPlayer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      username,
      minecraftUuid,
      minecraftUsername
    }: {
      username: string;
      minecraftUuid?: string;
      minecraftUsername?: string;
    }) => {
      const res = await apiFetch(`/v1/panel/staff/${username}/minecraft-player`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ minecraftUuid, minecraftUsername }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to assign Minecraft player: ${res.status} ${res.statusText}`);
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/staff'] });
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/staff/available-players'] });
    },
  });
}

export function useDashboardMetrics(period: string = '7d') {
  return useQuery({
    queryKey: ['/v1/panel/dashboard/metrics', period],
    queryFn: async () => {
      const res = await apiFetch(`/v1/panel/dashboard/metrics?period=${period}`);
      if (!res.ok) {
        throw new Error('Failed to fetch dashboard metrics');
      }
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useRecentTickets(limit: number = 5) {
  return useQuery({
    queryKey: ['/v1/panel/dashboard/recent-tickets', limit],
    queryFn: async () => {
      const res = await apiFetch(`/v1/panel/dashboard/recent-tickets?limit=${limit}`);
      if (!res.ok) {
        throw new Error('Failed to fetch recent tickets');
      }
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useRecentPunishments(limit: number = 10) {
  return useQuery({
    queryKey: ['/v1/panel/dashboard/recent-punishments', limit],
    queryFn: async () => {
      const res = await apiFetch(`/v1/panel/dashboard/recent-punishments?limit=${limit}`);
      if (!res.ok) {
        throw new Error('Failed to fetch recent punishments');
      }
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useTicketSubscriptions() {
  return useQuery({
    queryKey: ['/v1/panel/ticket-subscriptions'],
    queryFn: async () => {
      const res = await apiFetch('/v1/panel/ticket-subscriptions');
      if (!res.ok) {
        throw new Error('Failed to fetch ticket subscriptions');
      }
      return res.json();
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useTicketSubscriptionUpdates(limit: number = 10) {
  return useQuery({
    queryKey: ['/v1/panel/ticket-subscriptions/updates', limit],
    queryFn: async () => {
      const res = await apiFetch(`/v1/panel/ticket-subscriptions/updates?limit=${limit}`);
      if (!res.ok) {
        throw new Error('Failed to fetch ticket subscription updates');
      }
      return res.json();
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useUnsubscribeFromTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ticketId: string) => {
      const res = await apiFetch(`/v1/panel/ticket-subscriptions/${ticketId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to unsubscribe from ticket');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/ticket-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/ticket-subscriptions/updates'] });
    },
  });
}

export function useMarkSubscriptionUpdateAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updateId: string) => {
      const res = await apiFetch(`/v1/panel/ticket-subscriptions/updates/${updateId}/read`, {
        method: 'POST',
      });

      if (!res.ok) {
        throw new Error('Failed to mark update as read');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/ticket-subscriptions/updates'] });
    },
  });
}

export function useTicketCounts(options?: {
  search?: string;
  status?: string;
}) {
  const { search = '', status = '' } = options || {};

  const ticketTypes = ['support', 'bug', 'player', 'chat', 'appeal', 'staff'];

  const queries = useQueries({
    queries: ticketTypes.map(type => ({
      queryKey: ['/v1/panel/tickets/count', { search, status, type }],
      queryFn: async () => {
        const params = new URLSearchParams();
        params.append('page', '1');
        params.append('limit', '1');
        if (search) params.append('search', search);
        if (status) params.append('status', status);
        params.append('type', type);

        const res = await apiFetch(`/v1/panel/tickets?${params.toString()}`);
        if (!res.ok) {
          throw new Error(`Failed to fetch ticket count for ${type}`);
        }
        const data = await res.json();
        return { type, count: data.pagination?.totalTickets || 0 };
      },
      staleTime: 30000,
      refetchOnMount: true,
      refetchOnWindowFocus: true
    }))
  });

  const counts = queries.reduce((acc, query, index) => {
    const type = ticketTypes[index];
    acc[type] = query.data?.count || 0;
    return acc;
  }, {} as Record<string, number>);

  const isLoading = queries.some(query => query.isLoading);
  const isError = queries.some(query => query.isError);

  return { counts, isLoading, isError };
}

export function usePlayerSearch(searchQuery: string, debounceMs: number = 300) {
  const [debouncedQuery, setDebouncedQuery] = React.useState(searchQuery);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [searchQuery, debounceMs]);

  return useQuery({
    queryKey: ['player-search', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.trim().length < 2) {
        return [];
      }
      const res = await apiFetch(`/v1/panel/players?search=${encodeURIComponent(debouncedQuery.trim())}`);
      if (!res.ok) {
        throw new Error('Failed to search players');
      }
      return res.json();
    },
    enabled: debouncedQuery.trim().length >= 2,
    staleTime: 1000 * 60,
  });
}

export function useMigrationStatus() {
  return useQuery({
    queryKey: ['/v1/panel/migration/status'],
    queryFn: async () => {
      const res = await apiFetch('/v1/panel/migration/status');
      if (!res.ok) {
        throw new Error('Failed to fetch migration status');
      }
      return res.json();
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      const currentMigration = data?.currentMigration;
      const isActive = currentMigration &&
        currentMigration.status !== 'completed' &&
        currentMigration.status !== 'failed';

      return isActive ? 5000 : 30000;
    },
    refetchOnMount: true,
    refetchOnWindowFocus: true
  });
}

export function useStartMigration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ migrationType }: { migrationType: string }) => {
      const res = await apiFetch('/v1/panel/migration/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ migrationType })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to start migration');
      }

      return res.json();
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
      const res = await apiFetch('/v1/panel/migration/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to cancel migration');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/migration/status'] });
    }
  });
}
