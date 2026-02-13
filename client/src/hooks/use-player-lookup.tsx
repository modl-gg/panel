import { useQuery } from '@tanstack/react-query';
import { getApiUrl, getCurrentDomain } from '@/lib/api';

async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const fullUrl = getApiUrl(url);
  return fetch(fullUrl, {
    ...options,
    credentials: "include",
    headers: {
      ...options.headers,
      "X-Server-Domain": getCurrentDomain(),
    },
  });
}

// Helper function to extract UUID from username or return UUID if already a UUID
export function extractPlayerIdentifier(playerText: string): string {
  if (!playerText) return '';
  
  // Clean up the text by removing status info in parentheses
  const cleanText = playerText.replace(/\s*\([^)]*\).*$/, '').trim();
  
  // Check if it's already a UUID (36 chars with hyphens or 32 chars without)
  const uuidPattern = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
  if (uuidPattern.test(cleanText)) {
    return cleanText;
  }
  
  // Otherwise, treat it as a username
  return cleanText;
}

// Hook to resolve a username to a player UUID
export function usePlayerLookup(identifier: string) {
  return useQuery({
    queryKey: ['player-lookup', identifier],
    queryFn: async () => {
      if (!identifier) throw new Error('No identifier provided');
      
      // If it's already a UUID, return it directly
      const uuidPattern = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
      if (uuidPattern.test(identifier)) {
        return { uuid: identifier, username: identifier };
      }
      
      // Search by username
      const res = await apiFetch(`/v1/panel/players?search=${encodeURIComponent(identifier)}`);
      if (!res.ok) {
        throw new Error('Player not found');
      }
      
      const players = await res.json();
      if (!players || players.length === 0) {
        throw new Error('Player not found');
      }
      
      // Return the first match
      const player = players[0];
      return { 
        uuid: player.uuid || player.minecraftUuid, 
        username: player.username 
      };
    },
    enabled: !!identifier,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: false // Don't retry failed lookups
  });
}

interface PunishmentLookupResult {
  playerUuid: string;
  playerUsername: string;
  punishment: {
    id: string;
    type: string;
    reason: string;
    severity?: string;
    status?: string;
    issued: string;
    expiry?: string;
    active: boolean;
  };
}

// Hook to lookup punishment by ID and get the player who has it
export function usePunishmentLookup(punishmentId: string) {
  return useQuery({
    queryKey: ['punishment-lookup', punishmentId],
    queryFn: async (): Promise<PunishmentLookupResult> => {
      if (!punishmentId) throw new Error('No punishment ID provided');

      const res = await apiFetch(`/v1/panel/players/punishments/${punishmentId}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Punishment not found');
        }
        throw new Error('Failed to lookup punishment');
      }
      const data = await res.json();
      // Transform flat PunishmentResponse into the expected shape
      return {
        playerUuid: data.playerUuid,
        playerUsername: data.playerUsername,
        punishment: {
          id: data.id,
          type: data.type,
          reason: data.reason,
          severity: data.severity,
          status: data.status,
          issued: data.issued,
          expiry: data.expires,
          active: data.active,
        },
      };
    },
    enabled: !!punishmentId && punishmentId.length > 0,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: false // Don't retry failed lookups
  });
}