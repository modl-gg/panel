import express, { Request, Response, NextFunction } from 'express';
import { Connection, Document as MongooseDocument, HydratedDocument, Schema } from 'mongoose';
import { isAuthenticated } from '../middleware/auth-middleware';
import { checkPermission } from '../middleware/permission-middleware';
import { checkRole } from '../middleware/role-middleware';
import domainRoutes from './domain-routes';
import PunishmentService from '../services/punishment-service';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { generateTicketApiKey } from '../middleware/ticket-api-auth';
// Removed unused imports - interfaces are defined locally below

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

interface IDurationDetail {
  value: number;
  unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
  type: 'mute' | 'ban' | 'permanent mute' | 'permanent ban';
}

interface IPunishmentDurations {
  low: { first: IDurationDetail; medium: IDurationDetail; habitual: IDurationDetail };
  regular: { first: IDurationDetail; medium: IDurationDetail; habitual: IDurationDetail };
  severe: { first: IDurationDetail; medium: IDurationDetail; habitual: IDurationDetail };
}

interface IPunishmentPoints {
  low: number;
  regular: number;
  severe: number;
}

interface IPunishmentType {
  id: number;
  name: string;
  category: string;
  isCustomizable: boolean;
  ordinal: number;
  durations?: IPunishmentDurations;
  points?: IPunishmentPoints;
  customPoints?: number; // For permanent punishments that don't use severity-based points
  appealForm?: IAppealFormSettings; // Punishment-specific appeal form configuration
  staffDescription?: string; // Description shown to staff when applying this punishment
  playerDescription?: string; // Description shown to players (in appeals, notifications, etc.)
  canBeAltBlocking?: boolean; // Whether this punishment can block alternative accounts
  canBeStatWiping?: boolean; // Whether this punishment can wipe player statistics
  singleSeverityPunishment?: boolean; // Whether this punishment uses single severity instead of three levels
  singleSeverityDurations?: {
    first: { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; type: 'mute' | 'ban' | 'permanent mute' | 'permanent ban'; };
    medium: { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; type: 'mute' | 'ban' | 'permanent mute' | 'permanent ban'; };
    habitual: { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; type: 'mute' | 'ban' | 'permanent mute' | 'permanent ban'; };
  };
  singleSeverityPoints?: number; // Points for single severity punishments
  permanentUntilSkinChange?: boolean; // Whether this punishment persists until player changes skin
  permanentUntilUsernameChange?: boolean; // Whether this punishment persists until player changes username
  isAppealable?: boolean; // Whether this punishment type can be appealed
}

interface IAppealFormField {
  id: string;
  type: 'text' | 'textarea' | 'dropdown' | 'multiple_choice' | 'checkbox' | 'file_upload' | 'checkboxes';
  label: string;
  description?: string;
  required: boolean;
  options?: string[];
  order: number;
  sectionId?: string;
  goToSection?: string;
  optionSectionMapping?: Record<string, string>; // Maps option values to section IDs
}

interface IAppealFormSection {
  id: string;
  title: string;
  description?: string;
  order: number;
  showIfFieldId?: string;
  showIfValue?: string;
  showIfValues?: string[];
  hideByDefault?: boolean;
}

interface IAppealFormSettings {
  fields: IAppealFormField[];
  sections: IAppealFormSection[];
}

interface IStatusThresholds {
  gameplay: { medium: number; habitual: number };
  social: { medium: number; habitual: number };
}

interface ISystemSettings {
  maxLoginAttempts: number;
  lockoutDuration: number;
  sessionTimeout: number;
  requireAdminApproval: boolean;
  requireTwoFactor: boolean;
}

interface ITicketFormField {
  fieldName: string;
  fieldLabel: string;
  fieldType: string;
  required: boolean;
  options?: string[];
}

interface ITicketForms {
  [key: string]: ITicketFormField[];
}

interface IAIPunishmentConfig {
  enabled: boolean;
  aiDescription: string;
}

interface IAIModerationSettings {
  enableAutomatedActions: boolean;
  strictnessLevel: 'lenient' | 'standard' | 'strict';
  aiPunishmentConfigs: Record<number, IAIPunishmentConfig>; // Map punishment type ID to AI config
}

// Settings document interface for separate documents in same collection
interface ISettingsDocument extends MongooseDocument {
  type: string; // 'punishmentTypes', 'statusThresholds', 'systemSettings', etc.
  data: any; // The actual settings data for this section
}

// Mongoose schema for settings (separate documents for each settings section)
const SettingsSchema = new Schema({
  type: { type: String, required: true }, // 'punishmentTypes', 'statusThresholds', etc.
  data: { type: Schema.Types.Mixed, required: true } // The actual settings data
});

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

router.use(isAuthenticated);

// Mount domain routes
router.use('/domain', domainRoutes);

// Helper function to get settings models
function getSettingsModels(dbConnection: Connection) {
  // Force use of our local SettingsSchema with the 'type' field to avoid strict mode errors
  // Delete the existing Settings model if it exists and recreate with our schema
  if (dbConnection.models.Settings) {
    delete dbConnection.models.Settings;
  }
  return {
    Settings: dbConnection.model<ISettingsDocument>('Settings', SettingsSchema)
  };
}

// Helper function to get settings value
export async function getSettingsValue(dbConnection: Connection, key: string): Promise<any> {
  const models = getSettingsModels(dbConnection);
  
  const settingsDoc = await models.Settings.findOne({ type: key });
  return settingsDoc?.data;
}

// Helper function to get multiple settings values
export async function getMultipleSettingsValues(dbConnection: Connection, keys: string[]): Promise<Record<string, any>> {
  const models = getSettingsModels(dbConnection);
  
  const settingsDocs = await models.Settings.find({ type: { $in: keys } });
  const result: Record<string, any> = {};
  
  for (const doc of settingsDocs) {
    result[doc.type] = doc.data;
  }
  
  return result;
}

// New function to create separate settings documents
export async function createDefaultSettings(dbConnection: Connection, serverName?: string): Promise<void> {
  const models = getSettingsModels(dbConnection);
  
  // Only include core Administrative punishment types (ordinals 0-5, not customizable)
  const corePunishmentTypes: IPunishmentType[] = [
    { 
      id: 0, 
      name: 'Kick', 
      category: 'Administrative', 
      isCustomizable: false, 
      ordinal: 0,
      staffDescription: 'Kick a player.',
      playerDescription: 'BOOT!',
      canBeAltBlocking: false,
      canBeStatWiping: false,
      isAppealable: false,
      appealForm: {
        fields: []
      }
    },
    { 
      id: 1, 
      name: 'Manual Mute', 
      category: 'Administrative', 
      isCustomizable: false, 
      ordinal: 1,
      staffDescription: 'Manually mute a player.',
      playerDescription: 'You have been silenced.',
      canBeAltBlocking: false,
      canBeStatWiping: false,
      isAppealable: true,
      appealForm: {
        fields: [
          {
            id: 'why',
            type: 'textarea',
            label: 'Why should this punishment be amended?',
            description: 'Please provide context and any relevant information to support your appeal',
            required: true,
            order: 1,
            sectionId: 'appeal_reason_section'
          }
        ],
        sections: [
          {
            id: 'appeal_reason_section',
            title: 'Appeal Information',
            description: 'Explain why you believe this punishment should be amended',
            order: 0
          }
        ]
      }
    },
    { 
      id: 2, 
      name: 'Manual Ban', 
      category: 'Administrative', 
      isCustomizable: false, 
      ordinal: 2,
      staffDescription: 'Manually ban a player.',
      playerDescription: 'The ban hammer has spoken.',
      canBeAltBlocking: true,
      canBeStatWiping: true,
      isAppealable: true,
      appealForm: {
        fields: [
          {
            id: 'why',
            type: 'textarea',
            label: 'Why should this punishment be amended?',
            description: 'Please provide context and any relevant information to support your appeal',
            required: true,
            order: 1,
            sectionId: 'appeal_reason_section'
          }
        ],
        sections: [
          {
            id: 'appeal_reason_section',
            title: 'Appeal Information',
            description: 'Explain why you believe this punishment should be amended',
            order: 0
          }
        ]
      }
    },
    { 
      id: 3, 
      name: 'Security Ban', 
      category: 'Administrative', 
      isCustomizable: false, 
      ordinal: 3,
      staffDescription: 'Compromised or potentially compromised account.',
      playerDescription: 'Suspicious activity has been detected on your account. Please secure your account and appeal this ban.',
      canBeAltBlocking: false,
      canBeStatWiping: false,
      isAppealable: true,
      appealForm: {
        fields: [
          {
            id: 'security_concern',
            type: 'checkbox',
            label: 'I have secured my account',
            description: 'Please confirm that you have changed your password and secured the email associated with your account',
            required: true,
            order: 1,
            sectionId: 'security_section'
          },
        ],
        sections: [
          {
            id: 'security_section',
            title: 'Account Security',
            description: 'Please confirm you have secured your account before submitting this appeal',
            order: 0
          }
        ]
      }
    },
    { 
      id: 4, 
      name: 'Linked Ban', 
      category: 'Administrative', 
      isCustomizable: false, 
      ordinal: 4,
      staffDescription: 'Usually automatically applied due to ban evasion.',
      playerDescription: 'Evading bans through the use of alternate accounts or sharing your account is strictly prohibited. This ban was automatically issued through a high-confidence IP address linking system for ban #{linked-id}.',
      canBeAltBlocking: false,
      canBeStatWiping: false,
      isAppealable: true,
      appealForm: {
        fields: [
          {
            id: 'linked_appeal_reason',
            type: 'textarea',
            label: 'Appeal Reason',
            description: 'Please explain why you believe this linking was incorrect',
            required: true,
            order: 1,
            sectionId: 'appeal_reason_section'
          }
        ],
        sections: [
          {
            id: 'appeal_reason_section',
            title: 'Appeal Information',
            description: 'Provide information about why you believe this linking was incorrect',
            order: 0
          }
        ]
      }
    },
    { 
      id: 5, 
      name: 'Blacklist', 
      category: 'Administrative', 
      isCustomizable: false, 
      ordinal: 5,
      staffDescription: 'Remove a player (unappealable).',
      playerDescription: 'You are blacklisted from the server.',
      canBeAltBlocking: true,
      canBeStatWiping: true,
      isAppealable: false,
      appealForm: {
        fields: [],
        sections: []
      }
    }
  ];

  // Default Social punishment types (customizable, ordered as requested)
  const defaultSocialTypes: IPunishmentType[] = [
    { 
      id: 8, 
      name: 'Chat Abuse', 
      category: 'Social', 
      isCustomizable: true, 
      ordinal: 6,
      durations: {
        low: { first: { value: 6, unit: 'hours', type: 'mute' }, medium: { value: 1, unit: 'days', type: 'mute' }, habitual: { value: 3, unit: 'days', type: 'mute' } },
        regular: { first: { value: 1, unit: 'days', type: 'mute' }, medium: { value: 3, unit: 'days', type: 'mute' }, habitual: { value: 7, unit: 'days', type: 'mute' } },
        severe: { first: { value: 3, unit: 'days', type: 'mute' }, medium: { value: 7, unit: 'days', type: 'mute' }, habitual: { value: 14, unit: 'days', type: 'mute' } }
      },
      points: { low: 1, regular: 1, severe: 2 },
      staffDescription: 'Inappropriate language, excessive caps, or disruptive chat behavior.',
      playerDescription: 'Public chat channels are reserved for decent messages. Review acceptable public chat decorum here: https://www.server.com/rules#chat',
      canBeAltBlocking: false,
      canBeStatWiping: false,
      isAppealable: true,
      appealForm: {
        fields: [
          {
            id: 'why',
            type: 'textarea',
            label: 'Why should this punishment be amended?',
            description: 'Please provide context and any relevant information to support your appeal',
            required: true,
            order: 1,
            sectionId: 'appeal_reason_section'
          }
        ],
        sections: [
          {
            id: 'appeal_reason_section',
            title: 'Appeal Information',
            description: 'Explain why you believe this punishment should be amended',
            order: 0
          }
        ]
      }
    },
    { 
      id: 9, 
      name: 'Anti Social', 
      category: 'Social', 
      isCustomizable: true, 
      ordinal: 7,
      durations: {
        low: { first: { value: 3, unit: 'days', type: 'mute' }, medium: { value: 7, unit: 'days', type: 'mute' }, habitual: { value: 14, unit: 'days', type: 'mute' } },
        regular: { first: { value: 7, unit: 'days', type: 'mute' }, medium: { value: 30, unit: 'days', type: 'mute' }, habitual: { value: 90, unit: 'days', type: 'mute' } },
        severe: { first: { value: 30, unit: 'days', type: 'mute' }, medium: { value: 90, unit: 'days', type: 'mute' }, habitual: { value: 180, unit: 'days', type: 'mute' } }
      },
      points: { low: 2, regular: 3, severe: 4 },
      staffDescription: 'Hostile, toxic, or antisocial behavior that creates a negative environment.',
      playerDescription: 'Anti-social and disruptive behavior is strictly prohibited from public channels. If you would not want your mom to hear it, keep it yourself!',
      canBeAltBlocking: false,
      canBeStatWiping: false,
      isAppealable: true,
      appealForm: {
        fields: [
          {
            id: 'why',
            type: 'textarea',
            label: 'Why should this punishment be amended?',
            description: 'Please provide context and any relevant information to support your appeal',
            required: true,
            order: 1,
            sectionId: 'appeal_reason_section'
          }
        ],
        sections: [
          {
            id: 'appeal_reason_section',
            title: 'Appeal Information',
            description: 'Explain why you believe this punishment should be amended',
            order: 0
          }
        ]
      }
    },
    { 
      id: 10, 
      name: 'Targeting', 
      category: 'Social', 
      isCustomizable: true, 
      ordinal: 8,
      durations: {
        low: { first: { value: 7, unit: 'days', type: 'ban' }, medium: { value: 14, unit: 'days', type: 'ban' }, habitual: { value: 30, unit: 'days', type: 'ban' } },
        regular: { first: { value: 30, unit: 'days', type: 'ban' }, medium: { value: 90, unit: 'days', type: 'ban' }, habitual: { value: 180, unit: 'days', type: 'ban' } },
        severe: { first: { value: 90, unit: 'days', type: 'ban' }, medium: { value: 180, unit: 'days', type: 'ban' }, habitual: { value: 365, unit: 'days', type: 'ban' } }
      },
      points: { low: 4, regular: 6, severe: 10 },
      staffDescription: 'Persistent harassment, bullying, or targeting of specific players with malicious intent.',
      playerDescription: 'This server has a zero tolerance policy on targeting individuals regardless of the basis or medium. This policy encompasses Harassment, Torment, Threats, and Cyber attacks.',
      canBeAltBlocking: true,
      canBeStatWiping: false,
      isAppealable: true,
      appealForm: {
        fields: [
          {
            id: 'why',
            type: 'textarea',
            label: 'Why should this punishment be amended?',
            description: 'Please provide context and any relevant information to support your appeal',
            required: true,
            order: 1,
            sectionId: 'appeal_reason_section'
          }
        ],
        sections: [
          {
            id: 'appeal_reason_section',
            title: 'Appeal Information',
            description: 'Explain why you believe this punishment should be amended',
            order: 0
          }
        ]
      }
    },
    { 
      id: 11, 
      name: 'Bad Content', 
      category: 'Social', 
      isCustomizable: true, 
      ordinal: 9,
      durations: {
        low: { first: { value: 1, unit: 'days', type: 'ban' }, medium: { value: 7, unit: 'days', type: 'ban' }, habitual: { value: 14, unit: 'days', type: 'ban' } },
        regular: { first: { value: 7, unit: 'days', type: 'ban' }, medium: { value: 14, unit: 'days', type: 'ban' }, habitual: { value: 30, unit: 'days', type: 'ban' } },
        severe: { first: { value: 30, unit: 'days', type: 'ban' }, medium: { value: 60, unit: 'days', type: 'ban' }, habitual: { value: 90, unit: 'days', type: 'ban' } }
      },
      points: { low: 3, regular: 4, severe: 5 },
      staffDescription: 'Inappropriate content including sexual references, doxxing, links to harmful sites.',
      playerDescription: 'Sharing inappropriate content of any kind is strictly prohibited. This encompasses sexual references, doxxing, links to malicious websites, and content intended to disrupt or harm other players.',
      canBeAltBlocking: true,
      canBeStatWiping: false,
      isAppealable: true,
      appealForm: {
        fields: [
          {
            id: 'why',
            type: 'textarea',
            label: 'Why should this punishment be amended?',
            description: 'Please provide context and any relevant information to support your appeal',
            required: true,
            order: 1,
            sectionId: 'appeal_reason_section'
          }
        ],
        sections: [
          {
            id: 'appeal_reason_section',
            title: 'Appeal Information',
            description: 'Explain why you believe this punishment should be amended',
            order: 0
          }
        ]
      }
    },
    { 
      id: 18, 
      name: 'Bad Username', 
      category: 'Social', 
      isCustomizable: true, 
      ordinal: 10,
      permanentUntilUsernameChange: true,
      staffDescription: 'Username violates server guidelines (inappropriate, offensive, or misleading).',
      playerDescription: 'Your username violates our community guidelines. Please change your username to something appropriate to continue playing.',
      canBeAltBlocking: false,
      canBeStatWiping: false,
      isAppealable: true,
      appealForm: {
        fields: [
          {
            id: 'username_explanation',
            type: 'textarea',
            label: 'Why do you believe your username is appropriate?',
            description: 'Please explain why you think your username should be allowed',
            required: true,
            order: 1
          },
          {
            id: 'new_username',
            type: 'text',
            label: 'Proposed new username (optional)',
            description: 'If you agree to change it, what username would you prefer?',
            required: false,
            order: 2
          }
        ]
      }
    },
    { 
      id: 19, 
      name: 'Bad Skin', 
      category: 'Social', 
      isCustomizable: true, 
      ordinal: 11,
      permanentUntilSkinChange: true,
      staffDescription: 'Player skin violates server guidelines (inappropriate, offensive, or misleading).',
      playerDescription: 'Your Minecraft skin violates our community guidelines. Please change your skin to something appropriate to continue playing.',
      canBeAltBlocking: false,
      canBeStatWiping: false,
      isAppealable: true,
      appealForm: {
        fields: [
          {
            id: 'skin_explanation',
            type: 'textarea',
            label: 'Why do you believe your skin is appropriate?',
            description: 'Please explain why you think your skin should be allowed',
            required: true,
            order: 1
          },
          {
            id: 'skin_change_confirmation',
            type: 'checkbox',
            label: 'I agree to change my skin to something appropriate',
            description: 'Check this box if you agree to change your skin',
            required: false,
            order: 2
          }
        ]
      }
    }
  ];

  // Default Gameplay punishment types (customizable, ordered as requested)
  const defaultGameplayTypes: IPunishmentType[] = [
    { 
      id: 12, 
      name: 'Team Abuse', 
      category: 'Gameplay', 
      isCustomizable: true, 
      ordinal: 12,
      durations: {
        low: { first: { value: 6, unit: 'hours', type: 'ban' }, medium: { value: 12, unit: 'hours', type: 'ban' }, habitual: { value: 3, unit: 'days', type: 'ban' } },
        regular: { first: { value: 12, unit: 'hours', type: 'ban' }, medium: { value: 3, unit: 'days', type: 'ban' }, habitual: { value: 7, unit: 'days', type: 'ban' } },
        severe: { first: { value: 3, unit: 'days', type: 'ban' }, medium: { value: 7, unit: 'days', type: 'ban' }, habitual: { value: 14, unit: 'days', type: 'ban' } }
      },
      points: { low: 2, regular: 2, severe: 3 },
      staffDescription: 'Intentionally harming teammates, cross-teaming, or aiding cheaters.',
      playerDescription: 'Please be considerate to fellow players by not team-griefing, aiding cheaters, or cross-teaming.',
      canBeAltBlocking: true,
      canBeStatWiping: true,
      isAppealable: true,
      appealForm: {
        fields: [
          {
            id: 'why',
            type: 'textarea',
            label: 'Why should this punishment be amended?',
            description: 'Please provide context and any relevant information to support your appeal',
            required: true,
            order: 1,
            sectionId: 'appeal_reason_section'
          }
        ],
        sections: [
          {
            id: 'appeal_reason_section',
            title: 'Appeal Information',
            description: 'Explain why you believe this punishment should be amended',
            order: 0
          }
        ]
      }
    },
    { 
      id: 13, 
      name: 'Game Abuse', 
      category: 'Gameplay', 
      isCustomizable: true, 
      ordinal: 13,
      durations: {
        low: { first: { value: 1, unit: 'days', type: 'ban' }, medium: { value: 3, unit: 'days', type: 'ban' }, habitual: { value: 7, unit: 'days', type: 'ban' } },
        regular: { first: { value: 7, unit: 'days', type: 'ban' }, medium: { value: 14, unit: 'days', type: 'ban' }, habitual: { value: 14, unit: 'days', type: 'ban' } },
        severe: { first: { value: 30, unit: 'days', type: 'ban' }, medium: { value: 30, unit: 'days', type: 'ban' }, habitual: { value: 90, unit: 'days', type: 'ban' } }
      },
      points: { low: 2, regular: 3, severe: 5 },
      staffDescription: 'Violating game specific rules for fair play.',
      playerDescription: 'Violating game specific rules for competitive fair-play. It is your responsibility to be aware of and abide by all network-wide and game-specific rules.',
      canBeAltBlocking: true,
      canBeStatWiping: true,
      isAppealable: true,
      appealForm: {
        fields: [
          {
            id: 'why',
            type: 'textarea',
            label: 'Why should this punishment be amended?',
            description: 'Please provide context and any relevant information to support your appeal',
            required: true,
            order: 1,
            sectionId: 'appeal_reason_section'
          }
        ],
        sections: [
          {
            id: 'appeal_reason_section',
            title: 'Appeal Information',
            description: 'Explain why you believe this punishment should be amended',
            order: 0
          }
        ]
      }
    },
    { 
      id: 14, 
      name: 'Cheating', 
      category: 'Gameplay', 
      isCustomizable: true, 
      ordinal: 14,
      durations: {
        low: { first: { value: 3, unit: 'days', type: 'ban' }, medium: { value: 14, unit: 'days', type: 'ban' }, habitual: { value: 30, unit: 'days', type: 'ban' } },
        regular: { first: { value: 14, unit: 'days', type: 'ban' }, medium: { value: 60, unit: 'days', type: 'ban' }, habitual: { value: 180, unit: 'days', type: 'ban' } },
        severe: { first: { value: 30, unit: 'days', type: 'ban' }, medium: { value: 90, unit: 'days', type: 'ban' }, habitual: { value: 0, unit: 'days', type: 'permanent ban' } }
      },
      points: { low: 5, regular: 7, severe: 9 },
      staffDescription: 'Using hacks, mods, exploits, or other software to gain an unfair advantage.',
      playerDescription: 'Cheating through the use of client-side modifications or game exploits to gain an unfair advantage over other players is strictly prohibited.',
      canBeAltBlocking: true,
      canBeStatWiping: true,
      isAppealable: true,
      appealForm: {
        fields: [
          {
            id: 'why',
            type: 'textarea',
            label: 'Why should this punishment be amended?',
            description: 'Please provide context and any relevant information to support your appeal',
            required: true,
            order: 1,
            sectionId: 'appeal_reason_section'
          }
        ],
        sections: [
          {
            id: 'appeal_reason_section',
            title: 'Appeal Information',
            description: 'Explain why you believe this punishment should be amended',
            order: 0
          }
        ]
      }
    },
    { 
      id: 15, 
      name: 'Game Trading', 
      category: 'Gameplay', 
      isCustomizable: true, 
      ordinal: 15,
      durations: {
        low: { first: { value: 14, unit: 'days', type: 'ban' }, medium: { value: 30, unit: 'days', type: 'ban' }, habitual: { value: 60, unit: 'days', type: 'ban' } },
        regular: { first: { value: 30, unit: 'days', type: 'ban' }, medium: { value: 90, unit: 'days', type: 'ban' }, habitual: { value: 180, unit: 'days', type: 'ban' } },
        severe: { first: { value: 0, unit: 'days', type: 'permanent ban' }, medium: { value: 0, unit: 'days', type: 'permanent ban' }, habitual: { value: 0, unit: 'days', type: 'permanent ban' } }
      },
      points: { low: 4, regular: 6, severe: 10 },
      staffDescription: 'Trading or selling in-game items, content, or services on unauthorized third-party platforms.',
      playerDescription: 'Trading or selling in-game items, content, or services on unauthorized third-party platforms is strictly prohibited.',
      canBeAltBlocking: true,
      canBeStatWiping: true,
      isAppealable: true,
      appealForm: {
        fields: [
          {
            id: 'why',
            type: 'textarea',
            label: 'Why should this punishment be amended?',
            description: 'Please provide context and any relevant information to support your appeal',
            required: true,
            order: 1,
            sectionId: 'appeal_reason_section'
          }
        ],
        sections: [
          {
            id: 'appeal_reason_section',
            title: 'Appeal Information',
            description: 'Explain why you believe this punishment should be amended',
            order: 0
          }
        ]
      }
    },
    { 
      id: 16, 
      name: 'Account Abuse', 
      category: 'Gameplay', 
      isCustomizable: true, 
      ordinal: 16,
      durations: {
        low: { first: { value: 14, unit: 'days', type: 'ban' }, medium: { value: 30, unit: 'days', type: 'ban' }, habitual: { value: 60, unit: 'days', type: 'ban' } },
        regular: { first: { value: 30, unit: 'days', type: 'ban' }, medium: { value: 90, unit: 'days', type: 'ban' }, habitual: { value: 180, unit: 'days', type: 'ban' } },
        severe: { first: { value: 0, unit: 'days', type: 'permanent ban' }, medium: { value: 0, unit: 'days', type: 'permanent ban' }, habitual: { value: 0, unit: 'days', type: 'permanent ban' } }
      },
      points: { low: 4, regular: 6, severe: 10 },
      staffDescription: 'Account sharing, alt-account boosting, selling/trading accounts.',
      playerDescription: 'Misuse of accounts for the purposes of financial or levelling gain is prohibited. This encompasses account sharing, trading, selling and boosting through the use of alternate accounts.',
      canBeAltBlocking: true,
      canBeStatWiping: true,
      isAppealable: true,
      appealForm: {
        fields: [
          {
            id: 'why',
            type: 'textarea',
            label: 'Why should this punishment be amended?',
            description: 'Please provide context and any relevant information to support your appeal',
            required: true,
            order: 1,
            sectionId: 'appeal_reason_section'
          }
        ],
        sections: [
          {
            id: 'appeal_reason_section',
            title: 'Appeal Information',
            description: 'Explain why you believe this punishment should be amended',
            order: 0
          }
        ]
      }
    },
    { 
      id: 17, 
      name: 'Systems Abuse', 
      category: 'Gameplay', 
      isCustomizable: true, 
      ordinal: 17,
      durations: {
        low: { first: { value: 3, unit: 'days', type: 'ban' }, medium: { value: 7, unit: 'days', type: 'ban' }, habitual: { value: 14, unit: 'days', type: 'ban' } },
        regular: { first: { value: 14, unit: 'days', type: 'ban' }, medium: { value: 30, unit: 'days', type: 'ban' }, habitual: { value: 90, unit: 'days', type: 'ban' } },
        severe: { first: { value: 90, unit: 'days', type: 'ban' }, medium: { value: 180, unit: 'days', type: 'ban' }, habitual: { value: 365, unit: 'days', type: 'ban' } }
      },
      points: { low: 2, regular: 3, severe: 5 },
      staffDescription: 'Abusing server functions by opening redundant tickets, creating lag machines, etc.',
      playerDescription: 'Using server systems in an unintended and harmful way is strictly prohibited. This encompasses lag machines, ticket spam, etc.',
      canBeAltBlocking: true,
      canBeStatWiping: true,
      isAppealable: true,
      appealForm: {
        fields: [
          {
            id: 'why',
            type: 'textarea',
            label: 'Why should this punishment be amended?',
            description: 'Please provide context and any relevant information to support your appeal',
            required: true,
            order: 1,
            sectionId: 'appeal_reason_section'
          }
        ],
        sections: [
          {
            id: 'appeal_reason_section',
            title: 'Appeal Information',
            description: 'Explain why you believe this punishment should be amended',
            order: 0
          }
        ]
      }
    }
  ];

  // Combine all punishment types
  const allPunishmentTypes = [...corePunishmentTypes, ...defaultSocialTypes, ...defaultGameplayTypes];

  // Create separate documents in the same Settings collection
  await Promise.all([
    // Punishment Types document
    models.Settings.findOneAndUpdate(
      { type: 'punishmentTypes' }, 
      { 
        type: 'punishmentTypes',
        data: allPunishmentTypes
      }, 
      { upsert: true, new: true }
    ),
    
    // Status Thresholds document
    models.Settings.findOneAndUpdate(
      { type: 'statusThresholds' },
      { 
        type: 'statusThresholds',
        data: {
          gameplay: { medium: 5, habitual: 10 },
          social: { medium: 4, habitual: 8 }
        }
      },
      { upsert: true, new: true }
    ),
    
    // System Settings document
    models.Settings.findOneAndUpdate(
      { type: 'systemSettings' },
      {
        type: 'systemSettings',
        data: {
          maxLoginAttempts: 5,
          lockoutDuration: 30 * 60 * 1000, // 30 minutes
          sessionTimeout: 2 * 60 * 60 * 1000, // 2 hours
          requireAdminApproval: true,
          requireTwoFactor: true
        }
      },
      { upsert: true, new: true }
    ),
    
    // Ticket Tags document
    models.Settings.findOneAndUpdate(
      { type: 'ticketTags' },
      {
        type: 'ticketTags',
        data: [
          'bug', 'player', 'chat', 'appeal', 'high-priority', 'needs-review',
          'in-progress', 'resolved', 'won\'t-fix', 'duplicate'
        ]
      },
      { upsert: true, new: true }
    ),
    
    // General Settings document
    models.Settings.findOneAndUpdate(
      { type: 'general' },
      {
        type: 'general',
        data: {
          serverDisplayName: serverName || '',
          homepageIconUrl: '',
          panelIconUrl: ''
        }
      },
      { upsert: true, new: true }
    ),
    
    // AI Moderation Settings document
    models.Settings.findOneAndUpdate(
      { type: 'aiModerationSettings' },
      {
        type: 'aiModerationSettings',
        data: {
          enableAIReview: true,
          enableAutomatedActions: true,
          strictnessLevel: 'standard',
          aiPunishmentConfigs: {
            'chat-abuse': {
              id: 'chat-abuse',
              name: 'Chat Abuse',
              aiDescription: 'Inappropriate language, excessive caps, spam, harassment, or disruptive chat behavior that violates community standards.',
              enabled: true
            },
            'anti-social': {
              id: 'anti-social',
              name: 'Anti Social',
              aiDescription: 'Hostile, toxic, bullying, or antisocial behavior that creates a negative environment for other players.',
              enabled: true
            }
          }
        }
      },
      { upsert: true, new: true }
    ),
    
    // API Keys document with default unified API key
    models.Settings.findOneAndUpdate(
      { type: 'apiKeys' },
      {
        type: 'apiKeys',
        data: {
          api_key: generateTicketApiKey()
        }
      },
      { upsert: true, new: true }
    )
  ]);
  
  // Run migration to fix any existing ticketForms data
  try {
    await migrateTicketForms(dbConnection);
  } catch (migrationError) {
    console.error('Error during automatic ticketForms migration:', migrationError);
  }
}

// Function to migrate ticketForms from old format to new format
export async function migrateTicketForms(dbConnection: Connection): Promise<void> {
  const models = getSettingsModels(dbConnection);
  
  try {
    const ticketFormsDoc = await models.Settings.findOne({ type: 'ticketForms' });
    
    if (ticketFormsDoc && ticketFormsDoc.data && 
        (ticketFormsDoc.data.bug_report || ticketFormsDoc.data.support_request || ticketFormsDoc.data.staff_application)) {
      
      const newFormat = {
        bug: ticketFormsDoc.data.bug_report || { fields: [], sections: [] },
        support: ticketFormsDoc.data.support_request || { fields: [], sections: [] },
        application: ticketFormsDoc.data.staff_application || { fields: [], sections: [] }
      };
      
      await models.Settings.findOneAndUpdate(
        { type: 'ticketForms' },
        { 
          type: 'ticketForms', 
          data: newFormat 
        },
        { upsert: true }
      );
      
      console.log('Successfully migrated ticketForms from old format to new format');
    } else {
      console.log('ticketForms already in correct format or doesn\'t exist');
    }
  } catch (error) {
    console.error('Error during ticketForms migration:', error);
    throw error;
  }
}

// Function to retrieve all settings from separate documents
export async function getAllSettings(dbConnection: Connection): Promise<any> {
  const models = getSettingsModels(dbConnection);
  
  try {
    // Get all settings documents
    const settingsDocuments = await models.Settings.find({});
    
    // Convert to key-value structure
    const settings: any = {};
    
    for (const doc of settingsDocuments) {
      switch (doc.type) {
        case 'punishmentTypes':
          settings.punishmentTypes = doc.data;
          break;
        case 'statusThresholds':
          settings.statusThresholds = doc.data;
          break;
        case 'systemSettings':
          settings.system = doc.data;
          break;
        case 'ticketTags':
          settings.ticketTags = doc.data;
          break;
        case 'quickResponses':
          settings.quickResponses = doc.data;
          break;
        case 'ticketForms':
          // Check if data is in old format and migrate it
          if (doc.data && (doc.data.bug_report || doc.data.support_request || doc.data.staff_application)) {
            // Migrate from old format to new format
            settings.ticketForms = {
              bug: doc.data.bug_report || { fields: [], sections: [] },
              support: doc.data.support_request || { fields: [], sections: [] },
              application: doc.data.staff_application || { fields: [], sections: [] }
            };
            
            // Update the document in the database with the new format
            try {
              await models.Settings.findOneAndUpdate(
                { type: 'ticketForms' },
                { 
                  type: 'ticketForms', 
                  data: settings.ticketForms 
                },
                { upsert: true }
              );
              console.log('Migrated ticketForms from old format to new format');
            } catch (migrationError) {
              console.error('Error migrating ticketForms:', migrationError);
            }
          } else {
            settings.ticketForms = doc.data;
          }
          break;
        case 'general':
          settings.general = doc.data;
          break;
        case 'aiModerationSettings':
          settings.aiModerationSettings = doc.data;
          break;
        case 'apiKeys':
          settings.api_key = doc.data.api_key;
          settings.ticket_api_key = doc.data.ticket_api_key;
          settings.minecraft_api_key = doc.data.minecraft_api_key;
          break;
      }
    }

    // Provide defaults if documents don't exist
    return {
      punishmentTypes: settings.punishmentTypes || [],
      statusThresholds: settings.statusThresholds || { gameplay: { medium: 5, habitual: 10 }, social: { medium: 4, habitual: 8 } },
      system: settings.system || {},
      ticketTags: settings.ticketTags || [],
      quickResponses: settings.quickResponses || { categories: [] },
      ticketForms: settings.ticketForms || { bug: { fields: [], sections: [] }, support: { fields: [], sections: [] }, application: { fields: [], sections: [] } },
      general: settings.general || {},
      aiModerationSettings: settings.aiModerationSettings || {},
      api_key: settings.api_key,
      ticket_api_key: settings.ticket_api_key,
      minecraft_api_key: settings.minecraft_api_key
    };
  } catch (error) {
    console.error('Error retrieving settings from separate documents:', error);
    throw error;
  }
}


// Function to update separate documents based on request body
export async function updateSettings(dbConnection: Connection, requestBody: any): Promise<void> {
  const models = getSettingsModels(dbConnection);
  
  const updates: Promise<any>[] = [];
  
  if (requestBody.punishmentTypes !== undefined) {
    // Merge punishment types to preserve existing data
    const currentDoc = await models.Settings.findOne({ type: 'punishmentTypes' });
    const existingTypes = currentDoc?.data || [];
    
    // Create a map of existing types by ordinal for quick lookup
    const existingTypesMap = new Map();
    existingTypes.forEach((type: IPunishmentType) => {
      existingTypesMap.set(type.ordinal, type);
    });
    
    // Merge new types with existing ones, prioritizing new types
    const mergedTypes = [...requestBody.punishmentTypes];
    existingTypes.forEach((type: IPunishmentType) => {
      const hasNewType = requestBody.punishmentTypes.some((newType: IPunishmentType) => newType.ordinal === type.ordinal);
      if (!hasNewType) {
        mergedTypes.push(type);
      }
    });
    
    // Sort by ordinal to maintain order
    mergedTypes.sort((a: IPunishmentType, b: IPunishmentType) => a.ordinal - b.ordinal);
    
    updates.push(
      models.Settings.findOneAndUpdate(
        { type: 'punishmentTypes' },
        { type: 'punishmentTypes', data: mergedTypes },
        { upsert: true, new: true }
      )
    );
  }
  
  if (requestBody.statusThresholds !== undefined) {
    updates.push(
      models.Settings.findOneAndUpdate(
        { type: 'statusThresholds' },
        { type: 'statusThresholds', data: requestBody.statusThresholds },
        { upsert: true, new: true }
      )
    );
  }
  
  if (requestBody.system !== undefined) {
    updates.push(
      models.Settings.findOneAndUpdate(
        { type: 'systemSettings' },
        { type: 'systemSettings', data: requestBody.system },
        { upsert: true, new: true }
      )
    );
  }
  
  if (requestBody.ticketTags !== undefined) {
    updates.push(
      models.Settings.findOneAndUpdate(
        { type: 'ticketTags' },
        { type: 'ticketTags', data: requestBody.ticketTags },
        { upsert: true, new: true }
      )
    );
  }
  
  
  if (requestBody.general !== undefined) {
    updates.push(
      models.Settings.findOneAndUpdate(
        { type: 'general' },
        { type: 'general', data: requestBody.general },
        { upsert: true, new: true }
      )
    );
  }
  
  if (requestBody.quickResponses !== undefined) {
    updates.push(
      models.Settings.findOneAndUpdate(
        { type: 'quickResponses' },
        { type: 'quickResponses', data: requestBody.quickResponses },
        { upsert: true, new: true }
      )
    );
  }
  
  if (requestBody.ticketForms !== undefined) {
    updates.push(
      models.Settings.findOneAndUpdate(
        { type: 'ticketForms' },
        { type: 'ticketForms', data: requestBody.ticketForms },
        { upsert: true, new: true }
      )
    );
  }
  
  if (requestBody.aiModerationSettings !== undefined) {
    updates.push(
      models.Settings.findOneAndUpdate(
        { type: 'aiModerationSettings' },
        { type: 'aiModerationSettings', data: requestBody.aiModerationSettings },
        { upsert: true, new: true }
      )
    );
  }
  
  // Handle API keys separately
  const apiKeyUpdates: any = {};
  if (requestBody.api_key !== undefined) {
    apiKeyUpdates.api_key = requestBody.api_key;
  }
  if (requestBody.ticket_api_key !== undefined) {
    apiKeyUpdates.ticket_api_key = requestBody.ticket_api_key;
  }
  if (requestBody.minecraft_api_key !== undefined) {
    apiKeyUpdates.minecraft_api_key = requestBody.minecraft_api_key;
  }
  
  if (Object.keys(apiKeyUpdates).length > 0) {
    // Get existing API keys data
    const existingApiKeysDoc = await models.Settings.findOne({ type: 'apiKeys' });
    const currentApiKeys = existingApiKeysDoc?.data || {};
    
    updates.push(
      models.Settings.findOneAndUpdate(
        { type: 'apiKeys' },
        { type: 'apiKeys', data: { ...currentApiKeys, ...apiKeyUpdates } },
        { upsert: true, new: true }
      )
    );
  }
  
  if (updates.length > 0) {
    await Promise.all(updates);
  }
}

// Function to cleanup orphaned AI punishment configs in separate documents structure
export async function cleanupOrphanedAIPunishmentConfigs(dbConnection: Connection): Promise<void> {
  const models = getSettingsModels(dbConnection);
  
  try {
    const [punishmentTypesDoc, aiModerationDoc] = await Promise.all([
      models.Settings.findOne({ type: 'punishmentTypes' }),
      models.Settings.findOne({ type: 'aiModerationSettings' })
    ]);
    
    if (!punishmentTypesDoc || !aiModerationDoc) {
      return;
    }

    const allPunishmentTypes = punishmentTypesDoc.data || [];
    const aiSettings = aiModerationDoc.data || {
      enableAutomatedActions: true,
      strictnessLevel: 'standard',
      aiPunishmentConfigs: {}
    };

    if (!aiSettings.aiPunishmentConfigs) {
      return;
    }

    // Get valid punishment type IDs
    const validPunishmentTypeIds = new Set(allPunishmentTypes.map((pt: IPunishmentType) => pt.id));
    
    // Find orphaned AI configs
    const orphanedConfigIds = Object.keys(aiSettings.aiPunishmentConfigs)
      .map(id => parseInt(id))
      .filter(id => !validPunishmentTypeIds.has(id));

    if (orphanedConfigIds.length > 0) {
      console.log(`[Settings] Cleaning up ${orphanedConfigIds.length} orphaned AI punishment configs:`, orphanedConfigIds);
      
      // Remove orphaned configs
      orphanedConfigIds.forEach(id => {
        delete aiSettings.aiPunishmentConfigs[id];
      });

      // Save updated settings
      await models.Settings.findOneAndUpdate(
        { type: 'aiModerationSettings' },
        { type: 'aiModerationSettings', data: aiSettings },
        { upsert: true, new: true }
      );
      
      console.log(`[Settings] Successfully removed orphaned AI configs for punishment types:`, orphanedConfigIds);
    }
  } catch (error) {
    console.error('[Settings] Error cleaning up orphaned AI punishment configs:', error);
  }
}

export async function createDefaultSettingsDocument(dbConnection: Connection, serverName?: string): Promise<HydratedDocument<ISettingsDocument>> {
  try {
    const SettingsModel = dbConnection.model<ISettingsDocument>('Settings');
    const defaultSettingsMap = new Map<string, any>();

    // Only include core Administrative punishment types (ordinals 0-5, not customizable)
    const corePunishmentTypes: IPunishmentType[] = [      { 
        id: 0, 
        name: 'Kick', 
        category: 'Administrative', 
        isCustomizable: false, 
        ordinal: 0,
        staffDescription: 'Kick a player.',
        playerDescription: 'BOOT!',
        canBeAltBlocking: false,
        canBeStatWiping: false,
        isAppealable: false,
        appealForm: {
          fields: []
        }
      },      { 
        id: 1, 
        name: 'Manual Mute', 
        category: 'Administrative', 
        isCustomizable: false, 
        ordinal: 1,
        staffDescription: 'Manually mute a player.',
        playerDescription: 'You have been silenced.',
        canBeAltBlocking: false,
        canBeStatWiping: false,
        isAppealable: true,
        appealForm: {
          fields: [
            {
              id: 'why',
              type: 'textarea',
              label: 'Why should this punishment be amended?',
              description: 'Please provide context and any relevant information to support your appeal',
              required: true,
              order: 1
            }
          ]
        }
      },      { 
        id: 2, 
        name: 'Manual Ban', 
        category: 'Administrative', 
        isCustomizable: false, 
        ordinal: 2,
        staffDescription: 'Manually ban a player.',
        playerDescription: 'The ban hammer has spoken.',
        canBeAltBlocking: true,
        canBeStatWiping: true,
        isAppealable: true,
        appealForm: {
          fields: [
            {
              id: 'why',
              type: 'textarea',
              label: 'Why should this punishment be amended?',
              description: 'Please provide context and any relevant information to support your appeal',
              required: true,
              order: 1
            }
          ]
        }
      },      { 
        id: 3, 
        name: 'Security Ban', 
        category: 'Administrative', 
        isCustomizable: false, 
        ordinal: 3,
        staffDescription: 'Compromised or potentially compromised account.',
        playerDescription: 'Suspicious activity has been detected on your account. Please secure your account and appeal this ban.',
        canBeAltBlocking: false,
        canBeStatWiping: false,
        isAppealable: true,
        appealForm: {
          fields: [
            {
              id: 'security_concern',
              type: 'checkbox',
              label: 'I have secured my account',
              description: 'Please confirm that you have changed your password and secured the email associated with your account',
              required: true,
              order: 1
            },
          ]
        }
      },
      { 
        id: 4, 
        name: 'Linked Ban', 
        category: 'Administrative', 
        isCustomizable: false, 
        ordinal: 4,
        staffDescription: 'Usually automatically applied due to ban evasion.',
        playerDescription: 'Evading bans through the use of alternate accounts or sharing your account is strictly prohibited. This ban was automatically issued through a high-confidence IP address linking system for ban #{linked-id}.',
        canBeAltBlocking: false,
        canBeStatWiping: false,
        isAppealable: true,
        appealForm: {
          fields: [
            {
              id: 'shared_connection',
              type: 'dropdown',
              label: 'Connection Type',
              description: 'How is your account connected to the banned account?',
              required: true,
              options: ['Family member', 'Friend', 'Shared computer', 'Public network', 'Unknown/No connection'],
              order: 1
            },
            {
              id: 'why',
              type: 'textarea',
              label: 'Why should this punishment be amended?',
              description: 'Please provide context and any relevant information to support your appeal',
              required: true,
              order: 2
            }
          ]
        }
      },      { 
        id: 5, 
        name: 'Blacklist', 
        category: 'Administrative', 
        isCustomizable: false, 
        ordinal: 5,
        staffDescription: 'Remove a player (unappealable).',
        playerDescription: 'You are blacklisted from the server.',
        canBeAltBlocking: true,
        canBeStatWiping: true,
        isAppealable: false,
        appealForm: {
          fields: []
        }
      }
    ];
    
    const statusThresholds: IStatusThresholds = {
      gameplay: { medium: 5, habitual: 10 },
      social: { medium: 4, habitual: 8 }
    };
    
    defaultSettingsMap.set('punishmentTypes', corePunishmentTypes);
    defaultSettingsMap.set('statusThresholds', statusThresholds);
    
    defaultSettingsMap.set('ticketTags', [
      'bug', 'player', 'chat', 'appeal', 'high-priority', 'needs-review',
      'in-progress', 'resolved', 'won\'t-fix', 'duplicate'
    ]);
    
    const systemSettings: ISystemSettings = {
      maxLoginAttempts: 5,
      lockoutDuration: 30 * 60 * 1000, // 30 minutes
      sessionTimeout: 2 * 60 * 60 * 1000, // 2 hours
      requireAdminApproval: true,
      requireTwoFactor: true
    };
    defaultSettingsMap.set('system', systemSettings);
    
    // Legacy ticket forms - kept for backward compatibility but not used in the new system
    const legacyTicketForms: ITicketForms = {
      'bug': [
        { fieldName: 'description', fieldLabel: 'Bug Description', fieldType: 'textarea', required: true },
        { fieldName: 'steps', fieldLabel: 'Steps to Reproduce', fieldType: 'textarea', required: true },
        { fieldName: 'expected', fieldLabel: 'Expected Behavior', fieldType: 'textarea', required: true },
        { fieldName: 'actual', fieldLabel: 'Actual Behavior', fieldType: 'textarea', required: true },
        { fieldName: 'server', fieldLabel: 'Server', fieldType: 'text', required: true },
        { fieldName: 'version', fieldLabel: 'Game Version', fieldType: 'text', required: false }
      ],
      'player': [
        { fieldName: 'description', fieldLabel: 'Describe the Incident', fieldType: 'textarea', required: true },
        { fieldName: 'serverName', fieldLabel: 'Server Name', fieldType: 'text', required: true },
        { fieldName: 'when', fieldLabel: 'When did this happen?', fieldType: 'text', required: true },
        { fieldName: 'evidence', fieldLabel: 'Evidence (screenshots, videos, etc.)', fieldType: 'textarea', required: false }
      ],
      'chat': [
        { fieldName: 'description', fieldLabel: 'Describe the Issue', fieldType: 'textarea', required: true },
        { fieldName: 'serverName', fieldLabel: 'Server Name', fieldType: 'text', required: true },
        { fieldName: 'when', fieldLabel: 'When did this happen?', fieldType: 'text', required: true },
        { fieldName: 'chatlog', fieldLabel: 'Copy & Paste Chat Log', fieldType: 'textarea', required: true }
      ],
      'staff': [
        { fieldName: 'experience', fieldLabel: 'Previous Experience', fieldType: 'textarea', required: true },
        { fieldName: 'age', fieldLabel: 'Age', fieldType: 'text', required: true },
        { fieldName: 'timezone', fieldLabel: 'Timezone', fieldType: 'text', required: true },
        { fieldName: 'availability', fieldLabel: 'Weekly Availability (hours)', fieldType: 'text', required: true },
        { fieldName: 'why', fieldLabel: 'Why do you want to join our staff team?', fieldType: 'textarea', required: true },
        { fieldName: 'skills', fieldLabel: 'Special Skills', fieldType: 'textarea', required: false }
      ],
      'support': [
        { fieldName: 'description', fieldLabel: 'How can we help you?', fieldType: 'textarea', required: true },
        { fieldName: 'category', fieldLabel: 'Support Category', fieldType: 'select', 
          options: ['Account Issues', 'Technical Help', 'Purchases', 'Other'],
          required: true 
        },
        { fieldName: 'priority', fieldLabel: 'Priority', fieldType: 'select', 
          options: ['Low', 'Medium', 'High'],
          required: true 
        }
      ]
    };
    defaultSettingsMap.set('legacyTicketForms', legacyTicketForms);
    
    // Add default appeal form settings
    const defaultAppealForm: IAppealFormSettings = {
      fields: [
        {
          id: 'reason',
          type: 'textarea',
          label: 'Appeal Reason',
          description: 'Please explain why you believe this punishment should be reviewed',
          required: true,
          order: 1,
          sectionId: 'appeal_details'
        },
        {
          id: 'evidence',
          type: 'text',
          label: 'Evidence Links (Optional)',
          description: 'Provide links to any screenshots, videos, or other evidence',
          required: false,
          order: 2,
          sectionId: 'supporting_evidence'
        },
        {
          id: 'acknowledge_error',
          type: 'checkbox',
          label: 'I believe this punishment was issued in error',
          description: 'Check this box if you believe you were wrongfully punished',
          required: false,
          order: 3,
          sectionId: 'acknowledgment'
        }
      ],
      sections: [
        {
          id: 'appeal_details',
          title: 'Appeal Details',
          description: 'Provide information about why this punishment should be reviewed',
          order: 1
        },
        {
          id: 'supporting_evidence',
          title: 'Supporting Evidence',
          description: 'Any additional evidence to support your appeal',
          order: 2
        },
        {
          id: 'acknowledgment',
          title: 'Acknowledgment',
          description: 'Please confirm your understanding',
          order: 3
        }
      ]
    };
    defaultSettingsMap.set('appealForm', defaultAppealForm);
    
    // Add general settings defaults
    const generalSettings = {
      serverDisplayName: serverName || '',
      homepageIconUrl: '',
      panelIconUrl: ''
    };
    defaultSettingsMap.set('general', generalSettings);
    
    // AI Moderation settings with default enabled punishment types
    defaultSettingsMap.set('aiModerationSettings', {
      enableAIReview: true,
      enableAutomatedActions: true,
      strictnessLevel: 'standard',
      aiPunishmentConfigs: {
        'chat-abuse': {
          id: 'chat-abuse',
          name: 'Chat Abuse',
          aiDescription: 'Inappropriate language, excessive caps, spam, harassment, or disruptive chat behavior that violates community standards and creates a negative environment.',
          enabled: true
        },
        'anti-social': {
          id: 'anti-social',
          name: 'Anti Social',
          aiDescription: 'Hostile, toxic, bullying, or antisocial behavior including personal attacks, threats, discrimination, or actions that deliberately harm the community atmosphere.',
          enabled: true
        }
      }
    });

    // Default Ticket Forms Configuration (only 3 types needed) with comprehensive sections
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
          },
          // Environment Section
          {
            id: 'game_mode',
            type: 'dropdown',
            label: 'Game Mode',
            description: 'Which game mode were you playing?',
            required: true,
            options: ['Survival', 'Creative', 'Adventure', 'Spectator', 'Other'],
            order: 8,
            sectionId: 'environment'
          },
          {
            id: 'server_area',
            type: 'text',
            label: 'Server Area/World',
            description: 'Which area of the server were you in? (spawn, wilderness, specific world, etc.)',
            required: false,
            order: 9,
            sectionId: 'environment'
          },
          {
            id: 'player_count',
            type: 'text',
            label: 'Players Online',
            description: 'Approximately how many players were online when this occurred?',
            required: false,
            order: 10,
            sectionId: 'environment'
          },
          // Evidence Section
          {
            id: 'screenshot_evidence',
            type: 'file_upload',
            label: 'Screenshots/Evidence',
            description: 'Upload any screenshots, videos, or other evidence of the bug',
            required: false,
            order: 11,
            sectionId: 'evidence'
          },
          {
            id: 'error_messages',
            type: 'textarea',
            label: 'Error Messages',
            description: 'Include any error messages you received (copy/paste if possible)',
            required: false,
            order: 12,
            sectionId: 'evidence'
          },
          {
            id: 'additional_context',
            type: 'textarea',
            label: 'Additional Context',
            description: 'Any other relevant information that might help us fix this bug',
            required: false,
            order: 13,
            sectionId: 'evidence'
          }
        ],
        sections: [
          {
            id: 'basic_info',
            title: 'Basic Information',
            description: 'Tell us the basics about this bug',
            order: 1
          },
          {
            id: 'description',
            title: 'Bug Description',
            description: 'Describe the bug in detail',
            order: 2
          },
          {
            id: 'environment',
            title: 'Environment Details',
            description: 'Information about when and where the bug occurred',
            order: 3
          },
          {
            id: 'evidence',
            title: 'Evidence & Additional Information',
            description: 'Any supporting evidence or extra context',
            order: 4
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
          {
            id: 'contact_preference',
            type: 'dropdown',
            label: 'Preferred Contact Method',
            description: 'How would you like us to respond?',
            required: true,
            options: ['In-game message', 'Discord DM', 'Email', 'This ticket only'],
            order: 3,
            sectionId: 'request_info'
          },
          // Issue Details Section
          {
            id: 'issue_title',
            type: 'text',
            label: 'Issue Summary',
            description: 'Brief summary of your issue or request',
            required: true,
            order: 4,
            sectionId: 'issue_details'
          },
          {
            id: 'issue_description',
            type: 'textarea',
            label: 'Detailed Description',
            description: 'Describe your issue or request in detail',
            required: true,
            order: 5,
            sectionId: 'issue_details'
          },
          {
            id: 'when_occurred',
            type: 'text',
            label: 'When did this occur?',
            description: 'When did you first notice this issue? (date/time if possible)',
            required: false,
            order: 6,
            sectionId: 'issue_details'
          },
          // Troubleshooting Section
          {
            id: 'previous_attempts',
            type: 'textarea',
            label: 'Previous Attempts',
            description: 'What have you already tried to resolve this issue?',
            required: false,
            order: 7,
            sectionId: 'troubleshooting'
          },
          {
            id: 'other_affected',
            type: 'dropdown',
            label: 'Are others affected?',
            description: 'Do you know if other players have the same issue?',
            required: false,
            options: ['Yes, others have mentioned it', 'No, seems to be just me', 'Not sure', 'N/A'],
            order: 8,
            sectionId: 'troubleshooting'
          },
          // Additional Information Section
          {
            id: 'account_info',
            type: 'textarea',
            label: 'Relevant Account Information',
            description: 'Any relevant account details (rank, join date, recent changes, etc.)',
            required: false,
            order: 9,
            sectionId: 'additional_info'
          },
          {
            id: 'additional_context',
            type: 'textarea',
            label: 'Additional Information',
            description: 'Any other relevant information that might help us assist you',
            required: false,
            order: 10,
            sectionId: 'additional_info'
          },
          {
            id: 'support_files',
            type: 'file_upload',
            label: 'Supporting Files',
            description: 'Upload any screenshots or files that might help',
            required: false,
            order: 11,
            sectionId: 'additional_info'
          }
        ],
        sections: [
          {
            id: 'request_info',
            title: 'Request Information',
            description: 'Tell us about your support request',
            order: 1
          },
          {
            id: 'issue_details',
            title: 'Issue Details',
            description: 'Describe your issue in detail',
            order: 2
          },
          {
            id: 'troubleshooting',
            title: 'Troubleshooting',
            description: 'Help us understand what you have tried',
            order: 3
          },
          {
            id: 'additional_info',
            title: 'Additional Information',
            description: 'Any extra details that might help',
            order: 4
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
            description: 'Your email address for updates on this application',
            required: true,
            order: 0,
            sectionId: 'basic_application'
          },
          // Basic Application Info
          {
            id: 'position_type',
            type: 'dropdown',
            label: 'Position Applying For',
            description: 'Which staff position are you applying for?',
            required: true,
            options: ['Builder', 'Helper', 'Developer'],
            order: 1,
            sectionId: 'basic_application',
            optionSectionMapping: {
              'Builder': 'builder_section',
              'Helper': 'helper_section',
              'Developer': 'developer_section'
            }
          },
          // Personal Information
          {
            id: 'real_name',
            type: 'text',
            label: 'Real Name (First Name)',
            description: 'Your real first name',
            required: true,
            order: 2,
            sectionId: 'personal_info'
          },
          {
            id: 'age',
            type: 'text',
            label: 'Age',
            description: 'Your age',
            required: true,
            order: 3,
            sectionId: 'personal_info'
          },
          {
            id: 'timezone',
            type: 'text',
            label: 'Timezone',
            description: 'Your timezone (e.g., EST, PST, GMT)',
            required: true,
            order: 4,
            sectionId: 'personal_info'
          },
          {
            id: 'availability',
            type: 'textarea',
            label: 'Availability',
            description: 'When are you typically available? Include days and hours.',
            required: true,
            order: 5,
            sectionId: 'personal_info'
          },
          // General Questions
          {
            id: 'why_apply',
            type: 'textarea',
            label: 'Why are you applying?',
            description: 'Tell us why you want to join our staff team',
            required: true,
            order: 6,
            sectionId: 'general_questions'
          },
          {
            id: 'previous_experience',
            type: 'textarea',
            label: 'Previous Experience',
            description: 'Any relevant previous experience (gaming, moderation, development, etc.)',
            required: true,
            order: 7,
            sectionId: 'general_questions'
          },
          // Builder-specific fields
          {
            id: 'builder_experience',
            type: 'textarea',
            label: 'Building Experience',
            description: 'Describe your building experience and skills',
            required: true,
            order: 8,
            sectionId: 'builder_section'
          },
          {
            id: 'building_style',
            type: 'text',
            label: 'Building Style',
            description: 'What style of building do you specialize in?',
            required: true,
            order: 9,
            sectionId: 'builder_section'
          },
          {
            id: 'portfolio_link',
            type: 'text',
            label: 'Portfolio Link',
            description: 'Link to your building portfolio (optional)',
            required: false,
            order: 10,
            sectionId: 'builder_section'
          },
          // Helper-specific fields
          {
            id: 'moderation_experience',
            type: 'textarea',
            label: 'Moderation Experience',
            description: 'Describe any moderation or community management experience',
            required: true,
            order: 8,
            sectionId: 'helper_section'
          },
          {
            id: 'conflict_resolution',
            type: 'textarea',
            label: 'Conflict Resolution',
            description: 'How would you handle conflicts between players?',
            required: true,
            order: 9,
            sectionId: 'helper_section'
          },
          {
            id: 'player_help_scenario',
            type: 'textarea',
            label: 'Player Help Scenario',
            description: 'A new player asks for help understanding the rules. How would you assist them?',
            required: true,
            order: 10,
            sectionId: 'helper_section'
          },
          // Developer-specific fields
          {
            id: 'programming_languages',
            type: 'text',
            label: 'Programming Languages',
            description: 'What programming languages are you familiar with?',
            required: true,
            order: 8,
            sectionId: 'developer_section'
          },
          {
            id: 'minecraft_dev_experience',
            type: 'textarea',
            label: 'Minecraft Development Experience',
            description: 'Describe your experience with Minecraft plugin/mod development',
            required: true,
            order: 9,
            sectionId: 'developer_section'
          },
          {
            id: 'github_profile',
            type: 'text',
            label: 'GitHub Profile',
            description: 'Link to your GitHub profile (optional)',
            required: false,
            order: 10,
            sectionId: 'developer_section'
          },
          {
            id: 'dev_project_examples',
            type: 'textarea',
            label: 'Project Examples',
            description: 'Describe some projects you have worked on',
            required: true,
            order: 11,
            sectionId: 'developer_section'
          }
        ],
        sections: [
          {
            id: 'basic_application',
            title: 'Application Type',
            description: 'Select the position you are applying for',
            order: 1
          },
          {
            id: 'personal_info',
            title: 'Personal Information',
            description: 'Tell us about yourself',
            order: 2
          },
          {
            id: 'general_questions',
            title: 'General Questions',
            description: 'Questions for all applicants',
            order: 3
          },
          {
            id: 'builder_section',
            title: 'Builder Application',
            description: 'Additional questions for Builder applicants',
            order: 4,
            showIfFieldId: 'position_type',
            showIfValue: 'Builder'
          },
          {
            id: 'helper_section',
            title: 'Helper Application',
            description: 'Additional questions for Helper applicants',
            order: 5,
            showIfFieldId: 'position_type',
            showIfValue: 'Helper'
          },
          {
            id: 'developer_section',
            title: 'Developer Application',
            description: 'Additional questions for Developer applicants',
            order: 6,
            showIfFieldId: 'position_type',
            showIfValue: 'Developer'
          }
        ]
      }
    };
    defaultSettingsMap.set('ticketForms', defaultTicketForms);

    // Default Quick Responses Configuration
    const defaultQuickResponsesConfig = {
      categories: [
        {
          id: 'chat_report_actions',
          name: 'Chat Report Actions',
          ticketTypes: ['chat_report'],
          order: 1,
          actions: [
            {
              id: 'accept_chat_abuse',
              name: 'Accept - Chat Abuse',
              message: 'Thank you for creating this report. After careful review, we have accepted this and the reported player will be receiving a punishment for Chat Abuse.',
              order: 1,
              issuePunishment: true,
              punishmentTypeId: 8, // CHAT_ABUSE
              punishmentSeverity: 'regular',
              closeTicket: true,
            },
            {
              id: 'accept_anti_social',
              name: 'Accept - Anti Social',
              message: 'Thank you for creating this report. After careful review, we have accepted this and the reported player will be receiving a punishment for Anti Social behavior.',
              order: 2,
              issuePunishment: true,
              punishmentTypeId: 9, // ANTI_SOCIAL
              punishmentSeverity: 'regular',
              closeTicket: true,
            },
            {
              id: 'reject_insufficient_chat',
              name: 'Reject - Insufficient Evidence',
              message: 'Thank you for submitting this chat report. After reviewing the evidence provided, we need additional evidence to proceed with action.',
              order: 3,
              closeTicket: false,
            },
            {
              id: 'reject_no_violation_chat',
              name: 'Reject - No Violation',
              message: 'Thank you for submitting this chat report. After reviewing the evidence provided, we have determined that this does not violate our community guidelines.',
              order: 4,
              closeTicket: true,
            }
          ]
        },
        {
          id: 'player_report_actions',
          name: 'Player Report Actions',
          ticketTypes: ['player_report'],
          order: 2,
          actions: [
            {
              id: 'accept_team_abuse',
              name: 'Accept - Team Abuse',
              message: 'Thank you for creating this report. After careful review, we have accepted this and the reported player will be receiving a punishment for Team Abuse.',
              order: 1,
              issuePunishment: true,
              punishmentTypeId: 12, // TEAM_ABUSE
              punishmentSeverity: 'regular',
              closeTicket: true,
            },
            {
              id: 'accept_game_abuse',
              name: 'Accept - Game Abuse',
              message: 'Thank you for creating this report. After careful review, we have accepted this and the reported player will be receiving a punishment for Game Abuse.',
              order: 2,
              issuePunishment: true,
              punishmentTypeId: 13, // GAME_ABUSE
              punishmentSeverity: 'regular',
              closeTicket: true,
            },
            {
              id: 'accept_cheating',
              name: 'Accept - Cheating',
              message: 'Thank you for creating this report. After careful review, we have accepted this and the reported player will be receiving a punishment for Cheating.',
              order: 3,
              issuePunishment: true,
              punishmentTypeId: 14, // CHEATING
              punishmentSeverity: 'severe',
              closeTicket: true,
            },
            {
              id: 'accept_game_trading',
              name: 'Accept - Game Trading',
              message: 'Thank you for creating this report. After careful review, we have accepted this and the reported player will be receiving a punishment for Game Trading.',
              order: 4,
              issuePunishment: true,
              punishmentTypeId: 15, // GAME_TRADING
              punishmentSeverity: 'regular',
              closeTicket: true,
            },
            {
              id: 'accept_account_abuse',
              name: 'Accept - Account Abuse',
              message: 'Thank you for creating this report. After careful review, we have accepted this and the reported player will be receiving a punishment for Account Abuse.',
              order: 5,
              issuePunishment: true,
              punishmentTypeId: 16, // ACCOUNT_ABUSE
              punishmentSeverity: 'regular',
              closeTicket: true,
            },
            {
              id: 'accept_systems_abuse',
              name: 'Accept - Systems Abuse',
              message: 'Thank you for creating this report. After careful review, we have accepted this and the reported player will be receiving a punishment for Systems Abuse.',
              order: 6,
              issuePunishment: true,
              punishmentTypeId: 17, // SYSTEMS_ABUSE
              punishmentSeverity: 'regular',
              closeTicket: true,
            },
            {
              id: 'reject_insufficient_player',
              name: 'Reject - Insufficient Evidence',
              message: 'Thank you for submitting this player report. After reviewing the evidence provided, we need additional evidence to proceed with action.',
              order: 7,
              closeTicket: false,
            },
            {
              id: 'reject_no_violation_player',
              name: 'Reject - No Violation',
              message: 'Thank you for submitting this player report. After reviewing the evidence provided, we have determined that this does not violate our community guidelines.',
              order: 8,
              closeTicket: true,
            }
          ]
        },
        {
          id: 'appeal_actions',
          name: 'Appeal Actions',
          ticketTypes: ['appeal'],
          order: 2,
          actions: [
            {
              id: 'pardon_full',
              name: 'Pardon - Full',
              message: 'After reviewing your appeal, we have decided to remove the punishment completely. We apologize for any inconvenience.',
              order: 1,
              appealAction: 'pardon',
              closeTicket: true,
            },
            {
              id: 'reduce_punishment',
              name: 'Reduce Punishment',
              message: 'We have reviewed your appeal and decided to reduce the duration of your punishment. Please check your punishment details for the updated duration.',
              order: 2,
              appealAction: 'reduce',
              closeTicket: true,
            },
            {
              id: 'reject_upheld',
              name: 'Reject - Upheld',
              message: 'After careful consideration of your appeal, we have decided to uphold the original punishment.',
              order: 3,
              appealAction: 'reject',
              closeTicket: true,
            },
            {
              id: 'need_more_info_appeal',
              name: 'Need More Information',
              message: 'We need additional information to process your appeal. Please provide more details about your situation.',
              order: 4,
              closeTicket: false,
            }
          ]
        },
        {
          id: 'application_actions',
          name: 'Staff Application Actions',
          ticketTypes: ['application'],
          order: 3,
          actions: [
            {
              id: 'accept_builder',
              name: 'Accept - Builder',
              message: 'Congratulations! Your Builder application has been accepted. Welcome to the Builder team! You will receive further instructions and permissions shortly.',
              order: 1,
              closeTicket: true,
            },
            {
              id: 'accept_helper',
              name: 'Accept - Helper',
              message: 'Congratulations! Your Helper application has been accepted. Welcome to the Helper team! You will receive further instructions and permissions shortly.',
              order: 2,
              closeTicket: true,
            },
            {
              id: 'accept_developer',
              name: 'Accept - Developer',
              message: 'Congratulations! Your Developer application has been accepted. Welcome to the Developer team! You will receive further instructions and permissions shortly.',
              order: 3,
              closeTicket: true,
            },
            {
              id: 'reject_application',
              name: 'Reject Application',
              message: 'Thank you for your interest in joining our team. Unfortunately, we have decided not to move forward with your application at this time. You may reapply in the future.',
              order: 4,
              closeTicket: true,
            },
            {
              id: 'pending_review',
              name: 'Pending Review',
              message: 'Thank you for your application. We are currently reviewing it and will get back to you soon.',
              order: 5,
              closeTicket: false,
            },
            {
              id: 'interview_scheduled',
              name: 'Interview Scheduled',
              message: 'Your application has progressed to the interview stage. Please check your email for interview details.',
              order: 6,
              closeTicket: false,
            },
            {
              id: 'need_more_info_app',
              name: 'Need More Information',
              message: 'We need additional information about your application. Please provide more details about your experience and qualifications.',
              order: 7,
              closeTicket: false,
            }
          ]
        },
        {
          id: 'bug_actions',
          name: 'Bug Report Actions',
          ticketTypes: ['bug'],
          order: 4,
          actions: [
            {
              id: 'completed',
              name: 'Fixed',
              message: 'Thank you for reporting this bug. We have fixed the issue and it will be included in our next update.',
              order: 1,
              closeTicket: true,
            },
            {
              id: 'investigating',
              name: 'Investigating',
              message: 'Thank you for this bug report. We are currently investigating the issue and will provide updates as they become available.',
              order: 2,
              closeTicket: false,
            },
            {
              id: 'need_more_info',
              name: 'Need More Info',
              message: 'Thank you for this bug report. We need additional information to investigate this issue. Please provide more details about how to reproduce this bug.',
              order: 3,
              closeTicket: false,
            },
            {
              id: 'duplicate',
              name: 'Duplicate',
              message: 'This bug has been identified as a duplicate of an existing issue. We appreciate your report and are working on a fix.',
              order: 4,
              closeTicket: true,
            },
            {
              id: 'cannot_reproduce',
              name: 'Cannot Reproduce',
              message: 'We were unable to reproduce this issue. If you continue to experience this problem, please provide additional details.',
              order: 5,
              closeTicket: true,
            }
          ]
        },
        {
          id: 'support_actions',
          name: 'Support Actions',
          ticketTypes: ['support'],
          order: 5,
          actions: [
            {
              id: 'resolved',
              name: 'Resolved',
              message: 'Your support request has been resolved. If you need further assistance, please feel free to create a new ticket.',
              order: 1,
              closeTicket: true,
            },
            {
              id: 'escalated',
              name: 'Escalated',
              message: 'Your support request has been escalated to our specialized team. They will contact you with additional information.',
              order: 2,
              closeTicket: false,
            },
            {
              id: 'need_info_support',
              name: 'Need More Info',
              message: 'We need additional information to assist you with your request. Please provide more details about your issue.',
              order: 3,
              closeTicket: false,
            }
          ]
        },
        {
          id: 'general_actions',
          name: 'General Actions',
          ticketTypes: ['other'],
          order: 6,
          actions: [
            {
              id: 'acknowledge',
              name: 'Acknowledge',
              message: 'Thank you for your message. We have received your ticket and will review it shortly.',
              order: 1,
              closeTicket: false,
            },
            {
              id: 'follow_up',
              name: 'Follow Up',
              message: 'We are following up on your ticket. Please let us know if you have any additional information or questions.',
              order: 2,
              closeTicket: false,
            }
          ]
        }
      ]
    };
    defaultSettingsMap.set('quickResponses', defaultQuickResponsesConfig);
    
    const newSettingsDoc = new SettingsModel({ settings: defaultSettingsMap });
    await newSettingsDoc.save();
    return newSettingsDoc;
  } catch (error) {
    throw error;
  }
}

// Add this helper function after the createDefaultSettings function
async function cleanupOrphanedAIPunishmentConfigsHelper(dbConnection: Connection): Promise<void> {
  try {
    const SettingsModel = dbConnection.model<ISettingsDocument>('Settings');
    const settingsDoc = await SettingsModel.findOne({});
    
    if (!settingsDoc || !settingsDoc.settings) {
      return;
    }

    const allPunishmentTypes = settingsDoc.settings.get('punishmentTypes') || [];
    const aiSettings = settingsDoc.settings.get('aiModerationSettings') || {
      enableAutomatedActions: true,
      strictnessLevel: 'standard',
      aiPunishmentConfigs: {}
    };

    if (!aiSettings.aiPunishmentConfigs) {
      return;
    }

    // Get valid punishment type IDs
    const validPunishmentTypeIds = new Set(allPunishmentTypes.map((pt: IPunishmentType) => pt.id));
    
    // Find orphaned AI configs
    const orphanedConfigIds = Object.keys(aiSettings.aiPunishmentConfigs)
      .map(id => parseInt(id))
      .filter(id => !validPunishmentTypeIds.has(id));

    if (orphanedConfigIds.length > 0) {
      console.log(`[Settings] Cleaning up ${orphanedConfigIds.length} orphaned AI punishment configs:`, orphanedConfigIds);
      
      // Remove orphaned configs
      orphanedConfigIds.forEach(id => {
        delete aiSettings.aiPunishmentConfigs[id];
      });

      // Save updated settings
      settingsDoc.settings.set('aiModerationSettings', aiSettings);
      await settingsDoc.save();
      
      console.log(`[Settings] Successfully removed orphaned AI configs for punishment types:`, orphanedConfigIds);
    }
  } catch (error) {
    console.error('[Settings] Error cleaning up orphaned AI punishment configs:', error);
  }
}

router.get('/', checkPermission('admin.settings.view'), async (req: Request, res: Response) => {
  try {
    const models = getSettingsModels(req.serverDbConnection!);
    
    // Check if settings documents exist
    const settingsCount = await models.Settings.countDocuments({});
    
    if (settingsCount > 0) {
      // Get all settings
      const allSettings = await getAllSettings(req.serverDbConnection!);
      res.json({ settings: allSettings });
    } else {
      // Create default settings
      await createDefaultSettings(req.serverDbConnection!, req.modlServer?.serverName);
      const allSettings = await getAllSettings(req.serverDbConnection!);
      res.json({ settings: allSettings });
    }
  } catch (error) {
    console.error('Error in settings GET route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/', checkPermission('admin.settings.modify'), async (req: Request, res: Response) => {
  try {
    // Update settings documents
    await updateSettings(req.serverDbConnection!, req.body);
    
    // Clean up orphaned AI punishment configs if punishment types were updated
    if ('punishmentTypes' in req.body) {
      await cleanupOrphanedAIPunishmentConfigs(req.serverDbConnection!);
    }
    
    const allSettings = await getAllSettings(req.serverDbConnection!);
    res.json({ settings: allSettings });
  } catch (error) {
    console.error('Error in settings PATCH route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/reset', checkPermission('admin.settings.modify'), async (req: Request, res: Response) => {
  try {
    const models = getSettingsModels(req.serverDbConnection!);
    
    // Delete all settings documents
    await models.Settings.deleteMany({});
    
    // Create new default settings documents
    await createDefaultSettings(req.serverDbConnection!, req.modlServer?.serverName);
    
    // Ensure all default punishment types are added
    await addDefaultPunishmentTypes(req.serverDbConnection!);
    
    // Return the new settings
    const allSettings = await getAllSettings(req.serverDbConnection!);
    res.json({ settings: allSettings });
  } catch (error) {
    console.error('Error resetting settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Migration endpoint to fix ticketForms format
router.post('/migrate-ticket-forms', checkPermission('admin.settings.modify'), async (req: Request, res: Response) => {
  try {
    await migrateTicketForms(req.serverDbConnection!);
    res.json({ success: true, message: 'Ticket forms migration completed successfully' });
  } catch (error) {
    console.error('Error during ticket forms migration:', error);
    res.status(500).json({ success: false, error: 'Failed to migrate ticket forms' });
  }
});

// Unified API Key Management Routes - Moved before generic /:key route to prevent interception

// Get current unified API key (masked for security)
router.get('/api-key', checkPermission('admin.settings.view'), async (req: Request, res: Response) => {
  try {
    console.log('[Unified API Key GET] Request received');
    console.log('[Unified API Key GET] Server name:', req.serverName);
    console.log('[Unified API Key GET] DB connection exists:', !!req.serverDbConnection);
    
    const apiKeysData = await getSettingsValue(req.serverDbConnection!, 'apiKeys');
    const apiKey = apiKeysData?.api_key;
    
    console.log('[Unified API Key GET] API key found:', !!apiKey);
    console.log('[Unified API Key GET] API key exists:', !!apiKey);
    console.log('[Unified API Key GET] API key length:', apiKey ? apiKey.length : 0);
    
    if (!apiKey) {
      return res.json({ 
        hasApiKey: false,
        maskedKey: null
      });
    }
    
    // Return masked key for security (show only first 8 and last 4 characters)
    const maskedKey = apiKey.length > 12 
      ? `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`
      : apiKey; // For very short keys, don't mask
    
    console.log('[Unified API Key GET] Returning masked key:', maskedKey);
    
    res.json({ 
      hasApiKey: true,
      maskedKey: maskedKey
    });
  } catch (error) {
    console.error('[Unified API Key GET] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate new unified API key
router.post('/api-key/generate', checkPermission('admin.settings.modify'), async (req: Request, res: Response) => {
  try {
    console.log('[Unified API Key GENERATE] Request received');
    console.log('[Unified API Key GENERATE] Server name:', req.serverName);
    console.log('[Unified API Key GENERATE] DB connection exists:', !!req.serverDbConnection);
    
    const Settings = req.serverDbConnection!.model('Settings');
    
    // Generate new API key
    const newApiKey = generateTicketApiKey();
    console.log('[Unified API Key GENERATE] Generated new API key with length:', newApiKey.length);
    
    // Update or create API keys document (only store unified api_key)
    const apiKeysDoc = await Settings.findOneAndUpdate(
      { type: 'apiKeys' },
      { 
        type: 'apiKeys', 
        data: { 
          api_key: newApiKey 
        } 
      },
      { upsert: true, new: true }
    );
    
    console.log(`[Unified API Key GENERATE] Created/Updated API Keys Document:`, apiKeysDoc ? 'Success' : 'Failed');
    console.log(`[Unified API Key GENERATE] Stored API Key:`, apiKeysDoc?.data?.api_key ? 'Success' : 'Failed');
    
    console.log('[Unified API Key GENERATE] Saved new API key to apiKeys document');
    
    console.log('[Unified API Key GENERATE] Saved new API key to settings');
    
    // Return the full key only once (for copying)
    res.json({ 
      apiKey: newApiKey,
      message: 'New API key generated successfully. Please save this key as it will not be shown again.' 
    });
  } catch (error) {
    console.error('[Unified API Key GENERATE] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get full unified API key (for revealing/copying)
router.get('/api-key/reveal', checkPermission('admin.settings.view'), async (req: Request, res: Response) => {
  try {
    console.log('[Unified API Key REVEAL] Request received');
    console.log('[Unified API Key REVEAL] Server name:', req.serverName);
    
    const apiKeysData = await getSettingsValue(req.serverDbConnection!, 'apiKeys');
    const apiKey = apiKeysData?.api_key;
    
    if (!apiKey) {
      return res.status(404).json({ 
        error: 'API key not found'
      });
    }
    
    // Return the full key
    res.json({ 
      apiKey: apiKey
    });
  } catch (error) {
    console.error('[Unified API Key REVEAL] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Revoke unified API key
router.delete('/api-key', checkPermission('admin.settings.modify'), async (req: Request, res: Response) => {
  try {
    const Settings = req.serverDbConnection!.model('Settings');
    
    // Update API keys document to remove the api_key
    const apiKeysDoc = await Settings.findOne({ type: 'apiKeys' });
    if (apiKeysDoc && apiKeysDoc.data) {
      delete apiKeysDoc.data.api_key;
      await Settings.findOneAndUpdate(
        { type: 'apiKeys' },
        { type: 'apiKeys', data: apiKeysDoc.data },
        { new: true }
      );
    }
    
    res.json({ 
      message: 'API key revoked successfully' 
    });
  } catch (error) {
    console.error('Error revoking API key:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Legacy API Key Management Routes (for backward compatibility)

// Get current ticket API key (masked for security)
router.get('/ticket-api-key', checkPermission('admin.settings.view'), async (req: Request, res: Response) => {
  try {
    console.log('[Ticket API Key GET] Request received');
    console.log('[Ticket API Key GET] Server name:', req.serverName);
    console.log('[Ticket API Key GET] DB connection exists:', !!req.serverDbConnection);
    
    const Settings = req.serverDbConnection!.model<ISettingsDocument>('Settings');
    const settingsDoc = await Settings.findOne({});
    
    console.log('[Ticket API Key GET] Settings doc found:', !!settingsDoc);
    console.log('[Ticket API Key GET] Settings map exists:', !!settingsDoc?.settings);
    
    if (!settingsDoc || !settingsDoc.settings) {
      console.log('[Ticket API Key GET] No settings found, returning 404');
      return res.status(404).json({ error: 'Settings not found' });
    }
    
    const apiKey = settingsDoc.settings.get('ticket_api_key');
    console.log('[Ticket API Key GET] API key exists:', !!apiKey);
    console.log('[Ticket API Key GET] API key length:', apiKey ? apiKey.length : 0);
    
    if (!apiKey) {
      console.log('[Ticket API Key GET] No API key found, returning hasApiKey: false');
      return res.json({ 
        hasApiKey: false,
        maskedKey: null
      });
    }
    
    // Return masked key for security (show only first 8 and last 4 characters)
    const maskedKey = apiKey.length > 12 
      ? `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`
      : `${apiKey.substring(0, 4)}...`;
    
    console.log('[Ticket API Key GET] Returning masked key:', maskedKey);
    res.json({ 
      hasApiKey: true,
      maskedKey 
    });
  } catch (error) {
    console.error('Error fetching ticket API key:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate new ticket API key
router.post('/ticket-api-key/generate', checkPermission('admin.settings.modify'), async (req: Request, res: Response) => {
  try {
    console.log('[Ticket API Key GENERATE] Request received');
    console.log('[Ticket API Key GENERATE] Server name:', req.serverName);
    console.log('[Ticket API Key GENERATE] DB connection exists:', !!req.serverDbConnection);
    
    const Settings = req.serverDbConnection!.model('Settings');
    
    // Generate new API key
    const newApiKey = generateTicketApiKey();
    console.log('[Ticket API Key GENERATE] Generated new API key with length:', newApiKey.length);
    
    // Get existing API keys data
    const existingApiKeysDoc = await Settings.findOne({ type: 'apiKeys' });
    const currentApiKeys = existingApiKeysDoc?.data || {};
    
    // Update or create API keys document
    await Settings.findOneAndUpdate(
      { type: 'apiKeys' },
      { 
        type: 'apiKeys', 
        data: { 
          ...currentApiKeys,
          ticket_api_key: newApiKey 
        } 
      },
      { upsert: true, new: true }
    );
    console.log('[Ticket API Key GENERATE] Saved API key to database');
    
    // Verify it was saved
    const verifyDoc = await Settings.findOne({});
    const savedKey = verifyDoc?.settings.get('ticket_api_key');
    console.log('[Ticket API Key GENERATE] Verification - API key saved correctly:', !!savedKey);
    console.log('[Ticket API Key GENERATE] Verification - API key matches:', savedKey === newApiKey);
    
    // Return the full key only once (for copying)
    res.json({ 
      apiKey: newApiKey,
      message: 'New ticket API key generated successfully. Please save this key as it will not be shown again.' 
    });
  } catch (error) {
    console.error('Error generating ticket API key:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Revoke ticket API key
router.delete('/ticket-api-key', checkPermission('admin.settings.modify'), async (req: Request, res: Response) => {
  try {
    const Settings = req.serverDbConnection!.model<ISettingsDocument>('Settings');
    const settingsDoc = await Settings.findOne({});
    
    if (!settingsDoc || !settingsDoc.settings) {
      return res.status(404).json({ error: 'Settings not found' });
    }
    
    // Remove the API key
    settingsDoc.settings.delete('ticket_api_key');
    await settingsDoc.save();
    
    res.json({ 
      message: 'Ticket API key revoked successfully' 
    });
  } catch (error) {
    console.error('Error revoking ticket API key:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Minecraft API Key Management Routes

// Get current minecraft API key (masked for security)
router.get('/minecraft-api-key', checkPermission('admin.settings.view'), async (req: Request, res: Response) => {
  try {
    const Settings = req.serverDbConnection!.model<ISettingsDocument>('Settings');
    const settingsDoc = await Settings.findOne({});
    
    if (!settingsDoc || !settingsDoc.settings) {
      return res.status(404).json({ error: 'Settings not found' });
    }
    
    const apiKey = settingsDoc.settings.get('minecraft_api_key');
    
    if (!apiKey) {
      return res.json({ 
        hasApiKey: false,
        maskedKey: null
      });
    }
    
    // Return masked key for security (show only first 8 and last 4 characters)
    const maskedKey = apiKey.length > 12 
      ? `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`
      : `${apiKey.substring(0, 4)}...`;
    
    res.json({ 
      hasApiKey: true,
      maskedKey 
    });
  } catch (error) {
    console.error('Error fetching minecraft API key:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate new minecraft API key
router.post('/minecraft-api-key/generate', checkPermission('admin.settings.modify'), async (req: Request, res: Response) => {
  try {
    const Settings = req.serverDbConnection!.model('Settings');
    
    // Generate new API key (using same function as ticket API key)
    const newApiKey = generateTicketApiKey();
    
    // Get existing API keys data
    const existingApiKeysDoc = await Settings.findOne({ type: 'apiKeys' });
    const currentApiKeys = existingApiKeysDoc?.data || {};
    
    // Update or create API keys document
    await Settings.findOneAndUpdate(
      { type: 'apiKeys' },
      { 
        type: 'apiKeys', 
        data: { 
          ...currentApiKeys,
          minecraft_api_key: newApiKey 
        } 
      },
      { upsert: true, new: true }
    );
    
    // Return the full key only once (for copying)
    res.json({ 
      apiKey: newApiKey,
      message: 'New minecraft API key generated successfully. Please save this key as it will not be shown again.' 
    });
  } catch (error) {
    console.error('Error generating minecraft API key:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Revoke minecraft API key
router.delete('/minecraft-api-key', checkPermission('admin.settings.modify'), async (req: Request, res: Response) => {
  try {
    const Settings = req.serverDbConnection!.model<ISettingsDocument>('Settings');
    const settingsDoc = await Settings.findOne({});
    
    if (!settingsDoc || !settingsDoc.settings) {
      return res.status(404).json({ error: 'Settings not found' });
    }
    
    // Remove the API key
    settingsDoc.settings.delete('minecraft_api_key');
    await settingsDoc.save();
    
    res.json({ 
      message: 'Minecraft API key revoked successfully' 
    });
  } catch (error) {
    console.error('Error revoking minecraft API key:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get AI punishment types (combines existing punishment types with AI configs)
router.get('/ai-punishment-types', checkPermission('admin.settings.view'), async (req: Request, res: Response) => {
  try {
    if (!req.serverDbConnection) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const settings = await getMultipleSettingsValues(req.serverDbConnection, ['aiModerationSettings', 'punishmentTypes']);
    
    const aiSettings = settings.aiModerationSettings || {
      enableAutomatedActions: true,
      strictnessLevel: 'standard',
      aiPunishmentConfigs: {}
    };

    const allPunishmentTypes = settings.punishmentTypes || [];
    
    const aiPunishmentConfigs = aiSettings.aiPunishmentConfigs || {};

    // Combine punishment types with AI configurations
    const aiEnabledTypes = allPunishmentTypes
      .filter((pt: IPunishmentType) => {
        const hasConfig = aiPunishmentConfigs[pt.ordinal];
        const isEnabled = hasConfig && aiPunishmentConfigs[pt.ordinal].enabled;
        return hasConfig && isEnabled;
      })
      .map((pt: IPunishmentType) => ({
        id: pt.id,
        ordinal: pt.ordinal,
        name: pt.name,
        category: pt.category,
        aiDescription: aiPunishmentConfigs[pt.ordinal].aiDescription,
        enabled: true
      }));

    res.json({ success: true, data: aiEnabledTypes });
  } catch (error) {
    console.error('Error fetching AI punishment types:', error);
    res.status(500).json({ error: 'Failed to fetch AI punishment types' });
  }
});

// Add/Enable AI punishment type
router.post('/ai-punishment-types', checkPermission('admin.settings.modify'), async (req: Request, res: Response) => {
  try {
    if (!req.serverDbConnection) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { punishmentTypeId, aiDescription = '' } = req.body;

    if (punishmentTypeId === undefined || punishmentTypeId === null) {
      return res.status(400).json({ error: 'punishmentTypeId is required' });
    }

    const settings = await getMultipleSettingsValues(req.serverDbConnection, ['punishmentTypes', 'aiModerationSettings']);
    const allPunishmentTypes = settings.punishmentTypes || [];
    
    const punishmentType = allPunishmentTypes.find((pt: IPunishmentType) => pt.ordinal === punishmentTypeId);

    if (!punishmentType) {
      return res.status(404).json({ error: 'Punishment type not found. It may have been deleted. Please refresh and try again.' });
    }

    if (!punishmentType.isCustomizable) {
      return res.status(400).json({ error: 'Only customizable punishment types can be enabled for AI moderation' });
    }

    const aiSettings = settings.aiModerationSettings || {
      enableAutomatedActions: true,
      strictnessLevel: 'standard',
      aiPunishmentConfigs: {}
    };

    if (aiSettings.aiPunishmentConfigs?.[punishmentTypeId]?.enabled) {
      return res.status(409).json({ error: 'Punishment type is already enabled for AI moderation' });
    }

    // Create a new AI settings object to avoid mutation issues with Mongoose change detection
    const newAiSettings = {
      ...aiSettings,
      aiPunishmentConfigs: {
        ...(aiSettings.aiPunishmentConfigs || {}),
        [punishmentTypeId]: {
          enabled: true,
          aiDescription: aiDescription,
        },
      },
    };

    // Update using the new structure
    await updateSeparateDocuments(req.serverDbConnection, { aiModerationSettings: newAiSettings });

    // Verify the save by re-reading the document
    const verificationSettings = await getSettingsValue(req.serverDbConnection, 'aiModerationSettings');

    const responseData = {
      id: punishmentType.id,
      ordinal: punishmentType.ordinal,
      name: punishmentType.name,
      category: punishmentType.category,
      aiDescription: aiDescription,
      enabled: true
    };

    res.json({ success: true, message: 'AI punishment type enabled successfully', data: responseData });
  } catch (error) {
    console.error('Error enabling AI punishment type:', error);
    res.status(500).json({ error: 'Failed to enable AI punishment type' });
  }
});

// Update AI punishment type configuration - ADMIN ONLY
router.put('/ai-punishment-types/:id', isAuthenticated, checkRole(['Super Admin', 'Admin']), async (req: Request, res: Response) => {
  try {
    if (!req.serverDbConnection) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const punishmentTypeId = parseInt(req.params.id);
    const { aiDescription, enabled } = req.body;

    if (isNaN(punishmentTypeId)) {
      return res.status(400).json({ error: 'Invalid punishment type ID' });
    }

    const SettingsModel = req.serverDbConnection.model<ISettingsDocument>('Settings');
    const settingsDoc = await SettingsModel.findOne({});

    if (!settingsDoc || !settingsDoc.settings) {
      return res.status(404).json({ error: 'Settings not found' });
    }

    const allPunishmentTypes = settingsDoc.settings.get('punishmentTypes') || [];
    const punishmentType = allPunishmentTypes.find((pt: IPunishmentType) => pt.ordinal === punishmentTypeId);

    if (!punishmentType) {
      // Clean up orphaned config and return error
      const aiSettings = settingsDoc.settings.get('aiModerationSettings') || {
        enableAutomatedActions: true,
        strictnessLevel: 'standard',
        aiPunishmentConfigs: {}
      };
      
      if (aiSettings.aiPunishmentConfigs?.[punishmentTypeId]) {
        delete aiSettings.aiPunishmentConfigs[punishmentTypeId];
        settingsDoc.settings.set('aiModerationSettings', aiSettings);
        await settingsDoc.save();
      }
      
      return res.status(404).json({ error: 'Punishment type not found. It may have been deleted. The configuration has been cleaned up.' });
    }

    const aiSettings = settingsDoc.settings.get('aiModerationSettings') || {
      enableAutomatedActions: true,
      strictnessLevel: 'standard',
      aiPunishmentConfigs: {}
    };

    // Create a new AI settings object to avoid mutation issues
    const newAiSettings = {
      ...aiSettings,
      aiPunishmentConfigs: {
        ...(aiSettings.aiPunishmentConfigs || {}),
        [punishmentTypeId]: {
          ...(aiSettings.aiPunishmentConfigs?.[punishmentTypeId] || { enabled: false, aiDescription: '' }),
          ...(aiDescription !== undefined && { aiDescription }),
          ...(enabled !== undefined && { enabled }),
        },
      },
    };

    settingsDoc.settings.set('aiModerationSettings', newAiSettings);
    settingsDoc.markModified('settings');
    await settingsDoc.save();

    const responseData = {
      id: punishmentType.id,
      ordinal: punishmentType.ordinal,
      name: punishmentType.name,
      category: punishmentType.category,
      aiDescription: newAiSettings.aiPunishmentConfigs[punishmentTypeId].aiDescription,
      enabled: newAiSettings.aiPunishmentConfigs[punishmentTypeId].enabled
    };

    res.json({ 
      success: true, 
      message: 'AI punishment type updated successfully', 
      data: responseData
    });
  } catch (error) {
    console.error('Error updating AI punishment type:', error);
    res.status(500).json({ error: 'Failed to update AI punishment type' });
  }
});

// Remove/Disable AI punishment type - ADMIN ONLY
router.delete('/ai-punishment-types/:id', isAuthenticated, checkRole(['Super Admin', 'Admin']), async (req: Request, res: Response) => {
  try {
    if (!req.serverDbConnection) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const punishmentTypeId = parseInt(req.params.id);

    if (isNaN(punishmentTypeId)) {
      return res.status(400).json({ error: 'Invalid punishment type ID' });
    }

    const SettingsModel = req.serverDbConnection.model<ISettingsDocument>('Settings');
    const settingsDoc = await SettingsModel.findOne({});

    if (!settingsDoc || !settingsDoc.settings) {
      return res.status(404).json({ error: 'Settings not found' });
    }

    const aiSettings = settingsDoc.settings.get('aiModerationSettings') || {
      enableAutomatedActions: true,
      strictnessLevel: 'standard',
      aiPunishmentConfigs: {}
    };

    // Check if configuration exists
    if (!aiSettings.aiPunishmentConfigs?.[punishmentTypeId]) {
      return res.status(404).json({ error: 'AI punishment configuration not found' });
    }

    // Create new object with the property removed to avoid mutation
    const { [punishmentTypeId]: _, ...remainingConfigs } = aiSettings.aiPunishmentConfigs;
    const newAiSettings = {
        ...aiSettings,
        aiPunishmentConfigs: remainingConfigs
    };

    settingsDoc.settings.set('aiModerationSettings', newAiSettings);
    settingsDoc.markModified('settings');
    await settingsDoc.save();

    res.json({ success: true, message: 'AI punishment type disabled successfully' });
  } catch (error) {
    console.error('Error disabling AI punishment type:', error);
    res.status(500).json({ error: 'Failed to disable AI punishment type' });
  }
});

// Debug route to test if settings routes are working - ADMIN ONLY
router.get('/debug', isAuthenticated, checkRole(['Super Admin']), async (req: Request, res: Response) => {
  try {
    const models = getSettingsModels(req.serverDbConnection!);
    
    // Check what documents exist
    const settingsCount = await models.Settings.countDocuments({});
    
    // Get all settings documents
    const allSections = await models.Settings.find({});
    
    // Get punishment types specifically
    const punishmentTypesDoc = await models.Settings.findOne({ type: 'punishmentTypes' });
    
    res.json({ 
      message: 'Settings routes are working', 
      timestamp: new Date().toISOString(),
      settingsCount,
      sections: allSections.map(s => ({ type: s.type, dataLength: Array.isArray(s.data) ? s.data.length : Object.keys(s.data || {}).length })),
      punishmentTypesCount: punishmentTypesDoc?.data?.length || 0,
      punishmentTypesSample: punishmentTypesDoc?.data?.slice(0, 3) || []
    });
  } catch (error) {
    res.json({ message: 'Debug route error', error: error.message, timestamp: new Date().toISOString() });
  }
});

// Get available punishment types for adding to AI (excludes already enabled ones)
router.get('/available-punishment-types', checkPermission('admin.settings.view'), async (req: Request, res: Response) => {
  try {
    if (!req.serverDbConnection) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const settings = await getMultipleSettingsValues(req.serverDbConnection, ['punishmentTypes', 'aiModerationSettings']);
    
    const allPunishmentTypes = settings.punishmentTypes || [];
    const aiSettings = settings.aiModerationSettings || { aiPunishmentConfigs: {} };
    const aiPunishmentConfigs = aiSettings.aiPunishmentConfigs || {};
    
    // Filter out punishment types that are already enabled for AI and only include customizable ones
    const availableTypes = allPunishmentTypes
      .filter((pt: IPunishmentType) => 
        pt.isCustomizable && (!aiPunishmentConfigs[pt.ordinal] || !aiPunishmentConfigs[pt.ordinal].enabled)
      )
      .map((pt: IPunishmentType) => ({
        id: pt.id,
        ordinal: pt.ordinal,
        name: pt.name,
        category: pt.category
      }));

    res.json({ success: true, data: availableTypes });
  } catch (error) {
    console.error('Error fetching available punishment types:', error);
    res.status(500).json({ error: 'Failed to fetch available punishment types' });
  }
});

// Get AI moderation settings
router.get('/ai-moderation-settings', checkPermission('admin.settings.view'), async (req: Request, res: Response) => {
  try {
    if (!req.serverDbConnection) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const aiSettings = await getSettingsValue(req.serverDbConnection, 'aiModerationSettings') || {
      enableAIReview: true,
      enableAutomatedActions: true,
      strictnessLevel: 'standard'
    };

    res.json({ success: true, data: aiSettings });
  } catch (error) {
    console.error('Error fetching AI moderation settings:', error);
    res.status(500).json({ error: 'Failed to fetch AI moderation settings' });
  }
});

// Update AI moderation settings
router.put('/ai-moderation-settings', async (req: Request, res: Response) => {
  try {
    if (!req.serverDbConnection) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { enableAIReview, enableAutomatedActions, strictnessLevel, aiPunishmentConfigs } = req.body;

    // Validate input
    if (enableAIReview !== undefined && typeof enableAIReview !== 'boolean') {
      return res.status(400).json({ error: 'enableAIReview must be a boolean' });
    }

    if (typeof enableAutomatedActions !== 'boolean') {
      return res.status(400).json({ error: 'enableAutomatedActions must be a boolean' });
    }

    if (!['lenient', 'standard', 'strict'].includes(strictnessLevel)) {
      return res.status(400).json({ error: 'strictnessLevel must be lenient, standard, or strict' });
    }

    const SettingsModel = req.serverDbConnection.model('Settings');
    
    // Get current AI moderation settings
    const currentDoc = await SettingsModel.findOne({ type: 'aiModerationSettings' });
    const currentSettings = currentDoc?.data || {
      enableAIReview: true,
      enableAutomatedActions: true,
      strictnessLevel: 'standard',
      aiPunishmentConfigs: {}
    };

    // Update with new values, preserving aiPunishmentConfigs if not provided
    const updatedSettings = {
      enableAIReview: enableAIReview !== undefined ? enableAIReview : currentSettings.enableAIReview,
      enableAutomatedActions,
      strictnessLevel,
      aiPunishmentConfigs: aiPunishmentConfigs || currentSettings.aiPunishmentConfigs || {}
    };

    await SettingsModel.findOneAndUpdate(
      { type: 'aiModerationSettings' },
      { 
        type: 'aiModerationSettings',
        data: updatedSettings 
      },
      { upsert: true }
    );

    res.json({ success: true, message: 'AI moderation settings updated successfully' });
  } catch (error) {
    console.error('Error updating AI moderation settings:', error);
    res.status(500).json({ error: 'Failed to update AI moderation settings' });
  }
});

// Manual cleanup endpoint for orphaned AI punishment configurations
router.post('/cleanup-ai-configs', async (req: Request, res: Response) => {
  try {
    if (!req.serverDbConnection) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    await cleanupOrphanedAIPunishmentConfigs(req.serverDbConnection);
    
    res.json({ 
      success: true, 
      message: 'AI punishment configuration cleanup completed successfully' 
    });
  } catch (error) {
    console.error('Error during AI config cleanup:', error);
    res.status(500).json({ error: 'Failed to cleanup AI configurations' });
  }
});

// Apply AI-suggested punishment to a player
router.post('/ai-apply-punishment/:ticketId', async (req: Request, res: Response) => {
  try {
    if (!req.serverDbConnection) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { ticketId } = req.params;
    
    // Get staff information from session (more secure than request body)
    if (!req.currentUser) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const staffName = req.currentUser.username;
    const staffRole = req.currentUser.role;

    // Get the ticket with AI analysis
    const TicketModel = req.serverDbConnection.model('Ticket');
    const ticket = await TicketModel.findById(ticketId);

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const aiAnalysis = ticket.data?.get ? ticket.data.get('aiAnalysis') : ticket.data?.aiAnalysis;
    if (!aiAnalysis || !aiAnalysis.suggestedAction) {
      return res.status(400).json({ error: 'No AI suggestion found for this ticket' });
    }

    if (aiAnalysis.wasAppliedAutomatically) {
      return res.status(400).json({ error: 'Punishment was already applied' });
    }

    // Get the reported player identifier (prefer UUID, fallback to name)
    const reportedPlayerUuid = ticket.reportedPlayerUuid || ticket.data?.get?.('reportedPlayerUuid') || ticket.data?.reportedPlayerUuid;
    const reportedPlayer = ticket.reportedPlayer || ticket.data?.get?.('reportedPlayer') || ticket.data?.reportedPlayer;
    const playerIdentifier = reportedPlayerUuid || reportedPlayer;

    if (!playerIdentifier) {
      return res.status(400).json({ error: 'No reported player found for this ticket' });
    }

    // Initialize punishment service and apply the punishment
    const punishmentService = new PunishmentService(req.serverDbConnection);
    const punishmentResult = await punishmentService.applyPunishment(
      playerIdentifier,
      aiAnalysis.suggestedAction.punishmentTypeId,
      aiAnalysis.suggestedAction.severity,
      `AI-suggested moderation (applied by ${staffName}) - ${aiAnalysis.analysis}`,
      ticketId,
      staffName
    );

    if (!punishmentResult.success) {
      return res.status(500).json({ 
        error: `Failed to apply punishment: ${punishmentResult.error}` 
      });
    }

    // Update the AI analysis to mark it as manually applied
    aiAnalysis.wasAppliedAutomatically = true; // Mark as applied (even though manually)
    aiAnalysis.appliedBy = staffName;
    aiAnalysis.appliedByRole = staffRole;
    aiAnalysis.appliedAt = new Date();
    aiAnalysis.appliedPunishmentId = punishmentResult.punishmentId;

    ticket.data.set('aiAnalysis', aiAnalysis);
    await ticket.save();

    console.log(`[AI Moderation] Manual punishment application approved for ticket ${ticketId} by ${staffName} (${staffRole}), punishment ID: ${punishmentResult.punishmentId}`);

    res.json({ 
      success: true, 
      message: 'AI-suggested punishment applied successfully',
      punishmentId: punishmentResult.punishmentId,
      punishmentData: {
        punishmentTypeId: aiAnalysis.suggestedAction.punishmentTypeId,
        severity: aiAnalysis.suggestedAction.severity,
        reason: `AI-suggested moderation (applied by ${staffName}) - ${aiAnalysis.analysis}`,
        ticketId: ticketId,
        staffName: staffName,
        staffRole: staffRole
      }
    });
  } catch (error) {
    console.error('Error applying AI-suggested punishment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Dismiss AI suggestion for a ticket
router.post('/ai-dismiss-suggestion/:ticketId', async (req: Request, res: Response) => {
  try {
    if (!req.serverDbConnection) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { ticketId } = req.params;
    const { reason } = req.body; // Only accept reason from body, not staff name
    
    // Get staff information from session (more secure than request body)
    if (!req.currentUser) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const staffName = req.currentUser.username;
    const staffRole = req.currentUser.role;

    // Get the ticket with AI analysis
    const TicketModel = req.serverDbConnection.model('Ticket');
    const ticket = await TicketModel.findById(ticketId);

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const aiAnalysis = ticket.data?.get ? ticket.data.get('aiAnalysis') : ticket.data?.aiAnalysis;
    if (!aiAnalysis) {
      return res.status(400).json({ error: 'No AI analysis found for this ticket' });
    }

    if (aiAnalysis.wasAppliedAutomatically) {
      return res.status(400).json({ error: 'Cannot dismiss - punishment was already applied' });
    }

    if (aiAnalysis.dismissed) {
      return res.status(400).json({ error: 'AI suggestion was already dismissed' });
    }

    // Mark the suggestion as dismissed
    aiAnalysis.dismissed = true;
    aiAnalysis.dismissedBy = staffName;
    aiAnalysis.dismissedByRole = staffRole;
    aiAnalysis.dismissedAt = new Date();
    aiAnalysis.dismissalReason = reason || 'No reason provided';

    ticket.data.set('aiAnalysis', aiAnalysis);
    await ticket.save();

    console.log(`[AI Moderation] AI suggestion dismissed for ticket ${ticketId} by ${staffName} (${staffRole}). Reason: ${aiAnalysis.dismissalReason}`);

    res.json({ 
      success: true, 
      message: 'AI suggestion dismissed successfully'
    });
  } catch (error) {
    console.error('Error dismissing AI suggestion:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get AI analysis for a specific ticket
router.get('/ai-analysis/:ticketId', async (req: Request, res: Response) => {
  try {
    if (!req.serverDbConnection) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { ticketId } = req.params;

    // Get the ticket with AI analysis
    const TicketModel = req.serverDbConnection.model('Ticket');
    const ticket = await TicketModel.findById(ticketId);

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const aiAnalysis = ticket.data?.get ? ticket.data.get('aiAnalysis') : ticket.data?.aiAnalysis;
    
    if (!aiAnalysis) {
      return res.status(404).json({ error: 'No AI analysis found for this ticket' });
    }

    res.json({ 
      success: true, 
      data: aiAnalysis
    });
  } catch (error) {
    console.error('Error fetching AI analysis:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:key', async (req: Request<{ key: string }>, res: Response) => {
  try {
    const Settings = req.serverDbConnection!.model<ISettingsDocument>('Settings');
    const settingsDoc = await Settings.findOne({});
    if (!settingsDoc || !settingsDoc.settings || !settingsDoc.settings.has(req.params.key)) {
      return res.status(404).json({ error: `Setting key '${req.params.key}' not found` });
    }
    res.json({ key: req.params.key, value: settingsDoc.settings.get(req.params.key) });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:key', checkPermission('admin.settings.modify'), async (req: Request<{ key: string }, {}, { value: any }>, res: Response) => {
  try {
    const Settings = req.serverDbConnection!.model<ISettingsDocument>('Settings');
    let settingsDoc = await Settings.findOne({});
    if (!settingsDoc) {
      settingsDoc = await createDefaultSettings(req.serverDbConnection!, req.modlServer?.serverName);
    }
    if (!settingsDoc || !settingsDoc.settings) { // Should not happen
        return res.status(500).json({ error: 'Failed to retrieve or create settings document for update' });
    }
    settingsDoc.settings.set(req.params.key, req.body.value);
    await settingsDoc.save();
    
    // Clean up orphaned AI punishment configs if punishment types were updated
    if (req.params.key === 'punishmentTypes') {
      await cleanupOrphanedAIPunishmentConfigs(req.serverDbConnection!);
    }
    
    res.json({ key: req.params.key, value: settingsDoc.settings.get(req.params.key) });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check if file is an image
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  }
});

// File upload endpoint for server icons
router.post('/upload-icon', checkPermission('admin.settings.modify'), upload.single('icon'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { iconType } = req.query;
    if (!iconType || (iconType !== 'homepage' && iconType !== 'panel')) {
      return res.status(400).json({ error: 'Invalid or missing iconType parameter. Must be "homepage" or "panel"' });
    }

    const serverName = req.serverName;
    if (!serverName) {
      return res.status(500).json({ error: 'Server name not found' });
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), 'uploads', serverName);
    try {
      await mkdir(uploadsDir, { recursive: true });
    } catch (error) {
      // Directory might already exist, ignore error
    }

    // Generate filename with timestamp to avoid caching issues
    const fileExtension = path.extname(req.file.originalname) || '.png';
    const fileName = `${iconType}-icon-${Date.now()}${fileExtension}`;
    const filePath = path.join(uploadsDir, fileName);

    // Save file to disk
    await writeFile(filePath, req.file.buffer);

    // Generate URL for the uploaded file
    const fileUrl = `/uploads/${serverName}/${fileName}`;

    res.json({ 
      success: true, 
      url: fileUrl,
      iconType: iconType
    });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Function to add default Social and Gameplay punishment types during provisioning
export async function addDefaultPunishmentTypes(dbConnection: Connection): Promise<void> {
  try {
    const models = getSettingsModels(dbConnection);
    
    // Get existing punishment types from the separate document
    const punishmentTypesDoc = await models.Settings.findOne({ type: 'punishmentTypes' });
    const existingTypes = punishmentTypesDoc?.data || [];
    
    // Create a map of existing types by ordinal for quick lookup
    const existingTypesMap = new Map();
    existingTypes.forEach((type: IPunishmentType) => {
      existingTypesMap.set(type.ordinal, type);
    });
    
    // Check if we already have all default Social and Gameplay types
    // Instead of skipping entirely, check for specific missing types
    const requiredSocialOrdinals = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
    const requiredGameplayOrdinals = [6, 7, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51];
    
    const missingSocialTypes = requiredSocialOrdinals.filter(ordinal => !existingTypesMap.has(ordinal));
    const missingGameplayTypes = requiredGameplayOrdinals.filter(ordinal => !existingTypesMap.has(ordinal));
    
    if (missingSocialTypes.length === 0 && missingGameplayTypes.length === 0) {
      console.log('All default punishment types already exist, skipping creation');
      return;
    }
    
    console.log(`Missing social types: ${missingSocialTypes.length}, missing gameplay types: ${missingGameplayTypes.length}`);

    // Default Social punishment types (customizable, ordered as requested)
    const defaultSocialTypes: IPunishmentType[] = [
      { 
        id: 8, 
        name: 'Chat Abuse', 
        category: 'Social', 
        isCustomizable: true, 
        ordinal: 6,
        durations: {
          low: { first: { value: 6, unit: 'hours', type: 'mute' }, medium: { value: 1, unit: 'days', type: 'mute' }, habitual: { value: 3, unit: 'days', type: 'mute' } },
          regular: { first: { value: 1, unit: 'days', type: 'mute' }, medium: { value: 3, unit: 'days', type: 'mute' }, habitual: { value: 7, unit: 'days', type: 'mute' } },
          severe: { first: { value: 3, unit: 'days', type: 'mute' }, medium: { value: 7, unit: 'days', type: 'mute' }, habitual: { value: 14, unit: 'days', type: 'mute' } }
        },
        points: { low: 1, regular: 1, severe: 2 },
        staffDescription: 'Inappropriate language, excessive caps, or disruptive chat behavior.',
        playerDescription: 'Public chat channels are reserved for decent messages. Review acceptable public chat decorum here: https://www.server.com/rules#chat',
        canBeAltBlocking: false,
        canBeStatWiping: false,
        appealForm: {
          fields: [
            {
              id: 'why',
              type: 'textarea',
              label: 'Why should this punishment be amended?',
              description: 'Please provide context and any relevant information to support your appeal',
              required: true,
              order: 1
            }
          ]
        }
      },
      { 
        id: 9, 
        name: 'Anti Social', 
        category: 'Social', 
        isCustomizable: true, 
        ordinal: 7,
        durations: {
          low: { first: { value: 3, unit: 'days', type: 'mute' }, medium: { value: 7, unit: 'days', type: 'mute' }, habitual: { value: 14, unit: 'days', type: 'mute' } },
          regular: { first: { value: 7, unit: 'days', type: 'mute' }, medium: { value: 30, unit: 'days', type: 'mute' }, habitual: { value: 90, unit: 'days', type: 'mute' } },
          severe: { first: { value: 30, unit: 'days', type: 'mute' }, medium: { value: 90, unit: 'days', type: 'mute' }, habitual: { value: 180, unit: 'days', type: 'mute' } }
        },
        points: { low: 2, regular: 3, severe: 4 },
        staffDescription: 'Hostile, toxic, or antisocial behavior that creates a negative environment.',
        playerDescription: 'Anti-social and disruptive behavior is strictly prohibited from public channels. If you would not want your mom to hear it, keep it yourself!',
        canBeAltBlocking: false,
        canBeStatWiping: false,
        appealForm: {
          fields: [
            {
              id: 'why',
              type: 'textarea',
              label: 'Why should this punishment be amended?',
              description: 'Please provide context and any relevant information to support your appeal',
              required: true,
              order: 1
            }
          ]
        }
      },
      { 
        id: 10, 
        name: 'Targeting', 
        category: 'Social', 
        isCustomizable: true, 
        ordinal: 8,
        durations: {
          low: { first: { value: 7, unit: 'days', type: 'ban' }, medium: { value: 14, unit: 'days', type: 'ban' }, habitual: { value: 30, unit: 'days', type: 'ban' } },
          regular: { first: { value: 30, unit: 'days', type: 'ban' }, medium: { value: 90, unit: 'days', type: 'ban' }, habitual: { value: 180, unit: 'days', type: 'ban' } },
          severe: { first: { value: 90, unit: 'days', type: 'ban' }, medium: { value: 180, unit: 'days', type: 'ban' }, habitual: { value: 365, unit: 'days', type: 'ban' } }
        },
        points: { low: 4, regular: 6, severe: 10 },
        staffDescription: 'Persistent harassment, bullying, or targeting of specific players with malicious intent.',
        playerDescription: 'This server has a zero tolerance policy on targeting individuals regardless of the basis or medium. This policy encompasses Harassment, Torment, Threats, and Cyber attacks.',
        canBeAltBlocking: true,
        canBeStatWiping: false,
        appealForm: {
          fields: [
            {
              id: 'why',
              type: 'textarea',
              label: 'Why should this punishment be amended?',
              description: 'Please provide context and any relevant information to support your appeal',
              required: true,
              order: 1
            }
          ]
        }
      },
      { 
        id: 11, 
        name: 'Bad Content', 
        category: 'Social', 
        isCustomizable: true, 
        ordinal: 9,
        durations: {
          low: { first: { value: 1, unit: 'days', type: 'ban' }, medium: { value: 7, unit: 'days', type: 'ban' }, habitual: { value: 14, unit: 'days', type: 'ban' } },
          regular: { first: { value: 7, unit: 'days', type: 'ban' }, medium: { value: 14, unit: 'days', type: 'ban' }, habitual: { value: 30, unit: 'days', type: 'ban' } },
          severe: { first: { value: 30, unit: 'days', type: 'ban' }, medium: { value: 60, unit: 'days', type: 'ban' }, habitual: { value: 90, unit: 'days', type: 'ban' } }
        },
        points: { low: 3, regular: 4, severe: 5 },
        staffDescription: 'Inappropriate content including builds, signs, books, or other user-generated content.',
        playerDescription: 'Creating obscene, insensitive, or hateful content in-game is strictly prohibited. This extends to builds, books, item-names, name-tags, and signs.',
        canBeAltBlocking: false,
        canBeStatWiping: false,
        appealForm: {
          fields: [
            {
              id: 'why',
              type: 'textarea',
              label: 'Why should this punishment be amended?',
              description: 'Please provide context and any relevant information to support your appeal',
              required: true,
              order: 1
            }
          ]
        }
      },      { 
        id: 6, 
        name: 'Bad Skin', 
        category: 'Social', 
        isCustomizable: true, 
        ordinal: 10,
        customPoints: 2,
        staffDescription: 'Inappropriate Minecraft skin that contains offensive imagery.',
        playerDescription: 'Please help us maintain a safe environment for players of all ages and backgrounds by refraining from the use of obscene/insensitive skins. Change your skin at https://www.minecraft.net',
        canBeAltBlocking: false,
        canBeStatWiping: false,
        permanentUntilSkinChange: true,
        appealForm: {
          fields: [
            {
              id: 'skin_change_confirmation',
              type: 'checkbox',
              label: 'I understand that this ban will be automatically lifted if I change my skin',
              description: 'Only submit this appeal if you believe your skin is wrongfully banned.',
              required: true,
              order: 1
            },
            {
              id: 'skin_explanation',
              type: 'textarea',
              label: 'Skin Explanation',
              description: 'Explain why you believe your skin is appropriate',
              required: true,
              order: 2
            }
          ]
        }
      },      { 
        id: 7, 
        name: 'Bad Name', 
        category: 'Social', 
        isCustomizable: true, 
        ordinal: 11,
        customPoints: 2,
        staffDescription: 'Inappropriate Minecraft username that contains offensive content.',
        playerDescription: 'Please help us maintain a safe environment for players of all ages and backgrounds by refraining from the use of obscene/insensitive usernames. Change your username at https://www.minecraft.net',
        canBeAltBlocking: false,
        canBeStatWiping: false,
        permanentUntilUsernameChange: true,
        appealForm: {
          fields: [
            {
              id: 'name_change_confirmation',
              type: 'checkbox',
              label: 'I understand that this ban will be automatically lifted if I change my skin',
              description: 'Only submit this appeal if you believe your skin is wrongfully banned.',
              required: true,
              order: 1
            },
            {
              id: 'name_explanation',
              type: 'textarea',
              label: 'Name Explanation',
              description: 'Explain why you believe your name is appropriate',
              required: true,
              order: 2
            }
          ]
        }
      }
    ];

    // Default Gameplay punishment types (customizable, ordered as requested)
    const defaultGameplayTypes: IPunishmentType[] = [
      { 
        id: 12, 
        name: 'Team Abuse', 
        category: 'Gameplay', 
        isCustomizable: true, 
        ordinal: 12,
        durations: {
          low: { first: { value: 6, unit: 'hours', type: 'ban' }, medium: { value: 12, unit: 'hours', type: 'ban' }, habitual: { value: 3, unit: 'days', type: 'ban' } },
          regular: { first: { value: 12, unit: 'hours', type: 'ban' }, medium: { value: 3, unit: 'days', type: 'ban' }, habitual: { value: 7, unit: 'days', type: 'ban' } },
          severe: { first: { value: 3, unit: 'days', type: 'ban' }, medium: { value: 7, unit: 'days', type: 'ban' }, habitual: { value: 14, unit: 'days', type: 'ban' } }
        },
        points: { low: 2, regular: 2, severe: 3 },
        staffDescription: 'Intentionally harming teammates, cross-teaming, or aiding cheaters.',
        playerDescription: 'Please be considerate to fellow players by not team-griefing, aiding cheaters, or cross-teaming.',
        canBeAltBlocking: true,
        canBeStatWiping: true,
        appealForm: {
          fields: [
            {
              id: 'why',
              type: 'textarea',
              label: 'Why should this punishment be amended?',
              description: 'Please provide context and any relevant information to support your appeal',
              required: true,
              order: 1
            }
          ]
        }
      },
      { 
        id: 13, 
        name: 'Game Abuse', 
        category: 'Gameplay', 
        isCustomizable: true, 
        ordinal: 13,
        durations: {
          low: { first: { value: 1, unit: 'days', type: 'ban' }, medium: { value: 3, unit: 'days', type: 'ban' }, habitual: { value: 7, unit: 'days', type: 'ban' } },
          regular: { first: { value: 7, unit: 'days', type: 'ban' }, medium: { value: 14, unit: 'days', type: 'ban' }, habitual: { value: 14, unit: 'days', type: 'ban' } },
          severe: { first: { value: 30, unit: 'days', type: 'ban' }, medium: { value: 30, unit: 'days', type: 'ban' }, habitual: { value: 90, unit: 'days', type: 'ban' } }
        },
        points: { low: 2, regular: 3, severe: 5 },
        staffDescription: 'Violating game specific rules for fair play.',
        playerDescription: 'Violating game specific rules for competitive fair-play. It is your responsibility to be aware of and abide by all network-wide and game-specific rules.',
        canBeAltBlocking: true,
        canBeStatWiping: true,
        appealForm: {
          fields: [
            {
              id: 'why',
              type: 'textarea',
              label: 'Why should this punishment be amended?',
              description: 'Please provide context and any relevant information to support your appeal',
              required: true,
              order: 1
            }
          ]
        }
      },
      { 
        id: 17, 
        name: 'Systems Abuse', 
        category: 'Gameplay', 
        isCustomizable: true, 
        ordinal: 14,
        durations: {
          low: { first: { value: 3, unit: 'days', type: 'ban' }, medium: { value: 7, unit: 'days', type: 'ban' }, habitual: { value: 14, unit: 'days', type: 'ban' } },
          regular: { first: { value: 14, unit: 'days', type: 'ban' }, medium: { value: 30, unit: 'days', type: 'ban' }, habitual: { value: 90, unit: 'days', type: 'ban' } },
          severe: { first: { value: 90, unit: 'days', type: 'ban' }, medium: { value: 180, unit: 'days', type: 'ban' }, habitual: { value: 365, unit: 'days', type: 'ban' } }
        },
        points: { low: 2, regular: 3, severe: 5 },
        staffDescription: 'Abusing server functions by opening redundant tickets, creating lag machines, etc.',
        playerDescription: 'Using server systems in an unintended and harmful way is strictly prohibited. This encompasses lag machines, ticket spam, etc.',
        canBeAltBlocking: true,
        canBeStatWiping: true,
        appealForm: {
          fields: [
            {
              id: 'why',
              type: 'textarea',
              label: 'Why should this punishment be amended?',
              description: 'Please provide context and any relevant information to support your appeal',
              required: true,
              order: 1
            }
          ]
        }
      },
      { 
        id: 16, 
        name: 'Account Abuse', 
        category: 'Gameplay', 
        isCustomizable: true, 
        ordinal: 15,        durations: {
          low: { first: { value: 14, unit: 'days', type: 'ban' }, medium: { value: 30, unit: 'days', type: 'ban' }, habitual: { value: 60, unit: 'days', type: 'ban' } },
          regular: { first: { value: 30, unit: 'days', type: 'ban' }, medium: { value: 90, unit: 'days', type: 'ban' }, habitual: { value: 180, unit: 'days', type: 'ban' } },
          severe: { first: { value: 0, unit: 'days', type: 'permanent ban' }, medium: { value: 0, unit: 'days', type: 'permanent ban' }, habitual: { value: 0, unit: 'days', type: 'permanent ban' } }
        },
        points: { low: 4, regular: 6, severe: 10 },
        staffDescription: 'Account sharing, alt-account boosting, selling/trading accounts.',
        playerDescription: 'Misuse of accounts for the purposes of financial or levelling gain is prohibited. This encompasses account sharing, trading, selling and boosting through the use of alternate accounts.',
        canBeAltBlocking: true,
        canBeStatWiping: true,
        appealForm: {
          fields: [
            {
              id: 'why',
              type: 'textarea',
              label: 'Why should this punishment be amended?',
              description: 'Please provide context and any relevant information to support your appeal',
              required: true,
              order: 1
            }
          ]
        }
      },
      { 
        id: 15, 
        name: 'Game Trading', 
        category: 'Gameplay', 
        isCustomizable: true, 
        ordinal: 16,
        durations: {
          low: { first: { value: 14, unit: 'days', type: 'ban' }, medium: { value: 30, unit: 'days', type: 'ban' }, habitual: { value: 60, unit: 'days', type: 'ban' } },
          regular: { first: { value: 30, unit: 'days', type: 'ban' }, medium: { value: 90, unit: 'days', type: 'ban' }, habitual: { value: 180, unit: 'days', type: 'ban' } },
          severe: { first: { value: 0, unit: 'days', type: 'permanent ban' }, medium: { value: 0, unit: 'days', type: 'permanent ban' }, habitual: { value: 0, unit: 'days', type: 'permanent ban' } }
        },
        points: { low: 4, regular: 6, severe: 10 },
        staffDescription: 'Trading or selling in-game items, content, or services on unauthorized third-party platforms.',
        playerDescription: 'Trading or selling in-game items, content, or services on unauthorized third-party platforms is strictly prohibited.',
        canBeAltBlocking: true,
        canBeStatWiping: true,
        appealForm: {
          fields: [
            {
              id: 'why',
              type: 'textarea',
              label: 'Why should this punishment be amended?',
              description: 'Please provide context and any relevant information to support your appeal',
              required: true,
              order: 1
            }
          ]
        }
      },
      { 
        id: 14, 
        name: 'Cheating', 
        category: 'Gameplay', 
        isCustomizable: true, 
        ordinal: 17,
        durations: {
          low: { first: { value: 3, unit: 'days', type: 'ban' }, medium: { value: 14, unit: 'days', type: 'ban' }, habitual: { value: 30, unit: 'days', type: 'ban' } },
          regular: { first: { value: 14, unit: 'days', type: 'ban' }, medium: { value: 60, unit: 'days', type: 'ban' }, habitual: { value: 180, unit: 'days', type: 'ban' } },
          severe: { first: { value: 30, unit: 'days', type: 'ban' }, medium: { value: 90, unit: 'days', type: 'ban' }, habitual: { value: 0, unit: 'days', type: 'permanent ban' } }
        },
        points: { low: 5, regular: 7, severe: 9 },
        staffDescription: 'Using hacks, mods, exploits, or other software to gain an unfair advantage.',
        playerDescription: 'Cheating through the use of client-side modifications or game exploits to gain an unfair advantage over other players is strictly prohibited.',
        canBeAltBlocking: true,
        canBeStatWiping: true,
        appealForm: {
          fields: [
            {
              id: 'why',
              type: 'textarea',
              label: 'Why should this punishment be amended?',
              description: 'Please provide context and any relevant information to support your appeal',
              required: true,
              order: 1
            }
          ]
        }
      }
    ];

    // Only add missing types to preserve existing data
    const missingTypes = [];
    
    // Add missing social types
    defaultSocialTypes.forEach(type => {
      if (missingSocialTypes.includes(type.ordinal)) {
        missingTypes.push(type);
      }
    });
    
    // Add missing gameplay types  
    defaultGameplayTypes.forEach(type => {
      if (missingGameplayTypes.includes(type.ordinal)) {
        missingTypes.push(type);
      }
    });
    
    if (missingTypes.length > 0) {
      // Combine existing types with only the missing ones
      const allPunishmentTypes = [...existingTypes, ...missingTypes];
      
      // Sort by ordinal to maintain proper order
      allPunishmentTypes.sort((a, b) => a.ordinal - b.ordinal);
      
      // Update the punishment types document
      await models.Settings.findOneAndUpdate(
        { type: 'punishmentTypes' },
        { 
          type: 'punishmentTypes', 
          data: allPunishmentTypes 
        },
        { upsert: true }
      );
      
      console.log(`Added ${missingTypes.length} missing default punishment types to database`);
    } else {
      console.log('All required punishment types already exist, no changes needed');
    }
  } catch (error) {
    console.error('Error adding default punishment types:', error);
    throw error;
  }
}

// AI Punishment Types CRUD Routes

// Get all AI punishment types
router.get('/ai-punishment-types', async (req: Request, res: Response) => {
  try {
    if (!req.serverDbConnection) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const SettingsModel = req.serverDbConnection.model('Settings');
    const aiSettingsDoc = await SettingsModel.findOne({ type: 'aiModerationSettings' });

    if (!aiSettingsDoc?.data?.aiPunishmentConfigs) {
      return res.json({ success: true, data: {} });
    }

    res.json({ 
      success: true, 
      data: aiSettingsDoc.data.aiPunishmentConfigs 
    });
  } catch (error) {
    console.error('Error fetching AI punishment types:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new AI punishment type
router.post('/ai-punishment-types', checkPermission('admin.settings.modify'), async (req: Request, res: Response) => {
  try {
    if (!req.serverDbConnection) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { name, aiDescription } = req.body;

    if (!name || !aiDescription) {
      return res.status(400).json({ error: 'Name and AI description are required' });
    }

    const SettingsModel = req.serverDbConnection.model('Settings');
    const aiSettingsDoc = await SettingsModel.findOne({ type: 'aiModerationSettings' });

    if (!aiSettingsDoc) {
      return res.status(404).json({ error: 'AI moderation settings not found' });
    }

    const currentConfigs = aiSettingsDoc.data?.aiPunishmentConfigs || {};
    
    // Generate unique ID
    const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    
    // Check if ID already exists
    if (currentConfigs[id]) {
      return res.status(409).json({ error: 'A punishment type with this name already exists' });
    }

    // Add new AI punishment type
    currentConfigs[id] = {
      id,
      name,
      aiDescription,
      enabled: true
    };

    await SettingsModel.findOneAndUpdate(
      { type: 'aiModerationSettings' },
      { 
        $set: { 
          'data.aiPunishmentConfigs': currentConfigs 
        } 
      }
    );

    res.json({ 
      success: true, 
      data: currentConfigs[id],
      message: 'AI punishment type created successfully' 
    });
  } catch (error) {
    console.error('Error creating AI punishment type:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update AI punishment type
router.put('/ai-punishment-types/:id', checkPermission('admin.settings.modify'), async (req: Request, res: Response) => {
  try {
    if (!req.serverDbConnection) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { id } = req.params;
    const { name, aiDescription, enabled } = req.body;

    if (!name || !aiDescription || typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Name, AI description, and enabled status are required' });
    }

    const SettingsModel = req.serverDbConnection.model('Settings');
    const aiSettingsDoc = await SettingsModel.findOne({ type: 'aiModerationSettings' });

    if (!aiSettingsDoc?.data?.aiPunishmentConfigs) {
      return res.status(404).json({ error: 'AI punishment type not found' });
    }

    const currentConfigs = aiSettingsDoc.data.aiPunishmentConfigs;

    if (!currentConfigs[id]) {
      return res.status(404).json({ error: 'AI punishment type not found' });
    }

    // Update the AI punishment type
    currentConfigs[id] = {
      id,
      name,
      aiDescription,
      enabled
    };

    await SettingsModel.findOneAndUpdate(
      { type: 'aiModerationSettings' },
      { 
        $set: { 
          'data.aiPunishmentConfigs': currentConfigs 
        } 
      }
    );

    res.json({ 
      success: true, 
      data: currentConfigs[id],
      message: 'AI punishment type updated successfully' 
    });
  } catch (error) {
    console.error('Error updating AI punishment type:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete AI punishment type
router.delete('/ai-punishment-types/:id', checkPermission('admin.settings.modify'), async (req: Request, res: Response) => {
  try {
    if (!req.serverDbConnection) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { id } = req.params;

    const SettingsModel = req.serverDbConnection.model('Settings');
    const aiSettingsDoc = await SettingsModel.findOne({ type: 'aiModerationSettings' });

    if (!aiSettingsDoc?.data?.aiPunishmentConfigs) {
      return res.status(404).json({ error: 'AI punishment type not found' });
    }

    const currentConfigs = aiSettingsDoc.data.aiPunishmentConfigs;

    if (!currentConfigs[id]) {
      return res.status(404).json({ error: 'AI punishment type not found' });
    }

    // Remove the AI punishment type
    delete currentConfigs[id];

    await SettingsModel.findOneAndUpdate(
      { type: 'aiModerationSettings' },
      { 
        $set: { 
          'data.aiPunishmentConfigs': currentConfigs 
        } 
      }
    );

    res.json({ 
      success: true, 
      message: 'AI punishment type deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting AI punishment type:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
