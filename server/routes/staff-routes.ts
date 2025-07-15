import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import mongoose, { Document as MongooseDocument, Connection, Model } from 'mongoose';
import { isAuthenticated } from '../middleware/auth-middleware';
import { checkRole } from '../middleware/role-middleware';
import { IPasskey, IStaff, IModlServer, Invitation } from 'modl-shared-web';
import nodemailer from 'nodemailer';
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

router.get('/', checkRole(['Super Admin', 'Admin']), async (req: Request, res: Response) => {
  try {
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

router.post('/invite', authRateLimit, checkRole(['Super Admin', 'Admin']), async (req: Request, res: Response) => {
  const { email, role } = req.body;
  const invitingUser = req.currentUser!;

  if (invitingUser.role === 'Admin' && role === 'Admin') {
    return res.status(403).json({ message: 'Admins cannot invite other Admins.' });
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

router.post('/invitations/:id/resend', authRateLimit, checkRole(['Super Admin', 'Admin']), async (req: Request, res: Response) => {
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

router.delete('/:id', checkRole(['Super Admin', 'Admin']), async (req: Request, res: Response) => {
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

        // Prevent Admins from removing other Admins or Super Admins
        if (removerUser.role === 'Admin' && (userToRemove.role === 'Admin' || userToRemove.role === 'Super Admin')) {
            return res.status(403).json({ message: 'Admins can only remove Moderators and Helpers.' });
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


router.get('/:username', isAuthenticated, checkRole(['Super Admin', 'Admin']), async (req: Request<{ username: string }>, res: Response) => {
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

router.post('/', isAuthenticated, checkRole(['Super Admin', 'Admin']), async (req: Request<{}, {}, CreateStaffBody>, res: Response) => {
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
    const newStaff = new Staff({
      email,
      username,
      role: role || 'Helper',
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
router.patch('/:id/role', checkRole(['Super Admin', 'Admin']), async (req: Request<{ id: string }, {}, { role: IStaff['role'] }>, res: Response) => {
  const { id } = req.params;
  const { role: newRole } = req.body;
  const performingUser = req.currentUser!;

  if (!newRole || !['Super Admin', 'Admin', 'Moderator', 'Helper'].includes(newRole)) {
    return res.status(400).json({ message: 'Invalid role specified.' });
  }

  try {
    const Staff = req.serverDbConnection!.model<IStaff>('Staff');
    const staffToUpdate = await Staff.findById(id);

    if (!staffToUpdate) {
      return res.status(404).json({ message: 'Staff member not found.' });
    }

    // Additional protection: Prevent changing role of the server admin (Super Admin with admin email)
    const adminEmail = req.modlServer?.adminEmail?.toLowerCase();
    if (staffToUpdate.role === 'Super Admin' && adminEmail && staffToUpdate.email.toLowerCase() === adminEmail) {
      return res.status(403).json({ message: 'Cannot change the role of the server administrator.' });
    }

    // Super Admin can change any role to any other role.
    if (performingUser.role === 'Super Admin') {
      // No restrictions for Super Admin (except server admin protection above)
    } else if (performingUser.role === 'Admin') {
      // Admins cannot change their own role.
      if (staffToUpdate._id.toString() === performingUser.userId) {
        return res.status(403).json({ message: 'Admins cannot change their own role.' });
      }
      // Admins cannot change anyone to Admin or Super Admin.
      if (newRole === 'Admin' || newRole === 'Super Admin') {
        return res.status(403).json({ message: 'Admins cannot assign Admin or Super Admin roles.' });
      }
      // Admins cannot change an existing Admin or Super Admin's role.
      if (staffToUpdate.role === 'Admin' || staffToUpdate.role === 'Super Admin') {
        return res.status(403).json({ message: 'Admins cannot change the role of other Admins or Super Admins.' });
      }
    } else {
      // Other roles (Moderator, Helper) cannot change roles. This should be caught by checkRole, but as a safeguard:
      return res.status(403).json({ message: 'Forbidden: You do not have permission to change roles.' });
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
router.patch('/:username/minecraft-player', checkRole(['Super Admin']), async (req: Request<{ username: string }, {}, AssignPlayerBody>, res: Response) => {
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
router.get('/available-players', checkRole(['Super Admin']), async (req: Request, res: Response) => {
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
