import express, { Request, Response, NextFunction } from 'express';
import { Document as MongooseDocument, Connection } from 'mongoose';
import { isAuthenticated } from '../middleware/auth-middleware';
// Note: Permission functions will be imported dynamically to avoid circular dependency issues
import AIModerationService from '../services/ai-moderation-service';
import { IReply, ITicket } from '@modl-gg/shared-web/types';
import { getSettingsValue } from './settings-routes';

interface INote {
  content: string;
  author: string;
  date: Date;
}

interface IReply {
  name: string;
  avatar?: string;
  content: string;
  type: string; // e.g., 'public', 'internal'
  created: Date;
  staff: boolean;
  action?: string; // Action taken with this reply (e.g., 'Close', 'Pardon', 'Reduce')
  attachments?: any[]; // File attachments for this reply
}

interface ITicket extends MongooseDocument {
  _id: string; // Ticket ID, e.g., CATEGORY-123456
  category: string;
  tags: string[];
  created: Date;
  creator: string; // UUID of the creator
  creatorName?: string;
  creatorAvatar?: string;
  notes: INote[];
  replies: IReply[];
  data: Map<string, any>; // For custom fields
  status: string; // e.g., 'Open', 'Closed', 'In Progress'
  assignedTo?: string; // Staff username or ID
  priority?: string; // e.g., 'Low', 'Medium', 'High'
  locked?: boolean;
}

/**
 * Add a notification to a player's pending notifications
 * If player is not found, the notification is skipped
 */
async function addNotificationToPlayer(
  dbConnection: Connection, 
  playerUuid: string, 
  notification: any
): Promise<void> {
  try {
    const Player = dbConnection.model('Player');
    
    // First check if player exists using count
    const playerExists = await Player.countDocuments({ minecraftUuid: playerUuid });
    
    if (!playerExists) {
      console.log(`Player ${playerUuid} not found, creating basic player record for notification`);
      
      // Try to create a new player document
      try {
        const newPlayer = new Player({
          _id: `player-${playerUuid}`,
          minecraftUuid: playerUuid,
          usernames: [],
          notes: [],
          ipList: [],
          ipAddresses: [],
          punishments: [],
          pendingNotifications: [notification],
          data: new Map()
        });
        
        await newPlayer.save();
        console.log(`Created basic player record for ${playerUuid} with notification`);
        return;
      } catch (saveError: any) {
        // If save fails due to duplicate key, player was created by another process
        if (saveError.code !== 11000) {
          throw saveError;
        }
        console.log(`Player ${playerUuid} already exists, will update with notification`);
      }
    }

    // First, check if we need to migrate from old string format
    const player = await Player.findOne({ minecraftUuid: playerUuid }, { pendingNotifications: 1 });
    if (player && player.pendingNotifications && player.pendingNotifications.length > 0 && typeof player.pendingNotifications[0] === 'string') {
      console.log(`Migrating pendingNotifications format for player ${playerUuid}`);
      // Clear old string notifications
      await Player.updateOne(
        { minecraftUuid: playerUuid },
        { $set: { pendingNotifications: [] } },
        { runValidators: false }
      );
    }

    // Use atomic update to add notification without loading/validating entire document
    const result = await Player.findOneAndUpdate(
      { minecraftUuid: playerUuid },
      { 
        $push: { pendingNotifications: notification }
      },
      { 
        new: false, // Don't return the document (avoid validation)
        runValidators: false, // Don't validate the entire document
        upsert: false // Don't create if doesn't exist (we handle that above)
      }
    );
    
    if (result) {
      console.log(`Added notification to player ${playerUuid}: ${notification.message}`);
    } else {
      console.error(`Failed to add notification - player ${playerUuid} not found after existence check`);
    }
  } catch (error) {
    console.error(`Error adding notification to player ${playerUuid}:`, error);
  }
}

/**
 * Create a notification for a staff reply to a ticket
 * Returns the notification object that can be stored in pendingNotifications
 */
function createTicketReplyNotification(ticketId: string, staffName: string, replyContent: string, panelUrl: string): any {
  // Create notification object with actual data
  const notification = {
    id: `ticket-reply-${ticketId}-${Date.now()}`,
    message: `${staffName} replied to your ticket ${ticketId}: "${replyContent.substring(0, 100)}${replyContent.length > 100 ? '...' : ''}"`,
    type: 'ticket_reply',
    timestamp: new Date(),
    data: {
      ticketId: ticketId,
      staffName: staffName,
      replyContent: replyContent,
      ticketUrl: `${panelUrl}/ticket/${ticketId}`
    }
  };
  
  return notification;
}

/**
 * Get and clear pending notifications for a player
 * Returns the notifications and removes them from the player's pendingNotifications array
 */
async function getAndClearPlayerNotifications(
  dbConnection: Connection, 
  playerUuid: string
): Promise<string[]> {
  try {
    const Player = dbConnection.model('Player');
    const player = await Player.findOne({ minecraftUuid: playerUuid });
    
    if (!player || !player.pendingNotifications || player.pendingNotifications.length === 0) {
      return [];
    }
    
    const notifications = [...player.pendingNotifications];
    
    // Clear the notifications
    await Player.updateOne(
      { minecraftUuid: playerUuid },
      { $set: { pendingNotifications: [] } }
    );
    
    return notifications;
  } catch (error) {
    console.error(`Error getting notifications for player ${playerUuid}:`, error);
    return [];
  }
}

const router = express.Router();

router.use((req: Request, res: Response, next: NextFunction) => {
  if (!req.serverDbConnection) {
    return res.status(503).json({ error: 'Service unavailable. Database connection not established.' });
  }
  if (!req.serverName) {
    return res.status(500).json({ error: 'Internal server error. Server name missing.' });
  }
  next();
});

router.use(isAuthenticated);

function getCategoryFromType(type: string): string {
  switch(type) {
    case 'bug': return 'Bug Report';
    case 'player': return 'Player Report';
    case 'chat': return 'Chat Report';
    case 'appeal': return 'Ban Appeal';
    case 'staff': 
    case 'application': return 'Staff Application';
    case 'support': return 'General Support';
    default: return 'General Support';
  }
}

router.get('/', async (req: Request, res: Response) => {
  // Check permissions
  const { hasPermission } = await import('../middleware/permission-middleware');
  const canViewTickets = await hasPermission(req, 'ticket.view.all');
  
  if (!canViewTickets) {
    return res.status(403).json({ 
      message: 'Forbidden: You do not have the required permissions.',
      required: ['ticket.view.all']
    });
  }
  try {
    const Ticket = req.serverDbConnection!.model('Ticket');
    
    // Parse query parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string || '';
    const status = req.query.status as string || '';
    const type = req.query.type as string || '';
    
    // Calculate skip value for pagination
    const skip = (page - 1) * limit;
    
    // Build search query
    const query: any = { status: { $ne: 'Unfinished' } };
    
    // Add search filters
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { _id: searchRegex }, // Search by ticket ID
        { subject: searchRegex }, // Search by subject
        { creator: searchRegex }, // Search by creator UUID
        { creatorName: searchRegex }, // Search by creator name
        { 'replies.name': searchRegex }, // Search by staff member who replied
        { 'replies.content': searchRegex }, // Search by message content
        { reason: searchRegex }, // Search by reason
      ];
    }
    
    // Add status filter
    if (status && status !== 'all') {
      if (status === 'open') {
        query.locked = { $ne: true };
      } else if (status === 'closed') {
        query.locked = true;
      }
    }
    
    // Add type filter
    if (type && type !== 'all') {
      query.type = type;
    }
    
    // Get total count for pagination
    const totalTickets = await Ticket.countDocuments(query);
    
    // Fetch tickets with pagination and sorting
    const tickets = await Ticket.find(query)
      .sort({ created: -1 }) // Sort by creation date, newest first
      .skip(skip)
      .limit(limit)
      .lean();
    
    const transformedTickets = tickets.map((ticket: any) => ({
      id: ticket._id,
      subject: ticket.subject || 'No Subject',
      status: ticket.status,
      reportedBy: ticket.creator,
      reportedByName: ticket.creatorName || ticket.creator,
      date: ticket.created,
      category: getCategoryFromType(ticket.type),
      locked: ticket.locked || false,
      type: ticket.type,
      // Add additional fields for search results
      lastReply: ticket.replies && ticket.replies.length > 0 
        ? ticket.replies[ticket.replies.length - 1] 
        : null,
      replyCount: ticket.replies ? ticket.replies.length : 0,
    }));
    
    // Calculate pagination metadata
    const totalPages = Math.ceil(totalTickets / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;
    
    res.json({
      tickets: transformedTickets,
      pagination: {
        current: page,
        total: totalPages,
        limit: limit,
        totalTickets: totalTickets,
        hasNext: hasNextPage,
        hasPrev: hasPrevPage,
      },
      filters: {
        search,
        status,
        type,
      },
    });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const Ticket = req.serverDbConnection!.model<ITicket>('Ticket');
    const ticket: ITicket | null = await Ticket.findById(req.params.id);
    
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Mark ticket as read for the current staff member
    if (req.session?.username) {
      try {
        const { markTicketAsRead } = await import('./ticket-subscription-routes');
        await markTicketAsRead(req.serverDbConnection!, req.params.id, req.session.username);
      } catch (readError) {
        console.error(`Failed to mark ticket ${req.params.id} as read:`, readError);
        // Don't fail the request if marking as read fails
      }
    }

    // Manually construct the object to send, ensuring Maps are converted
    const transformedTicket = {
      id: ticket._id,
      subject: ticket.subject || 'No Subject',
      status: ticket.status,
      type: ticket.type,
      category: getCategoryFromType(ticket.type),
      reportedBy: ticket.creator || 'Unknown',
      date: ticket.created,
      locked: ticket.locked || false,
      formData: ticket.formData ? Object.fromEntries(ticket.formData) : {},
      reportedPlayer: ticket.reportedPlayer,
      reportedPlayerUuid: ticket.reportedPlayerUuid,
      creator: ticket.creator,
      creatorUuid: ticket.creatorUuid,
      chatMessages: ticket.chatMessages || [],
      messages: ticket.replies?.map((reply: any) => ({
        id: reply._id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        sender: reply.name,
        senderType: reply.type,
        content: reply.content,
        timestamp: reply.created,
        staff: reply.staff,
        closedAs: reply.action,
        attachments: reply.attachments || []
      })) || [],
      notes: ticket.notes || [],
      tags: ticket.tags || [],
      data: ticket.data ? Object.fromEntries(ticket.data) : {} // Correctly convert Map to object
    };
    
    res.json(transformedTicket);
  } catch (error: any) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

interface CreateTicketBody {
  category: string;
  creator: string; // UUID
  tags?: string[];
  data?: Record<string, any>;
  creatorName?: string;
  creatorAvatar?: string;
}

router.post('/', async (req: Request<{}, {}, CreateTicketBody>, res: Response) => {
  try {
    const Ticket = req.serverDbConnection!.model<ITicket>('Ticket');
    const { category, creator, tags, data, creatorName, creatorAvatar } = req.body;
    
    const randomDigits = Math.floor(100000 + Math.random() * 900000).toString();
    const ticketId = `${category.toUpperCase()}-${randomDigits}`;

    const newTicket = new Ticket({
      _id: ticketId,
      category,
      tags: tags || [],
      created: new Date(),
      creator, // UUID
      creatorName,
      creatorAvatar,
      notes: [],
      replies: [],
      data: data || new Map(),
      status: 'Open', // Default status
    });

    await newTicket.save();

    // Trigger AI analysis for Player Report tickets with chat messages
    if (req.serverDbConnection) {
      try {
        const aiModerationService = new AIModerationService(req.serverDbConnection);
        await aiModerationService.processNewTicket(ticketId, newTicket);
      } catch (aiError) {
        console.error(`[Ticket Routes] AI moderation processing failed for ticket ${ticketId}:`, aiError);
        // Don't fail the ticket creation if AI processing fails
      }
    }

    res.status(201).json(newTicket);
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

interface AddNoteBody {
  text: string;
  issuerName: string;
  issuerAvatar?: string;
}

router.post('/:id/notes', async (req: Request<{ id: string }, {}, AddNoteBody>, res: Response) => {
  try {
    const Ticket = req.serverDbConnection!.model<ITicket>('Ticket');
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const newNote: INote = {
      text: req.body.text,
      issuerName: req.body.issuerName,
      issuerAvatar: req.body.issuerAvatar,
      date: new Date(),
    };

    ticket.notes.push(newNote);
    await ticket.save();

    res.status(201).json(newNote);
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

interface AddReplyBody {
  name: string;
  content: string;
  type: string;
  staff?: boolean;
  avatar?: string;
  attachments?: any[];
}

router.post('/:id/replies', async (req: Request<{ id: string }, {}, AddReplyBody>, res: Response) => {
  // Check permissions
  const { hasPermission } = await import('../middleware/permission-middleware');
  const canReplyToTickets = await hasPermission(req, 'ticket.reply.all');
  
  if (!canReplyToTickets) {
    return res.status(403).json({ 
      message: 'Forbidden: You do not have the required permissions.',
      required: ['ticket.reply.all']
    });
  }
  try {
    const Ticket = req.serverDbConnection!.model<ITicket>('Ticket');
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const newReply: IReply = {
      name: req.body.name,
      avatar: req.body.avatar,
      content: req.body.content,
      type: req.body.type,
      created: new Date(),
      staff: req.body.staff || false,
      attachments: req.body.attachments || []
    };

    ticket.replies.push(newReply);
    await ticket.save();

    // Auto-subscribe staff member to ticket when they reply
    if (newReply.staff && req.session?.username) {
      try {
        const { ensureTicketSubscription } = await import('./ticket-subscription-routes');
        
        // Auto-subscribe the staff member who replied
        await ensureTicketSubscription(req.serverDbConnection!, req.params.id, req.session.username);
      } catch (subscriptionError) {
        console.error(`Failed to handle ticket subscription for ticket ${req.params.id}:`, subscriptionError);
        // Don't fail the reply if subscription fails
      }
    }

    // Add notification for staff replies
    if (newReply.staff && ticket.creatorUuid) {
      // Build panel URL from server name
      const panelUrl = process.env.NODE_ENV === 'development' 
        ? `http://localhost:5173`
        : `https://${req.serverName}.${process.env.DOMAIN || 'modl.gg'}`;
      
      const notification = createTicketReplyNotification(
        req.params.id, 
        newReply.name, 
        newReply.content,
        panelUrl
      );
      await addNotificationToPlayer(req.serverDbConnection!, ticket.creatorUuid, notification);
      
      // Send email notification if ticket has creator email
      if (ticket.data && (ticket.data.get('creatorEmail') || ticket.data.get('contactEmail') || ticket.data.get('contact_email'))) {
        try {
          const TicketEmailService = (await import('../services/ticket-email-service')).default;
          const emailService = new TicketEmailService();
          
          // Get server display name from settings
          const generalSettings = await getSettingsValue(req.serverDbConnection!, 'general');
          const serverDisplayName = generalSettings?.serverDisplayName || 'modl';
          
          await emailService.sendTicketReplyNotification({
            ticketId: ticket._id,
            ticketSubject: ticket.subject,
            ticketType: ticket.type,
            playerName: ticket.creator,
            playerEmail: ticket.data.get('creatorEmail') || ticket.data.get('contactEmail') || ticket.data.get('contact_email'),
            replyContent: newReply.content,
            replyAuthor: newReply.name,
            isStaffReply: newReply.staff,
            serverName: req.serverName,
            serverDisplayName: serverDisplayName
          });
        } catch (emailError) {
          console.error(`[Staff Reply] Failed to send email notification for ticket ${req.params.id}:`, emailError);
          // Don't fail the reply if email fails
        }
      }
    }

    res.status(201).json(newReply);
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

interface AddTagBody {
  tag: string;
  staffName?: string;
}

router.post('/:id/tags', async (req: Request<{ id: string }, {}, AddTagBody>, res: Response) => {
  try {
    const Ticket = req.serverDbConnection!.model<ITicket>('Ticket');
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const tagToAdd = req.body.tag;
    if (!ticket.tags.includes(tagToAdd)) {
      ticket.tags.push(tagToAdd);
      await ticket.save();

    }

    res.status(200).json(ticket.tags);
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

interface RemoveTagBody {
    staffName?: string;
}

router.delete('/:id/tags/:tag', async (req: Request<{ id: string, tag: string }, {}, RemoveTagBody>, res: Response) => {
  try {
    const Ticket = req.serverDbConnection!.model<ITicket>('Ticket');
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const tagToRemove = req.params.tag;
    const initialLength = ticket.tags.length;
    ticket.tags = ticket.tags.filter(tag => tag !== tagToRemove);

    if (ticket.tags.length < initialLength) {
      await ticket.save();
    }

    res.status(200).json(ticket.tags);  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

interface UpdateTicketBody {
  status?: string;
  locked?: boolean;
  newReply?: {
    id: string;
    name: string;
    type: string;
    content: string;
    created: Date;
    staff: boolean;
    action?: string;
    attachments?: any[];
  };
  newNote?: {
    content: string;
    author: string;
    date: string;
  };
  tags?: string[];
  data?: Record<string, any>;
}

// General PATCH route for ticket updates
router.patch('/:id', async (req: Request<{ id: string }, {}, UpdateTicketBody>, res: Response) => {
  // Check permissions
  const { hasPermission } = await import('../middleware/permission-middleware');
  const canReplyToTickets = await hasPermission(req, 'ticket.reply.all');
  
  if (!canReplyToTickets) {
    return res.status(403).json({ 
      message: 'Forbidden: You do not have the required permissions.',
      required: ['ticket.reply.all']
    });
  }
  console.log(`[Ticket PATCH] Updating ticket ${req.params.id}`);
  console.log(`[Ticket PATCH] Request body:`, JSON.stringify(req.body, null, 2));
  
  try {
    const Ticket = req.serverDbConnection!.model<ITicket>('Ticket');
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const updates = req.body;

    // Update status if provided (requires close permission for closing)
    if (updates.status !== undefined) {
      if (updates.status === 'Closed' && !req.session?.permissions?.includes('ticket.close.all')) {
        return res.status(403).json({ error: 'Insufficient permissions to close tickets' });
      }
      ticket.status = updates.status;
    }

    // Update locked status if provided (requires close permission)
    if (updates.locked !== undefined) {
      if (updates.locked && !req.session?.permissions?.includes('ticket.close.all')) {
        return res.status(403).json({ error: 'Insufficient permissions to lock tickets' });
      }
      ticket.locked = updates.locked;
    }

    // Add new reply if provided
    if (updates.newReply) {
      const newReply: IReply = {
        name: updates.newReply.name,
        content: updates.newReply.content,
        type: updates.newReply.type,
        created: new Date(updates.newReply.created),
        staff: updates.newReply.staff,
        action: updates.newReply.action,
        attachments: updates.newReply.attachments || []
      };
      ticket.replies.push(newReply);

      // Auto-subscribe staff member to ticket when they reply
      if (newReply.staff && req.session?.username) {
        console.log(`[Ticket PATCH] Auto-subscribing ${req.session.username} to ticket ${req.params.id}`);
        try {
          const { ensureTicketSubscription } = await import('./ticket-subscription-routes');
          
          // Auto-subscribe the staff member who replied
          await ensureTicketSubscription(req.serverDbConnection!, req.params.id, req.session.username);
        } catch (subscriptionError) {
          console.error(`[Ticket PATCH] Failed to handle ticket subscription for ticket ${req.params.id}:`, subscriptionError);
          // Don't fail the reply if subscription fails - this is not critical
        }
      }

      // Add notification for staff replies
      if (newReply.staff && ticket.creatorUuid) {
        console.log(`[Ticket PATCH] Staff reply detected from ${newReply.name}`);
        
        // Build panel URL from server name
        const panelUrl = process.env.NODE_ENV === 'development' 
          ? `http://localhost:5173`
          : `https://${req.serverName}.${process.env.DOMAIN || 'modl.gg'}`;
        
        const notification = createTicketReplyNotification(
          req.params.id, 
          newReply.name, 
          newReply.content,
          panelUrl
        );
        await addNotificationToPlayer(req.serverDbConnection!, ticket.creatorUuid, notification);
        
        // Send email notification if ticket has creator email
        const emailField = ticket.data?.get('creatorEmail') || ticket.data?.get('contactEmail') || ticket.data?.get('contact_email');
        console.log(`[Ticket PATCH] Checking for email field. Found: ${emailField}`);
        console.log(`[Ticket PATCH] ticket.data keys:`, ticket.data ? Array.from(ticket.data.keys()) : 'No data');
        
        if (ticket.data && emailField) {
          try {
            const TicketEmailService = (await import('../services/ticket-email-service')).default;
            const emailService = new TicketEmailService();
            
            // Get server display name from settings
            const generalSettings = await getSettingsValue(req.serverDbConnection!, 'general');
            const serverDisplayName = generalSettings?.serverDisplayName || 'modl';
            
            await emailService.sendTicketReplyNotification({
              ticketId: ticket._id,
              ticketSubject: ticket.subject,
              ticketType: ticket.type,
              playerName: ticket.creator,
              playerEmail: emailField,
              replyContent: newReply.content,
              replyAuthor: newReply.name,
              isStaffReply: newReply.staff,
              serverName: req.serverName,
              serverDisplayName: serverDisplayName
            });
            console.log(`[Ticket PATCH] Email notification sent successfully to ${emailField}`);
          } catch (emailError) {
            console.error(`[Ticket PATCH] Failed to send email notification for ticket ${req.params.id}:`, emailError);
            // Don't fail the reply if email fails - this is not critical
          }
        }
      }
    }

    // Add new note if provided
    if (updates.newNote) {
      const newNote: INote = {
        content: updates.newNote.content,
        author: updates.newNote.author,
        date: new Date(updates.newNote.date)
      };
      ticket.notes.push(newNote);
    }

    // Update tags if provided
    if (updates.tags !== undefined) {
      ticket.tags = updates.tags;
    }


    // Update data fields if provided
    if (updates.data && typeof updates.data === 'object') {
      for (const [key, value] of Object.entries(updates.data)) {
        ticket.data.set(key, value);
      }
    }

    await ticket.save();

    // Return the updated ticket
    res.status(200).json({
      id: ticket._id,
      status: ticket.status,
      tags: ticket.tags,
      notes: ticket.notes,
      replies: ticket.replies,
      data: Object.fromEntries(ticket.data),
      locked: ticket.locked || false
    });
  } catch (error: any) {
    console.error(`[Ticket PATCH] Error updating ticket ${req.params.id}:`, error);
    console.error(`[Ticket PATCH] Error stack:`, error.stack);
    console.error(`[Ticket PATCH] Request body was:`, JSON.stringify(req.body, null, 2));
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

interface UpdateTicketDataBody {
  data: Record<string, any>; // This will contain fields like status, assignedTo, priority, or custom data fields
  staffName?: string;
}

router.patch('/:id/data', async (req: Request<{ id: string }, {}, UpdateTicketDataBody>, res: Response) => {
  try {
    const Ticket = req.serverDbConnection!.model<ITicket>('Ticket');
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Assuming req.body.data is an object with key-value pairs to update in ticket.data (Map)
    if (req.body.data && typeof req.body.data === 'object') {
      for (const [key, value] of Object.entries(req.body.data)) {
        ticket.data.set(key, value);
      }
      await ticket.save();

    }

    res.status(200).json(Object.fromEntries(ticket.data)); // Convert Map to object for JSON response
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

router.get('/tag/:tag', async (req: Request<{ tag: string }>, res: Response) => {
  try {
    const Ticket = req.serverDbConnection!.model<ITicket>('Ticket');
    const tickets = await Ticket.find({ tags: req.params.tag });
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/creator/:uuid', async (req: Request<{ uuid: string }>, res: Response) => {
  try {
    const Ticket = req.serverDbConnection!.model<ITicket>('Ticket');
    const tickets = await Ticket.find({ creatorUuid: req.params.uuid });
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all tickets involving a player (both created by them and reports against them)
router.get('/player/:uuid', async (req: Request<{ uuid: string }>, res: Response) => {
  try {
    const Ticket = req.serverDbConnection!.model<ITicket>('Ticket');
    
    // Find tickets where the player is either the creator OR the reported player
    // Exclude unfinished tickets
    const tickets = await Ticket.find({
      $and: [
        {
          $or: [
            { creatorUuid: req.params.uuid },
            { reportedPlayerUuid: req.params.uuid }
          ]
        },
        { status: { $ne: 'Unfinished' } }
      ]
    }).sort({ created: -1 }); // Sort by creation date, newest first
    
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Quick Response endpoint
interface QuickResponseBody {
  actionId: string;
  categoryId: string;
  punishmentTypeId?: number;
  punishmentSeverity?: 'low' | 'regular' | 'severe';
  customValues?: any;
  appealAction?: 'pardon' | 'reduce' | 'reject' | 'none';
}

router.post('/:id/quick-response', async (req: Request<{ id: string }, {}, QuickResponseBody>, res: Response) => {
  // Check permissions
  const { hasPermission } = await import('../middleware/permission-middleware');
  const canReplyToTickets = await hasPermission(req, 'ticket.reply.all');
  
  if (!canReplyToTickets) {
    return res.status(403).json({ 
      message: 'Forbidden: You do not have the required permissions.',
      required: ['ticket.reply.all']
    });
  }
  try {
    const Ticket = req.serverDbConnection!.model<ITicket>('Ticket');
    const Settings = req.serverDbConnection!.model('Settings');
    
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Get quick responses configuration from settings
    const settingsDoc = await Settings.findOne();
    if (!settingsDoc || !settingsDoc.settings) {
      return res.status(500).json({ error: 'Settings not found' });
    }

    const quickResponsesConfig = settingsDoc.settings.get('quickResponses');
    if (!quickResponsesConfig) {
      return res.status(500).json({ error: 'Quick responses configuration not found' });
    }

    // Find the specific action
    const category = quickResponsesConfig.categories.find((cat: any) => cat.id === req.body.categoryId);
    if (!category) {
      return res.status(400).json({ error: 'Category not found' });
    }

    const action = category.actions.find((act: any) => act.id === req.body.actionId);
    if (!action) {
      return res.status(400).json({ error: 'Action not found' });
    }

    // Add the response message as a reply
    const responseReply: IReply = {
      name: req.user?.displayName || 'System',
      avatar: req.user?.avatar,
      content: action.message,
      type: 'public',
      created: new Date(),
      staff: true,
    };

    ticket.replies.push(responseReply);

    // Handle punishment issuance for report tickets only (player_report or chat_report)
    const isReportTicket = ['player_report', 'chat_report'].includes(ticket.category.toLowerCase()) || 
                          ticket.category.toLowerCase().includes('report');
    
    if (action.issuePunishment && isReportTicket) {
      if (req.body.punishmentTypeId && ticket.data.get('reported_player')) {
        try {
          const PunishmentService = (await import('../services/punishment-service')).PunishmentService;
          const punishmentService = new PunishmentService(req.serverDbConnection!);
          
          const reportedPlayer = ticket.data.get('reported_player');
          const severity = req.body.punishmentSeverity || 'regular';
          const reason = `Report accepted: ${ticket._id}`;
          
          await punishmentService.applyPunishment(
            reportedPlayer,
            req.body.punishmentTypeId,
            severity,
            reason,
            ticket._id,
            req.user?.displayName || 'System'
          );

          // Add a note about the punishment
          const punishmentNote: INote = {
            text: `Punishment applied to ${reportedPlayer} (${severity} severity)`,
            issuerName: req.user?.displayName || 'System',
            issuerAvatar: req.user?.avatar,
            date: new Date(),
          };
          ticket.notes.push(punishmentNote);
          
        } catch (punishmentError) {
          console.error('Failed to apply punishment:', punishmentError);
          // Don't fail the entire request if punishment fails
        }
      }
    }

    // Handle appeal actions
    if (action.appealAction && ticket.category.toLowerCase().includes('appeal')) {
      const appealAction = req.body.appealAction || action.appealAction;
      
      if (appealAction === 'pardon') {
        // Execute pardon action on the actual punishment
        const punishmentId = ticket.data?.get('punishmentId');
        const playerUuid = ticket.data?.get('playerUuid');
        
        if (punishmentId && playerUuid) {
          try {
            const Player = req.serverDbConnection!.model('Player');
            const player = await Player.findOne({ minecraftUuid: playerUuid, 'punishments.id': punishmentId });
            
            if (player) {
              const punishment = player.punishments.find((p: any) => p.id === punishmentId);
              if (punishment) {
                // Add pardon modification
                punishment.modifications = punishment.modifications || [];
                punishment.modifications.push({
                  type: 'APPEAL_ACCEPT',
                  issuerName: req.user?.displayName || 'System',
                  issued: new Date(),
                });
                
                // Mark punishment as inactive
                punishment.data = punishment.data || new Map();
                punishment.data.set('active', false);
                punishment.data.set('appealOutcome', 'Approved');
                punishment.data.set('appealTicketId', ticket._id);
                
                await player.save();
                
                const pardonNote: INote = {
                  text: `Appeal approved - Full pardon granted. Punishment ${punishmentId} has been pardoned.`,
                  issuerName: req.user?.displayName || 'System',
                  issuerAvatar: req.user?.avatar,
                  date: new Date(),
                };
                ticket.notes.push(pardonNote);
              }
            }
          } catch (error) {
            console.error('Error executing pardon:', error);
            const errorNote: INote = {
              text: `Appeal approved but failed to execute pardon automatically. Please pardon punishment ${punishmentId} manually.`,
              issuerName: req.user?.displayName || 'System',
              issuerAvatar: req.user?.avatar,
              date: new Date(),
            };
            ticket.notes.push(errorNote);
          }
        }
        
        ticket.status = 'Closed';
      } else if (appealAction === 'reduce') {
        // Execute reduction action on the actual punishment
        const punishmentId = ticket.data?.get('punishmentId');
        const playerUuid = ticket.data?.get('playerUuid');
        
        if (punishmentId && playerUuid && req.body.customValues) {
          try {
            const Player = req.serverDbConnection!.model('Player');
            const player = await Player.findOne({ minecraftUuid: playerUuid, 'punishments.id': punishmentId });
            
            if (player) {
              const punishment = player.punishments.find((p: any) => p.id === punishmentId);
              if (punishment) {
                // Get reduction details from custom values
                const newDuration = req.body.customValues.duration;
                const isPermanent = req.body.customValues.isPermanent;
                
                // Add reduction modification
                punishment.modifications = punishment.modifications || [];
                punishment.modifications.push({
                  type: 'MANUAL_DURATION_CHANGE',
                  issuerName: req.user?.displayName || 'System',
                  issued: new Date(),
                  data: new Map([
                    ['effectiveDuration', isPermanent ? -1 : newDuration],
                    ['reason', 'Appeal partially approved - duration reduced']
                  ])
                });
                
                // Update punishment data
                punishment.data = punishment.data || new Map();
                punishment.data.set('appealOutcome', 'Reduced');
                punishment.data.set('appealTicketId', ticket._id);
                
                await player.save();
                
                const reductionText = isPermanent ? 'permanent' : `${newDuration} milliseconds`;
                const reductionNote: INote = {
                  text: `Appeal partially approved - Punishment ${punishmentId} duration reduced to ${reductionText}.`,
                  issuerName: req.user?.displayName || 'System',
                  issuerAvatar: req.user?.avatar,
                  date: new Date(),
                };
                ticket.notes.push(reductionNote);
              }
            }
          } catch (error) {
            console.error('Error executing reduction:', error);
            const errorNote: INote = {
              text: `Appeal approved but failed to execute reduction automatically. Please reduce punishment ${punishmentId} manually.`,
              issuerName: req.user?.displayName || 'System',
              issuerAvatar: req.user?.avatar,
              date: new Date(),
            };
            ticket.notes.push(errorNote);
          }
        }
        
        // Don't automatically close for reduction - staff may want to add more details
      } else if (appealAction === 'reject') {
        const rejectionNote: INote = {
          text: `Appeal rejected - Original punishment upheld`,
          issuerName: req.user?.displayName || 'System',
          issuerAvatar: req.user?.avatar,
          date: new Date(),
        };
        ticket.notes.push(rejectionNote);
        ticket.status = 'Closed';
      }
    }

    // Update ticket status based on action's closeTicket property
    if (action.closeTicket) {
      ticket.status = 'Closed';
    }

    await ticket.save();

    res.json({ 
      success: true, 
      message: 'Quick response applied successfully',
      ticket: ticket,
      actionApplied: action.name
    });
    
  } catch (error: any) {
    console.error('Quick response error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

export default router;
