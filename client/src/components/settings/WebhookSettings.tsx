import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Save, TestTube, MessageCircle } from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { Label } from '@modl-gg/shared-web/components/ui/label';
import { Switch } from '@modl-gg/shared-web/components/ui/switch';
import { Separator } from '@modl-gg/shared-web/components/ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from '@/hooks/use-toast';

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
    }
  });

  const [showWebhookUrl, setShowWebhookUrl] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    if (webhookSettings) {
      setSettings({
        ...webhookSettings,
        // Use panel icon as default avatar if no avatar URL is set
        avatarUrl: webhookSettings.avatarUrl || panelIconUrl || ''
      });
    }
  }, [webhookSettings, panelIconUrl]);

  const handleInputChange = (field: keyof WebhookSettings, value: any) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleNotificationChange = (key: keyof WebhookSettings['notifications'], value: boolean) => {
    setSettings(prev => ({
      ...prev,
      notifications: {
        ...prev.notifications,
        [key]: value
      }
    }));
  };

  const handleSave = async () => {
    if (!hasPermission('admin.settings.modify')) {
      toast({
        title: 'Permission Denied',
        description: 'You do not have permission to modify webhook settings.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSaving(true);
      if (onSave) {
        await onSave(settings);
        toast({
          title: 'Webhook Settings Saved',
          description: 'Your webhook configuration has been updated successfully.',
        });
      }
    } catch (error) {
      toast({
        title: 'Save Failed',
        description: 'Failed to save webhook settings. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
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
      const response = await fetch('/api/panel/settings/test-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          webhookUrl: settings.discordWebhookUrl,
          adminRoleId: settings.discordAdminRoleId,
          botName: settings.botName,
          avatarUrl: settings.avatarUrl
        })
      });

      if (response.ok) {
        toast({
          title: 'Test Successful',
          description: 'Test notification sent to Discord successfully!',
        });
      } else {
        throw new Error('Test failed');
      }
    } catch (error) {
      toast({
        title: 'Test Failed',
        description: 'Failed to send test notification. Please check your webhook URL.',
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
            <Switch
              id="webhook-enabled"
              checked={settings.enabled}
              onCheckedChange={(checked) => handleInputChange('enabled', checked)}
              disabled={!canModify}
            />
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
                  value={settings.discordWebhookUrl}
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
              value={settings.discordAdminRoleId}
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
              value={settings.botName}
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
              placeholder={panelIconUrl || "https://example.com/avatar.png"}
              value={settings.avatarUrl}
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

      {/* Action Buttons */}
      {canModify && (
        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={handleTestWebhook}
            disabled={isTesting || isLoading || !settings.enabled}
          >
            <TestTube className="h-4 w-4 mr-2" />
            {isTesting ? 'Testing...' : 'Test Webhook'}
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isLoading}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default WebhookSettings;