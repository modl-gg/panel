import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@modl-gg/shared-web/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@modl-gg/shared-web/components/ui/form';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@modl-gg/shared-web/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@modl-gg/shared-web/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useRoles } from '@/hooks/use-data';
import { apiFetch } from '@/lib/api';

const inviteSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  role: z.string().min(1, { message: 'Please select a role.' }),
});

interface StaffRole {
  id: string;
  name: string;
  description: string;
  permissions: string[];
}

type InviteFormValues = z.infer<typeof inviteSchema>;

interface InviteStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInviteSent: () => void;
}

const InviteStaffModal: React.FC<InviteStaffModalProps> = ({ isOpen, onClose, onInviteSent }) => {
  const { t } = useTranslation();
  useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  
  // Fetch available roles from the shared hook
  const { data: rolesData } = useRoles();
  
  // Filter out Super Admin role from available roles
  const availableRoles = (rolesData?.roles || []).filter((role: StaffRole) => role.name !== 'Super Admin');
  
  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: '',
      role: '',
    },
  });

  const handleClose = () => {
    if (!isLoading) {
      form.reset();
      onClose();
    }
  };

  const onSubmit = async (values: InviteFormValues) => {
    setIsLoading(true);
    try {
      const response = await apiFetch('/v1/panel/staff/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: t('settings.staff.sendInvitationFailed') }));
        throw new Error(errorData.error || t('settings.staff.sendInvitationFailed'));
      }

      await response.json().catch(() => ({}));
      
      toast({
        title: t('toast.success'),
        description: t('settings.staff.invitationSent'),
      });
      
      // Reset form
      form.reset();
      
      // Trigger refresh and close modal
      onInviteSent();
      onClose();
    } catch (error: any) {
      toast({
        title: t('toast.error'),
        description: error.message || t('settings.staff.sendInvitationFailed'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('settings.staff.inviteNewStaffMember')}</DialogTitle>
          <DialogDescription>
            {t('settings.staff.inviteStaffDesc')}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('settings.staff.email')}</FormLabel>
                  <FormControl>
                    <Input placeholder="name@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                  <p className="text-xs text-muted-foreground">
                    {t('settings.staff.iCloudNotice')}
                  </p>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('settings.staff.role')}</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('settings.staff.selectRole')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableRoles.map((role: StaffRole) => (
                        <SelectItem key={role.id} value={role.name}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose} disabled={isLoading}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('settings.staff.sending')}
                  </>
                ) : (
                  t('settings.staff.sendInvitation')
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default InviteStaffModal;