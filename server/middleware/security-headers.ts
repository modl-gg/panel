import { Request, Response, NextFunction } from 'express';

/**
 * Security headers middleware - provides essential security headers
 * Similar to helmet.js but lightweight and customized for our needs
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // Content Security Policy - helps prevent XSS attacks
  const cspPolicy = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Allow inline scripts for React
    "style-src 'self' 'unsafe-inline'", // Allow inline styles for Tailwind/React
    "img-src 'self' data: https:", // Allow images from self, data URLs, and HTTPS
    "font-src 'self' data:", // Allow fonts from self and data URLs
    "connect-src 'self' https:", // Allow connections to self and HTTPS
    "media-src 'self'", // Allow media from self
    "object-src 'none'", // Disable plugins
    "frame-src 'none'", // Disable framing
    "base-uri 'self'", // Restrict base tag
    "form-action 'self'", // Restrict form actions
    "frame-ancestors 'none'", // Prevent framing by other sites
    "upgrade-insecure-requests" // Upgrade HTTP to HTTPS in production
  ].join('; ');

  // Set Content Security Policy
  res.setHeader('Content-Security-Policy', cspPolicy);

  // X-Content-Type-Options - prevents MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // X-Frame-Options - prevents clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // X-XSS-Protection - enables XSS filtering (legacy browsers)
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer-Policy - controls referrer information
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // X-DNS-Prefetch-Control - disables DNS prefetching
  res.setHeader('X-DNS-Prefetch-Control', 'off');

  // X-Download-Options - prevents IE from executing downloads
  res.setHeader('X-Download-Options', 'noopen');

  // X-Permitted-Cross-Domain-Policies - restricts Flash/PDF cross-domain
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  // Strict-Transport-Security - enforces HTTPS (only in production)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Feature-Policy / Permissions-Policy - restricts browser features
  const permissionsPolicy = [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
    'usb=()',
    'bluetooth=()',
    'midi=()',
    'magnetometer=()',
    'gyroscope=()',
    'accelerometer=()',
    'ambient-light-sensor=()',
    'display-capture=()'
  ].join(', ');
  
  res.setHeader('Permissions-Policy', permissionsPolicy);

  // Cross-Origin-Embedder-Policy and Cross-Origin-Opener-Policy for isolation
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

  // Remove potentially revealing headers
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');

  next();
}

