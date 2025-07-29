import React, { useEffect, useState } from 'react';
import { CreditCard, SettingsIcon, Globe, Key, Upload, Eye, EyeOff, Check, Copy, RefreshCw, Trash2, Plus, ChevronDown, ChevronRight, HardDrive } from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { Label } from '@modl-gg/shared-web/components/ui/label';
import { Separator } from '@modl-gg/shared-web/components/ui/separator';
import { Progress } from '@modl-gg/shared-web/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@modl-gg/shared-web/components/ui/collapsible';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import BillingSettings from './BillingSettings';
import DomainSettings from './DomainSettings';
import UsageSettings from './UsageSettings';
import { toast } from '@modl-gg/shared-web';
import { queryClient } from '@/lib/queryClient';

interface GeneralSettingsProps {
  // Server Configuration
  serverDisplayName: string;
  setServerDisplayName: (value: string) => void;
  
  // Server Icons
  homepageIconUrl: string;
  panelIconUrl: string;
  uploadingHomepageIcon: boolean;
  uploadingPanelIcon: boolean;
  handleHomepageIconUpload: (file: File) => void;
  handlePanelIconUpload: (file: File) => void;
  
  // API Key Management
  apiKey: string;
  fullApiKey: string;
  showApiKey: boolean;
  apiKeyCopied: boolean;
  isGeneratingApiKey: boolean;
  isRevokingApiKey: boolean;
  generateApiKey: () => void;
  revokeApiKey: () => void;
  revealApiKey: () => void;
  copyApiKey: () => void;
  maskApiKey: (key: string) => string;
  
  // Billing and Usage Data
  usageData?: any;
  getBillingSummary: () => string;
  getUsageSummary: () => string;
  getServerConfigSummary: () => string;
  getDomainSummary: () => string;
}

const GeneralSettings = ({
  serverDisplayName,
  setServerDisplayName,
  homepageIconUrl,
  panelIconUrl,
  uploadingHomepageIcon,
  uploadingPanelIcon,
  handleHomepageIconUpload,
  handlePanelIconUpload,
  apiKey,
  fullApiKey,
  showApiKey,
  apiKeyCopied,
  isGeneratingApiKey,
  isRevokingApiKey,
  generateApiKey,
  revokeApiKey,
  revealApiKey,
  copyApiKey,
  maskApiKey,
  usageData,
  getBillingSummary,
  getUsageSummary,
  getServerConfigSummary,
  getDomainSummary
}: GeneralSettingsProps) => {
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  
  // Collapsible state
  const [isBillingExpanded, setIsBillingExpanded] = useState(false);
  const [isUsageExpanded, setIsUsageExpanded] = useState(false);
  const [isServerConfigExpanded, setIsServerConfigExpanded] = useState(false);
  const [isDomainExpanded, setIsDomainExpanded] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');

    if (sessionId) {
      setIsBillingExpanded(true);
      toast({
        title: 'Payment Successful!',
        description: 'Your subscription has been activated.',
        variant: 'default',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/panel/billing/status'] });
      
      // Clean up the URL by removing the session_id query parameter
      urlParams.delete('session_id');
      const newUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ''}`;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-4">
        {/* Billing Settings - Moved to top */}
        {hasPermission('admin.settings.modify') && (
          <Collapsible open={isBillingExpanded} onOpenChange={setIsBillingExpanded}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors">
              <div className="flex items-center">
                <CreditCard className="h-4 w-4 mr-2" />
                <h4 className="text-base font-medium">Billing & Subscription</h4>
              </div>
              <div className="flex items-center space-x-2">
                {!isBillingExpanded && (
                  <div className="flex flex-col items-end space-y-1">
                    <span className="text-sm text-muted-foreground">
                      {getBillingSummary()}{getUsageSummary()}
                    </span>
                    {usageData && (usageData.cdn?.percentage > 0 || usageData.ai?.percentage > 0) && (
                      <div className="flex items-center space-x-2 text-xs">
                        {usageData.cdn?.percentage > 0 && (
                          <div className="flex items-center space-x-1">
                            <span className="text-muted-foreground">CDN:</span>
                            <Progress 
                              value={usageData.cdn.percentage} 
                              className="w-16 h-1.5" 
                            />
                            <span className={`text-xs ${usageData.cdn.percentage > 90 ? 'text-red-500' : usageData.cdn.percentage > 80 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                              {usageData.cdn.percentage}%
                            </span>
                          </div>
                        )}
                        {usageData.ai?.percentage > 0 && (
                          <div className="flex items-center space-x-1">
                            <span className="text-muted-foreground">AI:</span>
                            <Progress 
                              value={usageData.ai.percentage} 
                              className="w-16 h-1.5" 
                            />
                            <span className={`text-xs ${usageData.ai.percentage > 90 ? 'text-red-500' : usageData.ai.percentage > 80 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                              {usageData.ai.percentage}%
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {isBillingExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <BillingSettings />
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Usage Section */}
        <Collapsible open={isUsageExpanded} onOpenChange={setIsUsageExpanded}>
          <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors">
            <div className="flex items-center">
              <HardDrive className="h-4 w-4 mr-2" />
              <h4 className="text-base font-medium">Usage</h4>
            </div>
            <div className="flex items-center space-x-2">
              {!isUsageExpanded && (
                <span className="text-sm text-muted-foreground">
                  Storage & File Management
                </span>
              )}
              {isUsageExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4">
            <UsageSettings />
          </CollapsibleContent>
        </Collapsible>

        {/* Server Configuration */}
        <Collapsible open={isServerConfigExpanded} onOpenChange={setIsServerConfigExpanded}>
          <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors">
            <div className="flex items-center">
              <SettingsIcon className="h-4 w-4 mr-2" />
              <h4 className="text-base font-medium">Server Configuration</h4>
            </div>
            <div className="flex items-center space-x-2">
              {!isServerConfigExpanded && (
                <span className="text-sm text-muted-foreground">
                  {getServerConfigSummary()}
                </span>
              )}
              {isServerConfigExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4 space-y-6">
            {/* Server Display Name */}
            <div className="space-y-2">
              <Label htmlFor="server-display-name">Server Display Name</Label>
              <Input
                id="server-display-name"
                placeholder="Enter server name (shown in browser tab and auth page)"
                value={serverDisplayName}
                onChange={(e) => setServerDisplayName(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                This name will appear in the browser tab title and on the authentication page
              </p>
            </div>

            <Separator />

            {/* Server Icons */}
            <div className="space-y-4">
              <div>
                <h4 className="text-base font-medium mb-3">Server Icons</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload custom icons for your server. Recommended size: 512x512px PNG format.
                </p>
              </div>

              {/* Homepage Icon */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label>Homepage Icon</Label>
                  <div className="flex items-center space-x-4">
                    <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                      {homepageIconUrl ? (
                        <img src={homepageIconUrl} alt="Homepage Icon" className="w-full h-full object-cover" />
                      ) : (
                        <Globe className="h-8 w-8 text-muted-foreground" />
                      )}
                    </div>
                    <div className="space-y-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleHomepageIconUpload(file);
                          }
                        }}
                        className="hidden"
                        id="homepage-icon-upload"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById('homepage-icon-upload')?.click()}
                        disabled={uploadingHomepageIcon}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {uploadingHomepageIcon ? 'Uploading...' : 'Upload Icon'}
                      </Button>
                      <p className="text-xs text-muted-foreground">Displayed on public homepage</p>
                    </div>
                  </div>
                </div>

                {/* Panel Icon */}
                <div className="space-y-3">
                  <Label>Panel Icon</Label>
                  <div className="flex items-center space-x-4">
                    <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                      {panelIconUrl ? (
                        <img src={panelIconUrl} alt="Panel Icon" className="w-full h-full object-cover" />
                      ) : (
                        <SettingsIcon className="h-8 w-8 text-muted-foreground" />
                      )}
                    </div>
                    <div className="space-y-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handlePanelIconUpload(file);
                          }
                        }}
                        className="hidden"
                        id="panel-icon-upload"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById('panel-icon-upload')?.click()}
                        disabled={uploadingPanelIcon}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {uploadingPanelIcon ? 'Uploading...' : 'Upload Icon'}
                      </Button>
                      <p className="text-xs text-muted-foreground">Displayed in admin panel and used as browser favicon</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* API Key Management */}
            <div className="space-y-4">
              <div>
                <h4 className="text-base font-medium mb-3 flex items-center">
                  <Key className="h-4 w-4 mr-2" />
                  API Key
                </h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Generate an API key for external integrations including Minecraft plugins and ticket creation. 
                  This key provides access to all external API endpoints. Keep this key secure.
                </p>
              </div>

              {apiKey ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Current API Key</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-sm font-mono bg-background px-2 py-1 rounded border">
                          {showApiKey ? (fullApiKey || apiKey) : maskApiKey(apiKey)}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={revealApiKey}
                        >
                          {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={copyApiKey}
                      >
                        {apiKeyCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={generateApiKey}
                      disabled={isGeneratingApiKey}
                    >
                      {isGeneratingApiKey ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Regenerating...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Regenerate
                        </>
                      )}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={revokeApiKey}
                      disabled={isRevokingApiKey}
                    >
                      {isRevokingApiKey ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Revoking...
                        </>
                      ) : (
                        <>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Revoke
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 border-2 border-dashed border-muted rounded-lg">
                  <Key className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mb-4">No API key generated yet</p>
                  <Button onClick={generateApiKey} disabled={isGeneratingApiKey}>
                    {isGeneratingApiKey ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Generate API Key
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Custom Domain Settings */}
        {hasPermission('admin.settings.view') && (
          <Collapsible open={isDomainExpanded} onOpenChange={setIsDomainExpanded}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors">
              <div className="flex items-center">
                <Globe className="h-4 w-4 mr-2" />
                <h4 className="text-base font-medium">Custom Domain</h4>
              </div>
              <div className="flex items-center space-x-2">
                {!isDomainExpanded && (
                  <span className="text-sm text-muted-foreground">{getDomainSummary()}</span>
                )}
                {isDomainExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <DomainSettings />
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  );
};

export default GeneralSettings;