import express, { Request, Response, NextFunction } from 'express';
import { Connection, Schema } from 'mongoose';
import { isAuthenticated } from '../middleware/auth-middleware';
import { checkRole } from '../middleware/role-middleware';
import { strictRateLimit } from '../middleware/rate-limiter';

const router = express.Router();

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
router.get('/permissions', checkRole(['Super Admin', 'Admin']), async (req: Request, res: Response) => {
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
router.get('/', checkRole(['Super Admin', 'Admin']), async (req: Request, res: Response) => {
  try {
    const db = req.serverDbConnection!;
    
    // Try to get all roles from the database
    let StaffRoles;
    try {
      StaffRoles = db.model('StaffRole');
    } catch {
      // If model doesn't exist, create it and return empty roles array
      const StaffRoleSchema = new Schema({
        id: { type: String, required: true, unique: true },
        name: { type: String, required: true },
        description: { type: String, required: true },
        permissions: [{ type: String }],
        isDefault: { type: Boolean, default: false }
      }, { timestamps: true });
      
      StaffRoles = db.model('StaffRole', StaffRoleSchema);
    }
    
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
router.get('/:id', checkRole(['Super Admin', 'Admin']), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = req.serverDbConnection!;
    
    // Try to get role from database
    let StaffRoles;
    try {
      StaffRoles = db.model('StaffRole');
    } catch {
      // If model doesn't exist, role doesn't exist
      return res.status(404).json({ error: 'Role not found' });
    }
    
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
router.post('/', checkRole(['Super Admin']), strictRateLimit, async (req: Request, res: Response) => {
  try {
    const { name, description, permissions } = req.body;
    
    if (!name || !description || !Array.isArray(permissions)) {
      return res.status(400).json({ error: 'Invalid role data' });
    }
    
    const db = req.serverDbConnection!;
    
    // Create/get the StaffRole model
    let StaffRoles;
    try {
      StaffRoles = db.model('StaffRole');
    } catch {
      const StaffRoleSchema = new Schema({
        id: { type: String, required: true, unique: true },
        name: { type: String, required: true },
        description: { type: String, required: true },
        permissions: [{ type: String }],
        isDefault: { type: Boolean, default: false }
      }, { timestamps: true });
      
      StaffRoles = db.model('StaffRole', StaffRoleSchema);
    }
    
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
router.put('/:id', checkRole(['Super Admin']), strictRateLimit, async (req: Request, res: Response) => {
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
    
    const StaffRoles = db.model('StaffRole');
    
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
router.delete('/:id', checkRole(['Super Admin']), strictRateLimit, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = req.serverDbConnection!;
    
    // Cannot delete Super Admin role
    if (id.includes('super-admin')) {
      return res.status(403).json({ error: 'Cannot delete Super Admin role' });
    }
    
    const StaffRoles = db.model('StaffRole');
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
    // Create StaffRole model if it doesn't exist
    let StaffRoles;
    try {
      StaffRoles = dbConnection.model('StaffRole');
    } catch {
      const StaffRoleSchema = new Schema({
        id: { type: String, required: true, unique: true },
        name: { type: String, required: true },
        description: { type: String, required: true },
        permissions: [{ type: String }],
        isDefault: { type: Boolean, default: false }
      }, { timestamps: true });
      
      StaffRoles = dbConnection.model('StaffRole', StaffRoleSchema);
    }

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