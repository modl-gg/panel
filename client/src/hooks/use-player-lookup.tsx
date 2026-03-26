import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export function extractPlayerIdentifier(playerText: string): string {
  if (!playerText) return '';
  
  const cleanText = playerText.replace(/\s*\([^)]*\).*$/, '').trim();

  const uuidPattern = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
  if (uuidPattern.test(cleanText)) {
    return cleanText;
  }


  return cleanText;
}

interface PlayerLookupResultItem {
  uuid?: string;
  minecraftUuid?: string;
  username?: string;
}

function selectBestPlayerMatch(players: PlayerLookupResultItem[], identifier: string): PlayerLookupResultItem | null {
  if (!players || players.length === 0) {
    return null;
  }

  const normalizedIdentifier = identifier.trim().toLowerCase();
  const exactMatch = players.find((player) =>
    (player.username || '').trim().toLowerCase() === normalizedIdentifier
  );

  return exactMatch || players[0];
}

export function usePlayerLookup(identifier: string) {
  return useQuery({
    queryKey: ['player-lookup', identifier],
    queryFn: async () => {
      if (!identifier) throw new Error('No identifier provided');
      
      const uuidPattern = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
      if (uuidPattern.test(identifier)) {
        return { uuid: identifier, username: identifier };
      }


      const res = await apiFetch(`/v1/panel/players?search=${encodeURIComponent(identifier)}`);
      if (!res.ok) {
        throw new Error('Player not found');
      }
      
      const players = await res.json();
      if (!players || players.length === 0) {
        throw new Error('Player not found');
      }

      const player = selectBestPlayerMatch(players, identifier);
      if (!player) {
        throw new Error('Player not found');
      }

      const uuid = player.uuid || player.minecraftUuid;
      if (!uuid) {
        throw new Error('Player lookup response missing UUID');
      }

      return { 
        uuid,
        username: player.username || identifier
      };
    },
    enabled: !!identifier,
    staleTime: 1000 * 60 * 5,
    retry: false
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
    staleTime: 1000 * 60 * 5,
    retry: false
  });
}
