import axios from 'axios';
import { ModlServerSchema } from '@modl-gg/shared-web';

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';

// Enhanced error handling for Cloudflare API
export class CloudflareError extends Error {
  public code?: number;
  public cfErrorCode?: number;
  public cfErrorMessage?: string;

  constructor(message: string, code?: number, cfError?: { code: number; message: string }) {
    super(message);
    this.name = 'CloudflareError';
    this.code = code;
    this.cfErrorCode = cfError?.code;
    this.cfErrorMessage = cfError?.message;
  }
}

// Helper function to extract and format Cloudflare errors
function handleCloudflareError(error: any): never {
  if (error.response?.data?.errors?.length > 0) {
    const cfError = error.response.data.errors[0];
    throw new CloudflareError(
      cfError.message || 'Cloudflare API error',
      error.response.status,
      cfError
    );
  }
  
  if (error.response?.status) {
    throw new CloudflareError(
      `HTTP ${error.response.status}: ${error.response.statusText || 'Unknown error'}`,
      error.response.status
    );
  }
  
  throw new CloudflareError(error?.message || 'Unknown Cloudflare API error');
}

// Validate environment variables
export function validateCloudflareConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!CLOUDFLARE_API_TOKEN) {
    errors.push('CLOUDFLARE_API_TOKEN environment variable is not set');
  } else if (!CLOUDFLARE_API_TOKEN.startsWith('_')) {
    errors.push('CLOUDFLARE_API_TOKEN appears to be invalid (should start with underscore)');
  }
  
  if (!CLOUDFLARE_ZONE_ID) {
    errors.push('CLOUDFLARE_ZONE_ID environment variable is not set');
  } else if (!/^[a-f0-9]{32}$/.test(CLOUDFLARE_ZONE_ID)) {
    errors.push('CLOUDFLARE_ZONE_ID appears to be invalid (should be 32 character hex string)');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// Only require Cloudflare config in production
if (process.env.NODE_ENV === 'production' && (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ZONE_ID)) {
  const configValidation = validateCloudflareConfig();
  throw new Error(`Cloudflare configuration invalid: ${configValidation.errors.join(', ')}`);
}

const cfHeaders = {
  'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
  'Content-Type': 'application/json',
};

export interface CloudflareCustomHostname {
  id: string;
  hostname: string;
  status: 'active' | 'pending' | 'error';
  ssl: {
    status: 'initializing' | 'pending_validation' | 'active' | 'pending_certificate' | 'pending_renewal' | 'expired';
    method: 'http' | 'txt' | 'email';
    type: 'dv';
    validation_errors?: Array<{
      message: string;
    }>;
    cname_target?: string;
    cname?: string;
  };
  created_at: string;
  ownership_verification?: {
    type: string;
    name: string;
    value: string;
  };
  ownership_verification_http?: {
    http_url: string;
    http_body: string;
  };
}

export interface CustomHostnameResponse {
  success: boolean;
  errors: Array<{
    code: number;
    message: string;
  }>;
  messages: Array<{
    code: number;
    message: string;
  }>;
  result: CloudflareCustomHostname;
}

export interface CustomHostnameListResponse {
  success: boolean;
  errors: Array<{
    code: number;
    message: string;
  }>;
  messages: Array<{
    code: number;
    message: string;
  }>;
  result: CloudflareCustomHostname[];
  result_info: {
    page: number;
    per_page: number;
    count: number;
    total_count: number;
  };
}

// Create a custom hostname (domain) in Cloudflare
export async function createCustomHostname(domain: string, serverId: string): Promise<CloudflareCustomHostname> {
  try {
    const response = await axios.post<CustomHostnameResponse>(
      `${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/custom_hostnames`,
      {
        hostname: domain,
        ssl: {
          method: 'http', // Use HTTP validation - recommended when CNAME is already in place
          type: 'dv',
          settings: {
            http2: 'on',
            tls_1_3: 'on',
            min_tls_version: '1.2'
          }
        },
        // Optional metadata to track which server this belongs to
        metadata: {
          server_id: serverId
        }
      },
      { headers: cfHeaders }
    );

    if (!response.data.success) {
      throw new Error(response.data.errors?.[0]?.message || 'Failed to create custom hostname');
    }

    return response.data.result;
  } catch (error: any) {
    handleCloudflareError(error);
  }
}

// Get a custom hostname by domain name
export async function getCustomHostname(domain: string): Promise<CloudflareCustomHostname | null> {
  try {
    const response = await axios.get<CustomHostnameListResponse>(
      `${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/custom_hostnames?hostname=${encodeURIComponent(domain)}`,
      { headers: cfHeaders }
    );

    if (!response.data.success) {
      throw new Error(response.data.errors?.[0]?.message || 'Failed to fetch custom hostname');
    }

    return response.data.result?.[0] || null;
  } catch (error: any) {
    if (error.response?.status === 404) {
      return null;
    }
    handleCloudflareError(error);
  }
}

// Get a custom hostname by ID
export async function getCustomHostnameById(hostnameId: string): Promise<CloudflareCustomHostname> {
  try {
    const response = await axios.get<CustomHostnameResponse>(
      `${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/custom_hostnames/${hostnameId}`,
      { headers: cfHeaders }
    );

    if (!response.data.success) {
      throw new Error(response.data.errors?.[0]?.message || 'Failed to fetch custom hostname');
    }

    return response.data.result;
  } catch (error: any) {
    handleCloudflareError(error);
  }
}

// Update/modify SSL configuration for a custom hostname (used to trigger DCV)
export async function updateCustomHostname(hostnameId: string, options?: {
  ssl?: {
    method?: 'http' | 'txt' | 'email';
    type?: 'dv';
  };
}): Promise<CloudflareCustomHostname> {
  try {
    const response = await axios.patch<CustomHostnameResponse>(
      `${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/custom_hostnames/${hostnameId}`,
      {
        ssl: {
          method: options?.ssl?.method || 'http',
          type: options?.ssl?.type || 'dv',
          settings: {
            http2: 'on',
            tls_1_3: 'on',
            min_tls_version: '1.2'
          }
        }
      },
      { headers: cfHeaders }
    );

    if (!response.data.success) {
      throw new Error(response.data.errors?.[0]?.message || 'Failed to update custom hostname');
    }

    return response.data.result;
  } catch (error: any) {
    handleCloudflareError(error);
  }
}

// Verify and activate a custom hostname - this triggers domain control validation
export async function verifyCustomHostname(domain: string): Promise<{
  status: string;
  ssl_status: string;
  error?: string;
  cname_target?: string;
  validation_errors?: string[];
}> {
  try {
    // First, get the custom hostname
    const hostname = await getCustomHostname(domain);
    if (!hostname) {
      throw new Error('Custom hostname not found in Cloudflare');
    }

    // Trigger validation by updating the SSL configuration
    const updated = await updateCustomHostname(hostname.id);

    // Extract validation errors if any
    const validationErrors = updated.ssl.validation_errors?.map(err => err.message) || [];

    return {
      status: updated.status,
      ssl_status: updated.ssl.status,
      error: validationErrors.length > 0 ? validationErrors.join(', ') : undefined,
      cname_target: updated.ssl.cname_target,
      validation_errors: validationErrors.length > 0 ? validationErrors : undefined
    };
  } catch (error: any) {
    return {
      status: 'error',
      ssl_status: 'error',
      error: error?.message || 'Cloudflare API error'
    };
  }
}

// Delete a custom hostname from Cloudflare
export async function deleteCustomHostname(domain: string): Promise<void> {
  try {
    // First, get the custom hostname to find its ID
    const hostname = await getCustomHostname(domain);
    if (!hostname) {
      // Already deleted or never existed
      return;
    }

    const response = await axios.delete(
      `${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/custom_hostnames/${hostname.id}`,
      { headers: cfHeaders }
    );

    // Cloudflare returns 200 with a result containing just the ID on successful deletion
    if (!response.data.success && response.data.errors?.length > 0) {
      throw new Error(response.data.errors[0].message);
    }
  } catch (error: any) {
    // Ignore not found errors - hostname might already be deleted
    if (error.response?.status === 404) {
      return;
    }
    handleCloudflareError(error);
  }
}

// List all custom hostnames (with optional filtering)
export async function listCustomHostnames(options?: {
  hostname?: string;
  page?: number;
  per_page?: number;
}): Promise<CloudflareCustomHostname[]> {
  try {
    const params = new URLSearchParams();
    if (options?.hostname) params.append('hostname', options.hostname);
    if (options?.page) params.append('page', options.page.toString());
    if (options?.per_page) params.append('per_page', options.per_page.toString());

    const url = `${CLOUDFLARE_API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/custom_hostnames${params.toString() ? '?' + params.toString() : ''}`;
    const response = await axios.get<CustomHostnameListResponse>(url, { headers: cfHeaders });

    if (!response.data.success) {
      throw new Error(response.data.errors?.[0]?.message || 'Failed to list custom hostnames');
    }

    return response.data.result;
  } catch (error: any) {
    handleCloudflareError(error);
  }
}

// Utility function to validate domain ownership and get CNAME instructions
export async function getDomainSetupInstructions(domain: string): Promise<{
  cnameRecord: {
    name: string;
    target: string;
    ttl: number;
  };
  validationInstructions?: {
    method: string;
    details: any;
  };
}> {
  try {
    const hostname = await getCustomHostname(domain);
    if (!hostname) {
      throw new Error('Custom hostname not found');
    }

    const subdomain = domain.split('.')[0];
    const instructions: any = {
      cnameRecord: {
        name: subdomain,
        target: hostname.ssl.cname_target || `${hostname.id}.cloudflare-cname.com`,
        ttl: 300
      }
    };

    // Add validation instructions based on SSL method
    if (hostname.ssl.method === 'http' && hostname.ownership_verification_http) {
      instructions.validationInstructions = {
        method: 'http',
        details: {
          url: hostname.ownership_verification_http.http_url,
          expected_content: hostname.ownership_verification_http.http_body,
          description: 'Cloudflare will check this URL for the expected content after DNS propagates'
        }
      };
    } else if (hostname.ssl.method === 'txt' && hostname.ownership_verification) {
      instructions.validationInstructions = {
        method: 'txt',
        details: {
          record_name: hostname.ownership_verification.name,
          record_value: hostname.ownership_verification.value,
          description: 'Add this TXT record to your DNS for domain validation'
        }
      };
    }

    return instructions;
  } catch (error: any) {
    throw new Error(`Failed to get setup instructions: ${error.message}`);
  }
}

// Background service to periodically check and update domain statuses
export async function updateDomainStatuses(serverDbConnection: any) {
  try {
    // Ensure the ModlServer model is registered with the connection
    const ServerModel = serverDbConnection.models.ModlServer || serverDbConnection.model('ModlServer', ModlServerSchema);
    
    // Find all servers with custom domains that aren't active
    const serversWithDomains = await ServerModel.find({
      customDomain_override: { $exists: true, $ne: null },
      customDomain_status: { $in: ['pending', 'verifying', 'error'] }
    });

    console.log(`Checking status for ${serversWithDomains.length} domains...`);

    for (const server of serversWithDomains) {
      try {
        const cloudflareStatus = await getCustomHostname(server.customDomain_override);
        
        if (cloudflareStatus) {
          let newStatus = server.customDomain_status;
          let newError = server.customDomain_error;
          let statusChanged = false;

          // Update status based on Cloudflare data
          switch (cloudflareStatus.ssl.status) {
            case 'active':
              if (newStatus !== 'active') {
                newStatus = 'active';
                newError = null;
                statusChanged = true;
                console.log(`🎉 Custom domain activated: ${server.customDomain_override} -> ${server.customDomain}`);
              }
              break;
            case 'pending_validation':
            case 'pending_certificate':
            case 'initializing':
              if (newStatus !== 'verifying') {
                newStatus = 'verifying';
                statusChanged = true;
              }
              break;
            case 'expired':
              if (newStatus !== 'error') {
                newStatus = 'error';
                newError = 'SSL certificate has expired';
                statusChanged = true;
              }
              break;
            default:
              if (cloudflareStatus.ssl.validation_errors && cloudflareStatus.ssl.validation_errors.length > 0) {
                const errorMsg = cloudflareStatus.ssl.validation_errors.map(e => e.message).join(', ');
                if (newStatus !== 'error' || newError !== errorMsg) {
                  newStatus = 'error';
                  newError = errorMsg;
                  statusChanged = true;
                }
              }
          }

          // Update if status changed
          if (statusChanged || newError !== server.customDomain_error) {
            await ServerModel.findByIdAndUpdate(server._id, {
              customDomain_status: newStatus,
              customDomain_lastChecked: new Date(),
              customDomain_error: newError,
              customDomain_cloudflareId: cloudflareStatus.id
            });
            
            console.log(`Updated ${server.customDomain_override}: ${server.customDomain_status} -> ${newStatus}`);
            
            // Log when domain becomes active
            if (newStatus === 'active' && server.customDomain_status !== 'active') {
              console.log(`✅ Domain verification completed for ${server.customDomain_override}. Routing is now active.`);
            }
          }
        }
      } catch (error: any) {
        console.error(`Failed to update status for ${server.customDomain_override}:`, error.message);
        
        // Update error status in database if this is a persistent error
        if (error.message.includes('not found') || error.message.includes('404')) {
          await ServerModel.findByIdAndUpdate(server._id, {
            customDomain_status: 'error',
            customDomain_lastChecked: new Date(),
            customDomain_error: 'Custom hostname not found in Cloudflare'
          });
        }
      }
    }
  } catch (error: any) {
    console.error('Error in updateDomainStatuses:', error);
  }
}

// Function to start periodic status updates
export function startDomainStatusUpdater(serverDbConnection: any, intervalMinutes: number = 10) {
  console.log(`Starting domain status updater with ${intervalMinutes} minute intervals`);
  
  // Run immediately
  updateDomainStatuses(serverDbConnection);
  
  // Then run periodically
  return setInterval(() => {
    updateDomainStatuses(serverDbConnection);
  }, intervalMinutes * 60 * 1000);
}

