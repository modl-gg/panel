import { Loader2, Play, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { usePlayerReplays } from '@/hooks/use-data';
import { formatDateWithTime } from '@/utils/date-utils';
import { formatFileSize } from '@/utils/file-utils';

interface PlayerReplaysListProps {
  playerId: string;
}

const isRawReplayId = (replayReference: string) => (
  !replayReference.includes('://')
  && !replayReference.includes('/')
  && !replayReference.includes('?')
  && !replayReference.includes('#')
);

const getReplayIdFromReference = (replayUrl?: string) => {
  const replayReference = replayUrl?.trim();
  if (!replayReference) {
    return '';
  }

  if (isRawReplayId(replayReference)) {
    return replayReference;
  }

  try {
    const parsedReplayUrl = new URL(replayReference, window.location.origin);
    return parsedReplayUrl.searchParams.get('id') || '';
  } catch {
    return '';
  }
};

const getReplayId = (replay: { replayId?: string; replayUrl?: string; matchSource?: string }) => {
  if (replay.matchSource === 'TICKET_FALLBACK') {
    return getReplayIdFromReference(replay.replayUrl) || replay.replayId || '';
  }

  return replay.replayId || getReplayIdFromReference(replay.replayUrl);
};

const PlayerReplaysList = ({ playerId }: PlayerReplaysListProps) => {
  const { t } = useTranslation();
  const { data: replays, isLoading, error } = usePlayerReplays(playerId);

  if (isLoading) {
    return (
      <div className="bg-muted/30 p-3 rounded-lg flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        <span className="text-sm">{t('player.loadingReplays')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 p-3 rounded-lg flex items-center gap-2 text-destructive">
        <TriangleAlert className="h-4 w-4" />
        <span className="text-sm">{t('player.replaysLoadFailed')}</span>
      </div>
    );
  }

  if (!replays || replays.length === 0) {
    return (
      <div className="bg-muted/30 p-3 rounded-lg">
        <p className="text-sm text-muted-foreground">{t('player.noReplays')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {replays.map((replay) => {
        const replayId = getReplayId(replay);
        const canOpenReplay = Boolean(replayId)
          && (replay.matchSource === 'TICKET_FALLBACK' || replay.status === 'COMPLETE');

        return (
          <div key={replay.replayId || replay.replayUrl} className="bg-muted/30 p-3 rounded-lg">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <Play className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium text-sm truncate">
                    {replay.targetName || replay.targetUuid || t('player.unknownPlayer')}
                  </span>
                  {replay.status && (
                    <Badge variant="outline" className="text-xs">
                      {replay.status}
                    </Badge>
                  )}
                  {replay.matchSource && (
                    <Badge variant="secondary" className="text-xs">
                      {replay.matchSource}
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{t('player.replayCreated')}: {replay.createdAt ? formatDateWithTime(replay.createdAt) : t('common.unknown')}</span>
                  <span>{t('player.replayMcVersion')}: {replay.mcVersion || t('common.unknown')}</span>
                  <span>{t('player.replaySize')}: {typeof replay.fileSize === 'number' ? formatFileSize(replay.fileSize) : t('common.unknown')}</span>
                  <span className="truncate">{t('player.replayId')}: {replayId || t('common.unknown')}</span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`/replay?id=${encodeURIComponent(replayId)}`, '_blank', 'noopener,noreferrer')}
                disabled={!canOpenReplay}
              >
                <Play className="h-3.5 w-3.5 mr-1.5" />
                {t('player.openReplay')}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default PlayerReplaysList;
