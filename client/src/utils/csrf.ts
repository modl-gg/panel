// CSRF token management utility
import React from 'react';

let csrfToken: string | null = null;

// Get CSRF token from server
export async function getCSRFToken(): Promise<string> {
  if (csrfToken) {
    return csrfToken;
  }

  try {
    const response = await fetch('/api/csrf-token', {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch CSRF token');
    }

    const data = await response.json();
    csrfToken = data.csrfToken;
    return csrfToken;
  } catch (error) {
    console.error('Error fetching CSRF token:', error);
    throw error;
  }
}

// Add CSRF token to fetch requests
export async function csrfFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getCSRFToken();
  
  const headers = new Headers(options.headers);
  
  // Add CSRF token for state-changing methods
  if (options.method && !['GET', 'HEAD', 'OPTIONS'].includes(options.method.toUpperCase())) {
    headers.set('X-CSRF-Token', token);
  }

  const enhancedOptions: RequestInit = {
    ...options,
    headers,
    credentials: 'include', // Include cookies for session
  };

  try {
    const response = await fetch(url, enhancedOptions);
    
    // Check for rate limiting first (429 status)
    if (response.status === 429) {
      const { handleRateLimitResponse, getCurrentPath } = await import('./rate-limit-handler');
      await handleRateLimitResponse(response, getCurrentPath());
      throw new Error('Rate limit exceeded');
    }
    
    // Update cached token from response headers for successful requests
    if (response.ok && response.headers.has('X-CSRF-Token')) {
      const newToken = response.headers.get('X-CSRF-Token');
      if (newToken) {
        csrfToken = newToken;
      }
    }
    
    // If we get a CSRF error, clear the token and retry once
    if (response.status === 403) {
      const errorData = await response.clone().json().catch(() => ({}));
      if (errorData.code?.startsWith('CSRF_')) {
        csrfToken = null; // Clear cached token
        
        // Retry with new token
        const newToken = await getCSRFToken();
        headers.set('X-CSRF-Token', newToken);
        
        const retryResponse = await fetch(url, {
          ...enhancedOptions,
          headers,
        });
        
        // Check for rate limiting on retry as well
        if (retryResponse.status === 429) {
          const { handleRateLimitResponse, getCurrentPath } = await import('./rate-limit-handler');
          await handleRateLimitResponse(retryResponse, getCurrentPath());
          throw new Error('Rate limit exceeded');
        }
        
        // Update cached token from retry response headers
        if (retryResponse.ok && retryResponse.headers.has('X-CSRF-Token')) {
          const retryNewToken = retryResponse.headers.get('X-CSRF-Token');
          if (retryNewToken) {
            csrfToken = retryNewToken;
          }
        }
        
        return retryResponse;
      }
    }
    
    return response;
  } catch (error) {
    console.error('CSRF fetch error:', error);
    throw error;
  }
}

// Clear cached CSRF token (useful on logout)
export function clearCSRFToken(): void {
  csrfToken = null;
}

// Hook for React components to get CSRF token
export function useCSRFToken() {
  const [token, setToken] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    getCSRFToken()
      .then(setToken)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return { token, loading, error, refetch: () => getCSRFToken().then(setToken) };
}

// Export for direct import in non-React contexts
export { csrfFetch as fetch };