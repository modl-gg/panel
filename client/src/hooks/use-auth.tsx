import { createContext, ReactNode, useContext, useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@modl-gg/shared-web/hooks/use-toast";
import { getApiUrl, getCurrentDomain } from "@/lib/api";
import { setDateLocale, setDateFormat } from "@/utils/date-utils";
import { startAuthentication } from "@simplewebauthn/browser";
import i18n from "@/lib/i18n";

interface User {
  id: string;
  email: string;
  username: string;
  role: 'Super Admin' | 'Admin' | 'Moderator' | 'Helper';
  minecraftUsername?: string; // The staff's Minecraft username, used for punishment issuerName
  language?: string;
  dateFormat?: string;
}

interface PasskeyLoginOptions {
  hasPasskeys: boolean;
  challengeId?: string;
  options?: any;
}

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  login: (email: string, code: string) => Promise<boolean>;
  logout: () => void;
  requestEmailVerification: (email: string) => Promise<string | undefined>;
  checkPasskeyOptions: (email: string) => Promise<PasskeyLoginOptions>;
  loginWithPasskey: (challengeId: string, optionsJson: any) => Promise<boolean>;
  loginWithDiscoverablePasskey: () => Promise<boolean>;
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

function mapUserFromMeResponse(userData: any): User {
  return {
    id: userData.id || '',
    email: userData.email,
    username: userData.username,
    role: userData.role,
    minecraftUsername: userData.minecraftUsername,
    language: userData.language || 'en',
    dateFormat: userData.dateFormat || 'MM/DD/YYYY',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchAuthenticatedUser = async (): Promise<User | null> => {
    const response = await authFetch('/v1/panel/auth/me');
    if (!response.ok) {
      return null;
    }

    const userData = await response.json();
    return mapUserFromMeResponse(userData);
  };

  // Check for existing session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const authenticatedUser = await fetchAuthenticatedUser();
        setUser(authenticatedUser);
      } catch (error) {
        // Session check failed, user is not authenticated
        console.error('Session check failed:', error);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();
  }, []);

  // Sync date locale, date format, and i18n language when user settings change
  useEffect(() => {
    const lang = user?.language || 'en';
    setDateLocale(lang);
    setDateFormat(user?.dateFormat || 'MM/DD/YYYY');
    i18n.changeLanguage(lang);
  }, [user?.language, user?.dateFormat]);

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
          if (data.retryAfterSeconds) {
            description += ` Please wait ${data.retryAfterSeconds} seconds before trying again.`;
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
          if (data.retryAfterSeconds) {
            description += ` Please wait ${data.retryAfterSeconds} seconds before trying again.`;
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

      const authenticatedUser = await fetchAuthenticatedUser();
      if (!authenticatedUser) {
        toast({
          title: i18n.t('toast.loginError'),
          description: i18n.t('toast.loginErrorDesc'),
          variant: "destructive",
        });
        setIsLoading(false);
        return false;
      }

      setUser(authenticatedUser);

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

  const checkPasskeyOptions = async (email: string): Promise<PasskeyLoginOptions> => {
    try {
      const response = await authFetch('/v1/panel/auth/webauthn/login/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        return { hasPasskeys: false };
      }
      const data = await response.json();
      return {
        hasPasskeys: data.hasPasskeys === true,
        challengeId: data.challengeId,
        options: data.options,
      };
    } catch {
      return { hasPasskeys: false };
    }
  };

  const loginWithPasskey = async (challengeId: string, optionsJson: any): Promise<boolean> => {
    setIsLoading(true);
    try {
      const optionsJSON = optionsJson?.publicKey ?? optionsJson;
      const assertionResponse = await startAuthentication({ optionsJSON });

      const response = await authFetch('/v1/panel/auth/webauthn/login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId,
          response: JSON.stringify(assertionResponse),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Authentication failed' }));
        toast({
          title: i18n.t('toast.loginFailed'),
          description: data.error || 'Passkey authentication failed',
          variant: 'destructive',
        });
        setIsLoading(false);
        return false;
      }

      const authenticatedUser = await fetchAuthenticatedUser();
      if (!authenticatedUser) {
        toast({
          title: i18n.t('toast.loginError'),
          description: i18n.t('toast.loginErrorDesc'),
          variant: 'destructive',
        });
        setIsLoading(false);
        return false;
      }

      setUser(authenticatedUser);
      toast({
        title: i18n.t('toast.loginSuccess'),
        description: i18n.t('toast.loginSuccessDesc'),
      });
      setIsLoading(false);
      return true;
    } catch (e: any) {
      // User cancelled the WebAuthn prompt
      if (e.name === 'NotAllowedError') {
        setIsLoading(false);
        return false;
      }
      console.error('Passkey login error:', e);
      toast({
        title: i18n.t('toast.loginError'),
        description: 'Passkey authentication failed',
        variant: 'destructive',
      });
      setIsLoading(false);
      return false;
    }
  };

  const loginWithDiscoverablePasskey = async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      // 1. Get discoverable challenge from backend (no email needed)
      const startRes = await authFetch('/v1/panel/auth/webauthn/login/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!startRes.ok) {
        toast({
          title: i18n.t('toast.loginError'),
          description: 'Failed to start passkey authentication',
          variant: 'destructive',
        });
        setIsLoading(false);
        return false;
      }
      const { challengeId, options } = await startRes.json();

      // 2. Browser shows passkey picker — user selects account
      const optionsJSON = options?.publicKey ?? options;
      const assertionResponse = await startAuthentication({ optionsJSON });

      // 3. Verify with backend
      const verifyRes = await authFetch('/v1/panel/auth/webauthn/login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId,
          response: JSON.stringify(assertionResponse),
        }),
      });

      if (!verifyRes.ok) {
        const data = await verifyRes.json().catch(() => ({ error: 'Authentication failed' }));
        toast({
          title: i18n.t('toast.loginFailed'),
          description: data.error || 'Passkey authentication failed',
          variant: 'destructive',
        });
        setIsLoading(false);
        return false;
      }

      const authenticatedUser = await fetchAuthenticatedUser();
      if (!authenticatedUser) {
        toast({
          title: i18n.t('toast.loginError'),
          description: i18n.t('toast.loginErrorDesc'),
          variant: 'destructive',
        });
        setIsLoading(false);
        return false;
      }

      setUser(authenticatedUser);
      toast({
        title: i18n.t('toast.loginSuccess'),
        description: i18n.t('toast.loginSuccessDesc'),
      });
      setIsLoading(false);
      return true;
    } catch (e: any) {
      if (e.name === 'NotAllowedError') {
        setIsLoading(false);
        return false;
      }
      console.error('Discoverable passkey login error:', e);
      toast({
        title: i18n.t('toast.loginError'),
        description: 'Passkey authentication failed',
        variant: 'destructive',
      });
      setIsLoading(false);
      return false;
    }
  };

  const logout = async () => {
    setIsLoading(true);
    let shouldRedirectToAuth = false;

    try {
      const response = await authFetch('/v1/panel/auth/logout', { method: 'POST' });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to logout on server." }));
        toast({
          title: i18n.t('toast.logoutError'),
          description: errorData.message || i18n.t('toast.logoutErrorDesc'),
          variant: "destructive",
        });
        try {
          const authenticatedUser = await fetchAuthenticatedUser();
          setUser(authenticatedUser);
        } catch {
          // Keep the current client state if we can't verify server auth state.
        }
        return;
      }

      const authenticatedUser = await fetchAuthenticatedUser();
      if (authenticatedUser) {
        setUser(authenticatedUser);
        toast({
          title: i18n.t('toast.logoutError'),
          description: "Logout did not fully clear your server session. Please try again.",
          variant: "destructive",
        });
        return;
      }

      setUser(null);
      shouldRedirectToAuth = true;
      toast({
        title: i18n.t('toast.logoutSuccess'),
        description: i18n.t('toast.logoutSuccessDesc'),
      });
    } catch (error) {
      console.error("Logout error:", error);
      try {
        const authenticatedUser = await fetchAuthenticatedUser();
        setUser(authenticatedUser);
      } catch {
        // Keep the current client state if we can't verify server auth state.
      }
      toast({
        title: i18n.t('toast.logoutError'),
        description: i18n.t('toast.logoutErrorDesc'),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      if (shouldRedirectToAuth) {
        navigate('/auth');
      }
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
        checkPasskeyOptions,
        loginWithPasskey,
        loginWithDiscoverablePasskey,
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
