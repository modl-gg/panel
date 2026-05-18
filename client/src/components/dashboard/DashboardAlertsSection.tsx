import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import { StatusBanner } from '@modl-gg/shared-web/components/ui/status-banner';
import { useTranslation } from 'react-i18next';
import type { SystemAlert, SystemAlertSeverity } from '@/hooks/use-data';

interface DashboardAlertsSectionProps {
  alerts: SystemAlert[];
}

const severityVariant: Record<SystemAlertSeverity, 'info' | 'warning' | 'error'> = {
  BASIC: 'info',
  WARNING: 'warning',
  CRITICAL: 'error',
};

export function DashboardAlertsSection({ alerts }: DashboardAlertsSectionProps) {
  const { t } = useTranslation();

  if (alerts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert) => (
        <StatusBanner
          key={alert.id}
          variant={severityVariant[alert.severity]}
          title={t(`dashboard.alerts.levels.${alert.severity}`)}
          className="shadow-card"
          action={alert.expiresAt ? (
            <Badge variant="outline" className="bg-background/60">
              {t('dashboard.alerts.expires', { date: new Date(alert.expiresAt).toLocaleString() })}
            </Badge>
          ) : undefined}
        >
          <p className="whitespace-pre-wrap">{alert.message}</p>
        </StatusBanner>
      ))}
    </div>
  );
}
