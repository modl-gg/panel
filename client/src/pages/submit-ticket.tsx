import { useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { Bug, HelpCircle, User, Loader2 } from 'lucide-react';
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

const ticketTypes = [
  { id: 'support', label: 'Support Request', icon: HelpCircle, description: 'Get help with an issue' },
  { id: 'bug', label: 'Bug Report', icon: Bug, description: 'Report a bug or technical issue' },
  { id: 'staff', label: 'Staff Application', icon: User, description: 'Apply to join the staff team' },
];

const SubmitTicketPage = () => {
  const [, setLocation] = useLocation();
  const { type: initialType } = useParams<{ type?: string }>();
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);

  const handleSelectType = async (typeId: string) => {
    setIsCreating(true);

    try {
      const typeLabel = ticketTypes.find(t => t.id === typeId)?.label || 'Ticket';

      // Create an unfinished ticket via public API
      const response = await apiFetch('/v1/public/tickets/unfinished', {
        method: 'POST',
        body: JSON.stringify({
          type: typeId,
          subject: typeLabel,
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
    }
  };

  // If type is provided in URL, create ticket immediately
  if (initialType && ticketTypes.some(t => t.id === initialType)) {
    if (!isCreating) {
      handleSelectType(initialType);
    }
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Creating ticket...</span>
        </div>
      </div>
    );
  }

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
