import express, { Request, Response } from 'express';
import { 
  createCustomHostname, 
  getCustomHostname, 
  verifyCustomHostname, 
  deleteCustomHostname,
  CloudflareCustomHostname 
} from '../api/cloudflare';
import { Types } from 'mongoose';
import { ModlServerSchema } from '@modl-gg/shared-web';
import { connectToGlobalModlDb } from '../db/connectionManager';

interface IModlServer {
  _id: Types.ObjectId;
  customDomain_override?: string;
  customDomain_status?: 'pending' | 'active' | 'error' | 'verifying';
  customDomain_lastChecked?: Date;
  customDomain_error?: string;
  customDomain_cloudflareId?: string; // Store Cloudflare hostname ID for better tracking
  customDomain: string; // The subdomain for database connection
}

const router = express.Router();

// Utility function to check if the request is coming from a custom domain
function isAccessingFromCustomDomain(req: Request): boolean {
  const hostname = req.hostname;
  const server = req.modlServer as IModlServer;
  const DOMAIN = process.env.DOMAIN || 'modl.gg';

  // If no custom domain is configured, definitely not accessing from custom domain
  if (!server?.customDomain_override) {
    return false;
  }

  // If hostname ends with base domain, it's a modl.gg subdomain
  if (hostname.endsWith(`.${DOMAIN}`)) {
    return false;
  }

  // If hostname matches the custom domain override and custom domain is active,
  // then user is accessing from custom domain
  return hostname === server.customDomain_override &&
         server.customDomain_status === 'active';
}

// GET /domain - Get current domain configuration
router.get('/', async (req: Request, res: Response) => {
  try {
    const server = req.modlServer as IModlServer;
    if (!server) {
      return res.status(400).json({ error: 'Server context not found' });
    }

    // If we have a custom domain, fetch the latest status from Cloudflare
    let cloudflareStatus: CloudflareCustomHostname | null = null;
    if (server.customDomain_override) {
      try {
        cloudflareStatus = await getCustomHostname(server.customDomain_override);
      } catch (error) {
        console.warn('Failed to fetch Cloudflare status:', error);
      }
    }

    // Determine the actual status based on Cloudflare data
    let actualStatus = server.customDomain_status || 'pending';
    let sslStatus = 'pending';
    let cnameConfigured = false;
    let lastError: string | null = server.customDomain_error || null;

    if (cloudflareStatus) {
      // Map Cloudflare status to our internal status
      switch (cloudflareStatus.ssl.status) {
        case 'active':
          actualStatus = 'active';
          sslStatus = 'active';
          cnameConfigured = true;
          lastError = null;
          break;
        case 'pending_validation':
        case 'pending_certificate':
        case 'initializing':
          actualStatus = 'verifying';
          sslStatus = 'pending';
          cnameConfigured = cloudflareStatus.status === 'active';
          break;
        case 'expired':
          actualStatus = 'error';
          sslStatus = 'error';
          lastError = 'SSL certificate has expired';
          break;
        default:
          if (cloudflareStatus.ssl.validation_errors && cloudflareStatus.ssl.validation_errors.length > 0) {
            actualStatus = 'error';
            sslStatus = 'error';
            lastError = cloudflareStatus.ssl.validation_errors.map(e => e.message).join(', ');
          }
      }

      // Update database with latest status if different
      if (actualStatus !== server.customDomain_status || lastError !== server.customDomain_error) {
        const globalDb = await connectToGlobalModlDb();
        const ServerModel = globalDb.models.ModlServer || globalDb.model('ModlServer', ModlServerSchema);
        await ServerModel.findByIdAndUpdate(server._id, {
          customDomain_status: actualStatus,
          customDomain_lastChecked: new Date(),
          customDomain_error: lastError,
          customDomain_cloudflareId: cloudflareStatus.id
        });
      }
    }

    const DOMAIN = process.env.DOMAIN || 'modl.gg';
    const modlSubdomainUrl = `https://${server.customDomain}.${DOMAIN}`;

    res.json({
      customDomain: server.customDomain_override,
      accessingFromCustomDomain: isAccessingFromCustomDomain(req),
      modlSubdomainUrl,
      status: {
        domain: server.customDomain_override,
        status: actualStatus,
        cnameConfigured,
        sslStatus,
        lastChecked: new Date().toISOString(),
        error: lastError,
        cnameTarget: cloudflareStatus?.ssl?.cname_target
      }
    });
  } catch (error: any) {
    console.error('Error fetching domain configuration:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// POST /domain - Create or update a custom domain for this server
router.post('/', async (req: Request, res: Response) => {
  try {
    // Check if accessing from custom domain - if so, block editing
    if (isAccessingFromCustomDomain(req)) {
      return res.status(403).json({
        error: 'Custom domain settings cannot be modified when accessing from a custom domain. Please access your panel via the modl.gg subdomain to make changes.'
      });
    }

    const { customDomain } = req.body as { customDomain: string };
    const server = req.modlServer as IModlServer;
    if (!server) {
      return res.status(400).json({ error: 'Server context not found' });
    }
    if (!customDomain || typeof customDomain !== 'string') {
      return res.status(400).json({ error: 'Invalid domain name' });
    }

    // Validate domain format
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/;
    if (!domainRegex.test(customDomain) || customDomain.length > 253) {
      return res.status(400).json({ error: 'Invalid domain format' });
    }

    const globalDb = await connectToGlobalModlDb();
    const ServerModel = globalDb.models.ModlServer || globalDb.model('ModlServer', ModlServerSchema);

    // Check if domain is already in use by another server
    const existingServer = await ServerModel.findOne({ 
      customDomain_override: customDomain,
      _id: { $ne: server._id }
    });
    if (existingServer) {
      return res.status(409).json({ error: 'Domain is already in use by another server' });
    }

    // Check if domain already exists in Cloudflare
    let existingHostname: CloudflareCustomHostname | null = null;
    try {
      existingHostname = await getCustomHostname(customDomain);
    } catch (error) {
      console.warn('Failed to check existing hostname:', error);
    }

    let cloudflareHostname: CloudflareCustomHostname;

    if (existingHostname) {
      // Use existing hostname
      cloudflareHostname = existingHostname;
    } else {
      // Create new custom hostname in Cloudflare
      try {
        cloudflareHostname = await createCustomHostname(customDomain, server._id.toString());
      } catch (error: any) {
        console.error('Cloudflare API error:', error);
        return res.status(500).json({ 
          error: `Failed to create custom hostname in Cloudflare: ${error.message}` 
        });
      }
    }

    // Update server configuration
    const updateData: any = {
      customDomain_override: customDomain,
      customDomain_status: 'pending',
      customDomain_lastChecked: new Date(),
      customDomain_cloudflareId: cloudflareHostname.id
    };
    
    // Clear any previous error by unsetting the field
    const unsetData: any = {
      customDomain_error: ""
    };

    await ServerModel.findByIdAndUpdate(server._id, {
      $set: updateData,
      $unset: unsetData
    });

    res.json({
      message: 'Domain configuration started. Please set up the CNAME record and then click Verify.',
      status: {
        domain: customDomain,
        status: 'pending',
        cnameConfigured: false,
        sslStatus: 'pending',
        lastChecked: new Date().toISOString(),
        error: null,
        cnameTarget: cloudflareHostname.ssl.cname_target
      },
      cloudflare: {
        id: cloudflareHostname.id,
        hostname: cloudflareHostname.hostname,
        ssl_status: cloudflareHostname.ssl.status,
        cname_target: cloudflareHostname.ssl.cname_target
      }
    });
  } catch (error: any) {
    console.error('Error configuring custom domain:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// POST /domain/verify - Verify DNS and activate SSL for the custom domain
router.post('/verify', async (req: Request, res: Response) => {
  try {
    // Check if accessing from custom domain - if so, block editing
    if (isAccessingFromCustomDomain(req)) {
      return res.status(403).json({
        error: 'Custom domain settings cannot be modified when accessing from a custom domain. Please access your panel via the modl.gg subdomain to make changes.'
      });
    }

    const { domain } = req.body as { domain: string };
    const server = req.modlServer as IModlServer;
    if (!server) {
      return res.status(400).json({ error: 'Server context not found' });
    }

    if (!domain || typeof domain !== 'string') {
      return res.status(400).json({ error: 'Domain is required' });
    }

    // Verify the custom hostname with Cloudflare
    const verifyResult = await verifyCustomHostname(domain);
    
    // Map Cloudflare status to our internal status
    let internalStatus: 'pending' | 'active' | 'error' | 'verifying' = 'pending';
    switch (verifyResult.ssl_status) {
      case 'active':
        internalStatus = 'active';
        break;
      case 'pending_validation':
      case 'pending_certificate':
      case 'initializing':
        internalStatus = 'verifying';
        break;
      case 'error':
        internalStatus = 'error';
        break;
      default:
        if (verifyResult.error) {
          internalStatus = 'error';
        } else {
          internalStatus = 'verifying';
        }
    }

    // Update server status in database
    const globalDb = await connectToGlobalModlDb();
    const ServerModel = globalDb.models.ModlServer || globalDb.model('ModlServer', ModlServerSchema);
    
    const updateData: any = {
      customDomain_status: internalStatus,
      customDomain_lastChecked: new Date(),
      customDomain_cloudflareId: verifyResult.cname_target || server.customDomain_cloudflareId
    };

    // Handle error field properly - either set it or unset it
    const updateOperation: any = { $set: updateData };
    
    if (verifyResult.error) {
      updateData.customDomain_error = verifyResult.error;
    } else {
      updateOperation.$unset = { customDomain_error: "" };
    }

    res.json({
      status: {
        domain,
        status: internalStatus,
        cnameConfigured: verifyResult.status === 'active',
        sslStatus: verifyResult.ssl_status,
        lastChecked: new Date().toISOString(),
        error: verifyResult.error,
        cnameTarget: verifyResult.cname_target,
        validationErrors: verifyResult.validation_errors
      },
      message: internalStatus === 'active' 
        ? `Custom domain ${domain} is now active and ready to use!`
        : internalStatus === 'verifying'
        ? 'Domain verification is in progress. This may take a few minutes.'
        : internalStatus === 'error'
        ? 'Domain verification failed. Please check the DNS configuration.'
        : 'Domain verification status updated.'
    });
  } catch (error: any) {
    console.error('Error verifying custom domain:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// DELETE /domain - Remove the custom domain and Cloudflare hostname
router.delete('/', async (req: Request, res: Response) => {
  try {
    // Check if accessing from custom domain - if so, block editing
    if (isAccessingFromCustomDomain(req)) {
      return res.status(403).json({
        error: 'Custom domain settings cannot be modified when accessing from a custom domain. Please access your panel via the modl.gg subdomain to make changes.'
      });
    }

    const server = req.modlServer as IModlServer;
    if (!server) {
      return res.status(400).json({ error: 'Server context not found' });
    }
    if (!server.customDomain_override) {
      return res.status(400).json({ error: 'No custom domain configured' });
    }

    // Call Cloudflare API to delete the custom hostname
    try {
      await deleteCustomHostname(server.customDomain_override);
    } catch (error: any) {
      console.warn('Failed to delete Cloudflare hostname:', error.message);
      // Continue with database cleanup even if Cloudflare deletion fails
    }

    // Remove custom domain from server config
    const globalDb = await connectToGlobalModlDb();
    const ServerModel = globalDb.models.ModlServer || globalDb.model('ModlServer', ModlServerSchema);
    await ServerModel.findByIdAndUpdate(server._id, {
      $unset: {
        customDomain_override: "",
        customDomain_status: "",
        customDomain_lastChecked: "",
        customDomain_error: "",
        customDomain_cloudflareId: ""
      }
    });

    res.json({ message: 'Custom domain removed successfully.' });
  } catch (error: any) {
    console.error('Error removing custom domain:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /domain/status - Get real-time status from Cloudflare for a specific domain
router.get('/status/:domain', async (req: Request, res: Response) => {
  try {
    const { domain } = req.params;
    const server = req.modlServer as IModlServer;
    
    if (!server) {
      return res.status(400).json({ error: 'Server context not found' });
    }

    // Validate that this domain belongs to this server
    if (server.customDomain_override !== domain) {
      return res.status(403).json({ error: 'Domain does not belong to this server' });
    }

    // Fetch real-time status from Cloudflare
    const cloudflareStatus = await getCustomHostname(domain);
    
    if (!cloudflareStatus) {
      return res.status(404).json({ error: 'Custom hostname not found in Cloudflare' });
    }

    // Determine SSL certificate validation requirements
    const validationInfo: any = {};
    if (cloudflareStatus.ssl.method === 'http' && cloudflareStatus.ownership_verification_http) {
      validationInfo.http_validation = {
        url: cloudflareStatus.ownership_verification_http.http_url,
        body: cloudflareStatus.ownership_verification_http.http_body
      };
    }

    res.json({
      domain: cloudflareStatus.hostname,
      cloudflare_id: cloudflareStatus.id,
      status: cloudflareStatus.status,
      ssl: {
        status: cloudflareStatus.ssl.status,
        method: cloudflareStatus.ssl.method,
        type: cloudflareStatus.ssl.type,
        cname_target: cloudflareStatus.ssl.cname_target,
        cname: cloudflareStatus.ssl.cname,
        validation_errors: cloudflareStatus.ssl.validation_errors
      },
      created_at: cloudflareStatus.created_at,
      validation_info: validationInfo
    });
  } catch (error: any) {
    console.error('Error fetching domain status from Cloudflare:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /domain/instructions - Get setup instructions for the current domain
router.get('/instructions', async (req: Request, res: Response) => {
  try {
    const server = req.modlServer as IModlServer;
    if (!server) {
      return res.status(400).json({ error: 'Server context not found' });
    }

    if (!server.customDomain_override) {
      return res.status(400).json({ error: 'No custom domain configured' });
    }

    const { getDomainSetupInstructions } = await import('../api/cloudflare');
    const instructions = await getDomainSetupInstructions(server.customDomain_override);

    res.json({
      domain: server.customDomain_override,
      instructions
    });
  } catch (error: any) {
    console.error('Error getting setup instructions:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /domain/health - Health check for Cloudflare API connection
router.get('/health', async (req: Request, res: Response) => {
  try {
    const { validateCloudflareConfig } = await import('../api/cloudflare');
    const configValidation = validateCloudflareConfig();
    
    if (!configValidation.valid) {
      return res.status(500).json({
        status: 'error',
        message: 'Cloudflare configuration invalid',
        errors: configValidation.errors
      });
    }

    // Try to list custom hostnames to test the API connection
    const { listCustomHostnames } = await import('../api/cloudflare');
    const hostnames = await listCustomHostnames({ per_page: 1 });
    
    res.json({
      status: 'healthy',
      message: 'Cloudflare API connection successful',
      config: {
        api_token_configured: !!process.env.CLOUDFLARE_API_TOKEN,
        zone_id_configured: !!process.env.CLOUDFLARE_ZONE_ID,
        zone_id: process.env.CLOUDFLARE_ZONE_ID?.substring(0, 8) + '...' // Show partial ID for verification
      },
      test_result: {
        hostnames_count: hostnames.length,
        api_accessible: true
      }
    });
  } catch (error: any) {
    console.error('Cloudflare health check failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Cloudflare API connection failed',
      error: error.message
    });
  }
});

// GET /domain/debug - Debug custom domain configuration (only in development)
router.get('/debug', async (req: Request, res: Response) => {
  // Only allow in development mode
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const { domain } = req.query;
    
    if (!domain || typeof domain !== 'string') {
      return res.status(400).json({ error: 'Domain parameter is required' });
    }

    const globalDb = await connectToGlobalModlDb();
    const ServerModel = globalDb.models.ModlServer || globalDb.model('ModlServer', ModlServerSchema);

    // Get all information about this domain
    const exactMatch = await ServerModel.findOne({ customDomain_override: domain });
    const caseInsensitiveMatch = await ServerModel.findOne({ 
      customDomain_override: { $regex: new RegExp(`^${domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });
    const activeMatch = await ServerModel.findOne({ 
      customDomain_override: domain,
      customDomain_status: 'active'
    });

    // Get all custom domains for reference
    const allCustomDomains = await ServerModel.find({
      customDomain_override: { $exists: true, $ne: null }
    }).select('customDomain customDomain_override customDomain_status customDomain_error customDomain_lastChecked');

    res.json({
      query: domain,
      results: {
        exactMatch: exactMatch ? {
          id: exactMatch._id,
          subdomain: exactMatch.customDomain,
          customDomain: exactMatch.customDomain_override,
          status: exactMatch.customDomain_status,
          error: exactMatch.customDomain_error,
          lastChecked: exactMatch.customDomain_lastChecked
        } : null,
        caseInsensitiveMatch: caseInsensitiveMatch ? {
          id: caseInsensitiveMatch._id,
          subdomain: caseInsensitiveMatch.customDomain,
          customDomain: caseInsensitiveMatch.customDomain_override,
          status: caseInsensitiveMatch.customDomain_status
        } : null,
        activeMatch: activeMatch ? {
          id: activeMatch._id,
          subdomain: activeMatch.customDomain,
          customDomain: activeMatch.customDomain_override,
          status: activeMatch.customDomain_status
        } : null,
        wouldRoute: !!activeMatch
      },
      allCustomDomains: allCustomDomains.map(server => ({
        subdomain: server.customDomain,
        customDomain: server.customDomain_override,
        status: server.customDomain_status,
        error: server.customDomain_error,
        lastChecked: server.customDomain_lastChecked
      }))
    });
  } catch (error: any) {
    console.error('Error in debug endpoint:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export default router;