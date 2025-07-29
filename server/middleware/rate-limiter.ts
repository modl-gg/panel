import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import { type Request } from 'express';

// Helper function to get the real client IP, handling Cloudflare proxy
export function getRealClientIP(req: Request): string {
  // Cloudflare sets CF-Connecting-IP header with the real client IP
  const cfConnectingIP = req.headers['cf-connecting-ip'] as string;
  
  // Express's req.ip uses X-Forwarded-For when trust proxy is enabled
  const expressIP = req.ip;
  
  // Fallback to connection remote address
  const connectionIP = req.connection.remoteAddress;
  
  // Also check X-Forwarded-For directly as additional fallback
  const xForwardedFor = req.headers['x-forwarded-for'] as string;
  const firstForwardedIP = xForwardedFor?.split(',')[0]?.trim();
  
  // Determine which IP to use (prioritize Cloudflare, then Express, then X-Forwarded-For, then connection)
  const clientIP = cfConnectingIP || expressIP || firstForwardedIP || connectionIP || 'unknown';
  
  return clientIP;
}

// Global rate limit: 1000 requests per minute per IP (generous for development/testing)
export const globalRateLimit: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: 60
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Skip successful responses from the count
  skipSuccessfulRequests: false,
  // Skip failed responses from the count
  skipFailedRequests: false,
  // Skip requests that are not to API endpoints
  skip: (req: Request) => !req.path.startsWith('/api'),
  // Custom key generator to use real client IP (handles Cloudflare proxy)
  keyGenerator: (req) => {
    return getRealClientIP(req);
  },
  // Add handler for when rate limit is exceeded
  handler: (req, res) => {
    const clientIP = getRealClientIP(req);
    
    res.status(429).json({
      error: 'You have exceeded the maximum number of API requests allowed. Please slow down and try again in a minute.',
      retryAfter: 60,
      timeRemaining: '1 minute',
      rateLimit: '1000 API requests per minute',
      nextAttemptAt: new Date(Date.now() + 60000).toISOString(),
      message: 'This limit helps ensure fair usage for all users and protects server performance for API endpoints.'
    });
  }
});

// Strict rate limit for registration and email verification: 1 request per minute per IP
export const strictRateLimit: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 4, // Limit each IP to 1 request per windowMs
  message: {
    error: 'Only four requests allowed per minute for this endpoint. Please wait before trying again.',
    retryAfter: 60,
    details: 'This strict limit helps prevent abuse of sensitive operations.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  keyGenerator: (req) => {
    return getRealClientIP(req);
  },
  handler: (req, res) => {
    const endpoint = req.path;
    let userFriendlyMessage = '';
    let securityNote = '';

    // Customize message based on endpoint
    if (endpoint.includes('verify-email')) {
      userFriendlyMessage = 'Email verification can only be attempted once per minute. Please wait before trying again.';
      securityNote = 'This prevents automated attacks on the email verification system.';
    } else if (endpoint.includes('send-email-code')) {
      userFriendlyMessage = 'Verification emails can only be requested once per minute. Please check your inbox and wait before requesting another.';
      securityNote = 'This prevents email spam and protects our email delivery system.';
    } else if (endpoint.includes('accept')) {
      userFriendlyMessage = 'Invitation acceptance can only be attempted once per minute. Please wait before trying again.';
      securityNote = 'This prevents abuse of the invitation system.';
    } else {
      userFriendlyMessage = 'This sensitive operation is limited to once per minute. Please wait before trying again.';
      securityNote = 'Strict rate limiting helps protect against automated attacks.';
    }

    const clientIP = getRealClientIP(req);
    
    res.status(429).json({
      error: userFriendlyMessage,
      retryAfter: 60,
      timeRemaining: '1 minute',
      securityNote: securityNote,
      nextAttemptAt: new Date(Date.now() + 60000).toISOString(),
      rateLimit: '1 request per minute'
    });
  }
});

// Medium rate limit for authentication endpoints: 5 requests per minute per IP
export const authRateLimit: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many login attempts detected. For security reasons, please wait 1 minute before trying again.',
    retryAfter: 60,
    details: 'This protection helps prevent unauthorized access to your account.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  keyGenerator: (req) => {
    return getRealClientIP(req);
  },
  handler: (req, res) => {
    const endpoint = req.path;
    let userFriendlyMessage = '';
    let securityNote = '';

    // Customize message based on endpoint
    if (endpoint.includes('send-email-code')) {
      userFriendlyMessage = 'Too many email verification requests. Please wait 1 minute before requesting another code.';
      securityNote = 'This helps prevent email spam and protects your account.';
    } else if (endpoint.includes('verify-email-code')) {
      userFriendlyMessage = 'Too many login code attempts. Please wait 1 minute before trying again.';
      securityNote = 'Multiple failed attempts may indicate suspicious activity. Please ensure you are using the correct verification code.';
    } else if (endpoint.includes('verify-2fa-code')) {
      userFriendlyMessage = 'Too many 2FA verification attempts. Please wait 1 minute before trying again.';
      securityNote = 'This protection helps secure your two-factor authentication setup.';
    } else if (endpoint.includes('fido-login')) {
      userFriendlyMessage = 'Too many passkey authentication attempts. Please wait 1 minute before trying again.';
      securityNote = 'This helps protect against unauthorized passkey usage attempts.';
    } else if (endpoint.includes('invite')) {
      userFriendlyMessage = 'Too many staff invitation requests. Please wait 1 minute before sending another invitation.';
      securityNote = 'This prevents spam and ensures proper invitation management.';
    } else {
      userFriendlyMessage = 'Too many authentication attempts. Please wait 1 minute before trying again.';
      securityNote = 'This security measure helps protect against unauthorized access attempts.';
    }

    const clientIP = getRealClientIP(req);
    
    res.status(429).json({
      error: userFriendlyMessage,
      retryAfter: 60,
      timeRemaining: '1 minute',
      securityNote: securityNote,
      nextAttemptAt: new Date(Date.now() + 60000).toISOString()
    });
  }
});
