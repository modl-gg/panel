import { useState, useEffect, useCallback } from 'react';
import {
  Eye, TriangleAlert, Ban, Search, LockOpen, History,
  Link2, StickyNote, Ticket, UserRound, Shield, FileText, Upload, Loader2,
  ChevronDown, ChevronRight, Settings, Plus, X
} from 'lucide-react';
import { useLocation } from 'wouter';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@modl-gg/shared-web/components/ui/tabs';
import ResizableWindow from '@/components/layout/ResizableWindow';
import { usePlayer, useApplyPunishment, useSettings, usePunishmentTypes, usePlayerTickets, usePlayerAllTickets, useModifyPunishment, useAddPunishmentNote, useModifyPunishmentTickets, useLinkedAccounts, useFindLinkedAccounts, useLinkedBansForPunishment } from '@/hooks/use-data';
import { ClickablePlayer } from '@/components/ui/clickable-player';
import { useAuth } from '@/hooks/use-auth';
import { toast } from '@/hooks/use-toast';
import PlayerPunishment, { PlayerPunishmentData } from '@/components/ui/player-punishment';
import MediaUpload from '@/components/MediaUpload';
import { formatDateWithTime } from '@/utils/date-utils';
import { getAvatarUrl, apiFetch } from '@/lib/api';

// Local type definitions
interface WindowPosition {
  x: number;
  y: number;
}

interface Player {
  _id: string;
  username: string;
  // Add other player properties as needed
}

interface PlayerWindowProps {
  playerId: string;
  isOpen: boolean;
  onClose: () => void;
  initialPosition?: WindowPosition;
}

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
    evidence?: (string | {
      text?: string;
      url?: string;
      fileUrl?: string; // Legacy field name
      type?: string;
      uploadedBy?: string;
      uploadedAt?: string;
      issuerName?: string; // Legacy field name
      date?: string; // Legacy field name
      fileName?: string;
      fileType?: string;
      fileSize?: number;
    })[];
    notes?: Array<{text: string; issuerName: string; date: string}>;
    attachedTicketIds?: string[];
    active?: boolean;
    expires?: string;
    started?: string | Date;
    data?: any;
    altBlocking?: boolean;
  }>;
  linkedAccounts: string[];
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
  modifyPunishmentTarget?: string | null;  modifyPunishmentAction?: 'modify' | null;
  modifyPunishmentReason?: string;
  selectedModificationType?: 'MANUAL_DURATION_CHANGE' | 'MANUAL_PARDON' | 'SET_ALT_BLOCKING_TRUE' | 'SET_WIPING_TRUE' | 'SET_ALT_BLOCKING_FALSE' | 'SET_WIPING_FALSE' | null;
  newDuration?: {
    value: number;
    unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
  };
  // Ticket modification fields
  isModifyingTickets?: boolean;
  modifyTicketsTarget?: string | null;
  modifyTicketsAssociated?: boolean;
  modifyTicketsAdd?: string[];
  modifyTicketsRemove?: string[];
  // Punishment creation fields
  selectedPunishmentCategory?: string;
  selectedSeverity?: 'Lenient' | 'Regular' | 'Aggravated';
  selectedOffenseLevel?: 'first' | 'medium' | 'habitual'; // For single-severity punishments
  duration?: {
    value: number;
    unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
  };
  isPermanent?: boolean;  reason?: string;
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
  customizable: boolean;
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
  customPoints?: number; // For permanent punishments that don't use severity-based points  staffDescription?: string; // Description shown to staff when applying this punishment
  playerDescription?: string; // Description shown to players (in appeals, notifications, etc.)
  canBeAltBlocking?: boolean; // Whether this punishment can block alternative accounts
  canBeStatWiping?: boolean; // Whether this punishment can wipe player statistics
  isAppealable?: boolean; // Whether this punishment type can be appealed
  singleSeverityPunishment?: boolean; // Whether this punishment uses single severity instead of three levels
  singleSeverityDurations?: {
    first: { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; type: 'mute' | 'ban'; };
    medium: { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; type: 'mute' | 'ban'; };
    habitual: { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; type: 'mute' | 'ban'; };
  };
  singleSeverityPoints?: number; // Points for single severity punishments
}

// Inline component for linked ban display
const LinkedBansDisplay = ({ punishmentId, onPlayerClick }: { punishmentId: string; onPlayerClick: (uuid: string) => void }) => {
  const { data: linkedBans, isLoading } = useLinkedBansForPunishment(punishmentId);

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading linked bans...</p>;
  if (!linkedBans || linkedBans.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1">Linked Bans:</p>
      <div className="flex flex-wrap gap-1">
        {linkedBans.map((lb: any) => (
          <Button
            key={lb.punishmentId}
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => onPlayerClick(lb.playerUuid)}
          >
            <Link2 className="h-3 w-3 mr-1" />
            {lb.playerName}
            {lb.active && <Badge variant="destructive" className="ml-1 h-4 text-[10px] px-1">Active</Badge>}
          </Button>
        ))}
      </div>
    </div>
  );
};

const PlayerWindow = ({ playerId, isOpen, onClose, initialPosition }: PlayerWindowProps) => {
  const [activeTab, setActiveTab] = useState('history');
  const [banSearchResults, setBanSearchResults] = useState<{id: string; player: string}[]>([]);
  const [showBanSearchResults, setShowBanSearchResults] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(true);
  const [isApplyingPunishment, setIsApplyingPunishment] = useState(false);
  const [expandedPunishments, setExpandedPunishments] = useState<Set<string>>(new Set());
  
  // Helper function to map severity levels for display (converts 'low' to 'lenient')
  const mapSeverityForDisplay = (severity: string): string => {
    return severity.toLowerCase() === 'low' ? 'lenient' : severity;
  };

  // Get current authenticated user
  const { user } = useAuth();
  const [, setLocation] = useLocation();
    // Initialize the applyPunishment mutation hook
  const applyPunishment = useApplyPunishment();
  const modifyPunishment = useModifyPunishment();
  const addPunishmentNote = useAddPunishmentNote();
  const modifyPunishmentTickets = useModifyPunishmentTickets();
  // Get punishment ordinal from actual punishment types data
  const getPunishmentOrdinal = (punishmentName: string): number => {
    // First try to find it in the punishment types from settings
    const allTypes = [
      ...punishmentTypesByCategory.Administrative,
      ...punishmentTypesByCategory.Social,
      ...punishmentTypesByCategory.Gameplay
    ];
    
    const punishmentType = allTypes.find(type => type.name === punishmentName);
    if (punishmentType) {
      return punishmentType.ordinal;
    }
    
    // If not found in settings, return -1 to indicate invalid
    return -1;
  };

  // Convert duration to milliseconds
  const convertDurationToMilliseconds = (duration: { value: number; unit: string }): number => {
    const multipliers = {
      'seconds': 1000,
      'minutes': 60 * 1000,
      'hours': 60 * 60 * 1000,
      'days': 24 * 60 * 60 * 1000,
      'weeks': 7 * 24 * 60 * 60 * 1000,
      'months': 30 * 24 * 60 * 60 * 1000
    };
    
    return duration.value * (multipliers[duration.unit as keyof typeof multipliers] || 0);
  };  // Handler for applying punishment
  const handleApplyPunishment = async () => {
    const punishmentType = getCurrentPunishmentType();
    
    // Validate required fields
    if (!playerInfo.selectedPunishmentCategory) {
      toast({
        title: "Missing information",
        description: "Please select a punishment category",
        variant: "destructive"
      });
      return;
    }

    // Only validate reason for administrative manual punishments that explicitly need it
    const needsReason = ['Kick', 'Manual Mute', 'Manual Ban'].includes(playerInfo.selectedPunishmentCategory);
    if (needsReason && !playerInfo.reason?.trim()) {
      toast({
        title: "Missing information",
        description: "Please provide a reason for this punishment",
        variant: "destructive"
      });
      return;
    }
    
    // For single-severity punishments, offense level is required
    // For multi-severity punishments, severity is required
    if (punishmentType?.singleSeverityPunishment && !playerInfo.selectedOffenseLevel) {
      toast({
        title: "Missing information",
        description: "Please select an offense level",
        variant: "destructive"
      });
      return;
    }
    
    if (!punishmentType?.singleSeverityPunishment && !playerInfo.selectedSeverity && 
        !['Kick', 'Manual Mute', 'Manual Ban', 'Security Ban', 'Linked Ban', 'Blacklist'].includes(playerInfo.selectedPunishmentCategory)) {
      toast({
        title: "Missing information",
        description: "Please select a severity level",
        variant: "destructive"
      });
      return;
    }
    
    // Validate duration for punishments that need it
    const needsDuration = ['Manual Mute', 'Manual Ban'].includes(playerInfo.selectedPunishmentCategory);
    const isManualPunishment = ['Kick', 'Manual Mute', 'Manual Ban', 'Security Ban', 'Linked Ban', 'Blacklist'].includes(playerInfo.selectedPunishmentCategory);
                          
    if (needsDuration && !playerInfo.isPermanent && (!playerInfo.duration?.value || playerInfo.duration.value <= 0 || !playerInfo.duration?.unit)) {
      toast({
        title: "Invalid duration",
        description: "Please specify a valid duration (greater than 0) or select 'Permanent'",
        variant: "destructive"
      });
      return;
    }
    
    // Validate punishment ordinal
    const typeOrdinal = getPunishmentOrdinal(playerInfo.selectedPunishmentCategory);
    if (typeOrdinal === -1) {
      toast({
        title: "Invalid punishment type",
        description: "Unknown punishment type selected",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setIsApplyingPunishment(true);
      
      // Determine severity and status based on punishment type first
      let severity = null;
      let status = null;
      
      if (punishmentType?.singleSeverityPunishment) {
        // For single-severity punishments, severity is the single configured value
        severity = 'single'; // or could be determined from punishment type config
        // Map offense level to status for storage
        const offenseLevelMapping = {
          'first': 'low',
          'medium': 'medium', 
          'habitual': 'habitual'
        };
        status = offenseLevelMapping[playerInfo.selectedOffenseLevel as keyof typeof offenseLevelMapping] || 'low';
      } else if (playerInfo.selectedSeverity) {
        // For multi-severity punishments, map UI severity to punishment system values
        const severityMapping = {
          'Lenient': 'lenient',
          'Regular': 'regular', 
          'Aggravated': 'severe'
        };
        severity = severityMapping[playerInfo.selectedSeverity] || 'n/a';
        
        // Status is always low for multi-severity (default offense level)
        status = 'low'; // Could be enhanced to track actual offense count
      }

      // Calculate duration in milliseconds based on punishment type configuration
      let durationMs = 0;
      
      // For manual punishments that need duration, use user-specified duration
      if (needsDuration && !playerInfo.isPermanent && playerInfo.duration) {
        durationMs = convertDurationToMilliseconds(playerInfo.duration);
      } 
      // For Linked Ban, it inherits duration from the linked ban (permanent by default)
      else if (playerInfo.selectedPunishmentCategory === 'Linked Ban') {
        durationMs = 0; // Permanent by default, unless linked ban has expiry
      }
      // For other manual punishments that don't need duration (Kick, Security Ban, Blacklist), skip duration calculation
      else if (isManualPunishment) {
        // These punishments don't need duration calculations
        durationMs = 0;
      }
      // For all other non-manual punishments, use punishment type configuration
      else if (!playerInfo.isPermanent) {
        if (punishmentType?.singleSeverityPunishment && punishmentType?.singleSeverityDurations && playerInfo.selectedOffenseLevel) {
          // Single-severity punishment - use duration from offense level
          const duration = punishmentType.singleSeverityDurations[playerInfo.selectedOffenseLevel];
          if (duration) {
            durationMs = convertDurationToMilliseconds(duration);
          }
        } else if (punishmentType?.durations && playerInfo.selectedSeverity) {
          // Multi-severity punishment - use duration from punishment type config based on severity and status
          const severityKey = playerInfo.selectedSeverity === 'Lenient' ? 'low' : 
                             playerInfo.selectedSeverity === 'Regular' ? 'regular' : 'severe';
          
          // Map stored status back to punishment type keys for duration lookup
          const statusToDurationKey = {
            'low': 'first',
            'medium': 'medium', 
            'habitual': 'habitual'
          };
          const statusKey = statusToDurationKey[status as keyof typeof statusToDurationKey] || 'first';
          const duration = punishmentType.durations[severityKey]?.[statusKey as 'first' | 'medium' | 'habitual'];
          
          if (duration) {
            durationMs = convertDurationToMilliseconds(duration);
          } else {
            // Try with 'first' as fallback
            const fallbackDuration = punishmentType.durations[severityKey]?.['first'];
            if (fallbackDuration) {
              durationMs = convertDurationToMilliseconds(fallbackDuration);
            }
          }
        }
      }
        // Prepare data map for additional punishment data
      const data: { [key: string]: any } = {
        issuedServer: 'Panel',
        silent: playerInfo.silentPunishment || false,
      };
        // Set duration in data for all punishments that have a calculated duration
      if (durationMs > 0) {
        data.duration = durationMs;
      }
      
      // Add punishment-specific data
      if (playerInfo.altBlocking) {
        data.altBlocking = true;
      }
      
      if (playerInfo.statWiping) {
        data.wipeAfterExpiry = true;
      }
      
      if (playerInfo.banLinkedAccounts) {
        data.banLinkedAccounts = true;
      }
      
      if (playerInfo.wipeAccountAfterExpiry) {
        data.wipeAfterExpiry = true;
      }
      
      if (playerInfo.kickSameIP) {
        data.kickSameIP = true;
      }
      
      if (playerInfo.banToLink?.trim()) {
        // Extract ban ID from the format "ban-123 (PlayerName)"
        const banIdMatch = playerInfo.banToLink.match(/^(ban-\w+)/);
        if (banIdMatch) {
          data.linkedBanId = banIdMatch[1];
        }
      }
      
      // Prepare notes array - notes must be objects with text, issuerName, and date
      const notes: Array<{text: string; issuerName: string; date?: string}> = [];
      
      // For manual punishments that need a reason, make the reason the first note
      const needsReasonAsFirstNote = ['Kick', 'Manual Mute', 'Manual Ban'].includes(playerInfo.selectedPunishmentCategory);
      if (needsReasonAsFirstNote && playerInfo.reason?.trim()) {
        notes.push({
          text: playerInfo.reason.trim(),
          issuerName: user?.minecraftUsername || user?.username || 'Admin'
        });
      }
      
      // Add staff notes as additional notes
      if (playerInfo.staffNotes?.trim()) {
        notes.push({
          text: playerInfo.staffNotes.trim(),
          issuerName: user?.minecraftUsername || user?.username || 'Admin'
        });
      }
      
      // Prepare attached ticket IDs
      const attachedTicketIds: string[] = [];
      if (playerInfo.attachedReports) {
        playerInfo.attachedReports.forEach(report => {
          if (report && report !== 'ticket-new') {
            // Extract ticket ID from format like "ticket-123" or use raw ID
            const ticketMatch = report.match(/ticket-(\w+)/);
            if (ticketMatch) {
              attachedTicketIds.push(ticketMatch[1]);
            } else if (report.trim()) {
              attachedTicketIds.push(report.trim());
            }
          }
        });
      }
      
      // Prepare evidence array - handle both string and object formats
      // CreateEvidenceRequest expects: text, issuerName, type, fileUrl, fileName, fileType, fileSize
      const evidence = playerInfo.evidenceList?.filter((e: string) => e.trim()).map((e: string) => {
        const trimmedEvidence = e.trim();

        // If it's a JSON object (uploaded file with metadata), parse and convert
        if (trimmedEvidence.startsWith('{')) {
          try {
            const fileData = JSON.parse(trimmedEvidence);
            return {
              text: fileData.fileName,
              issuerName: user?.minecraftUsername || user?.username || 'Admin',
              type: 'file',
              fileUrl: fileData.url, // CreateEvidenceRequest expects 'fileUrl'
              fileName: fileData.fileName,
              fileType: fileData.fileType,
              fileSize: fileData.fileSize
            };
          } catch (error) {
            console.warn('Failed to parse evidence JSON:', error);
            // Fallback to text evidence
            return {
              text: trimmedEvidence,
              issuerName: user?.minecraftUsername || user?.username || 'Admin',
              type: 'text'
            };
          }
        }
        // If it's a URL (legacy uploaded file or direct URL), convert to object format
        else if (trimmedEvidence.startsWith('http')) {
          // Extract filename from URL for better display
          const fileName = trimmedEvidence.split('/').pop() || 'Unknown file';

          return {
            text: fileName,
            issuerName: user?.minecraftUsername || user?.username || 'Admin',
            type: 'file',
            fileUrl: trimmedEvidence, // CreateEvidenceRequest expects 'fileUrl'
            fileName: fileName,
            fileType: getFileTypeFromUrl(trimmedEvidence),
            fileSize: 0 // We don't have size info from URL
          };
        } else {
          // Text evidence - convert to object format
          return {
            text: trimmedEvidence,
            issuerName: user?.minecraftUsername || user?.username || 'Admin',
            type: 'text'
          };
        }
      }) || [];
      
      // Helper function to determine file type from URL
      function getFileTypeFromUrl(url: string): string {
        const extension = url.split('.').pop()?.toLowerCase();
        if (!extension) return 'application/octet-stream';
        
        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        const videoExts = ['mp4', 'webm', 'mov', 'avi'];
        const docExts = ['pdf', 'doc', 'docx', 'txt'];
        
        if (imageExts.includes(extension)) return `image/${extension}`;
        if (videoExts.includes(extension)) return `video/${extension}`;
        if (docExts.includes(extension)) return `application/${extension}`;
        
        return 'application/octet-stream';
      }
      // Prepare punishment data in the format expected by the server
      // Use minecraftUsername for consistency with in-game punishments, fall back to panel username
      const punishmentData: { [key: string]: any } = {
        issuerName: user?.minecraftUsername || user?.username || 'Admin',
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
  
  const [playerInfo, setPlayerInfo] = useState<PlayerInfo>({
    username: 'DragonSlayer123',
    status: 'Online',
    region: 'Europe',
    country: 'Germany',
    firstJoined: '2023-01-15',
    lastOnline: '2 hours ago',
    lastServer: 'Survival (EU-3)',
    playtime: '342 hours',
    social: 'Low',
    gameplay: 'Medium',
    punished: false,
    previousNames: ['Dragon55', 'SlayerXD'],
    warnings: [
      { type: 'Warning', reason: 'Excessive caps in chat', date: '2023-04-12', by: 'Moderator2' },
      { type: 'Mute', reason: 'Inappropriate language in global chat', date: '2023-03-28', by: 'ServerAI (30 minutes)' },
    ],
    linkedAccounts: ['Dragon55#1234 (Discord)', 'dragonslayer123 (Website)'],
    notes: ['Player has been consistently helpful to new players', 'Frequently reports bugs and exploits']
  });

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
    setLocation(`/panel/tickets/${ticketId}`);
  };

    // Use React Query hook to fetch player data with refetch capability
  const { data: player, isLoading, isFetching, error, refetch } = usePlayer(playerId);
  
  // Fetch all player tickets (both created by them and reports against them)
  const { data: playerTickets, isLoading: isLoadingTickets } = usePlayerAllTickets(playerId);
  
  // Fetch linked accounts
  const { data: linkedAccountsData, isLoading: isLoadingLinkedAccounts, refetch: refetchLinkedAccounts } = useLinkedAccounts(playerId);
  
  // Hook to trigger linked account search
  const findLinkedAccountsMutation = useFindLinkedAccounts();
  
  // State to track if we've already triggered linked account search for this window session
  const [hasTriggeredLinkedSearch, setHasTriggeredLinkedSearch] = useState(false);
  
  // Stable function to trigger linked account search
  const triggerLinkedAccountSearch = useCallback(() => {
    if (playerId && !hasTriggeredLinkedSearch && !findLinkedAccountsMutation.isPending) {
      setHasTriggeredLinkedSearch(true);
      findLinkedAccountsMutation.mutate(playerId, {
        onError: (error) => {
          console.error('Failed to trigger linked account search:', error);
          // Don't reset the flag - this prevents retry loops on rate limit errors
          // User can close and reopen the window to retry if needed
        }
      });
    }
  }, [playerId, hasTriggeredLinkedSearch]);
  
  // Fetch settings and punishment types
  const { data: settingsData, isLoading: isLoadingSettings } = useSettings();
  const { data: punishmentTypesData, isLoading: isLoadingPunishmentTypes } = usePunishmentTypes();
  
  // Parse punishment types from settings - must be declared before useEffect that uses it
  const [punishmentTypesByCategory, setPunishmentTypesByCategory] = useState<{
    Administrative: PunishmentType[], 
    Social: PunishmentType[], 
    Gameplay: PunishmentType[]
  }>({
    Administrative: [
      // Administrative punishment types (ordinals 0-5, not customizable) - minimal fallback
      { id: 0, name: 'Kick', category: 'Administrative', customizable: false, ordinal: 0 },
      { id: 1, name: 'Manual Mute', category: 'Administrative', customizable: false, ordinal: 1 },
      { id: 2, name: 'Manual Ban', category: 'Administrative', customizable: false, ordinal: 2 },
      { id: 3, name: 'Security Ban', category: 'Administrative', customizable: false, ordinal: 3 },
      { id: 4, name: 'Linked Ban', category: 'Administrative', customizable: false, ordinal: 4 },
      { id: 5, name: 'Blacklist', category: 'Administrative', customizable: false, ordinal: 5 }    ],
    Social: [],
    Gameplay: []
  });

  // Process punishment types data from dedicated endpoint
  useEffect(() => {
    if (punishmentTypesData && Array.isArray(punishmentTypesData)) {
      try {
        // Always ensure administrative punishment types are available
        const defaultAdminTypes: PunishmentType[] = [
          { id: 0, name: 'Kick', category: 'Administrative' as const, customizable: false, ordinal: 0 },
          { id: 1, name: 'Manual Mute', category: 'Administrative' as const, customizable: false, ordinal: 1 },
          { id: 2, name: 'Manual Ban', category: 'Administrative' as const, customizable: false, ordinal: 2 },
          { id: 3, name: 'Security Ban', category: 'Administrative' as const, customizable: false, ordinal: 3 },
          { id: 4, name: 'Linked Ban', category: 'Administrative' as const, customizable: false, ordinal: 4 },
          { id: 5, name: 'Blacklist', category: 'Administrative' as const, customizable: false, ordinal: 5 }
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
    let gameplayPoints = 0;    // Calculate points from active punishments
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
  
  // Refetch player data whenever the window is opened
  useEffect(() => {
    if (isOpen) {
      // Refetch data to ensure we have the latest
      refetch();
      // Also trigger linked account search when window opens (only once per session)
      triggerLinkedAccountSearch();
    } else {
      // Reset the search flag when window closes
      setHasTriggeredLinkedSearch(false);
    }
  }, [isOpen, refetch, triggerLinkedAccountSearch]);

  useEffect(() => {
    if (player && isOpen) {
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
        
        // Initialize warnings array - do NOT include staff notes as warnings
        const warnings: any[] = [];
        
        // Add punishments to warnings with full details
        if (player.punishments) {
          // Processing player punishments
          player.punishments.forEach((punishment: any) => {
            // Processing individual punishment            // Determine punishment type name from ordinal using settings data
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
              evidence: (() => {
                const evidenceArray = punishment.evidence || [];
                // Processing evidence data
                return evidenceArray;
              })(),
              notes: punishment.notes || [],
              attachedTicketIds: punishment.attachedTicketIds || [],
              active: punishment.data?.active !== false || (punishment.data?.get ? punishment.data.get('active') !== false : punishment.active),
              modifications: punishment.modifications || [],
              expires: punishment.expires || punishment.data?.expires || (punishment.data?.get ? punishment.data.get('expires') : null),
              data: (() => {
                const data = punishment.data || {};
                // For linked bans, filter out fields that might contain 0 values that shouldn't be displayed
                if (punishment.typeOrdinal === 4) {
                  const filteredData = { ...data };
                  // Remove any fields that are 0 or null for linked bans
                  Object.keys(filteredData).forEach(key => {
                    const value = filteredData[key];
                    if (value === 0 || value === '0' || value === null || value === undefined) {
                      delete filteredData[key];
                    }
                  });
                  return filteredData;
                }
                return data;
              })(),
              altBlocking: punishment.data?.altBlocking || (punishment.data?.get ? punishment.data.get('altBlocking') : false),
              started: punishment.started
            });
          });
        }
          // Extract notes
        const notes = player.notes          ? player.notes.map((note: any) => `${note.text} (Added by ${note.issuerName} on ${formatDateWithTime(note.date)})`) 
          : [];
        
        // Extract linked accounts from API data
        const linkedAccounts: string[] = [];
        
        if (linkedAccountsData?.linkedAccounts && Array.isArray(linkedAccountsData.linkedAccounts)) {
          linkedAccountsData.linkedAccounts.forEach((account: any) => {
            const statusInfo = [];
            if (account.activeBans > 0) statusInfo.push(`${account.activeBans} active ban${account.activeBans > 1 ? 's' : ''}`);
            if (account.activeMutes > 0) statusInfo.push(`${account.activeMutes} active mute${account.activeMutes > 1 ? 's' : ''}`);
            
            const statusText = statusInfo.length > 0 ? ` (${statusInfo.join(', ')})` : '';
            linkedAccounts.push(`${account.username}${statusText}`);
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
          playtime: (() => {
            const totalSeconds = getPlayerData(player, 'totalPlaytimeSeconds') || player.totalPlaytimeSeconds || 0;
            if (totalSeconds > 0) {
              const hours = Math.floor(totalSeconds / 3600);
              const minutes = Math.floor((totalSeconds % 3600) / 60);
              return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
            }
            return 'Not tracked';
          })(),
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
    }  }, [player, isOpen, punishmentTypesByCategory, settingsData, linkedAccountsData]);

  // Reset avatar state when playerId changes
  useEffect(() => {
    setAvatarError(false);
    setAvatarLoading(true);
  }, [playerId]);
  
  // Handle punishment ID lookup and scroll to punishment
  useEffect(() => {
    if (isOpen && playerInfo?.warnings) {
      const urlParams = new URLSearchParams(window.location.search);
      const punishmentIdParam = urlParams.get('punishment');
      
      if (punishmentIdParam) {
        // Switch to history tab first
        setActiveTab('history');
        
        // Wait a bit for the tab to render, then scroll to the punishment
        setTimeout(() => {
          const punishmentElement = document.querySelector(`[data-punishment-id="${punishmentIdParam}"]`);
          if (punishmentElement) {
            punishmentElement.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'center' 
            });
            
            // Add a highlight effect
            punishmentElement.classList.add('bg-blue-100', 'border-2', 'border-blue-400');
            setTimeout(() => {
              punishmentElement.classList.remove('bg-blue-100', 'border-2', 'border-blue-400');
            }, 3000);
          }
        }, 100);
        
        // Clean up the URL parameter after handling it
        urlParams.delete('punishment');
        const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
        window.history.replaceState({}, '', newUrl);
      }
    }
  }, [isOpen, playerInfo?.warnings, setActiveTab]);
  
  // Show loading state
  if (isLoading) {
    return (
      <ResizableWindow
        id={`player-${playerId}`}
        title="Loading Player Info..."
        isOpen={isOpen}
        onClose={onClose}
        initialPosition={initialPosition}
        initialSize={{ width: 650, height: 550 }}
      >
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ResizableWindow>
    );
  }

  // Show error state
  if (error || !player) {
    return (
      <ResizableWindow
        id={`player-${playerId}`}
        title="Player Not Found"
        isOpen={isOpen}
        onClose={onClose}
        initialPosition={initialPosition}
        initialSize={{ width: 650, height: 550 }}
      >
        <div className="flex flex-col items-center justify-center h-64">
          <p className="text-destructive">Could not find player data.</p>
          <Button onClick={onClose} className="mt-4">Close</Button>
        </div>
      </ResizableWindow>
    );
  }
  
  // Helper function to get the current punishment type
  const getCurrentPunishmentType = () => {
    if (!playerInfo.selectedPunishmentCategory) return null;
    
    // Search in all categories
    const allTypes = [
      ...punishmentTypesByCategory.Administrative,
      ...punishmentTypesByCategory.Social,
      ...punishmentTypesByCategory.Gameplay
    ];
    
    return allTypes.find(type => type.name === playerInfo.selectedPunishmentCategory);
  };

  // Helper function to find punishment type for a given warning
  const findPunishmentTypeForWarning = (warning: any) => {
    if (!warning.type) return null;
    
    // Search in all categories
    const allTypes = [
      ...punishmentTypesByCategory.Administrative,
      ...punishmentTypesByCategory.Social,
      ...punishmentTypesByCategory.Gameplay
    ];
    
    return allTypes.find(type => type.name === warning.type);
  };

  // Helper function to get original punishment action (ban/mute/kick) for display
  const getOriginalPunishmentAction = (warning: any, punishmentType: any) => {
    // Check for explicit action types first
    if (warning.type?.toLowerCase().includes('kick')) return 'kick';
    if (warning.type?.toLowerCase().includes('mute')) return 'mute';
    if (warning.type?.toLowerCase().includes('ban') || warning.type?.toLowerCase().includes('blacklist')) return 'ban';
    
    // If we have punishment type configuration, look up the actual action based on duration data
    if (punishmentType && warning) {
      // Get the severity and status from the punishment data
      const severity = warning.severity || warning.data?.severity;
      const status = warning.status || warning.data?.status;
      const originalDuration = warning.duration || warning.data?.duration;
      
      // For single severity punishments, check singleSeverityDurations
      if (punishmentType.singleSeverityPunishment && punishmentType.singleSeverityDurations) {
        const offenseLevel = status === 'low' ? 'first' : status === 'medium' ? 'medium' : 'habitual';
        const durationConfig = punishmentType.singleSeverityDurations[offenseLevel];
        if (durationConfig && durationConfig.type) {
          return durationConfig.type; // This will be 'mute', 'ban', 'permanent mute', or 'permanent ban'
        }
      }
      
      // For multi-severity punishments, check durations
      if (punishmentType.durations && severity) {
        const severityKey = severity === 'lenient' ? 'low' : severity === 'regular' ? 'regular' : 'severe';
        const offenseLevel = status === 'low' ? 'first' : status === 'medium' ? 'medium' : 'habitual';
        const durationConfig = punishmentType.durations[severityKey]?.[offenseLevel];
        if (durationConfig && durationConfig.type) {
          return durationConfig.type; // This will be 'mute', 'ban', 'permanent mute', or 'permanent ban'
        }
      }
      
      // If we can't determine from configuration, check if it's permanent based on duration
      if (originalDuration === 0 || originalDuration === -1 || originalDuration < 0) {
        // Default to permanent ban for permanent punishments if we can't determine otherwise
        return 'permanent ban';
      }
    }
    
    // Check if the punishment type has an action property
    if (punishmentType?.action) {
      return punishmentType.action;
    }
    
    // For other punishment types with durations, default to ban
    if (punishmentType?.durations || punishmentType?.singleSeverityDurations) {
      return 'ban';
    }
    
    return 'punishment';
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

  // Helper function to format punishment preview
  const getPunishmentPreview = () => {
    const punishmentType = getCurrentPunishmentType();
    if (!punishmentType) return '';
    
    // Determine if this is a ban or mute action
    const getBanOrMuteAction = (typeName: string, punishmentType: any) => {
      // Check for explicit ban/mute in the name
      if (typeName.toLowerCase().includes('mute')) return 'Mute';
      if (typeName.toLowerCase().includes('ban') || typeName.toLowerCase().includes('blacklist')) return 'Ban';
      
      // Check if the punishment type has an action property
      if (punishmentType.action) {
        return punishmentType.action === 'ban' ? 'Ban' : 
               punishmentType.action === 'mute' ? 'Mute' : null;
      }
      
      // For other punishment types, check for duration-based actions
      // If it has durations, it's likely a ban or mute (most gameplay punishments are bans)
      if (punishmentType.durations || punishmentType.singleSeverityDurations) {
        return 'Ban'; // Default assumption for most punishment types
      }
      
      return null;
    };
    
    const action = getBanOrMuteAction(punishmentType.name, punishmentType);
    let preview = action ? `${action} - ${punishmentType.name}` : punishmentType.name;
    
    if (punishmentType.singleSeverityPunishment) {
      if (punishmentType.singleSeverityDurations) {
        // For single-severity punishments, use the selected offense level or default to 'first'
        const offenseLevel = playerInfo.selectedOffenseLevel || 'first';
        const duration = punishmentType.singleSeverityDurations[offenseLevel];
        if (duration) {
          preview += ` (${duration.value} ${duration.unit})`;
        }
      }
    } else if (punishmentType.durations && playerInfo.selectedSeverity) {
      const severityKey = playerInfo.selectedSeverity === 'Lenient' ? 'low' : 
                         playerInfo.selectedSeverity === 'Regular' ? 'regular' : 'severe';
      const duration = punishmentType.durations[severityKey]?.first;
      if (duration) {
        preview += ` (${duration.value} ${duration.unit})`;
      }
    }
    
    // For administrative punishments with manual duration settings
    if (['Manual Mute', 'Manual Ban'].includes(punishmentType.name) && playerInfo.duration) {
      if (playerInfo.isPermanent) {
        preview += ' (Permanent)';
      } else if (playerInfo.duration.value) {
        preview += ` (${playerInfo.duration.value} ${playerInfo.duration.unit})`;
      }
    }
    
    const options = [];
    if (playerInfo.altBlocking && punishmentType.canBeAltBlocking) options.push('Alt-blocking');
    if (playerInfo.statWiping && punishmentType.canBeStatWiping) options.push('Stat-wiping');
    if (playerInfo.silentPunishment) options.push('Silent');
    
    if (options.length > 0) {
      preview += ` [${options.join(', ')}]`;
    }
      return preview;
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

  // Helper function to calculate effective punishment status and expiry based on modifications
  const getEffectivePunishmentState = (punishment: any) => {
    const modifications = punishment.modifications || [];
    const originalExpiry = punishment.expires || punishment.data?.expires;
    const originalDuration = punishment.duration || punishment.data?.duration;
    const originalActive = punishment.active !== undefined ? punishment.active : (punishment.data?.active !== false);
    
    let effectiveActive = originalActive;
    let effectiveExpiry = originalExpiry;
    let effectiveDuration = originalDuration;
    
    // Apply modifications in chronological order
    const sortedModifications = modifications.sort((a: any, b: any) => {
      const dateA = a.issued ? new Date(a.issued) : new Date(0);
      const dateB = b.issued ? new Date(b.issued) : new Date(0);
      return dateA.getTime() - dateB.getTime();
    });
    
    for (const mod of sortedModifications) {
      if (mod.type === 'MANUAL_PARDON' || mod.type === 'APPEAL_ACCEPT') {
        effectiveActive = false;      } else if (mod.type === 'MANUAL_DURATION_CHANGE' || mod.type === 'APPEAL_DURATION_CHANGE') {
        if (mod.effectiveDuration !== undefined) {
          effectiveDuration = mod.effectiveDuration;
          
          // For duration modifications, calculate expiry from the modification's issued time
          const modificationTime = mod.issued;
          
          // Convert modificationTime to Date object if it's a string
          let modDate;
          if (modificationTime instanceof Date) {
            modDate = modificationTime;
          } else if (typeof modificationTime === 'string') {
            modDate = new Date(modificationTime);
          } else {
            // Fallback to current date if modificationTime is invalid
            console.warn('Invalid modification time, using current date as fallback:', modificationTime);
            modDate = new Date();
          }
          
          // Validate the modDate
          if (isNaN(modDate.getTime())) {
            console.warn('Invalid modification date calculated, using current date as fallback:', modDate);
            modDate = new Date();
          }
            if (mod.effectiveDuration === 0 || mod.effectiveDuration === -1 || mod.effectiveDuration < 0) {
            effectiveExpiry = null; // Permanent
            effectiveActive = true; // Permanent punishments are always active
          } else {
            effectiveExpiry = new Date(modDate.getTime() + mod.effectiveDuration);
            // Update active status based on whether the new expiry is in the future
            const now = new Date();
            effectiveActive = effectiveExpiry.getTime() > now.getTime();
          }
        }
      }
    }
    
    // Check if unmodified punishment has expired
    if (modifications.length === 0 && effectiveExpiry) {
      const now = new Date();
      const expiryDate = new Date(effectiveExpiry);
      if (!isNaN(expiryDate.getTime()) && expiryDate.getTime() <= now.getTime()) {
        effectiveActive = false;
      }
    }
    
    return {
      originalActive,
      originalExpiry,
      originalDuration,
      effectiveActive,
      effectiveExpiry,
      effectiveDuration,
      hasModifications: modifications.length > 0,
      modifications: sortedModifications
    };
  };
  // Helper function to format duration from milliseconds
  const formatDuration = (durationMs: number) => {
    if (durationMs === 0 || durationMs === -1 || durationMs < 0) return 'Permanent';
    
    const days = Math.floor(durationMs / (24 * 60 * 60 * 1000));
    const hours = Math.floor((durationMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((durationMs % (60 * 60 * 1000)) / (60 * 1000));
    const seconds = Math.floor((durationMs % (60 * 1000)) / 1000);
    
    if (days > 0) {
      return `${days}d${hours > 0 ? ` ${hours}h` : ''}`;
    } else if (hours > 0) {
      return `${hours}h${minutes > 0 && hours < 24 ? ` ${minutes}m` : ''}`;
    } else if (minutes > 0) {
      return `${minutes}m${seconds > 0 && minutes < 60 ? ` ${seconds}s` : ''}`;
    } else {
      return `${seconds}s`;
    }
  };

  
  return (
    <ResizableWindow
      id={`player-${playerId}`}
      title={playerInfo.username}
      isOpen={isOpen}
      onClose={onClose}
      onRefresh={() => {
        refetch();
        refetchLinkedAccounts();
      }}
      isRefreshing={isFetching || isLoadingLinkedAccounts}
      initialPosition={initialPosition}
      initialSize={{ width: 650, height: 550 }}
    >
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
                    <span className="text-muted-foreground">{playerInfo.status === 'Online' ? 'Current Server:' : 'Last Server:'}</span>
                    <span className="ml-1">{playerInfo.lastServer}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <Tabs defaultValue="history" className="w-full" onValueChange={setActiveTab}>
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
          
          <TabsContent value="history" className="space-y-2 mx-1 mt-3">
            <h4 className="font-medium">Player History</h4>
            <div className="space-y-2">              {playerInfo.warnings.length > 0 ? playerInfo.warnings.map((warning, index) => {
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
                
                return (                  <div 
                    key={warning.id || `warning-${index}`} 
                    data-punishment-id={warning.id}
                    className={`${
                      isPunishmentCurrentlyActive(warning, effectiveState) && warning.type !== 'Kick' ? 'bg-muted/30 border-l-4 border-red-500' : 
                      'bg-muted/30'
                    } p-3 rounded-lg transition-all duration-300`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">                        <div className="flex items-center gap-2 mb-1">
                          {/* Show punishment status: Active, Inactive, Pardoned, or Unstarted (but not for kicks) */}
                          {isPunishment && warning.type !== 'Kick' && (() => {
                            // Check if punishment is unstarted (started field is null/undefined)
                            if (!warning.started) {
                              return (
                                <Badge variant="outline" className="text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700">
                                  Unstarted
                                </Badge>
                              );
                            }
                            
                            // Check if punishment is inactive (based on effective state)
                            const effectiveState = getEffectivePunishmentState(warning);
                            const isInactive = !effectiveState.effectiveActive;
                            
                            // Check if punishment is pardoned
                            const pardonModification = effectiveState.modifications.find((mod: any) => 
                              mod.type === 'MANUAL_PARDON' || mod.type === 'APPEAL_ACCEPT'
                            );
                            
                            if (pardonModification) {
                              return (
                                <Badge variant="outline" className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-700">
                                  Pardoned
                                </Badge>
                              );
                            }
                            
                            if (isInactive) {
                              return (
                                <Badge variant="outline" className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600">
                                  Inactive
                                </Badge>
                              );
                            }
                            
                            // Punishment is active
                            return (
                              <Badge variant="outline" className="text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 border-green-300 dark:border-green-700">
                                Active
                              </Badge>
                            );
                          })()}
                          <Badge variant="outline" className="bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600">
                            {warning.type}
                          </Badge>
                          {warning.altBlocking && (
                            <Badge variant="outline" className="text-xs bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 border-orange-200 dark:border-orange-700">
                              Alt-blocking
                            </Badge>
                          )}
                          {isValidBadgeValue(warning.severity) && (
                            <Badge variant="outline" className={`text-xs ${
                              (warning.severity && warning.severity.toLowerCase() === 'low') || (warning.severity && warning.severity.toLowerCase() === 'lenient') ?
                                'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 border-green-300 dark:border-green-700' :
                              (warning.severity && warning.severity.toLowerCase() === 'regular') || (warning.severity && warning.severity.toLowerCase() === 'medium') ?
                                'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 border-orange-300 dark:border-orange-700' :
                                'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700'
                            }`}>
                              {mapSeverityForDisplay(warning.severity)}
                            </Badge>
                          )}
                          {isValidBadgeValue(warning.status) &&
                           !['active', 'inactive', 'unstarted', 'pardoned'].includes(warning.status?.toLowerCase?.() || '') && (
                            <Badge variant="outline" className={`text-xs ${
                              (warning.status && warning.status.toLowerCase() === 'low') || (warning.status && warning.status.toLowerCase() === 'first') ?
                                'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 border-green-300 dark:border-green-700' :
                              warning.status && warning.status.toLowerCase() === 'medium' ?
                                'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 border-orange-300 dark:border-orange-700' :
                                'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700'
                            }`}>
                              {warning.status}
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm mt-1 space-y-1">
                          <p>{warning.reason}</p>
                          
                          {/* Show expiry/duration information with full date and time format */}
                          <div className="text-xs">
                            {(() => {
                              // Don't show expiry countdown for unstarted punishments
                              if (isPunishment && !warning.started) {
                                return (
                                  <div className="text-muted-foreground">
                                    Waiting for server execution
                                  </div>
                                );
                              }
                              // Helper function to format time difference
                              const formatTimeDifference = (timeDiff: number) => {
                                const days = Math.floor(Math.abs(timeDiff) / (24 * 60 * 60 * 1000));
                                const hours = Math.floor((Math.abs(timeDiff) % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
                                const minutes = Math.floor((Math.abs(timeDiff) % (60 * 60 * 1000)) / (60 * 1000));
                                
                                if (days > 0) {
                                  return `${days}d${hours > 0 ? ` ${hours}h` : ''}`;
                                } else if (hours > 0) {
                                  return `${hours}h${minutes > 0 && hours < 24 ? ` ${minutes}m` : ''}`;
                                } else {
                                  return `${minutes}m`;
                                }                              };

                              // Check if punishment is inactive/pardoned
                              const pardonModification = effectiveState.modifications.find((mod: any) => 
                                mod.type === 'MANUAL_PARDON' || mod.type === 'APPEAL_ACCEPT'
                              );
                              
                              // Check if punishment is inactive (either pardoned or naturally expired/inactive)
                              const isInactive = !effectiveState.effectiveActive;
                              
                              if (pardonModification) {
                                // Calculate time since pardoned
                                if (pardonModification.issued) {
                                  const pardonDate = new Date(pardonModification.issued);
                                  if (!isNaN(pardonDate.getTime())) {
                                    const now = new Date();
                                    const timeDiff = now.getTime() - pardonDate.getTime();
                                    const timeAgo = formatTimeDifference(timeDiff);
                                    
                                    return (
                                      <div className="text-muted-foreground">
                                        expired {timeAgo} ago ({formatDateWithTime(pardonDate)})
                                      </div>
                                    );
                                  }
                                }
                                return (
                                  <div className="text-muted-foreground">
                                    expired (pardoned)
                                  </div>
                                );
                              } else if (isInactive && warning.expires) {
                                // For other inactive punishments, calculate time since natural expiry
                                const expiryDate = new Date(warning.expires);
                                
                                if (!isNaN(expiryDate.getTime())) {
                                  const now = new Date();
                                  const timeDiff = now.getTime() - expiryDate.getTime();
                                  
                                  if (timeDiff > 0) {
                                    const timeAgo = formatTimeDifference(timeDiff);
                                  
                                    return (
                                      <div className="text-muted-foreground">
                                        expired {timeAgo} ago ({formatDateWithTime(expiryDate)})
                                      </div>
                                    );
                                  }
                                }
                              } else if (effectiveState.hasModifications && effectiveState.effectiveExpiry) {
                                /* Show modified/effective expiry - this takes priority over duration display */
                                const expiryDate = new Date(effectiveState.effectiveExpiry);
                                
                                // Check if the date is valid
                                if (isNaN(expiryDate.getTime())) {
                                  console.error('Invalid effective expiry date for punishment:', {
                                    punishmentId: warning.id,
                                    effectiveExpiry: effectiveState.effectiveExpiry,
                                    effectiveExpiryType: typeof effectiveState.effectiveExpiry,
                                    modifications: effectiveState.modifications,
                                    originalExpiry: effectiveState.originalExpiry,
                                    originalExpired: effectiveState.originalExpiry ? new Date(effectiveState.originalExpiry) : null
                                  });
                                  return (
                                    <div className="text-muted-foreground">
                                      Invalid expiry date (modified)
                                    </div>
                                  );
                                }
                                  const now = new Date();
                                const timeDiff = expiryDate.getTime() - now.getTime();
                                
                                if (timeDiff > 0) {
                                  const timeLeft = formatTimeDifference(timeDiff);
                                  return (
                                    <div className="text-muted-foreground">
                                      expires in {timeLeft} ({formatDateWithTime(expiryDate)})
                                    </div>
                                  );
                                } else {
                                  const timeAgo = formatTimeDifference(-timeDiff);
                                  return (
                                    <div className="text-muted-foreground">
                                      expired {timeAgo} ago ({formatDateWithTime(expiryDate)})
                                    </div>
                                  );
                                }
                              } else if (effectiveState.hasModifications && effectiveState.effectiveDuration !== undefined && effectiveState.effectiveDuration !== null && !effectiveState.effectiveExpiry) {
                                /* Show modified duration only when we don't have an effective expiry */
                                return (
                                  <div className="text-muted-foreground">
                                    {(effectiveState.effectiveDuration === 0 || effectiveState.effectiveDuration === -1 || effectiveState.effectiveDuration < 0) ? 'Permanent' : `Duration: ${formatDuration(effectiveState.effectiveDuration)}`}
                                  </div>
                                );} else if (warning.expires) {
                                /* Show original expiry for unmodified punishments */
                                const expiryDate = new Date(warning.expires);
                                
                                // Check if the date is valid
                                if (isNaN(expiryDate.getTime())) {
                                  console.error('Invalid original expiry date for punishment:', {
                                    punishmentId: warning.id,
                                    expires: warning.expires,
                                    expiresType: typeof warning.expires
                                  });
                                  return (
                                    <div className="text-muted-foreground">
                                      Invalid expiry date (original)
                                    </div>
                                  );
                                }
                                
                                const now = new Date();
                                const timeDiff = expiryDate.getTime() - now.getTime();
                                
                                if (timeDiff > 0) {
                                  const timeLeft = formatTimeDifference(timeDiff);
                                  return (
                                    <div className="text-muted-foreground">
                                      expires in {timeLeft} ({formatDateWithTime(expiryDate)})
                                    </div>
                                  );
                                } else {
                                  const timeAgo = formatTimeDifference(-timeDiff);
                                  return (
                                    <div className="text-muted-foreground">
                                      expired {timeAgo} ago ({formatDateWithTime(expiryDate)})
                                    </div>
                                  );
                                }
                              }
                              
                              // Default case - should not reach here but ensures all paths return
                              return null;
                            })()}
                          </div>
                        </div>
                      </div>                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-muted-foreground">{warning.date}</span>
                        {warning.id && warning.id !== '0' && String(warning.id) !== '0' && (
                          <span className="text-xs text-muted-foreground">ID: {warning.id}</span>
                        )}
                        {isPunishment && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="p-0 h-6 w-6"
                            onClick={() => {
                              const id = warning.id || `warning-${index}`;
                              const newExpanded = new Set(expandedPunishments);
                              if (isExpanded) {
                                newExpanded.delete(id);
                              } else {
                                newExpanded.add(id);
                              }
                              setExpandedPunishments(newExpanded);
                            }}
                          >
                            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-muted-foreground">
                        By: {warning.by}
                        {warning.data?.issuedServer && (
                          <span className="ml-1">on {warning.data.issuedServer}</span>
                        )}
                        {(() => {
                          // Get the original punishment type and action
                          const punishmentType = findPunishmentTypeForWarning(warning);
                          const originalAction = getOriginalPunishmentAction(warning, punishmentType);
                          const originalDuration = effectiveState.originalDuration;
                          
                          // Always show the original duration and action type
                          if (originalDuration !== undefined && originalDuration !== null) {
                            const durationText = (originalDuration === 0 || originalDuration === -1 || originalDuration < 0) ? 'permanent' : formatDuration(originalDuration);
                            return (
                              <span className="ml-2 opacity-60">
                                ({durationText} {originalAction})
                              </span>
                            );
                          } else if (originalAction && originalAction !== 'punishment') {
                            return (
                              <span className="ml-2 opacity-60">
                                ({originalAction})
                              </span>
                            );
                          }
                          
                          return null;
                        })()}
                      </p>
                    </div>
                      {/* Expanded details */}
                    {isPunishment && isExpanded && (
                      <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
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
                                } else if (typeof evidenceItem === 'object') {
                                  // New object format - backend uses: text, url, type, uploadedBy, uploadedAt, fileName, fileType, fileSize
                                  evidenceText = evidenceItem.text || '';
                                  // Support both old field names (issuerName/date) and new field names (uploadedBy/uploadedAt)
                                  const issuer = evidenceItem.uploadedBy || evidenceItem.issuerName || 'System';
                                  const dateValue = evidenceItem.uploadedAt || evidenceItem.date;
                                  const date = dateValue ? formatDateWithTime(dateValue) : 'Unknown';
                                  issuerInfo = `By: ${issuer} on ${date}`;
                                  evidenceType = evidenceItem.type || 'text';
                                  // Support both old field name (fileUrl) and new field name (url)
                                  fileUrl = evidenceItem.url || evidenceItem.fileUrl || '';
                                  fileName = evidenceItem.fileName || '';
                                  fileType = evidenceItem.fileType || '';

                                  // If no text but has url, use url as display text for URL type evidence
                                  if (!evidenceText && fileUrl && evidenceType === 'url') {
                                    evidenceText = fileUrl;
                                  }
                                }
                                
                                // Helper function to detect media type from URL
                                const getMediaType = (url: string) => {
                                  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
                                  const videoExts = ['.mp4', '.webm', '.mov'];
                                  const urlLower = url.toLowerCase();
                                  
                                  if (imageExts.some(ext => urlLower.includes(ext))) return 'image';
                                  if (videoExts.some(ext => urlLower.includes(ext))) return 'video';
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
                                                className="text-blue-600 hover:text-blue-800 underline"
                                              >
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
                                                className="max-w-full max-h-48 rounded border"
                                                style={{ maxWidth: '300px' }}
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
                                            {mediaType === 'link' && (
                                              <a 
                                                href={fileUrl} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:text-blue-800 underline break-all"
                                              >
                                                Download File
                                              </a>
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
                                    // Replace # with ID- for URL compatibility
                                    const urlSafeTicketId = ticketId.replace('#', 'ID-');
                                    setLocation(`/panel/tickets/${urlSafeTicketId}`);
                                  }}
                                >
                                  <Ticket className="h-3 w-3 mr-1" />
                                  {ticketId}
                                </Button>
                              ))}
                            </div>
                          </div>                        )}

                        {/* Linked Bans Display */}
                        {warning.data?.altBlocking && (
                          <LinkedBansDisplay punishmentId={warning.id} onPlayerClick={(uuid: string) => {
                            // Open a new PlayerWindow for the linked player
                            if (typeof window !== 'undefined') {
                              // Navigate to player detail page
                              setLocation(`/panel/player/${uuid}`);
                            }
                          }} />
                        )}

                        {/* Modification History */}
                        {effectiveState.hasModifications && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Modification History:</p>                            <div className="space-y-1">
                              {effectiveState.modifications.map((mod: any, idx: number) => (
                                <div key={idx} className="bg-muted/20 p-2 rounded text-xs border-l-2 border-blue-500">
                                  <div className="flex justify-between items-start mb-1">
                                    <Badge variant="outline" className="text-xs bg-blue-500/10 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30 dark:border-blue-500/40">
                                      {mod.type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (l: string) => l.toUpperCase())}
                                    </Badge>
                                    <span className="text-muted-foreground text-xs">
                                      {formatDateWithTime(mod.date)}
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
                                  <div className="flex items-center justify-between">
                                    <p className="text-muted-foreground text-xs">
                                      By: {mod.issuerName}
                                    </p>
                                    {mod.appealTicketId && (mod.type?.includes('APPEAL')) && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-6 px-2 text-xs"
                                        onClick={() => openWindow('ticket', { ticketId: mod.appealTicketId })}
                                      >
                                        <Link2 className="h-3 w-3 mr-1" />
                                        View Appeal
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {warning.data && Object.keys(warning.data).length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Additional Data:</p>
                            <div className="text-xs bg-muted/20 p-2 rounded font-mono">
                              {Object.entries(warning.data).map(([key, value]) => (
                                <div key={key}>
                                  <span className="text-muted-foreground">{key}:</span> {
                                    value === null ? 'null' :
                                    value === undefined ? 'undefined' :
                                    value === 0 ? '0' :
                                    value === '' ? '(empty)' :
                                    typeof value === 'object' ? JSON.stringify(value) : 
                                    String(value)
                                  }
                                </div>
                              ))}
                            </div>
                          </div>
                        )}                        {/* Action buttons - only show for punishments with IDs */}
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
                            Modify                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => {
                              const id = warning.id || `warning-${index}`;
                              setPlayerInfo(prev => ({
                                ...prev,
                                isModifyingTickets: true,
                                modifyTicketsTarget: id,
                                modifyTicketsAssociated: true,
                                modifyTicketsAdd: [],
                                modifyTicketsRemove: [],
                              }));
                            }}
                          >
                            <Ticket className="h-3 w-3 mr-1" />
                            Tickets
                          </Button>
                        </div>
                        )}                        {/* Add Note Form */}
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
                                    try {                                    await addPunishmentNote.mutateAsync({
                                      uuid: playerId,
                                      punishmentId: warning.id!,
                                      noteText: playerInfo.newPunishmentNote
                                    });
                                      toast({
                                      title: "Note added",
                                      description: "Note has been added to the punishment successfully"
                                    });
                                    
                                    // Refetch player data to update the UI
                                    refetch();
                                    
                                    // Reset form
                                    setPlayerInfo(prev => ({
                                      ...prev,
                                      isAddingPunishmentNote: false,
                                      punishmentNoteTarget: null,
                                      newPunishmentNote: ''
                                    }));
                                  } catch (error) {
                                    console.error('Error adding note to punishment:', error);
                                    toast({
                                      title: "Failed to add note",
                                      description: error instanceof Error ? error.message : "An unknown error occurred",
                                      variant: "destructive"
                                    });
                                  }
                                }}
                              >
                                Add Note
                              </Button>
                            </div>
                          </div>                        )}

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
                                  // Don't allow editing if a file is uploaded
                                  if (playerInfo.uploadedEvidenceFile) return;
                                  setPlayerInfo(prev => ({...prev, newPunishmentEvidence: e.target.value}));
                                }}
                                readOnly={!!playerInfo.uploadedEvidenceFile}
                              />
                              
                              {/* Upload button */}
                              <MediaUpload
                                uploadType="evidence"
                                onUploadComplete={(result, file) => {
                                  // Store the uploaded file info
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
                                      // File evidence - use 'url' field to match backend AddEvidenceRequest
                                      evidenceData = {
                                        text: playerInfo.uploadedEvidenceFile.fileName,
                                        issuerName: user?.minecraftUsername || user?.username || 'Admin',
                                        type: 'file',
                                        url: playerInfo.uploadedEvidenceFile.url,
                                        fileName: playerInfo.uploadedEvidenceFile.fileName,
                                        fileType: playerInfo.uploadedEvidenceFile.fileType,
                                        fileSize: playerInfo.uploadedEvidenceFile.fileSize
                                      };
                                    } else {
                                      // Text evidence - check if it's a URL
                                      const trimmedEvidence = playerInfo.newPunishmentEvidence.trim();
                                      const isUrl = trimmedEvidence.match(/^https?:\/\//);
                                      evidenceData = {
                                        text: trimmedEvidence,
                                        issuerName: user?.minecraftUsername || user?.username || 'Admin',
                                        type: isUrl ? 'url' : 'text',
                                        url: isUrl ? trimmedEvidence : null
                                      };
                                    }
                                    
                                    const csrfFetch = apiFetch;
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
                                      title: 'Evidence Added',
                                      description: `Evidence has been added to the punishment successfully`
                                    });
                                    
                                    // Refetch player data to update the UI
                                    refetch();
                                    
                                    // Reset form
                                    setPlayerInfo(prev => ({
                                      ...prev,
                                      isAddingPunishmentEvidence: false,
                                      punishmentEvidenceTarget: null,
                                      newPunishmentEvidence: '',
                                      uploadedEvidenceFile: null
                                    }));
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
                                  {(() => {
                                    const punishmentType = findPunishmentTypeForWarning(warning);
                                    const options = [];
                                    
                                    // Only show alt blocking options if punishment type supports it
                                    if (punishmentType?.canBeAltBlocking) {
                                      const currentAltBlocking = warning.altBlocking;
                                      if (!currentAltBlocking) {
                                        options.push(<option key="alt-true" value="SET_ALT_BLOCKING_TRUE">Enable Alt Blocking</option>);
                                      } else {
                                        options.push(<option key="alt-false" value="SET_ALT_BLOCKING_FALSE">Disable Alt Blocking</option>);
                                      }
                                    }
                                    
                                    // Only show stat wiping options if punishment type supports it
                                    if (punishmentType?.canBeStatWiping) {
                                      const currentStatWiping = warning.data?.wiping || warning.data?.statWiping || false;
                                      if (!currentStatWiping) {
                                        options.push(<option key="wipe-true" value="SET_WIPING_TRUE">Enable Wiping</option>);
                                      } else {
                                        options.push(<option key="wipe-false" value="SET_WIPING_FALSE">Disable Wiping</option>);
                                      }
                                    }
                                    
                                    return options;
                                  })()}
                                </select>
                              </div>
                                {playerInfo.selectedModificationType === 'MANUAL_DURATION_CHANGE' && (
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-xs text-muted-foreground">New Duration</label>
                                    <input
                                      type="number"
                                      min="0"
                                      className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                                      placeholder="Amount (0 for permanent)"
                                      value={playerInfo.newDuration?.value || ''}
                                      onChange={(e) => setPlayerInfo(prev => ({
                                        ...prev,
                                        newDuration: {
                                          ...prev.newDuration,
                                          value: parseInt(e.target.value) || 0,
                                          unit: prev.newDuration?.unit || 'minutes'
                                        }
                                      }))}
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-muted-foreground">Unit</label>
                                    <select
                                      className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                                      value={playerInfo.newDuration?.unit || 'minutes'}
                                      onChange={(e) => setPlayerInfo(prev => ({
                                        ...prev,
                                        newDuration: {
                                          ...prev.newDuration,
                                          value: prev.newDuration?.value || 1,
                                          unit: e.target.value as 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'
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
                            </div>
                            
                            <div className="mb-3">
                              <label className="text-xs text-muted-foreground">Reason</label>
                              <textarea
                                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm h-16 resize-none"
                                placeholder="Reason for modification..."
                                value={playerInfo.modifyPunishmentReason || ''}
                                onChange={(e) => setPlayerInfo(prev => ({...prev, modifyPunishmentReason: e.target.value}))}
                              />
                            </div>
                            
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPlayerInfo(prev => ({
                                  ...prev,
                                  isModifyingPunishment: false,
                                  modifyPunishmentTarget: null,
                                  modifyPunishmentAction: null,
                                  modifyPunishmentReason: '',
                                  selectedModificationType: null,
                                  newDuration: undefined
                                }))}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"                                disabled={!playerInfo.modifyPunishmentReason?.trim() || 
                                         !playerInfo.selectedModificationType ||
                                         (playerInfo.selectedModificationType === 'MANUAL_DURATION_CHANGE' && 
                                          playerInfo.newDuration?.value === undefined)}
                                onClick={async () => {                                  if (!playerInfo.modifyPunishmentReason?.trim() || !playerInfo.selectedModificationType) return;
                                  if (playerInfo.selectedModificationType === 'MANUAL_DURATION_CHANGE' && 
                                      playerInfo.newDuration?.value === undefined) return;
                                  
                                  try {                                    await modifyPunishment.mutateAsync({
                                      uuid: playerId,
                                      punishmentId: warning.id!,
                                      modificationType: playerInfo.selectedModificationType!,
                                      reason: playerInfo.modifyPunishmentReason!,
                                      newDuration: playerInfo.newDuration
                                    });
                                      toast({
                                      title: 'Punishment Modified',
                                      description: `Punishment has been modified successfully`
                                    });
                                    
                                    // Refetch player data to update the UI
                                    refetch();
                                    
                                    // Reset form
                                    setPlayerInfo(prev => ({
                                      ...prev,
                                      isModifyingPunishment: false,
                                      modifyPunishmentTarget: null,
                                      modifyPunishmentAction: null,
                                      modifyPunishmentReason: '',
                                      selectedModificationType: null,
                                      newDuration: undefined
                                    }));
                                  } catch (error) {
                                    console.error('Error modifying punishment:', error);
                                    toast({
                                      title: 'Failed to modify punishment',
                                      description: error instanceof Error ? error.message : "An unknown error occurred",
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

                        {/* Modify Tickets Form */}
                        {warning.id && playerInfo.isModifyingTickets && playerInfo.modifyTicketsTarget === (warning.id || `warning-${index}`) && (
                          <div className="mt-3 p-3 bg-muted/20 rounded-lg border">
                            <p className="text-xs font-medium mb-2">Modify Linked Tickets</p>

                            {/* Currently attached tickets */}
                            <div className="mb-3">
                              <label className="text-xs text-muted-foreground mb-1 block">Attached Tickets</label>
                              {(() => {
                                const currentIds = warning.attachedTicketIds || [];
                                const pendingAdd = playerInfo.modifyTicketsAdd || [];
                                const pendingRemove = playerInfo.modifyTicketsRemove || [];
                                const effectiveIds = [...currentIds.filter(id => !pendingRemove.includes(id)), ...pendingAdd];

                                if (effectiveIds.length === 0) {
                                  return <p className="text-xs text-muted-foreground italic">No tickets attached</p>;
                                }

                                return (
                                  <div className="space-y-1">
                                    {effectiveIds.map((ticketId) => {
                                      const ticket = (playerTickets || []).find((t: any) => (t.id || t._id) === ticketId);
                                      const isNewlyAdded = pendingAdd.includes(ticketId);
                                      return (
                                        <div key={ticketId} className={`flex items-center justify-between text-xs px-2 py-1 rounded ${isNewlyAdded ? 'bg-green-500/10 border border-green-500/20' : 'bg-muted/30'}`}>
                                          <span className="truncate mr-2">
                                            <Ticket className="h-3 w-3 inline mr-1" />
                                            {ticketId.slice(-8)}
                                            {ticket && ` - ${(ticket as any).category || (ticket as any).type || ''}`}
                                            {ticket && (
                                              <Badge variant="outline" className="ml-1 text-[10px] py-0 px-1">
                                                {(ticket as any).locked ? 'Closed' : 'Open'}
                                              </Badge>
                                            )}
                                          </span>
                                          <button
                                            className="text-destructive hover:text-destructive/80 flex-shrink-0"
                                            onClick={() => {
                                              if (isNewlyAdded) {
                                                setPlayerInfo(prev => ({
                                                  ...prev,
                                                  modifyTicketsAdd: (prev.modifyTicketsAdd || []).filter(id => id !== ticketId)
                                                }));
                                              } else {
                                                setPlayerInfo(prev => ({
                                                  ...prev,
                                                  modifyTicketsRemove: [...(prev.modifyTicketsRemove || []), ticketId]
                                                }));
                                              }
                                            }}
                                          >
                                            <X className="h-3 w-3" />
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                            </div>

                            {/* Available tickets to add */}
                            <div className="mb-3">
                              <label className="text-xs text-muted-foreground mb-1 block">Add Tickets</label>
                              {(() => {
                                const currentIds = warning.attachedTicketIds || [];
                                const pendingAdd = playerInfo.modifyTicketsAdd || [];
                                const pendingRemove = playerInfo.modifyTicketsRemove || [];
                                const effectiveIds = [...currentIds.filter(id => !pendingRemove.includes(id)), ...pendingAdd];
                                const available = (playerTickets || []).filter((t: any) =>
                                  !effectiveIds.includes(t.id || t._id) &&
                                  t.reportedPlayerUuid === playerId &&
                                  !t.locked
                                );

                                if (available.length === 0) {
                                  return <p className="text-xs text-muted-foreground italic">No open reports available for this player</p>;
                                }

                                return (
                                  <div className="space-y-1 max-h-32 overflow-y-auto">
                                    {available.map((ticket: any) => {
                                      const ticketId = ticket.id || ticket._id;
                                      return (
                                        <div key={ticketId} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-muted/30 hover:bg-muted/50 cursor-pointer"
                                          onClick={() => {
                                            setPlayerInfo(prev => ({
                                              ...prev,
                                              modifyTicketsAdd: [...(prev.modifyTicketsAdd || []), ticketId]
                                            }));
                                          }}
                                        >
                                          <span className="truncate mr-2">
                                            <Ticket className="h-3 w-3 inline mr-1" />
                                            {ticketId.slice(-8)}
                                            {` - ${ticket.category || ticket.type || ''}`}
                                          </span>
                                          <Plus className="h-3 w-3 text-green-500 flex-shrink-0" />
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                            </div>

                            {/* Toggle for modifying associated tickets */}
                            <label className="flex items-center gap-2 text-xs mb-3 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={playerInfo.modifyTicketsAssociated ?? true}
                                onChange={(e) => setPlayerInfo(prev => ({...prev, modifyTicketsAssociated: e.target.checked}))}
                                className="rounded border-border"
                              />
                              <span>Modify associated tickets (close added / reopen removed)</span>
                            </label>

                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPlayerInfo(prev => ({
                                  ...prev,
                                  isModifyingTickets: false,
                                  modifyTicketsTarget: null,
                                  modifyTicketsAdd: [],
                                  modifyTicketsRemove: [],
                                }))}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                disabled={
                                  ((playerInfo.modifyTicketsAdd || []).length === 0 && (playerInfo.modifyTicketsRemove || []).length === 0) ||
                                  modifyPunishmentTickets.isPending
                                }
                                onClick={async () => {
                                  try {
                                    await modifyPunishmentTickets.mutateAsync({
                                      uuid: playerId,
                                      punishmentId: warning.id!,
                                      addTicketIds: playerInfo.modifyTicketsAdd || [],
                                      removeTicketIds: playerInfo.modifyTicketsRemove || [],
                                      modifyAssociatedTickets: playerInfo.modifyTicketsAssociated ?? true
                                    });
                                    toast({
                                      title: 'Tickets Updated',
                                      description: 'Punishment ticket associations have been updated'
                                    });
                                    refetch();
                                    setPlayerInfo(prev => ({
                                      ...prev,
                                      isModifyingTickets: false,
                                      modifyTicketsTarget: null,
                                      modifyTicketsAdd: [],
                                      modifyTicketsRemove: [],
                                    }));
                                  } catch (error) {
                                    console.error('Error modifying punishment tickets:', error);
                                    toast({
                                      title: 'Failed to modify tickets',
                                      description: error instanceof Error ? error.message : "An unknown error occurred",
                                      variant: "destructive"
                                    });
                                  }
                                }}
                              >
                                {modifyPunishmentTickets.isPending ? (
                                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Applying...</>
                                ) : (
                                  'Apply Changes'
                                )}
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
            <h4 className="font-medium">Connected Accounts</h4>
            <p className="text-xs text-muted-foreground mb-3">
              Accounts sharing IPs (excluding proxy/hosting IPs unless within 6 hours of each other)
            </p>
            <div className="bg-muted/30 p-3 rounded-lg">
              {/* Show error if linked account search failed */}
              {findLinkedAccountsMutation.isError && (
                <div className="text-sm text-destructive mb-3 p-2 bg-destructive/10 rounded border border-destructive/20">
                  <TriangleAlert className="h-4 w-4 inline mr-2" />
                  Failed to search for linked accounts. Please try reopening the player window.
                </div>
              )}
              
              {/* Show loading state for linked accounts search */}
              {findLinkedAccountsMutation.isPending && (
                <div className="text-sm text-muted-foreground mb-3 p-2 bg-muted/20 rounded flex items-center">
                  <Loader2 className="h-4 w-4 inline mr-2 animate-spin" />
                  Searching for linked accounts...
                </div>
              )}
              
              <ul className="space-y-2">
                {playerInfo.linkedAccounts.length > 0 ? (
                  playerInfo.linkedAccounts.map((account, idx) => (
                    <li key={idx} className="text-sm flex items-center">
                      <Link2 className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                      <ClickablePlayer 
                        playerText={account}
                        showIcon={true}
                        className="text-sm"
                      >
                        {account}
                      </ClickablePlayer>
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-muted-foreground">
                    {findLinkedAccountsMutation.isPending ? 
                      'Searching...' : 
                      'No linked accounts found'
                    }
                  </li>
                )}
              </ul>
            </div>
          </TabsContent>
          
          <TabsContent value="notes" className="space-y-2 mx-1 mt-3">
            <h4 className="font-medium">Staff Notes</h4>
            <p className="text-xs text-muted-foreground mb-3">
              Staff notes are administrative comments about this player.
            </p>
            <div className="bg-muted/30 p-3 rounded-lg">
              <ul className="space-y-2">
                {(playerInfo.notes || []).length > 0 ? (
                  (playerInfo.notes || []).map((note, idx) => (
                    <li key={idx} className="text-sm flex items-start">
                      <StickyNote className="h-3.5 w-3.5 mr-2 mt-0.5 text-muted-foreground" />
                      <span>{typeof note === 'string' ? note : note.text}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-muted-foreground">No staff notes</li>
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
                          const csrfFetch = apiFetch;
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
                            notes: [...(prev.notes || []), newNoteWithMetadata],
                            isAddingNote: false,
                            newNote: ''
                          }));
                          
                          // Force a refetch to get the latest data
                          refetch(); // Refetch player data after adding note
                        } catch (error) {
                          toast({
                            title: "Error",
                            description: "Failed to add note. Please try again.",
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      Save Note
                    </Button>
                  </div>
                </div>
              )}
            </div>
            
            {!playerInfo.isAddingNote && (
              <Button 
                size="sm" 
                variant="outline" 
                className="mt-2"
                onClick={() => setPlayerInfo(prev => ({...prev, isAddingNote: true}))}
              >
                <StickyNote className="h-3.5 w-3.5 mr-1" /> Add Note
              </Button>
            )}
          </TabsContent>
          
          <TabsContent value="tickets" className="space-y-2 mx-1 mt-3">
            <h4 className="font-medium">Player Tickets</h4>
            {isLoadingTickets ? (
              <div className="bg-muted/30 p-3 rounded-lg flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-sm">Loading tickets...</span>
              </div>
            ) : playerTickets && playerTickets.length > 0 ? (
              <div className="space-y-2">
                {playerTickets.map((ticket: any) => {
                  // Determine if this player created the ticket or is the reported player
                  const isCreator = ticket.creatorUuid === playerId;
                  const isReported = ticket.reportedPlayerUuid === playerId;
                  
                  return (
                    <div
                      key={ticket.id || ticket._id}
                      className="bg-muted/30 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors duration-200"
                      onClick={() => handleTicketClick(ticket.id || ticket._id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Ticket className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-medium text-sm">{ticket.id || ticket._id}</span>
                            <Badge variant={ticket.status === 'Open' ? 'destructive' : ticket.status === 'Closed' ? 'secondary' : 'default'} className="text-xs">
                              {ticket.status}
                            </Badge>
                            {/* Show badge indicating player's role in the ticket */}
                            {isCreator && (
                              <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700">
                                Created
                              </Badge>
                            )}
                            {isReported && (
                              <Badge variant="outline" className="text-xs bg-orange-50 dark:bg-orange-900 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-700">
                                Reported
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mb-1">
                            Category: {ticket.category || ticket.type}
                          </p>
                          <p className="text-sm text-muted-foreground mb-1">
                            Created: {formatDateWithTime(ticket.created)}
                          </p>
                          {ticket.creatorName && (
                            <p className="text-sm text-muted-foreground">
                              Creator: {ticket.creatorName}
                            </p>
                          )}
                          {/* Show reported player if this player created a report */}
                          {isCreator && ticket.reportedPlayer && (
                            <p className="text-sm text-muted-foreground">
                              Reported: {ticket.reportedPlayer}
                            </p>
                          )}
                          {ticket.tags && ticket.tags.length > 0 && (
                            <div className="flex gap-1 mt-2">
                              {ticket.tags.map((tag: string, index: number) => (
                                <Badge key={index} variant="outline" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="ml-2 flex-shrink-0">
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-muted/30 p-3 rounded-lg">
                <p className="text-sm">No tickets found for this player.</p>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="names" className="space-y-2 mx-1 mt-3">
            <h4 className="font-medium">Previous Names</h4>
            <div className="bg-muted/30 p-3 rounded-lg">
              <ul className="space-y-2">
                {playerInfo.previousNames.map((name, idx) => (
                  <li key={idx} className="text-sm flex items-center">
                    <UserRound className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          </TabsContent>
          
          <TabsContent value="punishment" className="space-y-3 mx-1 mt-3">
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
                reason: playerInfo.reason || '',
                evidence: playerInfo.evidenceList || [],
                staffNotes: playerInfo.staffNotes || '',
                altBlocking: playerInfo.altBlocking || false,
                statWiping: playerInfo.statWiping || false,
                silentPunishment: playerInfo.silentPunishment || false,
                kickSameIP: playerInfo.kickSameIP || false,
                attachReports: playerInfo.attachReports || [],
                banToLink: playerInfo.banToLink || '',
                banLinkedAccounts: playerInfo.banLinkedAccounts || false
              }}
              onChange={(data: PlayerPunishmentData) => {
                setPlayerInfo(prev => ({
                  ...prev,
                  selectedPunishmentCategory: data.selectedPunishmentCategory,
                  selectedSeverity: data.selectedSeverity,
                  selectedOffenseLevel: data.selectedOffenseLevel,
                  duration: data.duration,
                  isPermanent: data.isPermanent,
                  reason: data.reason || '',
                  evidenceList: data.evidence || [],
                  staffNotes: data.staffNotes || '',
                  altBlocking: data.altBlocking || false,
                  statWiping: data.statWiping || false,
                  silentPunishment: data.silentPunishment || false,
                  kickSameIP: data.kickSameIP || false,
                  attachReports: data.attachReports || [],
                  banToLink: data.banToLink || '',
                  banLinkedAccounts: data.banLinkedAccounts || false
                }));
              }}
              onApply={async (data: PlayerPunishmentData) => {
                // Use the existing handleApplyPunishment logic
                return handleApplyPunishment();
              }}
              punishmentTypesByCategory={punishmentTypesByCategory}
              isLoading={isLoadingSettings || isLoadingPunishmentTypes}
              compact={false}
              availableTickets={(playerTickets || []).map((t: any) => ({
                id: t.id || t._id,
                subject: t.subject || '',
                type: t.type || t.category || '',
                status: t.locked ? 'Closed' : 'Open',
                locked: t.locked
              }))}
            />
          </TabsContent>
        </Tabs>
      </div>
    </ResizableWindow>
  );
};

export default PlayerWindow;
