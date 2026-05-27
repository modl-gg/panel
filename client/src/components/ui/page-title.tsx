import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function PageTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h1 className={cn('text-2xl font-semibold text-foreground', className)}>{children}</h1>;
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('text-xl font-semibold text-foreground', className)}>{children}</h2>;
}

export function StatValue({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('text-2xl font-semibold tabular-nums text-foreground', className)}>{children}</div>;
}
