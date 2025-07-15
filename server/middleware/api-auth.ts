import { Request, Response, NextFunction } from 'express';
import { generateTicketApiKey } from './ticket-api-auth';
import { getSettingsValue } from '../routes/settings-routes';

/**
 * Middleware to verify API key for Minecraft routes
 * This ensures that only authorized Minecraft plugins can access these endpoints
 * Now uses the unified API key
 */
export async function verifyMinecraftApiKey(req: Request, res: Response, next: NextFunction) {
  try {
    // Get API key from request header
    const apiKey = req.header('X-API-Key');
    
    
    // If no API key provided
    if (!apiKey) {
      return res.status(401).json({
        status: 401,
        message: 'Unauthorized - API key required'
      });
    }
    
    // First check environment variable for API key (global override)
    const envApiKey = process.env.MINECRAFT_API_KEY;
    if (envApiKey && apiKey === envApiKey) {
      return next();
    }

    // Check for serverDbConnection (should be populated by preceding middleware)
    if (!req.serverDbConnection) {
      console.error('[Unified API Auth] Error: serverDbConnection not found on request. Ensure subdomainDbMiddleware runs before this.');
      return res.status(503).json({
        status: 503,
        message: 'Service unavailable. Database connection not configured for authentication.'
      });
    }

    // Use the same logic as settings page to retrieve API key
    const apiKeysData = await getSettingsValue(req.serverDbConnection, 'apiKeys');
    const configuredApiKey = apiKeysData?.api_key;
    
    // Clean up duplicate logging
    console.log(`[Unified API Auth - ${req.serverName || 'Unknown Server'}] API Keys Data:`, apiKeysData ? 'Found' : 'Not Found');
    console.log(`[Unified API Auth - ${req.serverName || 'Unknown Server'}] Configured API Key:`, configuredApiKey ? 'Found' : 'Not Found');
    
    if (configuredApiKey === undefined || configuredApiKey === null) {
      console.warn(`[Unified API Auth - ${req.serverName || 'Unknown Server'}] API key not configured in settings. Please generate an API key in the admin panel.`);
      return res.status(401).json({
        status: 401,
        message: 'API key not configured in server settings. Please generate an API key in the admin panel.'
      });
    }
    
    // Verify the provided API key
    if (configuredApiKey !== apiKey) {
      console.warn(`[Unified API Auth - ${req.serverName || 'Unknown Server'}] Invalid API key provided.`);
      return res.status(401).json({
        status: 401, 
        message: 'Invalid API key'
      });
    }
    
    // API key is valid, proceed
    next();
  } catch (error) {
    console.error(`[Unified API Auth - ${req.serverName || 'Unknown Server'}] Error verifying API key:`, error);
    return res.status(500).json({
      status: 500,
      message: 'Internal server error during authentication'
    });
  }
}
