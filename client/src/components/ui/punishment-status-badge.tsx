import { useTranslation } from 'react-i18next';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import type { PunishmentStatusKind } from '@/utils/punishment-status';

const STATUS_STYLES: Record<PunishmentStatusKind, string> = {
  pardoned: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-700',
  unstarted: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700',
  active: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 border-green-300 dark:border-green-700',
  inactive: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600',
};

const STATUS_LABEL_KEYS: Record<PunishmentStatusKind, string> = {
  pardoned: 'status.pardoned',
  unstarted: 'player.unstarted',
  active: 'status.active',
  inactive: 'status.inactive',
};

export function PunishmentStatusBadge({ status }: { status: PunishmentStatusKind }) {
  const { t } = useTranslation();
  return (
    <Badge variant="outline" className={`text-xs ${STATUS_STYLES[status]}`}>
      {t(STATUS_LABEL_KEYS[status])}
    </Badge>
  );
}
