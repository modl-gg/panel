import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import { cn } from '@/lib/utils';
import { type ReactNode } from 'react';

type Intent = 'info' | 'success' | 'warning' | 'destructive' | 'neutral';

const styles: Record<Intent, string> = {
  info: 'bg-info/20 text-info border-info/30',
  success: 'bg-success/20 text-success border-success/30',
  warning: 'bg-warning/20 text-warning border-warning/30',
  destructive: 'bg-destructive/20 text-destructive border-destructive/30',
  neutral: 'bg-muted text-muted-foreground border-border',
};

export function StatusBadge({
  intent = 'neutral',
  children,
  className,
}: {
  intent?: Intent;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(styles[intent], 'border', className)}>
      {children}
    </Badge>
  );
}
