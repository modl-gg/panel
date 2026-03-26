import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { usePublicSettings } from '@/hooks/use-public-settings';

function getPageName(location: string): string {
  if (location.startsWith('/panel')) {
    if (location === '/panel') return 'Dashboard';
    if (location === '/panel/lookup') return 'Player Lookup';
    if (location === '/panel/tickets') return 'Tickets';
    if (location.startsWith('/panel/tickets/')) return 'Ticket Details';
    if (location === '/panel/audit') return 'Audit Log';
    if (location === '/panel/settings') return 'Settings';
    if (location === '/panel/api-docs') return 'API Documentation';
    if (location === '/panel/auth') return 'Staff Login';
    if (location.startsWith('/panel/player/')) return 'Player Details';
    return '';
  }

  if (location === '/') return 'Support';
  if (location === '/knowledgebase') return 'Knowledge Base';
  if (location === '/appeal') return 'Appeals';
  if (location === '/auth') return 'Login';
  if (location.startsWith('/ticket/')) return 'Ticket';
  if (location === '/provisioning-in-progress') return 'Provisioning';
  if (location.startsWith('/accept-invitation')) return 'Accept Invitation';

  return '';
}

export function useDocumentTitle() {
  const { data: publicSettings, isLoading } = usePublicSettings();
  const [location] = useLocation();

  useEffect(() => {
    const serverDisplayName = publicSettings?.serverDisplayName || '';
    const panelIconUrl = publicSettings?.panelIconUrl;
    const homepageIconUrl = publicSettings?.homepageIconUrl;
    const pageName = getPageName(location);

    const isHomepageRoute = !location.startsWith('/panel');
    const iconUrl = isHomepageRoute ? homepageIconUrl : panelIconUrl;

    if (isLoading) {
      document.title = 'Loading...';
    } else if (serverDisplayName) {
      document.title = pageName ? `${pageName} - ${serverDisplayName}` : serverDisplayName;
    } else {
      document.title = pageName || 'Panel';
    }

    if (iconUrl) {
      const existingFavicons = document.querySelectorAll('link[rel*="icon"]');
      existingFavicons.forEach(link => link.remove());

      const link = document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/x-icon';
      link.href = iconUrl;
      document.head.appendChild(link);

      const appleTouchIcon = document.createElement('link');
      appleTouchIcon.rel = 'apple-touch-icon';
      appleTouchIcon.href = iconUrl;
      document.head.appendChild(appleTouchIcon);
    }
  }, [publicSettings, location]);

  return {
    serverDisplayName: publicSettings?.serverDisplayName || '',
    panelIconUrl: publicSettings?.panelIconUrl || '',
    homepageIconUrl: publicSettings?.homepageIconUrl || ''
  };
}
