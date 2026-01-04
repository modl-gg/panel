import React, { useState } from 'react';
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
import { useQuery } from '@tanstack/react-query';

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
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  
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
      const { csrfFetch } = await import('@/utils/csrf');
      const response = await csrfFetch('/v1/panel/staff/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to send invitation.' }));
        throw new Error(errorData.message || 'Failed to send invitation.');
      }

      const result = await response.json().catch(() => ({}));
      
      toast({
        title: 'Success',
        description: result.message || 'Invitation sent successfully.',
      });
      
      // Reset form
      form.reset();
      
      // Trigger refresh and close modal
      onInviteSent();
      onClose();
    } catch (error: any) {
      console.error('Invitation error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to send invitation.',
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
          <DialogTitle>Invite New Staff Member</DialogTitle>
          <DialogDescription>
            Enter the email address and select a role for the new staff member.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input placeholder="name@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a role" />
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
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Invitation'
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