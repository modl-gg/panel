import { useState, useMemo } from 'react';
import { useLocation, useParams } from 'wouter';
import {
  Bug,
  HelpCircle,
  User,
  Loader2,
  Send,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Link2,
  Copy
} from 'lucide-react';
import { getApiUrl, getCurrentDomain } from '@/lib/api';
import { Button } from "@modl-gg/shared-web/components/ui/button";
import { Input } from "@modl-gg/shared-web/components/ui/input";
import { Textarea } from "@modl-gg/shared-web/components/ui/textarea";
import { Label } from "@modl-gg/shared-web/components/ui/label";
import { Checkbox } from "@modl-gg/shared-web/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@modl-gg/shared-web/components/ui/radio-group";
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
  type: 'text' | 'textarea' | 'dropdown' | 'multiple_choice' | 'checkbox' | 'checkboxes' | 'description';
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

const ticketTypes = [
  { id: 'support', label: 'Support Request', icon: HelpCircle, description: 'Get help with an issue', formKey: 'support' },
  { id: 'bug', label: 'Bug Report', icon: Bug, description: 'Report a bug or technical issue', formKey: 'bug' },
  { id: 'staff', label: 'Staff Application', icon: User, description: 'Apply to join the staff team', formKey: 'application' },
];

const SubmitTicketPage = () => {
  const [, setLocation] = useLocation();
  const { type: initialType } = useParams<{ type?: string }>();
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState<string | null>(initialType || null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState<{ id: string; subject: string } | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  const { data: settingsData, isLoading: settingsLoading } = useSettings();

  // Get form configuration for selected type
  const formConfig = useMemo(() => {
    if (!selectedType || !settingsData?.settings?.ticketForms) {
      return null;
    }

    const typeConfig = ticketTypes.find(t => t.id === selectedType);
    if (!typeConfig) return null;

    const form = settingsData.settings.ticketForms[typeConfig.formKey];
    if (!form) return null;

    return {
      fields: (form.fields || []).sort((a: FormField, b: FormField) => a.order - b.order),
      sections: (form.sections || []).sort((a: FormSection, b: FormSection) => a.order - b.order),
    };
  }, [selectedType, settingsData]);

  // Get visible sections based on form data
  const getVisibleSections = () => {
    if (!formConfig) return new Set<string>();

    const visibleSections = new Set<string>();

    // Add sections without conditional logic
    formConfig.sections.forEach((section: FormSection) => {
      if (!section.showIfFieldId && !section.hideByDefault) {
        visibleSections.add(section.id);
      }
    });

    // Check conditional sections
    formConfig.sections.forEach((section: FormSection) => {
      if (section.showIfFieldId) {
        const triggerFieldValue = formData[section.showIfFieldId];
        if (section.showIfValue && triggerFieldValue === section.showIfValue) {
          visibleSections.add(section.id);
        } else if (section.showIfValues && section.showIfValues.includes(triggerFieldValue)) {
          visibleSections.add(section.id);
        }
      }
    });

    // Check field-level navigation
    formConfig.fields.forEach((field: FormField) => {
      const fieldValue = formData[field.id];
      if (field.optionSectionMapping && fieldValue) {
        const targetSection = field.optionSectionMapping[fieldValue];
        if (targetSection) {
          visibleSections.add(targetSection);
        }
      }
    });

    return visibleSections;
  };

  const visibleSections = getVisibleSections();

  // Check if a field should be visible
  const isFieldVisible = (field: FormField) => {
    if (!field.sectionId) return true;
    return visibleSections.has(field.sectionId);
  };

  // Render a form field
  const renderField = (field: FormField) => {
    if (!isFieldVisible(field)) return null;

    const value = formData[field.id] || '';

    switch (field.type) {
      case 'description':
        return (
          <div key={field.id} className="text-sm text-muted-foreground py-2">
            {field.description || field.label}
          </div>
        );

      case 'text':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            {field.description && (
              <p className="text-sm text-muted-foreground">{field.description}</p>
            )}
            <Input
              id={field.id}
              value={value}
              onChange={(e) => setFormData(prev => ({ ...prev, [field.id]: e.target.value }))}
            />
          </div>
        );

      case 'textarea':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            {field.description && (
              <p className="text-sm text-muted-foreground">{field.description}</p>
            )}
            <Textarea
              id={field.id}
              value={value}
              onChange={(e) => setFormData(prev => ({ ...prev, [field.id]: e.target.value }))}
              rows={4}
            />
          </div>
        );

      case 'dropdown':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            {field.description && (
              <p className="text-sm text-muted-foreground">{field.description}</p>
            )}
            <Select
              value={value}
              onValueChange={(val) => setFormData(prev => ({ ...prev, [field.id]: val }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent>
                {field.options?.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );

      case 'multiple_choice':
        return (
          <div key={field.id} className="space-y-2">
            <Label>
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            {field.description && (
              <p className="text-sm text-muted-foreground">{field.description}</p>
            )}
            <RadioGroup
              value={value}
              onValueChange={(val) => setFormData(prev => ({ ...prev, [field.id]: val }))}
            >
              {field.options?.map((option) => (
                <div key={option} className="flex items-center space-x-2">
                  <RadioGroupItem value={option} id={`${field.id}-${option}`} />
                  <Label htmlFor={`${field.id}-${option}`} className="font-normal cursor-pointer">
                    {option}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        );

      case 'checkbox':
        return (
          <div key={field.id} className="flex items-start space-x-2 py-2">
            <Checkbox
              id={field.id}
              checked={value === 'true'}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, [field.id]: checked ? 'true' : '' }))}
            />
            <div className="space-y-1 leading-none">
              <Label htmlFor={field.id} className="cursor-pointer font-normal">
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </Label>
              {field.description && (
                <p className="text-sm text-muted-foreground">{field.description}</p>
              )}
            </div>
          </div>
        );

      case 'checkboxes':
        const selectedValues = value ? value.split(',').filter(v => v) : [];
        return (
          <div key={field.id} className="space-y-2">
            <Label>
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            {field.description && (
              <p className="text-sm text-muted-foreground">{field.description}</p>
            )}
            <div className="space-y-2">
              {field.options?.map((option) => (
                <div key={option} className="flex items-center space-x-2">
                  <Checkbox
                    id={`${field.id}-${option}`}
                    checked={selectedValues.includes(option)}
                    onCheckedChange={(checked) => {
                      const newValues = checked
                        ? [...selectedValues, option]
                        : selectedValues.filter(v => v !== option);
                      setFormData(prev => ({ ...prev, [field.id]: newValues.join(',') }));
                    }}
                  />
                  <Label htmlFor={`${field.id}-${option}`} className="font-normal cursor-pointer">
                    {option}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const handleSubmit = async () => {
    if (!selectedType || !formConfig) return;

    // Validate required fields
    for (const field of formConfig.fields) {
      if (!isFieldVisible(field)) continue;
      if (field.type === 'description') continue;

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
        const fieldConfig = formConfig.fields.find((f: FormField) => f.id === fieldId);
        if (fieldConfig && fieldConfig.label) {
          labeledFormData[fieldConfig.label] = value;
        } else {
          labeledFormData[fieldId] = value;
        }
      }

      // Build subject from form data
      const subjectField = formData['subject'] || formData['name'] || formData['title'];
      const subject = subjectField ? `${typeLabel}: ${subjectField}` : typeLabel;

      // Create the ticket with form data
      const response = await apiFetch('/v1/public/tickets', {
        method: 'POST',
        body: JSON.stringify({
          type: selectedType,
          subject,
          creatorName: formData['name'] || formData['minecraft_username'] || 'Web User',
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
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800 dark:text-amber-200">Link to your Minecraft account</p>
                  <p className="text-amber-700 dark:text-amber-300 mt-1">
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

  // Loading form config
  if (settingsLoading || !formConfig) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading form...</span>
        </div>
      </div>
    );
  }

  // Form view
  const currentType = ticketTypes.find(t => t.id === selectedType);
  const Icon = currentType?.icon || HelpCircle;

  // Group fields by section
  const fieldsWithoutSection = formConfig.fields.filter((f: FormField) => !f.sectionId);
  const sectionedFields = formConfig.sections.map((section: FormSection) => ({
    section,
    fields: formConfig.fields.filter((f: FormField) => f.sectionId === section.id),
  }));

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedType(null);
                  setFormData({});
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
          <CardContent className="space-y-6">
            {/* Email field (always required) */}
            <div className="space-y-2">
              <Label htmlFor="email">
                Email Address
                <span className="text-red-500 ml-1">*</span>
              </Label>
              <p className="text-sm text-muted-foreground">We'll use this to notify you about updates to your ticket.</p>
              <Input
                id="email"
                type="email"
                value={formData['email'] || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="your@email.com"
              />
            </div>

            {/* Fields without sections */}
            {fieldsWithoutSection.map((field: FormField) => renderField(field))}

            {/* Sectioned fields */}
            {sectionedFields.map(({ section, fields }: { section: FormSection; fields: FormField[] }) => {
              if (!visibleSections.has(section.id) && section.hideByDefault) return null;
              if (fields.length === 0) return null;

              return (
                <div key={section.id} className="space-y-4 pt-4 border-t">
                  {section.title && (
                    <div>
                      <h3 className="font-medium">{section.title}</h3>
                      {section.description && (
                        <p className="text-sm text-muted-foreground">{section.description}</p>
                      )}
                    </div>
                  )}
                  {fields.map((field: FormField) => renderField(field))}
                </div>
              );
            })}
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Submit Ticket
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default SubmitTicketPage;
