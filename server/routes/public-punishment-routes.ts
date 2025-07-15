import express, { Request, Response } from 'express';

const router = express.Router();

// Local type definitions (matching other route files)
interface IPunishment {
  id: string;
  issuerName: string;
  issued: Date;
  started?: Date;
  type_ordinal: number;
  modifications: IModification[];
  notes: string[];
  evidence: string[];
  attachedTicketIds: string[];
  data: Map<string, any>;
}

interface IModification {
  type: string;
  issued?: Date;
  data?: Map<string, any>;
}

interface IPlayer {
  minecraftUuid: string;
  usernames: Array<{ username: string }>;
  punishments: IPunishment[];
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

// Get public punishment information for appeals (excludes staff-only data)
router.get('/punishment/:punishmentId/appeal-info', async (req: Request<{ punishmentId: string }>, res: Response) => {
  try {
    const punishmentId = req.params.punishmentId;
    
    if (!req.serverDbConnection) {
      res.status(500).json({ error: 'Database connection not available' });
      return;
    }
    
    const Player = req.serverDbConnection.model<IPlayer>('Player');
    
    // Search for the punishment across all players
    const player = await Player.findOne({ 'punishments.id': punishmentId });
    
    if (!player) {
      res.status(404).json({ error: 'Punishment not found' });
      return;
    }
    
    // Find the specific punishment within the player's punishments
    const punishment = player.punishments.find((p: any) => p.id === punishmentId);
    
    if (!punishment) {
      res.status(404).json({ error: 'Punishment not found' });
      return;
    }

    // Check if punishment has been started - error if not started
    if (!punishment.started) {
      res.status(400).json({ error: 'Punishment has not been started yet and cannot be appealed' });
      return;
    }
    
    // Get the punishment type name, appealability, and appeal form from settings
    let punishmentTypeName = 'Violation';
    let punishmentTypeIsAppealable = true;
    let punishmentTypeAppealForm = null;
    
    try {
      const Settings = req.serverDbConnection.model('Settings');
      const punishmentTypesDoc = await Settings.findOne({ type: 'punishmentTypes' });
      
      if (punishmentTypesDoc?.data) {
        const punishmentTypesRaw = punishmentTypesDoc.data;
        
        if (punishmentTypesRaw) {
          const punishmentTypes = typeof punishmentTypesRaw === 'string' 
            ? JSON.parse(punishmentTypesRaw) 
            : punishmentTypesRaw;
          
          const punishmentType = punishmentTypes.find((pt: any) => pt.ordinal === punishment.type_ordinal);
          if (punishmentType) {
            punishmentTypeName = punishmentType.name;
            punishmentTypeIsAppealable = punishmentType.isAppealable !== false;
            punishmentTypeAppealForm = punishmentType.appealForm;
          } else {
            // Fallback to hardcoded names for core administrative types
            const coreTypes: { [key: number]: string } = {
              0: 'Kick',
              1: 'Manual Mute', 
              2: 'Manual Ban',
              3: 'Security Ban',
              4: 'Linked Ban',
              5: 'Blacklist'
            };
            if (coreTypes[punishment.type_ordinal]) {
              punishmentTypeName = coreTypes[punishment.type_ordinal];
            }
          }
        }
      }
    } catch (settingsError) {
      console.warn('Could not fetch punishment type settings:', settingsError);
    }
    
    // Use the same comprehensive logic as minecraft-routes to determine active status and expiry
    const effectiveState = getEffectivePunishmentState(punishment);
    const isActive = effectiveState.effectiveActive;
    const expiresDate = effectiveState.effectiveExpiry;
    
    // Check if there's already an existing appeal for this punishment (appeals are stored as tickets with type 'appeal')
    let existingAppeal = null;
    try {
      const Ticket = req.serverDbConnection.model('Ticket');
      const appealTickets = await Ticket.find({ 
        type: 'appeal',
        'data.punishmentId': punishmentId,
        'data.playerUuid': player.minecraftUuid 
      }).sort({ created: -1 }).limit(1);
      
      if (appealTickets.length > 0) {
        const appeal = appealTickets[0];
        existingAppeal = {
          id: appeal._id,
          status: appeal.status,
          submittedDate: appeal.created,
          resolved: appeal.status !== 'Open' && appeal.status !== 'Pending'
        };
      }
    } catch (appealError) {
      console.warn('Could not check for existing appeals:', appealError);
    }
    
    // Return sanitized punishment data suitable for public appeals
    const publicPunishmentData = {
      id: punishment.id,
      type: punishmentTypeName,
      // DO NOT INCLUDE REASON - this is sensitive staff data
      issued: punishment.issued,
      started: punishment.started,
      expires: expiresDate, // Include expiration date
      active: isActive,
      appealable: punishmentTypeIsAppealable,
      appealForm: punishmentTypeAppealForm, // Include punishment-specific appeal form
      existingAppeal: existingAppeal,
      // Include both username for display and UUID for API calls
      playerUsername: player.usernames.length > 0 ? player.usernames[player.usernames.length - 1].username : 'Unknown',
      playerUuid: player.minecraftUuid // Add the actual UUID needed for appeals API
    };
    
    res.json(publicPunishmentData);
    
  } catch (error) {
    console.error('Error fetching public punishment data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;