import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Shield, Clock, User, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { usePlayerWindow } from '@/contexts/PlayerWindowContext';
import { formatTimeAgo } from '@/utils/date-utils';

export interface RecentPunishment {
  id: string;
  type: 'ban' | 'kick' | 'mute' | 'warn' | 'tempban';
  playerName: string;
  playerUuid: string;
  reason: string;
  duration?: string | number;
  issuedBy: string;
  issuedAt: string | Date;
  active: boolean;
}

interface RecentPunishmentsSectionProps {
  punishments: RecentPunishment[];
  loading: boolean;
}

const punishmentColors = {
  ban: 'bg-red-500/20 text-red-500',
  tempban: 'bg-orange-500/20 text-orange-500',
  kick: 'bg-yellow-500/20 text-yellow-500',
  mute: 'bg-blue-500/20 text-blue-500',
  warn: 'bg-purple-500/20 text-purple-500'
};

const punishmentIcons = {
  ban: '🔨',
  tempban: '⏰',
  kick: '👢',
  mute: '🔇',
  warn: '⚠️'
};

export function RecentPunishmentsSection({ punishments, loading }: RecentPunishmentsSectionProps) {
  const { openPlayerWindow } = usePlayerWindow();
  const [expandedPunishments, setExpandedPunishments] = useState<Set<string>>(new Set());

  const handlePlayerClick = (playerUuid: string) => {
    openPlayerWindow(playerUuid);
  };

  const togglePunishmentExpanded = (punishmentId: string) => {
    const newExpanded = new Set(expandedPunishments);
    if (newExpanded.has(punishmentId)) {
      newExpanded.delete(punishmentId);
    } else {
      newExpanded.add(punishmentId);
    }
    setExpandedPunishments(newExpanded);
  };

  const truncateReason = (reason: string | undefined | null, maxLength: number = 80) => {
    if (!reason) return 'No reason provided';
    const reasonStr = String(reason);
    if (reasonStr.length <= maxLength) return reasonStr;
    return reasonStr.substring(0, maxLength) + '...';
  };


  const formatDuration = (duration?: string | number) => {
    if (!duration) return 'Permanent';
    
    // Convert to string if it's a number
    const durationStr = String(duration);
    
    // Parse duration like "30d", "2h", "1w"
    const match = durationStr.match(/^(\d+)([dhm])$/);
    if (!match) return durationStr;
    
    const [, amount, unit] = match;
    const unitNames = { d: 'day', h: 'hour', m: 'minute' };
    const unitName = unitNames[unit as keyof typeof unitNames];
    
    return `${amount} ${unitName}${parseInt(amount) > 1 ? 's' : ''}`;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Recently Issued Punishments
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="p-3 border border-border rounded-lg">
                <div className="animate-pulse">
                  <div className="h-4 bg-muted rounded w-2/3 mb-2"></div>
                  <div className="h-3 bg-muted rounded w-full mb-2"></div>
                  <div className="h-3 bg-muted rounded w-1/3"></div>
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
          <Shield className="h-5 w-5" />
          Recently Issued Punishments
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {punishments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No recent punishments to display
            </div>
          ) : (
            punishments.map((punishment) => {
              const isExpanded = expandedPunishments.has(punishment.id);
              return (
                <div
                  key={punishment.id}
                  className="border border-border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div 
                    className="p-3 cursor-pointer"
                    onClick={() => togglePunishmentExpanded(punishment.id)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            {punishment.type && (
                              <Badge
                                variant="secondary"
                                className={`text-xs ${punishmentColors[punishment.type] || ''}`}
                              >
                                {punishment.type.toUpperCase()}
                              </Badge>
                            )}
                            {!punishment.active && (
                              <Badge variant="outline" className="text-xs">
                                EXPIRED
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-xs text-muted-foreground">
                          {formatTimeAgo(punishment.issuedAt)}
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button
                        variant="link"
                        className="p-0 h-auto font-medium text-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayerClick(punishment.playerUuid);
                        }}
                      >
                        {punishment.playerName}
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        {punishment.type || 'Punishment'} by {punishment.issuedBy || 'Unknown'}
                      </span>
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-border bg-muted/20">
                      <div className="pt-3 space-y-2">
                        <div>
                          <span className="text-xs font-medium text-muted-foreground">REASON:</span>
                          <p className="text-sm mt-1">{punishment.reason || 'No reason provided'}</p>
                        </div>
                        
                        {punishment.duration && (
                          <div>
                            <span className="text-xs font-medium text-muted-foreground">DURATION:</span>
                            <div className="flex items-center gap-1 text-sm mt-1">
                              <Clock className="h-3 w-3" />
                              <span>{formatDuration(punishment.duration)}</span>
                            </div>
                          </div>
                        )}
                        
                        <div className="flex justify-between items-center pt-2">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <User className="h-3 w-3" />
                            <span>Issued by {punishment.issuedBy}</span>
                          </div>
                          {punishment.active && (
                            <div className="flex items-center gap-1 text-red-500 text-xs">
                              <AlertTriangle className="h-3 w-3" />
                              <span>Active</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}