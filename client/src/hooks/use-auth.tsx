import { createContext, ReactNode, useContext, useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "./use-toast";
import { getApiUrl, getCurrentDomain } from "@/lib/api";

interface User {
  _id: string;
  email: string;
  username: string;
  role: 'Super Admin' | 'Admin' | 'Moderator' | 'Helper';
}

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  login: (email: string, code: string) => Promise<boolean>;
  logout: () => void;
  requestEmailVerification: (email: string) => Promise<string | undefined>;
};

export const AuthContext = createContext<AuthContextType | null>(null);

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const fullUrl = getApiUrl(url);
  return fetch(fullUrl, {
    ...options,
    credentials: "include",
    headers: {
      ...options.headers,
      "X-Server-Domain": getCurrentDomain(),
    },
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const requestEmailVerification = async (email: string): Promise<string | undefined> => {
    try {
      const response = await authFetch('/v1/panel/auth/send-email-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) {
        const errorMessage = data.error || data.message || "Failed to send verification code.";
        let description = errorMessage;

        if (response.status === 429) {
          if (data.timeRemaining) {
            description += ` Please wait ${data.timeRemaining} before trying again.`;
          }
        }

        toast({
          title: response.status === 429 ? "Rate Limit Exceeded" : "Error",
          description: description,
          variant: "destructive",
        });
        return undefined;
      }
      toast({
        title: "Verification Email Sent",
        description: "Please check your email for the verification code.",
      });
      return "sent";
    } catch (error) {
      console.error("Error requesting email verification:", error);
      toast({
        title: "Network Error",
        description: "Could not connect to the server to send verification code.",
        variant: "destructive",
      });
      return undefined;
    }
  };

  const login = async (email: string, code: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const response = await authFetch('/v1/panel/auth/verify-email-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage = data.error || data.message || "An error occurred during login.";
        let description = errorMessage;

        if (response.status === 429) {
          if (data.timeRemaining) {
            description += ` Please wait ${data.timeRemaining} before trying again.`;
          }
        }

        toast({
          title: response.status === 429 ? "Rate Limit Exceeded" : "Login Failed",
          description: description,
          variant: "destructive",
        });
        setIsLoading(false);
        return false;
      }

      // Login successful - user info will be fetched by components that need it
      // The session cookie is set by the backend
      setUser({ _id: '', email, username: email.split('@')[0], role: 'Helper' });

      toast({
        title: "Login Successful",
        description: "Welcome! Redirecting to dashboard...",
      });

      setIsLoading(false);
      return true;

    } catch (error) {
      console.error("Login error:", error);
      toast({
        title: "Login Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
      setIsLoading(false);
      return false;
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      const response = await authFetch('/v1/panel/auth/logout', { method: 'POST' });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to logout on server." }));
        toast({
          title: "Logout Error",
          description: errorData.message || "Server logout failed. Client session cleared.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Logged out",
          description: "You have been successfully logged out.",
        });
      }
    } catch (error) {
      console.error("Logout error:", error);
      toast({
        title: "Logout Error",
        description: "An unexpected error occurred during logout. Client session cleared.",
        variant: "destructive",
      });
    } finally {
      setUser(null);
      setIsLoading(false);
      navigate('/auth');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        setUser,
        login,
        logout,
        requestEmailVerification,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
