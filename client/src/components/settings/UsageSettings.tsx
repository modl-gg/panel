import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { HardDrive, Search, Trash2, Download, FolderOpen, Calendar, AlertCircle, Settings, CreditCard, Brain } from 'lucide-react';
import { getApiUrl, getCurrentDomain, apiFetch } from '@/lib/api';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { Label } from '@modl-gg/shared-web/components/ui/label';
import { Progress } from '@modl-gg/shared-web/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import { Checkbox } from '@modl-gg/shared-web/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@modl-gg/shared-web/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@modl-gg/shared-web/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@modl-gg/shared-web/components/ui/alert-dialog';
import { useToast } from '@modl-gg/shared-web/hooks/use-toast';
import { formatFileSize } from '@/utils/file-utils';

interface StorageFile {
  id: string;
  name: string;
  path: string;
  size: number;
  type: 'ticket' | 'evidence' | 'logs' | 'backup' | 'other';
  createdAt: string;
  lastModified: string;
  url: string;
}

interface StorageUsage {
  isPremium: boolean;
  totalUsed: number;
  totalQuota: number;
  byType: {
    ticket: number;
    evidence: number;
    logs: number;
    backup: number;
    other: number;
  };
  quota?: {
    totalUsed: number;
    totalUsedFormatted: string;
    baseLimit: number;
    baseLimitFormatted: string;
    overageLimit: number;
    overageLimitFormatted: string;
    totalLimit: number;
    totalLimitFormatted: string;
    overageUsed: number;
    overageUsedFormatted: string;
    overageCost: number;
    isPaid: boolean;
    canUpload: boolean;
    usagePercentage: number;
    baseUsagePercentage: number;
  };
  aiQuota?: {
    totalUsed: number;
    baseLimit: number;
    overageUsed: number;
    overageCost: number;
    canUseAI: boolean;
    usagePercentage: number;
    byService: {
      moderation: number;
      ticket_analysis: number;
      appeal_analysis: number;
      other: number;
    };
  };
  pricing?: {
    storage: {
      overagePricePerGB: number;
      currency: string;
      period: string;
    };
    ai: {
      overagePricePerRequest: number;
      currency: string;
      period: string;
    };
  };
}

interface StorageSettings {
  overageLimit: number;
  overageEnabled: boolean;
  isPaid: boolean;
  limits: {
    freeLimit: number;
    paidLimit: number;
    defaultOverageLimit: number;
  };
}

const UsageSettings = () => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);
  const [storageSettings, setStorageSettings] = useState<StorageSettings | null>(null);
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<'single' | 'multiple'>('single');
  const [fileToDelete, setFileToDelete] = useState<string>('');
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'date'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showStorageSettings, setShowStorageSettings] = useState(false);
  const [newOverageLimit, setNewOverageLimit] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const DEFAULT_AI_LIMIT = 1000;

  useEffect(() => {
    fetchStorageData();
    fetchStorageSettings();
  }, []);

const fetchStorageData = async () => {
    try {
      setLoading(true);

      const requestOptions = {
        credentials: 'include' as RequestCredentials,
        headers: { 'X-Server-Domain': getCurrentDomain() }
      };

      const [usageResponse, billingUsageResponse] = await Promise.all([
        fetch(getApiUrl('/v1/panel/storage/quota'), requestOptions),
        fetch(getApiUrl('/v1/panel/billing/usage'), requestOptions)
      ]);

      if (!usageResponse.ok) {
        throw new Error(`Failed to fetch storage quota: ${usageResponse.status}`);
      }

      const usageData = await usageResponse.json();
      const billingUsageData = billingUsageResponse.ok ? await billingUsageResponse.json() : null;
      
      // Detect response format: 
      // - Old format: { usedBytes, maxBytes, usedPercentage, usedFormatted, maxFormatted } (values in bytes)
      // - New format: { cdn: { used, limit... }, ai: { used, limit... } } (values in GB)
      const isNewFormat = usageData.cdn !== undefined;
      
      let cdnUsedBytes: number;
      let cdnLimitBytes: number;
      let cdnPercentage: number;
      
      if (isNewFormat) {
        // New format: values are in GB, convert to bytes
        const cdnUsed = usageData.cdn?.used ?? 0;
        const cdnLimit = usageData.cdn?.limit ?? 0;
        cdnUsedBytes = cdnUsed * 1024 * 1024 * 1024;
        cdnLimitBytes = cdnLimit * 1024 * 1024 * 1024;
        cdnPercentage = usageData.cdn?.percentage ?? (cdnLimit > 0 ? (cdnUsed / cdnLimit) * 100 : 0);
      } else {
        // Old format: values are already in bytes
        cdnUsedBytes = usageData.usedBytes ?? 0;
        cdnLimitBytes = usageData.maxBytes ?? 0;
        cdnPercentage = usageData.usedPercentage ?? (cdnLimitBytes > 0 ? (cdnUsedBytes / cdnLimitBytes) * 100 : 0);
      }
      
      // Transform the data to match expected format
      // Use byType from backend if available, otherwise fallback to putting all in "other"
      const byType = usageData.byType ? {
        ticket: usageData.byType.ticket ?? 0,
        evidence: usageData.byType.evidence ?? 0,
        logs: usageData.byType.logs ?? 0,
        backup: usageData.byType.backup ?? 0,
        other: usageData.byType.other ?? 0
      } : {
        ticket: 0,
        evidence: 0,
        logs: 0,
        backup: 0,
        other: cdnUsedBytes
      };

      const isPremium = Boolean(usageData.isPremium);

      const usage: StorageUsage = {
        isPremium,
        totalUsed: cdnUsedBytes,
        totalQuota: cdnLimitBytes,
        byType,
        quota: {
          totalUsed: cdnUsedBytes,
          totalUsedFormatted: usageData.usedFormatted ?? formatFileSize(cdnUsedBytes),
          baseLimit: cdnLimitBytes,
          baseLimitFormatted: usageData.maxFormatted ?? formatFileSize(cdnLimitBytes),
          overageLimit: 0,
          overageLimitFormatted: '0 Bytes',
          totalLimit: cdnLimitBytes,
          totalLimitFormatted: usageData.maxFormatted ?? formatFileSize(cdnLimitBytes),
          overageUsed: 0,
          overageUsedFormatted: '0 Bytes',
          overageCost: usageData.cdn?.overageCost ?? 0,
          isPaid: billingUsageData?.usageBillingEnabled ?? usageData.usageBillingEnabled ?? false,
          canUpload: cdnPercentage < 100,
          usagePercentage: Math.round(cdnPercentage * 100) / 100,
          baseUsagePercentage: Math.round(cdnPercentage * 100) / 100
        },
        aiQuota: isPremium && billingUsageData?.ai ? {
          totalUsed: Number(billingUsageData.ai.used ?? 0),
          baseLimit: Number(billingUsageData.ai.limit ?? DEFAULT_AI_LIMIT),
          overageUsed: Number(billingUsageData.ai.overage ?? 0),
          overageCost: Number(billingUsageData.ai.overageCost ?? 0),
          canUseAI: Number(billingUsageData.ai.used ?? 0) < Number(billingUsageData.ai.limit ?? DEFAULT_AI_LIMIT),
          usagePercentage: Math.max(0, Math.min(100, Math.round(Number(billingUsageData.ai.percentage ?? 0) * 100) / 100)),
          byService: {
            moderation: 0,
            ticket_analysis: 0,
            appeal_analysis: 0,
            other: Number(billingUsageData.ai.used ?? 0)
          }
        } : isPremium && usageData.aiQuota ? {
          totalUsed: usageData.aiQuota.totalUsed ?? 0,
          baseLimit: usageData.aiQuota.baseLimit ?? 0,
          overageUsed: usageData.aiQuota.overageUsed ?? 0,
          overageCost: usageData.aiQuota.overageCost ?? 0,
          canUseAI: usageData.aiQuota.canUseAI ?? false,
          usagePercentage: Math.round((usageData.aiQuota.usagePercentage ?? 0) * 100) / 100,
          byService: usageData.aiQuota.byService ? {
            moderation: usageData.aiQuota.byService.moderation ?? 0,
            ticket_analysis: usageData.aiQuota.byService.ticket_analysis ?? 0,
            appeal_analysis: usageData.aiQuota.byService.appeal_analysis ?? 0,
            other: usageData.aiQuota.byService.other ?? 0
          } : {
            moderation: 0,
            ticket_analysis: 0,
            appeal_analysis: 0,
            other: usageData.aiQuota.totalUsed ?? 0
          }
        } : isPremium && usageData.ai ? {
          totalUsed: usageData.ai.used ?? 0,
          baseLimit: usageData.ai.limit ?? 0,
          overageUsed: usageData.ai.overage ?? 0,
          overageCost: usageData.ai.overageCost ?? 0,
          canUseAI: (usageData.ai.percentage ?? 0) < 100,
          usagePercentage: Math.round((usageData.ai.percentage ?? 0) * 100) / 100,
          byService: {
            moderation: 0,
            ticket_analysis: 0,
            appeal_analysis: 0,
            other: usageData.ai.used ?? 0
          }
        } : undefined,
        pricing: {
          storage: {
            overagePricePerGB: billingUsageData?.cdn?.overageRate ?? usageData.cdn?.overageRate ?? 0.08,
            currency: 'USD',
            period: 'month'
          },
          ai: {
            overagePricePerRequest: billingUsageData?.ai?.overageRate ?? usageData.ai?.overageRate ?? 0.02,
            currency: 'USD',
            period: 'month'
          }
        }
      };
      
      setStorageUsage(usage);

      // Fetch files
      const filesResponse = await fetch(getApiUrl('/v1/panel/storage/files'), requestOptions);
      if (!filesResponse.ok) {
        throw new Error(`Failed to fetch files: ${filesResponse.status}`);
      }
      const filesData = await filesResponse.json();
      
      // Transform the file data to match the expected structure
      const transformedFiles = (filesData.files || []).map((file: any) => {
        // Extract filename from the key (last part after /)
        const parts = file.key?.split('/') || [];
        const filename = parts[parts.length - 1] || 'Unknown';
        
        // Determine file type based on the folder in the path
        let fileType = 'other';
        if (file.key?.includes('/evidence/')) fileType = 'evidence';
        else if (file.key?.includes('/tickets/') || file.key?.includes('/ticket/')) fileType = 'ticket';
        else if (file.key?.includes('/logs/')) fileType = 'logs';
        else if (file.key?.includes('/backup/')) fileType = 'backup';
        
        return {
          id: file.key || `file-${Date.now()}-${Math.random()}`,
          name: filename,
          path: file.key || '',
          size: file.size || 0,
          type: fileType,
          createdAt: file.lastModified || new Date().toISOString(),
          lastModified: file.lastModified || new Date().toISOString(),
          url: file.url || ''
        };
      });
      
      setFiles(transformedFiles);
    } catch (error) {
      console.error('Error fetching storage data:', error);
      toast({
        title: t('toast.error'),
        description: t('settings.usage.fetchFailed'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchStorageSettings = async () => {
    try {
      // Use quota endpoint to get current settings
      const response = await fetch(getApiUrl('/v1/panel/storage/quota'), {
        credentials: 'include',
        headers: { 'X-Server-Domain': getCurrentDomain() }
      });
      const data = await response.json();
      
      // Transform to expected settings format
      const settings = {
        overageLimit: data.quota?.overageLimit || 0,
        overageEnabled: data.quota?.isPaid || false,
        isPaid: data.quota?.isPaid || false,
        limits: {
          freeLimit: data.quota?.baseLimit || 0,
          paidLimit: data.quota?.totalLimit || 0,
          defaultOverageLimit: data.quota?.overageLimit || 0
        }
      };
      
      setStorageSettings(settings);
      setNewOverageLimit(settings.overageLimit);
    } catch (error) {
      console.error('Error fetching storage settings:', error);
    }
  };

  const updateStorageSettings = async () => {
    try {
      setSettingsLoading(true);
      
      // For now, show a message that storage settings updates are not implemented
      // since there's no PUT endpoint for storage settings in the current implementation
      toast({
        title: t('settings.usage.featureNotAvailable'),
        description: t('settings.usage.storageSettingsNotImplemented'),
        variant: "destructive",
      });
      
      setShowStorageSettings(false);
    } catch (error) {
      console.error('Error updating storage settings:', error);
      toast({
        title: t('toast.error'),
        description: t('settings.usage.storageUpdateFailed'),
        variant: "destructive",
      });
    } finally {
      setSettingsLoading(false);
    }
  };


  const getTypeColor = (type: string): string => {
    switch (type) {
      case 'ticket': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'evidence': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      case 'logs': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'backup': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  const getFileType = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) return 'Image';
    if (['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv'].includes(ext)) return 'Video';
    if (['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(ext)) return 'Audio';
    if (['pdf'].includes(ext)) return 'PDF';
    if (['doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)) return 'Document';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'Archive';
    if (['json', 'xml', 'yml', 'yaml', 'csv'].includes(ext)) return 'Data';
    if (['log'].includes(ext)) return 'Log';
    return 'File';
  };

  const getFileTypeColor = (fileType: string): string => {
    switch (fileType) {
      case 'Image': return 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300';
      case 'Video': return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300';
      case 'Audio': return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300';
      case 'PDF': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
      case 'Document': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
      case 'Archive': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
      case 'Data': return 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300';
      case 'Log': return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'ticket': return <FolderOpen className="h-4 w-4" />;
      case 'evidence': return <AlertCircle className="h-4 w-4" />;
      case 'logs': return <Calendar className="h-4 w-4" />;
      case 'backup': return <Download className="h-4 w-4" />;
      default: return <HardDrive className="h-4 w-4" />;
    }
  };

  const formatRequestCount = (value: number) => Math.round(value).toLocaleString();

  const filteredAndSortedFiles = files
    .filter(file => {
      const matchesSearch = (file.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                           (file.path?.toLowerCase() || '').includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'all' || file.type === filterType;
      return matchesSearch && matchesType;
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'date':
          comparison = new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime();
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedFiles.length / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedFiles = filteredAndSortedFiles.slice(
    (safePage - 1) * itemsPerPage,
    safePage * itemsPerPage
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterType, sortBy, sortOrder]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const handleSelectFile = (fileId: string) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(fileId)) {
      newSelected.delete(fileId);
    } else {
      newSelected.add(fileId);
    }
    setSelectedFiles(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedFiles.size === filteredAndSortedFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(filteredAndSortedFiles.map(f => f.id)));
    }
  };

  const handleDeleteFile = (fileId: string) => {
    setFileToDelete(fileId);
    setDeleteTarget('single');
    setShowDeleteDialog(true);
  };

  const handleDeleteSelected = () => {
    if (selectedFiles.size === 0) return;
    setDeleteTarget('multiple');
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    try {
      const csrfFetch = apiFetch;
      if (deleteTarget === 'single') {
        const fileToDeleteKey = files.find(f => f.id === fileToDelete)?.path || fileToDelete;
        await csrfFetch('/v1/panel/storage/bulk-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keys: [fileToDeleteKey] }),
        });
        toast({
          title: t('toast.success'),
          description: t('settings.usage.fileDeleted'),
        });
      } else {
        // For bulk delete, we need to get the keys for all selected files
        const fileKeys = files
          .filter(f => selectedFiles.has(f.id))
          .map(f => f.path)
          .filter(key => key); // Remove any undefined keys
          
        await csrfFetch('/v1/panel/storage/bulk-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keys: fileKeys }),
        });
        toast({
          title: t('toast.success'),
          description: t('settings.usage.filesDeleted', { count: selectedFiles.size }),
        });
        setSelectedFiles(new Set());
      }
      
      setShowDeleteDialog(false);
      fetchStorageData();
    } catch (error) {
      console.error('Error deleting files:', error);
      toast({
        title: t('toast.error'),
        description: t('settings.usage.deleteFailed'),
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">{t('settings.usage.loadingStorage')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overage Warning */}
      {storageUsage?.quota?.isPaid && storageUsage?.quota?.overageUsed > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-medium text-amber-800 dark:text-amber-200">{t('settings.usage.storageOverageAlert')}</h3>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                {t('settings.usage.storageOverageDesc', { overageUsed: storageUsage.quota.overageUsedFormatted, baseLimit: storageUsage.quota.baseLimitFormatted, cost: storageUsage.quota.overageCost })}
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                {t('settings.usage.storageOverageTip')}
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Free User Limit Warning */}
      {!storageUsage?.quota?.isPaid && storageUsage?.quota?.baseUsagePercentage >= 80 && (
        <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-medium text-blue-800 dark:text-blue-200">{t('settings.usage.storageLimitWarning')}</h3>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                {t('settings.usage.storageLimitWarningDesc', { percentage: storageUsage.quota.baseUsagePercentage, limit: storageUsage.quota.baseLimitFormatted })}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                {t('settings.usage.upgradePremiumStorage')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Storage Overview */}
      {storageUsage && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card className="rounded-card shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center">
                  <HardDrive className="h-5 w-5 mr-2" />
                  {t('settings.usage.storageUsage')}
                </div>
                {storageUsage.quota?.isPaid && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowStorageSettings(true)}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    {t('common.settings')}
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {storageUsage.quota ? (
                  <>
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>{t('settings.usage.used')}: {storageUsage.quota.totalUsedFormatted}</span>
                        <span>{t('settings.usage.limit')}: {storageUsage.quota.totalLimitFormatted}</span>
                      </div>
                      <Progress 
                        value={storageUsage.quota.usagePercentage}
                        className="h-2"
                      />
                      <div className="text-xs text-muted-foreground mt-1">
                        {t('settings.usage.percentUsed', { percent: storageUsage.quota.usagePercentage })}
                      </div>
                    </div>
                    
                    {storageUsage.quota.isPaid && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>{t('settings.usage.baseStorage')}:</span>
                          <span>{storageUsage.quota.baseLimitFormatted}</span>
                        </div>
                        {storageUsage.quota.overageUsed > 0 && (
                          <div className="flex justify-between text-sm">
                            <span>{t('settings.usage.overageUsed')}:</span>
                            <span>{storageUsage.quota.overageUsedFormatted}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm">
                          <span>{t('settings.usage.overageLimit')}:</span>
                          <span>{storageUsage.quota.overageLimitFormatted}</span>
                        </div>
                        <p className="text-xs text-muted-foreground pt-1">
                          {t('settings.usage.configureStoragePrefix')}{' '}
                          <a
                            href="?category=general&sub=billing"
                            className="text-primary hover:underline"
                          >
                            {t('settings.usage.billingSettings')}
                          </a>.
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span>{t('settings.usage.used')}: {formatFileSize(storageUsage.totalUsed)}</span>
                      <span>{t('settings.usage.total')}: {formatFileSize(storageUsage.totalQuota)}</span>
                    </div>
                    <Progress
                      value={(storageUsage.totalUsed / storageUsage.totalQuota) * 100}
                      className="h-2"
                    />
                  </div>
                )}

                {/* Storage Breakdown */}
                <div className="border-t pt-4 mt-4">
                  <div className="text-xs font-medium text-muted-foreground mb-2">{t('settings.usage.storageBreakdown')}</div>
                  <div className="space-y-2">
                    {Object.entries(storageUsage.byType).map(([type, size]) => (
                      <div key={type} className="flex items-center justify-between text-sm">
                        <div className="flex items-center space-x-2">
                          {getTypeIcon(type)}
                          <span className="capitalize">{type}</span>
                        </div>
                        <span>{formatFileSize(size)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI Usage Card */}
          <Card className="rounded-card shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Brain className="h-5 w-5 mr-2" />
                {t('settings.usage.aiUsage')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {storageUsage.aiQuota ? (
                  <>
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>{t('settings.usage.used')}: {formatRequestCount(storageUsage.aiQuota.totalUsed)} {t('settings.billing.requests')}</span>
                        <span>{t('settings.usage.limit')}: {formatRequestCount(storageUsage.aiQuota.baseLimit)} {t('settings.billing.requests')}</span>
                      </div>
                      <Progress 
                        value={storageUsage.aiQuota.usagePercentage}
                        className="h-2"
                      />
                      <div className="text-xs text-muted-foreground mt-1">
                        {t('settings.usage.percentUsed', { percent: storageUsage.aiQuota.usagePercentage })}
                      </div>
                    </div>
                    
                    {storageUsage.aiQuota.overageUsed > 0 && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>{t('settings.usage.overageUsed')}:</span>
                          <span>{formatRequestCount(storageUsage.aiQuota.overageUsed)} {t('settings.billing.requests')}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>{t('settings.usage.overageCost')}:</span>
                          <span className="font-semibold">${storageUsage.aiQuota.overageCost.toFixed(2)}</span>
                        </div>
                      </div>
                    )}
                    
                    <div className="border-t pt-4 mt-4 space-y-1">
                      <div className="text-xs font-medium text-muted-foreground">{t('settings.usage.aiBreakdown')}</div>
                      {Object.entries(storageUsage.aiQuota.byService).map(([service, count]) => (
                        <div key={service} className="flex justify-between text-xs">
                          <span className="capitalize">{service.replace('_', ' ')}: </span>
                          <span>{formatRequestCount(count as number)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : storageUsage.isPremium ? (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>{t('settings.usage.status')}:</span>
                      <span className="text-muted-foreground">{t('settings.usage.notAvailable')}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.usage.aiTrackingNotEnabled')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>{t('settings.usage.status')}:</span>
                      <span className="text-muted-foreground">{t('settings.usage.premiumOnly')}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.usage.aiPremiumOnly')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.usage.upgradePremiumAI')}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Storage Overage Billing Card */}
          {storageUsage.quota?.isPaid && storageUsage.quota.overageUsed > 0 && (
            <Card className="rounded-card shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <CreditCard className="h-5 w-5 mr-2" />
                  {t('settings.usage.storageOverage')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{t('settings.usage.overageUsed')}:</span>
                    <span>{storageUsage.quota.overageUsedFormatted}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>{t('settings.usage.costThisMonth')}:</span>
                    <span className="font-semibold">${storageUsage.quota.overageCost}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t('settings.usage.storageRate')}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="rounded-card shadow-card">
            <CardHeader>
              <CardTitle>{t('settings.usage.systemStatus')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{t('settings.usage.totalFiles')}:</span>
                  <span>{files.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>{t('settings.usage.selected')}:</span>
                  <span>{selectedFiles.size}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>{t('settings.usage.filtered')}:</span>
                  <span>{filteredAndSortedFiles.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>{t('settings.usage.canUpload')}:</span>
                  <span className={storageUsage.quota?.canUpload ? 'text-green-600' : 'text-red-600'}>
                    {storageUsage.quota?.canUpload ? t('common.yes') : t('common.no')}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>{t('settings.usage.aiAvailable')}:</span>
                  <span className={storageUsage.isPremium && storageUsage.aiQuota ? 'text-green-600' : 'text-red-600'}>
                    {storageUsage.isPremium && storageUsage.aiQuota ? t('common.yes') : t('common.no')}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* File Management Controls */}
      <Card className="rounded-card shadow-card">
        <CardHeader>
          <CardTitle>{t('settings.usage.fileManagement')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div>
              <Label htmlFor="search">{t('settings.usage.searchFiles')}</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder={t('settings.usage.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="filter-type">{t('settings.usage.filterByType')}</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger>
                  <SelectValue placeholder={t('settings.usage.allTypes')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('settings.usage.allTypes')}</SelectItem>
                  <SelectItem value="ticket">{t('settings.usage.typeTickets')}</SelectItem>
                  <SelectItem value="evidence">{t('settings.usage.typeEvidence')}</SelectItem>
                  <SelectItem value="logs">{t('settings.usage.typeLogs')}</SelectItem>
                  <SelectItem value="backup">{t('settings.usage.typeBackups')}</SelectItem>
                  <SelectItem value="other">{t('common.other')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="sort-by">{t('settings.usage.sortBy')}</Label>
              <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">{t('table.name')}</SelectItem>
                  <SelectItem value="size">{t('settings.usage.size')}</SelectItem>
                  <SelectItem value="date">{t('settings.usage.dateModified')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="sort-order">{t('settings.usage.order')}</Label>
              <Select value={sortOrder} onValueChange={(value: any) => setSortOrder(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">{t('settings.usage.ascending')}</SelectItem>
                  <SelectItem value="desc">{t('settings.usage.descending')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
                disabled={filteredAndSortedFiles.length === 0}
              >
                {selectedFiles.size === filteredAndSortedFiles.length && filteredAndSortedFiles.length > 0
                  ? t('settings.usage.deselectAll')
                  : t('settings.usage.selectAll')}
              </Button>
              {selectedFiles.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteSelected}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t('settings.usage.deleteSelected', { count: selectedFiles.size })}
                </Button>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchStorageData}
            >
              {t('common.refresh')}
            </Button>
          </div>

          {/* Files Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedFiles.size === filteredAndSortedFiles.length && filteredAndSortedFiles.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead>{t('table.name')}</TableHead>
                  <TableHead>{t('settings.usage.category')}</TableHead>
                  <TableHead>{t('settings.usage.type')}</TableHead>
                  <TableHead>{t('settings.usage.size')}</TableHead>
                  <TableHead>{t('settings.usage.modified')}</TableHead>
                  <TableHead>{t('table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedFiles.map((file) => (
                  <TableRow key={file.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedFiles.has(file.id)}
                        onCheckedChange={() => handleSelectFile(file.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{file.name}</div>
                        <div className="text-sm text-muted-foreground truncate max-w-xs">
                          {file.path}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getTypeColor(file.type)}>
                        <span className="mr-1">{getTypeIcon(file.type)}</span>
                        {file.type.charAt(0).toUpperCase() + file.type.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getFileTypeColor(getFileType(file.name))}>
                        {getFileType(file.name)}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatFileSize(file.size)}</TableCell>
                    <TableCell>
                      {new Date(file.lastModified).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(file.url, '_blank')}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteFile(file.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {filteredAndSortedFiles.length > 0 && (
            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>
                  {t('settings.usage.showingFiles', { from: (safePage - 1) * itemsPerPage + 1, to: Math.min(safePage * itemsPerPage, filteredAndSortedFiles.length), total: filteredAndSortedFiles.length })}
                </span>
                <Select value={String(itemsPerPage)} onValueChange={(value) => { setItemsPerPage(Number(value)); setCurrentPage(1); }}>
                  <SelectTrigger className="w-[80px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
                <span>{t('settings.usage.perPage')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                >
                  {t('common.previous')}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {t('settings.usage.pageOf', { page: safePage, total: totalPages })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                >
                  {t('common.next')}
                </Button>
              </div>
            </div>
          )}

          {filteredAndSortedFiles.length === 0 && (
            <div className="text-center py-12">
              <HardDrive className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">{t('settings.usage.noFilesFound')}</h3>
              <p className="text-muted-foreground">
                {searchTerm || filterType !== 'all'
                  ? t('settings.usage.adjustSearchFilter')
                  : t('settings.usage.noFilesUploaded')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.areYouSure')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget === 'single'
                ? t('settings.usage.deleteFileConfirm')
                : t('settings.usage.deleteFilesConfirm', { count: selectedFiles.size })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Storage Settings Dialog */}
      <AlertDialog open={showStorageSettings} onOpenChange={setShowStorageSettings}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.usage.storageSettingsTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.usage.storageSettingsDesc', { rate: storageUsage?.pricing?.storage?.overagePricePerGB })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="overage-limit">{t('settings.usage.overageLimit')}</Label>
              <div className="mt-2">
                <Input
                  id="overage-limit"
                  type="number"
                  placeholder={t('settings.usage.overageLimitPlaceholder')}
                  value={Math.round(newOverageLimit / (1024 * 1024 * 1024))}
                  onChange={(e) => setNewOverageLimit(parseInt(e.target.value) * 1024 * 1024 * 1024)}
                  min="0"
                  max="1000"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  {t('settings.usage.overageLimitHelp', { baseLimit: storageUsage?.quota?.baseLimitFormatted })}
                </p>
              </div>
            </div>

            {storageSettings && (
              <div className="bg-muted/50 p-3 rounded-lg">
                <h4 className="font-medium text-sm mb-2">{t('settings.usage.currentLimits')}</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>{t('settings.usage.baseStorage')}:</span>
                    <span>{storageUsage?.quota?.baseLimitFormatted}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('settings.usage.overageLimit')}:</span>
                    <span>{formatFileSize(newOverageLimit)}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>{t('settings.usage.total')}:</span>
                    <span>{formatFileSize((storageUsage?.quota?.baseLimit || 0) + newOverageLimit)}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-amber-50 dark:bg-amber-900/10 p-3 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>{t('common.important')}:</strong> {t('settings.usage.overageLimitWarning')}
              </p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={updateStorageSettings}
              disabled={settingsLoading}
            >
              {settingsLoading ? t('common.saving') : t('settings.usage.saveSettings')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UsageSettings;
