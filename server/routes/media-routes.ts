import { Router } from 'express';
import multer from 'multer';
import { isAuthenticated } from '../middleware/auth-middleware';
import { uploadMedia, deleteMedia, isWasabiConfigured, isSecureFileKey, MediaUploadOptions } from '../services/wasabi-service';

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max file size
  },
});

// Middleware to check if Wasabi is configured
const requireWasabiConfig = (req: any, res: any, next: any) => {
  if (!isWasabiConfigured()) {
    return res.status(503).json({
      error: 'Media storage not configured',
      message: 'Wasabi cloud storage is not properly configured. Please contact your administrator.'
    });
  }
  next();
};

// Local file storage fallback
import fs from 'fs/promises';
import path from 'path';

const LOCAL_UPLOADS_DIR = path.join(process.cwd(), 'uploads');

// Ensure uploads directory exists
const ensureUploadsDir = async () => {
  try {
    await fs.access(LOCAL_UPLOADS_DIR);
  } catch {
    await fs.mkdir(LOCAL_UPLOADS_DIR, { recursive: true });
  }
};

// Save file locally as fallback when Wasabi isn't configured
const saveFileLocally = async (file: any, folder: string, subFolder: string, serverName: string) => {
  await ensureUploadsDir();
  
  // Create folder structure: uploads/server-name/folder/subfolder/
  const serverDir = path.join(LOCAL_UPLOADS_DIR, serverName);
  const folderDir = path.join(serverDir, folder);
  const subFolderDir = subFolder ? path.join(folderDir, subFolder) : folderDir;
  
  await fs.mkdir(subFolderDir, { recursive: true });
  
  // Generate unique filename to avoid conflicts
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const ext = path.extname(file.originalname);
  const filename = `${timestamp}-${random}${ext}`;
  
  const filePath = path.join(subFolderDir, filename);
  
  // Save file
  await fs.writeFile(filePath, file.buffer);
  
  // Return relative path from uploads directory for URL generation
  const relativePath = path.relative(LOCAL_UPLOADS_DIR, filePath);
  const url = `/uploads/${relativePath.replace(/\\/g, '/')}`;
  
  return {
    success: true,
    url,
    key: relativePath,
    localPath: filePath
  };
};

/**
 * Upload evidence media (videos, images)
 * Used for player reports, ban appeals, etc.
 */
router.post('/upload/evidence', isAuthenticated, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { playerId, ticketId, category } = req.body;
    const serverName = req.serverName || 'unknown';
    
    // Create subfolder structure for organization
    let subFolder = '';
    if (playerId) {
      subFolder = `player-${playerId}`;
    } else if (ticketId) {
      subFolder = `ticket-${ticketId}`;
    } else if (category) {
      subFolder = category;
    }

    let result;

    // Try Wasabi first if configured, otherwise fall back to local storage
    if (isWasabiConfigured()) {
      try {
        const uploadOptions: MediaUploadOptions = {
          file: req.file.buffer,
          fileName: req.file.originalname,
          contentType: req.file.mimetype,
          folder: 'evidence',
          subFolder,
          serverName,
        };

        result = await uploadMedia(uploadOptions);
      } catch (wasabiError) {
        console.warn('Wasabi upload failed, falling back to local storage:', wasabiError);
        result = await saveFileLocally(req.file, 'evidence', subFolder, serverName);
      }
    } else {
      // Use local storage fallback
      result = await saveFileLocally(req.file, 'evidence', subFolder, serverName);
    }

    if (result.success) {
      res.json({
        success: true,
        url: result.url,
        key: result.key,
        folderUuid: result.folderUuid,
        message: 'Evidence uploaded successfully',
        storage: isWasabiConfigured() ? 'wasabi' : 'local'
      });
    } else {
      res.status(400).json({
        error: result.error || 'Failed to upload evidence'
      });
    }

  } catch (error) {
    console.error('Evidence upload error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to upload evidence'
    });
  }
});

/**
 * Upload ticket attachments
 * Used for support tickets, bug reports, etc.
 */
router.post('/upload/ticket', isAuthenticated, requireWasabiConfig, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { ticketId, ticketType } = req.body;
    const serverName = req.serverName || 'unknown';
    
    if (!ticketId) {
      return res.status(400).json({ error: 'Ticket ID is required' });
    }

    const uploadOptions: MediaUploadOptions = {
      file: req.file.buffer,
      fileName: req.file.originalname,
      contentType: req.file.mimetype,
      folder: 'tickets',
      subFolder: `${ticketType || 'general'}-${ticketId}`,
      serverName,
    };

    const result = await uploadMedia(uploadOptions);

    if (result.success) {
      res.json({
        success: true,
        url: result.url,
        key: result.key,
        folderUuid: result.folderUuid,
        message: 'Ticket attachment uploaded successfully'
      });
    } else {
      res.status(400).json({
        error: result.error || 'Failed to upload ticket attachment'
      });
    }

  } catch (error) {
    console.error('Ticket attachment upload error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to upload ticket attachment'
    });
  }
});

/**
 * Upload article media (images, videos)
 * Used for knowledgebase articles
 */
router.post('/upload/article', isAuthenticated, requireWasabiConfig, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { articleId, articleSlug } = req.body;
    const serverName = req.serverName || 'unknown';
    
    const subFolder = articleId ? `article-${articleId}` : (articleSlug ? `article-${articleSlug}` : 'general');

    const uploadOptions: MediaUploadOptions = {
      file: req.file.buffer,
      fileName: req.file.originalname,
      contentType: req.file.mimetype,
      folder: 'articles',
      subFolder,
      serverName,
    };

    const result = await uploadMedia(uploadOptions);

    if (result.success) {
      res.json({
        success: true,
        url: result.url,
        key: result.key,
        folderUuid: result.folderUuid,
        message: 'Article media uploaded successfully'
      });
    } else {
      res.status(400).json({
        error: result.error || 'Failed to upload article media'
      });
    }

  } catch (error) {
    console.error('Article media upload error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to upload article media'
    });
  }
});

/**
 * Upload appeal attachments (public route - no authentication required)
 * Used for ban appeals submitted by players
 */
router.post('/upload/appeal', requireWasabiConfig, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { appealId, fieldId } = req.body;
    const serverName = req.serverName || 'unknown';
    
    if (!appealId || !fieldId) {
      return res.status(400).json({ error: 'Appeal ID and field ID are required' });
    }

    const uploadOptions: MediaUploadOptions = {
      file: req.file.buffer,
      fileName: req.file.originalname,
      contentType: req.file.mimetype,
      folder: 'appeals',
      subFolder: `appeal-${appealId}-${fieldId}`,
      serverName,
    };

    const result = await uploadMedia(uploadOptions);

    if (result.success) {
      res.json({
        success: true,
        url: result.url,
        key: result.key,
        folderUuid: result.folderUuid,
        message: 'Appeal attachment uploaded successfully'
      });
    } else {
      res.status(400).json({
        error: result.error || 'Failed to upload appeal attachment'
      });
    }

  } catch (error) {
    console.error('Appeal attachment upload error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to upload appeal attachment'
    });
  }
});

/**
 * Upload server icons (backward compatibility with existing system)
 * Uploads to Wasabi instead of local storage
 */
router.post('/upload/server-icon', isAuthenticated, requireWasabiConfig, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { iconType } = req.body;
    const serverName = req.serverName || 'unknown';
    
    if (!iconType || !['homepage', 'panel'].includes(iconType)) {
      return res.status(400).json({ error: 'Invalid icon type. Must be "homepage" or "panel"' });
    }

    const uploadOptions: MediaUploadOptions = {
      file: req.file.buffer,
      fileName: req.file.originalname,
      contentType: req.file.mimetype,
      folder: 'server-icons',
      subFolder: iconType,
      serverName,
    };

    const result = await uploadMedia(uploadOptions);

    if (result.success) {
      res.json({
        success: true,
        url: result.url,
        key: result.key,
        folderUuid: result.folderUuid,
        message: 'Server icon uploaded successfully'
      });
    } else {
      res.status(400).json({
        error: result.error || 'Failed to upload server icon'
      });
    }

  } catch (error) {
    console.error('Server icon upload error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to upload server icon'
    });
  }
});

/**
 * Delete media file
 * Can delete any media file by key (with proper permissions)
 */
router.delete('/media/:key', isAuthenticated, requireWasabiConfig, async (req, res) => {
  try {
    const { key } = req.params;
    
    if (!key) {
      return res.status(400).json({ error: 'Media key is required' });
    }

    // Decode the key (it may be URL encoded)
    const decodedKey = decodeURIComponent(key);
    
    // Validate that the file key follows the secure UUID folder structure
    if (!isSecureFileKey(decodedKey)) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'File does not follow secure folder structure'
      });
    }
    
    const success = await deleteMedia(decodedKey);

    if (success) {
      res.json({
        success: true,
        message: 'Media deleted successfully'
      });
    } else {
      res.status(400).json({
        error: 'Failed to delete media file'
      });
    }

  } catch (error) {
    console.error('Media deletion error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete media file'
    });
  }
});

/**
 * Get media upload status and configuration
 */
router.get('/config', isAuthenticated, (req, res) => {
  res.json({
    wasabiConfigured: isWasabiConfigured(),
    supportedTypes: {
      evidence: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'],
      tickets: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      appeals: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      articles: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm'],
      'server-icons': ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    },
    fileSizeLimits: {
      evidence: 100 * 1024 * 1024, // 100MB
      tickets: 10 * 1024 * 1024,   // 10MB
      appeals: 10 * 1024 * 1024,   // 10MB
      articles: 50 * 1024 * 1024,  // 50MB
      'server-icons': 5 * 1024 * 1024 // 5MB
    }
  });
});

export default router;