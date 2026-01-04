import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, SearchIcon, ShieldCheck, ShieldX, Send, Paperclip, File, Image, Video, FileText, Eye, X } from 'lucide-react';
import { formatDate } from '../utils/date-utils';
import { getApiUrl, getCurrentDomain, getAvatarUrl } from '@/lib/api';

async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const fullUrl = getApiUrl(url);
  return fetch(fullUrl, {
    ...options,
    credentials: "include",
    headers: {
      ...options.headers,
      "X-Server-Domain": getCurrentDomain(),
    },
  });
}
import { Label } from "@modl-gg/shared-web/components/ui/label";
import { Button } from "@modl-gg/shared-web/components/ui/button";
import { Input } from "@modl-gg/shared-web/components/ui/input";
import { Textarea } from "@modl-gg/shared-web/components/ui/textarea";
import { Checkbox } from "@modl-gg/shared-web/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@modl-gg/shared-web/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@modl-gg/shared-web/components/ui/select";
import MediaUpload from '@/components/MediaUpload';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@modl-gg/shared-web/components/ui/form";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@modl-gg/shared-web/components/ui/card";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@modl-gg/shared-web/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Separator } from '@modl-gg/shared-web/components/ui/separator';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import { useSettings, useCreateAppeal } from '@/hooks/use-data';
import TicketAttachments from '@/components/TicketAttachments';

// Appeal form field interfaces
interface AppealFormField {
  id: string;
  type: 'text' | 'textarea' | 'dropdown' | 'multiple_choice' | 'checkbox' | 'file_upload' | 'checkboxes';
  label: string;
  description?: string;
  required: boolean;
  options?: string[];
  order: number;
  sectionId?: string;
  goToSection?: string;
  optionSectionMapping?: Record<string, string>;
}

interface AppealFormSection {
  id: string;
  title: string;
  description?: string;
  order: number;
  showIfFieldId?: string;
  showIfValue?: string;
  showIfValues?: string[];
  hideByDefault?: boolean;
}

interface AppealFormSettings {
  fields: AppealFormField[];
  sections: AppealFormSection[];
}

// Format date to MM/dd/yy HH:mm in browser's timezone

// Define the search form schema
const searchSchema = z.object({
  banId: z.string().min(6, { message: "Ban ID must be at least 6 characters" }),
});

type SearchFormValues = z.infer<typeof searchSchema>;

// Interface for punishment/ban information
interface BanInfo {
  id: string;
  reason: string;
  date: string;
  staffMember: string;
  status: 'Active' | 'Expired' | 'Pardoned';
  expiresIn?: string;
  type: string;
  playerUuid?: string;
  isAppealable?: boolean; // Whether this punishment type can be appealed
}

// Interface for appeal messages
interface AppealMessage {
  id: string;
  sender: 'player' | 'staff' | 'system';
  senderName: string;
  content: string;
  timestamp: string;
  isStaffNote?: boolean;
  attachments?: Array<{
    id?: string;
    url: string;
    fileName?: string;
    fileType?: string;
    fileSize?: number;
  } | string>; // Support both attachment objects and URL strings for backward compatibility
}

// Interface for appeal information
interface AppealInfo {
  id: string;
  banId: string;
  submittedOn: string;
  status: 'Pending Review' | 'Under Review' | 'Rejected' | 'Approved' | 'Open' | 'Closed';
  lastUpdate?: string;
  messages: AppealMessage[];
}

const AppealsPage = () => {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [banInfo, setBanInfo] = useState<BanInfo | null>(null);
  const [appealInfo, setAppealInfo] = useState<AppealInfo | null>(null);
  const [showAppealForm, setShowAppealForm] = useState(false);
  const [isLoadingPunishment, setIsLoadingPunishment] = useState(false);
  const [newReply, setNewReply] = useState("");
  const [attachments, setAttachments] = useState<Array<{id: string, url: string, key: string, fileName: string, fileType: string, fileSize: number, uploadedAt: string, uploadedBy: string}>>([]);
  const [replyAttachments, setReplyAttachments] = useState<Array<{id: string, url: string, key: string, fileName: string, fileType: string, fileSize: number, uploadedAt: string, uploadedBy: string}>>([]);
  const [forceRerender, setForceRerender] = useState(0); // Force re-render for section visibility

  // Appeal form configuration will come from the punishment-specific data
  const [appealFormSettings, setAppealFormSettings] = useState<AppealFormSettings | undefined>(undefined);

  // API mutations
  const createAppealMutation = useCreateAppeal();

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

  // Reset form when appeal form settings change
  useEffect(() => {
    if (appealFormSettings) {
      const newDefaultValues = {
        banId: appealForm.getValues('banId') || "",
        email: appealForm.getValues('email') || "",
        // Add default values for dynamic fields
        ...Object.fromEntries(
          (Array.isArray(appealFormSettings?.fields) ? appealFormSettings.fields : []).map(field => {
            let defaultValue;
            switch (field.type) {
              case 'checkbox':
                defaultValue = false;
                break;
              case 'checkboxes':
                defaultValue = [];
                break;
              case 'multiple_choice':
              case 'dropdown':
              case 'text':
              case 'textarea':
              case 'file_upload':
              default:
                defaultValue = '';
                break;
            }
            return [field.id, defaultValue];
          })
        ),
      };
      
      // Reset form with new default values but preserve banId and email
      appealForm.reset(newDefaultValues);
    }
  }, [appealFormSettings]);

  // Create dynamic form schema based on appeal form settings
  const createDynamicSchema = () => {
    if (!appealFormSettings?.fields) {
      // Fallback to basic schema if no settings
      return z.object({
        banId: z.string().min(6, { message: "Ban ID must be at least 6 characters" }),
        email: z.string().email({ message: "Please enter a valid email address" }),
        reason: z.string().min(20, { message: "Please provide a detailed explanation (min 20 characters)" }),
      });
    }

    const schemaFields: Record<string, any> = {
      banId: z.string().min(6, { message: "Ban ID must be at least 6 characters" }),
      email: z.string().email({ message: "Please enter a valid email address" }),
    };

    if (Array.isArray(appealFormSettings.fields)) {
      appealFormSettings.fields.forEach(field => {
      switch (field.type) {
        case 'text':
          schemaFields[field.id] = field.required 
            ? z.string().min(1, { message: `${field.label} is required` })
            : z.string().optional();
          break;
        case 'textarea':
          schemaFields[field.id] = field.required 
            ? z.string().min(10, { message: `${field.label} must be at least 10 characters` })
            : z.string().optional();
          break;
        case 'checkbox':
          schemaFields[field.id] = field.required 
            ? z.boolean().refine(val => val === true, { message: `${field.label} must be checked` })
            : z.boolean().optional();
          break;
        case 'dropdown':
        case 'multiple_choice':
          schemaFields[field.id] = field.required 
            ? z.string().min(1, { message: `${field.label} is required` })
            : z.string().optional();
          break;
        case 'checkboxes':
          schemaFields[field.id] = field.required 
            ? z.array(z.string()).min(1, { message: `At least one ${field.label} must be selected` })
            : z.array(z.string()).optional();
          break;
        case 'file_upload':
          schemaFields[field.id] = field.required 
            ? z.union([
                z.array(z.any()).min(1, { message: `${field.label} is required` }),
                z.string().min(1, { message: `${field.label} is required` })
              ])
            : z.union([z.array(z.any()), z.string()]).optional();
          break;
      }
    });
    }

    return z.object(schemaFields);
  };

  const dynamicSchema = createDynamicSchema();
  type DynamicFormValues = z.infer<typeof dynamicSchema>;

  // Dynamic form
  const appealForm = useForm<DynamicFormValues>({
    resolver: zodResolver(dynamicSchema),
    defaultValues: {
      banId: "",
      email: "",
      // Add default values for dynamic fields
      ...Object.fromEntries(
        (Array.isArray(appealFormSettings?.fields) ? appealFormSettings.fields : []).map(field => {
          let defaultValue;
          switch (field.type) {
            case 'checkbox':
              defaultValue = false;
              break;
            case 'checkboxes':
              defaultValue = [];
              break;
            case 'multiple_choice':
            case 'dropdown':
            case 'text':
            case 'textarea':
            case 'file_upload':
            default:
              defaultValue = '';
              break;
          }
          return [field.id, defaultValue];
        })
      ),
    },
  });

  // Search form
  const searchForm = useForm<SearchFormValues>({
    resolver: zodResolver(searchSchema),
    defaultValues: {
      banId: "",
    },
  });

  // Handle search form submission
  const onSearchSubmit = async (values: SearchFormValues) => {
    const normalizedBanId = values.banId.toUpperCase().replace(/\s/g, '');
    setIsLoadingPunishment(true);

    try {
      // Fetch punishment information from public API
      const response = await apiFetch(`/v1/public/punishment/${normalizedBanId}/appeal-info`);
      
      if (!response.ok) {
        if (response.status === 400) {
          // Check if it's an unstarted punishment error
          const errorData = await response.json();
          if (errorData.error?.includes('not been started yet')) {
            toast({
              title: "Cannot Appeal Unstarted Punishment",
              description: "This punishment has not been started yet and cannot be appealed at this time.",
              variant: "destructive"
            });
            return;
          }
        }
        throw new Error('Punishment not found');
      }

      const punishment = await response.json();
        // Transform punishment data to BanInfo format
      const banInfo: BanInfo = {
        id: punishment.id,
        reason: 'Punishment details are not available publicly', // Reason is no longer provided by public API
        date: formatDate(punishment.issued),
        staffMember: 'Staff', // Public API doesn't expose staff member names
        status: punishment.active ? 'Active' : 'Expired',
        expiresIn: punishment.expires ? formatDate(punishment.expires) : 'Permanent', // Use the expires field from API
        type: punishment.type,
        playerUuid: punishment.playerUuid, // Use the actual UUID from the API response
        isAppealable: punishment.appealable, // Use the appealable field from public API
      };

      setBanInfo(banInfo);

      // Set punishment-specific appeal form configuration
      if (punishment.appealForm) {
        setAppealFormSettings(punishment.appealForm);
      } else {
        // Fallback to default appeal form if punishment type doesn't have one
        setAppealFormSettings({
          fields: [
            {
              id: 'reason',
              type: 'textarea',
              label: 'Appeal Reason',
              description: 'Please explain why you believe this punishment should be removed or reduced.',
              required: true,
              order: 1,
              sectionId: 'default_section'
            }
          ],
          sections: [
            {
              id: 'default_section',
              title: 'Appeal Information',
              description: 'Please provide information about your appeal',
              order: 0
            }
          ]
        });
      }

      // Check for existing appeals from the public API response
      if (punishment.existingAppeal) {
        // Set basic appeal info first
        const basicAppealInfo: AppealInfo = {
          id: punishment.existingAppeal.id,
          banId: punishment.id,
          submittedOn: punishment.existingAppeal.submittedDate,
          status: punishment.existingAppeal.status,
          lastUpdate: punishment.existingAppeal.submittedDate,
          messages: []
        };
        setAppealInfo(basicAppealInfo);
        setShowAppealForm(false);
        
        // Fetch full appeal details including messages
        await fetchAppealDetails(punishment.existingAppeal.id);
        
        // Show toast for existing appeal
        toast({
          title: "Appeal Already Exists",
          description: `You have already submitted an appeal for this punishment. Status: ${punishment.existingAppeal.status}`,
          variant: "default"
        });
      } else {        
        // Check if punishment is not appealable
        if (banInfo.isAppealable === false) {
          toast({
            title: "Cannot Appeal This Punishment",
            description: "This punishment type is not eligible for appeals. Contact support if you believe this is an error.",
            variant: "destructive"
          });
          setShowAppealForm(false);
          setAppealInfo(null);
        } else if (banInfo.status !== 'Active') {
          // Punishment is not active (expired/pardoned)
          toast({
            title: "Cannot Appeal Inactive Punishment",
            description: "Only active punishments can be appealed. This punishment is no longer active.",
            variant: "destructive"
          });
          setShowAppealForm(false);
          setAppealInfo(null);
        } else {
          // Show appeal form if no existing appeal and punishment is active and appealable
          const canAppeal = banInfo.status === 'Active' && banInfo.isAppealable !== false;
          setShowAppealForm(canAppeal);
          setAppealInfo(null);
        }
      }

      // Prefill form with punishment ID
      appealForm.setValue('banId', normalizedBanId);

    } catch (error) {
      console.error('Error fetching punishment:', error);
      setBanInfo(null);
      setAppealInfo(null);
      setShowAppealForm(false);
      toast({
        title: "Punishment not found",
        description: `No punishment found with ID: ${normalizedBanId}`,
        variant: "destructive"
      });
    } finally {
      setIsLoadingPunishment(false);
    }
  };

  // Handle appeal form submission (similar to ticket form submission)
  const onAppealSubmit = async (values: DynamicFormValues) => {
    if (!banInfo) return;

    try {
      // Create initial message content from form data (similar to ticket system)
      let contentString = '';
      
      // Create a map of field IDs to labels
      const fieldLabels: Record<string, string> = {};
      if (appealFormSettings?.fields) {
        appealFormSettings.fields.forEach((field) => {
          fieldLabels[field.id] = field.label;
        });
      }
      
      // Collect all attachments from file upload fields
      const allAttachments: any[] = [];
      
      // Convert form data to structured message content
      Object.entries(values).forEach(([key, value]) => {
        // Skip system fields
        if (['banId', 'email'].includes(key)) return;
        
        // Get the field from form configuration
        const field = appealFormSettings?.fields?.find(f => f.id === key);
        const fieldLabel = field?.label || key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
        
        // Handle file upload fields differently
        if (field?.type === 'file_upload') {
          const files = Array.isArray(value) ? value : (value && typeof value === 'string' ? [value] : []);
          if (files.length > 0) {
            // Add files to attachments array for actual file uploads
            files.forEach((file: any) => {
              if (typeof file === 'object' && file.url) {
                allAttachments.push({
                  url: file.url,
                  fileName: file.fileName || file.url.split('/').pop() || 'file',
                  fileType: file.fileType || 'application/octet-stream',
                  fileSize: file.fileSize || 0
                });
              } else if (typeof file === 'string' && file.trim()) {
                allAttachments.push({
                  url: file,
                  fileName: file.split('/').pop() || 'file',
                  fileType: 'application/octet-stream'
                });
              }
            });
            
            // Show uploaded file names in the content (not as separate attachments list)
            if (files.length > 0) {
              const fileNames = files.map((file: any) => {
                if (typeof file === 'object' && file.fileName) {
                  return `• ${file.fileName}`;
                } else if (typeof file === 'string') {
                  return `• ${file.split('/').pop() || 'file'}`;
                }
                return '• file';
              }).join('\n');
              contentString += `**${fieldLabel}:**\n${fileNames}\n\n`;
            }
          }
        } else {
          // Handle regular fields - only include if they have actual content
          const hasValue = value !== null && value !== undefined && 
            (typeof value === 'string' ? value.trim() !== '' : 
             Array.isArray(value) ? value.length > 0 : 
             typeof value === 'boolean' ? true : 
             value.toString().trim() !== '');
          
          if (hasValue) {
            // Format the value properly
            let displayValue = value;
            if (Array.isArray(value)) {
              // For checkboxes - show as bullet list
              displayValue = value.map(v => `• ${v}`).join('\n');
            } else if (typeof value === 'boolean') {
              displayValue = value ? 'Yes' : 'No';
            }
            
            contentString += `**${fieldLabel}:**\n${displayValue}\n\n`;
          }
        }
      });

      // Extract main reason field (look for common reason field names)
      const reasonFieldNames = ['reason', 'appeal_reason', 'why_appeal', 'explanation'];
      const reasonField = appealFormSettings?.fields?.find(field => 
        reasonFieldNames.includes(field.id.toLowerCase()) || 
        field.label.toLowerCase().includes('reason') ||
        field.label.toLowerCase().includes('why')
      );
      const mainReason = reasonField ? values[reasonField.id] : '';
      
      // Extract evidence field
      const evidenceFieldNames = ['evidence', 'proof', 'screenshots', 'links'];
      const evidenceField = appealFormSettings?.fields?.find(field => 
        evidenceFieldNames.includes(field.id.toLowerCase()) ||
        field.label.toLowerCase().includes('evidence') ||
        field.label.toLowerCase().includes('proof')
      );
      const evidence = evidenceField ? values[evidenceField.id] : '';
      
      // All other form data goes to additionalData
      const additionalData = Object.fromEntries(
        Object.entries(values).filter(([key]) => 
          !['banId', 'email'].includes(key) && 
          key !== reasonField?.id && 
          key !== evidenceField?.id
        )
      );

      // Create field labels mapping for server
      const fieldLabelsMapping: Record<string, string> = {};
      if (appealFormSettings?.fields) {
        appealFormSettings.fields.forEach((field) => {
          fieldLabelsMapping[field.id] = field.label;
        });
      }

      // Create appeal data matching server expectations
      const appealData = {
        punishmentId: values.banId,
        playerUuid: banInfo.playerUuid,
        email: values.email,
        reason: mainReason,
        evidence: evidence,
        additionalData: additionalData,
        attachments: allAttachments,
        fieldLabels: fieldLabelsMapping  // Send field labels to server
      };

      await createAppealMutation.mutateAsync(appealData);

      toast({
        title: "Appeal Submitted",
        description: `Your appeal for punishment ${values.banId} has been submitted and will be reviewed by our staff.`,
      });

      // Refresh the page data
      setShowAppealForm(false);
      setAttachments([]);
      onSearchSubmit({ banId: values.banId });

    } catch (error) {
      console.error('Error submitting appeal:', error);
      toast({
        title: "Error",
        description: "Failed to submit appeal. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Fetch full appeal details when an existing appeal is found
  const fetchAppealDetails = async (appealId: string) => {
    try {
      const response = await apiFetch(`/v1/public/appeals/${appealId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch appeal details');
      }
      const appealData = await response.json();
      
      // Transform the appeal data to match our interface
      const fullAppealInfo: AppealInfo = {
        id: appealData._id || appealData.id,
        banId: appealData.data?.punishmentId || banInfo?.id || '',
        submittedOn: appealData.created || appealData.submittedDate,
        status: appealData.status,
        lastUpdate: appealData.updatedAt || appealData.created,
        messages: (appealData.replies || []).map((reply: any) => ({
          id: reply._id || reply.id || `msg-${Date.now()}-${Math.random()}`,
          sender: reply.type === 'player' || reply.senderType === 'user' ? 'player' : 
                  reply.type === 'staff' || reply.senderType === 'staff' ? 'staff' : 'system',
          senderName: reply.name || reply.sender,
          content: reply.content,
          timestamp: reply.created || reply.timestamp,
          isStaffNote: reply.type === 'staff-note',
          attachments: reply.attachments || []
        }))
      };
      
      setAppealInfo(fullAppealInfo);
    } catch (error) {
      console.error('Error fetching appeal details:', error);
      // Keep basic appeal info if detailed fetch fails
    }
  };

  // Handle sending a reply to an existing appeal
  const handleSendReply = async () => {
    if (!newReply.trim() || !appealInfo) return;

    try {
      const response = await apiFetch(`/v1/public/appeals/${appealInfo.id}/replies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'You',
          content: newReply,
          type: 'player',
          staff: false,
          attachments: replyAttachments, // Include full attachment data
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send reply');
      }

      // Refresh appeal details
      await fetchAppealDetails(appealInfo.id);
      setNewReply("");
      setReplyAttachments([]); // Clear reply attachments

      toast({
        title: "Reply Sent",
        description: "Your reply has been added to the appeal.",
      });

    } catch (error) {
      console.error('Error sending reply:', error);
      toast({
        title: "Error",
        description: "Failed to send reply. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Render dynamic form field
  const renderFormField = (field: AppealFormField) => {
    switch (field.type) {
      case 'text':
        return (
          <FormField
            key={field.id}
            control={appealForm.control}
            name={field.id as any}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>{field.label}</FormLabel>
                <FormControl>
                  <Input {...formField} placeholder={field.description} />
                </FormControl>
                {field.description && (
                  <FormDescription>{field.description}</FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'textarea':
        return (
          <FormField
            key={field.id}
            control={appealForm.control}
            name={field.id as any}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>{field.label}</FormLabel>
                <FormControl>
                  <Textarea 
                    {...formField} 
                    placeholder={field.description}
                    className="min-h-[100px]"
                  />
                </FormControl>
                {field.description && (
                  <FormDescription>{field.description}</FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'checkbox':
        return (
          <FormField
            key={field.id}
            control={appealForm.control}
            name={field.id as any}
            render={({ field: formField }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                <FormControl>
                  <Checkbox
                    checked={formField.value}
                    onCheckedChange={formField.onChange}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>{field.label}</FormLabel>
                  {field.description && (
                    <FormDescription>{field.description}</FormDescription>
                  )}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'dropdown':
        return (
          <FormField
            key={field.id}
            control={appealForm.control}
            name={field.id as any}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>{field.label}</FormLabel>
                <Select 
                  onValueChange={(value) => {
                    formField.onChange(value);
                    
                    // Handle section navigation - force form re-validation to trigger conditional renders
                    if (field.optionSectionMapping && field.optionSectionMapping[value]) {
                      // Force re-render by updating state
                      setForceRerender(prev => prev + 1);
                    } else if (field.goToSection) {
                      // Navigate to specific section
                      setForceRerender(prev => prev + 1);
                    }
                  }} 
                  defaultValue={formField.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={field.description || "Select an option"} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {field.options?.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {field.description && (
                  <FormDescription>{field.description}</FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'multiple_choice':
        return (
          <FormField
            key={field.id}
            control={appealForm.control}
            name={field.id as any}
            render={({ field: formField }) => (
              <FormItem className="space-y-3">
                <FormLabel>{field.label}</FormLabel>
                <FormControl>
                  <RadioGroup
                    onValueChange={(value) => {
                      formField.onChange(value);
                      
                      // Handle section navigation - force form re-validation to trigger conditional renders
                      if (field.optionSectionMapping && field.optionSectionMapping[value]) {
                        // Force re-render by updating state
                        setForceRerender(prev => prev + 1);
                      } else if (field.goToSection) {
                        // Navigate to specific section
                        setForceRerender(prev => prev + 1);
                      }
                    }}
                    defaultValue={formField.value}
                    className="flex flex-col space-y-1"
                  >
                    {field.options?.map((option) => (
                      <FormItem key={option} className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value={option} />
                        </FormControl>
                        <FormLabel className="font-normal">
                          {option}
                        </FormLabel>
                      </FormItem>
                    ))}
                  </RadioGroup>
                </FormControl>
                {field.description && (
                  <FormDescription>{field.description}</FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'checkboxes':
        return (
          <FormField
            key={field.id}
            control={appealForm.control}
            name={field.id as any}
            render={() => (
              <FormItem>
                <div className="mb-4">
                  <FormLabel className="text-base">{field.label}</FormLabel>
                  {field.description && (
                    <FormDescription>{field.description}</FormDescription>
                  )}
                </div>
                {field.options?.map((option) => (
                  <FormField
                    key={option}
                    control={appealForm.control}
                    name={field.id as any}
                    render={({ field: formField }) => {
                      return (
                        <FormItem
                          key={option}
                          className="flex flex-row items-start space-x-3 space-y-0"
                        >
                          <FormControl>
                            <Checkbox
                              checked={Array.isArray(formField.value) && formField.value.includes(option)}
                              onCheckedChange={(checked) => {
                                const current = Array.isArray(formField.value) ? formField.value : [];
                                return checked
                                  ? formField.onChange([...current, option])
                                  : formField.onChange(
                                      current.filter((value: string) => value !== option)
                                    );
                              }}
                            />
                          </FormControl>
                          <FormLabel className="font-normal">
                            {option}
                          </FormLabel>
                        </FormItem>
                      )
                    }}
                  />
                ))}
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'file_upload':
        return (
          <FormField
            key={field.id}
            control={appealForm.control}
            name={field.id as any}
            render={({ field: formField }) => {
              const currentFiles = Array.isArray(formField.value) ? formField.value : formField.value ? [formField.value] : [];
              
              const handleFileUpload = (result: { url: string; key: string }, file?: File) => {
                const newFile = {
                  id: Date.now().toString(),
                  url: result.url,
                  key: result.key,
                  fileName: file?.name || result.url.split('/').pop() || 'file',
                  fileType: file?.type || 'application/octet-stream',
                  fileSize: file?.size || 0
                };
                
                const updatedFiles = [...currentFiles, newFile];
                formField.onChange(updatedFiles);
              };
              
              const handleRemoveFile = (fileToRemove: any) => {
                const updatedFiles = currentFiles.filter((file: any) => file.id !== fileToRemove.id);
                formField.onChange(updatedFiles);
              };
              
              return (
                <FormItem>
                  <FormLabel>{field.label}</FormLabel>
                  <FormControl>
                    <div className="space-y-2">
                      <MediaUpload
                        uploadType="appeal"
                        onUploadComplete={handleFileUpload}
                        metadata={{
                          appealId: appealForm.getValues('banId') || 'unknown',
                          fieldId: field.id
                        }}
                        variant="compact"
                        maxFiles={5}
                      />
                      
                      {/* Display uploaded files */}
                      {currentFiles.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <div className="text-sm font-medium text-muted-foreground">Uploaded files:</div>
                          {currentFiles.map((file: any) => (
                            <div key={file.id} className="flex items-center justify-between p-2 bg-muted/50 rounded border">
                              <div className="flex items-center gap-2">
                                {getFileIcon(file.fileType)}
                                <span className="text-sm">{file.fileName}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveFile(file)}
                                className="text-destructive hover:text-destructive/80 text-sm"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </FormControl>
                  {field.description && (
                    <FormDescription>{field.description}</FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              );
            }}
          />
        );

      default:
        return null;
    }
  };

  // Avatar component for messages (copied from player-ticket)
  const MessageAvatar = ({ message, creatorUuid }: { message: AppealMessage, creatorUuid?: string }) => {
    const [avatarError, setAvatarError] = useState(false);
    const [avatarLoading, setAvatarLoading] = useState(true);

    // For player messages, use the player's UUID if available
    if (message.sender === 'player') {
      if (banInfo?.playerUuid && !avatarError) {
        return (
          <div className="relative h-8 w-8 bg-muted rounded-md flex items-center justify-center overflow-hidden flex-shrink-0">
            <img 
              src={getAvatarUrl(banInfo.playerUuid, 32, true)}
              alt={`${message.senderName} Avatar`}
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
                <span className="text-xs font-bold text-primary">{message.senderName?.substring(0, 2) || 'P'}</span>
              </div>
            )}
          </div>
        );
      }
      // Fallback for player without UUID
      return (
        <div className="h-8 w-8 bg-blue-100 rounded-md flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-blue-600">{message.senderName?.substring(0, 2) || 'P'}</span>
        </div>
      );
    }

    // For staff messages
    if (message.sender === 'staff') {
      return (
        <div className="h-8 w-8 bg-green-100 rounded-md flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-green-600">{message.senderName?.substring(0, 2) || 'S'}</span>
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

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header section */}
        <div className="flex flex-col space-y-2 mb-8 text-center">
          <h1 className="text-3xl font-bold">Punishment Appeal</h1>
          <p className="text-muted-foreground">
            Check the status of or submit an appeal for review
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <Form {...searchForm}>
              <form onSubmit={searchForm.handleSubmit(onSearchSubmit)} className="space-y-4">
                <FormField
                  control={searchForm.control}
                  name="banId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Punishment ID</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <SearchIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input
                            {...field}
                            placeholder="e.g. BAN123456"
                            className="pl-10"
                            disabled={isLoadingPunishment}
                          />
                        </div>
                      </FormControl>
                      <FormDescription>
                        Enter the Punishment ID you received with your ban/mute
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full mt-6" disabled={isLoadingPunishment}>
                  {isLoadingPunishment ? "Searching..." : "Check Status"}
                </Button>
              </form>
            </Form>
            
            {/* Ban Information Section */}
            {banInfo && (
              <div className="mt-8 space-y-4">
                <h3 className="text-lg font-semibold">Punishment Information</h3>
                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Punishment ID:</span>
                    <Badge variant="outline">{banInfo.id}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Type:</span>
                    <Badge variant="outline">{banInfo.type}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Date:</span>
                    <span className="text-sm">{banInfo.date}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Status:</span>
                    <Badge 
                      variant={banInfo.status === 'Active' ? "destructive" : 
                              banInfo.status === 'Pardoned' ? "outline" : "default"}
                      className={banInfo.status === 'Pardoned' ? "border-green-500 text-green-500" : ""}
                    >
                      {banInfo.status}
                      {banInfo.expiresIn && ` (Expires: ${banInfo.expiresIn})`}
                    </Badge>
                  </div>
                </div>
              </div>
            )}
            
            {/* Appeal Information Section */}
            {appealInfo && (
              <div className="mt-8 space-y-4">
                <h3 className="text-lg font-semibold">Appeal Status</h3>
                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Appeal ID:</span>
                    <Badge variant="outline">{appealInfo.id}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Submitted:</span>
                    <span className="text-sm">{formatDate(appealInfo.submittedOn)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Status:</span>
                    <Badge 
                      variant={
                        appealInfo.status === 'Approved' ? "outline" :
                        appealInfo.status === 'Rejected' ? "destructive" :
                        appealInfo.status.includes('Review') ? "default" : "outline"
                      }
                      className={appealInfo.status === 'Approved' ? "border-green-500 text-green-500" : ""}
                    >
                      {appealInfo.status}
                    </Badge>
                  </div>
                  {appealInfo.lastUpdate && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Last Update:</span>
                      <span className="text-sm">{formatDate(appealInfo.lastUpdate)}</span>
                    </div>
                  )}
                </div>
                
                {appealInfo.status === 'Pending Review' && (
                  <Alert className="mt-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Appeal Under Review</AlertTitle>
                    <AlertDescription>
                      Your appeal is in the queue and will be reviewed by our staff. This process typically takes 1-3 days.
                    </AlertDescription>
                  </Alert>
                )}
                
                {appealInfo.status === 'Rejected' && (
                  <Alert variant="destructive" className="mt-4">
                    <ShieldX className="h-4 w-4" />
                    <AlertTitle>Appeal Rejected</AlertTitle>
                    <AlertDescription>
                      Your appeal has been reviewed and rejected. You may submit a new appeal after 30 days.
                    </AlertDescription>
                  </Alert>
                )}
                
                {appealInfo.status === 'Approved' && (
                  <Alert className="mt-4 border-green-500 text-green-500 bg-green-50 dark:bg-green-950 dark:bg-opacity-20">
                    <ShieldCheck className="h-4 w-4" />
                    <AlertTitle>Appeal Approved</AlertTitle>
                    <AlertDescription>
                      Your appeal has been approved! Your punishment has been lifted or reduced.
                    </AlertDescription>
                  </Alert>
                )}
                
                {/* Messages Section */}
                {appealInfo.messages && appealInfo.messages.length > 0 && (
                  <div className="mt-6">
                    <Separator />
                    <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden mt-4">
                      <div className="p-3 bg-muted/30">
                        <h4 className="font-semibold">Appeal Conversation</h4>
                      </div>
                      <div className="divide-y max-h-[400px] overflow-y-auto">
                        {appealInfo.messages
                          .filter(message => !message.isStaffNote && message.sender !== 'system')
                          .map((message) => (
                            <div key={message.id} className="p-4">
                              <div className="flex items-start gap-3">
                                <MessageAvatar message={message} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-medium text-sm">{message.senderName}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {formatDate(message.timestamp)}
                                    </span>
                                    {message.sender === 'staff' && (
                                      <Badge variant="secondary" className="text-xs">
                                        Staff
                                      </Badge>
                                    )}
                                    {message.sender === 'system' && (
                                      <Badge variant="outline" className="text-xs">
                                        System
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-sm">
                                    <div className="whitespace-pre-wrap break-words" style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
                                    
                                    {/* Display message attachments */}
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
                            </div>
                          ))}
                      </div>
                    </div>
                    
                    {/* Reply input */}
                    {appealInfo.status !== 'Approved' && appealInfo.status !== 'Rejected' && appealInfo.status !== 'Closed' && appealInfo.status !== 'Denied' && (
                      <Card className="mt-4">
                        <CardHeader>
                          <CardTitle className="text-lg">Reply to Appeal</CardTitle>
                          <CardDescription>
                            Add a reply to your appeal. This will be visible to staff reviewing your case.
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="reply">Reply</Label>
                              <Textarea
                                id="reply"
                                value={newReply}
                                onChange={(e) => setNewReply(e.target.value)}
                                placeholder="Type your reply here..."
                                className="min-h-[100px]"
                              />
                            </div>
                            
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
                                uploadType="appeal"
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
                                      uploadedBy: 'You'
                                    };
                                    setReplyAttachments(prev => [...prev, newAttachment]);
                                  }
                                }}
                                metadata={{
                                  appealId: appealInfo?.id || 'unknown',
                                  fieldId: 'reply'
                                }}
                                variant="button-only"
                                maxFiles={5}
                              />
                              <Button
                                onClick={handleSendReply}
                                disabled={!newReply.trim()}
                                className="flex items-center"
                              >
                                <Send className="mr-2 h-4 w-4" />
                                Send Reply
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </div>
            )}
            
            {/* Dynamic Appeal Form */}
            {showAppealForm && banInfo && (
              <div className="mt-8 space-y-4">
                <Separator />
                
                {/* Unavailable punishment type notice */}
                {banInfo.isAppealable === false && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Appeal Not Available</AlertTitle>
                    <AlertDescription>
                      This punishment type is not appealable. If you believe this is in error, please contact support directly.
                    </AlertDescription>
                  </Alert>
                )}
                
                {/* Dynamic Appeal Form */}
                {banInfo.isAppealable !== false && (
                  <Card className="mb-6">
                    <CardHeader>
                      <CardTitle>Submit Appeal</CardTitle>
                      <CardDescription>
                        Please provide detailed information about why you believe this punishment should be reviewed. Be honest and thorough in your explanation.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                  <Form {...appealForm}>
                    <form onSubmit={appealForm.handleSubmit(onAppealSubmit)} className="space-y-4">
                      {/* Punishment ID Field (Read-only) */}
                      <FormField
                        control={appealForm.control}
                        name="banId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Punishment ID</FormLabel>
                            <FormControl>
                              <Input {...field} readOnly disabled />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      {/* Email Field */}
                      <FormField
                        control={appealForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email Address</FormLabel>
                            <FormControl>
                              <Input {...field} type="email" placeholder="Your email for notifications" />
                            </FormControl>
                            <FormDescription>
                              We'll notify you when your appeal is processed
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      {/* Dynamic Fields with Sections */}
                      {appealFormSettings?.sections && Array.isArray(appealFormSettings.sections) && appealFormSettings.sections.length > 0 && 
                        appealFormSettings.sections
                          .sort((a, b) => a.order - b.order)
                          .map(section => {
                            // Check section visibility with forceRerender dependency
                            let isVisible = !section.hideByDefault;
                            
                            // Show section if condition is met
                            if (section.showIfFieldId && section.showIfValue) {
                              const fieldValue = appealForm.watch(section.showIfFieldId);
                              isVisible = fieldValue === section.showIfValue;
                            } else if (section.showIfFieldId && section.showIfValues) {
                              const fieldValue = appealForm.watch(section.showIfFieldId);
                              isVisible = section.showIfValues.includes(fieldValue);
                            }
                            
                            // Check if any field in this section has optionSectionMapping that targets this section
                            if (!isVisible && appealFormSettings?.fields) {
                              appealFormSettings.fields.forEach(field => {
                                if (field.optionSectionMapping) {
                                  const fieldValue = appealForm.watch(field.id);
                                  if (field.optionSectionMapping[fieldValue] === section.id) {
                                    isVisible = true;
                                  }
                                }
                              });
                            }
                            
                            if (!isVisible) return null;
                            
                            return (
                              <div key={section.id} className="border rounded-lg p-4 space-y-4 bg-muted/20">
                                <div className="border-b pb-2">
                                  <h3 className="font-medium text-lg">{section.title}</h3>
                                  {section.description && (
                                    <p className="text-sm text-muted-foreground mt-1">{section.description}</p>
                                  )}
                                </div>
                                {appealFormSettings?.fields && Array.isArray(appealFormSettings.fields) && appealFormSettings.fields.length > 0 &&
                                  appealFormSettings.fields
                                    .filter(field => field.sectionId === section.id)
                                    .sort((a, b) => a.order - b.order)
                                    .map(field => renderFormField(field))}
                              </div>
                            );
                          })
                          .filter(Boolean)}
                      
                      {/* Fields not in any section (should be minimal with new system) */}
                      {appealFormSettings?.fields && Array.isArray(appealFormSettings.fields) &&
                        appealFormSettings.fields
                          .filter(field => !field.sectionId)
                          .sort((a, b) => a.order - b.order)
                          .map(field => renderFormField(field))}
                      
                      {/* Fallback reason field if no dynamic fields */}
                      {(!appealFormSettings?.fields || !Array.isArray(appealFormSettings.fields) || appealFormSettings.fields.length === 0) && (
                        <FormField
                          control={appealForm.control}
                          name="reason"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Appeal Reason</FormLabel>
                              <FormControl>
                                <Textarea
                                  {...field}
                                  placeholder="Explain why you believe this punishment should be reviewed..."
                                  className="min-h-[120px]"
                                />
                              </FormControl>
                              <FormDescription>
                                Be honest and provide as much detail as possible
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                      
                    </form>
                  </Form>
                    </CardContent>
                    <CardFooter>
                      <Button 
                        type="submit" 
                        className="w-full" 
                        disabled={createAppealMutation.isPending}
                        onClick={appealForm.handleSubmit(onAppealSubmit)}
                      >
                        {createAppealMutation.isPending ? "Submitting..." : "Submit Appeal"}
                      </Button>
                    </CardFooter>
                  </Card>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AppealsPage;
