import { apiFetch } from '@/lib/api';

interface RateLimitResponse {
  error: string;
  retryAfter?: number;
  timeRemaining?: string;
  rateLimit?: string;
  nextAttemptAt?: string;
  message?: string;
  securityNote?: string;
}

export function isRateLimitError(response: Response): boolean {
  return response.status === 429;
}

export async function handleRateLimitResponse(response: Response, currentPath?: string): Promise<void> {
  try {
    const rateLimitData: RateLimitResponse = await response.json();
    const { toast } = await import('@modl-gg/shared-web/hooks/use-toast');
    const errorMessage = rateLimitData.error || 'Too many requests. Please try again later.';
    const timeInfo = rateLimitData.timeRemaining ? ` Please wait ${rateLimitData.timeRemaining}.` : '';
    
    toast({
      title: errorMessage + timeInfo,
      description: rateLimitData.securityNote || rateLimitData.message,
      variant: 'destructive',
    });
  } catch {
    const { toast } = await import('@modl-gg/shared-web/hooks/use-toast');
    toast({
      title: 'Rate limit exceeded',
      description: 'Too many requests. Please wait before trying again.',
      variant: 'destructive',
    });
  }
}

export async function rateLimitAwareFetch(
  url: string, 
  options: RequestInit = {},
  currentPath?: string
): Promise<Response> {
  const response = await fetch(url, options);
  
  if (isRateLimitError(response)) {
    await handleRateLimitResponse(response, currentPath);
    throw new Error('Rate limit exceeded');
  }
  
  return response;
}

export async function rateLimitAwareCSRFfetch(
  url: string,
  options: RequestInit = {},
  currentPath?: string
): Promise<Response> {
  const response = await apiFetch(url, options);
  
  if (isRateLimitError(response)) {
    await handleRateLimitResponse(response, currentPath);
    throw new Error('Rate limit exceeded');
  }
  
  return response;
}

export function createRateLimitAwareMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  currentPath?: string
) {
  return async (variables: TVariables): Promise<TData> => {
    return mutationFn(variables);
  };
}

export function getCurrentPath(): string {
  return window.location.pathname;
}