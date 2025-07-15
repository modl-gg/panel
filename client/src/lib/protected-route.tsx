import { ReactNode } from "react";
import { Redirect, Route } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  path: string;
  component: React.ComponentType;
}

export function ProtectedRoute({ path, component: Component }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  return (
    <Route path={path}>
      {(params) => {
        if (isLoading) {
          return (
            <div className="flex items-center justify-center min-h-screen">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          );
        }

        if (!user) {
          return <Redirect to={path.startsWith("/panel") ? "/panel/auth" : "/auth"} />;
        }

        return <Component {...params} />;
      }}
    </Route>
  );
}

interface AuthRouteProps {
  path: string;
  component: React.ComponentType;
}

export function AuthRoute({ path, component: Component }: AuthRouteProps) {
  const { user, isLoading } = useAuth();

  return (
    <Route path={path}>
      {(params) => {
        if (isLoading) {
          return (
            <div className="flex items-center justify-center min-h-screen">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          );
        }

        if (user) {
          return <Redirect to={path.startsWith("/panel/auth") ? "/panel" : "/"} />;
        }

        return <Component {...params} />;
      }}
    </Route>
  );
}