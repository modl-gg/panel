import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

// Backblaze B2 Configuration
const BACKBLAZE_ENDPOINT = 'https://s3.us-east-005.backblazeb2.com';
const BACKBLAZE_REGION = 'us-east-1';

// Dynamic imports for AWS SDK to avoid constructor issues
let S3Client: any;
let ListObjectsV2Command: any;
let PutObjectCommand: any;
let DeleteObjectCommand: any;
let HeadObjectCommand: any;
let s3Client: any;

// Initialize AWS SDK components
async function initializeAwsSdk() {
  if (S3Client) return; // Already initialized
  
  try {
    const { S3Client: S3, ListObjectsV2Command: List, PutObjectCommand: Put, DeleteObjectCommand: Delete, HeadObjectCommand: Head } = await import('@aws-sdk/client-s3');

    S3Client = S3;
    ListObjectsV2Command = List;
    PutObjectCommand = Put;
    DeleteObjectCommand = Delete;
    HeadObjectCommand = Head;
    
    s3Client = new S3Client({
      region: BACKBLAZE_REGION,
      endpoint: BACKBLAZE_ENDPOINT,
      credentials: {
        accessKeyId: process.env.BACKBLAZE_KEY_ID || '',
        secretAccessKey: process.env.BACKBLAZE_APPLICATION_KEY || '',
      },
      forcePathStyle: true, // Required for Backblaze B2 compatibility
    });
  } catch (error) {
    console.error('Failed to initialize AWS SDK:', error);
    throw error;
  }
}

const BUCKET_NAME = process.env.BACKBLAZE_BUCKET_NAME || 'storage-modl-gg';

import { isAuthenticated } from '../middleware/auth-middleware';
import { getStorageQuota, getStorageBreakdown } from '../services/storage-quota-service';
import { getCurrentMonthAIUsage } from '../services/storage-settings-service';

const router = Router();

// Check storage configuration
const hasCredentials = !!(process.env.BACKBLAZE_KEY_ID && process.env.BACKBLAZE_APPLICATION_KEY);

// Storage system info
router.get('/info', isAuthenticated, async (req, res) => {
  try {
    res.json({
      configured: hasCredentials,
      hasAccessKey: !!process.env.BACKBLAZE_KEY_ID,
      hasSecretKey: !!process.env.BACKBLAZE_APPLICATION_KEY,
      endpoint: BACKBLAZE_ENDPOINT,
      region: BACKBLAZE_REGION,
      bucket: BUCKET_NAME
    });
  } catch (error) {
    console.error('Error getting storage info:', error);
    res.status(500).json({ error: 'Failed to get storage info' });
  }
});

// Get storage quota for current server
router.get('/quota', isAuthenticated, async (req, res) => {
  try {
    const serverName = (req as any).serverName;
    
    if (!serverName) {
      return res.status(400).json({ error: 'Server name required' });
    }

    // Check if user has paid subscription
    const isPaidUser = req.user?.isPaidUser || false;
    
    const quota = await getStorageQuota(serverName, isPaidUser);
    
    res.json({
      quota,
      configured: hasCredentials,
    });
  } catch (error) {
    console.error('Error getting storage quota:', error);
    res.status(500).json({ error: 'Failed to get storage quota' });
  }
});

// Get storage breakdown
router.get('/breakdown', isAuthenticated, async (req, res) => {
  try {
    const serverName = (req as any).serverName;
    
    if (!serverName) {
      return res.status(400).json({ error: 'Server name required' });
    }

    const breakdown = await getStorageBreakdown(serverName);
    
    res.json({ breakdown });
  } catch (error) {
    console.error('Error getting storage breakdown:', error);
    res.status(500).json({ error: 'Failed to get storage breakdown' });
  }
});

// Get list of files in server's storage
router.get('/files', isAuthenticated, async (req, res) => {
  try {
    const serverName = (req as any).serverName;
    const { folder, page = 1, limit = 50 } = req.query;
    
    if (!serverName) {
      return res.status(400).json({ error: 'Server name required' });
    }

    await initializeAwsSdk();
    
    // Construct prefix based on folder filter
    let prefix = serverName;
    if (folder && folder !== 'all') {
      prefix += `/${folder}`;
    }
    
    const maxKeys = Math.min(parseInt(limit as string) || 50, 100);
    
    const listParams = {
      Bucket: BUCKET_NAME,
      Prefix: prefix,
      MaxKeys: maxKeys,
    };
    
    const command = new ListObjectsV2Command(listParams);
    const response = await s3Client.send(command);
    
    const files = (response.Contents || []).map((obj: any) => {
      const cdnDomain = process.env.CLOUDFLARE_CDN_DOMAIN || 'cdn.modl.gg';
      const url = `https://${cdnDomain}/${obj.Key}`;
      
      return {
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified,
        url,
      };
    });
    
    res.json({
      files,
      hasMore: response.IsTruncated,
      nextToken: response.NextContinuationToken,
    });
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// Get AI usage quota in addition to storage
router.get('/quota-with-ai', isAuthenticated, async (req, res) => {
  try {
    const serverName = (req as any).serverName;
    
    if (!serverName) {
      return res.status(400).json({ error: 'Server name required' });
    }

    // Always get AI usage data, even if Backblaze B2 is not configured
    const aiUsage = await getCurrentMonthAIUsage(serverName);
    const isPaidUser = (req as any).user?.isPaidUser || false;
    const baseLimit = isPaidUser ? 1000 : 0;
    const overageUsed = Math.max(0, aiUsage.totalRequests - baseLimit);
    const aiQuota = {
      totalUsed: aiUsage.totalRequests,
      baseLimit,
      overageUsed,
      overageCost: overageUsed * 0.01,
      canUseAI: isPaidUser,
      usagePercentage: isPaidUser ? Math.round((aiUsage.totalRequests / baseLimit) * 100) : 0,
      byService: aiUsage.byService,
    };
    
    if (!hasCredentials) {
      // Return minimal response with AI quota when Backblaze B2 is not configured
      return res.json({
        quota: {
          totalUsed: 0,
          baseLimit: 0,
          overageLimit: 0,
          totalLimit: 0,
          isPaid: false,
          canUpload: false,
          overageUsed: 0,
          overageCost: 0,
        },
        aiQuota,
        configured: false,
      });
    }

    // Check if user has paid subscription (already declared above)
    const quota = await getStorageQuota(serverName, isPaidUser);
    
    // Get storage breakdown by folder type
    const breakdown = await getStorageBreakdown(serverName);
    
    res.json({
      quota,
      aiQuota,
      breakdown: breakdown.byType,
      configured: true,
    });
  } catch (error) {
    console.error('Error getting storage and AI quota:', error);
    res.status(500).json({ error: 'Failed to get quota information' });
  }
});

// Delete a file from storage
router.delete('/file/:key(*)', isAuthenticated, async (req, res) => {
  try {
    const serverName = (req as any).serverName;
    const fileKey = req.params.key;
    
    if (!serverName) {
      return res.status(400).json({ error: 'Server name required' });
    }

    // Verify the file belongs to this server
    if (!fileKey.startsWith(serverName + '/')) {
      return res.status(403).json({ error: 'Cannot delete files from other servers' });
    }

    await initializeAwsSdk();
    
    const deleteCommand = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileKey,
    });
    
    await s3Client.send(deleteCommand);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Configuration check
router.get('/config', isAuthenticated, async (req, res) => {
  try {
    res.json({
      configured: hasCredentials,
      bucket: BUCKET_NAME,
      endpoint: "https://cdn.modl.gg",
    });
  } catch (error) {
    console.error('Error getting storage config:', error);
    res.status(500).json({ error: 'Failed to get storage config' });
  }
});

// Bulk delete files
router.post('/bulk-delete', isAuthenticated, async (req, res) => {
  try {
    const serverName = (req as any).serverName;
    const { keys } = req.body;
    
    if (!serverName) {
      return res.status(400).json({ error: 'Server name required' });
    }

    if (!Array.isArray(keys) || keys.length === 0) {
      return res.status(400).json({ error: 'File keys array required' });
    }

    // Verify all files belong to this server
    const invalidKeys = keys.filter(key => !key.startsWith(serverName + '/'));
    if (invalidKeys.length > 0) {
      return res.status(403).json({ 
        error: 'Cannot delete files from other servers',
        invalidKeys 
      });
    }

    await initializeAwsSdk();
    
    const deletePromises = keys.map(async (key: string) => {
      try {
        const deleteCommand = new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
        });
        await s3Client.send(deleteCommand);
        return { key, success: true };
      } catch (error) {
        console.error(`Error deleting file ${key}:`, error);
        return { key, success: false, error: (error as Error).message };
      }
    });
    
    const results = await Promise.all(deletePromises);
    
    res.json({
      results,
      totalDeleted: results.filter(r => r.success).length,
      totalFailed: results.filter(r => !r.success).length,
    });
  } catch (error) {
    console.error('Error in bulk delete:', error);
    res.status(500).json({ error: 'Failed to delete files' });
  }
});

// Test storage connection
router.get('/test', isAuthenticated, async (req, res) => {
  try {
    if (!hasCredentials) {
      return res.status(500).json({ error: 'Backblaze B2 storage not configured' });
    }

    await initializeAwsSdk();
    
    // Try to list objects (minimal test)
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      MaxKeys: 1,
    });
    
    await s3Client.send(command);
    
    res.json({ 
      success: true, 
      message: 'Storage connection successful',
      endpoint: "https://cdn.modl.gg",
      bucket: BUCKET_NAME,
    });
  } catch (error) {
    console.error('Storage connection test failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Storage connection failed',
      details: (error as Error).message,
    });
  }
});

// Get presigned URL for file download
router.get('/download/:key(*)', isAuthenticated, async (req, res) => {
  try {
    const serverName = (req as any).serverName;
    const fileKey = req.params.key;
    
    if (!serverName) {
      return res.status(400).json({ error: 'Server name required' });
    }

    // Verify the file belongs to this server
    if (!fileKey.startsWith(serverName + '/')) {
      return res.status(403).json({ error: 'Cannot access files from other servers' });
    }

    if (!hasCredentials) {
      return res.status(500).json({ error: 'Backblaze B2 storage not configured' });
    }

    // Generate CDN URL directly instead of presigned URL
    const cdnDomain = process.env.CLOUDFLARE_CDN_DOMAIN || 'cdn.modl.gg';
    const url = `https://${cdnDomain}/${fileKey}`;

    res.json({ url });
  } catch (error) {
    console.error('Error generating download URL:', error);
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});

// Upload file directly to storage (for admin use)
router.post('/upload', isAuthenticated, async (req, res) => {
  try {
    const serverName = (req as any).serverName;
    
    if (!serverName) {
      return res.status(400).json({ error: 'Server name required' });
    }

    if (!hasCredentials) {
      return res.status(500).json({ error: 'Backblaze B2 storage not configured' });
    }

    // This would need multer middleware setup for file upload
    // Implementation depends on specific requirements
    
    res.status(501).json({ error: 'Direct upload not implemented yet' });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

export default router;