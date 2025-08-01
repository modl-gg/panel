import { Request, Response, NextFunction } from 'express';
import { 
  getRoleHierarchy, 
  hasHigherAuthority, 
  hasHigherOrEqualAuthority,
  canModifyRole as canModifyRoleHierarchy,
  canRemoveUser as canRemoveUserHierarchy,
  canAssignMinecraftPlayer as canAssignMinecraftPlayerHierarchy,
  isSuperAdminRole
} from '../utils/role-hierarchy';

// Permission checking middleware
export const checkPermission = (requiredPermissions: string | string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {

    if (!req.currentUser || !req.currentUser.role) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const userRole = req.currentUser.role;
    const permissions = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];

    try {
      // Get user permissions based on their role
      const userPermissions = await getUserPermissions(req, userRole);
      
      // Check if user has all required permissions
      const hasAllPermissions = permissions.every(permission => 
        userPermissions.includes(permission)
      );

      if (hasAllPermissions) {
        next();
      } else {
        res.status(403).json({ 
          message: 'Forbidden: You do not have the required permissions.',
          required: permissions,
          userPermissions: userPermissions
        });
      }
    } catch (error) {
      console.error('Error checking permissions:', error);
      res.status(500).json({ message: 'Internal server error while checking permissions.' });
    }
  };
};

// Helper function to get user permissions based on role
export async function getUserPermissions(req: Request, userRole: string): Promise<string[]> {
  if (!req.serverDbConnection) {
    throw new Error('Database connection not available');
  }

  // Check if user has a custom role defined in the database
  try {
    // Get StaffRole model with consistent schema
    const { getStaffRoleModel } = await import('../utils/schema-utils');
    const StaffRoles = getStaffRoleModel(req.serverDbConnection);
    
    const roleDoc = await StaffRoles.findOne({ name: userRole });
    
    if (roleDoc && roleDoc.permissions && Array.isArray(roleDoc.permissions)) {
      // Get punishment permissions from settings and add them
      try {
        const { getSettingsValue } = await import('../routes/settings-routes');
        const punishmentTypes = await getSettingsValue(req.serverDbConnection!, 'punishmentTypes') || [];
        
        const punishmentPermissions = punishmentTypes.map((type: any) => 
          `punishment.apply.${type.name.toLowerCase().replace(/\s+/g, '-')}`
        );

        // Add punishment permissions based on role permissions level
        let userPermissions = [...roleDoc.permissions];
        
        // If role has admin permissions, give all punishment permissions
        if (roleDoc.permissions.includes('admin.settings.modify') || roleDoc.permissions.includes('admin.staff.manage')) {
          userPermissions = [...userPermissions, ...punishmentPermissions];
        }
        // If role has ticket close permissions, give most punishment permissions (except severe ones)
        else if (roleDoc.permissions.includes('ticket.close.all')) {
          const moderatePunishmentPerms = punishmentPermissions.filter((p: string) => 
            !p.includes('blacklist') && !p.includes('security-ban')
          );
          userPermissions = [...userPermissions, ...moderatePunishmentPerms];
        }
        
        return userPermissions;
      } catch (error) {
        console.error('Error adding punishment permissions to custom role:', error);
        return roleDoc.permissions;
      }
    }
  } catch (error) {
    console.error('Error fetching custom role permissions:', error);
  }

  // Fallback to default role permissions for backwards compatibility
  const defaultPermissions: Record<string, string[]> = {
    'Super Admin': [
      'admin.settings.view', 'admin.settings.modify', 'admin.staff.manage', 'admin.audit.view',
      'ticket.view.all', 'ticket.reply.all', 'ticket.close.all', 'ticket.delete.all'
    ],
    'Admin': [
      'admin.settings.view', 'admin.staff.manage', 'admin.audit.view',
      'ticket.view.all', 'ticket.reply.all', 'ticket.close.all'
    ],
    'Moderator': [
      'ticket.view.all', 'ticket.reply.all', 'ticket.close.all'
    ],
    'Helper': [
      'ticket.view.all', 'ticket.reply.all'
    ]
  };

  // Get base permissions for the role
  const basePermissions = defaultPermissions[userRole] || [];

  // Get punishment permissions from settings
  try {
    const { getSettingsValue } = await import('../routes/settings-routes');
    const punishmentTypes = await getSettingsValue(req.serverDbConnection!, 'punishmentTypes') || [];
    
    const punishmentPermissions = punishmentTypes.map((type: any) => 
      `punishment.apply.${type.name.toLowerCase().replace(/\s+/g, '-')}`
    );

    // Add punishment permissions based on base permissions level
    if (basePermissions.includes('admin.settings.modify') || basePermissions.includes('admin.staff.manage')) {
      return [...basePermissions, ...punishmentPermissions];
    } else if (basePermissions.includes('ticket.close.all')) {
      // Moderator-level permissions - exclude severe punishment types
      const moderatePunishmentPerms = punishmentPermissions.filter((p: string) => 
        !p.includes('blacklist') && !p.includes('security-ban')
      );
      return [...basePermissions, ...moderatePunishmentPerms];
    }
    
    return basePermissions;
  } catch (error) {
    console.error('Error fetching punishment permissions:', error);
    return basePermissions;
  }
}

// Convenience function to check if user has a specific permission
export const hasPermission = async (req: Request, permission: string): Promise<boolean> => {

  if (!req.currentUser || !req.currentUser.role) {
    return false;
  }

  try {
    const userPermissions = await getUserPermissions(req, req.currentUser.role);
    return userPermissions.includes(permission);
  } catch (error) {
    console.error('Error checking permission:', error);
    return false;
  }
};

// Role hierarchy helper functions integrated with existing permission system

export const canModifyRole = async (
  req: Request,
  currentUserRole: string,
  targetUserRole: string,
  newRole: string
): Promise<boolean> => {
  try {
    const roleHierarchy = await getRoleHierarchy(req.serverDbConnection!);
    return canModifyRoleHierarchy(currentUserRole, targetUserRole, newRole, roleHierarchy);
  } catch (error) {
    console.error('Error checking role modification permissions:', error);
    return false;
  }
};

export const canRemoveUser = async (
  req: Request,
  currentUserRole: string,
  targetUserRole: string
): Promise<boolean> => {
  try {
    const roleHierarchy = await getRoleHierarchy(req.serverDbConnection!);
    return canRemoveUserHierarchy(currentUserRole, targetUserRole, roleHierarchy);
  } catch (error) {
    console.error('Error checking user removal permissions:', error);
    return false;
  }
};

export const canAssignMinecraftPlayer = async (
  req: Request,
  currentUserRole: string,
  targetUserRole: string,
  currentUserId: string,
  targetUserId: string
): Promise<boolean> => {
  try {
    const roleHierarchy = await getRoleHierarchy(req.serverDbConnection!);
    return canAssignMinecraftPlayerHierarchy(currentUserRole, targetUserRole, currentUserId, targetUserId, roleHierarchy);
  } catch (error) {
    console.error('Error checking minecraft player assignment permissions:', error);
    return false;
  }
};

export const hasHigherRoleAuthority = async (
  req: Request,
  user1Role: string,
  user2Role: string
): Promise<boolean> => {
  try {
    const roleHierarchy = await getRoleHierarchy(req.serverDbConnection!);
    return hasHigherAuthority(user1Role, user2Role, roleHierarchy);
  } catch (error) {
    console.error('Error checking role authority:', error);
    return false;
  }
};

export const hasEqualOrHigherRoleAuthority = async (
  req: Request,
  user1Role: string,
  user2Role: string
): Promise<boolean> => {
  try {
    const roleHierarchy = await getRoleHierarchy(req.serverDbConnection!);
    return hasHigherOrEqualAuthority(user1Role, user2Role, roleHierarchy);
  } catch (error) {
    console.error('Error checking role authority:', error);
    return false;
  }
};

// Check if a role is Super Admin (for special handling)
export const isSuperAdmin = (roleName: string): boolean => {
  return isSuperAdminRole(roleName);
};