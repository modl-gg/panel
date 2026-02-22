import React, { useState, useEffect } from 'react';
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

      const usage: StorageUsage = {
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
        aiQuota: billingUsageData?.ai ? {
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
        } : usageData.aiQuota ? {
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
        } : usageData.ai ? {
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
        title: "Error",
        description: "Failed to fetch storage data. Please try again.",
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
        title: "Feature Not Available",
        description: "Storage settings updates are not currently implemented. Please contact support to modify your storage limits.",
        variant: "destructive",
      });
      
      setShowStorageSettings(false);
    } catch (error) {
      console.error('Error updating storage settings:', error);
      toast({
        title: "Error",
        description: "Failed to update storage settings. Please try again.",
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
          title: "Success",
          description: "File deleted successfully.",
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
          title: "Success",
          description: `${selectedFiles.size} files deleted successfully.`,
        });
        setSelectedFiles(new Set());
      }
      
      setShowDeleteDialog(false);
      fetchStorageData();
    } catch (error) {
      console.error('Error deleting files:', error);
      toast({
        title: "Error",
        description: "Failed to delete files. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading storage usage...</p>
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
              <h3 className="font-medium text-amber-800 dark:text-amber-200">Storage Overage Alert</h3>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                You're using <strong>{storageUsage.quota.overageUsedFormatted}</strong> over your {storageUsage.quota.baseLimitFormatted} base storage limit. 
                This will cost <strong>${storageUsage.quota.overageCost}</strong> this month at $0.08/GB.
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                Consider cleaning up unused files or increasing your storage limit to avoid future charges.
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
              <h3 className="font-medium text-blue-800 dark:text-blue-200">Storage Limit Warning</h3>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                You're using <strong>{storageUsage.quota.baseUsagePercentage}%</strong> of your {storageUsage.quota.baseLimitFormatted} free storage limit.
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                Upgrade to premium for 200GB of storage plus overage protection.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Storage Overview */}
      {storageUsage && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center">
                  <HardDrive className="h-5 w-5 mr-2" />
                  Storage Usage
                </div>
                {storageUsage.quota?.isPaid && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowStorageSettings(true)}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
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
                        <span>Used: {storageUsage.quota.totalUsedFormatted}</span>
                        <span>Limit: {storageUsage.quota.totalLimitFormatted}</span>
                      </div>
                      <Progress 
                        value={storageUsage.quota.usagePercentage}
                        className="h-2"
                      />
                      <div className="text-xs text-muted-foreground mt-1">
                        {storageUsage.quota.usagePercentage}% used
                      </div>
                    </div>
                    
                    {storageUsage.quota.isPaid && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Base Storage:</span>
                          <span>{storageUsage.quota.baseLimitFormatted}</span>
                        </div>
                        {storageUsage.quota.overageUsed > 0 && (
                          <div className="flex justify-between text-sm">
                            <span>Overage Used:</span>
                            <span>{storageUsage.quota.overageUsedFormatted}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm">
                          <span>Overage Limit:</span>
                          <span>{storageUsage.quota.overageLimitFormatted}</span>
                        </div>
                        <p className="text-xs text-muted-foreground pt-1">
                          To configure your maximum storage limit, go to{' '}
                          <a
                            href="?category=general&sub=billing"
                            className="text-primary hover:underline"
                          >
                            Billing Settings
                          </a>.
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span>Used: {formatFileSize(storageUsage.totalUsed)}</span>
                      <span>Total: {formatFileSize(storageUsage.totalQuota)}</span>
                    </div>
                    <Progress
                      value={(storageUsage.totalUsed / storageUsage.totalQuota) * 100}
                      className="h-2"
                    />
                  </div>
                )}

                {/* Storage Breakdown */}
                <div className="border-t pt-4 mt-4">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Storage Breakdown</div>
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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Brain className="h-5 w-5 mr-2" />
                AI Usage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {storageUsage.aiQuota ? (
                  <>
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>Used: {formatRequestCount(storageUsage.aiQuota.totalUsed)} requests</span>
                        <span>Limit: {formatRequestCount(storageUsage.aiQuota.baseLimit)} requests</span>
                      </div>
                      <Progress 
                        value={storageUsage.aiQuota.usagePercentage}
                        className="h-2"
                      />
                      <div className="text-xs text-muted-foreground mt-1">
                        {storageUsage.aiQuota.usagePercentage}% used
                      </div>
                    </div>
                    
                    {storageUsage.aiQuota.overageUsed > 0 && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Overage Used:</span>
                          <span>{formatRequestCount(storageUsage.aiQuota.overageUsed)} requests</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Overage Cost:</span>
                          <span className="font-semibold">${storageUsage.aiQuota.overageCost.toFixed(2)}</span>
                        </div>
                      </div>
                    )}
                    
                    <div className="border-t pt-4 mt-4 space-y-1">
                      <div className="text-xs font-medium text-muted-foreground">AI Breakdown</div>
                      {Object.entries(storageUsage.aiQuota.byService).map(([service, count]) => (
                        <div key={service} className="flex justify-between text-xs">
                          <span className="capitalize">{service.replace('_', ' ')}: </span>
                          <span>{formatRequestCount(count as number)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Status:</span>
                      <span className="text-muted-foreground">Not available</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      AI usage tracking is not enabled for this server.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Storage Overage Billing Card */}
          {storageUsage.quota?.isPaid && storageUsage.quota.overageUsed > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <CreditCard className="h-5 w-5 mr-2" />
                  Storage Overage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Overage Used:</span>
                    <span>{storageUsage.quota.overageUsedFormatted}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Cost This Month:</span>
                    <span className="font-semibold">${storageUsage.quota.overageCost}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    $0.08/GB/month
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>System Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Total Files:</span>
                  <span>{files.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Selected:</span>
                  <span>{selectedFiles.size}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Filtered:</span>
                  <span>{filteredAndSortedFiles.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Can Upload:</span>
                  <span className={storageUsage.quota?.canUpload ? 'text-green-600' : 'text-red-600'}>
                    {storageUsage.quota?.canUpload ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>AI Available:</span>
                  <span className={storageUsage.aiQuota?.canUseAI ? 'text-green-600' : 'text-red-600'}>
                    {storageUsage.aiQuota?.canUseAI ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* File Management Controls */}
      <Card>
        <CardHeader>
          <CardTitle>File Management</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div>
              <Label htmlFor="search">Search Files</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search by name or path..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="filter-type">Filter by Type</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger>
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="ticket">Tickets</SelectItem>
                  <SelectItem value="evidence">Evidence</SelectItem>
                  <SelectItem value="logs">Logs</SelectItem>
                  <SelectItem value="backup">Backups</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="sort-by">Sort By</Label>
              <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="size">Size</SelectItem>
                  <SelectItem value="date">Date Modified</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="sort-order">Order</Label>
              <Select value={sortOrder} onValueChange={(value: any) => setSortOrder(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Ascending</SelectItem>
                  <SelectItem value="desc">Descending</SelectItem>
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
                  ? 'Deselect All' 
                  : 'Select All'}
              </Button>
              {selectedFiles.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteSelected}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Selected ({selectedFiles.size})
                </Button>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchStorageData}
            >
              Refresh
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
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Modified</TableHead>
                  <TableHead>Actions</TableHead>
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
                  Showing {(safePage - 1) * itemsPerPage + 1}-{Math.min(safePage * itemsPerPage, filteredAndSortedFiles.length)} of {filteredAndSortedFiles.length} files
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
                <span>per page</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {safePage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          {filteredAndSortedFiles.length === 0 && (
            <div className="text-center py-12">
              <HardDrive className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">No files found</h3>
              <p className="text-muted-foreground">
                {searchTerm || filterType !== 'all' 
                  ? 'Try adjusting your search or filter criteria.'
                  : 'No files have been uploaded yet.'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget === 'single' 
                ? 'This will permanently delete the selected file. This action cannot be undone.'
                : `This will permanently delete ${selectedFiles.size} selected files. This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Storage Settings Dialog */}
      <AlertDialog open={showStorageSettings} onOpenChange={setShowStorageSettings}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Storage Settings</AlertDialogTitle>
            <AlertDialogDescription>
              Configure your storage overage limits. You'll be charged ${storageUsage?.pricing?.storage?.overagePricePerGB}/GB/month for storage above your base limit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="overage-limit">Overage Limit</Label>
              <div className="mt-2">
                <Input
                  id="overage-limit"
                  type="number"
                  placeholder="Enter overage limit in GB"
                  value={Math.round(newOverageLimit / (1024 * 1024 * 1024))}
                  onChange={(e) => setNewOverageLimit(parseInt(e.target.value) * 1024 * 1024 * 1024)}
                  min="0"
                  max="1000"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Maximum additional storage allowed beyond your base {storageUsage?.quota?.baseLimitFormatted} limit
                </p>
              </div>
            </div>

            {storageSettings && (
              <div className="bg-muted/50 p-3 rounded-lg">
                <h4 className="font-medium text-sm mb-2">Current Limits</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Base Storage:</span>
                    <span>{storageUsage?.quota?.baseLimitFormatted}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Overage Limit:</span>
                    <span>{formatFileSize(newOverageLimit)}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>Total Limit:</span>
                    <span>{formatFileSize((storageUsage?.quota?.baseLimit || 0) + newOverageLimit)}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-amber-50 dark:bg-amber-900/10 p-3 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Important:</strong> Setting a higher overage limit will allow more storage usage, which may result in additional charges. Monitor your usage regularly.
              </p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={updateStorageSettings}
              disabled={settingsLoading}
            >
              {settingsLoading ? 'Saving...' : 'Save Settings'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UsageSettings;
