import React, { useState } from 'react';
import { ArrowUpRight, Loader2, AlertCircle } from 'lucide-react';
import { Button } from 'modl-shared-web/components/ui/button';
import { usePlayerWindow } from '@/contexts/PlayerWindowContext';
import { usePlayerLookup, extractPlayerIdentifier } from '@/hooks/use-player-lookup';
import { cn } from 'modl-shared-web/lib/utils';

interface ClickablePlayerProps {
  children: React.ReactNode;
  playerText: string;
  className?: string;
  showIcon?: boolean;
  variant?: 'text' | 'button';
  size?: 'sm' | 'md' | 'lg';
}

export function ClickablePlayer({ 
  children, 
  playerText, 
  className,
  showIcon = true,
  variant = 'text',
  size = 'md'
}: ClickablePlayerProps) {
  const [isLookingUp, setIsLookingUp] = useState(false);
  const { openPlayerWindow } = usePlayerWindow();
  
  const identifier = extractPlayerIdentifier(playerText);
  
  const { data: playerData, error, refetch } = usePlayerLookup(identifier);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!identifier) return;
    
    setIsLookingUp(true);
    
    try {
      let playerUuid = '';
      let username = '';
      
      if (playerData) {
        // Use cached data
        playerUuid = playerData.uuid;
        username = playerData.username;
      } else {
        // Trigger fresh lookup
        const result = await refetch();
        if (result.data) {
          playerUuid = result.data.uuid;
          username = result.data.username;
        } else {
          throw new Error('Player not found');
        }
      }
      
      // Open the player window
      openPlayerWindow(playerUuid, username);
    } catch (error) {
      console.error('Failed to lookup player:', error);
      // You could show a toast notification here if needed
    } finally {
      setIsLookingUp(false);
    }
  };

  if (variant === 'button') {
    return (
      <Button
        variant="ghost"
        size={size === 'sm' ? 'sm' : 'default'}
        className={cn('h-auto p-1 hover:bg-muted/50', className)}
        onClick={handleClick}
        disabled={!identifier || isLookingUp}
      >
        {children}
        {showIcon && (
          <span className="ml-1">
            {isLookingUp ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : error ? (
              <AlertCircle className="h-3 w-3 text-destructive" />
            ) : (
              <ArrowUpRight className="h-3 w-3" />
            )}
          </span>
        )}
      </Button>
    );
  }

  return (
    <span
      className={cn(
        'cursor-pointer hover:underline text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300',
        'inline-flex items-center gap-1',
        !identifier && 'cursor-default hover:no-underline text-muted-foreground',
        className
      )}
      onClick={handleClick}
      role={identifier ? 'button' : 'text'}
      tabIndex={identifier ? 0 : -1}
      onKeyDown={(e) => {
        if (identifier && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          handleClick(e as any);
        }
      }}
    >
      {children}
      {showIcon && identifier && (
        <span className="inline-flex items-center">
          {isLookingUp ? (
            <Loader2 className="h-3 w-3 animate-spin ml-1" />
          ) : error ? (
            <AlertCircle className="h-3 w-3 text-destructive ml-1" />
          ) : (
            <ArrowUpRight className="h-3 w-3 ml-1" />
          )}
        </span>
      )}
    </span>
  );
}