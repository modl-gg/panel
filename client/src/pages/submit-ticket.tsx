import { useState } from 'react';
import { useLocation, useParams } from 'wouter';
import {
  Bug,
  HelpCircle,
  User,
  Loader2,
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
import { useToast } from "@/hooks/use-toast";

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

const SubmitTicketPage = () => {
  const [, setLocation] = useLocation();
  const { type: urlType } = useParams<{ type?: string }>();
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [creatingType, setCreatingType] = useState<string | null>(null);

  // Handle type selection - create unfinished ticket and redirect
  const handleSelectType = async (typeId: string) => {
    setIsCreating(true);
    setCreatingType(typeId);

    try {
      const typeConfig = ticketTypes.find(t => t.id === typeId);
      const apiType = typeConfig?.apiType || typeId;

      // Create an unfinished ticket via public API
      const response = await apiFetch('/v1/public/tickets/unfinished', {
        method: 'POST',
        body: JSON.stringify({
          type: apiType,
          subject: typeConfig?.label || 'New Ticket',
          creatorName: 'Web User',
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Failed to create ticket');
      }

      const data = await response.json();

      // Redirect to the player-ticket page to fill out the form
      setLocation(`/ticket/${data.ticketId}`);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create ticket',
        variant: 'destructive',
      });
      setIsCreating(false);
      setCreatingType(null);
    }
  };

  // If type is provided in URL, auto-select it
  if (urlType && !isCreating) {
    const mappedType = typeMapping[urlType.toLowerCase()];
    if (mappedType && ticketTypes.some(t => t.id === mappedType)) {
      // Auto-create ticket for this type
      handleSelectType(mappedType);
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Creating ticket...</p>
          </div>
        </div>
      );
    }
  }

  // Show loading state while creating
  if (isCreating) {
    const typeConfig = ticketTypes.find(t => t.id === creatingType);
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Creating {typeConfig?.label || 'ticket'}...</p>
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
                disabled={isCreating}
                onClick={() => handleSelectType(type.id)}
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
