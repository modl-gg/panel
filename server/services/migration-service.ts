import { Connection, Schema, Document } from 'mongoose';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { IPlayer } from '@modl-gg/shared-web/types';
import { connectToGlobalModlDb } from '../db/connectionManager';
import { parseSecureJSON, SecureJSONError } from '../utils/secure-json';
import {
  sanitizeString,
  validateMinecraftUuid,
  validateDate,
  validateOptionalDate,
  validateNumber,
  validateBoolean,
  validateIpAddress,
  validateArray,
  sanitizeObject,
  ValidationError
} from '../utils/input-sanitization';

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
  ipList: Array<{ 
    ipAddress: string; 
    country?: string; 
    region?: string;
    asn?: string;
    proxy?: boolean;
    hosting?: boolean;
    firstLogin: string; 
    logins: string[] 
  }>;
  punishments: Array<{
    _id: string;
    type: string;
    type_ordinal: number;
    reason: string;
    issued: string;
    issuerName: string;
    duration?: number;
    started?: string;
    notes?: Array<{ text: string; issuerName: string; date: string }>;
    evidence?: Array<string | { text: string; issuerName: string; date: string }>;
    attachedTicketIds?: string[];
    modifications?: any[];
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
    
    // Check if there's already an active migration (not completed or failed)
    if (migrationSettings.data.currentMigration && 
        migrationSettings.data.currentMigration.status !== 'completed' && 
        migrationSettings.data.currentMigration.status !== 'failed') {
      return {
        success: false,
        error: 'A migration is already in progress.'
      };
    }
    
    const taskId = uuidv4();
    
    // Initialize migration state (this will replace any completed/failed migration)
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
 * Clear completed or failed migration from view
 */
export async function clearCompletedMigration(serverDbConnection: Connection): Promise<void> {
  try {
    const migrationSettings = await getMigrationSettings(serverDbConnection);
    
    // Only clear if the current migration is completed or failed
    if (migrationSettings.data.currentMigration &&
        (migrationSettings.data.currentMigration.status === 'completed' ||
         migrationSettings.data.currentMigration.status === 'failed')) {
      migrationSettings.data.currentMigration = null;
      migrationSettings.markModified('data');
      await migrationSettings.save();
    }
  } catch (error) {
    console.error('Error clearing completed migration:', error);
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
    
    // If migration completed or failed, update history
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
      migrationSettings.data.history.unshift(historyEntry); // Add to beginning for most recent first
      
      // Keep only last 10 history entries
      if (migrationSettings.data.history.length > 10) {
        migrationSettings.data.history = migrationSettings.data.history.slice(0, 10);
      }
      
      // Update last migration timestamp only on success
      if (status === 'completed') {
        migrationSettings.data.lastMigrationTimestamp = new Date();
      }
      
      // Keep current migration visible but mark it as completed/failed
      // Don't reset to null immediately so the UI can show the completion state
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
 * Validate migration JSON schema with comprehensive security checks
 */
export function validateMigrationJSON(data: any): { valid: boolean; error?: string } {
  try {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Invalid JSON structure' };
    }
    
    if (!Array.isArray(data.players)) {
      return { valid: false, error: 'Missing or invalid "players" array' };
    }

    if (data.players.length === 0) {
      return { valid: false, error: 'Players array cannot be empty' };
    }

    if (data.players.length > 1000000) {
      return { valid: false, error: 'Players array exceeds maximum allowed length of 1,000,000' };
    }

    const sampleSize = Math.min(100, data.players.length);
    for (let i = 0; i < sampleSize; i++) {
      const randomIndex = Math.floor(Math.random() * data.players.length);
      const player = data.players[randomIndex];

      if (!player || typeof player !== 'object') {
        return { valid: false, error: `Invalid player object at index ${randomIndex}` };
      }

      if (!player.minecraftUuid || typeof player.minecraftUuid !== 'string') {
        return { valid: false, error: `Missing or invalid minecraftUuid at index ${randomIndex}` };
      }

      try {
        validateMinecraftUuid(player.minecraftUuid);
      } catch (error: any) {
        return { valid: false, error: `Invalid Minecraft UUID format at index ${randomIndex}: ${error.message}` };
      }

      if (player.usernames !== undefined && !Array.isArray(player.usernames)) {
        return { valid: false, error: `Invalid usernames field at index ${randomIndex}` };
      }

      if (player.usernames && player.usernames.length > 1000) {
        return { valid: false, error: `Too many usernames (${player.usernames.length}) at index ${randomIndex}` };
      }

      if (player.notes !== undefined && !Array.isArray(player.notes)) {
        return { valid: false, error: `Invalid notes field at index ${randomIndex}` };
      }

      if (player.notes && player.notes.length > 10000) {
        return { valid: false, error: `Too many notes (${player.notes.length}) at index ${randomIndex}` };
      }

      if (player.ipList !== undefined && !Array.isArray(player.ipList)) {
        return { valid: false, error: `Invalid ipList field at index ${randomIndex}` };
      }

      if (player.ipList && player.ipList.length > 10000) {
        return { valid: false, error: `Too many IP addresses (${player.ipList.length}) at index ${randomIndex}` };
      }

      if (player.punishments !== undefined && !Array.isArray(player.punishments)) {
        return { valid: false, error: `Invalid punishments field at index ${randomIndex}` };
      }

      if (player.punishments && player.punishments.length > 50000) {
        return { valid: false, error: `Too many punishments (${player.punishments.length}) at index ${randomIndex}` };
      }
    }
    
    return { valid: true };
  } catch (error: any) {
    return { valid: false, error: `Validation error: ${error.message}` };
  }
}

/**
 * Validate and sanitize a player data object from migration
 */
function validateAndSanitizePlayerData(playerData: any, recordIndex: number): MigrationPlayerData {
  try {
    const minecraftUuid = validateMinecraftUuid(playerData.minecraftUuid);

    const usernames = validateArray(playerData.usernames || [], 'usernames', 1000).map((u: any, idx: number) => ({
      username: sanitizeString(u.username, `username at ${recordIndex}:${idx}`, 100),
      date: validateDate(u.date, `username.date at ${recordIndex}:${idx}`).toISOString()
    }));

    const notes = validateArray(playerData.notes || [], 'notes', 10000).map((n: any, idx: number) => ({
      text: sanitizeString(n.text, `note.text at ${recordIndex}:${idx}`, 5000),
      date: validateDate(n.date, `note.date at ${recordIndex}:${idx}`).toISOString(),
      issuerName: sanitizeString(n.issuerName, `note.issuerName at ${recordIndex}:${idx}`, 100)
    }));

    const ipList = validateArray(playerData.ipList || [], 'ipList', 10000).map((ip: any, idx: number) => {
      const ipAddress = validateIpAddress(ip.ipAddress, `ipAddress at ${recordIndex}:${idx}`);
      const logins = validateArray(ip.logins || [], `logins at ${recordIndex}:${idx}`, 100000).map((l: any) =>
        validateDate(l, `login date at ${recordIndex}:${idx}`).toISOString()
      );

      return {
        ipAddress,
        country: ip.country ? sanitizeString(ip.country, `country at ${recordIndex}:${idx}`, 100) : undefined,
        region: ip.region ? sanitizeString(ip.region, `region at ${recordIndex}:${idx}`, 100) : undefined,
        asn: ip.asn ? sanitizeString(ip.asn, `asn at ${recordIndex}:${idx}`, 100) : undefined,
        proxy: validateBoolean(ip.proxy, `proxy at ${recordIndex}:${idx}`, false),
        hosting: validateBoolean(ip.hosting, `hosting at ${recordIndex}:${idx}`, false),
        firstLogin: validateDate(ip.firstLogin, `firstLogin at ${recordIndex}:${idx}`).toISOString(),
        logins
      };
    });

    const punishments = validateArray(playerData.punishments || [], 'punishments', 50000).map((p: any, idx: number) => {
      const punishment: any = {
        _id: sanitizeString(p._id, `punishment._id at ${recordIndex}:${idx}`, 100),
        type: sanitizeString(p.type, `punishment.type at ${recordIndex}:${idx}`, 50),
        type_ordinal: validateNumber(p.type_ordinal, `punishment.type_ordinal at ${recordIndex}:${idx}`, 0, 10),
        reason: sanitizeString(p.reason || '', `punishment.reason at ${recordIndex}:${idx}`, 1000),
        issued: validateDate(p.issued, `punishment.issued at ${recordIndex}:${idx}`).toISOString(),
        issuerName: sanitizeString(p.issuerName, `punishment.issuerName at ${recordIndex}:${idx}`, 100)
      };

      if (p.duration !== undefined) {
        punishment.duration = validateNumber(p.duration, `punishment.duration at ${recordIndex}:${idx}`, -1);
      }

      if (p.started) {
        punishment.started = validateDate(p.started, `punishment.started at ${recordIndex}:${idx}`).toISOString();
      }

      if (p.notes && Array.isArray(p.notes)) {
        punishment.notes = validateArray(p.notes, `punishment.notes at ${recordIndex}:${idx}`, 1000).map((note: any, nIdx: number) => ({
          text: sanitizeString(note.text || '', `punishment.note.text at ${recordIndex}:${idx}:${nIdx}`, 5000),
          issuerName: sanitizeString(note.issuerName || 'Unknown', `punishment.note.issuerName at ${recordIndex}:${idx}:${nIdx}`, 100),
          date: validateDate(note.date || p.issued, `punishment.note.date at ${recordIndex}:${idx}:${nIdx}`).toISOString()
        }));
      }

      if (p.evidence && Array.isArray(p.evidence)) {
        punishment.evidence = validateArray(p.evidence, `punishment.evidence at ${recordIndex}:${idx}`, 1000).map((ev: any) => {
          if (typeof ev === 'string') {
            return sanitizeString(ev, `punishment.evidence string at ${recordIndex}:${idx}`, 10000);
          }
          return {
            text: sanitizeString(ev.text || '', `punishment.evidence.text at ${recordIndex}:${idx}`, 10000),
            issuerName: sanitizeString(ev.issuerName || 'Unknown', `punishment.evidence.issuerName at ${recordIndex}:${idx}`, 100),
            date: validateDate(ev.date || p.issued, `punishment.evidence.date at ${recordIndex}:${idx}`).toISOString()
          };
        });
      }

      if (p.attachedTicketIds && Array.isArray(p.attachedTicketIds)) {
        punishment.attachedTicketIds = validateArray(p.attachedTicketIds, `punishment.attachedTicketIds at ${recordIndex}:${idx}`, 100)
          .map((tid: any) => sanitizeString(tid, `punishment.attachedTicketId at ${recordIndex}:${idx}`, 100));
      }

      if (p.modifications && Array.isArray(p.modifications)) {
        punishment.modifications = sanitizeObject(validateArray(p.modifications, `punishment.modifications at ${recordIndex}:${idx}`, 1000));
      }

      if (p.data && typeof p.data === 'object') {
        punishment.data = sanitizeObject(p.data);
      }

      return punishment;
    });

    const data = playerData.data && typeof playerData.data === 'object' ? sanitizeObject(playerData.data) : undefined;

    return {
      minecraftUuid,
      usernames,
      notes,
      ipList,
      punishments,
      data
    };
  } catch (error: any) {
    throw new ValidationError(`Player validation failed at record ${recordIndex}: ${error.message}`);
  }
}

/**
 * Merge player document with existing data
 */
function mergePlayerDocument(existing: IPlayer, migration: MigrationPlayerData): IPlayer {
  // Merge usernames (deduplicate by username)
  const existingUsernames = new Set(existing.usernames.map((u: any) => u.username));
  const newUsernames = migration.usernames.filter((u: any) => !existingUsernames.has(u.username));
  existing.usernames = [...existing.usernames, ...newUsernames.map((u: any) => ({
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
  const existingIPs = new Map(existing.ipList.map((ip: any) => [ip.ipAddress, ip]));
  migration.ipList.forEach((migrationIP: any) => {
    const existingIP = existingIPs.get(migrationIP.ipAddress) as any;
    if (existingIP) {
      // Merge login arrays
      const allLogins = [
        ...existingIP.logins.map((l: any) => new Date(l)),
        ...migrationIP.logins.map((l: any) => new Date(l))
      ];
      // Sort and deduplicate
      const uniqueLogins = Array.from(new Set(allLogins.map((d: any) => d.getTime())))
        .sort()
        .map((t: number) => new Date(t));
      existingIP.logins = uniqueLogins;
      
      // Update first login if migration has an earlier one
      const migrationFirstLogin = new Date(migrationIP.firstLogin);
      if (migrationFirstLogin < new Date(existingIP.firstLogin)) {
        existingIP.firstLogin = migrationFirstLogin;
      }
      
      // Update optional fields if migration has them and existing doesn't
      if (migrationIP.region && !existingIP.region) {
        existingIP.region = migrationIP.region;
      }
      if (migrationIP.asn && !existingIP.asn) {
        existingIP.asn = migrationIP.asn;
      }
      if (migrationIP.proxy !== undefined && existingIP.proxy === undefined) {
        existingIP.proxy = migrationIP.proxy;
      }
      if (migrationIP.hosting !== undefined && existingIP.hosting === undefined) {
        existingIP.hosting = migrationIP.hosting;
      }
    } else {
      // Add new IP
      existing.ipList.push({
        ipAddress: migrationIP.ipAddress,
        country: migrationIP.country,
        region: migrationIP.region,
        asn: migrationIP.asn,
        proxy: migrationIP.proxy ?? false,
        hosting: migrationIP.hosting ?? false,
        firstLogin: new Date(migrationIP.firstLogin),
        logins: migrationIP.logins.map((l: any) => new Date(l))
      });
    }
  });
  
  // Append all punishments (use unique _id to avoid duplicates)
  const existingPunishmentIds = new Set(existing.punishments.map((p: any) => p.id?.toString()));
  const newPunishments = migration.punishments.filter((p: any) => !existingPunishmentIds.has(p._id));
  existing.punishments = [...existing.punishments, ...newPunishments.map((p: any) => ({
    id: p._id,  // Convert _id to id for schema compatibility
    issuerName: p.issuerName,
    issued: new Date(p.issued),
    started: p.started ? new Date(p.started) : undefined,
    type_ordinal: p.type_ordinal,
    modifications: p.modifications || [], // Use from migration if available
    notes: p.notes?.map((note: any) => ({
      text: note.text || '',
      issuerName: note.issuerName || 'Unknown',
      date: new Date(note.date || p.issued)
    })) || [], // Use notes from migration if available
    evidence: p.evidence?.map((ev: any) => {
      if (typeof ev === 'string') {
        return ev;
      }
      return {
        text: ev.text || '',
        issuerName: ev.issuerName || 'Unknown',
        date: new Date(ev.date || p.issued)
      };
    }) || [], // Use evidence from migration if available
    attachedTicketIds: p.attachedTicketIds || [], // Use from migration if available
    data: p.data || {} // Keep as object for MongoDB compatibility
  }))];
  
  // Merge data objects (migration data takes precedence)
  if (migration.data) {
    // Handle both Map and object formats
    const existingDataObj = existing.data instanceof Map ? Object.fromEntries(existing.data) : (existing.data || {});
    const mergedData = {
      ...existingDataObj,
      ...migration.data
    };
    existing.data = new Map(Object.entries(mergedData));
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
    
    let migrationData: any;
    try {
      migrationData = await parseSecureJSON(filePath, {
        maxArrayLength: 1000000,
        maxStringLength: 10000,
        maxNestingDepth: 20
      });
    } catch (error: any) {
      if (error instanceof SecureJSONError) {
        throw new Error(`Security validation failed: ${error.message}`);
      }
      throw error;
    }
    
    const validation = validateMigrationJSON(migrationData);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid migration data');
    }

    const totalRecords = migrationData.players.length;
    console.log(`Migration JSON validation passed. Total records: ${totalRecords}`);

    // Log first player record structure for debugging
    if (migrationData.players.length > 0) {
      console.log('Sample player record from JSON:', JSON.stringify(migrationData.players[0], null, 2));
    }
    
    await updateMigrationProgress('processing_data', {
      message: `Processing ${totalRecords} player records...`,
      recordsProcessed: 0,
      recordsSkipped: 0,
      totalRecords
    }, serverDbConnection);
    
    const Player = serverDbConnection.model<IPlayer>('Player');
    console.log('Player model retrieved:', !!Player);
    console.log('Server DB connection state:', serverDbConnection.readyState);
    console.log('Server DB name:', serverDbConnection.name);

    // Check if Player collection exists and count existing documents
    const existingPlayerCount = await Player.countDocuments();
    console.log(`Existing players in database: ${existingPlayerCount}`);
    
    for (let i = 0; i < migrationData.players.length; i += BATCH_SIZE) {
      const batch = migrationData.players.slice(i, i + BATCH_SIZE);
      const validPlayers: MigrationPlayerData[] = [];
      const uuidsInBatch: string[] = [];
      
      for (let j = 0; j < batch.length; j++) {
        const playerData = batch[j];
        const recordIndex = i + j;
        
        try {
          if (!playerData.minecraftUuid || typeof playerData.minecraftUuid !== 'string') {
            console.warn(`Skipping player record ${recordIndex}: missing or invalid minecraftUuid`);
            recordsSkipped++;
            continue;
          }

          const sanitizedPlayer = validateAndSanitizePlayerData(playerData, recordIndex);
          validPlayers.push(sanitizedPlayer);
          uuidsInBatch.push(sanitizedPlayer.minecraftUuid);
        } catch (error: any) {
          console.warn(`Skipping player record ${recordIndex}: ${error.message}`);
          recordsSkipped++;
          continue;
        }
      }

      console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: Processing ${validPlayers.length} valid players, skipped ${batch.length - validPlayers.length}`);
      if (validPlayers.length > 0) {
        console.log('Sample valid player from batch:', JSON.stringify(validPlayers[0], null, 2));
      }
      
      if (validPlayers.length === 0) continue;
      
      const existingPlayers = await Player.find({
        minecraftUuid: { $in: uuidsInBatch }
      }).lean();

      console.log(`Found ${existingPlayers.length} existing players in database for batch UUIDs:`, uuidsInBatch.slice(0, 3));
      if (existingPlayers.length > 0) {
        console.log('Sample existing player:', JSON.stringify(existingPlayers[0], null, 2));
      }
      
      const existingPlayersMap = new Map(
        existingPlayers.map(p => [p.minecraftUuid, p])
      );
      
      const bulkOps: any[] = [];
      
      for (const playerData of validPlayers) {
        try {
          const existingPlayer = existingPlayersMap.get(playerData.minecraftUuid);
          
          if (existingPlayer) {
            console.log(`Updating existing player: ${playerData.minecraftUuid}`);
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
              _id: uuidv4(), // Add explicit _id like in login function
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
                region: ip.region,
                asn: ip.asn,
                proxy: ip.proxy ?? false,
                hosting: ip.hosting ?? false,
                firstLogin: new Date(ip.firstLogin),
                logins: ip.logins.map(l => new Date(l))
              })) || [],
              punishments: playerData.punishments?.map(p => {
                console.log('Converting punishment:', JSON.stringify(p, null, 2));

                // Convert from migration format to IPlayer punishment format
                const convertedPunishment = {
                  id: p._id,  // Convert _id to id
                  issuerName: p.issuerName,
                  issued: new Date(p.issued),
                  started: p.started ? new Date(p.started) : undefined,
                  type_ordinal: p.type_ordinal,
                  modifications: p.modifications || [], // Use from migration if available
                  notes: p.notes?.map((note: any) => ({
                    text: note.text || '',
                    issuerName: note.issuerName || 'Unknown',
                    date: new Date(note.date || p.issued)
                  })) || [], // Use notes from migration if available
                  evidence: p.evidence?.map((ev: any) => {
                    if (typeof ev === 'string') {
                      return ev;
                    }
                    return {
                      text: ev.text || '',
                      issuerName: ev.issuerName || 'Unknown',
                      date: new Date(ev.date || p.issued)
                    };
                  }) || [], // Use evidence from migration if available
                  attachedTicketIds: p.attachedTicketIds || [], // Use from migration if available
                  data: p.data || {} // Keep as object for MongoDB compatibility
                };

                console.log('Converted punishment:', JSON.stringify(convertedPunishment, null, 2));
                return convertedPunishment;
              }) || [],
              pendingNotifications: [],
              data: new Map(Object.entries(playerData.data || {})) // Use Map like in login function
            };

            console.log(`Creating NEW player document for UUID: ${playerData.minecraftUuid}`);
            console.log('New player document structure:', JSON.stringify(newPlayerDoc, null, 2));

            // Use Player constructor like in login function
            const playerInstance = new Player(newPlayerDoc);
            bulkOps.push({
              insertOne: {
                document: playerInstance
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
        console.log(`Executing bulk write with ${bulkOps.length} operations`);
        console.log('Sample operation:', JSON.stringify(bulkOps[0], null, 2));

        try {
          const result = await Player.bulkWrite(bulkOps, { ordered: false });
          console.log('Bulk write result:', {
            insertedCount: result.insertedCount,
            modifiedCount: result.modifiedCount,
            deletedCount: result.deletedCount,
            upsertedCount: result.upsertedCount,
            matchedCount: result.matchedCount
          });

          // Check for write errors
          if (result.hasWriteErrors()) {
            console.error('Bulk write errors:', JSON.stringify(result.getWriteErrors(), null, 2));
          }

          // Check for write concern errors
          const writeConcernError = result.getWriteConcernError();
          if (writeConcernError) {
            console.error('Write concern error:', JSON.stringify(writeConcernError, null, 2));
          }

          // Check if inserts failed but didn't throw errors
          if (bulkOps.filter(op => op.insertOne).length > 0 && result.insertedCount === 0) {
            console.error('ERROR: All insert operations failed silently!');
            console.error('Expected inserts:', bulkOps.filter(op => op.insertOne).length);
            console.error('Actual inserts:', result.insertedCount);
          }

          // Test a simple direct insert to check schema validation
          if (result.insertedCount === 0 && bulkOps.length > 0 && bulkOps[0].insertOne) {
            console.log('Testing direct insert to check schema validation...');
            try {
              const testDoc = new Player(bulkOps[0].insertOne.document);
              await testDoc.validate();
              console.log('Schema validation passed for test document');
            } catch (validationError) {
              console.error('Schema validation failed:', validationError);
            }
          }

        } catch (bulkError) {
          console.error('Bulk write operation failed:', bulkError);
          throw bulkError;
        }
      } else {
        console.log('No bulk operations to execute for this batch');
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
    try {
      await cleanupMigrationFiles(filePath);
    } catch (cleanupError) {
      console.error('Error during file cleanup (non-fatal):', cleanupError);
    }
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

