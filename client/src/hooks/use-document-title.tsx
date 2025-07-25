import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { usePublicSettings } from '@/hooks/use-public-settings';

/**
 * Get the page name from the current route
 */
function getPageName(location: string): string {
  // Handle panel routes
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
  
  // Handle public routes
  if (location === '/') return 'Support';
  if (location === '/knowledgebase') return 'Knowledge Base';
  if (location === '/appeal') return 'Appeals';
  if (location === '/auth') return 'Login';
  if (location.startsWith('/ticket/')) return 'Ticket';
  if (location === '/provisioning-in-progress') return 'Provisioning';
  if (location.startsWith('/accept-invitation')) return 'Accept Invitation';
  
  // Default fallback
  return '';
}

/**
 * Hook to manage document title and favicon based on server settings
 */
export function useDocumentTitle() {
  const { data: publicSettings } = usePublicSettings();
  const [location] = useLocation();

  useEffect(() => {
    // Hook triggered
    
    const serverDisplayName = publicSettings?.serverDisplayName || '';
    const panelIconUrl = publicSettings?.panelIconUrl;
    const homepageIconUrl = publicSettings?.homepageIconUrl;
    const pageName = getPageName(location);

    // Determine which icon to use based on the route
    const isHomepageRoute = !location.startsWith('/panel');
    const iconUrl = isHomepageRoute ? homepageIconUrl : panelIconUrl;

    // Update document title
    if (serverDisplayName) {
      document.title = pageName ? `${pageName} - ${serverDisplayName}` : serverDisplayName;
    } else {
      document.title = pageName ? `${pageName} - modl` : 'modl';
    }

    // Update favicon if available
    if (iconUrl) {
      // Setting favicon
      // Remove existing favicon links
      const existingFavicons = document.querySelectorAll('link[rel*="icon"]');
      existingFavicons.forEach(link => link.remove());

      // Add new favicon
      const link = document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/x-icon';
      link.href = iconUrl;
      document.head.appendChild(link);

      // Also add apple-touch-icon for mobile
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
