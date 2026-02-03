import { useState } from 'react';
import { useLocation, useParams } from 'wouter';
import {
  Bug,
  HelpCircle,
  User,
  Loader2,
  CheckSquare,
  ArrowLeft,
} from 'lucide-react';
import { getApiUrl, getCurrentDomain } from '@/lib/api';
import { Button } from "@modl-gg/shared-web/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@modl-gg/shared-web/components/ui/card";
import { Input } from "@modl-gg/shared-web/components/ui/input";
import { Label } from "@modl-gg/shared-web/components/ui/label";
import { Textarea } from "@modl-gg/shared-web/components/ui/textarea";
import { Checkbox } from "@modl-gg/shared-web/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@modl-gg/shared-web/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/hooks/use-data";
import MediaUpload from '@/components/MediaUpload';
import { getCreatorIdentifier } from '@/utils/creator-verification';

async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const fullUrl = getApiUrl(url);
  return fetch(fullUrl, {
    ...options,
    credentials: "include",
    headers: {
      ...options.headers,
      "X-Server-Domain": getCurrentDomain(),
      "Content-Type": "application/json",
    },
  });
}

// Map URL types to internal ticket types
const typeMapping: Record<string, string> = {
  'support': 'support',
  'bug': 'bug',
  'staff': 'staff',
  'application': 'staff',
  'apply': 'staff',
};

const ticketTypes = [
  { id: 'support', label: 'Support Request', icon: HelpCircle, description: 'Get help with an issue', apiType: 'support' },
  { id: 'bug', label: 'Bug Report', icon: Bug, description: 'Report a bug or technical issue', apiType: 'bug' },
  { id: 'staff', label: 'Staff Application', icon: User, description: 'Apply to join the staff team', apiType: 'staff' },
];

interface FormField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'dropdown' | 'multiple_choice' | 'checkbox' | 'file_upload' | 'checkboxes' | 'description';
  description?: string;
  required: boolean;
  options?: string[];
  order: number;
  sectionId?: string;
  goToSection?: string;
  optionSectionMapping?: Record<string, string>;
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

const SubmitTicketPage = () => {
  const [, setLocation] = useLocation();
  const { type: urlType } = useParams<{ type?: string }>();
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formSubject, setFormSubject] = useState('');
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [displayName, setDisplayName] = useState('');

  // Fetch settings to get form templates
  const { data: settingsData, isLoading: isLoadingSettings } = useSettings();

  // Handle type selection from URL
  const effectiveType = selectedType || (urlType ? typeMapping[urlType.toLowerCase()] : null);

  // Handle form field changes
  const handleFormFieldChange = (name: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle form submission - creates the ticket
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!effectiveType) return;

    const typeConfig = ticketTypes.find(t => t.id === effectiveType);

    // For staff/application forms, auto-generate the subject
    const finalSubject = (effectiveType === 'staff' || effectiveType === 'application')
      ? `${displayName.trim() || 'User'}'s Staff Application`
      : formSubject.trim();

    // Check if subject is required for non-application tickets
    if (effectiveType !== 'staff' && effectiveType !== 'application' && !finalSubject) {
      toast({
        title: "Subject Required",
        description: "Please provide a subject for your ticket.",
        variant: "destructive"
      });
      return;
    }

    // Get form configuration from settings
    let formConfig = null;
    try {
      if (settingsData?.settings) {
        const ticketForms = settingsData.settings.ticketForms;
        const ticketTypeLower = effectiveType.toLowerCase();

        if (ticketForms && ticketForms[ticketTypeLower]) {
          formConfig = ticketForms[ticketTypeLower];
        } else if (ticketForms && ticketForms[effectiveType]) {
          formConfig = ticketForms[effectiveType];
        } else if ((ticketTypeLower === 'staff' || ticketTypeLower === 'application') && ticketForms && ticketForms['application']) {
          formConfig = ticketForms['application'];
        }
      }
    } catch (error) {
      console.error('Error processing form templates:', error);
    }

    if (!formConfig || !formConfig.fields) {
      toast({
        title: "Form Configuration Missing",
        description: `No form configuration found for ${effectiveType} tickets. Please contact support.`,
        variant: "destructive"
      });
      return;
    }

    // Get visible sections to validate only visible required fields
    const visibleSections = new Set<string>();
    const sectionDefinitions = formConfig.sections || [];

    sectionDefinitions.forEach((section: FormSection) => {
      if (!section.showIfFieldId && !section.hideByDefault) {
        visibleSections.add(section.id);
      }
    });

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

    const allFields = formConfig.fields || [];
    allFields.forEach((field: FormField) => {
      const fieldValue = formData[field.id];
      if (field.optionSectionMapping && fieldValue) {
        if (field.type === 'dropdown' || field.type === 'multiple_choice') {
          const targetSection = field.optionSectionMapping[fieldValue];
          if (targetSection) {
            visibleSections.add(targetSection);
          }
        } else if (field.type === 'checkboxes') {
          const selectedValues = fieldValue.split(',').map((v: string) => v.trim()).filter((v: string) => v);
          selectedValues.forEach((value: string) => {
            const targetSection = field.optionSectionMapping![value];
            if (targetSection) {
              visibleSections.add(targetSection);
            }
          });
        }
      }
    });

    // Add email field to validation
    const emailField = {
      id: 'email',
      type: 'text' as const,
      label: 'Email Address',
      description: 'Your email address for response notifications',
      required: true,
      order: 1,
      sectionId: undefined
    };

    const fieldsToValidate = [emailField, ...(formConfig.fields || [])];

    // Check display name
    if (!displayName.trim()) {
      toast({
        title: "Name Required",
        description: "Please enter your name or username.",
        variant: "destructive"
      });
      return;
    }

    // Check required fields
    for (const field of fieldsToValidate) {
      if (field.sectionId && !visibleSections.has(field.sectionId)) {
        continue;
      }
      if (field.type === 'description') {
        continue;
      }
      if (field.required && (!formData[field.id] || formData[field.id].trim() === '')) {
        toast({
          title: "Required Field Missing",
          description: `Please complete the "${field.label}" field.`,
          variant: "destructive"
        });
        return;
      }
    }

    // Validate email format
    const email = formData['email']?.trim();
    if (email) {
      // Email regex: must have @ followed by domain with at least one dot
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        toast({
          title: "Invalid Email Format",
          description: "Please enter a valid email address (e.g., name@example.com).",
          variant: "destructive"
        });
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // Convert formData keys from field IDs to field labels
      const labeledFormData: Record<string, string> = {};
      const allFormFields = formConfig.fields || [];

      for (const [fieldId, value] of Object.entries(formData)) {
        const fieldConfig = allFormFields.find((f: FormField) => f.id === fieldId);
        if (fieldConfig && fieldConfig.label) {
          labeledFormData[fieldConfig.label] = value;
        } else if (fieldId === 'email') {
          labeledFormData['Email Address'] = value;
        } else {
          labeledFormData[fieldId] = value;
        }
      }

      // Generate a creator identifier for this submission
      const tempTicketId = `temp-${Date.now()}`;
      const creatorIdentifier = getCreatorIdentifier(tempTicketId);

      // Format the creator name as "{name} (Web User)" for unverified submissions
      const webCreatorName = `${displayName.trim()} (Web User)`;

      // Create the ticket with all data
      const response = await apiFetch('/v1/public/tickets', {
        method: 'POST',
        body: JSON.stringify({
          type: typeConfig?.apiType || effectiveType,
          subject: finalSubject,
          creatorName: webCreatorName,
          creatorEmail: formData['email'],
          formData: labeledFormData,
          creatorIdentifier: creatorIdentifier,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Failed to create ticket');
      }

      const data = await response.json();

      toast({
        title: "Ticket Submitted Successfully",
        description: "Your ticket is now open for staff review.",
        variant: "default"
      });

      // Redirect to the ticket page
      setLocation(`/ticket/${data.ticketId}`);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create ticket',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render the ticket form
  const renderTicketForm = () => {
    if (isLoadingSettings) {
      return (
        <div className="text-center py-8">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading form configuration...</p>
        </div>
      );
    }

    if (!effectiveType) return null;

    // Get form configuration from settings
    let formConfig = null;
    try {
      if (settingsData?.settings) {
        const ticketForms = settingsData.settings.ticketForms;
        const ticketTypeLower = effectiveType.toLowerCase();

        if (ticketForms && ticketForms[ticketTypeLower]) {
          formConfig = ticketForms[ticketTypeLower];
        } else if (ticketForms && ticketForms[effectiveType]) {
          formConfig = ticketForms[effectiveType];
        } else if ((ticketTypeLower === 'staff' || ticketTypeLower === 'application') && ticketForms && ticketForms['application']) {
          formConfig = ticketForms['application'];
        }
      }
    } catch (error) {
      console.error('Error processing form templates:', error);
    }

    if (!formConfig || !formConfig.fields) {
      return (
        <div className="text-center py-8 border-2 border-dashed border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 rounded-lg">
          <div className="text-red-600 dark:text-red-400 mb-4">
            <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-red-800 dark:text-red-300 mb-2">Form Not Configured</h3>
          <p className="text-red-700 dark:text-red-400 mb-4">
            No form configuration found for {effectiveType} tickets.
          </p>
          <p className="text-sm text-red-600 dark:text-red-500">
            Please contact server administration to configure this ticket form.
          </p>
        </div>
      );
    }

    let fields = formConfig.fields || [];
    const sectionDefinitions = formConfig.sections || [];

    const emailField = {
      id: 'email',
      type: 'text' as const,
      label: 'Email Address',
      description: 'Your email address for response notifications',
      required: true,
      order: 2,
      sectionId: undefined,
      options: undefined
    };

    const adjustedFields = fields.map((field: FormField) => ({
      ...field,
      order: field.order >= 1 ? field.order + 2 : field.order
    }));

    fields = [emailField, ...adjustedFields].sort((a: FormField, b: FormField) => a.order - b.order);

    if (fields.length === 0) {
      return (
        <div className="text-center py-8 border-2 border-dashed border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
          <div className="text-yellow-600 dark:text-yellow-400 mb-4">
            <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-yellow-800 dark:text-yellow-300 mb-2">Empty Form Configuration</h3>
          <p className="text-yellow-700 dark:text-yellow-400 mb-4">
            The {effectiveType} ticket form has no fields configured.
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

    Object.keys(fieldsBySection).forEach(sectionId => {
      fieldsBySection[sectionId].sort((a, b) => a.order - b.order);
    });

    fieldsWithoutSection.sort((a, b) => a.order - b.order);

    const getVisibleSections = (): Set<string> => {
      const visibleSections = new Set<string>();

      sectionDefinitions.forEach((section: FormSection) => {
        if (!section.showIfFieldId && !section.hideByDefault) {
          visibleSections.add(section.id);
        }
      });

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

      fields.forEach((field: FormField) => {
        const fieldValue = formData[field.id];
        if (field.optionSectionMapping && fieldValue) {
          if (field.type === 'dropdown') {
            const targetSection = field.optionSectionMapping[fieldValue];
            if (targetSection) {
              visibleSections.add(targetSection);
            }
          } else if (field.type === 'multiple_choice') {
            const targetSection = field.optionSectionMapping[fieldValue];
            if (targetSection) {
              visibleSections.add(targetSection);
            }
          } else if (field.type === 'checkboxes') {
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

    const renderField = (field: FormField) => {
      if (field.type === 'description') {
        return (
          <div key={field.id} className="space-y-1">
            {field.label && (
              <Label className="font-medium">{field.label}</Label>
            )}
            {field.description && (
              <p className="text-sm text-muted-foreground">{field.description}</p>
            )}
          </div>
        );
      }

      return (
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
              className={effectiveType === 'application' || effectiveType === 'staff' ?
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
                  handleFormFieldChange(field.id, result.url);
                }}
                metadata={{
                  ticketId: 'new',
                  ticketType: effectiveType,
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
              type={field.id === 'email' ? 'email' : 'text'}
              placeholder={`Enter ${field.label.toLowerCase()}`}
              value={formData[field.id] || ''}
              onChange={(e) => handleFormFieldChange(field.id, e.target.value)}
              required={field.required}
            />
          )}
        </div>
      );
    };

    return (
      <form onSubmit={handleFormSubmit} className="space-y-6">
        <div className="space-y-4">
          {/* Name field - always first */}
          <div>
            <Label htmlFor="displayName" className="font-medium">
              Your Name
              <span className="text-destructive ml-1">*</span>
            </Label>
            <p className="text-sm text-muted-foreground mb-1">
              Your name or Minecraft username (will show as "{displayName || 'Name'} (Web User)" until verified)
            </p>
            <Input
              id="displayName"
              type="text"
              placeholder="Enter your name or username"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>

          {effectiveType !== 'staff' && effectiveType !== 'application' && (
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
          {fieldsWithoutSection.map((field: FormField) => renderField(field))}

          {/* Render sections in order - only show visible sections */}
          {sectionDefinitions
            .filter((section: FormSection) => visibleSections.has(section.id))
            .sort((a: FormSection, b: FormSection) => a.order - b.order)
            .map((section: FormSection) => {
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
                  {sectionFields.map((field: FormField) => renderField(field))}
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

  // Get the title/description for selected type
  const getFormHeader = () => {
    if (!effectiveType) return null;

    if (effectiveType === 'staff' || effectiveType === 'application') {
      return {
        title: 'Staff Application',
        description: 'Thank you for your interest in becoming a volunteer moderator. Please complete the form with honesty and showcase your personality.'
      };
    } else if (effectiveType === 'bug') {
      return {
        title: 'Bug Report',
        description: 'Please provide detailed information about the bug you\'ve encountered'
      };
    } else if (effectiveType === 'support') {
      return {
        title: 'Support Request',
        description: 'Please tell us how we can help you'
      };
    }
    return {
      title: `${effectiveType.charAt(0).toUpperCase() + effectiveType.slice(1)} Ticket`,
      description: 'Please provide the required information below to submit your ticket'
    };
  };

  // If type is provided in URL and it's valid, show the form directly
  if (effectiveType && ticketTypes.some(t => t.id === effectiveType)) {
    const header = getFormHeader();

    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-5xl mx-auto">
          {/* Security Disclaimer */}
          <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <div className="text-yellow-600 dark:text-yellow-400 mt-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h3 className="font-medium text-yellow-800 dark:text-yellow-300">Security Notice</h3>
                <p className="text-sm text-yellow-700 dark:text-yellow-400 mt-1">
                  Do not share sensitive information, personal data, or passwords over tickets.
                </p>
              </div>
            </div>
          </div>

          <Card className="mb-6">
            <CardHeader>
              {!urlType && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedType(null)}
                  className="w-fit mb-2 -ml-2"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              )}
              <CardTitle>{header?.title}</CardTitle>
              <CardDescription className="mt-2">
                {header?.description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {renderTicketForm()}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Type selection
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle>Submit a Ticket</CardTitle>
          <CardDescription>
            Select the type of ticket you'd like to submit
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {ticketTypes.map((type) => {
            const Icon = type.icon;
            return (
              <Button
                key={type.id}
                variant="outline"
                onClick={() => setSelectedType(type.id)}
                className="w-full p-4 h-auto justify-start"
              >
                <div className="flex items-start gap-4 w-full">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium">{type.label}</p>
                    <p className="text-sm text-muted-foreground font-normal">{type.description}</p>
                  </div>
                </div>
              </Button>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
};

export default SubmitTicketPage;
