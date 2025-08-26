import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Save, TestTube, MessageCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { Label } from '@modl-gg/shared-web/components/ui/label';
import { Switch } from '@modl-gg/shared-web/components/ui/switch';
import { Separator } from '@modl-gg/shared-web/components/ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@modl-gg/shared-web/components/ui/collapsible';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from '@/hooks/use-toast';
import EmbedTemplateEditor from './EmbedTemplateEditor';

interface EmbedField {
  name: string;
  value: string;
  inline: boolean;
}

interface EmbedTemplate {
  title: string;
  description: string;
  color: string;
  fields: EmbedField[];
}

interface WebhookSettings {
  discordWebhookUrl: string;
  discordAdminRoleId: string;
  botName: string;
  avatarUrl: string;
  enabled: boolean;
  notifications: {
    newTickets: boolean;
    newPunishments: boolean;
    auditLogs: boolean;
  };
  embedTemplates?: {
    newTickets: EmbedTemplate;
    newPunishments: EmbedTemplate;
    auditLogs: EmbedTemplate;
  };
}

interface WebhookSettingsProps {
  webhookSettings?: WebhookSettings;
  onSave?: (settings: WebhookSettings) => Promise<void>;
  isLoading?: boolean;
  panelIconUrl?: string;
}

const WebhookSettings: React.FC<WebhookSettingsProps> = ({
  webhookSettings,
  onSave,
  isLoading = false,
  panelIconUrl
}) => {
  const { hasPermission } = usePermissions();
  const defaultTemplate: EmbedTemplate = {
    title: 'New {{type}}',
    description: 'A new **{{type}}** has been created.',
    color: '#3498db',
    fields: [
      { name: 'ID', value: '{{id}}', inline: true },
      { name: 'Type', value: '{{type}}', inline: true }
    ]
  };

  const [settings, setSettings] = useState<WebhookSettings>({
    discordWebhookUrl: '',
    discordAdminRoleId: '',
    botName: 'modl Panel',
    avatarUrl: panelIconUrl || '',
    enabled: false,
    notifications: {
      newTickets: true,
      newPunishments: true,
      auditLogs: false,
    },
    embedTemplates: {
      newTickets: {
        title: '🎫 New Ticket Created',
        description: 'A new **{{type}}** ticket has been submitted.',
        color: '#3498db',
        fields: [
          { name: 'Ticket ID', value: '{{id}}', inline: true },
          { name: 'Type', value: '{{type}}', inline: true },
          { name: 'Priority', value: '{{priority}}', inline: true },
          { name: 'Title', value: '{{title}}', inline: false },
          { name: 'Submitted By', value: '{{submittedBy}}', inline: true }
        ]
      },
      newPunishments: {
        title: '⚖️ New Punishment Issued',
        description: 'A new **{{type}}** punishment has been issued for **{{playerName}}**.',
        color: '#e74c3c',
        fields: [
          { name: 'Punishment ID', value: '{{id}}', inline: true },
          { name: 'Player', value: '{{playerName}}', inline: true },
          { name: 'Type', value: '{{type}}', inline: true },
          { name: 'Severity', value: '{{severity}}', inline: true },
          { name: 'Duration', value: '{{duration}}', inline: true },
          { name: 'Issued By', value: '{{issuer}}', inline: true },
          { name: 'Reason', value: '{{reason}}', inline: false }
        ]
      },
      auditLogs: {
        title: '📋 Audit Log Entry',
        description: 'A new audit log entry has been recorded.',
        color: '#f39c12',
        fields: [
          { name: 'User', value: '{{user}}', inline: true },
          { name: 'Action', value: '{{action}}', inline: true },
          { name: 'Target', value: '{{target}}', inline: true },
          { name: 'Details', value: '{{details}}', inline: false }
        ]
      }
    }
  });

  const [showWebhookUrl, setShowWebhookUrl] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveTimeout, setSaveTimeout] = useState<NodeJS.Timeout | null>(null);
  
  // Collapsible state for embed templates
  const [isNewTicketsExpanded, setIsNewTicketsExpanded] = useState(false);
  const [isNewPunishmentsExpanded, setIsNewPunishmentsExpanded] = useState(false);
  const [isAuditLogsExpanded, setIsAuditLogsExpanded] = useState(false);

  useEffect(() => {
    if (webhookSettings) {
      const defaultEmbedTemplates = {
        newTickets: {
          title: '🎫 New Ticket Created',
          description: 'A new **{{type}}** ticket has been submitted.',
          color: '#3498db',
          fields: [
            { name: 'Ticket ID', value: '{{id}}', inline: true },
            { name: 'Type', value: '{{type}}', inline: true },
            { name: 'Priority', value: '{{priority}}', inline: true },
            { name: 'Title', value: '{{title}}', inline: false },
            { name: 'Submitted By', value: '{{submittedBy}}', inline: true }
          ]
        },
        newPunishments: {
          title: '⚖️ New Punishment Issued',
          description: 'A **{{type}}** has been issued to **{{playerName}}**.',
          color: '#e74c3c',
          fields: [
            { name: 'Punishment ID', value: '{{id}}', inline: true },
            { name: 'Player', value: '{{playerName}}', inline: true },
            { name: 'Type', value: '{{type}}', inline: true },
            { name: 'Severity', value: '{{severity}}', inline: true },
            { name: 'Duration', value: '{{duration}}', inline: true },
            { name: 'Issued By', value: '{{issuer}}', inline: true },
            { name: 'Reason', value: '{{reason}}', inline: false }
          ]
        },
        auditLogs: {
          title: '📋 Audit Log Entry',
          description: 'A new audit log entry has been recorded.',
          color: '#f39c12',
          fields: [
            { name: 'User', value: '{{user}}', inline: true },
            { name: 'Action', value: '{{action}}', inline: true },
            { name: 'Target', value: '{{target}}', inline: true },
            { name: 'Details', value: '{{details}}', inline: false }
          ]
        }
      };

      setSettings({
        ...webhookSettings,
        // Show avatar URL only if it's explicitly set and different from panel icon
        avatarUrl: (webhookSettings.avatarUrl && 
                   webhookSettings.avatarUrl !== panelIconUrl && 
                   webhookSettings.avatarUrl !== '' &&
                   !webhookSettings.avatarUrl.includes('/panel-icon-')) ? webhookSettings.avatarUrl : '',
        // Keep the enabled state as is from the saved settings
        enabled: webhookSettings.enabled || false,
        // Ensure embedTemplates exist with defaults
        embedTemplates: webhookSettings.embedTemplates || defaultEmbedTemplates
      });
    }
  }, [webhookSettings, panelIconUrl]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
    };
  }, [saveTimeout]);

  const autoSave = async (newSettings: WebhookSettings) => {
    if (!hasPermission('admin.settings.modify') || !onSave) {
      return;
    }

    // Clear existing timeout
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    // Set new timeout to save after 1 second of no changes
    const timeoutId = setTimeout(async () => {
      setIsSaving(true);
      try {
        // Use panelIconUrl as default if avatar URL is empty
        const settingsToSave = {
          ...newSettings,
          avatarUrl: newSettings.avatarUrl || panelIconUrl || ''
        };
        await onSave(settingsToSave);
        setLastSaved(new Date());
      } catch (error) {
        toast({
          title: 'Auto-save Failed',
          description: 'Failed to save webhook settings. Please check your connection.',
          variant: 'destructive',
        });
      } finally {
        setIsSaving(false);
      }
    }, 1000);

    setSaveTimeout(timeoutId);
  };

  const handleInputChange = (field: keyof WebhookSettings, value: any) => {
    // Prevent clearing important fields unintentionally
    if (field === 'discordWebhookUrl' && value === undefined) {
      return;
    }
    
    const newSettings = {
      ...settings,
      [field]: value
    };
    setSettings(newSettings);
    autoSave(newSettings);
  };

  const handleNotificationChange = (key: keyof WebhookSettings['notifications'], value: boolean) => {
    const newSettings = {
      ...settings,
      notifications: {
        ...settings.notifications,
        [key]: value
      }
    };
    setSettings(newSettings);
    autoSave(newSettings);
  };

  const handleEmbedTemplateChange = (templateType: 'newTickets' | 'newPunishments' | 'auditLogs', template: EmbedTemplate) => {
    const newSettings = {
      ...settings,
      embedTemplates: {
        ...settings.embedTemplates!,
        [templateType]: template
      }
    };
    setSettings(newSettings);
    autoSave(newSettings);
  };


  const handleTestWebhook = async () => {
    if (!settings.discordWebhookUrl || !settings.enabled) {
      toast({
        title: 'Cannot Test Webhook',
        description: 'Please configure and enable the webhook first.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsTesting(true);
      const { csrfFetch } = await import('@/utils/csrf');
      const response = await csrfFetch('/api/panel/settings/test-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          webhookUrl: settings.discordWebhookUrl,
          adminRoleId: settings.discordAdminRoleId,
          botName: settings.botName,
          avatarUrl: settings.avatarUrl || panelIconUrl || undefined
        })
      });

      if (response.ok) {
        toast({
          title: 'Test Successful',
          description: 'Test notification sent to Discord successfully!',
        });
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Test failed');
      }
    } catch (error) {
      toast({
        title: 'Test Failed',
        description: error instanceof Error ? error.message : 'Failed to send test notification. Please check your webhook URL.',
        variant: 'destructive',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const canModify = hasPermission('admin.settings.modify');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Discord Webhook Configuration
          </CardTitle>
          <CardDescription>
            Configure Discord webhooks for receiving notifications from your modl panel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Enable/Disable Webhook */}
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="webhook-enabled" className="text-base font-medium">
                Enable Webhook Notifications
              </Label>
              <p className="text-sm text-muted-foreground">
                Turn webhook notifications on or off
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="webhook-enabled"
                checked={settings.enabled}
                onCheckedChange={(checked) => handleInputChange('enabled', checked)}
                disabled={!canModify}
              />
              {canModify && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestWebhook}
                  disabled={isTesting || isLoading || !settings.enabled}
                >
                  <TestTube className="h-4 w-4 mr-2" />
                  {isTesting ? 'Testing...' : 'Test'}
                </Button>
              )}
            </div>
          </div>

          <Separator />

          {/* Discord Webhook URL */}
          <div className="space-y-2">
            <Label htmlFor="webhook-url">Discord Webhook URL</Label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Input
                  id="webhook-url"
                  type={showWebhookUrl ? 'text' : 'password'}
                  placeholder="https://discord.com/api/webhooks/..."
                  value={settings.discordWebhookUrl || ''}
                  onChange={(e) => handleInputChange('discordWebhookUrl', e.target.value)}
                  disabled={!canModify}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowWebhookUrl(!showWebhookUrl)}
                  disabled={!canModify}
                >
                  {showWebhookUrl ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Create a webhook in your Discord server's channel settings
            </p>
          </div>

          {/* Admin Role ID */}
          <div className="space-y-2">
            <Label htmlFor="admin-role-id">Admin Role ID (Optional)</Label>
            <Input
              id="admin-role-id"
              placeholder="123456789012345678"
              value={settings.discordAdminRoleId || ''}
              onChange={(e) => handleInputChange('discordAdminRoleId', e.target.value)}
              disabled={!canModify}
            />
            <p className="text-sm text-muted-foreground">
              Role ID to ping for critical notifications. Right-click role in Discord → Copy ID
            </p>
          </div>

          {/* Bot Name */}
          <div className="space-y-2">
            <Label htmlFor="bot-name">Bot Name</Label>
            <Input
              id="bot-name"
              placeholder="modl Panel"
              value={settings.botName || ''}
              onChange={(e) => handleInputChange('botName', e.target.value)}
              disabled={!canModify}
            />
            <p className="text-sm text-muted-foreground">
              Name to display for webhook messages
            </p>
          </div>

          {/* Avatar URL */}
          <div className="space-y-2">
            <Label htmlFor="avatar-url">Avatar URL (Optional)</Label>
            <Input
              id="avatar-url"
              placeholder="https://cdn.discordapp.com/avatars/123456789/avatar.png"
              value={settings.avatarUrl || ''}
              onChange={(e) => handleInputChange('avatarUrl', e.target.value)}
              disabled={!canModify}
            />
            <p className="text-sm text-muted-foreground">
              URL of image to display as webhook avatar. Defaults to your server icon if configured.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Notification Types</CardTitle>
          <CardDescription>
            Choose which events trigger webhook notifications.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="notify-tickets" className="text-base font-medium">
                New Tickets
              </Label>
              <p className="text-sm text-muted-foreground">
                Receive notifications when new tickets are created
              </p>
            </div>
            <Switch
              id="notify-tickets"
              checked={settings.notifications.newTickets}
              onCheckedChange={(checked) => handleNotificationChange('newTickets', checked)}
              disabled={!canModify}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="notify-punishments" className="text-base font-medium">
                New Punishments
              </Label>
              <p className="text-sm text-muted-foreground">
                Receive notifications when new punishments are issued
              </p>
            </div>
            <Switch
              id="notify-punishments"
              checked={settings.notifications.newPunishments}
              onCheckedChange={(checked) => handleNotificationChange('newPunishments', checked)}
              disabled={!canModify}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="notify-audit" className="text-base font-medium">
                Audit Log Entries
              </Label>
              <p className="text-sm text-muted-foreground">
                Receive notifications for important audit log events
              </p>
            </div>
            <Switch
              id="notify-audit"
              checked={settings.notifications.auditLogs}
              onCheckedChange={(checked) => handleNotificationChange('auditLogs', checked)}
              disabled={!canModify}
            />
          </div>
        </CardContent>
      </Card>

      {/* Embed Template Customization */}
      <Card>
        <CardHeader>
          <CardTitle>Embed Templates</CardTitle>
          <CardDescription>
            Customize the Discord embed messages for each notification type.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Collapsible open={isNewTicketsExpanded} onOpenChange={setIsNewTicketsExpanded}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-2">
                <Label className="text-base font-medium">New Tickets Template</Label>
                {!settings.notifications.newTickets && (
                  <Badge variant="secondary" className="text-xs">Disabled</Badge>
                )}
              </div>
              {isNewTicketsExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <EmbedTemplateEditor
                template={settings.embedTemplates!.newTickets}
                templateType="newTickets"
                onChange={(template) => handleEmbedTemplateChange('newTickets', template)}
                disabled={!canModify}
              />
            </CollapsibleContent>
          </Collapsible>

          <Collapsible open={isNewPunishmentsExpanded} onOpenChange={setIsNewPunishmentsExpanded}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-2">
                <Label className="text-base font-medium">New Punishments Template</Label>
                {!settings.notifications.newPunishments && (
                  <Badge variant="secondary" className="text-xs">Disabled</Badge>
                )}
              </div>
              {isNewPunishmentsExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <EmbedTemplateEditor
                template={settings.embedTemplates!.newPunishments}
                templateType="newPunishments"
                onChange={(template) => handleEmbedTemplateChange('newPunishments', template)}
                disabled={!canModify}
              />
            </CollapsibleContent>
          </Collapsible>

          <Collapsible open={isAuditLogsExpanded} onOpenChange={setIsAuditLogsExpanded}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-2">
                <Label className="text-base font-medium">Audit Logs Template</Label>
                {!settings.notifications.auditLogs && (
                  <Badge variant="secondary" className="text-xs">Disabled</Badge>
                )}
              </div>
              {isAuditLogsExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <EmbedTemplateEditor
                template={settings.embedTemplates!.auditLogs}
                templateType="auditLogs"
                onChange={(template) => handleEmbedTemplateChange('auditLogs', template)}
                disabled={!canModify}
              />
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>
    </div>
  );
};

export default WebhookSettings;