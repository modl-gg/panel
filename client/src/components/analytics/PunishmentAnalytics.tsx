import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@modl-gg/shared-web/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@modl-gg/shared-web/components/ui/select';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface PunishmentData {
  byType: Array<{ type: string; count: number }>;
  dailyTrend: Array<{ date: string; count: number }>;
  topReasons: Array<{ reason: string; count: number }>;
}

interface PunishmentAnalyticsProps {
  data: PunishmentData | null;
  loading: boolean;
  period: string;
  onPeriodChange: (period: string) => void;
}

const COLORS = ['#fbbf24', '#fb923c', '#f87171', '#ef4444', '#dc2626'];

const punishmentColorMap: { [key: string]: string } = {
  'Warning': '#fbbf24',
  'Mute': '#fb923c',
  'Kick': '#f87171',
  'Temporary Ban': '#ef4444',
  'Permanent Ban': '#dc2626'
};

export function PunishmentAnalytics({ data, loading, period, onPeriodChange }: PunishmentAnalyticsProps) {
  if (loading || !data) {
    return (
      <Card className="col-span-full">
        <CardHeader>
          <CardTitle>Punishment Analytics</CardTitle>
          <CardDescription>Loading punishment data...</CardDescription>
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
  const formattedDailyTrend = data.dailyTrend.map(item => ({
    ...item,
    displayDate: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }));

  // Calculate total punishments
  const totalPunishments = data.byType.reduce((sum, item) => sum + item.count, 0);

  return (
    <Card className="col-span-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Punishment Analytics</CardTitle>
            <CardDescription>Track punishment trends and patterns</CardDescription>
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
            <TabsTrigger value="types">By Type</TabsTrigger>
            <TabsTrigger value="reasons">Top Reasons</TabsTrigger>
            <TabsTrigger value="trend">Daily Trend</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Total Punishments</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{totalPunishments}</div>
                  <p className="text-sm text-muted-foreground">In selected period</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Most Common Type</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {data.byType.length > 0 ? data.byType[0].type : 'N/A'}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {data.byType.length > 0 ? `${data.byType[0].count} issued` : 'No data'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Daily Average</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {data.dailyTrend.length > 0 
                      ? Math.round(totalPunishments / data.dailyTrend.length)
                      : 0}
                  </div>
                  <p className="text-sm text-muted-foreground">Punishments per day</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="types">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.byType}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry) => `${entry.type}: ${entry.count}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {data.byType.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={punishmentColorMap[entry.type] || COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
          
          <TabsContent value="reasons">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.topReasons} layout="horizontal">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="reason" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#ef4444" />
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
                  <Line type="monotone" dataKey="count" stroke="#ef4444" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}