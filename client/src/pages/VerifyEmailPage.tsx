import { useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';
import { getApiUrl, getCurrentDomain } from '@/lib/api';

type VerificationState = 'loading' | 'success' | 'error';

interface VerifyResponse {
  success: boolean;
  message: string;
}

async function verifyEmail(token: string): Promise<VerifyResponse> {
  const url = getApiUrl(`/v1/public/registration/verify?token=${encodeURIComponent(token)}`);
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Server-Domain': getCurrentDomain(),
    },
  });
  return response.json();
}

export default function VerifyEmailPage() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const [state, setState] = useState<VerificationState>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const token = params.get('token');

    if (!token) {
      setState('error');
      setMessage('No verification token provided.');
      return;
    }

    verifyEmail(token)
      .then((response) => {
        if (response.success) {
          setState('success');
          setMessage(response.message);
        } else {
          setState('error');
          setMessage(response.message);
        }
      })
      .catch(() => {
        setState('error');
        setMessage('Failed to verify email. Please try again later.');
      });
  }, [searchString]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {state === 'loading' && (
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              </div>
            )}
            {state === 'success' && (
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            )}
            {state === 'error' && (
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                <XCircle className="h-8 w-8 text-red-500" />
              </div>
            )}
          </div>
          <CardTitle>
            {state === 'loading' && 'Verifying Email...'}
            {state === 'success' && 'Email Verified!'}
            {state === 'error' && 'Verification Failed'}
          </CardTitle>
          <CardDescription className="mt-2">
            {message || (state === 'loading' ? 'Please wait while we verify your email address.' : '')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state === 'success' && (
            <Button className="w-full" onClick={() => navigate('/panel/auth')}>
              Sign In to Panel
            </Button>
          )}
          {state === 'error' && (
            <Button variant="outline" className="w-full" onClick={() => navigate('/')}>
              Go to Home
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
