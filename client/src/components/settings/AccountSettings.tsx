import React, { useState, useEffect } from 'react';
import { LogOut, Monitor, Smartphone } from 'lucide-react';
import PasskeySettings from './PasskeySettings';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { Label } from '@modl-gg/shared-web/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@modl-gg/shared-web/components/ui/select';
import { useToast } from '@modl-gg/shared-web/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '@/lib/api';

interface AccountSettingsProps {
  profileUsername: string;
  setProfileUsername: (value: string) => void;
  currentEmail: string;
  setCurrentEmail: (value: string) => void;
  minecraftUsername?: string;
  userRole?: string;
  language: string;
  setLanguage: (value: string) => void;
  dateFormat: string;
  setDateFormat: (value: string) => void;
}

interface SessionInfo {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  isCurrent: boolean;
}

function parseUserAgent(ua: string): { browser: string; os: string } {
  const browser = /Edg/.test(ua) ? 'Edge'
    : /Chrome/.test(ua) ? 'Chrome'
    : /Firefox/.test(ua) ? 'Firefox'
    : /Safari/.test(ua) ? 'Safari'
    : 'Unknown Browser';
  const os = /Windows/.test(ua) ? 'Windows'
    : /Mac/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad/.test(ua) ? 'iOS'
    : 'Unknown OS';
  return { browser, os };
}

function isMobileUserAgent(ua: string): boolean {
  return /Android|iPhone|iPad|Mobile/.test(ua);
}

function SessionsSection({ onSignOutAll }: { onSignOutAll: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    apiFetch('/v1/panel/auth/sessions')
      .then(r => r.ok ? r.json() : [])
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, []);

  const handleSignOutAll = async () => {
    setSigningOut(true);
    try {
      await apiFetch('/v1/panel/auth/logout', { method: 'POST' });
      onSignOutAll();
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
      setSigningOut(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Monitor className="h-4 w-4 text-muted-foreground shrink-0" />
        <h3 className="text-base font-medium">Sessions</h3>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active sessions.</p>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => {
            const ua = s.userAgent ?? '';
            const { browser, os } = parseUserAgent(ua);
            const mobile = isMobileUserAgent(ua);
            const DeviceIcon = mobile ? Smartphone : Monitor;
            const added = s.createdAt
              ? new Date(s.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
              : '—';
            return (
              <div key={s.id} className="flex items-center gap-3 rounded-md border p-3">
                <DeviceIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {browser} on {os}
                    {s.isCurrent && (
                      <span className="ml-2 text-xs bg-primary/10 text-primary rounded px-1.5 py-0.5">Current</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {s.ipAddress ?? 'Unknown IP'} · Added {added}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={handleSignOutAll}
        disabled={signingOut}
      >
        <LogOut className="h-4 w-4 mr-2" />
        Sign out all
      </Button>
    </div>
  );
}

const AccountSettings = ({
  profileUsername,
  setProfileUsername,
  currentEmail,
  setCurrentEmail,
  minecraftUsername,
  userRole,
  language,
  setLanguage,
  dateFormat,
  setDateFormat
}: AccountSettingsProps) => {
  const { toast } = useToast();
  const { logout } = useAuth();
  const { t } = useTranslation();
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);

  const handleUpdateEmail = async () => {
    setIsUpdatingEmail(true);
    try {
      const response = await apiFetch('/v1/panel/auth/email', {
        method: 'PATCH',
        body: { newEmail: currentEmail },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || t('settings.emailUpdateFailed'));
      }
      toast({
        title: t('settings.emailUpdated'),
        description: t('settings.emailUpdatedDesc'),
      });
      // Reload to refresh the user context with the new email
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('settings.emailUpdateFailed'),
        variant: 'destructive',
      });
      setIsUpdatingEmail(false);
    }
  };

  return (
    <div className="space-y-4 p-2">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-large">{t('settings.profileSettings')}</h3>
        <Button variant="destructive" size="sm" onClick={logout}>
          <LogOut className="h-4 w-4 mr-2" />
          {t('common.signOut')}
        </Button>
      </div>

      <div className="grid grid-cols-[1fr_1fr_8rem] gap-0">
        {/* LEFT: form fields */}
        <div className="space-y-5 pr-6">
          <div className="flex gap-3">
            <Label htmlFor="username" className="w-36 text-sm pt-2.5 shrink-0">{t('settings.panelDisplayName')}</Label>
            <div className="flex-1 max-w-xs">
              <Input
                id="username"
                type="text"
                value={profileUsername}
                onChange={(e) => setProfileUsername(e.target.value)}
                placeholder="Enter display name"
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                {t('settings.displayNameDescription')}
              </p>
            </div>
          </div>

          {minecraftUsername && (
            <div className="flex gap-3">
              <Label htmlFor="minecraft-username" className="w-36 text-sm pt-2.5 shrink-0">{t('settings.minecraftUsername')}</Label>
              <div className="flex-1 max-w-xs">
                <Input
                  id="minecraft-username"
                  type="text"
                  value={minecraftUsername}
                  disabled
                  className="bg-muted text-muted-foreground"
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Your linked Minecraft account. {userRole === 'Super Admin' || userRole === 'Admin' ? t('settings.minecraftChangeAdmin') : t('settings.minecraftChangeContact')}
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Label htmlFor="email-address" className="w-36 text-sm pt-2.5 shrink-0">{t('settings.email')}</Label>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <Input
                  id="email-address"
                  type="email"
                  value={currentEmail}
                  onChange={(e) => setCurrentEmail(e.target.value)}
                  placeholder="Enter email"
                  className="max-w-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUpdateEmail}
                  disabled={isUpdatingEmail}
                >
                  {isUpdatingEmail ? t('common.saving') : t('common.update')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                {t('settings.emailDescription')}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Label htmlFor="language" className="w-36 text-sm pt-2.5 shrink-0">{t('settings.language')}</Label>
            <div className="flex-1 max-w-xs">
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger id="language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="de">Deutsch</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                  <SelectItem value="nl">Nederlands</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1.5">
                {t('settings.languageDescription')}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Label htmlFor="date-format" className="w-36 text-sm pt-2.5 shrink-0">{t('settings.dateFormat')}</Label>
            <div className="flex-1 max-w-xs">
              <Select value={dateFormat} onValueChange={setDateFormat}>
                <SelectTrigger id="date-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MM/DD/YYYY">MM/DD/YYYY HH:mm</SelectItem>
                  <SelectItem value="DD/MM/YYYY">DD/MM/YYYY HH:mm</SelectItem>
                  <SelectItem value="YYYY-MM-DD">YYYY-MM-DD HH:mm</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1.5">
                {t('settings.dateFormatDescription')}
              </p>
            </div>
          </div>
        </div>

        {/* MIDDLE: passkeys + sessions */}
        <div className="border-l border-border px-6 space-y-6">
          <PasskeySettings />
          <SessionsSection onSignOutAll={logout} />
        </div>

        {/* RIGHT: small offset column aligned with sign-out button */}
        <div />
      </div>
    </div>
  );
};

export default AccountSettings;
