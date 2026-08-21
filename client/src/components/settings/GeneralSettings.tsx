import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsIcon, Globe, Key, Upload, Eye, EyeOff, Check, Copy, RefreshCw, Trash2, Plus, Info } from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { Label } from '@modl-gg/shared-web/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@modl-gg/shared-web/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@modl-gg/shared-web/components/ui/tooltip';
import { Separator } from '@modl-gg/shared-web/components/ui/separator';
import { SUPPORTED_LANGUAGES } from '@/lib/languages';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@modl-gg/shared-web/components/ui/alert-dialog';
import { PERMISSIONS, usePermissions } from '@/hooks/use-permissions';
import BillingSettings from './BillingSettings';
import DomainSettings from './DomainSettings';
import UsageSettings from './UsageSettings';
import WebhookSettings from './WebhookSettings';
import type { WebhookSettings as WebhookSettingsData } from './WebhookSettings';
import MigrationTool from './MigrationTool';
import { queryClient } from '@/lib/queryClient';
import { toast } from '@modl-gg/shared-web/hooks/use-toast';

interface GeneralSettingsProps {
  // Server Configuration
  serverDisplayName: string;
  setServerDisplayName: (value: string) => void;
  defaultLanguage: string;
  setDefaultLanguage: (value: string) => void;

  // Server Icons
  homepageIconUrl: string;
  panelIconUrl: string;
  uploadingHomepageIcon: boolean;
  uploadingPanelIcon: boolean;
  handleHomepageIconUpload: (file: File) => void;
  handlePanelIconUpload: (file: File) => void;
  handleRemoveHomepageIcon: () => void;
  handleRemovePanelIcon: () => void;

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

  // Webhook Settings
  webhookSettings?: WebhookSettingsData;
  handleWebhookSave: (settings: WebhookSettingsData) => Promise<void>;
  savingWebhookSettings?: boolean;

  visibleSection: string;
}

const GeneralSettings = ({
  serverDisplayName,
  setServerDisplayName,
  defaultLanguage,
  setDefaultLanguage,
  homepageIconUrl,
  panelIconUrl,
  uploadingHomepageIcon,
  uploadingPanelIcon,
  handleHomepageIconUpload,
  handlePanelIconUpload,
  handleRemoveHomepageIcon,
  handleRemovePanelIcon,
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
  webhookSettings,
  handleWebhookSave,
  savingWebhookSettings,
  visibleSection
}: GeneralSettingsProps) => {
  const { hasPermission, isSuperAdmin } = usePermissions();
  const { t } = useTranslation();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');

    if (sessionId) {
      toast({
        title: t('settings.general.paymentSuccessful'),
        description: t('settings.general.subscriptionActivated'),
        variant: 'default',
      });
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/billing/status'] });

      // Clean up the URL by removing the session_id query parameter
      urlParams.delete('session_id');
      const newUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ''}`;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  // Server Config Content - rendered as JSX, not a function component to avoid re-renders
  const serverConfigContent = (
    <div className="space-y-6">
      {/* Server Display Name */}
      <div className="space-y-2">
        <Label htmlFor="server-display-name">{t('settings.general.serverDisplayName')}</Label>
        <Input
          id="server-display-name"
          placeholder={t('settings.general.serverDisplayNamePlaceholder')}
          value={serverDisplayName}
          onChange={(e) => setServerDisplayName(e.target.value)}
        />
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="default-language">{t('settings.general.defaultLanguage')}</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-muted-foreground hover:text-foreground" aria-label={t('settings.general.defaultLanguage')}>
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              {t('settings.general.defaultLanguageTooltip')}
            </TooltipContent>
          </Tooltip>
        </div>
        <Select value={defaultLanguage} onValueChange={setDefaultLanguage}>
          <SelectTrigger id="default-language" className="max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_LANGUAGES.map((language) => (
              <SelectItem key={language.code} value={language.code}>{language.nativeName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Server Icons */}
      <div className="space-y-4">
        <h4 className="text-base font-medium">{t('settings.general.serverIcons')}</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <Label>{t('settings.general.homepageIcon')}</Label>
            <div className="flex items-center space-x-4">
              <div className="w-20 h-20 bg-surface-2 rounded-card flex items-center justify-center overflow-hidden">
                {homepageIconUrl ? (
                  <img src={homepageIconUrl} alt={t('settings.general.homepageIcon')} className="w-full h-full object-cover" />
                ) : (
                  <Globe className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleHomepageIconUpload(file);
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
                  {uploadingHomepageIcon ? t('settings.general.uploading') : t('common.import')}
                </Button>
                {homepageIconUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRemoveHomepageIcon}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t('common.delete')}
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Label>{t('settings.general.panelIcon')}</Label>
            <div className="flex items-center space-x-4">
              <div className="w-20 h-20 bg-surface-2 rounded-card flex items-center justify-center overflow-hidden">
                {panelIconUrl ? (
                  <img src={panelIconUrl} alt={t('settings.general.panelIcon')} className="w-full h-full object-cover" />
                ) : (
                  <SettingsIcon className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handlePanelIconUpload(file);
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
                  {uploadingPanelIcon ? t('settings.general.uploading') : t('common.import')}
                </Button>
                {panelIconUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRemovePanelIcon}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t('common.delete')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Separator />

      {/* API Key Management */}
      <div className="space-y-4">
        <h4 className="text-base font-medium flex items-center">
          <Key className="h-4 w-4 mr-2" />
          {t('settings.general.apiKey')}
        </h4>

        {apiKey ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-surface-2 rounded-card">
              <div className="flex-1">
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-sm font-mono bg-background px-2 py-1 rounded border">
                    {showApiKey ? (fullApiKey || apiKey) : maskApiKey(apiKey)}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={revealApiKey}
                    aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                    title={showApiKey ? 'Hide API key' : 'Show API key'}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyApiKey}
                    aria-label="Copy API key"
                    title="Copy API key"
                  >
                    {apiKeyCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" disabled={isGeneratingApiKey}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${isGeneratingApiKey ? 'animate-spin' : ''}`} />
                    {t('settings.general.regenerate')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('settings.general.regenerateApiKeyTitle', 'Regenerate API key?')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('settings.general.regenerateApiKeyConfirm', 'The old key will stop working immediately and any Minecraft servers using it will lose access until updated.')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={generateApiKey}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {t('settings.general.regenerate')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={isRevokingApiKey}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t('settings.general.revoke')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('settings.general.revokeApiKeyTitle', 'Revoke API key?')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('settings.general.revokeApiKeyConfirm', 'This will immediately invalidate the key. Minecraft servers using this key will lose access. This cannot be undone.')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={revokeApiKey}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {t('settings.general.revoke')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 border-2 border-dashed border-muted rounded-lg">
            <Key className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-4">{t('settings.general.noApiKey')}</p>
            <Button onClick={generateApiKey} disabled={isGeneratingApiKey}>
              <Plus className="h-4 w-4 mr-2" />
              {t('settings.general.generateApiKey')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-2">
      {visibleSection === 'billing' && isSuperAdmin && (
        <BillingSettings />
      )}

      {visibleSection === 'usage' && (
        <UsageSettings />
      )}

      {visibleSection === 'server-config' && isSuperAdmin && serverConfigContent}

      {visibleSection === 'domain' && hasPermission(PERMISSIONS.ADMIN_SETTINGS_VIEW_DOMAIN) && (
        <DomainSettings />
      )}

      {visibleSection === 'webhooks' && hasPermission(PERMISSIONS.ADMIN_SETTINGS_VIEW) && (
        <WebhookSettings
          webhookSettings={webhookSettings}
          onSave={handleWebhookSave}
          isLoading={savingWebhookSettings}
          panelIconUrl={panelIconUrl}
        />
      )}

      {visibleSection === 'migration' && isSuperAdmin && (
        <MigrationTool />
      )}
    </div>
  );
};

export default GeneralSettings;
