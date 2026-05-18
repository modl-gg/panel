import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import { StatusBanner } from '@modl-gg/shared-web/components/ui/status-banner';
import { useTranslation } from 'react-i18next';
import type { SystemAlert, SystemAlertSeverity } from '@/hooks/use-data';

interface DashboardAlertsSectionProps {
  alerts?: SystemAlert[];
  loading?: boolean;
  error?: boolean;
}

type AlertBannerVariant = 'info' | 'warning' | 'error';

const severityVariant: Record<SystemAlertSeverity, AlertBannerVariant> = {
  BASIC: 'info',
  WARNING: 'warning',
  CRITICAL: 'error',
};

function normalizeSeverity(severity: unknown): string | null {
  if (typeof severity !== 'string' || severity.trim().length === 0) {
    return null;
  }

  return severity.trim();
}

function isKnownSeverity(severity: string): severity is SystemAlertSeverity {
  return severity === 'BASIC' || severity === 'WARNING' || severity === 'CRITICAL';
}

function getSeverityVariant(severity: unknown): AlertBannerVariant {
  const normalizedSeverity = normalizeSeverity(severity);
  if (!normalizedSeverity || !isKnownSeverity(normalizedSeverity)) {
    return 'info';
  }

  return severityVariant[normalizedSeverity];
}

function getSeverityTitle(severity: unknown, t: ReturnType<typeof useTranslation>['t']) {
  const normalizedSeverity = normalizeSeverity(severity);

  if (!normalizedSeverity) {
    return t('dashboard.alerts.unknownSeverity', { severity: t('dashboard.alerts.unknownSeverityValue') });
  }

  if (isKnownSeverity(normalizedSeverity)) {
    return t(`dashboard.alerts.levels.${normalizedSeverity}`);
  }

  return t('dashboard.alerts.unknownSeverity', { severity: normalizedSeverity });
}

function formatExpiryDate(expiresAt?: string) {
  if (!expiresAt) {
    return null;
  }

  const expiryDate = new Date(expiresAt);
  if (Number.isNaN(expiryDate.getTime())) {
    return null;
  }

  return expiryDate.toLocaleString();
}

export function DashboardAlertsSection({ alerts = [], loading, error }: DashboardAlertsSectionProps) {
  const { t } = useTranslation();

  if (error) {
    return (
      <StatusBanner
        variant="error"
        title={t('dashboard.alerts.loadErrorTitle')}
        className="shadow-card"
      >
        <p>{t('dashboard.alerts.loadErrorDescription')}</p>
      </StatusBanner>
    );
  }

  if (loading) {
    return (
      <StatusBanner
        variant="info"
        title={t('dashboard.alerts.loadingTitle')}
        className="shadow-card"
      >
        <p>{t('dashboard.alerts.loadingDescription')}</p>
      </StatusBanner>
    );
  }

  if (alerts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert) => {
        const expiresAt = formatExpiryDate(alert.expiresAt);

        return (
          <StatusBanner
            key={alert.id}
            variant={getSeverityVariant(alert.severity)}
            title={getSeverityTitle(alert.severity, t)}
            className="shadow-card"
            action={expiresAt ? (
              <Badge variant="outline" className="bg-background/60">
                {t('dashboard.alerts.expires', { date: expiresAt })}
              </Badge>
            ) : undefined}
          >
            <p className="whitespace-pre-wrap">{alert.message}</p>
          </StatusBanner>
        );
      })}
    </div>
  );
}
