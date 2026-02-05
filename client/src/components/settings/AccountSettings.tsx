import React from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { Label } from '@modl-gg/shared-web/components/ui/label';
import { useToast } from '@modl-gg/shared-web/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';

interface AccountSettingsProps {
  profileUsername: string;
  setProfileUsername: (value: string) => void;
  currentEmail: string;
  setCurrentEmail: (value: string) => void;
}

const AccountSettings = ({
  profileUsername,
  setProfileUsername,
  currentEmail,
  setCurrentEmail
}: AccountSettingsProps) => {
  const { toast } = useToast();
  const { logout } = useAuth();

  return (
    <div className="flex items-center gap-4 p-4">
      <div className="flex-1 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="username" className="whitespace-nowrap">Username</Label>
          <Input
            id="username"
            type="text"
            value={profileUsername}
            onChange={(e) => setProfileUsername(e.target.value)}
            placeholder="Enter username"
            className="w-40"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="email-address" className="whitespace-nowrap">Email</Label>
          <Input
            id="email-address"
            type="email"
            value={currentEmail}
            onChange={(e) => setCurrentEmail(e.target.value)}
            placeholder="Enter email"
            className="w-56"
            disabled
          />
        </div>
      </div>
      <Button variant="destructive" size="sm" onClick={logout}>
        <LogOut className="h-4 w-4 mr-2" />
        Sign Out
      </Button>
    </div>
  );
};

export default AccountSettings;
