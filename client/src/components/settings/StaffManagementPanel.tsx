import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';
import ChangeRoleModal from './ChangeRoleModal'; // Import the new modal
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@modl-gg/shared-web/components/ui/table';
import { useStaff, useRoles } from '@/hooks/use-data';
import { Skeleton } from '@modl-gg/shared-web/components/ui/skeleton';
import { MoreHorizontal, Plus, PlusIcon, RefreshCw, User } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@modl-gg/shared-web/components/ui/dropdown-menu';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import InviteStaffModal from './InviteStaffModal';
import AssignMinecraftPlayerModal from './AssignMinecraftPlayerModal';
import { useToast } from '@modl-gg/shared-web/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@modl-gg/shared-web/components/ui/alert-dialog';


// Role interface to match the one from StaffRolesCard
interface Role {
  id: string;
  name: string;
  order?: number;
}



const StaffManagementPanel = () => {
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
        title: "Staff List Refreshed",
        description: "Staff member information has been updated.",
      });
    } catch (error) {
      console.error('Error refreshing staff:', error);
      toast({
        title: "Error",
        description: "Failed to refresh staff list. Please try again.",
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
      const { csrfFetch } = await import('@/utils/csrf');
      const response = await csrfFetch(`/v1/panel/staff/${selectedStaffMember.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to remove staff member' }));
        toast({
          title: 'Error',
          description: errorData.message || 'Failed to remove staff member',
          variant: 'destructive',
        });
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['/v1/panel/staff'] });
      
      toast({
        title: 'Success',
        description: selectedStaffMember?.status === 'Pending Invitation' 
          ? 'Invitation cancelled successfully.' 
          : 'Staff member removed successfully.',
      });
    } catch (error) {
      console.error(error);
    } finally {
      setIsRemoveAlertOpen(false);
      setSelectedStaffMember(null);
    }
  };

  const handleResendInvitation = async (staffId: string) => {
    try {
      const { csrfFetch } = await import('@/utils/csrf');
      const response = await csrfFetch(`/v1/panel/staff/invitations/${staffId}/resend`, {
        method: 'POST',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to resend invitation' }));
        throw new Error(errorData.message);
      }
      toast({
        title: 'Success',
        description: 'Invitation resent successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/staff'] });
    } catch (error) {
      console.error(error);
      toast({
        title: 'Error',
        description: (error as Error).message,
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Staff Management</CardTitle>
            <div className="flex space-x-2">
              <Button 
                variant="outline" 
                size="icon" 
                onClick={handleRefreshStaff}
                disabled={isSpinning}
              >
                <RefreshCw className={`h-4 w-4 ${isSpinning ? 'animate-spin' : ''}`} />
              </Button>
              <Button onClick={() => setIsInviteModalOpen(true)}>Invite</Button>
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
            <div className="text-center text-red-500">Failed to load staff members.</div>
          ) : staff && staff.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Minecraft Player</TableHead>
                  <TableHead>Date Added</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
{staff.map((member: StaffMember) => (
                  <TableRow key={member.id}>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>{member.role}</TableCell>
                    <TableCell>{member.status}</TableCell>
                    <TableCell>
                      {member.assignedMinecraftUsername ? (
                        <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                          <User className="h-3 w-3" />
                          {member.assignedMinecraftUsername}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">Not assigned</span>
                      )}
                    </TableCell>
                    <TableCell>{member.createdAt ? new Date(member.createdAt).toLocaleDateString() : 'N/A'}</TableCell>
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
                                Resend Invitation
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => openConfirmationDialog(member)}>
                                Cancel Invitation
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <>
                              {hasPermission('admin.staff.manage') && canAssignStaffMinecraftPlayer(member.role, member.id) && (
                                <DropdownMenuItem onSelect={() => openAssignPlayerModal(member)}>
                                  {member.assignedMinecraftUsername ? 'Change' : 'Assign'} Minecraft Player
                                </DropdownMenuItem>
                              )}
                              {hasPermission('admin.staff.manage') && canModifyUserRole(member.role) && member.role !== 'Super Admin' && (
                                <DropdownMenuItem onSelect={() => openChangeRoleModal(member)}>
                                  Change Role
                                </DropdownMenuItem>
                              )}
                              {hasPermission('admin.staff.manage') && canRemoveStaffUser(member.role) && (
                                <DropdownMenuItem onSelect={() => openConfirmationDialog(member)}>
                                  Remove Staff Member
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
          ) : (
            <div className="text-center text-gray-500">No staff members found.</div>
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
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedStaffMember?.status === 'Pending Invitation'
                ? `Are you sure you want to cancel the invitation for ${selectedStaffMember?.email}?`
                : `Are you sure you want to remove ${selectedStaffMember?.email}? This will revoke all their access immediately and cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedStaffMember(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove}>
              {selectedStaffMember?.status === 'Pending Invitation' ? 'Confirm' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default StaffManagementPanel;