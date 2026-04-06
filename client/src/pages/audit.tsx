import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Shield,
  AlertCircle,
  AlertTriangle,
  Activity,
  Bot,
  User,
  FileText,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Eye,
  Settings,
  Users,
  Clock,
  Undo2,
  Gavel,
  ArrowUpDown,
  Filter,
  Paperclip,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { getApiUrl, getCurrentDomain, apiFetch } from '@/lib/api';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@modl-gg/shared-web/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@modl-gg/shared-web/components/ui/popover';
import { Calendar as CalendarComponent } from '@modl-gg/shared-web/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogPortal } from '@modl-gg/shared-web/components/ui/dialog';
import { subDays } from 'date-fns';
import { formatDateOnly } from '@/utils/date-utils';
import { useLogs } from '@/hooks/use-data';
import { useQuery } from '@tanstack/react-query';
import PageContainer from '@/components/layout/PageContainer';
import { useToast } from '@modl-gg/shared-web/hooks/use-toast';
import { PermissionWrapper } from '@/components/PermissionWrapper';
import { PERMISSIONS } from '@/hooks/use-permissions';
import { Alert, AlertDescription } from '@modl-gg/shared-web/components/ui/alert';
import { cn } from '@modl-gg/shared-web/lib/utils';
import { usePlayerWindow } from '@/contexts/PlayerWindowContext';
import { useAuth } from '@/hooks/use-auth';
import { Checkbox } from '@modl-gg/shared-web/components/ui/checkbox';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Area, AreaChart } from 'recharts';
import { getEvidenceDisplayText, getEvidenceClickUrl, getEvidenceShortName, isEvidenceClickable } from '@/utils/evidence-utils';
import { formatTicketStatusLabel, normalizeTicketStatus } from '@/lib/ticket-enums';

interface StaffMember {
  id: string;
  username: string;
  role: string;
  totalActions: number;
  ticketResponses: number;
  punishmentsIssued: number;
  avgResponseTime: number;
  lastActive: string;
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
  return formatDateOnly(date);
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
  const response = await fetch(getApiUrl('/v1/panel/analytics/overview'), {
    credentials: 'include',
    headers: { 'X-Server-Domain': getCurrentDomain() }
  });
  if (!response.ok) throw new Error('Failed to fetch analytics overview');
  return response.json();
};

const fetchStaffPerformance = async (period = '30d') => {
  const response = await fetch(getApiUrl(`/v1/panel/audit/staff-performance?period=${period}`), {
    credentials: 'include',
    headers: { 'X-Server-Domain': getCurrentDomain() }
  });
  if (!response.ok) throw new Error('Failed to fetch staff performance');
  return response.json();
};

const fetchTicketAnalytics = async (period = '30d') => {
  const response = await fetch(getApiUrl(`/v1/panel/analytics/tickets?period=${period}`), {
    credentials: 'include',
    headers: { 'X-Server-Domain': getCurrentDomain() }
  });
  if (!response.ok) throw new Error('Failed to fetch ticket analytics');
  return response.json();
};

const fetchPunishmentAnalytics = async (period = '30d') => {
  const response = await fetch(getApiUrl(`/v1/panel/analytics/punishments?period=${period}`), {
    credentials: 'include',
    headers: { 'X-Server-Domain': getCurrentDomain() }
  });
  if (!response.ok) throw new Error('Failed to fetch punishment analytics');
  return response.json();
};

const fetchPlayerActivity = async (period = '30d') => {
  const response = await fetch(getApiUrl(`/v1/panel/analytics/player-activity?period=${period}`), {
    credentials: 'include',
    headers: { 'X-Server-Domain': getCurrentDomain() }
  });
  if (!response.ok) throw new Error('Failed to fetch player activity');
  return response.json();
};

const fetchAuditLogsAnalytics = async (period = '7d') => {
  const response = await fetch(getApiUrl(`/v1/panel/analytics/audit-logs?period=${period}`), {
    credentials: 'include',
    headers: { 'X-Server-Domain': getCurrentDomain() }
  });
  if (!response.ok) throw new Error('Failed to fetch audit logs analytics');
  return response.json();
};

const fetchPunishments = async (limit = 50, canRollback = true): Promise<PunishmentAction[]> => {
  const response = await fetch(getApiUrl(`/v1/panel/audit/punishments?limit=${limit}&canRollback=${canRollback}`), {
    credentials: 'include',
    headers: { 'X-Server-Domain': getCurrentDomain() }
  });
  if (!response.ok) throw new Error('Failed to fetch punishments');
  return response.json();
};

interface ActivePunishment {
  id: string;
  playerId: string;
  playerName: string;
  type: string;
  typeOrdinal: number;
  category: string;
  staffName: string;
  reason: string;
  duration: number | null;
  issued: string;
  started: string | null;
  expires: string | null;
  active: boolean;
  hasEvidence: boolean;
  evidenceCount: number;
  evidence: Array<{ text?: string; url?: string; type?: string; fileName?: string }>;
  attachedTicketIds: string[];
}

const fetchPunishmentsList = async (status: string): Promise<ActivePunishment[]> => {
  const response = await fetch(getApiUrl(`/v1/panel/audit/punishments/active?status=${status}`), {
    credentials: 'include',
    headers: { 'X-Server-Domain': getCurrentDomain() }
  });
  if (!response.ok) throw new Error('Failed to fetch punishments');
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
  const csrfFetch = apiFetch;
  const response = await csrfFetch(`/v1/panel/audit/punishments/${id}/rollback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason })
  });
  if (!response.ok) throw new Error('Failed to rollback punishment');
  return response.json();
};

// Staff performance modal
const StaffPerformanceModal = () => {
  const [period, setPeriod] = useState('30d');
  const { t } = useTranslation();

  const { data: staffData = [], isLoading } = useQuery({
    queryKey: ['staff-performance', period],
    queryFn: () => fetchStaffPerformance(period),
    staleTime: 5 * 60 * 1000
  });
  return (
    <Dialog modal={false}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Users className="h-4 w-4 mr-2" />
          {t('audit.staffPerformance')}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-6xl max-h-[80vh] overflow-hidden"
        {...({ overlayClassName: "pointer-events-none" } as any)}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            {t('audit.staffPerformanceAnalytics')}
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">{t('audit.period7d')}</SelectItem>
                <SelectItem value="30d">{t('audit.period30d')}</SelectItem>
                <SelectItem value="90d">{t('audit.period90d')}</SelectItem>
                <SelectItem value="all">{t('audit.periodAll')}</SelectItem>
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
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-base">{t('audit.actionsByStaff')}</CardTitle>
              </CardHeader>
              <CardContent>
                {!staffData || staffData.length === 0 ? (
                  <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                    <div className="text-center">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">{t('audit.noStaffActionData')}</p>
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
            
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-base">{t('audit.responseTimes')}</CardTitle>
              </CardHeader>
              <CardContent>
                {!staffData || staffData.length === 0 ? (
                  <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                    <div className="text-center">
                      <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">{t('audit.noResponseTimeData')}</p>
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
          
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base">{t('audit.staffActivityDetails')}</CardTitle>
            </CardHeader>
            <CardContent>
              {!staffData || staffData.length === 0 ? (
                <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                  <div className="text-center">
                    <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{t('audit.noStaffActivityData')}</p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">{t('audit.colUsername')}</th>
                        <th className="text-left p-2">{t('audit.colRole')}</th>
                        <th className="text-left p-2">{t('audit.colTotalActions')}</th>
                        <th className="text-left p-2">{t('audit.colTicketResponses')}</th>
                        <th className="text-left p-2">{t('audit.colPunishments')}</th>
                        <th className="text-left p-2">{t('audit.colAvgResponse')}</th>
                        <th className="text-left p-2">{t('audit.colLastActive')}</th>
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
              )}
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
  const { t } = useTranslation();
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
        title: t('audit.punishmentRolledBack'),
        description: t('audit.punishmentRolledBackDesc', { type: punishment.type, player: punishment.playerName })
      });
      refetch();
    } catch (error) {
      toast({
        title: t('audit.rollbackFailed'),
        description: t('audit.rollbackFailedDesc'),
        variant: "destructive"
      });
    }
  };

  const handleBulkRollback = async () => {
    if (!confirm(t('audit.bulkRollbackConfirm', { timeRange: bulkTimeRange }))) {
      return;
    }

    try {
      const csrfFetch = apiFetch;
      const response = await csrfFetch('/v1/panel/audit/punishments/bulk-rollback', {
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
        title: t('audit.bulkRollbackCompleted'),
        description: t('audit.bulkRollbackCompletedDesc', { count: data.count })
      });
      refetch();
    } catch (error) {
      toast({
        title: t('audit.bulkRollbackFailed'),
        description: t('audit.rollbackFailedDesc'),
        variant: "destructive"
      });
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Undo2 className="h-4 w-4 mr-2" />
          {t('audit.rollbackPunishments')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t('audit.rollbackCenter')}</DialogTitle>
        </DialogHeader>

        {/* Bulk Rollback Controls */}
        <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{t('audit.bulkRollback')}:</span>
            <Select value={bulkTimeRange} onValueChange={setBulkTimeRange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">{t('audit.period1h')}</SelectItem>
                <SelectItem value="6h">{t('audit.period6h')}</SelectItem>
                <SelectItem value="24h">{t('audit.period24h')}</SelectItem>
                <SelectItem value="7d">{t('audit.period7d')}</SelectItem>
                <SelectItem value="30d">{t('audit.period30d')}</SelectItem>
                <SelectItem value="all">{t('audit.periodAll')}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkRollback}
              className="ml-2"
            >
              <Undo2 className="h-4 w-4 mr-2" />
              {t('audit.executeBulkRollback')}
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
              {t('audit.noPunishmentsForRollback')}
            </div>
          ) : (
            punishments.filter(p => p.canRollback).map((punishment) => (
            <Card key={punishment.id} className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center",
                      punishment.type === 'ban' && "bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-300",
                      punishment.type === 'mute' && "bg-orange-100 dark:bg-orange-900 text-orange-600 dark:text-orange-300",
                      punishment.type === 'kick' && "bg-yellow-100 dark:bg-yellow-900 text-yellow-600 dark:text-yellow-300",
                      punishment.type === 'warn' && "bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300"
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
                    {t('audit.rollback')}
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

// Bulk punishment actions modal (superadmin only)
const BulkPunishmentActionsModal = ({ activePunishments, onSuccess }: {
  activePunishments: ActivePunishment[];
  onSuccess: () => void;
}) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [operation, setOperation] = useState<'pardon' | 'set-expiration'>('pardon');
  const [selectedTypes, setSelectedTypes] = useState<Set<number>>(new Set());
  const [reason, setReason] = useState('');
  const [durationValue, setDurationValue] = useState<number>(1);
  const [durationUnit, setDurationUnit] = useState<string>('days');
  const [isPermanent, setIsPermanent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  // Group active punishments by type with counts + preview count in single pass
  const { typeGroups, previewCount } = useMemo(() => {
    const groups = new Map<number, { name: string; count: number }>();
    let preview = 0;
    for (const p of activePunishments) {
      if (!p.active) continue;
      const existing = groups.get(p.typeOrdinal);
      if (existing) {
        existing.count++;
      } else {
        groups.set(p.typeOrdinal, { name: p.type, count: 1 });
      }
      if (selectedTypes.has(p.typeOrdinal)) preview++;
    }
    return { typeGroups: groups, previewCount: preview };
  }, [activePunishments, selectedTypes]);

  const toggleType = (ordinal: number) => {
    setSelectedTypes(prev => {
      const next = new Set(prev);
      if (next.has(ordinal)) {
        next.delete(ordinal);
      } else {
        next.add(ordinal);
      }
      return next;
    });
  };

  const durationToMs = (): number => {
    if (isPermanent) return 0;
    const multipliers: Record<string, number> = {
      minutes: 60 * 1000,
      hours: 60 * 60 * 1000,
      days: 24 * 60 * 60 * 1000,
    };
    return durationValue * (multipliers[durationUnit] || multipliers.days);
  };

  const handleSubmit = async () => {
    if (selectedTypes.size === 0) {
      toast({ title: 'No types selected', description: 'Select at least one punishment type.', variant: 'destructive' });
      return;
    }
    if (!reason.trim()) {
      toast({ title: 'Reason required', description: 'Please provide a reason.', variant: 'destructive' });
      return;
    }

    const actionLabel = operation === 'pardon' ? 'pardon' : 'set expiration on';
    if (!window.confirm(`Are you sure you want to ${actionLabel} ${previewCount} punishment(s)? This cannot be undone.`)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const endpoint = operation === 'pardon'
        ? '/v1/panel/audit/punishments/bulk-pardon'
        : '/v1/panel/audit/punishments/bulk-set-expiration';

      const body: Record<string, unknown> = {
        typeOrdinals: Array.from(selectedTypes),
        reason: reason.trim(),
      };
      if (operation === 'set-expiration') {
        body.newDurationMs = durationToMs();
      }

      const response = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || data.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      toast({
        title: operation === 'pardon' ? 'Bulk Pardon Complete' : 'Bulk Expiration Updated',
        description: data.message || `${data.count} punishment(s) affected.`,
      });
      onSuccess();
      setOpen(false);
      setSelectedTypes(new Set());
      setReason('');
    } catch (error) {
      toast({
        title: 'Operation Failed',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Gavel className="h-4 w-4 mr-2" />
          Bulk Actions
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Bulk Punishment Actions</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 overflow-auto max-h-[60vh]">
          {/* Operation toggle */}
          <div className="flex gap-2">
            <Button
              variant={operation === 'pardon' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setOperation('pardon')}
              className="flex-1"
            >
              Pardon All
            </Button>
            <Button
              variant={operation === 'set-expiration' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setOperation('set-expiration')}
              className="flex-1"
            >
              Set Expiration
            </Button>
          </div>

          {/* Punishment type checkboxes */}
          <div>
            <label className="text-sm font-medium mb-2 block">Punishment Types</label>
            {typeGroups.size === 0 ? (
              <p className="text-sm text-muted-foreground">No active punishments found.</p>
            ) : (
              <div className="space-y-2 max-h-40 overflow-auto border rounded p-2">
                {Array.from(typeGroups.entries()).map(([ordinal, { name, count }]) => (
                  <label key={ordinal} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded p-1">
                    <Checkbox
                      checked={selectedTypes.has(ordinal)}
                      onCheckedChange={() => toggleType(ordinal)}
                    />
                    <span className="text-sm flex-1">{name}</span>
                    <Badge variant="secondary" className="text-xs">{count}</Badge>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Reason input */}
          <div>
            <label className="text-sm font-medium mb-1 block">Reason</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Enter reason for this bulk action..."
              className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              maxLength={500}
            />
          </div>

          {/* Duration input (set-expiration only) */}
          {operation === 'set-expiration' && (
            <div>
              <label className="text-sm font-medium mb-1 block">New Duration</label>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-sm cursor-pointer">
                  <Checkbox
                    checked={isPermanent}
                    onCheckedChange={(checked) => setIsPermanent(checked === true)}
                  />
                  Permanent
                </label>
              </div>
              {!isPermanent && (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="number"
                    min={1}
                    value={durationValue}
                    onChange={e => setDurationValue(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <Select value={durationUnit} onValueChange={setDurationUnit}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">Minutes</SelectItem>
                      <SelectItem value="hours">Hours</SelectItem>
                      <SelectItem value="days">Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* Preview count */}
          {selectedTypes.size > 0 && (
            <div className="p-3 bg-muted/50 rounded-lg border text-sm">
              This will affect <span className="font-bold">{previewCount}</span> active punishment(s).
            </div>
          )}

          {/* Confirm button */}
          <Button
            variant="destructive"
            className="w-full"
            onClick={handleSubmit}
            disabled={isSubmitting || selectedTypes.size === 0 || !reason.trim()}
          >
            {isSubmitting ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Gavel className="h-4 w-4 mr-2" />
            )}
            {operation === 'pardon' ? `Pardon ${previewCount} Punishment(s)` : `Update Expiration for ${previewCount} Punishment(s)`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Staff detail modal for comprehensive analytics
const StaffDetailModal = ({ staff, isOpen, onClose, initialPeriod = '30d' }: {
  staff: StaffMember,
  isOpen: boolean,
  onClose: () => void,
  initialPeriod?: string
}) => {
  const [selectedPeriod, setSelectedPeriod] = useState(initialPeriod);
  const [showBulkRollback, setShowBulkRollback] = useState(false);
  const [rollbackStartDate, setRollbackStartDate] = useState<Date | undefined>(undefined);
  const [rollbackEndDate, setRollbackEndDate] = useState<Date | undefined>(undefined);
  const { toast } = useToast();
  const { t } = useTranslation();
  const { openPlayerWindow, windows } = usePlayerWindow();

  // Sync selectedPeriod with initialPeriod when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedPeriod(initialPeriod);
    }
  }, [isOpen, initialPeriod]);

  // Handler to open player window - modal stays open, player window appears on top
  const handleOpenPlayerWindow = (playerId: string, playerName: string) => {
    openPlayerWindow(playerId, playerName);
  };

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
        title: t('audit.invalidDateRange'),
        description: t('audit.invalidDateRangeDesc'),
        variant: "destructive"
      });
      return;
    }

    if (rollbackEndDate < rollbackStartDate) {
      toast({
        title: t('audit.invalidDateRange'),
        description: t('audit.endDateBeforeStart'),
        variant: "destructive"
      });
      return;
    }

    try {
      const csrfFetch = apiFetch;
      const response = await csrfFetch(`/v1/panel/audit/staff/${staff.username}/rollback-date-range`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: rollbackStartDate.toISOString(),
          endDate: rollbackEndDate.toISOString(),
          reason: `Bulk rollback for ${staff.username} from ${formatDateOnly(rollbackStartDate)} to ${formatDateOnly(rollbackEndDate)}`
        })
      });

      if (!response.ok) throw new Error('Failed to rollback');

      const data = await response.json();
      toast({
        title: t('audit.bulkRollbackCompleted'),
        description: t('audit.bulkRollbackCompletedByDesc', { count: data.count, username: staff.username })
      });

      setShowBulkRollback(false);
      setRollbackStartDate(undefined);
      setRollbackEndDate(undefined);
      // Refetch the staff details to show updated data
      refetch();
    } catch (error) {
      toast({
        title: t('audit.bulkRollbackFailed'),
        description: t('audit.rollbackFailedDesc'),
        variant: "destructive"
      });
    }
  };

  return (
    <Dialog
      open={isOpen}
      modal={false}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {isOpen && (
        <DialogPortal>
          <div
            aria-hidden="true"
            className="fixed inset-0 z-40 bg-black/80"
          />
        </DialogPortal>
      )}
      <DialogContent
        className="max-w-6xl max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => {
          const target = e.target as HTMLElement | null;
          if (target?.closest?.('[data-player-windows]')) {
            e.preventDefault();
          }
        }}
      >
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
                title={t('audit.rollbackByStaff', { username: staff.username })}
              >
                <Undo2 className="h-4 w-4 mr-2" />
                {t('audit.bulkRollback')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" align="end">
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">{t('audit.bulkRollbackFor', { username: staff.username })}</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    {t('audit.rollbackDateRangeDesc')}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">{t('audit.startDate')}</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal h-8"
                        >
                          <Calendar className="mr-2 h-3 w-3" />
                          {rollbackStartDate ? formatDateOnly(rollbackStartDate) : t('audit.selectStart')}
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
                    <label className="text-xs font-medium text-muted-foreground">{t('audit.endDate')}</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal h-8"
                        >
                          <Calendar className="mr-2 h-3 w-3" />
                          {rollbackEndDate ? formatDateOnly(rollbackEndDate) : t('audit.selectEnd')}
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
                    {t('common.cancel')}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1"
                    onClick={handleBulkRollback}
                    disabled={!rollbackStartDate || !rollbackEndDate}
                  >
                    {t('audit.applyRollback')}
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        
        <div className="space-y-6">
          {/* Period Selector */}
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">{t('audit.timePeriod')}:</span>
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">{t('audit.period7d')}</SelectItem>
                <SelectItem value="30d">{t('audit.period30d')}</SelectItem>
                <SelectItem value="90d">{t('audit.period90d')}</SelectItem>
                <SelectItem value="all">{t('audit.periodAll')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="text-center">
                  <Gavel className="h-8 w-8 mx-auto mb-2 text-red-600" />
                  <p className="text-2xl font-bold">{staff.punishmentsIssued}</p>
                  <p className="text-xs text-muted-foreground">{t('audit.statPunishmentsIssued')}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="text-center">
                  <FileText className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                  <p className="text-2xl font-bold">{staff.ticketResponses}</p>
                  <p className="text-xs text-muted-foreground">{t('audit.statTicketsHandled')}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="text-center">
                  <Eye className="h-8 w-8 mx-auto mb-2 text-green-600" />
                  <p className="text-2xl font-bold">{evidenceCount}</p>
                  <p className="text-xs text-muted-foreground">{t('audit.statEvidenceUploaded')}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="text-center">
                  <Clock className="h-8 w-8 mx-auto mb-2 text-purple-600" />
                  <p className="text-2xl font-bold">{staff.avgResponseTime}m</p>
                  <p className="text-xs text-muted-foreground">{t('audit.statAvgResponseTime')}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Activity Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-base">{t('audit.dailyActivityBreakdown')}</CardTitle>
              </CardHeader>
              <CardContent>
                {!staffActivityData || staffActivityData.length === 0 ? (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                    <div className="text-center">
                      <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">{t('audit.noDailyActivityData')}</p>
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

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-base">{t('audit.punishmentTypesIssued')}</CardTitle>
              </CardHeader>
              <CardContent>
                {!punishmentTypeData || punishmentTypeData.length === 0 ? (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                    <div className="text-center">
                      <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">{t('audit.noPunishmentTypeData')}</p>
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
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-base">{t('audit.recentPunishmentsIssued')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">{t('audit.colPlayer')}</th>
                        <th className="text-left p-2">{t('audit.colType')}</th>
                        <th className="text-left p-2">{t('audit.colEvidence')}</th>
                        <th className="text-left p-2">{t('audit.colTickets')}</th>
                        <th className="text-left p-2">{t('audit.colDuration')}</th>
                        <th className="text-left p-2">{t('audit.colDate')}</th>
                        <th className="text-left p-2">{t('audit.colStatus')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentPunishments.length > 0 ? recentPunishments.map((punishment: any, index: number) => {
                        // Format duration helper function
                        const formatDuration = (duration: any) => {
                          const durationNum = typeof duration === 'number' ? duration : Number(duration);
                          if (!durationNum || durationNum === -1 || isNaN(durationNum)) return t('audit.permanent');
                          
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
                            return { status: t('audit.pardoned'), isActive: false, variant: 'outline' as const, color: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 border-green-300 dark:border-green-700' };
                          }

                          if (punishment.active === false) {
                            return { status: t('status.inactive'), isActive: false, variant: 'outline' as const, color: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-700' };
                          }

                          return { status: t('status.active'), isActive: true, variant: 'outline' as const, color: 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700' };
                        };

                        const statusInfo = getPunishmentStatus(punishment);

                        return (
                          <tr key={index} className="border-b">
                            <td className="p-2 font-medium">
                              <Button
                                variant="link"
                                className="p-0 h-auto font-medium text-left"
                                onClick={() => handleOpenPlayerWindow(punishment.playerId, punishment.playerName)}
                              >
                                {punishment.playerName || t('audit.unknown')}
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
                                  <span className="text-muted-foreground text-xs">{t('audit.noEvidence')}</span>
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
                                  <span className="text-muted-foreground text-xs">{t('audit.noTickets')}</span>
                                )}
                              </div>
                            </td>
                            <td className="p-2">{formatDuration(punishment.duration)}</td>
                            <td className="p-2">{formatDateOnly(new Date(punishment.issued))}</td>
                            <td className="p-2">
                              <div className="flex items-center gap-2">
                                <Badge variant={statusInfo.variant} className={`text-xs ${statusInfo.color}`}>
                                  {statusInfo.status}
                                </Badge>
                                {statusInfo.isActive && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs h-5 px-1"
                                    onClick={async () => {
                                      try {
                                                                          
                                        const csrfFetch = apiFetch;
                                        const response = await csrfFetch(`/v1/panel/audit/punishment/${punishment.id}/rollback`, {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ reason: 'Staff rollback from analytics panel' })
                                        });
                                        
                                        const responseData = await response.json();

                                        if (!response.ok) {
                                          throw new Error(responseData.error || `HTTP ${response.status}: ${response.statusText}`);
                                        }
                                        
                                        // Show success message
                                        toast({
                                          title: t('audit.punishmentRolledBack'),
                                          description: t('audit.punishmentRolledBackSuccess', { message: responseData.message })
                                        });

                                        // Refresh the modal data
                                        refetch();
                                      } catch (error) {
                                        console.error('Rollback error:', error);
                                        toast({
                                          title: t('audit.rollbackFailed'),
                                          description: t('audit.rollbackFailedWithError', { error: error instanceof Error ? error.message : t('audit.unknownError') }),
                                          variant: "destructive"
                                        });
                                      }
                                    }}
                                    title={t('audit.rollbackThisPunishment')}
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
                            {t('audit.noRecentPunishments')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-base">{t('audit.recentTicketResponses')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">{t('audit.colTicketId')}</th>
                        <th className="text-left p-2">{t('audit.colSubject')}</th>
                        <th className="text-left p-2">{t('audit.colStatus')}</th>
                        <th className="text-left p-2">{t('audit.colReplies')}</th>
                        <th className="text-left p-2">{t('audit.colTimeSinceOpened')}</th>
                        <th className="text-left p-2">{t('audit.colTimeSinceActivity')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentTickets && recentTickets.length > 0 ? recentTickets.map((ticket: any, index: number) => {
                        const timeSinceOpened = formatDurationDetailed(new Date(ticket.created || ticket.createdAt || ticket.timestamp));
                        const timeSinceLastActivity = ticket.lastActivity ? formatDurationDetailed(new Date(ticket.lastActivity)) : 
                                                     ticket.updatedAt ? formatDurationDetailed(new Date(ticket.updatedAt)) : '--';
                        const normalizedStatus = normalizeTicketStatus(ticket.status);
                        const statusLabel = formatTicketStatusLabel(ticket.status);
                        
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
                            <td className="p-2">{ticket.subject || ticket.title || t('audit.noSubject')}</td>
                            <td className="p-2">
                              <Badge variant={normalizedStatus === 'closed' ? 'outline' : 'secondary'}>
                                {statusLabel}
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
                            {staffDetails ? t('audit.noRecentTicketResponses') : t('audit.loadingTicketResponses')}
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
const StaffDetailRow = ({ staff, period }: { staff: StaffMember, period: string }) => {
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
        <td className="p-2 font-medium">{staff.totalActions}</td>
      </tr>

      <StaffDetailModal
        staff={staff}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        initialPeriod={period}
      />
    </>
  );
};

// API function to fetch detailed staff data
const fetchStaffDetails = async (username: string, period: string) => {
  const response = await fetch(getApiUrl(`/v1/panel/audit/staff/${username}/details?period=${period}`), {
    credentials: 'include',
    headers: { 'X-Server-Domain': getCurrentDomain() }
  });
  if (!response.ok) throw new Error('Failed to fetch staff details');
  return response.json();
};

// Ticket Analytics Section Component
const TicketAnalyticsSection = ({ analyticsPeriod }: { analyticsPeriod: string }) => {
  const { t } = useTranslation();
  const { data: ticketAnalytics } = useQuery({
    queryKey: ['ticket-analytics', analyticsPeriod],
    queryFn: () => fetchTicketAnalytics(analyticsPeriod),
    staleTime: 5 * 60 * 1000
  });

  // Calculate totals from the data
  const totalTickets = useMemo(() => {
    return (ticketAnalytics?.byStatus || []).reduce((sum: number, item: any) => sum + item.count, 0);
  }, [ticketAnalytics]);

  // Calculate average resolution time
  const avgResolutionHours = useMemo(() => {
    const resolutions = ticketAnalytics?.avgResolutionByCategory || [];
    if (resolutions.length === 0) return 0;
    const total = resolutions.reduce((sum: number, item: any) => sum + (item.avgHours || 0), 0);
    return Math.round(total / resolutions.length);
  }, [ticketAnalytics]);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium">{t('audit.ticketAnalytics')}</h3>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">{t('audit.totalTickets')}</div>
            <div className="text-2xl font-bold">{totalTickets}</div>
            <p className="text-xs text-muted-foreground">{t('audit.inSelectedPeriod')}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">{t('audit.avgResolutionTime')}</div>
            <div className="text-2xl font-bold">{avgResolutionHours}h</div>
            <p className="text-xs text-muted-foreground">{t('audit.timeToResolve')}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">{t('audit.categories')}</div>
            <div className="text-2xl font-bold">{(ticketAnalytics?.byCategory || []).length}</div>
            <p className="text-xs text-muted-foreground">{t('audit.differentTicketTypes')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tickets by Status */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">{t('audit.ticketsByStatus')}</CardTitle>
          </CardHeader>
          <CardContent>
            {!ticketAnalytics?.byStatus || ticketAnalytics.byStatus.length === 0 ? (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                <div className="text-center">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{t('audit.noStatusData')}</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={ticketAnalytics.byStatus}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                    label={({ status, percent }) => `${status} ${((percent || 0) * 100).toFixed(0)}%`}
                  >
                    {ticketAnalytics.byStatus.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Tickets by Category */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">{t('audit.ticketsByCategory')}</CardTitle>
          </CardHeader>
          <CardContent>
            {!ticketAnalytics?.byCategory || ticketAnalytics.byCategory.length === 0 ? (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                <div className="text-center">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{t('audit.noCategoryData')}</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={ticketAnalytics.byCategory}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="category" className="text-muted-foreground" fontSize={12} />
                  <YAxis className="text-muted-foreground" fontSize={12} />
                  <Tooltip cursor={false} content={<CustomTooltip />} />
                  <Bar dataKey="count" fill="#3b82f6" style={{ filter: 'none' }} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Daily Ticket Trend */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">{t('audit.dailyTicketTrend')}</CardTitle>
        </CardHeader>
        <CardContent>
          {!ticketAnalytics?.dailyTickets || ticketAnalytics.dailyTickets.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground">
              <div className="text-center">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">{t('audit.noTicketTrendData')}</p>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={ticketAnalytics.dailyTickets}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="date" className="text-muted-foreground" fontSize={12} />
                <YAxis className="text-muted-foreground" fontSize={12} />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  activeDot={false}
                  name="Tickets"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Resolution Time by Category */}
      {ticketAnalytics?.avgResolutionByCategory && ticketAnalytics.avgResolutionByCategory.length > 0 && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">{t('audit.avgResolutionByCategory')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={ticketAnalytics.avgResolutionByCategory}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="category" className="text-muted-foreground" fontSize={12} />
                <YAxis className="text-muted-foreground" fontSize={12} />
                <Tooltip
                  cursor={false}
                  content={<CustomTooltip formatValue={(value: any) => `${Number(value).toFixed(1)}h`} />}
                />
                <Bar dataKey="avgHours" fill="#10b981" style={{ filter: 'none' }} name="Avg Hours" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// Punishments List Card component
const ActivePunishmentsCard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [staffFilter, setStaffFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [evidenceFilter, setEvidenceFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('issued');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const { openPlayerWindow } = usePlayerWindow();

  const { data: activePunishments = [], isLoading, refetch } = useQuery({
    queryKey: ['punishments-list', statusFilter],
    queryFn: () => fetchPunishmentsList(statusFilter),
    staleTime: 5 * 60 * 1000
  });

  // Extract unique staff names and categories for filter options
  const staffNames = useMemo(() => {
    const names = new Set(activePunishments.map(p => p.staffName));
    return Array.from(names).sort();
  }, [activePunishments]);

  const punishmentTypes = useMemo(() => {
    const types = new Set(activePunishments.map(p => p.type));
    return Array.from(types).sort();
  }, [activePunishments]);

  // Filter and sort
  const filteredPunishments = useMemo(() => {
    let filtered = [...activePunishments];

    if (staffFilter !== 'all') {
      filtered = filtered.filter(p => p.staffName === staffFilter);
    }
    if (typeFilter !== 'all') {
      filtered = filtered.filter(p => p.type === typeFilter);
    }
    if (evidenceFilter === 'yes') {
      filtered = filtered.filter(p => p.hasEvidence);
    } else if (evidenceFilter === 'no') {
      filtered = filtered.filter(p => !p.hasEvidence);
    }

    filtered.sort((a, b) => {
      let valA: number, valB: number;
      switch (sortBy) {
        case 'issued':
          valA = new Date(a.issued).getTime();
          valB = new Date(b.issued).getTime();
          break;
        case 'started':
          valA = a.started ? new Date(a.started).getTime() : 0;
          valB = b.started ? new Date(b.started).getTime() : 0;
          break;
        case 'duration':
          valA = a.duration ?? -1;
          valB = b.duration ?? -1;
          break;
        default:
          valA = new Date(a.issued).getTime();
          valB = new Date(b.issued).getTime();
      }
      return sortDir === 'desc' ? valB - valA : valA - valB;
    });

    return filtered;
  }, [activePunishments, staffFilter, typeFilter, evidenceFilter, sortBy, sortDir]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [statusFilter, staffFilter, typeFilter, evidenceFilter, sortBy, sortDir]);

  const totalPages = Math.ceil(filteredPunishments.length / pageSize);
  const paginatedPunishments = filteredPunishments.slice(page * pageSize, (page + 1) * pageSize);

  const toggleSort = (field: string) => {
    if (sortBy === field) {
      setSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  };

  const formatDuration = (duration: number | null) => {
    if (duration === null || duration === undefined || duration <= 0) return t('audit.permanent');
    const days = Math.floor(duration / (1000 * 60 * 60 * 24));
    const hours = Math.floor((duration % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatTimeRemaining = (expires: string | null) => {
    if (!expires) return t('audit.permanent');
    const expiryDate = new Date(expires);
    const now = new Date();
    const diffMs = expiryDate.getTime() - now.getTime();
    if (diffMs <= 0) return t('audit.expiring');
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return t('audit.daysHoursLeft', { days, hours });
    if (hours > 0) return t('audit.hoursLeft', { hours });
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return t('audit.minutesLeft', { minutes });
  };

  const SortHeader = ({ field, label }: { field: string; label: string }) => (
    <th
      className="text-left p-2 cursor-pointer hover:bg-muted/50 select-none"
      onClick={() => toggleSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={cn("h-3 w-3", sortBy === field ? "text-primary" : "text-muted-foreground")} />
      </div>
    </th>
  );

  return (
    <Card className="shadow-card">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-red-600" />
            {t('audit.punishmentsList')}
            <Badge variant="secondary" className="ml-1">{filteredPunishments.length}</Badge>
          </CardTitle>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <Filter className="h-3 w-3 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[120px] h-8 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t('status.active')}</SelectItem>
                  <SelectItem value="inactive">{t('status.inactive')}</SelectItem>
                  <SelectItem value="all">{t('audit.all')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Select value={staffFilter} onValueChange={setStaffFilter}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue placeholder="Staff" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('audit.allStaff')}</SelectItem>
                {staffNames.map(name => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('audit.allTypes')}</SelectItem>
                {punishmentTypes.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={evidenceFilter} onValueChange={setEvidenceFilter}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue placeholder="Evidence" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('audit.all')}</SelectItem>
                <SelectItem value="yes">{t('audit.hasEvidence')}</SelectItem>
                <SelectItem value="no">{t('audit.noEvidenceFilter')}</SelectItem>
              </SelectContent>
            </Select>

            {user?.role === 'Super Admin' && (
              <BulkPunishmentActionsModal
                activePunishments={activePunishments}
                onSuccess={() => refetch()}
              />
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin" />
          </div>
        ) : filteredPunishments.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <div className="text-center">
              <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                {activePunishments.length === 0 ? t('audit.noPunishmentsFound') : t('audit.noPunishmentsMatchFilters')}
              </p>
            </div>
          </div>
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">{t('audit.colPlayer')}</th>
                  <th className="text-left p-2">{t('audit.colType')}</th>
                  {statusFilter !== 'active' && <th className="text-left p-2">{t('audit.colStatus')}</th>}
                  <th className="text-left p-2">{t('audit.colStaff')}</th>
                  <SortHeader field="issued" label={t('audit.colIssued')} />
                  <SortHeader field="started" label={t('audit.colStarted')} />
                  <SortHeader field="duration" label={t('audit.colDuration')} />
                  <th className="text-left p-2">{t('audit.colRemaining')}</th>
                  <th className="text-left p-2">{t('audit.colEvidence')}</th>
                </tr>
              </thead>
              <tbody>
                {paginatedPunishments.map((punishment) => (
                  <tr key={punishment.id} className={cn("border-b hover:bg-muted/50", !punishment.active && "opacity-60")}>
                    <td className="p-2">
                      <Button
                        variant="link"
                        className="p-0 h-auto font-medium text-left"
                        onClick={() => openPlayerWindow(punishment.playerId, punishment.playerName)}
                      >
                        {punishment.playerName}
                      </Button>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-1">
                        <Badge
                          variant={punishment.type.includes('Ban') || punishment.type.includes('Blacklist') ? 'destructive' : 'secondary'}
                          className="text-xs"
                        >
                          {punishment.type}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {punishment.category}
                        </Badge>
                      </div>
                    </td>
                    {statusFilter !== 'active' && (
                      <td className="p-2">
                        <Badge variant={punishment.active ? 'destructive' : 'outline'} className="text-xs">
                          {punishment.active ? t('status.active') : t('status.inactive')}
                        </Badge>
                      </td>
                    )}
                    <td className="p-2 text-muted-foreground">{punishment.staffName}</td>
                    <td className="p-2">{formatDateOnly(new Date(punishment.issued))}</td>
                    <td className="p-2">
                      {punishment.started ? formatDateOnly(new Date(punishment.started)) : <span className="text-muted-foreground">--</span>}
                    </td>
                    <td className="p-2">{formatDuration(punishment.duration)}</td>
                    <td className="p-2">
                      {!punishment.active ? (
                        <span className="text-xs text-muted-foreground">n/a</span>
                      ) : (
                        <span className={cn(
                          "text-xs font-medium",
                          !punishment.expires && "text-red-600 dark:text-red-400",
                          punishment.expires && "text-orange-600 dark:text-orange-400"
                        )}>
                          {formatTimeRemaining(punishment.expires)}
                        </span>
                      )}
                    </td>
                    <td className="p-2">
                      {punishment.hasEvidence ? (
                        <div className="flex gap-1 flex-wrap">
                          {punishment.evidence.map((ev, idx) => (
                            <Badge
                              key={idx}
                              variant="outline"
                              className={cn("text-xs", ev.url && "cursor-pointer hover:bg-primary/10 transition-colors")}
                              onClick={() => ev.url && window.open(ev.url, '_blank')}
                              title={ev.text || ev.fileName || 'Evidence'}
                            >
                              <Paperclip className="h-3 w-3 mr-1" />
                              {ev.fileName || ev.type || `#${idx + 1}`}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">{t('audit.none')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <span className="text-sm text-muted-foreground">
                {t('audit.showingRange', { from: page * pageSize + 1, to: Math.min((page + 1) * pageSize, filteredPunishments.length), total: filteredPunishments.length })}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p - 1)}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  {page + 1} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= totalPages - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

// Stat card component that toggles expansion
const StatCard = ({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor,
  trend,
  trendValue,
  isExpanded,
  onToggle,
}: {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: number;
  isExpanded: boolean;
  onToggle: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:bg-muted/50 shadow-card",
        isExpanded && "ring-2 ring-primary"
      )}
      onClick={onToggle}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">{title}</p>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-primary" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <p className="text-2xl font-bold">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
            {trend && trendValue !== undefined && (
              <p className="text-xs text-muted-foreground flex items-center mt-1">
                {trend === 'up' ? (
                  <TrendingUp className="h-3 w-3 mr-1 text-green-600" />
                ) : trend === 'down' ? (
                  <TrendingDown className="h-3 w-3 mr-1 text-red-600" />
                ) : null}
                {t('audit.vsLastPeriod', { pct: Math.abs(trendValue) })}
              </p>
            )}
          </div>
          <Icon className={cn("h-8 w-8", iconColor)} />
        </div>
      </CardContent>
    </Card>
  );
};

const AuditLog = () => {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [analyticsPeriod, setAnalyticsPeriod] = useState('30d');
  const { t } = useTranslation();

  const toggleSection = (section: string) => {
    setExpandedSection(prev => prev === section ? null : section);
  };

  const { refetch, isRefetching } = useLogs();

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

  const { data: ticketAnalytics } = useQuery({
    queryKey: ['ticket-analytics', analyticsPeriod],
    queryFn: () => fetchTicketAnalytics(analyticsPeriod),
    staleTime: 5 * 60 * 1000
  });

  // Combine all daily data for the metrics chart
  const combinedMetricsData = useMemo(() => {
    const dateMap = new Map<string, { date: string; tickets: number; punishments: number; players: number }>();

    // Add ticket data
    if (ticketAnalytics?.dailyTickets) {
      ticketAnalytics.dailyTickets.forEach((item: any) => {
        const existing = dateMap.get(item.date) || { date: item.date, tickets: 0, punishments: 0, players: 0 };
        existing.tickets = item.count || 0;
        dateMap.set(item.date, existing);
      });
    }

    // Add punishment data
    if (punishmentAnalytics?.dailyPunishments) {
      punishmentAnalytics.dailyPunishments.forEach((item: any) => {
        const existing = dateMap.get(item.date) || { date: item.date, tickets: 0, punishments: 0, players: 0 };
        existing.punishments = item.count || 0;
        dateMap.set(item.date, existing);
      });
    }

    // Add player data
    if (playerActivity?.newPlayersTrend) {
      playerActivity.newPlayersTrend.forEach((item: any) => {
        const existing = dateMap.get(item.date) || { date: item.date, tickets: 0, punishments: 0, players: 0 };
        existing.players = item.count || 0;
        dateMap.set(item.date, existing);
      });
    }

    // Convert to array and sort by date
    return Array.from(dateMap.values()).sort((a, b) => {
      // Handle different date formats (e.g., "Jan 15" vs "2024-01-15")
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
        return dateA.getTime() - dateB.getTime();
      }
      return a.date.localeCompare(b.date);
    });
  }, [ticketAnalytics, punishmentAnalytics, playerActivity]);

  return (
    <PageContainer>
      <div className="flex flex-col space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-center">
          <h2 className="text-xl font-semibold">{t('audit.title')}</h2>
          <div className="flex flex-col space-y-2 md:flex-row md:space-y-0 md:space-x-2 md:items-center">
            <Select value={analyticsPeriod} onValueChange={setAnalyticsPeriod}>
              <SelectTrigger className="w-full md:w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">{t('audit.period7d')}</SelectItem>
                <SelectItem value="30d">{t('audit.period30d')}</SelectItem>
                <SelectItem value="90d">{t('audit.period90d')}</SelectItem>
                <SelectItem value="all">{t('audit.periodAll')}</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isRefetching}
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", isRefetching && "animate-spin")} />
              {t('audit.refresh')}
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Tickets Opened */}
          <StatCard
            title={t('audit.ticketsOpened')}
            value={analyticsOverview?.overview.totalTickets || 0}
            icon={FileText}
            iconColor="text-blue-600"
            trend={analyticsOverview?.overview.ticketChange >= 0 ? 'up' : 'down'}
            trendValue={analyticsOverview?.overview.ticketChange}
            isExpanded={expandedSection === 'tickets'}
            onToggle={() => toggleSection('tickets')}
          />

          {/* Punishments Issued */}
          <StatCard
            title={t('audit.punishmentsIssued')}
            value={punishmentAnalytics?.byType?.reduce((sum: number, item: any) => sum + item.count, 0) || 0}
            icon={Gavel}
            iconColor="text-red-600"
            isExpanded={expandedSection === 'punishments'}
            onToggle={() => toggleSection('punishments')}
          />

          {/* Staff Members */}
          <StatCard
            title={t('audit.staffMembers')}
            value={analyticsOverview?.overview.totalStaff || 0}
            subtitle={t('audit.activeStaff', { count: staffPerformanceData.filter((s: any) => new Date(s.lastActive) > subDays(new Date(), 7)).length })}
            icon={Users}
            iconColor="text-purple-600"
            isExpanded={expandedSection === 'staff'}
            onToggle={() => toggleSection('staff')}
          />

          {/* Players Joined */}
          <StatCard
            title={t('audit.playersJoined')}
            value={analyticsOverview?.overview.totalPlayers || 0}
            icon={User}
            iconColor="text-green-600"
            trend={analyticsOverview?.overview.playerChange >= 0 ? 'up' : 'down'}
            trendValue={analyticsOverview?.overview.playerChange}
            isExpanded={expandedSection === 'players'}
            onToggle={() => toggleSection('players')}
          />
        </div>

        {/* Metrics Overview Chart - Show when nothing is expanded */}
        {!expandedSection && combinedMetricsData.length > 0 && (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base">{t('audit.activityOverview')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={combinedMetricsData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="date" className="text-muted-foreground" fontSize={12} />
                  <YAxis className="text-muted-foreground" fontSize={12} />
                  <Tooltip
                    content={<CustomTooltip
                      formatName={(name: string) => {
                        switch (name) {
                          case 'tickets': return t('audit.legendNewTickets');
                          case 'punishments': return t('audit.legendPunishments');
                          case 'players': return t('audit.legendNewPlayers');
                          default: return name;
                        }
                      }}
                    />}
                  />
                  <Line
                    type="monotone"
                    dataKey="tickets"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    activeDot={false}
                    name="tickets"
                  />
                  <Line
                    type="monotone"
                    dataKey="punishments"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={false}
                    activeDot={false}
                    name="punishments"
                  />
                  <Line
                    type="monotone"
                    dataKey="players"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    activeDot={false}
                    name="players"
                  />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-6 mt-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-muted-foreground">{t('audit.legendNewTickets')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="text-muted-foreground">{t('audit.legendPunishments')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-muted-foreground">{t('audit.legendNewPlayers')}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Expanded Content - Full Width */}
        {expandedSection && (
          <Card className="shadow-card">
            <CardContent className="p-6">
              {expandedSection === 'tickets' && (
                <TicketAnalyticsSection analyticsPeriod={analyticsPeriod} />
              )}

              {expandedSection === 'punishments' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="shadow-card">
                      <CardHeader>
                        <CardTitle className="text-base">{t('audit.punishmentsByType')}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {!punishmentAnalytics?.byType || punishmentAnalytics.byType.length === 0 ? (
                          <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                            <div className="text-center">
                              <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                              <p className="text-sm">{t('audit.noPunishmentTypeData')}</p>
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

                    <Card className="shadow-card">
                      <CardHeader>
                        <CardTitle className="text-base">{t('audit.dailyPunishmentTrend')}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {!punishmentAnalytics?.dailyPunishments || punishmentAnalytics.dailyPunishments.length === 0 ? (
                          <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                            <div className="text-center">
                              <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
                              <p className="text-sm">{t('audit.noPunishmentTrendData')}</p>
                            </div>
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height={250}>
                            <LineChart data={punishmentAnalytics.dailyPunishments}>
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

                  <Card className="shadow-card">
                    <CardHeader>
                      <CardTitle className="text-base">{t('audit.topPunishers')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {!punishmentAnalytics?.byStaff || punishmentAnalytics.byStaff.length === 0 ? (
                        <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                          <div className="text-center">
                            <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">{t('audit.noStaffPunishmentData')}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {punishmentAnalytics.byStaff.map((staff: any, index: number) => (
                            <div key={staff.username || `punisher-${index}`} className="flex items-center justify-between p-2 border rounded">
                              <div className="flex items-center gap-2">
                                <Shield className="h-4 w-4 text-blue-600" />
                                <span className="font-medium">{staff.username}</span>
                              </div>
                              <Badge variant="secondary">{staff.count}</Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <ActivePunishmentsCard />
                </div>
              )}

              {expandedSection === 'staff' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="shadow-card">
                      <CardHeader>
                        <CardTitle className="text-base">{t('audit.actionsByStaff')}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {!staffPerformanceData || staffPerformanceData.length === 0 ? (
                          <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                            <div className="text-center">
                              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                              <p className="text-sm">{t('audit.noStaffPerformanceData')}</p>
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

                    <Card className="shadow-card">
                      <CardHeader>
                        <CardTitle className="text-base">{t('audit.ticketResponsesTitle')}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {!staffPerformanceData || staffPerformanceData.length === 0 ? (
                          <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                            <div className="text-center">
                              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                              <p className="text-sm">{t('audit.noStaffTicketResponseData')}</p>
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

                  <Card className="shadow-card">
                    <CardHeader>
                      <CardTitle className="text-base">{t('audit.staffActivityDetails')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {!staffPerformanceData || staffPerformanceData.length === 0 ? (
                        <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                          <div className="text-center">
                            <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">{t('audit.noStaffActivityData')}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left p-2">{t('audit.colUsername')}</th>
                                <th className="text-left p-2">{t('audit.colRole')}</th>
                                <th className="text-left p-2">{t('audit.colTicketResponses')}</th>
                                <th className="text-left p-2">{t('audit.colPunishmentsIssued')}</th>
                                <th className="text-left p-2">{t('audit.colTotalActions')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {staffPerformanceData.map((staff: any) => (
                                <StaffDetailRow key={staff.id} staff={staff} period={analyticsPeriod} />
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {expandedSection === 'players' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="shadow-card">
                      <CardHeader>
                        <CardTitle className="text-base">{t('audit.playerLoginActivity')}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {!playerActivity?.loginTrend || playerActivity.loginTrend.length === 0 ? (
                          !playerActivity?.newPlayersTrend || playerActivity.newPlayersTrend.length === 0 ? (
                            <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                              <div className="text-center">
                                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                <p className="text-sm">{t('audit.noPlayerActivityData')}</p>
                              </div>
                            </div>
                          ) : (
                            <ResponsiveContainer width="100%" height={250}>
                              <AreaChart data={playerActivity.newPlayersTrend}>
                                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                                <XAxis dataKey="date" className="text-muted-foreground" fontSize={12} />
                                <YAxis className="text-muted-foreground" fontSize={12} />
                                <Tooltip content={<CustomTooltip formatName={(name: any) => name === "count" ? "New Players" : name} />} />
                                <Area type="monotone" dataKey="count" stroke="#10b981" fill="#10b981" fillOpacity={0.3} dot={false} activeDot={false} name="New Players" />
                              </AreaChart>
                            </ResponsiveContainer>
                          )
                        ) : (
                          <ResponsiveContainer width="100%" height={250}>
                            <AreaChart data={playerActivity.loginTrend}>
                              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                              <XAxis dataKey="date" className="text-muted-foreground" fontSize={12} />
                              <YAxis className="text-muted-foreground" fontSize={12} />
                              <Tooltip content={<CustomTooltip />} />
                              <Area type="monotone" dataKey="logins" stroke="#10b981" fill="#10b981" fillOpacity={0.3} dot={false} activeDot={false} name="Logins" />
                              <Area type="monotone" dataKey="uniquePlayers" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} dot={false} activeDot={false} name="Unique Players" />
                            </AreaChart>
                          </ResponsiveContainer>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="shadow-card">
                      <CardHeader>
                        <CardTitle className="text-base">{t('audit.loginsByCountry')}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {!playerActivity?.loginsByCountry || playerActivity.loginsByCountry.length === 0 ? (
                          <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                            <div className="text-center">
                              <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
                              <p className="text-sm">{t('audit.noLoginData')}</p>
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

                  <Card className="shadow-card">
                    <CardHeader>
                      <CardTitle className="text-base">{t('audit.securityAlerts')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 border rounded bg-orange-50 dark:bg-orange-950/20">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                            <span className="font-medium">{t('audit.proxyConnections')}</span>
                          </div>
                          <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                            {playerActivity?.suspiciousActivity?.proxyCount || 0}
                          </p>
                          <p className="text-sm text-muted-foreground">{t('audit.inSelectedPeriod')}</p>
                        </div>

                        <div className="p-4 border rounded bg-red-50 dark:bg-red-950/20">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                            <span className="font-medium">{t('audit.hostingIps')}</span>
                          </div>
                          <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                            {playerActivity?.suspiciousActivity?.hostingCount || 0}
                          </p>
                          <p className="text-sm text-muted-foreground">{t('audit.inSelectedPeriod')}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </PageContainer>
  );
};

export default function AuditPage() {
  const { t } = useTranslation();
  return (
    <PermissionWrapper
      permissions={[PERMISSIONS.ADMIN_AUDIT_VIEW]}
      fallback={
        <PageContainer title={t('audit.title')}>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {t('audit.noPermission')}
            </AlertDescription>
          </Alert>
        </PageContainer>
      }
    >
      <AuditLog />
    </PermissionWrapper>
  );
}
