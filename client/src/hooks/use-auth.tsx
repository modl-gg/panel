import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@modl-gg/shared-web/hooks/use-toast";
import { getApiUrl, getCurrentDomain } from "@/lib/api";
import { DEFAULT_DATE_FORMAT, setDateLocale, setDateFormat } from "@/utils/date-utils";
import { startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { isWebAuthnCancellation, unwrapPublicKeyOptions, type MaybePublicKeyWrapped } from "@/utils/webauthn";
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

type PasskeyRequestOptions = MaybePublicKeyWrapped<PublicKeyCredentialRequestOptionsJSON>;

interface PasskeyLoginOptions {
  hasPasskeys: boolean;
  challengeId?: string;
  options?: PasskeyRequestOptions;
}

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  refreshUser: () => Promise<void>;
  login: (email: string, code: string) => Promise<boolean>;
  logout: () => void;
  signOutAllSessions: () => void;
  requestEmailVerification: (email: string) => Promise<boolean>;
  checkPasskeyOptions: (email: string) => Promise<PasskeyLoginOptions>;
  loginWithPasskey: (challengeId: string, optionsJson: PasskeyRequestOptions) => Promise<boolean>;
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

interface MeResponse {
  id?: string;
  email: string;
  username: string;
  role: User['role'];
  minecraftUsername?: string;
  language?: string;
  dateFormat?: string;
}

function mapUserFromMeResponse(userData: MeResponse): User {
  return {
    id: userData.id || '',
    email: userData.email,
    username: userData.username,
    role: userData.role,
    minecraftUsername: userData.minecraftUsername,
    language: userData.language || undefined,
    dateFormat: userData.dateFormat || DEFAULT_DATE_FORMAT,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAuthenticatedUser = useCallback(async (): Promise<User | null> => {
    const response = await authFetch('/v1/panel/auth/me');
    if (!response.ok) {
      return null;
    }

    const userData: MeResponse = await response.json();
    return mapUserFromMeResponse(userData);
  }, []);

  const refreshUser = useCallback(async () => {
    const authenticatedUser = await fetchAuthenticatedUser();
    setUser(authenticatedUser);
  }, [fetchAuthenticatedUser]);

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
  }, [fetchAuthenticatedUser]);

  useEffect(() => {
    const lang = user?.language || 'en';
    const dateFormat = user?.dateFormat || DEFAULT_DATE_FORMAT;
    setDateLocale(lang);
    setDateFormat(dateFormat);
  }, [user?.language, user?.dateFormat]);

  const requestEmailVerification = useCallback(async (email: string): Promise<boolean> => {
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
        return false;
      }
      toast({
        title: i18n.t('toast.verificationSent'),
        description: i18n.t('toast.verificationSentDesc'),
      });
      return true;
    } catch (error) {
      console.error("Error requesting email verification:", error);
      toast({
        title: i18n.t('toast.networkError'),
        description: i18n.t('toast.networkErrorDesc'),
        variant: "destructive",
      });
      return false;
    }
  }, [toast]);

  const login = useCallback(async (email: string, code: string): Promise<boolean> => {
    try {
      const response = await authFetch('/v1/panel/auth/verify-email-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          let description = data.error || data.message || "Too many attempts.";
          if (data.retryAfterSeconds) {
            description += ` Please wait ${data.retryAfterSeconds} seconds before trying again.`;
          }
          toast({
            title: i18n.t('toast.rateLimitExceeded'),
            description: description,
            variant: "destructive",
          });
        }
        return false;
      }

      const authenticatedUser = await fetchAuthenticatedUser();
      if (!authenticatedUser) {
        toast({
          title: i18n.t('toast.loginError'),
          description: i18n.t('toast.loginErrorDesc'),
          variant: "destructive",
        });
        return false;
      }

      setUser(authenticatedUser);

      toast({
        title: i18n.t('toast.loginSuccess'),
        description: i18n.t('toast.loginSuccessDesc'),
      });

      return true;

    } catch (error) {
      console.error("Login error:", error);
      toast({
        title: i18n.t('toast.loginError'),
        description: i18n.t('toast.loginErrorDesc'),
        variant: "destructive",
      });
      return false;
    }
  }, [fetchAuthenticatedUser, toast]);

  const checkPasskeyOptions = useCallback(async (email: string): Promise<PasskeyLoginOptions> => {
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
  }, []);

  const loginWithPasskey = useCallback(async (challengeId: string, optionsJson: PasskeyRequestOptions): Promise<boolean> => {
    try {
      const optionsJSON = unwrapPublicKeyOptions(optionsJson);
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
        return false;
      }

      const authenticatedUser = await fetchAuthenticatedUser();
      if (!authenticatedUser) {
        toast({
          title: i18n.t('toast.loginError'),
          description: i18n.t('toast.loginErrorDesc'),
          variant: 'destructive',
        });
        return false;
      }

      setUser(authenticatedUser);
      toast({
        title: i18n.t('toast.loginSuccess'),
        description: i18n.t('toast.loginSuccessDesc'),
      });
      return true;
    } catch (e) {
      // User cancelled the WebAuthn prompt
      if (isWebAuthnCancellation(e)) {
        return false;
      }
      console.error('Passkey login error:', e);
      toast({
        title: i18n.t('toast.loginError'),
        description: 'Passkey authentication failed',
        variant: 'destructive',
      });
      return false;
    }
  }, [fetchAuthenticatedUser, toast]);

  const loginWithDiscoverablePasskey = useCallback(async (): Promise<boolean> => {
    try {
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
        return false;
      }
      const { challengeId, options }: { challengeId: string; options: PasskeyRequestOptions } = await startRes.json();

      const optionsJSON = unwrapPublicKeyOptions(options);
      const assertionResponse = await startAuthentication({ optionsJSON });

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
        return false;
      }

      const authenticatedUser = await fetchAuthenticatedUser();
      if (!authenticatedUser) {
        toast({
          title: i18n.t('toast.loginError'),
          description: i18n.t('toast.loginErrorDesc'),
          variant: 'destructive',
        });
        return false;
      }

      setUser(authenticatedUser);
      toast({
        title: i18n.t('toast.loginSuccess'),
        description: i18n.t('toast.loginSuccessDesc'),
      });
      return true;
    } catch (e) {
      if (isWebAuthnCancellation(e)) {
        return false;
      }
      console.error('Discoverable passkey login error:', e);
      toast({
        title: i18n.t('toast.loginError'),
        description: 'Passkey authentication failed',
        variant: 'destructive',
      });
      return false;
    }
  }, [fetchAuthenticatedUser, toast]);

  const finalizeSignOut = useCallback(async (invalidate: () => Promise<Response>) => {
    let shouldRedirectToAuth = false;

    try {
      const response = await invalidate();
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
      if (shouldRedirectToAuth) {
        navigate('/auth');
      }
    }
  }, [fetchAuthenticatedUser, navigate, toast]);

  const logout = useCallback(
    () => finalizeSignOut(() => authFetch('/v1/panel/auth/logout', { method: 'POST' })),
    [finalizeSignOut]
  );

  const signOutAllSessions = useCallback(
    () => finalizeSignOut(() => authFetch('/v1/panel/auth/sessions', { method: 'DELETE' })),
    [finalizeSignOut]
  );

  const contextValue = useMemo<AuthContextType>(() => ({
    user,
    isLoading,
    refreshUser,
    login,
    logout,
    signOutAllSessions,
    requestEmailVerification,
    checkPasskeyOptions,
    loginWithPasskey,
    loginWithDiscoverablePasskey,
  }), [
    user,
    isLoading,
    refreshUser,
    login,
    logout,
    signOutAllSessions,
    requestEmailVerification,
    checkPasskeyOptions,
    loginWithPasskey,
    loginWithDiscoverablePasskey,
  ]);

  return (
    <AuthContext.Provider value={contextValue}>
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
