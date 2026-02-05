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
  minecraftUsername?: string;
}

const AccountSettings = ({
  profileUsername,
  setProfileUsername,
  currentEmail,
  setCurrentEmail,
  minecraftUsername
}: AccountSettingsProps) => {
  const { toast } = useToast();
  const { logout } = useAuth();

  return (
    <div className="space-y-4 p-2">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-large">Profile Settings</h3>
        <Button variant="destructive" size="sm" onClick={logout}>
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>

      <div className="space-y-5">
        <div>
          <div className="flex items-center gap-3">
            <Label htmlFor="username" className="w-36 text-sm">Panel Display Name</Label>
            <Input
              id="username"
              type="text"
              value={profileUsername}
              onChange={(e) => setProfileUsername(e.target.value)}
              placeholder="Enter display name"
              className="max-w-xs"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5 ml-[9.5rem]">
            Your display name shown in ticket conversations and interactions.
          </p>
        </div>

        {minecraftUsername && (
          <div>
            <div className="flex items-center gap-3">
              <Label htmlFor="minecraft-username" className="w-36 text-sm">Minecraft Username</Label>
              <Input
                id="minecraft-username"
                type="text"
                value={minecraftUsername}
                disabled
                className="max-w-xs bg-muted text-muted-foreground"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5 ml-[9.5rem]">
              Your linked Minecraft account. Contact an admin to change this.
            </p>
          </div>
        )}

        <div>
          <div className="flex items-center gap-3">
            <Label htmlFor="email-address" className="w-36 text-sm">Email</Label>
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
          <p className="text-xs text-muted-foreground mt-1.5 ml-[9.5rem]">
            Used for login and receiving ticket notifications.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AccountSettings;
