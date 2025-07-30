/**
 * Logging sanitization utility to prevent sensitive data exposure in logs
 */

// Sensitive fields that should be redacted from logs
const SENSITIVE_FIELDS = [
  // Authentication
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'apiKey',
  'api_key',
  'apikey',
  'sessionId',
  'session_id',
  'csrf',
  'csrfToken',
  'csrf_token',
  
  // Personal Information
  'email',
  'phone',
  'ssn',
  'social_security',
  'credit_card',
  'creditcard',
  'card_number',
  'cvv',
  'cvc',
  
  // Security
  'twoFaSecret',
  'twofa_secret',
  '2fa_secret',
  'backup_codes',
  'recovery_codes',
  'passkey',
  'passkeys',
  'private_key',
  'privateKey',
  
  // Server/Infrastructure
  'mongodb_uri',
  'database_url',
  'db_password',
  'jwt_secret',
  'encryption_key',
  'signing_key',
  
  // Headers that might contain sensitive data
  'authorization',
  'x-api-key',
  'x-csrf-token',
  'cookie',
  'set-cookie'
];

// Patterns for sensitive data (regex)
const SENSITIVE_PATTERNS = [
  /Bearer\s+[A-Za-z0-9\-_\.]+/gi, // Bearer tokens
  /[A-Za-z0-9+/]{40,}={0,2}/g, // Base64 encoded strings (potential tokens)
  /sk_[a-zA-Z0-9]{24,}/g, // Stripe secret keys
  /pk_[a-zA-Z0-9]{24,}/g, // Stripe public keys (less sensitive but good practice)
  /mongodb:\/\/[^\/\s]+/g, // MongoDB connection strings
  /postgres:\/\/[^\/\s]+/g, // PostgreSQL connection strings
  /mysql:\/\/[^\/\s]+/g, // MySQL connection strings
];

/**
 * Redact sensitive information from any value
 */
export function sanitizeValue(value: any): any {
  if (typeof value === 'string') {
    return sanitizeString(value);
  }
  
  if (typeof value === 'object' && value !== null) {
    if (Array.isArray(value)) {
      return value.map(sanitizeValue);
    }
    
    return sanitizeObject(value);
  }
  
  return value;
}

/**
 * Sanitize string values by applying regex patterns
 */
function sanitizeString(str: string): string {
  let sanitized = str;
  
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  
  return sanitized;
}

/**
 * Sanitize object by redacting sensitive fields
 */
function sanitizeObject(obj: any): any {
  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    
    // Check if this field should be redacted
    if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field))) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = sanitizeValue(value);
    }
  }
  
  return sanitized;
}

/**
 * Safe console.log that automatically sanitizes sensitive data
 */
export function safeLog(message: string, ...args: any[]): void {
  const sanitizedArgs = args.map(sanitizeValue);
  //console.log(message, ...sanitizedArgs);
}

/**
 * Safe console.error that automatically sanitizes sensitive data
 */
export function safeError(message: string, ...args: any[]): void {
  const sanitizedArgs = args.map(sanitizeValue);
  console.error(message, ...sanitizedArgs);
}

/**
 * Safe console.warn that automatically sanitizes sensitive data
 */
export function safeWarn(message: string, ...args: any[]): void {
  const sanitizedArgs = args.map(sanitizeValue);
  console.warn(message, ...sanitizedArgs);
}

/**
 * Safe console.info that automatically sanitizes sensitive data
 */
export function safeInfo(message: string, ...args: any[]): void {
  const sanitizedArgs = args.map(sanitizeValue);
  console.info(message, ...sanitizedArgs);
}

/**
 * Sanitize request object for logging (removes sensitive headers and body fields)
 */
export function sanitizeRequest(req: any): any {
  return {
    method: req.method,
    url: req.url,
    path: req.path,
    query: sanitizeValue(req.query),
    headers: sanitizeValue(req.headers),
    body: sanitizeValue(req.body),
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  };
}

/**
 * Sanitize response object for logging
 */
export function sanitizeResponse(res: any, body?: any): any {
  return {
    statusCode: res.statusCode,
    statusMessage: res.statusMessage,
    headers: sanitizeValue(res.getHeaders()),
    body: body ? sanitizeValue(body) : undefined,
    timestamp: new Date().toISOString()
  };
}

/**
 * Create a sanitized error object for logging
 */
export function sanitizeError(error: any): any {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: sanitizeString(error.message),
      stack: error.stack ? sanitizeString(error.stack) : undefined,
      timestamp: new Date().toISOString()
    };
  }
  
  return sanitizeValue(error);
}