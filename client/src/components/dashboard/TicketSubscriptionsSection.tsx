import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from 'modl-shared-web/components/ui/card';
import { Badge } from 'modl-shared-web/components/ui/badge';
import { Button } from 'modl-shared-web/components/ui/button';
import { Bell, Clock, User, MessageSquare, X, UserMinus } from 'lucide-react';
import { useLocation } from 'wouter';
import { useToast } from 'modl-shared-web/hooks/use-toast';

export interface TicketSubscriptionUpdate {
  id: string;
  ticketId: string;
  ticketTitle: string;
  replyContent: string;
  replyBy: string;
  replyAt: string;
  isStaffReply: boolean;
  isRead: boolean;
  additionalCount?: number;
}


interface TicketSubscriptionsSectionProps {
  updates: TicketSubscriptionUpdate[];
  loading: boolean;
  onUnsubscribe: (ticketId: string) => Promise<void>;
  onMarkAsRead: (updateId: string) => Promise<void>;
}

export function TicketSubscriptionsSection({ 
  updates, 
  loading, 
  onUnsubscribe, 
  onMarkAsRead 
}: TicketSubscriptionsSectionProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleTicketClick = (ticketId: string) => {
    setLocation(`/panel/tickets/${ticketId}`);
  };

  const handleUnsubscribe = async (ticketId: string, ticketTitle: string) => {
    try {
      await onUnsubscribe(ticketId);
      toast({
        title: "Unsubscribed",
        description: `You've been unsubscribed from "${ticketTitle}"`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to unsubscribe from ticket",
        variant: "destructive",
      });
    }
  };

  const handleMarkAsRead = async (updateId: string) => {
    try {
      await onMarkAsRead(updateId);
    } catch (error) {
      console.error('Error marking update as read:', error);
    }
  };

  const truncateContent = (content: string | undefined | null, maxLength: number = 100) => {
    if (!content) return 'No content available';
    const contentStr = String(content);
    if (contentStr.length <= maxLength) return contentStr;
    return contentStr.substring(0, maxLength) + '...';
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
            <Bell className="h-5 w-5" />
            Ticket Subscription Updates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="p-3 border border-border rounded-lg">
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

  // Backend now only returns unread updates, so all updates are unread
  const hasUnreadUpdates = updates.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Ticket Subscription Updates
            {hasUnreadUpdates && (
              <Badge variant="destructive" className="text-xs">
                {updates.length} new
              </Badge>
            )}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Recent Updates */}
          <div>
            <h4 className="text-sm font-medium mb-3">Recent Replies</h4>
            <div className="space-y-3">
              {updates.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  No recent updates to your subscribed tickets
                </div>
              ) : (
                updates.slice(0, 5).map((update) => (
                  <div
                    key={update.id}
                    className="p-3 border border-border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer bg-blue-500/5 border-blue-500/20"
                    onClick={() => {
                      handleTicketClick(update.ticketId);
                    }}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h5 className="font-medium text-sm line-clamp-1 flex-1 pr-2">
                        {update.ticketTitle}
                      </h5>
                      <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <Badge 
                          variant="secondary" 
                          className={`text-xs ${
                            update.isStaffReply 
                              ? 'bg-green-500/20 text-green-500' 
                              : 'bg-blue-500/20 text-blue-500'
                          }`}
                        >
                          {update.isStaffReply ? 'STAFF' : 'PLAYER'}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-blue-500"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkAsRead(update.id);
                          }}
                          title="Mark as read"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUnsubscribe(update.ticketId, update.ticketTitle);
                          }}
                          title="Unsubscribe"
                        >
                          <UserMinus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    
                    <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                      {truncateContent(update.replyContent)}
                    </p>
                    
                    {update.additionalCount && update.additionalCount > 0 && (
                      <div className="mb-2">
                        <Badge variant="outline" className="text-xs">
                          and {update.additionalCount} more
                        </Badge>
                      </div>
                    )}
                    
                    <div className="flex justify-between items-center text-xs text-muted-foreground">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span>{update.replyBy}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>{formatTimeAgo(update.replyAt)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        <span>Reply</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}