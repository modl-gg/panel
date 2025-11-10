import express, { Request, Response, NextFunction } from 'express';
import { Model } from 'mongoose';
import { createSystemLog } from './log-routes';
import { ITicket, IPlayer } from '@modl-gg/shared-web/types';

/**
 * Public appeal routes - accessible without authentication
 * These routes allow players to submit appeals and view their appeal status
 * Staff-only appeal management routes remain in appeal-routes.ts under authentication
 */
const router = express.Router();

// Middleware to check for serverDbConnection
router.use((req: Request, res: Response, next: NextFunction) => {
  if (!req.serverDbConnection) {
    console.error('Public appeal route accessed without serverDbConnection.');
    return res.status(503).json({
      status: 503,
      error: 'Service Unavailable: Database connection not established for this server.'
    });
  }
  if (!req.serverName) {
    console.error('Public appeal route accessed without serverName.');
    return res.status(500).json({
      status: 500,
      error: 'Internal Server Error: Server name not identified.'
    });
  }
  next();
});

// Get appeal by ID (public access for players to check their appeal status)
router.get('/appeals/:id', async (req: Request, res: Response) => {
  const Ticket: Model<ITicket> = req.serverDbConnection!.model<ITicket>('Ticket');
  try {
    const appeal = await Ticket.findById(req.params.id);
    
    if (!appeal) {
      return res.status(404).json({ error: 'Appeal not found' });
    }
    
    if (appeal.type !== 'appeal') {
      return res.status(400).json({ error: 'Ticket is not an appeal' });
    }
    
    res.json(appeal);
  } catch (error) {
    console.error(`[Server: ${req.serverName}] Error fetching appeal:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new appeal (public access for players to submit appeals)
router.post('/appeals', async (req: Request, res: Response) => {
  const Player: Model<IPlayer> = req.serverDbConnection!.model<IPlayer>('Player');
  const Ticket: Model<ITicket> = req.serverDbConnection!.model<ITicket>('Ticket');

  try {
    const { 
      punishmentId, 
      playerUuid,
      email,
      reason,
      evidence,
      additionalData,
      attachments,
      fieldLabels
    } = req.body;
    
    if (!punishmentId || !playerUuid || !email) {
        return res.status(400).json({ error: 'Missing required fields: punishmentId, playerUuid, email' });
    }
    
    const player = await Player.findOne({ minecraftUuid: playerUuid, 'punishments.id': punishmentId });
    
    if (!player) {
      return res.status(404).json({ error: 'Punishment not found for the specified player or player not found.' });
    }
    
    const punishment = player.punishments.find(p => p.id === punishmentId);
    
    if (!punishment) {
      return res.status(404).json({ error: 'Punishment details not found on player object.' });
    }
    
    const existingAppeal = await Ticket.findOne({ 'data.punishmentId': punishmentId, type: 'appeal' });
    
    if (existingAppeal) {
      return res.status(400).json({ error: 'An appeal already exists for this punishment' });
    }
    
    const randomDigits = Math.floor(100000 + Math.random() * 900000).toString();
    const appealId = `APPEAL-${randomDigits}`;
    
    const appealDataMap = new Map<string, any>();
    appealDataMap.set('punishmentId', punishmentId);
    appealDataMap.set('playerUuid', playerUuid);
    appealDataMap.set('contactEmail', email);

    if (additionalData && typeof additionalData === 'object') {
      for (const [key, value] of Object.entries(additionalData)) {
        appealDataMap.set(key, value);
      }
    }
    
    const punishmentTypeOrdinal = typeof punishment.type_ordinal === 'number' 
        ? punishment.type_ordinal 
        : (typeof punishment.type_ordinal.valueOf === 'function' 
            ? punishment.type_ordinal.valueOf() 
            : parseFloat(punishment.type_ordinal.toString()));

    const appealTicketDocument = new Ticket({
      _id: appealId,
      type: 'appeal',
      status: 'Open',
      subject: `Appeal for Punishment: ${punishmentId}`,
      tags: ['appeal', punishmentTypeOrdinal === 1 ? 'mute' : punishmentTypeOrdinal === 2 ? 'ban' : 'punishment'],
      created: new Date(),
      creator: player.usernames[player.usernames.length - 1]?.username || playerUuid,
      creatorUuid: playerUuid,
      notes: [],
      replies: [],
      data: appealDataMap,
    });
    
    let initialReplyContent = '';
    
    if (reason && reason.trim()) {
      initialReplyContent += `Appeal Reason: ${reason}\n`;
    }
    
    if (evidence) {
      initialReplyContent += `Evidence: ${evidence}\n`;
    }
    
    if (additionalData && typeof additionalData === 'object') {
      initialReplyContent += '\nAdditional Information:\n';
      for (const [key, value] of Object.entries(additionalData)) {
        if (Array.isArray(value)) {
          if (value.length > 0) {
            const fieldLabel = (fieldLabels && fieldLabels[key]) || key.replace(/([A-Z])/g, ' $1').replace(/^./, (str: string) => str.toUpperCase());
            
            const isFileUpload = value.some(item => 
              typeof item === 'object' && (item.url || item.fileName) ||
              typeof item === 'string' && (item.includes('/') || item.includes('http'))
            );
            
            if (isFileUpload) {
              const fileNames = value.map(file => {
                if (typeof file === 'object' && file.fileName) {
                  return `• ${file.fileName}`;
                } else if (typeof file === 'string') {
                  return `• ${file.split('/').pop() || 'file'}`;
                }
                return '• file';
              }).join('\n');
              initialReplyContent += `${fieldLabel}:\n${fileNames}\n`;
            } else {
              const listItems = value.map(item => `• ${item}`).join('\n');
              initialReplyContent += `${fieldLabel}:\n${listItems}\n`;
            }
          }
        } else if (typeof value === 'object' && value !== null) {
          const fieldLabel = (fieldLabels && fieldLabels[key]) || key.replace(/([A-Z])/g, ' $1').replace(/^./, (str: string) => str.toUpperCase());
          const fileObj = value as { fileName?: string; url?: string };
          if (fileObj.fileName || fileObj.url) {
            const fileName = fileObj.fileName || (fileObj.url && fileObj.url.split('/').pop()) || 'file';
            initialReplyContent += `${fieldLabel}:\n• ${fileName}\n`;
          }
        } else if (value !== null && value !== undefined) {
          const displayValue = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value;
          const fieldLabel = (fieldLabels && fieldLabels[key]) || key.replace(/([A-Z])/g, ' $1').replace(/^./, (str: string) => str.toUpperCase());
          initialReplyContent += `${fieldLabel}: ${displayValue}\n`;
        }
      }
    }
    
    initialReplyContent += `\nContact Email: ${email}`;
    
    if (initialReplyContent.trim() === `Contact Email: ${email}`) {
      initialReplyContent = `Appeal submitted for punishment ${punishmentId}.\n\nContact Email: ${email}`;
    }

    appealTicketDocument.replies.push({
      name: player.usernames[player.usernames.length - 1]?.username || 'Player',
      content: initialReplyContent,
      type: 'player',
      created: new Date(),
      staff: false,
      attachments: attachments || []
    });
    

    punishment.attachedTicketIds = punishment.attachedTicketIds || [];
    punishment.attachedTicketIds.push(appealId);
    
    await appealTicketDocument.save();
    await player.save();

    await createSystemLog(req.serverDbConnection, req.serverName, `Appeal ${appealId} created for punishment ${punishmentId}`, 'info', 'appeal-creation');

    res.status(201).json(appealTicketDocument);
  } catch (error) {
    console.error(`[Server: ${req.serverName}] Error creating appeal:`, error);
    await createSystemLog(req.serverDbConnection, req.serverName, `Failed to create appeal for punishment ${req.body.punishmentId}: ${(error as Error).message}`, 'error', 'appeal-creation');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add reply to appeal (public access for players to reply to their appeals)
router.post('/appeals/:id/replies', async (req: Request, res: Response) => {
  const Ticket: Model<ITicket> = req.serverDbConnection!.model<ITicket>('Ticket');
  try {
    const { name, content, type, staff, action, avatar, attachments } = req.body;
    
    const appeal = await Ticket.findById(req.params.id);
    if (!appeal) {
      return res.status(404).json({ error: 'Appeal not found' });
    }
    
    if (appeal.type !== 'appeal') {
      return res.status(400).json({ error: 'Ticket is not an appeal' });
    }

    if (!name || !content || !type) {
        return res.status(400).json({ error: 'Missing required fields for reply: name, content, type' });
    }
    
    appeal.replies.push({
      name,
      content,
      type,
      created: new Date(),
      staff: staff || false,
      action: action,
      avatar: avatar,
      attachments: attachments || []
    });
    
    appeal.updatedAt = new Date();
    
    await appeal.save();
    await createSystemLog(req.serverDbConnection, req.serverName, `Reply added to appeal ${req.params.id} by ${name}`, 'info', 'appeal-update');
    res.json(appeal);
  } catch (error) {
    console.error(`[Server: ${req.serverName}] Error adding reply to appeal:`, error);
    await createSystemLog(req.serverDbConnection, req.serverName, `Failed to add reply to appeal ${req.params.id}: ${(error as Error).message}`, 'error', 'appeal-update');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

