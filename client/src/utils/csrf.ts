// API fetch utility - re-exports from centralized api module
// Spring Boot backend uses cookie-based authentication without CSRF tokens
import React from 'react';
import { apiFetch, api, apiUpload } from '@/lib/api';

// Re-export the main fetch function for backwards compatibility
export const csrfFetch = apiFetch;

// Re-export the api object for convenience
export { api, apiUpload };

// Legacy function for backwards compatibility - now a no-op
export async function getCSRFToken(): Promise<string> {
  return '';
}

// Clear function for backwards compatibility - now a no-op
export function clearCSRFToken(): void {
  // No-op - CSRF tokens are no longer used
}

// Hook for React components - now just returns empty state
export function useCSRFToken() {
  const [token] = React.useState<string | null>('');
  const [loading] = React.useState(false);
  const [error] = React.useState<string | null>(null);

  return { token, loading, error, refetch: () => Promise.resolve('') };
}

// Export for direct import in non-React contexts
export { csrfFetch as fetch };
