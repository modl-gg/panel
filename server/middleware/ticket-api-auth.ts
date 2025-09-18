import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getSettingsValue } from '../routes/settings-routes';

/**
 * Middleware to verify API key for ticket creation routes
 * This ensures that only authorized external systems can create tickets
 * Now uses the unified API key
 */
export async function verifyTicketApiKey(req: Request, res: Response, next: NextFunction) {
  try {
    // Get API key from request header (both old and new header formats supported)
    const apiKey = req.header('X-API-Key') || req.header('X-Ticket-API-Key');
    
    
    // If no API key provided
    if (!apiKey) {
      return res.status(401).json({
        error: 'Unauthorized - API key required',
        message: 'Please provide a valid API key in the X-API-Key header'
      });
    }
    
    // Check for serverDbConnection (should be populated by preceding middleware)
    if (!req.serverDbConnection) {
      return res.status(503).json({
        error: 'Service unavailable',
        message: 'Database connection not configured for authentication.'
      });
    }

    // Use the same logic as settings page to retrieve API key
    const apiKeysData = await getSettingsValue(req.serverDbConnection, 'apiKeys');
    const configuredApiKey = apiKeysData?.api_key;
    
    
    if (configuredApiKey === undefined) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'API key not configured in server settings'
      });
    }
    
    // Verify the provided API key
    if (configuredApiKey !== apiKey) {
      return res.status(401).json({
        error: 'Unauthorized', 
        message: 'Invalid API key'
      });
    }
    
    // API key is valid, proceed
    next();
  } catch (error) {
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Internal server error during authentication'
    });
  }
}

/**
 * Generate a secure API key for tickets
 */
export function generateTicketApiKey(): string {
  // Generate a random 32-byte key and encode it as base64url
  const randomBytes = crypto.randomBytes(32);
  return randomBytes.toString('base64url'); // base64url is URL-safe
}
