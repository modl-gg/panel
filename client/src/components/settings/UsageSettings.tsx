import React, { useState, useEffect } from 'react';
import { HardDrive, Search, Filter, Trash2, Download, FolderOpen, Calendar, AlertCircle, Settings, CreditCard, TrendingUp, Brain, Zap } from 'lucide-react';
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

  useEffect(() => {
    fetchStorageData();
    fetchStorageSettings();
  }, []);

  const fetchStorageData = async () => {
    try {
      setLoading(true);
      
      // Fetch storage usage
      const usageResponse = await fetch('/api/panel/storage/usage');
      const usage = await usageResponse.json();
      setStorageUsage(usage);

      // Fetch files
      const filesResponse = await fetch('/api/panel/storage/files');
      const filesData = await filesResponse.json();
      setFiles(filesData);
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
      const response = await fetch('/api/panel/storage/settings');
      const settings = await response.json();
      setStorageSettings(settings);
      setNewOverageLimit(settings.overageLimit);
    } catch (error) {
      console.error('Error fetching storage settings:', error);
    }
  };

  const updateStorageSettings = async () => {
    try {
      setSettingsLoading(true);
      
      const { csrfFetch } = await import('@/utils/csrf');
      const response = await csrfFetch('/api/panel/storage/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          overageLimit: newOverageLimit,
          overageEnabled: true,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update settings');
      }
      
      await fetchStorageSettings();
      await fetchStorageData(); // Refresh usage data
      setShowStorageSettings(false);
      
      toast({
        title: "Success",
        description: "Storage settings updated successfully.",
      });
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

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const getTypeColor = (type: string): string => {
    switch (type) {
      case 'ticket': return 'bg-blue-100 text-blue-800';
      case 'evidence': return 'bg-red-100 text-red-800';
      case 'logs': return 'bg-green-100 text-green-800';
      case 'backup': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
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

  const filteredAndSortedFiles = files
    .filter(file => {
      const matchesSearch = file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           file.path.toLowerCase().includes(searchTerm.toLowerCase());
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
      const { csrfFetch } = await import('@/utils/csrf');
      if (deleteTarget === 'single') {
        await csrfFetch(`/api/panel/storage/files/${fileToDelete}`, { method: 'DELETE' });
        toast({
          title: "Success",
          description: "File deleted successfully.",
        });
      } else {
        await csrfFetch('/api/panel/storage/files/batch', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileIds: Array.from(selectedFiles) }),
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
                        <span>Used: {storageUsage.aiQuota.totalUsed} requests</span>
                        <span>Limit: {storageUsage.aiQuota.baseLimit} requests</span>
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
                          <span>{storageUsage.aiQuota.overageUsed} requests</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Overage Cost:</span>
                          <span className="font-semibold">${storageUsage.aiQuota.overageCost.toFixed(2)}</span>
                        </div>
                      </div>
                    )}
                    
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-muted-foreground">By Service:</div>
                      {Object.entries(storageUsage.aiQuota.byService).map(([service, count]) => (
                        <div key={service} className="flex justify-between text-xs">
                          <span className="capitalize">{service.replace('_', ' ')}: </span>
                          <span>{count}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Status:</span>
                      <span className="text-muted-foreground">Loading...</span>
                    </div>
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
                    ${storageUsage.pricing?.storage?.overagePricePerGB}/GB/month
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

      {/* Storage Breakdown */}
      {storageUsage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="h-5 w-5 mr-2" />
              Storage Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      )}

      {/* File Management Controls */}
      <Card>
        <CardHeader>
          <CardTitle>File Management</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
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
                  <TableHead>Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Modified</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedFiles.map((file) => (
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
                        {file.type}
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
              Configure your storage overage limits. You'll be charged ${storageUsage?.pricing?.overagePricePerGB}/GB/month for storage above your base limit.
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