import { MODL } from '@modl-gg/shared-web';

function resolveApiBaseUrl(): string {
  if (import.meta.env.DEV) {
    return '';
  }

  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (!hostname.endsWith('.pages.dev') && !hostname.includes('localhost')) {
      const parts = hostname.split('.');
      if (parts.length >= 2) {
        const baseDomain = parts.slice(-2).join('.');
        return `https://api.${baseDomain}`;
      }
    }
  }

  return MODL.Domain.HTTPS_API;
}

const API_BASE_URL = resolveApiBaseUrl();

export function getApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

export function getCurrentDomain(): string {
  return window.location.hostname;
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export function getAvatarUrl(uuid: string, size: number = 32, overlay: boolean = true): string {
  return `https://mc-heads.net/avatar/${uuid}/${size}`;
}

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions extends Omit<RequestInit, 'method' | 'body'> {
  body?: unknown;
}

function resolveCredentials(path: string, options?: RequestOptions): RequestCredentials {
  if (options?.credentials) {
    return options.credentials;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return normalizedPath.startsWith('/v1/public/') ? 'omit' : 'include';
}

function createHeaders(options?: RequestOptions): Headers {
  const headers = new Headers(options?.headers);
  headers.set('X-Server-Domain', getCurrentDomain());

  // Set Content-Type for JSON bodies (object or already-stringified JSON)
  if (options?.body && (typeof options.body === 'object' || typeof options.body === 'string')) {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
  }

  return headers;
}

async function handleRateLimitIfNeeded(response: Response): Promise<void> {
  if (response.status === 429) {
    const { handleRateLimitResponse, getCurrentPath } = await import('../utils/rate-limit-handler');
    await handleRateLimitResponse(response, getCurrentPath());
    throw new Error('Rate limit exceeded');
  }
}

export async function apiFetch(
  path: string,
  options: RequestOptions & { method?: RequestMethod } = {}
): Promise<Response> {
  const { method = 'GET', body, ...rest } = options;
  const fullUrl = getApiUrl(path);
  const headers = createHeaders(options);

  // Handle body - if it's already a string, use as-is; otherwise stringify
  let processedBody: string | undefined;
  if (body !== undefined && body !== null) {
    processedBody = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const response = await fetch(fullUrl, {
    ...rest,
    method,
    headers,
    credentials: resolveCredentials(path, options),
    body: processedBody,
  });

  await handleRateLimitIfNeeded(response);
  return response;
}

export const api = {
  get: (path: string, options?: RequestOptions) =>
    apiFetch(path, { ...options, method: 'GET' }),

  post: (path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch(path, { ...options, method: 'POST', body }),

  put: (path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch(path, { ...options, method: 'PUT', body }),

  patch: (path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch(path, { ...options, method: 'PATCH', body }),

  delete: (path: string, options?: RequestOptions) =>
    apiFetch(path, { ...options, method: 'DELETE' }),
};

export async function apiUpload(
  path: string,
  formData: FormData,
  options?: Omit<RequestOptions, 'body'>
): Promise<Response> {
  const fullUrl = getApiUrl(path);
  const headers = new Headers(options?.headers);
  headers.set('X-Server-Domain', getCurrentDomain());

  const response = await fetch(fullUrl, {
    ...options,
    method: 'POST',
    headers,
    credentials: resolveCredentials(path, options),
    body: formData,
  });

  await handleRateLimitIfNeeded(response);
  return response;
}
