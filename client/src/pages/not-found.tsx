import { Card, CardContent } from "@modl-gg/shared-web/components/ui/card";
import { Button } from "@modl-gg/shared-web/components/ui/button";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";
import { useEffect } from "react";

export default function NotFound() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    document.title = "Page Not Found";
  }, []);

  const handleReturnHome = () => {
    // Check if we're on a panel route, redirect to panel home, otherwise to public home
    const currentPath = window.location.pathname;
    if (currentPath.startsWith('/panel')) {
      setLocation('/panel');
    } else {
      setLocation('/');
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6 pb-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <AlertCircle className="h-16 w-16 text-muted-foreground" />
            
            <div className="space-y-2">
              <h1 className="text-3xl font-bold text-foreground">404</h1>
              <h2 className="text-xl font-semibold text-foreground">Page Not Found</h2>
              <p className="text-muted-foreground">
                The page you're looking for doesn't exist or has been moved.
              </p>
            </div>

            <Button onClick={handleReturnHome} className="mt-6">
              <Home className="h-4 w-4 mr-2" />
              Return Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
