import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@modl-gg/shared-web/components/ui/select';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';

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

// Helper function to get the start of week (Monday)
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(d.setDate(diff));
}

// Helper function to get the start of month
function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// Helper function to get 2-day period start
function getTwoDayPeriodStart(date: Date): Date {
  const d = new Date(date);
  const dayOfMonth = d.getDate();
  // Group days into pairs: 1-2, 3-4, 5-6, etc.
  const periodStart = Math.floor((dayOfMonth - 1) / 2) * 2 + 1;
  return new Date(d.getFullYear(), d.getMonth(), periodStart);
}

// Helper function to aggregate data by period
function aggregateData(data: DashboardMetricsData[], period: string): DashboardMetricsData[] {
  if (period === '7d') {
    // No aggregation needed for daily data
    return data;
  }

  let groupBy: (date: Date) => Date;
  switch (period) {
    case '30d':
      groupBy = getTwoDayPeriodStart;
      break;
    case '90d':
      groupBy = getWeekStart;
      break;
    case '1y':
      groupBy = getMonthStart;
      break;
    default:
      return data;
  }

  const grouped = new Map<string, DashboardMetricsData[]>();

  // Group data by the appropriate time period
  data.forEach(item => {
    const date = new Date(item.date);
    const key = groupBy(date).toISOString().split('T')[0];
    
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(item);
  });

  // Average the values for each group
  const aggregated: DashboardMetricsData[] = [];
  grouped.forEach((items, dateKey) => {
    const avgItem: DashboardMetricsData = {
      date: dateKey,
      openTickets: Math.round(items.reduce((sum, item) => sum + item.openTickets, 0) / items.length),
      onlinePlayers: Math.round(items.reduce((sum, item) => sum + item.onlinePlayers, 0) / items.length),
      newPlayers: Math.round(items.reduce((sum, item) => sum + item.newPlayers, 0) / items.length),
      punishmentsIssued: Math.round(items.reduce((sum, item) => sum + item.punishmentsIssued, 0) / items.length),
      newTickets: Math.round(items.reduce((sum, item) => sum + item.newTickets, 0) / items.length)
    };
    aggregated.push(avgItem);
  });

  // Sort by date
  return aggregated.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

// Helper function to format date based on aggregation period
function formatDisplayDate(date: string, period: string): string {
  const d = new Date(date);
  
  switch (period) {
    case '7d':
    case '30d':
      return d.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric'
      });
    case '90d':
      // For weekly aggregation, show week start date
      return d.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric'
      });
    case '1y':
      // For monthly aggregation, show month and year
      return d.toLocaleDateString('en-US', { 
        month: 'short',
        year: '2-digit'
      });
    default:
      return d.toLocaleDateString();
  }
}

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

  const aggregatedData = aggregateData(data, period);
  const formattedData = aggregatedData.map(item => ({
    ...item,
    displayDate: formatDisplayDate(item.date, period)
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
                strokeWidth={2}
                name="Open Tickets"
                dot={{r:0}}
              />
              <Line
                type="monotone"
                dataKey="onlinePlayers"
                stroke={METRIC_COLORS.onlinePlayers}
                strokeWidth={2}
                name="Online Players"
                dot={{r:0}}
              />
              <Line
                type="monotone"
                dataKey="newPlayers"
                stroke={METRIC_COLORS.newPlayers}
                strokeWidth={2}
                name="New Players"
                dot={{r:0}}
              />
              <Line
                type="monotone"
                dataKey="punishmentsIssued"
                stroke={METRIC_COLORS.punishmentsIssued}
                strokeWidth={2}
                name="Punishments Issued"
                dot={{r:0}}
              />
              <Line
                type="monotone"
                dataKey="newTickets"
                stroke={METRIC_COLORS.newTickets}
                strokeWidth={2}
                name="New Tickets"
                dot={{r:0}}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}