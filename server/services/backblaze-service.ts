import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import crypto from 'crypto';

// Backblaze B2 Configuration
const BACKBLAZE_ENDPOINT = 'https://s3.us-east-005.backblazeb2.com';
const BACKBLAZE_REGION = 'us-east-1'; // AWS SDK compatible region

// Dynamic imports for AWS SDK to avoid constructor issues
let S3Client: any;
let PutObjectCommand: any;
let DeleteObjectCommand: any;
let GetObjectCommand: any;
let HeadObjectCommand: any;
let getSignedUrl: any;
let s3Client: any;

// Initialize AWS SDK components
async function initializeAwsSdk() {
  if (S3Client) return; // Already initialized
  
  try {
    const { S3Client: S3, PutObjectCommand: Put, DeleteObjectCommand: Delete, GetObjectCommand: Get, HeadObjectCommand: Head } = await import('@aws-sdk/client-s3');
    const { getSignedUrl: signUrl } = await import('@aws-sdk/s3-request-presigner');
    
    S3Client = S3;
    PutObjectCommand = Put;
    DeleteObjectCommand = Delete;
    GetObjectCommand = Get;
    HeadObjectCommand = Head;
    getSignedUrl = signUrl;
    
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

// Validate environment variables
if (!process.env.BACKBLAZE_KEY_ID || !process.env.BACKBLAZE_APPLICATION_KEY) {
  console.warn('Warning: Backblaze environment variables not configured. Media uploads will be disabled.');
}

// Define valid folder types
type FolderType = 'evidence' | 'tickets' | 'appeals' | 'articles' | 'server-icons';

export interface MediaUploadOptions {
  file: Buffer;
  fileName: string;
  contentType: string;
  folder: FolderType;
  subFolder?: string; // For organizing files within folders
  serverName?: string; // Server name for folder hierarchy
  maxSizeBytes?: number;
  allowedTypes?: string[];
}

export interface MediaUploadResult {
  success: boolean;
  url?: string;
  key?: string;
  folderUuid?: string;
  error?: string;
}

// Supported file types for different use cases
export const SUPPORTED_FILE_TYPES: Record<FolderType, string[]> = {
  evidence: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'],
  tickets: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  appeals: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  articles: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm'],
  'server-icons': ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
};

// File size limits (in bytes)
export const FILE_SIZE_LIMITS: Record<FolderType, number> = {
  evidence: 100 * 1024 * 1024, // 100MB for evidence (videos can be large)
  tickets: 10 * 1024 * 1024,   // 10MB for ticket attachments
  appeals: 10 * 1024 * 1024,   // 10MB for appeal attachments
  articles: 50 * 1024 * 1024,  // 50MB for article media
  'server-icons': 5 * 1024 * 1024 // 5MB for server icons
};

/**
 * Generate a secure file name with timestamp and random UUID folder structure
 * 
 * Folder structure: serverName/folder/randomUuid/subFolder/fileName
 * Examples:
 * - myserver/evidence/a1b2c3d4-e5f6-7890-abcd-ef1234567890/player-123/screenshot-1234567890-abc123.png
 * - testserver/tickets/f1e2d3c4-b5a6-9807-cdef-12345678901a/support-456/document-1234567890-def456.pdf
 * - gameserver/articles/9a8b7c6d-5e4f-3210-fedc-ba9876543210/article-789/banner-1234567890-ghi789.jpg
 * - coolserver/server-icons/8c7d6e5f-4a3b-2109-8765-43210fedcba9/homepage/logo-1234567890-jkl012.png
 */
export function generateSecureFileNameWithUuid(originalName: string, folder: string, subFolder?: string, serverName?: string): { key: string; folderUuid: string } {
  const timestamp = Date.now();
  const fileUuid = uuidv4(); // UUID for filename
  const folderUuid = uuidv4(); // Random UUID folder to prevent guessing
  const ext = path.extname(originalName).toLowerCase();
  const baseName = path.basename(originalName, ext).replace(/[^a-zA-Z0-9]/g, '-');
  
  const fileName = `${baseName}-${timestamp}-${fileUuid}${ext}`;
  
  // Build path with server name hierarchy: serverName/folder/randomUuid/subFolder/fileName
  let fullPath = '';
  
  if (serverName) {
    fullPath = `${serverName}/`;
  }
  
  fullPath += folder;
  
  // Add random UUID folder to prevent directory enumeration/guessing
  fullPath += `/${folderUuid}`;
  
  if (subFolder) {
    fullPath += `/${subFolder}`;
  }
  
  fullPath += `/${fileName}`;
  
  return {
    key: fullPath,
    folderUuid: folderUuid
  };
}

/**
 * Legacy function for backward compatibility - calls the new UUID function
 * @deprecated Use generateSecureFileNameWithUuid instead
 */
function generateSecureFileName(originalName: string, folder: string, subFolder?: string, serverName?: string): string {
  return generateSecureFileNameWithUuid(originalName, folder, subFolder, serverName).key;
}

/**
 * Validate file type and size
 */
function validateFile(file: Buffer, contentType: string, folder: FolderType, options: MediaUploadOptions): string | null {
  // Check file size
  const maxSize = options.maxSizeBytes || FILE_SIZE_LIMITS[folder];
  if (file.length > maxSize) {
    return `File size exceeds limit of ${Math.round(maxSize / 1024 / 1024)}MB`;
  }

  // Check file type
  const allowedTypes = options.allowedTypes || SUPPORTED_FILE_TYPES[folder];
  if (!allowedTypes.includes(contentType)) {
    return `File type ${contentType} not supported. Allowed types: ${allowedTypes.join(', ')}`;
  }

  return null;
}

/**
 * Upload media file to Backblaze B2
 */
export async function uploadMedia(options: MediaUploadOptions): Promise<MediaUploadResult> {
  try {
    // Initialize AWS SDK
    await initializeAwsSdk();
    
    // Validate environment variables
    if (!BUCKET_NAME) {
      return { success: false, error: 'Backblaze bucket not configured' };
    }

    // Check if S3 client is properly initialized
    if (!s3Client || !s3Client.send) {
      return { success: false, error: 'S3 client not properly initialized' };
    }

    // Validate file
    const validationError = validateFile(options.file, options.contentType, options.folder, options);
    if (validationError) {
      return { success: false, error: validationError };
    }

    // Generate secure file name with server hierarchy and random UUID folder
    const { key, folderUuid } = generateSecureFileNameWithUuid(options.fileName, options.folder, options.subFolder, options.serverName);

    // Upload to Backblaze B2
    const uploadCommand = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: options.file,
      ContentType: options.contentType,
      CacheControl: 'public, max-age=31536000', // 1 year cache
      Metadata: {
        'original-name': options.fileName,
        'uploaded-at': new Date().toISOString(),
        'folder': options.folder,
        'sub-folder': options.subFolder || '',
        'server-name': options.serverName || '',
        'random-folder-uuid': folderUuid // Store the random folder UUID for tracking
      }
    });

    await s3Client.send(uploadCommand);

    // Generate public URL using CloudFlare CDN domain (if configured) or Backblaze domain
    const cdnDomain = process.env.CLOUDFLARE_CDN_DOMAIN;
    const url = cdnDomain 
      ? `https://${cdnDomain}/${key}`
      : `https://${BUCKET_NAME}.s3.us-east-005.backblazeb2.com/${key}`;

    return {
      success: true,
      url,
      key,
      folderUuid
    };

  } catch (error) {
    console.error('Error uploading media to Backblaze B2:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown upload error'
    };
  }
}

/**
 * Delete media file from Backblaze B2
 */
export async function deleteMedia(key: string): Promise<boolean> {
  try {
    // Initialize AWS SDK
    await initializeAwsSdk();
    
    if (!BUCKET_NAME) {
      console.warn('Backblaze bucket not configured');
      return false;
    }

    const deleteCommand = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });

    await s3Client.send(deleteCommand);
    return true;

  } catch (error) {
    console.error('Error deleting media from Backblaze B2:', error);
    return false;
  }
}

/**
 * Generate presigned URL for temporary access
 */
export async function generatePresignedUrl(key: string, expiresInSeconds: number = 3600): Promise<string | null> {
  try {
    // Initialize AWS SDK
    await initializeAwsSdk();
    
    if (!BUCKET_NAME) {
      return null;
    }

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
    return url;

  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return null;
  }
}

/**
 * Check if media file exists
 */
export async function mediaExists(key: string): Promise<boolean> {
  try {
    // Initialize AWS SDK
    await initializeAwsSdk();
    
    if (!BUCKET_NAME) {
      return false;
    }

    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });

    await s3Client.send(command);
    return true;

  } catch (error) {
    return false;
  }
}

/**
 * Get file information
 */
export async function getMediaInfo(key: string): Promise<{ size: number; contentType: string; lastModified: Date } | null> {
  try {
    // Initialize AWS SDK
    await initializeAwsSdk();
    
    if (!BUCKET_NAME) {
      return null;
    }

    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });

    const response = await s3Client.send(command);
    
    return {
      size: response.ContentLength || 0,
      contentType: response.ContentType || '',
      lastModified: response.LastModified || new Date()
    };

  } catch (error) {
    console.error('Error getting media info:', error);
    return null;
  }
}

/**
 * Extract folder UUID from a file key for validation
 * Returns null if the key doesn't contain a valid folder UUID structure
 */
export function extractFolderUuidFromKey(key: string): string | null {
  try {
    // Expected format: serverName/folder/folderUuid/subFolder/fileName
    // Split by / and find the UUID (should be a valid UUID v4)
    const parts = key.split('/');
    
    if (parts.length < 3) {
      return null; // Not enough parts for our structure
    }
    
    // Look for UUID pattern in the parts (after serverName/folder)
    for (let i = 2; i < parts.length; i++) {
      const part = parts[i];
      // Check if this part looks like a UUID v4
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(part)) {
        return part;
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Validate if a file key follows the secure folder structure
 * This helps prevent access to files that don't use the UUID folder system
 */
export function isSecureFileKey(key: string): boolean {
  return extractFolderUuidFromKey(key) !== null;
}

/**
 * Check if Backblaze B2 is configured and available
 */
export function isBackblazeConfigured(): boolean {
  return !!(process.env.BACKBLAZE_KEY_ID && process.env.BACKBLAZE_APPLICATION_KEY);
}