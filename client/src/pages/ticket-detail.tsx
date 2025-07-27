import { useState, useEffect } from 'react';
import { useLocation, Link } from 'wouter';
import { Popover, PopoverContent, PopoverTrigger } from '@modl-gg/shared-web/components/ui/popover';
import { queryClient } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import {
  MessageSquare,
  User,
  Flag,
  AlertCircle,
  Clock,
  FileText,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Send,
  ArrowUpRight,
  Link2,
  StickyNote,  ArrowLeft,
  ThumbsUp,
  ThumbsDown,
  Bug,
  Shield,
  Axe,
  Tag,
  Plus,
  X,
  Lock as LockIcon,
  Unlock as UnlockIcon,
  Loader2,
  ShieldCheck,
  Ticket,
  ChevronDown,
  ChevronRight,
  Settings,
  Image,
  Video,
  File,
  Eye,
  Paperclip
} from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import { Checkbox } from '@modl-gg/shared-web/components/ui/checkbox';
import { useTicket, usePanelTicket, useUpdateTicket, useSettings, useStaff, useModifyPunishment } from '@/hooks/use-data';
import { QuickResponsesConfiguration, defaultQuickResponsesConfig } from '@/types/quickResponses';
import { useToast } from '@/hooks/use-toast';
import PageContainer from '@/components/layout/PageContainer';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@modl-gg/shared-web/components/ui/card';
import { apiRequest } from '@/lib/queryClient';
import { useAddTicketReply } from '@/hooks/use-add-ticket-reply';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import MarkdownHelp from '@/components/ui/markdown-help';
import { ClickablePlayer } from '@/components/ui/clickable-player';
import PlayerPunishment, { PlayerPunishmentData } from '@/components/ui/player-punishment';
import MediaUpload from '@/components/MediaUpload';
import TicketAttachments from '@/components/TicketAttachments';

// Define PunishmentType interface
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

export interface TicketMessage {
  id: string;
  sender: string;
  senderType: 'user' | 'staff' | 'system';
  content: string;
  timestamp: string;
  staff?: boolean; // Indicates if the sender is a staff member
  attachments?: string[];
  closedAs?: string; // Optional field to track if this message closed the ticket
}

interface TicketNote {
  content: string;
  author: string;
  date: string;
}

interface AIAnalysis {
  analysis: string;
  suggestedAction: {
    punishmentTypeId: number;
    severity: 'low' | 'regular' | 'severe';
  } | null;
  wasAppliedAutomatically: boolean;
  createdAt: Date;
}

// Define types for ticket categories and actions
type TicketCategory = 'Player Report' | 'Chat Report' | 'Bug Report' | 'Punishment Appeal' | 'Support' | 'Application';
type PlayerReportAction = 'Accepted' | 'Rejected' | 'Close';
type BugReportAction = 'Completed' | 'Stale' | 'Duplicate' | 'Close';
type PunishmentAppealAction = 'Pardon' | 'Reduce' | 'Reject' | 'Close';

// Default responses for different ticket actions
export const defaultReplies: Record<TicketCategory, Record<string, string>> = {
  'Player Report': {
    'Accepted': 'Thank you for creating this report. After careful review, we have accepted this and the reported player will be receiving a punishment.',
    'Rejected': 'Thank you for submitting this report. After reviewing the evidence provided, we have determined that this does not violate our community guidelines.',
    'Close': 'This ticket has been closed. Please feel free to open a new report if you encounter any other issues.'
  },
  'Chat Report': {
    'Accepted': 'Thank you for creating this report. After careful review, we have accepted this and the reported player will be receiving a punishment.',
    'Rejected': 'Thank you for submitting this report. After reviewing the evidence provided, we have determined that this does not violate our community guidelines.',
    'Close': 'This ticket has been closed. Please feel free to open a new report if you encounter any other issues.'
  },
  'Bug Report': {
    'Completed': 'Thank you for reporting this bug. We have fixed the issue and it will be included in our next update.',
    'Stale': 'This bug report has been marked as stale due to inactivity or lack of information. Please feel free to reopen if you can provide additional details.',
    'Duplicate': 'This bug has been identified as a duplicate of an existing issue that our team is already working on.',
    'Close': 'This bug report has been closed. Thank you for your contribution to improving our game.'
  },
  'Punishment Appeal': {
    'Pardon': 'After reviewing your appeal, we have decided to remove the punishment completely. Thank you for your patience during this process.',
    'Reduce': 'We have reviewed your appeal and decided to reduce the duration of your punishment. The updated duration will be reflected in your account.',
    'Reject': 'After careful consideration of your appeal, we have decided to uphold the original punishment. The decision remains final.',
    'Close': 'This appeal has been closed. If you have additional information, please create a new appeal.'
  },
  'Support': {
    'Resolved': 'Your support request has been resolved. If you need further assistance, please feel free to create a new ticket.',
    'Close': 'This support ticket has been closed. Thank you for contacting us.'
  },
  'Application': {
    'Accepted': 'Congratulations! Your application has been accepted. You will receive further instructions shortly.',
    'Rejected': 'Thank you for your interest. Unfortunately, we have decided not to move forward with your application at this time.',
    'Close': 'This application has been closed.'
  }
};

export interface TicketDetails {
  id: string;
  subject: string;
  status: 'Open' | 'Closed'; // Simplified to just Open/Closed
  reportedBy: string;
  date: string;
  category: TicketCategory;
  relatedPlayer?: string;
  relatedPlayerId?: string;
  messages: TicketMessage[];
  notes: TicketNote[];
  locked?: boolean; // Tracks if the ticket is locked
  newNote?: string;
  isAddingNote?: boolean;
  newReply?: string;
  selectedAction?: string;
  newDuration?: string; // For backward compatibility
  duration?: {
    value?: number;
    unit?: 'hours' | 'days' | 'weeks' | 'months';
  };
  isPermanent?: boolean;
  tags?: string[];
  newTag?: string;
  aiAnalysis?: AIAnalysis;
  punishmentData?: PlayerPunishmentData; // New field for punishment interface data
}

const TicketDetail = () => {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState('conversation');
  const [punishmentTypes, setPunishmentTypes] = useState<any[]>([]);
  const location = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formSubject, setFormSubject] = useState('');
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [replyAttachments, setReplyAttachments] = useState<Array<{id: string, url: string, key: string, fileName: string, fileType: string, fileSize: number, uploadedAt: string, uploadedBy: string}>>([]);
  
  // Format date to MM/dd/yy HH:mm in browser's timezone
  const formatDate = (dateString: string): string => {
    try {
      // Handle various date formats and edge cases
      if (!dateString) {
        return 'Unknown';
      }
      
      const date = new Date(dateString);
      
      // Check if the date is valid
      if (isNaN(date.getTime())) {
        console.warn('Invalid date string:', dateString);
        return 'Invalid Date';
      }
      
      return date.toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch (e) {
      console.error('Error formatting date:', e, 'Original string:', dateString);
      return 'Unknown'; // Return a more user-friendly fallback
    }
  };

  // Helper function to get file icon
  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <Image className="h-3 w-3" />;
    if (type.startsWith('video/')) return <Video className="h-3 w-3" />;
    if (type === 'application/pdf') return <FileText className="h-3 w-3" />;
    return <File className="h-3 w-3" />;
  };

  // Helper function to truncate filename
  const truncateFileName = (fileName: string, maxLength: number = 15) => {
    if (fileName.length <= maxLength) return fileName;
    const extension = fileName.split('.').pop();
    const name = fileName.substring(0, fileName.lastIndexOf('.'));
    const truncatedName = name.substring(0, maxLength - extension!.length - 4) + '...';
    return `${truncatedName}.${extension}`;
  };

  // More robust parsing of ticket ID from URL
  const path = location[0];
  const pathParts = path.split('/');
  
  // Get the last part of the URL which should be the ticket ID
  let ticketId = pathParts[pathParts.length - 1];
  
  // Reverse the transformation done in navigation (ID- back to #)
  if (ticketId.startsWith('ID-')) {
    ticketId = ticketId.replace('ID-', '#');
  }
  
  // Extract ticket ID from URL

  // Sample default tags based on category
  const getDefaultTagsForCategory = (category: TicketCategory): string[] => {
    switch(category) {
      case 'Bug Report':
        return ['Bug Report'];
      case 'Player Report':
        return ['Player Report'];
      case 'Punishment Appeal':
        return ['Ban Appeal'];
      default:
        return [];
    }
  };

  // Function to get available quick responses for current ticket category
  const getQuickResponsesForTicket = (category: TicketCategory) => {
    if (!settingsData?.settings) return defaultQuickResponsesConfig.categories;
    
    // Get quick responses from settings (fallback to default config)
    const quickResponses: QuickResponsesConfiguration = 
      settingsData.settings.quickResponses || defaultQuickResponsesConfig;
    
    // Find the category for this ticket type
    let ticketType = '';
    switch(category) {
      case 'Player Report':
        ticketType = 'player_report';
        break;
      case 'Chat Report':
        ticketType = 'chat_report';
        break;
      case 'Bug Report':
        ticketType = 'bug_report';
        break;
      case 'Punishment Appeal':
        ticketType = 'appeal';
        break;
      case 'Support':
        ticketType = 'support';
        break;
      case 'Application':
        ticketType = 'application';
        break;
      default:
        ticketType = 'support';
    }
    
    // Find the category that handles this ticket type
    const responseCategory = quickResponses.categories?.find(cat => 
      cat.ticketTypes.includes(ticketType)
    );
    
    return responseCategory?.actions || [];
  };

  // Function to check if selected action should show punishment interface
  const shouldShowPunishmentForAction = (actionName: string, category: TicketCategory): boolean => {
    const actions = getQuickResponsesForTicket(category);
    const action = actions.find(act => act.name === actionName);
    return action?.showPunishment === true;
  };

  const [ticketDetails, setTicketDetails] = useState<TicketDetails>({
    id: "",
    subject: "",
    status: "Open",
    reportedBy: "",
    date: "",
    category: "Player Report",
    relatedPlayer: "",
    relatedPlayerId: "",
    tags: [],
    messages: [],
    notes: [],
    locked: false,
    punishmentData: {
      selectedPunishmentCategory: undefined,
      selectedSeverity: undefined,
      selectedOffenseLevel: undefined,
      duration: { value: 1, unit: 'days' },
      isPermanent: false,
      reason: '',
      evidence: [],
      staffNotes: '',
      altBlocking: false,
      statWiping: false,
      silentPunishment: false,
      kickSameIP: false,
      attachReports: [],
      banToLink: '',
      banLinkedAccounts: false
    }
  });

  // Parse punishment types from settings
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
    Social: [
      // Social punishment types are loaded from server during provisioning
    ],
    Gameplay: [
      // Gameplay punishment types are loaded from server during provisioning
    ]
  });

  // Simplified status colors - just Open and Closed
  const statusColors = {
    'Open': 'bg-green-50 text-green-700 border-green-200',
    'Closed': 'bg-red-50 text-red-700 border-red-200'
  };

  const priorityColors = {
    'Critical': 'bg-destructive/10 text-destructive border-destructive/20',
    'Medium': 'bg-warning/10 text-warning border-warning/20',
    'Low': 'bg-info/10 text-info border-info/20',
    'Fixed': 'bg-success/10 text-success border-success/20'
  };  // Use React Query to fetch ticket data from panel API
  const { data: ticketData, isLoading, isError, error, refetch } = usePanelTicket(ticketId);
  
  useEffect(() => {
    // Ticket data received
  }, [ticketData]);
  
  // Mutation hook for updating tickets
  const updateTicketMutation = useUpdateTicket();

  // Mutation hook for modifying punishments
  const modifyPunishmentMutation = useModifyPunishment();

  // Fetch settings to get punishment types
  const { data: settingsData } = useSettings();
  
  // Fetch staff data to get assigned Minecraft accounts
  const { data: staffData } = useStaff();

  // Process settings data to extract punishment types by category
  useEffect(() => {
    const punishmentTypesData = settingsData?.settings?.punishmentTypes;
    if (punishmentTypesData) {
      try {
        // Parse punishment types if they're stored as a string
        const typesData = typeof punishmentTypesData === 'string' 
          ? JSON.parse(punishmentTypesData) 
          : punishmentTypesData;
          
        if (Array.isArray(typesData)) {
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
          const adminFromSettings = typesData.filter(pt => pt.category === 'Administrative');
          
          // Merge default admin types with any additional admin types from settings
          // Default types take precedence (to ensure they're always available)
          const mergedAdminTypes = [...defaultAdminTypes];
          adminFromSettings.forEach(settingsType => {
            if (!mergedAdminTypes.find(defaultType => defaultType.name === settingsType.name)) {
              mergedAdminTypes.push(settingsType);
            }
          });
          
          const categorized = {
            Administrative: mergedAdminTypes.sort((a, b) => a.ordinal - b.ordinal),
            Social: typesData.filter(pt => pt.category === 'Social').sort((a, b) => a.ordinal - b.ordinal),
            Gameplay: typesData.filter(pt => pt.category === 'Gameplay').sort((a, b) => a.ordinal - b.ordinal)
          };
          
          // Update the state with the loaded punishment types
          setPunishmentTypesByCategory(categorized);
          
          // Also create a flattened array for AI suggestion lookup
          const allTypes = [...mergedAdminTypes, ...categorized.Social, ...categorized.Gameplay];
          setPunishmentTypes(allTypes);
        }
      } catch (error) {
        console.error("Error parsing punishment types:", error);
      }
    }
  }, [settingsData]);

  // Avatar component for messages
  const MessageAvatar = ({ message }: { message: TicketMessage }) => {
    const [avatarError, setAvatarError] = useState(false);
    const [avatarLoading, setAvatarLoading] = useState(true);

    // For player messages, use the ticket creator's UUID if available
    if (message.senderType === 'user') {
      const creatorUuid = ticketData?.creatorUuid;
      if (creatorUuid && !avatarError) {
        return (
          <div className="relative h-8 w-8 bg-muted rounded-md flex items-center justify-center overflow-hidden flex-shrink-0">
            <img 
              src={`/api/panel/players/avatar/${creatorUuid}?size=32&overlay=true`}
              alt={`${message.sender} Avatar`}
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
                <span className="text-xs font-bold text-primary">{message.sender?.substring(0, 2) || 'U'}</span>
              </div>
            )}
          </div>
        );
      }
      // Fallback for player without UUID
      return (
        <div className="h-8 w-8 bg-blue-100 rounded-md flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-blue-600">{message.sender?.substring(0, 2) || 'U'}</span>
        </div>
      );
    }

    // For staff messages, check if they have an assigned Minecraft account
    if (message.senderType === 'staff' || message.staff) {
      const staffMember = staffData?.find((staff: any) => staff.username === message.sender);
      const minecraftUuid = staffMember?.assignedMinecraftUuid;
      
      if (minecraftUuid && !avatarError) {
        return (
          <div className="relative h-8 w-8 bg-muted rounded-md flex items-center justify-center overflow-hidden flex-shrink-0">
            <img 
              src={`/api/panel/players/avatar/${minecraftUuid}?size=32&overlay=true`}
              alt={`${message.sender} Avatar`}
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
                <span className="text-xs font-bold text-primary">{message.sender?.substring(0, 2) || 'S'}</span>
              </div>
            )}
          </div>
        );
      }
      
      // Fallback for staff without assigned Minecraft account
      return (
        <div className="h-8 w-8 bg-green-100 rounded-md flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-green-600">{message.sender?.substring(0, 2) || 'S'}</span>
        </div>
      );
    }

    // System messages
    return (
      <div className="h-8 w-8 bg-gray-100 rounded-md flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-bold text-gray-600">SY</span>
      </div>
    );
  };

  // Function to apply AI-suggested punishment
  const applyAISuggestion = async () => {
    if (!ticketDetails?.aiAnalysis?.suggestedAction || !user?.username) {
      return;
    }

    try {
      const { csrfFetch } = await import('@/utils/csrf');
      const response = await csrfFetch(`/api/panel/settings/ai-apply-punishment/${ticketDetails.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          staffName: user.username
        })
      });

      if (response.ok) {
        const responseData = await response.json();
        console.log('AI punishment applied successfully, response:', responseData);
        
        // Refresh ticket data to show updated AI analysis
        if (refetch && typeof refetch === 'function') {
          const refetchResult = await refetch();
          console.log('Data refreshed via refetch, result:', refetchResult);
        } else {
          console.error('refetch is not a function:', refetch);
          console.log('Falling back to page reload');
          window.location.reload();
          return;
        }
        
        // Force reload if the AI suggestion is still showing after 2 seconds
        setTimeout(() => {
          const aiAnalysis = document.querySelector('[data-testid="ai-analysis"]');
          if (aiAnalysis) {
            console.log('AI analysis still visible, forcing page reload');
            window.location.reload();
          }
        }, 2000);
        
        // Give a small delay to ensure data is refreshed
        setTimeout(() => {
          console.log('Checking if AI analysis is hidden...');
          const aiAnalysis = document.querySelector('[data-testid="ai-analysis"]');
          if (aiAnalysis) {
            console.log('AI analysis still visible after refresh');
          } else {
            console.log('AI analysis properly hidden after refresh');
          }
        }, 1000);
        
        toast({
          title: "Success",
          description: "AI-suggested punishment has been applied successfully.",
        });
      } else {
        const errorData = await response.json();
        toast({
          title: "Error",
          description: errorData.error || "Failed to apply AI suggestion",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error applying AI suggestion:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  // Function to dismiss AI suggestion
  const dismissAISuggestion = async (reason?: string) => {
    if (!ticketDetails?.aiAnalysis || !user?.username) {
      return;
    }

    try {
      const { csrfFetch } = await import('@/utils/csrf');
      const response = await csrfFetch(`/api/panel/settings/ai-dismiss-suggestion/${ticketDetails.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          staffName: user.username,
          reason: reason || 'No reason provided'
        })
      });

      if (response.ok) {
        // Refresh ticket data to show dismissed AI analysis
        if (refetch && typeof refetch === 'function') {
          await refetch();
        } else {
          console.error('refetch is not a function:', refetch);
          window.location.reload();
          return;
        }
        
        // Force reload if the AI suggestion is still showing after 2 seconds
        setTimeout(() => {
          const aiAnalysis = document.querySelector('[data-testid="ai-analysis"]');
          if (aiAnalysis) {
            console.log('AI analysis still visible after dismiss, forcing page reload');
            window.location.reload();
          }
        }, 2000);
        
        toast({
          title: "Success",
          description: "AI suggestion has been dismissed.",
        });
      } else {
        const errorData = await response.json();
        toast({
          title: "Error",
          description: errorData.error || "Failed to dismiss AI suggestion",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error dismissing AI suggestion:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };
  useEffect(() => {
    if (ticketData) {
      // Process ticket data
      // Convert ticket type to category
      if (!ticketData.type) {
        // Try to infer type from ID if not present
        if (ticketData.id?.startsWith("BUG")) {
          ticketData.type = 'bug';
        } else if (ticketData.id?.startsWith("PLAYER")) {
          ticketData.type = 'player';
        } else if (ticketData.id?.startsWith("APPEAL")) {
          ticketData.type = 'appeal';
        } else {
          ticketData.type = 'support'; // default fallback
        }
      }
      
      const category = (ticketData.type === 'bug' ? 'Bug Report' : 
                      ticketData.type === 'chat' ? 'Chat Report' :
                      ticketData.type === 'player' ? 'Player Report' : 
                      ticketData.type === 'appeal' ? 'Punishment Appeal' :
                      ticketData.type === 'support' ? 'Support' :
                      ticketData.type === 'application' ? 'Application' : 'Support') as TicketCategory;
        // Get default tags for this category if no tags are provided
      const tags = ticketData.tags || getDefaultTagsForCategory(category);
      
      // Ensure we have a valid date
      let validDate = new Date().toISOString(); // fallback to current time
      if (ticketData.date) {
        const dateFromField = new Date(ticketData.date);
        if (!isNaN(dateFromField.getTime())) {
          validDate = dateFromField.toISOString();
        }
      } else if (ticketData.created) {
        const createdDate = new Date(ticketData.created);
        if (!isNaN(createdDate.getTime())) {
          validDate = createdDate.toISOString();
        }
      }
      
      // Map MongoDB data to our TicketDetails interface
      setTicketDetails({
        id: ticketData.id || ticketData._id,
        subject: ticketData.subject || 'No Subject',
        // Simplify status to Open/Closed - anything but Closed is Open
        status: (ticketData.locked === true || ticketData.status === 'Closed') ? 'Closed' : 'Open',
        reportedBy: ticketData.reportedBy || 'Unknown',
        date: validDate,
        category,
        relatedPlayer: ticketData.relatedPlayer?.username || ticketData.relatedPlayerName || ticketData.reportedPlayer,
        relatedPlayerId: ticketData.relatedPlayer?.uuid || ticketData.relatedPlayerId || ticketData.reportedPlayerUuid,
        messages: (ticketData.messages || (ticketData.replies && ticketData.replies.map((reply: any) => ({
          id: reply._id || reply.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          sender: reply.name,
          senderType: reply.type === 'staff' ? 'staff' : 
                     reply.type === 'system' ? 'system' : 'user',
          content: reply.content,
          timestamp: reply.created ? (new Date(reply.created).toISOString() || new Date().toISOString()) : new Date().toISOString(),
          staff: reply.staff,
          closedAs: (reply.action === "Comment" || reply.action === "Reopen") ? undefined : reply.action
        }))) || []),
        notes: ticketData.notes || [],
        tags,
        locked: ticketData.locked === true,
        // Set default action to "Comment" to highlight the Comment button
        selectedAction: 'Comment',
        // Extract AI analysis from ticket data if present
        aiAnalysis: ticketData.data?.aiAnalysis
      });
    }
  }, [ticketData]);

  // Define updated handlers that save changes to MongoDB
  const handleAddNote = () => {
    if (!ticketDetails.newNote?.trim()) return;
    
    const now = new Date();
    // Store ISO string for the server
    const timestamp = now.toISOString();
    
    // Create the new note with proper structure
    const newNote: TicketNote = {
      content: ticketDetails.newNote.trim(),
      author: user?.username || 'Staff',
      date: timestamp
    };
    
    // First update local state for immediate UI feedback
    setTicketDetails(prev => ({
      ...prev,
      notes: [...prev.notes, newNote],
      newNote: '',
      isAddingNote: false
    }));
    
    // Then send update to server
    updateTicketMutation.mutate({
      id: ticketDetails.id,
      data: {
        newNote: newNote
      }
    });
  };

  // Get placeholder text based on selected action
  const getPlaceholderText = () => {
    if (ticketDetails.selectedAction && ticketDetails.selectedAction !== 'Comment') {
      // Get quick response message for this action
      const actions = getQuickResponsesForTicket(ticketDetails.category);
      const action = actions.find(act => act.name === ticketDetails.selectedAction);
      
      if (action?.message) {
        // Replace any placeholders in the message
        let text = action.message;
        if (ticketDetails.relatedPlayer && text.includes('{reported-player}')) {
          text = text.replace('{reported-player}', ticketDetails.relatedPlayer);
        }
        return text;
      }
      
      // Fallback to default replies if quick response not found
      if (defaultReplies[ticketDetails.category] && 
          defaultReplies[ticketDetails.category][ticketDetails.selectedAction]) {
        let text = defaultReplies[ticketDetails.category][ticketDetails.selectedAction];
        if (ticketDetails.relatedPlayer && text.includes('{reported-player}')) {
          text = text.replace('{reported-player}', ticketDetails.relatedPlayer);
        }
        return text;
      }
    }
    return "Type your reply here...";
  };

  // Helper function to convert duration to milliseconds
  const getDurationMultiplier = (unit: string): number => {
    switch (unit) {
      case 'seconds': return 1000;
      case 'minutes': return 60 * 1000;
      case 'hours': return 60 * 60 * 1000;
      case 'days': return 24 * 60 * 60 * 1000;
      case 'weeks': return 7 * 24 * 60 * 60 * 1000;
      case 'months': return 30 * 24 * 60 * 60 * 1000;
      default: return 1000;
    }
  };

  const handleSendReply = async () => {
    if (!ticketDetails.newReply?.trim() || !ticketDetails.selectedAction) return;
    
    const now = new Date();
    const timestamp = now.toISOString();
    
    let messageContent = ticketDetails.newReply.trim();
    let status: 'Open' | 'Closed' = ticketDetails.status;
    
    let actionDesc = '';
    if (ticketDetails.selectedAction && ticketDetails.selectedAction !== 'Comment') {
      switch(ticketDetails.selectedAction) {
        case 'Accepted':
          actionDesc = "accepted this report";
          break;
        case 'Rejected':
          actionDesc = "rejected this report";
          break;
        case 'Completed':
          actionDesc = "marked this bug as completed";
          break;
        case 'Stale':
          actionDesc = "marked this bug as stale";
          break;
        case 'Duplicate':
          actionDesc = "marked this bug as duplicate";
          break;
        default:
          // Handle quick response actions first (takes precedence over hardcoded cases)
          const actions = getQuickResponsesForTicket(ticketDetails.category);
          const actionConfig = actions.find(act => act.name === ticketDetails.selectedAction);
          if (actionConfig) {
            actionDesc = actionConfig.name.toLowerCase();
            if (actionConfig.closeTicket) {
              status = 'Closed';
            }
          } else {
            // Fallback to hardcoded cases if not in quick responses
            switch(ticketDetails.selectedAction) {
              case 'Pardon':
                actionDesc = "pardoned this punishment";
                break;
              case 'Reduce':
                actionDesc = ticketDetails.isPermanent 
                  ? 'changed the punishment to permanent' 
                  : `reduced the punishment to ${ticketDetails.duration?.value || 0} ${ticketDetails.duration?.unit || 'days'}`;
                break;
              case 'Reject':
                actionDesc = "rejected this appeal";
                break;
              case 'Close':
                actionDesc = "closed this ticket";
                status = 'Closed';
                break;
              case 'Reopen':
                actionDesc = "reopened this ticket";
                status = 'Open';
                break;
              default:
                // Handle dynamic reduce actions
                if (ticketDetails.selectedAction?.toLowerCase().includes('reduce')) {
                  actionDesc = ticketDetails.isPermanent 
                    ? 'changed the punishment to permanent' 
                    : `reduced the punishment to ${ticketDetails.duration?.value || 0} ${ticketDetails.duration?.unit || 'days'}`;
                  status = 'Closed';
                }
                break;
            }
          }
      }
    }
    
    if (messageContent) {
      const isClosing = status === 'Closed';
      
      const newMessage = {
        id: `msg-${Date.now()}`,
        name: user?.username || "Admin",
        type: "staff",
        content: messageContent,
        created: new Date(),
        staff: true,
        action: ticketDetails.selectedAction,
        attachments: replyAttachments
      };
      
      const clientMessage: TicketMessage = {
        id: newMessage.id,
        sender: newMessage.name,
        senderType: newMessage.type === 'staff' ? 'staff' : 
                    newMessage.type === 'system' ? 'system' : 'user',
        content: newMessage.content,
        timestamp: timestamp,
        staff: newMessage.staff,
        attachments: replyAttachments,
        closedAs: ticketDetails.selectedAction && ticketDetails.selectedAction !== 'Comment' && ticketDetails.selectedAction !== 'Reopen' ? ticketDetails.selectedAction : undefined
      };
      
      setTicketDetails(prev => ({
        ...prev,
        messages: [...prev.messages, clientMessage],
        newReply: '',
        selectedAction: undefined,
        newDuration: undefined,
        isPermanent: undefined,
        duration: undefined,
        status: isClosing ? status : prev.status,
        locked: isClosing || status === 'Closed' ? true : prev.locked
      }));
      
      // Clear reply attachments after successful submission
      setReplyAttachments([]);
      
      try {
        // Prepare update data
        const updateData: any = {
          status,
          newReply: newMessage,
          locked: isClosing || status === 'Closed' ? true : ticketDetails.locked
        };
        
        // Handle punishment modifications for appeal actions
        if (ticketDetails.selectedAction === 'Pardon') {
          // Get punishment data from ticket
          const punishmentId = ticketData?.data?.punishmentId;
          const playerUuid = ticketData?.data?.playerUuid;
          
          if (punishmentId && playerUuid) {
            try {
              await modifyPunishmentMutation.mutateAsync({
                uuid: playerUuid,
                punishmentId: punishmentId,
                modificationType: 'APPEAL_ACCEPT',
                reason: 'Appeal approved - full pardon granted',
                appealTicketId: ticketDetails.id
              });
              
              toast({
                title: 'Punishment Pardoned',
                description: `Punishment ${punishmentId} has been pardoned successfully.`
              });
            } catch (error) {
              console.error('Error pardoning punishment:', error);
              toast({
                title: 'Error',
                description: 'Failed to pardon punishment. The ticket reply was sent but the punishment was not modified.',
                variant: 'destructive'
              });
            }
          }
        } else if (ticketDetails.selectedAction === 'Reduce' || ticketDetails.selectedAction?.toLowerCase().includes('reduce')) {
          // Get punishment data from ticket
          const punishmentId = ticketData?.data?.punishmentId;
          const playerUuid = ticketData?.data?.playerUuid;
          
          if (punishmentId && playerUuid) {
            try {
              // Determine the new duration
              let newDuration;
              
              if (ticketDetails.isPermanent) {
                // Permanent punishment - send 0 value
                newDuration = { value: 0, unit: 'seconds' };
              } else if (ticketDetails.duration?.value && ticketDetails.duration?.unit) {
                // Use the provided duration - the hook will convert to milliseconds
                newDuration = ticketDetails.duration;
              } else {
                throw new Error('Invalid duration specified for reduction');
              }
              
              await modifyPunishmentMutation.mutateAsync({
                uuid: playerUuid,
                punishmentId: punishmentId,
                modificationType: 'APPEAL_DURATION_CHANGE',
                reason: 'Appeal partially approved - duration reduced',
                newDuration: newDuration,
                appealTicketId: ticketDetails.id
              });
              
              toast({
                title: 'Punishment Reduced',
                description: `Punishment ${punishmentId} duration has been reduced successfully.`
              });
            } catch (error) {
              console.error('Error reducing punishment:', error);
              toast({
                title: 'Error',
                description: 'Failed to reduce punishment. The ticket reply was sent but the punishment was not modified.',
                variant: 'destructive'
              });
            }
          }
        } else if (ticketDetails.selectedAction === 'Reject' || ticketDetails.selectedAction === 'Rejected' || ticketDetails.selectedAction?.toLowerCase().includes('reject')) {
          // Get punishment data from ticket
          const punishmentId = ticketData?.data?.punishmentId;
          const playerUuid = ticketData?.data?.playerUuid;
          
          if (punishmentId && playerUuid) {
            try {
              await modifyPunishmentMutation.mutateAsync({
                uuid: playerUuid,
                punishmentId: punishmentId,
                modificationType: 'APPEAL_REJECT',
                reason: 'Appeal rejected - original punishment upheld',
                appealTicketId: ticketDetails.id
              });
              
              toast({
                title: 'Appeal Rejected',
                description: `Appeal for punishment ${punishmentId} has been rejected.`
              });
            } catch (error) {
              console.error('Error rejecting appeal:', error);
              toast({
                title: 'Error',
                description: 'Failed to record appeal rejection. The ticket reply was sent but the punishment was not updated.',
                variant: 'destructive'
              });
            }
          }
        }
        
        await updateTicketMutation.mutateAsync({
          id: ticketDetails.id,
          data: updateData
        });
        queryClient.invalidateQueries({ queryKey: ['/api/panel/tickets', ticketId] });
      } catch (error) {
        console.error('Error sending reply:', error);
        toast({
          title: "Error",
          description: "Failed to send reply. Please try again later.",
          variant: "destructive"
        });
      }
    }
  };
  
  const handleUpdateTagsWithPersistence = (tags: string[]) => {
    setTicketDetails(prev => ({
      ...prev,
      tags,
      newTag: ''
    }));
    
    updateTicketMutation.mutate({
      id: ticketDetails.id,
      data: { tags }
    });
  };
  
  const handleAddTag = (tag: string) => {
    if (tag.trim() && (!ticketDetails.tags || !ticketDetails.tags.includes(tag.trim()))) {
      const newTags = [...(ticketDetails.tags || []), tag.trim()];
      handleUpdateTagsWithPersistence(newTags);
    }
  };
  
  const handleRemoveTag = (tag: string) => {
    const newTags = (ticketDetails.tags || []).filter(t => t !== tag);
    handleUpdateTagsWithPersistence(newTags);
  };
  
  const handleStatusChange = (newStatus: 'Open' | 'Closed', lockTicket = false) => {
    setTicketDetails(prev => ({
      ...prev,
      status: newStatus,
      locked: lockTicket || newStatus === 'Closed' ? true : prev.locked
    }));
    
    updateTicketMutation.mutate({
      id: ticketDetails.id,
      data: {
        status: newStatus,
        locked: lockTicket || newStatus === 'Closed' ? true : ticketDetails.locked
      }
    });
  };
  
  const handleTicketAction = (action: string) => {
    setTicketDetails(prev => ({
      ...prev,
      selectedAction: action
    }));
    
    let newStatus: 'Open' | 'Closed' = ticketDetails.status;
    let text = '';
    
    // Handle special actions
    if (action === 'Close') {
      newStatus = 'Closed';
      text = 'This ticket has been closed. Please create a new ticket if you need further assistance.';
    } else if (action === 'Reopen') {
      newStatus = 'Open';
      text = 'This ticket has been reopened.';
    } else if (action === 'Comment') {
      // Clear the reply for comment mode
      setTicketDetails(prev => ({
        ...prev,
        newReply: ''
      }));
      return;
    } else {
      // Get quick response configuration
      const actions = getQuickResponsesForTicket(ticketDetails.category);
      const actionConfig = actions.find(act => act.name === action);
      
      if (actionConfig) {
        // Use quick response message
        text = actionConfig.message;
        
        // Replace placeholders
        if (ticketDetails.relatedPlayer && text.includes('{reported-player}')) {
          text = text.replace('{reported-player}', ticketDetails.relatedPlayer);
        }
        
        // Check if this action should close the ticket
        if (actionConfig.closeTicket) {
          newStatus = 'Closed';
        }
      }
    }
    
    // Set the reply text if we have one
    if (text) {
      setTicketDetails(prev => ({
        ...prev,
        newReply: text
      }));
    }
  };

  return (
    <PageContainer>
      <div className="flex flex-col space-y-4">
        <div className="flex items-center justify-between w-full">
          <Button 
            variant="ghost" 
            size="sm" 
            className="gap-1" 
            onClick={() => setLocation('/panel/tickets')}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Tickets
          </Button>
          
          {ticketDetails.id && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Share with player:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="flex items-center">
                    <Link2 className="w-4 h-4 mr-2" />
                    Share Link
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-3 w-auto">
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Player can use this link to view and reply to the ticket:</p>
                    <div className="flex items-center">
                      <input 
                        type="text" 
                        readOnly 
                        value={`${window.location.origin}/ticket/${ticketDetails.id}`}
                        className="text-xs p-2 bg-muted rounded border border-border flex-1 mr-2"
                      />
                      <Button 
                        size="sm" 
                        variant="secondary"
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/ticket/${ticketDetails.id}`);
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>
        
        {isLoading && (
          <div className="flex justify-center items-center py-20">
            <div className="flex flex-col items-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="mt-2 text-sm text-muted-foreground">Loading ticket details...</p>
            </div>
          </div>
        )}
        
        {isError && (
          <div className="flex justify-center items-center py-20">
            <div className="flex flex-col items-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <h3 className="mt-2 text-lg font-medium">Failed to load ticket</h3>
              <p className="text-sm text-muted-foreground">
                We couldn't load the ticket details. Please try again later.
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-4"
                onClick={() => window.location.reload()}
              >
                Try Again
              </Button>
            </div>
          </div>
        )}
        
        {!isLoading && !isError && !ticketData && (
          <div className="flex justify-center items-center py-20">
            <div className="flex flex-col items-center">
              <AlertCircle className="h-8 w-8 text-muted-foreground" />
              <h3 className="mt-2 text-lg font-medium">Ticket not found</h3>
              <p className="text-sm text-muted-foreground">
                The ticket with ID "{ticketId}" could not be found.
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-4"
                onClick={() => setLocation('/panel/tickets')}
              >
                Back to Tickets
              </Button>
            </div>
          </div>
        )}
        
        {!isLoading && !isError && ticketData && (
          <>

            <div className="bg-background-lighter p-6 rounded-lg">
              <div className="flex flex-col gap-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-medium">{ticketDetails.subject}</h2>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {/* Ticket Category Badge with distinct styling based on type */}
                      <Badge variant="outline" className={
                        ticketDetails.category === 'Bug Report' ? 'bg-red-50 text-red-700 border-red-200' : 
                        ticketDetails.category === 'Player Report' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                        ticketDetails.category === 'Punishment Appeal' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                        'bg-blue-50 text-blue-700 border-blue-200'
                      }>
                        {ticketDetails.category}
                      </Badge>
                      
                      {/* Simple Status Badge - Only Open or Closed */}
                      <Badge variant="outline" className={
                        ticketDetails.status === 'Open' ? 
                          'bg-green-50 text-green-700 border-green-200' : 
                          'bg-gray-50 text-gray-700 border-gray-200'
                      }>
                        {ticketDetails.status === 'Open' ? 'Open' : 'Closed'}
                      </Badge>
                      
                      {/* Display the tags */}
                      {ticketDetails.tags && ticketDetails.tags.map((tag, index) => (
                        <Badge key={index} variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 py-1">
                          {tag}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-4 w-4 rounded-full hover:bg-blue-100 ml-1 p-0" 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveTag(tag);
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </Badge>
                      ))}
                      
                      {/* Tag add button */}
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="h-6 px-2 py-1 text-xs rounded-full gap-1 bg-background">
                            <Tag className="h-3 w-3" />
                            <Plus className="h-3 w-3" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-3" align="start">
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium">Add Tag</h4>
                            <div className="flex items-center space-x-2">
                              <input
                                className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                placeholder="New tag"
                                value={ticketDetails.newTag || ''}
                                onChange={(e) => 
                                  setTicketDetails(prev => ({
                                    ...prev,
                                    newTag: e.target.value
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && ticketDetails.newTag?.trim()) {
                                    handleAddTag(ticketDetails.newTag);
                                  }
                                }}
                              />
                              <Button 
                                size="sm"
                                onClick={() => {
                                  if (ticketDetails.newTag?.trim()) {
                                    handleAddTag(ticketDetails.newTag);
                                  }
                                }}
                                disabled={!ticketDetails.newTag?.trim()}
                              >
                                Add
                              </Button>
                            </div>
                            <div className="mt-2">
                              <h5 className="text-xs text-muted-foreground mb-1">Suggested tags:</h5>
                              <div className="flex flex-wrap gap-1">
                                {getDefaultTagsForCategory(ticketDetails.category).map((tag, idx) => (
                                  <Badge 
                                    key={idx} 
                                    variant="outline" 
                                    className="cursor-pointer bg-muted/20 hover:bg-muted/40"
                                    onClick={() => {
                                      if (!ticketDetails.tags?.includes(tag)) {
                                        handleAddTag(tag);
                                      }
                                    }}
                                  >
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 mt-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Opened by:</span>
                    <span className="ml-1">
                      <ClickablePlayer 
                        playerText={ticketDetails.reportedBy}
                        showIcon={true}
                        className="text-sm"
                      >
                        {ticketDetails.reportedBy}
                      </ClickablePlayer>
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Date:</span>
                    <span className="ml-1">{formatDate(ticketDetails.date)}</span>
                  </div>
                  {/* Show reported player for player and chat reports */}
                  {(ticketDetails.category === 'Player Report' || ticketDetails.category === 'Chat Report') && ticketDetails.relatedPlayer && (
                    <div>
                      <span className="text-muted-foreground">Reported:</span>
                      <span className="ml-1">
                        <ClickablePlayer 
                          playerText={ticketDetails.relatedPlayerId || ticketDetails.relatedPlayer}
                          showIcon={true}
                          className="text-sm"
                        >
                          {ticketDetails.relatedPlayer}
                        </ClickablePlayer>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Punishment Details Section for Appeals */}
            {ticketDetails.category === 'Punishment Appeal' && ticketData?.data?.punishmentId && (
              <PunishmentDetailsCard punishmentId={ticketData.data.punishmentId} />
            )}

            {/* AI Analysis Section - Only show for Chat Report tickets with AI analysis that hasn't been applied or dismissed */}
            {ticketDetails.category === 'Chat Report' && ticketDetails.aiAnalysis && !ticketDetails.aiAnalysis.dismissed && !ticketDetails.aiAnalysis.wasAppliedAutomatically && (
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4" data-testid="ai-analysis">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-full">
                    <ShieldAlert className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                        {ticketDetails.aiAnalysis.wasAppliedAutomatically 
                          ? 'AI Action Taken' 
                          : 'AI Suggestion'}
                      </h3>
                      <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700">
                        AI Analysis
                      </Badge>
                    </div>

                    {/* AI Analysis Text */}
                    <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
                      {ticketDetails.aiAnalysis.analysis}
                    </p>

                    {/* Suggested Action */}
                    {ticketDetails.aiAnalysis.suggestedAction && (
                      <div className="bg-white dark:bg-gray-900 rounded-md p-3 border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {ticketDetails.aiAnalysis.wasAppliedAutomatically 
                                ? 'Applied: ' 
                                : 'Suggested: '}
                              {(() => {
                                const punishmentType = punishmentTypes.find(
                                  pt => pt.ordinal === ticketDetails.aiAnalysis?.suggestedAction?.punishmentTypeId
                                );
                                return (punishmentType ? punishmentType.name : 'Unknown Punishment') + " ";
                              })()} 
                              ({ticketDetails.aiAnalysis.suggestedAction.severity})
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              Analyzed on {new Date(ticketDetails.aiAnalysis.createdAt).toLocaleString()}
                            </p>
                          </div>
                          
                          {/* Action buttons - only show if not automatically applied and not dismissed */}
                          {!ticketDetails.aiAnalysis.wasAppliedAutomatically && !ticketDetails.aiAnalysis.dismissed && (
                            <div className="flex gap-2">
                              <Button 
                                size="sm" 
                                variant="default"
                                className="bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800"
                                onClick={applyAISuggestion}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                Apply
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => dismissAISuggestion()}
                              >
                                <XCircle className="h-3.5 w-3.5 mr-1" />
                                Dismiss
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* No action case */}
                    {!ticketDetails.aiAnalysis.suggestedAction && (
                      <div className="bg-white dark:bg-gray-900 rounded-md p-3 border border-blue-200 dark:border-blue-800">
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          <strong>AI Recommendation:</strong> No disciplinary action required
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Analyzed on {new Date(ticketDetails.aiAnalysis.createdAt).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Show AI status when suggestion has been applied or dismissed */}
            {ticketDetails.category === 'Chat Report' && ticketDetails.aiAnalysis && (ticketDetails.aiAnalysis.wasAppliedAutomatically || ticketDetails.aiAnalysis.dismissed) && (
              <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 mb-4">
                <div className="flex items-center gap-2 text-sm">
                  <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <span className="text-gray-700 dark:text-gray-300">
                    {ticketDetails.aiAnalysis.wasAppliedAutomatically 
                      ? 'AI suggestion was automatically applied'
                      : 'AI suggestion was dismissed'}
                  </span>
                </div>
              </div>
            )}

            <div className="bg-background-lighter p-4 rounded-lg">
              <div className="flex gap-2 mb-4">
                <Button 
                  variant={activeTab === 'conversation' ? 'default' : 'outline'} 
                  onClick={() => setActiveTab('conversation')}
                  className="rounded-md"
                  size="sm"
                >
                  <MessageSquare className="h-4 w-4 mr-1.5" />
                  Conversation
                </Button>
                <Button 
                  variant={activeTab === 'notes' ? 'default' : 'outline'} 
                  onClick={() => setActiveTab('notes')}
                  className="rounded-md"
                  size="sm"
                >
                  <StickyNote className="h-4 w-4 mr-1.5" />
                  Staff Notes
                </Button>
              </div>
              
              {activeTab === 'conversation' && (
                <div className="space-y-4">
                  <div className="max-h-[480px] overflow-y-auto divide-y">
                    {ticketDetails.messages.map((message) => (
                      <div key={message.id} className="p-4">
                        <div className="flex items-start gap-3">
                          <MessageAvatar message={message} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm">
                                {message.sender && message.sender !== 'user' ? message.sender : (message.senderType === 'staff' ? 'Staff' : message.senderType === 'system' ? 'System' : 'User')}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {formatDate(message.timestamp) || formatDate(new Date().toISOString())}
                              </span>
                              {(message.senderType === 'staff' || message.staff) && (
                                <Badge variant="secondary" className="text-xs">
                                  Staff
                                </Badge>
                              )}
                              {message.senderType === 'system' && (
                                <Badge variant="outline" className="text-xs">
                                  System
                                </Badge>
                              )}
                              {(message.closedAs && message.closedAs !== "Comment" && message.closedAs !== "Reopen") && (
                                (() => {
                                  const action = message.closedAs;
                                  let badgeText = action;
                                  let badgeVariant: "default" | "secondary" | "destructive" | "outline" = "outline";
                                  let badgeIcon = null;
                                  
                                  // Customize badge based on action type
                                  if (action === 'Close') {
                                    badgeText = 'Closed';
                                    badgeVariant = 'secondary';
                                    badgeIcon = <LockIcon className="h-3 w-3 mr-1" />;
                                  } else if (action === 'Pardon') {
                                    badgeText = 'Pardoned';
                                    badgeVariant = 'default';
                                    badgeIcon = <ThumbsUp className="h-3 w-3 mr-1" />;
                                  } else if (action === 'Reduce') {
                                    // Extract duration info from message content if available
                                    const durationMatch = message.content.match(/reduced the punishment to (\d+) (\w+)/);
                                    if (durationMatch) {
                                      badgeText = `Reduced to ${durationMatch[1]} ${durationMatch[2]}`;
                                    } else if (message.content.includes('permanent')) {
                                      badgeText = 'Made Permanent';
                                    } else {
                                      badgeText = 'Reduced';
                                    }
                                    badgeVariant = 'outline';
                                    badgeIcon = <ArrowLeft className="h-3 w-3 mr-1" />;
                                  } else if (action === 'Reject' || action === 'Rejected') {
                                    badgeText = 'Rejected';
                                    badgeVariant = 'destructive';
                                    badgeIcon = <XCircle className="h-3 w-3 mr-1" />;
                                  } else if (action === 'Accept' || action === 'Accepted') {
                                    badgeText = 'Accepted';
                                    badgeVariant = 'default';
                                    badgeIcon = <CheckCircle2 className="h-3 w-3 mr-1" />;
                                  } else if (action === 'Completed') {
                                    badgeText = 'Completed';
                                    badgeVariant = 'default';
                                    badgeIcon = <CheckCircle2 className="h-3 w-3 mr-1" />;
                                  } else if (action === 'Stale') {
                                    badgeText = 'Stale';
                                    badgeVariant = 'secondary';
                                    badgeIcon = <Clock className="h-3 w-3 mr-1" />;
                                  } else if (action === 'Duplicate') {
                                    badgeText = 'Duplicate';
                                    badgeVariant = 'secondary';
                                    badgeIcon = <FileText className="h-3 w-3 mr-1" />;
                                  } else if (action.toLowerCase().includes('reduce')) {
                                    // Handle dynamic reduce actions
                                    const durationMatch = message.content.match(/reduced the punishment to (\d+) (\w+)/);
                                    if (durationMatch) {
                                      badgeText = `Reduced to ${durationMatch[1]} ${durationMatch[2]}`;
                                    } else if (message.content.includes('permanent')) {
                                      badgeText = 'Made Permanent';
                                    } else {
                                      badgeText = 'Reduced';
                                    }
                                    badgeVariant = 'outline';
                                    badgeIcon = <ArrowLeft className="h-3 w-3 mr-1" />;
                                  }
                                  
                                  return (
                                    <Badge variant={badgeVariant} className="text-xs flex items-center">
                                      {badgeIcon}
                                      {badgeText}
                                    </Badge>
                                  );
                                })()
                              )}
                            </div>
                            
                            <div className="text-sm">
                              <MarkdownRenderer content={message.content} />
                            </div>

                            {/* Show attachments if any */}
                            {message.attachments && message.attachments.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {message.attachments.map((attachment: any, idx: number) => {
                                  // Handle both attachment objects and URL strings
                                  const attachmentData = typeof attachment === 'string' ? 
                                    { url: attachment, fileName: attachment.split('/').pop() || 'file', fileType: 'application/octet-stream' } : 
                                    attachment;
                                  
                                  return (
                                    <Badge 
                                      key={idx} 
                                      variant="outline" 
                                      className="flex items-center gap-1 cursor-pointer hover:bg-muted/50"
                                      onClick={() => window.open(attachmentData.url, '_blank')}
                                    >
                                      {getFileIcon(attachmentData.fileType)}
                                      <span className="text-xs">{truncateFileName(attachmentData.fileName || attachmentData.url.split('/').pop() || 'file')}</span>
                                    </Badge>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Reply section - only shown if ticket is not locked */}
                  {!ticketDetails.locked ? (
                    <div className="border rounded-md p-3">
                      <div className="mb-3">
                        <div className="flex flex-wrap gap-2">
                          <Button 
                            variant={ticketDetails.selectedAction === 'Comment' ? 'default' : 'outline'} 
                            size="sm"
                            onClick={() => handleTicketAction('Comment')}
                            className="rounded-md"
                          >
                            Comment
                          </Button>
                          
                          {/* Dynamic quick response actions */}
                          {getQuickResponsesForTicket(ticketDetails.category).map((action, index) => {
                            // Get icon based on action type
                            const getActionIcon = (actionName: string) => {
                              if (actionName.toLowerCase().includes('accept') || actionName.toLowerCase().includes('completed') || actionName.toLowerCase().includes('fixed')) {
                                return <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />;
                              } else if (actionName.toLowerCase().includes('reject') || actionName.toLowerCase().includes('duplicate')) {
                                return <XCircle className="h-3.5 w-3.5 mr-1.5" />;
                              } else if (actionName.toLowerCase().includes('pardon')) {
                                return <ThumbsUp className="h-3.5 w-3.5 mr-1.5" />;
                              } else if (actionName.toLowerCase().includes('reduce')) {
                                return <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />;
                              } else if (actionName.toLowerCase().includes('stale') || actionName.toLowerCase().includes('pending')) {
                                return <Clock className="h-3.5 w-3.5 mr-1.5" />;
                              } else if (actionName.toLowerCase().includes('investigating') || actionName.toLowerCase().includes('info')) {
                                return <AlertCircle className="h-3.5 w-3.5 mr-1.5" />;
                              } else if (actionName.toLowerCase().includes('escalat')) {
                                return <ArrowUpRight className="h-3.5 w-3.5 mr-1.5" />;
                              } else {
                                return <FileText className="h-3.5 w-3.5 mr-1.5" />;
                              }
                            };

                            return (
                              <Button 
                                key={action.id}
                                variant={ticketDetails.selectedAction === action.name ? 'default' : 'outline'} 
                                size="sm"
                                onClick={() => handleTicketAction(action.name)}
                                className="rounded-md"
                              >
                                {getActionIcon(action.name)}
                                {action.name.replace(/^(Accept|Reject|Pardon) - /, '')}
                              </Button>
                            );
                          })}
                          
                          {/* Close button for all types */}
                          <Button 
                            variant={ticketDetails.selectedAction === 'Close' ? 'default' : 'outline'} 
                            size="sm"
                            onClick={() => handleTicketAction('Close')}
                            className="rounded-md"
                          >
                            <LockIcon className="h-3.5 w-3.5 mr-1.5" />
                            Close
                          </Button>
                        </div>
                      </div>
                      
                      {/* Additional options for Reduce action */}
                      {ticketDetails.selectedAction && ticketDetails.selectedAction.toLowerCase().includes('reduce') && (
                        <div className="mb-3 p-3 border rounded-md bg-muted/10">
                          <div className="flex items-center mb-2">
                            <Checkbox 
                              id="permanent"
                              checked={ticketDetails.isPermanent}
                              onCheckedChange={(checked) => {
                                setTicketDetails(prev => ({
                                  ...prev,
                                  isPermanent: checked === true
                                }));
                              }}
                            />
                            <label htmlFor="permanent" className="ml-2 text-sm font-medium">
                              Permanent Ban
                            </label>
                          </div>
                          
                          {!ticketDetails.isPermanent && (
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-xs text-muted-foreground">Duration</label>
                                <input 
                                  type="number" 
                                  className="w-full mt-1 h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
                                  value={ticketDetails.duration?.value || ''}
                                  onChange={(e) => {                                    const value = parseInt(e.target.value) || 0;
                                    setTicketDetails(prev => ({
                                      ...prev,
                                      duration: {
                                        ...prev.duration,
                                        value
                                      }
                                    }));
                                  }}
                                  min={1}
                                />
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground">Unit</label>
                                <select 
                                  className="w-full mt-1 h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
                                  value={ticketDetails.duration?.unit || 'days'}
                                  onChange={(e) => {
                                    setTicketDetails(prev => ({
                                      ...prev,
                                      duration: {
                                        ...prev.duration,
                                        unit: e.target.value as 'hours' | 'days' | 'weeks' | 'months'
                                      }
                                    }));
                                  }}
                                >
                                  <option value="hours">Hours</option>
                                  <option value="days">Days</option>
                                  <option value="weeks">Weeks</option>
                                  <option value="months">Months</option>
                                </select>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Punishment interface for Player and Chat Reports */}
                      {(ticketDetails.category === 'Player Report' || ticketDetails.category === 'Chat Report') && 
                       ticketDetails.selectedAction && shouldShowPunishmentForAction(ticketDetails.selectedAction, ticketDetails.category) && (
                        <div className="mb-4">
                          <div className="mb-3">
                            <h4 className="text-sm font-medium text-foreground">
                              Punish {ticketDetails.relatedPlayer || 'reported player'}
                            </h4>
                            <p className="text-xs text-muted-foreground">
                              Apply punishment as part of this response
                            </p>
                          </div>
                          
                          <PlayerPunishment
                            playerId={ticketDetails.relatedPlayerId}
                            playerName={ticketDetails.relatedPlayer}
                            playerStatus="Offline" // Default to offline for ticket context
                            data={ticketDetails.punishmentData || {
                              selectedPunishmentCategory: undefined,
                              selectedSeverity: undefined,
                              selectedOffenseLevel: undefined,
                              duration: { value: 1, unit: 'days' },
                              isPermanent: false,
                              reason: '',
                              evidence: [],
                              staffNotes: '',
                              altBlocking: false,
                              statWiping: false,
                              silentPunishment: false,
                              kickSameIP: false,
                              attachReports: [],
                              banToLink: '',
                              banLinkedAccounts: false
                            }}
                            onChange={(data) => {
                              setTicketDetails(prev => ({
                                ...prev,
                                punishmentData: data
                              }));
                            }}
                            onApply={async (data) => {
                              // Handle punishment application
                              console.log('Applying punishment:', data);
                              // You can integrate with the existing punishment API here
                              toast({
                                title: "Punishment Applied",
                                description: `${data.selectedPunishmentCategory} applied to ${ticketDetails.relatedPlayer}`,
                              });
                            }}
                            punishmentTypesByCategory={punishmentTypesByCategory}
                            isLoading={false}
                            compact={false}
                          />
                        </div>
                      )}
                      
                      <div className="mb-2">
                        <MarkdownHelp />
                      </div>
                      
                      <div className="space-y-3">
                        <textarea
                          className="min-h-[120px] w-full resize-none rounded-lg border border-input bg-background p-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          placeholder={getPlaceholderText()}
                          value={ticketDetails.newReply || ''}
                          onChange={(e) => {
                            setTicketDetails(prev => ({
                              ...prev,
                              newReply: e.target.value
                            }));
                          }}
                        />
                        
                        {/* Attachment Badges */}
                        {replyAttachments.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {replyAttachments.map((attachment) => (
                              <Badge 
                                key={attachment.id} 
                                variant="secondary" 
                                className="flex items-center gap-1 cursor-pointer hover:bg-secondary/80"
                                onClick={() => window.open(attachment.url, '_blank')}
                              >
                                {getFileIcon(attachment.fileType)}
                                <span className="text-xs">{truncateFileName(attachment.fileName)}</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setReplyAttachments(prev => prev.filter(a => a.id !== attachment.id));
                                  }}
                                  className="ml-1 hover:bg-destructive/10 rounded-sm p-0.5"
                                  title={`Remove ${attachment.fileName}`}
                                >
                                  <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}
                        
                        {/* Reply Actions */}
                        <div className="flex items-center justify-between">
                          <MediaUpload
                            uploadType="ticket"
                            onUploadComplete={(result, file) => {
                              if (file) {
                                const newAttachment = {
                                  id: Date.now().toString(),
                                  url: result.url,
                                  key: result.key,
                                  fileName: file.name,
                                  fileType: file.type,
                                  fileSize: file.size,
                                  uploadedAt: new Date().toISOString(),
                                  uploadedBy: user?.username || 'Staff'
                                };
                                setReplyAttachments(prev => [...prev, newAttachment]);
                              }
                            }}
                            metadata={{
                              ticketId: ticketDetails.id,
                              fieldId: 'reply'
                            }}
                            variant="button-only"
                            maxFiles={5}
                          />
                          <Button 
                            size="sm" 
                            onClick={handleSendReply}
                            disabled={!ticketDetails.newReply?.trim() && !ticketDetails.selectedAction}
                          >
                            <Send className="h-4 w-4 mr-1.5" />
                            Send
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="border rounded-md p-4 bg-muted/10 space-y-4">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center">
                          <LockIcon className="h-4 w-4 text-muted-foreground mr-2" />
                          <span className="text-sm text-muted-foreground">This ticket is locked and cannot be replied to.</span>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Reopening message:</label>
                        <textarea
                          className="min-h-[80px] w-full resize-none rounded-lg border border-input bg-background p-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          placeholder="Type your reply/reason for reopening this ticket..."
                          value={ticketDetails.newReply}
                          onChange={(e) => {
                            setTicketDetails(prev => ({
                              ...prev,
                              newReply: e.target.value
                            }));
                          }}
                        />
                        
                        <div className="flex justify-end">
                          <Button 
                            variant="default" 
                            size="sm"
                            onClick={() => {
                              // Set action to Reopen
                              if (!ticketDetails.newReply) {
                                setTicketDetails(prev => ({
                                  ...prev,
                                  newReply: 'This ticket has been reopened for further review.'
                                }));
                              }
                              
                              // Create the server-side reopen message
                              const newMessage = {
                                id: `msg-${Date.now()}`,
                                name: user?.username || 'Staff', // Use the current staff member's name
                                type: 'staff',
                                content: ticketDetails.newReply || 'This ticket has been reopened for further review.',
                                created: new Date(),
                                staff: true,
                                action: 'Reopen' // Add action field to track reopening
                              };
                              
                              // Create the client-side message for immediate display
                              const clientMessage: TicketMessage = {
                                id: newMessage.id,
                                sender: newMessage.name,
                                senderType: 'staff',
                                content: newMessage.content,
                                timestamp: new Date().toISOString(),
                                staff: true
                              };
                              
                              // Update local state
                              setTicketDetails(prev => ({
                                ...prev,
                                locked: false,
                                status: 'Open',
                                messages: [...prev.messages, clientMessage],
                                newReply: ''
                              }));
                              
                              // Update in database
                              updateTicketMutation.mutate({
                                id: ticketDetails.id,
                                data: {
                                  locked: false,
                                  status: 'Open',
                                  newReply: newMessage
                                }
                              }, {
                                onSuccess: () => {
                                  // Force refresh of the ticket list
                                  queryClient.invalidateQueries({ queryKey: ['/api/panel/tickets'] });
                                }
                              });
                            }}
                          >
                            <UnlockIcon className="h-4 w-4 mr-2" />
                            Reopen & Reply
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {activeTab === 'notes' && (
                <div className="space-y-4">
                  <div className="space-y-4 mb-5 max-h-[480px] overflow-y-auto p-2">
                    {ticketDetails.notes.map((note, idx) => (
                      <div key={idx} className="bg-muted/20 p-4 rounded-lg">
                        <div className="flex justify-between items-start mb-3">
                          <span className="font-medium text-sm text-foreground">{note.author}</span>
                          <span className="text-xs text-muted-foreground flex-shrink-0">{formatDate(note.date)}</span>
                        </div>
                        <div className="note-content">
                          <MarkdownRenderer 
                            content={note.content} 
                            className="text-sm leading-relaxed"
                          />
                        </div>
                      </div>
                    ))}

                    {ticketDetails.notes.length === 0 && (
                      <div className="text-center py-8">
                        <StickyNote className="h-8 w-8 mx-auto text-muted-foreground opacity-50" />
                        <p className="mt-2 text-sm text-muted-foreground">No staff notes yet</p>
                      </div>
                    )}
                  </div>
                  
                  {ticketDetails.isAddingNote ? (
                    <div className="border rounded-md p-3">
                      <div className="mb-2">
                        <MarkdownHelp />
                      </div>
                      <textarea
                        className="min-h-[120px] w-full resize-none rounded-lg border border-input bg-background p-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring mb-3"
                        placeholder="Add a private staff note here..."
                        value={ticketDetails.newNote || ''}
                        onChange={(e) => {
                          setTicketDetails(prev => ({
                            ...prev,
                            newNote: e.target.value
                          }));
                        }}
                      />
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setTicketDetails(prev => ({
                              ...prev,
                              isAddingNote: false,
                              newNote: ''
                            }));
                          }}
                        >
                          Cancel
                        </Button>
                        <Button 
                          size="sm" 
                          onClick={handleAddNote}
                          disabled={!ticketDetails.newNote?.trim()}
                        >
                          <StickyNote className="h-4 w-4 mr-1.5" />
                          Add Note
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setTicketDetails(prev => ({
                          ...prev,
                          isAddingNote: true
                        }));
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1.5" />
                      Add Staff Note
                    </Button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </PageContainer>
  );
};

// Component to display punishment details for appeals
const PunishmentDetailsCard = ({ punishmentId }: { punishmentId: string }) => {
  const [punishmentData, setPunishmentData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddingEvidence, setIsAddingEvidence] = useState(false);
  const [newEvidence, setNewEvidence] = useState('');
  const [uploadedFile, setUploadedFile] = useState<{
    url: string;
    fileName: string;
    fileType: string;
    fileSize: number;
  } | null>(null);
  const [showAdditionalData, setShowAdditionalData] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    const fetchPunishmentDetails = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Fetch punishment details from the player API
        const response = await fetch(`/api/panel/players/punishment/${punishmentId}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch punishment details');
        }
        
        const data = await response.json();
        setPunishmentData(data);
      } catch (err) {
        console.error('Error fetching punishment details:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    if (punishmentId) {
      fetchPunishmentDetails();
    }
  }, [punishmentId]);

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch (e) {
      return dateString;
    }
  };

  const formatExpiryStatus = (expires: string | null, active: boolean): string => {
    if (!expires) {
      return active ? 'Permanent' : 'Inactive';
    }

    const expiryDate = new Date(expires);
    const now = new Date();
    const timeDiff = expiryDate.getTime() - now.getTime();

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
      }
    };

    if (timeDiff > 0) {
      const timeLeft = formatTimeDifference(timeDiff);
      return `expires in ${timeLeft}`;
    } else {
      const timeAgo = formatTimeDifference(timeDiff);
      return `expired ${timeAgo} ago`;
    }
  };

  const shouldShowReason = (punishmentType: string): boolean => {
    return punishmentType === 'Manual Ban' || punishmentType === 'Manual Mute';
  };

  const isValidBadgeValue = (value: any): boolean => {
    if (!value || value === null || value === undefined) return false;
    if (typeof value === 'number' && value === 0) return false;
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (trimmed.length === 0) return false;
    if (trimmed === '0' || trimmed === 'null' || trimmed === 'undefined' || trimmed === 'false') return false;
    return true;
  };

  const formatDuration = (durationMs: number): string => {
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
      return `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
  };

  const formatDateWithRelative = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const timeDiff = date.getTime() - now.getTime();
      
      // Format the actual date
      const formattedDate = date.toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      // Calculate relative time
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
        }
      };

      const timeAgo = formatTimeDifference(timeDiff);
      
      if (timeDiff > 0) {
        return `${formattedDate} (in ${timeAgo})`;
      } else {
        return `${formattedDate} (${timeAgo} ago)`;
      }
    } catch (e) {
      return dateString;
    }
  };

  if (isLoading) {
    return (
      <div className="bg-muted/20 border border-border rounded-lg p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/10 dark:bg-purple-400/10 rounded-full">
            <Axe className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold mb-2">Punishment Details</h3>
            <div className="text-sm text-muted-foreground">Loading punishment information...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-muted/20 border border-border rounded-lg p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-500/10 dark:bg-red-400/10 rounded-full">
            <Axe className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold mb-2">Punishment Details</h3>
            <div className="text-sm text-red-600 dark:text-red-400">Failed to load punishment information</div>
          </div>
        </div>
      </div>
    );
  }

  if (!punishmentData) {
    return null;
  }

  return (
    <div className="bg-muted/20 border border-border rounded-lg p-4 mb-4">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-purple-500/10 dark:bg-purple-400/10 rounded-full">
          <Axe className="h-5 w-5 text-purple-600 dark:text-purple-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Punishment Details</h3>
            <Badge variant="outline" className="bg-purple-500/10 dark:bg-purple-400/10 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-600">
              ID: {punishmentData.id}
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <span className="text-muted-foreground font-medium">Player:</span>
              <span className="ml-2">
                <ClickablePlayer 
                  playerText={punishmentData.playerUsername}
                  uuid={punishmentData.playerUuid}
                  showIcon={true}
                  className="text-sm"
                >
                  {punishmentData.playerUsername}
                </ClickablePlayer>
              </span>
            </div>
            
            <div>
              <span className="text-muted-foreground font-medium">Type:</span>
              <span className="ml-2">{punishmentData.type}</span>
            </div>
            
            <div>
              <span className="text-muted-foreground font-medium">Issued:</span>
              <span className="ml-2">{formatDateWithRelative(punishmentData.issued)}</span>
            </div>
            
            <div>
              <span className="text-muted-foreground font-medium">Status:</span>
              <span className="ml-2">
                <Badge 
                  variant="outline" 
                  className={
                    punishmentData.active 
                      ? "bg-red-500/10 dark:bg-red-400/10 text-red-700 dark:text-red-400 border-red-300 dark:border-red-600" 
                      : "bg-gray-500/10 dark:bg-gray-400/10 text-gray-700 dark:text-gray-400 border-gray-300 dark:border-gray-600"
                  }
                >
                  {punishmentData.active ? 'Active' : 'Inactive'}
                </Badge>
              </span>
            </div>
            
            {punishmentData.started && (
              <div>
                <span className="text-muted-foreground font-medium">Started:</span>
                <span className="ml-2">{formatDateWithRelative(punishmentData.started)}</span>
              </div>
            )}
            
            <div>
              <span className="text-muted-foreground font-medium">Expiry:</span>
              <span className="ml-2">
                {punishmentData.expires ? formatDateWithRelative(punishmentData.expires) : 
                 punishmentData.active ? 'Permanent' : 'Inactive'}
              </span>
            </div>
            
            <div>
              <span className="text-muted-foreground font-medium">Issued by:</span>
              <span className="ml-2">{punishmentData.issuerName}</span>
            </div>
          </div>

          {/* Badges matching PlayerWindow exactly */}
          <div className="mt-2 flex flex-wrap gap-2">
            {/* Active/Inactive/Unstarted status badge */}
            {(() => {
              if (!punishmentData.started) {
                return (
                  <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900 dark:text-yellow-200 dark:border-yellow-700">
                    Unstarted
                  </Badge>
                );
              }
              
              if (!punishmentData.active) {
                return (
                  <Badge variant="outline" className="text-xs bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600">
                    Inactive
                  </Badge>
                );
              }
              
              return (
                <Badge variant="outline" className="text-xs bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-200 dark:border-green-700">
                  Active
                </Badge>
              );
            })()}

            {/* Punishment type badge */}
            <Badge variant="outline" className="bg-gray-50 text-gray-900 border-gray-300 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600">
              {punishmentData.type}
            </Badge>

            {/* Alt-blocking badge */}
            {punishmentData.altBlocking && (
              <Badge variant="outline" className="text-xs bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900 dark:text-orange-200 dark:border-orange-700">
                Alt-blocking
              </Badge>
            )}

            {/* Severity badge */}
            {isValidBadgeValue(punishmentData.severity) && (
              <Badge variant="outline" className={`text-xs ${
                (punishmentData.severity && punishmentData.severity.toLowerCase() === 'low') || (punishmentData.severity && punishmentData.severity.toLowerCase() === 'lenient') ? 
                  'bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-200 dark:border-green-700' :
                (punishmentData.severity && punishmentData.severity.toLowerCase() === 'regular') || (punishmentData.severity && punishmentData.severity.toLowerCase() === 'medium') ?
                  'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900 dark:text-orange-200 dark:border-orange-700' :
                  'bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200 dark:border-red-700'
              }`}>
                {punishmentData.severity}
              </Badge>
            )}

            {/* Status/Offense level badge */}
            {isValidBadgeValue(punishmentData.status || punishmentData.offenseLevel) && (
              <Badge variant="outline" className={`text-xs ${
                ((punishmentData.status && punishmentData.status.toLowerCase() === 'low') || (punishmentData.status && punishmentData.status.toLowerCase() === 'first') ||
                 (punishmentData.offenseLevel && punishmentData.offenseLevel.toLowerCase() === 'low') || (punishmentData.offenseLevel && punishmentData.offenseLevel.toLowerCase() === 'first')) ? 
                  'bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-200 dark:border-green-700' :
                ((punishmentData.status && punishmentData.status.toLowerCase() === 'medium') || (punishmentData.offenseLevel && punishmentData.offenseLevel.toLowerCase() === 'medium')) ?
                  'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900 dark:text-orange-200 dark:border-orange-700' :
                  'bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200 dark:border-red-700'
              }`}>
                {punishmentData.status || punishmentData.offenseLevel}
              </Badge>
            )}

            {/* Stat-wiping badge */}
            {punishmentData.statWiping && (
              <Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200 dark:border-red-700">
                Stat-Wiping
              </Badge>
            )}
          </div>

          {/* Only show reason for manual punishments */}
          {punishmentData.reason && shouldShowReason(punishmentData.type) && (
            <div className="mt-3 p-3 bg-background rounded-md border border-border">
              <div className="text-muted-foreground font-medium text-sm mb-1">Reason:</div>
              <div className="text-sm">{punishmentData.reason}</div>
            </div>
          )}

          {/* Evidence Section */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <div className="text-muted-foreground font-medium text-sm">Evidence:</div>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => {
                  setIsAddingEvidence(true);
                  setNewEvidence('');
                }}
              >
                <FileText className="h-3 w-3 mr-1" />
                Add Evidence
              </Button>
            </div>
            {punishmentData.evidence && punishmentData.evidence.length > 0 ? (
              <div className="space-y-2">
                {punishmentData.evidence.map((evidenceItem: any, index: number) => {
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
                    const date = evidenceItem.date ? formatDate(evidenceItem.date) : 'Unknown';
                    issuerInfo = `By: ${issuer} on ${date}`;
                    evidenceType = evidenceItem.type || 'text';
                    fileUrl = evidenceItem.fileUrl || '';
                    fileName = evidenceItem.fileName || '';
                    fileType = evidenceItem.fileType || '';
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
                    <div key={index} className="text-sm p-2 bg-background rounded border border-border border-l-4 border-l-blue-500">
                      <div className="flex items-start">
                        <FileText className="h-4 w-4 mr-2 mt-0.5 text-muted-foreground flex-shrink-0" />
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
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No evidence</p>
            )}
            
            {/* Add Evidence Form */}
            {isAddingEvidence && (
              <div className="mt-3 p-3 bg-muted/20 rounded-lg border">
                <p className="text-xs font-medium mb-2">Add Evidence to Punishment</p>
                <div className="flex items-center space-x-2">
                  <textarea
                    className={`flex-1 rounded-md border border-border px-3 py-2 text-sm h-10 resize-none ${
                      uploadedFile ? 'bg-muted text-muted-foreground' : 'bg-background'
                    }`}
                    placeholder="Enter evidence URL or description..."
                    value={uploadedFile ? `📁 ${uploadedFile.fileName}` : newEvidence}
                    onChange={(e) => {
                      // Don't allow editing if a file is uploaded
                      if (uploadedFile) return;
                      setNewEvidence(e.target.value);
                    }}
                    readOnly={!!uploadedFile}
                  />
                  
                  {/* Upload button */}
                  <MediaUpload
                    uploadType="evidence"
                    onUploadComplete={(result, file) => {
                      // Store the uploaded file info
                      setUploadedFile({
                        url: result.url,
                        fileName: file?.name || 'Unknown file',
                        fileType: file?.type || 'application/octet-stream',
                        fileSize: file?.size || 0
                      });
                    }}
                    metadata={{
                      playerId: punishmentData.playerUuid,
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
                    onClick={() => {
                      setIsAddingEvidence(false);
                      setNewEvidence('');
                      setUploadedFile(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={!newEvidence.trim() && !uploadedFile}
                    onClick={async () => {
                      if (!newEvidence.trim() && !uploadedFile) return;
                      
                      try {
                        // Prepare evidence data based on whether it's a file or text
                        let evidenceData: any;
                        
                        if (uploadedFile) {
                          // File evidence
                          evidenceData = {
                            text: uploadedFile.fileName,
                            issuerName: user?.username || 'Staff',
                            date: new Date().toISOString(),
                            type: 'file',
                            fileUrl: uploadedFile.url,
                            fileName: uploadedFile.fileName,
                            fileType: uploadedFile.fileType,
                            fileSize: uploadedFile.fileSize
                          };
                        } else {
                          // Text evidence
                          evidenceData = {
                            text: newEvidence.trim(),
                            issuerName: user?.username || 'Staff',
                            date: new Date().toISOString()
                          };
                        }
                        
                        const { csrfFetch } = await import('@/utils/csrf');
                        const response = await csrfFetch(`/api/panel/players/${punishmentData.playerUuid}/punishments/${punishmentId}/evidence`, {
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
                          description: 'Evidence has been added to the punishment successfully'
                        });
                        
                        // Refresh punishment data
                        const refreshResponse = await fetch(`/api/panel/players/punishment/${punishmentId}`);
                        if (refreshResponse.ok) {
                          const refreshedData = await refreshResponse.json();
                          setPunishmentData(refreshedData);
                        }
                        
                        // Reset form
                        setIsAddingEvidence(false);
                        setNewEvidence('');
                        setUploadedFile(null);
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
          </div>

          {/* Notes Section */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <div className="text-muted-foreground font-medium text-sm">Staff Notes:</div>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => {
                  const newNote = prompt('Enter staff note:');
                  if (newNote?.trim()) {
                    // TODO: Send to server to add note to punishment
                    // This would need a new API endpoint to add notes to existing punishments
                    console.log('Adding note to punishment:', punishmentData.id, newNote);
                  }
                }}
              >
                <StickyNote className="h-3 w-3 mr-1" />
                Add Note
              </Button>
            </div>
            {punishmentData.notes && punishmentData.notes.length > 0 ? (
              <div className="space-y-2">
                {punishmentData.notes.map((note: any, index: number) => {
                  const issuer = note.issuerName || 'System';
                  const date = note.date ? formatDate(note.date) : 'Unknown';
                  const issuerInfo = `By: ${issuer} on ${date}`;
                  
                  return (
                    <div key={index} className="text-sm p-2 bg-background rounded border border-border border-l-4 border-l-green-500">
                      <div className="flex items-start">
                        <StickyNote className="h-4 w-4 mr-2 mt-0.5 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="break-all">{note.text}</span>
                          <p className="text-muted-foreground text-xs mt-1">
                            {issuerInfo}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No staff notes</p>
            )}
          </div>


          {/* Additional Data Section */}
          {punishmentData.data && Object.keys(punishmentData.data).length > 0 && (
            <div className="mt-3">
              <div className="flex items-center gap-2 mb-1">
                <div className="text-muted-foreground font-medium text-sm">Additional Data:</div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1 text-xs"
                  onClick={() => setShowAdditionalData(!showAdditionalData)}
                >
                  {showAdditionalData ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </Button>
              </div>
              {showAdditionalData && (
                <div className="text-xs bg-muted/20 p-2 rounded font-mono">
                  {Object.entries(punishmentData.data).map(([key, value]) => (
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
              )}
            </div>
          )}

          {/* Modifications Section */}
          {punishmentData.modifications && punishmentData.modifications.length > 0 && (
            <div className="mt-3">
              <div className="text-muted-foreground font-medium text-sm mb-1">Modifications:</div>
              <div className="space-y-2">
                {punishmentData.modifications.map((mod: any, index: number) => {
                  const issuer = mod.issuerName || 'System';
                  const date = mod.issued ? formatDate(mod.issued) : 'Unknown';
                  const issuerInfo = `By: ${issuer} on ${date}`;
                  const modType = mod.type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (l: string) => l.toUpperCase());
                  
                  return (
                    <div key={index} className="text-sm p-2 bg-background rounded border border-border border-l-4 border-l-orange-500">
                      <div className="flex items-start">
                        <Settings className="h-4 w-4 mr-2 mt-0.5 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary" className="text-xs">
                              {modType}
                            </Badge>
                          </div>
                          {mod.reason && (
                            <div className="mb-1 break-all">{mod.reason}</div>
                          )}
                          {mod.effectiveDuration !== undefined && (
                            <div className="text-muted-foreground text-xs mb-1">
                              Duration: {formatDuration(mod.effectiveDuration)}
                            </div>
                          )}
                          <p className="text-muted-foreground text-xs mt-1">
                            {issuerInfo}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Attached Reports Section */}
          {punishmentData.attachedTicketIds && punishmentData.attachedTicketIds.length > 0 && (
            <div className="mt-3">
              <div className="text-muted-foreground font-medium text-sm mb-1">Attached Reports:</div>
              <div className="flex flex-wrap gap-2">
                {punishmentData.attachedTicketIds.map((ticketId: string, index: number) => (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => {
                      // Navigate to ticket detail page
                      // Replace # with ID- for URL compatibility
                      const urlSafeTicketId = ticketId.replace('#', 'ID-');
                      window.open(`/panel/tickets/${urlSafeTicketId}`, '_blank');
                    }}
                  >
                    <Ticket className="h-3 w-3 mr-1" />
                    {ticketId}
                  </Button>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default TicketDetail;