import { useState, useEffect } from 'react';
import { useParams, Link } from 'wouter';
import {
  MessageSquare,
  User,
  Calendar,
  Clock,
  Send,
  ArrowLeft,
  Loader2,
  Tag,
  Link2,
  Copy,
  CheckSquare
} from 'lucide-react';
import { Button } from 'modl-shared-web/components/ui/button';
import { Badge } from 'modl-shared-web/components/ui/badge';
import { Textarea } from 'modl-shared-web/components/ui/textarea';
import { Input } from 'modl-shared-web/components/ui/input';
import { Label } from 'modl-shared-web/components/ui/label';
import { Checkbox } from 'modl-shared-web/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'modl-shared-web/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from 'modl-shared-web/components/ui/popover';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from 'modl-shared-web/components/ui/card';
import { useTicket, useAddTicketReply, useSubmitTicketForm, useSettings } from '@/hooks/use-data';
import TicketAttachments from '@/components/TicketAttachments';
import MediaUpload from '@/components/MediaUpload';
import { apiRequest } from '@/lib/queryClient';
import { queryClient } from '@/lib/queryClient';
import { toast } from '@/hooks/use-toast';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import MarkdownHelp from '@/components/ui/markdown-help';

export interface TicketMessage {
  id: string;
  sender: string;
  senderType: 'user' | 'staff' | 'system';
  content: string;
  timestamp: string;
  staff?: boolean;
  attachments?: string[];
  closedAs?: string;
  staffMinecraftUuid?: string; // For staff avatar display
}

interface TicketDetails {
  id: string;
  subject: string;
  status: 'Unfinished' | 'Open' | 'Closed';
  reportedBy: string;
  date: string;
  category: string;
  type: 'bug' | 'player' | 'chat' | 'appeal' | 'staff' | 'support' | 'application';
  messages: TicketMessage[];
  locked?: boolean;
}

interface FormField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'dropdown' | 'multiple_choice' | 'checkbox' | 'file_upload' | 'checkboxes';
  description?: string;
  required: boolean;
  options?: string[];
  order: number;
  sectionId?: string;
  goToSection?: string;
  optionSectionMapping?: Record<string, string>; // Maps option values to section IDs
}

interface FormSection {
  id: string;
  title: string;
  description?: string;
  order: number;
  showIfFieldId?: string;
  showIfValue?: string;
  showIfValues?: string[];
  hideByDefault?: boolean;
}

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

// Avatar component for messages
const MessageAvatar = ({ message, creatorUuid }: { message: TicketMessage, creatorUuid?: string }) => {
  const [avatarError, setAvatarError] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(true);

  // For player messages, use the ticket creator's UUID if available
  if (message.senderType === 'user') {
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

  // For staff messages - use staff Minecraft UUID if available
  if (message.senderType === 'staff' || message.staff) {
    const staffMinecraftUuid = message.staffMinecraftUuid;
    
    if (staffMinecraftUuid && !avatarError) {
      return (
        <div className="relative h-8 w-8 bg-muted rounded-md flex items-center justify-center overflow-hidden flex-shrink-0">
          <img 
            src={`/api/panel/players/avatar/${staffMinecraftUuid}?size=32&overlay=true`}
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
    
    // Fallback for staff without assigned Minecraft UUID
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

const PlayerTicket = () => {
  const { id } = useParams();
  const [playerName, setPlayerName] = useState('');
  const [newReply, setNewReply] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formSubject, setFormSubject] = useState('');
  const [formData, setFormData] = useState<Record<string, string>>({});
  
  // Use React Query to fetch ticket data
  const { data: ticketData, isLoading, isError } = useTicket(id || '');
  
  // Fetch settings to get form templates
  const { data: settingsData, isLoading: isLoadingSettings } = useSettings();
    // Mutation hooks for public ticket operations
  const addReplyMutation = useAddTicketReply();
  const submitFormMutation = useSubmitTicketForm();
  
  const [ticketDetails, setTicketDetails] = useState<TicketDetails>({
    id: "",
    subject: "",
    status: "Open",
    reportedBy: "",
    date: "",
    category: "Player Report",
    type: "player",
    messages: []
  });

  const statusColors = {
    'Unfinished': 'bg-gray-50 text-gray-700 border-gray-200',
    'Open': 'bg-green-50 text-green-700 border-green-200', 
    'Closed': 'bg-gray-50 text-gray-700 border-gray-200'
  };

  // Update ticket details when data is fetched
  useEffect(() => {
    if (ticketData) {
      // Ticket data received
        // Map API data to our TicketDetails interface
      const status = ticketData.status || 'Unfinished';
      // Map the status to one of our three statuses: Unfinished, Open, or Closed
      const mappedStatus = status === 'Unfinished' 
        ? 'Unfinished' 
        : (status === 'Open' || status === 'In Progress') 
          ? 'Open' 
          : 'Closed';      // Ensure we have a valid date
      let validDate = new Date().toISOString(); // fallback to current time
      if (ticketData.created) {
        const createdDate = new Date(ticketData.created);
        if (!isNaN(createdDate.getTime())) {
          validDate = createdDate.toISOString();
        }
      } else if (ticketData.date) {
        const dateFromField = new Date(ticketData.date);
        if (!isNaN(dateFromField.getTime())) {
          validDate = dateFromField.toISOString();
        }
      }

      // Process messages and ensure valid timestamps
      const processedMessages = (ticketData.replies || ticketData.messages || []).map((message: any) => ({
        id: message.id || message._id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        sender: message.sender || message.name || 'Unknown',
        senderType: message.senderType || (message.type === 'staff' ? 'staff' : message.type === 'system' ? 'system' : 'user'),
        content: message.content || '',
        timestamp: message.timestamp || message.created || new Date().toISOString(),
        staff: message.staff,
        attachments: message.attachments,
        closedAs: (message.action === "Comment" || message.action === "Reopen") ? undefined : message.action,
        staffMinecraftUuid: message.staffMinecraftUuid // Preserve staff Minecraft UUID for avatars
      }));
          
      setTicketDetails({
        id: ticketData.id || ticketData._id,
        subject: ticketData.subject || 'No Subject',
        status: mappedStatus as 'Unfinished' | 'Open' | 'Closed',
        reportedBy: ticketData.creator || ticketData.reportedBy || 'Unknown',
        date: validDate,
        category: ticketData.category || 'Other',
        type: ticketData.type || 'bug',
        messages: processedMessages,
        locked: ticketData.locked === true
      });
      
      // If creator is set, use it as the default playerName
      if ((ticketData.creator || ticketData.reportedBy) && !playerName) {
        const name = ticketData.creator || ticketData.reportedBy;
        setPlayerName(name);
        localStorage.setItem('playerName', name);
      }
    }
  }, [ticketData, playerName]);

  const handleSendReply = async () => {
    if (!newReply.trim()) return;
    
    setIsSubmitting(true);
    
    // Use ticket creator name or a default name
    const senderName = ticketDetails.reportedBy || playerName || 'Anonymous';
    
    // Generate a temporary ID for optimistic UI
    const tempId = Date.now().toString();
    const timestamp = new Date().toISOString();
    
    // Create new message for immediate display
    const newMessage: TicketMessage = {
      id: tempId,
      sender: senderName,
      senderType: 'user',
      content: newReply.trim(),
      timestamp: new Date().toISOString(),
      staff: false
    };
    
    // Update UI immediately with the new message
    setTicketDetails(prev => ({
      ...prev,
      messages: [...prev.messages, newMessage]
    }));
    
    // Format the new reply for the API
    const reply = {
      name: senderName,
      type: 'user',
      content: newReply.trim(),
      created: timestamp,
      staff: false
    };
    
    // Clear the reply field
    setNewReply('');
      try {
      // Send the update to the API using the new public reply endpoint
      await addReplyMutation.mutateAsync({
        id: ticketDetails.id,
        reply: reply
      });
      
      // Manually invalidate the cache for background refresh
      queryClient.invalidateQueries({ queryKey: ['/api/public/tickets', ticketDetails.id] });
    } catch (error) {
      console.error('Error sending reply:', error);
      toast({
        title: "Failed to send reply",
        description: "There was an error sending your reply. Please try again.",
        variant: "destructive"
      });
      // Remove the optimistic update since it failed
      setTicketDetails(prev => ({
        ...prev,
        messages: prev.messages.filter(msg => msg.id !== tempId)
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading ticket information...</p>
      </div>
    );
  }

  if (isError || !ticketData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="bg-destructive/10 text-destructive rounded-lg p-6 max-w-md">
          <h2 className="text-xl font-semibold mb-2">Ticket Not Found</h2>
          <p className="mb-4">Sorry, we couldn't find the ticket you're looking for. It may have been deleted or you may not have permission to view it.</p>
        </div>
      </div>
    );
  }



  // Handle form submissions for unfinished tickets
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // For staff/application forms, auto-generate the subject
    const finalSubject = (ticketDetails.type === 'staff' || ticketDetails.type === 'application')
      ? `${playerName || ticketDetails.reportedBy}'s Staff Application` 
      : formSubject.trim();
    
    // Check if subject is required for non-application tickets
    if (ticketDetails.type !== 'staff' && ticketDetails.type !== 'application' && !finalSubject) {
      toast({
        title: "Subject Required",
        description: "Please provide a subject for your ticket.",
        variant: "destructive"
      });
      return;
    }
    
    // Get form configuration from settings - REQUIRED
    let formConfig = null;
    
    try {
      if (settingsData?.settings) {
        const ticketForms = settingsData.settings.ticketForms;
        
        // Try the ticket type first, then try 'application' for 'staff' tickets (legacy support)
        if (ticketForms && ticketForms[ticketDetails.type]) {
          formConfig = ticketForms[ticketDetails.type];
        } else if (ticketDetails.type === 'staff' && ticketForms && ticketForms['application']) {
          formConfig = ticketForms['application'];
        }
      }
    } catch (error) {
      console.error('Error processing form templates:', error);
    }
    
    // If no form config found, show error - no fallback
    if (!formConfig || !formConfig.fields) {
      toast({
        title: "Form Configuration Missing",
        description: `No form configuration found for ${ticketDetails.type} tickets. Please contact support.`,
        variant: "destructive"
      });
      return;
    }
    
    // Check required fields
    for (const field of formConfig.fields) {
      if (field.required && (!formData[field.id] || formData[field.id].trim() === '')) {
        toast({
          title: "Required Field Missing",
          description: `Please complete the "${field.label}" field.`,
          variant: "destructive"
        });
        return;
      }
    }
    
    // Validation already completed above
    
    setIsSubmitting(true);
      try {
      // Submit the form to complete the ticket using the new public endpoint
      await submitFormMutation.mutateAsync({
        id: ticketDetails.id,
        formData: {
          subject: finalSubject,
          formData: formData
        }
      });
      
      // Fetch the updated ticket data
      queryClient.invalidateQueries({ queryKey: ['/api/public/tickets', ticketDetails.id] });
      
      toast({
        title: "Ticket Submitted Successfully",
        description: "Your ticket is now open for staff review.",
        variant: "default"
      });

      window.location.reload();
    } catch (error) {
      console.error('Error submitting ticket form:', error);
      toast({
        title: "Submission Failed",
        description: "There was an error submitting your ticket. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Handle form field changes
  const handleFormFieldChange = (name: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // No fallback forms - only use configured forms

  // Render form based on ticket type
  const renderTicketForm = () => {
    if (isLoadingSettings) {
      return (
        <div className="text-center py-8">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading form configuration...</p>
        </div>
      );
    }
    
    // Get form configuration from settings - REQUIRED
    let formConfig = null;
    
    try {
      if (settingsData?.settings) {
        const ticketForms = settingsData.settings.ticketForms;
        
        // Try the ticket type first, then try 'application' for 'staff' tickets (legacy support)
        if (ticketForms && ticketForms[ticketDetails.type]) {
          formConfig = ticketForms[ticketDetails.type];
        } else if (ticketDetails.type === 'staff' && ticketForms && ticketForms['application']) {
          formConfig = ticketForms['application'];
        }
      }
    } catch (error) {
      console.error('Error processing form templates:', error);
    }
    
    // If no form config found, show error - no fallback
    if (!formConfig || !formConfig.fields) {
      return (
        <div className="text-center py-8 border-2 border-dashed border-red-200 bg-red-50 rounded-lg">
          <div className="text-red-600 mb-4">
            <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-red-800 mb-2">Form Not Configured</h3>
          <p className="text-red-700 mb-4">
            No form configuration found for {ticketDetails.type} tickets.
          </p>
          <p className="text-sm text-red-600">
            Please contact server administration to configure this ticket form.
          </p>
        </div>
      );
    }
    
    const fields = formConfig.fields || [];
    const sectionDefinitions = formConfig.sections || [];
    
    // Ensure we have fields to render
    if (fields.length === 0) {
      return (
        <div className="text-center py-8 border-2 border-dashed border-yellow-200 bg-yellow-50 rounded-lg">
          <div className="text-yellow-600 mb-4">
            <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-yellow-800 mb-2">Empty Form Configuration</h3>
          <p className="text-yellow-700 mb-4">
            The {ticketDetails.type} ticket form has no fields configured.
          </p>
          <p className="text-sm text-yellow-600">
            Please contact server administration to add fields to this ticket form.
          </p>
        </div>
      );
    }
    
    // Group fields by section
    const fieldsBySection: { [key: string]: FormField[] } = {};
    const fieldsWithoutSection: FormField[] = [];
    
    fields.forEach((field: FormField) => {
      if (field.sectionId) {
        if (!fieldsBySection[field.sectionId]) {
          fieldsBySection[field.sectionId] = [];
        }
        fieldsBySection[field.sectionId].push(field);
      } else {
        fieldsWithoutSection.push(field);
      }
    });
    
    // Sort fields within each section by order
    Object.keys(fieldsBySection).forEach(sectionId => {
      fieldsBySection[sectionId].sort((a, b) => a.order - b.order);
    });
    
    // Sort fields without section by order
    fieldsWithoutSection.sort((a, b) => a.order - b.order);

    // Determine which sections should be visible based on current form values and section definitions
    const getVisibleSections = (): Set<string> => {
      const visibleSections = new Set<string>();
      
      // First, add all sections that don't have conditional logic and are not hidden by default
      sectionDefinitions.forEach((section: FormSection) => {
        if (!section.showIfFieldId && !section.hideByDefault) {
          visibleSections.add(section.id);
        }
      });
      
      // Check conditional sections
      sectionDefinitions.forEach((section: FormSection) => {
        if (section.showIfFieldId) {
          const triggerFieldValue = formData[section.showIfFieldId];
          
          if (section.showIfValue && triggerFieldValue === section.showIfValue) {
            visibleSections.add(section.id);
          } else if (section.showIfValues && section.showIfValues.includes(triggerFieldValue)) {
            visibleSections.add(section.id);
          }
        }
      });
      
      // Also check field-level navigation (legacy support and optionSectionMapping)
      fields.forEach((field: FormField) => {
        const fieldValue = formData[field.id];
        
        if (field.optionSectionMapping && fieldValue) {
          if (field.type === 'dropdown') {
            // For dropdown, check if selected value maps to a section
            const targetSection = field.optionSectionMapping[fieldValue];
            if (targetSection) {
              visibleSections.add(targetSection);
            }
          } else if (field.type === 'multiple_choice') {
            // For multiple choice (now single selection), check if selected value maps to a section
            const targetSection = field.optionSectionMapping[fieldValue];
            if (targetSection) {
              visibleSections.add(targetSection);
            }
          } else if (field.type === 'checkboxes') {
            // For checkboxes, check if any selected values map to sections
            const selectedValues = fieldValue.split(',').map(v => v.trim()).filter(v => v);
            selectedValues.forEach(value => {
              const targetSection = field.optionSectionMapping![value];
              if (targetSection) {
                visibleSections.add(targetSection);
              }
            });
          }
        }
      });
      
      return visibleSections;
    };

    const visibleSections = getVisibleSections();

    // Check if a field should be visible based on conditional logic
    const shouldShowField = (field: FormField) => {
      return true; // All fields are shown by default
    };

    const renderField = (field: FormField) => (
      <div key={field.id} className="space-y-1">
        {field.type !== 'checkbox' ?
          <Label htmlFor={field.id} className="font-medium">
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label> : null
        }
        
        {field.description && (
          <p className="text-sm text-muted-foreground mb-1">{field.description}</p>
        )}
        
        {field.type === 'textarea' ? (
          <Textarea
            id={field.id}
            placeholder={`Enter ${field.label.toLowerCase()}`}
            value={formData[field.id] || ''}
            onChange={(e) => handleFormFieldChange(field.id, e.target.value)}
            className={ticketDetails.type === 'application' || ticketDetails.type === 'staff' ? 
              (field.id === 'introduction' || field.id === 'server_perspective' || field.id === 'passion') ? 
                "min-h-[180px]" : "min-h-[120px]" 
              : "min-h-[120px]"}
            required={field.required}
          />
        ) : field.type === 'dropdown' ? (
          <Select
            value={formData[field.id] || ''}
            onValueChange={(value) => handleFormFieldChange(field.id, value)}
          >
            <SelectTrigger>
              <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : field.type === 'checkbox' ? (
          <div className="flex items-start space-x-2 mt-2">
            <Checkbox 
              id={field.id}
              checked={formData[field.id] === "true"}
              onCheckedChange={(checked: boolean) => handleFormFieldChange(field.id, checked ? "true" : "false")}
              required={field.required}
              className="mt-1"
            />
            <label 
              htmlFor={field.id}
              className="text-sm font-normal leading-tight peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </label>
          </div>
        ) : field.type === 'multiple_choice' ? (
          <div className="space-y-2">
            {field.options?.map((option) => (
              <div key={option} className="flex items-center space-x-2">
                <input
                  type="radio"
                  id={`${field.id}-${option}`}
                  name={field.id}
                  value={option}
                  checked={formData[field.id] === option}
                  onChange={(e) => {
                    if (e.target.checked) {
                      handleFormFieldChange(field.id, option);
                    }
                  }}
                  className="h-4 w-4 text-primary focus:ring-primary border-gray-300"
                />
                <label 
                  htmlFor={`${field.id}-${option}`}
                  className="text-sm font-normal leading-tight peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  {option}
                </label>
              </div>
            ))}
          </div>
        ) : field.type === 'checkboxes' ? (
          <div className="space-y-2">
            {field.options?.map((option) => (
              <div key={option} className="flex items-center space-x-2">
                <Checkbox 
                  id={`${field.id}-${option}`}
                  checked={formData[field.id]?.includes(option) || false}
                  onCheckedChange={(checked: boolean) => {
                    const currentValues = formData[field.id] ? formData[field.id].split(',') : [];
                    if (checked) {
                      const newValues = [...currentValues, option].filter(v => v.trim() !== '');
                      handleFormFieldChange(field.id, newValues.join(','));
                    } else {
                      const newValues = currentValues.filter(v => v !== option);
                      handleFormFieldChange(field.id, newValues.join(','));
                    }
                  }}
                  className="mt-1"
                />
                <label 
                  htmlFor={`${field.id}-${option}`}
                  className="text-sm font-normal leading-tight peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {option}
                </label>
              </div>
            ))}
          </div>
        ) : field.type === 'file_upload' ? (
          <div className="space-y-2">
            <MediaUpload
              uploadType="ticket"
              onUploadComplete={(result) => {
                // Store the uploaded file URL in form data
                handleFormFieldChange(field.id, result.url);
              }}
              metadata={{
                ticketId: ticketDetails.id,
                ticketType: ticketDetails.type,
                fieldId: field.id
              }}
              variant="compact"
              maxFiles={1}
            />
            {formData[field.id] && (
              <div className="text-sm text-muted-foreground">
                File uploaded: {formData[field.id].split('/').pop()}
              </div>
            )}
          </div>
        ) : (
          <Input
            id={field.id}
            type="text"
            placeholder={`Enter ${field.label.toLowerCase()}`}
            value={formData[field.id] || ''}
            onChange={(e) => handleFormFieldChange(field.id, e.target.value)}
            required={field.required}
          />
        )}
      </div>
    );
    
    return (
      <form onSubmit={handleFormSubmit} className="space-y-6">
        <div className="space-y-4">
          {ticketDetails.type !== 'staff' && ticketDetails.type !== 'application' && (
            <div>
              <Label htmlFor="subject" className="font-medium">Ticket Subject</Label>
              <Input
                id="subject"
                type="text"
                placeholder="Enter a subject for your ticket"
                value={formSubject}
                onChange={(e) => setFormSubject(e.target.value)}
                className="mt-1"
                required
              />
            </div>
          )}
          
          {/* Render fields without sections first */}
          {fieldsWithoutSection.filter(shouldShowField).map((field: FormField) => renderField(field))}
          
          {/* Render sections in order - only show visible sections */}
          {sectionDefinitions
            .filter(section => visibleSections.has(section.id))
            .sort((a, b) => a.order - b.order)
            .map((section) => {
              const sectionFields = fieldsBySection[section.id] || [];
              if (sectionFields.length === 0) return null;
              
              return (
                <div key={section.id} className="border rounded-lg p-4 space-y-4 bg-muted/20">
                  <div className="border-b pb-2">
                    <h3 className="font-medium text-lg">{section.title}</h3>
                    {section.description && (
                      <p className="text-sm text-muted-foreground mt-1">{section.description}</p>
                    )}
                  </div>
                  {sectionFields.filter(shouldShowField).map((field: FormField) => renderField(field))}
                </div>
              );
            })}
        </div>
        
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <CheckSquare className="mr-2 h-4 w-4" />
                Submit Ticket
              </>
            )}
          </Button>
        </div>
      </form>
    );
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto">
        {/* Security Disclaimer */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="text-yellow-600 mt-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h3 className="font-medium text-yellow-800">Security Notice</h3>
              <p className="text-sm text-yellow-700 mt-1">
                Do not share sensitive information, personal data, or passwords over tickets. The six digit ticket ID is the only authentication on this page; anyone with this ticket ID can view and reply to this ticket as you.
              </p>
            </div>
          </div>
        </div>
        
        {/* Check if the ticket is unfinished and needs a form */}
        {ticketDetails.status === 'Unfinished' ? (
          <Card className="mb-6">
            <CardHeader>
              {(ticketDetails.type === 'staff' || ticketDetails.type === 'application') ? (
                <>
                  <CardTitle>Staff Application</CardTitle>
                  <CardDescription className="mt-2">
                    Thank you for your interest in becoming a volunteer moderator. Please complete the form with honesty and showcase your personality.
                  </CardDescription>
                </>
              ) : ticketDetails.type === 'bug' ? (
                <>
                  <CardTitle>Complete Your Bug Report</CardTitle>
                  <CardDescription>Please provide detailed information about the bug you've encountered</CardDescription>
                </>
              ) : ticketDetails.type === 'player' ? (
                <>
                  <CardTitle>Complete Your Player Report</CardTitle>
                  <CardDescription>Please provide details about the player and the incident</CardDescription>
                </>
              ) : ticketDetails.type === 'chat' ? (
                <>
                  <CardTitle>Complete Your Chat Report</CardTitle>
                  <CardDescription>Please provide information about the chat incident</CardDescription>
                </>
              ) : ticketDetails.type === 'support' ? (
                <>
                  <CardTitle>Complete Your Support Request</CardTitle>
                  <CardDescription>Please tell us how we can help you</CardDescription>
                </>
              ) : (
                <>
                  <CardTitle>Complete Your {ticketDetails.type.charAt(0).toUpperCase() + ticketDetails.type.slice(1)} Ticket</CardTitle>
                  <CardDescription>Please provide the required information below to submit your ticket</CardDescription>
                </>
              )}
            </CardHeader>
            <CardContent>
              {renderTicketForm()}
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Regular ticket view for non-unfinished tickets */}
            <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden mb-6">
              <div className="p-4 bg-muted/30">
                <div className="flex justify-between items-start">
                  <h1 className="text-xl font-semibold">{ticketDetails.subject}</h1>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="border-border bg-background flex items-center gap-1">
                      <Tag className="h-3 w-3" />
                      {ticketDetails.category}
                    </Badge>
                    <Badge className={`text-xs px-2 py-1 font-medium border ${statusColors[ticketDetails.status]}`}>
                      {ticketDetails.status}
                    </Badge>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <User className="h-4 w-4" />
                    <span>Reported by {ticketDetails.reportedBy}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    <span>{formatDate(ticketDetails.date)}</span>
                  </div>
                </div>
              </div>
              <div className="divide-y">
                {ticketDetails.messages.map((message, index) => (
                  <div key={message.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <MessageAvatar message={message} creatorUuid={ticketData?.creatorUuid} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">{message.sender}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(message.timestamp)}
                          </span>
                          {message.senderType === 'staff' && (
                            <Badge variant="secondary" className="text-xs">
                              Staff
                            </Badge>
                          )}
                          {message.senderType === 'system' && (
                            <Badge variant="outline" className="text-xs">
                              System
                            </Badge>
                          )}
                          {message.closedAs && (
                            <Badge variant="outline" className="text-xs">
                              {message.closedAs}
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm">
                          <MarkdownRenderer content={message.content} />
                        </div>
                        {message.attachments && message.attachments.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {message.attachments.map((attachment, i) => (
                              <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Link2 className="h-4 w-4" />
                                <span>{attachment}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Reply section - only show if ticket is Open and not locked */}
            {ticketDetails.status === 'Open' && !ticketDetails.locked && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Reply to Ticket</CardTitle>
                  <CardDescription>
                    Add a reply to this ticket. You can use markdown formatting.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="reply">Reply</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7">
                              <MessageSquare className="h-3 w-3 mr-1" />
                              Formatting Help
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80">
                            <MarkdownHelp />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <Textarea
                        id="reply"
                        value={newReply}
                        onChange={(e) => setNewReply(e.target.value)}
                        placeholder="Type your reply here..."
                        className="min-h-[100px]"
                      />
                    </div>
                    
                    {/* Reply Actions */}
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <TicketAttachments
                          ticketId={ticketDetails.id}
                          ticketType={ticketDetails.type}
                          showTitle={false}
                          compact={true}
                          publicMode={true}
                        />
                      </div>
                      
                      <Button
                        onClick={handleSendReply}
                        disabled={!newReply.trim() || isSubmitting}
                        className="flex items-center"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="mr-2 h-4 w-4" />
                            Send Reply
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PlayerTicket;
