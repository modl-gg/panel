import React from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '../../lib/queryClient';
import { protoFetch, protoFetchOrNull } from '@/lib/proto-fetch';
import { toNum } from '@/lib/proto-ui';
import { mapPunishment } from '@/lib/punishment-mapping';
import {
  PlayerDetailResponseSchema,
  PanelLinkedAccountsResponseSchema,
  PanelFindAndLinkAccountsResponseSchema,
  PlayerReplaysResponseSchema,
  PlayerSearchResultsResponseSchema,
  type PlayerDetailResponse,
  type PlayerReplayResponse,
} from '@modl-gg/proto/modl/v1/player_pb.ts';

export interface PlayerReplaySummary {
  replayId: string;
  targetUuid: string;
  targetName: string;
  mcVersion: string;
  fileSize: number;
  createdAt: string;
  status: string;
  replayUrl: string;
  matchSource: string;
}

// Remap PlayerDetailResponse to the legacy player object the player pages consume. `latestIpData`
// is renamed to `latestIPData` (the casing every consumer reads), and `data` stays a plain object
// so the existing `player.data[key]` lookups keep working. The return is intentionally `any`: the
// pages read this object loosely (the legacy `res.json()` contract), so a precise type would only
// surface pre-existing loose-access patterns as new errors.
const mapPlayerDetail = (player: PlayerDetailResponse): any => ({
  ...player,
  latestIPData: player.latestIpData,
  punishments: player.punishments.map(mapPunishment),
});

const mapReplay = (replay: PlayerReplayResponse): PlayerReplaySummary => ({
  replayId: replay.replayId,
  targetUuid: replay.targetUuid,
  targetName: replay.targetName,
  mcVersion: replay.mcVersion,
  fileSize: toNum(replay.fileSize),
  createdAt: new Date(toNum(replay.createdAt)).toISOString(),
  status: replay.status,
  replayUrl: replay.replayUrl,
  matchSource: replay.matchSource,
});

export function usePlayer(uuid: string) {
  return useQuery({
    queryKey: ['/v1/panel/players', uuid],
    queryFn: async () => {
      const response = await protoFetchOrNull(PlayerDetailResponseSchema, `/v1/panel/players/${uuid}`);
      return response ? mapPlayerDetail(response) : null;
    },
    enabled: !!uuid,
    staleTime: 30_000,
    refetchOnWindowFocus: true
  });
}

export function useLinkedAccounts(uuid: string) {
  return useQuery({
    queryKey: ['/v1/panel/players/linked', uuid],
    queryFn: async () => {
      const response = await protoFetchOrNull(
        PanelLinkedAccountsResponseSchema,
        `/v1/panel/players/${uuid}/linked`,
      );
      // Loose return: the page also reads legacy bookkeeping fields (searchStatus, etc.) that the
      // proto response no longer carries, so a precise type would only add new errors.
      return { linkedAccounts: response?.linkedAccounts ?? [] } as any;
    },
    enabled: !!uuid,
    staleTime: 30_000,
    refetchOnWindowFocus: true
  });
}

export function useFindLinkedAccounts() {
  return useMutation({
    mutationFn: (minecraftUuid: string) =>
      protoFetch(
        PanelFindAndLinkAccountsResponseSchema,
        `/v1/panel/players/${minecraftUuid}/find-linked`,
        { method: 'POST' },
      ),
    onSuccess: (_data, minecraftUuid) => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/players/linked', minecraftUuid] });
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/players', minecraftUuid] });
    }
  });
}

export function usePlayerReplays(uuid: string) {
  return useQuery<PlayerReplaySummary[]>({
    queryKey: ['/v1/panel/players', uuid, 'replays'],
    queryFn: async () => {
      const response = await protoFetchOrNull(PlayerReplaysResponseSchema, `/v1/panel/players/${uuid}/replays`);
      return response ? response.items.map(mapReplay) : [];
    },
    enabled: !!uuid,
    staleTime: 30000,
    refetchOnWindowFocus: true
  });
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
      const response = await protoFetch(
        PlayerSearchResultsResponseSchema,
        `/v1/panel/players?search=${encodeURIComponent(debouncedQuery.trim())}`,
      );
      // Loose array: some consumers read `player.minecraftUuid`/`player.data`, which the search
      // result message does not expose, so keep the legacy untyped contract.
      return response.items as any[];
    },
    enabled: debouncedQuery.trim().length >= 2,
    staleTime: 1000 * 60,
  });
}
