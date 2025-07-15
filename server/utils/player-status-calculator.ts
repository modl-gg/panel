/**
 * Player Status Calculator
 * 
 * Calculates player social and gameplay status based on their punishments,
 * punishment type points, and configured thresholds.
 */

interface IPunishment {
  id: string;
  issuerName: string;
  issued: Date;
  started?: Date;
  type_ordinal: number;
  modifications: any[];
  notes: string[];
  evidence: string[];
  attachedTicketIds: string[];
  data: Map<string, any>;
}

interface IPunishmentType {
  id: number;
  name: string;
  category: 'Social' | 'Gameplay' | 'Administrative';
  ordinal: number;
  points?: {
    low: number;
    regular: number;
    severe: number;
  };
  customPoints?: number;
  singleSeverityPoints?: number;
}

interface IStatusThresholds {
  gameplay: {
    medium: number;
    habitual: number;
  };
  social: {
    medium: number;
    habitual: number;
  };
}

interface IPlayerStatus {
  social: 'Low' | 'Medium' | 'Habitual';
  gameplay: 'Low' | 'Medium' | 'Habitual';
  socialPoints: number;
  gameplayPoints: number;
}

/**
 * Calculate player status based on punishments and thresholds
 */
export function calculatePlayerStatus(
  punishments: IPunishment[],
  punishmentTypes: IPunishmentType[],
  thresholds: IStatusThresholds
): IPlayerStatus {
  let socialPoints = 0;
  let gameplayPoints = 0;

  // Calculate points from active punishments
  for (const punishment of punishments) {
    // Check if punishment is active (not expired)
    const isActive = isPunishmentActive(punishment);
    if (!isActive) continue;

    // Find punishment type
    const punishmentType = punishmentTypes.find(pt => pt.ordinal === punishment.type_ordinal);
    if (!punishmentType) continue;    // Get points based on severity or single severity
    let points = 0;
    const severity = punishment.data?.get('severity')?.toLowerCase();
    
    if (punishmentType.customPoints !== undefined) {
      // Custom points for permanent punishments (like Bad Skin, Bad Name)
      points = punishmentType.customPoints;
    } else if (punishmentType.singleSeverityPoints !== undefined) {
      // Single severity punishment
      points = punishmentType.singleSeverityPoints;
    } else if (punishmentType.points && severity) {
      // Multi-severity punishment
      switch (severity) {
        case 'low':
        case 'lenient':
          points = punishmentType.points.low;
          break;
        case 'regular':
        case 'medium':
          points = punishmentType.points.regular;
          break;
        case 'severe':
        case 'aggravated':
        case 'high':
          points = punishmentType.points.severe;
          break;
      }
    }

    // Add points to appropriate category
    if (punishmentType.category === 'Social') {
      socialPoints += points;
    } else if (punishmentType.category === 'Gameplay') {
      gameplayPoints += points;
    }
    // Administrative punishments don't contribute to status points
  }

  // Determine status based on thresholds
  const socialStatus = getStatusLevel(socialPoints, thresholds.social);
  const gameplayStatus = getStatusLevel(gameplayPoints, thresholds.gameplay);

  return {
    social: socialStatus,
    gameplay: gameplayStatus,
    socialPoints,
    gameplayPoints
  };
}

/**
 * Check if a punishment is currently active
 */
function isPunishmentActive(punishment: IPunishment): boolean {
  // Check if explicitly marked as inactive
  if (punishment.data?.get('active') === false) {
    return false;
  }

  // Check if expired
  const expires = punishment.data?.get('expires');
  if (expires && new Date(expires) < new Date()) {
    return false;
  }

  // For punishments that need to be started (bans/mutes)
  const needsStart = punishment.type_ordinal === 1 || punishment.type_ordinal === 2; // Manual Mute, Manual Ban
  if (needsStart && !punishment.started) {
    return false;
  }

  return true;
}

/**
 * Get status level based on points and thresholds
 */
function getStatusLevel(
  points: number, 
  thresholds: { medium: number; habitual: number }
): 'Low' | 'Medium' | 'Habitual' {
  if (points >= thresholds.habitual) {
    return 'Habitual';
  } else if (points >= thresholds.medium) {
    return 'Medium';
  } else {
    return 'Low';
  }
}

/**
 * Update punishment data structure to match new schema
 */
export function updatePunishmentDataStructure(punishment: IPunishment): void {
  if (!punishment.data) {
    punishment.data = new Map<string, any>();
  }

  // Ensure new fields exist with appropriate defaults
  if (!punishment.data.has('blockedName')) {
    punishment.data.set('blockedName', null);
  }
  
  if (!punishment.data.has('blockedSkin')) {
    punishment.data.set('blockedSkin', null);
  }
  
  if (!punishment.data.has('linkedBanId')) {
    punishment.data.set('linkedBanId', null);
  }
  
  if (!punishment.data.has('linkedBanExpiry')) {
    punishment.data.set('linkedBanExpiry', new Date());
  }
  
  if (!punishment.data.has('chatLog')) {
    punishment.data.set('chatLog', null);
  }
  
  // Ensure severity and status have proper null values for linked bans
  if (punishment.type_ordinal === 4) { // Linked Ban
    if (!punishment.data.has('severity') || punishment.data.get('severity') === undefined || punishment.data.get('severity') === 0) {
      punishment.data.set('severity', null);
    }
    if (!punishment.data.has('status') || punishment.data.get('status') === undefined || punishment.data.get('status') === 0) {
      punishment.data.set('status', null);
    }
  }
  
  if (!punishment.data.has('duration')) {
    punishment.data.set('duration', 0);
  }
  
  if (!punishment.data.has('altBlocking')) {
    punishment.data.set('altBlocking', false);
  }
  
  if (!punishment.data.has('wipeAfterExpiry')) {
    punishment.data.set('wipeAfterExpiry', false);
  }
}
