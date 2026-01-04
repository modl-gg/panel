import React, { useState, useEffect } from 'react';
import { Shield, Plus, Edit, Trash2, Save, X, Check, GripVertical } from 'lucide-react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { Label } from '@modl-gg/shared-web/components/ui/label';
import { Checkbox } from '@modl-gg/shared-web/components/ui/checkbox';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import { useToast } from '@modl-gg/shared-web/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@modl-gg/shared-web/components/ui/dialog";
import { Separator } from '@modl-gg/shared-web/components/ui/separator';
import { useSettings, useRoles, usePermissions, useCreateRole, useUpdateRole, useDeleteRole } from '@/hooks/use-data';
import { useAuth } from '@/hooks/use-auth';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@modl-gg/shared-web/components/ui/alert-dialog';

// Permission categories and definitions
interface Permission {
  id: string;
  name: string;
  description: string;
  category: 'punishment' | 'ticket' | 'admin';
}

interface StaffRole {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  isDefault: boolean;
  userCount?: number;
  order?: number;
  rank?: number; // For drag and drop ordering
}

const PERMISSION_CATEGORIES = {
  punishment: 'Punishment Permissions',
  ticket: 'Ticket Permissions',
  admin: 'Administrative Permissions'
};

const DEFAULT_PERMISSIONS: Permission[] = [
  // Admin permissions
  { id: 'admin.settings.view', name: 'View Settings', description: 'View all system settings', category: 'admin' },
  { id: 'admin.settings.modify', name: 'Modify Settings', description: 'Modify system settings (excluding account settings)', category: 'admin' },
  { id: 'admin.staff.manage', name: 'Manage Staff', description: 'Invite, remove, and modify staff members', category: 'admin' },
  { id: 'admin.audit.view', name: 'View Audit', description: 'Access audit logs and system activity', category: 'admin' },
  
  // Punishment permissions
  { id: 'punishment.modify', name: 'Modify Punishments', description: 'Pardon, modify duration, and edit existing punishments', category: 'punishment' },
  
  // Ticket permissions
  { id: 'ticket.view.all', name: 'View All Tickets', description: 'View all tickets regardless of type', category: 'ticket' },
  { id: 'ticket.reply.all', name: 'Reply to All Tickets', description: 'Reply to all ticket types', category: 'ticket' },
  { id: 'ticket.close.all', name: 'Close/Reopen All Tickets', description: 'Close and reopen all ticket types', category: 'ticket' },
  { id: 'ticket.delete.all', name: 'Delete Tickets', description: 'Delete tickets from the system', category: 'ticket' },
];

const DEFAULT_ROLES: StaffRole[] = [
  {
    id: 'super-admin',
    name: 'Super Admin',
    description: 'Full access to all features and settings',
    permissions: ['admin.settings.view', 'admin.settings.modify', 'admin.staff.manage', 'admin.audit.view', 'ticket.view.all', 'ticket.reply.all', 'ticket.close.all', 'ticket.delete.all'],
    isDefault: true,
    order: 0,
  },
  {
    id: 'admin',
    name: 'Admin',
    description: 'Administrative access with some restrictions',
    permissions: ['admin.settings.view', 'admin.staff.manage', 'admin.audit.view', 'ticket.view.all', 'ticket.reply.all', 'ticket.close.all'],
    isDefault: true,
    order: 1,
  },
  {
    id: 'moderator',
    name: 'Moderator',
    description: 'Moderation permissions for punishments and tickets',
    permissions: ['ticket.view.all', 'ticket.reply.all', 'ticket.close.all'],
    isDefault: true,
    order: 2,
  },
  {
    id: 'helper',
    name: 'Helper',
    description: 'Basic support permissions',
    permissions: ['ticket.view.all', 'ticket.reply.all'],
    isDefault: true,
    order: 3,
  },
];

// Get role order from the role object (lower order = higher authority)
const getRoleOrder = (role: StaffRole): number => {
  return role.order ?? 999; // Default to high number if order is not set
};

// Draggable Role Card Component
interface DraggableRoleCardProps {
  role: StaffRole;
  index: number;
  currentUserRole: string | undefined;
  roleOrderMap: Map<string, number>;
  onEditRole: (role: StaffRole) => void;
  onDeleteRole: (role: StaffRole) => void;
  onMoveRole: (dragIndex: number, hoverIndex: number) => void;
  onCommitReorder: (dragIndex: number, hoverIndex: number) => void;
  onDragStart: () => void;
  onDragEnd: (didDrop: boolean) => void;
  getPermissionsByCategory: (category: string) => Permission[];
  hasPermission: (role: StaffRole, permissionId: string) => boolean;
}

const DraggableRoleCard: React.FC<DraggableRoleCardProps> = ({
  role,
  index,
  currentUserRole,
  roleOrderMap,
  onEditRole,
  onDeleteRole,
  onMoveRole,
  onCommitReorder,
  onDragStart,
  onDragEnd,
  getPermissionsByCategory,
  hasPermission
}) => {
  const currentUserOrder = roleOrderMap.get(currentUserRole || '') ?? 999;
  const roleOrder = getRoleOrder(role);
  // User can drag roles that have higher order number (lower authority) and not super admin
  const canDragRole = role.name !== 'Super Admin' && currentUserOrder < roleOrder;

  const [{ isDragging }, drag, preview] = useDrag(() => ({
    type: 'role',
    item: () => {
      onDragStart();
      return { index, role, originalIndex: index };
    },
    canDrag: canDragRole,
    end: (item, monitor) => {
      const didDrop = monitor.didDrop();
      onDragEnd(didDrop);
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  const [{ isOver, canDrop }, drop] = useDrop({
    accept: 'role',
    hover: (draggedItem: { index: number; role: StaffRole; originalIndex: number }) => {
      if (draggedItem.index === index) return;
      
      // Don't allow dropping on Super Admin or moving Super Admin
      if (role.name === 'Super Admin' || draggedItem.role.name === 'Super Admin') return;
      
      // Check if current user can move the dragged role to this position
      const draggedRoleOrder = getRoleOrder(draggedItem.role);
      const targetRoleOrder = getRoleOrder(role);
      
      // User must have lower order (higher authority) than both the dragged role and target position
      if (currentUserOrder >= draggedRoleOrder || currentUserOrder >= targetRoleOrder) return;
      
      // Only update visual state during hover
      onMoveRole(draggedItem.index, index);
      draggedItem.index = index;
    },
    drop: (draggedItem: { index: number; role: StaffRole; originalIndex: number }) => {
      // Don't allow dropping on Super Admin or moving Super Admin
      if (role.name === 'Super Admin' || draggedItem.role.name === 'Super Admin') return;
      
      // Check if current user can move the dragged role to this position
      const draggedRoleOrder = getRoleOrder(draggedItem.role);
      const targetRoleOrder = getRoleOrder(role);
      
      // User must have lower order (higher authority) than both the dragged role and target position
      if (currentUserOrder >= draggedRoleOrder || currentUserOrder >= targetRoleOrder) return;
      
      // Only commit if the position actually changed
      if (draggedItem.originalIndex !== index) {
        onCommitReorder(draggedItem.originalIndex, index);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  // Combine drag and drop refs
  const ref = (node: HTMLDivElement | null) => {
    drag(drop(node));
  };

  return (
    <div
      ref={ref}
      className={`border rounded-lg p-4 transition-all ${
        isDragging ? 'opacity-50 scale-95' : ''
      } ${isOver && canDrop ? 'border-primary bg-primary/5' : ''} ${
        canDragRole ? 'cursor-move' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          {canDragRole && (
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          )}
          <h4 className="font-medium">{role.name}</h4>
          {role.isDefault && (
            <Badge variant="outline" className="text-xs">
              Default
            </Badge>
          )}
          {role.userCount !== undefined && (
            <Badge variant="secondary" className="text-xs">
              {role.userCount} users
            </Badge>
          )}
          {role.name === 'Super Admin' && (
            <Badge variant="default" className="text-xs bg-yellow-500">
              Highest Rank
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEditRole(role)}
            disabled={role.name === 'Super Admin' || (roleOrderMap.get(currentUserRole || '') ?? 999) >= getRoleOrder(role)}
          >
            <Edit className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDeleteRole(role)}
            disabled={role.name === 'Super Admin' || (roleOrderMap.get(currentUserRole || '') ?? 999) >= getRoleOrder(role)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-3">{role.description}</p>
      
      {/* Permission Summary */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">Permissions:</div>
        <div className="flex flex-wrap gap-1">
          {Object.entries(PERMISSION_CATEGORIES).map(([category, label]) => {
            const categoryPermissions = getPermissionsByCategory(category);
            const granted = categoryPermissions.filter(p => hasPermission(role, p.id)).length;
            const total = categoryPermissions.length;
            
            if (total === 0) return null;
            
            return (
              <Badge 
                key={category} 
                variant={granted === total ? "default" : granted > 0 ? "secondary" : "outline"}
                className="text-xs"
              >
                {label}: {granted}/{total}
              </Badge>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default function StaffRolesCard() {
  const [selectedRole, setSelectedRole] = useState<StaffRole | null>(null);
  const [isEditingRole, setIsEditingRole] = useState(false);
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [roleFormData, setRoleFormData] = useState({ name: '', description: '', permissions: [] as string[] });
  const [deleteConfirmRole, setDeleteConfirmRole] = useState<StaffRole | null>(null);
  const [localRoles, setLocalRoles] = useState<StaffRole[]>([]);
  const [originalRoles, setOriginalRoles] = useState<StaffRole[]>([]);
  const [pendingReorder, setPendingReorder] = useState<StaffRole[] | null>(null);
  const [showReorderConfirm, setShowReorderConfirm] = useState(false);
  const [isDragInProgress, setIsDragInProgress] = useState(false);
  const { toast } = useToast();
  
  // API hooks
  const { data: rolesData, isLoading: rolesLoading } = useRoles();
  const { data: permissionsData, isLoading: permissionsLoading } = usePermissions();
  const { user: currentUser } = useAuth();
  const createRoleMutation = useCreateRole();
  const updateRoleMutation = useUpdateRole();
  const deleteRoleMutation = useDeleteRole();
  
  const roles = rolesData?.roles || [];
  const permissions = permissionsData?.permissions || [];
  const permissionCategories = permissionsData?.categories || PERMISSION_CATEGORIES;
  
  // If no roles are loaded from the database, use default roles as fallback
  const effectiveRoles = roles.length > 0 ? roles : DEFAULT_ROLES;
  
  // Create role order map from roles data (copying StaffManagementPanel approach)
  const roleOrderMap = new Map<string, number>();
  if (effectiveRoles) {
    effectiveRoles.forEach((role: StaffRole) => {
      roleOrderMap.set(role.name, role.order ?? 999);
    });
  }
  
  // Safety check for currentUser
  if (!currentUser) {
    console.warn('currentUser is undefined - this should not happen');
    return <div>Loading user information...</div>;
  }

  // Update local roles when server data changes
  useEffect(() => {
    if (effectiveRoles.length > 0) {
      // Sort roles by order (lower order = higher authority)
      const sortedRoles = [...effectiveRoles].sort((a, b) => {
        const aOrder = a.order ?? 999;
        const bOrder = b.order ?? 999;
        return aOrder - bOrder;
      });
      setLocalRoles(sortedRoles);
      setOriginalRoles(sortedRoles);
    }
  }, [effectiveRoles]);

  // Handle drag start
  const handleDragStart = () => {
    setIsDragInProgress(true);
  };

  // Handle drag end (whether successful or cancelled)
  const handleDragEnd = (didDrop: boolean) => {
    setIsDragInProgress(false);
    // If drag was cancelled and no drop occurred, reset to original positions
    if (!didDrop) {
      setLocalRoles(originalRoles);
    }
  };

  // Handle role reordering during drag (preview only)
  const moveRole = (dragIndex: number, hoverIndex: number) => {
    const newRoles = [...localRoles];
    const draggedRole = newRoles[dragIndex];
    
    // Remove the dragged role and insert at new position
    newRoles.splice(dragIndex, 1);
    newRoles.splice(hoverIndex, 0, draggedRole);
    
    // Only update local state for visual feedback, don't trigger confirmation yet
    setLocalRoles(newRoles);
  };

  // Handle role reordering when drag ends (actual commit)
  const commitRoleReorder = (originalIndex: number, targetIndex: number) => {
    // The localRoles state already reflects the current visual state from hover operations
    // We just need to set pending reorder and show confirmation
    setPendingReorder([...localRoles]);
    setShowReorderConfirm(true);
  };

  // Save role reordering to server
  const saveRoleOrder = async () => {
    if (!pendingReorder) return;
    
    try {
      // Pre-fetch CSRF token to avoid initial request failure
      const { getCSRFToken } = await import('@/utils/csrf');
      await getCSRFToken();
      
      // Filter out Super Admin from the reorder request since it should never be reordered
      // Super Admin should always stay at order 0, other roles start from order 1
      const nonSuperAdminRoles = pendingReorder.filter(role => role.name !== 'Super Admin');
      const roleOrder = nonSuperAdminRoles.map((role, index) => ({ 
        id: role.id, 
        order: index + 1  // Start from 1 since Super Admin is always 0
      }));
      
      const { csrfFetch } = await import('@/utils/csrf');
      const response = await csrfFetch('/v1/panel/roles/reorder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ roleOrder }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update role order');
      }
      
      toast({
        title: "Role Order Updated",
        description: "The role hierarchy has been saved successfully.",
      });
      
      // Update original roles to the new order so future cancellations work correctly
      setOriginalRoles([...localRoles]);
      setPendingReorder(null);
      setShowReorderConfirm(false);
    } catch (error) {
      // Revert the local change if the API call fails
      setLocalRoles(originalRoles);
      toast({
        title: "Error",
        description: "Failed to save role order. Please try again.",
        variant: "destructive"
      });
      setPendingReorder(null);
      setShowReorderConfirm(false);
    }
  };

  // Cancel role reordering
  const cancelRoleOrder = () => {
    // Reset to original order before the drag operation
    setLocalRoles(originalRoles);
    setPendingReorder(null);
    setShowReorderConfirm(false);
  };

  // Show loading state
  if (rolesLoading || permissionsLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Staff Roles & Permissions
          </CardTitle>
          <CardDescription>Loading roles and permissions...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const handleCreateRole = () => {
    setRoleFormData({ name: '', description: '', permissions: [] });
    setIsCreatingRole(true);
    setSelectedRole(null);
  };

  const handleEditRole = (role: StaffRole) => {
    if (role.name === 'Super Admin') {
      toast({
        title: "Cannot Edit Super Admin Role",
        description: "The highest authority role cannot be modified.",
        variant: "destructive"
      });
      return;
    }
    
    // Check if user can edit this role based on hierarchy
    const currentUserOrder = roleOrderMap.get(currentUser.role || '') ?? 999;
    if (currentUserOrder >= getRoleOrder(role)) {
      toast({
        title: "Cannot Edit Role",
        description: "You can only edit roles with lower authority than your own.",
        variant: "destructive"
      });
      return;
    }
    setRoleFormData({ name: role.name, description: role.description, permissions: [...role.permissions] });
    setSelectedRole(role);
    setIsEditingRole(true);
  };

  const handleSaveRole = async () => {
    if (!roleFormData.name.trim()) {
      toast({
        title: "Invalid Role Name",
        description: "Role name cannot be empty.",
        variant: "destructive"
      });
      return;
    }

    if (!roleFormData.description.trim()) {
      toast({
        title: "Invalid Role Description",
        description: "Role description cannot be empty.",
        variant: "destructive"
      });
      return;
    }

    try {
      if (isCreatingRole) {
        await createRoleMutation.mutateAsync({
          name: roleFormData.name,
          description: roleFormData.description,
          permissions: roleFormData.permissions
        });
        toast({
          title: "Role Created",
          description: `Role "${roleFormData.name}" has been created successfully.`,
        });
      } else if (selectedRole && isEditingRole) {
        await updateRoleMutation.mutateAsync({
          id: selectedRole.id,
          name: roleFormData.name,
          description: roleFormData.description,
          permissions: roleFormData.permissions
        });
        toast({
          title: "Role Updated",
          description: `Role "${roleFormData.name}" has been updated successfully.`,
        });
      }

      setIsCreatingRole(false);
      setIsEditingRole(false);
      setSelectedRole(null);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save role",
        variant: "destructive"
      });
    }
  };

  const handleDeleteRole = (role: StaffRole) => {
    if (role.name === 'Super Admin') {
      toast({
        title: "Cannot Delete Super Admin Role",
        description: "The highest authority role cannot be deleted.",
        variant: "destructive"
      });
      return;
    }
    
    // Check if user can delete this role based on hierarchy
    const currentUserOrder = roleOrderMap.get(currentUser.role || '') ?? 999;
    if (currentUserOrder >= getRoleOrder(role)) {
      toast({
        title: "Cannot Delete Role",
        description: "You can only delete roles with lower authority than your own.",
        variant: "destructive"
      });
      return;
    }
    setDeleteConfirmRole(role);
  };

  const confirmDeleteRole = async () => {
    if (deleteConfirmRole) {
      try {
        await deleteRoleMutation.mutateAsync(deleteConfirmRole.id);
        toast({
          title: "Role Deleted",
          description: `Role "${deleteConfirmRole.name}" has been deleted successfully.`,
        });
        setDeleteConfirmRole(null);
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to delete role",
          variant: "destructive"
        });
      }
    }
  };

  const togglePermission = (permissionId: string) => {
    setRoleFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permissionId)
        ? prev.permissions.filter(p => p !== permissionId)
        : [...prev.permissions, permissionId]
    }));
  };

  const getPermissionsByCategory = (category: string) => {
    return permissions.filter((p: Permission) => p.category === category);
  };

  const hasPermission = (role: StaffRole, permissionId: string) => {
    return role.permissions.includes(permissionId);
  };

  // Helper function to check if the role form is valid
  const isRoleFormValid = () => {
    return roleFormData.name.trim() !== '' && roleFormData.description.trim() !== '';
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Staff Roles & Permissions
              </CardTitle>
              <CardDescription>
                Configure staff roles and their permissions for punishments, tickets, and administrative features.
              </CardDescription>
            </div>
            <Button onClick={handleCreateRole} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create Role
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Roles List */}
          <DndProvider backend={HTML5Backend}>
            <div className="space-y-4">
              {localRoles.map((role, index) => (
                <DraggableRoleCard
                  key={role.id}
                  role={role}
                  index={index}
                  currentUserRole={currentUser.role}
                  roleOrderMap={roleOrderMap}
                  onEditRole={handleEditRole}
                  onDeleteRole={handleDeleteRole}
                  onMoveRole={moveRole}
                  onCommitReorder={commitRoleReorder}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  getPermissionsByCategory={getPermissionsByCategory}
                  hasPermission={hasPermission}
                />
              ))}
            </div>
          </DndProvider>
        </CardContent>
      </Card>

      {/* Role Creation/Edit Dialog */}
      <Dialog open={isCreatingRole || isEditingRole} onOpenChange={(open) => {
        if (!open) {
          setIsCreatingRole(false);
          setIsEditingRole(false);
          setSelectedRole(null);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isCreatingRole ? 'Create New Role' : 'Edit Role'}
            </DialogTitle>
            <DialogDescription>
              Configure the role name, description, and permissions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="role-name">Role Name <span className="text-destructive">*</span></Label>
                <Input
                  id="role-name"
                  value={roleFormData.name}
                  onChange={(e) => setRoleFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter role name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role-description">Description <span className="text-destructive">*</span></Label>
                <Input
                  id="role-description"
                  value={roleFormData.description}
                  onChange={(e) => setRoleFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Enter role description"
                  required
                />
              </div>
            </div>

            {/* Permissions */}
            <div className="space-y-4">
              <h4 className="font-medium">Permissions</h4>
              
              {Object.entries(PERMISSION_CATEGORIES).map(([category, label]) => {
                const categoryPermissions = getPermissionsByCategory(category);
                if (categoryPermissions.length === 0) return null;

                return (
                  <div key={category} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <h5 className="font-medium text-sm">{label}</h5>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const allCategoryPermissions = categoryPermissions.map((p: Permission) => p.id);
                            setRoleFormData(prev => ({
                              ...prev,
                              permissions: [...prev.permissions.filter((p: string) => !allCategoryPermissions.includes(p)), ...allCategoryPermissions]
                            }));
                          }}
                        >
                          Select All
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const allCategoryPermissions = categoryPermissions.map((p: Permission) => p.id);
                            setRoleFormData(prev => ({
                              ...prev,
                              permissions: prev.permissions.filter((p: string) => !allCategoryPermissions.includes(p))
                            }));
                          }}
                        >
                          Clear All
                        </Button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-4">
                      {categoryPermissions.map((permission: Permission) => (
                        <div key={permission.id} className="flex items-start space-x-2">
                          <Checkbox
                            id={permission.id}
                            checked={roleFormData.permissions.includes(permission.id)}
                            onCheckedChange={() => togglePermission(permission.id)}
                          />
                          <div className="grid gap-1.5 leading-none">
                            <Label
                              htmlFor={permission.id}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              {permission.name}
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              {permission.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {category !== 'admin' && <Separator />}
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsCreatingRole(false);
              setIsEditingRole(false);
              setSelectedRole(null);
            }}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button 
              onClick={handleSaveRole}
              disabled={createRoleMutation.isPending || updateRoleMutation.isPending || !isRoleFormValid()}
            >
              <Save className="h-4 w-4 mr-2" />
              {createRoleMutation.isPending || updateRoleMutation.isPending 
                ? 'Saving...' 
                : isCreatingRole ? 'Create Role' : 'Save Changes'
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmRole} onOpenChange={(open) => !open && setDeleteConfirmRole(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Role</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the role "{deleteConfirmRole?.name}"? This action cannot be undone.
              All staff members with this role will need to be reassigned to a different role.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmRole(null)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDeleteRole}
              disabled={deleteRoleMutation.isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {deleteRoleMutation.isPending ? 'Deleting...' : 'Delete Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role Reorder Confirmation Dialog */}
      <AlertDialog open={showReorderConfirm} onOpenChange={setShowReorderConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Role Reordering</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to save the new role hierarchy? This will change the authority levels of staff members with these roles.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelRoleOrder}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={saveRoleOrder}>
              Save New Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}