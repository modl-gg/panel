import { useEffect } from 'react';
import { useLocation } from 'wouter';

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
        const response = await fetch('/api/panel/provisioning-status', {
          credentials: 'include'
        });

        if (!response.ok) {
          // If we get a 401 or 403, it's likely an auth issue, not a provisioning issue
          if (response.status === 401 || response.status === 403) {
            return;
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data: ProvisioningStatusResponse = await response.json();

        // If the server is not completed, redirect to provisioning page
        if (data.status !== 'completed' && process.env.ENVIRONMENT !== 'development') {
          const serverName = data.serverName;
          
          // Redirect to provisioning page with server name
          setLocation(`/provisioning-in-progress?server=${serverName}&message=provisioning_incomplete&toastType=info`);
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