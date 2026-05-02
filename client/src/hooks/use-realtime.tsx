import { useEffect, useMemo, useRef } from 'react';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import {
  AckKind,
  AckSchema,
  ClientHelloSchema,
  ClientKind,
  ErrorCode,
  HeartbeatSchema,
  RealtimeEnvelope,
  RealtimeEnvelopeSchema,
  ReconnectAction,
  ReconnectReason,
  Topic,
} from '@modl-gg/proto/modl/v1/realtime_pb.ts';
import { useAuth } from '@/hooks/use-auth';
import { getCurrentDomain } from '@/lib/api';

const REALTIME_PROTOCOL_VERSION = 1;
const HEARTBEAT_INTERVAL_MS = 30_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const MAX_ADVISED_RECONNECT_DELAY_MS = 60_000;
const RECENT_EVENT_ID_LIMIT = 256;
const REALTIME_PATH = '/api/v1/realtime/ws';

const PANEL_TOPICS = [
  Topic.PANEL_TICKETS,
  Topic.PANEL_ASSIGNED_TICKETS,
  Topic.PANEL_MIGRATIONS,
] as const;
const PANEL_TOPIC_SET = new Set<Topic>(PANEL_TOPICS);

type InvalidateQueries = Pick<QueryClient, 'invalidateQueries'>;
type InvalidationTarget = readonly unknown[];

export function isPanelRealtimeEnabled(): boolean {
  return import.meta.env.VITE_REALTIME_ENABLED === 'true';
}

export function createRealtimeWebSocketUrl(location: Location): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}${REALTIME_PATH}`;
}

export function getReconnectDelayMs(attempt: number, random: () => number = Math.random): number {
  const cappedAttempt = Math.min(attempt, 5);
  const baseDelay = Math.min(MAX_RECONNECT_DELAY_MS, INITIAL_RECONNECT_DELAY_MS * 2 ** cappedAttempt);
  return baseDelay + Math.floor(random() * Math.min(baseDelay, 1_000));
}

export function getAdvisedReconnectDelayMs(retryAfterMs: number, random: () => number = Math.random): number {
  const cappedDelay = Math.max(0, Math.min(retryAfterMs, MAX_ADVISED_RECONNECT_DELAY_MS));
  return cappedDelay + Math.floor(random() * Math.min(Math.max(cappedDelay, 1), 1_000));
}

export function getRequiredTopicForRealtimePayload(envelope: RealtimeEnvelope): Topic | null {
  switch (envelope.payload.case) {
    case 'ticketChanged':
      return Topic.PANEL_TICKETS;
    case 'assignedTicketSubscriptionChanged':
      return Topic.PANEL_ASSIGNED_TICKETS;
    case 'migrationStatusChanged':
      return Topic.PANEL_MIGRATIONS;
    default:
      return null;
  }
}

export function getRealtimeInvalidationTargets(envelope: RealtimeEnvelope): InvalidationTarget[] {
  switch (envelope.payload.case) {
    case 'ticketChanged': {
      const ticketId = envelope.payload.value.ticketId?.trim();
      return [
        ['/v1/panel/tickets'],
        ['/v1/panel/tickets/counts'],
        ...(ticketId ? [['/v1/panel/tickets', ticketId] as const] : []),
      ];
    }
    case 'assignedTicketSubscriptionChanged':
      return [
        ['/v1/panel/ticket-subscriptions/updates'],
        ['/v1/panel/ticket-subscriptions/assigned-updates'],
      ];
    case 'migrationStatusChanged':
      return [['/v1/panel/migration/status']];
    default:
      return [];
  }
}

function getTopicInvalidationTargets(topic: Topic): InvalidationTarget[] {
  switch (topic) {
    case Topic.PANEL_TICKETS:
      return [
        ['/v1/panel/tickets'],
        ['/v1/panel/tickets/counts'],
      ];
    case Topic.PANEL_ASSIGNED_TICKETS:
      return [
        ['/v1/panel/ticket-subscriptions/updates'],
        ['/v1/panel/ticket-subscriptions/assigned-updates'],
      ];
    case Topic.PANEL_MIGRATIONS:
      return [['/v1/panel/migration/status']];
    default:
      return [];
  }
}

function getSubscribedRealtimeInvalidationTargets(topics: readonly Topic[]): InvalidationTarget[] {
  const seen = new Set<string>();
  const targets: InvalidationTarget[] = [];

  for (const topic of topics) {
    if (!PANEL_TOPIC_SET.has(topic)) continue;

    for (const target of getTopicInvalidationTargets(topic)) {
      const key = JSON.stringify(target);
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push(target);
    }
  }

  return targets;
}

export function invalidateRealtimeTargets(queryClient: InvalidateQueries, targets: InvalidationTarget[]): void {
  for (const queryKey of targets) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

export function invalidateSubscribedRealtimeTargets(queryClient: InvalidateQueries, topics: readonly Topic[]): void {
  invalidateRealtimeTargets(queryClient, getSubscribedRealtimeInvalidationTargets(topics));
}

function buildEnvelope(payload: RealtimeEnvelope['payload']): RealtimeEnvelope {
  return create(RealtimeEnvelopeSchema, {
    protocolVersion: REALTIME_PROTOCOL_VERSION,
    payload,
  });
}

function buildClientHello(serverDomain: string): RealtimeEnvelope {
  return buildEnvelope({
    case: 'clientHello',
    value: create(ClientHelloSchema, {
      clientKind: ClientKind.PANEL,
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      serverName: serverDomain,
      supportedTopics: [...PANEL_TOPICS],
    }),
  });
}

function buildHeartbeat(sequence: bigint): RealtimeEnvelope {
  return buildEnvelope({
    case: 'heartbeat',
    value: create(HeartbeatSchema, { sequence }),
  });
}

function buildTransportAck(eventId: string): RealtimeEnvelope {
  return buildEnvelope({
    case: 'ack',
    value: create(AckSchema, {
      kind: AckKind.TRANSPORT,
      eventId,
    }),
  });
}

function sendEnvelope(socket: WebSocket | null, envelope: RealtimeEnvelope): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(toBinary(RealtimeEnvelopeSchema, envelope));
}

function shouldStopForError(envelope: RealtimeEnvelope): boolean {
  if (envelope.payload.case !== 'error') return false;
  return envelope.payload.value.code === ErrorCode.UNAUTHORIZED
    || envelope.payload.value.code === ErrorCode.FORBIDDEN
    || envelope.payload.value.code === ErrorCode.UNSUPPORTED_PROTOCOL;
}

function shouldStopForReconnectAdvice(envelope: RealtimeEnvelope): boolean {
  if (envelope.payload.case !== 'reconnectAdvice') return false;
  const advice = envelope.payload.value;
  return advice.action === ReconnectAction.STOP
    || advice.action === ReconnectAction.REAUTHENTICATE
    || advice.reason === ReconnectReason.AUTH_EXPIRED
    || advice.reason === ReconnectReason.PROTOCOL_UPGRADE;
}

function markEventId(eventIds: string[], eventId: string): boolean {
  if (!eventId) return true;
  if (eventIds.includes(eventId)) return false;
  eventIds.push(eventId);
  if (eventIds.length > RECENT_EVENT_ID_LIMIT) {
    eventIds.splice(0, eventIds.length - RECENT_EVENT_ID_LIMIT);
  }
  return true;
}

export function useRealtimeInvalidation(): void {
  const queryClient = useQueryClient();
  const { user, isLoading } = useAuth();
  const domain = getCurrentDomain();
  const authKey = useMemo(() => user ? `${domain}:${user.id}` : null, [domain, user]);
  const stoppedAuthKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!authKey) {
      stoppedAuthKeyRef.current = null;
    }
  }, [authKey]);

  useEffect(() => {
    if (!isPanelRealtimeEnabled() || isLoading || !authKey || typeof window === 'undefined') return;
    if (stoppedAuthKeyRef.current === authKey) return;

    let active = true;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let heartbeatTimer: number | undefined;
    let reconnectAttempt = 0;
    let heartbeatSequence = BigInt(0);
    let connectedOnce = false;
    let subscribedTopics: Topic[] = [];
    let reconnectDelayOverrideMs: number | undefined;
    const recentEventIds: string[] = [];

    const cleanupTimers = () => {
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
      if (heartbeatTimer !== undefined) {
        window.clearInterval(heartbeatTimer);
        heartbeatTimer = undefined;
      }
    };

    const stopForAuthSession = () => {
      stoppedAuthKeyRef.current = authKey;
      active = false;
      cleanupTimers();
      socket?.close();
      socket = null;
    };

    const scheduleReconnect = () => {
      if (!active || reconnectTimer !== undefined) return;
      const delayMs = reconnectDelayOverrideMs !== undefined
        ? getAdvisedReconnectDelayMs(reconnectDelayOverrideMs)
        : getReconnectDelayMs(reconnectAttempt++);
      reconnectDelayOverrideMs = undefined;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, delayMs);
    };

    const startHeartbeat = () => {
      if (heartbeatTimer !== undefined) {
        window.clearInterval(heartbeatTimer);
      }
      heartbeatTimer = window.setInterval(() => {
        heartbeatSequence += BigInt(1);
        sendEnvelope(socket, buildHeartbeat(heartbeatSequence));
      }, HEARTBEAT_INTERVAL_MS);
    };

    const handleEnvelope = (envelope: RealtimeEnvelope) => {
      if (envelope.eventId) {
        sendEnvelope(socket, buildTransportAck(envelope.eventId));
      }

      if (shouldStopForError(envelope) || shouldStopForReconnectAdvice(envelope)) {
        stopForAuthSession();
        return;
      }

      switch (envelope.payload.case) {
        case 'serverHello':
          reconnectAttempt = 0;
          subscribedTopics = envelope.payload.value.acceptedTopics.filter((topic) => PANEL_TOPIC_SET.has(topic));
          if (connectedOnce) {
            invalidateSubscribedRealtimeTargets(queryClient, subscribedTopics);
          }
          connectedOnce = true;
          break;
        case 'heartbeat':
          break;
        case 'reconnectAdvice':
          if (envelope.payload.value.action === ReconnectAction.RECONNECT && envelope.payload.value.retryAfterMs !== undefined) {
            reconnectDelayOverrideMs = envelope.payload.value.retryAfterMs;
          }
          if (envelope.payload.value.action === ReconnectAction.RESYNC) {
            invalidateSubscribedRealtimeTargets(queryClient, subscribedTopics);
          }
          break;
        case 'ticketChanged':
        case 'assignedTicketSubscriptionChanged':
        case 'migrationStatusChanged': {
          const requiredTopic = getRequiredTopicForRealtimePayload(envelope);
          if (requiredTopic !== null && subscribedTopics.includes(requiredTopic) && markEventId(recentEventIds, envelope.eventId)) {
            invalidateRealtimeTargets(queryClient, getRealtimeInvalidationTargets(envelope));
          }
          break;
        }
        default:
          break;
      }
    };

    const connect = () => {
      if (!active) return;
      const nextSocket = new WebSocket(createRealtimeWebSocketUrl(window.location));
      socket = nextSocket;
      nextSocket.binaryType = 'arraybuffer';

      nextSocket.onopen = () => {
        sendEnvelope(nextSocket, buildClientHello(domain));
        startHeartbeat();
      };

      nextSocket.onmessage = async (event) => {
        try {
          const data = event.data instanceof Blob
            ? new Uint8Array(await event.data.arrayBuffer())
            : new Uint8Array(event.data);
          handleEnvelope(fromBinary(RealtimeEnvelopeSchema, data));
        } catch {
          nextSocket.close(1003, 'Invalid realtime frame');
        }
      };

      nextSocket.onclose = (event) => {
        if (socket === nextSocket) socket = null;
        if (heartbeatTimer !== undefined) {
          window.clearInterval(heartbeatTimer);
          heartbeatTimer = undefined;
        }
        if (event.code === 1008 || event.code === 1013) {
          stopForAuthSession();
          return;
        }
        scheduleReconnect();
      };

      nextSocket.onerror = () => {
        nextSocket.close();
      };
    };

    connect();

    return () => {
      active = false;
      cleanupTimers();
      socket?.close();
      socket = null;
    };
  }, [authKey, isLoading, queryClient]);
}

export function RealtimeProvider(): null {
  useRealtimeInvalidation();
  return null;
}
