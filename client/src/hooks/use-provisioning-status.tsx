import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { apiFetch } from '@/lib/api';
import { normalizeProvisioningStatus } from '@/lib/backend-enums';

interface ProvisioningStatusResponse {
  status?: string | null;
  provisioningStatus?: string | null;
  serverName?: string | null;
  emailVerified?: boolean | null;
}

export function useProvisioningStatusCheck() {
  const [location, setLocation] = useLocation();

  useEffect(() => {
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
          if (response.status === 401 || response.status === 403) {
            return;
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data: ProvisioningStatusResponse = await response.json();
        const provisioningStatus = normalizeProvisioningStatus(data.status ?? data.provisioningStatus);
        const emailVerified = data.emailVerified === true;

        if (process.env.ENVIRONMENT !== 'development') {
          if (!emailVerified) {
            setLocation('/verify-email?status=check&reason=email_not_verified');
          } else if (provisioningStatus !== 'COMPLETED') {
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
