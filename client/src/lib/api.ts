import { MODL } from '@modl-gg/shared-web';

const API_BASE_URL = import.meta.env.DEV
  ? ''
  : (import.meta.env.VITE_API_BASE_URL || MODL.Domain.HTTPS_API);

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
  return `${API_BASE_URL}/v1/public/players/avatar/${uuid}?size=${size}&overlay=${overlay}`;
}

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions extends Omit<RequestInit, 'method' | 'body'> {
  body?: unknown;
}

function createHeaders(options?: RequestOptions): Headers {
  const headers = new Headers(options?.headers);
  headers.set('X-Server-Domain', getCurrentDomain());

  if (options?.body && typeof options.body === 'object') {
    headers.set('Content-Type', 'application/json');
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

  const response = await fetch(fullUrl, {
    ...rest,
    method,
    headers,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
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
    credentials: 'include',
    body: formData,
  });

  await handleRateLimitIfNeeded(response);
  return response;
}
