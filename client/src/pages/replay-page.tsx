import { useState, useEffect } from 'react';
import { ReplayViewer } from '@modl-gg/replay-viewer';
import { fetchReplayMetadata, submitReplayLabels, type ReplayMetadata } from '@/lib/replay-api';
import { Loader2 } from 'lucide-react';

const ATLAS_BASE = import.meta.env.VITE_REPLAY_ATLAS_BASE_URL || '/atlas';

export default function ReplayPage() {
  const params = new URLSearchParams(window.location.search);
  const replayId = params.get('id');

  const [metadata, setMetadata] = useState<ReplayMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!replayId) {
      setError('No replay ID provided');
      setLoading(false);
      return;
    }

    fetchReplayMetadata(replayId)
      .then((meta) => {
        if (meta.status !== 'COMPLETE') {
          setError('Replay is still processing. Try again shortly.');
        } else {
          setMetadata(meta);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [replayId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center w-screen h-screen bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center w-screen h-screen bg-black text-white gap-2">
        <p className="text-lg font-medium">Unable to load replay</p>
        <p className="text-sm text-gray-400">{error}</p>
      </div>
    );
  }

  if (!metadata) return null;

  const handleLabelSubmit = async (labels: Array<{ uuid: string; playerName: string; verdict: string; confidence: number; cheats: unknown[]; notes: string }>) => {
    await submitReplayLabels(metadata.replayId, labels);
  };

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReplayViewer
        replayUrl={metadata.replayUrl}
        mcVersion={metadata.mcVersion}
        atlasBaseUrl={ATLAS_BASE}
        replayId={metadata.replayId}
        onLabelSubmit={handleLabelSubmit}
        onError={(err) => setError(err.message)}
      />
    </div>
  );
}
