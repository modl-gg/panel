import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiUrl, getCurrentDomain } from '@/lib/api';
import { isPublicPage } from '@/utils/routes';

async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const credentials = options.credentials
    ?? (url.startsWith('/v1/public/') ? 'omit' : 'include');

  const fullUrl = getApiUrl(url);
  const response = await fetch(fullUrl, {
    ...options,
    credentials,
    headers: {
      ...options.headers,
      "X-Server-Domain": getCurrentDomain(),
    },
  });
  if (response.status === 429) {
    const { handleRateLimitResponse, getCurrentPath } = await import('../utils/rate-limit-handler');
    await handleRateLimitResponse(response, getCurrentPath());
    throw new Error('Rate limit exceeded');
  }
  return response;
}

export interface MediaUploadConfig {
  backblazeConfigured: boolean;
  cdnDomain: string | null;
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

interface PresignResponse {
  presignedUrl: string;
  key: string;
  expiresAt: string;
  method: string;
  requiredHeaders: Record<string, string>;
}

interface ConfirmResponse {
  key: string;
  url: string;
  fileName: string;
  size: number;
  contentType: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

const MEDIA_CONFIG_QUERY_KEY = ['/v1/media/config'];

async function fetchMediaConfig(): Promise<MediaUploadConfig> {
  const isPublic = isPublicPage();

  try {
    if (isPublic) {
      const publicResponse = await apiFetch('/v1/public/media/config');
      if (publicResponse.ok) {
        return publicResponse.json();
      }
    } else {
      const response = await apiFetch('/v1/panel/media/config');
      if (response.ok) {
        return response.json();
      }
      if (response.status === 401) {
        const publicResponse = await apiFetch('/v1/public/media/config');
        if (publicResponse.ok) {
          return publicResponse.json();
        }
      }
    }
    throw new Error('Failed to fetch media upload configuration from all available endpoints');
  } catch (error) {
    try {
      const fallbackUrl = isPublic ? '/v1/panel/media/config' : '/v1/public/media/config';
      const fallbackResponse = await apiFetch(fallbackUrl);
      if (fallbackResponse.ok) {
        return fallbackResponse.json();
      }
    } catch (fallbackError) {
      return {
        backblazeConfigured: false,
        cdnDomain: null,
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
}

export function useMediaUploadConfig() {
  return useQuery<MediaUploadConfig>({
    queryKey: MEDIA_CONFIG_QUERY_KEY,
    queryFn: fetchMediaConfig,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

function getEndpointPrefix(): string {
  return isPublicPage() ? '/v1/public/media' : '/v1/panel/media';
}

async function getPresignedUrl(
  file: File,
  uploadType: string
): Promise<PresignResponse> {
  const endpoint = `${getEndpointPrefix()}/presign`;
  
  const response = await apiFetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      uploadType,
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to get upload URL');
  }

  return response.json();
}

async function uploadToS3(
  presignedUrl: string,
  file: File,
  requiredHeaders: Record<string, string>,
  onProgress?: (progress: UploadProgress) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress({
          loaded: event.loaded,
          total: event.total,
          percentage: Math.round((event.loaded / event.total) * 100),
        });
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.statusText}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed due to network error'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload was aborted'));
    });

    xhr.open('PUT', presignedUrl, true);

    // Filter out headers that browsers don't allow setting manually
    const unsafeHeaders = ['content-length', 'host', 'connection', 'accept-encoding'];
    Object.entries(requiredHeaders).forEach(([key, value]) => {
      if (!unsafeHeaders.includes(key.toLowerCase())) {
        xhr.setRequestHeader(key, value);
      }
    });

    xhr.send(file);
  });
}

async function confirmUpload(key: string): Promise<ConfirmResponse> {
  const endpoint = `${getEndpointPrefix()}/confirm`;
  
  const response = await apiFetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ key }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || errorData.message || 'Failed to confirm upload');
  }

  return response.json();
}

export function useMediaUpload() {
  const config = useMediaUploadConfig();
  const queryClient = useQueryClient();

  const uploadMedia = async (
    file: File,
    uploadType: 'evidence' | 'ticket' | 'appeal' | 'article' | 'server-icon',
    _metadata: Record<string, unknown> = {},
    onProgress?: (progress: UploadProgress) => void
  ): Promise<{ url: string; key: string }> => {
    // Get fresh config from cache or fetch it
    let currentConfig = queryClient.getQueryData<MediaUploadConfig>(MEDIA_CONFIG_QUERY_KEY);
    
    // If no cached config or config says not configured, fetch fresh
    if (!currentConfig || !currentConfig.backblazeConfigured) {
      currentConfig = await fetchMediaConfig();
      queryClient.setQueryData(MEDIA_CONFIG_QUERY_KEY, currentConfig);
    }

    if (!currentConfig?.backblazeConfigured) {
      throw new Error('Media storage is not configured. Please check your Backblaze B2 credentials.');
    }

    const presign = await getPresignedUrl(file, uploadType);

    await uploadToS3(presign.presignedUrl, file, presign.requiredHeaders, onProgress);

    const confirmed = await confirmUpload(presign.key);

    return { url: confirmed.url, key: confirmed.key };
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
