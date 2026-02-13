import React from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { Label } from '@modl-gg/shared-web/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@modl-gg/shared-web/components/ui/select';
import { useToast } from '@modl-gg/shared-web/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from 'react-i18next';

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

  return (
    <div className="space-y-4 p-2">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-large">{t('settings.profileSettings')}</h3>
        <Button variant="destructive" size="sm" onClick={logout}>
          <LogOut className="h-4 w-4 mr-2" />
          {t('common.signOut')}
        </Button>
      </div>

      <div className="space-y-5">
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
                onClick={() => {
                  toast({
                    title: t('toast.workInProgress'),
                    description: t('toast.workInProgressDesc'),
                  });
                }}
              >
                {t('common.update')}
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
    </div>
  );
};

export default AccountSettings;
