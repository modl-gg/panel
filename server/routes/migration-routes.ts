import { Express, Request, Response, Router } from 'express';
import multer from 'multer';
import path from 'path';
import { promises as fs } from 'fs';
import {
  getMigrationFileSizeLimit,
  checkMigrationCooldown,
  startMigration,
  getMigrationStatus,
  updateMigrationProgress,
  processMigrationFile
} from '../services/migration-service';
import { isSuperAdminRole } from '../../shared/role-hierarchy-core';
import { verifyMinecraftApiKey } from '../middleware/api-auth';
import { isAuthenticated } from '../middleware/auth-middleware';

const MIGRATIONS_TEMP_DIR = path.join(process.cwd(), 'uploads', 'migrations');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir(MIGRATIONS_TEMP_DIR, { recursive: true });
      cb(null, MIGRATIONS_TEMP_DIR);
    } catch (error: any) {
      cb(error, MIGRATIONS_TEMP_DIR);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'migration-' + uniqueSuffix + '.json');
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
      cb(null, true);
    } else {
      cb(new Error('Only JSON files are allowed'));
    }
  }
});

/**
 * Middleware to check Super Admin role
 */
async function requireSuperAdmin(req: Request, res: Response, next: Function): Promise<void> {
  try {
    const user = (req as any).currentUser;
    
    if (!user || !user.role) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    
    if (!isSuperAdminRole(user.role)) {
      res.status(403).json({ error: 'Forbidden: Super Admin access required' });
      return;
    }
    
    next();
  } catch (error) {
    console.error('Error in requireSuperAdmin middleware:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Create and return a router for panel migration routes (requires authentication)
 */
export function createPanelMigrationRouter(): Router {
  const router = Router();
  
  // Apply authentication to all panel migration routes
  router.use(isAuthenticated);
  
  /**
   * GET /migration/status
   * Get current migration status (Super Admin only)
   */
  router.get('/migration/status', requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const serverDbConnection = req.serverDbConnection!;
      
      const status = await getMigrationStatus(serverDbConnection);
      const cooldownCheck = await checkMigrationCooldown(serverDbConnection);
      
      res.json({
        ...status,
        cooldown: {
          onCooldown: cooldownCheck.onCooldown,
          remainingTime: cooldownCheck.remainingTime
        }
      });
    } catch (error) {
      console.error('Error fetching migration status:', error);
      res.status(500).json({ error: 'Failed to fetch migration status' });
    }
  });
  
  /**
   * POST /migration/start
   * Initiate migration task (Super Admin only, checks cooldown)
   */
  router.post('/migration/start', requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const serverDbConnection = req.serverDbConnection!;
      const { migrationType } = req.body;
      
      if (!migrationType) {
        return res.status(400).json({ error: 'Migration type is required' });
      }
      
      // Validate migration type
      const validTypes = ['litebans'];
      if (!validTypes.includes(migrationType.toLowerCase())) {
        return res.status(400).json({ error: 'Invalid migration type' });
      }
      
      const result = await startMigration(migrationType.toLowerCase(), serverDbConnection);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      
      res.json({
        success: true,
        taskId: result.taskId,
        message: 'Migration task initiated. Waiting for Minecraft server to process.'
      });
    } catch (error) {
      console.error('Error starting migration:', error);
      res.status(500).json({ error: 'Failed to start migration' });
    }
  });
  
  return router;
}

/**
 * Setup Minecraft API migration routes (API key authentication)
 */
export default function setupMigrationRoutes(app: Express) {
  /**
   * POST /api/minecraft/migration/upload
   * Receive JSON file from Minecraft server (API key auth, validates file size)
   */
  app.post('/api/minecraft/migration/upload', verifyMinecraftApiKey, upload.single('migrationFile'), async (req: Request, res: Response) => {
    try {
      const serverDbConnection = req.serverDbConnection!;
      const serverName = req.serverName!;
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      
      // Validate file size
      const fileSizeLimit = await getMigrationFileSizeLimit(serverName);
      
      if (file.size > fileSizeLimit) {
        // Clean up uploaded file
        try {
          await fs.unlink(file.path);
        } catch (unlinkError) {
          console.error('Error deleting oversized file:', unlinkError);
        }
        
        // Update migration status to failed
        await updateMigrationProgress('failed', {
          message: 'Migration file exceeds size limit',
          recordsProcessed: 0,
          recordsSkipped: 0
        }, serverDbConnection, 'File size exceeds the allowed limit. Please contact support.');
        
        const fileSizeGB = (file.size / (1024 * 1024 * 1024)).toFixed(2);
        const limitGB = (fileSizeLimit / (1024 * 1024 * 1024)).toFixed(2);
        
        return res.status(413).json({
          error: 'Migration file exceeds size limit',
          message: `File size (${fileSizeGB}GB) exceeds the limit of ${limitGB}GB. Please contact support to increase your limit.`,
          fileSize: file.size,
          limit: fileSizeLimit
        });
      }
      
      // Update migration status to uploading complete
      await updateMigrationProgress('uploading_json', {
        message: 'Migration file uploaded successfully. Starting data processing...',
        recordsProcessed: 0,
        recordsSkipped: 0
      }, serverDbConnection);
      
      // Process migration file asynchronously
      processMigrationFile(file.path, serverDbConnection).catch(error => {
        console.error('Error in background migration processing:', error);
      });
      
      res.json({
        success: true,
        message: 'Migration file uploaded successfully. Processing started.',
        fileSize: file.size
      });
    } catch (error) {
      console.error('Error handling migration file upload:', error);
      
      // Clean up file if it exists
      if (req.file) {
        try {
          await fs.unlink(req.file.path);
        } catch (unlinkError) {
          console.error('Error deleting file after error:', unlinkError);
        }
      }
      
      // Update migration status to failed
      if (req.serverDbConnection) {
        await updateMigrationProgress('failed', {
          message: 'Failed to upload migration file',
          recordsProcessed: 0,
          recordsSkipped: 0
        }, req.serverDbConnection, 'An error occurred while uploading the migration file');
      }
      
      res.status(500).json({ error: 'Failed to process migration file upload' });
    }
  });
  
  /**
   * POST /api/minecraft/migration/progress
   * Update migration progress from Minecraft server (API key auth)
   */
  app.post('/api/minecraft/migration/progress', verifyMinecraftApiKey, async (req: Request, res: Response) => {
    try {
      const serverDbConnection = req.serverDbConnection!;
      const { status, message, recordsProcessed, totalRecords } = req.body;
      
      if (!status || !message) {
        return res.status(400).json({ error: 'Status and message are required' });
      }
      
      await updateMigrationProgress(status, {
        message,
        recordsProcessed,
        totalRecords
      }, serverDbConnection);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating migration progress:', error);
      res.status(500).json({ error: 'Failed to update migration progress' });
    }
  });
}

