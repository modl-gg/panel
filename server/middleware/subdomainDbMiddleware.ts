import { Request, Response, NextFunction } from 'express';
import { Connection as MongooseConnection } from 'mongoose';
import { connectToGlobalModlDb, connectToServerDb } from '../db/connectionManager';
import { ModlServerSchema } from '@modl-gg/shared-web/schemas/ModlServerSchema';
import { SystemConfigSchema } from '@modl-gg/shared-web';
import { reservedSubdomains } from '../config/reserved-subdomains';

const DOMAIN = process.env.DOMAIN || 'modl.gg';

export async function subdomainDbMiddleware(req: Request, res: Response, next: NextFunction) {
  // Bypass for common asset types or paths used by Vite/client-side apps
  // This should be the very first check.
  const assetPattern = /\.(js|css|ico|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot|map)$/i;
  if (
    req.path.startsWith('/src/') || // Vite dev path for source modules (like /src/main.tsx)
    req.path.startsWith('/@vite/') || // Vite internal client
    req.path.startsWith('/@fs/') || // Vite file system access prefix
    req.path.startsWith('/node_modules/') || // Vite might serve optimized deps from here
    req.path.startsWith('/assets/') || // Project's static assets folder if served from root
    assetPattern.test(req.path) // General asset extensions
  ) {
    return next();
  }

  // Bypass this middleware for globally accessible API routes
  if (req.path.startsWith('/api/global/')) {
    return next();
  }

  // Allow /verify-email to bypass the main subdomain checks,
  // as it operates using a token and has its own server lookup logic.
  if (req.path === '/verify-email') {
    return next();
  }

  const hostname = req.hostname;

  // Explicit handling for the payments.modl.gg subdomain
  if (hostname === `payments.${DOMAIN}`) {
    if (req.path === '/stripe-public-webhooks/stripe-webhooks') {
      // Allow the Stripe webhook on payments.modl.gg to pass directly to the next routing layer
      // without any server context from this middleware.
      return next();
    } else {
      // Redirect all other traffic from payments.modl.gg to the main landing page.
      return res.redirect(301, `https://${DOMAIN}`);
    }
  }

  let serverName: string | undefined = undefined; // This will hold the derived subdomain

  if (hostname.endsWith(`.${DOMAIN}`)) {
    const parts = hostname.split('.');
    const baseDomainParts = DOMAIN.split('.').length;
    if (parts.length > baseDomainParts) {
      serverName = parts.slice(0, parts.length - baseDomainParts).join('.');
    } else {
      return next();
    }
  } else {
    // This might be a custom domain - we'll check the database to see if it exists
    // For now, we'll use the full hostname as the potential custom domain
    serverName = hostname;
  }

  // Bypass this middleware if we're on a reserved subdomain, which means functionality is gonna be different.
  // We don't want to initialize any databases off of this!
  if (reservedSubdomains.includes(serverName.toLowerCase())) {
    // If this isn't an api request, lets just transfer them to the landing page to prevent any issues
    if(!req.url.includes("/api/")) {
      return res.redirect(301, `https://${DOMAIN}`);
    }

    return next();
  }

  if (!serverName || serverName === "undefined") {
    if (serverName === "undefined") {
      console.warn(`[subdomainDbMiddleware] Blocked attempt to access panel with reserved name 'undefined' from hostname: ${hostname}`);
    }
    return next();
  }

  // @ts-ignore
  req.serverName = serverName;
  let globalConnection: MongooseConnection;
  try {
    globalConnection = await connectToGlobalModlDb();

    // Fetch system-wide configuration (like maintenance mode)
    const SystemConfig = globalConnection.models.SystemConfig || globalConnection.model('SystemConfig', SystemConfigSchema);
    const systemConfig = await SystemConfig.findOne({ configId: 'main_config' });
    if (systemConfig) {
      // @ts-ignore
      req.maintenanceConfig = systemConfig.general;
    }

    const ModlServerModel = globalConnection.models.ModlServer || globalConnection.model('ModlServer', ModlServerSchema);
    
    let serverConfig;
    
    // First, try to find by custom domain (subdomain.modl.gg pattern)
    if (hostname.endsWith(`.${DOMAIN}`)) {
      serverConfig = await ModlServerModel.findOne({ customDomain: serverName });
    } else {
      // This is likely a custom domain - search by customDomain_override
      // Add more detailed debugging
      try {
        const allCustomDomains = await ModlServerModel.find({ 
          customDomain_override: { $exists: true, $ne: null }
        }).select('customDomain customDomain_override customDomain_status');
        
        
        // Try finding with exact match first
        serverConfig = await ModlServerModel.findOne({ 
          customDomain_override: hostname,
          customDomain_status: 'active' // Only route active custom domains
        });
        
        
        // If not found, try case-insensitive search as backup
        if (!serverConfig) {
          serverConfig = await ModlServerModel.findOne({ 
            customDomain_override: { $regex: new RegExp(`^${hostname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
            customDomain_status: 'active'
          });
        }
        
        // If found via custom domain, update serverName to match the server's actual subdomain
        // This ensures the database connection uses the correct database name
        if (serverConfig) {
          // @ts-ignore
          req.serverName = serverConfig.customDomain; // Use the subdomain for database connection
          serverName = serverConfig.customDomain; // Update local variable too
        }
      } catch (dbError: any) {
        console.error(`[SubdomainMiddleware] Database error during custom domain lookup:`, dbError.message);
      }
    }

    if (!serverConfig) {
      
      // If this was a custom domain attempt, check if it exists but isn't active
      if (!hostname.endsWith(`.${DOMAIN}`)) {
        try {
          const inactiveServer = await ModlServerModel.findOne({ 
            customDomain_override: hostname 
          }).select('customDomain customDomain_status customDomain_error');
          
          if (inactiveServer) {
            // @ts-ignore
            return res.status(503).send(`Custom domain '${hostname}' is configured but not yet active. Status: ${inactiveServer.customDomain_status}. Please complete domain verification.`);
          }
        } catch (inactiveCheckError: any) {
          console.error(`[SubdomainMiddleware] Error checking for inactive domain:`, inactiveCheckError.message);
        }
      }
      
      // @ts-ignore
      return res.status(404).send(`Panel for '${hostname}' is not configured or does not exist.`);
    }

    if (serverConfig.customDomain_override) {
    }

    // @ts-ignore
    req.modlServer = serverConfig;

    try {
      // @ts-ignore
      req.serverDbConnection = await connectToServerDb(req.serverName);
    } catch (dbConnectError: any) {
      console.error(`[SubdomainMiddleware] Failed to connect to DB for ${req.serverName}:`, dbConnectError.message);
      return res.status(503).json({ error: `Service unavailable. Could not connect to database for ${req.serverName}.` });
    }

    const allowedPreVerificationPagePaths = [
      '/pending-verification',
      '/resend-verification',
      '/verify-email'
    ];    const alwaysAllowedApiPatterns = [
      '/api/auth/',
      '/api/request-email-verification',
      '/api/staff/check-email'
    ];

    const isPathAllowedPreVerification =
      allowedPreVerificationPagePaths.includes(req.path) ||
      alwaysAllowedApiPatterns.some(pattern => req.path.startsWith(pattern));

    if (!serverConfig.emailVerified && !isPathAllowedPreVerification) {
      if (req.path.startsWith('/api/')) {
        return res.status(403).json({ message: 'Panel access denied. Email verification required.' });
      } else {
        return res.status(403).send('Panel not accessible. Please verify your email.');
      }
    }

    next();

  } catch (error: any) {
    // @ts-ignore
    const currentServerName = req.serverName || serverName;
    // @ts-ignore
    console.error(`[ERROR] Subdomain middleware for ${hostname} (derived subdomain ${currentServerName}): ${error.message}`);
    return res.status(500).send('An internal error occurred while processing your panel request.');
  }
}
