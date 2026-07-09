import { useQuery } from '@tanstack/react-query';
import {
  DashboardMetricsResponseSchema,
  DashboardRecentTicketsResponseSchema,
  DashboardRecentPunishmentsResponseSchema,
} from '@modl-gg/proto/modl/v1/dashboard_pb.ts';
import { PanelSystemAlertsResponseSchema } from '@modl-gg/proto/modl/v1/alert_pb.ts';
import { protoFetch } from '@/lib/proto-fetch';
import { toNum } from '@/lib/proto-ui';

export interface DashboardMetrics {
  totalTickets: number;
  openTickets: number;
  totalPlayers: number;
  totalPunishments: number;
  activePunishments: number;
  totalStaff: number;
  ticketsTrend: number;
  playersTrend: number;
}

export function useDashboardMetrics(period: string = '7d') {
  return useQuery({
    queryKey: ['/v1/panel/dashboard/metrics', period],
    queryFn: async (): Promise<DashboardMetrics> => {
      const res = await protoFetch(
        DashboardMetricsResponseSchema,
        `/v1/panel/dashboard/metrics?period=${period}`,
      );
      return {
        totalTickets: toNum(res.totalTickets),
        openTickets: toNum(res.openTickets),
        totalPlayers: toNum(res.totalPlayers),
        totalPunishments: toNum(res.totalPunishments),
        activePunishments: toNum(res.activePunishments),
        totalStaff: toNum(res.totalStaff),
        ticketsTrend: res.ticketsTrend,
        playersTrend: res.playersTrend,
      };
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export interface RecentTicket {
  id: string;
  title: string;
  initialMessage: string;
  status: string;
  priority: string;
  createdAt: Date;
  playerName: string;
  type: string;
}

export function useRecentTickets(limit: number = 5) {
  return useQuery({
    queryKey: ['/v1/panel/dashboard/recent-tickets', limit],
    queryFn: async (): Promise<RecentTicket[]> => {
      const res = await protoFetch(
        DashboardRecentTicketsResponseSchema,
        `/v1/panel/dashboard/recent-tickets?limit=${limit}`,
      );
      return res.tickets.map((ticket) => ({
        id: ticket.id,
        title: ticket.title,
        initialMessage: ticket.initialMessage,
        status: ticket.status,
        priority: ticket.priority,
        createdAt: new Date(toNum(ticket.createdAt)),
        playerName: ticket.playerName,
        type: ticket.type,
      }));
    },
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export interface RecentPunishment {
  id: string;
  playerName: string;
  playerUuid: string;
  type: string;
  reason: string;
  issuerName: string;
  issued: Date;
  active: boolean;
}

export function useRecentPunishments(limit: number = 10) {
  return useQuery({
    queryKey: ['/v1/panel/dashboard/recent-punishments', limit],
    queryFn: async (): Promise<RecentPunishment[]> => {
      const res = await protoFetch(
        DashboardRecentPunishmentsResponseSchema,
        `/v1/panel/dashboard/recent-punishments?limit=${limit}`,
      );
      return res.punishments.map((punishment) => ({
        id: punishment.id,
        playerName: punishment.playerName,
        playerUuid: punishment.playerUuid,
        type: punishment.type,
        reason: punishment.reason,
        issuerName: punishment.issuerName,
        issued: new Date(toNum(punishment.issued)),
        active: punishment.active,
      }));
    },
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export type SystemAlertSeverity = 'BASIC' | 'WARNING' | 'CRITICAL';
export type SystemAlertAudience = 'ALL_PANEL_USERS' | 'SUPER_ADMINS_ONLY';

export interface SystemAlert {
  id: string;
  message: string;
  severity: SystemAlertSeverity;
  audience: SystemAlertAudience;
  expiresAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function useDashboardAlerts() {
  return useQuery({
    queryKey: ['/v1/panel/dashboard/alerts'],
    queryFn: async (): Promise<SystemAlert[]> => {
      const res = await protoFetch(
        PanelSystemAlertsResponseSchema,
        '/v1/panel/dashboard/alerts',
      );
      return res.items.map((alert) => ({
        id: alert.id,
        message: alert.message,
        severity: alert.severity as SystemAlertSeverity,
        audience: alert.audience as SystemAlertAudience,
        expiresAt: alert.expiresAt ? new Date(toNum(alert.expiresAt)).toISOString() : undefined,
      }));
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
