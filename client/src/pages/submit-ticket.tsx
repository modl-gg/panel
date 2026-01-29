import { useState, useEffect, useMemo } from 'react';
import { useLocation, useParams } from 'wouter';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Send, Bug, HelpCircle, User, Loader2, CheckCircle2, AlertCircle, Link2, Copy } from 'lucide-react';
import { getApiUrl, getCurrentDomain } from '@/lib/api';
import { Label } from "@modl-gg/shared-web/components/ui/label";
import { Button } from "@modl-gg/shared-web/components/ui/button";
import { Input } from "@modl-gg/shared-web/components/ui/input";
import { Textarea } from "@modl-gg/shared-web/components/ui/textarea";
import { Checkbox } from "@modl-gg/shared-web/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@modl-gg/shared-web/components/ui/select";
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

interface FormFieldConfig {
  id: string;
  type: 'text' | 'textarea' | 'dropdown' | 'multiple_choice' | 'checkbox' | 'checkboxes' | 'description';
  label: string;
  description?: string;
  required: boolean;
  options?: string[];
  order: number;
  sectionId?: string;
}

interface FormSectionConfig {
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
  { id: 'support', label: 'Support Request', icon: HelpCircle, description: 'Get help with an issue' },
  { id: 'bug', label: 'Bug Report', icon: Bug, description: 'Report a bug or technical issue' },
  { id: 'staff', label: 'Staff Application', icon: User, description: 'Apply to join the staff team' },
];

const SubmitTicketPage = () => {
  const [, setLocation] = useLocation();
  const { type: initialType } = useParams<{ type?: string }>();
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState<string | null>(initialType || null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState<{ id: string; subject: string } | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [copied, setCopied] = useState(false);

  const { data: settingsData } = useSettings();

  // Get form settings for the selected ticket type
  const formConfig = useMemo(() => {
    if (!selectedType || !settingsData?.settings?.ticketForms) {
      return { fields: [], sections: [] };
    }

    const typeMapping: Record<string, string> = {
      'support': 'support',
      'bug': 'bug',
      'staff': 'application',
    };

    const formKey = typeMapping[selectedType];
    const form = settingsData.settings.ticketForms[formKey];

    if (!form) {
      return { fields: [], sections: [] };
    }

    return {
      fields: (form.fields || []).sort((a: FormFieldConfig, b: FormFieldConfig) => a.order - b.order),
      sections: (form.sections || []).sort((a: FormSectionConfig, b: FormSectionConfig) => a.order - b.order),
    };
  }, [selectedType, settingsData]);

  // Check if a section should be visible
  const isSectionVisible = (section: FormSectionConfig): boolean => {
    if (!section.showIfFieldId) return !section.hideByDefault;

    const fieldValue = formValues[section.showIfFieldId];
    if (!fieldValue) return !section.hideByDefault;

    if (section.showIfValues && section.showIfValues.length > 0) {
      return section.showIfValues.includes(fieldValue);
    }
    if (section.showIfValue) {
      return fieldValue === section.showIfValue;
    }
    return !section.hideByDefault;
  };

  // Render a form field
  const renderField = (field: FormFieldConfig) => {
    // Check if field's section is visible
    if (field.sectionId) {
      const section = formConfig.sections.find((s: FormSectionConfig) => s.id === field.sectionId);
      if (section && !isSectionVisible(section)) {
        return null;
      }
    }

    switch (field.type) {
      case 'description':
        return (
          <div key={field.id} className="text-sm text-muted-foreground">
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
              value={formValues[field.id] || ''}
              onChange={(e) => setFormValues(prev => ({ ...prev, [field.id]: e.target.value }))}
              required={field.required}
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
              value={formValues[field.id] || ''}
              onChange={(e) => setFormValues(prev => ({ ...prev, [field.id]: e.target.value }))}
              required={field.required}
              rows={4}
            />
          </div>
        );

      case 'dropdown':
      case 'multiple_choice':
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
              value={formValues[field.id] || ''}
              onValueChange={(value) => setFormValues(prev => ({ ...prev, [field.id]: value }))}
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

      case 'checkbox':
        return (
          <div key={field.id} className="flex items-start space-x-2">
            <Checkbox
              id={field.id}
              checked={formValues[field.id] || false}
              onCheckedChange={(checked) => setFormValues(prev => ({ ...prev, [field.id]: checked }))}
            />
            <div className="space-y-1 leading-none">
              <Label htmlFor={field.id} className="cursor-pointer">
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
                    checked={(formValues[field.id] || []).includes(option)}
                    onCheckedChange={(checked) => {
                      setFormValues(prev => {
                        const current = prev[field.id] || [];
                        if (checked) {
                          return { ...prev, [field.id]: [...current, option] };
                        } else {
                          return { ...prev, [field.id]: current.filter((v: string) => v !== option) };
                        }
                      });
                    }}
                  />
                  <Label htmlFor={`${field.id}-${option}`} className="cursor-pointer">
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
    if (!selectedType) return;

    // Validate required fields
    const visibleFields = formConfig.fields.filter((field: FormFieldConfig) => {
      if (!field.sectionId) return true;
      const section = formConfig.sections.find((s: FormSectionConfig) => s.id === field.sectionId);
      return !section || isSectionVisible(section);
    });

    const missingRequired = visibleFields.filter((field: FormFieldConfig) => {
      if (!field.required) return false;
      if (field.type === 'description') return false;
      const value = formValues[field.id];
      if (field.type === 'checkbox') return !value;
      if (field.type === 'checkboxes') return !value || value.length === 0;
      return !value || value.toString().trim() === '';
    });

    if (missingRequired.length > 0) {
      toast({
        title: 'Missing required fields',
        description: `Please fill in: ${missingRequired.map((f: FormFieldConfig) => f.label).join(', ')}`,
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Build the subject from form values or use default
      const subjectField = formValues['subject'] || formValues['title'] || formValues['name'];
      const typeLabel = ticketTypes.find(t => t.id === selectedType)?.label || 'Ticket';
      const subject = subjectField ? `${typeLabel}: ${subjectField}` : typeLabel;

      // Build description from first textarea field
      const descField = formConfig.fields.find((f: FormFieldConfig) => f.type === 'textarea');
      const description = descField ? formValues[descField.id] : '';

      const response = await apiFetch('/v1/public/tickets', {
        method: 'POST',
        body: JSON.stringify({
          type: selectedType,
          subject,
          description,
          formData: formValues,
          creatorName: formValues['minecraft_username'] || formValues['username'] || formValues['name'] || 'Web User',
          creatorEmail: formValues['email'] || formValues['contact_email'],
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Failed to submit ticket');
      }

      const data = await response.json();
      setSubmittedTicket({ id: data.ticketId, subject });

      toast({
        title: 'Ticket submitted!',
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
                setFormValues({});
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
                <button
                  key={type.id}
                  onClick={() => setSelectedType(type.id)}
                  className="w-full p-4 border rounded-lg hover:bg-muted transition-colors text-left flex items-start gap-4"
                >
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{type.label}</p>
                    <p className="text-sm text-muted-foreground">{type.description}</p>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Form
  const currentType = ticketTypes.find(t => t.id === selectedType);
  const Icon = currentType?.icon || HelpCircle;

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
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
            {/* Render sections with their fields */}
            {formConfig.sections.length > 0 ? (
              formConfig.sections.map((section: FormSectionConfig) => {
                if (!isSectionVisible(section)) return null;

                const sectionFields = formConfig.fields.filter(
                  (f: FormFieldConfig) => f.sectionId === section.id
                );

                if (sectionFields.length === 0) return null;

                return (
                  <div key={section.id} className="space-y-4">
                    {section.title && (
                      <div>
                        <h3 className="font-medium">{section.title}</h3>
                        {section.description && (
                          <p className="text-sm text-muted-foreground">{section.description}</p>
                        )}
                      </div>
                    )}
                    {sectionFields.map((field: FormFieldConfig) => renderField(field))}
                  </div>
                );
              })
            ) : null}

            {/* Render fields without sections */}
            {formConfig.fields
              .filter((f: FormFieldConfig) => !f.sectionId)
              .map((field: FormFieldConfig) => renderField(field))}

            {/* If no form config, show basic form */}
            {formConfig.fields.length === 0 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject <span className="text-red-500">*</span></Label>
                  <Input
                    id="subject"
                    value={formValues['subject'] || ''}
                    onChange={(e) => setFormValues(prev => ({ ...prev, subject: e.target.value }))}
                    placeholder="Brief description of your request"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description <span className="text-red-500">*</span></Label>
                  <Textarea
                    id="description"
                    value={formValues['description'] || ''}
                    onChange={(e) => setFormValues(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Provide details about your request"
                    rows={6}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact_email">Email (optional)</Label>
                  <Input
                    id="contact_email"
                    type="email"
                    value={formValues['contact_email'] || ''}
                    onChange={(e) => setFormValues(prev => ({ ...prev, contact_email: e.target.value }))}
                    placeholder="your@email.com"
                  />
                  <p className="text-sm text-muted-foreground">
                    We'll use this to notify you about updates to your ticket.
                  </p>
                </div>
              </>
            )}
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => {
                setSelectedType(null);
                setFormValues({});
              }}
            >
              Back
            </Button>
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
