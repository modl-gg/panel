import { useState, useMemo, useCallback } from 'react';
import { 
  Filter, 
  Search, 
  Download, 
  Calendar,
  ChevronDown,
  ChevronUp,
  Shield,
  AlertCircle,
  Info,
  AlertTriangle,
  Activity,
  User,
  Bot,
  Settings,
  FileText,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Eye,
  BarChart3,
  Users,
  Clock,
  Undo2,
  Database,
  Gavel
} from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@modl-gg/shared-web/components/ui/select';
import { Checkbox } from '@modl-gg/shared-web/components/ui/checkbox';
import { Separator } from '@modl-gg/shared-web/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@modl-gg/shared-web/components/ui/popover';
import { Calendar as CalendarComponent } from '@modl-gg/shared-web/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@modl-gg/shared-web/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@modl-gg/shared-web/components/ui/tabs';
import { ScrollArea } from '@modl-gg/shared-web/components/ui/scroll-area';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { useLogs } from '@/hooks/use-data';
import { useQuery } from '@tanstack/react-query';
import PageContainer from '@/components/layout/PageContainer';
import { useToast } from '@modl-gg/shared-web/hooks/use-toast';
import { PermissionWrapper } from '@/components/PermissionWrapper';
import { PERMISSIONS } from '@/hooks/use-permissions';
import { Alert, AlertDescription } from '@modl-gg/shared-web/components/ui/alert';
import { cn } from '@modl-gg/shared-web/lib/utils';
import { usePlayerWindow } from '@/contexts/PlayerWindowContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Area, AreaChart } from 'recharts';
import { getEvidenceDisplayText, getEvidenceClickUrl, getEvidenceShortName, isEvidenceClickable } from '@/utils/evidence-utils';

interface DatabaseLog {
  _id: string;
  created: string;
  description: string;
  level: 'info' | 'warning' | 'error' | 'moderation';
  source: string;
  metadata?: Record<string, any>;
}

interface TransformedLog extends DatabaseLog {
  actionType: string;
  color: string;
  userType: string;
  icon: React.ReactNode;
  formattedTime: string;
  relativeTime: string;
}

interface StaffMember {
  id: string;
  username: string;
  role: string;
  totalActions: number;
  ticketResponses: number;
  punishmentsIssued: number;
  notesAdded: number;
  avgResponseTime: number;
  lastActive: string;
  recentActions: TransformedLog[];
}

interface PunishmentAction {
  id: string;
  type: 'ban' | 'mute' | 'kick' | 'warn';
  playerId: string;
  playerName: string;
  staffId: string;
  staffName: string;
  reason: string;
  duration?: number;
  timestamp: string;
  canRollback: boolean;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

// Enhanced action type mapping with icons
const getActionDetails = (level: string, source: string, description: string) => {
  const descLower = description.toLowerCase();
  
  if (descLower.includes('ban') || descLower.includes('mute') || descLower.includes('kick') || descLower.includes('punishment')) {
    return { 
      actionType: 'moderation', 
      color: 'destructive', 
      userType: 'Moderation',
      icon: <Shield className="h-4 w-4" />
    };
  }
  
  if (descLower.includes('ticket')) {
    return { 
      actionType: 'ticket', 
      color: 'primary', 
      userType: 'Support',
      icon: <FileText className="h-4 w-4" />
    };
  }
  
  if (descLower.includes('setting') || descLower.includes('config')) {
    return { 
      actionType: 'settings', 
      color: 'secondary', 
      userType: 'Configuration',
      icon: <Settings className="h-4 w-4" />
    };
  }
  
  switch (level) {
    case 'moderation':
      return { 
        actionType: 'moderation', 
        color: 'warning', 
        userType: 'Staff',
        icon: <Shield className="h-4 w-4" />
      };
    case 'error':
      return { 
        actionType: 'error', 
        color: 'destructive', 
        userType: 'System',
        icon: <AlertCircle className="h-4 w-4" />
      };
    case 'warning':
      return { 
        actionType: 'warning', 
        color: 'warning', 
        userType: 'System',
        icon: <AlertTriangle className="h-4 w-4" />
      };
    case 'info':
    default:
      if (source !== 'system' && source !== 'System') {
        return { 
          actionType: 'user', 
          color: 'primary', 
          userType: 'User',
          icon: <User className="h-4 w-4" />
        };
      }
      return { 
        actionType: 'system', 
        color: 'secondary', 
        userType: 'System',
        icon: <Bot className="h-4 w-4" />
      };
  }
};

const formatRelativeTime = (date: Date) => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return format(date, 'MMM d, yyyy');
};

const formatDurationDetailed = (date: Date) => {
  const now = new Date();
  const diffMs = Math.abs(now.getTime() - date.getTime());
  
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  
  return parts.length > 0 ? parts.join(' ') : '0m';
};

// API functions
const fetchAnalyticsOverview = async () => {
  const response = await fetch(`/api/panel/analytics/overview`);
  if (!response.ok) throw new Error('Failed to fetch analytics overview');
  return response.json();
};

const fetchStaffPerformance = async (period = '30d') => {
  const response = await fetch(`/api/panel/analytics/staff-performance?period=${period}`);
  if (!response.ok) throw new Error('Failed to fetch staff performance');
  const data = await response.json();
  return data.staffPerformance || [];
};

const fetchTicketAnalytics = async (period = '30d') => {
  const response = await fetch(`/api/panel/analytics/tickets?period=${period}`);
  if (!response.ok) throw new Error('Failed to fetch ticket analytics');
  return response.json();
};

const fetchPunishmentAnalytics = async (period = '30d') => {
  const response = await fetch(`/api/panel/analytics/punishments?period=${period}`);
  if (!response.ok) throw new Error('Failed to fetch punishment analytics');
  return response.json();
};

const fetchPlayerActivity = async (period = '30d') => {
  const response = await fetch(`/api/panel/analytics/player-activity?period=${period}`);
  if (!response.ok) throw new Error('Failed to fetch player activity');
  return response.json();
};

const fetchAuditLogsAnalytics = async (period = '7d') => {
  const response = await fetch(`/api/panel/analytics/audit-logs?period=${period}`);
  if (!response.ok) throw new Error('Failed to fetch audit logs analytics');
  return response.json();
};

const fetchPunishments = async (limit = 50, canRollback = true): Promise<PunishmentAction[]> => {
  const response = await fetch(`/api/panel/audit/punishments?limit=${limit}&canRollback=${canRollback}`);
  if (!response.ok) throw new Error('Failed to fetch punishments');
  return response.json();
};

const fetchDatabaseData = async (table: string, limit = 100, skip = 0) => {
  const response = await fetch(`/api/panel/audit/database/${table}?limit=${limit}&skip=${skip}`);
  if (!response.ok) throw new Error('Failed to fetch database data');
  return response.json();
};

// Custom themed tooltip component for charts
const CustomTooltip = ({ active, payload, label, formatValue, formatName }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background border border-border rounded-lg p-3 shadow-lg z-50 pointer-events-none">
        {label && <p className="text-sm font-medium mb-2">{label}</p>}
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <div 
              className="w-3 h-3 rounded-full flex-shrink-0" 
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{formatName ? formatName(entry.name || entry.dataKey) : entry.name || entry.dataKey}:</span>
            <span className="font-medium">
              {formatValue ? formatValue(entry.value, entry.name) : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const rollbackPunishment = async (id: string, reason?: string) => {
  const { csrfFetch } = await import('@/utils/csrf');
  const response = await csrfFetch(`/api/panel/audit/punishments/${id}/rollback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason })
  });
  if (!response.ok) throw new Error('Failed to rollback punishment');
  return response.json();
};

// Database exploration modal component
const DatabaseExplorerModal = () => {
  const [selectedTable, setSelectedTable] = useState('players');
  const [page, setPage] = useState(1);
  const limit = 20;
  
  const { data: databaseData, isLoading } = useQuery({
    queryKey: ['database', selectedTable, page],
    queryFn: () => fetchDatabaseData(selectedTable, limit, (page - 1) * limit),
    staleTime: 5 * 60 * 1000
  });

  const tables = ['players', 'tickets', 'staff', 'punishments', 'logs', 'settings'];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Database className="h-4 w-4 mr-2" />
          Database Explorer
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Database Explorer</DialogTitle>
        </DialogHeader>
        <div className="flex gap-4 h-[60vh]">
          <div className="w-48 border-r pr-4">
            <div className="space-y-1">
              {tables.map((table) => (
                <Button
                  key={table}
                  variant={selectedTable === table ? "default" : "ghost"}
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => {
                    setSelectedTable(table);
                    setPage(1);
                  }}
                >
                  {table}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            <div className="bg-muted p-4 rounded-md">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium capitalize">{selectedTable} Table</h4>
                {databaseData?.total && (
                  <span className="text-sm text-muted-foreground">
                    {databaseData.total} total records
                  </span>
                )}
              </div>
              
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {databaseData?.data?.map((row: any, index: number) => (
                      <div key={index} className="bg-background p-3 rounded border">
                        <pre className="text-xs overflow-x-auto">
                          {JSON.stringify(row, null, 2)}
                        </pre>
                      </div>
                    )) || (
                      <div className="text-center py-4 text-muted-foreground">
                        No data available
                      </div>
                    )}
                  </div>
                  
                  {databaseData?.hasMore && (
                    <div className="flex justify-between items-center mt-4 pt-2 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(Math.max(1, page - 1))}
                        disabled={page === 1}
                      >
                        Previous
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Page {page}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(page + 1)}
                        disabled={!databaseData?.hasMore}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Staff performance modal
const StaffPerformanceModal = () => {
  const [period, setPeriod] = useState('30d');
  
  const { data: staffData = [], isLoading } = useQuery({
    queryKey: ['staff-performance', period],
    queryFn: () => fetchStaffPerformance(period),
    staleTime: 5 * 60 * 1000
  });
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Users className="h-4 w-4 mr-2" />
          Staff Performance
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            Staff Performance Analytics
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">7 days</SelectItem>
                <SelectItem value="30d">30 days</SelectItem>
                <SelectItem value="90d">90 days</SelectItem>
              </SelectContent>
            </Select>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6 overflow-auto max-h-[60vh]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Actions by Staff Member</CardTitle>
              </CardHeader>
              <CardContent>
                {!staffData || staffData.length === 0 ? (
                  <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                    <div className="text-center">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No staff action data available</p>
                    </div>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={staffData}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="username" className="text-muted-foreground" fontSize={12} />
                      <YAxis className="text-muted-foreground" fontSize={12} />
                      <Tooltip cursor={false} content={<CustomTooltip />} />
                      <Bar dataKey="totalActions" fill="#8884d8" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Response Times</CardTitle>
              </CardHeader>
              <CardContent>
                {!staffData || staffData.length === 0 ? (
                  <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                    <div className="text-center">
                      <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No response time data available</p>
                    </div>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={staffData}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="username" className="text-muted-foreground" fontSize={12} />
                      <YAxis className="text-muted-foreground" fontSize={12} />
                      <Tooltip content={<CustomTooltip formatValue={(value: any, name: any) => name?.includes('ResponseTime') ? `${value}h` : value} />} />
                      <Bar dataKey="avgResponseTime" fill="#82ca9d" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Staff Activity Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Username</th>
                      <th className="text-left p-2">Role</th>
                      <th className="text-left p-2">Total Actions</th>
                      <th className="text-left p-2">Ticket Responses</th>
                      <th className="text-left p-2">Punishments</th>
                      <th className="text-left p-2">Avg Response</th>
                      <th className="text-left p-2">Last Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffData.map((staff: StaffMember) => (
                      <tr key={staff.id} className="border-b">
                        <td className="p-2 font-medium">{staff.username}</td>
                        <td className="p-2">
                          <Badge variant="outline">{staff.role}</Badge>
                        </td>
                        <td className="p-2">{staff.totalActions}</td>
                        <td className="p-2">{staff.ticketResponses}</td>
                        <td className="p-2">{staff.punishmentsIssued}</td>
                        <td className="p-2">{staff.avgResponseTime}m</td>
                        <td className="p-2">{formatRelativeTime(new Date(staff.lastActive))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Punishment rollback modal
const PunishmentRollbackModal = () => {
  const { toast } = useToast();
  const [bulkTimeRange, setBulkTimeRange] = useState('24h');
  
  const { data: punishments = [], isLoading, refetch } = useQuery({
    queryKey: ['punishments-rollback'],
    queryFn: () => fetchPunishments(50, true),
    staleTime: 5 * 60 * 1000
  });
  
  const handleRollback = async (punishment: PunishmentAction) => {
    try {
      await rollbackPunishment(punishment.id, `Rolled back by admin`);
      toast({
        title: "Punishment Rolled Back",
        description: `${punishment.type} for ${punishment.playerName} has been reversed.`
      });
      refetch();
    } catch (error) {
      toast({
        title: "Rollback Failed",
        description: "Failed to rollback punishment. Please try again.",
        variant: "destructive"
      });
    }
  };
  
  const handleBulkRollback = async () => {
    if (!confirm(`Are you sure you want to rollback ALL punishments from the last ${bulkTimeRange}? This action cannot be undone.`)) {
      return;
    }
    
    try {
      const { csrfFetch } = await import('@/utils/csrf');
      const response = await csrfFetch('/api/panel/audit/punishments/bulk-rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          timeRange: bulkTimeRange,
          reason: `Bulk rollback for ${bulkTimeRange} from audit panel`
        })
      });
      
      if (!response.ok) throw new Error('Failed to bulk rollback');
      
      const data = await response.json();
      toast({
        title: "Bulk Rollback Completed",
        description: `${data.count} punishments have been rolled back.`
      });
      refetch();
    } catch (error) {
      toast({
        title: "Bulk Rollback Failed",
        description: "Failed to rollback punishments. Please try again.",
        variant: "destructive"
      });
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Undo2 className="h-4 w-4 mr-2" />
          Rollback Punishments
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Punishment Rollback Center</DialogTitle>
        </DialogHeader>
        
        {/* Bulk Rollback Controls */}
        <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Bulk Rollback:</span>
            <Select value={bulkTimeRange} onValueChange={setBulkTimeRange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">1 hour</SelectItem>
                <SelectItem value="6h">6 hours</SelectItem>
                <SelectItem value="24h">24 hours</SelectItem>
                <SelectItem value="7d">7 days</SelectItem>
                <SelectItem value="30d">30 days</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkRollback}
              className="ml-2"
            >
              <Undo2 className="h-4 w-4 mr-2" />
              Execute Bulk Rollback
            </Button>
          </div>
        </div>
        
        <div className="space-y-4 overflow-auto max-h-[50vh]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin" />
            </div>
          ) : punishments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No punishments available for rollback
            </div>
          ) : (
            punishments.filter(p => p.canRollback).map((punishment) => (
            <Card key={punishment.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center",
                      punishment.type === 'ban' && "bg-red-100 text-red-600",
                      punishment.type === 'mute' && "bg-orange-100 text-orange-600",
                      punishment.type === 'kick' && "bg-yellow-100 text-yellow-600",
                      punishment.type === 'warn' && "bg-blue-100 text-blue-600"
                    )}>
                      <Gavel className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant={punishment.type === 'ban' ? 'destructive' : 'secondary'}>
                          {punishment.type.toUpperCase()}
                        </Badge>
                        <span className="font-medium">{punishment.playerName}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {punishment.reason} • by {punishment.staffName} • {formatRelativeTime(new Date(punishment.timestamp))}
                      </p>
                      {punishment.duration && (
                        <p className="text-xs text-muted-foreground">
                          Duration: {Math.floor(punishment.duration / 86400)}d {Math.floor((punishment.duration % 86400) / 3600)}h
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRollback(punishment)}
                  >
                    <Undo2 className="h-4 w-4 mr-2" />
                    Rollback
                  </Button>
                </div>
              </CardContent>
            </Card>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Staff detail modal for comprehensive analytics
const StaffDetailModal = ({ staff, isOpen, onClose }: { 
  staff: StaffMember, 
  isOpen: boolean, 
  onClose: () => void 
}) => {
  const [selectedPeriod, setSelectedPeriod] = useState('30d');
  const [showBulkRollback, setShowBulkRollback] = useState(false);
  const [rollbackStartDate, setRollbackStartDate] = useState<Date | undefined>(undefined);
  const [rollbackEndDate, setRollbackEndDate] = useState<Date | undefined>(undefined);
  const { toast } = useToast();
  const { openPlayerWindow } = usePlayerWindow();
  
  // Fetch detailed staff data including punishments, tickets, evidence
  const { data: staffDetails, isLoading, refetch } = useQuery({
    queryKey: ['staff-details', staff.username, selectedPeriod],
    queryFn: () => fetchStaffDetails(staff.username, selectedPeriod),
    enabled: isOpen,
    staleTime: 5 * 60 * 1000
  });
  
  // Use real data from API
  const staffActivityData = staffDetails?.dailyActivity || [];
  const punishmentTypeData = staffDetails?.punishmentTypeBreakdown || [];
  const recentPunishments = staffDetails?.punishments || [];
  const recentTickets = staffDetails?.tickets || [];
  const evidenceCount = staffDetails?.evidenceUploads || 0;

  const handleBulkRollback = async () => {
    if (!rollbackStartDate || !rollbackEndDate) {
      toast({
        title: "Invalid Date Range",
        description: "Please select both start and end dates",
        variant: "destructive"
      });
      return;
    }

    if (rollbackEndDate < rollbackStartDate) {
      toast({
        title: "Invalid Date Range",
        description: "End date must be after start date",
        variant: "destructive"
      });
      return;
    }

    try {
      const { csrfFetch } = await import('@/utils/csrf');
      const response = await csrfFetch(`/api/panel/audit/staff/${staff.username}/rollback-date-range`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          startDate: rollbackStartDate.toISOString(),
          endDate: rollbackEndDate.toISOString(),
          reason: `Bulk rollback for ${staff.username} from ${format(rollbackStartDate, 'MMM d, yyyy')} to ${format(rollbackEndDate, 'MMM d, yyyy')}`
        })
      });
      
      if (!response.ok) throw new Error('Failed to rollback');
      
      const data = await response.json();
      toast({
        title: "Bulk Rollback Completed",
        description: `Successfully rolled back ${data.count} punishments by ${staff.username}`
      });
      
      setShowBulkRollback(false);
      setRollbackStartDate(undefined);
      setRollbackEndDate(undefined);
      // Refetch the staff details to show updated data
      refetch();
    } catch (error) {
      toast({
        title: "Bulk Rollback Failed",
        description: "Failed to rollback punishments. Please try again.",
        variant: "destructive"
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <User className="h-6 w-6" />
            {staff.username} - Detailed Analytics
            <Badge variant="outline">{staff.role}</Badge>
          </DialogTitle>
        </DialogHeader>
        
        {/* Bulk Rollback Controls - Moved outside header */}
        <div className="flex justify-end mb-4">
          <Popover open={showBulkRollback} onOpenChange={setShowBulkRollback}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                title={`Rollback punishments by ${staff.username}`}
              >
                <Undo2 className="h-4 w-4 mr-2" />
                Bulk Rollback
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" align="end">
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Bulk Rollback for {staff.username}</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Select the date range for punishments to rollback
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Start Date</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal h-8"
                        >
                          <Calendar className="mr-2 h-3 w-3" />
                          {rollbackStartDate ? format(rollbackStartDate, "MMM d, yyyy") : "Select start"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={rollbackStartDate}
                          onSelect={setRollbackStartDate}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">End Date</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal h-8"
                        >
                          <Calendar className="mr-2 h-3 w-3" />
                          {rollbackEndDate ? format(rollbackEndDate, "MMM d, yyyy") : "Select end"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={rollbackEndDate}
                          onSelect={setRollbackEndDate}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setShowBulkRollback(false);
                      setRollbackStartDate(undefined);
                      setRollbackEndDate(undefined);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1"
                    onClick={handleBulkRollback}
                    disabled={!rollbackStartDate || !rollbackEndDate}
                  >
                    Apply Rollback
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        
        <div className="space-y-6">
          {/* Period Selector */}
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">Time Period:</span>
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">7 days</SelectItem>
                <SelectItem value="30d">30 days</SelectItem>
                <SelectItem value="90d">90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-center">
                  <Gavel className="h-8 w-8 mx-auto mb-2 text-red-600" />
                  <p className="text-2xl font-bold">{staff.punishmentsIssued}</p>
                  <p className="text-xs text-muted-foreground">Punishments Issued</p>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="text-center">
                  <FileText className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                  <p className="text-2xl font-bold">{staff.ticketResponses}</p>
                  <p className="text-xs text-muted-foreground">Tickets Handled</p>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="text-center">
                  <Eye className="h-8 w-8 mx-auto mb-2 text-green-600" />
                  <p className="text-2xl font-bold">{evidenceCount}</p>
                  <p className="text-xs text-muted-foreground">Evidence Uploaded</p>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="text-center">
                  <Clock className="h-8 w-8 mx-auto mb-2 text-purple-600" />
                  <p className="text-2xl font-bold">{staff.avgResponseTime}m</p>
                  <p className="text-xs text-muted-foreground">Avg Response Time</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Activity Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Daily Activity Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                {!staffActivityData || staffActivityData.length === 0 ? (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                    <div className="text-center">
                      <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No daily activity data available</p>
                    </div>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={staffActivityData}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="date" className="text-muted-foreground" fontSize={12} />
                      <YAxis className="text-muted-foreground" fontSize={12} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="punishments" stackId="1" stroke="#ef4444" fill="#ef4444" dot={false} activeDot={false} />
                      <Area type="monotone" dataKey="tickets" stackId="1" stroke="#3b82f6" fill="#3b82f6" dot={false} activeDot={false} />
                      <Area type="monotone" dataKey="evidence" stackId="1" stroke="#10b981" fill="#10b981" dot={false} activeDot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Punishment Types Issued</CardTitle>
              </CardHeader>
              <CardContent>
                {!punishmentTypeData || punishmentTypeData.length === 0 ? (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                    <div className="text-center">
                      <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No punishment type data available</p>
                    </div>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={punishmentTypeData}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="count"
                        label={({ type, percent }) => `${type} ${((percent || 0) * 100).toFixed(0)}%`}
                      >
                        {punishmentTypeData.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Actions Tables */}
          <div className="grid grid-cols-1 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Punishments Issued</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Player</th>
                        <th className="text-left p-2">Type</th>
                        <th className="text-left p-2">Evidence</th>
                        <th className="text-left p-2">Tickets</th>
                        <th className="text-left p-2">Duration</th>
                        <th className="text-left p-2">Date</th>
                        <th className="text-left p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentPunishments.length > 0 ? recentPunishments.map((punishment: any, index: number) => {
                        // Format duration helper function
                        const formatDuration = (duration: any) => {
                          const durationNum = typeof duration === 'number' ? duration : Number(duration);
                          if (!durationNum || durationNum === -1 || isNaN(durationNum)) return 'Permanent';
                          
                          const days = Math.floor(durationNum / (1000 * 60 * 60 * 24));
                          const hours = Math.floor((durationNum % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                          const minutes = Math.floor((durationNum % (1000 * 60 * 60)) / (1000 * 60));
                          
                          if (days > 0) return `${days}d ${hours}h`;
                          if (hours > 0) return `${hours}h ${minutes}m`;
                          return `${minutes}m`;
                        };

                        // Determine punishment status
                        const getPunishmentStatus = (punishment: any) => {
                          // Check for pardoned/appeal accepted modifications
                          const hasPardon = punishment.modifications?.some((mod: any) => 
                            mod.type === 'MANUAL_PARDON' || 
                            mod.type === 'APPEAL_ACCEPT' || 
                            mod.type === 'Pardoned' || 
                            mod.type === 'Appeal Accepted' ||
                            mod.type === 'Appeal Approved'
                          );
                          
                          if (hasPardon || punishment.rolledBack) {
                            return { status: 'Pardoned', variant: 'outline' as const, color: 'text-green-600' };
                          }
                          
                          if (punishment.active === false) {
                            return { status: 'Inactive', variant: 'secondary' as const, color: 'text-gray-600' };
                          }
                          
                          return { status: 'Active', variant: 'default' as const, color: 'text-blue-600' };
                        };

                        const statusInfo = getPunishmentStatus(punishment);

                        return (
                          <tr key={index} className="border-b">
                            <td className="p-2 font-medium">
                              <Button
                                variant="link"
                                className="p-0 h-auto font-medium text-left"
                                onClick={() => openPlayerWindow(punishment.playerId, punishment.playerName)}
                              >
                                {punishment.playerName || 'Unknown'}
                              </Button>
                            </td>
                            <td className="p-2">
                              <Badge variant={punishment.type?.includes('Ban') ? 'destructive' : 'secondary'}>
                                {punishment.type}
                              </Badge>
                            </td>
                            <td className="p-2">
                              <div className="flex gap-1 flex-wrap">
                                {punishment.evidence && punishment.evidence.length > 0 ? (
                                  punishment.evidence.map((evidenceItem: any, idx: number) => {
                                    const displayText = getEvidenceDisplayText(evidenceItem);
                                    const clickUrl = getEvidenceClickUrl(evidenceItem);
                                    const shortName = getEvidenceShortName(evidenceItem);
                                    const isClickable = isEvidenceClickable(evidenceItem);
                                    
                                    return (
                                      <Badge 
                                        key={idx} 
                                        variant="outline" 
                                        className={`text-xs ${isClickable ? 'cursor-pointer hover:bg-primary/10 transition-colors' : 'cursor-default'}`}
                                        onClick={() => {
                                          if (isClickable) {
                                            window.open(clickUrl, '_blank');
                                          }
                                        }}
                                        title={isClickable ? `Click to view: ${displayText}` : displayText}
                                      >
                                        📎 {shortName}
                                      </Badge>
                                    );
                                  })
                                ) : (
                                  <span className="text-muted-foreground text-xs">No evidence</span>
                                )}
                              </div>
                            </td>
                            <td className="p-2">
                              <div className="flex gap-1 flex-wrap">
                                {punishment.attachedTicketIds && punishment.attachedTicketIds.length > 0 ? (
                                  punishment.attachedTicketIds.map((ticketId: any, idx: number) => {
                                    const ticketStr = typeof ticketId === 'string' ? ticketId : String(ticketId);
                                    return (
                                      <Badge 
                                        key={idx} 
                                        variant="outline" 
                                        className="text-xs cursor-pointer hover:bg-primary/10 transition-colors"
                                        onClick={() => {
                                          // Navigate to ticket page or open ticket modal
                                          window.open(`/tickets/${ticketStr}`, '_blank');
                                        }}
                                        title={`Click to view ticket: #${ticketStr}`}
                                      >
                                        🎫 #{ticketStr.substring(0, 8)}
                                      </Badge>
                                    );
                                  })
                                ) : (
                                  <span className="text-muted-foreground text-xs">No tickets</span>
                                )}
                              </div>
                            </td>
                            <td className="p-2">{formatDuration(punishment.duration)}</td>
                            <td className="p-2">{format(new Date(punishment.issued), 'MMM d, yyyy')}</td>
                            <td className="p-2">
                              <div className="flex items-center gap-2">
                                <Badge variant={statusInfo.variant} className={`text-xs ${statusInfo.color}`}>
                                  {statusInfo.status}
                                </Badge>
                                {statusInfo.status === 'Active' && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs h-5 px-1"
                                    onClick={async () => {
                                      try {
                                                                          
                                        const { csrfFetch } = await import('@/utils/csrf');
                                        const response = await csrfFetch(`/api/panel/audit/punishment/${punishment.id}/rollback`, {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ reason: 'Staff rollback from analytics panel' })
                                        });
                                        
                                        const responseData = await response.json();
                                        console.log('Rollback response:', responseData);
                                        
                                        if (!response.ok) {
                                          throw new Error(responseData.error || `HTTP ${response.status}: ${response.statusText}`);
                                        }
                                        
                                        // Show success message
                                        toast({
                                          title: "Punishment Rolled Back",
                                          description: `Punishment rolled back successfully: ${responseData.message}`
                                        });
                                        
                                        // Refresh the modal data
                                        refetch();
                                      } catch (error) {
                                        console.error('Rollback error:', error);
                                        toast({
                                          title: "Rollback Failed",
                                          description: `Failed to rollback punishment: ${error instanceof Error ? error.message : 'Unknown error'}`,
                                          variant: "destructive"
                                        });
                                      }
                                    }}
                                    title="Rollback this punishment"
                                  >
                                    <Undo2 className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      }) : (
                        <tr>
                          <td colSpan={7} className="p-4 text-center text-muted-foreground">
                            No recent punishments found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Ticket Responses</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Ticket ID</th>
                        <th className="text-left p-2">Subject</th>
                        <th className="text-left p-2">Status</th>
                        <th className="text-left p-2">Replies</th>
                        <th className="text-left p-2">Time Since Opened</th>
                        <th className="text-left p-2">Time Since Last Activity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentTickets && recentTickets.length > 0 ? recentTickets.map((ticket: any, index: number) => {
                        const timeSinceOpened = formatDurationDetailed(new Date(ticket.created || ticket.createdAt || ticket.timestamp));
                        const timeSinceLastActivity = ticket.lastActivity ? formatDurationDetailed(new Date(ticket.lastActivity)) : 
                                                     ticket.updatedAt ? formatDurationDetailed(new Date(ticket.updatedAt)) : '--';
                        
                        return (
                          <tr key={index} className="border-b">
                            <td className="p-2 font-medium">
                              <Button
                                variant="link"
                                className="p-0 h-auto font-medium text-left"
                                onClick={() => window.open(`/panel/tickets/${ticket.ticketId || ticket.id}`, '_blank')}
                              >
                                #{ticket.ticketId || ticket.id}
                              </Button>
                            </td>
                            <td className="p-2">{ticket.subject || ticket.title || 'No subject'}</td>
                            <td className="p-2">
                              <Badge variant={ticket.status === 'resolved' || ticket.status === 'Resolved' || ticket.status === 'closed' || ticket.status === 'Closed' ? 'outline' : 'secondary'}>
                                {ticket.status}
                              </Badge>
                            </td>
                            <td className="p-2">{ticket.replyCount || 0}</td>
                            <td className="p-2">{timeSinceOpened}</td>
                            <td className="p-2">{timeSinceLastActivity}</td>
                          </tr>
                        );
                      }) : (
                        <tr>
                          <td colSpan={6} className="p-4 text-center text-muted-foreground">
                            {staffDetails ? 'No recent ticket responses found' : 'Loading ticket responses...'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Staff row component with click to open detail modal
const StaffDetailRow = ({ staff }: { staff: StaffMember }) => {
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  return (
    <>
      <tr 
        key={staff.id} 
        className="border-b hover:bg-muted/50 cursor-pointer transition-colors" 
        onClick={() => setIsDetailModalOpen(true)}
      >
        <td className="p-2 font-medium flex items-center gap-2">
          {staff.username}
          <Eye className="h-4 w-4 text-muted-foreground" />
        </td>
        <td className="p-2">
          <Badge variant="outline">{staff.role}</Badge>
        </td>
        <td className="p-2">{staff.ticketResponses}</td>
        <td className="p-2">{staff.punishmentsIssued}</td>
        <td className="p-2">{staff.notesAdded || 0}</td>
        <td className="p-2 font-medium">{staff.totalActions}</td>
      </tr>
      
      <StaffDetailModal 
        staff={staff}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
      />
    </>
  );
};

// API function to fetch detailed staff data
const fetchStaffDetails = async (username: string, period: string) => {
  const response = await fetch(`/api/panel/audit/staff/${username}/details?period=${period}`);
  if (!response.ok) throw new Error('Failed to fetch staff details');
  return response.json();
};

// Ticket Analytics Section Component
const TicketAnalyticsSection = ({ analyticsPeriod }: { analyticsPeriod: string }) => {
  // Define the correct ticket categories
  const ticketCategories = ['Bug', 'Support', 'Appeal', 'Player Report', 'Chat Report', 'Application'];
  
  // State for selected categories
  const [selectedCategories, setSelectedCategories] = useState<string[]>(ticketCategories);
  
  // Normalize category names for data keys (lowercase, spaces to underscores)
  const normalizeCategory = (category: string) => {
    return category.toLowerCase().replace(/\s+/g, '_');
  };

  const { data: ticketAnalytics } = useQuery({
    queryKey: ['ticket-analytics', analyticsPeriod],
    queryFn: () => fetchTicketAnalytics(analyticsPeriod),
    staleTime: 5 * 60 * 1000
  });

  // Process data for the chart
  const chartData = useMemo(() => {
    if (!ticketAnalytics) return [];

    const dateMap = new Map();
    
    // Process daily trend data
    ticketAnalytics.dailyTrendByCategory?.forEach((item: any) => {
      const date = item._id.date;
      const rawCategory = item._id.category || 'Other';
      const category = normalizeCategory(rawCategory);
      const status = item._id.status?.toLowerCase();
      
      // Only process if category is selected
      if (!selectedCategories.some(cat => normalizeCategory(cat) === category)) {
        return;
      }
      
      if (!dateMap.has(date)) {
        dateMap.set(date, { 
          date, 
          opened_overall: 0, 
          closed_overall: 0, 
          responseTime_overall: 0,
          responseTimeCount: 0 
        });
      }
      
      const dayData = dateMap.get(date);
      
      // Count opened tickets
      dayData.opened_overall = (dayData.opened_overall || 0) + item.count;
      
      // Count closed tickets
      if (status === 'resolved' || status === 'closed') {
        dayData.closed_overall = (dayData.closed_overall || 0) + item.count;
      }
    });

    // Process response time data
    ticketAnalytics.responseTimeByCategory?.forEach((item: any) => {
      const date = item._id.date;
      const rawCategory = item._id.category || 'Other';
      const category = normalizeCategory(rawCategory);
      const responseTimeHours = item.avgResponseTimeMs / (1000 * 60 * 60);
      
      // Only process if category is selected
      if (!selectedCategories.some(cat => normalizeCategory(cat) === category)) {
        return;
      }
      
      if (!dateMap.has(date)) {
        dateMap.set(date, { 
          date, 
          opened_overall: 0, 
          closed_overall: 0, 
          responseTime_overall: 0,
          responseTimeCount: 0 
        });
      }
      
      const dayData = dateMap.get(date);
      
      // Accumulate response times for averaging
      dayData.responseTime_overall = (dayData.responseTime_overall || 0) + responseTimeHours;
      dayData.responseTimeCount = (dayData.responseTimeCount || 0) + 1;
    });

    // Calculate averages and fill in missing dates
    const allDates = Array.from(dateMap.keys()).sort();
    const filledData = allDates.map(date => {
      const dayData = dateMap.get(date) || { 
        date, 
        opened_overall: 0, 
        closed_overall: 0, 
        responseTime_overall: 0,
        responseTimeCount: 0 
      };
      
      // Calculate average response time
      if (dayData.responseTimeCount > 0) {
        dayData.responseTime_overall = dayData.responseTime_overall / dayData.responseTimeCount;
      } else {
        dayData.responseTime_overall = 0;
      }
      
      // Clean up temporary count field
      delete dayData.responseTimeCount;
      
      return dayData;
    });

    return filledData;
  }, [ticketAnalytics, selectedCategories]);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium">Ticket Analytics</h3>
      
      {/* Average Resolution Times by Category */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Average Resolution Time by Category</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Overall */}
            <div className="p-4 border rounded">
              <h4 className="font-medium text-sm">Overall</h4>
              <p className="text-2xl font-bold">{ticketAnalytics?.overallAvgResolution?.display || '0s'}</p>
              <p className="text-xs text-muted-foreground">
                {ticketAnalytics?.totalFinishedTickets || 0} finished tickets
              </p>
            </div>
            
            {/* By Category */}
            {(ticketAnalytics?.avgResolutionByCategory || []).map((cat: any, index: number) => (
              <div key={index} className="p-4 border rounded">
                <h4 className="font-medium text-sm capitalize">{cat.category || 'Uncategorized'}</h4>
                <p className="text-2xl font-bold">{cat.display}</p>
                <p className="text-xs text-muted-foreground">
                  {cat.ticketCount} tickets
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Overall Ticket Trends Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Overall Ticket Trends</CardTitle>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-0.5 bg-blue-500"></div>
                <span>Average Response Time (hours)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-0.5 bg-green-500"></div>
                <span>Tickets Opened</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-0.5 bg-red-500"></div>
                <span>Tickets Closed</span>
              </div>
            </div>
            
            {/* Category Selection */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-48 justify-between">
                  Categories ({selectedCategories.length})
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2">
                <div className="space-y-2">
                  {/* Select All checkbox */}
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="select-all-categories"
                      checked={selectedCategories.length === ticketCategories.length}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedCategories(ticketCategories);
                        } else {
                          setSelectedCategories([]);
                        }
                      }}
                    />
                    <label 
                      htmlFor="select-all-categories"
                      className="text-sm font-medium cursor-pointer"
                    >
                      Select All
                    </label>
                  </div>
                  <Separator />
                  
                  {/* Individual category checkboxes */}
                  {ticketCategories.map(category => {
                    const isSelected = selectedCategories.includes(category);
                    
                    return (
                      <div key={category} className="flex items-center space-x-2">
                        <Checkbox
                          id={`category-${category}`}
                          checked={isSelected}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedCategories(prev => [...prev, category]);
                            } else {
                              setSelectedCategories(prev => prev.filter(c => c !== category));
                            }
                          }}
                        />
                        <label 
                          htmlFor={`category-${category}`}
                          className="text-sm cursor-pointer"
                        >
                          {category}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </CardHeader>
        <CardContent>
          {!chartData || chartData.length === 0 ? (
            <div className="flex items-center justify-center h-[400px] text-muted-foreground">
              <div className="text-center">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No ticket trend data available</p>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis 
                  dataKey="date" 
                  className="text-muted-foreground"
                  fontSize={12}
                />
                <YAxis 
                  className="text-muted-foreground"
                  fontSize={12}
                />
                <Tooltip 
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-background border border-border rounded-lg p-3 shadow-md">
                          <p className="text-sm font-medium mb-2">{label}</p>
                          {payload.map((entry, index) => (
                            <div key={index} className="flex items-center gap-2 text-sm">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: entry.color }}
                              />
                              <span className="text-muted-foreground">{entry.name}:</span>
                              <span className="font-medium">
                                {entry.name?.includes('Response Time') 
                                  ? `${Number(entry.value).toFixed(1)}h`
                                  : entry.value
                                }
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  }}
                  allowEscapeViewBox={{ x: false, y: false }}
                />
                
                {/* Average Response Time Line */}
                <Line
                  type="monotone"
                  dataKey="responseTime_overall"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  name="Average Response Time (hours)"
                  connectNulls={true}
                  dot={false}
                  activeDot={false}
                />
                
                {/* Opened Tickets Line */}
                <Line
                  type="monotone"
                  dataKey="opened_overall"
                  stroke="#10b981"
                  strokeWidth={2}
                  name="Tickets Opened"
                  dot={false}
                  activeDot={false}
                />
                
                {/* Closed Tickets Line */}
                <Line
                  type="monotone"
                  dataKey="closed_overall"
                  stroke="#ef4444"
                  strokeWidth={2}
                  name="Tickets Closed"
                  dot={false}
                  activeDot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const AuditLog = () => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [dateRange, setDateRange] = useState<{from: Date | undefined, to: Date | undefined}>({
    from: undefined,
    to: undefined
  });
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  
  const itemsPerPage = 20;
  
  const { data: logsData, isLoading, error, refetch, isRefetching } = useLogs();
  
  const transformedLogs = useMemo(() => {
    return (logsData as DatabaseLog[] || []).map((log): TransformedLog => {
      const details = getActionDetails(log.level, log.source, log.description);
      const logDate = new Date(log.created);
      
      return {
        ...log,
        ...details,
        formattedTime: format(logDate, 'MMM d, yyyy HH:mm:ss'),
        relativeTime: formatRelativeTime(logDate)
      };
    });
  }, [logsData]);
  
  const filteredLogs = useMemo(() => {
    return transformedLogs.filter(log => {
      if (searchQuery && !log.description.toLowerCase().includes(searchQuery.toLowerCase()) && 
          !log.source.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      
      if (actionFilter !== "all" && log.actionType !== actionFilter) {
        return false;
      }
      
      if (severityFilter !== "all" && log.level !== severityFilter) {
        return false;
      }
      
      if (dateRange.from || dateRange.to) {
        const logDate = new Date(log.created);
        if (dateRange.from && logDate < startOfDay(dateRange.from)) return false;
        if (dateRange.to && logDate > endOfDay(dateRange.to)) return false;
      }
      
      return true;
    });
  }, [transformedLogs, searchQuery, actionFilter, severityFilter, dateRange]);
  
  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredLogs, currentPage]);
  
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  
  // Analytics data
  const analyticsData = useMemo(() => {
    const last24h = subDays(new Date(), 1);
    const last7d = subDays(new Date(), 7);
    
    const logs24h = transformedLogs.filter(log => new Date(log.created) >= last24h);
    const logs7d = transformedLogs.filter(log => new Date(log.created) >= last7d);
    
    // Activity trends for the past 7 days
    const dailyActivity = Array.from({ length: 7 }, (_, i) => {
      const date = subDays(new Date(), 6 - i);
      const dayLogs = transformedLogs.filter(log => {
        const logDate = new Date(log.created);
        return logDate >= startOfDay(date) && logDate <= endOfDay(date);
      });
      
      return {
        date: format(date, 'MMM dd'),
        total: dayLogs.length,
        moderation: dayLogs.filter(log => log.actionType === 'moderation').length,
        tickets: dayLogs.filter(log => log.actionType === 'ticket').length,
        errors: dayLogs.filter(log => log.level === 'error').length
      };
    });
    
    // Action type distribution
    const actionDistribution = [
      { name: 'Moderation', value: transformedLogs.filter(log => log.actionType === 'moderation').length, color: '#ff6b6b' },
      { name: 'Tickets', value: transformedLogs.filter(log => log.actionType === 'ticket').length, color: '#4ecdc4' },
      { name: 'System', value: transformedLogs.filter(log => log.actionType === 'system').length, color: '#45b7d1' },
      { name: 'User Actions', value: transformedLogs.filter(log => log.actionType === 'user').length, color: '#96ceb4' },
      { name: 'Settings', value: transformedLogs.filter(log => log.actionType === 'settings').length, color: '#ffeaa7' },
      { name: 'Errors', value: transformedLogs.filter(log => log.actionType === 'error').length, color: '#fd79a8' }
    ].filter(item => item.value > 0);
    
    return {
      total24h: logs24h.length,
      total7d: logs7d.length,
      errors: logs24h.filter(log => log.level === 'error').length,
      warnings: logs24h.filter(log => log.level === 'warning').length,
      moderations: logs24h.filter(log => log.actionType === 'moderation').length,
      tickets: logs24h.filter(log => log.actionType === 'ticket').length,
      dailyActivity,
      actionDistribution
    };
  }, [transformedLogs]);
  
  // Comprehensive analytics data
  const [analyticsPeriod, setAnalyticsPeriod] = useState('30d');
  
  const { data: analyticsOverview } = useQuery({
    queryKey: ['analytics-overview'],
    queryFn: fetchAnalyticsOverview,
    staleTime: 5 * 60 * 1000
  });
  
  const { data: staffPerformanceData = [] } = useQuery({
    queryKey: ['staff-performance', analyticsPeriod],
    queryFn: () => fetchStaffPerformance(analyticsPeriod),
    staleTime: 5 * 60 * 1000
  });
  
  const { data: ticketAnalytics } = useQuery({
    queryKey: ['ticket-analytics', analyticsPeriod],
    queryFn: () => fetchTicketAnalytics(analyticsPeriod),
    staleTime: 5 * 60 * 1000
  });
  
  const { data: punishmentAnalytics } = useQuery({
    queryKey: ['punishment-analytics', analyticsPeriod],
    queryFn: () => fetchPunishmentAnalytics(analyticsPeriod),
    staleTime: 5 * 60 * 1000
  });
  
  const { data: playerActivity } = useQuery({
    queryKey: ['player-activity', analyticsPeriod],
    queryFn: () => fetchPlayerActivity(analyticsPeriod),
    staleTime: 5 * 60 * 1000
  });
  
  const { data: auditLogsAnalytics } = useQuery({
    queryKey: ['audit-logs-analytics', '7d'],
    queryFn: () => fetchAuditLogsAnalytics('7d'),
    staleTime: 5 * 60 * 1000
  });
  
  const toggleLogExpansion = useCallback((logId: string) => {
    setExpandedLogs(prev => {
      const next = new Set(prev);
      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }
      return next;
    });
  }, []);
  
  const handleExport = useCallback(async (format: 'csv' | 'json') => {
    setIsExporting(true);
    try {
      let content: string;
      let filename: string;
      let mimeType: string;
      
      if (format === 'csv') {
        const headers = ['Time', 'Level', 'Source', 'Description', 'Type'];
        const rows = filteredLogs.map(log => [
          log.formattedTime,
          log.level,
          log.source,
          log.description.replace(/"/g, '""'),
          log.actionType
        ]);
        
        content = [
          headers.join(','),
          ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');
        
        filename = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
        mimeType = 'text/csv';
      } else {
        content = JSON.stringify(filteredLogs.map(log => ({
          time: log.created,
          level: log.level,
          source: log.source,
          description: log.description,
          type: log.actionType,
          metadata: log.metadata
        })), null, 2);
        
        filename = `audit-logs-${new Date().toISOString().split('T')[0]}.json`;
        mimeType = 'application/json';
      }
      
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Export successful",
        description: `Audit logs exported as ${format.toUpperCase()}`
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export audit logs",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  }, [filteredLogs, toast]);
  
  const setPresetDateRange = useCallback((preset: string) => {
    const now = new Date();
    switch (preset) {
      case 'today':
        setDateRange({ from: startOfDay(now), to: endOfDay(now) });
        break;
      case 'yesterday':
        const yesterday = subDays(now, 1);
        setDateRange({ from: startOfDay(yesterday), to: endOfDay(yesterday) });
        break;
      case 'last7days':
        setDateRange({ from: subDays(now, 7), to: now });
        break;
      case 'last30days':
        setDateRange({ from: subDays(now, 30), to: now });
        break;
      case 'all':
        setDateRange({ from: undefined, to: undefined });
        break;
    }
  }, []);

  return (
    <PageContainer>
      <div className="flex flex-col space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Analytics & Audit Dashboard</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Comprehensive system monitoring, analytics, staff performance, and audit controls
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={analyticsPeriod} onValueChange={setAnalyticsPeriod}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">7 days</SelectItem>
                <SelectItem value="30d">30 days</SelectItem>
                <SelectItem value="90d">90 days</SelectItem>
              </SelectContent>
            </Select>
            <DatabaseExplorerModal />
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isRefetching}
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", isRefetching && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>
        
        {/* Tabbed Interface */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="staff">Staff</TabsTrigger>
            <TabsTrigger value="tickets">Tickets</TabsTrigger>
            <TabsTrigger value="punishments">Punishments</TabsTrigger>
            <TabsTrigger value="players">Players</TabsTrigger>
            <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="space-y-6">
            {/* Overview Statistics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Tickets</p>
                      <p className="text-2xl font-bold">{analyticsOverview?.overview.totalTickets || 0}</p>
                      <p className="text-xs text-muted-foreground flex items-center mt-1">
                        {analyticsOverview?.overview.ticketChange >= 0 ? (
                          <TrendingUp className="h-3 w-3 mr-1 text-green-600" />
                        ) : (
                          <TrendingDown className="h-3 w-3 mr-1 text-red-600" />
                        )}
                        {Math.abs(analyticsOverview?.overview.ticketChange || 0)}% vs last period
                      </p>
                    </div>
                    <FileText className="h-8 w-8 text-blue-600" />
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Players</p>
                      <p className="text-2xl font-bold">{analyticsOverview?.overview.totalPlayers || 0}</p>
                      <p className="text-xs text-muted-foreground flex items-center mt-1">
                        {analyticsOverview?.overview.playerChange >= 0 ? (
                          <TrendingUp className="h-3 w-3 mr-1 text-green-600" />
                        ) : (
                          <TrendingDown className="h-3 w-3 mr-1 text-red-600" />
                        )}
                        {Math.abs(analyticsOverview?.overview.playerChange || 0)}% vs last period
                      </p>
                    </div>
                    <User className="h-8 w-8 text-green-600" />
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Staff Members</p>
                      <p className="text-2xl font-bold">{analyticsOverview?.overview.totalStaff || 0}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Active: {staffPerformanceData.filter((s: any) => new Date(s.lastActive) > subDays(new Date(), 7)).length}
                      </p>
                    </div>
                    <Users className="h-8 w-8 text-purple-600" />
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Active Tickets</p>
                      <p className="text-2xl font-bold">{analyticsOverview?.overview.activeTickets || 0}</p>
                      <p className="text-xs text-muted-foreground mt-1">Open & pending</p>
                    </div>
                    <AlertCircle className="h-8 w-8 text-orange-600" />
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* Quick Analytics Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Ticket Trends</CardTitle>
                </CardHeader>
                <CardContent>
                  {!ticketAnalytics?.dailyTrend || ticketAnalytics.dailyTrend.length === 0 ? (
                    <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                      <div className="text-center">
                        <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No ticket trend data available</p>
                      </div>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={ticketAnalytics.dailyTrend}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="date" className="text-muted-foreground" fontSize={12} />
                        <YAxis className="text-muted-foreground" fontSize={12} />
                        <Tooltip content={<CustomTooltip />} />
                        <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Punishment Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  {!punishmentAnalytics?.byType || punishmentAnalytics.byType.length === 0 ? (
                    <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                      <div className="text-center">
                        <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No punishment data available</p>
                      </div>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={punishmentAnalytics.byType}
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          stroke="#434341"
                          strokeWidth={1}
                          fill="#8884d8"
                          dataKey="count"
                          label={({ type, percent }) => `${type} ${((percent || 0) * 100).toFixed(0)}%`}
                        >
                          {punishmentAnalytics.byType.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="staff" className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Staff Performance Analytics</h3>
              <div className="text-sm text-muted-foreground">
                Click on any staff member to view detailed analytics and rollback options
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Actions by Staff Member</CardTitle>
                </CardHeader>
                <CardContent>
                  {!staffPerformanceData || staffPerformanceData.length === 0 ? (
                    <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                      <div className="text-center">
                        <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No staff performance data available</p>
                      </div>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={staffPerformanceData}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="username" className="text-muted-foreground" fontSize={12} />
                        <YAxis className="text-muted-foreground" fontSize={12} />
                        <Tooltip cursor={false} content={<CustomTooltip formatName={(name: any) => name === "totalActions" ? "Total Actions" : name} />} />
                        <Bar dataKey="totalActions" fill="#8884d8" style={{ filter: 'none' }} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Ticket Responses</CardTitle>
                </CardHeader>
                <CardContent>
                  {!staffPerformanceData || staffPerformanceData.length === 0 ? (
                    <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                      <div className="text-center">
                        <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No staff ticket response data available</p>
                      </div>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={staffPerformanceData}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="username" className="text-muted-foreground" fontSize={12} />
                        <YAxis className="text-muted-foreground" fontSize={12} />
                        <Tooltip cursor={false} content={<CustomTooltip formatName={(name: any) => name === "ticketResponses" ? "Ticket Responses" : name} />} />
                        <Bar dataKey="ticketResponses" fill="#82ca9d" style={{ filter: 'none' }} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Staff Activity Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Username</th>
                        <th className="text-left p-2">Role</th>
                        <th className="text-left p-2">Ticket Responses</th>
                        <th className="text-left p-2">Punishments Issued</th>
                        <th className="text-left p-2">Notes Added</th>
                        <th className="text-left p-2">Total Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffPerformanceData.map((staff: any) => (
                        <StaffDetailRow key={staff.id} staff={staff} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="tickets" className="space-y-6">
            <TicketAnalyticsSection analyticsPeriod={analyticsPeriod} />
          </TabsContent>
          
          <TabsContent value="punishments" className="space-y-6">
            <h3 className="text-lg font-medium">Punishment Analytics</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Punishments by Type</CardTitle>
                </CardHeader>
                <CardContent>
                  {!punishmentAnalytics?.byType || punishmentAnalytics.byType.length === 0 ? (
                    <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                      <div className="text-center">
                        <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No punishment type data available</p>
                      </div>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={punishmentAnalytics.byType}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="type" className="text-muted-foreground" fontSize={12} />
                        <YAxis className="text-muted-foreground" fontSize={12} />
                        <Tooltip cursor={false} content={<CustomTooltip formatName={(name: any) => name === "count" ? "Count" : name} />} />
                        <Bar dataKey="count" fill="#ef4444" style={{ filter: 'none' }} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Daily Punishment Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  {!punishmentAnalytics?.dailyTrend || punishmentAnalytics.dailyTrend.length === 0 ? (
                    <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                      <div className="text-center">
                        <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No punishment trend data available</p>
                      </div>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={punishmentAnalytics.dailyTrend}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="date" className="text-muted-foreground" fontSize={12} />
                        <YAxis className="text-muted-foreground" fontSize={12} />
                        <Tooltip content={<CustomTooltip formatName={(name: any) => name === "count" ? "Count" : name} />} />
                        <Line type="monotone" dataKey="count" stroke="#ef4444" strokeWidth={2} dot={{r:0}} activeDot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Punishers (Staff)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(punishmentAnalytics?.topPunishers || []).map((staff: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-blue-600" />
                        <span className="font-medium">{staff.staffName}</span>
                        <Badge variant="outline" className="text-xs">{staff.role}</Badge>
                      </div>
                      <Badge variant="secondary">{staff.punishmentCount}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="players" className="space-y-6">
            <h3 className="text-lg font-medium">Player Activity Analytics</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">New Players Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  {!playerActivity?.newPlayersTrend || playerActivity.newPlayersTrend.length === 0 ? (
                    <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                      <div className="text-center">
                        <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No new player trend data available</p>
                      </div>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={250}>
                      <AreaChart data={playerActivity.newPlayersTrend}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="date" className="text-muted-foreground" fontSize={12} />
                        <YAxis className="text-muted-foreground" fontSize={12} />
                        <Tooltip content={<CustomTooltip />} />
                        <Area type="monotone" dataKey="count" stroke="#10b981" fill="#10b981" fillOpacity={0.3} dot={false} activeDot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Logins by Country</CardTitle>
                </CardHeader>
                <CardContent>
                  {!playerActivity?.loginsByCountry || playerActivity.loginsByCountry.length === 0 ? (
                    <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                      <div className="text-center">
                        <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No login data available</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 py-4">
                      {playerActivity.loginsByCountry.slice(0, 8).map((country: any, index: number) => (
                        <div key={index} className="flex items-center justify-between">
                          <span>{country.country}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-20 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                              <div 
                                className="bg-blue-600 h-2 rounded-full" 
                                style={{ 
                                  width: `${(country.count / Math.max(...playerActivity.loginsByCountry.map((c: any) => c.count))) * 100}%` 
                                }}
                              />
                            </div>
                            <span className="text-sm font-medium">{country.count}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Security Alerts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 border rounded bg-orange-50 dark:bg-orange-950/20">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                      <span className="font-medium">Proxy Connections</span>
                    </div>
                    <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                      {playerActivity?.suspiciousActivity?.proxyCount || 0}
                    </p>
                    <p className="text-sm text-muted-foreground">In selected period</p>
                  </div>
                  
                  <div className="p-4 border rounded bg-red-50 dark:bg-red-950/20">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                      <span className="font-medium">Hosting IPs</span>
                    </div>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                      {playerActivity?.suspiciousActivity?.hostingCount || 0}
                    </p>
                    <p className="text-sm text-muted-foreground">In selected period</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="audit" className="space-y-6">
            <h3 className="text-lg font-medium">System Audit Logs</h3>
            
            {/* Audit Statistics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total (24h)</p>
                      <p className="text-2xl font-bold">{analyticsData.total24h}</p>
                    </div>
                    <Activity className="h-8 w-8 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Errors</p>
                      <p className="text-2xl font-bold text-destructive">{analyticsData.errors}</p>
                    </div>
                    <AlertCircle className="h-8 w-8 text-destructive" />
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Warnings</p>
                      <p className="text-2xl font-bold text-warning">{analyticsData.warnings}</p>
                    </div>
                    <AlertTriangle className="h-8 w-8 text-warning" />
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Mod Actions</p>
                      <p className="text-2xl font-bold">{analyticsData.moderations}</p>
                    </div>
                    <Shield className="h-8 w-8 text-primary" />
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* Audit Log Analytics Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Logs by Level</CardTitle>
                </CardHeader>
                <CardContent>
                  {!auditLogsAnalytics?.byLevel || auditLogsAnalytics.byLevel.length === 0 ? (
                    <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                      <div className="text-center">
                        <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No log level data available</p>
                      </div>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={auditLogsAnalytics.byLevel}
                          cx="50%"
                          cy="50%"
                          outerRadius={60}
                          fill="#8884d8"
                          dataKey="count"
                          label={({ level, percent }) => `${level} ${((percent || 0) * 100).toFixed(0)}%`}
                        >
                          {auditLogsAnalytics.byLevel.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Hourly Activity (24h)</CardTitle>
                </CardHeader>
                <CardContent>
                  {!auditLogsAnalytics?.hourlyTrend || auditLogsAnalytics.hourlyTrend.length === 0 ? (
                    <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                      <div className="text-center">
                        <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No hourly activity data available</p>
                      </div>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={auditLogsAnalytics.hourlyTrend}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="hour" className="text-muted-foreground" fontSize={12} />
                        <YAxis className="text-muted-foreground" fontSize={12} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="count" fill="#8884d8" style={{ filter: 'none' }} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
            
            {/* Filters */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium flex items-center">
                  <Filter className="h-4 w-4 mr-2" />
                  Advanced Filters
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search logs..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  
                  <Select value={actionFilter} onValueChange={setActionFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Actions" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Actions</SelectItem>
                      <SelectItem value="moderation">Moderation</SelectItem>
                      <SelectItem value="user">User Actions</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                      <SelectItem value="error">Errors</SelectItem>
                      <SelectItem value="ticket">Tickets</SelectItem>
                      <SelectItem value="settings">Settings</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Select value={severityFilter} onValueChange={setSeverityFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Levels" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Levels</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="moderation">Moderation</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="justify-start text-left font-normal">
                        <Calendar className="mr-2 h-4 w-4" />
                        {dateRange.from ? (
                          dateRange.to ? (
                            <>
                              {format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d")}
                            </>
                          ) : (
                            format(dateRange.from, "MMM d, yyyy")
                          )
                        ) : (
                          <span>Pick a date range</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <div className="p-3 space-y-2">
                        <div className="flex flex-col gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="justify-start"
                            onClick={() => setPresetDateRange('today')}
                          >
                            Today
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="justify-start"
                            onClick={() => setPresetDateRange('yesterday')}
                          >
                            Yesterday
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="justify-start"
                            onClick={() => setPresetDateRange('last7days')}
                          >
                            Last 7 days
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="justify-start"
                            onClick={() => setPresetDateRange('last30days')}
                          >
                            Last 30 days
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="justify-start"
                            onClick={() => setPresetDateRange('all')}
                          >
                            All time
                          </Button>
                        </div>
                        <Separator />
                        <CalendarComponent
                          mode="range"
                          selected={{
                            from: dateRange.from,
                            to: dateRange.to
                          }}
                          onSelect={(range: any) => setDateRange(range || { from: undefined, to: undefined })}
                          numberOfMonths={2}
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </CardContent>
            </Card>
            
            {/* Enhanced Logs */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-medium">
                    Activity Log
                    {filteredLogs.length > 0 && (
                      <span className="ml-2 text-sm text-muted-foreground">
                        ({filteredLogs.length} entries)
                      </span>
                    )}
                  </CardTitle>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" disabled={isExporting || filteredLogs.length <= 0}>
                        <Download className="h-4 w-4 mr-2" />
                        Export
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-40 p-2">
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="justify-start"
                          onClick={() => handleExport('csv')}
                        >
                          Export as CSV
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="justify-start"
                          onClick={() => handleExport('json')}
                        >
                          Export as JSON
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading && (
                  <div className="p-8 text-center">
                    <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">Loading audit logs...</p>
                  </div>
                )}
                
                {error && (
                  <div className="p-8 text-center">
                    <AlertCircle className="h-8 w-8 mx-auto mb-4 text-destructive" />
                    <p className="text-destructive">Error loading logs: {error.message}</p>
                  </div>
                )}
                
                {!isLoading && !error && filteredLogs.length === 0 && (
                  <div className="p-8 text-center">
                    <Info className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">No audit logs found matching your filters.</p>
                  </div>
                )}
                
                {!isLoading && !error && paginatedLogs.length > 0 && (
                  <div className="divide-y">
                    {paginatedLogs.map((log) => (
                      <div
                        key={log._id}
                        className={cn(
                          "p-4 hover:bg-muted/50 transition-colors",
                          expandedLogs.has(log._id) && "bg-muted/30"
                        )}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className={cn(
                              "p-2 rounded-full flex-shrink-0",
                              log.level === 'error' && "bg-destructive/10 text-destructive",
                              log.level === 'warning' && "bg-warning/10 text-warning",
                              log.level === 'moderation' && "bg-primary/10 text-primary",
                              log.level === 'info' && "bg-secondary/10 text-secondary"
                            )}>
                              {log.icon}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{log.source}</span>
                                <Badge 
                                  variant={log.level === 'error' ? 'destructive' : 
                                          log.level === 'warning' ? 'secondary' : 
                                          'outline'}
                                  className="text-xs"
                                >
                                  {log.userType}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {log.level}
                                </Badge>
                              </div>
                              
                              <p className="text-sm text-muted-foreground mt-1 break-words">
                                {log.description}
                              </p>
                              
                              {log.metadata && Object.keys(log.metadata).length > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="mt-2 h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                                  onClick={() => toggleLogExpansion(log._id)}
                                >
                                  {expandedLogs.has(log._id) ? (
                                    <>
                                      <ChevronUp className="h-3 w-3 mr-1" />
                                      Hide details
                                    </>
                                  ) : (
                                    <>
                                      <ChevronDown className="h-3 w-3 mr-1" />
                                      Show details
                                    </>
                                  )}
                                </Button>
                              )}
                              
                              {expandedLogs.has(log._id) && log.metadata && (
                                <div className="mt-3 p-3 bg-muted rounded-md">
                                  <pre className="text-xs overflow-x-auto">
                                    {JSON.stringify(log.metadata, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs text-muted-foreground">{log.relativeTime}</p>
                            <p className="text-xs text-muted-foreground mt-1">{log.formattedTime}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="p-4 border-t">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredLogs.length)} of {filteredLogs.length} entries
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                          disabled={currentPage === 1}
                        >
                          Previous
                        </Button>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pageNum;
                            if (totalPages <= 5) {
                              pageNum = i + 1;
                            } else if (currentPage <= 3) {
                              pageNum = i + 1;
                            } else if (currentPage >= totalPages - 2) {
                              pageNum = totalPages - 4 + i;
                            } else {
                              pageNum = currentPage - 2 + i;
                            }
                            
                            return (
                              <Button
                                key={pageNum}
                                variant={currentPage === pageNum ? "default" : "outline"}
                                size="sm"
                                className="w-8 h-8 p-0"
                                onClick={() => setCurrentPage(pageNum)}
                              >
                                {pageNum}
                              </Button>
                            );
                          })}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
};

export default function AuditPage() {
  return (
    <PermissionWrapper 
      permissions={[PERMISSIONS.ADMIN_AUDIT_VIEW]}
      fallback={
        <PageContainer title="Audit">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              You do not have permission to view audit logs. Only administrators can access this page.
            </AlertDescription>
          </Alert>
        </PageContainer>
      }
    >
      <AuditLog />
    </PermissionWrapper>
  );
}