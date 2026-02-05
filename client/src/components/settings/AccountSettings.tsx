import React from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { Label } from '@modl-gg/shared-web/components/ui/label';
import { Separator } from '@modl-gg/shared-web/components/ui/separator';
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
    <div className="space-y-4 p-2">
      <div>
        <h3 className="text-base font-medium mb-2">Profile</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Your display name shown in ticket conversations and interactions.
        </p>
        <div className="flex items-center gap-3">
          <Label htmlFor="username" className="w-20">Username</Label>
          <Input
            id="username"
            type="text"
            value={profileUsername}
            onChange={(e) => setProfileUsername(e.target.value)}
            placeholder="Enter username"
            className="max-w-xs"
          />
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-base font-medium mb-2">Email</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Your email address used for authentication and notifications.
        </p>
        <div className="flex items-center gap-3">
          <Label htmlFor="email-address" className="w-20">Email</Label>
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
                title: "Work In Progress",
                description: "This feature is currently not available.",
              });
            }}
          >
            Update
          </Button>
        </div>
      </div>

      <Separator />

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-medium">Sign Out</h3>
          <p className="text-sm text-muted-foreground">
            Log out of your current session.
          </p>
        </div>
        <Button variant="destructive" size="sm" onClick={logout}>
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </div>
  );
};

export default AccountSettings;
