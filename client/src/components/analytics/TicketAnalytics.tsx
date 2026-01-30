import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@modl-gg/shared-web/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@modl-gg/shared-web/components/ui/select';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface TicketData {
  byStatus: Array<{ status: string; count: number }>;
  byCategory: Array<{ category: string; count: number }>;
  dailyTickets: Array<{ date: string; count: number }>;
  avgResolutionByCategory?: Array<{ category: string; avgHours: number }>;
}

interface TicketAnalyticsProps {
  data: TicketData | null;
  loading: boolean;
  period: string;
  onPeriodChange: (period: string) => void;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const statusColorMap: { [key: string]: string } = {
  'Open': '#3b82f6',
  'Closed': '#10b981',
  'Under Review': '#f59e0b',
  'Pending Player Response': '#8b5cf6',
  'Resolved': '#10b981',
  'Unfinished': '#6b7280'
};

const typeColorMap: { [key: string]: string } = {
  'bug': '#ef4444',
  'player': '#3b82f6',
  'chat': '#10b981',
  'appeal': '#f59e0b',
  'staff': '#8b5cf6',
  'support': '#ec4899'
};

export function TicketAnalytics({ data, loading, period, onPeriodChange }: TicketAnalyticsProps) {
  if (loading || !data) {
    return (
      <Card className="col-span-full">
        <CardHeader>
          <CardTitle>Ticket Analytics</CardTitle>
          <CardDescription>Loading ticket data...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-96 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Format daily trend data for better display
  const formattedDailyTrend = (data.dailyTickets || []).map(item => ({
    ...item,
    displayDate: item.date
  }));

  // Calculate average resolution time
  const avgResolutionTime = data.avgResolutionByCategory && data.avgResolutionByCategory.length > 0
    ? Math.round(data.avgResolutionByCategory.reduce((sum, item) => sum + item.avgHours, 0) / data.avgResolutionByCategory.length)
    : 0;

  return (
    <Card className="col-span-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Ticket Analytics</CardTitle>
            <CardDescription>Comprehensive ticket statistics and trends</CardDescription>
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
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="status">By Status</TabsTrigger>
            <TabsTrigger value="type">By Type</TabsTrigger>
            <TabsTrigger value="trend">Daily Trend</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Average Resolution Time</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{avgResolutionTime} hours</div>
                  <p className="text-sm text-muted-foreground">Time to resolve tickets</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Total Tickets</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {(data.byStatus || []).reduce((sum, item) => sum + item.count, 0)}
                  </div>
                  <p className="text-sm text-muted-foreground">In selected period</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="status">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.byStatus || []}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry) => `${entry.status}: ${entry.count}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {(data.byStatus || []).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={statusColorMap[entry.status] || COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
          
          <TabsContent value="type">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.byCategory || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="category" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6">
                    {(data.byCategory || []).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={typeColorMap[entry.category?.toLowerCase()] || COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
          
          <TabsContent value="trend">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={formattedDailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="displayDate" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}