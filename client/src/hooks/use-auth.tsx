import { createContext, ReactNode, useContext, useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@modl-gg/shared-web/hooks/use-toast";
import { getApiUrl, getCurrentDomain } from "@/lib/api";
import { setDateLocale } from "@/utils/date-utils";
import i18n from "@/lib/i18n";

interface User {
  _id: string;
  email: string;
  username: string;
  role: 'Super Admin' | 'Admin' | 'Moderator' | 'Helper';
  minecraftUsername?: string; // The staff's Minecraft username, used for punishment issuerName
  language?: string;
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
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Check for existing session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await authFetch('/v1/panel/auth/me');
        if (response.ok) {
          const userData = await response.json();
          setUser({
            _id: userData.id || '',
            email: userData.email,
            username: userData.username,
            role: userData.role,
            minecraftUsername: userData.minecraftUsername,
            language: userData.language || 'en'
          });
        }
      } catch (error) {
        // Session check failed, user is not authenticated
        console.error('Session check failed:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();
  }, []);

  // Sync date locale and i18n language when user language changes
  useEffect(() => {
    const lang = user?.language || 'en';
    setDateLocale(lang);
    i18n.changeLanguage(lang);
  }, [user?.language]);

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
          title: response.status === 429 ? i18n.t('toast.rateLimitExceeded') : i18n.t('toast.error'),
          description: description,
          variant: "destructive",
        });
        return undefined;
      }
      toast({
        title: i18n.t('toast.verificationSent'),
        description: i18n.t('toast.verificationSentDesc'),
      });
      return "sent";
    } catch (error) {
      console.error("Error requesting email verification:", error);
      toast({
        title: i18n.t('toast.networkError'),
        description: i18n.t('toast.networkErrorDesc'),
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
          title: response.status === 429 ? i18n.t('toast.rateLimitExceeded') : i18n.t('toast.loginFailed'),
          description: description,
          variant: "destructive",
        });
        setIsLoading(false);
        return false;
      }

      // Login successful - user info will be fetched by components that need it
      // The session cookie is set by the backend
      setUser({ _id: '', email, username: email.split('@')[0], role: 'Helper', minecraftUsername: undefined });

      toast({
        title: i18n.t('toast.loginSuccess'),
        description: i18n.t('toast.loginSuccessDesc'),
      });

      setIsLoading(false);
      return true;

    } catch (error) {
      console.error("Login error:", error);
      toast({
        title: i18n.t('toast.loginError'),
        description: i18n.t('toast.loginErrorDesc'),
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
          title: i18n.t('toast.logoutError'),
          description: errorData.message || i18n.t('toast.logoutErrorDesc'),
          variant: "destructive",
        });
      } else {
        toast({
          title: i18n.t('toast.logoutSuccess'),
          description: i18n.t('toast.logoutSuccessDesc'),
        });
      }
    } catch (error) {
      console.error("Logout error:", error);
      toast({
        title: i18n.t('toast.logoutError'),
        description: i18n.t('toast.logoutErrorDesc'),
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
