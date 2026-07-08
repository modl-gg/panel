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

const mapPlayerDetail = (player: PlayerDetailResponse) => ({
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
      return { linkedAccounts: response?.linkedAccounts ?? [] };
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
      return response.items;
    },
    enabled: debouncedQuery.trim().length >= 2,
    staleTime: 1000 * 60,
  });
}
