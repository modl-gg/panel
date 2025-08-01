import { Router } from 'express';
import multer from 'multer';
import { uploadMedia, deleteMedia, isBackblazeConfigured } from '../services/backblaze-service';
import { isAuthenticated } from '../middleware/auth-middleware';
import path from 'path';
import fs from 'fs';

const router = Router();

// Configure multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Middleware to check if Backblaze B2 is configured
const requireBackblazeConfig = (req: any, res: any, next: any) => {
  if (!isBackblazeConfigured()) {
    return res.status(503).json({ 
      error: 'Backblaze B2 storage not configured',
      fallback: 'local'
    });
  }
  next();
};

// Helper function to save file locally
function saveFileLocally(file: Express.Multer.File, folder: string, subFolder?: string): { url: string; key: string } {
  const timestamp = Date.now();
  const ext = path.extname(file.originalname);
  const filename = `${path.basename(file.originalname, ext)}-${timestamp}${ext}`;
  
  let relativePath = `uploads/${folder}`;
  if (subFolder) {
    relativePath += `/${subFolder}`;
  }
  relativePath += `/${filename}`;
  
  // Ensure directory exists
  const fullDir = path.dirname(relativePath);
  if (!fs.existsSync(fullDir)) {
    fs.mkdirSync(fullDir, { recursive: true });
  }
  
  // Move file to final location
  fs.renameSync(file.path, relativePath);
  
  return {
    url: `/${relativePath}`,
    key: relativePath
  };
}

// Save file locally as fallback when Backblaze B2 isn't configured
function handleLocalFallback(req: any, res: any, file: Express.Multer.File, folder: string, subFolder?: string) {
  try {
    const result = saveFileLocally(file, folder, subFolder);
    
    return res.json({
      success: true,
      url: result.url,
      key: result.key,
      storage: 'local',
      message: 'File uploaded to local storage (Backblaze B2 not configured)'
    });
  } catch (error) {
    // Clean up temp file
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    
    console.error('Local storage fallback failed:', error);
    return res.status(500).json({ 
      error: 'Upload failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handleFileUpload(req: any, res: any, file: Express.Multer.File, folder: string, subFolder?: string, serverName?: string) {
  try {
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Check if file exists
    if (!fs.existsSync(file.path)) {
      return res.status(400).json({ error: 'Uploaded file not found' });
    }

    // Read file buffer
    const fileBuffer = fs.readFileSync(file.path);

    // Always clean up temp file
    fs.unlinkSync(file.path);

    // Try Backblaze B2 first if configured, otherwise fall back to local storage
    if (isBackblazeConfigured()) {
      try {
        const result = await uploadMedia({
          file: fileBuffer,
          fileName: file.originalname,
          contentType: file.mimetype,
          folder: folder as any,
          subFolder,
          serverName
        });

        if (result.success) {
          return res.json({
            success: true,
            url: result.url,
            key: result.key,
            folderUuid: result.folderUuid,
            storage: 'backblaze'
          });
        } else {
          throw new Error(result.error || 'Upload failed');
        }
      } catch (backblazeError) {
        console.warn('Backblaze upload failed, falling back to local storage:', backblazeError);
        
        // Recreate temp file for local storage
        const tempPath = `uploads/temp-${Date.now()}-${file.originalname}`;
        fs.writeFileSync(tempPath, fileBuffer);
        
        const localFile = {
          ...file,
          path: tempPath
        };
        
        return handleLocalFallback(req, res, localFile, folder, subFolder);
      }
    } else {
      // Backblaze B2 not configured, use local storage
      const tempPath = `uploads/temp-${Date.now()}-${file.originalname}`;
      fs.writeFileSync(tempPath, fileBuffer);
      
      const localFile = {
        ...file,
        path: tempPath
      };
      
      return handleLocalFallback(req, res, localFile, folder, subFolder);
    }
  } catch (error) {
    // Clean up temp file if it exists
    if (file && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    
    console.error('Upload error:', error);
    return res.status(500).json({ 
      error: 'Upload failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Upload ticket attachment
router.post('/upload/ticket', isAuthenticated, requireBackblazeConfig, upload.single('file'), async (req, res) => {
  const serverName = (req as any).serverName;
  const { ticketId } = req.body;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  if (!ticketId) {
    // Clean up temp file
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(400).json({ error: 'Ticket ID required' });
  }

  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    
    const result = await uploadMedia({
      file: fileBuffer,
      fileName: req.file.originalname,
      contentType: req.file.mimetype,
      folder: 'tickets',
      subFolder: `ticket-${ticketId}`,
      serverName
    });

    // Clean up temp file
    fs.unlinkSync(req.file.path);

    if (result.success) {
      res.json({
        success: true,
        url: result.url,
        key: result.key,
        folderUuid: result.folderUuid
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    // Clean up temp file
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    console.error('Ticket upload error:', error);
    res.status(500).json({ 
      error: 'Upload failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Upload article media
router.post('/upload/article', isAuthenticated, requireBackblazeConfig, upload.single('file'), async (req, res) => {
  const serverName = (req as any).serverName;
  const { articleId } = req.body;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  if (!articleId) {
    // Clean up temp file
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(400).json({ error: 'Article ID required' });
  }

  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    
    const result = await uploadMedia({
      file: fileBuffer,
      fileName: req.file.originalname,
      contentType: req.file.mimetype,
      folder: 'articles',
      subFolder: `article-${articleId}`,
      serverName
    });

    // Clean up temp file
    fs.unlinkSync(req.file.path);

    if (result.success) {
      res.json({
        success: true,
        url: result.url,
        key: result.key,
        folderUuid: result.folderUuid
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    // Clean up temp file
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    console.error('Article upload error:', error);
    res.status(500).json({ 
      error: 'Upload failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Upload appeal attachment
router.post('/upload/appeal', requireBackblazeConfig, upload.single('file'), async (req, res) => {
  const { appealId, serverName } = req.body;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  if (!appealId || !serverName) {
    // Clean up temp file
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(400).json({ error: 'Appeal ID and server name required' });
  }

  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    
    const result = await uploadMedia({
      file: fileBuffer,
      fileName: req.file.originalname,
      contentType: req.file.mimetype,
      folder: 'appeals',
      subFolder: `appeal-${appealId}`,
      serverName
    });

    // Clean up temp file
    fs.unlinkSync(req.file.path);

    if (result.success) {
      res.json({
        success: true,
        url: result.url,
        key: result.key,
        folderUuid: result.folderUuid
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    // Clean up temp file
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    console.error('Appeal upload error:', error);
    res.status(500).json({ 
      error: 'Upload failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Upload server icon endpoint
 * Uploads to Backblaze B2 instead of local storage
 */
router.post('/upload/server-icon', isAuthenticated, requireBackblazeConfig, upload.single('file'), async (req, res) => {
  const serverName = (req as any).serverName;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    
    const result = await uploadMedia({
      file: fileBuffer,
      fileName: req.file.originalname,
      contentType: req.file.mimetype,
      folder: 'server-icons',
      subFolder: 'homepage',
      serverName
    });

    // Clean up temp file
    fs.unlinkSync(req.file.path);

    if (result.success) {
      res.json({
        success: true,
        url: result.url,
        key: result.key,
        folderUuid: result.folderUuid
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    // Clean up temp file
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    console.error('Server icon upload error:', error);
    res.status(500).json({ 
      error: 'Upload failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Delete media file
router.delete('/media/:key', isAuthenticated, requireBackblazeConfig, async (req, res) => {
  const { key } = req.params;
  const serverName = (req as any).serverName;
  
  if (!key) {
    return res.status(400).json({ error: 'File key required' });
  }

  // Verify the file belongs to this server
  if (!key.startsWith(serverName + '/')) {
    return res.status(403).json({ error: 'Cannot delete files from other servers' });
  }

  try {
    const success = await deleteMedia(key);
    
    if (success) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Failed to delete file' });
    }
  } catch (error) {
    console.error('Media deletion error:', error);
    res.status(500).json({ 
      error: 'Delete failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Upload evidence (used by the evidence upload modal)
router.post('/upload/evidence', isAuthenticated, upload.single('file'), async (req, res) => {
  const serverName = (req as any).serverName;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    await handleFileUpload(req, res, req.file as Express.Multer.File, 'evidence', req.body.subFolder, serverName);
  } catch (error) {
    console.error('Evidence upload error:', error);
    res.status(500).json({ 
      error: 'Upload failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get media configuration (used by client to check if Backblaze B2 is configured)
router.get('/config', async (req, res) => {
  res.json({
    backblazeConfigured: isBackblazeConfigured(),
  });
});

export default router;