import React, { useState, useEffect } from 'react';
import { Button } from 'modl-shared-web/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from 'modl-shared-web/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'modl-shared-web/components/ui/select';
import { Label } from 'modl-shared-web/components/ui/label';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from 'modl-shared-web/hooks/use-toast';

interface StaffMember {
  _id: string;
  email: string;
  role: 'Super Admin' | 'Admin' | 'Moderator' | 'Helper';
}

interface ChangeRoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffMember: StaffMember | null;
}

const ROLES: StaffMember['role'][] = ['Super Admin', 'Admin', 'Moderator', 'Helper'];

const ChangeRoleModal: React.FC<ChangeRoleModalProps> = ({ isOpen, onClose, staffMember }) => {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRole, setSelectedRole] = useState<StaffMember['role'] | ''>('');
  const [availableRoles, setAvailableRoles] = useState<StaffMember['role'][]>([]);

  useEffect(() => {
    if (staffMember) {
      setSelectedRole(staffMember.role);
    }
  }, [staffMember]);

  useEffect(() => {
    if (!currentUser || !staffMember) {
      setAvailableRoles([]);
      return;
    }

    if (currentUser.role === 'Super Admin') {
      // Super Admin can change most roles, but certain users may be protected server-side
      setAvailableRoles(ROLES);
    } else if (currentUser.role === 'Admin') {
      // Admins cannot change a user's role to 'Admin' or 'Super Admin'.
      // Admins also cannot change an existing 'Admin' or 'Super Admin' role.
      if (staffMember.role === 'Admin' || staffMember.role === 'Super Admin') {
        setAvailableRoles([staffMember.role]); // Can only "change" to the current role (effectively no change)
      } else {
        setAvailableRoles(['Moderator', 'Helper']);
      }
    } else {
      setAvailableRoles([]); // Other roles cannot change roles
    }
  }, [currentUser, staffMember]);

  const handleRoleChange = async () => {
    if (!staffMember || !selectedRole) return;

    try {
      const response = await fetch(`/api/panel/staff/${staffMember._id}/role`, {
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
      queryClient.invalidateQueries({ queryKey: ['/api/panel/staff'] });
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
            Select the new role for this staff member.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="role" className="text-right">
              Role
            </Label>
            <Select
              value={selectedRole}
              onValueChange={(value) => setSelectedRole(value as StaffMember['role'])}
              disabled={availableRoles.length <= 1 && availableRoles[0] === staffMember.role}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role}
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
            disabled={!selectedRole || selectedRole === staffMember.role || (availableRoles.length <= 1 && availableRoles[0] === staffMember.role) }
          >
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ChangeRoleModal;