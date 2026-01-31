// Rate limit handling utility
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

/**
 * Check if a response is a rate limit error (429 status)
 */
export function isRateLimitError(response: Response): boolean {
  return response.status === 429;
}

/**
 * Handle rate limit response by showing a toast error
 */
export async function handleRateLimitResponse(response: Response, currentPath?: string): Promise<void> {
  try {
    const rateLimitData: RateLimitResponse = await response.json();
    
    // Dynamically import toast to show error
    const { toast } = await import('@/hooks/use-toast');
    
    // Build error message
    const errorMessage = rateLimitData.error || 'Too many requests. Please try again later.';
    const timeInfo = rateLimitData.timeRemaining ? ` Please wait ${rateLimitData.timeRemaining}.` : '';
    
    toast({
      title: errorMessage + timeInfo,
      description: rateLimitData.securityNote || rateLimitData.message,
      variant: 'destructive',
    });
  } catch (error) {
    console.error('Failed to parse rate limit response:', error);
    // Fallback: show basic toast
    const { toast } = await import('@/hooks/use-toast');
    toast({
      title: 'Rate limit exceeded',
      description: 'Too many requests. Please wait before trying again.',
      variant: 'destructive',
    });
  }
}

/**
 * Enhanced fetch wrapper that automatically handles rate limiting
 */
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

/**
 * Enhanced CSRF fetch wrapper that includes rate limit handling
 */
export async function rateLimitAwareCSRFfetch(
  url: string, 
  options: RequestInit = {},
  currentPath?: string
): Promise<Response> {
  const csrfFetch = apiFetch;
  const response = await csrfFetch(url, options);
  
  if (isRateLimitError(response)) {
    await handleRateLimitResponse(response, currentPath);
    throw new Error('Rate limit exceeded');
  }
  
  return response;
}

/**
 * Hook for React Query mutations to handle rate limits
 */
export function createRateLimitAwareMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  currentPath?: string
) {
  return async (variables: TVariables): Promise<TData> => {
    try {
      return await mutationFn(variables);
    } catch (error) {
      // If the error is from a fetch request that hit rate limits,
      // the rate limit handler will have already redirected the user
      throw error;
    }
  };
}

/**
 * Get current path for Wouter router compatibility
 */
export function getCurrentPath(): string {
  return window.location.pathname;
}