import { useTranslation } from 'react-i18next';
import { Check, Clock, Download, Loader2, Mail, ShieldAlert, X, type LucideIcon } from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Card } from '@modl-gg/shared-web/components/ui/card';
import { Progress } from '@modl-gg/shared-web/components/ui/progress';
import { StatusBanner } from '@modl-gg/shared-web/components/ui/status-banner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@modl-gg/shared-web/components/ui/alert-dialog';
import {
  isDataExportActive,
  useDataExport,
  useRequestDataExport,
  type DataExportRecord,
} from '@/hooks/use-data';
import { ApiHttpError } from '@/lib/http-error';
import { formatDateWithTime } from '@/utils/date-utils';
import { formatFileSize } from '@/utils/file-utils';

const HTTP_TOO_MANY_REQUESTS = 429;
const SECONDS_PER_HOUR = 60 * 60;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;
const INCLUDED_ITEMS = ['players', 'tickets', 'staff', 'settings', 'logs', 'files'] as const;
const EXCLUDED_ITEMS = ['credentials', 'invitations', 'billing', 'domain', 'replayLite', 'operations'] as const;

const isRateLimited = (error: unknown): boolean =>
  error instanceof ApiHttpError && error.status === HTTP_TOO_MANY_REQUESTS;

interface ContentListProps {
  title: string;
  items: string[];
  icon: LucideIcon;
  iconClassName: string;
}

const ContentList = ({ title, items, icon: Icon, iconClassName }: ContentListProps) => (
  <Card className="p-4">
    <h5 className="text-sm font-medium mb-3">{title}</h5>
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
          <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${iconClassName}`} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  </Card>
);

const ExportProgress = ({ record }: { record: DataExportRecord }) => {
  const { t } = useTranslation();
  const processed = record.processedItems ?? 0;
  const total = record.totalItems ?? 0;
  const label = record.status === 'QUEUED'
    ? t('settings.dataExport.queued')
    : t(`settings.dataExport.phase.${record.phase ?? 'PREPARING'}`);

  return (
    <Card className="p-4 border-info/50 bg-info/5 space-y-3" aria-live="polite">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 text-info animate-spin shrink-0" />
        <div>
          <p className="font-medium">{label}</p>
          <p className="text-sm text-muted-foreground">{t('settings.dataExport.emailWhenDone')}</p>
        </div>
      </div>
      {total > 0 && (
        <div className="space-y-1">
          <Progress value={Math.min(100, Math.round((processed / total) * 100))} />
          <p className="text-xs text-muted-foreground">
            {Math.min(processed, total).toLocaleString()} / {total.toLocaleString()}
          </p>
        </div>
      )}
    </Card>
  );
};

const ExportStatus = ({ record }: { record: DataExportRecord }) => {
  const { t } = useTranslation();

  switch (record.status) {
    case 'QUEUED':
    case 'RUNNING':
      return <ExportProgress record={record} />;
    case 'READY':
      return (
        <StatusBanner variant="success" icon={<Mail className="h-5 w-5 text-success" />}>
          <p className="font-medium">{t('settings.dataExport.ready')}</p>
          <p>{t('settings.dataExport.expiresAt', { date: formatDateWithTime(record.expiresAt) })}</p>
          {record.sizeBytes !== undefined && (
            <p>{t('settings.dataExport.size', { size: formatFileSize(record.sizeBytes) })}</p>
          )}
        </StatusBanner>
      );
    case 'EXPIRED':
      return (
        <StatusBanner variant="warning">
          {t('settings.dataExport.expired', { date: formatDateWithTime(record.expiresAt) })}
        </StatusBanner>
      );
    case 'FAILED':
      return (
        <StatusBanner variant="error">
          <p className="font-medium">{t('settings.dataExport.failed')}</p>
          <p>{t(`settings.dataExport.failure.${record.failure ?? 'INTERNAL_ERROR'}`)}</p>
        </StatusBanner>
      );
  }
};

const DataExportSettings = () => {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useDataExport();
  const requestExport = useRequestDataExport();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return isError ? <StatusBanner variant="error">{t('settings.dataExport.loadFailed')}</StatusBanner> : null;
  }

  const active = isDataExportActive(data.latest);
  const limits = {
    hours: Math.ceil(data.cooldownSeconds / SECONDS_PER_HOUR),
    days: Math.ceil(data.linkLifetimeSeconds / SECONDS_PER_DAY),
  };

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-base font-medium mb-2 flex items-center">
          <Download className="h-4 w-4 mr-2" />
          {t('settings.dataExport.title')}
        </h4>
        <p className="text-sm text-muted-foreground">{t('settings.dataExport.description')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ContentList
          title={t('settings.dataExport.includedTitle')}
          items={INCLUDED_ITEMS.map((item) => t(`settings.dataExport.included.${item}`))}
          icon={Check}
          iconClassName="text-success"
        />
        <ContentList
          title={t('settings.dataExport.excludedTitle')}
          items={EXCLUDED_ITEMS.map((item) => t(`settings.dataExport.excluded.${item}`))}
          icon={X}
          iconClassName="text-muted-foreground"
        />
      </div>

      <StatusBanner variant="warning" icon={<ShieldAlert className="h-5 w-5 text-warning" />}>
        {t('settings.dataExport.sensitive')}
      </StatusBanner>

      {data.latest && <ExportStatus record={data.latest} />}

      {!data.available && <StatusBanner variant="warning">{t('settings.dataExport.unavailable')}</StatusBanner>}

      {data.available && !active && data.nextAllowedAt && (
        <StatusBanner variant="info" icon={<Clock className="h-5 w-5 text-info" />}>
          {t('settings.dataExport.nextAllowed', { date: formatDateWithTime(data.nextAllowedAt) })}
        </StatusBanner>
      )}

      {requestExport.isError && !active && !isRateLimited(requestExport.error) && (
        <StatusBanner variant="error">{t('settings.dataExport.requestFailed')}</StatusBanner>
      )}

      <div className="space-y-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button className="w-full" disabled={!data.canRequest || requestExport.isPending}>
              {requestExport.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {t('settings.dataExport.button')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('settings.dataExport.confirmTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('settings.dataExport.confirmDescription')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={() => requestExport.mutate()}>
                {t('settings.dataExport.button')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <p className="text-xs text-muted-foreground">{t('settings.dataExport.limits', limits)}</p>
      </div>
    </div>
  );
};

export default DataExportSettings;
