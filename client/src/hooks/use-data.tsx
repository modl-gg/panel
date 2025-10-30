import { useQuery, useMutation, useQueryClient, QueryClient, useQueries } from '@tanstack/react-query';
import { queryClient } from '../lib/queryClient';
import { useAuth } from './use-auth';

// Player-related hooks
export function usePlayers() {
  return useQuery({
    queryKey: ['/api/panel/players'],
    queryFn: async () => {
      const res = await fetch('/api/panel/players');
      if (!res.ok) {
        throw new Error('Failed to fetch players');
      }
      return res.json();
    }
  });
}

export function usePlayer(uuid: string) {
  return useQuery({
    queryKey: ['/api/panel/players', uuid],
    queryFn: async () => {
      const res = await fetch(`/api/panel/players/${uuid}`);
      if (!res.ok) {
        // If 404, return null - this is not an error, just no player found
        if (res.status === 404) {
          return null;
        }
        throw new Error('Failed to fetch player');
      }
      return res.json();
    },
    enabled: !!uuid, // Only run the query if we have a uuid
    // Don't cache this data for long, so new opens can see the latest data
    staleTime: 1000, // 1 second
    refetchOnWindowFocus: true, // Refetch when window gets focus
    refetchOnMount: true // Refetch when component mounts
  });
}

export function useLinkedAccounts(uuid: string) {
  return useQuery({
    queryKey: ['/api/panel/players/linked', uuid],
    queryFn: async () => {
      const res = await fetch(`/api/panel/players/${uuid}/linked`);
      if (!res.ok) {
        if (res.status === 404) {
          return { linkedAccounts: [] };
        }
        throw new Error('Failed to fetch linked accounts');
      }
      return res.json();
    },
    enabled: !!uuid,
    staleTime: 1000, // 1 second
    refetchOnWindowFocus: true,
    refetchOnMount: true
  });
}

export function useFindLinkedAccounts() {
  return useMutation({
    mutationFn: async (minecraftUuid: string) => {
      const { csrfFetch } = await import('@/utils/csrf');
      const res = await csrfFetch(`/api/panel/players/${minecraftUuid}/find-linked`, {
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
      // Invalidate linked accounts query to refresh it
      queryClient.invalidateQueries({ queryKey: ['/api/panel/players/linked', minecraftUuid] });
      // Also invalidate player data to refresh it
      queryClient.invalidateQueries({ queryKey: ['/api/panel/players', minecraftUuid] });
    }
  });
}

// Ticket-related hooks
export function useTickets(options?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  type?: string;
}) {
  const { page = 1, limit = 10, search = '', status = '', type = '' } = options || {};
  
  return useQuery({
    queryKey: ['/api/panel/tickets', { page, limit, search, status, type }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', limit.toString());
      if (search) params.append('search', search);
      if (status) params.append('status', status);
      if (type) params.append('type', type);
      
      const res = await fetch(`/api/panel/tickets?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to fetch tickets');
      }
      return res.json();
    },
    // Keep data fresh but allow some caching for better UX
    staleTime: 30000, // 30 seconds
    refetchOnMount: true,
    refetchOnWindowFocus: true
  });
}

export function useTicket(id: string) {
  return useQuery({
    queryKey: ['/api/public/tickets', id],
    queryFn: async () => {
      const res = await fetch(`/api/public/tickets/${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          return null;
        }
        throw new Error('Failed to fetch ticket');
      }
      return res.json();
    },
    enabled: !!id,
    // Disable caching to always get fresh data
    staleTime: 0,
    gcTime: 0, // This is the v5 replacement for cacheTime
    refetchOnMount: true,
    refetchOnWindowFocus: true
  });
}

export function useCreateTicket() {
  return useMutation({
    mutationFn: async (ticketData: any) => {
      const { csrfFetch } = await import('@/utils/csrf');
      const res = await csrfFetch('/api/panel/tickets', {
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
      // Invalidate tickets query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['/api/panel/tickets'] });
    }
  });
}

export function useUpdateTicket() {
  return useMutation({
    mutationFn: async ({ id, data }: { id: string, data: any }) => {
      const { csrfFetch } = await import('@/utils/csrf');
      const res = await csrfFetch(`/api/panel/tickets/${id}`, {
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
      // Update the specific ticket in the cache
      queryClient.invalidateQueries({ queryKey: ['/api/panel/tickets', data._id] });
      // Invalidate the entire list to refresh it
      queryClient.invalidateQueries({ queryKey: ['/api/panel/tickets'] });
    }
  });
}

// Public ticket hooks for player ticket page
export function useAddTicketReply() {
  return useMutation({
    mutationFn: async ({ id, reply }: { id: string, reply: any }) => {
      const { csrfFetch } = await import('@/utils/csrf');
      const res = await csrfFetch(`/api/public/tickets/${id}/replies`, {
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
      // Update the specific ticket in the cache
      queryClient.invalidateQueries({ queryKey: ['/api/public/tickets', variables.id] });
    }
  });
}

export function useSubmitTicketForm() {
  return useMutation({
    mutationFn: async ({ id, formData }: { id: string, formData: any }) => {
      const { csrfFetch } = await import('@/utils/csrf');
      const res = await csrfFetch(`/api/public/tickets/${id}/submit`, {
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
      // Update the specific ticket in the cache
      queryClient.invalidateQueries({ queryKey: ['/api/public/tickets', variables.id] });
    }
  });
}

// Appeal-related hooks
export function useAppeals() {
  return useQuery({
    queryKey: ['/api/panel/appeals'],
    queryFn: async () => {
      const res = await fetch('/api/panel/appeals');
      if (!res.ok) {
        throw new Error('Failed to fetch appeals');
      }
      return res.json();
    }
  });
}

export function useAppealsByPunishment(punishmentId: string) {
  return useQuery({
    queryKey: ['/api/panel/appeals/punishment', punishmentId],
    queryFn: async () => {
      const res = await fetch(`/api/panel/appeals/punishment/${punishmentId}`);
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
      const { csrfFetch } = await import('@/utils/csrf');
      const res = await csrfFetch('/api/panel/appeals', {
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
      // Invalidate appeals query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['/api/panel/appeals'] });
    }
  });
}

// Staff-related hooks
export function useStaff() {
  return useQuery({
    queryKey: ['/api/panel/staff'],
    queryFn: async () => {
      const res = await fetch('/api/panel/staff');
      if (!res.ok) {
        throw new Error('Failed to fetch staff');
      }
      return res.json();
    },
    staleTime: 1000 * 60, // 1 minute
  });
}

// Log-related hooks
export function useLogs() {
  return useQuery({
    queryKey: ['/api/panel/logs'],
    queryFn: async () => {
      const res = await fetch('/api/panel/logs');
      if (!res.ok) {
        throw new Error('Failed to fetch logs');
      }
      return res.json();
    }
  });
}

// Settings-related hooks
export function useSettings() {
  return useQuery({
    queryKey: ['/api/settings'],
    queryFn: async () => {
      // Check if we're on a public page (player ticket, appeals, etc.)
      const currentPath = window.location.pathname;
      const isPublicPage = currentPath.startsWith('/ticket/') || 
                          currentPath.startsWith('/appeal') || 
                          currentPath === '/' ||
                          currentPath.startsWith('/knowledgebase') ||
                          currentPath.startsWith('/article/');

      try {
        // If on public page, try public endpoint first to avoid 401 in network tab
        if (isPublicPage) {
          const publicRes = await fetch('/api/public/settings');
          
          if (publicRes.ok) {
            const publicData = await publicRes.json();
            // Return public data as direct object
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
          // For panel pages, try authenticated endpoint first
          const res = await fetch('/api/panel/settings');

          if (res.ok) {
            const responseText = await res.text();
            const data = JSON.parse(responseText);
            
            // Return the settings directly as an object
            return {
              settings: data.settings || {}
            };
          }

          // If we get a 401 (unauthorized), try the public endpoint
          if (res.status === 401) {
            const publicRes = await fetch('/api/public/settings');
            
            if (publicRes.ok) {
              const publicData = await publicRes.json();
              // Return public data as direct object
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

        // If all attempts fail, throw an error
        throw new Error('Failed to fetch settings from all available endpoints');
      } catch (error) {
        // Last resort: try the other endpoint if one failed
        try {
          const fallbackUrl = isPublicPage ? '/api/panel/settings' : '/api/public/settings';
          const fallbackRes = await fetch(fallbackUrl);
          
          if (fallbackRes.ok) {
            if (isPublicPage) {
              // Fallback to panel endpoint (though this might fail)
              const data = JSON.parse(await fallbackRes.text());
              return { settings: data.settings || {} };
            } else {
              // Fallback to public endpoint
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
          // If even fallback fails, use default values
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
        
        throw error; // Re-throw original error if fallback also failed
      }
    },
    // Modified options to improve behavior when returning to settings page
    staleTime: 0, // Consider data stale immediately - this ensures refetch when returning to the page
    refetchOnMount: 'always', // Always refetch when component mounts (returning to page)
    refetchOnWindowFocus: false, // Don't refetch on window focus to avoid overriding user edits
    gcTime: 1000 * 60 * 5, // Keep data in cache for 5 minutes
    refetchInterval: false, // Disable periodic refetching
    refetchOnReconnect: false // Disable refetch on reconnect
  });
}

// System stats hooks
export function useStats() {
  return useQuery({
    queryKey: ['/api/panel/stats'],
    queryFn: async () => {
      const res = await fetch('/api/panel/stats');
      if (!res.ok) {
        throw new Error('Failed to fetch stats');
      }
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - stats can be considered fresh for 5 minutes
    refetchOnWindowFocus: true, // Refetch when user focuses window
  });
}

// Type for client-side activity items, matching what home.tsx expects
// This should align with the Activity interface in home.tsx
interface ClientActivityAction {
  label: string;
  link?: string;
  primary?: boolean;
}

export interface ClientActivity {
  id: string | number;
  type: string; // e.g., 'new_ticket', 'new_punishment', 'mod_action' - client will map to icons
  color: string;
  title: string;
  time: string; // Formatted date string
  description: string;
  actions: ClientActivityAction[];
}


// Recent Activity Hook
export function useRecentActivity(limit: number = 20, days: number = 7) {
  return useQuery<ClientActivity[]>({
    queryKey: ['/api/panel/activity/recent', limit, days],
    queryFn: async () => {
      const res = await fetch(`/api/panel/activity/recent?limit=${limit}&days=${days}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: 'Failed to fetch recent activity and could not parse error response.' }));
        throw new Error(errorData.message || 'Failed to fetch recent activity');
      }
      return res.json();
    },
    staleTime: 1000 * 60 * 1, // 1 minute stale time
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });
}

// Billing-related hooks
export function useBillingStatus() {
  return useQuery({
    queryKey: ['/api/panel/billing/status'],
    queryFn: async () => {
      const res = await fetch('/api/panel/billing/status');
      if (!res.ok) {
        throw new Error('Failed to fetch billing status');
      }
      return res.json();
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      const { csrfFetch } = await import('@/utils/csrf');
      const res = await csrfFetch('/api/panel/billing/cancel-subscription', {
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
      // Invalidate billing status to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['/api/panel/billing/status'] });
    },
  });
}

export function useUsageData() {
  return useQuery({
    queryKey: ['/api/panel/billing/usage'],
    queryFn: async () => {
      const res = await fetch('/api/panel/billing/usage');
      if (!res.ok) {
        throw new Error('Failed to fetch usage data');
      }
      return res.json();
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useUpdateUsageBillingSettings() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ enabled }: { enabled: boolean }) => {
      // Sending usage billing update
      
      const { csrfFetch } = await import('@/utils/csrf');
      const res = await csrfFetch('/api/panel/billing/usage-billing-settings', {
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
      // Usage billing update response
      return result;
    },
    onSuccess: (data) => {
      // Update successful, invalidating queries
      // Invalidate usage data and billing status to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['/api/panel/billing/usage'] });
      queryClient.invalidateQueries({ queryKey: ['/api/panel/billing/status'] });
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
      const { csrfFetch } = await import('@/utils/csrf');
      const res = await csrfFetch('/api/panel/billing/resubscribe', {
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
      // Invalidate billing status and usage data to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['/api/panel/billing/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/panel/billing/usage'] });
    },
  });
}

// Punishment hooks
export function useApplyPunishment() {
  return useMutation({
    mutationFn: async ({ uuid, punishmentData }: { uuid: string, punishmentData: any }) => {
      const { csrfFetch } = await import('@/utils/csrf');
      const res = await csrfFetch(`/api/panel/players/${uuid}/punishments`, {
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
            // Handle permission-specific error
            errorMessage = `Permission denied: ${errorData.error || 'You do not have permission to apply this punishment type'}`;
            if (errorData.punishmentType) {
              errorMessage += ` (${errorData.punishmentType})`;
            }
          } else {
            errorMessage = errorData.error || errorData.message || errorMessage;
          }
        } catch (parseError) {
          // If JSON parsing fails, fall back to text
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
      // Invalidate player data to refresh it
      queryClient.invalidateQueries({ queryKey: ['/api/panel/players', variables.uuid] });
      // Invalidate the entire player list to refresh it
      queryClient.invalidateQueries({ queryKey: ['/api/panel/players'] });
    },
    onError: (error) => {
      console.error('Error applying punishment:', error);
    }
  });
}

export function usePanelTicket(id: string) {
  return useQuery({
    queryKey: ['/api/panel/tickets', id],
    queryFn: async () => {
      const res = await fetch(`/api/panel/tickets/${id}`);
      
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
    // Disable caching to always get fresh data
    staleTime: 0,
    gcTime: 0, // This is the v5 replacement for cacheTime
    refetchOnMount: true,
    refetchOnWindowFocus: true
  });
}

export function usePlayerTickets(uuid: string) {
  return useQuery({
    queryKey: ['/api/panel/tickets/creator', uuid],
    queryFn: async () => {
      const res = await fetch(`/api/panel/tickets/creator/${uuid}`);
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
    queryKey: ['/api/panel/tickets/player', uuid],
    queryFn: async () => {
      const res = await fetch(`/api/panel/tickets/player/${uuid}`);
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
      
      // Add appeal ticket ID if provided
      if (appealTicketId) {
        body.appealTicketId = appealTicketId;
      }

      // Convert duration to milliseconds for duration change modifications
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

      const { csrfFetch } = await import('@/utils/csrf');
      const res = await csrfFetch(`/api/panel/players/${uuid}/punishments/${punishmentId}/modifications`, {
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
      // Invalidate player data to refresh it
      queryClient.invalidateQueries({ queryKey: ['/api/panel/players', variables.uuid] });
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
      const { csrfFetch } = await import('@/utils/csrf');
      const res = await csrfFetch(`/api/panel/players/${uuid}/punishments/${punishmentId}/notes`, {
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
      // Invalidate player data to refresh it
      queryClient.invalidateQueries({ queryKey: ['/api/panel/players', variables.uuid] });
    },
    onError: (error) => {
      console.error('Error adding punishment note:', error);
    }
  });
}

// Role and Permission hooks
export function useRoles() {
  return useQuery({
    queryKey: ['/api/panel/roles'],
    queryFn: async () => {
      const res = await fetch('/api/panel/roles');
      if (!res.ok) {
        throw new Error('Failed to fetch roles');
      }
      return res.json();
    }
  });
}

export function usePermissions() {
  return useQuery({
    queryKey: ['/api/panel/roles/permissions'],
    queryFn: async () => {
      const res = await fetch('/api/panel/roles/permissions');
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
      const { csrfFetch } = await import('@/utils/csrf');
      const res = await csrfFetch('/api/panel/roles', {
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
      queryClient.invalidateQueries({ queryKey: ['/api/panel/roles'] });
    },
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...roleData }: { id: string; name: string; description: string; permissions: string[] }) => {
      const { csrfFetch } = await import('@/utils/csrf');
      const res = await csrfFetch(`/api/panel/roles/${id}`, {
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
      queryClient.invalidateQueries({ queryKey: ['/api/panel/roles'] });
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (roleId: string) => {
      const { csrfFetch } = await import('@/utils/csrf');
      const res = await csrfFetch(`/api/panel/roles/${roleId}`, {
        method: 'DELETE',
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to delete role: ${res.status} ${res.statusText}`);
      }
      
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/panel/roles'] });
    },
  });
}

// Staff Minecraft player assignment hooks
export function useAvailablePlayers() {
  return useQuery({
    queryKey: ['/api/panel/staff/available-players'],
    queryFn: async () => {
      const res = await fetch('/api/panel/staff/available-players');
      if (!res.ok) {
        throw new Error('Failed to fetch available players');
      }
      return res.json();
    },
    staleTime: 1000 * 30, // 30 seconds
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
      const { csrfFetch } = await import('@/utils/csrf');
      const res = await csrfFetch(`/api/panel/staff/${username}/minecraft-player`, {
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
      queryClient.invalidateQueries({ queryKey: ['/api/panel/staff'] });
      queryClient.invalidateQueries({ queryKey: ['/api/panel/staff/available-players'] });
    },
  });
}

// Dashboard Metrics hooks
export function useDashboardMetrics(period: string = '7d') {
  return useQuery({
    queryKey: ['/api/panel/dashboard/metrics', period],
    queryFn: async () => {
      const res = await fetch(`/api/panel/dashboard/metrics?period=${period}`);
      if (!res.ok) {
        throw new Error('Failed to fetch dashboard metrics');
      }
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  });
}

export function useRecentTickets(limit: number = 5) {
  return useQuery({
    queryKey: ['/api/panel/dashboard/recent-tickets', limit],
    queryFn: async () => {
      const res = await fetch(`/api/panel/dashboard/recent-tickets?limit=${limit}`);
      if (!res.ok) {
        throw new Error('Failed to fetch recent tickets');
      }
      return res.json();
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: true,
  });
}

export function useRecentPunishments(limit: number = 10) {
  return useQuery({
    queryKey: ['/api/panel/dashboard/recent-punishments', limit],
    queryFn: async () => {
      const res = await fetch(`/api/panel/dashboard/recent-punishments?limit=${limit}`);
      if (!res.ok) {
        throw new Error('Failed to fetch recent punishments');
      }
      return res.json();
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: true,
  });
}

// Ticket subscription hooks
export function useTicketSubscriptions() {
  return useQuery({
    queryKey: ['/api/panel/ticket-subscriptions'],
    queryFn: async () => {
      const res = await fetch('/api/panel/ticket-subscriptions');
      if (!res.ok) {
        throw new Error('Failed to fetch ticket subscriptions');
      }
      return res.json();
    },
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: true,
  });
}

export function useTicketSubscriptionUpdates(limit: number = 10) {
  return useQuery({
    queryKey: ['/api/panel/ticket-subscriptions/updates', limit],
    queryFn: async () => {
      const res = await fetch(`/api/panel/ticket-subscriptions/updates?limit=${limit}`);
      if (!res.ok) {
        throw new Error('Failed to fetch ticket subscription updates');
      }
      return res.json();
    },
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: true,
  });
}

export function useUnsubscribeFromTicket() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (ticketId: string) => {
      const { csrfFetch } = await import('@/utils/csrf');
      const res = await csrfFetch(`/api/panel/ticket-subscriptions/${ticketId}`, {
        method: 'DELETE',
      });
      
      if (!res.ok) {
        throw new Error('Failed to unsubscribe from ticket');
      }
      
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/panel/ticket-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/panel/ticket-subscription-updates'] });
    },
  });
}

export function useMarkSubscriptionUpdateAsRead() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (updateId: string) => {
      const { csrfFetch } = await import('@/utils/csrf');
      const res = await csrfFetch(`/api/panel/ticket-subscriptions/updates/${updateId}/read`, {
        method: 'POST',
      });
      
      if (!res.ok) {
        throw new Error('Failed to mark update as read');
      }
      
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/panel/ticket-subscriptions/updates'] });
    },
  });
}

// Hook to get ticket counts by category for tab badges
export function useTicketCounts(options?: {
  search?: string;
  status?: string;
}) {
  const { search = '', status = '' } = options || {};
  
  const ticketTypes = ['support', 'bug', 'player', 'chat', 'appeal', 'staff'];
  
  const queries = useQueries({
    queries: ticketTypes.map(type => ({
      queryKey: ['/api/panel/tickets/count', { search, status, type }],
      queryFn: async () => {
        const params = new URLSearchParams();
        params.append('page', '1');
        params.append('limit', '1'); // We only need the count, not the actual tickets
        if (search) params.append('search', search);
        if (status) params.append('status', status);
        params.append('type', type);
        
        const res = await fetch(`/api/panel/tickets?${params.toString()}`);
        if (!res.ok) {
          throw new Error(`Failed to fetch ticket count for ${type}`);
        }
        const data = await res.json();
        return { type, count: data.pagination?.totalTickets || 0 };
      },
      staleTime: 30000, // 30 seconds
      refetchOnMount: true,
      refetchOnWindowFocus: true
    }))
  });

  // Convert array of query results to object with counts by type
  const counts = queries.reduce((acc, query, index) => {
    const type = ticketTypes[index];
    acc[type] = query.data?.count || 0;
    return acc;
  }, {} as Record<string, number>);

  const isLoading = queries.some(query => query.isLoading);
  const isError = queries.some(query => query.isError);

  return { counts, isLoading, isError };
}

// Migration-related hooks
export function useMigrationStatus() {
  return useQuery({
    queryKey: ['/api/panel/migration/status'],
    queryFn: async () => {
      const res = await fetch('/api/panel/migration/status');
      if (!res.ok) {
        throw new Error('Failed to fetch migration status');
      }
      return res.json();
    },
    refetchInterval: (query) => {
      // Poll every 2 seconds if there's an active migration
      const data = query.state.data;
      const currentMigration = data?.currentMigration;
      const isActive = currentMigration && 
        currentMigration.status !== 'completed' && 
        currentMigration.status !== 'failed';
      
      // Also poll for a few seconds after completion to ensure UI updates
      const isRecentlyCompleted = currentMigration &&
        (currentMigration.status === 'completed' || currentMigration.status === 'failed');
      
      return (isActive || isRecentlyCompleted) ? 2000 : false;
    },
    refetchOnMount: true,
    refetchOnWindowFocus: true
  });
}

export function useStartMigration() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ migrationType }: { migrationType: string }) => {
      const { csrfFetch } = await import('@/utils/csrf');
      const res = await csrfFetch('/api/panel/migration/start', {
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
      queryClient.invalidateQueries({ queryKey: ['/api/panel/migration/status'] });
    }
  });
}

export function useCancelMigration() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      const { csrfFetch } = await import('@/utils/csrf');
      const res = await csrfFetch('/api/panel/migration/cancel', {
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
      queryClient.invalidateQueries({ queryKey: ['/api/panel/migration/status'] });
    }
  });
}