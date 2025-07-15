import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'modl-shared-web/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'modl-shared-web/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'modl-shared-web/components/ui/select';
import { Badge } from 'modl-shared-web/components/ui/badge';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface AuditLogData {
  byLevel: Array<{ level: string; count: number }>;
  bySource: Array<{ source: string; count: number }>;
  hourlyTrend: Array<{ hour: string; count: number }>;
}

interface AuditLogsProps {
  data: AuditLogData | null;
  loading: boolean;
  period: string;
  onPeriodChange: (period: string) => void;
}

const levelColorMap: { [key: string]: string } = {
  'info': '#3b82f6',
  'warning': '#f59e0b',
  'error': '#ef4444',
  'moderation': '#8b5cf6'
};

const levelBadgeMap: { [key: string]: string } = {
  'info': 'default',
  'warning': 'secondary',
  'error': 'destructive',
  'moderation': 'default'
};

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export function AuditLogs({ data, loading, period, onPeriodChange }: AuditLogsProps) {
  if (loading || !data) {
    return (
      <Card className="col-span-full">
        <CardHeader>
          <CardTitle>System Activity Logs</CardTitle>
          <CardDescription>Loading audit log data...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-96 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Format hourly trend data for better display
  const formattedHourlyTrend = data.hourlyTrend.map(item => ({
    ...item,
    displayHour: new Date(item.hour).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true })
  }));

  // Calculate total logs
  const totalLogs = data.byLevel.reduce((sum, item) => sum + item.count, 0);

  return (
    <Card className="col-span-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>System Activity Logs</CardTitle>
            <CardDescription>Monitor system events and activity patterns</CardDescription>
          </div>
          <Select value={period} onValueChange={onPeriodChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="levels">By Level</TabsTrigger>
            <TabsTrigger value="sources">By Source</TabsTrigger>
            <TabsTrigger value="hourly">Hourly Trend</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Total Logs</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{totalLogs}</div>
                  <p className="text-sm text-muted-foreground">In selected period</p>
                </CardContent>
              </Card>
              {data.byLevel.map((level, index) => (
                <Card key={level.level}>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Badge variant={levelBadgeMap[level.level] as any}>
                        {level.level.charAt(0).toUpperCase() + level.level.slice(1)}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{level.count}</div>
                    <p className="text-sm text-muted-foreground">
                      {totalLogs > 0 ? Math.round((level.count / totalLogs) * 100) : 0}% of total
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
          
          <TabsContent value="levels">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.byLevel}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry) => `${entry.level}: ${entry.count}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {data.byLevel.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={levelColorMap[entry.level] || COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
          
          <TabsContent value="sources">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.bySource}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="source" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6">
                    {data.bySource.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
          
          <TabsContent value="hourly">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={formattedHourlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="displayHour" />
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