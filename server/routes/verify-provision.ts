import { Express, Request, Response } from 'express';
import mongoose, { Connection, Document, Model } from 'mongoose'; // Import mongoose for Types.ObjectId
import { randomBytes } from 'crypto';
import { getModlServersModel, connectToServerDb, connectToGlobalModlDb } from '../db/connectionManager';
import { 
  PlayerSchema, 
  StaffSchema, 
  TicketSchema, 
  LogSchema, 
  SettingsSchema,
  ModlServerSchema
} from '@modl-gg/shared-web';
import { seedDefaultHomepageCards } from '../db/seed-data';
import { strictRateLimit } from '../middleware/rate-limiter';
import { createDefaultSettings, addDefaultPunishmentTypes } from './settings-routes';
import { createDefaultRoles } from './role-routes';

interface IModlServer extends Document {
  serverName: string;
  customDomain: string;
  adminEmail: string;
  emailVerificationToken?: string | undefined;
  emailVerified: boolean;
  provisioningSignInToken?: string;
  provisioningSignInTokenExpiresAt?: Date;
  provisioningStatus: 'pending' | 'in-progress' | 'completed' | 'failed';
  databaseName?: string;
  // Mongoose Document provides _id. Explicitly typed here.
  _id: mongoose.Types.ObjectId; 
  // Mongoose Document provides save method.
  // save: () => Promise<this & Document<any, any, any>>; // More precise type for save if needed
  // Add any other fields from ModlServerSchema that are directly accessed
  provisioningNotes?: string; 
  updatedAt?: Date; // from schema
  createdAt?: Date; // from schema
}

export async function provisionNewServerInstance(
  dbConnection: Connection,
  serverName: string,
  globalConnection: Connection, // Added globalConnection parameter
  serverConfigId: string // Added serverConfigId to update the document
) {
  // Create default settings with core Administrative punishment types
  await createDefaultSettings(dbConnection, serverName);
  
  // Add default Social and Gameplay punishment types
  await addDefaultPunishmentTypes(dbConnection);

  // Create default staff roles
  await createDefaultRoles(dbConnection);
  
  // Small delay to ensure roles are fully created
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Create superadmin user in staffs collection
  await createSuperAdminUser(dbConnection, globalConnection, serverConfigId);

  // Generate default ticket forms
  await createDefaultTicketForms(dbConnection);

  // Seed default homepage cards
  await seedDefaultHomepageCards(dbConnection);
    

  const ModlServerModel = globalConnection.models.ModlServer || globalConnection.model<IModlServer>('ModlServer', ModlServerSchema as any);
  await ModlServerModel.findByIdAndUpdate(serverConfigId, {
    provisioningStatus: 'completed',
    databaseName: dbConnection.name, // Store the actual database name used
    updatedAt: new Date()
  });
}

export function setupVerificationAndProvisioningRoutes(app: Express) {
  app.get('/verify-email', strictRateLimit, async (req: Request, res: Response) => {
    const token = req.query.token as string;

    if (!token) {
      return res.status(400).json({ message: 'Verification token is missing.' });
    }

    let globalConnection: Connection;
    try {
      globalConnection = await connectToGlobalModlDb();
      const ModlServerModel = globalConnection.models.ModlServer || globalConnection.model<IModlServer>('ModlServer', ModlServerSchema as any);
      const server = await ModlServerModel.findOne({ emailVerificationToken: token });

      if (!server) {
        return res.status(404).json({ message: 'Invalid or expired verification token.' });
      }

      // Case 1: Already verified
      if (server.emailVerified) {
        if (server.provisioningStatus === 'completed') {
          // Verified and provisioned: redirect to their panel's root.
          return res.redirect(`http://${server.customDomain}.${process.env.DOMAIN || 'modl.gg'}/?message=email_already_verified_and_provisioned&toastType=info`);
        } else {
          // Verified but provisioning not complete: redirect to provisioning page.
          return res.redirect(`/provisioning-in-progress?server=${server.serverName}&message=email_already_verified_provisioning_pending&toastType=info`);
        }
      }

      // Case 2: Not yet verified - proceed with verification
      server.emailVerified = true;
      server.emailVerificationToken = undefined; // Clear the email verification token

      // Generate and store the provisioning sign-in token
      const signInToken = randomBytes(32).toString('hex');
      const signInTokenExpiry = new Date(Date.now() + 30 * 60 * 1000); // Token valid for 30 minutes

      server.provisioningSignInToken = signInToken;
      server.provisioningSignInTokenExpiresAt = signInTokenExpiry;

      // Set provisioning to pending if it's not already started or completed.
      if (server.provisioningStatus !== 'completed' && server.provisioningStatus !== 'in-progress') {
        server.provisioningStatus = 'pending';
      }
      
      await server.save();
      
      // After successful verification and status update, redirect to the provisioning page with the sign-in token.
      return res.redirect(`/provisioning-in-progress?server=${server.serverName}&signInToken=${signInToken}&status=verification_successful&toastType=success`);

    } catch (error: any) {
      console.error(`Error during email verification for token ${token}:`, error);
      return res.status(500).json({ message: 'An error occurred during email verification.', details: error.message });
    }
  });

  app.get('/api/provisioning/status/:serverName', async (req: Request, res: Response) => {
    const { serverName } = req.params;
    const clientSignInToken = req.query.signInToken as string; // Get token from query

    if (!serverName) {
      return res.status(400).json({ error: 'Server name is missing.' });
    }
    
    let globalConnection: Connection;
    try {
      globalConnection = await connectToGlobalModlDb();
      const ModlServerModel = globalConnection.models.ModlServer || globalConnection.model<IModlServer>('ModlServer', ModlServerSchema as any);
      const server = await ModlServerModel.findOne({ serverName: serverName });

      if (!server) {
        return res.status(404).json({ error: `Server '${serverName}' not found.` });
      }

      if (!server.emailVerified) {
        // This state should ideally not be hit if /verify-email redirects correctly.
        return res.status(403).json({ error: 'Email not verified for this server.', status: 'email_unverified' });
      }

      if (server.provisioningStatus === 'completed') {
        // Server is provisioned and ready
        const message = `Server '${serverName}' is provisioned and ready. You will be redirected shortly...`;

        // Check if they provided a valid sign-in token for auto-login
        if (clientSignInToken && server.provisioningSignInToken && server.provisioningSignInTokenExpiresAt) {
          // Validate the token
          const isTokenValid = clientSignInToken === server.provisioningSignInToken;
          const isTokenNotExpired = new Date() < server.provisioningSignInTokenExpiresAt;

          if (isTokenValid && isTokenNotExpired) {
            // Valid token - create admin session for auto-login
            try {
              // Set up session data for the admin user
              (req.session as any).userId = server.adminEmail;
              (req.session as any).email = server.adminEmail;
              (req.session as any).username = server.adminEmail.split('@')[0] || 'admin';
              (req.session as any).role = 'Super Admin';
              (req.session as any).plan = 'premium';
              (req.session as any).subscription_status = 'active';

              await req.session.save();

              // Clear the provisioning sign-in token to prevent reuse
              server.provisioningSignInToken = undefined;
              server.provisioningSignInTokenExpiresAt = undefined;
              await server.save();

              // Return success with user data for auto-login
              return res.json({
                status: 'completed',
                message: message,
                user: {
                  id: server.adminEmail,
                  email: server.adminEmail,
                  username: server.adminEmail.split('@')[0] || 'admin',
                  role: 'Super Admin'
                }
              });
            } catch (sessionError: any) {
              console.error(`[verify-provision] Error creating session for ${serverName}:`, sessionError);
              // If session creation fails, still clear the token and proceed without auto-login
            }
          }
        }

        // Clear the provisioning sign-in token to prevent any potential misuse
        if (server.provisioningSignInToken || server.provisioningSignInTokenExpiresAt) {
          server.provisioningSignInToken = undefined;
          server.provisioningSignInTokenExpiresAt = undefined;
          try {
            await server.save();
          } catch (saveError: any) {
            console.error(`[verify-provision] Error clearing provisioningSignInToken for ${serverName}:`, saveError);
            // Non-critical for the response, but log it.
          }
        }
        
        return res.json({
          status: 'completed',
          message: message,
          user: null // No auto-login - users must authenticate normally
        });
      }

      if (server.provisioningStatus === 'in-progress') {
        return res.json({ status: 'in-progress', message: 'Provisioning is currently in progress. Please wait.' });
      }

      // If status is 'pending', and email is verified, trigger provisioning.
      if (server.provisioningStatus === 'pending') {
        server.provisioningStatus = 'in-progress'; // Optimistically update
        server.updatedAt = new Date();
        await server.save();

        // Asynchronously start the provisioning process.
        // No await here for a quick response; client polls.
        connectToServerDb(server.customDomain)
          .then(async (serverDbConnection) => {
            if (!server._id) { // Should always exist for a found document
                console.error(`Critical: Server _id is undefined for ${server.serverName} after findOne. Cannot provision.`);
                const freshServer = await ModlServerModel.findById(server._id); // Re-fetch to be safe
                if (freshServer) {
                    freshServer.provisioningStatus = 'failed';
                    freshServer.provisioningNotes = 'Failed to start provisioning due to missing _id reference internally.';
                    await freshServer.save();
                }
                return;
            }
            await provisionNewServerInstance(serverDbConnection, server.customDomain, globalConnection, server._id.toString());
          })
          .catch(async (err) => {
            console.error(`Error connecting to server DB or during provisioning for ${server.serverName}:`, err);
            // Re-fetch to avoid versioning issues if server doc was modified elsewhere
            const freshServer = await ModlServerModel.findById(server._id);
            if (freshServer) {
                freshServer.provisioningStatus = 'failed';
                freshServer.provisioningNotes = err.message || 'An unexpected error occurred during provisioning initiation.';
                freshServer.updatedAt = new Date();
                await freshServer.save();
            }
          });

        return res.json({ status: 'in-progress', message: 'Provisioning started. Please refresh in a few moments.' });
      }
      
      // Handle 'failed' or any other unexpected status
      return res.status(200).json({ // Return 200 so client can parse status
          status: server.provisioningStatus || 'unknown', 
          message: server.provisioningNotes || `Server is in an unexpected state: ${server.provisioningStatus}. Please contact support.` 
      });

    } catch (error: any) {
      console.error(`Error in /api/provisioning/status/${serverName}:`, error);
      return res.status(500).json({ error: 'An internal error occurred while checking provisioning status.', details: error.message });
    }
  });
}

async function createSuperAdminUser(dbConnection: Connection, globalConnection: Connection, serverConfigId: string) {
  try {
    // Get the server config to get admin email
    const ModlServerModel = globalConnection.models.ModlServer || globalConnection.model<IModlServer>('ModlServer', ModlServerSchema as any);
    const serverConfig = await ModlServerModel.findById(serverConfigId);
    
    if (!serverConfig) {
      throw new Error('Server configuration not found');
    }

    // Create superadmin user in staffs collection
    const StaffModel = dbConnection.models.Staff || dbConnection.model('Staff', StaffSchema);
    
    // Check if superadmin already exists
    const existingSuperAdmin = await StaffModel.findOne({ username: 'Dr. Doofenshmirtz' });
    if (existingSuperAdmin) {
      console.log('[Provisioning] Superadmin user already exists, skipping creation');
      return;
    }

    const superAdmin = new StaffModel({
      username: 'Dr. Doofenshmirtz',
      email: serverConfig.adminEmail,
      role: 'Super Admin'
    });

    await superAdmin.save();
    
    console.log(`[Provisioning] Created superadmin user with email: ${serverConfig.adminEmail}`);
    console.log(`[Provisioning] Admin can login using email verification codes sent to this address`);
    
  } catch (error) {
    console.error('[Provisioning] Error creating superadmin user:', error);
    throw error;
  }
}

async function createDefaultTicketForms(dbConnection: Connection) {
  try {
    // Get the Settings model (ticket forms are stored in Settings collection)
    const SettingsModel = dbConnection.models.Settings || dbConnection.model('Settings', new mongoose.Schema({
      type: { type: String, required: true },
      data: { type: mongoose.Schema.Types.Mixed, required: true }
    }));

    // Check if ticket forms already exist
    const existingForms = await SettingsModel.findOne({ type: 'ticketForms' });
    if (existingForms) {
      console.log('[Provisioning] Ticket forms already exist, skipping creation');
      return;
    }

    // Define default ticket forms with comprehensive structure
    const defaultTicketForms = {
      bug: {
        fields: [
          // Contact Information
          {
            id: 'contact_email',
            type: 'text',
            label: 'Email Address',
            description: 'Your email address for updates on this bug report',
            required: true,
            order: 0,
            sectionId: 'basic_info'
          },
          // Basic Information Section
          {
            id: 'bug_title',
            type: 'text',
            label: 'Bug Title',
            description: 'Brief description of the bug',
            required: true,
            order: 1,
            sectionId: 'basic_info'
          },
          {
            id: 'bug_severity',
            type: 'dropdown',
            label: 'Bug Severity',
            description: 'How severe is this bug?',
            required: true,
            options: ['Low', 'Medium', 'High', 'Critical'],
            order: 2,
            sectionId: 'basic_info'
          },
          {
            id: 'bug_category',
            type: 'dropdown',
            label: 'Bug Category',
            description: 'What type of bug is this?',
            required: true,
            options: ['Gameplay', 'UI/Interface', 'Performance', 'Audio', 'Visual', 'Other'],
            order: 3,
            sectionId: 'basic_info'
          },
          // Description Section
          {
            id: 'bug_description',
            type: 'textarea',
            label: 'Detailed Description',
            description: 'Provide a detailed description of the bug you encountered',
            required: true,
            order: 4,
            sectionId: 'description'
          },
          {
            id: 'steps_to_reproduce',
            type: 'textarea',
            label: 'Steps to Reproduce',
            description: 'List the exact steps to reproduce this bug (1. First step, 2. Second step, etc.)',
            required: true,
            order: 5,
            sectionId: 'description'
          },
          {
            id: 'expected_behavior',
            type: 'textarea',
            label: 'Expected Behavior',
            description: 'What did you expect to happen?',
            required: true,
            order: 6,
            sectionId: 'description'
          },
          {
            id: 'actual_behavior',
            type: 'textarea',
            label: 'Actual Behavior',
            description: 'What actually happened instead?',
            required: true,
            order: 7,
            sectionId: 'description'
          }
        ],
        sections: [
          {
            id: 'basic_info',
            title: 'Basic Information',
            description: 'Essential information about the bug',
            order: 0
          },
          {
            id: 'description',
            title: 'Bug Description',
            description: 'Describe the bug in detail',
            order: 1
          }
        ]
      },
      support: {
        fields: [
          // Contact Information
          {
            id: 'contact_email',
            type: 'text',
            label: 'Email Address',
            description: 'Your email address for updates on this support request',
            required: true,
            order: 0,
            sectionId: 'request_info'
          },
          // Request Information Section
          {
            id: 'support_category',
            type: 'dropdown',
            label: 'Support Category',
            description: 'What type of support do you need?',
            required: true,
            options: ['Account Issues', 'Payment/Billing', 'Technical Issues', 'Gameplay Help', 'Appeal Request', 'Other'],
            order: 1,
            sectionId: 'request_info'
          },
          {
            id: 'urgency_level',
            type: 'dropdown',
            label: 'Urgency Level',
            description: 'How urgent is this request?',
            required: true,
            options: ['Low - General inquiry', 'Medium - Affecting gameplay', 'High - Unable to play', 'Critical - Account compromised'],
            order: 2,
            sectionId: 'request_info'
          },
          // Issue Details Section
          {
            id: 'issue_title',
            type: 'text',
            label: 'Issue Summary',
            description: 'Brief summary of your issue or request',
            required: true,
            order: 3,
            sectionId: 'issue_details'
          },
          {
            id: 'issue_description',
            type: 'textarea',
            label: 'Detailed Description',
            description: 'Describe your issue or request in detail',
            required: true,
            order: 4,
            sectionId: 'issue_details'
          },
          {
            id: 'when_occurred',
            type: 'text',
            label: 'When did this occur?',
            description: 'When did you first notice this issue? (date/time if possible)',
            required: false,
            order: 5,
            sectionId: 'issue_details'
          }
        ],
        sections: [
          {
            id: 'request_info',
            title: 'Request Information',
            description: 'Basic information about your support request',
            order: 0
          },
          {
            id: 'issue_details',
            title: 'Issue Details',
            description: 'Detailed information about your issue',
            order: 1
          }
        ]
      },
      application: {
        fields: [
          // Contact Information
          {
            id: 'contact_email',
            type: 'text',
            label: 'Email Address',
            description: 'Your email address for application updates',
            required: true,
            order: 0,
            sectionId: 'contact_info'
          },
          {
            id: 'discord_username',
            type: 'text',
            label: 'Discord Username',
            description: 'Your Discord username (required for staff communication)',
            required: true,
            order: 1,
            sectionId: 'contact_info'
          },
          // Personal Information
          {
            id: 'real_name',
            type: 'text',
            label: 'Real Name',
            description: 'Your real first and last name',
            required: true,
            order: 2,
            sectionId: 'personal_info'
          },
          {
            id: 'age',
            type: 'text',
            label: 'Age',
            description: 'How old are you? (Must be 16+)',
            required: true,
            order: 3,
            sectionId: 'personal_info'
          },
          {
            id: 'timezone',
            type: 'text',
            label: 'Timezone',
            description: 'What timezone are you in? (e.g., EST, PST, GMT)',
            required: true,
            order: 4,
            sectionId: 'personal_info'
          },
          {
            id: 'availability',
            type: 'textarea',
            label: 'Availability',
            description: 'What days and times are you typically available? (include timezone)',
            required: true,
            order: 5,
            sectionId: 'personal_info'
          },
          // Experience Section
          {
            id: 'minecraft_experience',
            type: 'textarea',
            label: 'Minecraft Experience',
            description: 'How long have you been playing Minecraft? Describe your experience with the game.',
            required: true,
            order: 6,
            sectionId: 'experience'
          },
          {
            id: 'server_experience',
            type: 'textarea',
            label: 'Server Experience',
            description: 'How long have you been playing on this server? What do you enjoy most about it?',
            required: true,
            order: 7,
            sectionId: 'experience'
          },
          {
            id: 'previous_staff_experience',
            type: 'textarea',
            label: 'Previous Staff Experience',
            description: 'Describe any previous moderation or staff experience (Minecraft or other platforms)',
            required: false,
            order: 8,
            sectionId: 'experience'
          },
          // Motivation Section
          {
            id: 'why_apply',
            type: 'textarea',
            label: 'Why do you want to be staff?',
            description: 'Explain your motivation for applying and what you hope to contribute',
            required: true,
            order: 9,
            sectionId: 'motivation'
          },
          {
            id: 'qualities',
            type: 'textarea',
            label: 'What qualities make you a good fit?',
            description: 'What personal qualities or skills make you suitable for a staff position?',
            required: true,
            order: 10,
            sectionId: 'motivation'
          }
        ],
        sections: [
          {
            id: 'contact_info',
            title: 'Contact Information',
            description: 'How we can reach you',
            order: 0
          },
          {
            id: 'personal_info',
            title: 'Personal Information',
            description: 'Tell us about yourself',
            order: 1
          },
          {
            id: 'experience',
            title: 'Experience',
            description: 'Your gaming and staff experience',
            order: 2
          },
          {
            id: 'motivation',
            title: 'Motivation & Qualities',
            description: 'Why you want to join our team',
            order: 3
          }
        ]
      }
    };

    // Create the settings document
    const formsDocument = new SettingsModel({
      type: 'ticketForms',
      data: defaultTicketForms
    });

    await formsDocument.save();

    console.log('[Provisioning] Created default ticket forms: bug, support, application');
    
  } catch (error) {
    console.error('[Provisioning] Error creating default ticket forms:', error);
    throw error;
  }
}