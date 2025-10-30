import { Connection, Schema, Document } from 'mongoose';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { IPlayer } from '@modl-gg/shared-web/types';
import { connectToGlobalModlDb } from '../db/connectionManager';

const DEFAULT_FILE_SIZE_LIMIT = 5 * 1024 * 1024 * 1024; // 5GB in bytes
const MIGRATIONS_TEMP_DIR = path.join(process.cwd(), 'uploads', 'migrations');

// Settings document interface
interface ISettingsDocument extends Document {
  type: string;
  data: any;
}

// Settings schema definition (matching settings-routes.ts)
const SettingsSchema = new Schema({
  type: { type: String, required: true },
  data: { type: Schema.Types.Mixed, required: true }
});

interface MigrationProgress {
  message: string;
  recordsProcessed?: number;
  recordsSkipped?: number;
  totalRecords?: number;
}

interface MigrationStatus {
  id: string;
  status: 'idle' | 'building_json' | 'uploading_json' | 'processing_data' | 'completed' | 'failed';
  migrationType: string;
  startedAt: Date;
  progress: MigrationProgress;
  error?: string;
}

interface MigrationHistoryEntry {
  id: string;
  migrationType: string;
  startedAt: Date;
  completedAt: Date;
  status: 'completed' | 'failed';
  recordsProcessed: number;
  recordsSkipped: number;
  error?: string;
}

interface MigrationPlayerData {
  minecraftUuid: string;
  usernames: Array<{ username: string; date: string }>;
  notes: Array<{ text: string; date: string; issuerName: string }>;
  ipList: Array<{ ipAddress: string; country?: string; firstLogin: string; logins: string[] }>;
  punishments: Array<{
    _id: string;
    type: string;
    type_ordinal: number;
    reason: string;
    issued: string;
    issuerName: string;
    duration?: number;
    started?: string;
    data?: Record<string, any>;
  }>;
  data?: Record<string, any>;
}

/**
 * Ensure migrations temp directory exists
 */
async function ensureMigrationsTempDir(): Promise<void> {
  try {
    await fs.mkdir(MIGRATIONS_TEMP_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating migrations temp directory:', error);
    throw error;
  }
}

/**
 * Get Settings model with proper schema
 * This ensures the model is properly initialized with the correct schema
 */
function getSettingsModel(serverDbConnection: Connection) {
  try {
    // Try to get existing model first
    return serverDbConnection.model<ISettingsDocument>('Settings');
  } catch (error) {
    // Model doesn't exist, create it with our schema
    return serverDbConnection.model<ISettingsDocument>('Settings', SettingsSchema);
  }
}

/**
 * Get or create migration settings document
 */
async function getMigrationSettings(serverDbConnection: Connection): Promise<ISettingsDocument> {
  const Settings = getSettingsModel(serverDbConnection);
  
  let migrationSettings = await Settings.findOne({ type: 'migration' });
  
  if (!migrationSettings) {
    migrationSettings = new Settings({
      type: 'migration',
      data: {
        lastMigrationTimestamp: null,
        currentMigration: null,
        history: []
      }
    });
    await migrationSettings.save();
  } else if (!migrationSettings.data) {
    // Ensure data field exists and is properly initialized
    migrationSettings.data = {
      lastMigrationTimestamp: null,
      currentMigration: null,
      history: []
    };
    migrationSettings.markModified('data');
    await migrationSettings.save();
  } else {
    // Ensure all required fields exist in data
    let needsSave = false;
    if (!migrationSettings.data.history) {
      migrationSettings.data.history = [];
      needsSave = true;
    }
    if (!migrationSettings.data.hasOwnProperty('currentMigration')) {
      migrationSettings.data.currentMigration = null;
      needsSave = true;
    }
    if (!migrationSettings.data.hasOwnProperty('lastMigrationTimestamp')) {
      migrationSettings.data.lastMigrationTimestamp = null;
      needsSave = true;
    }
    if (needsSave) {
      migrationSettings.markModified('data');
      await migrationSettings.save();
    }
  }
  
  return migrationSettings;
}

/**
 * Get migration file size limit for a server
 */
export async function getMigrationFileSizeLimit(serverName: string): Promise<number> {
  try {
    const globalDb = await connectToGlobalModlDb();
    const ModlServer = globalDb.models.ModlServer || globalDb.model('ModlServer');
    
    const server = await ModlServer.findOne({ serverName });
    
    if (server?.migrationFileSizeLimit && server.migrationFileSizeLimit > 0) {
      return server.migrationFileSizeLimit;
    }
    
    return DEFAULT_FILE_SIZE_LIMIT;
  } catch (error) {
    console.error('Error fetching migration file size limit:', error);
    return DEFAULT_FILE_SIZE_LIMIT;
  }
}

/**
 * Check if migration is on cooldown (24 hours after successful migration)
 */
export async function checkMigrationCooldown(serverDbConnection: Connection): Promise<{ onCooldown: boolean; remainingTime?: number }> {
  const migrationSettings = await getMigrationSettings(serverDbConnection);
  
  if (!migrationSettings.data.lastMigrationTimestamp) {
    return { onCooldown: false };
  }
  
  const lastMigration = new Date(migrationSettings.data.lastMigrationTimestamp);
  const now = new Date();
  const cooldownPeriod = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  const timeSinceLastMigration = now.getTime() - lastMigration.getTime();
  
  if (timeSinceLastMigration < cooldownPeriod) {
    const remainingTime = cooldownPeriod - timeSinceLastMigration;
    return { onCooldown: true, remainingTime };
  }
  
  return { onCooldown: false };
}

/**
 * Start a new migration
 */
export async function startMigration(
  migrationType: string,
  serverDbConnection: Connection
): Promise<{ success: boolean; taskId?: string; error?: string }> {
  try {
    // Check cooldown
    const cooldownCheck = await checkMigrationCooldown(serverDbConnection);
    if (cooldownCheck.onCooldown) {
      const hoursRemaining = Math.ceil((cooldownCheck.remainingTime || 0) / (60 * 60 * 1000));
      return {
        success: false,
        error: `Migration is on cooldown. Please wait ${hoursRemaining} hour(s) before starting another migration.`
      };
    }
    
    const migrationSettings = await getMigrationSettings(serverDbConnection);
    
    // Check if there's already an active migration
    if (migrationSettings.data.currentMigration && 
        migrationSettings.data.currentMigration.status !== 'completed' && 
        migrationSettings.data.currentMigration.status !== 'failed') {
      return {
        success: false,
        error: 'A migration is already in progress.'
      };
    }
    
    const taskId = uuidv4();
    
    // Initialize migration state
    migrationSettings.data.currentMigration = {
      id: taskId,
      status: 'idle',
      migrationType,
      startedAt: new Date(),
      progress: {
        message: 'Waiting for Minecraft server to start building export...'
      }
    };
    
    // Mark the data field as modified so Mongoose saves it
    migrationSettings.markModified('data');
    await migrationSettings.save();
    
    return { success: true, taskId };
  } catch (error) {
    console.error('Error starting migration:', error);
    return {
      success: false,
      error: 'Failed to start migration. Please try again.'
    };
  }
}

/**
 * Update migration progress
 */
export async function updateMigrationProgress(
  status: string,
  progress: MigrationProgress,
  serverDbConnection: Connection,
  error?: string
): Promise<void> {
  try {
    const migrationSettings = await getMigrationSettings(serverDbConnection);
    
    if (!migrationSettings.data.currentMigration) {
      console.warn('Attempted to update migration progress but no active migration found');
      return;
    }
    
    migrationSettings.data.currentMigration.status = status;
    migrationSettings.data.currentMigration.progress = progress;
    
    if (error) {
      migrationSettings.data.currentMigration.error = error;
    }
    
    // If migration completed or failed, update history and reset current migration
    if (status === 'completed' || status === 'failed') {
      const historyEntry: MigrationHistoryEntry = {
        id: migrationSettings.data.currentMigration.id,
        migrationType: migrationSettings.data.currentMigration.migrationType,
        startedAt: migrationSettings.data.currentMigration.startedAt,
        completedAt: new Date(),
        status: status as 'completed' | 'failed',
        recordsProcessed: progress.recordsProcessed || 0,
        recordsSkipped: progress.recordsSkipped || 0,
        error: error
      };
      
      if (!migrationSettings.data.history) {
        migrationSettings.data.history = [];
      }
      migrationSettings.data.history.push(historyEntry);
      
      // Keep only last 10 history entries
      if (migrationSettings.data.history.length > 10) {
        migrationSettings.data.history = migrationSettings.data.history.slice(-10);
      }
      
      // Update last migration timestamp only on success
      if (status === 'completed') {
        migrationSettings.data.lastMigrationTimestamp = new Date();
      }
      
      // Reset current migration
      migrationSettings.data.currentMigration = null;
    }
    
    // Mark the data field as modified so Mongoose saves it
    migrationSettings.markModified('data');
    await migrationSettings.save();
  } catch (error) {
    console.error('Error updating migration progress:', error);
  }
}

/**
 * Get current migration status
 */
export async function getMigrationStatus(serverDbConnection: Connection): Promise<any> {
  const migrationSettings = await getMigrationSettings(serverDbConnection);
  
  // Defensive programming: ensure data exists
  const data = migrationSettings?.data || {
    currentMigration: null,
    lastMigrationTimestamp: null,
    history: []
  };
  
  return {
    currentMigration: data.currentMigration || null,
    lastMigrationTimestamp: data.lastMigrationTimestamp || null,
    history: data.history || []
  };
}

/**
 * Validate migration JSON schema
 */
export function validateMigrationJSON(data: any): { valid: boolean; error?: string } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid JSON structure' };
  }
  
  if (!Array.isArray(data.players)) {
    return { valid: false, error: 'Missing or invalid "players" array' };
  }
  
  // Basic structure validation (lenient - we'll skip invalid records during processing)
  return { valid: true };
}

/**
 * Merge player document with existing data
 */
function mergePlayerDocument(existing: IPlayer, migration: MigrationPlayerData): IPlayer {
  // Merge usernames (deduplicate by username)
  const existingUsernames = new Set(existing.usernames.map(u => u.username));
  const newUsernames = migration.usernames.filter(u => !existingUsernames.has(u.username));
  existing.usernames = [...existing.usernames, ...newUsernames.map(u => ({
    username: u.username,
    date: new Date(u.date)
  }))];
  
  // Append all notes
  existing.notes = [...existing.notes, ...migration.notes.map(n => ({
    text: n.text,
    date: new Date(n.date),
    issuerName: n.issuerName
  }))];
  
  // Merge IP list
  const existingIPs = new Map(existing.ipList.map(ip => [ip.ipAddress, ip]));
  migration.ipList.forEach(migrationIP => {
    const existingIP = existingIPs.get(migrationIP.ipAddress);
    if (existingIP) {
      // Merge login arrays
      const allLogins = [
        ...existingIP.logins.map(l => new Date(l)),
        ...migrationIP.logins.map(l => new Date(l))
      ];
      // Sort and deduplicate
      const uniqueLogins = Array.from(new Set(allLogins.map(d => d.getTime())))
        .sort()
        .map(t => new Date(t));
      existingIP.logins = uniqueLogins;
      
      // Update first login if migration has an earlier one
      const migrationFirstLogin = new Date(migrationIP.firstLogin);
      if (migrationFirstLogin < new Date(existingIP.firstLogin)) {
        existingIP.firstLogin = migrationFirstLogin;
      }
    } else {
      // Add new IP
      existing.ipList.push({
        ipAddress: migrationIP.ipAddress,
        country: migrationIP.country,
        firstLogin: new Date(migrationIP.firstLogin),
        logins: migrationIP.logins.map(l => new Date(l))
      });
    }
  });
  
  // Append all punishments (use unique _id to avoid duplicates)
  const existingPunishmentIds = new Set(existing.punishments.map(p => p._id?.toString()));
  const newPunishments = migration.punishments.filter(p => !existingPunishmentIds.has(p._id));
  existing.punishments = [...existing.punishments, ...newPunishments.map(p => ({
    ...p,
    issued: new Date(p.issued),
    started: p.started ? new Date(p.started) : undefined
  }))];
  
  // Merge data objects (migration data takes precedence)
  if (migration.data) {
    existing.data = {
      ...existing.data,
      ...migration.data
    };
  }
  
  return existing;
}

/**
 * Process migration file and import data to MongoDB with batch operations
 */
export async function processMigrationFile(
  filePath: string,
  serverDbConnection: Connection
): Promise<void> {
  const BATCH_SIZE = 500;
  const PROGRESS_UPDATE_INTERVAL = 1000;
  
  let recordsProcessed = 0;
  let recordsSkipped = 0;
  
  try {
    await updateMigrationProgress('processing_data', {
      message: 'Reading and validating migration file...',
      recordsProcessed: 0,
      recordsSkipped: 0
    }, serverDbConnection);
    
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const migrationData = JSON.parse(fileContent);
    
    const validation = validateMigrationJSON(migrationData);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid migration data');
    }
    
    const totalRecords = migrationData.players.length;
    
    await updateMigrationProgress('processing_data', {
      message: `Processing ${totalRecords} player records...`,
      recordsProcessed: 0,
      recordsSkipped: 0,
      totalRecords
    }, serverDbConnection);
    
    const Player = serverDbConnection.model<IPlayer>('Player');
    
    for (let i = 0; i < migrationData.players.length; i += BATCH_SIZE) {
      const batch = migrationData.players.slice(i, i + BATCH_SIZE);
      const validPlayers: MigrationPlayerData[] = [];
      const uuidsInBatch: string[] = [];
      
      for (const playerData of batch) {
        if (!playerData.minecraftUuid || typeof playerData.minecraftUuid !== 'string') {
          console.warn('Skipping player record: missing or invalid minecraftUuid');
          recordsSkipped++;
          continue;
        }
        validPlayers.push(playerData);
        uuidsInBatch.push(playerData.minecraftUuid);
      }
      
      if (validPlayers.length === 0) continue;
      
      const existingPlayers = await Player.find({ 
        minecraftUuid: { $in: uuidsInBatch } 
      }).lean();
      
      const existingPlayersMap = new Map(
        existingPlayers.map(p => [p.minecraftUuid, p])
      );
      
      const bulkOps: any[] = [];
      
      for (const playerData of validPlayers) {
        try {
          const existingPlayer = existingPlayersMap.get(playerData.minecraftUuid);
          
          if (existingPlayer) {
            const tempPlayer: IPlayer = {
              ...existingPlayer,
              usernames: existingPlayer.usernames || [],
              notes: existingPlayer.notes || [],
              ipList: existingPlayer.ipList || [],
              punishments: existingPlayer.punishments || [],
              pendingNotifications: existingPlayer.pendingNotifications || [],
              data: existingPlayer.data || {}
            } as IPlayer;
            
            const mergedPlayer = mergePlayerDocument(tempPlayer, playerData);
            
            bulkOps.push({
              updateOne: {
                filter: { minecraftUuid: playerData.minecraftUuid },
                update: { 
                  $set: {
                    usernames: mergedPlayer.usernames,
                    notes: mergedPlayer.notes,
                    ipList: mergedPlayer.ipList,
                    punishments: mergedPlayer.punishments,
                    data: mergedPlayer.data
                  }
                }
              }
            });
          } else {
            const newPlayerDoc = {
              minecraftUuid: playerData.minecraftUuid,
              usernames: playerData.usernames?.map(u => ({
                username: u.username,
                date: new Date(u.date)
              })) || [],
              notes: playerData.notes?.map(n => ({
                text: n.text,
                date: new Date(n.date),
                issuerName: n.issuerName
              })) || [],
              ipList: playerData.ipList?.map(ip => ({
                ipAddress: ip.ipAddress,
                country: ip.country,
                firstLogin: new Date(ip.firstLogin),
                logins: ip.logins.map(l => new Date(l))
              })) || [],
              punishments: playerData.punishments?.map(p => ({
                ...p,
                issued: new Date(p.issued),
                started: p.started ? new Date(p.started) : undefined
              })) || [],
              pendingNotifications: [],
              data: playerData.data || {}
            };
            
            bulkOps.push({
              insertOne: {
                document: newPlayerDoc
              }
            });
          }
          
          recordsProcessed++;
        } catch (error) {
          console.error('Error preparing player record:', error);
          recordsSkipped++;
        }
      }
      
      if (bulkOps.length > 0) {
        await Player.bulkWrite(bulkOps, { ordered: false });
      }
      
      if (recordsProcessed % PROGRESS_UPDATE_INTERVAL === 0 || i + BATCH_SIZE >= totalRecords) {
        await updateMigrationProgress('processing_data', {
          message: `Processing player records... (${recordsProcessed}/${totalRecords})`,
          recordsProcessed,
          recordsSkipped,
          totalRecords
        }, serverDbConnection);
      }
    }
    
    await updateMigrationProgress('completed', {
      message: 'Migration completed successfully',
      recordsProcessed,
      recordsSkipped,
      totalRecords
    }, serverDbConnection);
    
  } catch (error: any) {
    console.error('Error processing migration file:', error);
    await updateMigrationProgress('failed', {
      message: 'Migration failed',
      recordsProcessed,
      recordsSkipped
    }, serverDbConnection, error.message);
    
    throw error;
  } finally {
    await cleanupMigrationFiles(filePath);
  }
}

/**
 * Clean up migration temporary files
 */
export async function cleanupMigrationFiles(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
    console.log(`Cleaned up migration file: ${filePath}`);
  } catch (error) {
    console.error('Error cleaning up migration file:', error);
  }
}

/**
 * Ensure migrations temp directory is created on module load
 */
ensureMigrationsTempDir().catch(console.error);

