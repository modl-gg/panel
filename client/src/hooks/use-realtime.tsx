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
  PanelResource,
  type RealtimeEnvelope,
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
const POLICY_VIOLATION_CLOSE_CODE = 1008;

const PANEL_TOPICS = [
  Topic.PANEL_TICKETS,
  Topic.PANEL_ASSIGNED_TICKETS,
  Topic.PANEL_MIGRATIONS,
  Topic.PANEL_PLAYERS,
  Topic.PANEL_PUNISHMENTS,
  Topic.PANEL_STAFF,
  Topic.PANEL_ROLES,
  Topic.PANEL_SETTINGS,
  Topic.PANEL_PUNISHMENT_TYPES,
  Topic.PANEL_KNOWLEDGEBASE,
  Topic.PANEL_AUDIT,
  Topic.PANEL_HOMEPAGE,
  Topic.PANEL_APPEALS,
  Topic.PANEL_DASHBOARD,
  Topic.PANEL_NOTIFICATIONS,
] as const;
const PANEL_TOPIC_SET = new Set<Topic>(PANEL_TOPICS);

type InvalidateQueries = Pick<QueryClient, 'invalidateQueries'>;
type InvalidationTarget = readonly unknown[];

const STAFF_TARGETS: InvalidationTarget[] = [
  ['/v1/panel/staff'],
  ['/v1/panel/roles'],
  ['/v1/panel/roles/permissions'],
  ['userPermissions'],
];

const ALL_SETTINGS_TARGETS: InvalidationTarget[] = [
  ['/v1/settings'],
  ['/v1/panel/settings/punishment-types'],
  ['/v1/panel/settings/ticket-forms'],
  ['/v1/panel/settings/quick-responses'],
  ['/v1/panel/settings/status-thresholds'],
  ['/v1/panel/settings/ticket-labels'],
  ['/v1/panel/settings/replay-retention'],
];

const DASHBOARD_METRICS_TARGET: InvalidationTarget = ['/v1/panel/dashboard/metrics'];
const DASHBOARD_RECENT_TICKETS_TARGET: InvalidationTarget = ['/v1/panel/dashboard/recent-tickets'];
const DASHBOARD_RECENT_PUNISHMENTS_TARGET: InvalidationTarget = ['/v1/panel/dashboard/recent-punishments'];
const DASHBOARD_ALERTS_TARGET: InvalidationTarget = ['/v1/panel/dashboard/alerts'];

const DASHBOARD_TARGETS: InvalidationTarget[] = [
  DASHBOARD_METRICS_TARGET,
  DASHBOARD_RECENT_TICKETS_TARGET,
  DASHBOARD_RECENT_PUNISHMENTS_TARGET,
  DASHBOARD_ALERTS_TARGET,
];

const TICKET_DASHBOARD_TARGETS: InvalidationTarget[] = [
  DASHBOARD_METRICS_TARGET,
  DASHBOARD_RECENT_TICKETS_TARGET,
];

const PUNISHMENT_DASHBOARD_TARGETS: InvalidationTarget[] = [
  DASHBOARD_METRICS_TARGET,
  DASHBOARD_RECENT_PUNISHMENTS_TARGET,
];

const AUDIT_TARGETS: InvalidationTarget[] = [
  ['analytics-overview'],
  ['staff-performance'],
  ['punishment-analytics'],
  ['player-activity'],
  ['ticket-analytics'],
  ['punishments-list'],
  ['staff-details'],
];

const NOTIFICATION_TARGETS: InvalidationTarget[] = [
  ['/v1/panel/ticket-subscriptions/updates'],
  ['/v1/panel/ticket-subscriptions/assigned-updates'],
];

export function isPanelRealtimeEnabled(): boolean {
  return import.meta.env.VITE_REALTIME_ENABLED !== 'false';
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

function getTopicForPanelResource(resource: PanelResource): Topic | null {
  switch (resource) {
    case PanelResource.PLAYERS:
      return Topic.PANEL_PLAYERS;
    case PanelResource.PUNISHMENTS:
      return Topic.PANEL_PUNISHMENTS;
    case PanelResource.STAFF:
      return Topic.PANEL_STAFF;
    case PanelResource.ROLES:
      return Topic.PANEL_ROLES;
    case PanelResource.SETTINGS:
      return Topic.PANEL_SETTINGS;
    case PanelResource.PUNISHMENT_TYPES:
      return Topic.PANEL_PUNISHMENT_TYPES;
    case PanelResource.KNOWLEDGEBASE:
      return Topic.PANEL_KNOWLEDGEBASE;
    case PanelResource.AUDIT:
      return Topic.PANEL_AUDIT;
    case PanelResource.HOMEPAGE:
      return Topic.PANEL_HOMEPAGE;
    case PanelResource.APPEALS:
      return Topic.PANEL_APPEALS;
    case PanelResource.TICKETS:
      return Topic.PANEL_TICKETS;
    case PanelResource.DASHBOARD:
      return Topic.PANEL_DASHBOARD;
    case PanelResource.NOTIFICATIONS:
      return Topic.PANEL_NOTIFICATIONS;
    default:
      return null;
  }
}

export function getRequiredTopicForRealtimePayload(envelope: RealtimeEnvelope): Topic | null {
  switch (envelope.payload.case) {
    case 'ticketChanged':
      return Topic.PANEL_TICKETS;
    case 'assignedTicketSubscriptionChanged':
      return Topic.PANEL_ASSIGNED_TICKETS;
    case 'migrationStatusChanged':
      return Topic.PANEL_MIGRATIONS;
    case 'panelInvalidated':
      return getTopicForPanelResource(envelope.payload.value.resource);
    default:
      return null;
  }
}

function getTicketInvalidationTargets(ticketId?: string): InvalidationTarget[] {
  return [
    ['/v1/panel/tickets'],
    ['/v1/panel/tickets/counts'],
    ...(ticketId ? [['/v1/panel/tickets', ticketId] as const] : []),
    ...TICKET_DASHBOARD_TARGETS,
  ];
}

function getPanelResourceInvalidationTargets(resource: PanelResource, resourceId?: string): InvalidationTarget[] {
  const id = resourceId?.trim();
  switch (resource) {
    case PanelResource.PLAYERS:
      return id
        ? [
            ['/v1/panel/players', id],
            ['/v1/panel/players/linked', id],
            ['/v1/panel/players', id, 'replays'],
          ]
        : [['/v1/panel/players']];
    case PanelResource.PUNISHMENTS:
      return [
        ...(id
          ? [['/v1/panel/players/punishments', id, 'linked-bans'] as const]
          : [['/v1/panel/players'] as const]),
        ...PUNISHMENT_DASHBOARD_TARGETS,
      ];
    case PanelResource.STAFF:
    case PanelResource.ROLES:
      return STAFF_TARGETS;
    case PanelResource.SETTINGS:
    case PanelResource.PUNISHMENT_TYPES:
      return ALL_SETTINGS_TARGETS;
    case PanelResource.KNOWLEDGEBASE:
      return [['knowledgebaseCategories'], ['homepageCards']];
    case PanelResource.HOMEPAGE:
      return [['homepageCards']];
    case PanelResource.AUDIT:
      return AUDIT_TARGETS;
    case PanelResource.APPEALS:
      return [
        ['/v1/panel/appeals'],
        ...(id ? [['/v1/panel/appeals/punishment', id] as const] : []),
      ];
    case PanelResource.TICKETS:
      return getTicketInvalidationTargets(id);
    case PanelResource.DASHBOARD:
      return DASHBOARD_TARGETS;
    case PanelResource.NOTIFICATIONS:
      return NOTIFICATION_TARGETS;
    default:
      return [];
  }
}

export function getRealtimeInvalidationTargets(envelope: RealtimeEnvelope): InvalidationTarget[] {
  switch (envelope.payload.case) {
    case 'ticketChanged':
      return getTicketInvalidationTargets(envelope.payload.value.ticketId?.trim() || undefined);
    case 'assignedTicketSubscriptionChanged':
      return [
        ['/v1/panel/ticket-subscriptions/updates'],
        ['/v1/panel/ticket-subscriptions/assigned-updates'],
      ];
    case 'migrationStatusChanged':
      return [['/v1/panel/migration/status']];
    case 'panelInvalidated':
      return getPanelResourceInvalidationTargets(
        envelope.payload.value.resource,
        envelope.payload.value.resourceId,
      );
    default:
      return [];
  }
}

function getTopicInvalidationTargets(topic: Topic): InvalidationTarget[] {
  switch (topic) {
    case Topic.PANEL_TICKETS:
      return getTicketInvalidationTargets();
    case Topic.PANEL_ASSIGNED_TICKETS:
      return [
        ['/v1/panel/ticket-subscriptions/updates'],
        ['/v1/panel/ticket-subscriptions/assigned-updates'],
      ];
    case Topic.PANEL_MIGRATIONS:
      return [['/v1/panel/migration/status']];
    case Topic.PANEL_PLAYERS:
      return [['/v1/panel/players']];
    case Topic.PANEL_PUNISHMENTS:
      return [['/v1/panel/players'], ...PUNISHMENT_DASHBOARD_TARGETS];
    case Topic.PANEL_STAFF:
    case Topic.PANEL_ROLES:
      return STAFF_TARGETS;
    case Topic.PANEL_SETTINGS:
    case Topic.PANEL_PUNISHMENT_TYPES:
      return ALL_SETTINGS_TARGETS;
    case Topic.PANEL_KNOWLEDGEBASE:
      return [['knowledgebaseCategories'], ['homepageCards']];
    case Topic.PANEL_HOMEPAGE:
      return [['homepageCards']];
    case Topic.PANEL_AUDIT:
      return AUDIT_TARGETS;
    case Topic.PANEL_APPEALS:
      return [['/v1/panel/appeals']];
    case Topic.PANEL_DASHBOARD:
      return DASHBOARD_TARGETS;
    case Topic.PANEL_NOTIFICATIONS:
      return NOTIFICATION_TARGETS;
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

export function resyncCacheAfterConnectionLoss(queryClient: InvalidateQueries): void {
  void queryClient.invalidateQueries();
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
            resyncCacheAfterConnectionLoss(queryClient);
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
        case 'migrationStatusChanged':
        case 'panelInvalidated': {
          const requiredTopic = getRequiredTopicForRealtimePayload(envelope);
          if (requiredTopic !== null && subscribedTopics.includes(requiredTopic) && markEventId(recentEventIds, envelope.eventId)) {
            invalidateRealtimeTargets(queryClient, getRealtimeInvalidationTargets(envelope));
          }
          break;
        }
        default:
          if (import.meta.env.DEV) {
            console.warn('[realtime] unhandled envelope payload case:', envelope.payload?.case);
          }
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
        if (event.code === POLICY_VIOLATION_CLOSE_CODE) {
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
