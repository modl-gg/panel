import { useQuery } from '@tanstack/react-query';
import { getApiUrl, getCurrentDomain } from '@/lib/api';

async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const fullUrl = getApiUrl(url);
  return fetch(fullUrl, {
    ...options,
    credentials: "include",
    headers: {
      ...options.headers,
      "X-Server-Domain": getCurrentDomain(),
    },
  });
}

export interface MediaUploadConfig {
  backblazeConfigured: boolean;
  supportedTypes: {
    evidence: string[];
    tickets: string[];
    appeals: string[];
    articles: string[];
    'server-icons': string[];
  };
  fileSizeLimits: {
    evidence: number;
    tickets: number;
    appeals: number;
    articles: number;
    'server-icons': number;
  };
}

export function useMediaUploadConfig() {
  return useQuery<MediaUploadConfig>({
    queryKey: ['/v1/media/config'],
    queryFn: async () => {
      // Check if we're on a public page (player ticket, appeals, etc.)
      const currentPath = window.location.pathname;
      const isPublicPage = currentPath.startsWith('/ticket/') ||
                          currentPath.startsWith('/appeal') ||
                          currentPath === '/' ||
                          currentPath.startsWith('/knowledgebase') ||
                          currentPath.startsWith('/article/');

      try {
        // If on public page, try public endpoint first to avoid 401 in network tab
        if (isPublicPage) {
          const publicResponse = await apiFetch('/v1/public/media/config');
          if (publicResponse.ok) {
            return publicResponse.json();
          }
        } else {
          // For panel pages, try authenticated endpoint first
          const response = await apiFetch('/v1/panel/media/config');
          if (response.ok) {
            return response.json();
          }
          // If 401 (unauthorized), try public endpoint
          if (response.status === 401) {
            const publicResponse = await apiFetch('/v1/public/media/config');
            if (publicResponse.ok) {
              return publicResponse.json();
            }
          }
        }
        throw new Error('Failed to fetch media upload configuration from all available endpoints');
      } catch (error) {
        // Last resort: try the other endpoint if one failed
        try {
          const fallbackUrl = isPublicPage ? '/v1/panel/media/config' : '/v1/public/media/config';
          const fallbackResponse = await apiFetch(fallbackUrl);
          if (fallbackResponse.ok) {
            return fallbackResponse.json();
          }
        } catch (fallbackError) {
          // If even fallback fails, use default values
          return {
            backblazeConfigured: false,
            supportedTypes: {
              evidence: [],
              tickets: [],
              appeals: [],
              articles: [],
              'server-icons': []
            },
            fileSizeLimits: {
              evidence: 0,
              tickets: 0,
              appeals: 0,
              articles: 0,
              'server-icons': 0
            }
          };
        }
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

export function useMediaUpload() {
  const config = useMediaUploadConfig();

  const uploadMedia = async (
    file: File,
    uploadType: 'evidence' | 'ticket' | 'appeal' | 'article' | 'server-icon',
    metadata: Record<string, any> = {}
  ): Promise<{ url: string; key: string }> => {
    // Evidence uploads support local storage fallback, others require Backblaze
    if (!config.data?.backblazeConfigured && uploadType !== 'evidence') {
      throw new Error('Media storage is not configured');
    }

    const formData = new FormData();
    formData.append('file', file);
    
    // Add metadata
    Object.entries(metadata).forEach(([key, value]) => {
      formData.append(key, value.toString());
    });

    // Check if we're on a public page (player ticket, appeals, etc.)
    const currentPath = window.location.pathname;
    const isPublicPage = currentPath.startsWith('/ticket/') || 
                        currentPath.startsWith('/appeal') || 
                        currentPath === '/' ||
                        currentPath.startsWith('/knowledgebase') ||
                        currentPath.startsWith('/article/');

    // Use public endpoint for ticket uploads on public pages
    if (isPublicPage && uploadType === 'ticket') {
      const response = await apiFetch('/v1/public/media/upload/ticket', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const result = await response.json();
      return { url: result.url, key: result.key };
    } else {
      // Use authenticated endpoint for panel pages or non-ticket uploads
      const response = await apiFetch(`/v1/panel/media/upload/${uploadType}`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const result = await response.json();
      return { url: result.url, key: result.key };
    }
  };

  const deleteMedia = async (key: string): Promise<void> => {
    const response = await apiFetch(`/v1/panel/media/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Delete failed');
    }
  };

  return {
    config: config.data,
    isConfigLoading: config.isLoading,
    configError: config.error,
    uploadMedia,
    deleteMedia,
  };
}