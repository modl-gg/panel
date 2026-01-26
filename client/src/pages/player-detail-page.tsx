import { useState, useEffect, useCallback } from 'react';
import { useRoute, useLocation } from 'wouter';
import {
  ArrowLeft, TriangleAlert, Ban, RefreshCcw, Search, LockOpen, History,
  Link2, StickyNote, Ticket, UserRound, Shield, FileText, Upload, Loader2,
  ChevronDown, ChevronRight, Settings, Plus
} from 'lucide-react';
import { getAvatarUrl } from '@/lib/api';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@modl-gg/shared-web/components/ui/tabs';
import { usePlayer, useApplyPunishment, useSettings, usePunishmentTypes, usePlayerTickets, usePlayerAllTickets, useModifyPunishment, useAddPunishmentNote, useLinkedAccounts, useFindLinkedAccounts } from '@/hooks/use-data';
import { ClickablePlayer } from '@/components/ui/clickable-player';
import { useAuth } from '@/hooks/use-auth';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@modl-gg/shared-web/components/ui/select';
import PlayerPunishment, { PlayerPunishmentData } from '@/components/ui/player-punishment';
import MediaUpload from '@/components/MediaUpload';
import { formatDateWithTime } from '@/utils/date-utils';

interface PlayerInfo {
  username: string;
  status: string;
  region: string;
  country: string;
  firstJoined: string;
  lastOnline: string;
  lastServer: string;
  playtime: string;
  social: string;
  gameplay: string;
  punished: boolean;
  previousNames: string[];
  warnings: Array<{ 
    type: string; 
    reason: string; 
    date: string; 
    by: string;
    id?: string;
    severity?: string;
    status?: string;
    evidence?: (string | {text: string; issuerName: string; date: string})[];
    notes?: Array<{text: string; issuerName: string; date: string}>;
    attachedTicketIds?: string[];
    active?: boolean;
    expires?: string;
    started?: string | Date;
    data?: any;
    altBlocking?: boolean;
  }>;
  linkedAccounts: Array<{username: string; uuid: string; statusText: string}>;
  notes: string[];
  newNote?: string;
  isAddingNote?: boolean;
  // Punishment note/modification fields
  isAddingPunishmentNote?: boolean;
  punishmentNoteTarget?: string | null;
  newPunishmentNote?: string;
  isAddingPunishmentEvidence?: boolean;
  punishmentEvidenceTarget?: string | null;
  newPunishmentEvidence?: string;
  uploadedEvidenceFile?: {
    url: string;
    fileName: string;
    fileType: string;
    fileSize: number;
  } | null;
  isModifyingPunishment?: boolean;
  modifyPunishmentTarget?: string | null;
  modifyPunishmentAction?: 'modify' | null;
  modifyPunishmentReason?: string;
  selectedModificationType?: 'MANUAL_DURATION_CHANGE' | 'MANUAL_PARDON' | 'SET_ALT_BLOCKING_TRUE' | 'SET_WIPING_TRUE' | 'SET_ALT_BLOCKING_FALSE' | 'SET_WIPING_FALSE' | null;
  newDuration?: {
    value: number;
    unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
  };
  // Punishment creation fields
  selectedPunishmentCategory?: string;
  selectedSeverity?: 'Lenient' | 'Regular' | 'Aggravated';
  selectedOffenseLevel?: 'first' | 'medium' | 'habitual';
  duration?: {
    value: number;
    unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
  };
  isPermanent?: boolean;
  reason?: string;
  evidence?: string;
  evidenceList?: string[];
  attachedReports?: string[];
  banLinkedAccounts?: boolean;
  wipeAccountAfterExpiry?: boolean;
  kickSameIP?: boolean;
  banToLink?: string;
  staffNotes?: string;
  silentPunishment?: boolean;
  altBlocking?: boolean;
  statWiping?: boolean;
}

interface PunishmentType {
  id: number;
  name: string;
  category: 'Gameplay' | 'Social' | 'Administrative';
  isCustomizable: boolean;
  ordinal: number;
  durations?: {
    low: { 
      first: { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; banValue?: number; banUnit?: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; };
      medium: { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; banValue?: number; banUnit?: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; };
      habitual: { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; banValue?: number; banUnit?: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; };
    };
    regular: {
      first: { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; banValue?: number; banUnit?: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; };
      medium: { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; banValue?: number; banUnit?: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; };
      habitual: { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; banValue?: number; banUnit?: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; };
    };
    severe: {
      first: { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; banValue?: number; banUnit?: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; };
      medium: { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; banValue?: number; banUnit?: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; };
      habitual: { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; banValue?: number; banUnit?: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; };
    };
  };
  points?: {
    low: number;
    regular: number;
    severe: number;
  };
  customPoints?: number;
  staffDescription?: string;
  playerDescription?: string;
  canBeAltBlocking?: boolean;
  canBeStatWiping?: boolean;
  isAppealable?: boolean;
  singleSeverityPunishment?: boolean;
  singleSeverityDurations?: {
    first: { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; type: 'mute' | 'ban'; };
    medium: { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; type: 'mute' | 'ban'; };
    habitual: { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; type: 'mute' | 'ban'; };
  };
  singleSeverityPoints?: number;
}

const PlayerDetailPage = () => {
  const [_, params] = useRoute('/panel/player/:uuid');
  const [location, navigate] = useLocation();
  const playerId = params?.uuid || '';
  const isMobile = useIsMobile();

  const [activeTab, setActiveTab] = useState('history');
  const [banSearchResults, setBanSearchResults] = useState<{id: string; player: string}[]>([]);
  const [showBanSearchResults, setShowBanSearchResults] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(true);
  const [isApplyingPunishment, setIsApplyingPunishment] = useState(false);
  const [expandedPunishments, setExpandedPunishments] = useState<Set<string>>(new Set());

  // Get current authenticated user
  const { user } = useAuth();
  
  // Initialize the mutation hooks
  const applyPunishment = useApplyPunishment();
  const modifyPunishment = useModifyPunishment();
  const addPunishmentNote = useAddPunishmentNote();

  // Use React Query hooks to fetch data
  const { data: player, isLoading, error, refetch } = usePlayer(playerId);
  const { data: playerTickets, isLoading: isLoadingTickets } = usePlayerAllTickets(playerId);
  const { data: linkedAccountsData, isLoading: isLoadingLinkedAccounts, refetch: refetchLinkedAccounts } = useLinkedAccounts(playerId);
  const findLinkedAccountsMutation = useFindLinkedAccounts();
  const { data: settingsData, isLoading: isLoadingSettings } = useSettings();
  const { data: punishmentTypesData, isLoading: isLoadingPunishmentTypes } = usePunishmentTypes();

  // State to track if we've already triggered linked account search
  const [hasTriggeredLinkedSearch, setHasTriggeredLinkedSearch] = useState(false);
  
  // Stable function to trigger linked account search
  const triggerLinkedAccountSearch = useCallback(() => {
    if (playerId && !hasTriggeredLinkedSearch && !findLinkedAccountsMutation.isPending) {
      setHasTriggeredLinkedSearch(true);
      findLinkedAccountsMutation.mutate(playerId, {
        onError: (error) => {
          console.error('Failed to trigger linked account search:', error);
          setHasTriggeredLinkedSearch(false);
        }
      });
    }
  }, [playerId, hasTriggeredLinkedSearch]);

  // Initialize player info state
  const [playerInfo, setPlayerInfo] = useState<PlayerInfo>({
    username: 'Loading...',
    status: 'Unknown',
    region: 'Unknown',
    country: 'Unknown',
    firstJoined: 'Unknown',
    lastOnline: 'Unknown',
    lastServer: 'Unknown',
    playtime: 'Unknown',
    social: 'Medium',
    gameplay: 'Medium',
    punished: false,
    previousNames: [],
    warnings: [],
    linkedAccounts: [],
    notes: []
  });

  // Initialize punishment types state
  const [punishmentTypesByCategory, setPunishmentTypesByCategory] = useState<{
    Administrative: PunishmentType[], 
    Social: PunishmentType[], 
    Gameplay: PunishmentType[]
  }>({
    Administrative: [
      // Administrative punishment types (ordinals 0-5, not customizable) - minimal fallback
      { id: 0, name: 'Kick', category: 'Administrative', isCustomizable: false, ordinal: 0 },
      { id: 1, name: 'Manual Mute', category: 'Administrative', isCustomizable: false, ordinal: 1 },
      { id: 2, name: 'Manual Ban', category: 'Administrative', isCustomizable: false, ordinal: 2 },
      { id: 3, name: 'Security Ban', category: 'Administrative', isCustomizable: false, ordinal: 3 },
      { id: 4, name: 'Linked Ban', category: 'Administrative', isCustomizable: false, ordinal: 4 },
      { id: 5, name: 'Blacklist', category: 'Administrative', isCustomizable: false, ordinal: 5 }
    ],
    Social: [],
    Gameplay: []
  });

  // Reset avatar state when playerId changes
  useEffect(() => {
    setAvatarError(false);
    setAvatarLoading(true);
  }, [playerId]);

  // Process punishment types data from dedicated endpoint
  useEffect(() => {
    if (punishmentTypesData && Array.isArray(punishmentTypesData)) {
      try {
        // Always ensure administrative punishment types are available
        const defaultAdminTypes: PunishmentType[] = [
          { id: 0, name: 'Kick', category: 'Administrative' as const, isCustomizable: false, ordinal: 0 },
          { id: 1, name: 'Manual Mute', category: 'Administrative' as const, isCustomizable: false, ordinal: 1 },
          { id: 2, name: 'Manual Ban', category: 'Administrative' as const, isCustomizable: false, ordinal: 2 },
          { id: 3, name: 'Security Ban', category: 'Administrative' as const, isCustomizable: false, ordinal: 3 },
          { id: 4, name: 'Linked Ban', category: 'Administrative' as const, isCustomizable: false, ordinal: 4 },
          { id: 5, name: 'Blacklist', category: 'Administrative' as const, isCustomizable: false, ordinal: 5 }
        ];

        // Group punishment types by category
        const adminFromSettings = punishmentTypesData.filter((pt: PunishmentType) => pt.category?.toLowerCase().trim() === 'administrative');

        // Merge default admin types with any additional admin types from settings
        // Default types take precedence (to ensure they're always available)
        const mergedAdminTypes = [...defaultAdminTypes];
        adminFromSettings.forEach((settingsType: PunishmentType) => {
          if (!mergedAdminTypes.find(defaultType => defaultType.name === settingsType.name)) {
            mergedAdminTypes.push(settingsType);
          }
        });

        const categorized = {
          Administrative: mergedAdminTypes.sort((a, b) => a.ordinal - b.ordinal),
          Social: punishmentTypesData.filter((pt: PunishmentType) => pt.category?.toLowerCase().trim() === 'social').sort((a: PunishmentType, b: PunishmentType) => a.ordinal - b.ordinal),
          Gameplay: punishmentTypesData.filter((pt: PunishmentType) => pt.category?.toLowerCase().trim() === 'gameplay').sort((a: PunishmentType, b: PunishmentType) => a.ordinal - b.ordinal)
        };

        // Update the state with the loaded punishment types
        setPunishmentTypesByCategory(categorized);
      } catch (error) {
        console.error("Error processing punishment types:", error);
      }
    }
  }, [punishmentTypesData]);

  // Calculate player status based on punishments and settings
  const calculatePlayerStatus = (punishments: any[], punishmentTypes: PunishmentType[], statusThresholds: any) => {
    let socialPoints = 0;
    let gameplayPoints = 0;

    // Calculate points from active punishments
    for (const punishment of punishments) {
      // Check if punishment is effectively active (considering modifications)
      const effectiveState = getEffectivePunishmentState(punishment);
      const isActive = effectiveState.effectiveActive;
      if (!isActive) continue;

      // Find punishment type
      const punishmentType = punishmentTypes.find(pt => pt.ordinal === punishment.typeOrdinal);
      if (!punishmentType) continue;

      // Get points based on severity or single severity
      let points = 0;
      const severity = punishment.severity || punishment.data?.severity;
      
      if (punishmentType.customPoints !== undefined) {
        // Custom points for permanent punishments (like Bad Skin, Bad Name)
        points = punishmentType.customPoints;
      } else if (punishmentType.singleSeverityPoints !== undefined) {
        // Single severity punishment
        points = punishmentType.singleSeverityPoints;
      } else if (punishmentType.points && severity) {
        // Multi-severity punishment
        const severityLower = severity.toLowerCase();
        if (severityLower === 'low' || severityLower === 'lenient') {
          points = punishmentType.points.low;
        } else if (severityLower === 'regular' || severityLower === 'medium') {
          points = punishmentType.points.regular;
        } else if (severityLower === 'severe' || severityLower === 'aggravated' || severityLower === 'high') {
          points = punishmentType.points.severe;
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
    const getStatusLevel = (points: number, thresholds: { medium: number; habitual: number }) => {
      if (points >= thresholds.habitual) {
        return 'Habitual';
      } else if (points >= thresholds.medium) {
        return 'Medium';
      } else {
        return 'Low';
      }
    };

    const socialStatus = getStatusLevel(socialPoints, statusThresholds?.social || { medium: 4, habitual: 8 });
    const gameplayStatus = getStatusLevel(gameplayPoints, statusThresholds?.gameplay || { medium: 5, habitual: 10 });

    return {
      social: socialStatus,
      gameplay: gameplayStatus,
      socialPoints,
      gameplayPoints
    };
  };

  // Helper function to calculate effective punishment status and expiry based on modifications
  const getEffectivePunishmentState = (punishment: any) => {
    const modifications = punishment.modifications || [];
    
    let effectiveActive = punishment.active;
    let effectiveExpiry = punishment.expires;
    let effectiveDuration = punishment.duration;
    let hasModifications = modifications.length > 0;
    
    // Process modifications in chronological order (oldest first)
    const sortedModifications = [...modifications].sort((a, b) => 
      new Date(a.issued).getTime() - new Date(b.issued).getTime()
    );
    
    for (const mod of sortedModifications) {
      switch (mod.type) {
        case 'MANUAL_PARDON':
        case 'APPEAL_ACCEPT':
          effectiveActive = false;
          effectiveExpiry = mod.issued; // Set expiry to when it was pardoned
          break;
        case 'MANUAL_DURATION_CHANGE':
          if (mod.effectiveDuration !== undefined) {
            effectiveDuration = mod.effectiveDuration;
            // Calculate new expiry based on new duration and punishment start time
            if (mod.effectiveDuration === 0 || mod.effectiveDuration === -1 || mod.effectiveDuration < 0) {
              effectiveExpiry = null; // Permanent
            } else if (punishment.issued || punishment.date) {
              const startTime = new Date(punishment.issued || punishment.date);
              effectiveExpiry = new Date(startTime.getTime() + mod.effectiveDuration).toISOString();
            }
          }
          break;
        // Add other modification types as needed
      }
    }
    
    return {
      effectiveActive,
      effectiveExpiry,
      effectiveDuration,
      hasModifications,
      modifications: sortedModifications,
      originalExpiry: punishment.expires
    };
  };

  // Helper function to safely get data from player.data (handles both Map and plain object)
  const getPlayerData = (player: any, key: string) => {
    if (!player?.data) return undefined;
    if (typeof player.data.get === 'function') {
      return player.data.get(key);
    }
    return (player.data as any)[key];
  };


  // Helper function to check if a value is a valid display value for badges
  const isValidBadgeValue = (value: any): boolean => {
    if (!value || value === null || value === undefined) return false;
    if (typeof value === 'number' && value === 0) return false;
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (trimmed.length === 0) return false;
    if (trimmed === '0' || trimmed === 'null' || trimmed === 'undefined' || trimmed === 'false') return false;
    return true;
  };

  // Helper function to determine if a punishment is currently active based on expiry logic
  const isPunishmentCurrentlyActive = (warning: any, effectiveState: any) => {
    // Check if punishment is pardoned/revoked
    const pardonModification = effectiveState.modifications.find((mod: any) => 
      mod.type === 'MANUAL_PARDON' || mod.type === 'APPEAL_ACCEPT'
    );
    
    if (pardonModification) {
      return false; // Pardoned punishments are always inactive
    }
    
    // Check if punishment has modifications with effective expiry
    if (effectiveState.hasModifications && effectiveState.effectiveExpiry) {
      const expiryDate = new Date(effectiveState.effectiveExpiry);
      if (!isNaN(expiryDate.getTime())) {
        const now = new Date();
        return expiryDate.getTime() > now.getTime(); // Active if expiry is in the future
      }
    }
    
    // Check original expiry for unmodified punishments
    if (warning.expires) {
      const expiryDate = new Date(warning.expires);
      if (!isNaN(expiryDate.getTime())) {
        const now = new Date();
        return expiryDate.getTime() > now.getTime(); // Active if expiry is in the future
      }
    }
    
    // For punishments without expiry (permanent), check effective active state
    return effectiveState.effectiveActive;
  };

  // Helper function to format duration in milliseconds to human readable
  const formatDuration = (milliseconds: number) => {
    if (milliseconds === 0 || milliseconds === -1 || milliseconds < 0) {
      return 'Permanent';
    }
    
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    
    if (months > 0) {
      return `${months} month${months > 1 ? 's' : ''}`;
    } else if (weeks > 0) {
      return `${weeks} week${weeks > 1 ? 's' : ''}`;
    } else if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''}`;
    } else if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''}`;
    } else if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    } else {
      return `${seconds} second${seconds > 1 ? 's' : ''}`;
    }
  };

  // Load player data into state when it changes
  useEffect(() => {
    if (player) {
      // Check if we're dealing with MongoDB data or the API response format
      if (player.usernames) {
        // This is MongoDB raw data that needs formatting
        const currentUsername = player.usernames && player.usernames.length > 0 
          ? player.usernames[player.usernames.length - 1].username 
          : 'Unknown';
        
        const firstJoined = player.usernames && player.usernames.length > 0 
          ? formatDateWithTime(player.usernames[0].date) 
          : 'Unknown';
        
        // Get previous usernames
        const previousNames = player.usernames && player.usernames.length > 1
          ? player.usernames
              .slice(0, -1) // All except the most recent
              .map((u: any) => u.username)
          : [];
        
        // Determine player status (exclude kicks from status calculation)
        // Kicks (ordinal 0) should never affect the "Currently Punished" badge
        const activePunishments = player.punishments ? player.punishments.filter((p: any) => 
          p.active && p.typeOrdinal !== 0 // Exclude kicks (ordinal 0) completely
        ) : [];
        
        const status = activePunishments.some((p: any) => !p.expires) 
          ? 'Banned' 
          : activePunishments.length > 0
          ? 'Restricted' 
          : 'Active';
        
        // Initialize warnings array
        const warnings: any[] = [];
        
        // Add punishments to warnings with full details
        if (player.punishments) {
          player.punishments.forEach((punishment: any) => {
            // Determine punishment type name from ordinal using settings data
            const getPunishmentTypeName = (ordinal: number) => {
              // First check all loaded punishment types from settings
              const allTypes = [
                ...punishmentTypesByCategory.Administrative,
                ...punishmentTypesByCategory.Social,
                ...punishmentTypesByCategory.Gameplay
              ];
              
              const foundType = allTypes.find(type => type.ordinal === ordinal);
              if (foundType) {
                return foundType.name;
              }
              
              // Fallback for unknown ordinals
              return `Unknown Punishment ${ordinal}`;
            };
            
            const punishmentType = getPunishmentTypeName(punishment.typeOrdinal);
            
            // Use staff notes as the main reason text
            let displayReason = '';
            if (punishment.notes && punishment.notes.length > 0) {
              // Use first note as the main reason (for both manual and automatic punishments)
              const firstNote = punishment.notes[0];
              displayReason = typeof firstNote === 'string' ? firstNote : firstNote.text;
            } else {
              // Fallback if no notes available
              displayReason = 'No additional details';
            }
            
            warnings.push({
              type: punishmentType,
              reason: displayReason,
              date: formatDateWithTime(punishment.date || punishment.issued),
              by: punishment.issuerName,
              // Additional punishment details
              id: punishment.id || punishment._id,
              severity: (() => {
                // For linked bans (typeOrdinal 4), severity should always be null
                if (punishment.typeOrdinal === 4) return null;
                const severity = punishment.data?.severity || (punishment.data?.get ? punishment.data.get('severity') : punishment.severity);
                return severity === 0 || severity === '0' || severity === null || severity === undefined ? null : severity;
              })(),
              status: (() => {
                // For linked bans (typeOrdinal 4), status should always be null
                if (punishment.typeOrdinal === 4) return null;
                const status = punishment.data?.status || (punishment.data?.get ? punishment.data.get('status') : punishment.status);
                return status === 0 || status === '0' || status === null || status === undefined ? null : status;
              })(),
              evidence: punishment.evidence || [],
              notes: punishment.notes || [],
              attachedTicketIds: punishment.attachedTicketIds || [],
              active: punishment.data?.active !== false || (punishment.data?.get ? punishment.data.get('active') !== false : punishment.active),
              modifications: punishment.modifications || [],
              expires: punishment.expires || punishment.data?.expires || (punishment.data?.get ? punishment.data.get('expires') : null),
              data: punishment.data || {},
              altBlocking: punishment.data?.altBlocking || (punishment.data?.get ? punishment.data.get('altBlocking') : false),
              started: punishment.started
            });
          });
        }
        
        // Extract notes
        const notes = player.notes 
          ? player.notes.map((note: any) => `${note.text} (Added by ${note.issuerName} on ${formatDateWithTime(note.date)})`) 
          : [];
        
        // Extract linked accounts from API data
        const linkedAccounts: Array<{username: string; uuid: string; statusText: string}> = [];
        
        if (linkedAccountsData?.linkedAccounts && Array.isArray(linkedAccountsData.linkedAccounts)) {
          linkedAccountsData.linkedAccounts.forEach((account: any) => {
            const statusInfo = [];
            if (account.activeBans > 0) statusInfo.push(`${account.activeBans} active ban${account.activeBans > 1 ? 's' : ''}`);
            if (account.activeMutes > 0) statusInfo.push(`${account.activeMutes} active mute${account.activeMutes > 1 ? 's' : ''}`);
            
            const statusText = statusInfo.length > 0 ? ` (${statusInfo.join(', ')})` : '';
            linkedAccounts.push({
              username: account.username,
              uuid: account.uuid || account._id || account.minecraftUuid,
              statusText: statusText
            });
          });
        }
        
        // Calculate player status using punishment points and thresholds
        const allPunishmentTypes = [
          ...punishmentTypesByCategory.Administrative,
          ...punishmentTypesByCategory.Social,
          ...punishmentTypesByCategory.Gameplay
        ];
        
        // Get status thresholds from settings
        let statusThresholds = { social: { medium: 4, habitual: 8 }, gameplay: { medium: 5, habitual: 10 } };
        if (settingsData?.settings?.statusThresholds) {
          try {
            statusThresholds = settingsData.settings.statusThresholds;
          } catch (error) {
            console.error("Error parsing status thresholds:", error);
          }
        }
        
        const calculatedStatus = calculatePlayerStatus(player.punishments || [], allPunishmentTypes, statusThresholds);
        
        // Sort warnings by date (most recent first)
        warnings.sort((a, b) => {
          const dateA = new Date(a.date || a.issued || 0).getTime();
          const dateB = new Date(b.date || b.issued || 0).getTime();
          return dateB - dateA; // Descending order (newest first)
        });
        
        setPlayerInfo(prev => ({
          ...prev,
          username: currentUsername,
          status: getPlayerData(player, 'isOnline') ? 'Online' : (status === 'Active' ? 'Offline' : status),
          region: player.latestIPData?.region || player.region || 'Unknown',
          country: player.latestIPData?.country || player.country || 'Unknown',
          firstJoined: firstJoined,
          lastOnline: getPlayerData(player, 'isOnline') ? 'Online' : 
            (getPlayerData(player, 'lastDisconnect') ? 
              formatDateWithTime(getPlayerData(player, 'lastDisconnect')) : 
              'Unknown'),
          lastServer: player.lastServer || 'Unknown',
          playtime: player.playtime ? `${player.playtime} hours` : 'Not tracked',
          social: calculatedStatus.social,
          gameplay: calculatedStatus.gameplay,
          punished: status !== 'Active',
          previousNames: previousNames,
          warnings: warnings,
          linkedAccounts: linkedAccounts,
          notes: notes
        }));
      } else if (player.username) {
        // Handle API response format if different
        setPlayerInfo(prev => ({
          ...prev,
          username: player.username,
          lastOnline: player.lastOnline || 'Unknown',
          status: player.status === 'Active' ? 'Online' : player.status
        }));
      }
    }
  }, [player, punishmentTypesByCategory, settingsData, linkedAccountsData]);

  // Trigger linked account search when player data is loaded
  useEffect(() => {
    if (player && playerId) {
      triggerLinkedAccountSearch();
    }
  }, [player, playerId, triggerLinkedAccountSearch]);

  // Mock function to simulate ban search results
  const searchBans = (query: string) => {
    if (!query || query.length < 2) {
      setBanSearchResults([]);
      return;
    }
    
    // Simulate API call delay
    setTimeout(() => {
      // Mock data for demonstration
      const results = [
        { id: 'ban-123', player: 'MineKnight45' },
        { id: 'ban-456', player: 'DiamondMiner99' },
        { id: 'ban-789', player: 'CraftMaster21' },
        { id: 'ban-012', player: 'StoneBlazer76' }
      ].filter(item => 
        item.id.toLowerCase().includes(query.toLowerCase()) || 
        item.player.toLowerCase().includes(query.toLowerCase())
      );
      
      setBanSearchResults(results);
      setShowBanSearchResults(results.length > 0);
    }, 300);
  };

  // Function to handle ticket navigation
  const handleTicketClick = (ticketId: string) => {
    navigate(`/panel/tickets/${ticketId}`);
  };

  // Get punishment ordinal from punishment type data
  const getPunishmentOrdinal = (punishmentName: string): number => {
    // Search in all categories for the punishment type
    const allTypes = [
      ...punishmentTypesByCategory.Administrative,
      ...punishmentTypesByCategory.Social,
      ...punishmentTypesByCategory.Gameplay
    ];
    
    const punishmentType = allTypes.find(type => type.name === punishmentName);
    return punishmentType ? punishmentType.ordinal : -1;
  };

  // Convert duration to milliseconds
  const durationToMilliseconds = (duration: { value: number; unit: string }) => {
    const { value, unit } = duration;
    
    switch (unit) {
      case 'seconds':
        return value * 1000;
      case 'minutes':
        return value * 60 * 1000;
      case 'hours':
        return value * 60 * 60 * 1000;
      case 'days':
        return value * 24 * 60 * 60 * 1000;
      case 'weeks':
        return value * 7 * 24 * 60 * 60 * 1000;
      case 'months':
        return value * 30 * 24 * 60 * 60 * 1000; // Approximate month
      default:
        return 0;
    }
  };

  // Handler for applying punishment
  const handleApplyPunishment = async () => {
    if (!playerInfo.selectedPunishmentCategory) {
      toast({
        title: "Missing information",
        description: "Please select a punishment type",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsApplyingPunishment(true);
      
      // Get the punishment type ordinal
      const typeOrdinal = getPunishmentOrdinal(playerInfo.selectedPunishmentCategory);
      if (typeOrdinal === -1) {
        throw new Error(`Unknown punishment type: ${playerInfo.selectedPunishmentCategory}`);
      }
      
      // Determine severity and status based on punishment type
      let severity = null;
      let status = null;
      let data: { [key: string]: any } = {};
      
      // For non-administrative punishments that use severity/status
      if (!['Kick', 'Manual Mute', 'Manual Ban', 'Security Ban', 'Linked Ban', 'Blacklist'].includes(playerInfo.selectedPunishmentCategory)) {
        if (playerInfo.selectedSeverity) {
          severity = playerInfo.selectedSeverity;
        }
        if (playerInfo.selectedOffenseLevel) {
          status = playerInfo.selectedOffenseLevel;
        }
      }
      
      // Handle duration for manual punishments
      if (['Manual Mute', 'Manual Ban'].includes(playerInfo.selectedPunishmentCategory)) {
        if (playerInfo.isPermanent) {
          data.duration = -1; // Permanent
        } else if (playerInfo.duration) {
          data.duration = durationToMilliseconds(playerInfo.duration);
        }
      }
      
      // Add other data fields
      if (playerInfo.altBlocking) data.altBlocking = true;
      if (playerInfo.statWiping) data.statWiping = true;
      if (playerInfo.banLinkedAccounts) data.banLinkedAccounts = true;
      if (playerInfo.wipeAccountAfterExpiry) data.wipeAccountAfterExpiry = true;
      if (playerInfo.kickSameIP) data.kickSameIP = true;
      if (playerInfo.silentPunishment) data.silent = true;
      
      // Set severity and status in data as well
      if (severity) data.severity = severity;
      if (status) data.status = status;
      
      // Prepare notes array
      const notes: Array<{text: string; issuerName: string; date?: string}> = [];
      
      // For manual punishments that need a reason, make the reason the first note
      const needsReasonAsFirstNote = ['Kick', 'Manual Mute', 'Manual Ban'].includes(playerInfo.selectedPunishmentCategory);
      if (needsReasonAsFirstNote && playerInfo.reason?.trim()) {
        notes.push({
          text: playerInfo.reason.trim(),
          issuerName: user?.username || 'Admin'
        });
      }
      
      // Add staff notes as additional notes
      if (playerInfo.staffNotes?.trim()) {
        notes.push({
          text: playerInfo.staffNotes.trim(),
          issuerName: user?.username || 'Admin'
        });
      }
      
      // Prepare attached ticket IDs
      const attachedTicketIds: string[] = [];
      if (playerInfo.attachedReports) {
        playerInfo.attachedReports.forEach(report => {
          if (report && report !== 'ticket-new') {
            // Extract ticket ID from format like "ticket-123"
            const ticketMatch = report.match(/ticket-(\w+)/);
            if (ticketMatch) {
              attachedTicketIds.push(ticketMatch[1]);
            }
          }
        });
      }
      
      // Prepare evidence array - handle both string and object formats like PlayerWindow
      const evidence = playerInfo.evidenceList?.filter((e: string) => e.trim()).map((e: string) => {
        const trimmedEvidence = e.trim();

        // Helper function to determine file type from URL
        const getFileTypeFromUrl = (url: string): string => {
          const extension = url.split('.').pop()?.toLowerCase();
          if (!extension) return 'application/octet-stream';
          const mimeTypes: Record<string, string> = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'pdf': 'application/pdf',
            'mp4': 'video/mp4',
            'webm': 'video/webm',
            'mp3': 'audio/mpeg',
            'txt': 'text/plain'
          };
          return mimeTypes[extension] || 'application/octet-stream';
        };

        // If it's a JSON object (uploaded file with metadata), parse and convert
        if (trimmedEvidence.startsWith('{')) {
          try {
            const fileData = JSON.parse(trimmedEvidence);
            return {
              text: fileData.fileName,
              issuerName: user?.username || 'Admin',
              date: new Date().toISOString(),
              type: 'file',
              fileUrl: fileData.url,
              fileName: fileData.fileName,
              fileType: fileData.fileType,
              fileSize: fileData.fileSize
            };
          } catch (error) {
            console.warn('Failed to parse evidence JSON:', error);
            // Fallback to text evidence
            return {
              text: trimmedEvidence,
              issuerName: user?.username || 'Admin',
              date: new Date().toISOString(),
              type: 'text'
            };
          }
        }
        // If it's a URL (legacy uploaded file), convert to object format
        else if (trimmedEvidence.startsWith('http')) {
          // Extract filename from URL for better display
          const fileName = trimmedEvidence.split('/').pop() || 'Unknown file';

          return {
            text: fileName,
            issuerName: user?.username || 'Admin',
            date: new Date().toISOString(),
            type: 'file',
            fileUrl: trimmedEvidence,
            fileName: fileName,
            fileType: getFileTypeFromUrl(trimmedEvidence),
            fileSize: 0 // We don't have size info from URL
          };
        } else {
          // Text evidence - convert to object format
          return {
            text: trimmedEvidence,
            issuerName: user?.username || 'Admin',
            date: new Date().toISOString(),
            type: 'text'
          };
        }
      }) || [];
      
      // Prepare punishment data in the format expected by the server
      const punishmentData: { [key: string]: any } = {
        issuerName: user?.username || 'Admin',
        typeOrdinal: typeOrdinal,
        notes: notes,
        evidence: evidence,
        attachedTicketIds: attachedTicketIds,
        severity: severity,
        status: status,
        data: data
      };
      
      // Call the API
      await applyPunishment.mutateAsync({
        uuid: playerId,
        punishmentData
      });
      
      // Refetch player data
      refetch();
      
      // Show success message
      toast({
        title: "Punishment applied",
        description: `Successfully applied ${playerInfo.selectedPunishmentCategory} to ${playerInfo.username}`
      });
      
      // Reset the punishment form
      setPlayerInfo(prev => ({
        ...prev,
        selectedPunishmentCategory: undefined,
        selectedSeverity: undefined,
        selectedOffenseLevel: undefined,
        duration: undefined,
        isPermanent: false,
        reason: '',
        evidence: '',
        evidenceList: [],
        attachedReports: [],
        banLinkedAccounts: false,
        wipeAccountAfterExpiry: false,
        kickSameIP: false,
        banToLink: '',
        staffNotes: '',
        silentPunishment: false,
        altBlocking: false,
        statWiping: false
      }));
      
    } catch (error) {
      console.error('Error applying punishment:', error);
      toast({
        title: "Failed to apply punishment",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setIsApplyingPunishment(false);
    }
  };

  // Show loading state
  if (isLoading || isLoadingSettings) {
    return (
      <div className="w-full px-4 py-4 pb-20">
        <div className="flex items-center mb-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate('/panel/lookup')}
            className="mr-2"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Loading Player...</h1>
        </div>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // Show error state
  if (error || !player) {
    return (
      <div className="w-full px-4 py-4 pb-20">
        <div className="flex items-center mb-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate('/panel/lookup')}
            className="mr-2"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Player Not Found</h1>
        </div>
        <div className="flex flex-col items-center justify-center h-64">
          <p className="text-destructive">Could not find player data.</p>
          <Button onClick={() => navigate("/panel/lookup")} className="mt-4">Return to Lookup</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-4 pb-20">
      <div className="flex items-center mb-4">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => navigate('/panel/lookup')}
          className="mr-2"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">Player Details</h1>
      </div>

      <div className="space-y-4">
        <div className="pt-2">
          <div className="bg-background-lighter p-4 rounded-lg">
            <div className="flex items-start gap-4">
              <div className="relative h-16 w-16 bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                {playerId && !avatarError ? (
                  <>
                    <img 
                      src={getAvatarUrl(playerId, 64, true)}
                      alt={`${playerInfo.username || 'Player'} Avatar`}
                      className={`w-full h-full object-cover transition-opacity duration-200 ${avatarLoading ? 'opacity-0' : 'opacity-100'}`}
                      onError={() => {
                        setAvatarError(true);
                        setAvatarLoading(false);
                      }}
                      onLoad={() => {
                        setAvatarError(false);
                        setAvatarLoading(false);
                      }}
                    />
                    {avatarLoading && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-2xl font-bold text-primary">{playerInfo.username?.substring(0, 2) || '??'}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-2xl font-bold text-primary">{playerInfo.username?.substring(0, 2) || '??'}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h5 className="text-lg font-medium">{playerInfo.username || 'Unknown'}</h5>
                <div className="flex flex-wrap gap-2 mt-1">
                  <Badge variant="outline" className={playerInfo.status === 'Online' ? 
                    "bg-success/10 text-success border-success/20" : 
                    "bg-muted/50 text-muted-foreground border-muted/30"
                  }>
                    {playerInfo.status === 'Online' ? 
                      "Online" : 
                      "Offline"
                    }
                  </Badge>
                  <Badge variant="outline" className={
                    playerInfo.social.toLowerCase() === 'low' ? 
                      "bg-success/10 text-success border-success/20" : 
                    playerInfo.social.toLowerCase() === 'medium' ? 
                      "bg-warning/10 text-warning border-warning/20" : 
                      "bg-destructive/10 text-destructive border-destructive/20"
                  }>
                    Social: {playerInfo.social.toLowerCase()}
                  </Badge>
                  <Badge variant="outline" className={
                    playerInfo.gameplay.toLowerCase() === 'low' ? 
                      "bg-success/10 text-success border-success/20" : 
                    playerInfo.gameplay.toLowerCase() === 'medium' ? 
                      "bg-warning/10 text-warning border-warning/20" : 
                      "bg-destructive/10 text-destructive border-destructive/20"
                  }>
                    Gameplay: {playerInfo.gameplay.toLowerCase()}
                  </Badge>
                  {playerInfo.punished && (
                    <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                      Currently Punished
                    </Badge>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 mt-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Region:</span>
                    <span className="ml-1">{playerInfo.region}</span>
                    {playerInfo.region && playerInfo.region !== 'Unknown' && (
                      <span className="text-xs text-muted-foreground ml-1">(from latest IP)</span>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Country:</span>
                    <span className="ml-1">{playerInfo.country}</span>
                    {playerInfo.country && playerInfo.country !== 'Unknown' && (
                      <span className="text-xs text-muted-foreground ml-1">(from latest IP)</span>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground">First Join:</span>
                    <span className="ml-1">{playerInfo.firstJoined}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Last Join:</span>
                    <span className="ml-1">{playerInfo.lastOnline}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Playtime:</span>
                    <span className="ml-1">{playerInfo.playtime}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Last Server:</span>
                    <span className="ml-1">{playerInfo.lastServer}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <Tabs value={activeTab} className="w-full" onValueChange={setActiveTab}>
          {isMobile ? (
            <Select value={activeTab} onValueChange={setActiveTab}>
              <SelectTrigger className="w-full mb-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="history">History</SelectItem>
                <SelectItem value="linked">Connected Accounts</SelectItem>
                <SelectItem value="notes">Notes</SelectItem>
                <SelectItem value="tickets">Tickets</SelectItem>
                <SelectItem value="names">Previous Names</SelectItem>
                <SelectItem value="punishment">Punish</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <TabsList className="grid grid-cols-6 gap-1 px-1">
              <TabsTrigger value="history" className="text-xs py-2">
                <History className="h-3.5 w-3.5 mr-1.5" />
                History
              </TabsTrigger>
              <TabsTrigger value="linked" className="text-xs py-2">
                <Link2 className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
                Connected
              </TabsTrigger>
              <TabsTrigger value="notes" className="text-xs py-2">
                <StickyNote className="h-3.5 w-3.5 mr-1.5" />
                Notes
              </TabsTrigger>
              <TabsTrigger value="tickets" className="text-xs py-2">
                <Ticket className="h-3.5 w-3.5 mr-1.5" />
                Tickets
              </TabsTrigger>
              <TabsTrigger value="names" className="text-xs py-2">
                <UserRound className="h-3.5 w-3.5 mr-1.5" />
                Names
              </TabsTrigger>
              <TabsTrigger value="punishment" className="text-xs py-2">
                <Shield className="h-3.5 w-3.5 mr-1.5" />
                Punish
              </TabsTrigger>
            </TabsList>
          )}
          
          <TabsContent value="history" className="space-y-2 mx-1 mt-3">
            <h4 className="font-medium">Player History</h4>
            <div className="space-y-2">
              {playerInfo.warnings.length > 0 ? playerInfo.warnings.map((warning, index) => {
                const isExpanded = expandedPunishments.has(warning.id || `warning-${index}`);
                const isPunishment = warning.id && (
                  warning.severity || 
                  warning.status || 
                  warning.evidence?.length || 
                  warning.notes?.length ||
                  warning.type === 'Linked Ban' ||
                  (warning.type && ['Kick', 'Manual Mute', 'Manual Ban', 'Security Ban', 'Blacklist'].includes(warning.type))
                );
                
                // Calculate effective status and expiry based on modifications
                const effectiveState = getEffectivePunishmentState(warning);
                
                return (
                  <div 
                    key={warning.id || `warning-${index}`} 
                    data-punishment-id={warning.id}
                    className={`${
                      isPunishmentCurrentlyActive(warning, effectiveState) ? 'bg-muted/30 border-l-4 border-red-500' : 
                      'bg-muted/30'
                    } p-3 rounded-lg transition-all duration-300`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {/* Show punishment status: Active, Inactive, or Unstarted */}
                          {isPunishment && (() => {
                            // Check if punishment is unstarted (started field is null/undefined)
                            if (!warning.started) {
                              return (
                                <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-800 border-yellow-300">
                                  Unstarted
                                </Badge>
                              );
                            }
                            
                            // Check if punishment is inactive (based on effective state)
                            const effectiveState = getEffectivePunishmentState(warning);
                            const isInactive = !effectiveState.effectiveActive;
                            
                            if (isInactive) {
                              return (
                                <Badge variant="outline" className="text-xs bg-gray-100 text-gray-800 border-gray-300">
                                  Inactive
                                </Badge>
                              );
                            }
                            
                            // Punishment is active
                            return (
                              <Badge variant="outline" className="text-xs bg-green-100 text-green-800 border-green-300">
                                Active
                              </Badge>
                            );
                          })()}
                          <Badge variant="outline" className="bg-gray-50 text-gray-900 border-gray-300">
                            {warning.type}
                          </Badge>
                          {warning.altBlocking && (
                            <Badge variant="outline" className="text-xs bg-orange-100 text-orange-800 border-orange-200">
                              Alt-blocking
                            </Badge>
                          )}
                          {isValidBadgeValue(warning.severity) && (
                            <Badge variant="outline" className={`text-xs ${
                              (warning.severity && warning.severity.toLowerCase() === 'low') || (warning.severity && warning.severity.toLowerCase() === 'lenient') ? 
                                'bg-green-100 text-green-800 border-green-300' :
                              (warning.severity && warning.severity.toLowerCase() === 'regular') || (warning.severity && warning.severity.toLowerCase() === 'medium') ?
                                'bg-orange-100 text-orange-800 border-orange-300' :
                                'bg-red-100 text-red-800 border-red-300'
                            }`}>
                              {warning.severity}
                            </Badge>
                          )}
                          {isValidBadgeValue(warning.status) &&
                           !['active', 'inactive', 'unstarted'].includes(warning.status?.toLowerCase?.() || '') && (
                            <Badge variant="outline" className={`text-xs ${
                              (warning.status && warning.status.toLowerCase() === 'low') || (warning.status && warning.status.toLowerCase() === 'first') ?
                                'bg-green-100 text-green-800 border-green-300' :
                              warning.status && warning.status.toLowerCase() === 'medium' ?
                                'bg-orange-100 text-orange-800 border-orange-300' :
                                'bg-red-100 text-red-800 border-red-300'
                            }`}>
                              {warning.status}
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm mt-1 space-y-1">
                          <p>{warning.reason}</p>
                          
                          {/* Show expiry/duration information */}
                          <div className="text-xs text-muted-foreground">
                            {warning.date} by {warning.by}
                            {warning.expires && (
                              <span className="ml-2">
                                • Expires: {formatDateWithTime(warning.expires)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Expand/Collapse button for punishments with additional details */}
                      {isPunishment && (warning.evidence?.length || warning.notes?.length || warning.attachedTicketIds?.length || effectiveState.hasModifications) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="p-1 h-6 w-6"
                          onClick={() => {
                            const id = warning.id || `warning-${index}`;
                            setExpandedPunishments(prev => {
                              const newSet = new Set(prev);
                              if (newSet.has(id)) {
                                newSet.delete(id);
                              } else {
                                newSet.add(id);
                              }
                              return newSet;
                            });
                          }}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                    
                    {/* Expanded details */}
                    {isExpanded && isPunishment && (
                      <div className="mt-3 pt-3 border-t border-border/30 space-y-3">
                        {/* Evidence */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-medium text-muted-foreground">Evidence:</p>
                          </div>
                          {warning.evidence && warning.evidence.length > 0 ? (
                            <ul className="text-xs space-y-2">
                              {warning.evidence.map((evidenceItem, idx) => {
                                // Handle both legacy string format and new object format
                                let evidenceText = '';
                                let issuerInfo = '';
                                let evidenceType = 'text';
                                let fileUrl = '';
                                let fileName = '';
                                let fileType = '';
                                
                                if (typeof evidenceItem === 'string') {
                                  // Legacy string format
                                  evidenceText = evidenceItem;
                                  issuerInfo = 'By: System on Unknown';
                                  evidenceType = evidenceItem.match(/^https?:\/\//) ? 'url' : 'text';
                                } else if (typeof evidenceItem === 'object' && evidenceItem.text) {
                                  // New object format
                                  evidenceText = evidenceItem.text;
                                  const issuer = evidenceItem.issuerName || 'System';
                                  const date = evidenceItem.date ? formatDateWithTime(evidenceItem.date) : 'Unknown';
                                  issuerInfo = `By: ${issuer} on ${date}`;
                                  evidenceType = evidenceItem.type || 'text';
                                  fileUrl = evidenceItem.fileUrl || '';
                                  fileName = evidenceItem.fileName || '';
                                  fileType = evidenceItem.fileType || '';
                                }
                                
                                // Helper function to detect media type from URL
                                const getMediaType = (url: string) => {
                                  if (url.match(/\.(jpeg|jpg|gif|png|webp)$/i)) {
                                    return 'image';
                                  } else if (url.match(/\.(mp4|webm|ogg)$/i)) {
                                    return 'video';
                                  } else if (url.match(/^https?:\/\//)) {
                                    return 'link';
                                  }
                                  return 'link';
                                };
                                
                                // For file evidence, use the file URL for media detection
                                const displayUrl = evidenceType === 'file' ? fileUrl : evidenceText;
                                const mediaType = (evidenceType === 'url' || evidenceType === 'file') ? getMediaType(displayUrl) : 'text';
                                
                                return (
                                  <li key={idx} className="bg-muted/20 p-2 rounded text-xs border-l-2 border-blue-500">
                                    <div className="flex items-start">
                                      <FileText className="h-3 w-3 mr-2 mt-0.5 text-muted-foreground flex-shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        {evidenceType === 'file' ? (
                                          <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                              <span className="font-medium">File:</span>
                                              <a 
                                                href={fileUrl} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
                                              >
                                                <Upload className="h-3 w-3" />
                                                {fileName || 'Unknown file'}
                                              </a>
                                            </div>
                                            {evidenceText && evidenceText !== fileName && (
                                              <div className="text-muted-foreground">{evidenceText}</div>
                                            )}
                                            {mediaType === 'image' && (
                                              <img 
                                                src={fileUrl} 
                                                alt="Evidence" 
                                                className="max-w-full max-h-48 rounded border cursor-pointer"
                                                style={{ maxWidth: '300px' }}
                                                onClick={() => window.open(fileUrl, '_blank')}
                                              />
                                            )}
                                            {mediaType === 'video' && (
                                              <video 
                                                src={fileUrl} 
                                                controls 
                                                className="max-w-full max-h-48 rounded border"
                                                style={{ maxWidth: '300px' }}
                                              />
                                            )}
                                          </div>
                                        ) : mediaType === 'image' ? (
                                          <img 
                                            src={evidenceText} 
                                            alt="Evidence" 
                                            className="max-w-full max-h-48 rounded border"
                                            style={{ maxWidth: '300px' }}
                                          />
                                        ) : mediaType === 'video' ? (
                                          <video 
                                            src={evidenceText} 
                                            controls 
                                            className="max-w-full max-h-48 rounded border"
                                            style={{ maxWidth: '300px' }}
                                          />
                                        ) : evidenceType === 'url' ? (
                                          <a 
                                            href={evidenceText} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:text-blue-800 underline break-all"
                                          >
                                            {evidenceText}
                                          </a>
                                        ) : (
                                          <span className="break-all">{evidenceText}</span>
                                        )}
                                        <p className="text-muted-foreground text-xs mt-1">
                                          {issuerInfo}
                                        </p>
                                      </div>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <p className="text-xs text-muted-foreground">No evidence added</p>
                          )}
                        </div>
                        
                        {/* Staff Notes */}
                        {warning.notes && warning.notes.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Staff Notes:</p>
                            <ul className="text-xs space-y-1">
                              {warning.notes.map((note, idx) => {
                                // For manual punishments, skip the first note as it's displayed as the reason
                                const isManualPunishment = ['Kick', 'Manual Mute', 'Manual Ban'].includes(warning.type);
                                if (isManualPunishment && idx === 0) {
                                  return null; // Skip first note for manual punishments
                                }
                                
                                const noteText = typeof note === 'string' ? note : note.text;
                                const noteIssuer = typeof note === 'string' ? 'Unknown' : note.issuerName;
                                const noteDate = typeof note === 'string' ? 'Unknown' : formatDateWithTime(note.date);
                                
                                return (
                                  <li key={idx} className="bg-muted/20 p-2 rounded text-xs">
                                    <p className="mb-1">{noteText}</p>
                                    <p className="text-muted-foreground text-xs">
                                      By: {noteIssuer} on {noteDate}
                                    </p>
                                  </li>
                                );
                              }).filter(Boolean)}
                            </ul>
                          </div>
                        )}
                        
                        {/* Attached Tickets */}
                        {warning.attachedTicketIds && warning.attachedTicketIds.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Attached Tickets:</p>
                            <div className="flex flex-wrap gap-1">
                              {warning.attachedTicketIds.map((ticketId, idx) => (
                                <Button
                                  key={idx}
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-xs"
                                  onClick={() => {
                                    // Navigate to ticket detail page
                                    const urlSafeTicketId = ticketId.replace('#', 'ID-');
                                    navigate(`/panel/tickets/${urlSafeTicketId}`);
                                  }}
                                >
                                  <Ticket className="h-3 w-3 mr-1" />
                                  {ticketId}
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Modification History */}
                        {effectiveState.hasModifications && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Modification History:</p>
                            <div className="space-y-1">
                              {effectiveState.modifications.map((mod: any, idx: number) => (
                                <div key={idx} className="bg-muted/20 p-2 rounded text-xs border-l-2 border-blue-500">
                                  <div className="flex justify-between items-start mb-1">
                                    <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-700 border-blue-500/30">
                                      {mod.type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (l: string) => l.toUpperCase())}
                                    </Badge>
                                    <span className="text-muted-foreground text-xs">
                                      {formatDateWithTime(mod.issued)}
                                    </span>
                                  </div>
                                  {mod.reason && (
                                    <p className="mb-1">{mod.reason}</p>
                                  )}
                                  {mod.effectiveDuration !== undefined && (
                                    <p className="text-muted-foreground">
                                      New duration: {(mod.effectiveDuration === 0 || mod.effectiveDuration === -1 || mod.effectiveDuration < 0) ? 'Permanent' : formatDuration(mod.effectiveDuration)}
                                    </p>
                                  )}
                                  <p className="text-muted-foreground text-xs">
                                    By: {mod.issuerName}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Action buttons - only show for punishments with IDs */}
                        {warning.id && (
                          <div className="flex gap-2 pt-2 border-t border-border/30">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => {
                                const id = warning.id || `warning-${index}`;
                                setPlayerInfo(prev => ({
                                  ...prev,
                                  isAddingPunishmentNote: true,
                                  punishmentNoteTarget: id,
                                  newPunishmentNote: ''
                                }));
                              }}
                            >
                              <StickyNote className="h-3 w-3 mr-1" />
                              Add Note
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => {
                                const id = warning.id || `warning-${index}`;
                                setPlayerInfo(prev => ({
                                  ...prev,
                                  isAddingPunishmentEvidence: true,
                                  punishmentEvidenceTarget: id,
                                  newPunishmentEvidence: ''
                                }));
                              }}
                            >
                              <FileText className="h-3 w-3 mr-1" />
                              Add Evidence
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => {
                                const id = warning.id || `warning-${index}`;
                                setPlayerInfo(prev => ({
                                  ...prev,
                                  isModifyingPunishment: true,
                                  modifyPunishmentTarget: id,
                                  modifyPunishmentAction: 'modify'
                                }));
                              }}
                            >
                              <Settings className="h-3 w-3 mr-1" />
                              Modify
                            </Button>
                          </div>
                        )}
                        
                        {/* Add Note Form */}
                        {warning.id && playerInfo.isAddingPunishmentNote && playerInfo.punishmentNoteTarget === (warning.id || `warning-${index}`) && (
                          <div className="mt-3 p-3 bg-muted/20 rounded-lg border">
                            <p className="text-xs font-medium mb-2">Add Note to Punishment</p>
                            <textarea
                              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm h-16 resize-none"
                              placeholder="Enter your note here..."
                              value={playerInfo.newPunishmentNote || ''}
                              onChange={(e) => setPlayerInfo(prev => ({...prev, newPunishmentNote: e.target.value}))}
                            />
                            <div className="flex justify-end gap-2 mt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPlayerInfo(prev => ({
                                  ...prev,
                                  isAddingPunishmentNote: false,
                                  punishmentNoteTarget: null,
                                  newPunishmentNote: ''
                                }))}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                disabled={!playerInfo.newPunishmentNote?.trim()}
                                onClick={async () => {
                                  if (!playerInfo.newPunishmentNote?.trim()) return;
                                  
                                  try {
                                    await addPunishmentNote.mutateAsync({
                                      uuid: playerId,
                                      punishmentId: warning.id!,
                                      noteText: playerInfo.newPunishmentNote
                                    });
                                    
                                    toast({
                                      title: "Note added",
                                      description: "Punishment note has been added successfully"
                                    });
                                    
                                    // Reset form and refetch
                                    setPlayerInfo(prev => ({
                                      ...prev,
                                      isAddingPunishmentNote: false,
                                      punishmentNoteTarget: null,
                                      newPunishmentNote: ''
                                    }));
                                    
                                    refetch();
                                  } catch (error) {
                                    toast({
                                      title: "Failed to add note",
                                      description: error instanceof Error ? error.message : "An error occurred",
                                      variant: "destructive"
                                    });
                                  }
                                }}
                              >
                                Add Note
                              </Button>
                            </div>
                          </div>
                        )}
                        
                        {/* Add Evidence Form */}
                        {warning.id && playerInfo.isAddingPunishmentEvidence && playerInfo.punishmentEvidenceTarget === (warning.id || `warning-${index}`) && (
                          <div className="mt-3 p-3 bg-muted/20 rounded-lg border">
                            <p className="text-xs font-medium mb-2">Add Evidence to Punishment</p>
                            <div className="flex items-center space-x-2">
                              <textarea
                                className={`flex-1 rounded-md border border-border px-3 py-2 text-sm h-10 resize-none ${
                                  playerInfo.uploadedEvidenceFile ? 'bg-muted text-muted-foreground' : 'bg-background'
                                }`}
                                placeholder="Enter evidence URL or description..."
                                value={playerInfo.uploadedEvidenceFile ? `📁 ${playerInfo.uploadedEvidenceFile.fileName}` : (playerInfo.newPunishmentEvidence || '')}
                                onChange={(e) => {
                                  if (playerInfo.uploadedEvidenceFile) return; // Don't allow editing if file uploaded
                                  setPlayerInfo(prev => ({...prev, newPunishmentEvidence: e.target.value}));
                                }}
                                readOnly={!!playerInfo.uploadedEvidenceFile}
                              />
                              
                              <MediaUpload
                                uploadType="evidence"
                                onUploadComplete={(result, file) => {
                                  setPlayerInfo(prev => ({
                                    ...prev,
                                    uploadedEvidenceFile: {
                                      url: result.url,
                                      fileName: file?.name || 'Unknown file',
                                      fileType: file?.type || 'application/octet-stream',
                                      fileSize: file?.size || 0
                                    }
                                  }));
                                }}
                                metadata={{
                                  playerId: playerId,
                                  category: 'punishment'
                                }}
                                variant="button-only"
                                maxFiles={1}
                              />
                            </div>
                            <div className="flex justify-end gap-2 mt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPlayerInfo(prev => ({
                                  ...prev,
                                  isAddingPunishmentEvidence: false,
                                  punishmentEvidenceTarget: null,
                                  newPunishmentEvidence: '',
                                  uploadedEvidenceFile: null
                                }))}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                disabled={!playerInfo.newPunishmentEvidence?.trim() && !playerInfo.uploadedEvidenceFile}
                                onClick={async () => {
                                  if (!playerInfo.newPunishmentEvidence?.trim() && !playerInfo.uploadedEvidenceFile) return;
                                  
                                  try {
                                    // Prepare evidence data based on whether it's a file or text
                                    let evidenceData: any;
                                    
                                    if (playerInfo.uploadedEvidenceFile) {
                                      // File evidence
                                      evidenceData = {
                                        text: playerInfo.uploadedEvidenceFile.fileName,
                                        issuerName: user?.username || 'Admin',
                                        date: new Date().toISOString(),
                                        type: 'file',
                                        fileUrl: playerInfo.uploadedEvidenceFile.url,
                                        fileName: playerInfo.uploadedEvidenceFile.fileName,
                                        fileType: playerInfo.uploadedEvidenceFile.fileType,
                                        fileSize: playerInfo.uploadedEvidenceFile.fileSize
                                      };
                                    } else {
                                      // Text evidence
                                      evidenceData = {
                                        text: playerInfo.newPunishmentEvidence.trim(),
                                        issuerName: user?.username || 'Admin',
                                        date: new Date().toISOString()
                                      };
                                    }
                                    
                                    const { csrfFetch } = await import('@/utils/csrf');
                                    const response = await csrfFetch(`/v1/panel/players/${playerId}/punishments/${warning.id}/evidence`, {
                                      method: 'POST',
                                      headers: {
                                        'Content-Type': 'application/json',
                                      },
                                      body: JSON.stringify(evidenceData)
                                    });
                                    
                                    if (!response.ok) {
                                      throw new Error('Failed to add evidence');
                                    }
                                    
                                    toast({
                                      title: "Evidence added",
                                      description: "Evidence has been added to the punishment successfully"
                                    });
                                    
                                    // Reset form and refetch data
                                    setPlayerInfo(prev => ({
                                      ...prev,
                                      isAddingPunishmentEvidence: false,
                                      punishmentEvidenceTarget: null,
                                      newPunishmentEvidence: '',
                                      uploadedEvidenceFile: null
                                    }));
                                    
                                    refetch();
                                  } catch (error) {
                                    console.error('Error adding evidence to punishment:', error);
                                    toast({
                                      title: "Failed to add evidence",
                                      description: error instanceof Error ? error.message : "An unknown error occurred",
                                      variant: "destructive"
                                    });
                                  }
                                }}
                              >
                                Add Evidence
                              </Button>
                            </div>
                          </div>
                        )}
                        
                        {/* Modify Punishment Form */}
                        {warning.id && playerInfo.isModifyingPunishment && playerInfo.modifyPunishmentTarget === (warning.id || `warning-${index}`) && (
                          <div className="mt-3 p-3 bg-muted/20 rounded-lg border">
                            <p className="text-xs font-medium mb-2">Modify Punishment</p>
                            
                            <div className="space-y-2 mb-3">
                              <div>
                                <label className="text-xs text-muted-foreground">Modification Type</label>
                                <select
                                  className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                                  value={playerInfo.selectedModificationType || ''}
                                  onChange={(e) => setPlayerInfo(prev => ({
                                    ...prev,
                                    selectedModificationType: e.target.value as any
                                  }))}
                                >
                                  <option value="">Select modification type...</option>
                                  <option value="MANUAL_DURATION_CHANGE">Change Duration</option>
                                  <option value="MANUAL_PARDON">Pardon</option>
                                  <option value="SET_ALT_BLOCKING_TRUE">Enable Alt Blocking</option>
                                  <option value="SET_ALT_BLOCKING_FALSE">Disable Alt Blocking</option>
                                  <option value="SET_WIPING_TRUE">Enable Wiping</option>
                                  <option value="SET_WIPING_FALSE">Disable Wiping</option>
                                </select>
                              </div>
                              
                              {playerInfo.selectedModificationType === 'MANUAL_DURATION_CHANGE' && (
                                <div>
                                  <label className="text-xs font-medium text-muted-foreground mb-1 block">New Duration</label>
                                  <div className="grid grid-cols-2 gap-2">
                                    <input 
                                      type="number" 
                                      placeholder="Duration" 
                                      className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                                      value={playerInfo.newDuration?.value || ''}
                                      onChange={(e) => setPlayerInfo(prev => ({
                                        ...prev, 
                                        newDuration: {
                                          value: parseInt(e.target.value) || 0,
                                          unit: prev.newDuration?.unit || 'hours'
                                        }
                                      }))}
                                      min={1}
                                    />
                                    <select 
                                      className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                                      value={playerInfo.newDuration?.unit || 'hours'}
                                      onChange={(e) => setPlayerInfo(prev => ({
                                        ...prev, 
                                        newDuration: {
                                          value: prev.newDuration?.value || 1,
                                          unit: e.target.value as any
                                        }
                                      }))}
                                    >
                                      <option value="seconds">Seconds</option>
                                      <option value="minutes">Minutes</option>
                                      <option value="hours">Hours</option>
                                      <option value="days">Days</option>
                                      <option value="weeks">Weeks</option>
                                      <option value="months">Months</option>
                                    </select>
                                  </div>
                                </div>
                              )}
                              
                              <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1 block">Reason</label>
                                <textarea
                                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm h-16 resize-none"
                                  placeholder="Enter reason for modification..."
                                  value={playerInfo.modifyPunishmentReason || ''}
                                  onChange={(e) => setPlayerInfo(prev => ({...prev, modifyPunishmentReason: e.target.value}))}
                                />
                              </div>
                            </div>
                            
                            <div className="flex justify-end gap-2 mt-3">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPlayerInfo(prev => ({
                                  ...prev,
                                  isModifyingPunishment: false,
                                  modifyPunishmentTarget: null,
                                  modifyPunishmentAction: null,
                                  selectedModificationType: null,
                                  modifyPunishmentReason: '',
                                  newDuration: undefined
                                }))}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                disabled={!playerInfo.selectedModificationType || !playerInfo.modifyPunishmentReason?.trim()}
                                onClick={async () => {
                                  if (!playerInfo.selectedModificationType || !playerInfo.modifyPunishmentReason?.trim()) return;
                                  
                                  try {
                                    const modificationData: any = {
                                      punishmentId: warning.id!,
                                      modificationType: playerInfo.selectedModificationType,
                                      reason: playerInfo.modifyPunishmentReason
                                    };
                                    
                                    if (playerInfo.selectedModificationType === 'MANUAL_DURATION_CHANGE' && playerInfo.newDuration) {
                                      modificationData.newDuration = durationToMilliseconds(playerInfo.newDuration);
                                    }
                                    
                                    await modifyPunishment.mutateAsync({
                                      uuid: playerId,
                                      ...modificationData
                                    });
                                    
                                    toast({
                                      title: "Punishment modified",
                                      description: "Punishment has been modified successfully"
                                    });
                                    
                                    // Reset form and refetch
                                    setPlayerInfo(prev => ({
                                      ...prev,
                                      isModifyingPunishment: false,
                                      modifyPunishmentTarget: null,
                                      modifyPunishmentAction: null,
                                      selectedModificationType: null,
                                      modifyPunishmentReason: '',
                                      newDuration: undefined
                                    }));
                                    
                                    refetch();
                                  } catch (error) {
                                    toast({
                                      title: "Failed to modify punishment",
                                      description: error instanceof Error ? error.message : "An error occurred",
                                      variant: "destructive"
                                    });
                                  }
                                }}
                              >
                                Apply Modification
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              }) : (
                <div className="bg-muted/30 p-3 rounded-lg">
                  <p className="text-sm">No moderation history found for this player.</p>
                </div>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="linked" className="space-y-2 mx-1 mt-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Linked Accounts</h4>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setHasTriggeredLinkedSearch(false);
                  triggerLinkedAccountSearch();
                  refetchLinkedAccounts();
                }}
                disabled={findLinkedAccountsMutation.isPending || isLoadingLinkedAccounts}
                className="text-xs h-7 px-2"
              >
                {findLinkedAccountsMutation.isPending || isLoadingLinkedAccounts ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <RefreshCcw className="h-3 w-3 mr-1" />
                    Refresh Search
                  </>
                )}
              </Button>
            </div>
            <div className="bg-muted/30 p-3 rounded-lg">
              {isLoadingLinkedAccounts ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-sm text-muted-foreground">Loading linked accounts...</span>
                </div>
              ) : (
                <ul className="space-y-2">
                  {playerInfo.linkedAccounts && playerInfo.linkedAccounts.length > 0 ? (
                    playerInfo.linkedAccounts.map((account, idx) => (
                      <li key={idx} className="text-sm flex items-center justify-between">
                        <div className="flex items-center">
                          <Link2 className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                          <span className="font-medium">{account.username}</span>
                          {account.statusText && (
                            <span className="text-muted-foreground ml-1">{account.statusText}</span>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-6 px-2"
                          onClick={() => {
                            // Navigate to the linked account's player page using UUID
                            const uuid = account.uuid || account._id;
                            if (uuid) {
                              navigate(`/panel/player/${uuid}`);
                            } else {
                              console.warn('No UUID found for linked account:', account);
                              toast({
                                title: "Navigation Error",
                                description: "Unable to navigate to linked account - no UUID found",
                                variant: "destructive"
                              });
                            }
                          }}
                          disabled={!account.uuid && !account._id}
                        >
                          <Search className="h-3 w-3 mr-1" />
                          View
                        </Button>
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-muted-foreground text-center py-2">
                      {findLinkedAccountsMutation.isPending ? 
                        'Searching for linked accounts...' : 
                        'No linked accounts found.'
                      }
                    </li>
                  )}
                </ul>
              )}
              
              {linkedAccountsData?.searchStatus && (
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="text-xs text-muted-foreground">
                    <p>Search Status: {linkedAccountsData.searchStatus}</p>
                    {linkedAccountsData.lastSearched && (
                      <p>Last Searched: {formatDateWithTime(linkedAccountsData.lastSearched)}</p>
                    )}
                    {linkedAccountsData.totalFound !== undefined && (
                      <p>Total Found: {linkedAccountsData.totalFound}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="notes" className="space-y-2 mx-1 mt-3">
            <h4 className="font-medium">Staff Notes</h4>
            <div className="bg-muted/30 p-3 rounded-lg">
              <ul className="space-y-2">
                {playerInfo.notes.length > 0 ? (
                  playerInfo.notes.map((note, idx) => (
                    <li key={idx} className="text-sm flex items-start">
                      <StickyNote className="h-3.5 w-3.5 mr-2 mt-0.5 text-muted-foreground" />
                      <span>{note}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-muted-foreground">No staff notes found.</li>
                )}
              </ul>
              
              {playerInfo.isAddingNote && (
                <div className="mt-3 border-t border-border pt-3">
                  <textarea 
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm h-20"
                    placeholder="Enter your note here..."
                    value={playerInfo.newNote || ''}
                    onChange={(e) => setPlayerInfo(prev => ({...prev, newNote: e.target.value}))}
                  ></textarea>
                  <div className="flex justify-end mt-2 gap-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => setPlayerInfo(prev => ({
                        ...prev, 
                        isAddingNote: false,
                        newNote: ''
                      }))}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={!playerInfo.newNote?.trim()}
                      onClick={async () => {
                        if (!playerInfo.newNote?.trim()) return;

                        const currentDate = new Date();
                        const formattedDate = formatDateWithTime(currentDate);
                        const actualUsername = user?.username || 'Admin';
                        const newNoteWithMetadata = `${playerInfo.newNote} (Added by ${actualUsername} on ${formattedDate})`;

                        // Create the note in the format expected by the API
                        const noteObject = {
                          text: playerInfo.newNote.trim(),
                          issuerName: actualUsername,
                          date: new Date().toISOString()
                        };

                        try {
                          // Send note to the server
                          const { csrfFetch } = await import('@/utils/csrf');
                          const response = await csrfFetch(`/v1/panel/players/${playerId}/notes`, {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(noteObject)
                          });

                          if (!response.ok) {
                            throw new Error('Failed to add note to player');
                          }

                          // Update local state
                          setPlayerInfo(prev => ({
                            ...prev,
                            notes: [...prev.notes, newNoteWithMetadata],
                            isAddingNote: false,
                            newNote: ''
                          }));

                          // Force a refetch to get the latest data
                          refetch();

                          toast({
                            title: "Note added",
                            description: "Staff note has been added successfully"
                          });
                        } catch (error) {
                          toast({
                            title: "Error",
                            description: "Failed to add note. Please try again.",
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      Add Note
                    </Button>
                  </div>
                </div>
              )}
              
              {!playerInfo.isAddingNote && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full mt-3"
                  onClick={() => setPlayerInfo(prev => ({...prev, isAddingNote: true}))}
                >
                  <StickyNote className="h-3.5 w-3.5 mr-1.5" />
                  Add Note
                </Button>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="tickets" className="space-y-2 mx-1 mt-3">
            <h4 className="font-medium">Player Tickets</h4>
            <div className="space-y-2">
              {isLoadingTickets ? (
                <div className="bg-muted/30 p-3 rounded-lg flex items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-sm">Loading tickets...</span>
                </div>
              ) : playerTickets && playerTickets.length > 0 ? (
                playerTickets.map((ticket: any) => (
                  <div 
                    key={ticket._id} 
                    className="bg-muted/30 p-3 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer"
                    onClick={() => handleTicketClick(ticket._id)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className={`text-xs ${
                            ticket.status === 'open' ? 'bg-green-100 text-green-800 border-green-300' :
                            ticket.status === 'in_progress' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                            ticket.status === 'resolved' ? 'bg-gray-100 text-gray-800 border-gray-300' :
                            'bg-red-100 text-red-800 border-red-300'
                          }`}>
                            {ticket.status?.replace('_', ' ').toUpperCase() || 'UNKNOWN'}
                          </Badge>
                          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-900 border-blue-200">
                            {ticket.category || 'General'}
                          </Badge>
                        </div>
                        <div className="text-sm">
                          <p className="font-medium">{ticket.subject || 'No subject'}</p>
                          <p className="text-muted-foreground mt-1 line-clamp-2">
                            {ticket.description || ticket.message || 'No description available'}
                          </p>
                        </div>
                        <div className="text-xs text-muted-foreground mt-2">
                          Created: {ticket.createdAt ? formatDateWithTime(ticket.createdAt) : 'Unknown'} 
                          {ticket.assignedTo && ` • Assigned to: ${ticket.assignedTo}`}
                        </div>
                      </div>
                      <div className="ml-2">
                        <Badge variant="outline" className="text-xs">
                          #{ticket._id?.slice(-6) || 'N/A'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="bg-muted/30 p-3 rounded-lg">
                  <p className="text-sm text-muted-foreground">No tickets found for this player.</p>
                </div>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="names" className="space-y-2 mx-1 mt-3">
            <h4 className="font-medium">Previous Names</h4>
            <div className="bg-muted/30 p-3 rounded-lg">
              <ul className="space-y-2">
                {playerInfo.previousNames && playerInfo.previousNames.length > 0 ? (
                  playerInfo.previousNames.map((name, idx) => (
                    <li key={idx} className="text-sm flex items-center">
                      <UserRound className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                      {name}
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-muted-foreground">No previous names found.</li>
                )}
              </ul>
            </div>
          </TabsContent>
          
          <TabsContent value="punishment" className="space-y-3 mx-1 mt-3">
            <h4 className="font-medium">Create Punishment</h4>
            <PlayerPunishment
              playerId={playerId}
              playerName={playerInfo.username}
              playerStatus={playerInfo.status}
              data={{
                selectedPunishmentCategory: playerInfo.selectedPunishmentCategory,
                selectedSeverity: playerInfo.selectedSeverity,
                selectedOffenseLevel: playerInfo.selectedOffenseLevel,
                duration: playerInfo.duration,
                isPermanent: playerInfo.isPermanent,
                reason: playerInfo.reason,
                evidence: playerInfo.evidenceList || [],
                staffNotes: playerInfo.staffNotes,
                altBlocking: playerInfo.altBlocking,
                statWiping: playerInfo.statWiping,
                silentPunishment: playerInfo.silentPunishment,
                kickSameIP: playerInfo.kickSameIP,
                attachReports: playerInfo.attachedReports,
                banToLink: playerInfo.banToLink,
                banLinkedAccounts: playerInfo.banLinkedAccounts
              }}
              onChange={(data) => {
                setPlayerInfo(prev => ({
                  ...prev,
                  selectedPunishmentCategory: data.selectedPunishmentCategory,
                  selectedSeverity: data.selectedSeverity,
                  selectedOffenseLevel: data.selectedOffenseLevel,
                  duration: data.duration,
                  isPermanent: data.isPermanent,
                  reason: data.reason,
                  evidenceList: data.evidence,
                  staffNotes: data.staffNotes,
                  altBlocking: data.altBlocking,
                  statWiping: data.statWiping,
                  silentPunishment: data.silentPunishment,
                  kickSameIP: data.kickSameIP,
                  attachedReports: data.attachReports,
                  banToLink: data.banToLink,
                  banLinkedAccounts: data.banLinkedAccounts
                }));
              }}
              onApply={async (data) => {
                // Use the existing handleApplyPunishment logic
                await handleApplyPunishment();
              }}
              punishmentTypesByCategory={punishmentTypesByCategory}
              isLoading={isApplyingPunishment || isLoadingSettings || isLoadingPunishmentTypes}
              compact={false}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default PlayerDetailPage;