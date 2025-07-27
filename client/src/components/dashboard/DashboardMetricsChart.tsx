import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@modl-gg/shared-web/components/ui/select';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export interface DashboardMetricsData {
  date: string;
  openTickets: number;
  onlinePlayers: number;
  newPlayers: number;
  punishmentsIssued: number;
  newTickets: number;
}

interface DashboardMetricsChartProps {
  data: DashboardMetricsData[];
  loading: boolean;
  period: string;
  onPeriodChange: (period: string) => void;
}

const METRIC_COLORS = {
  openTickets: '#f59e0b',
  onlinePlayers: '#3b82f6', 
  newPlayers: '#10b981',
  punishmentsIssued: '#ef4444',
  newTickets: '#8b5cf6'
};

export function DashboardMetricsChart({ data, loading, period, onPeriodChange }: DashboardMetricsChartProps) {
  if (loading) {
    return (
      <Card className="col-span-full">
        <CardHeader>
          <CardTitle>Dashboard Metrics</CardTitle>
          <CardDescription>Loading metrics data...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const formattedData = data.map(item => ({
    ...item,
    displayDate: new Date(item.date).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      ...(period === '1y' ? { year: '2-digit' } : {})
    })
  }));

  return (
    <Card className="col-span-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Dashboard Metrics</CardTitle>
            <CardDescription>Key performance indicators over time</CardDescription>
          </div>
          <Select value={period} onValueChange={onPeriodChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="1y">Last year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={formattedData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="displayDate" 
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
              />
              <YAxis 
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px'
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="openTickets"
                stroke={METRIC_COLORS.openTickets}
                fill={METRIC_COLORS.openTickets}
                strokeWidth={2}
                name="Open Tickets"
                dot={{ r: 2 }}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="onlinePlayers"
                stroke={METRIC_COLORS.onlinePlayers}
                fill={METRIC_COLORS.onlinePlayers}
                strokeWidth={2}
                name="Online Players"
                dot={{ r: 2 }}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="newPlayers"
                stroke={METRIC_COLORS.newPlayers}
                fill={METRIC_COLORS.newPlayers}
                strokeWidth={2}
                name="New Players"
                dot={{ r: 2 }}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="punishmentsIssued"
                stroke={METRIC_COLORS.punishmentsIssued}
                fill={METRIC_COLORS.punishmentsIssued}
                strokeWidth={2}
                name="Punishments Issued"
                dot={{ r: 2 }}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="newTickets"
                stroke={METRIC_COLORS.newTickets}
                fill={METRIC_COLORS.newTickets}
                strokeWidth={2}
                name="New Tickets"
                dot={{ r: 2 }}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}