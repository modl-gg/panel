import { useQuery } from '@tanstack/react-query';

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
    queryKey: ['/api/media/config'],
    queryFn: async () => {
      // Try authenticated endpoint first, then fall back to public endpoint
      try {
        const response = await fetch('/api/panel/media/config');
        if (response.ok) {
          return response.json();
        }
        // If 401 (unauthorized), try public endpoint
        if (response.status === 401) {
          const publicResponse = await fetch('/api/public/media/config');
          if (publicResponse.ok) {
            return publicResponse.json();
          }
        }
        throw new Error(`Failed to fetch media upload configuration: ${response.status}`);
      } catch (error) {
        // If authenticated endpoint fails completely, try public endpoint
        const publicResponse = await fetch('/api/public/media/config');
        if (publicResponse.ok) {
          return publicResponse.json();
        }
        throw new Error('Failed to fetch media upload configuration from both endpoints');
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
    if (!config.data?.backblazeConfigured) {
      throw new Error('Media storage is not configured');
    }

    const formData = new FormData();
    formData.append('file', file);
    
    // Add metadata
    Object.entries(metadata).forEach(([key, value]) => {
      formData.append(key, value.toString());
    });

    const { csrfFetch } = await import('@/utils/csrf');
    const response = await csrfFetch(`/api/panel/media/upload/${uploadType}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Upload failed');
    }

    const result = await response.json();
    return { url: result.url, key: result.key };
  };

  const deleteMedia = async (key: string): Promise<void> => {
    const { csrfFetch } = await import('@/utils/csrf');
    const response = await csrfFetch(`/api/panel/media/${encodeURIComponent(key)}`, {
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