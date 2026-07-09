import { apiFetch } from './api';

export interface ReplayMetadata {
  replayId: string;
  mcVersion: string;
  // Backend serializes these proto int64 fields as canonical proto-JSON, which encodes
  // int64 as JSON strings (not numbers). Type them as string and coerce with Number()/BigInt
  // at any use site that needs arithmetic or new Date(...).
  fileSize: string;
  timestamp: string;
  replayUrl: string;
  status: string;
  labeled: boolean;
}

export async function submitReplayLabels(replayId: string, labels: unknown[]): Promise<void> {
  const response = await apiFetch(`/v1/panel/replays/${encodeURIComponent(replayId)}/label`, {
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
