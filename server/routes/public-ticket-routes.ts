import express, { Request, Response } from 'express';
import { verifyTicketApiKey } from '../middleware/ticket-api-auth';
import { getSettingsValue } from './settings-routes';
import { strictRateLimit } from '../middleware/rate-limiter';

const router = express.Router();

// DO NOT apply API key verification to all routes - only apply to specific endpoints

// Interface for ticket creation request
interface CreateTicketRequest {
  creatorUuid?: string;
  creatorName?: string;
  creatorEmail?: string;
  type: 'bug' | 'player' | 'chat' | 'appeal' | 'staff' | 'support';
  subject: string;
  description?: string;
  reportedPlayerUuid?: string;
  reportedPlayerName?: string;
  chatMessages?: string[];
  formData?: Record<string, any>;
  tags?: string[];
  priority?: 'low' | 'medium' | 'high';
}

// Helper function to generate ticket ID
async function generateTicketId(serverDbConnection: any, type: string): Promise<string> {
  const Ticket = serverDbConnection.model('Ticket');
  const prefix = type === 'bug' ? 'BUG' : 
                type === 'player' ? 'PLAYER' :
                type === 'chat' ? 'CHAT' :
                type === 'appeal' ? 'APPEAL' :
                type === 'staff' ? 'STAFF' : 'SUPPORT';
  const randomId = Math.floor(100000 + Math.random() * 900000);
  const ticketId = `${prefix}-${randomId}`;
  const existingTicket = await Ticket.findById(ticketId);
  if (existingTicket) {
    return generateTicketId(serverDbConnection, type);
  }  return ticketId;
}

// Create a new ticket via API (with API key authentication)
router.post('/tickets', verifyTicketApiKey, async (req: Request, res: Response) => {
  if (!req.serverDbConnection || !req.serverName) {
    return res.status(503).json({ 
      error: 'Service unavailable',
      message: 'Server database or server name not available' 
    });
  }
  
  const Ticket = req.serverDbConnection.model('Ticket');
  
  try {
    const {
      creatorUuid,
      creatorName,
      creatorEmail,
      type,
      subject,
      description,
      reportedPlayerUuid,
      reportedPlayerName,
      chatMessages,
      formData,
      tags,
      priority
    }: CreateTicketRequest = req.body;
    
    // Validate required fields
    if (!type) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Type is required'
      });
    }
    
    // If no subject provided, create as Unfinished ticket
    const ticketStatus = subject ? 'Open' : 'Unfinished';
    const ticketSubject = subject || `${type.charAt(0).toUpperCase() + type.slice(1)} Ticket`;
    
    // Validate ticket type
    const validTypes = ['bug', 'player', 'chat', 'appeal', 'staff', 'support'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: 'Bad request',
        message: `Invalid ticket type. Must be one of: ${validTypes.join(', ')}`
      });
    }
    
    // Type-specific validation
    if (['player', 'chat'].includes(type) && !reportedPlayerUuid && !reportedPlayerName) {
      return res.status(400).json({
        error: 'Bad request',
        message: `${type} reports require either reportedPlayerUuid or reportedPlayerName`
      });
    }
    
    if (type === 'chat' && (!chatMessages || chatMessages.length === 0)) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Chat reports require chatMessages array'
      });
    }
    
    // Generate ticket ID
    const ticketId = await generateTicketId(req.serverDbConnection, type);
    
    // Create initial message content
    let contentString = '';
    if (description) {
      contentString += `Description: ${description}\n\n`;
    }
    
    // Special handling for chat reports
    if (type === 'chat' && chatMessages && chatMessages.length > 0) {
      contentString += `**Chat Messages:**\n`;
      try {
        const messages = Array.isArray(chatMessages) ? chatMessages : [];
        messages.forEach((msg: any) => {
          if (typeof msg === 'object' && msg.username && msg.message) {
            const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : 'Unknown time';
            const username = msg.username;
            const message = msg.message;
            contentString += `\`[${timestamp}]\` **${username}**: ${message}\n`;
          } else if (typeof msg === 'string') {
            contentString += `${msg}\n`;
          }
        });
      } catch (error) {
        // Fallback to basic format if parsing fails
        contentString += `${chatMessages.join('\n')}\n`;
      }
      contentString += `\n`;
    }
    
    if (formData && Object.keys(formData).length > 0) {
      // Get ticket form configuration to get field labels
      let ticketForms = null;
      try {
        ticketForms = await getSettingsValue(req.serverDbConnection!, 'ticketForms');
      } catch (error) {
        console.warn('Could not fetch ticket forms configuration');
      }
      
      // Create a map of field IDs to labels and field objects
      const fieldLabels: Record<string, string> = {};
      const fieldMap: Record<string, any> = {};
      let orderedFields: any[] = [];
      
      if (ticketForms && ticketForms[type] && ticketForms[type].fields) {
        ticketForms[type].fields.forEach((field: any) => {
          fieldLabels[field.id] = field.label;
          fieldMap[field.id] = field;
        });
        // Sort fields by order
        orderedFields = ticketForms[type].fields.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
      }
      
      // Process fields in order
      orderedFields.forEach((field) => {
        const key = field.id;
        const value = formData[key];
        if (value === undefined || value === null || value === '') return;
        
        // Skip chatlog for chat reports as it's already handled above
        if (type === 'chat' && key === 'chatlog') return;
        
        // Get the field label
        const fieldLabel = field.label || key;
        
        // Special formatting for Chat Messages field
        if (fieldLabel === 'Chat Messages' && typeof value === 'string') {
          contentString += `**${fieldLabel}:**\n`;
          try {
            // Try to parse each line as JSON
            const lines = value.split('\n').filter(line => line.trim());
            lines.forEach(line => {
              try {
                const msg = JSON.parse(line);
                if (msg.username && msg.message && msg.timestamp) {
                  const timestamp = new Date(msg.timestamp).toLocaleString();
                  contentString += `\`[${timestamp}]\` **${msg.username}**: ${msg.message}\n`;
                } else {
                  contentString += `${line}\n`;
                }
              } catch {
                // If not valid JSON, just add the line as-is
                contentString += `${line}\n`;
              }
            });
            contentString += `\n`;
          } catch (error) {
            // Fallback to original format if parsing fails
            contentString += `${value}\n\n`;
          }
        } else if (field.type === 'multiple_choice' && field.options) {
          // For multiple choice, show the option label instead of the value
          const selectedOption = field.options.find((opt: string) => opt === value);
          contentString += `**${fieldLabel}:** ${selectedOption || value}\n\n`;
        } else {
          contentString += `**${fieldLabel}:** ${value}\n\n`;
        }
      });
      
      // Add any formData fields that weren't in the form configuration
      Object.entries(formData).forEach(([key, value]) => {
        if (!fieldMap[key] && value !== undefined && value !== null && value !== '') {
          if (type === 'chat' && key === 'chatlog') return;
          contentString += `**${key}:** ${value}\n\n`;
        }
      });
    }
      // Prepare ticket data
    const ticketData: any = {
      _id: ticketId,
      type,
      category: type, // Also set category for compatibility with panel interface
      subject: ticketSubject,
      status: ticketStatus,
      tags: tags || [type],
      creator: creatorName || 'API User',
      creatorUuid: creatorUuid || 'unknown-uuid',
      created: new Date(),
      locked: false,
      notes: [],
      replies: [],
      data: new Map<string, any>()
    };
    
    // Add type-specific fields
    if (reportedPlayerUuid) ticketData.reportedPlayerUuid = reportedPlayerUuid;
    if (reportedPlayerName) ticketData.reportedPlayer = reportedPlayerName;
    if (chatMessages) ticketData.chatMessages = chatMessages;
    if (priority) ticketData.data.set('priority', priority);
    if (creatorEmail) ticketData.data.set('creatorEmail', creatorEmail);
    
    // Store formData in ticket.data Map
    if (formData && Object.keys(formData).length > 0) {
      Object.entries(formData).forEach(([key, value]) => {
        ticketData.data.set(key, value);
        // Map contact_email to creatorEmail for email notifications
        if (key === 'contact_email') {
          ticketData.data.set('creatorEmail', value);
        }
      });
    }
    
    // Add initial message if there's content
    if (contentString.trim()) {
      const initialMessage = {
        name: creatorName || 'API User',
        content: contentString.trim(),
        type: 'user',
        created: new Date(),
        staff: false
      };
      ticketData.replies = [initialMessage];
    }
    
    // Create and save ticket
    const newTicket = new Ticket(ticketData);
    await newTicket.save();
    
    // Trigger AI analysis for Player Report tickets with chat messages
    if (req.serverDbConnection && type === 'chat' && chatMessages && chatMessages.length > 0) {
      try {
        const AIModerationService = (await import('../services/ai-moderation-service')).default;
        const aiModerationService = new AIModerationService(req.serverDbConnection);
        await aiModerationService.processNewTicket(ticketId, newTicket.toObject(), (req as any).modlServer);
      } catch (aiError: any) {
        console.error(`[Public Ticket API] AI moderation processing failed for ticket ${ticketId}:`, aiError.message);
        // Don't fail the ticket creation if AI processing fails
      }
    }
      // Log the creation
    // Ticket created successfully
    
    res.status(201).json({
      success: true,
      ticketId: ticketId,
      message: 'Ticket created successfully',
      ticket: {
        id: ticketId,
        type,
        subject: ticketSubject,
        status: ticketStatus,
        created: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Error creating ticket via API:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create ticket'
    });
  }
});

// Create a new ticket without API key authentication (initially Unfinished)
// Apply strict rate limiting to prevent abuse
router.post('/tickets/unfinished', strictRateLimit, async (req: Request, res: Response) => {
  if (!req.serverDbConnection || !req.serverName) {
    return res.status(503).json({ 
      error: 'Service unavailable',
      message: 'Server database or server name not available' 
    });
  }
  
  const Ticket = req.serverDbConnection.model('Ticket');
  
  try {
    const {
      creatorUuid,
      creatorName,
      creatorEmail,
      type,
      subject,
      description,
      reportedPlayerUuid,
      reportedPlayerName,
      chatMessages,
      formData,
      tags,
      priority
    }: CreateTicketRequest = req.body;
    
    // Validate required fields
    if (!type || !subject) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Type and subject are required fields'
      });
    }
    
    // Validate ticket type
    const validTypes = ['bug', 'player', 'chat', 'appeal', 'staff', 'support'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: 'Bad request',
        message: `Invalid ticket type. Must be one of: ${validTypes.join(', ')}`
      });
    }
    
    // Type-specific validation
    if (['player', 'chat'].includes(type) && !reportedPlayerUuid && !reportedPlayerName) {
      return res.status(400).json({
        error: 'Bad request',
        message: `${type} reports require either reportedPlayerUuid or reportedPlayerName`
      });
    }
    
    if (type === 'chat' && (!chatMessages || chatMessages.length === 0)) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Chat reports require chatMessages array'
      });
    }
    
    // Generate ticket ID
    const ticketId = await generateTicketId(req.serverDbConnection, type);
    
    // Create initial message content
    let contentString = '';
    if (description) {
      contentString += `Description: ${description}\n\n`;
    }
    
    // Special handling for chat reports
    if (type === 'chat' && chatMessages && chatMessages.length > 0) {
      contentString += `**Chat Messages:**\n`;
      try {
        const messages = Array.isArray(chatMessages) ? chatMessages : [];
        messages.forEach((msg: any) => {
          if (typeof msg === 'object' && msg.username && msg.message) {
            const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : 'Unknown time';
            const username = msg.username;
            const message = msg.message;
            contentString += `\`[${timestamp}]\` **${username}**: ${message}\n`;
          } else if (typeof msg === 'string') {
            contentString += `${msg}\n`;
          }
        });
      } catch (error) {
        // Fallback to basic format if parsing fails
        contentString += `${chatMessages.join('\n')}\n`;
      }
      contentString += `\n`;
    }
    
    if (formData && Object.keys(formData).length > 0) {
      // Get ticket form configuration to get field labels
      let ticketForms = null;
      try {
        ticketForms = await getSettingsValue(req.serverDbConnection!, 'ticketForms');
      } catch (error) {
        console.warn('Could not fetch ticket forms configuration');
      }
      
      // Create a map of field IDs to labels
      const fieldLabels: Record<string, string> = {};
      if (ticketForms && ticketForms[type] && ticketForms[type].fields) {
        ticketForms[type].fields.forEach((field: any) => {
          fieldLabels[field.id] = field.label;
        });
      }
      
      Object.entries(formData).forEach(([key, value]) => {
        // Skip chatlog for chat reports as it's already handled above
        if (type === 'chat' && key === 'chatlog') return;
        
        // Get the field label or fallback to the key
        const fieldLabel = fieldLabels[key] || key;
        contentString += `${fieldLabel}: ${value}\n\n`;
      });
    }
    
    // Prepare ticket data
    const ticketData: any = {
      _id: ticketId,
      type,
      subject,
      status: 'Unfinished',
      tags: tags || [type],
      creator: creatorName || 'API User',
      creatorUuid: creatorUuid || undefined,
      created: new Date(),
      locked: false,
      notes: [],
      replies: [],
      data: new Map<string, any>()
    };
    
    // Add type-specific fields
    if (reportedPlayerUuid) ticketData.reportedPlayerUuid = reportedPlayerUuid;
    if (reportedPlayerName) ticketData.reportedPlayer = reportedPlayerName;
    if (chatMessages) ticketData.chatMessages = chatMessages;
    if (priority) ticketData.data.set('priority', priority);
    if (creatorEmail) ticketData.data.set('creatorEmail', creatorEmail);
    
    // Store formData in ticket.data Map
    if (formData && Object.keys(formData).length > 0) {
      Object.entries(formData).forEach(([key, value]) => {
        ticketData.data.set(key, value);
        // Map contact_email to creatorEmail for email notifications
        if (key === 'contact_email') {
          ticketData.data.set('creatorEmail', value);
        }
      });
    }
    
    // Add initial message if there's content
    if (contentString.trim()) {
      const initialMessage = {
        name: creatorName || 'API User',
        content: contentString.trim(),
        type: 'user',
        created: new Date(),
        staff: false
      };
      ticketData.replies = [initialMessage];
    }
    
    // Create and save ticket
    const newTicket = new Ticket(ticketData);
    await newTicket.save();
    
    // Trigger AI analysis for Player Report tickets with chat messages
    if (req.serverDbConnection && type === 'chat' && chatMessages && chatMessages.length > 0) {
      try {
        const AIModerationService = (await import('../services/ai-moderation-service')).default;
        const aiModerationService = new AIModerationService(req.serverDbConnection);
        await aiModerationService.processNewTicket(ticketId, newTicket.toObject(), (req as any).modlServer);
      } catch (aiError: any) {
        console.error(`[Public Ticket API] AI moderation processing failed for ticket ${ticketId}:`, aiError.message);
        // Don't fail the ticket creation if AI processing fails
      }
    }
      // Log the creation
    // Ticket created successfully
    
    res.status(201).json({
      success: true,
      ticketId: ticketId,
      message: 'Ticket created successfully (Unfinished)',
      ticket: {
        id: ticketId,
        type,
        subject,
        status: 'Unfinished',
        created: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Error creating unfinished ticket via API:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create unfinished ticket'
    });
  }
});

// Get ticket status (useful for checking if ticket was created successfully)
router.get('/tickets/:id/status', verifyTicketApiKey, async (req: Request, res: Response) => {
  if (!req.serverDbConnection) {
    return res.status(503).json({ 
      error: 'Service unavailable',
      message: 'Server database not available' 
    });
  }
  
  const Ticket = req.serverDbConnection.model('Ticket');
  
  try {
    const { id } = req.params;
    const ticket = await Ticket.findById(id);
    
    if (!ticket) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Ticket not found'
      });
    }
    
    res.json({
      id: ticket._id,
      type: ticket.type,
      subject: ticket.subject,
      status: ticket.status,
      created: ticket.created,
      locked: ticket.locked || false
    });
    
  } catch (error) {
    console.error('Error fetching ticket status:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch ticket status'
    });
  }
});

// Public ticket viewing routes (no authentication required)
// Get full ticket details (public access)
router.get('/tickets/:id', async (req: Request, res: Response) => {
  if (!req.serverDbConnection) {
    return res.status(503).json({ 
      error: 'Service unavailable',
      message: 'Server database not available' 
    });
  }
  
  const Ticket = req.serverDbConnection.model('Ticket');
  const Staff = req.serverDbConnection.model('Staff');
  
  try {
    const { id } = req.params;
    const ticket = await Ticket.findById(id);
    
    if (!ticket) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Ticket not found'
      });
    }
    
    // Enhance messages with staff Minecraft UUIDs for avatar display
    const enhancedMessages = [];
    if (ticket.replies && ticket.replies.length > 0) {
      // Get all staff usernames from messages
      const staffUsernames = ticket.replies
        .filter((message: any) => message.staff === true || message.senderType === 'staff')
        .map((message: any) => message.name || message.sender)
        .filter((name: string) => name && name !== 'System');
      
      // Fetch staff data for these usernames (only username and assignedMinecraftUuid)
      let staffData = [];
      if (staffUsernames.length > 0) {
        staffData = await Staff.find(
          { username: { $in: staffUsernames } },
          { username: 1, assignedMinecraftUuid: 1, _id: 0 }
        );
      }
      
      // Create a lookup map for staff UUIDs
      const staffUuidMap = new Map();
      staffData.forEach((staff: any) => {
        if (staff.assignedMinecraftUuid) {
          staffUuidMap.set(staff.username, staff.assignedMinecraftUuid);
        }
      });
      
      // Enhance each message with staff UUID and normalize field structure
      for (const message of ticket.replies) {
        const enhancedMessage = { ...message.toObject?.() || message };
        
        // Normalize message fields for compatibility
        enhancedMessage.name = message.name || message.sender || 'Unknown';
        enhancedMessage.sender = message.sender || message.name || 'Unknown';
        enhancedMessage.content = message.content || message.message || '';
        enhancedMessage.senderType = message.senderType || (message.staff ? 'staff' : 'user');
        enhancedMessage.timestamp = message.timestamp || message.created || new Date().toISOString();
        
        // Explicitly preserve attachments
        enhancedMessage.attachments = message.attachments || [];
        
        if ((message.staff === true || message.senderType === 'staff') && (message.name || message.sender)) {
          const staffUsername = message.name || message.sender;
          const minecraftUuid = staffUuidMap.get(staffUsername);
          if (minecraftUuid) {
            enhancedMessage.staffMinecraftUuid = minecraftUuid;
          }
        }
        
        enhancedMessages.push(enhancedMessage);
      }
    }
    
    // Return full ticket data for public access
    res.json({
      id: ticket._id,
      _id: ticket._id,
      type: ticket.type,
      subject: ticket.subject,
      status: ticket.status,
      creator: ticket.creator,
      creatorUuid: ticket.creatorUuid,
      reportedBy: ticket.creator, // Alias for compatibility
      created: ticket.created,
      date: ticket.created, // Alias for compatibility
      category: ticket.type, // Use type as category for compatibility
      locked: ticket.locked || false,
      replies: enhancedMessages,
      messages: enhancedMessages, // Alias for compatibility
      notes: ticket.notes || [],
      tags: ticket.tags || [],
      data: ticket.data || new Map(),
      formData: ticket.formData || {},
      reportedPlayer: ticket.reportedPlayer,
      reportedPlayerUuid: ticket.reportedPlayerUuid,
      chatMessages: ticket.chatMessages
    });
    
  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch ticket'
    });
  }
});

// Add reply to ticket (public access)
router.post('/tickets/:id/replies', async (req: Request, res: Response) => {
  if (!req.serverDbConnection) {
    return res.status(503).json({ 
      error: 'Service unavailable',
      message: 'Server database not available' 
    });
  }
  
  const Ticket = req.serverDbConnection.model('Ticket');
  
  try {
    const { id } = req.params;
    const { name, content, type = 'user', staff = false, attachments = [] } = req.body;
    
    if (!name || !content) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Name and content are required'
      });
    }
    
    const ticket = await Ticket.findById(id);
    
    if (!ticket) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Ticket not found'
      });
    }
    
    if (ticket.locked) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'This ticket is locked and cannot accept new replies'
      });
    }
    
    // Create new reply
    const newReply = {
      id: Date.now().toString(),
      name: name,
      content: content,
      type: type,
      created: new Date(),
      staff: staff,
      attachments: attachments, // Include attachments array
      // Compatibility fields
      sender: name,
      senderType: staff ? 'staff' : 'user',
      timestamp: new Date().toISOString()
    };
    
    // Add reply to ticket
    if (!ticket.replies) {
      ticket.replies = [];
    }
    ticket.replies.push(newReply);
    
    await ticket.save();
    
    // Handle ticket subscription for staff replies
    if (staff && name) {
      try {
        const { ensureTicketSubscription } = await import('./ticket-subscription-routes');
        
        // Auto-subscribe the staff member who replied
        await ensureTicketSubscription(req.serverDbConnection!, id, name);
      } catch (subscriptionError) {
        console.error(`Failed to handle ticket subscription for ticket ${id}:`, subscriptionError);
        // Don't fail the reply if subscription fails
      }
    }
    
    // Send email notification if staff replied and ticket has creator email
    if (staff && ticket.data && (ticket.data.get('creatorEmail') || ticket.data.get('contactEmail') || ticket.data.get('contact_email'))) {
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
          replyContent: content,
          replyAuthor: name,
          isStaffReply: staff,
          serverName: req.serverName,
          serverDisplayName: serverDisplayName
        });
      } catch (emailError) {
        console.error(`[Public Reply] Failed to send email notification for ticket ${id}:`, emailError);
        // Don't fail the reply if email fails
      }
    }
    
    res.status(201).json({
      success: true,
      message: 'Reply added successfully',
      reply: newReply
    });
    
  } catch (error) {
    console.error('Error adding reply to ticket:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to add reply'
    });
  }
});

// Submit ticket form (convert from Unfinished to Open)
router.post('/tickets/:id/submit', async (req: Request, res: Response) => {
  if (!req.serverDbConnection) {
    return res.status(503).json({ 
      error: 'Service unavailable',
      message: 'Server database not available' 
    });
  }
  
  const Ticket = req.serverDbConnection.model('Ticket');
  
  try {
    const { id } = req.params;
    const { subject, formData } = req.body;
    
    const ticket = await Ticket.findById(id);
    
    if (!ticket) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Ticket not found'
      });
    }
      // Update ticket with form data
    if (subject) {
      ticket.subject = subject;
    }
    
    if (formData) {
      if (!ticket.data) {
        ticket.data = new Map();
      }
      
      // Store form data
      Object.entries(formData).forEach(([key, value]) => {
        ticket.data.set(key, value);
        // Map contact_email or email to creatorEmail for email notifications
        if (key === 'contact_email' || key === 'email') {
          ticket.data.set('creatorEmail', value);
        }
      });
      ticket.formData = formData;
      
      // Create initial message content from form data
      let contentString = '';
      
      // Get ticket form configuration to get field labels
      let ticketForms = null;
      try {
        ticketForms = await getSettingsValue(req.serverDbConnection!, 'ticketForms');
      } catch (error) {
        console.warn('Could not fetch ticket forms configuration');
      }
      
      // Create a map of field IDs to labels
      const fieldLabels: Record<string, string> = {};
      if (ticketForms && ticketForms[ticket.type] && ticketForms[ticket.type].fields) {
        ticketForms[ticket.type].fields.forEach((field: any) => {
          fieldLabels[field.id] = field.label;
        });
      }
      
      Object.entries(formData).forEach(([key, value]) => {
        // Skip email field from message content as it's used for notifications only
        if (key === 'email' || key === 'contact_email') {
          return;
        }
        
        if (value && value.toString().trim()) {
          // Special handling for chat reports
          if (ticket.type === 'chat' && key === 'chatlog' && ticket.chatMessages && ticket.chatMessages.length > 0) {
            // Format chat messages with timestamps and player links
            contentString += `**Chat Messages:**\n`;
            try {
              // Try to parse the chatMessages if they're stored as objects
              const chatMessages = Array.isArray(ticket.chatMessages) ? ticket.chatMessages : [];
              if (chatMessages.length > 0) {
                chatMessages.forEach((msg: any) => {
                  if (typeof msg === 'object' && msg.username && msg.message) {
                    const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : 'Unknown time';
                    const username = msg.username;
                    const message = msg.message;
                    contentString += `\`[${timestamp}]\` **${username}**: ${message}\n`;
                  } else if (typeof msg === 'string') {
                    // Handle string format chat messages
                    contentString += `${msg}\n`;
                  }
                });
              } else {
                // Fallback to original chatlog field if chatMessages is empty
                contentString += `${value}\n`;
              }
            } catch (error) {
              // Fallback to original chatlog field if parsing fails
              contentString += `${value}\n`;
            }
            contentString += `\n`;
          } else {
            // Get the field label from form configuration or use better fallbacks
            let fieldLabel = fieldLabels[key];
            
            // If no label found, check for common field patterns or use formatted key
            if (!fieldLabel) {
              if (key.includes('description') || key.toLowerCase().includes('desc')) {
                fieldLabel = 'Description';
              } else if (key.includes('attachment') || key.toLowerCase().includes('file')) {
                fieldLabel = 'Attachments';
              } else if (value.includes('http') && (value.includes('.pdf') || value.includes('.png') || value.includes('.jpg'))) {
                fieldLabel = 'Attachments';
              } else {
                fieldLabel = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
              }
            }
            
            contentString += `**${fieldLabel}:**\n${value}\n\n`;
          }
        }
      });
      
      // Add initial message if there's content
      // For Unfinished tickets, we want to create/replace the initial user message
      if (contentString.trim()) {
        // Check if the first message is from the user and replace it, or add new message
        let shouldAddMessage = true;
        if (ticket.replies && ticket.replies.length > 0) {
          const firstReply = ticket.replies[0];
          if (firstReply.senderType === 'user' || firstReply.type === 'user') {
            ticket.replies[0].content = contentString.trim();
            ticket.replies[0].timestamp = new Date().toISOString();
            ticket.replies[0].created = new Date();
            shouldAddMessage = false;
          }
        }
        
        if (shouldAddMessage) {
        const initialMessage = {
          id: Date.now().toString(),
          name: ticket.creator || 'User',
          content: contentString.trim(),
          type: 'user',
          created: new Date(),
          staff: false,
          // Compatibility fields
          sender: ticket.creator || 'User',
          senderType: 'user',
          timestamp: new Date().toISOString()
        };
        
        if (!ticket.replies) {
          ticket.replies = [];
        }
        ticket.replies.push(initialMessage);
        }
      }
    }
    
    // Change status from Unfinished to Open
    ticket.status = 'Open';
    
    await ticket.save();
    
    // Debug: Verify what was actually saved
    const savedTicket = await Ticket.findById(ticket._id);
    if (savedTicket && savedTicket.replies && savedTicket.replies.length > 0) {
      const lastReply = savedTicket.replies[savedTicket.replies.length - 1];
    }
    
    res.json({
      success: true,
      message: 'Ticket submitted successfully',
      ticket: {
        id: ticket._id,
        subject: ticket.subject,
        status: ticket.status
      }
    });
    
  } catch (error) {
    console.error('Error submitting ticket:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to submit ticket'
    });
  }
});

export default router;
