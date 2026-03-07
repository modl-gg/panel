import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Database, Download, AlertCircle, CheckCircle2, Clock, Upload, Loader2, X } from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@modl-gg/shared-web/components/ui/select';
import { Alert, AlertDescription } from '@modl-gg/shared-web/components/ui/alert';
import { Progress } from '@modl-gg/shared-web/components/ui/progress';
import { Card } from '@modl-gg/shared-web/components/ui/card';
import { useMigrationStatus, useStartMigration, useCancelMigration } from '@/hooks/use-data';

const MIGRATION_TYPES = [
  { value: 'LiteBans', label: 'LiteBans (Spigot/Velocity/BungeeCord)' }
];

const MigrationTool: React.FC = () => {
  const { t } = useTranslation();
  const [selectedType, setSelectedType] = useState<string>('');
  const [showCompletedAlert, setShowCompletedAlert] = useState(false);
  const [lastCompletedMigration, setLastCompletedMigration] = useState<any>(null);
  
  const { data: migrationStatus, isLoading: statusLoading } = useMigrationStatus();
  const startMigration = useStartMigration();
  const cancelMigration = useCancelMigration();

  const currentMigration = migrationStatus?.currentMigration;
  const isActive = currentMigration && 
    currentMigration.status !== 'completed' && 
    currentMigration.status !== 'failed';
  const onCooldown = migrationStatus?.cooldown?.onCooldown;
  const cooldownRemainingMs = migrationStatus?.cooldown?.remainingTime || 0;
  
  // Track when migration completes and show alert
  useEffect(() => {
    if (currentMigration && 
        (currentMigration.status === 'completed' || currentMigration.status === 'failed')) {
      setShowCompletedAlert(true);
      setLastCompletedMigration(currentMigration);
      
      // Auto-hide the alert after 10 seconds
      const timer = setTimeout(() => {
        setShowCompletedAlert(false);
      }, 10000);
      
      return () => clearTimeout(timer);
    }
    
    return undefined;
  }, [currentMigration?.id, currentMigration?.status]);
  
  const handleStartMigration = async () => {
    if (!selectedType || onCooldown || isActive) return;
    
    // Hide any previous completion alert
    setShowCompletedAlert(false);
    setLastCompletedMigration(null);
    
    try {
      await startMigration.mutateAsync({ migrationType: selectedType });
      setSelectedType('');
    } catch (error) {
      console.error('Failed to start migration:', error);
    }
  };

  const handleCancelMigration = async () => {
    if (!isActive) return;
    
    try {
      await cancelMigration.mutateAsync();
    } catch (error) {
      console.error('Failed to cancel migration:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'idle':
      case 'building_json':
        return <Download className="h-5 w-5 text-blue-500 animate-pulse" />;
      case 'uploading_json':
        return <Upload className="h-5 w-5 text-blue-500 animate-pulse" />;
      case 'processing_data':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'idle':
        return t('settings.migration.statusConnecting');
      case 'building_json':
        return t('settings.migration.statusBuildingJson');
      case 'uploading_json':
        return t('settings.migration.statusUploading');
      case 'processing_data':
        return t('settings.migration.statusProcessing');
      case 'completed':
        return t('settings.migration.statusCompleted');
      case 'failed':
        return t('settings.migration.statusFailed', { type: currentMigration.migrationType });
      default:
        return t('settings.migration.statusUnknown');
    }
  };

  const getProgressPercentage = (status: string, progress?: any) => {
    if (progress?.totalRecords && progress?.recordsProcessed) {
      return Math.round((progress.recordsProcessed / progress.totalRecords) * 100);
    }
    
    switch (status) {
      case 'idle':
        return 5;
      case 'building_json':
        return 25;
      case 'uploading_json':
        return 50;
      case 'processing_data':
        return 75;
      case 'completed':
        return 100;
      default:
        return 0;
    }
  };

  const formatCooldownTime = (ms: number) => {
    const hours = Math.floor(ms / (60 * 60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
    return `${hours}h ${minutes}m`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  if (statusLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Migration Tool Header */}
      <div>
        <h4 className="text-base font-medium mb-2 flex items-center">
          <Database className="h-4 w-4 mr-2" />
          {t('settings.migration.dataMigration')}
        </h4>
        <p className="text-sm text-muted-foreground">
          {t('settings.migration.dataMigrationDesc')}
        </p>
      </div>

      {/* Active Migration Progress */}
      {isActive && currentMigration && (
        <Card className="p-4 border-blue-500/50 bg-blue-500/5">
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                {getStatusIcon(currentMigration.status)}
                <div>
                  <p className="font-medium">{getStatusText(currentMigration.status)}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.migration.migratingFrom', { type: currentMigration.migrationType })}
                  </p>
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleCancelMigration}
                disabled={cancelMigration.isPending}
              >
                {cancelMigration.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <X className="h-4 w-4 mr-1" />
                    {t('common.cancel')}
                  </>
                )}
              </Button>
            </div>

            {currentMigration.progress && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{currentMigration.progress.message}</span>
                  <span className="font-medium">
                    {getProgressPercentage(currentMigration.status, currentMigration.progress)}%
                  </span>
                </div>
                <Progress value={getProgressPercentage(currentMigration.status, currentMigration.progress)} />
                
                {currentMigration.progress.recordsProcessed !== undefined && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {t('settings.migration.processed', { count: currentMigration.progress.recordsProcessed })}
                      {currentMigration.progress.totalRecords && ` / ${currentMigration.progress.totalRecords}`}
                    </span>
                    {currentMigration.progress.recordsSkipped > 0 && (
                      <span className="text-yellow-600">
                        {t('settings.migration.skipped', { count: currentMigration.progress.recordsSkipped })}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {currentMigration.error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{currentMigration.error}</AlertDescription>
              </Alert>
            )}
          </div>
        </Card>
      )}

      {/* Completed/Failed/Cancelled Migration Result */}
      {showCompletedAlert && lastCompletedMigration && (() => {
        const isCancelled = lastCompletedMigration.error?.toLowerCase().includes('cancelled');
        const isSuccess = lastCompletedMigration.status === 'completed';
        const variant = isSuccess ? 'default' : (isCancelled ? 'default' : 'destructive');

        return (
          <Alert variant={variant} className={isCancelled ? 'border-amber-500/50 bg-amber-500/5' : undefined}>
            {isSuccess ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : isCancelled ? (
              <X className="h-4 w-4 text-amber-600" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <AlertDescription className={isCancelled ? 'text-amber-700 dark:text-amber-400' : undefined}>
              {isSuccess ? (
                <>
                  {t('settings.migration.migrationCompletedSuccess')}
                  {lastCompletedMigration.progress && (
                    <span className="ml-1">
                      {t('settings.migration.processedRecords', { count: lastCompletedMigration.progress.recordsProcessed })}
                      {lastCompletedMigration.progress.recordsSkipped > 0 &&
                        t('settings.migration.skippedSuffix', { count: lastCompletedMigration.progress.recordsSkipped })}.
                    </span>
                  )}
                </>
              ) : isCancelled ? (
                t('settings.migration.migrationCancelled')
              ) : (
                lastCompletedMigration.error || t('settings.migration.migrationFailed')
              )}
            </AlertDescription>
          </Alert>
        );
      })()}

      {/* Cooldown Warning */}
      {onCooldown && !isActive && (
        <Alert>
          <Clock className="h-4 w-4" />
          <AlertDescription>
            {t('settings.migration.cooldownActive', { time: formatCooldownTime(cooldownRemainingMs) })}
          </AlertDescription>
        </Alert>
      )}

      {/* Migration Start Controls */}
      {!isActive && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('settings.migration.migrationType')}</label>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger>
                <SelectValue placeholder={t('settings.migration.selectMigrationType')} />
              </SelectTrigger>
              <SelectContent>
                {MIGRATION_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('settings.migration.selectSystemHelp')}
            </p>
          </div>

          <Button
            onClick={handleStartMigration}
            disabled={!selectedType || onCooldown || startMigration.isPending}
            className="w-full"
          >
            {startMigration.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('settings.migration.startingMigration')}
              </>
            ) : (
              <>
                <Database className="h-4 w-4 mr-2" />
                {t('settings.migration.startMigration')}
              </>
            )}
          </Button>
        </div>
      )}

      {/* Migration History */}
      {migrationStatus?.history && migrationStatus.history.length > 0 && (
        <div className="space-y-3">
          <h5 className="text-sm font-medium">{t('settings.migration.recentMigrations')}</h5>
          <div className="space-y-2">
            {migrationStatus.history.slice(0, 5).map((entry: any, index: number) => (
              <div
                key={entry.id || index}
                className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
              >
                <div className="flex items-center space-x-3">
                  {entry.status === 'completed' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      {entry.migrationType.toUpperCase()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(entry.completedAt)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm">
                    {t('settings.migration.recordsCount', { count: entry.recordsProcessed })}
                  </p>
                  {entry.recordsSkipped > 0 && (
                    <p className="text-xs text-yellow-600">
                      {t('settings.migration.skipped', { count: entry.recordsSkipped })}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last Migration Timestamp */}
      {migrationStatus?.lastMigrationTimestamp && (
        <p className="text-xs text-muted-foreground">
          {t('settings.migration.lastSuccessfulMigration', { date: formatDate(migrationStatus.lastMigrationTimestamp) })}
        </p>
      )}
    </div>
  );
};

export default MigrationTool;

