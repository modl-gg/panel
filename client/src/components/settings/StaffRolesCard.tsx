import React, { useState, useEffect } from 'react';
import { Shield, Plus, Edit, Trash2, Save, X, Check } from 'lucide-react';
import { Button } from 'modl-shared-web/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'modl-shared-web/components/ui/card';
import { Input } from 'modl-shared-web/components/ui/input';
import { Label } from 'modl-shared-web/components/ui/label';
import { Checkbox } from 'modl-shared-web/components/ui/checkbox';
import { Badge } from 'modl-shared-web/components/ui/badge';
import { useToast } from 'modl-shared-web/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "modl-shared-web/components/ui/dialog";
import { Separator } from 'modl-shared-web/components/ui/separator';
import { useSettings, useRoles, usePermissions, useCreateRole, useUpdateRole, useDeleteRole } from '@/hooks/use-data';

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
  { id: 'admin.analytics.view', name: 'View Analytics', description: 'Access system analytics and reports', category: 'admin' },
  
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
    permissions: ['admin.settings.view', 'admin.settings.modify', 'admin.staff.manage', 'admin.analytics.view', 'ticket.view.all', 'ticket.reply.all', 'ticket.close.all', 'ticket.delete.all'],
    isDefault: true,
  },
  {
    id: 'admin',
    name: 'Admin',
    description: 'Administrative access with some restrictions',
    permissions: ['admin.settings.view', 'admin.staff.manage', 'admin.analytics.view', 'ticket.view.all', 'ticket.reply.all', 'ticket.close.all'],
    isDefault: true,
  },
  {
    id: 'moderator',
    name: 'Moderator',
    description: 'Moderation permissions for punishments and tickets',
    permissions: ['ticket.view.all', 'ticket.reply.all', 'ticket.close.all'],
    isDefault: true,
  },
  {
    id: 'helper',
    name: 'Helper',
    description: 'Basic support permissions',
    permissions: ['ticket.view.all', 'ticket.reply.all'],
    isDefault: true,
  },
];

export default function StaffRolesCard() {
  const [selectedRole, setSelectedRole] = useState<StaffRole | null>(null);
  const [isEditingRole, setIsEditingRole] = useState(false);
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [roleFormData, setRoleFormData] = useState({ name: '', description: '', permissions: [] as string[] });
  const [deleteConfirmRole, setDeleteConfirmRole] = useState<StaffRole | null>(null);
  const { toast } = useToast();
  
  // API hooks
  const { data: rolesData, isLoading: rolesLoading } = useRoles();
  const { data: permissionsData, isLoading: permissionsLoading } = usePermissions();
  const createRoleMutation = useCreateRole();
  const updateRoleMutation = useUpdateRole();
  const deleteRoleMutation = useDeleteRole();
  
  const roles = rolesData?.roles || [];
  const permissions = permissionsData?.permissions || [];
  const permissionCategories = permissionsData?.categories || PERMISSION_CATEGORIES;

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
    if (role.id === 'super-admin') {
      toast({
        title: "Cannot Edit Super Admin Role",
        description: "Super Admin role cannot be modified.",
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
    if (role.id === 'super-admin') {
      toast({
        title: "Cannot Delete Super Admin Role",
        description: "Super Admin role cannot be deleted.",
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
    return permissions.filter(p => p.category === category);
  };

  const hasPermission = (role: StaffRole, permissionId: string) => {
    return role.permissions.includes(permissionId);
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
          <div className="space-y-4">
            {roles.map((role) => (
              <div key={role.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
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
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditRole(role)}
                      disabled={role.id === 'super-admin'}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteRole(role)}
                      disabled={role.id === 'super-admin'}
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
            ))}
          </div>
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
                <Label htmlFor="role-name">Role Name</Label>
                <Input
                  id="role-name"
                  value={roleFormData.name}
                  onChange={(e) => setRoleFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter role name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role-description">Description</Label>
                <Input
                  id="role-description"
                  value={roleFormData.description}
                  onChange={(e) => setRoleFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Enter role description"
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
                            const allCategoryPermissions = categoryPermissions.map(p => p.id);
                            setRoleFormData(prev => ({
                              ...prev,
                              permissions: [...prev.permissions.filter(p => !allCategoryPermissions.includes(p)), ...allCategoryPermissions]
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
                            const allCategoryPermissions = categoryPermissions.map(p => p.id);
                            setRoleFormData(prev => ({
                              ...prev,
                              permissions: prev.permissions.filter(p => !allCategoryPermissions.includes(p))
                            }));
                          }}
                        >
                          Clear All
                        </Button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-4">
                      {categoryPermissions.map((permission) => (
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
              disabled={createRoleMutation.isPending || updateRoleMutation.isPending}
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
    </div>
  );
}