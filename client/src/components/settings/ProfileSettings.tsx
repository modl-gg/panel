import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { Label } from '@modl-gg/shared-web/components/ui/label';
import { useToast } from '@modl-gg/shared-web/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { apiFetch } from '@/lib/api';

const ProfileSettings = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [profileUsername, setProfileUsername] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (user?.username) {
      setProfileUsername(user.username);
    }
  }, [user]);

  const handleSaveProfile = async () => {
    setIsUpdating(true);
    try {
      const response = await apiFetch('/v1/panel/auth/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: profileUsername
        })
      });
      
      if (response.ok) {
        toast({
          title: t('settings.account.profileUpdated'),
          description: t('settings.account.profileUpdatedDesc')
        });
        // Refresh the page to update the user context
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || t('settings.account.updateProfileFailed'));
      }
    } catch (error) {
      toast({
        title: t('settings.account.updateFailed'),
        description: error instanceof Error ? error.message : t('settings.account.updateProfileError'),
        variant: "destructive"
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-4">{t('settings.account.profileInformation')}</h3>
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">{t('settings.account.username')}</Label>
              <Input
                id="username"
                type="text"
                value={profileUsername}
                onChange={(e) => setProfileUsername(e.target.value)}
                placeholder={t('settings.account.enterUsername')}
              />
              <p className="text-sm text-muted-foreground">
                {t('settings.account.usernameHelp')}
              </p>
            </div>

            <Button
              onClick={handleSaveProfile}
              disabled={isUpdating}
            >
              <Save className="h-4 w-4 mr-2" />
              {isUpdating ? t('common.saving') : t('settings.account.saveProfileChanges')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileSettings;
