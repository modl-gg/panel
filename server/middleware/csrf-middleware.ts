import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// CSRF token generation and validation middleware
export interface CSRFRequest extends Request {
  csrfToken?: string;
  generateCSRFToken?: () => string;
}

// Generate a secure random token
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Verify CSRF token
function verifyToken(sessionToken: string, requestToken: string): boolean {
  if (!sessionToken || !requestToken) {
    return false;
  }
  
  // Use constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(sessionToken, 'hex'),
    Buffer.from(requestToken, 'hex')
  );
}

// CSRF protection middleware
export function csrfProtection(req: CSRFRequest, res: Response, next: NextFunction) {
  // Skip CSRF for routes that use API key authentication or webhooks
  const isApiKeyRoute = req.path.startsWith('/api/minecraft') || 
                       (req.path.startsWith('/api/public') && 
                        (req.headers['x-api-key'] || req.headers['x-ticket-api-key']));
  
  // Skip CSRF for Stripe webhooks (server-to-server, authenticated via webhook signatures)
  const isWebhookRoute = req.path.startsWith('/stripe-public-webhooks/stripe-webhooks');
  
  if (isApiKeyRoute || isWebhookRoute) {
    return next();
  }

  // Skip CSRF for GET, HEAD, OPTIONS requests (safe methods)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    // Generate token for session if it doesn't exist
    if (!req.session?.csrfToken) {
      req.session = req.session || {};
      req.session.csrfToken = generateToken();
    }
    
    // Provide token generation function for views
    req.generateCSRFToken = () => req.session!.csrfToken;
    req.csrfToken = req.session.csrfToken;
    return next();
  }

  // For state-changing methods (POST, PUT, DELETE, PATCH), validate CSRF token
  const sessionToken = req.session?.csrfToken;
  const requestToken = req.headers['x-csrf-token'] as string || 
                      req.body?._csrf || 
                      req.query._csrf as string;

  if (!sessionToken) {
    return res.status(403).json({ 
      error: 'CSRF token missing from session',
      code: 'CSRF_MISSING_SESSION'
    });
  }

  if (!requestToken) {
    return res.status(403).json({ 
      error: 'CSRF token missing from request',
      code: 'CSRF_MISSING_TOKEN'
    });
  }

  if (!verifyToken(sessionToken, requestToken)) {
    return res.status(403).json({ 
      error: 'Invalid CSRF token',
      code: 'CSRF_INVALID'
    });
  }

  // Token is valid, generate new one for next request
  req.session.csrfToken = generateToken();
  req.generateCSRFToken = () => req.session!.csrfToken;
  req.csrfToken = req.session.csrfToken;
  
  next();
}

// Middleware to provide CSRF token to client
export function csrfTokenProvider(req: CSRFRequest, res: Response, next: NextFunction) {
  // Add CSRF token to response headers for client-side access
  if (req.csrfToken) {
    res.setHeader('X-CSRF-Token', req.csrfToken);
  }
  next();
}

// API endpoint to get CSRF token
export function getCSRFToken(req: CSRFRequest, res: Response) {
  if (!req.session) {
    return res.status(500).json({ error: 'Session not available' });
  }

  // Generate token if it doesn't exist
  if (!req.session.csrfToken) {
    req.session.csrfToken = generateToken();
  }

  res.json({ csrfToken: req.session.csrfToken });
}