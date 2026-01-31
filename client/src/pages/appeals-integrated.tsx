import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, SearchIcon, ShieldCheck, ShieldX, Send } from 'lucide-react';
import { formatDate } from '../utils/date-utils';
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useSettings, useCreateAppeal, useAppealsByPunishment } from '@/hooks/use-data';
import { apiFetch } from '@/lib/api';

// Appeal form field interfaces
interface AppealFormField {
  id: string;
  type: 'checkbox' | 'text' | 'textarea' | 'dropdown';
  label: string;
  description?: string;
  required: boolean;
  options?: string[]; // For dropdown fields
  order: number;
}

interface AppealFormSettings {
  fields: AppealFormField[];
}


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
  const [forceRerender, setForceRerender] = useState(0); // Force re-render for section visibility

  // Appeal form configuration will come from the punishment-specific data
  const [appealFormSettings, setAppealFormSettings] = useState<AppealFormSettings | undefined>(undefined);

  // API mutations
  const createAppealMutation = useCreateAppeal();
  const { data: existingAppeals } = useAppealsByPunishment(banInfo?.id || '');

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
          schemaFields[field.id] = field.required 
            ? z.string().min(1, { message: `${field.label} is required` })
            : z.string().optional();
          break;
      }
    });

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
        (appealFormSettings?.fields || []).map(field => [
          field.id, 
          field.type === 'checkbox' ? false : ''
        ])
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
    setIsLoadingPunishment(true);
    // Reset previous state
    setBanInfo(null);
    setAppealInfo(null);
    setShowAppealForm(false);

    try {
      // Fetch from public punishment endpoint
      const { getApiUrl, getCurrentDomain } = await import('@/lib/api');
      const res = await fetch(getApiUrl(`/v1/public/punishments/${values.banId}`), {
        credentials: 'include',
        headers: { 'X-Server-Domain': getCurrentDomain() }
      });

      if (!res.ok) {
        if (res.status === 404) {
          toast({
            variant: "destructive",
            title: "Punishment not found",
            description: `No punishment with ID '${values.banId}' was found. Please double-check the ID.`,
          });
        } else {
          toast({
            variant: "destructive",
            title: "Error",
            description: "An unexpected error occurred while searching for the punishment.",
          });
        }
        return;
      }

      const data = await res.json();
      
      setBanInfo({
        id: data.id,
        reason: data.reason,
        date: data.date,
        staffMember: data.staffMember,
        status: data.status,
        expiresIn: data.expiresIn,
        type: data.type,
        isAppealable: data.isAppealable,
        playerUuid: data.playerUuid, // Store playerUuid here
      });

      // Set punishment-specific appeal form configuration
      if (data.appealForm) {
        setAppealFormSettings(data.appealForm);
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
              order: 1
            }
          ]
        });
      }

      // Automatically set the banId in the appeal form
      appealForm.setValue('banId', data.id);

    } catch (error) {
      console.error('Error fetching punishment:', error);
      setBanInfo(null);
      setAppealInfo(null);
      setShowAppealForm(false);
      toast({
        title: "Punishment not found",
        description: `No punishment found with ID: ${values.banId}`,
        variant: "destructive"
      });
    } finally {
      setIsLoadingPunishment(false);
    }
  };

  // Handle appeal form submission
  const onAppealSubmit = async (values: DynamicFormValues) => {
    if (!banInfo) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No punishment information is loaded. Please search for a punishment first.",
      });
      return;
    }

    // Create field labels mapping for server
    const fieldLabelsMapping: Record<string, string> = {};
    if (appealFormSettings?.fields) {
      appealFormSettings.fields.forEach((field) => {
        fieldLabelsMapping[field.id] = field.label;
      });
    }

    const appealData = {
      punishmentId: banInfo.id,
      playerUuid: banInfo.playerUuid, // Add playerUuid to the submission
      email: values.email,
      reason: values.reason, // Assuming 'reason' is a standard field
      additionalData: {
        ...values, // Pass all form fields as additional data
      },
      fieldLabels: fieldLabelsMapping  // Send field labels to server
    };

    // Remove fields already explicitly set
    delete appealData.additionalData.banId;
    delete appealData.additionalData.email;
    delete appealData.additionalData.reason;

    try {
      await createAppealMutation.mutateAsync(appealData);
      toast({
        title: "Appeal Submitted",
        description: "Your appeal has been successfully submitted and is now pending review.",
      });
      setShowAppealForm(false);
      // Refetch appeal info to show the newly created appeal
      // This will trigger the useAppealsByPunishment hook again
      // A small delay to ensure data is available after submission
      setTimeout(() => {
        // In a real app, you might want a more robust way to trigger refetch
        // For now, we'll just re-set the banInfo to trigger the hook
        setBanInfo(banInfo); 
      }, 500);

    } catch (error) {
      console.error("Error submitting appeal:", error);
      toast({
        title: "Error",
        description: "Failed to submit appeal. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Handle sending a reply to an existing appeal
  const handleSendReply = async () => {
    if (!newReply.trim() || !appealInfo) return;

    try {
      const csrfFetch = apiFetch;
      const response = await csrfFetch(`/v1/panel/appeals/${appealInfo.id}/replies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'You',
          content: newReply,
          type: 'player',
          staff: false,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send reply');
      }

      // Refresh appeal data
      onSearchSubmit({ banId: appealInfo.banId });
      setNewReply("");

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

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="max-w-md w-full">
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
                  <div className="mt-6 space-y-4">
                    <Separator />
                    <h4 className="text-md font-semibold">Conversation</h4>
                    <div className="space-y-4 max-h-[400px] overflow-y-auto p-2">
                      {appealInfo.messages
                        .filter(message => !message.isStaffNote)
                        .map((message) => (
                          <div 
                            key={message.id} 
                            className={`flex flex-col ${
                              message.sender === 'player' 
                                ? 'items-end' 
                                : 'items-center'
                            }`}
                          >
                            <div 
                              className={`max-w-[85%] rounded-lg p-3 ${
                                message.sender === 'player' 
                                  ? 'bg-primary text-primary-foreground' 
                                  : 'bg-muted/50 text-xs w-full text-center'
                              }`}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-xs font-medium ${
                                  message.sender === 'player' 
                                    ? 'text-primary-foreground/80' 
                                    : 'text-muted-foreground'
                                }`}>
                                  {message.senderName}
                                </span>
                              </div>
                              <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                              <div className="text-xs opacity-70 mt-1 text-right">
                                {formatDate(message.timestamp)}
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                    
                    {/* Reply input */}
                    {appealInfo.status !== 'Approved' && appealInfo.status !== 'Rejected' && appealInfo.status !== 'Closed' && (
                      <div className="mt-4">
                        <div className="flex flex-col space-y-2">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="reply">Add a reply</Label>
                            <div className="text-xs text-muted-foreground">
                              Your reply will be visible to staff
                            </div>
                          </div>
                          <Textarea
                            id="reply"
                            placeholder="Type your message here..."
                            rows={3}
                            value={newReply}
                            onChange={(e) => setNewReply(e.target.value)}
                          />
                          <div className="flex justify-end">
                            <Button 
                              onClick={handleSendReply}
                              disabled={!newReply.trim()}
                              size="sm"
                            >
                              <Send className="h-4 w-4 mr-2" />
                              Send Reply
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            
            {/* Dynamic Appeal Form */}
            {showAppealForm && banInfo && (
              <div className="mt-8 space-y-4">
                <Separator />
                <h3 className="text-lg font-semibold mt-6">Submit Appeal</h3>
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
                      
                      {/* Dynamic Fields */}
                      {appealFormSettings?.fields
                        ?.sort((a, b) => a.order - b.order)
                        .map(field => renderFormField(field))}
                      
                      {/* Fallback reason field if no dynamic fields */}
                      {(!appealFormSettings?.fields || appealFormSettings.fields.length === 0) && (
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
                      
                      <Button 
                        type="submit" 
                        className="w-full mt-6" 
                        disabled={createAppealMutation.isPending}
                      >
                        {createAppealMutation.isPending ? "Submitting..." : "Submit Appeal"}                      </Button>
                    </form>
                  </Form>
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
