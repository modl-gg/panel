import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'modl-shared-web/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'modl-shared-web/components/ui/table';
import { Badge } from 'modl-shared-web/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'modl-shared-web/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface StaffMember {
  id: string;
  username: string;
  role: string;
  ticketResponses: number;
  punishmentsIssued: number;
  notesAdded: number;
  totalActions: number;
}

interface StaffPerformanceProps {
  data: { staffPerformance: StaffMember[] } | null;
  loading: boolean;
  period: string;
  onPeriodChange: (period: string) => void;
}

// Dynamic role color mapping - uses fallback colors for unknown roles
const getRoleColor = (roleName: string): string => {
  const roleColorMap: { [key: string]: string } = {
    'Super Admin': 'destructive',
    'Admin': 'default',
    'Moderator': 'secondary',
    'Helper': 'outline'
  };
  
  return roleColorMap[roleName] || 'default';
};

export function StaffPerformance({ data, loading, period, onPeriodChange }: StaffPerformanceProps) {
  if (loading || !data) {
    return (
      <Card className="col-span-full">
        <CardHeader>
          <CardTitle>Staff Performance</CardTitle>
          <CardDescription>Loading staff performance data...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-96 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Prepare data for chart
  const chartData = data.staffPerformance.slice(0, 10).map(staff => ({
    name: staff.username,
    'Ticket Responses': staff.ticketResponses,
    'Punishments': staff.punishmentsIssued,
    'Notes': staff.notesAdded
  }));

  return (
    <Card className="col-span-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Staff Performance</CardTitle>
            <CardDescription>Track staff activity and productivity</CardDescription>
          </div>
          <Select value={period} onValueChange={onPeriodChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Performance Chart */}
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="Ticket Responses" fill="#3b82f6" />
                <Bar dataKey="Punishments" fill="#ef4444" />
                <Bar dataKey="Notes" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Performance Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-center">Tickets</TableHead>
                  <TableHead className="text-center">Punishments</TableHead>
                  <TableHead className="text-center">Notes</TableHead>
                  <TableHead className="text-right">Total Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.staffPerformance.map((staff) => (
                  <TableRow key={staff.id}>
                    <TableCell className="font-medium">{staff.username}</TableCell>
                    <TableCell>
                      <Badge variant={getRoleColor(staff.role) as any}>
                        {staff.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">{staff.ticketResponses}</TableCell>
                    <TableCell className="text-center">{staff.punishmentsIssued}</TableCell>
                    <TableCell className="text-center">{staff.notesAdded}</TableCell>
                    <TableCell className="text-right font-medium">{staff.totalActions}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}