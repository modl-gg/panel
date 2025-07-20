import { Connection, Types, Document } from 'mongoose'; // Added Types, Document
import { Request, Response, NextFunction, Express } from 'express'; // Added Express for app type
import { v4 as uuidv4 } from 'uuid'; // For generating new player UUIDs
import { createSystemLog } from './log-routes'; // Import createSystemLog

/**
 * Create a punishment audit log entry with staff member resolution
 */
async function createPunishmentAuditLog(
  serverDbConnection: any,
  serverName: string,
  punishmentData: {
    punishmentId: string;
    typeOrdinal: number;
    targetPlayer: string;
    targetUuid: string;
    issuerName: string;
    reason: string;
    duration?: number;
    isDynamic?: boolean;
  }
): Promise<void> {
  try {
    // Try to resolve issuer to staff member for proper audit tracking
    let auditSource = 'minecraft-api';
    let staffId = null;
    
    try {
      const Staff = serverDbConnection.model('Staff');
      const staffMember = await Staff.findOne({ assignedMinecraftUsername: punishmentData.issuerName });
      if (staffMember) {
        auditSource = staffMember.username;
        staffId = staffMember._id;
      }
    } catch (error) {
      console.warn('Failed to resolve staff member for audit log:', error.message);
    }
    
    const punishmentType = punishmentData.isDynamic ? 'Dynamic' : 'Manual';
    const description = `${punishmentType} punishment ID ${punishmentData.punishmentId} (Type Ordinal: ${punishmentData.typeOrdinal}) issued to ${punishmentData.targetPlayer} (${punishmentData.targetUuid}) by ${punishmentData.issuerName}. Reason: ${punishmentData.reason}.`;
    
    // Create enhanced log with metadata for audit tracking
    const LogModel = serverDbConnection.model('Log');
    const logEntry = new LogModel({
      description,
      level: 'moderation',
      source: auditSource,
      created: new Date(),
      metadata: {
        punishmentId: punishmentData.punishmentId,
        typeOrdinal: punishmentData.typeOrdinal,
        targetPlayer: punishmentData.targetPlayer,
        targetUuid: punishmentData.targetUuid,
        issuerName: punishmentData.issuerName,
        staffId: staffId,
        reason: punishmentData.reason,
        duration: punishmentData.duration,
        isPunishment: true,
        isDynamic: punishmentData.isDynamic || false,
        canRollback: true
      }
    });
    
    await logEntry.save();
    console.log(`AUDIT LOG (${serverName}): ${description} [moderation, ${auditSource}]`);
  } catch (error) {
    console.error('Error creating punishment audit log:', error);
    // Fallback to basic system log
    await createSystemLog(serverDbConnection, serverName, `Error logging punishment audit for ${punishmentData.punishmentId}`, 'error', 'system');
  }
}
import { verifyMinecraftApiKey } from '../middleware/api-auth';
import { IIPAddress, IModification, INote, IPunishment, IPlayer, ITicket, IUsername } from 'modl-shared-web/types';

// Import getUserPermissions from permission middleware
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
    const Settings = req.serverDbConnection.model('Settings');
    const punishmentTypesDoc = await Settings.findOne({ type: 'punishmentTypes' });
    const punishmentTypes = punishmentTypesDoc?.data || [];
    
    // Dynamic punishment type permissions (ordinals > 5)
    const dynamicPunishmentPermissions = punishmentTypes
      .filter((type: any) => type.ordinal > 5)
      .map((type: any) => `punishment.apply.${type.name.toLowerCase().replace(/\s+/g, '-')}`);
    
    // Manual punishment permissions (ordinals 0-5)
    const manualPunishmentPermissions = [
      'punishment.apply.kick',            // ordinal 0
      'punishment.apply.manual-mute',     // ordinal 1
      'punishment.apply.manual-ban',      // ordinal 2
      'punishment.apply.security-ban',    // ordinal 3
      'punishment.apply.linked-ban',      // ordinal 4
      'punishment.apply.blacklist'        // ordinal 5
    ];
    
    // Combine all punishment permissions
    const allPunishmentPermissions = [...dynamicPunishmentPermissions, ...manualPunishmentPermissions];

    // Add punishment permissions to appropriate roles
    if (userRole === 'Super Admin') {
      // Super Admin gets all punishment permissions
      defaultPermissions[userRole] = [...defaultPermissions[userRole], ...allPunishmentPermissions];
    } else if (userRole === 'Admin') {
      // Admin gets all except blacklist
      const adminPunishmentPerms = allPunishmentPermissions.filter((p: string) => 
        !p.includes('blacklist')
      );
      defaultPermissions[userRole] = [...defaultPermissions[userRole], ...adminPunishmentPerms];
    } else if (userRole === 'Moderator') {
      // Moderators get basic punishment permissions, no security-ban, linked-ban, or blacklist
      const moderatorPunishmentPerms = allPunishmentPermissions.filter((p: string) => 
        !p.includes('blacklist') && !p.includes('security-ban') && !p.includes('linked-ban')
      );
      defaultPermissions[userRole] = [...defaultPermissions[userRole], ...moderatorPunishmentPerms];
    } else if (userRole === 'Helper') {
      // Helpers get only kick permission
      defaultPermissions[userRole] = [...defaultPermissions[userRole], 'punishment.apply.kick'];
    }
  } catch (error) {
    console.error('Error fetching punishment permissions:', error);
  }

  // Check if user has a custom role
  try {
    const { getStaffRoleModel } = await import('../utils/schema-utils');
    const StaffRoles = getStaffRoleModel(req.serverDbConnection);
    const customRole = await StaffRoles.findOne({ name: userRole });
    
    if (customRole) {
      return customRole.permissions || [];
    }
  } catch (error) {
    // Custom role model might not exist, fall back to default permissions
  }

  // Return default permissions for the role
  return defaultPermissions[userRole] || [];
}

/**
 * Utility function to safely get data from punishment.data (handles both Map and plain object)
 */
function getPunishmentData(punishment: IPunishment, key: string): any {
  if (!punishment.data) return undefined;
  
  // Handle Map objects
  if (typeof punishment.data.get === 'function') {
    return punishment.data.get(key);
  }
  
  // Handle plain objects
  if (typeof punishment.data === 'object') {
    return (punishment.data as any)[key];
  }
  
  return undefined;
}

/**
 * Utility function to safely set data in punishment.data (handles both Map and plain object)
 */
function setPunishmentData(punishment: IPunishment, key: string, value: any): void {
  // Initialize data if it doesn't exist
  if (!punishment.data) {
    punishment.data = new Map();
  }
  
  // Handle Map objects
  if (typeof punishment.data.set === 'function') {
    punishment.data.set(key, value);
    return;
  }
  
  // Handle plain objects - convert to Map
  if (typeof punishment.data === 'object') {
    const newMap = new Map();
    // Copy existing data
    for (const [k, v] of Object.entries(punishment.data)) {
      newMap.set(k, v);
    }
    // Set new value
    newMap.set(key, value);
    punishment.data = newMap;
  }
}

/**
 * Calculate player status based on active punishment points (matching panel logic)
 */
function calculatePlayerStatus(
  punishments: IPunishment[],
  punishmentTypes: any[],
  thresholds: { social: { medium: number; habitual: number }, gameplay: { medium: number; habitual: number } }
): { social: string; gameplay: string; socialPoints: number; gameplayPoints: number } {
  let socialPoints = 0;
  let gameplayPoints = 0;

  // Calculate points from active punishments
  for (const punishment of punishments) {
    const isActive = isPunishmentActive(punishment);
    if (!isActive) continue;

    const punishmentType = punishmentTypes.find((pt: any) => pt.ordinal === punishment.type_ordinal);
    if (!punishmentType) continue;

    let points = 0;
    const severity = getPunishmentData(punishment, 'severity')?.toLowerCase();
    
    if (punishmentType.customPoints !== undefined) {
      points = punishmentType.customPoints;
    } else if (punishmentType.singleSeverityPoints !== undefined) {
      points = punishmentType.singleSeverityPoints;
    } else if (punishmentType.points && severity) {
      switch (severity) {
        case 'low': case 'lenient':
          points = punishmentType.points.low || 0;
          break;
        case 'regular': case 'medium':
          points = punishmentType.points.regular || 0;
          break;
        case 'severe': case 'aggravated': case 'high':
          points = punishmentType.points.severe || 0;
          break;
      }
    }

    // Add points to category
    if (punishmentType.category === 'Social') {
      socialPoints += points;
    } else if (punishmentType.category === 'Gameplay') {
      gameplayPoints += points;
    }
  }

  // Determine status level based on thresholds
  const getStatusLevel = (points: number, threshold: { medium: number; habitual: number }) => {
    if (points >= threshold.habitual) return 'Habitual';
    else if (points >= threshold.medium) return 'Medium';
    else return 'Low';
  };

  return {
    social: getStatusLevel(socialPoints, thresholds.social),
    gameplay: getStatusLevel(gameplayPoints, thresholds.gameplay),
    socialPoints,
    gameplayPoints
  };
}

/**
 * Check if a punishment is currently active (matching panel logic)
 */
function isPunishmentActive(punishment: IPunishment): boolean {
  const now = new Date();
  
  // Check if punishment has started
  if (!punishment.started) {
    return false; // Not started yet
  }
  
  // Check if punishment has expired
  const duration = getPunishmentData(punishment, 'duration');
  if (duration && duration > 0) {
    const startTime = new Date(punishment.started);
    const expireTime = new Date(startTime.getTime() + duration);
    if (now > expireTime) {
      return false; // Expired
    }
  }
  
  // Check if punishment has been pardoned (look for pardon modification)
  for (const modification of punishment.modifications || []) {
    if (modification.type === 'MANUAL_PARDON' || modification.type === 'AUTO_PARDON') {
      return false; // Pardoned
    }
  }
  
  return true; // Active
}

/**
 * Load punishment type configuration from database
 */
async function loadPunishmentTypeConfig(dbConnection: Connection): Promise<Map<number, "BAN" | "MUTE" | "KICK">> {
  const typeMap = new Map<number, "BAN" | "MUTE" | "KICK">();
  
  // Set hardcoded administrative and system types
  typeMap.set(0, "KICK"); // Kick
  typeMap.set(1, "MUTE"); // Manual Mute
  typeMap.set(2, "BAN");  // Manual Ban
  typeMap.set(3, "BAN");  // Security Ban
  typeMap.set(4, "BAN");  // Linked Ban
  typeMap.set(5, "BAN");  // Blacklist
  
  try {
    const Settings = dbConnection.model('Settings');
    const punishmentTypesDoc = await Settings.findOne({ type: 'punishmentTypes' });
    
    if (punishmentTypesDoc?.data) {
      const punishmentTypes = punishmentTypesDoc.data;
      
      for (const punishmentType of punishmentTypes) {
        // Only process custom punishment types (ordinal 6+)
        if (punishmentType.ordinal && punishmentType.ordinal >= 6) {
          let type: "BAN" | "MUTE" | "KICK" = "BAN"; // Default to ban
          
          // Check duration configuration
          if (punishmentType.durations) {
            // Check regular/first offense as the default type
            const firstDuration = punishmentType.durations.regular?.first || punishmentType.durations.low?.first;
            if (firstDuration?.type) {
              const typeStr = firstDuration.type.toUpperCase();
              if (typeStr.includes('KICK')) {
                type = "KICK";
              } else if (typeStr.includes('BAN')) {
                type = "BAN";
              } else {
                type = "MUTE";
              }
            }
          } else if (punishmentType.singleSeverityDurations) {
            // Check single severity duration
            const firstDuration = punishmentType.singleSeverityDurations.first;
            if (firstDuration?.type) {
              const typeStr = firstDuration.type.toUpperCase();
              if (typeStr.includes('KICK')) {
                type = "KICK";
              } else if (typeStr.includes('BAN')) {
                type = "BAN";
              } else {
                type = "MUTE";
              }
            }
          } else if (punishmentType.name) {
            // Fallback to name-based detection
            const nameStr = punishmentType.name.toLowerCase();
            if (nameStr.includes('kick')) {
              type = "KICK";
            } else if (nameStr.includes('mute')) {
              type = "MUTE";
            } else if (nameStr.includes('ban')) {
              type = "BAN";
            }
          }
          
          typeMap.set(punishmentType.ordinal, type);
        }
      }
    }
  } catch (error) {
    console.error('Error loading punishment type configuration:', error);
  }
  
  return typeMap;
}

/**
 * Utility function to determine punishment type based on type_ordinal and preloaded config
 */
function getPunishmentType(punishment: IPunishment, typeConfig: Map<number, "BAN" | "MUTE" | "KICK">): "BAN" | "MUTE" | "KICK" {
  // Check preloaded config first
  const configuredType = typeConfig.get(punishment.type_ordinal);
  if (configuredType) {
    return configuredType;
  }
  
  // Fallback logic for unknown ordinals
  if (punishment.type_ordinal === 0) {
    return "KICK"; // Kick
  } else if (punishment.type_ordinal === 1) {
    return "MUTE"; // Manual Mute
  }
  
  // All other ordinals (2, 3, 4, 5 and unknown) default to BAN
  return "BAN";
}

/**
 * Utility function to check if punishment is a ban
 */
function isBanPunishment(punishment: IPunishment, typeConfig: Map<number, "BAN" | "MUTE" | "KICK">): boolean {
  return getPunishmentType(punishment, typeConfig) === "BAN";
}

/**
 * Utility function to check if punishment is a mute
 */
function isMutePunishment(punishment: IPunishment, typeConfig: Map<number, "BAN" | "MUTE" | "KICK">): boolean {
  return getPunishmentType(punishment, typeConfig) === "MUTE";
}

/**
 * Utility function to check if punishment is a kick
 */
function isKickPunishment(punishment: IPunishment, typeConfig: Map<number, "BAN" | "MUTE" | "KICK">): boolean {
  return getPunishmentType(punishment, typeConfig) === "KICK";
}

/**
 * Check if a player has any active mutes
 */
function hasActiveMute(player: IPlayer): boolean {
  return player.punishments.some(p => {
    // Check if it's a mute (ordinal 1)
    if (p.type_ordinal !== 1) return false;
    
    // Must be started to be considered "active"
    if (!p.started) return false;
    
    // Check if explicitly marked as inactive
    if (getPunishmentData(p, 'active') === false) return false;
    
    // Check if pardoned
    const isPardoned = p.modifications?.some(mod => 
      mod.type === 'MANUAL_PARDON' || mod.type === 'APPEAL_ACCEPT'
    );
    if (isPardoned) return false;
    
    // Check if expired
    const duration = getPunishmentData(p, 'duration');
    if (duration !== -1 && duration !== undefined) {
      const startTime = new Date(p.started).getTime();
      const endTime = startTime + Number(duration);
      if (endTime <= Date.now()) return false; // Expired
    }
    
    return true; // Active mute found
  });
}

/**
 * Calculate the actual expiration timestamp for a punishment
 * For unstarted punishments, calculates what expiration would be if started now
 */
function calculateExpiration(punishment: IPunishment): number | null {
  // First check if effective state has an expiry (from modifications)
  const effectiveState = getEffectivePunishmentState(punishment);
  if (effectiveState.effectiveExpiry) {
    return effectiveState.effectiveExpiry.getTime();
  }
  
  const duration = getPunishmentData(punishment, 'duration');
  if (duration === undefined || duration === null) {
    return null; // No duration specified
  }
  
  if (duration === -1) {
    return null; // Permanent punishment
  }
  
  // For started punishments, use actual start time
  if (punishment.started && punishment.started !== null && punishment.started !== undefined) {
    const startTime = new Date(punishment.started).getTime();
    return startTime + Number(duration);
  }
  
  // For unstarted punishments, calculate as if starting now (for display purposes)
  const nowTime = new Date().getTime();
  return nowTime + Number(duration);
}

/**
 * Get and clear pending notifications for a player
 * Returns the notifications and removes them from the player's pendingNotifications array
 */
async function getAndClearPlayerNotifications(
  dbConnection: Connection, 
  playerUuid: string
): Promise<any[]> {
  try {
    const Player = dbConnection.model('Player');
    const player = await Player.findOne({ minecraftUuid: playerUuid });
    
    if (!player || !player.pendingNotifications || player.pendingNotifications.length === 0) {
      return [];
    }
    
    // Handle migration from old string format to new object format
    let notifications = [...player.pendingNotifications];
    
    // If we have old string format notifications, clear them and return empty
    if (notifications.length > 0 && typeof notifications[0] === 'string') {
      await Player.updateOne(
        { minecraftUuid: playerUuid },
        { $set: { pendingNotifications: [] } }
      );
      return [];
    }
    
    // Only process object-format notifications
    const validNotifications = notifications.filter(n => typeof n === 'object' && n !== null);
    
    // Clear the notifications
    await Player.updateOne(
      { minecraftUuid: playerUuid },
      { $set: { pendingNotifications: [] } }
    );
    
    return validNotifications;
  } catch (error) {
    console.error(`Error getting notifications for player ${playerUuid}:`, error);
    return [];
  }
}

/**
 * Find and link accounts by IP addresses
 * Links accounts that share IP addresses, considering proxy detection and timing
 * @param dbConnection Database connection
 * @param ipAddresses Array of IP addresses to check for linking
 * @param currentPlayerUuid UUID of the current player (to avoid self-linking)
 * @param serverName Server name for logging
 */
async function findAndLinkAccounts(
  dbConnection: Connection,
  ipAddresses: string[],
  currentPlayerUuid: string,
  serverName: string
): Promise<void> {
  try {
    const Player = dbConnection.model<IPlayer>('Player');
    
    if (!ipAddresses || ipAddresses.length === 0) {
      return;
    }

    
    // Find all players that have used any of these IP addresses
    const potentialLinkedPlayers = await Player.find({
      minecraftUuid: { $ne: currentPlayerUuid }, // Exclude current player
      'ipList.ipAddress': { $in: ipAddresses }
    }).lean<IPlayer[]>();

    const currentPlayer = await Player.findOne({ minecraftUuid: currentPlayerUuid });
    if (!currentPlayer) {
      console.error(`[Account Linking] Current player ${currentPlayerUuid} not found`);
      return;
    }

    const linkedAccounts: string[] = [];

    for (const player of potentialLinkedPlayers) {
      let shouldLink = false;
      const matchingIPs: string[] = [];

      // Check each IP address for linking criteria
      for (const ipAddress of ipAddresses) {
        const playerIpEntry = player.ipList?.find((ip: IIPAddress) => ip.ipAddress === ipAddress);
        const currentPlayerIpEntry = currentPlayer.ipList?.find((ip: IIPAddress) => ip.ipAddress === ipAddress);
        
        if (playerIpEntry && currentPlayerIpEntry) {
          // Both players have used this IP
          const isProxy = playerIpEntry.proxy || currentPlayerIpEntry.proxy;
          
          if (!isProxy) {
            // Non-proxy IP - always link
            shouldLink = true;
            matchingIPs.push(ipAddress);
          } else {
            // Proxy IP - only link if used within 6 hours of each other
            const playerLastLogin = playerIpEntry.logins && playerIpEntry.logins.length > 0 
              ? new Date(Math.max(...playerIpEntry.logins.map((d: any) => new Date(d).getTime())))
              : playerIpEntry.firstLogin;
            
            const currentPlayerLastLogin = currentPlayerIpEntry.logins && currentPlayerIpEntry.logins.length > 0
              ? new Date(Math.max(...currentPlayerIpEntry.logins.map((d: any) => new Date(d).getTime())))
              : currentPlayerIpEntry.firstLogin;

            if (playerLastLogin && currentPlayerLastLogin) {
              const timeDiff = Math.abs(playerLastLogin.getTime() - currentPlayerLastLogin.getTime());
              const sixHours = 6 * 60 * 60 * 1000;
              
              if (timeDiff <= sixHours) {
                shouldLink = true;
                matchingIPs.push(`${ipAddress} (proxy, within 6h)`);
              }
            }
          }
        }
      }

      if (shouldLink) {
        linkedAccounts.push(player.minecraftUuid);
        
        // Update both players' linked accounts
        await updatePlayerLinkedAccounts(dbConnection, currentPlayer.minecraftUuid, player.minecraftUuid);
        await updatePlayerLinkedAccounts(dbConnection, player.minecraftUuid, currentPlayer.minecraftUuid);
        
        
        // Create system log
        await createSystemLog(
          dbConnection,
          serverName,
          `Account linking detected: ${currentPlayer.usernames[0]?.username || 'Unknown'} (${currentPlayer.minecraftUuid}) linked to ${player.usernames[0]?.username || 'Unknown'} (${player.minecraftUuid}) via shared IPs: ${matchingIPs.join(', ')}`,
          'info',
          'account-linking'
        );
      }
    }

    // Account linking completed
  } catch (error) {
    console.error(`[Account Linking] Error finding linked accounts:`, error);
  }
}

/**
 * Update a player's linked accounts list
 * @param dbConnection Database connection
 * @param playerUuid Player to update
 * @param linkedUuid Account to link
 */
async function updatePlayerLinkedAccounts(
  dbConnection: Connection,
  playerUuid: string,
  linkedUuid: string
): Promise<void> {
  try {
    const Player = dbConnection.model<IPlayer>('Player');
    
    const player = await Player.findOne({ minecraftUuid: playerUuid });
    if (!player) {
      return;
    }

    // Initialize linkedAccounts if it doesn't exist
    if (!player.data) {
      player.data = new Map<string, any>();
    }
    
    const existingLinkedAccounts = player.data.get('linkedAccounts') || [];
    
    // Only add if not already linked
    if (!existingLinkedAccounts.includes(linkedUuid)) {
      existingLinkedAccounts.push(linkedUuid);
      player.data.set('linkedAccounts', existingLinkedAccounts);
      player.data.set('lastLinkedAccountUpdate', new Date());
      await player.save({ validateBeforeSave: false });
      
    }
  } catch (error) {
    console.error(`[Account Linking] Error updating player linked accounts:`, error);
  }
}

/**
 * Check if an IP address is new for a player
 * @param player Player object
 * @param ipAddress IP address to check
 * @returns True if this is a new IP for the player
 */
function isNewIPForPlayer(player: IPlayer, ipAddress: string): boolean {
  if (!player.ipList || player.ipList.length === 0) {
    return true; // First IP for this player
  }
  
  return !player.ipList.some((ip: IIPAddress) => ip.ipAddress === ipAddress);
}

/**
 * Check for active alt-blocking bans in linked accounts and issue linked bans
 * @param dbConnection Database connection
 * @param playerUuid Player to check for linked bans
 * @param serverName Server name for logging
 */
async function checkAndIssueLinkedBans(
  dbConnection: Connection,
  playerUuid: string,
  serverName: string
): Promise<void> {
  try {
    const Player = dbConnection.model<IPlayer>('Player');
    const punishmentTypeConfig = await loadPunishmentTypeConfig(dbConnection);
    
    const player = await Player.findOne({ minecraftUuid: playerUuid });
    if (!player) {
      console.error(`[Linked Bans] Player ${playerUuid} not found`);
      return;
    }

    const linkedAccountUuids = player.data?.get('linkedAccounts') || [];
    if (linkedAccountUuids.length === 0) {
      return;
    }


    // Check each linked account for active alt-blocking bans
    for (const linkedUuid of linkedAccountUuids) {
      const linkedPlayer = await Player.findOne({ minecraftUuid: linkedUuid });
      if (!linkedPlayer) {
        console.warn(`[Linked Bans] Linked player ${linkedUuid} not found`);
        continue;
      }

      // Find active alt-blocking bans in linked account
      const activeAltBlockingBans = linkedPlayer.punishments.filter((punishment: IPunishment) => {
        // Must be a ban
        if (!isBanPunishment(punishment, punishmentTypeConfig)) {
          return false;
        }
        
        // Must be active
        if (!isPunishmentActive(punishment, punishmentTypeConfig)) {
          return false;
        }
        
        // Must have alt-blocking enabled
        const isAltBlocking = getPunishmentData(punishment, 'altBlocking');
        return isAltBlocking === true;
      });

      // Issue linked bans for each active alt-blocking ban
      for (const altBlockingBan of activeAltBlockingBans) {
        await issueLinkedBan(
          dbConnection,
          player,
          linkedPlayer,
          altBlockingBan,
          serverName
        );
      }
    }
  } catch (error) {
    console.error(`[Linked Bans] Error checking for linked bans:`, error);
  }
}

/**
 * Issue a linked ban to a player based on an alt-blocking ban from a linked account
 * @param dbConnection Database connection
 * @param targetPlayer Player to receive the linked ban
 * @param sourcePlayer Player with the alt-blocking ban
 * @param sourceAltBlockingBan The alt-blocking ban from the source player
 * @param serverName Server name for logging
 */
async function issueLinkedBan(
  dbConnection: Connection,
  targetPlayer: IPlayer,
  sourcePlayer: IPlayer,
  sourceAltBlockingBan: IPunishment,
  serverName: string
): Promise<void> {
  try {
    // Check if player already has a linked ban for this source punishment
    const existingLinkedBan = targetPlayer.punishments.find((punishment: IPunishment) => {
      const linkedBanId = getPunishmentData(punishment, 'linkedBanId');
      return linkedBanId === sourceAltBlockingBan.id;
    });

    if (existingLinkedBan) {
      return;
    }

    // Calculate expiry based on source ban
    const sourceExpiry = calculateExpiration(sourceAltBlockingBan);
    let linkedBanDuration = -1; // Default to permanent
    let linkedBanExpiry: Date | null = null;
    
    if (sourceExpiry && sourceExpiry > Date.now()) {
      linkedBanDuration = sourceExpiry - Date.now();
      linkedBanExpiry = new Date(sourceExpiry);
    }

    // Generate linked ban ID
    const linkedBanId = uuidv4().substring(0, 8).toUpperCase();
    const reason = `Linked ban (connected to ${sourcePlayer.usernames[0]?.username || 'Unknown'} - ${sourceAltBlockingBan.id})`;

    // Create linked ban data
    const linkedBanData = new Map<string, any>();
    linkedBanData.set('reason', reason);
    linkedBanData.set('automated', true);
    linkedBanData.set('linkedBanId', sourceAltBlockingBan.id);
    linkedBanData.set('linkedToPlayer', sourcePlayer.minecraftUuid);
    linkedBanData.set('duration', linkedBanDuration);
    linkedBanData.set('severity', null); // Set severity to null for linked bans
    linkedBanData.set('status', null); // Set status to null for linked bans
    
    if (linkedBanExpiry) {
      linkedBanData.set('expires', linkedBanExpiry);
    }

    // Create linked ban punishment
    const linkedBanPunishment: IPunishment = {
      id: linkedBanId,
      issuerName: 'System (Linked Ban)',
      issued: new Date(),
      started: undefined, // Needs server acknowledgment
      type_ordinal: 4, // Linked Ban
      modifications: [],
      notes: [],
      attachedTicketIds: [],
      data: linkedBanData
    };

    // Add linked ban to target player
    targetPlayer.punishments.push(linkedBanPunishment);
    await targetPlayer.save();

    // Create system log
    await createSystemLog(
      dbConnection,
      serverName,
      `Linked ban issued: ${targetPlayer.usernames[0]?.username || 'Unknown'} (${targetPlayer.minecraftUuid}) banned due to alt-blocking ban ${sourceAltBlockingBan.id} from linked account ${sourcePlayer.usernames[0]?.username || 'Unknown'} (${sourcePlayer.minecraftUuid}). Expires: ${linkedBanExpiry ? linkedBanExpiry.toISOString() : 'Never'}`,
      'moderation',
      'linked-ban'
    );

  } catch (error) {
    console.error(`[Linked Bans] Error issuing linked ban:`, error);
  }
}

/**
 * Get the appropriate description for a punishment
 * Uses punishment type player description for non-manual punishments, notes for manual ones
 */
async function getPunishmentDescription(
  punishment: IPunishment, 
  dbConnection: Connection
): Promise<string> {
  const defaultDescription = 'No reason provided';
  
  // For manual punishments (Manual Mute=1, Manual Ban=2, Kick=0), use notes
  if (punishment.type_ordinal <= 2) {
    const noteText = punishment.notes && punishment.notes.length > 0 ? punishment.notes[0].text : null;
    return noteText || defaultDescription;
  }
  
  // For non-manual punishments, get the player description from punishment type configuration
  try {
    const Settings = dbConnection.model('Settings');
    const punishmentTypesDoc = await Settings.findOne({ type: 'punishmentTypes' });
    
    if (punishmentTypesDoc?.data) {
      const punishmentTypes = punishmentTypesDoc.data;
      const punishmentType = punishmentTypes.find((pt: any) => pt.ordinal === punishment.type_ordinal);
      
      if (punishmentType?.playerDescription) {
        if (punishmentType.ordinal === 4) {
          return punishmentType.playerDescription.replace("{linked-id}", punishment.data.get('linkedBanId') || 'Unknown');
        }
        return punishmentType.playerDescription;
      }
    }
  } catch (error) {
    console.error('Error fetching punishment type description:', error);
  }
  
  // Fallback to notes if no player description found
  const noteText = punishment.notes && punishment.notes.length > 0 ? punishment.notes[0].text : null;
  return noteText || defaultDescription;
}

/**
 * Utility function to get the effective punishment state considering modifications
 */
function getEffectivePunishmentState(punishment: IPunishment): { effectiveActive: boolean; effectiveExpiry: Date | null; hasModifications: boolean } {
  const modifications = punishment.modifications || [];
  const expiresData = getPunishmentData(punishment, 'expires');
  const originalExpiry = expiresData ? new Date(expiresData) : null;
  const activeData = getPunishmentData(punishment, 'active');
  const originalActive = activeData !== undefined ? activeData !== false : true;
  
  let effectiveActive = originalActive;
  let effectiveExpiry = originalExpiry;
  
  // Apply modifications in chronological order
  const sortedModifications = modifications.sort((a: IModification, b: IModification) => {
    const dateA = a.issued ? new Date(a.issued) : new Date(0);
    const dateB = b.issued ? new Date(b.issued) : new Date(0);
    return dateA.getTime() - dateB.getTime();
  });
  
  for (const mod of sortedModifications) {
    const modDate = mod.issued ? new Date(mod.issued) : new Date();
    
    if (mod.type === 'MANUAL_PARDON' || mod.type === 'APPEAL_ACCEPT') {
      effectiveActive = false;
    } else if (mod.type === 'MANUAL_DURATION_CHANGE') {
      // Recalculate expiry based on modification  
      const effectiveDuration = mod.data ? getPunishmentData({ data: mod.data } as IPunishment, 'effectiveDuration') : undefined;
      if (effectiveDuration === 0 || effectiveDuration === -1) {
        effectiveExpiry = null; // Permanent
        effectiveActive = true;
      } else if (effectiveDuration && effectiveDuration > 0) {
        effectiveExpiry = new Date(modDate.getTime() + effectiveDuration);
        effectiveActive = effectiveExpiry.getTime() > new Date().getTime();
      }
    }
  }
  
  // Final check: if there's an expiry date and it's in the past, the punishment is not active
  if (effectiveExpiry && effectiveExpiry.getTime() <= new Date().getTime()) {
    effectiveActive = false;
  }
  
  return { effectiveActive, effectiveExpiry, hasModifications: modifications.length > 0 };
}

/**
 * Utility function to check if a punishment is valid for execution (ignores started status)
 */
function isPunishmentValid(punishment: IPunishment): boolean {
  if (!punishment.type_ordinal) return false;

  // Get effective state considering modifications
  const { effectiveActive, effectiveExpiry } = getEffectivePunishmentState(punishment);
  
  // If explicitly marked as inactive by modifications
  if (!effectiveActive) {
    return false;
  }
  
  // Check if expired
  if (effectiveExpiry && effectiveExpiry < new Date()) {
    return false;
  }
  
  return true;
}


/**
 * Check and process auto-unbans for permanent until username/skin change punishments
 */
async function checkAndProcessAutoUnbans(
  player: IPlayer, 
  hasUsernameChanged: boolean, 
  hasSkinChanged: boolean, 
  serverDbConnection: Connection,
  serverName: string
): Promise<void> {
  try {
    // Load punishment type configuration to identify permanent punishments
    const Settings = serverDbConnection.model('Settings');
    let permanentUntilUsernameChangeIds: number[] = [];
    let permanentUntilSkinChangeIds: number[] = [];
    
    try {
      const settingsDoc = await Settings.findOne({ type: 'punishmentTypes' });
      if (settingsDoc?.data) {
        const punishmentTypes = settingsDoc.data;
        for (const punishmentType of punishmentTypes) {
          if (punishmentType.permanentUntilUsernameChange) {
            permanentUntilUsernameChangeIds.push(punishmentType.id);
          }
          if (punishmentType.permanentUntilSkinChange) {
            permanentUntilSkinChangeIds.push(punishmentType.id);
          }
        }
      }
    } catch (error) {
      console.error('Error loading punishment types for auto-unban:', error);
      return;
    }

    // Find active punishments that should be auto-unbanned
    const punishmentsToUnban: IPunishment[] = [];
    
    for (const punishment of player.punishments) {
      // Skip if punishment is already inactive
      if (getPunishmentData(punishment, 'active') === false) {
        continue;
      }
      
      // Skip if punishment hasn't been started
      if (!punishment.started) {
        continue;
      }
      
      const punishmentTypeId = punishment.type_ordinal;
      
      // Check username change unbans
      if (hasUsernameChanged && permanentUntilUsernameChangeIds.includes(punishmentTypeId)) {
        punishmentsToUnban.push(punishment);
      }
      
      // Check skin change unbans
      if (hasSkinChanged && permanentUntilSkinChangeIds.includes(punishmentTypeId)) {
        punishmentsToUnban.push(punishment);
      }
    }
    
    // Process unbans
    if (punishmentsToUnban.length > 0) {
      for (const punishment of punishmentsToUnban) {
        // Mark punishment as inactive
        setPunishmentData(punishment, 'active', false);
        
        // Set unban timestamp
        punishment.unbanned = new Date();
        
        // Create a log entry for the auto-unban
        const punishmentTypeId = punishment.type_ordinal;
        const isUsernameUnban = permanentUntilUsernameChangeIds.includes(punishmentTypeId);
        const isSkinUnban = permanentUntilSkinChangeIds.includes(punishmentTypeId);
        
        const reason = isUsernameUnban ? 'Username changed - automatic unban' : 'Skin changed - automatic unban';
        
        // Log the auto-unban
        await createSystemLog(
          serverDbConnection,
          'info',
          `Auto-unbanned player ${player.usernames[player.usernames.length - 1]?.username || 'Unknown'} (${player.minecraftUuid}) - ${reason}`,
          'auto-unban'
        );
      }
      
    }
    
  } catch (error) {
    console.error('Error processing auto-unbans:', error);
  }
}

export function setupMinecraftRoutes(app: Express): void {
  // Apply API key verification middleware to all Minecraft routes
  app.use('/api/minecraft', verifyMinecraftApiKey);

  app.use('/api/minecraft', (req: Request, res: Response, next: NextFunction) => {
    if (!req.serverDbConnection) {
      console.error('Minecraft route accessed without serverDbConnection.');
      return res.status(503).json({
        status: 503,
        message: 'Service Unavailable: Database connection not established for this server.'
      });
    }
    if (!req.serverName) {
      console.error('Minecraft route accessed without serverName.');
      return res.status(500).json({
        status: 500,
        message: 'Internal Server Error: Server name not identified.'
      });
    }
    next();
  });

  /**
   * Player login
   * - Update player's last_connect
   * - Update player's IP list
   * - Check for ban evasion
   * - Start inactive bans or return active punishments
   */
  app.post('/api/minecraft/player/login', async (req: Request, res: Response) => {
    const { minecraftUuid, username, ipAddress, skinHash, ipInfo, serverName: requestServerName } = req.body;
    const serverDbConnection = req.serverDbConnection!;
    const serverName = req.serverName!;
    const Player = serverDbConnection.model<IPlayer>('Player');

    try {
      // Load punishment type configuration
      const punishmentTypeConfig = await loadPunishmentTypeConfig(serverDbConnection);
      
      let player = await Player.findOne({ minecraftUuid });

      if (player) {
        // Update last connect and IP list for existing player
        player.data = player.data || new Map<string, any>();
        player.data.set('lastConnect', new Date());
        
        // Update last server and session tracking
        const currentServer = requestServerName || serverName;
        player.data.set('lastServer', currentServer);
        player.data.set('isOnline', true);
        
        // End previous session if player was marked as online (handles server switches)
        const currentSessionStart = player.data.get('currentSessionStart');
        const lastDisconnect = player.data.get('lastDisconnect');
        
        if (currentSessionStart && !lastDisconnect) {
          // Player was online but no disconnect recorded - end previous session
          const sessionDuration = new Date().getTime() - new Date(currentSessionStart).getTime();
          const totalPlaytime = player.data.get('totalPlaytime') || 0;
          player.data.set('totalPlaytime', totalPlaytime + sessionDuration);
        }
        
        // Start new session
        player.data.set('currentSessionStart', new Date());

        const existingIp = player.ipList.find((ip: IIPAddress) => ip.ipAddress === ipAddress);
        const isNewIP = !existingIp;
        
        if (existingIp) {
          existingIp.logins.push(new Date());
        } else if (ipInfo) { // Only add if ipInfo is available
          player.ipList.push({
            ipAddress,
            country: ipInfo.countryCode || 'Unknown',
            region: ipInfo.regionName && ipInfo.city ? `${ipInfo.regionName}, ${ipInfo.city}` : (ipInfo.regionName || ipInfo.city || 'Unknown'),
            asn: ipInfo.as || 'Unknown',
            proxy: ipInfo.proxy || ipInfo.hosting || false, // Assuming proxy/hosting indicates VPN/proxy
            hosting: ipInfo.hosting || false,
            firstLogin: new Date(),
            logins: [new Date()]
          });
        }

        // Update username list if it's a new username (similar to Java code handling username)
        const existingUsername = player.usernames.find((u: IUsername) => u.username.toLowerCase() === username.toLowerCase());
        const hasUsernameChanged = !existingUsername;
        if (hasUsernameChanged) {
          player.usernames.push({ username, date: new Date() });
        }

        // Check for skin hash changes
        const lastSkinHash = player.data.get('lastSkinHash');
        const hasSkinChanged = lastSkinHash && skinHash && lastSkinHash !== skinHash;
        if (skinHash) {
          player.data.set('lastSkinHash', skinHash);
        }

        // Auto-unban logic for permanent until username/skin change punishments
        if (hasUsernameChanged || hasSkinChanged) {
          await checkAndProcessAutoUnbans(player, hasUsernameChanged, hasSkinChanged, serverDbConnection, serverName);
        }

        // Don't auto-start punishments on login - they should only be started when server acknowledges

        await player.save({ validateBeforeSave: false });
        
        // Check for linked accounts if this is a new IP address
        if (isNewIP && ipAddress) {
          // Run account linking asynchronously to avoid blocking login
          setImmediate(() => {
            findAndLinkAccounts(serverDbConnection, [ipAddress], minecraftUuid, serverName)
              .then(() => {
                // After linking accounts, check for linked bans
                return checkAndIssueLinkedBans(serverDbConnection, minecraftUuid, serverName);
              })
              .catch(error => {
                console.error(`[Account Linking] Error during login linking for ${minecraftUuid}:`, error);
              });
          });
        }
      } else {
        // For new players, we need to get the IP information
        if (!ipInfo) {
          console.warn(`No IP info for new player ${username} (${minecraftUuid}) at IP ${ipAddress}. Skipping IP-based checks.`);
          // Decide if you want to allow login without IP info or return an error
        }

        // Create a new player (similar to Java code: account = new Account(...))
        player = new Player({
          _id: uuidv4(),
          minecraftUuid,
          usernames: [{ username, date: new Date() } as IUsername],
          notes: [] as INote[],
          ipList: ipInfo ? [{ // Only add IP if ipInfo is available
            ipAddress,
            country: ipInfo.countryCode || 'Unknown',
            region: ipInfo.regionName && ipInfo.city ? `${ipInfo.regionName}, ${ipInfo.city}` : (ipInfo.regionName || ipInfo.city || 'Unknown'),
            asn: ipInfo.as || 'Unknown',
            proxy: ipInfo.proxy || ipInfo.hosting || false,
            hosting: ipInfo.hosting || false,
            firstLogin: new Date(),
            logins: [new Date()]
          } as IIPAddress] : [] as IIPAddress[],
          punishments: [] as IPunishment[],
          pendingNotifications: [] as string[],
          data: new Map<string, any>([
            ['firstJoin', new Date()],
            ['lastConnect', new Date()],
            ['lastServer', requestServerName || serverName],
            ['isOnline', true],
            ['currentSessionStart', new Date()],
            ['totalPlaytime', 0]
          ])
        });


        await player.save({ validateBeforeSave: false });
        await createSystemLog(serverDbConnection, serverName, `New player ${username} (${minecraftUuid}) registered`, 'info', 'system-login');
        
        // Check for linked accounts for new players
        if (ipAddress) {
          // Run account linking asynchronously to avoid blocking login
          setImmediate(() => {
            findAndLinkAccounts(serverDbConnection, [ipAddress], minecraftUuid, serverName)
              .then(() => {
                // After linking accounts, check for linked bans
                return checkAndIssueLinkedBans(serverDbConnection, minecraftUuid, serverName);
              })
              .catch(error => {
                console.error(`[Account Linking] Error during new player linking for ${minecraftUuid}:`, error);
              });
          });
        }
      }
      // Determine which punishments to send to server:
      // Priority 1: Already started and still active punishments
      // Priority 2: If no active punishment of that type, send earliest unstarted valid punishment
      
      const startedActivePunishments = player.punishments.filter((punishment: IPunishment) => {
        // Must be started
        if (!punishment.started || punishment.started === null || punishment.started === undefined) return false;
        
        // Get effective state considering modifications (pardons, duration changes, etc.)
        const effectiveState = getEffectivePunishmentState(punishment);
        
        // If punishment has been pardoned or otherwise made inactive by modifications
        if (!effectiveState.effectiveActive) return false;

        // Check duration-based expiry using effective expiry if available
        if (effectiveState.effectiveExpiry) {
          return effectiveState.effectiveExpiry.getTime() > new Date().getTime();
        }
        
        // Fallback to original duration logic for punishments without modifications
        const duration = getPunishmentData(punishment, 'duration');
        if (duration === -1 || duration === undefined) return true; // Permanent punishment
        
        const startTime = new Date(punishment.started).getTime();
        const endTime = startTime + Number(duration);
        
        return endTime > Date.now(); // Active if not expired
      });

      // Get valid unstarted punishments (sorted by issued date - earliest first)
      const unstartedValidPunishments = player.punishments
        .filter((p: IPunishment) => (!p.started || p.started === null || p.started === undefined) && isPunishmentValid(p))
        .sort((a: IPunishment, b: IPunishment) => new Date(a.issued).getTime() - new Date(b.issued).getTime());

      // Find active ban and mute (started punishments)
      const activeBan = startedActivePunishments.find((p: IPunishment) => isBanPunishment(p, punishmentTypeConfig));
      const activeMute = startedActivePunishments.find((p: IPunishment) => isMutePunishment(p, punishmentTypeConfig));
      
      // Find earliest unstarted ban and mute
      const earliestUnstartedBan = unstartedValidPunishments.find((p: IPunishment) => isBanPunishment(p, punishmentTypeConfig));
      const earliestUnstartedMute = unstartedValidPunishments.find((p: IPunishment) => isMutePunishment(p, punishmentTypeConfig));

      // Determine which ban and mute to send (priority: active > earliest unstarted)
      const banToSend = activeBan || earliestUnstartedBan;
      const muteToSend = activeMute || earliestUnstartedMute;

      // Build final punishment list (max 1 ban + 1 mute + other types)
      const activePunishments = [
        // Include all non-ban/mute active punishments (kicks, etc.)
        ...startedActivePunishments.filter((p: IPunishment) => !isBanPunishment(p, punishmentTypeConfig) && !isMutePunishment(p, punishmentTypeConfig)),
        // Include the chosen ban and mute
        ...(banToSend ? [banToSend] : []),
        ...(muteToSend ? [muteToSend] : [])
      ];

      // Convert to simplified active punishment format with proper descriptions
      const formattedPunishments = await Promise.all(activePunishments.map(async (p: IPunishment) => {
        const description = await getPunishmentDescription(p, serverDbConnection);
        const punishmentType = getPunishmentType(p, punishmentTypeConfig);
        
        return {
          type: punishmentType,
          started: p.started ? true : false,
          expiration: calculateExpiration(p),
          description: description,
          id: p.id
        };
      }));

      // Get and clear pending notifications for the player
      const pendingNotifications = await getAndClearPlayerNotifications(serverDbConnection, minecraftUuid);

      return res.status(200).json({
        status: 200,
        activePunishments: formattedPunishments,
        pendingNotifications: pendingNotifications,
      });
    } catch (error: any) {
      console.error('Error in player login:', error);
      // Ensure createSystemLog is called with dbConnection and serverName if an error occurs and they are available
      if (serverDbConnection && serverName) {
        await createSystemLog(serverDbConnection, serverName, `Error during player login for ${minecraftUuid}: ${error.message || error}`, 'error', 'system-login');
      }
      return res.status(500).json({
        status: 500,
        message: 'Internal server error'
      });
    }
  });

  /**
   * Player disconnect
   * - Update player's last_disconnect to current time
   */
  app.post('/api/minecraft/player/disconnect', async (req: Request, res: Response) => {
    const { minecraftUuid } = req.body;
    const serverDbConnection = req.serverDbConnection!;
    const serverName = req.serverName!;
    const Player = serverDbConnection.model<IPlayer>('Player');

    try {
      const player = await Player.findOne({ minecraftUuid });
      if (!player) {
        return res.status(404).json({ status: 404, message: 'Player not found' });
      }

      player.data = player.data || new Map<string, any>();
      player.data.set('lastDisconnect', new Date());
      player.data.set('isOnline', false);
      
      // Calculate session duration and update total playtime
      const currentSessionStart = player.data.get('currentSessionStart');
      if (currentSessionStart) {
        const sessionDuration = new Date().getTime() - new Date(currentSessionStart).getTime();
        const totalPlaytime = player.data.get('totalPlaytime') || 0;
        player.data.set('totalPlaytime', totalPlaytime + sessionDuration);
        
        // Clear current session
        player.data.delete('currentSessionStart');
        
        await createSystemLog(
          serverDbConnection, 
          serverName, 
          `Player ${minecraftUuid} disconnected after ${Math.round(sessionDuration / 60000)} minutes`, 
          'info', 
          'system-disconnect'
        );
      }
      
      await player.save({ validateBeforeSave: false });

      return res.status(200).json({ status: 200, message: 'Player disconnect time updated' });
    } catch (error: any) {
      console.error('Error in player disconnect:', error);
      await createSystemLog(serverDbConnection, serverName, `Error during player disconnect for ${minecraftUuid}: ${error.message || error}`, 'error', 'system-disconnect');
      return res.status(500).json({
        status: 500,
        message: 'Internal server error'
      });
    }
  });

  /**
   * Create ticket
   * - Create a new ticket
   */
  app.post('/api/minecraft/ticket/create', async (req: Request, res: Response) => {
    const { creatorUuid, creatorUsername, type, subject, reportedPlayerUuid, reportedPlayerUsername, chatMessages, formData } = req.body;
    const serverDbConnection = req.serverDbConnection!;
    const serverName = req.serverName!;
    const Ticket = serverDbConnection.model<ITicket>('Ticket');
    const Player = serverDbConnection.model<IPlayer>('Player'); // For fetching player details if needed

    try {
      // Validate creator exists (optional, but good practice)
      const creator = await Player.findOne({ minecraftUuid: creatorUuid });
      if (!creator) {
        return res.status(400).json({ status: 400, message: 'Ticket creator not found.' });
      }
      
      // Generate a unique ticket ID (example format, adjust as needed)
      const ticketId = `${type.toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      // Build content string for initial message
      let contentString = '';
      
      // Add subject as description if different from default pattern
      if (subject && !subject.includes(`Report against ${reportedPlayerUsername}`)) {
        contentString += `Description: ${subject}\n\n`;
      }
      
      // Special handling for chat reports
      if (type === 'chat' && chatMessages && chatMessages.length > 0) {
        contentString += `**Chat Messages:**\n`;
        try {
          const messages = Array.isArray(chatMessages) ? chatMessages : [];
          
          messages.forEach((msg: any) => {
            // Check if msg is a JSON string that needs parsing
            let parsedMsg = msg;
            if (typeof msg === 'string') {
              try {
                parsedMsg = JSON.parse(msg);
              } catch (e) {
                // Not valid JSON, treat as plain string
                contentString += `${msg}\n`;
                return;
              }
            }
            
            // Handle different possible message formats
            if (typeof parsedMsg === 'object' && parsedMsg !== null) {
              // Format 1: { username, message, timestamp }
              if (parsedMsg.username && parsedMsg.message) {
                const timestamp = parsedMsg.timestamp ? new Date(parsedMsg.timestamp).toLocaleString() : 'Unknown time';
                const username = parsedMsg.username;
                const message = parsedMsg.message;
                contentString += `\`[${timestamp}]\` **${username}**: ${message}\n`;
              }
              // Format 2: { player, text, time } (alternative format)
              else if (parsedMsg.player && parsedMsg.text) {
                const timestamp = parsedMsg.time ? new Date(parsedMsg.time).toLocaleString() : 'Unknown time';
                const username = parsedMsg.player;
                const message = parsedMsg.text;
                contentString += `\`[${timestamp}]\` **${username}**: ${message}\n`;
              }
              // Format 3: { name, content, date } (another alternative)
              else if (parsedMsg.name && parsedMsg.content) {
                const timestamp = parsedMsg.date ? new Date(parsedMsg.date).toLocaleString() : 'Unknown time';
                const username = parsedMsg.name;
                const message = parsedMsg.content;
                contentString += `\`[${timestamp}]\` **${username}**: ${message}\n`;
              }
              // Format 4: Object with unknown structure - try to extract useful info
              else {
                // Look for any property that might be a username
                const usernameField = parsedMsg.username || parsedMsg.player || parsedMsg.name || parsedMsg.user || 'Unknown';
                // Look for any property that might be a message
                const messageField = parsedMsg.message || parsedMsg.text || parsedMsg.content || parsedMsg.msg || JSON.stringify(parsedMsg);
                // Look for any property that might be a timestamp
                const timestampField = parsedMsg.timestamp || parsedMsg.time || parsedMsg.date || parsedMsg.when;
                const timestamp = timestampField ? new Date(timestampField).toLocaleString() : 'Unknown time';
                
                contentString += `\`[${timestamp}]\` **${usernameField}**: ${messageField}\n`;
              }
            } else {
              // Fallback for any other format
              contentString += `${JSON.stringify(parsedMsg)}\n`;
            }
          });
        } catch (error) {
          console.error('Error processing chat messages:', error);
          // Fallback to JSON format if all parsing fails
          contentString += `${JSON.stringify(chatMessages, null, 2)}\n`;
        }
        contentString += `\n`;
      }
      
      // Add form data if present
      if (formData && Object.keys(formData).length > 0) {
        Object.entries(formData).forEach(([key, value]) => {
          if (value && value.toString().trim()) {
            const fieldLabel = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
            contentString += `**${fieldLabel}:**\n${value}\n\n`;
          }
        });
      }

      // Prepare ticket data
      const ticketData = {
        _id: ticketId,
        type,
        subject,
        creator: creatorUsername,
        creatorUuid,
        reportedPlayer: reportedPlayerUsername,
        reportedPlayerUuid,
        chatMessages: chatMessages || [],
        formData: formData || {},
        status: 'Open', // Default status for new tickets
        created: new Date(),
        replies: [],
        notes: [],
        tags: [],
        locked: false,
        data: new Map<string, any>()
      };

      // Add initial message if there's content
      if (contentString.trim()) {
        const initialMessage = {
          name: creatorUsername,
          content: contentString.trim(),
          type: 'user',
          created: new Date(),
          staff: false
        };
        ticketData.replies = [initialMessage];
      }

      const newTicket = new Ticket(ticketData);

      await newTicket.save();
      await createSystemLog(serverDbConnection, serverName, `New ticket ${ticketId} created by ${creatorUsername} (${creatorUuid}). Type: ${type}.`, 'info', 'minecraft-api');

      return res.status(201).json({
        status: 201,
        message: 'Ticket created successfully',
        ticketId: newTicket._id
      });
    } catch (error: any) {
      console.error('Error creating ticket:', error);
      await createSystemLog(serverDbConnection, serverName, `Error creating ticket by ${creatorUsername} (${creatorUuid}): ${error.message || error}`, 'error', 'minecraft-api');
      return res.status(500).json({
        status: 500,
        message: 'Internal server error'
      });
    }
  });

  /**
   * Create punishment
   * - Create a new punishment and update player profile
   */
  app.post('/api/minecraft/punishment/create', async (req: Request, res: Response) => {
    const { targetUuid, issuerName, type, type_ordinal, reason, duration, data, notes, attachedTicketIds } = req.body;
    const serverDbConnection = req.serverDbConnection!;
    const serverName = req.serverName!;
    const Player = serverDbConnection.model<IPlayer>('Player');

    try {
      const player = await Player.findOne({ minecraftUuid: targetUuid });
      if (!player) {
        return res.status(404).json({ status: 404, message: 'Target player not found' });
      }

      const punishmentId = uuidv4().substring(0, 8); // Generate an 8-char ID

      // Determine type_ordinal - either from direct ordinal or from type string
      let finalTypeOrdinal: number;
      
      if (type_ordinal !== undefined && type_ordinal !== null) {
        // Direct ordinal provided - validate it's a manual punishment type (0-5)
        if (type_ordinal < 0 || type_ordinal > 5) {
          return res.status(400).json({ status: 400, message: 'Invalid punishment type ordinal. Manual punishments must have ordinal 0-5.' });
        }
        finalTypeOrdinal = type_ordinal;
      } else if (type) {
        // Legacy string type conversion
        if (type === 'Kick' || type === 'KICK') {
          finalTypeOrdinal = 0; // Kick
        } else if (type === 'Mute' || type === 'MUTE') {
          finalTypeOrdinal = 1; // Manual Mute
        } else if (type === 'Ban' || type === 'BAN') {
          finalTypeOrdinal = 2; // Manual Ban
        } else {
          return res.status(400).json({ status: 400, message: 'Invalid punishment type' });
        }
      } else {
        return res.status(400).json({ status: 400, message: 'Either type or type_ordinal must be provided' });
      }

      // Check for mute stacking - prevent new mutes when player already has an active mute
      if (finalTypeOrdinal === 1) { // Manual Mute
        const hasActiveMute = player.punishments.some(p => {
          // Check if it's a mute (ordinal 1)
          if (p.type_ordinal !== 1) return false;
          
          // Check if explicitly marked as inactive
          if (p.data && p.data.get('active') === false) return false;
          
          // Check if pardoned
          const isPardoned = p.modifications?.some(mod => 
            mod.type === 'MANUAL_PARDON' || mod.type === 'APPEAL_ACCEPT'
          );
          if (isPardoned) return false;
          
          // Check if started and expired
          if (p.started) {
            const duration = p.data ? p.data.get('duration') : undefined;
            if (duration !== -1 && duration !== undefined) {
              const startTime = new Date(p.started).getTime();
              const endTime = startTime + Number(duration);
              if (endTime <= Date.now()) return false; // Expired
            }
          }
          
          return true; // Active mute found
        });

        if (hasActiveMute) {
          return res.status(400).json({ 
            status: 400, 
            message: 'Cannot create mute: Player already has an active mute' 
          });
        }
      }

      // Never put reason in data - always use notes instead
      const filteredData = data ? Object.fromEntries(
        Object.entries(data).filter(([key]) => key !== 'reason')
      ) : {};
      
      const newPunishmentData = new Map<string, any>([
        ...(duration ? [['duration', duration] as [string, any]] : []),
        // Don't set expires until punishment is started by server
        ...Object.entries(filteredData)
      ]);

      // Create notes array with reason as first note for ALL punishments
      const punishmentNotes: INote[] = [];
      if (reason) {
        // Add reason as first note for all punishments
        punishmentNotes.push({
          text: reason,
          date: new Date(),
          issuerName: issuerName
        });
      }
      // Add any additional notes
      if (notes) {
        punishmentNotes.push(...notes.map((note: any) => ({ 
          text: note.text, 
          date: new Date(), 
          issuerName: note.issuerName || issuerName 
        } as INote)));
      }

      const newPunishment: IPunishment = {
        id: punishmentId,
        issuerName,
        issued: new Date(),
        // Don't set started until server acknowledges execution
        started: undefined,
        type_ordinal: finalTypeOrdinal,
        modifications: [],
        notes: punishmentNotes,
        attachedTicketIds: attachedTicketIds || [],
        data: newPunishmentData
      };

      player.punishments.push(newPunishment);
      await player.save({ validateBeforeSave: false });
      
      // Create enhanced audit log
      await createPunishmentAuditLog(serverDbConnection, serverName, {
        punishmentId,
        typeOrdinal: finalTypeOrdinal,
        targetPlayer: player.usernames[0]?.username || 'Unknown',
        targetUuid,
        issuerName,
        reason,
        duration,
        isDynamic: false
      });

      return res.status(201).json({
        status: 201,
        message: 'Punishment created successfully',
        punishmentId
      });
    } catch (error: any) {
      console.error('Error creating punishment:', error);
      await createSystemLog(serverDbConnection, serverName, `Error creating punishment for ${targetUuid} by ${issuerName}: ${error.message || error}`, 'error', 'minecraft-api');
      return res.status(500).json({
        status: 500,
        message: 'Internal server error'
      });
    }
  });

  /**
   * Create player note
   * - Add a note to the player's profile
   */
  app.post('/api/minecraft/player/note/create', async (req: Request, res: Response) => {
    const { targetUuid, issuerName, text } = req.body;
    const serverDbConnection = req.serverDbConnection!;
    const serverName = req.serverName!;
    const Player = serverDbConnection.model<IPlayer>('Player');

    try {
      const player = await Player.findOne({ minecraftUuid: targetUuid });
      if (!player) {
        return res.status(404).json({ status: 404, message: 'Player not found' });
      }

      const newNote: INote = {
        text,
        date: new Date(),
        issuerName,
        // issuerId: // If you have issuer's staff ID, add it here
      };

      player.notes.push(newNote);
      await player.save({ validateBeforeSave: false });
      await createSystemLog(serverDbConnection, serverName, `Note added to player ${player.usernames[0].username} (${targetUuid}) by ${issuerName}.`, 'info', 'minecraft-api');

      return res.status(201).json({ status: 201, message: 'Note created successfully' });
    } catch (error: any) {
      console.error('Error creating player note:', error);
      await createSystemLog(serverDbConnection, serverName, `Error creating note for ${targetUuid} by ${issuerName}: ${error.message || error}`, 'error', 'minecraft-api');
      return res.status(500).json({
        status: 500,
        message: 'Internal server error'
      });
    }
  });

  /**
   * Get player profile
   * - Get player information including punishments and notes
   */
  app.get('/api/minecraft/player', async (req: Request, res: Response) => {
    const { minecraftUuid } = req.query;
    const serverDbConnection = req.serverDbConnection!;
    const Player = serverDbConnection.model<IPlayer>('Player');

    if (!minecraftUuid || typeof minecraftUuid !== 'string') {
      return res.status(400).json({ status: 400, message: 'minecraftUuid query parameter is required' });
    }

    try {
      // Load punishment type configuration
      const punishmentTypeConfig = await loadPunishmentTypeConfig(serverDbConnection);
      
      const player = await Player.findOne({ minecraftUuid }).lean<IPlayer>();
      if (!player) {
        return res.status(404).json({ status: 404, message: 'Player not found' });
      }
      const responsePlayer = {
        ...player,
        punishments: player.punishments ? player.punishments.map((p: IPunishment) => ({
          ...p,
          type: getPunishmentType(p, punishmentTypeConfig),
        })) : [],
      };
      return res.status(200).json({ status: 200, player: responsePlayer });
    } catch (error: any) {
      console.error('Error getting player profile:', error);
      return res.status(500).json({
        status: 500,
        message: 'Internal server error'
      });
    }
  });

  /**
   * Get linked accounts
   * - Find accounts linked by IP addresses
   */
  app.get('/api/minecraft/player/linked', async (req: Request, res: Response) => {
    const { minecraftUuid } = req.query;
    const serverDbConnection = req.serverDbConnection!;
    const Player = serverDbConnection.model<IPlayer>('Player');

    if (!minecraftUuid || typeof minecraftUuid !== 'string') {
      return res.status(400).json({ status: 400, message: 'minecraftUuid query parameter is required' });
    }

    try {
      // Load punishment type configuration
      const punishmentTypeConfig = await loadPunishmentTypeConfig(serverDbConnection);
      
      const player = await Player.findOne({ minecraftUuid }).lean<IPlayer>();
      if (!player) {
        return res.status(200).json({ status: 200, linkedAccounts: [] });
      }

      const linkedAccountUuids = new Set<string>();

      // Method 1: Get linked accounts from stored data (new system)
      const storedLinkedAccounts = player.data?.get ? player.data.get('linkedAccounts') : player.data?.linkedAccounts;
      if (storedLinkedAccounts && Array.isArray(storedLinkedAccounts)) {
        storedLinkedAccounts.forEach((uuid: string) => linkedAccountUuids.add(uuid));
      }

      // Method 2: Get linked accounts by IP addresses (legacy/fallback system)
      if (player.ipList && player.ipList.length > 0) {
        const playerIps = player.ipList.map((ip: IIPAddress) => ip.ipAddress);
        const ipLinkedPlayers = await Player.find({
          minecraftUuid: { $ne: minecraftUuid },
          'ipList.ipAddress': { $in: playerIps }
        }).select('minecraftUuid').lean();
        
        ipLinkedPlayers.forEach((p: any) => linkedAccountUuids.add(p.minecraftUuid));
      }

      if (linkedAccountUuids.size === 0) {
        return res.status(200).json({ status: 200, linkedAccounts: [] });
      }

      // Get full player data for all linked accounts
      const linkedPlayers = await Player.find({
        minecraftUuid: { $in: Array.from(linkedAccountUuids) }
      }).select('minecraftUuid usernames punishments data ipList notes').lean<IPlayer[]>();

      const formattedLinkedAccounts = linkedPlayers.map((acc: IPlayer) => {
        const activeBans = acc.punishments ? acc.punishments.filter((p: IPunishment) => isBanPunishment(p, punishmentTypeConfig) && isPunishmentActive(p, punishmentTypeConfig)).length : 0;
        const activeMutes = acc.punishments ? acc.punishments.filter((p: IPunishment) => isMutePunishment(p, punishmentTypeConfig) && isPunishmentActive(p, punishmentTypeConfig)).length : 0;
        const lastLinkedUpdate = acc.data?.get ? acc.data.get('lastLinkedAccountUpdate') : acc.data?.lastLinkedAccountUpdate;
        
        // Return full Account structure that matches Minecraft plugin expectations
        return {
          _id: acc._id,
          minecraftUuid: acc.minecraftUuid,
          usernames: acc.usernames || [],
          notes: acc.notes || [],
          ipList: acc.ipList || [],
          punishments: acc.punishments ? acc.punishments.map((p: IPunishment) => ({
            ...p,
            type: getPunishmentType(p, punishmentTypeConfig),
          })) : [],
          pendingNotifications: [],
          // Additional fields for status display
          activeBans,
          activeMutes,
          lastLinkedUpdate: lastLinkedUpdate || null
        };
      });
      
      return res.status(200).json({ status: 200, linkedAccounts: formattedLinkedAccounts });
    } catch (error: any) {
      console.error('Error getting linked accounts:', error);
      return res.status(500).json({
        status: 500,
        message: 'Internal server error'
      });
    }
  });

  /**
   * Get player profile by username
   * - Get player information by username (most recent player to use that username)
   */
  app.get('/api/minecraft/player-name', async (req: Request, res: Response) => {
    const { username } = req.query;
    const serverDbConnection = req.serverDbConnection!;
    const Player = serverDbConnection.model<IPlayer>('Player');

    if (!username || typeof username !== 'string') {
      return res.status(400).json({ status: 400, message: 'username query parameter is required' });
    }

    try {
      // Load punishment type configuration
      const punishmentTypeConfig = await loadPunishmentTypeConfig(serverDbConnection);
      // Find all players who have used this username (case-insensitive)
      const playersWithUsername = await Player.find({
        'usernames.username': { $regex: new RegExp(`^${username}$`, 'i') }
      }).lean<IPlayer[]>();

      if (!playersWithUsername || playersWithUsername.length === 0) {
        return res.status(404).json({ status: 404, message: 'No player found with that username' });
      }

      // Find the player who most recently logged in with this username
      let mostRecentPlayer: IPlayer | null = null;
      let mostRecentLogin: Date | null = null;

      for (const player of playersWithUsername) {
        // Get the most recent login time from player data
        const lastConnect = player.data?.get ? player.data.get('lastConnect') : player.data?.lastConnect;
        const loginTime = lastConnect ? new Date(lastConnect) : new Date(0);

        if (!mostRecentLogin || loginTime > mostRecentLogin) {
          mostRecentLogin = loginTime;
          mostRecentPlayer = player;
        }
      }

      if (!mostRecentPlayer) {
        return res.status(404).json({ status: 404, message: 'Player not found' });
      }      
      
      const responsePlayer = {
        ...mostRecentPlayer,
        punishments: mostRecentPlayer.punishments ? mostRecentPlayer.punishments.map((p: IPunishment) => ({
          ...p,
          type: getPunishmentType(p, punishmentTypeConfig),
        })) : [],
      };

      return res.status(200).json({ status: 200, player: responsePlayer });
    } catch (error: any) {
      console.error('Error getting player profile by username:', error);
      return res.status(500).json({
        status: 500,
        message: 'Internal server error'
      });
    }
  });

  /**
   * Sync endpoint for Minecraft server polling
   * - Get pending punishments that need to be executed
   * - Update online player status
   * - Return new punishments since last sync
   * Called every 5 seconds by Minecraft server
   */
  app.post('/api/minecraft/sync', async (req: Request, res: Response) => {
    const { onlinePlayers, lastSyncTimestamp } = req.body;
    const serverDbConnection = req.serverDbConnection!;
    const serverName = req.serverName!;
    const Player = serverDbConnection.model<IPlayer>('Player');

    try {
      // Load punishment type configuration
      const punishmentTypeConfig = await loadPunishmentTypeConfig(serverDbConnection);
      
      const now = new Date();
      const lastSync = lastSyncTimestamp ? new Date(lastSyncTimestamp) : new Date(now.getTime() - 24 * 60 * 60 * 1000); // Default to 24 hours ago if no timestamp

      // 1. Update online status for all players
      if (onlinePlayers && Array.isArray(onlinePlayers)) {
        // Set all players to offline first
        await Player.updateMany(
          {},
          { $set: { 'data.isOnline': false, 'data.lastSeen': now } }
        );

        // Set online players to online
        const onlineUuids = onlinePlayers.map((p: any) => p.uuid || p.minecraftUuid);
        if (onlineUuids.length > 0) {
          await Player.updateMany(
            { minecraftUuid: { $in: onlineUuids } },
            { $set: { 'data.isOnline': true, 'data.lastSeen': now } }
          );
        }
      }

      // 2. Find pending punishments for online players specifically
      const onlineUuids = onlinePlayers ? onlinePlayers.map((p: any) => p.uuid || p.minecraftUuid) : [];
      const pendingPunishments: any[] = [];

      if (onlineUuids.length > 0) {
        // Get online players with unstarted punishments or recently issued punishments
        const onlinePlayersWithPendingPunishments = await Player.find({
          minecraftUuid: { $in: onlineUuids },
          $or: [
            { 'punishments.started': null }, // Unstarted punishments (null)
            { 'punishments.started': { $exists: false } }, // Unstarted punishments (missing field)
            { 'punishments.issued': { $gte: lastSync } }    // Recently issued punishments
          ]
        }).lean();

        for (const player of onlinePlayersWithPendingPunishments) {
          // Get all valid unstarted punishments for this player, prioritizing recently issued ones
          const validUnstartedPunishments = player.punishments
            .filter((p: IPunishment) => (!p.started || p.started === null || p.started === undefined) && isPunishmentValid(p))
            .sort((a: IPunishment, b: IPunishment) => new Date(a.issued).getTime() - new Date(b.issued).getTime());

          // Determine which punishments to send to server for this player:
          // Priority 1: Already started and still active punishments
          // Priority 2: If no active punishment of that type, send earliest unstarted valid punishment
          
          const startedActivePunishments = player.punishments.filter((punishment: IPunishment) => {
            // Must be started
            if (!punishment.started || punishment.started === null || punishment.started === undefined) return false;
            
            // Get effective state considering modifications (pardons, duration changes, etc.)
            const effectiveState = getEffectivePunishmentState(punishment);
            
            // If punishment has been pardoned or otherwise made inactive by modifications
            if (!effectiveState.effectiveActive) return false;

            // Check duration-based expiry using effective expiry if available
            if (effectiveState.effectiveExpiry) {
              return effectiveState.effectiveExpiry.getTime() > new Date().getTime();
            }
            
            // Fallback to original duration logic for punishments without modifications
            const duration = getPunishmentData(punishment, 'duration');
            if (duration === -1 || duration === undefined) return true; // Permanent punishment
            
            const startTime = new Date(punishment.started).getTime();
            const endTime = startTime + Number(duration);
            
            return endTime > Date.now(); // Active if not expired
          });

          // Find active ban and mute (started punishments)
          const activeBan = startedActivePunishments.find((p: IPunishment) => isBanPunishment(p, punishmentTypeConfig));
          const activeMute = startedActivePunishments.find((p: IPunishment) => isMutePunishment(p, punishmentTypeConfig));
          
          // Find earliest unstarted ban and mute
          const earliestUnstartedBan = validUnstartedPunishments.find((p: IPunishment) => isBanPunishment(p, punishmentTypeConfig));
          const earliestUnstartedMute = validUnstartedPunishments.find((p: IPunishment) => isMutePunishment(p, punishmentTypeConfig));

          // Determine which ban and mute to send (priority: active > earliest unstarted)
          const banToSend = activeBan || earliestUnstartedBan;
          const muteToSend = activeMute || earliestUnstartedMute;

          // Add the ban if exists
          if (banToSend) {
            const description = await getPunishmentDescription(banToSend, serverDbConnection);
            const banType = getPunishmentType(banToSend, punishmentTypeConfig);

            pendingPunishments.push({
              minecraftUuid: player.minecraftUuid,
              username: player.usernames[player.usernames.length - 1]?.username || 'Unknown',
              punishment: {
                type: banType,
                started: !!banToSend.started,
                expiration: calculateExpiration(banToSend),
                description: description,
                id: banToSend.id
              }
            });
          }

          // Add the mute if exists  
          if (muteToSend) {
            const description = await getPunishmentDescription(muteToSend, serverDbConnection);
            const muteType = getPunishmentType(muteToSend, punishmentTypeConfig);

            pendingPunishments.push({
              minecraftUuid: player.minecraftUuid,
              username: player.usernames[player.usernames.length - 1]?.username || 'Unknown',
              punishment: {
                type: muteType,
                started: !!muteToSend.started,
                expiration: calculateExpiration(muteToSend),
                description: description,
                id: muteToSend.id
              }
            });
          }

          // Add kicks (only recently issued ones since kicks are instant)
          const recentlyIssuedUnstarted = validUnstartedPunishments
            .filter((p: IPunishment) => new Date(p.issued) >= lastSync);
          const priorityKick = recentlyIssuedUnstarted.find((p: IPunishment) => isKickPunishment(p, punishmentTypeConfig));
          
          if (priorityKick) {
            const description = await getPunishmentDescription(priorityKick, serverDbConnection);
            const kickType = getPunishmentType(priorityKick, punishmentTypeConfig);

            pendingPunishments.push({
              minecraftUuid: player.minecraftUuid,
              username: player.usernames[player.usernames.length - 1]?.username || 'Unknown',
              punishment: {
                type: kickType,
                started: false,
                expiration: null, // Kicks are instant
                description: description,
                id: priorityKick.id
              }
            });
          }
        }
      }

      // 3. Find recently started punishments that need to be applied
      const recentlyStartedPlayers = await Player.find({
        'punishments.started': { $gte: lastSync }
      }).lean();

      const recentlyStartedPunishments: any[] = [];

      for (const player of recentlyStartedPlayers) {
        const recentlyStarted = player.punishments
          .filter((p: IPunishment) => p.started && new Date(p.started) >= lastSync);

        for (const punishment of recentlyStarted) {
          const description = await getPunishmentDescription(punishment, serverDbConnection);
          const punishmentType = getPunishmentType(punishment, punishmentTypeConfig);

          recentlyStartedPunishments.push({
            minecraftUuid: player.minecraftUuid,
            username: player.usernames[player.usernames.length - 1]?.username || 'Unknown',
            punishment: {
              type: punishmentType,
              started: true,
              expiration: calculateExpiration(punishment),
              description: description,
              id: punishment.id
            }
          });
        }
      }

      // 4. Find recently modified punishments (pardons, duration changes, etc.)
      const recentlyModifiedPunishments = await Player.aggregate([
        {
          $match: {
            'punishments.modifications.issued': { $gte: lastSync }
          }
        },
        {
          $unwind: '$punishments'
        },
        {
          $match: {
            'punishments.modifications.issued': { $gte: lastSync }
          }
        },
        {
          $project: {
            minecraftUuid: 1,
            username: { $arrayElemAt: ['$usernames.username', -1] },
            punishment: {
              id: '$punishments.id',
              type: '$punishments.type_ordinal',
              modifications: {
                $filter: {
                  input: '$punishments.modifications',
                  cond: { $gte: ['$$this.issued', lastSync] }
                }
              }
            }
          }
        }
      ]);

      // 5. Get server statistics
      const stats = {
        totalPlayers: await Player.countDocuments({}),
        onlinePlayers: onlinePlayers ? onlinePlayers.length : 0,
        activeBans: await Player.countDocuments({
          'punishments.type_ordinal': { $in: [2, 3, 4, 5] }, // Manual Ban, Security Ban, Linked Ban, Blacklist
          'punishments.started': { $exists: true },
          $or: [
            { 'punishments.data.expires': { $exists: false } },
            { 'punishments.data.expires': { $gt: now } }
          ],
          'punishments.data.active': { $ne: false }
        }),
        activeMutes: await Player.countDocuments({
          'punishments.type_ordinal': 1, // Manual Mute
          'punishments.started': { $exists: true },
          $or: [
            { 'punishments.data.expires': { $exists: false } },
            { 'punishments.data.expires': { $gt: now } }
          ],
          'punishments.data.active': { $ne: false }
        })
      };

      // Log sync activity
      // await createSystemLog(
      //   serverDbConnection, 
      //   serverName, 
      //   `Server sync completed. Online: ${stats.onlinePlayers}, Pending punishments: ${pendingPunishments.length}, Recent modifications: ${recentlyModifiedPunishments.length}`, 
      //   'info', 
      //   'minecraft-sync'
      // );

      // 5. Get notifications for online players
      const playerNotifications: any[] = [];
      
      if (onlineUuids.length > 0) {
        for (const playerUuid of onlineUuids) {
          const notifications = await getAndClearPlayerNotifications(serverDbConnection, playerUuid);
          // Convert notification objects to the expected format for SyncResponse.PlayerNotification
          for (const notification of notifications) {
            if (notification && typeof notification === 'object') {
              playerNotifications.push({
                id: notification.id || `notification-${Date.now()}`,
                message: notification.message || 'You have a new notification',
                type: notification.type || 'general',
                timestamp: notification.timestamp ? new Date(notification.timestamp).getTime() : Date.now(),
                targetPlayerUuid: playerUuid
              });
            }
          }
        }
      }

      // Note: Staff permissions are now loaded separately via /api/minecraft/staff-permissions endpoint

      return res.status(200).json({
        status: 200,
        timestamp: now.toISOString(),
        data: {
          pendingPunishments,
          recentlyStartedPunishments,
          recentlyModifiedPunishments,
          playerNotifications,
          stats,
          serverStatus: {
            lastSync: now.toISOString(),
            onlinePlayerCount: stats.onlinePlayers
          }
        }
      });
    } catch (error: any) {
      console.error('Error in Minecraft sync:', error);
      await createSystemLog(serverDbConnection, serverName, `Error during Minecraft sync: ${error.message || error}`, 'error', 'minecraft-sync');
      return res.status(500).json({
        status: 500,
        message: 'Internal server error during sync'
      });
    }
  });

  /**
   * Get staff permissions for Minecraft plugin
   * - Returns all staff members with their permissions
   * - Used on plugin startup and punishment type refresh
   */
  app.get('/api/minecraft/staff-permissions', verifyMinecraftApiKey, async (req: Request, res: Response) => {
    const serverDbConnection = req.serverDbConnection!;
    
    try {
      const Staff = serverDbConnection.model('Staff');
      
      // Get all staff members
      const allStaff = await Staff.find({}).lean();
      
      const staffWithPermissions: any[] = [];
      
      // Get permissions for each staff member
      for (const staffMember of allStaff) {
        try {
          // Get user permissions based on their role
          const userPermissions = await getUserPermissions(req, staffMember.role);
          
          staffWithPermissions.push({
            minecraftUuid: staffMember.assignedMinecraftUuid,
            minecraftUsername: staffMember.assignedMinecraftUsername,
            staffUsername: staffMember.username,
            staffRole: staffMember.role,
            permissions: userPermissions,
            email: staffMember.email
          });
        } catch (permissionError) {
          console.error(`Error getting permissions for staff member ${staffMember.username}:`, permissionError);
          // Include staff member without permissions if permission lookup fails
          staffWithPermissions.push({
            minecraftUuid: staffMember.assignedMinecraftUuid,
            minecraftUsername: staffMember.assignedMinecraftUsername,
            staffUsername: staffMember.username,
            staffRole: staffMember.role,
            permissions: [],
            email: staffMember.email
          });
        }
      }
      
      return res.status(200).json({
        status: 200,
        data: {
          staff: staffWithPermissions
        }
      });
    } catch (error: any) {
      console.error('Error getting staff permissions:', error);
      return res.status(500).json({
        status: 500,
        message: 'Internal server error getting staff permissions'
      });
    }
  });

  /**
   * Acknowledge punishment execution
   * - Mark punishment as started and executed on the server
   * - Update punishment status after server has applied it
   */
  /**
   * Acknowledge notification delivery
   * - Remove notifications from player's pendingNotifications after delivery
   */
  app.post('/api/minecraft/notification/acknowledge', async (req: Request, res: Response) => {
    const { playerUuid, notificationIds, timestamp } = req.body;
    const serverDbConnection = req.serverDbConnection!;
    const serverName = req.serverName!;

    try {
      const Player = serverDbConnection.model<IPlayer>('Player');
      
      // Find the player
      const player = await Player.findOne({ minecraftUuid: playerUuid });
      if (!player) {
        return res.status(404).json({
          status: 404,
          message: `Player ${playerUuid} not found`
        });
      }

      // Remove acknowledged notifications from pendingNotifications
      let removedCount = 0;
      if (player.pendingNotifications && Array.isArray(notificationIds)) {
        const originalLength = player.pendingNotifications.length;
        
        // Handle migration: if we have old string format notifications, just clear them all
        if (player.pendingNotifications.length > 0 && typeof player.pendingNotifications[0] === 'string') {
          player.pendingNotifications = [];
          removedCount = originalLength;
        } else {
          // Filter out notifications with matching IDs (new object format)
          player.pendingNotifications = player.pendingNotifications.filter((notification: any) => {
            if (typeof notification === 'object' && notification && notification.id) {
              return !notificationIds.includes(notification.id);
            }
            return false; // Remove any invalid notifications
          });
          
          removedCount = originalLength - player.pendingNotifications.length;
        }
        
        if (removedCount > 0) {
          await player.save({ validateBeforeSave: false });
        }
      }

      
      return res.status(200).json({
        status: 200,
        message: `Acknowledged ${removedCount} notifications`,
        data: {
          playerUuid,
          acknowledgedCount: removedCount,
          timestamp
        }
      });
      
    } catch (error: any) {
      console.error('Error acknowledging notifications:', error);
      await createSystemLog(serverDbConnection, serverName, `Error acknowledging notifications for ${playerUuid}: ${error.message || error}`, 'error', 'minecraft-sync');
      return res.status(500).json({
        status: 500,
        message: 'Internal server error during notification acknowledgment'
      });
    }
  });

  app.post('/api/minecraft/punishment/acknowledge', async (req: Request, res: Response) => {
    const { punishmentId, playerUuid, executedAt, success, errorMessage } = req.body;
    const serverDbConnection = req.serverDbConnection!;
    const serverName = req.serverName!;
    const Player = serverDbConnection.model<IPlayer>('Player');

    try {
      const player = await Player.findOne({ minecraftUuid: playerUuid });
      if (!player) {
        return res.status(404).json({ status: 404, message: 'Player not found' });
      }

      const punishment = player.punishments.find((p: IPunishment) => p.id === punishmentId);
      if (!punishment) {
        return res.status(404).json({ status: 404, message: 'Punishment not found' });
      }

      // Load punishment type configuration to check if this is a kick
      const punishmentTypeConfig = await loadPunishmentTypeConfig(serverDbConnection);
      const isKick = isKickPunishment(punishment, punishmentTypeConfig);
      
      // Mark punishment as started if successful and set expiry from start time
      if (success) {
        const startTime = new Date(executedAt || Date.now());
        
        // Only set start date if punishment hasn't been started yet
        if (!punishment.started) {
          punishment.started = startTime;
          
          // Set expiry time based on when punishment actually started (except for kicks)
          if (!isKick) {
            const duration = getPunishmentData(punishment, 'duration');
            if (duration && duration > 0) {
              setPunishmentData(punishment, 'expires', new Date(startTime.getTime() + duration));
            }
          }
          // For kicks, mark as completed immediately
          else {
            setPunishmentData(punishment, 'completed', true);
            setPunishmentData(punishment, 'completedAt', startTime);
          }
        }
        
        // Add execution confirmation to punishment data
        setPunishmentData(punishment, 'executedOnServer', true);
        setPunishmentData(punishment, 'executedAt', startTime);
      } else {
        // Log execution failure
        setPunishmentData(punishment, 'executionFailed', true);
        setPunishmentData(punishment, 'executionError', errorMessage || 'Unknown error');
        setPunishmentData(punishment, 'executionAttemptedAt', new Date(executedAt || Date.now()));
      }

      await player.save({ validateBeforeSave: false });

      const logMessage = success 
        ? `Punishment ${punishmentId} executed successfully on server for ${player.usernames[0]?.username} (${playerUuid})`
        : `Punishment ${punishmentId} execution failed for ${player.usernames[0]?.username} (${playerUuid}): ${errorMessage}`;
      
      await createSystemLog(serverDbConnection, serverName, logMessage, success ? 'info' : 'error', 'minecraft-sync');

      return res.status(200).json({
        status: 200,
        message: success ? 'Punishment execution acknowledged' : 'Punishment execution failure recorded'
      });
    } catch (error: any) {
      console.error('Error acknowledging punishment execution:', error);
      await createSystemLog(serverDbConnection, serverName, `Error acknowledging punishment ${punishmentId}: ${error.message || error}`, 'error', 'minecraft-sync');
      return res.status(500).json({
        status: 500,
        message: 'Internal server error'
      });
    }
  });

  /**
   * Get punishment types for Minecraft plugin
   * - Returns punishment types excluding ordinals 0-2 (kick, manual_mute, manual_ban)
   */
  app.get('/api/minecraft/punishment-types', async (req: Request, res: Response) => {
    const serverDbConnection = req.serverDbConnection!;
    
    try {
      const Settings = serverDbConnection.model('Settings');
      const punishmentTypesDoc = await Settings.findOne({ type: 'punishmentTypes' });
      
      if (!punishmentTypesDoc?.data) {
        return res.json({ status: 200, data: [] });
      }
      
      const punishmentTypes = punishmentTypesDoc.data;
      
      // Filter out manual punishment types (ordinals 0-5: kick, manual_mute, manual_ban, security_ban, linked_ban, blacklist)
      const filteredTypes = punishmentTypes.filter((pt: any) => pt.ordinal > 5);
      
      // Transform for plugin consumption
      const result = filteredTypes.map((pt: any) => ({
        id: pt.id,
        ordinal: pt.ordinal,
        name: pt.name,
        category: pt.category,
        isCustomizable: pt.isCustomizable,
        durations: pt.durations,
        points: pt.points,
        customPoints: pt.customPoints,
        canBeAltBlocking: pt.canBeAltBlocking,
        canBeStatWiping: pt.canBeStatWiping,
        singleSeverityPunishment: pt.singleSeverityPunishment,
        staffDescription: pt.staffDescription,
        playerDescription: pt.playerDescription,
        permanentUntilSkinChange: pt.permanentUntilSkinChange,
        permanentUntilNameChange: pt.permanentUntilNameChange
      }));
      
      return res.json({ status: 200, data: result });
    } catch (error: any) {
      console.error('Error fetching punishment types:', error);
      return res.status(500).json({ 
        status: 500, 
        message: 'Failed to fetch punishment types' 
      });
    }
  });

  /**
   * Create dynamic punishment for Minecraft plugin
   * - Creates punishments using type_ordinal for dynamic punishment types (ordinals > 2)
   */
  app.post('/api/minecraft/punishment/dynamic', async (req: Request, res: Response) => {
    const { targetUuid, issuerName, type_ordinal, reason, duration, data, notes, attachedTicketIds, severity, status } = req.body;
    const serverDbConnection = req.serverDbConnection!;
    const serverName = req.serverName!;
    const Player = serverDbConnection.model<IPlayer>('Player');

    try {
      // Validate that this is a dynamic punishment type (ordinal > 5)
      if (!type_ordinal || type_ordinal <= 5) {
        return res.status(400).json({ status: 400, message: 'Invalid punishment type ordinal. Dynamic punishments must have ordinal > 5.' });
      }

      const player = await Player.findOne({ minecraftUuid: targetUuid });
      if (!player) {
        return res.status(404).json({ status: 404, message: 'Target player not found' });
      }

      const punishmentId = uuidv4().substring(0, 8); // Generate an 8-char ID

      // Get punishment type configuration and calculate player status
      const Settings = serverDbConnection.model('Settings');
      
      // Try different settings document structures
      let settingsDoc = await Settings.findOne({ type: 'punishmentTypes' });
      let punishmentTypes = settingsDoc?.data || [];
      
      if (!punishmentTypes || punishmentTypes.length === 0) {
        // Fallback: try the general settings document
        settingsDoc = await Settings.findOne({});
        punishmentTypes = settingsDoc?.settings?.punishmentTypes || [];
      }
      
      // Get status thresholds
      let statusThresholdsDoc = await Settings.findOne({ type: 'statusThresholds' });
      let statusThresholds = statusThresholdsDoc?.data || {
        gameplay: { medium: 5, habitual: 10 },
        social: { medium: 4, habitual: 8 }
      };
      
      if (!statusThresholds || (!statusThresholds.gameplay && !statusThresholds.social)) {
        // Fallback: try the general settings document
        const generalSettingsDoc = await Settings.findOne({});
        statusThresholds = generalSettingsDoc?.settings?.statusThresholds || {
          gameplay: { medium: 5, habitual: 10 },
          social: { medium: 4, habitual: 8 }
        };
      }
      
      const punishmentType = punishmentTypes.find((pt: any) => pt.ordinal === type_ordinal);
      if (!punishmentType) {
        return res.status(400).json({ status: 400, message: 'Invalid punishment type ordinal' });
      }
      
      // Calculate player status automatically (matching panel logic)
      const playerStatus = calculatePlayerStatus(player.punishments || [], punishmentTypes, statusThresholds);
      
      // Determine offense level based on punishment category and player status
      const punishmentCategory = punishmentType.category?.toLowerCase();
      let relevantStatus = 'Low';
      
      if (punishmentCategory === 'social') {
        relevantStatus = playerStatus.social;
      } else if (punishmentCategory === 'gameplay') {
        relevantStatus = playerStatus.gameplay;
      } else {
        // Use higher of the two statuses for administrative categories
        const statusPriority: { [key: string]: number } = { 'Low': 1, 'Medium': 2, 'Habitual': 3 };
        relevantStatus = statusPriority[playerStatus.social] >= statusPriority[playerStatus.gameplay] 
          ? playerStatus.social : playerStatus.gameplay;
      }
      
      // Convert status to lowercase for consistency (matching panel logic)
      const calculatedStatus = relevantStatus.toLowerCase();
      
      // Use calculated status if not provided, or use provided values for manual override
      const finalStatus = status || calculatedStatus;
      const finalSeverity = severity || 'regular'; // Default severity
      
      // Calculate duration based on punishment type configuration (matching panel logic)
      let calculatedDuration = duration || 0;
      
      if (punishmentType.singleSeverityPunishment && punishmentType.singleSeverityDurations) {
        // Single-severity punishment: use status (offense level) for duration
        const durationConfig = punishmentType.singleSeverityDurations[finalStatus];
        if (durationConfig && durationConfig.value > 0) {
          calculatedDuration = convertDurationToMilliseconds(durationConfig);
        }
      } else if (punishmentType.durations) {
        // Multi-severity punishment: use severity and status for duration
        const severityDurations = punishmentType.durations[finalSeverity];
        
        if (severityDurations) {
          const durationConfig = severityDurations[finalStatus];
          
          if (durationConfig && durationConfig.value > 0) {
            calculatedDuration = convertDurationToMilliseconds(durationConfig);
          } else {
            // Try fallback to 'low' status if specific status not found
            const fallbackDuration = severityDurations.low || severityDurations.first;
            
            if (fallbackDuration && fallbackDuration.value > 0) {
              calculatedDuration = convertDurationToMilliseconds(fallbackDuration);
            }
          }
        }
      }

      // Helper function to convert duration configuration to milliseconds
      function convertDurationToMilliseconds(durationConfig: any): number {
        const multiplierMap: { [key: string]: number } = {
          'seconds': 1000,
          'minutes': 60 * 1000,
          'hours': 60 * 60 * 1000,
          'days': 24 * 60 * 60 * 1000,
          'weeks': 7 * 24 * 60 * 60 * 1000,
          'months': 30 * 24 * 60 * 60 * 1000
        };
        return durationConfig.value * (multiplierMap[durationConfig.unit] || 1);
      }

      // Merge data from request, but ensure our calculated values take precedence
      const baseData = data ? Object.entries(data) : [];
      const newPunishmentData = new Map<string, any>([
        ...baseData, // Add request data first
        ['reason', reason], // Override with our values
        ['duration', calculatedDuration], // Calculated duration takes precedence
        ['severity', finalSeverity], // Store the severity used for duration calculation
        ['status', finalStatus], // Store the offense level used for duration calculation
        // Don't set expires until punishment is started by server
      ]);
      

      const newPunishment: IPunishment = {
        id: punishmentId,
        issuerName,
        issued: new Date(),
        // Don't set started until server acknowledges execution
        started: undefined,
        type_ordinal: parseInt(type_ordinal),
        modifications: [],
        notes: notes ? notes.map((noteText: string) => ({ text: noteText, date: new Date(), issuerName: issuerName } as INote)) : [],
        attachedTicketIds: attachedTicketIds || [],
        data: newPunishmentData
      };

      player.punishments.push(newPunishment);
      await player.save({ validateBeforeSave: false });
      
      // Create enhanced audit log
      await createPunishmentAuditLog(serverDbConnection, serverName, {
        punishmentId,
        typeOrdinal: parseInt(type_ordinal),
        targetPlayer: player.usernames[0]?.username || 'Unknown',
        targetUuid,
        issuerName,
        reason,
        duration: calculatedDuration,
        isDynamic: true
      });

      return res.status(201).json({
        status: 201,
        message: 'Dynamic punishment created successfully',
        punishmentId: punishmentId
      });
    } catch (error: any) {
      console.error('Error creating dynamic punishment:', error);
      await createSystemLog(serverDbConnection, serverName, `Error creating dynamic punishment for ${targetUuid} by ${issuerName}: ${error.message || error}`, 'error', 'minecraft-api');
      return res.status(500).json({
        status: 500,
        message: 'Internal server error'
      });
    }
  });

  // Player lookup endpoint for detailed player information
  app.post('/api/minecraft/player-lookup', async (req: Request, res: Response) => {
    // Helper function to calculate player points (simplified)
    function calculateSimplePlayerPoints(punishments: any[]): number {
      let points = 0;
      
      for (const punishment of punishments) {
        if (!punishment.isActive) continue;
        
        // Basic point calculation - in real implementation would use punishment type config
        const type = punishment.type?.toLowerCase() || '';
        if (type.includes('ban')) points += 5;
        else if (type.includes('mute')) points += 3;
        else if (type.includes('kick')) points += 1;
        else if (type.includes('warn')) points += 1;
        else points += 1;
      }
      
      return points;
    }

    // Helper function to calculate player status
    function calculateSimplePlayerStatus(punishments: any[]): string {
      const points = calculateSimplePlayerPoints(punishments);
      
      // Thresholds based on total points from active punishments
      if (points >= 10) return 'habitual';
      if (points >= 5) return 'medium';
      return 'low';
    }

    try {
      const { query } = req.body;
      
      if (!query) {
        return res.status(400).json({
          success: false,
          status: 400,
          message: 'Query parameter is required'
        });
      }

      const Player = req.serverDbConnection!.model<IPlayer>('Player');
      const Ticket = req.serverDbConnection!.model('Ticket');

      // Find player by username or UUID
      let player;
      if (query.length === 36 && query.includes('-')) {
        // Looks like a UUID
        player = await Player.findOne({ minecraftUuid: query });
      } else {
        // Search by current username or previous usernames
        player = await Player.findOne({
          $or: [
            { 'usernames.username': { $regex: new RegExp(`^${query}$`, 'i') } },
            { minecraftUuid: query }
          ]
        });
      }

      if (!player) {
        return res.status(404).json({
          success: false,
          status: 404,
          message: 'Player not found'
        });
      }

      // Get punishment statistics
      const punishments = player.punishments || [];
      const activePunishments = punishments.filter(p => 
        p.isActive && (!p.expiresAt || new Date(p.expiresAt) > new Date())
      );

      const punishmentStats = {
        totalPunishments: punishments.length,
        activePunishments: activePunishments.length,
        bans: punishments.filter(p => p.type && p.type.toLowerCase().includes('ban')).length,
        mutes: punishments.filter(p => p.type && p.type.toLowerCase().includes('mute')).length,
        kicks: punishments.filter(p => p.type && p.type.toLowerCase().includes('kick')).length,
        warnings: punishments.filter(p => p.type && p.type.toLowerCase().includes('warn')).length,
        points: calculateSimplePlayerPoints(punishments),
        status: calculateSimplePlayerStatus(punishments)
      };

      // Get recent punishments (last 5, sorted by date)
      const recentPunishments = punishments
        .sort((a, b) => new Date(b.issuedAt || b.issued).getTime() - new Date(a.issuedAt || a.issued).getTime())
        .slice(0, 5)
        .map(p => ({
          id: p._id || p.id,
          type: p.type || 'Unknown',
          issuer: p.issuer || p.issuerName || 'System',
          issuedAt: p.issuedAt || p.issued,
          expiresAt: p.expiresAt,
          isActive: p.isActive && (!p.expiresAt || new Date(p.expiresAt) > new Date())
        }));

      // Get recent tickets
      const recentTickets = await Ticket.find({ creatorUuid: player.minecraftUuid })
        .sort({ createdAt: -1 })
        .limit(3)
        .select('_id title category status createdAt updatedAt')
        .lean();

      const ticketsFormatted = recentTickets.map(ticket => ({
        id: ticket._id,
        title: ticket.title || 'No title',
        category: ticket.category || 'General',
        status: ticket.status || 'Open',
        createdAt: ticket.createdAt,
        lastUpdated: ticket.updatedAt
      }));

      // Get current username (most recent)
      const currentUsername = player.usernames && player.usernames.length > 0 
        ? player.usernames[player.usernames.length - 1].username 
        : 'Unknown';

      // Get previous usernames (all but the current one)
      const previousUsernames = player.usernames && player.usernames.length > 1
        ? player.usernames.slice(0, -1).map(u => u.username)
        : [];

      // Check if player is currently online (basic check)
      const lastSeenData = player.data?.get ? player.data.get('lastConnect') : player.data?.lastConnect;
      const lastSeen = lastSeenData ? new Date(lastSeenData) : null;
      const isOnline = lastSeen && 
        new Date().getTime() - lastSeen.getTime() < 5 * 60 * 1000; // 5 minutes

      // Build profile URLs
      const baseUrl = process.env.PANEL_URL || 'https://123.cobl.gg';
      const profileUrl = `${baseUrl}/player/${player.minecraftUuid}`;
      const punishmentsUrl = `${baseUrl}/player/${player.minecraftUuid}/punishments`;
      const ticketsUrl = `${baseUrl}/player/${player.minecraftUuid}/tickets`;

      const responseData = {
        minecraftUuid: player.minecraftUuid,
        currentUsername: currentUsername,
        previousUsernames: previousUsernames,
        firstSeen: player.firstSeen,
        lastSeen: lastSeen,
        currentServer: player.currentServer || null,
        isOnline: isOnline,
        ipAddress: player.ipHistory && player.ipHistory.length > 0 
          ? player.ipHistory[player.ipHistory.length - 1].ip 
          : null,
        country: player.ipHistory && player.ipHistory.length > 0 
          ? player.ipHistory[player.ipHistory.length - 1].country 
          : null,
        punishmentStats: punishmentStats,
        recentPunishments: recentPunishments,
        recentTickets: ticketsFormatted,
        profileUrl: profileUrl,
        punishmentsUrl: punishmentsUrl,
        ticketsUrl: ticketsUrl
      };

      res.json({
        success: true,
        status: 200,
        message: 'Player found',
        data: responseData
      });

    } catch (error) {
      console.error('Error in player lookup:', error);
      res.status(500).json({
        success: false,
        status: 500,
        message: 'Internal server error',
        error: error.message
      });
    }
  });

  /**
   * Get linked accounts by UUID (path parameter version)
   * - Find accounts linked by IP addresses
   * - Alternative endpoint format for /api/minecraft/player/{uuid}/linked-accounts
   */
  app.get('/api/minecraft/player/:uuid/linked-accounts', async (req: Request, res: Response) => {
    const { uuid } = req.params;
    const serverDbConnection = req.serverDbConnection!;
    const Player = serverDbConnection.model<IPlayer>('Player');

    if (!uuid || typeof uuid !== 'string') {
      return res.status(400).json({ status: 400, message: 'UUID path parameter is required' });
    }

    try {
      // Load punishment type configuration
      const punishmentTypeConfig = await loadPunishmentTypeConfig(serverDbConnection);
      
      const player = await Player.findOne({ minecraftUuid: uuid }).lean<IPlayer>();
      if (!player) {
        return res.status(200).json({ status: 200, linkedAccounts: [] });
      }

      const linkedAccountUuids = new Set<string>();

      // Method 1: Get linked accounts from stored data (new system)
      const storedLinkedAccounts = player.data?.get ? player.data.get('linkedAccounts') : player.data?.linkedAccounts;
      if (storedLinkedAccounts && Array.isArray(storedLinkedAccounts)) {
        storedLinkedAccounts.forEach((uuid: string) => linkedAccountUuids.add(uuid));
      }

      // Method 2: Get linked accounts by IP addresses (legacy/fallback system)
      if (player.ipList && player.ipList.length > 0) {
        const playerIps = player.ipList.map((ip: IIPAddress) => ip.ipAddress);
        const ipLinkedPlayers = await Player.find({
          minecraftUuid: { $ne: uuid },
          'ipList.ipAddress': { $in: playerIps }
        }).select('minecraftUuid').lean();
        
        ipLinkedPlayers.forEach((p: any) => linkedAccountUuids.add(p.minecraftUuid));
      }

      if (linkedAccountUuids.size === 0) {
        return res.status(200).json({ status: 200, linkedAccounts: [] });
      }

      // Get full player data for all linked accounts
      const linkedPlayers = await Player.find({
        minecraftUuid: { $in: Array.from(linkedAccountUuids) }
      }).select('minecraftUuid usernames punishments data ipList notes').lean<IPlayer[]>();

      const formattedLinkedAccounts = linkedPlayers.map((acc: IPlayer) => {
        const activeBans = acc.punishments ? acc.punishments.filter((p: IPunishment) => isBanPunishment(p, punishmentTypeConfig) && isPunishmentActive(p, punishmentTypeConfig)).length : 0;
        const activeMutes = acc.punishments ? acc.punishments.filter((p: IPunishment) => isMutePunishment(p, punishmentTypeConfig) && isPunishmentActive(p, punishmentTypeConfig)).length : 0;
        const lastLinkedUpdate = acc.data?.get ? acc.data.get('lastLinkedAccountUpdate') : acc.data?.lastLinkedAccountUpdate;
        
        // Return full Account structure that matches Minecraft plugin expectations
        return {
          _id: acc._id,
          minecraftUuid: acc.minecraftUuid,
          usernames: acc.usernames || [],
          notes: acc.notes || [],
          ipList: acc.ipList || [],
          punishments: acc.punishments ? acc.punishments.map((p: IPunishment) => ({
            ...p,
            type: getPunishmentType(p, punishmentTypeConfig),
          })) : [],
          pendingNotifications: [],
          // Additional fields for status display
          activeBans,
          activeMutes,
          lastLinkedUpdate: lastLinkedUpdate || null
        };
      });
      
      return res.status(200).json({ status: 200, linkedAccounts: formattedLinkedAccounts });
    } catch (error: any) {
      console.error('Error getting linked accounts by UUID:', error);
      return res.status(500).json({
        status: 500,
        message: 'Internal server error'
      });
    }
  });

  /**
   * Pardon a punishment by punishment ID
   */
  app.post('/api/minecraft/punishment/:id/pardon', async (req: Request, res: Response) => {
    const { id: punishmentId } = req.params;
    const { issuerName, reason, expectedType } = req.body; // expectedType is optional
    const serverDbConnection = req.serverDbConnection!;
    const serverName = req.serverName!;

    try {
      const Player = serverDbConnection.model<IPlayer>('Player');

      // Find the player with this punishment ID
      const player = await Player.findOne({ 
        'punishments.id': punishmentId 
      });

      if (!player) {
        return res.status(404).json({ 
          status: 404, 
          message: `No player found with punishment ID: ${punishmentId}` 
        });
      }

      // Find the specific punishment
      const punishment = player.punishments.find(p => p.id === punishmentId);
      if (!punishment) {
        return res.status(404).json({ 
          status: 404, 
          message: `Punishment with ID ${punishmentId} not found in player data` 
        });
      }

      // Validate punishment type if expectedType is provided
      if (expectedType) {
        const typeOrdinal = punishment.type_ordinal;
        let isCorrectType = false;
        
        if (expectedType === 'ban') {
          // Ban: ordinals 2, 3, 4, 5 and custom (not 0=kick, 1=mute)
          isCorrectType = typeOrdinal !== 0 && typeOrdinal !== 1;
        } else if (expectedType === 'mute') {
          // Mute: ordinal 1
          isCorrectType = typeOrdinal === 1;
        }
        
        if (!isCorrectType) {
          return res.status(400).json({ 
            status: 400, 
            message: `This punishment is not a ${expectedType}` 
          });
        }
      }

      // Check if already pardoned
      const isAlreadyPardoned = punishment.modifications?.some(mod => 
        mod.type === 'MANUAL_PARDON' || mod.type === 'APPEAL_ACCEPT'
      );

      if (isAlreadyPardoned) {
        return res.status(400).json({ 
          status: 400, 
          message: 'This punishment has already been pardoned' 
        });
      }

      // Add pardon modification
      if (!punishment.modifications) {
        punishment.modifications = [];
      }

      const pardonModification: IModification = {
        type: 'MANUAL_PARDON',
        issuerName: issuerName || 'System',
        issuedAt: new Date(),
        duration: 0
      };

      punishment.modifications.push(pardonModification);

      // Add pardon note
      if (!punishment.notes) {
        punishment.notes = [];
      }

      const pardonNote: INote = {
        text: `Punishment pardoned${reason ? `: ${reason}` : ''}`,
        issuerName: issuerName || 'System',
        issuedAt: new Date()
      };

      punishment.notes.push(pardonNote);

      // Deactivate the punishment
      punishment.isActive = false;

      // Save the player with validation disabled to avoid issues with existing invalid evidence records
      await player.save({ validateBeforeSave: false });

      // Create audit log
      await createPunishmentAuditLog(
        serverDbConnection,
        serverName,
        {
          punishmentId: punishment.id,
          typeOrdinal: punishment.typeOrdinal || 0,
          targetPlayer: player.usernames?.[0]?.username || 'Unknown',
          targetUuid: player.minecraftUuid,
          issuerName: issuerName || 'System',
          reason: `Punishment pardoned${reason ? `: ${reason}` : ''}`,
          isDynamic: false
        }
      );

      res.status(200).json({ 
        status: 200, 
        message: 'Punishment pardoned successfully' 
      });

    } catch (error: any) {
      console.error('Error pardoning punishment:', error);
      res.status(500).json({ 
        status: 500, 
        message: 'Internal server error' 
      });
    }
  });

  /**
   * Pardon a player by name and punishment type
   * Note: /pardon <playername> only sends 'ban', /unmute <playername> sends 'mute'
   */
  app.post('/api/minecraft/player/pardon', async (req: Request, res: Response) => {
    const { playerName, issuerName, punishmentType, reason } = req.body;
    const serverDbConnection = req.serverDbConnection!;
    const serverName = req.serverName!;

    try {
      // Validate punishment type - allow both ban and mute
      if (punishmentType !== 'ban' && punishmentType !== 'mute') {
        return res.status(400).json({ 
          status: 400, 
          message: 'Invalid punishment type. Must be "ban" or "mute".' 
        });
      }

      const Player = serverDbConnection.model<IPlayer>('Player');

      // Find player by username
      const player = await Player.findOne({
        'usernames.username': { $regex: new RegExp(`^${playerName}$`, 'i') }
      });

      if (!player) {
        return res.status(404).json({ 
          status: 404, 
          message: `Player not found: ${playerName}` 
        });
      }


      // Find active punishment of the specified type
      let activePunishment = player.punishments.find(p => {
        // Step 1: Check if explicitly marked as inactive in data
        if (p.data && p.data.get('active') === false) {
          return false;
        }
        
        // Step 2: Check if punishment has been pardoned via modifications
        const isPardoned = p.modifications?.some(mod => 
          mod.type === 'MANUAL_PARDON' || mod.type === 'APPEAL_ACCEPT'
        );
        if (isPardoned) {
          return false;
        }
        
        // Step 3: Check duration and expiration
        const isStarted = !!p.started;
        const duration = p.data ? p.data.get('duration') : undefined;
        if (duration === -1 || duration === undefined) {
          // Permanent punishment - it's valid for pardoning
        } else if (isStarted) {
          // Temporary punishment that's started - check if expired
          const startTime = new Date(p.started).getTime();
          const endTime = startTime + Number(duration);
          
          if (endTime <= Date.now()) {
            return false;
          }
        }
        // Unstarted temporary punishments are also valid for pardoning
        
        // Step 4: Check if it matches the requested punishment type
        const typeOrdinal = p.type_ordinal;
        let matchesType = false;
        
        if (punishmentType === 'ban') {
          // Ban: ordinals 2, 3, 4, 5 and custom (not 0=kick, 1=mute)
          matchesType = typeOrdinal !== 0 && typeOrdinal !== 1;
        } else if (punishmentType === 'mute') {
          // Mute: ordinal 1
          matchesType = typeOrdinal === 1;
        }
        
        return matchesType;
      });

      if (!activePunishment) {
        return res.status(404).json({ 
          status: 404, 
          message: `No active ${punishmentType} found for this player` 
        });
      }

      // Add pardon modification
      if (!activePunishment.modifications) {
        activePunishment.modifications = [];
      }

      const pardonModification: IModification = {
        type: 'MANUAL_PARDON',
        issuerName: issuerName || 'System',
        issuedAt: new Date(),
        duration: 0
      };

      activePunishment.modifications.push(pardonModification);

      // Add pardon note
      if (!activePunishment.notes) {
        activePunishment.notes = [];
      }

      const pardonNote: INote = {
        text: `${punishmentType.charAt(0).toUpperCase() + punishmentType.slice(1)} pardoned${reason ? `: ${reason}` : ''}`,
        issuerName: issuerName || 'System',
        issuedAt: new Date()
      };

      activePunishment.notes.push(pardonNote);

      // Deactivate the punishment
      activePunishment.isActive = false;

      // Save the player with validation disabled to avoid issues with existing invalid evidence records
      await player.save({ validateBeforeSave: false });

      // Create audit log
      await createPunishmentAuditLog(
        serverDbConnection,
        serverName,
        {
          punishmentId: activePunishment.id,
          typeOrdinal: activePunishment.typeOrdinal || 0,
          targetPlayer: playerName,
          targetUuid: player.minecraftUuid,
          issuerName: issuerName || 'System',
          reason: `${punishmentType.charAt(0).toUpperCase() + punishmentType.slice(1)} pardoned${reason ? `: ${reason}` : ''}`,
          isDynamic: false
        }
      );

      res.status(200).json({ 
        status: 200, 
        message: `Successfully pardoned ${playerName}'s ${punishmentType}` 
      });

    } catch (error: any) {
      console.error(`Error pardoning player ${punishmentType}:`, error);
      res.status(500).json({ 
        status: 500, 
        message: 'Internal server error' 
      });
    }
  });
}
