import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { apiFetch } from '@/lib/api';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';
import ChangeRoleModal from './ChangeRoleModal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@modl-gg/shared-web/components/ui/table';
import { useStaff, useRoles } from '@/hooks/use-data';
import { Skeleton } from '@modl-gg/shared-web/components/ui/skeleton';
import { MoreHorizontal, RefreshCw, User } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@modl-gg/shared-web/components/ui/dropdown-menu';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import InviteStaffModal from './InviteStaffModal';
import AssignMinecraftPlayerModal from './AssignMinecraftPlayerModal';
import { useToast } from '@modl-gg/shared-web/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@modl-gg/shared-web/components/ui/alert-dialog';

interface StaffMember {
  id: string;
  email: string;
  username: string;
  role: string;
  createdAt: string;
  status: string;
  assignedMinecraftUuid?: string;
  assignedMinecraftUsername?: string;
}

// Role interface to match the one from StaffRolesCard
interface Role {
  id: string;
  name: string;
  order?: number;
}

const StaffManagementPanel = () => {
  const { t } = useTranslation();
  const { data: staff, isLoading, error, refetch: refetchStaff, isRefetching } = useStaff();
  const { data: rolesData } = useRoles();
  const { user: currentUser } = useAuth();
  const { hasPermission, canModifyUserRole, canRemoveStaffUser, canAssignStaffMinecraftPlayer } = usePermissions();

  // Helper function to check if there are any available actions for a staff member
  const hasAvailableActions = (member: StaffMember): boolean => {
    if (member.status === 'Pending Invitation') {
      // For pending invitations, there are always actions (resend/cancel)
      return true;
    }
    
    // For active staff members, check if any management actions are available
    const canAssign = hasPermission('admin.staff.manage') && canAssignStaffMinecraftPlayer(member.role, member.id);
    // Super Admin role cannot be changed
    const canChangeRole = hasPermission('admin.staff.manage') && canModifyUserRole(member.role) && member.role !== 'Super Admin';
    const canRemove = hasPermission('admin.staff.manage') && canRemoveStaffUser(member.role);
    
    return canAssign || canChangeRole || canRemove;
  };
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isRemoveAlertOpen, setIsRemoveAlertOpen] = useState(false);
  const [isChangeRoleModalOpen, setIsChangeRoleModalOpen] = useState(false);
  const [isAssignPlayerModalOpen, setIsAssignPlayerModalOpen] = useState(false);
  const [selectedStaffMember, setSelectedStaffMember] = useState<StaffMember | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleInviteSent = () => {
    queryClient.invalidateQueries({ queryKey: ['/v1/panel/staff'] });
  };

  const handleRefreshStaff = async () => {
    setIsSpinning(true);
    
    try {
      // Ensure minimum spin duration of 800ms
      await Promise.all([
        refetchStaff(),
        new Promise(resolve => setTimeout(resolve, 800))
      ]);
      
      toast({
        title: t('settings.staff.staffListRefreshed'),
        description: t('settings.staff.staffListRefreshedDesc'),
      });
    } catch (error) {
      toast({
        title: t('toast.error'),
        description: t('settings.staff.refreshFailed'),
        variant: "destructive",
      });
    } finally {
      setIsSpinning(false);
    }
  };

  const openConfirmationDialog = (member: StaffMember) => {
    setSelectedStaffMember(member);
    setIsRemoveAlertOpen(true);
  };

  const openChangeRoleModal = (member: StaffMember) => {
    setSelectedStaffMember(member);
    setIsChangeRoleModalOpen(true);
  };

  const openAssignPlayerModal = (member: StaffMember) => {
    setSelectedStaffMember(member);
    setIsAssignPlayerModalOpen(true);
  };

  const handleRemove = async () => {
    if (!selectedStaffMember) return;

    try {
      const response = await apiFetch(`/v1/panel/staff/${selectedStaffMember.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: t('settings.staff.removeStaffFailed') }));
        toast({
          title: t('toast.error'),
          description: errorData.message || t('settings.staff.removeStaffFailed'),
          variant: 'destructive',
        });
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['/v1/panel/staff'] });
      
      toast({
        title: t('toast.success'),
        description: selectedStaffMember?.status === 'Pending Invitation'
          ? t('settings.staff.invitationCancelled')
          : t('settings.staff.staffMemberRemoved'),
      });
    } finally {
      setIsRemoveAlertOpen(false);
      setSelectedStaffMember(null);
    }
  };

  const handleResendInvitation = async (staffId: string) => {
    try {
      const response = await apiFetch(`/v1/panel/staff/invitations/${staffId}/resend`, {
        method: 'POST',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: t('settings.staff.resendInvitationFailed') }));
        throw new Error(errorData.message);
      }
      toast({
        title: t('toast.success'),
        description: t('settings.staff.invitationResent'),
      });
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/staff'] });
    } catch (error) {
      toast({
        title: t('toast.error'),
        description: (error as Error).message,
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <Card className="rounded-card shadow-card">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>{t('settings.staff.staffManagement')}</CardTitle>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="icon"
                onClick={handleRefreshStaff}
                disabled={isSpinning}
              >
                <RefreshCw className={`h-4 w-4 ${isSpinning ? 'animate-spin' : ''}`} />
              </Button>
              <Button onClick={() => setIsInviteModalOpen(true)}>{t('settings.staff.invite')}</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : error ? (
            <div className="text-center text-red-500">{t('settings.staff.loadFailed')}</div>
          ) : staff && staff.length > 0 ? (
            <div className="overflow-x-auto -mx-4 md:mx-0">
              <div className="min-w-[600px] md:min-w-0 px-4 md:px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('settings.staff.email')}</TableHead>
                      <TableHead>{t('settings.staff.role')}</TableHead>
                      <TableHead className="hidden md:table-cell">{t('settings.staff.status')}</TableHead>
                      <TableHead className="hidden lg:table-cell">{t('settings.staff.minecraftPlayer')}</TableHead>
                      <TableHead className="hidden md:table-cell">{t('settings.staff.dateAdded')}</TableHead>
                      <TableHead className="text-right">{t('common.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
              <TableBody>
{staff.map((member: StaffMember) => (
                  <TableRow key={member.id}>
                    <TableCell className="max-w-[150px] truncate">{member.email}</TableCell>
                    <TableCell>{member.role}</TableCell>
                    <TableCell className="hidden md:table-cell">{member.status}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {member.assignedMinecraftUsername ? (
                        <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                          <User className="h-3 w-3" />
                          {member.assignedMinecraftUsername}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">{t('settings.staff.notAssigned')}</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{member.createdAt ? new Date(member.createdAt).toLocaleDateString() : t('common.notAvailable')}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            className="h-8 w-8 p-0" 
                            disabled={!hasAvailableActions(member)}
                          >
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {member.status === 'Pending Invitation' ? (
                            <>
                              <DropdownMenuItem onSelect={() => handleResendInvitation(member.id)}>
                                {t('settings.staff.resendInvitation')}
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => openConfirmationDialog(member)}>
                                {t('settings.staff.cancelInvitation')}
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <>
                              {hasPermission('admin.staff.manage') && canAssignStaffMinecraftPlayer(member.role, member.id) && (
                                <DropdownMenuItem onSelect={() => openAssignPlayerModal(member)}>
                                  {member.assignedMinecraftUsername ? t('settings.staff.changeMinecraftPlayer') : t('settings.staff.assignMinecraftPlayer')}
                                </DropdownMenuItem>
                              )}
                              {hasPermission('admin.staff.manage') && canModifyUserRole(member.role) && member.role !== 'Super Admin' && (
                                <DropdownMenuItem onSelect={() => openChangeRoleModal(member)}>
                                  {t('settings.staff.changeRole')}
                                </DropdownMenuItem>
                              )}
                              {hasPermission('admin.staff.manage') && canRemoveStaffUser(member.role) && (
                                <DropdownMenuItem onSelect={() => openConfirmationDialog(member)}>
                                  {t('settings.staff.removeStaffMember')}
                                </DropdownMenuItem>
                              )}
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-500">{t('settings.staff.noStaffFound')}</div>
          )}
        </CardContent>
      </Card>
      <InviteStaffModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onInviteSent={handleInviteSent}
      />
      <ChangeRoleModal
        isOpen={isChangeRoleModalOpen}
        onClose={() => {
          setIsChangeRoleModalOpen(false);
          setSelectedStaffMember(null);
        }}
        staffMember={selectedStaffMember}
      />
      <AssignMinecraftPlayerModal
        isOpen={isAssignPlayerModalOpen}
        onClose={() => {
          setIsAssignPlayerModalOpen(false);
          setSelectedStaffMember(null);
        }}
        staffMember={selectedStaffMember}
      />
      <AlertDialog open={isRemoveAlertOpen} onOpenChange={setIsRemoveAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.areYouSure')}</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedStaffMember?.status === 'Pending Invitation'
                ? t('settings.staff.cancelInvitationConfirm', { email: selectedStaffMember?.email })
                : t('settings.staff.removeStaffConfirm', { email: selectedStaffMember?.email })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedStaffMember(null)}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove}>
              {selectedStaffMember?.status === 'Pending Invitation' ? t('common.confirm') : t('common.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default StaffManagementPanel;