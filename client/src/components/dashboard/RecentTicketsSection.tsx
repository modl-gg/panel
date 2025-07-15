import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from 'modl-shared-web/components/ui/card';
import { Badge } from 'modl-shared-web/components/ui/badge';
import { Button } from 'modl-shared-web/components/ui/button';
import { Ticket, Clock, User } from 'lucide-react';
import { useLocation } from 'wouter';

export interface RecentTicket {
  id: string;
  title: string;
  initialMessage: string;
  status: 'open' | 'closed' | 'under_review' | 'pending_player_response';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: string | Date;
  playerName: string;
  type: string;
}

interface RecentTicketsSectionProps {
  tickets: RecentTicket[];
  loading: boolean;
}

const statusColors = {
  open: 'bg-blue-500/20 text-blue-500',
  closed: 'bg-green-500/20 text-green-500',
  under_review: 'bg-yellow-500/20 text-yellow-500',
  pending_player_response: 'bg-purple-500/20 text-purple-500'
};

const priorityColors = {
  low: 'bg-gray-500/20 text-gray-500',
  medium: 'bg-blue-500/20 text-blue-500',
  high: 'bg-orange-500/20 text-orange-500',
  urgent: 'bg-red-500/20 text-red-500'
};

export function RecentTicketsSection({ tickets, loading }: RecentTicketsSectionProps) {
  const [, setLocation] = useLocation();

  const handleTicketClick = (ticketId: string) => {
    setLocation(`/panel/tickets/${ticketId}`);
  };

  const truncateMessage = (message: string | undefined | null, maxLength: number = 120) => {
    if (!message) return 'No message available';
    const messageStr = String(message);
    if (messageStr.length <= maxLength) return messageStr;
    return messageStr.substring(0, maxLength) + '...';
  };

  const formatTimeAgo = (dateString: string | Date) => {
    const date = new Date(dateString);
    const now = new Date();
    
    // Check for invalid date
    if (isNaN(date.getTime())) {
      return 'Unknown';
    }
    
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays}d ago`;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5" />
            Recently Opened Tickets
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ticket className="h-5 w-5" />
          Recently Opened Tickets
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {tickets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No recent tickets to display
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
                    <Badge variant="secondary" className={`text-xs ${priorityColors[ticket.priority]}`}>
                      {ticket.priority.toUpperCase()}
                    </Badge>
                    <Badge variant="secondary" className={`text-xs ${statusColors[ticket.status]}`}>
                      {ticket.status.replace('_', ' ').toUpperCase()}
                    </Badge>
                  </div>
                </div>
                
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                  {truncateMessage(ticket.initialMessage)}
                </p>
                
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      <span>{ticket.playerName}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{formatTimeAgo(ticket.createdAt)}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {ticket.type}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}