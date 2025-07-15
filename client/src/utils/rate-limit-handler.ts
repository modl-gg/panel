// Rate limit handling utility

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
 * Handle rate limit response by storing info and redirecting to rate limit page
 */
export async function handleRateLimitResponse(response: Response, currentPath?: string): Promise<void> {
  try {
    const rateLimitData: RateLimitResponse = await response.json();
    
    // Store rate limit info in sessionStorage for the rate limit page
    sessionStorage.setItem('rateLimitInfo', JSON.stringify(rateLimitData));
    
    // Store current path to return to after rate limit expires
    if (currentPath && currentPath !== '/rate-limit') {
      sessionStorage.setItem('preRateLimitPath', currentPath);
    }
    
    // Redirect to rate limit page
    window.location.href = '/rate-limit';
  } catch (error) {
    console.error('Failed to parse rate limit response:', error);
    // Fallback: still redirect to rate limit page with minimal info
    sessionStorage.setItem('rateLimitInfo', JSON.stringify({
      error: 'Rate limit exceeded',
      message: 'Too many requests. Please wait before trying again.'
    }));
    window.location.href = '/rate-limit';
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
    throw new Error('Rate limit exceeded - redirecting to rate limit page');
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
  const { csrfFetch } = await import('@/utils/csrf');
  const response = await csrfFetch(url, options);
  
  if (isRateLimitError(response)) {
    await handleRateLimitResponse(response, currentPath);
    throw new Error('Rate limit exceeded - redirecting to rate limit page');
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