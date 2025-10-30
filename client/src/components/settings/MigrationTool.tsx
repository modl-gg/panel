import React, { useState } from 'react';
import { Database, Download, AlertCircle, CheckCircle2, Clock, Upload, Loader2, X } from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@modl-gg/shared-web/components/ui/select';
import { Alert, AlertDescription } from '@modl-gg/shared-web/components/ui/alert';
import { Progress } from '@modl-gg/shared-web/components/ui/progress';
import { Card } from '@modl-gg/shared-web/components/ui/card';
import { useMigrationStatus, useStartMigration, useCancelMigration } from '@/hooks/use-data';

const MIGRATION_TYPES = [
  { value: 'litebans', label: 'LiteBans' }
];

const MigrationTool: React.FC = () => {
  const [selectedType, setSelectedType] = useState<string>('');
  
  const { data: migrationStatus, isLoading: statusLoading } = useMigrationStatus();
  const startMigration = useStartMigration();
  const cancelMigration = useCancelMigration();

  const currentMigration = migrationStatus?.currentMigration;
  const isActive = currentMigration && 
    currentMigration.status !== 'completed' && 
    currentMigration.status !== 'failed';
  const onCooldown = migrationStatus?.cooldown?.onCooldown;
  const cooldownRemainingMs = migrationStatus?.cooldown?.remainingTime || 0;
  
  const handleStartMigration = async () => {
    if (!selectedType || onCooldown || isActive) return;
    
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
        return 'Waiting for Minecraft server...';
      case 'building_json':
        return 'Building export file on Minecraft server...';
      case 'uploading_json':
        return 'Uploading migration data...';
      case 'processing_data':
        return 'Processing and importing data...';
      case 'completed':
        return 'Migration completed successfully';
      case 'failed':
        return 'Migration failed';
      default:
        return 'Unknown status';
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
          Data Migration
        </h4>
        <p className="text-sm text-muted-foreground">
          Import player data from external punishment systems into modl.gg. Only Super Admins can initiate migrations.
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
                    Migrating from {currentMigration.migrationType.toUpperCase()}
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
                    Cancel
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
                      Processed: {currentMigration.progress.recordsProcessed}
                      {currentMigration.progress.totalRecords && ` / ${currentMigration.progress.totalRecords}`}
                    </span>
                    {currentMigration.progress.recordsSkipped > 0 && (
                      <span className="text-yellow-600">
                        Skipped: {currentMigration.progress.recordsSkipped}
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

      {/* Completed/Failed Migration Result */}
      {!isActive && currentMigration && (
        <Alert variant={currentMigration.status === 'completed' ? 'default' : 'destructive'}>
          {currentMigration.status === 'completed' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertDescription>
            {currentMigration.status === 'completed' ? (
              <>
                Last migration completed successfully.
                {currentMigration.progress && (
                  <span className="ml-1">
                    Processed {currentMigration.progress.recordsProcessed} records
                    {currentMigration.progress.recordsSkipped > 0 && 
                      `, skipped ${currentMigration.progress.recordsSkipped}`}.
                  </span>
                )}
              </>
            ) : (
              currentMigration.error || 'Migration failed. You can retry immediately.'
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Cooldown Warning */}
      {onCooldown && !isActive && (
        <Alert>
          <Clock className="h-4 w-4" />
          <AlertDescription>
            Migration cooldown active. You can start a new migration in {formatCooldownTime(cooldownRemainingMs)}.
          </AlertDescription>
        </Alert>
      )}

      {/* Migration Start Controls */}
      {!isActive && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Migration Type</label>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger>
                <SelectValue placeholder="Select migration type..." />
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
              Select the external system you want to migrate data from
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
                Starting Migration...
              </>
            ) : (
              <>
                <Database className="h-4 w-4 mr-2" />
                Start Migration
              </>
            )}
          </Button>
        </div>
      )}

      {/* Migration History */}
      {migrationStatus?.history && migrationStatus.history.length > 0 && (
        <div className="space-y-3">
          <h5 className="text-sm font-medium">Recent Migrations</h5>
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
                    {entry.recordsProcessed} records
                  </p>
                  {entry.recordsSkipped > 0 && (
                    <p className="text-xs text-yellow-600">
                      {entry.recordsSkipped} skipped
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
          Last successful migration: {formatDate(migrationStatus.lastMigrationTimestamp)}
        </p>
      )}
    </div>
  );
};

export default MigrationTool;

