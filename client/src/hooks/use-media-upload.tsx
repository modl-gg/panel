import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  const currentPath = window.location.pathname;
  const isPublic = currentPath.startsWith('/ticket/') ||
                      currentPath.startsWith('/appeal') ||
                      currentPath === '/' ||
                      currentPath.startsWith('/knowledgebase') ||
                      currentPath.startsWith('/article/');

  console.log('[fetchMediaConfig] Path:', currentPath, 'isPublic:', isPublic);

  try {
    if (isPublic) {
      console.log('[fetchMediaConfig] Trying public endpoint...');
      const publicResponse = await apiFetch('/v1/public/media/config');
      console.log('[fetchMediaConfig] Public response status:', publicResponse.status);
      if (publicResponse.ok) {
        const data = await publicResponse.json();
        console.log('[fetchMediaConfig] Public config data:', data);
        return data;
      }
    } else {
      console.log('[fetchMediaConfig] Trying panel endpoint...');
      const response = await apiFetch('/v1/panel/media/config');
      console.log('[fetchMediaConfig] Panel response status:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('[fetchMediaConfig] Panel config data:', data);
        return data;
      }
      if (response.status === 401) {
        console.log('[fetchMediaConfig] 401, falling back to public...');
        const publicResponse = await apiFetch('/v1/public/media/config');
        if (publicResponse.ok) {
          const data = await publicResponse.json();
          console.log('[fetchMediaConfig] Fallback public config data:', data);
          return data;
        }
      }
    }
    throw new Error('Failed to fetch media upload configuration from all available endpoints');
  } catch (error) {
    console.error('[fetchMediaConfig] Error:', error);
    try {
      const fallbackUrl = isPublic ? '/v1/panel/media/config' : '/v1/public/media/config';
      console.log('[fetchMediaConfig] Trying fallback:', fallbackUrl);
      const fallbackResponse = await apiFetch(fallbackUrl);
      if (fallbackResponse.ok) {
        const data = await fallbackResponse.json();
        console.log('[fetchMediaConfig] Fallback config data:', data);
        return data;
      }
    } catch (fallbackError) {
      console.error('[fetchMediaConfig] Fallback error:', fallbackError);
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

function isPublicPage(): boolean {
  const currentPath = window.location.pathname;
  return currentPath.startsWith('/ticket/') ||
         currentPath.startsWith('/appeal') ||
         currentPath === '/' ||
         currentPath.startsWith('/knowledgebase') ||
         currentPath.startsWith('/article/');
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

    Object.entries(requiredHeaders).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
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
    
    console.log('[MediaUpload] Cached config:', currentConfig);
    console.log('[MediaUpload] Current path:', window.location.pathname);
    console.log('[MediaUpload] Is public page:', isPublicPage());
    
    // If no cached config or config says not configured, fetch fresh
    if (!currentConfig || !currentConfig.backblazeConfigured) {
      console.log('[MediaUpload] Fetching fresh config...');
      currentConfig = await fetchMediaConfig();
      console.log('[MediaUpload] Fresh config:', currentConfig);
      queryClient.setQueryData(MEDIA_CONFIG_QUERY_KEY, currentConfig);
    }

    if (!currentConfig?.backblazeConfigured) {
      console.error('[MediaUpload] Still not configured after fresh fetch');
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
