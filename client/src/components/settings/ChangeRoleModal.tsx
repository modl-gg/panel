import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
import { useRoles } from '@/hooks/use-data';
import { apiFetch } from '@/lib/api';

interface StaffMember {
  id: string;
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
  const { t } = useTranslation();
  useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRole, setSelectedRole] = useState<string>('');
  
  // Fetch available roles from the shared hook
  const { data: rolesData } = useRoles();
  
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
        title: t('toast.error'),
        description: t('settings.staff.superAdminRoleCannotBeChanged'),
        variant: 'destructive',
      });
      return;
    }

    try {
      const response = await apiFetch(`/v1/panel/staff/${staffMember.id}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: selectedRole }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: t('settings.staff.changeRoleFailed') }));
        throw new Error(errorData.message || t('settings.staff.changeRoleFailed'));
      }

      toast({
        title: t('toast.success'),
        description: t('settings.staff.roleChanged'),
      });

      // Refresh the staff list
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/staff'] });
      onClose();
    } catch (error: any) {
      toast({
        title: t('toast.error'),
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
          <AlertDialogTitle>{t('settings.staff.changeRoleFor', { email: staffMember.email })}</AlertDialogTitle>
          <AlertDialogDescription>
            {staffMember.role === 'Super Admin'
              ? t('settings.staff.superAdminRoleCannotBeChanged')
              : t('settings.staff.selectNewRole')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="role" className="text-right">
              {t('settings.staff.role')}
            </Label>
            <Select
              value={selectedRole}
              onValueChange={(value) => setSelectedRole(value)}
              disabled={availableRoles.length === 0 || staffMember.role === 'Super Admin'}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder={t('settings.staff.selectRole')} />
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
          <AlertDialogCancel onClick={onClose}>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleRoleChange}
            disabled={!selectedRole || selectedRole === staffMember.role || staffMember.role === 'Super Admin'}
          >
            {t('common.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ChangeRoleModal;