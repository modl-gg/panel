import { Request, Response, NextFunction } from 'express';

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
async function getUserPermissions(req: Request, userRole: string): Promise<string[]> {
  if (!req.serverDbConnection) {
    throw new Error('Database connection not available');
  }

  // Define default role permissions
  const defaultPermissions: Record<string, string[]> = {
    'Super Admin': [
      'admin.settings.view', 'admin.settings.modify', 'admin.staff.manage', 'admin.analytics.view',
      'ticket.view.all', 'ticket.reply.all', 'ticket.close.all', 'ticket.delete.all'
    ],
    'Admin': [
      'admin.settings.view', 'admin.staff.manage', 'admin.analytics.view',
      'ticket.view.all', 'ticket.reply.all', 'ticket.close.all'
    ],
    'Moderator': [
      'ticket.view.all', 'ticket.reply.all', 'ticket.close.all'
    ],
    'Helper': [
      'ticket.view.all', 'ticket.reply.all'
    ]
  };

  // Get punishment permissions from settings
  try {
    // Import helper function dynamically
    const { getSettingsValue } = await import('../routes/settings-routes');
    const punishmentTypes = await getSettingsValue(req.serverDbConnection!, 'punishmentTypes') || [];
    
    const punishmentPermissions = punishmentTypes.map((type: any) => 
      `punishment.apply.${type.name.toLowerCase().replace(/\s+/g, '-')}`
    );

    // Add punishment permissions to appropriate roles
    if (userRole === 'Super Admin' || userRole === 'Admin') {
      defaultPermissions[userRole] = [...defaultPermissions[userRole], ...punishmentPermissions];
    } else if (userRole === 'Moderator') {
      // Moderators get all punishment permissions except the most severe ones
      const moderatorPunishmentPerms = punishmentPermissions.filter((p: string) => 
        !p.includes('blacklist') && !p.includes('security-ban')
      );
      defaultPermissions[userRole] = [...defaultPermissions[userRole], ...moderatorPunishmentPerms];
    }
  } catch (error) {
    console.error('Error fetching punishment permissions:', error);
  }

  // Check if user has a custom role
  try {
    const StaffRoles = req.serverDbConnection.model('StaffRole');
    const customRole = await StaffRoles.findOne({ name: userRole });
    
    if (customRole) {
      return customRole.permissions || [];
    }
  } catch (error) {
    // Custom role model might not exist, fall back to default permissions
    console.log('Custom role model not found, using default permissions');
  }

  // Return default permissions for the role
  return defaultPermissions[userRole] || [];
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