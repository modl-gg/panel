import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import PageContainer from '@/components/layout/PageContainer';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@modl-gg/shared-web/hooks/use-toast';
import { useTranslation } from 'react-i18next';

const AcceptInvitationPage = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState('');
  const [, navigate] = useLocation();
  const { user, isLoading } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (isLoading) {
      return; // Wait for the auth state to be determined
    }

    if (user) {
      toast({
        title: t('pages.acceptInvitation.alreadyLoggedInTitle'),
        description: t('pages.acceptInvitation.alreadyLoggedInDesc'),
        variant: 'destructive',
      });
      navigate('/panel');
      return;
    }

    const token = new URLSearchParams(window.location.search).get('token');

    if (!token) {
      setStatus(t('pages.acceptInvitation.invalidLink'));
      return;
    }

    const verifyToken = async () => {
      try {
        const { getApiUrl, getCurrentDomain } = await import('@/lib/api');
        const response = await fetch(getApiUrl('/v1/public/staff/invitations/accept'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Server-Domain': getCurrentDomain() },
          credentials: 'include',
          body: JSON.stringify({ token })
        });
        if (response.ok) {
          setStatus(t('pages.acceptInvitation.accepted'));
          window.location.href = '/panel';
        } else {
          const errorData = await response.json();
          setStatus(errorData.message || t('pages.acceptInvitation.invalidLink'));
        }
      } catch (error) {
        setStatus(t('pages.acceptInvitation.error'));
      }
    };

    verifyToken();
  }, [user, isLoading, navigate, toast]);

  return (
    <PageContainer>
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">{t('pages.acceptInvitation.title')}</h1>
          <p>{status || t('pages.acceptInvitation.verifying')}</p>
        </div>
      </div>
    </PageContainer>
  );
};

export default AcceptInvitationPage;