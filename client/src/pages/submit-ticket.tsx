import { useState } from 'react';
import { useLocation, useParams } from 'wouter';
import {
  Bug,
  HelpCircle,
  User,
  Loader2,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Link2,
  Copy,
  CheckSquare
} from 'lucide-react';
import { getApiUrl, getCurrentDomain } from '@/lib/api';
import { Button } from "@modl-gg/shared-web/components/ui/button";
import { Input } from "@modl-gg/shared-web/components/ui/input";
import { Textarea } from "@modl-gg/shared-web/components/ui/textarea";
import { Label } from "@modl-gg/shared-web/components/ui/label";
import { Checkbox } from "@modl-gg/shared-web/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@modl-gg/shared-web/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@modl-gg/shared-web/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from '@/hooks/use-data';

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

interface FormField {
  id: string;
  type: 'text' | 'textarea' | 'dropdown' | 'multiple_choice' | 'checkbox' | 'checkboxes' | 'description' | 'file_upload';
  label: string;
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

// Map URL types to form keys
const typeToFormKey: Record<string, string> = {
  'support': 'support',
  'bug': 'bug',
  'staff': 'application',
  'application': 'application',
  'apply': 'application',
};

const ticketTypes = [
  { id: 'support', label: 'Support Request', icon: HelpCircle, description: 'Get help with an issue' },
  { id: 'bug', label: 'Bug Report', icon: Bug, description: 'Report a bug or technical issue' },
  { id: 'staff', label: 'Staff Application', icon: User, description: 'Apply to join the staff team' },
];

const SubmitTicketPage = () => {
  const [, setLocation] = useLocation();
  const { type: urlType } = useParams<{ type?: string }>();
  const { toast } = useToast();

  // Map URL type to internal type
  const initialType = urlType ? (typeToFormKey[urlType.toLowerCase()] ? urlType.toLowerCase() : null) : null;

  const [selectedType, setSelectedType] = useState<string | null>(
    initialType === 'apply' || initialType === 'application' ? 'staff' : initialType
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState<{ id: string; subject: string } | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [formSubject, setFormSubject] = useState('');
  const [copied, setCopied] = useState(false);

  const { data: settingsData, isLoading: settingsLoading } = useSettings();

  // Handle form field changes
  const handleFormFieldChange = (fieldId: string, value: string) => {
    setFormData(prev => ({ ...prev, [fieldId]: value }));
  };

  // Get form configuration for selected type
  const getFormConfig = () => {
    if (!selectedType || !settingsData?.settings?.ticketForms) {
      return null;
    }

    const ticketForms = settingsData.settings.ticketForms;
    const formKey = typeToFormKey[selectedType] || selectedType;

    // Try multiple keys for backwards compatibility
    let formConfig = ticketForms[formKey] || ticketForms[selectedType];

    // Special handling for staff/application
    if (!formConfig && (selectedType === 'staff' || selectedType === 'application')) {
      formConfig = ticketForms['application'] || ticketForms['staff'];
    }

    return formConfig;
  };

  const formConfig = getFormConfig();

  // Get visible sections based on form data
  const getVisibleSections = (fields: FormField[], sectionDefinitions: FormSection[]): Set<string> => {
    const visibleSections = new Set<string>();

    // Add sections without conditional logic and not hidden by default
    sectionDefinitions.forEach((section) => {
      if (!section.showIfFieldId && !section.hideByDefault) {
        visibleSections.add(section.id);
      }
    });

    // Check conditional sections
    sectionDefinitions.forEach((section) => {
      if (section.showIfFieldId) {
        const triggerFieldValue = formData[section.showIfFieldId];
        if (section.showIfValue && triggerFieldValue === section.showIfValue) {
          visibleSections.add(section.id);
        } else if (section.showIfValues && section.showIfValues.includes(triggerFieldValue)) {
          visibleSections.add(section.id);
        }
      }
    });

    // Check field-level navigation (optionSectionMapping)
    fields.forEach((field) => {
      const fieldValue = formData[field.id];
      if (field.optionSectionMapping && fieldValue) {
        if (field.type === 'dropdown' || field.type === 'multiple_choice') {
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

  // Render a form field (same logic as player-ticket.tsx)
  const renderField = (field: FormField) => {
    // Handle description fields (display-only)
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
        {field.type !== 'checkbox' && (
          <Label htmlFor={field.id} className="font-medium">
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>
        )}

        {field.description && (
          <p className="text-sm text-muted-foreground mb-1">{field.description}</p>
        )}

        {field.type === 'textarea' ? (
          <Textarea
            id={field.id}
            placeholder={`Enter ${field.label.toLowerCase()}`}
            value={formData[field.id] || ''}
            onChange={(e) => handleFormFieldChange(field.id, e.target.value)}
            className={selectedType === 'staff' ?
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
                  className="text-sm font-normal leading-tight cursor-pointer"
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
                  className="text-sm font-normal leading-tight"
                >
                  {option}
                </label>
              </div>
            ))}
          </div>
        ) : field.type === 'file_upload' ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">File uploads are only available after ticket creation.</p>
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
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedType || !formConfig) return;

    const fields = formConfig.fields || [];
    const sectionDefinitions = formConfig.sections || [];
    const visibleSections = getVisibleSections(fields, sectionDefinitions);

    // Validate required fields (only visible ones)
    for (const field of fields) {
      if (field.type === 'description') continue;

      // Skip fields in non-visible sections
      if (field.sectionId && !visibleSections.has(field.sectionId)) continue;

      if (field.required) {
        const value = formData[field.id];
        if (!value || value.trim() === '') {
          toast({
            title: 'Required Field Missing',
            description: `Please complete the "${field.label}" field.`,
            variant: 'destructive',
          });
          return;
        }
      }
    }

    // Validate email
    if (!formData['email'] || !formData['email'].trim()) {
      toast({
        title: 'Email Required',
        description: 'Please provide an email address.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const typeConfig = ticketTypes.find(t => t.id === selectedType);
      const typeLabel = typeConfig?.label || 'Ticket';

      // Convert formData keys from field IDs to field labels
      const labeledFormData: Record<string, string> = {};
      for (const [fieldId, value] of Object.entries(formData)) {
        if (fieldId === 'email') {
          labeledFormData['Email'] = value;
          continue;
        }
        const fieldConfig = fields.find((f: FormField) => f.id === fieldId);
        if (fieldConfig && fieldConfig.label) {
          labeledFormData[fieldConfig.label] = value;
        } else {
          labeledFormData[fieldId] = value;
        }
      }

      // Build subject
      const subject = formSubject ||
        (selectedType === 'staff' ? `Staff Application` : typeLabel);

      // Create the ticket with form data
      const response = await apiFetch('/v1/public/tickets', {
        method: 'POST',
        body: JSON.stringify({
          type: selectedType === 'staff' ? 'application' : selectedType,
          subject,
          creatorName: formData['name'] || formData['minecraft_username'] || formData['username'] || 'Web User',
          creatorEmail: formData['email'],
          formData: labeledFormData,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Failed to submit ticket');
      }

      const data = await response.json();
      setSubmittedTicket({ id: data.ticketId, subject });

      toast({
        title: 'Ticket Submitted!',
        description: 'Your ticket has been created successfully.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit ticket',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyTicketId = () => {
    if (submittedTicket) {
      navigator.clipboard.writeText(submittedTicket.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Success state
  if (submittedTicket) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle>Ticket Submitted!</CardTitle>
            <CardDescription>
              Your ticket has been created successfully.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Ticket ID</p>
                  <p className="font-mono font-medium">{submittedTicket.id}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={copyTicketId}>
                  {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-white mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800 dark:text-white">Link to your Minecraft account</p>
                  <p className="text-amber-700 dark:text-white/80 mt-1">
                    To link this ticket to your Minecraft account, run this command in-game:
                  </p>
                  <code className="block mt-2 bg-amber-100 dark:bg-amber-900 px-2 py-1 rounded text-xs">
                    /tclaim {submittedTicket.id}
                  </code>
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button
              className="w-full"
              onClick={() => setLocation(`/ticket/${submittedTicket.id}`)}
            >
              <Link2 className="h-4 w-4 mr-2" />
              View Ticket
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setSubmittedTicket(null);
                setSelectedType(null);
                setFormData({});
                setFormSubject('');
              }}
            >
              Submit Another Ticket
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Type selection
  if (!selectedType) {
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
  }

  // Loading state
  if (settingsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading form configuration...</p>
        </div>
      </div>
    );
  }

  // No form config found
  if (!formConfig || !formConfig.fields) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardContent className="pt-6">
            <div className="text-center py-8 border-2 border-dashed border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 rounded-lg">
              <div className="text-red-600 dark:text-red-400 mb-4">
                <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-red-800 dark:text-red-300 mb-2">Form Not Configured</h3>
              <p className="text-red-700 dark:text-red-400 mb-4">
                No form configuration found for {selectedType} tickets.
              </p>
              <p className="text-sm text-red-600 dark:text-red-500 mb-4">
                Please contact server administration to configure this ticket form.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedType(null);
                  setFormData({});
                }}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Go Back
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Form view
  const currentType = ticketTypes.find(t => t.id === selectedType);
  const Icon = currentType?.icon || HelpCircle;

  // Build fields array with email field
  let fields: FormField[] = formConfig.fields || [];
  const sectionDefinitions: FormSection[] = formConfig.sections || [];

  const emailField: FormField = {
    id: 'email',
    type: 'text',
    label: 'Email Address',
    description: 'Your email address for response notifications',
    required: true,
    order: 1,
    sectionId: undefined,
    options: undefined
  };

  // Adjust order of existing fields and add email
  const adjustedFields = fields.map(field => ({
    ...field,
    order: field.order >= 1 ? field.order + 1 : field.order
  }));
  fields = [emailField, ...adjustedFields].sort((a, b) => a.order - b.order);

  // Group fields by section
  const fieldsBySection: Record<string, FormField[]> = {};
  const fieldsWithoutSection: FormField[] = [];

  fields.forEach((field) => {
    if (field.sectionId) {
      if (!fieldsBySection[field.sectionId]) {
        fieldsBySection[field.sectionId] = [];
      }
      fieldsBySection[field.sectionId].push(field);
    } else {
      fieldsWithoutSection.push(field);
    }
  });

  // Sort fields within each group
  Object.keys(fieldsBySection).forEach(sectionId => {
    fieldsBySection[sectionId].sort((a, b) => a.order - b.order);
  });
  fieldsWithoutSection.sort((a, b) => a.order - b.order);

  const visibleSections = getVisibleSections(fields, sectionDefinitions);

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Security Disclaimer */}
        <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="text-yellow-600 dark:text-yellow-400 mt-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h3 className="font-medium text-yellow-800 dark:text-white">Security Notice</h3>
              <p className="text-sm text-yellow-700 dark:text-white/80 mt-1">
                Do not share sensitive information, personal data, or passwords over tickets.
              </p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedType(null);
                  setFormData({});
                  setFormSubject('');
                }}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>{currentType?.label}</CardTitle>
                <CardDescription>{currentType?.description}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                {/* Subject field for non-application tickets */}
                {selectedType !== 'staff' && (
                  <div className="space-y-1">
                    <Label htmlFor="subject" className="font-medium">Ticket Subject</Label>
                    <Input
                      id="subject"
                      type="text"
                      placeholder="Enter a subject for your ticket"
                      value={formSubject}
                      onChange={(e) => setFormSubject(e.target.value)}
                      required
                    />
                  </div>
                )}

                {/* Render fields without sections first */}
                {fieldsWithoutSection.map((field) => renderField(field))}

                {/* Render sections in order - only show visible sections */}
                {sectionDefinitions
                  .filter((section) => visibleSections.has(section.id))
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
                        {sectionFields.map((field) => renderField(field))}
                      </div>
                    );
                  })}
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={isSubmitting} className="flex items-center">
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SubmitTicketPage;
