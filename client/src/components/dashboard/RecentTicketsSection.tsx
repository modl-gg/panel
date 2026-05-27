import { Card, CardContent, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import { Ticket, Clock, User } from 'lucide-react';
import { useLocation } from 'wouter';
import { formatTimeAgo } from '@/utils/date-utils';
import { stripMarkdown } from '@/utils/markdown-utils';
import { useTranslation } from 'react-i18next';
import { StatusBadge } from '@/components/ui/status-badge';

type Intent = 'info' | 'success' | 'warning' | 'destructive' | 'neutral';

const statusIntents: Record<string, Intent> = {
  open: 'info',
  closed: 'success',
  unfinished: 'neutral',
};

const priorityIntents: Record<string, Intent> = {
  low: 'neutral',
  normal: 'info',
  medium: 'info',
  high: 'warning',
  urgent: 'destructive',
};

export interface RecentTicket {
  id: string;
  title: string;
  initialMessage?: string | null;
  status?: string;
  priority?: string;
  createdAt: string | Date;
  playerName?: string;
  type?: string;
}

interface RecentTicketsSectionProps {
  tickets: RecentTicket[];
  loading: boolean;
}

export function RecentTicketsSection({ tickets, loading }: RecentTicketsSectionProps) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const handleTicketClick = (ticketId: string) => {
    setLocation(`/panel/tickets/${ticketId}`);
  };

  const truncateMessage = (message: string | undefined | null, maxLength: number = 120) => {
    if (!message) return t('dashboard.recentTickets.noMessage');
    const messageStr = stripMarkdown(String(message));
    if (messageStr.length <= maxLength) return messageStr;
    return messageStr.substring(0, maxLength) + '...';
  };

  if (loading) {
    return (
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5" />
            {t('dashboard.recentTickets.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="p-4 border border-border rounded-lg">
                <div className="animate-pulse">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-muted rounded w-full mb-2"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ticket className="h-5 w-5" />
          {t('dashboard.recentTickets.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {tickets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('dashboard.recentTickets.empty')}
            </div>
          ) : (
            tickets.map((ticket) => (
              <div
                key={ticket.id}
                className="p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => handleTicketClick(ticket.id)}
              >
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-medium text-sm line-clamp-1">{ticket.title}</h4>
                  <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                    {ticket.priority && (
                      <StatusBadge intent={priorityIntents[ticket.priority] || 'neutral'} className="text-xs">
                        {ticket.priority.toUpperCase()}
                      </StatusBadge>
                    )}
                    {ticket.status && (
                      <StatusBadge intent={statusIntents[ticket.status] || 'neutral'} className="text-xs">
                        {ticket.status.replace('_', ' ').toUpperCase()}
                      </StatusBadge>
                    )}
                  </div>
                </div>
                
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                  {truncateMessage(ticket.initialMessage)}
                </p>
                
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      <span>{ticket.playerName || t('search.unknown')}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{formatTimeAgo(ticket.createdAt)}</span>
                    </div>
                  </div>
                  {ticket.type && (
                    <Badge variant="outline" className="text-xs">
                      {ticket.type}
                    </Badge>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}