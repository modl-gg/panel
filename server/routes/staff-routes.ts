import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import mongoose, { Document as MongooseDocument, Connection, Model } from 'mongoose';
import { isAuthenticated } from '../middleware/auth-middleware';
// Note: checkRole replaced with permission-based checks
// Note: checkPermission will be imported dynamically to avoid circular dependency issues
import { IPasskey, IStaff, IModlServer, Invitation } from '@modl-gg/shared-web';
import { getModlServersModel } from '../db/connectionManager';
import { strictRateLimit, authRateLimit } from '../middleware/rate-limiter';
import { getSettingsValue } from './settings-routes';
import EmailTemplateService from '../services/email-template-service';

const router = express.Router();

router.use((req: Request, res: Response, next: NextFunction) => {
  if (!req.serverDbConnection) {
    return res.status(503).json({ error: 'Service unavailable. Database connection not established for this server.' });
  }
  if (!req.serverName) {
    return res.status(500).json({ error: 'Internal server error. Server name missing.' });
  }
  next();
});

// Public routes - should be defined before authentication middleware

router.get('/check-username/:username', async (req: Request<{ username: string }>, res: Response) => {
  try {
    const Staff = req.serverDbConnection!.model<IStaff>('Staff');
    const staffMember = await Staff.findOne({ username: req.params.username });
    res.json({ exists: !!staffMember });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Apply isAuthenticated middleware to all routes in this router
router.use(isAuthenticated);

router.get('/', async (req: Request, res: Response) => {
  try {
    // Check permissions
    const { hasPermission } = await import('../middleware/permission-middleware');
    const canManageStaff = await hasPermission(req, 'admin.staff.manage');
    
    if (!canManageStaff) {
      return res.status(403).json({ 
        message: 'Forbidden: You do not have the required permissions.',
        required: ['admin.staff.manage']
      });
    }
    const db = req.serverDbConnection!;
    const UserModel = db.model('Staff');
    const InvitationModel = db.model('Invitation');

    const users = await UserModel.find({});
    const invitations = await InvitationModel.find({ status: 'pending' });

    // Show all staff members, including Super Admins
    // Note: Previously filtered out the server admin, but now showing all for better visibility
    const filteredUsers = users;

    const staff = filteredUsers.map(user => ({
      ...user.toObject(),
      status: 'Active'
    }));

    const pendingInvitations = invitations.map(invitation => ({
      _id: invitation._id,
      email: invitation.email,
      role: invitation.role,
      createdAt: invitation.createdAt,
      status: 'Pending Invitation'
    }));

    const allStaff = [...staff, ...pendingInvitations];

    res.json(allStaff);
  } catch (error) {
    console.error('Error fetching staff:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Email transporter moved to EmailTemplateService

router.post('/invite', authRateLimit, async (req: Request, res: Response) => {
  // Check permissions
  const { hasPermission } = await import('../middleware/permission-middleware');
  const canManageStaff = await hasPermission(req, 'admin.staff.manage');
  
  if (!canManageStaff) {
    return res.status(403).json({ 
      message: 'Forbidden: You do not have the required permissions.',
      required: ['admin.staff.manage']
    });
  }

  const { email, role } = req.body;
  const invitingUser = req.currentUser!;

  // Check if inviting user can invite users with this role level
  // Users can only invite users with roles that have equal or fewer permissions than themselves
  try {
    const { getUserPermissions } = await import('../middleware/permission-middleware');
    const inviterPermissions = await getUserPermissions(req, invitingUser.role);
    
    // Get target role permissions to compare
    const targetRolePermissions = await getUserPermissions(req, role);
    
    // Check if inviter has more permissions than target role
    const hasMorePermissions = targetRolePermissions.every(perm => inviterPermissions.includes(perm));
    
    if (!hasMorePermissions) {
      return res.status(403).json({ message: 'Cannot invite users with higher permission levels than your own.' });
    }
  } catch (error) {
    console.error('Error checking invite permissions:', error);
    return res.status(500).json({ message: 'Permission check failed' });
  }

  // Check if the email is the admin email
  if (req.modlServer?.adminEmail && email.toLowerCase() === req.modlServer.adminEmail.toLowerCase()) {
    return res.status(409).json({ message: 'Cannot send invitation to the admin email address.' });
  }

  try {
    const Staff = req.serverDbConnection!.model<IStaff>('Staff');
    const existingUser = await Staff.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'Email is already associated with an existing user.' });
    }

    const InvitationModel = req.serverDbConnection!.model('Invitation');
    const existingInvitation = await InvitationModel.findOne({ email, status: 'pending' });
    if (existingInvitation) {
      return res.status(409).json({ message: 'An invitation for this email is already pending.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const newInvitation = new InvitationModel({
      email,
      role,
      token,
      expiresAt,
    });

    await newInvitation.save();

    const appDomain = process.env.DOMAIN || "modl.gg";
    const invitationLink = `https://${req.modlServer?.customDomain}.${appDomain}/accept-invitation?token=${token}`;
    
    // Get server display name from settings
    const generalSettings = await getSettingsValue(req.serverDbConnection!, 'general');
    const serverDisplayName = generalSettings?.serverDisplayName || 'modl';
    
    const emailService = new EmailTemplateService();
    await emailService.sendStaffInviteEmail({
      to: email,
      subject: `You have been invited to join the ${serverDisplayName} team!`,
      serverDisplayName: serverDisplayName,
      serverName: req.serverName,
      invitationLink: invitationLink,
      role: role
    });

    res.status(201).json({ message: 'Invitation sent successfully.' });
  } catch (error) {
    console.error('Error inviting staff:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/invitations/:id/resend', authRateLimit, async (req: Request, res: Response) => {
  // Check permissions
  const { hasPermission } = await import('../middleware/permission-middleware');
  const canManageStaff = await hasPermission(req, 'admin.staff.manage');
  
  if (!canManageStaff) {
    return res.status(403).json({ 
      message: 'Forbidden: You do not have the required permissions.',
      required: ['admin.staff.manage']
    });
  }
      try {
        const db = req.serverDbConnection!;
        const InvitationModel = db.model('Invitation');
        const invitation = await InvitationModel.findById(req.params.id);

        if (!invitation) {
          return res.status(404).send('Invitation not found');
        }

        // Generate new token and expiry
        invitation.token = crypto.randomBytes(32).toString('hex');
        invitation.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        await invitation.save();

        // Resend email logic
        const appDomain = process.env.DOMAIN || 'modl.gg';
        const invitationLink = `https://${req.modlServer?.customDomain}.${appDomain}/accept-invitation?token=${invitation.token}`;
        
        // Get server display name from settings
        const generalSettings = await getSettingsValue(req.serverDbConnection!, 'general');
        const serverDisplayName = generalSettings?.serverDisplayName || 'modl';
        
        const emailService = new EmailTemplateService();
        await emailService.sendStaffInviteEmail({
          to: invitation.email,
          subject: `You have been invited to join the ${serverDisplayName} team!`,
          serverDisplayName: serverDisplayName,
          serverName: req.serverName,
          invitationLink: invitationLink,
          role: invitation.role
        });

        res.status(200).send('Invitation resent successfully');
      } catch (error) {
        console.error('Error resending invitation:', error);
        res.status(500).send('Failed to resend invitation');
      }
    });

router.delete('/:id', async (req: Request, res: Response) => {
  // Check permissions
  const { hasPermission } = await import('../middleware/permission-middleware');
  const canManageStaff = await hasPermission(req, 'admin.staff.manage');
  
  if (!canManageStaff) {
    return res.status(403).json({ 
      message: 'Forbidden: You do not have the required permissions.',
      required: ['admin.staff.manage']
    });
  }
    const { id } = req.params;
    const removerUser = req.currentUser!;

    try {
        const InvitationModel = req.serverDbConnection!.model('Invitation');
        const invitationResult = await InvitationModel.deleteOne({ _id: id });

        if (invitationResult.deletedCount > 0) {
            return res.status(200).json({ message: 'Invitation cancelled successfully.' });
        }

        const Staff = req.serverDbConnection!.model<IStaff>('Staff');
        const userToRemove = await Staff.findById(id);

        if (!userToRemove) {
            return res.status(404).json({ message: 'User or invitation not found.' });
        }

        // Check if remover has permission to remove this user based on permission levels
        try {
            const { getUserPermissions } = await import('../middleware/permission-middleware');
            const removerPermissions = await getUserPermissions(req, removerUser.role);
            const targetPermissions = await getUserPermissions(req, userToRemove.role);
            
            // Can only remove users with equal or fewer permissions
            const canRemove = targetPermissions.every(perm => removerPermissions.includes(perm));
            
            if (!canRemove) {
                return res.status(403).json({ message: 'Cannot remove users with higher permission levels than your own.' });
            }
        } catch (error) {
            console.error('Error checking removal permissions:', error);
            return res.status(500).json({ message: 'Permission check failed' });
        }

        // Prevent removing yourself
        if (removerUser.userId === id) {
            return res.status(400).json({ message: 'You cannot remove yourself.' });
        }

        // Additional protection: Prevent removing the server admin (Super Admin with admin email)
        const adminEmail = req.modlServer?.adminEmail?.toLowerCase();
        if (userToRemove.role === 'Super Admin' && adminEmail && userToRemove.email.toLowerCase() === adminEmail) {
            return res.status(403).json({ message: 'Cannot remove the server administrator.' });
        }

        await Staff.findByIdAndDelete(id);

        // Invalidate sessions for the removed user
        const sessionStore = req.sessionStore;
        sessionStore.all((err: any, sessions: { [x: string]: any; }) => {
            if (err) {
                console.error('Error fetching sessions:', err);
                return;
            }
            Object.keys(sessions).forEach(sid => {
                if (sessions[sid].userId === id) {
                    sessionStore.destroy(sid, (err: any) => {
                        if (err) {
                            console.error(`Error destroying session ${sid}:`, err);
                        }
                    });
                }
            });
        });

        res.status(200).json({ message: 'User removed successfully.' });
    } catch (error) {
        console.error('Error removing staff:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


router.get('/:username', isAuthenticated, async (req: Request<{ username: string }>, res: Response) => {
  // Check permissions
  const { hasPermission } = await import('../middleware/permission-middleware');
  const canManageStaff = await hasPermission(req, 'admin.staff.manage');
  
  if (!canManageStaff) {
    return res.status(403).json({ 
      message: 'Forbidden: You do not have the required permissions.',
      required: ['admin.staff.manage']
    });
  }
  try {
    const Staff = req.serverDbConnection!.model<IStaff>('Staff');
    const staffMember = await Staff.findOne({ username: req.params.username })
      .select('-twoFaSecret -passkeys'); // Updated to hide passkeys array
    
    if (!staffMember) {
      return res.status(404).json({ error: 'Staff member not found' });
    }
    
    res.json(staffMember);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

interface CreateStaffBody {
  email: string;
  username: string;
  role?: 'Super Admin' | 'Admin' | 'Moderator' | 'Helper';
}

router.post('/', isAuthenticated, async (req: Request<{}, {}, CreateStaffBody>, res: Response) => {
  // Check permissions
  const { hasPermission } = await import('../middleware/permission-middleware');
  const canManageStaff = await hasPermission(req, 'admin.staff.manage');
  
  if (!canManageStaff) {
    return res.status(403).json({ 
      message: 'Forbidden: You do not have the required permissions.',
      required: ['admin.staff.manage']
    });
  }
  try {
    const Staff = req.serverDbConnection!.model<IStaff>('Staff');
    const { email, username, role } = req.body;
    
    const existingStaff = await Staff.findOne({ 
      $or: [{ email }, { username }] 
    });
    
    if (existingStaff) {
      return res.status(409).json({ error: 'Staff member with this email or username already exists' });
    }
    
    const twoFaSecret = crypto.randomBytes(10).toString('hex');    
    // Validate role exists or use a default
    let finalRole = role;
    if (!finalRole) {
      // Try to find a default low-privilege role, fallback to 'Helper' for backward compatibility
      try {
        const { getStaffRoleModel } = await import('../utils/schema-utils');
        const StaffRoles = getStaffRoleModel(req.serverDbConnection!);
        const lowPrivRole = await StaffRoles.findOne({ permissions: { $size: 2 } }) // Find role with minimal permissions
          .sort({ permissions: 1 }); // Sort by permission count ascending
        finalRole = lowPrivRole?.name || 'Helper';
      } catch (error) {
        finalRole = 'Helper'; // Fallback for backward compatibility
      }
    } else {
      // Validate that the specified role exists
      try {
        const { getUserPermissions } = await import('../middleware/permission-middleware');
        await getUserPermissions(req, finalRole);
      } catch (error) {
        return res.status(400).json({ error: 'Specified role does not exist' });
      }
    }

    const newStaff = new Staff({
      email,
      username,
      role: finalRole,
      twoFaSecret
    });
    
    await newStaff.save();
    
    const safeStaff = newStaff.toObject() as Partial<IStaff>;    delete safeStaff.twoFaSecret;
    
    res.status(201).json(safeStaff);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

interface UpdateStaffBody {
  email?: string;
  role?: 'Super Admin' | 'Admin' | 'Moderator' | 'Helper';
}

interface AssignPlayerBody {
  minecraftUuid?: string;
  minecraftUsername?: string;
}

// Route to update general staff information
router.patch('/:username', async (req: Request<{ username: string }, {}, UpdateStaffBody>, res: Response) => {
  try {
    const Staff = req.serverDbConnection!.model<IStaff>('Staff');
    const { email, role } = req.body;
    
    const staffMember = await Staff.findOne({ username: req.params.username });
    if (!staffMember) {
      return res.status(404).json({ error: 'Staff member not found' });
    }
    
    // The isAuthenticated middleware now handles the primary authentication check.
    // Authorization logic below will use req.session data.
    // Ensure req.session.username and req.session.admin are available from the session.

    let changesMade = false;

    if (email !== undefined && email !== staffMember.email) {
      if (req.currentUser!.username !== staffMember.username) {
        return res.status(403).json({ error: 'Forbidden: You can only change your own email address.' });
      }
      const existingStaffWithNewEmail = await Staff.findOne({ email: email, _id: { $ne: staffMember._id } });
      if (existingStaffWithNewEmail) {
        return res.status(409).json({ error: 'Email address already in use by another account.' });
      }      staffMember.email = email;
      changesMade = true;
    }

    if (role !== undefined && role !== staffMember.role) {
      if (req.currentUser!.role !== 'Super Admin') {
        return res.status(403).json({ error: 'Forbidden: Only a Super Admin can change roles.' });
      }
      staffMember.role = role;
      changesMade = true;
    }

    if (changesMade) {
      await staffMember.save();
    }
    
    const safeStaff = staffMember.toObject() as Partial<IStaff>;    delete safeStaff.twoFaSecret;
    // passkeys array is already excluded by the select statement or not typically returned in this context
    // If it were, individual fields would be: delete safeStaff.passkeys;
    
    res.json(safeStaff);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

interface AddPasskeyBody {
  credentialId: string;
  publicKey: string;
  aaguid: string;
}

// Route to change a staff member's role
router.patch('/:id/role', async (req: Request<{ id: string }, {}, { role: IStaff['role'] }>, res: Response) => {
  // Check permissions
  const { hasPermission } = await import('../middleware/permission-middleware');
  const canManageStaff = await hasPermission(req, 'admin.staff.manage');
  
  if (!canManageStaff) {
    return res.status(403).json({ 
      message: 'Forbidden: You do not have the required permissions.',
      required: ['admin.staff.manage']
    });
  }
  const { id } = req.params;
  const { role: newRole } = req.body;
  const performingUser = req.currentUser!;

  if (!newRole || typeof newRole !== 'string') {
    return res.status(400).json({ message: 'Invalid role specified.' });
  }

  try {
    // Validate that the new role exists (either in defaults or custom roles)
    const { getUserPermissions } = await import('../middleware/permission-middleware');
    try {
      await getUserPermissions(req, newRole);
    } catch (error) {
      return res.status(400).json({ message: 'Specified role does not exist.' });
    }

    const Staff = req.serverDbConnection!.model<IStaff>('Staff');
    const staffToUpdate = await Staff.findById(id);

    if (!staffToUpdate) {
      return res.status(404).json({ message: 'Staff member not found.' });
    }

    // Additional protection: Prevent changing role of the server admin
    const adminEmail = req.modlServer?.adminEmail?.toLowerCase();
    if (adminEmail && staffToUpdate.email.toLowerCase() === adminEmail) {
      return res.status(403).json({ message: 'Cannot change the role of the server administrator.' });
    }

    // Role hierarchy validation (matches client-side hierarchy)
    const getRoleRank = (role: string): number => {
      const roleHierarchy: Record<string, number> = {
        'Helper': 1,
        'Moderator': 2,
        'Admin': 3,
        'Super Admin': 4
      };
      return roleHierarchy[role] || 0;
    };

    // Cannot change your own role
    if (staffToUpdate._id.toString() === performingUser.userId) {
      return res.status(403).json({ message: 'You cannot change your own role.' });
    }

    // Check role hierarchy permissions
    const performerRank = getRoleRank(performingUser.role);
    const currentTargetRank = getRoleRank(staffToUpdate.role);
    const newTargetRank = getRoleRank(newRole);

    // Can only change roles if your rank is higher than both current and new target roles
    if (performerRank <= currentTargetRank) {
      return res.status(403).json({ message: 'Cannot modify users with the same or higher role level than your own.' });
    }

    if (performerRank <= newTargetRank) {
      return res.status(403).json({ message: 'Cannot assign roles with the same or higher level than your own.' });
    }

    if (staffToUpdate.role === newRole) {
      return res.status(200).json({ message: 'Role is already set to the specified value.', staffMember: staffToUpdate });
    }

    staffToUpdate.role = newRole;
    await staffToUpdate.save();

    // Invalidate sessions for the user if their role changed, forcing re-login for new permissions
    // This is important if session-based permissions are granular.
    // For simplicity, we might skip direct session invalidation here if role changes are infrequent
    // or if a brief period of old permissions is acceptable until next login.
    // However, for security critical role changes, session invalidation is recommended.
    // Example:
    // const sessionStore = req.sessionStore;
    // sessionStore.all((err: any, sessions: { [x: string]: any; }) => {
    //   if (err) { console.error('Error fetching sessions for role change:', err); return; }
    //   Object.keys(sessions).forEach(sid => {
    //     if (sessions[sid].userId === id) {
    //       sessionStore.destroy(sid, (destroyErr: any) => {
    //         if (destroyErr) { console.error(`Error destroying session ${sid} for role change:`, destroyErr); }
    //       });
    //     }
    //   });
    // });


    res.status(200).json({ message: 'Role updated successfully.', staffMember: staffToUpdate });

  } catch (error) {
    console.error('Error changing staff role:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Route to assign/unassign Minecraft player to staff member
router.patch('/:username/minecraft-player', async (req: Request<{ username: string }, {}, AssignPlayerBody>, res: Response) => {
  // Check permissions
  const { hasPermission } = await import('../middleware/permission-middleware');
  const canManageStaff = await hasPermission(req, 'admin.staff.manage');
  
  if (!canManageStaff) {
    return res.status(403).json({ 
      message: 'Forbidden: You do not have the required permissions.',
      required: ['admin.staff.manage']
    });
  }
  try {
    const Staff = req.serverDbConnection!.model<IStaff>('Staff');
    const Player = req.serverDbConnection!.model('Player');
    const { minecraftUuid, minecraftUsername } = req.body;
    
    const staffMember = await Staff.findOne({ username: req.params.username });
    if (!staffMember) {
      return res.status(404).json({ error: 'Staff member not found' });
    }

    // If clearing assignment
    if (!minecraftUuid && !minecraftUsername) {
      staffMember.assignedMinecraftUuid = undefined;
      staffMember.assignedMinecraftUsername = undefined;
      await staffMember.save();
      
      return res.json({ 
        message: 'Minecraft player assignment cleared successfully',
        staffMember: {
          ...staffMember.toObject(),
          assignedMinecraftUuid: null,
          assignedMinecraftUsername: null
        }
      });
    }

    // Validate player exists
    let playerQuery: any = {};
    if (minecraftUuid) {
      playerQuery.minecraftUuid = minecraftUuid;
    } else if (minecraftUsername) {
      playerQuery['usernames.username'] = { $regex: new RegExp(`^${minecraftUsername}$`, 'i') };
    } else {
      return res.status(400).json({ error: 'Either minecraftUuid or minecraftUsername must be provided' });
    }

    const player = await Player.findOne(playerQuery);
    if (!player) {
      return res.status(404).json({ error: 'Minecraft player not found' });
    }

    // Check if player is already assigned to another staff member
    const existingAssignment = await Staff.findOne({ 
      assignedMinecraftUuid: player.minecraftUuid,
      _id: { $ne: staffMember._id }
    });
    
    if (existingAssignment) {
      return res.status(409).json({ 
        error: 'This Minecraft player is already assigned to another staff member',
        assignedTo: existingAssignment.username
      });
    }

    // Get current username
    const currentUsername = player.usernames && player.usernames.length > 0
      ? player.usernames[player.usernames.length - 1].username
      : 'Unknown';

    // Assign player to staff member
    staffMember.assignedMinecraftUuid = player.minecraftUuid;
    staffMember.assignedMinecraftUsername = currentUsername;
    await staffMember.save();

    res.json({ 
      message: 'Minecraft player assigned successfully',
      staffMember: {
        ...staffMember.toObject(),
        assignedMinecraftUuid: player.minecraftUuid,
        assignedMinecraftUsername: currentUsername
      }
    });
  } catch (error) {
    console.error('Error assigning Minecraft player to staff:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Route to get available Minecraft players for assignment
router.get('/available-players', async (req: Request, res: Response) => {
  // Check permissions
  const { hasPermission } = await import('../middleware/permission-middleware');
  const canManageStaff = await hasPermission(req, 'admin.staff.manage');
  
  if (!canManageStaff) {
    return res.status(403).json({ 
      message: 'Forbidden: You do not have the required permissions.',
      required: ['admin.staff.manage']
    });
  }
  try {
    const Player = req.serverDbConnection!.model('Player');
    const Staff = req.serverDbConnection!.model<IStaff>('Staff');
    
    // Get all staff assignments
    const assignedUuids = await Staff.find({ 
      assignedMinecraftUuid: { $exists: true, $nin: [null, ''] } 
    }).distinct('assignedMinecraftUuid');

    // Get players not assigned to staff, sorted by most recent username
    const availablePlayers = await Player.find({
      minecraftUuid: { $nin: assignedUuids }
    })
    .select('minecraftUuid usernames')
    .sort({ 'usernames.date': -1 })
    .limit(100)
    .lean();

    const formattedPlayers = availablePlayers.map(player => ({
      uuid: player.minecraftUuid,
      username: player.usernames && player.usernames.length > 0
        ? player.usernames[player.usernames.length - 1].username
        : 'Unknown'
    }));

    res.json({ players: formattedPlayers });
  } catch (error) {
    console.error('Error fetching available players:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
 
// These routes have been moved to before the isAuthenticated middleware
 
export default router;
