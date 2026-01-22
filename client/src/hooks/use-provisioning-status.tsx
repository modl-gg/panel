import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { apiFetch } from '@/lib/api';

interface ProvisioningStatusResponse {
  status: string;
  serverName: string;
  emailVerified: boolean;
}

export function useProvisioningStatusCheck() {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    // Don't check if we're already on the provisioning page or auth-related pages
    const exemptPaths = [
      '/provisioning-in-progress',
      '/auth',
      '/pending-verification',
      '/resend-verification',
      '/verify-email',
      '/ticket',
      '/tickets',
      '/appeal',
      '/knowledgebase',
    ];

    if (exemptPaths.some(path => location.startsWith(path)) || location === '/') {
      return;
    }

    const checkProvisioningStatus = async () => {
      try {
        const response = await apiFetch('/v1/panel/server/provisioning-status');

        if (!response.ok) {
          // If we get a 401 or 403, it's likely an auth issue, not a provisioning issue
          if (response.status === 401 || response.status === 403) {
            return;
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data: ProvisioningStatusResponse = await response.json();

        // If email not verified or server not completed, redirect to setup page
        if (process.env.ENVIRONMENT !== 'development') {
          if (!data.emailVerified) {
            setLocation('/verify-email?status=check&reason=email_not_verified');
          } else if (data.status !== 'completed') {
            setLocation('/verify-email?status=check&reason=provisioning_incomplete');
          }
        }
      } catch (error) {
        console.error('Error checking provisioning status:', error);
        // Don't redirect on error - let the user continue to the panel
        // This prevents breaking the app if the API is temporarily unavailable
      }
    };

    checkProvisioningStatus();
  }, [setLocation, location]);
} 