import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@modl-gg/shared-web/components/ui/tabs';
import { Alert, AlertDescription } from '@modl-gg/shared-web/components/ui/alert';
import { AlertTriangle, BarChart3, Users, Ticket, Shield, Activity } from 'lucide-react';
import PageContainer from '@/components/layout/PageContainer';
import {
  OverviewCards,
  TicketAnalytics,
  StaffPerformance,
  PunishmentAnalytics,
  PlayerActivity,
  AuditLogs
} from '@/components/analytics';

interface AnalyticsResponse {
  overview: {
    totalTickets: number;
    totalPlayers: number;
    totalStaff: number;
    activeTickets: number;
    ticketChange: number;
    playerChange: number;
  };
}

const fetchAnalyticsData = async (endpoint: string, period?: string) => {
  const { getApiUrl, getCurrentDomain } = await import('@/lib/api');
  const url = `/v1/panel/analytics/${endpoint}${period ? `?period=${period}` : ''}`;
  const response = await fetch(getApiUrl(url), {
    credentials: 'include',
    headers: { 'X-Server-Domain': getCurrentDomain() }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${endpoint} analytics`);
  }
  return response.json();
};

export default function AnalyticsPage() {
  return <AnalyticsContent />;
}

function AnalyticsContent() {
  const [ticketPeriod, setTicketPeriod] = useState('30d');
  const [staffPeriod, setStaffPeriod] = useState('30d');
  const [punishmentPeriod, setPunishmentPeriod] = useState('30d');
  const [playerPeriod, setPlayerPeriod] = useState('30d');
  const [auditPeriod, setAuditPeriod] = useState('7d');

  // Overview data
  const { data: overviewData, isLoading: overviewLoading, error: overviewError } = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: () => fetchAnalyticsData('overview'),
    refetchInterval: 5 * 60 * 1000 // Refetch every 5 minutes
  });

  // Ticket analytics
  const { data: ticketData, isLoading: ticketLoading } = useQuery({
    queryKey: ['analytics', 'tickets', ticketPeriod],
    queryFn: () => fetchAnalyticsData('tickets', ticketPeriod),
    refetchInterval: 5 * 60 * 1000
  });

  // Staff performance
  const { data: staffData, isLoading: staffLoading } = useQuery({
    queryKey: ['analytics', 'staff-performance', staffPeriod],
    queryFn: () => fetchAnalyticsData('staff-performance', staffPeriod),
    refetchInterval: 5 * 60 * 1000
  });

  // Punishment analytics
  const { data: punishmentData, isLoading: punishmentLoading } = useQuery({
    queryKey: ['analytics', 'punishments', punishmentPeriod],
    queryFn: () => fetchAnalyticsData('punishments', punishmentPeriod),
    refetchInterval: 5 * 60 * 1000
  });

  // Player activity
  const { data: playerData, isLoading: playerLoading } = useQuery({
    queryKey: ['analytics', 'player-activity', playerPeriod],
    queryFn: () => fetchAnalyticsData('player-activity', playerPeriod),
    refetchInterval: 5 * 60 * 1000
  });

  // Audit logs
  const { data: auditData, isLoading: auditLoading } = useQuery({
    queryKey: ['analytics', 'audit-logs', auditPeriod],
    queryFn: () => fetchAnalyticsData('audit-logs', auditPeriod),
    refetchInterval: 2 * 60 * 1000 // More frequent for logs
  });

  if (overviewError) {
    return (
      <PageContainer title="Analytics">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Failed to load analytics data. This may be due to insufficient permissions or a server error.
          </AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Analytics" subtitle="Comprehensive server statistics and insights">
      <div className="space-y-6">
        {/* Overview Cards */}
        <OverviewCards data={overviewData?.overview || null} loading={overviewLoading} />

        {/* Main Analytics Tabs */}
        <Tabs defaultValue="tickets" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="tickets" className="flex items-center gap-2">
              <Ticket className="h-4 w-4" />
              Tickets
            </TabsTrigger>
            <TabsTrigger value="staff" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Staff
            </TabsTrigger>
            <TabsTrigger value="punishments" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Punishments
            </TabsTrigger>
            <TabsTrigger value="players" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Players
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Logs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tickets" className="space-y-4">
            <TicketAnalytics
              data={ticketData}
              loading={ticketLoading}
              period={ticketPeriod}
              onPeriodChange={setTicketPeriod}
            />
          </TabsContent>

          <TabsContent value="staff" className="space-y-4">
            <StaffPerformance
              data={staffData}
              loading={staffLoading}
              period={staffPeriod}
              onPeriodChange={setStaffPeriod}
            />
          </TabsContent>

          <TabsContent value="punishments" className="space-y-4">
            <PunishmentAnalytics
              data={punishmentData}
              loading={punishmentLoading}
              period={punishmentPeriod}
              onPeriodChange={setPunishmentPeriod}
            />
          </TabsContent>

          <TabsContent value="players" className="space-y-4">
            <PlayerActivity
              data={playerData}
              loading={playerLoading}
              period={playerPeriod}
              onPeriodChange={setPlayerPeriod}
            />
          </TabsContent>

          <TabsContent value="logs" className="space-y-4">
            <AuditLogs
              data={auditData}
              loading={auditLoading}
              period={auditPeriod}
              onPeriodChange={setAuditPeriod}
            />
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}