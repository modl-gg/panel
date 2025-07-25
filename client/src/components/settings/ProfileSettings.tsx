import React, { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { Button } from 'modl-shared-web/components/ui/button';
import { Input } from 'modl-shared-web/components/ui/input';
import { Label } from 'modl-shared-web/components/ui/label';
import { useToast } from 'modl-shared-web/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';

const ProfileSettings = () => {
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
      const { csrfFetch } = await import('@/utils/csrf');
      const response = await csrfFetch('/api/auth/profile', {
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
          title: "Profile Updated",
          description: "Your profile information has been successfully updated."
        });
        // Refresh the page to update the user context
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update profile');
      }
    } catch (error) {
      toast({
        title: "Update Failed",
        description: error instanceof Error ? error.message : "There was an error updating your profile. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-4">Profile Information</h3>
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={profileUsername}
                onChange={(e) => setProfileUsername(e.target.value)}
                placeholder="Enter your username"
              />
              <p className="text-sm text-muted-foreground">
                This name will appear in ticket conversations and other interactions.
              </p>
            </div>
            
            <Button
              onClick={handleSaveProfile}
              disabled={isUpdating}
            >
              <Save className="h-4 w-4 mr-2" />
              {isUpdating ? 'Saving...' : 'Save Profile Changes'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileSettings;
