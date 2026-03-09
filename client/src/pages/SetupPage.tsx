import { useEffect, useState, useCallback } from 'react';
import { useLocation, useSearch } from 'wouter';
import { CheckCircle, XCircle, Loader2, Mail, Server, LogIn } from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';
import { getApiUrl, getCurrentDomain } from '@/lib/api';
import { normalizeProvisioningStatus } from '@/lib/backend-enums';
import { useTranslation } from 'react-i18next';

type SetupState = 'verifying' | 'verified' | 'provisioning' | 'completing' | 'complete' | 'error';

interface VerifyResponse {
  success: boolean;
  message: string;
  subdomain: string | null;
  autoLoginToken: string | null;
}

interface SetupStatusResponse {
  subdomain: string | null;
  serverName: string | null;
  emailVerified: boolean;
  provisioningStatus: string | null;
  message: string;
}

interface AutoLoginResponse {
  success: boolean;
  message: string;
  redirectUrl: string | null;
}

async function verifyEmail(token: string): Promise<VerifyResponse> {
  const url = getApiUrl(`/v1/public/registration/verify?token=${encodeURIComponent(token)}`);
  const response = await fetch(url);
  return response.json();
}

async function getSetupStatus(token: string): Promise<SetupStatusResponse> {
  const url = getApiUrl(`/v1/public/registration/setup-status?token=${encodeURIComponent(token)}`);
  const response = await fetch(url);
  return response.json();
}

async function performAutoLogin(token: string): Promise<AutoLoginResponse> {
  const url = getApiUrl('/v1/public/registration/auto-login');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Server-Domain': getCurrentDomain(),
    },
    credentials: 'include',
    body: JSON.stringify({ token }),
  });
  return response.json();
}

interface StepIndicatorProps {
  step: number;
  currentStep: number;
  label: string;
  icon: React.ReactNode;
}

function StepIndicator({ step, currentStep, label, icon }: StepIndicatorProps) {
  const isComplete = currentStep > step;
  const isCurrent = currentStep === step;

  return (
    <div className="flex items-center gap-3">
      <div className={`
        w-10 h-10 rounded-full flex items-center justify-center transition-colors
        ${isComplete ? 'bg-green-500/20' : isCurrent ? 'bg-primary/20' : 'bg-muted'}
      `}>
        {isComplete ? (
          <CheckCircle className="h-5 w-5 text-green-500" />
        ) : isCurrent ? (
          <Loader2 className="h-5 w-5 text-primary animate-spin" />
        ) : (
          <span className="text-muted-foreground">{icon}</span>
        )}
      </div>
      <span className={`text-sm ${isCurrent ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
        {label}
      </span>
    </div>
  );
}

export default function SetupPage() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const [state, setState] = useState<SetupState>('verifying');
  const [message, setMessage] = useState('');
  const [autoLoginToken, setAutoLoginToken] = useState<string | null>(null);
  const [serverName, setServerName] = useState<string | null>(null);

  const getCurrentStep = (): number => {
    switch (state) {
      case 'verifying': return 1;
      case 'verified':
      case 'provisioning': return 2;
      case 'completing':
      case 'complete': return 3;
      case 'error': return 0;
      default: return 1;
    }
  };

  const pollSetupStatus = useCallback(async (token: string) => {
    try {
      const status = await getSetupStatus(token);

      if (!status.provisioningStatus) {
        setMessage(status.message || 'Unable to check setup status.');
        setState('error');
        return;
      }

      setServerName(status.serverName);
      const provisioningStatus = normalizeProvisioningStatus(status.provisioningStatus);

      if (provisioningStatus === 'COMPLETED') {
        setState('completing');
        setMessage(t('pages.setup.setupComplete'));

        const loginResult = await performAutoLogin(token);
        if (loginResult.success) {
          setState('complete');
          setMessage(t('pages.setup.welcome'));
          setTimeout(() => {
            // Use full page reload to ensure auth context refreshes with new session
            window.location.href = loginResult.redirectUrl || '/panel';
          }, 1500);
        } else {
          setMessage(loginResult.message || t('pages.setup.autoLoginFailed'));
          setState('error');
        }
      } else if (provisioningStatus === 'FAILED') {
        setMessage(t('pages.setup.setupFailed'));
        setState('error');
      } else {
        setMessage(status.message || t('pages.setup.settingUpServer'));
        setTimeout(() => pollSetupStatus(token), 3000);
      }
    } catch {
      setMessage(t('pages.setup.unableToCheckStatus'));
      setState('error');
    }
  }, [navigate]);

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const token = params.get('token');
    const status = params.get('status');
    const reason = params.get('reason');

    // If accessed without token but with status=check, show appropriate message
    if (!token && status === 'check') {
      if (reason === 'email_not_verified') {
        setMessage(t('pages.setup.emailNotVerified'));
      } else if (reason === 'provisioning_incomplete') {
        setMessage(t('pages.setup.provisioningIncomplete'));
      } else {
        setMessage(t('pages.setup.serverNotReady'));
      }
      setState('error');
      return;
    }

    if (!token) {
      setMessage(t('pages.setup.noToken'));
      setState('error');
      return;
    }

    // Start the verification flow
    verifyEmail(token)
      .then((response) => {
        if (response.success && response.autoLoginToken) {
          setState('verified');
          setMessage(t('pages.setup.emailVerifiedSettingUp'));
          setAutoLoginToken(response.autoLoginToken);

          // Short delay to show the verified state, then start polling
          setTimeout(() => {
            setState('provisioning');
            pollSetupStatus(response.autoLoginToken!);
          }, 1500);
        } else if (response.success) {
          // Email verified but no auto-login token (shouldn't happen normally)
          setState('verified');
          setMessage(t('pages.setup.emailVerifiedSignIn'));
        } else {
          setState('error');
          setMessage(response.message || t('pages.setup.verificationFailed'));
        }
      })
      .catch(() => {
        setState('error');
        setMessage(t('pages.setup.failedToVerifyEmail'));
      });
  }, [searchString, pollSetupStatus]);

  const currentStep = getCurrentStep();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {state === 'error' ? (
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                <XCircle className="h-8 w-8 text-red-500" />
              </div>
            ) : state === 'complete' ? (
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              </div>
            )}
          </div>
          <CardTitle>
            {state === 'error' && t('pages.setup.stateError')}
            {state === 'verifying' && t('pages.setup.stateVerifying')}
            {state === 'verified' && t('pages.setup.stateVerified')}
            {state === 'provisioning' && t('pages.setup.stateProvisioning')}
            {state === 'completing' && t('pages.setup.stateCompleting')}
            {state === 'complete' && t('pages.setup.stateComplete')}
          </CardTitle>
          {serverName && state !== 'error' && (
            <CardDescription className="mt-1 font-medium">
              {serverName}
            </CardDescription>
          )}
          <CardDescription className="mt-2">
            {message}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {state !== 'error' && (
            <div className="space-y-4 py-4">
              <StepIndicator
                step={1}
                currentStep={currentStep}
                label={t('pages.setup.stepVerifyEmail')}
                icon={<Mail className="h-5 w-5" />}
              />
              <StepIndicator
                step={2}
                currentStep={currentStep}
                label={t('pages.setup.stepSetupServer')}
                icon={<Server className="h-5 w-5" />}
              />
              <StepIndicator
                step={3}
                currentStep={currentStep}
                label={t('pages.setup.stepSignIn')}
                icon={<LogIn className="h-5 w-5" />}
              />
            </div>
          )}

          {state === 'error' && (
            <div className="space-y-3">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate('/panel/auth')}
              >
                {t('pages.setup.signInManually')}
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => navigate('/')}
              >
                {t('pages.setup.goToHome')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
