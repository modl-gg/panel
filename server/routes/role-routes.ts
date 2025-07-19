import express, { Request, Response, NextFunction } from 'express';
import { Connection, Schema } from 'mongoose';
import { isAuthenticated } from '../middleware/auth-middleware';
// Note: Permission functions will be imported dynamically to avoid circular dependency issues
import { strictRateLimit } from '../middleware/rate-limiter';

const router = express.Router();

// Helper function to check role management permissions
async function checkRolePermission(req: Request, res: Response, requireSuperAdmin: boolean = false): Promise<boolean> {
  try {
    const { hasPermission } = await import('../middleware/permission-middleware');
    const canManageStaff = await hasPermission(req, 'admin.staff.manage');
    
    if (!canManageStaff) {
      res.status(403).json({ 
        message: 'Forbidden: You do not have permission to manage roles.',
        required: ['admin.staff.manage']
      });
      return false;
    }
    
    // For destructive operations (create/modify/delete), also check if user is server admin
    if (requireSuperAdmin) {
      const adminEmail = req.modlServer?.adminEmail?.toLowerCase();
      const userEmail = req.currentUser?.email?.toLowerCase();
      
      if (!adminEmail || !userEmail || userEmail !== adminEmail) {
        res.status(403).json({ 
          message: 'Forbidden: Only the server administrator can modify roles.',
          required: ['server_admin']
        });
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error checking role permissions:', error);
    res.status(500).json({ message: 'Internal server error while checking permissions.' });
    return false;
  }
}

// Permission definitions
interface Permission {
  id: string;
  name: string;
  description: string;
  category: 'punishment' | 'ticket' | 'admin';
}

interface StaffRole {
  _id?: string;
  id: string;
  name: string;
  description: string;
  permissions: string[];
  isDefault: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// Middleware to ensure database connection
router.use((req: Request, res: Response, next: NextFunction) => {
  if (!req.serverDbConnection) {
    return res.status(503).json({ error: 'Service unavailable. Database connection not established for this server.' });
  }
  if (!req.serverName) {
    return res.status(500).json({ error: 'Internal server error. Server name missing.' });
  }
  next();
});

// Apply authentication middleware
router.use(isAuthenticated);

// Define base permissions that are always available
const getBasePermissions = (): Permission[] => [
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

// Get punishment permissions based on current punishment types
const getPunishmentPermissions = async (dbConnection: Connection): Promise<Permission[]> => {
  try {
    const Settings = dbConnection.model('Settings');
    const punishmentTypesDoc = await Settings.findOne({ type: 'punishmentTypes' });
    const punishmentTypes = punishmentTypesDoc?.data || [];
    
    return punishmentTypes.map((type: any) => ({
      id: `punishment.apply.${type.name.toLowerCase().replace(/\s+/g, '-')}`,
      name: `Apply ${type.name}`,
      description: `Permission to apply ${type.name} punishments`,
      category: 'punishment' as const
    }));
  } catch (error) {
    console.error('Error fetching punishment permissions:', error);
    return [];
  }
};

// GET /api/panel/roles/permissions - Get all available permissions
router.get('/permissions', async (req: Request, res: Response) => {
  if (!(await checkRolePermission(req, res))) return;
  try {
    const basePermissions = getBasePermissions();
    const punishmentPermissions = await getPunishmentPermissions(req.serverDbConnection!);
    
    const allPermissions = [...basePermissions, ...punishmentPermissions];
    
    res.json({
      permissions: allPermissions,
      categories: {
        punishment: 'Punishment Permissions',
        ticket: 'Ticket Permissions',
        admin: 'Administrative Permissions'
      }
    });
  } catch (error) {
    console.error('Error fetching permissions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/panel/roles - Get all roles
router.get('/', async (req: Request, res: Response) => {
  if (!(await checkRolePermission(req, res))) return;
  try {
    const db = req.serverDbConnection!;
    
    // Get StaffRole model with consistent schema
    const { getStaffRoleModel } = await import('../utils/schema-utils');
    const StaffRoles = getStaffRoleModel(db);
    
    const allRoles = await StaffRoles.find({});

    // Get staff counts for each role
    const Staff = db.model('Staff');
    const roleCounts = await Staff.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);
    
    const roleCountMap = roleCounts.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {} as Record<string, number>);

    // Add user counts to roles
    const rolesWithCounts = allRoles.map((role: any) => ({
      ...role.toObject(),
      userCount: roleCountMap[role.name] || 0
    }));
    
    res.json({ roles: rolesWithCounts });
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/panel/roles/:id - Get a specific role by ID
router.get('/:id', async (req: Request, res: Response) => {
  if (!(await checkRolePermission(req, res))) return;
  try {
    const { id } = req.params;
    const db = req.serverDbConnection!;
    
    // Get StaffRole model with consistent schema
    const { getStaffRoleModel } = await import('../utils/schema-utils');
    const StaffRoles = getStaffRoleModel(db);
    
    const role = await StaffRoles.findOne({ id });
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }
    
    // Get staff count for this role
    const Staff = db.model('Staff');
    const staffCount = await Staff.countDocuments({ role: role.name });
    
    res.json({ 
      role: {
        ...role.toObject(),
        userCount: staffCount
      }
    });
  } catch (error) {
    console.error('Error fetching role:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/panel/roles - Create a new custom role
router.post('/', strictRateLimit, async (req: Request, res: Response) => {
  if (!(await checkRolePermission(req, res, true))) return;
  try {
    const { name, description, permissions } = req.body;
    
    if (!name || !description || !Array.isArray(permissions)) {
      return res.status(400).json({ error: 'Invalid role data' });
    }
    
    const db = req.serverDbConnection!;
    
    // Get StaffRole model with consistent schema
    const { getStaffRoleModel } = await import('../utils/schema-utils');
    const StaffRoles = getStaffRoleModel(db);
    
    // Generate unique ID
    const id = `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Validate permissions against available permissions
    const basePermissions = getBasePermissions();
    const punishmentPermissions = await getPunishmentPermissions(db);
    const allValidPermissions = [...basePermissions, ...punishmentPermissions].map(p => p.id);
    
    const invalidPermissions = permissions.filter((p: string) => !allValidPermissions.includes(p));
    if (invalidPermissions.length > 0) {
      return res.status(400).json({ 
        error: 'Invalid permissions', 
        invalidPermissions 
      });
    }
    
    const newRole = new StaffRoles({
      id,
      name,
      description,
      permissions,
      isDefault: false
    });
    
    await newRole.save();
    
    res.status(201).json({ 
      message: 'Role created successfully',
      role: newRole.toObject()
    });
  } catch (error) {
    console.error('Error creating role:', error);
    if ((error as any).code === 11000) {
      return res.status(409).json({ error: 'Role name already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/panel/roles/:id - Update a custom role
router.put('/:id', strictRateLimit, async (req: Request, res: Response) => {
  if (!(await checkRolePermission(req, res, true))) return;
  try {
    const { id } = req.params;
    const { name, description, permissions } = req.body;
    
    if (!name || !description || !Array.isArray(permissions)) {
      return res.status(400).json({ error: 'Invalid role data' });
    }
    
    const db = req.serverDbConnection!;
    
    // Cannot update Super Admin role
    if (id.includes('super-admin')) {
      return res.status(403).json({ error: 'Cannot modify Super Admin role' });
    }
    
    // Get StaffRole model with consistent schema
    const { getStaffRoleModel } = await import('../utils/schema-utils');
    const StaffRoles = getStaffRoleModel(db);
    
    // Validate permissions
    const basePermissions = getBasePermissions();
    const punishmentPermissions = await getPunishmentPermissions(db);
    const allValidPermissions = [...basePermissions, ...punishmentPermissions].map(p => p.id);
    
    const invalidPermissions = permissions.filter((p: string) => !allValidPermissions.includes(p));
    if (invalidPermissions.length > 0) {
      return res.status(400).json({ 
        error: 'Invalid permissions', 
        invalidPermissions 
      });
    }
    
    const updatedRole = await StaffRoles.findOneAndUpdate(
      { id },
      { name, description, permissions },
      { new: true }
    );
    
    if (!updatedRole) {
      return res.status(404).json({ error: 'Role not found' });
    }
    
    res.json({ 
      message: 'Role updated successfully',
      role: updatedRole.toObject()
    });
  } catch (error) {
    console.error('Error updating role:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/panel/roles/:id - Delete a custom role
router.delete('/:id', strictRateLimit, async (req: Request, res: Response) => {
  if (!(await checkRolePermission(req, res, true))) return;
  try {
    const { id } = req.params;
    const db = req.serverDbConnection!;
    
    // Cannot delete Super Admin role
    if (id.includes('super-admin')) {
      return res.status(403).json({ error: 'Cannot delete Super Admin role' });
    }
    
    // Get StaffRole model with consistent schema
    const { getStaffRoleModel } = await import('../utils/schema-utils');
    const StaffRoles = getStaffRoleModel(db);
    const Staff = db.model('Staff');
    
    // Check if any staff members are using this role
    const roleInUse = await Staff.findOne({ role: id });
    if (roleInUse) {
      return res.status(409).json({ 
        error: 'Cannot delete role that is currently assigned to staff members',
        message: 'Please reassign all staff members to a different role before deleting this role.'
      });
    }
    
    const deletedRole = await StaffRoles.findOneAndDelete({ id });
    
    if (!deletedRole) {
      return res.status(404).json({ error: 'Role not found' });
    }
    
    res.json({ message: 'Role deleted successfully' });
  } catch (error) {
    console.error('Error deleting role:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Create default staff roles in the database
 * Called during server provisioning
 */
export async function createDefaultRoles(dbConnection: Connection): Promise<void> {
  try {
    // Get StaffRole model with consistent schema
    const { getStaffRoleModel } = await import('../utils/schema-utils');
    const StaffRoles = getStaffRoleModel(dbConnection);

    // Get punishment permissions for default roles
    const punishmentPermissions = await getPunishmentPermissions(dbConnection);
    const allPunishmentPerms = punishmentPermissions.map(p => p.id);

    // Define default roles
    const defaultRoles = [
      {
        id: 'super-admin',
        name: 'Super Admin',
        description: 'Full access to all features and settings',
        permissions: [
          'admin.settings.view', 'admin.settings.modify', 'admin.staff.manage', 'admin.analytics.view',
          'punishment.modify',
          'ticket.view.all', 'ticket.reply.all', 'ticket.close.all', 'ticket.delete.all',
          ...allPunishmentPerms
        ],
        isDefault: true,
      },
      {
        id: 'admin',
        name: 'Admin',
        description: 'Administrative access with some restrictions',
        permissions: [
          'admin.settings.view', 'admin.staff.manage', 'admin.analytics.view',
          'punishment.modify',
          'ticket.view.all', 'ticket.reply.all', 'ticket.close.all',
          ...allPunishmentPerms
        ],
        isDefault: true,
      },
      {
        id: 'moderator',
        name: 'Moderator',
        description: 'Moderation permissions for punishments and tickets',
        permissions: [
          'punishment.modify',
          'ticket.view.all', 'ticket.reply.all', 'ticket.close.all',
          // Moderator gets all punishment permissions except the most severe ones
          ...allPunishmentPerms.filter(p => !p.includes('blacklist') && !p.includes('security-ban'))
        ],
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

    // Create or update each default role
    for (const roleData of defaultRoles) {
      await StaffRoles.findOneAndUpdate(
        { id: roleData.id },
        roleData,
        { upsert: true, new: true }
      );
      console.log(`Created/updated default role: ${roleData.name}`);
    }

    console.log('Default staff roles created successfully');
  } catch (error) {
    console.error('Error creating default roles:', error);
    throw error;
  }
}

export default router;