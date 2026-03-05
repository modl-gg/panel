import { useEffect, useState } from 'react';
import { useParams } from 'wouter';
import PageContainer from '@/components/layout/PageContainer';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

const VerifyPage = () => {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying your identity...');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Invalid verification link.');
      return;
    }

    const verify = async () => {
      try {
        const { getApiUrl, getCurrentDomain } = await import('@/lib/api');
        const response = await fetch(getApiUrl(`/v1/public/staff/2fa/verify/${token}`), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Server-Domain': getCurrentDomain(),
          },
        });

        if (response.ok) {
          setStatus('success');
          setMessage('Identity verified! You can close this page and return to the game.');
        } else if (response.status === 404) {
          setStatus('error');
          setMessage('This verification link is invalid or has already been used.');
        } else {
          setStatus('error');
          setMessage('Verification failed. Please try again.');
        }
      } catch {
        setStatus('error');
        setMessage('An error occurred while verifying. Please try again.');
      }
    };

    verify();
  }, [token]);

  return (
    <PageContainer>
      <div className="flex items-center justify-center h-screen">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-4">Staff Verification</h1>
          <div className="flex flex-col items-center gap-4">
            {status === 'loading' && (
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            )}
            {status === 'success' && (
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            )}
            {status === 'error' && (
              <XCircle className="h-8 w-8 text-red-500" />
            )}
            <p className="text-muted-foreground">{message}</p>
          </div>
        </div>
      </div>
    </PageContainer>
  );
};

export default VerifyPage;
