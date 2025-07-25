import { Connection } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { calculatePlayerStatus } from '../utils/player-status-calculator';

interface PunishmentType {
  id: number;
  ordinal: number;
  name: string;
  category: string;
  durations?: {
    low: { 
      first: { value: number; unit: string; };
      medium: { value: number; unit: string; };
      habitual: { value: number; unit: string; };
    };
    regular: { 
      first: { value: number; unit: string; };
      medium: { value: number; unit: string; };
      habitual: { value: number; unit: string; };
    };
    severe: { 
      first: { value: number; unit: string; };
      medium: { value: number; unit: string; };
      habitual: { value: number; unit: string; };
    };
  };
  singleSeverityDurations?: {
    first: { value: number; unit: string; type: 'mute' | 'ban'; };
    medium: { value: number; unit: string; type: 'mute' | 'ban'; };
    habitual: { value: number; unit: string; type: 'mute' | 'ban'; };
  };
  singleSeverityPunishment?: boolean;
}

export class PunishmentService {
  private dbConnection: Connection;

  constructor(dbConnection: Connection) {
    this.dbConnection = dbConnection;
  }

  /**
   * Apply a punishment to a player using the existing punishment creation logic
   * @param playerIdentifier Player's UUID (preferred) or username
   * @param punishmentTypeId The ID of the punishment type to apply
   * @param severity The severity level of the punishment
   * @param reason The reason for the punishment
   * @param ticketId The ticket ID this punishment is associated with
   * @param issuerName The name of the issuer (defaults to AI Moderation System)
   * @param altBlocking Whether this punishment should block alt accounts (optional)
   */
  async applyPunishment(
    playerIdentifier: string,
    punishmentTypeId: number,
    severity: 'low' | 'regular' | 'severe',
    reason: string,
    ticketId: string,
    issuerName: string = 'AI Moderation System',
    altBlocking: boolean = false
  ): Promise<{ success: boolean; punishmentId?: string; error?: string }> {
    try {
      console.log(`[Punishment Service] Attempting to apply punishment - Player: ${playerIdentifier}, Type: ${punishmentTypeId}, Severity: ${severity}, Issuer: ${issuerName}`);
      
      const Player = this.dbConnection.model('Player');
      
      // Find player by UUID or username
      const player = await this.findPlayer(playerIdentifier);
      if (!player) {
        console.log(`[Punishment Service] Player not found: ${playerIdentifier}`);
        return { success: false, error: `Player ${playerIdentifier} not found` };
      }

      console.log(`[Punishment Service] Found player: ${player.usernames?.[0]?.username || 'Unknown'} (${player.minecraftUuid})`);

      // Get punishment type details and calculate duration
      const punishmentData = await this.calculatePunishmentData(
        player, 
        punishmentTypeId, 
        severity, 
        reason, 
        ticketId
      );

      if (!punishmentData) {
        console.log(`[Punishment Service] Failed to calculate punishment data for type ${punishmentTypeId}`);
        return { success: false, error: 'Failed to calculate punishment data' };
      }

      console.log(`[Punishment Service] Calculated punishment data: ${JSON.stringify(punishmentData)}`);
      
      // Validate punishment data
      if (punishmentData.duration === undefined || punishmentData.duration === null) {
        console.log(`[Punishment Service] Invalid duration calculated: ${punishmentData.duration}`);
        return { success: false, error: 'Invalid punishment duration calculated' };
      }

      // Generate punishment ID
      const punishmentId = uuidv4().substring(0, 8).toUpperCase();
      
      // Create punishment data map
      const dataMap = new Map<string, any>();
      
      // Initialize required fields with defaults (matching the existing API route)
      dataMap.set('duration', punishmentData.duration);
      dataMap.set('blockedName', null);
      dataMap.set('blockedSkin', null);
      dataMap.set('linkedBanId', null);
      dataMap.set('linkedBanExpiry', null);
      dataMap.set('chatLog', null);
      dataMap.set('altBlocking', altBlocking);
      dataMap.set('wipeAfterExpiry', false);
      dataMap.set('severity', severity);
      dataMap.set('automated', true);
      dataMap.set('aiGenerated', true);
      dataMap.set('reason', reason);

      // Set expiry if duration is set
      if (punishmentData.duration > 0) {
        dataMap.set('expires', new Date(Date.now() + punishmentData.duration));
      }

      // Create punishment object (matching the existing API route structure)
      const newPunishment = {
        id: punishmentId,
        issuerName,
        issued: new Date(),
        started: (punishmentTypeId === 1 || punishmentTypeId === 2) ? new Date() : undefined, // Start immediately for bans/mutes
        type_ordinal: punishmentTypeId,
        modifications: [],
        notes: [],
        evidence: [],
        attachedTicketIds: [ticketId],
        data: dataMap
      };

      // Add punishment to player
      player.punishments.push(newPunishment);
      await player.save();

      // Create system log
      await this.createSystemLog(
        `${issuerName} applied punishment ID ${punishmentId} (${punishmentData.typeName}, Severity: ${severity}) to player ${playerIdentifier} (${player.minecraftUuid}) for ticket ${ticketId}. Reason: ${reason}`,
        'moderation',
        issuerName === 'AI Moderation System' ? 'ai-moderation' : 'player-api'
      );

      console.log(`[Punishment Service] Successfully applied punishment ${punishmentId} to ${playerIdentifier}`);
      
      // Apply alt-blocking if enabled and trigger account linking
      if (altBlocking) {
        // First, trigger account linking to ensure we have the most up-to-date linked accounts
        const playerIPs = player.ipList?.map((ip: any) => ip.ipAddress) || [];
        if (playerIPs.length > 0) {
          console.log(`[Alt-Blocking] Triggering account linking for alt-blocking punishment ${punishmentId}`);
          await this.findAndLinkAccountsForAltBlocking(playerIPs, player.minecraftUuid);
        }
        
        // Then apply alt-blocking punishments to linked accounts
        await this.applyAltBlockingPunishments(player, punishmentId, reason, issuerName);
        
        // Finally, issue linked bans to all linked accounts based on this new alt-blocking punishment
        await this.issueLinkedBansForAltBlocking(player, punishmentId, issuerName);
      }
      
      return { success: true, punishmentId };
    } catch (error) {
      console.error(`[Punishment Service] Error applying punishment to ${playerIdentifier}:`, error);
      return { success: false, error: `Failed to apply punishment: ${(error as Error).message}` };
    }
  }

  /**
   * Find a player by UUID or username
   */
  private async findPlayer(playerIdentifier: string): Promise<any | null> {
    const Player = this.dbConnection.model('Player');
    
    // Check if the identifier looks like a UUID (36 chars with hyphens or 32 chars without)
    const isUuid = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(playerIdentifier);
    
    if (isUuid) {
      // Search by UUID (most efficient)
      return await Player.findOne({ minecraftUuid: playerIdentifier });
    } else {
      // Fallback to username search (case-insensitive search in usernames array)
      return await Player.findOne({
        'usernames.username': { $regex: new RegExp(`^${playerIdentifier}$`, 'i') }
      });
    }
  }

  /**
   * Calculate punishment data including duration and type information
   */
  private async calculatePunishmentData(
    player: any,
    punishmentTypeId: number,
    severity: 'low' | 'regular' | 'severe',
    reason: string,
    ticketId: string
  ): Promise<{ duration: number; typeName: string } | null> {
    try {
      console.log(`[Punishment Service] Calculating punishment data for type ${punishmentTypeId}, severity ${severity}`);
      
      const Settings = this.dbConnection.model('Settings');
      const punishmentTypesDoc = await Settings.findOne({ type: 'punishmentTypes' });
      
      if (!punishmentTypesDoc?.data) {
        console.log(`[Punishment Service] No punishment types found in settings`);
        return null;
      }

      const punishmentTypes = punishmentTypesDoc.data;
      
      console.log(`[Punishment Service] Available punishment types: ${JSON.stringify(punishmentTypes.map((pt: any) => ({ id: pt.id, ordinal: pt.ordinal, name: pt.name })))}`);
      
      const punishmentType = punishmentTypes.find((pt: any) => 
        pt.id === punishmentTypeId || pt.ordinal === punishmentTypeId
      );
      
      if (!punishmentType) {
        console.log(`[Punishment Service] Punishment type not found for ID ${punishmentTypeId}`);
        return null;
      }
      
      console.log(`[Punishment Service] Found punishment type: ${JSON.stringify({ id: punishmentType.id, ordinal: punishmentType.ordinal, name: punishmentType.name, category: punishmentType.category })}`);

      // Calculate player status to determine appropriate offense level
      let offenseLevel = 'first'; // Default to first offense
      
      try {
        // Get status thresholds from settings (separate document)
        const statusThresholdsDoc = await Settings.findOne({ type: 'statusThresholds' });
        const statusThresholds = statusThresholdsDoc?.data || {
          gameplay: { medium: 5, habitual: 10 },
          social: { medium: 4, habitual: 8 }
        };
        
        // Calculate player status based on existing punishments
        const playerStatus = calculatePlayerStatus(
          player.punishments || [],
          punishmentTypes,
          statusThresholds
        );
        
        // Determine offense level based on punishment category and player status
        const punishmentCategory = punishmentType.category?.toLowerCase();
        let relevantStatus = 'Low';
        
        if (punishmentCategory === 'social') {
          relevantStatus = playerStatus.social;
        } else if (punishmentCategory === 'gameplay') {
          relevantStatus = playerStatus.gameplay;
        } else {
          // For administrative or unknown categories, use the higher of the two statuses
          const statusPriority = { 'Low': 1, 'Medium': 2, 'Habitual': 3 };
          relevantStatus = statusPriority[playerStatus.social] >= statusPriority[playerStatus.gameplay] 
            ? playerStatus.social 
            : playerStatus.gameplay;
        }
        
        // Map status to offense level
        const statusToDurationKey = {
          'Low': 'first',
          'Medium': 'medium', 
          'Habitual': 'habitual'
        };
        offenseLevel = statusToDurationKey[relevantStatus as keyof typeof statusToDurationKey] || 'first';
      } catch (error) {
        console.error('[Punishment Service] Error calculating player status, using first offense level:', error);
        offenseLevel = 'first';
      }

      // Get duration based on punishment type configuration
      let duration = -1; // Default to permanent

      console.log(`[Punishment Service] Calculating duration for offense level: ${offenseLevel}`);
      console.log(`[Punishment Service] Punishment type config: singleSeverityPunishment=${punishmentType.singleSeverityPunishment}, has durations=${!!punishmentType.durations}`);

      if (punishmentType.singleSeverityPunishment && punishmentType.singleSeverityDurations) {
        // Single-severity punishment - use duration from offense level
        console.log(`[Punishment Service] Using single-severity durations: ${JSON.stringify(punishmentType.singleSeverityDurations)}`);
        const durationConfig = punishmentType.singleSeverityDurations[offenseLevel as 'first' | 'medium' | 'habitual'];
        if (durationConfig) {
          duration = this.convertDurationToMilliseconds(durationConfig);
          console.log(`[Punishment Service] Single-severity duration: ${duration}ms from config ${JSON.stringify(durationConfig)}`);
        } else {
          console.log(`[Punishment Service] No single-severity duration config found for offense level: ${offenseLevel}`);
        }
      } else if (punishmentType.durations?.[severity]) {
        // Multi-severity punishment - use duration from punishment type config based on severity and offense level
        console.log(`[Punishment Service] Using multi-severity durations for severity: ${severity}`);
        const severityDuration = punishmentType.durations[severity];
        console.log(`[Punishment Service] Severity duration config: ${JSON.stringify(severityDuration)}`);
        const durationConfig = severityDuration[offenseLevel as 'first' | 'medium' | 'habitual'];
        if (durationConfig) {
          duration = this.convertDurationToMilliseconds(durationConfig);
          console.log(`[Punishment Service] Multi-severity duration: ${duration}ms from config ${JSON.stringify(durationConfig)}`);
        } else {
          // Try with 'first' as fallback
          console.log(`[Punishment Service] No duration config for offense level ${offenseLevel}, trying fallback to 'first'`);
          const fallbackDuration = severityDuration.first;
          if (fallbackDuration) {
            duration = this.convertDurationToMilliseconds(fallbackDuration);
            console.log(`[Punishment Service] Fallback duration: ${duration}ms from config ${JSON.stringify(fallbackDuration)}`);
          } else {
            console.log(`[Punishment Service] No fallback duration config found`);
          }
        }
      } else {
        console.log(`[Punishment Service] No duration configuration found for punishment type`);
      }

      console.log(`[Punishment Service] Final calculated duration: ${duration}ms`);

      return {
        duration,
        typeName: punishmentType.name
      };
    } catch (error) {
      console.error('[Punishment Service] Error calculating punishment data:', error);
      return null;
    }
  }

  /**
   * Convert duration configuration to milliseconds
   */
  private convertDurationToMilliseconds(durationConfig: { value: number; unit: string }): number {
    const multiplierMap: Record<string, number> = {
      'seconds': 1000,
      'minutes': 60 * 1000,
      'hours': 60 * 60 * 1000,
      'days': 24 * 60 * 60 * 1000,
      'weeks': 7 * 24 * 60 * 60 * 1000,
      'months': 30 * 24 * 60 * 60 * 1000
    };
    const multiplier = multiplierMap[durationConfig.unit] || 1;
    return durationConfig.value * multiplier;
  }

  /**
   * Find and link accounts for alt-blocking punishment
   * @param ipAddresses Array of IP addresses to check for linking
   * @param currentPlayerUuid UUID of the current player
   */
  private async findAndLinkAccountsForAltBlocking(
    ipAddresses: string[],
    currentPlayerUuid: string
  ): Promise<void> {
    try {
      const Player = this.dbConnection.model('Player');
      
      if (!ipAddresses || ipAddresses.length === 0) {
        return;
      }

      console.log(`[Alt-Blocking Account Linking] Checking for linked accounts with IPs: ${ipAddresses.join(', ')}`);
      
      // Find all players that have used any of these IP addresses
      const potentialLinkedPlayers = await Player.find({
        minecraftUuid: { $ne: currentPlayerUuid }, // Exclude current player
        'ipList.ipAddress': { $in: ipAddresses }
      }).lean();

      const currentPlayer = await Player.findOne({ minecraftUuid: currentPlayerUuid });
      if (!currentPlayer) {
        console.error(`[Alt-Blocking Account Linking] Current player ${currentPlayerUuid} not found`);
        return;
      }

      const linkedAccounts: string[] = [];

      for (const player of potentialLinkedPlayers) {
        let shouldLink = false;
        const matchingIPs: string[] = [];

        // Check each IP address for linking criteria
        for (const ipAddress of ipAddresses) {
          const playerIpEntry = player.ipList?.find((ip: any) => ip.ipAddress === ipAddress);
          const currentPlayerIpEntry = currentPlayer.ipList?.find((ip: any) => ip.ipAddress === ipAddress);
          
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
          await this.updatePlayerLinkedAccounts(currentPlayer.minecraftUuid, player.minecraftUuid);
          await this.updatePlayerLinkedAccounts(player.minecraftUuid, currentPlayer.minecraftUuid);
          
          console.log(`[Alt-Blocking Account Linking] Linked ${currentPlayer.minecraftUuid} with ${player.minecraftUuid} via IPs: ${matchingIPs.join(', ')}`);
          
          // Create system log
          await this.createSystemLog(
            `Alt-blocking account linking: ${currentPlayer.usernames[0]?.username || 'Unknown'} (${currentPlayer.minecraftUuid}) linked to ${player.usernames[0]?.username || 'Unknown'} (${player.minecraftUuid}) via shared IPs: ${matchingIPs.join(', ')}`,
            'info',
            'alt-blocking'
          );
        }
      }

      if (linkedAccounts.length > 0) {
        console.log(`[Alt-Blocking Account Linking] Found ${linkedAccounts.length} linked accounts for ${currentPlayerUuid}`);
      } else {
        console.log(`[Alt-Blocking Account Linking] No linked accounts found for ${currentPlayerUuid}`);
      }
    } catch (error) {
      console.error(`[Alt-Blocking Account Linking] Error finding linked accounts:`, error);
    }
  }
  
  /**
   * Update a player's linked accounts list
   * @param playerUuid Player to update
   * @param linkedUuid Account to link
   */
  private async updatePlayerLinkedAccounts(
    playerUuid: string,
    linkedUuid: string
  ): Promise<void> {
    try {
      const Player = this.dbConnection.model('Player');
      
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
        await player.save();
        
        console.log(`[Alt-Blocking Account Linking] Updated ${playerUuid} linked accounts: added ${linkedUuid}`);
      }
    } catch (error) {
      console.error(`[Alt-Blocking Account Linking] Error updating player linked accounts:`, error);
    }
  }

  /**
   * Apply alt-blocking punishments to linked accounts
   * @param originalPlayer The player who received the original punishment
   * @param originalPunishmentId The ID of the original punishment
   * @param reason The reason for the punishment
   * @param issuerName The name of the issuer
   */
  private async applyAltBlockingPunishments(
    originalPlayer: any,
    originalPunishmentId: string,
    reason: string,
    issuerName: string
  ): Promise<void> {
    try {
      const Player = this.dbConnection.model('Player');
      
      // Get linked accounts from player data
      const linkedAccountUuids = originalPlayer.data?.get('linkedAccounts') || [];
      
      if (linkedAccountUuids.length === 0) {
        console.log(`[Alt-Blocking] No linked accounts found for ${originalPlayer.minecraftUuid}`);
        return;
      }
      
      console.log(`[Alt-Blocking] Applying alt-blocking bans to ${linkedAccountUuids.length} linked accounts`);
      
      // Apply alt-blocking ban to each linked account
      for (const linkedUuid of linkedAccountUuids) {
        try {
          const linkedPlayer = await Player.findOne({ minecraftUuid: linkedUuid });
          if (!linkedPlayer) {
            console.warn(`[Alt-Blocking] Linked player ${linkedUuid} not found`);
            continue;
          }
          
          // Generate punishment ID for the alt-blocking ban
          const altBlockingPunishmentId = uuidv4().substring(0, 8).toUpperCase();
          const altBlockingReason = `Alt-blocking ban (linked to ${originalPlayer.usernames[0]?.username || 'Unknown'} - ${originalPunishmentId}): ${reason}`;
          
          // Create alt-blocking ban data
          const altBlockingDataMap = new Map<string, any>();
          altBlockingDataMap.set('reason', altBlockingReason);
          altBlockingDataMap.set('automated', true);
          altBlockingDataMap.set('altBlockingSource', originalPunishmentId);
          altBlockingDataMap.set('linkedToPlayer', originalPlayer.minecraftUuid);
          altBlockingDataMap.set('duration', -1); // Permanent alt-blocking ban
          
          // Create alt-blocking punishment
          const altBlockingPunishment = {
            id: altBlockingPunishmentId,
            issuerName: `${issuerName} (Alt-Blocking)`,
            issued: new Date(),
            started: undefined, // Needs server acknowledgment
            type_ordinal: 2, // Manual Ban
            modifications: [],
            notes: [],
            evidence: [],
            attachedTicketIds: [],
            data: altBlockingDataMap
          };
          
          // Add punishment to linked player
          linkedPlayer.punishments.push(altBlockingPunishment);
          await linkedPlayer.save();
          
          // Create system log
          await this.createSystemLog(
            `Alt-blocking ban applied: ${linkedPlayer.usernames[0]?.username || 'Unknown'} (${linkedUuid}) banned due to linked account ${originalPlayer.usernames[0]?.username || 'Unknown'} (${originalPlayer.minecraftUuid}) punishment ${originalPunishmentId}`,
            'moderation',
            'alt-blocking'
          );
          
          console.log(`[Alt-Blocking] Applied ban ${altBlockingPunishmentId} to linked account ${linkedUuid}`);
        } catch (error) {
          console.error(`[Alt-Blocking] Error applying punishment to linked account ${linkedUuid}:`, error);
        }
      }
      
      console.log(`[Alt-Blocking] Completed alt-blocking enforcement for punishment ${originalPunishmentId}`);
    } catch (error) {
      console.error(`[Alt-Blocking] Error applying alt-blocking punishments:`, error);
    }
  }
  
  /**
   * Issue linked bans to all linked accounts based on a new alt-blocking punishment
   * @param originalPlayer The player who received the original alt-blocking punishment
   * @param originalPunishmentId The ID of the original alt-blocking punishment
   * @param issuerName The name of the issuer
   */
  private async issueLinkedBansForAltBlocking(
    originalPlayer: any,
    originalPunishmentId: string,
    issuerName: string
  ): Promise<void> {
    try {
      const Player = this.dbConnection.model('Player');
      
      // Get the original alt-blocking punishment to determine expiry
      const originalPunishment = originalPlayer.punishments.find((p: any) => p.id === originalPunishmentId);
      if (!originalPunishment) {
        console.error(`[Linked Bans] Original punishment ${originalPunishmentId} not found`);
        return;
      }
      
      // Calculate expiry based on original punishment
      const originalExpiry = this.calculatePunishmentExpiration(originalPunishment);
      let linkedBanDuration = -1; // Default to permanent
      let linkedBanExpiry: Date | null = null;
      
      if (originalExpiry) {
        if (originalExpiry > Date.now()) {
          // Original punishment is still active - link expiry matches original
          linkedBanDuration = originalExpiry - Date.now();
          linkedBanExpiry = new Date(originalExpiry);
        } else {
          // Original punishment has expired - linked ban should be permanent by default
          // This handles cases where an alt-blocking punishment has already expired
          linkedBanDuration = -1; // Permanent
          linkedBanExpiry = null;
        }
      } else {
        // Original punishment is permanent - linked ban should also be permanent
        linkedBanDuration = -1; // Permanent
        linkedBanExpiry = null;
      }
      
      // Get linked accounts from player data
      const linkedAccountUuids = originalPlayer.data?.get('linkedAccounts') || [];
      
      if (linkedAccountUuids.length === 0) {
        console.log(`[Linked Bans] No linked accounts found for ${originalPlayer.minecraftUuid}`);
        return;
      }
      
      console.log(`[Linked Bans] Issuing linked bans to ${linkedAccountUuids.length} accounts based on alt-blocking punishment ${originalPunishmentId}`);
      
      // Issue linked bans to each linked account
      for (const linkedUuid of linkedAccountUuids) {
        try {
          const linkedPlayer = await Player.findOne({ minecraftUuid: linkedUuid });
          if (!linkedPlayer) {
            console.warn(`[Linked Bans] Linked player ${linkedUuid} not found`);
            continue;
          }
          
          // Check if player already has a linked ban for this source punishment
          const existingLinkedBan = linkedPlayer.punishments.find((punishment: any) => {
            const linkedBanId = punishment.data?.get ? punishment.data.get('linkedBanId') : punishment.data?.linkedBanId;
            return linkedBanId === originalPunishmentId;
          });

          if (existingLinkedBan) {
            console.log(`[Linked Bans] Player ${linkedUuid} already has linked ban for source punishment ${originalPunishmentId}`);
            continue;
          }
          
          // Generate linked ban ID
          const linkedBanId = uuidv4().substring(0, 8).toUpperCase();
          const reason = `Linked ban (connected to ${originalPlayer.usernames[0]?.username || 'Unknown'} - ${originalPunishmentId})`;
          
          // Create linked ban data
          const linkedBanDataMap = new Map<string, any>();
          linkedBanDataMap.set('reason', reason);
          linkedBanDataMap.set('automated', true);
          linkedBanDataMap.set('linkedBanId', originalPunishmentId);
          linkedBanDataMap.set('linkedToPlayer', originalPlayer.minecraftUuid);
          linkedBanDataMap.set('duration', linkedBanDuration);
          linkedBanDataMap.set('severity', null); // Set severity to null for linked bans
          linkedBanDataMap.set('status', null); // Set status to null for linked bans
          
          if (linkedBanExpiry) {
            linkedBanDataMap.set('expires', linkedBanExpiry);
          }
          
          // Create linked ban punishment
          const linkedBanPunishment = {
            id: linkedBanId,
            issuerName: `${issuerName} (Linked Ban)`,
            issued: new Date(),
            started: undefined, // Needs server acknowledgment
            type_ordinal: 4, // Linked Ban
            modifications: [],
            notes: [],
            evidence: [],
            attachedTicketIds: [],
            data: linkedBanDataMap
          };
          
          // Add linked ban to linked player
          linkedPlayer.punishments.push(linkedBanPunishment);
          await linkedPlayer.save();
          
          // Create system log
          await this.createSystemLog(
            `Linked ban issued: ${linkedPlayer.usernames[0]?.username || 'Unknown'} (${linkedUuid}) banned due to alt-blocking punishment ${originalPunishmentId} from linked account ${originalPlayer.usernames[0]?.username || 'Unknown'} (${originalPlayer.minecraftUuid}). Expires: ${linkedBanExpiry ? linkedBanExpiry.toISOString() : 'Never'}`,
            'moderation',
            'linked-ban'
          );
          
          console.log(`[Linked Bans] Issued linked ban ${linkedBanId} to linked account ${linkedUuid}`);
        } catch (error) {
          console.error(`[Linked Bans] Error issuing linked ban to ${linkedUuid}:`, error);
        }
      }
      
      console.log(`[Linked Bans] Completed linked ban issuance for alt-blocking punishment ${originalPunishmentId}`);
    } catch (error) {
      console.error(`[Linked Bans] Error issuing linked bans for alt-blocking:`, error);
    }
  }
  
  /**
   * Calculate punishment expiration timestamp
   * @param punishment The punishment to calculate expiration for
   * @returns Expiration timestamp in milliseconds, or null if permanent
   */
  private calculatePunishmentExpiration(punishment: any): number | null {
    const expires = punishment.data?.get ? punishment.data.get('expires') : punishment.data?.expires;
    if (expires) {
      return new Date(expires).getTime();
    }
    
    const duration = punishment.data?.get ? punishment.data.get('duration') : punishment.data?.duration;
    if (duration === undefined || duration === null || duration === -1) {
      return null; // Permanent punishment
    }
    
    // For started punishments, use actual start time
    if (punishment.started && punishment.started !== null && punishment.started !== undefined) {
      return new Date(punishment.started).getTime() + Number(duration);
    }
    
    // For unstarted punishments, calculate from current time
    return Date.now() + Number(duration);
  }

  /**
   * Create a system log entry
   */
  private async createSystemLog(
    description: string,
    level: 'info' | 'warning' | 'error' | 'moderation' = 'info',
    source: string = 'system'
  ): Promise<void> {
    try {
      const Log = this.dbConnection.model('Log');
      
      const logEntry = new Log({
        created: new Date(),
        description,
        level,
        source
      });
      
      await logEntry.save();
    } catch (error) {
      console.error('[Punishment Service] Error creating system log:', error);
      // Don't throw here as logging failure shouldn't break the main flow
    }
  }
}

export default PunishmentService;
