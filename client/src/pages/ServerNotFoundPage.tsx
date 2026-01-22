import { AlertCircle, Home, ArrowLeft } from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';

export default function ServerNotFoundPage() {
  const domain = window.location.hostname;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
          </div>
          <CardTitle>Server Not Found</CardTitle>
          <CardDescription className="mt-2">
            The server <span className="font-medium text-foreground">{domain}</span> doesn't exist or hasn't been registered yet.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            If you recently registered this server, please check your email and verify your account first.
          </p>

          <div className="space-y-3">
            <Button
              variant="default"
              className="w-full"
              onClick={() => window.location.href = 'https://modl.gg'}
            >
              <Home className="h-4 w-4 mr-2" />
              Go to modl.gg
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.history.back()}
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
