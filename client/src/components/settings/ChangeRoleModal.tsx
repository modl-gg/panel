import React, { useState, useEffect } from 'react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@modl-gg/shared-web/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@modl-gg/shared-web/components/ui/select';
import { Label } from '@modl-gg/shared-web/components/ui/label';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@modl-gg/shared-web/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';

interface StaffMember {
  _id: string;
  email: string;
  role: string;
}

interface StaffRole {
  id: string;
  name: string;
  description: string;
  permissions: string[];
}

interface ChangeRoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffMember: StaffMember | null;
}


const ChangeRoleModal: React.FC<ChangeRoleModalProps> = ({ isOpen, onClose, staffMember }) => {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRole, setSelectedRole] = useState<string>('');
  
  // Fetch available roles from the API
  const { data: rolesData } = useQuery({
    queryKey: ['/v1/panel/roles'],
    queryFn: async () => {
      const { getApiUrl, getCurrentDomain } = await import('@/lib/api');
      const response = await fetch(getApiUrl('/v1/panel/roles'), {
        credentials: 'include',
        headers: { 'X-Server-Domain': getCurrentDomain() }
      });
      if (!response.ok) throw new Error('Failed to fetch roles');
      return response.json();
    },
    enabled: isOpen
  });
  
  // Filter out Super Admin role from available roles
  const availableRoles = (rolesData?.roles || []).filter((role: StaffRole) => role.name !== 'Super Admin');

  useEffect(() => {
    if (staffMember) {
      setSelectedRole(staffMember.role);
    }
  }, [staffMember]);


  const handleRoleChange = async () => {
    if (!staffMember || !selectedRole) return;

    // Prevent changing role if user is Super Admin
    if (staffMember.role === 'Super Admin') {
      toast({
        title: 'Error',
        description: 'Super Admin role cannot be changed.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { csrfFetch } = await import('@/utils/csrf');
      const response = await csrfFetch(`/v1/panel/staff/${staffMember._id}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: selectedRole }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to change role' }));
        throw new Error(errorData.message || 'Failed to change role');
      }

      toast({
        title: 'Success',
        description: 'Role changed successfully.',
      });

      // Refresh the staff list
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/staff'] });
      onClose();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  if (!staffMember) return null;

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Change Role for {staffMember.email}</AlertDialogTitle>
          <AlertDialogDescription>
            {staffMember.role === 'Super Admin' 
              ? 'Super Admin role cannot be changed.'
              : 'Select the new role for this staff member.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="role" className="text-right">
              Role
            </Label>
            <Select
              value={selectedRole}
              onValueChange={(value) => setSelectedRole(value)}
              disabled={availableRoles.length === 0 || staffMember.role === 'Super Admin'}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((role: StaffRole) => (
                  <SelectItem key={role.id} value={role.name}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleRoleChange}
            disabled={!selectedRole || selectedRole === staffMember.role || staffMember.role === 'Super Admin'}
          >
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ChangeRoleModal;