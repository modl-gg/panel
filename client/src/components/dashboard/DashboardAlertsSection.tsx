import { StatusBanner } from '@modl-gg/shared-web/components/ui/status-banner';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import type { SystemAlert, SystemAlertSeverity } from '@/hooks/use-data';

interface DashboardAlertsSectionProps {
  alerts?: SystemAlert[];
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

export function DashboardAlertsSection({ alerts = [] }: DashboardAlertsSectionProps) {
  const { t } = useTranslation();

  if (alerts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert) => (
        <StatusBanner
          key={alert.id}
          variant={getSeverityVariant(alert.severity)}
          title={getSeverityTitle(alert.severity, t)}
          className="shadow-card"
        >
          <div className="prose prose-sm max-w-none text-white prose-p:text-white prose-strong:text-white prose-em:text-white prose-li:text-white prose-ul:text-white prose-ol:text-white prose-code:text-white prose-blockquote:text-white prose-a:text-white">
            <ReactMarkdown>{alert.message}</ReactMarkdown>
          </div>
        </StatusBanner>
      ))}
    </div>
  );
}
