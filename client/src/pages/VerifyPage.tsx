import { useEffect, useState } from 'react';
import { useParams } from 'wouter';
import PageContainer from '@/components/layout/PageContainer';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const VerifyPage = () => {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage(t('pages.verify.invalidLink'));
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
          setMessage(t('pages.verify.success'));
        } else if (response.status === 404) {
          setStatus('error');
          setMessage(t('pages.verify.invalidOrUsed'));
        } else {
          setStatus('error');
          setMessage(t('pages.verify.failed'));
        }
      } catch {
        setStatus('error');
        setMessage(t('pages.verify.error'));
      }
    };

    verify();
  }, [token]);

  return (
    <PageContainer>
      <div className="flex items-center justify-center h-screen">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-4">{t('pages.verify.title')}</h1>
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
            <p className="text-muted-foreground">{message || t('pages.verify.verifying')}</p>
          </div>
        </div>
      </div>
    </PageContainer>
  );
};

export default VerifyPage;
