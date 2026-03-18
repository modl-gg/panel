import { apiFetch } from './api';

export interface ReplayMetadata {
  replayId: string;
  mcVersion: string;
  fileSize: number;
  timestamp: number;
  replayUrl: string;
  status: string;
}

export async function submitReplayLabels(replayId: string, labels: unknown[]): Promise<void> {
  const response = await apiFetch(`/v1/public/replays/${encodeURIComponent(replayId)}/label`, {
    method: 'POST',
    body: { players: labels },
  });

  if (!response.ok) {
    throw new Error(`Failed to submit labels: ${response.status}`);
  }
}

export async function fetchReplayMetadata(replayId: string): Promise<ReplayMetadata> {
  const response = await apiFetch(`/v1/public/replays/${encodeURIComponent(replayId)}`);

  if (!response.ok) {
    if (response.status === 404) throw new Error('Replay not found');
    throw new Error(`Failed to fetch replay: ${response.status}`);
  }

  return response.json();
}
