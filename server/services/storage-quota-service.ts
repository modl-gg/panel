// Dynamic imports for AWS SDK to avoid constructor issues
let S3Client: any;
let ListObjectsV2Command: any;
let s3Client: any;

// Initialize AWS SDK components
async function initializeAwsSdk() {
  if (S3Client) return; // Already initialized
  
  try {
    const { S3Client: S3, ListObjectsV2Command: List } = await import('@aws-sdk/client-s3');
    
    S3Client = S3;
    ListObjectsV2Command = List;
    
    s3Client = new S3Client({
      region: 'us-east-1',
      endpoint: 'https://s3.wasabisys.com',
      credentials: {
        accessKeyId: process.env.WASABI_ACCESS_KEY || '',
        secretAccessKey: process.env.WASABI_SECRET_KEY || '',
      },
      forcePathStyle: true, // Required for Wasabi compatibility
    });
  } catch (error) {
    console.error('Failed to initialize AWS SDK:', error);
    throw error;
  }
}

// Storage limits in bytes
export const STORAGE_LIMITS = {
  FREE_TIER: 1 * 1024 * 1024 * 1024, // 1GB
  PAID_TIER: 200 * 1024 * 1024 * 1024, // 200GB
  DEFAULT_OVERAGE_LIMIT: 100 * 1024 * 1024 * 1024, // 100GB default overage limit
};

// Pricing in USD
export const OVERAGE_PRICE_PER_GB_MONTH = 0.05;

export interface StorageQuota {
  totalUsed: number;
  baseLimit: number;
  overageLimit: number;
  totalLimit: number;
  isPaid: boolean;
  canUpload: boolean;
  overageUsed: number;
  overageCost: number;
}

export interface StorageSettings {
  overageLimit: number;
  overageEnabled: boolean;
}

// Get storage quota for a server/user
export async function getStorageQuota(
  serverName: string, 
  isPaidUser: boolean, 
  customOverageLimit?: number
): Promise<StorageQuota> {
  try {
    // Get current usage from Wasabi
    const currentUsage = await getCurrentStorageUsage(serverName);
    
    // Calculate limits
    const baseLimit = isPaidUser ? STORAGE_LIMITS.PAID_TIER : STORAGE_LIMITS.FREE_TIER;
    const overageLimit = isPaidUser ? (customOverageLimit || STORAGE_LIMITS.DEFAULT_OVERAGE_LIMIT) : 0;
    const totalLimit = baseLimit + overageLimit;
    
    // Calculate overage
    const overageUsed = Math.max(0, currentUsage - baseLimit);
    const overageCost = isPaidUser ? calculateOverageCost(overageUsed) : 0;
    
    // Check if user can upload
    const canUpload = currentUsage < totalLimit;
    
    return {
      totalUsed: currentUsage,
      baseLimit,
      overageLimit,
      totalLimit,
      isPaid: isPaidUser,
      canUpload,
      overageUsed,
      overageCost,
    };
  } catch (error) {
    console.error('Error getting storage quota:', error);
    // Return conservative defaults on error
    return {
      totalUsed: 0,
      baseLimit: isPaidUser ? STORAGE_LIMITS.PAID_TIER : STORAGE_LIMITS.FREE_TIER,
      overageLimit: 0,
      totalLimit: isPaidUser ? STORAGE_LIMITS.PAID_TIER : STORAGE_LIMITS.FREE_TIER,
      isPaid: isPaidUser,
      canUpload: false,
      overageUsed: 0,
      overageCost: 0,
    };
  }
}

// Get current storage usage from Wasabi
async function getCurrentStorageUsage(serverName: string): Promise<number> {
  try {
    // Initialize AWS SDK
    await initializeAwsSdk();
    
    // AWS SDK already initialized in initializeAwsSdk function
    
    const BUCKET_NAME = process.env.WASABI_BUCKET_NAME || '';
    if (!BUCKET_NAME) {
      return 0;
    }
    
    // s3Client already initialized in initializeAwsSdk function
    
    const listParams = {
      Bucket: BUCKET_NAME,
      Prefix: serverName,
      MaxKeys: 1000,
    };
    
    let totalSize = 0;
    let continuationToken: string | undefined;
    
    do {
      const command = new ListObjectsV2Command({
        ...listParams,
        ContinuationToken: continuationToken,
      });
      
      const response = await s3Client.send(command);
      const objects = response.Contents || [];
      
      totalSize += objects.reduce((sum, obj) => sum + (obj.Size || 0), 0);
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);
    
    return totalSize;
  } catch (error) {
    console.error('Error getting current storage usage:', error);
    return 0;
  }
}

// Calculate overage cost in USD per month
export function calculateOverageCost(overageBytes: number): number {
  const overageGB = overageBytes / (1024 * 1024 * 1024);
  return Math.round(overageGB * OVERAGE_PRICE_PER_GB_MONTH * 100) / 100; // Round to 2 decimal places
}

// Check if upload is allowed
export async function canUploadFile(
  serverName: string,
  isPaidUser: boolean,
  fileSize: number,
  customOverageLimit?: number
): Promise<{ allowed: boolean; reason?: string; quota?: StorageQuota }> {
  try {
    const quota = await getStorageQuota(serverName, isPaidUser, customOverageLimit);
    
    if (!quota.canUpload) {
      return {
        allowed: false,
        reason: isPaidUser 
          ? `Storage limit exceeded. Used ${formatBytes(quota.totalUsed)} of ${formatBytes(quota.totalLimit)}.`
          : `Free tier storage limit exceeded. Used ${formatBytes(quota.totalUsed)} of ${formatBytes(quota.baseLimit)}. Upgrade to increase storage.`,
        quota,
      };
    }
    
    const afterUploadSize = quota.totalUsed + fileSize;
    
    if (afterUploadSize > quota.totalLimit) {
      return {
        allowed: false,
        reason: isPaidUser
          ? `File would exceed storage limit. Would use ${formatBytes(afterUploadSize)} of ${formatBytes(quota.totalLimit)}.`
          : `File would exceed free tier limit. Would use ${formatBytes(afterUploadSize)} of ${formatBytes(quota.baseLimit)}. Upgrade to increase storage.`,
        quota,
      };
    }
    
    return { allowed: true, quota };
  } catch (error) {
    console.error('Error checking upload permission:', error);
    return {
      allowed: false,
      reason: 'Unable to verify storage quota. Please try again.',
    };
  }
}

// Format bytes to human readable format
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// Get storage usage breakdown by type
export async function getStorageBreakdown(serverName: string): Promise<{
  total: number;
  byType: Record<string, number>;
}> {
  try {
    await initializeAwsSdk();
    
    // AWS SDK already initialized in initializeAwsSdk function
    
    const BUCKET_NAME = process.env.WASABI_BUCKET_NAME || '';
    if (!BUCKET_NAME) {
      return { total: 0, byType: {} };
    }
    
    // s3Client already initialized in initializeAwsSdk function
    
    const listParams = {
      Bucket: BUCKET_NAME,
      Prefix: serverName,
      MaxKeys: 1000,
    };
    
    let totalSize = 0;
    const breakdown: Record<string, number> = {
      evidence: 0,
      tickets: 0,
      articles: 0,
      appeals: 0,
      'server-icons': 0,
      other: 0,
    };
    
    let continuationToken: string | undefined;
    
    do {
      const command = new ListObjectsV2Command({
        ...listParams,
        ContinuationToken: continuationToken,
      });
      
      const response = await s3Client.send(command);
      const objects = response.Contents || [];
      
      objects.forEach(obj => {
        const size = obj.Size || 0;
        const key = obj.Key || '';
        
        totalSize += size;
        
        // Categorize by folder
        if (key.includes('/evidence/')) breakdown.evidence += size;
        else if (key.includes('/tickets/')) breakdown.tickets += size;
        else if (key.includes('/articles/')) breakdown.articles += size;
        else if (key.includes('/appeals/')) breakdown.appeals += size;
        else if (key.includes('/server-icons/')) breakdown['server-icons'] += size;
        else breakdown.other += size;
      });
      
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);
    
    return { total: totalSize, byType: breakdown };
  } catch (error) {
    console.error('Error getting storage breakdown:', error);
    return { total: 0, byType: {} };
  }
}