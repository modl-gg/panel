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
        const message = `Server '${serverName}' is provisioned and ready.`;

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
      "bug": {
        "fields": [
          {
            "id": "1753243804677",
            "type": "textarea",
            "label": "Bug Description",
            "description": "Describe the bug in full detail",
            "required": true,
            "order": 3,
            "sectionId": "1753243782799"
          },
          {
            "id": "1753243846548",
            "type": "textarea",
            "label": "Environment",
            "description": "Game/server, client version, and any other relevant conditions",
            "required": true,
            "order": 3,
            "sectionId": "1753243782799"
          },
          {
            "id": "1753243865490",
            "type": "textarea",
            "label": "Steps to reproduce",
            "description": "Detailed description on how we can reproduce the bug",
            "required": true,
            "order": 2,
            "sectionId": "1753243782799"
          },
          {
            "id": "1753243883567",
            "type": "textarea",
            "label": "Any other information?",
            "required": false,
            "order": 3,
            "sectionId": "1753243782799"
          },
          {
            "id": "1753243946458",
            "type": "file_upload",
            "label": "Attachments",
            "description": "Upload relevant attachments to help us squash this bug.",
            "required": false,
            "order": 4,
            "sectionId": "1753243782799"
          }
        ],
        "sections": [
          {
            "id": "1753243782799",
            "title": "General",
            "order": 0,
            "hideByDefault": false
          }
        ]
      },
      "support": {
        "fields": [
          {
            "id": "1753243961223",
            "type": "textarea",
            "label": "Description",
            "description": "How can we assist you?",
            "required": true,
            "order": 0,
            "sectionId": "1753243900648"
          },
          {
            "id": "1753243997358",
            "type": "file_upload",
            "label": "Attachments",
            "description": "Upload any relevant attachments.",
            "required": false,
            "order": 1,
            "sectionId": "1753243900648"
          }
        ],
        "sections": [
          {
            "id": "1753243900648",
            "title": "General",
            "order": 0,
            "hideByDefault": false
          }
        ]
      },
      "application": {
        "fields": [
          {
            "id": "1753244506417",
            "type": "textarea",
            "label": "Have you ever been banned or muted on this server? If yes, what have you learned moving forward?",
            "description": "If so, please explain each occurrence.",
            "required": true,
            "order": 0,
            "sectionId": "1753244183109"
          },
          {
            "id": "1753245191475",
            "type": "textarea",
            "label": "Why do you want to be an developer on this server?",
            "required": true,
            "order": 0,
            "sectionId": "1753244282540"
          },
          {
            "id": "1753244313811",
            "type": "text",
            "label": "First Name",
            "required": true,
            "order": 0,
            "sectionId": "1753244011186"
          },
          {
            "id": "1753244551193",
            "type": "textarea",
            "label": "Describe your moderation background and previous experience.",
            "description": "The more detail the better. This doesn't have to be limited to Minecraft servers, as we welcome any previous experience in moderating Discord servers or even other game communities.  Please provide references and proof for your more notable experiences.",
            "required": true,
            "order": 1,
            "sectionId": "1753244183109"
          },
          {
            "id": "1753245262717",
            "type": "textarea",
            "label": "Do you have experience developing for other servers?",
            "required": true,
            "order": 1,
            "sectionId": "1753244282540"
          },
          {
            "id": "1753244038340",
            "type": "text",
            "label": "Discord username",
            "description": "Please use the new username format, starting with an @.",
            "required": true,
            "order": 1,
            "sectionId": "1753244011186"
          },
          {
            "id": "1753245280773",
            "type": "text",
            "label": "Please provide proof of previous work in the form of a GitHub link",
            "required": true,
            "order": 2,
            "sectionId": "1753244282540"
          },
          {
            "id": "1753244070995",
            "type": "text",
            "label": "Age",
            "required": true,
            "order": 2,
            "sectionId": "1753244011186"
          },
          {
            "id": "1753245291714",
            "type": "textarea",
            "label": "Anything else you would like to say?",
            "required": false,
            "order": 3,
            "sectionId": "1753244282540"
          },
          {
            "id": "1753244166086",
            "type": "text",
            "label": "Region & Timezone",
            "description": "Ex: NA, Eastern Time",
            "required": true,
            "order": 3,
            "sectionId": "1753244011186"
          },
          {
            "id": "1753244525756",
            "type": "text",
            "label": "What languages can you speak?",
            "description": "If you speak more than one, please list your level of fluency in each.",
            "required": true,
            "order": 4,
            "sectionId": "1753244011186"
          },
          {
            "id": "1753244114967",
            "type": "checkbox",
            "label": "Do you have access to both a working microphone and recording software?",
            "required": true,
            "order": 5,
            "sectionId": "1753244011186"
          },
          {
            "id": "1753244244863",
            "type": "dropdown",
            "label": "Position",
            "description": "What position are you applying for?",
            "required": true,
            "options": [
              "Moderator",
              "Builder",
              "Developer",
              "Media"
            ],
            "order": 6,
            "sectionId": "1753244011186",
            "optionSectionMapping": {
              "Moderator": "1753244183109",
              "Builder": "1753244277605",
              "Engineer": "1753244282540",
              "Media": "1753244286527",
              "Developer": "1753244282540"
            }
          },
          {
            "id": "1753244585381",
            "type": "textarea",
            "label": "Why do you want to become a moderator on this server?",
            "description": "Again, the more detail on this question the better. Providing us with as much detail as possible will help us understand your motivation and will to become a moderator!",
            "required": true,
            "order": 9,
            "sectionId": "1753244183109"
          },
          {
            "id": "1753244603377",
            "type": "text",
            "label": "How much time do you see yourself committing to the server?",
            "required": true,
            "order": 10,
            "sectionId": "1753244183109"
          },
          {
            "id": "1753244687326",
            "type": "textarea",
            "label": "You are a Moderator with the ability to mute and ban. You are playing on the server with a friend and come across a player who you think is hacking. They kill your friend, but then you kill them. What do you do in this situation?",
            "required": true,
            "order": 11,
            "sectionId": "1753244183109"
          },
          {
            "id": "1753244762984",
            "type": "textarea",
            "label": "You are a Moderator with the ability to mute and ban. You are spectating a player who you believe is hacking, but multiple chat reports come in about a player in another gamemode who is being violently disruptive in chat. Somehow, you are the only moderator online. How do you handle the two situations?",
            "required": true,
            "order": 12,
            "sectionId": "1753244183109"
          },
          {
            "id": "1753244861431",
            "type": "textarea",
            "label": "You are a Moderator with the ability to mute and ban. You see 5+ reports come in accusing the same player of breaking the chat rules. You join the server where the situation is taking place and open the accused player's recent chat history. You see that they were being rude, but haven't actually broken a rule. When you decide that they are not guilty, the same group reports the player again, and sends you multiple private messages calling you a bad moderator for not muting the player. What's the first step in dealing with this situation? Explain how this step will move towards resolving the conflict.",
            "required": true,
            "order": 13,
            "sectionId": "1753244183109"
          },
          {
            "id": "1753244931272",
            "type": "textarea",
            "label": "You are the newest Moderator on the team. While you are spectating a game, you witness a Sr. Moderator mining suspiciously. In a matter of minutes, you get enough evidence that suggests that the Sr. Moderator may likely be x-raying. Suddenly, they head to the surface and do nothing suspicious for the rest of your time spectating them. How do you proceed?",
            "required": true,
            "order": 14,
            "sectionId": "1753244183109"
          },
          {
            "id": "1753245023983",
            "type": "textarea",
            "label": "You are a Moderator with the ability to mute and ban. You notice a well-known streamer/YouTuber closely affiliated with the server is nicked. They message a player words encouraging suicide under their disguised alias. What steps do you take to resolve the situation?",
            "required": true,
            "order": 15,
            "sectionId": "1753244183109"
          },
          {
            "id": "1753245081481",
            "type": "textarea",
            "label": "Do you have experience building for other servers?",
            "required": true,
            "order": 16,
            "sectionId": "1753244277605"
          },
          {
            "id": "1753245137086",
            "type": "textarea",
            "label": "Please provide proof of previous work in link form here (Imgur, YouTube, etc)",
            "required": true,
            "order": 17,
            "sectionId": "1753244277605"
          },
          {
            "id": "1753245154307",
            "type": "textarea",
            "label": "Anything else you would like to say?",
            "required": false,
            "order": 23,
            "sectionId": "1753244277605"
          },
          {
            "id": "1753245348514",
            "type": "text",
            "label": "Have you ever been banned or muted on this server? If yes, what have you learned moving forward?",
            "description": "If so, please explain each occurrence.",
            "required": true,
            "order": 23,
            "sectionId": "1753244286527"
          },
          {
            "id": "1753245358313",
            "type": "text",
            "label": "A link to your YouTube and/or Stream Channel",
            "required": true,
            "order": 24,
            "sectionId": "1753244286527"
          },
          {
            "id": "1753245471763",
            "type": "checkbox",
            "label": "We will email the contact email listed on the channel for proof of ownership, please verify it is accurate and actively monitored.",
            "required": true,
            "order": 25,
            "sectionId": "1753244286527"
          },
          {
            "id": "1753245511672",
            "type": "textarea",
            "label": "Anything else you would like to say?",
            "required": false,
            "order": 26,
            "sectionId": "1753244286527"
          }
        ],
        "sections": [
          {
            "id": "1753244011186",
            "title": "General",
            "order": 0,
            "hideByDefault": false
          },
          {
            "id": "1753244183109",
            "title": "Moderator",
            "order": 1,
            "hideByDefault": true
          },
          {
            "id": "1753244277605",
            "title": "Builder",
            "order": 2,
            "hideByDefault": true
          },
          {
            "id": "1753244282540",
            "title": "Developer",
            "order": 3,
            "hideByDefault": true
          },
          {
            "id": "1753244286527",
            "title": "Media",
            "order": 4,
            "hideByDefault": true
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