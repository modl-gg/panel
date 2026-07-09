interface RateLimitResponse {
  error: string;
  retryAfter?: number;
  timeRemaining?: string;
  rateLimit?: string;
  nextAttemptAt?: string;
  message?: string;
  securityNote?: string;
}

export async function handleRateLimitResponse(response: Response): Promise<void> {
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
