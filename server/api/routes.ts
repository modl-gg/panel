import { Express, Request, Response } from 'express';
import { createSystemLog } from '../routes/log-routes';
import { v4 as uuidv4 } from 'uuid';
import { setupMinecraftRoutes } from '../routes/minecraft-routes';
import { Connection } from 'mongoose';

interface IUsername {
  username: string;
  date: Date;
}

interface IIPAddress {
  ipAddress: string;
  country?: string;
  region?: string;
  asn?: string;
  proxy?: boolean;
  firstLogin: Date;
  logins: Date[];
}

interface IPunishment {
  id: string;
  active?: boolean;
}

interface IReply {
  _id?: any;
  name: string;
  content: string;
  type: string;
  created: Date;
  staff?: boolean;
  action?: string;
}

// Player routes
export function setupPlayerRoutes(app: Express) {

  // Search player by username
  app.get('/api/player/:username', async (req: Request, res: Response) => {
    if (!req.serverDbConnection) {
      return res.status(503).json({ error: 'Server database not available' });
    }
    const Player = req.serverDbConnection.model('Player');
    try {
      const username = req.params.username;
      const regex = new RegExp(username, 'i');
      const player = await Player.findOne({
        'usernames.username': { $regex: regex }
      });
      if (!player) {
        return res.status(404).json({ message: 'Player not found' });
      }
      const latestUsername = player.usernames && player.usernames.length > 0
        ? player.usernames[player.usernames.length - 1].username
        : 'Unknown';
      res.json({
        uuid: player.minecraftUuid,
        username: latestUsername
      });
    } catch (error) {
      console.error('Error searching for player:', error);
      res.status(500).json({ error: 'Failed to search for player' });
    }
  });

  // Get all players
  app.get('/api/players', async (req: Request, res: Response) => {
    if (!req.serverDbConnection) {
      return res.status(503).json({ error: 'Server database not available' });
    }
    const Player = req.serverDbConnection.model('Player');
    try {
      const players = await Player.find({}, { 
        minecraftUuid: 1, 
        'usernames': { $slice: -1 },
        'punishments': 1 
      }).lean(); 
      
      const transformedPlayers = players.map((player: any) => { 
        const latestUsername = player.usernames && player.usernames.length > 0 
          ? player.usernames[player.usernames.length - 1].username 
          : 'Unknown';
        
        const status = player.punishments && player.punishments.some((p: IPunishment) =>
          p.active && p.type_ordinal !== 0 // Exclude kicks (ordinal 0)
        )
          ? 'Banned'
          : 'Active';
        
        return {
          uuid: player.minecraftUuid,
          username: latestUsername,
          status
        };
      });
      
      res.json(transformedPlayers);
    } catch (error) {
      console.error('Error fetching players:', error);
      res.status(500).json({ error: 'Failed to fetch players' });
    }
  });

  // Get player by UUID
  app.get('/api/players/:uuid', async (req: Request, res: Response) => {
    if (!req.serverDbConnection) {
      return res.status(503).json({ error: 'Server database not available' });
    }
    const Player = req.serverDbConnection.model('Player');
    try {
      const uuid = req.params.uuid;
      const player = await Player.findOne({ minecraftUuid: uuid });
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      res.json(player);
    } catch (error) {
      console.error('Error fetching player:', error);
      res.status(500).json({ error: 'Failed to fetch player' });
    }
  });

  app.post('/api/players/login', async (req: Request, res: Response) => {
    if (!req.serverDbConnection) {
      return res.status(503).json({ error: 'Server database not available' });
    }
    const Player = req.serverDbConnection.model('Player');
    try {
      const { minecraftUuid, username, ipAddress } = req.body;
      const ipInfo = await fetch(`http://ip-api.com/json/${ipAddress}?fields=status,message,countryCode,regionName,city,as,proxy,hosting`)
        .then(response => response.json());
  
      const existingPlayer = await Player.findOne({ minecraftUuid });
      if (existingPlayer) {
        const existingIp = existingPlayer.ipList.find((ip: IIPAddress) => ip.ipAddress === ipAddress);
        if (existingIp) {
          existingIp.logins.push(new Date());
        } else {
          existingPlayer.ipList.push({
            ipAddress,
            country: ipInfo.countryCode,
            region: ipInfo.regionName + ipInfo.city,
            asn: ipInfo.as,
            proxy: ipInfo.proxy || ipInfo.hosting,
            firstLogin: new Date(),
            logins: [new Date()]
          });
        }
        const existingUsername = existingPlayer.usernames.find((u: IUsername) => u.username === username);
        if (!existingUsername) {
          existingPlayer.usernames.push({ username, date: new Date() });
        }
        await existingPlayer.save();
        return res.status(201).json(existingPlayer);
      }
  
      const newPlayerDoc = new Player({
        _id: uuidv4(),
        minecraftUuid,
        usernames: [{ username, date: new Date() }],
        notes: [],
        ipList: [{
          ipAddress,
          country: ipInfo.countryCode,
          region: ipInfo.regionName + ipInfo.city,
          asn: ipInfo.as,
          proxy: ipInfo.proxy || ipInfo.hosting,
          firstLogin: new Date(),
          logins: [new Date()]
        }],
        punishments: [],
        pendingNotifications: []
      });
      await newPlayerDoc.save();
      res.status(201).json(newPlayerDoc);
    } catch (error) {
      console.error('Error processing player login:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Create a new player
  app.post('/api/players', async (req: Request, res: Response) => {
    if (!req.serverDbConnection || !req.serverName) {
      return res.status(503).json({ error: 'Server database or server name not available' });
    }
    const Player = req.serverDbConnection.model('Player');
    try {
      const newPlayer = new Player(req.body);
      await newPlayer.save();
      await createSystemLog(req.serverDbConnection, req.serverName, `Player ${req.body.usernames[0].username} created`);
      res.status(201).json(newPlayer);
    } catch (error) {
      console.error('Error creating player:', error);
      res.status(500).json({ error: 'Failed to create player' });
    }
  });

  // Update player
  app.patch('/api/players/:uuid', async (req: Request, res: Response) => {
    if (!req.serverDbConnection || !req.serverName) {
      return res.status(503).json({ error: 'Server database or server name not available' });
    }
    const Player = req.serverDbConnection.model('Player');
    try {
      const uuid = req.params.uuid;
      const player = await Player.findOneAndUpdate(
        { minecraftUuid: uuid },
        { $set: req.body },
        { new: true }
      );
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      await createSystemLog(req.serverDbConnection, req.serverName, `Player ${uuid} updated`);
      res.json(player);
    } catch (error) {
      console.error('Error updating player:', error);
      res.status(500).json({ error: 'Failed to update player' });
    }
  });
  
  // Add punishment to player
  app.post('/api/players/:uuid/punishments', async (req: Request, res: Response) => {
    if (!req.serverDbConnection || !req.serverName) {
      return res.status(503).json({ error: 'Server database or server name not available' });
    }
    const Player = req.serverDbConnection.model('Player');
    try {
      const uuid = req.params.uuid;
      const punishment = req.body;
      const player = await Player.findOneAndUpdate(
        { minecraftUuid: uuid },
        { $push: { punishments: punishment } },
        { new: true }
      );
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      await createSystemLog(req.serverDbConnection, req.serverName, `Punishment added to player ${uuid}`);
      res.json(player);
    } catch (error) {
      console.error('Error adding punishment:', error);
      res.status(500).json({ error: 'Failed to add punishment' });
    }
  });

  // Add note to player
  app.post('/api/players/:uuid/notes', async (req: Request, res: Response) => {
    if (!req.serverDbConnection || !req.serverName) {
      return res.status(503).json({ error: 'Server database or server name not available' });
    }
    const Player = req.serverDbConnection.model('Player');
    try {
      const uuid = req.params.uuid;
      const note = req.body;
      let playerDoc = await Player.findOne({
        $or: [
          { _id: uuid },
          { minecraftUuid: uuid }
        ]
      });
      if (!playerDoc) {
        return res.status(404).json({ error: 'Player not found' });
      }
      playerDoc = await Player.findByIdAndUpdate(
        playerDoc._id,
        { $push: { notes: note } },
        { new: true }
      );
      await createSystemLog(req.serverDbConnection, req.serverName, `Note added to player ${uuid}`);
      res.json(playerDoc);
    } catch (error) {
      console.error('Error adding note:', error);
      res.status(500).json({ error: 'Failed to add note' });
    }
  });
}

// Helper function to generate ticket ID
async function generateTicketId(serverDbConnection: Connection, type: string): Promise<string> {
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
    return generateTicketId(serverDbConnection, type); // Recursive call with connection
  }
  return ticketId;
}

// Helper function to get player by UUID
async function getPlayerByUuid(serverDbConnection: Connection, uuid: string): Promise<{ player: any, latestUsername: string } | null> {
  const Player = serverDbConnection.model('Player');
  try {
    const player = await Player.findOne({ minecraftUuid: uuid });
    if (!player) return null;
    const latestUsername = player.usernames && player.usernames.length > 0
      ? player.usernames[player.usernames.length - 1].username
      : 'Unknown';
    return { player, latestUsername };
  } catch (error) {
    console.error('Error finding player:', error);
    return null;
  }
}

// Ticket routes
export function setupTicketRoutes(app: Express) {
  app.get('/api/tickets', async (req: Request, res: Response) => {
    if (!req.serverDbConnection) {
      return res.status(503).json({ error: 'Server database not available' });
    }
    const Ticket = req.serverDbConnection.model('Ticket');
    try {
      const tickets = await Ticket.find({ status: { $ne: 'Unfinished' } });
      const transformedTickets = tickets.map((ticket: any) => ({
        id: ticket._id,
        subject: ticket.subject || 'No Subject',
        status: ticket.status,
        reportedBy: ticket.creator,
        date: ticket.created,
        category: getCategoryFromType(ticket.type),
        locked: ticket.locked || false,
        type: ticket.type
      }));
      res.json(transformedTickets);
    } catch (error) {
      console.error('Error fetching tickets:', error);
      res.status(500).json({ error: 'Failed to fetch tickets' });
    }
  });
  
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

  app.get('/api/tickets/:id', async (req: Request, res: Response) => {
    if (!req.serverDbConnection) {
      return res.status(503).json({ error: 'Server database not available' });
    }
    const Ticket = req.serverDbConnection.model('Ticket');
    try {
      const id = req.params.id;
      const ticket = await Ticket.findById(id);
      if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }
      const transformedTicket = {
        id: ticket._id,
        subject: ticket.subject || 'No Subject',
        status: ticket.status,
        type: ticket.type,
        category: getCategoryFromType(ticket.type),
        reportedBy: ticket.creator,
        date: ticket.created,
        locked: ticket.locked || false,
        formData: ticket.formData ? Object.fromEntries(ticket.formData) : {},
        reportedPlayer: ticket.reportedPlayer,
        reportedPlayerUuid: ticket.reportedPlayerUuid,
        messages: ticket.replies.map((reply: IReply) => ({
          id: reply._id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          sender: reply.name,
          senderType: reply.type,
          content: reply.content,
          timestamp: reply.created,
          staff: reply.staff,
          closedAs: reply.action
        })),
        notes: ticket.notes,
        tags: ticket.tags
      };
      res.json(transformedTicket);
    } catch (error) {
      console.error('Error fetching ticket:', error);
      res.status(500).json({ error: 'Failed to fetch ticket' });
    }
  });

  // Create a bug report
  app.post('/api/tickets/bug', async (req: Request, res: Response) => {
    if (!req.serverDbConnection || !req.serverName) {
      return res.status(503).json({ error: 'Server database or server name not available' });
    }
    const Ticket = req.serverDbConnection.model('Ticket');
    try {
      const { creatorUuid } = req.body;
      if (!creatorUuid) return res.status(400).json({ error: 'Creator UUID is required' });
      
      const creatorInfo = await getPlayerByUuid(req.serverDbConnection, creatorUuid);
      if (!creatorInfo) return res.status(404).json({ error: 'Creator not found' });
      
      const ticketId = await generateTicketId(req.serverDbConnection, 'bug');
      const newTicket = new Ticket({
        _id: ticketId,
        type: 'bug',
        status: 'Unfinished',
        tags: ['bug'],
        creator: creatorInfo.latestUsername,
        creatorUuid: creatorUuid
      });
      await newTicket.save();
      await createSystemLog(req.serverDbConnection, req.serverName, `Bug report ticket ${ticketId} initialized by ${creatorInfo.latestUsername}`);
      res.status(201).json({ ticketId });
    } catch (error) {
      console.error('Error creating bug report ticket:', error);
      res.status(500).json({ error: 'Failed to create bug report ticket' });
    }
  });

  // Create a player report
  app.post('/api/tickets/player', async (req: Request, res: Response) => {
    if (!req.serverDbConnection || !req.serverName) {
      return res.status(503).json({ error: 'Server database or server name not available' });
    }
    const Ticket = req.serverDbConnection.model('Ticket');
    try {
      const { creatorUuid, reportedPlayerUuid } = req.body;
      if (!creatorUuid) return res.status(400).json({ error: 'Creator UUID is required' });
      if (!reportedPlayerUuid) return res.status(400).json({ error: 'Reported player UUID is required' });

      const creatorInfo = await getPlayerByUuid(req.serverDbConnection, creatorUuid);
      if (!creatorInfo) return res.status(404).json({ error: 'Creator not found' });
      
      const reportedPlayerInfo = await getPlayerByUuid(req.serverDbConnection, reportedPlayerUuid);
      if (!reportedPlayerInfo) return res.status(404).json({ error: 'Reported player not found' });
      
      const ticketId = await generateTicketId(req.serverDbConnection, 'player');
      const newTicket = new Ticket({
        _id: ticketId,
        type: 'player',
        status: 'Unfinished',
        tags: ['player'],
        creator: creatorInfo.latestUsername,
        creatorUuid: creatorUuid,
        reportedPlayer: reportedPlayerInfo.latestUsername,
        reportedPlayerUuid: reportedPlayerUuid
      });
      await newTicket.save();
      await createSystemLog(req.serverDbConnection, req.serverName, `Player report ticket ${ticketId} initialized by ${creatorInfo.latestUsername}`);
      res.status(201).json({ ticketId });
    } catch (error) {
      console.error('Error creating player report ticket:', error);
      res.status(500).json({ error: 'Failed to create player report ticket' });
    }
  });

  // Create a chat report
  app.post('/api/tickets/chat', async (req: Request, res: Response) => {
    if (!req.serverDbConnection || !req.serverName) {
      return res.status(503).json({ error: 'Server database or server name not available' });
    }
    const Ticket = req.serverDbConnection.model('Ticket');
    try {
      const { creatorUuid, reportedPlayerUuid, chatMessages } = req.body;
      if (!creatorUuid) return res.status(400).json({ error: 'Creator UUID is required' });
      if (!reportedPlayerUuid) return res.status(400).json({ error: 'Reported player UUID is required' });
      if (!chatMessages || !Array.isArray(chatMessages) || chatMessages.length === 0) {
        return res.status(400).json({ error: 'Chat messages are required' });
      }

      const creatorInfo = await getPlayerByUuid(req.serverDbConnection, creatorUuid);
      if (!creatorInfo) return res.status(404).json({ error: 'Creator not found' });

      const reportedPlayerInfo = await getPlayerByUuid(req.serverDbConnection, reportedPlayerUuid);
      if (!reportedPlayerInfo) return res.status(404).json({ error: 'Reported player not found' });
      
      const ticketId = await generateTicketId(req.serverDbConnection, 'chat');
      const newTicket = new Ticket({
        _id: ticketId,
        type: 'chat',
        status: 'Unfinished',
        tags: ['chat'],
        creator: creatorInfo.latestUsername,
        creatorUuid: creatorUuid,
        reportedPlayer: reportedPlayerInfo.latestUsername,
        reportedPlayerUuid: reportedPlayerUuid,
        chatMessages: chatMessages
      });
      await newTicket.save();
      await createSystemLog(req.serverDbConnection, req.serverName, `Chat report ticket ${ticketId} initialized by ${creatorInfo.latestUsername}`);
      res.status(201).json({ ticketId });
    } catch (error) {
      console.error('Error creating chat report ticket:', error);
      res.status(500).json({ error: 'Failed to create chat report ticket' });
    }
  });

  // Create a staff application
  app.post('/api/tickets/staff', async (req: Request, res: Response) => {
    if (!req.serverDbConnection || !req.serverName) {
      return res.status(503).json({ error: 'Server database or server name not available' });
    }
    const Ticket = req.serverDbConnection.model('Ticket');
    try {
      const { creatorUuid } = req.body;
      if (!creatorUuid) return res.status(400).json({ error: 'Creator UUID is required' });

      const creatorInfo = await getPlayerByUuid(req.serverDbConnection, creatorUuid);
      if (!creatorInfo) return res.status(404).json({ error: 'Creator not found' });
      
      const ticketId = await generateTicketId(req.serverDbConnection, 'staff');
      const newTicket = new Ticket({
        _id: ticketId,
        type: 'staff',
        status: 'Unfinished',
        tags: ['staff'],
        creator: creatorInfo.latestUsername,
        creatorUuid: creatorUuid
      });
      await newTicket.save();
      await createSystemLog(req.serverDbConnection, req.serverName, `Staff application ticket ${ticketId} initialized by ${creatorInfo.latestUsername}`);
      res.status(201).json({ ticketId });
    } catch (error) {
      console.error('Error creating staff application ticket:', error);
      res.status(500).json({ error: 'Failed to create staff application ticket' });
    }
  });

  // Create a general support ticket
  app.post('/api/tickets/support', async (req: Request, res: Response) => {
    if (!req.serverDbConnection || !req.serverName) {
      return res.status(503).json({ error: 'Server database or server name not available' });
    }
    const Ticket = req.serverDbConnection.model('Ticket');
    try {
      const { creatorUuid } = req.body;
      if (!creatorUuid) return res.status(400).json({ error: 'Creator UUID is required' });

      const creatorInfo = await getPlayerByUuid(req.serverDbConnection, creatorUuid);
      if (!creatorInfo) return res.status(404).json({ error: 'Creator not found' });
      
      const ticketId = await generateTicketId(req.serverDbConnection, 'support');
      const newTicket = new Ticket({
        _id: ticketId,
        type: 'support',
        status: 'Unfinished',
        tags: ['support'],
        creator: creatorInfo.latestUsername,
        creatorUuid: creatorUuid
      });
      await newTicket.save();
      await createSystemLog(req.serverDbConnection, req.serverName, `Support ticket ${ticketId} initialized by ${creatorInfo.latestUsername}`);
      res.status(201).json({ ticketId });
    } catch (error) {
      console.error('Error creating support ticket:', error);
      res.status(500).json({ error: 'Failed to create support ticket' });
    }
  });
  
  // Submit form data for an unfinished ticket and make it active
  app.post('/api/tickets/:id/submit', async (req: Request, res: Response) => {
    if (!req.serverDbConnection || !req.serverName) {
      return res.status(503).json({ error: 'Server database or server name not available' });
    }
    const Ticket = req.serverDbConnection.model('Ticket');
    try {
      const { id } = req.params;
      const { subject, formData } = req.body;
      if (!subject || !formData) return res.status(400).json({ error: 'Subject and form data are required' });

      const ticket = await Ticket.findById(id);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
      if (ticket.status !== 'Unfinished') return res.status(400).json({ error: 'Only unfinished tickets can be submitted' });

      let contentString = '';
      Object.entries(formData).forEach(([key, value]) => {
        contentString += `${key}: ${value}\n\n`;
      });
      
      const initialMessage: IReply = {
        name: ticket.creator,
        content: contentString,
        type: 'player',
        created: new Date(),
        staff: false
      };
      
      const updatedTicket = await Ticket.findByIdAndUpdate(
        id,
        {
          $set: {
            status: 'Open',
            subject: subject,
            formData: formData
          },
          $push: { replies: initialMessage }
        },
        { new: true }
      );
      await createSystemLog(req.serverDbConnection, req.serverName, `Ticket ${id} submitted by ${ticket.creator}`);
      res.json({ 
        success: true, 
        ticketId: id,
        ticket: updatedTicket
      });
    } catch (error) {
      console.error('Error submitting ticket form:', error);
      res.status(500).json({ error: 'Failed to submit ticket form' });
    }
  });

  // Update ticket
  app.patch('/api/tickets/:id', async (req: Request, res: Response) => {
    if (!req.serverDbConnection || !req.serverName) {
      return res.status(503).json({ error: 'Server database or server name not available' });
    }
    const Ticket = req.serverDbConnection.model('Ticket');
    try {
      const id = req.params.id;
      const ticketToUpdate = await Ticket.findById(id); // Fetch first to ensure it exists
      if (!ticketToUpdate) return res.status(404).json({ error: 'Ticket not found' });

      const updateOperations: any = { $set: {}, $push: {} };

      if (req.body.newReply) {
        const reply: IReply = req.body.newReply;
        if (reply.type === 'staff') reply.staff = true;
        
        if (!updateOperations.$push.replies) updateOperations.$push.replies = [];
        updateOperations.$push.replies.push(reply);

        if (reply.action) {
          const closingActions = ['Accepted', 'Completed', 'Pardon', 'Reduce', 'Rejected', 'Stale', 'Duplicate', 'Reject', 'Close'];
          const reopenAction = 'Reopen';
          if (closingActions.includes(reply.action)) {
            updateOperations.$set.status = (reply.action === 'Accepted' || reply.action === 'Completed' || reply.action === 'Pardon' || reply.action === 'Reduce') 
                                          ? 'Resolved' : 'Closed';
            updateOperations.$set.locked = true;
          } else if (reply.action === reopenAction) {
            updateOperations.$set.status = 'Open';
            updateOperations.$set.locked = false;
          }
        }
      }
      
      if (req.body.newNote) {
        const note = {
          content: req.body.newNote.content,
          author: req.body.newNote.author,
          date: new Date()
        };
        if (!updateOperations.$push.notes) updateOperations.$push.notes = [];
        updateOperations.$push.notes.push(note);
      }
      
      if (req.body.status) updateOperations.$set.status = req.body.status;
      if (req.body.locked !== undefined) updateOperations.$set.locked = req.body.locked;
      if (req.body.tags) updateOperations.$set.tags = req.body.tags;
      if (req.body.priority) updateOperations.$set['data.priority'] = req.body.priority;
      if (req.body.assignedTo) updateOperations.$set['data.assignedTo'] = req.body.assignedTo;

      if (Object.keys(updateOperations.$set).length === 0) delete updateOperations.$set;
      if (Object.keys(updateOperations.$push).length === 0) delete updateOperations.$push;
      
      if (Object.keys(updateOperations).length === 0 || (Object.keys(updateOperations).length === 2 && !updateOperations.$set && !updateOperations.$push) ) {
        return res.json(ticketToUpdate);
      }

      const updatedTicket = await Ticket.findByIdAndUpdate(id, updateOperations, { new: true });
      if (!updatedTicket) return res.status(404).json({ error: 'Ticket not found during update' });

      await createSystemLog(req.serverDbConnection, req.serverName, `Ticket ${id} updated`);
      res.json(updatedTicket);
    } catch (error) {
      console.error('Error updating ticket:', error);
      res.status(500).json({ error: 'Failed to update ticket' });
    }
  });
}

// Appeal routes (appeals are a special type of ticket)
export function setupAppealRoutes(app: Express) {
  app.get('/api/appeals', async (req: Request, res: Response) => {
    if (!req.serverDbConnection) {
      return res.status(503).json({ error: 'Server database not available' });
    }
    const Ticket = req.serverDbConnection.model('Ticket'); // Appeals use the Ticket model
    try {
      const appeals = await Ticket.find({ type: 'appeal' }); // Query by type: 'appeal'
      const transformedAppeals = appeals.map((appeal: any) => ({
        id: appeal._id,
        banId: appeal.data?.get('punishmentId') as string, 
        submittedOn: appeal.created,
        status: appeal.data?.get('status') as string || 'Pending Review',
        lastUpdate: appeal.replies && appeal.replies.length > 0 
          ? appeal.replies[appeal.replies.length - 1].created 
          : appeal.created,
        messages: appeal.replies
      }));
      res.json(transformedAppeals);
    } catch (error) {
      console.error('Error fetching appeals:', error);
      res.status(500).json({ error: 'Failed to fetch appeals' });
    }
  });

  app.get('/api/appeals/:id', async (req: Request, res: Response) => {
    if (!req.serverDbConnection) {
      return res.status(503).json({ error: 'Server database not available' });
    }
    const Ticket = req.serverDbConnection.model('Ticket');
    try {
      const id = req.params.id;
      const appeal = await Ticket.findById(id);
      if (!appeal || appeal.type !== 'appeal') {
        return res.status(404).json({ error: 'Appeal not found or ticket is not an appeal' });
      }

      const transformedAppeal = {
        id: appeal._id,
        banId: appeal.data?.get('punishmentId') as string,
        submittedOn: appeal.created,
        status: appeal.data?.get('status') as string || 'Pending Review',
        lastUpdate: appeal.replies && appeal.replies.length > 0 
          ? appeal.replies[appeal.replies.length - 1].created 
          : appeal.created,
        messages: appeal.replies.filter((reply: IReply) => !reply.staff)
      };
      res.json(transformedAppeal);
    } catch (error) {
      console.error('Error fetching appeal:', error);
      res.status(500).json({ error: 'Failed to fetch appeal' });
    }
  });

  app.get('/api/appeals/punishment/:id', async (req: Request, res: Response) => {
    if (!req.serverDbConnection) {
      return res.status(503).json({ error: 'Server database not available' });
    }
    const Ticket = req.serverDbConnection.model('Ticket');
    try {
      const punishmentId = req.params.id;
      const appeals = await Ticket.find({ 
        type: 'appeal',
        'data.punishmentId': punishmentId 
      });
      const transformedAppeals = appeals.map((appeal: any) => ({
        id: appeal._id,
        banId: punishmentId,
        submittedOn: appeal.created,
        status: appeal.data?.get('status') as string || 'Pending Review',
        lastUpdate: appeal.replies && appeal.replies.length > 0 
          ? appeal.replies[appeal.replies.length - 1].created 
          : appeal.created
      }));
      res.json(transformedAppeals);
    } catch (error) {
      console.error('Error fetching appeals for punishment:', error);
      res.status(500).json({ error: 'Failed to fetch appeals' });
    }
  });

  app.post('/api/appeals', async (req: Request, res: Response) => {
    if (!req.serverDbConnection || !req.serverName) {
      return res.status(503).json({ error: 'Server database or server name not available' });
    }
    const Ticket = req.serverDbConnection.model('Ticket');
    const Player = req.serverDbConnection.model('Player');
    try {
      const ticketId = await generateTicketId(req.serverDbConnection, 'appeal');
      const appealData = {
        _id: ticketId,
        tags: ['appeal', ...(req.body.tags || [])],
        type: 'appeal',
        status: 'Open',
        created: new Date(),
        creator: req.body.username,
        creatorUuid: req.body.playerUuid,
        subject: req.body.subject || `Appeal for ${req.body.username}`,
        replies: [
          {
            name: req.body.username,
            content: req.body.content,
            type: 'player',
            created: new Date(),
            staff: false
          }
        ],
        notes: [],
        data: new Map([
          ['status', 'Pending Review'],
          ['punishmentId', req.body.punishmentId],
          ['playerUuid', req.body.playerUuid],
          ['email', req.body.email]
        ])
      };
      
      const newAppeal = new Ticket(appealData);
      await newAppeal.save();
      
      // Link appeal to punishment on the Player document
      if (req.body.playerUuid && req.body.punishmentId) {
        await Player.updateOne(
          { 
            minecraftUuid: req.body.playerUuid,
            'punishments.id': req.body.punishmentId
          },
          { 
            $push: { 'punishments.$.attachedTicketIds': newAppeal._id } 
          }
        );
      }
      
      await createSystemLog(req.serverDbConnection, req.serverName, `Appeal ${newAppeal._id} submitted for punishment ${req.body.punishmentId || 'N/A'}`);
      res.status(201).json(newAppeal);
    } catch (error) {
      console.error('Error creating appeal:', error);
      res.status(500).json({ error: 'Failed to create appeal' });
    }
  });

  app.post('/api/appeals/:id/reply', async (req: Request, res: Response) => {
    if (!req.serverDbConnection || !req.serverName) {
      return res.status(503).json({ error: 'Server database or server name not available' });
    }
    const Ticket = req.serverDbConnection.model('Ticket');
    try {
      const id = req.params.id;
      const replyContent: IReply = {
        name: req.body.name,
        content: req.body.content,
        type: req.body.type || 'player',
        created: new Date(),
        staff: req.body.staff || false,
        action: req.body.action 
      };
      
      const updatePayload: any = { $push: { replies: replyContent }, $set: {} };
      let appealToUpdate = await Ticket.findById(id);
      if (!appealToUpdate || appealToUpdate.type !== 'appeal') {
        return res.status(404).json({ error: 'Appeal not found or ticket is not an appeal' });
      }

      if (replyContent.action) {
        const closingActions = ['Accepted', 'Completed', 'Pardon', 'Reduce', 'Rejected', 'Stale', 'Duplicate', 'Reject', 'Close'];
        const reopenAction = 'Reopen';
        let newStatus = appealToUpdate.status;
        let newLocked = appealToUpdate.locked;
        let newDataStatus = appealToUpdate.data.get('status');

        if (closingActions.includes(replyContent.action)) {
          newStatus = (replyContent.action === 'Accepted' || replyContent.action === 'Completed' || replyContent.action === 'Pardon' || replyContent.action === 'Reduce') 
                      ? 'Resolved' : 'Closed';
          newLocked = true;
          newDataStatus = newStatus; 
        } else if (replyContent.action === reopenAction) {
          newStatus = 'Open';
          newLocked = false;
          newDataStatus = 'Open';
        }
        updatePayload.$set.status = newStatus;
        updatePayload.$set.locked = newLocked;
        updatePayload.$set['data.status'] = newDataStatus;
      }
      if (Object.keys(updatePayload.$set).length === 0) delete updatePayload.$set;

      const appeal = await Ticket.findByIdAndUpdate(id, updatePayload, { new: true });
      if (!appeal) return res.status(404).json({ error: 'Appeal not found during reply update' });
      
      await createSystemLog(req.serverDbConnection, req.serverName, `Reply added to appeal ${id}`);
      res.json(appeal);
    } catch (error) {
      console.error('Error adding reply to appeal:', error);
      res.status(500).json({ error: 'Failed to add reply' });
    }
  });

  app.patch('/api/appeals/:id/status', async (req: Request, res: Response) => {
    if (!req.serverDbConnection || !req.serverName) {
      return res.status(503).json({ error: 'Server database or server name not available' });
    }
    const Ticket = req.serverDbConnection.model('Ticket');
    try {
      const id = req.params.id;
      const status = req.body.status;
      
      const appeal = await Ticket.findById(id);
      if (!appeal || appeal.type !== 'appeal') {
        return res.status(404).json({ error: 'Appeal not found or ticket is not an appeal' });
      }

      const systemMessage: IReply = {
        name: 'System',
        content: `Appeal status changed to ${status}`,
        type: 'system',
        created: new Date(),
        staff: false
      };

      const updatedAppeal = await Ticket.findByIdAndUpdate(
        id,
        {
          $set: {
            status: status,
            'data.status': status
          },
          $push: { replies: systemMessage }
        },
        { new: true }
      );

      if (!updatedAppeal) return res.status(404).json({ error: 'Appeal not found during status update' });
      
      await createSystemLog(req.serverDbConnection, req.serverName, `Appeal ${id} status changed to ${status}`);
      res.json(updatedAppeal);
    } catch (error) {
      console.error('Error updating appeal status:', error);
      res.status(500).json({ error: 'Failed to update appeal status' });
    }
  });
}

export function setupApiRoutes(app: Express) {
  setupPlayerRoutes(app);
  setupTicketRoutes(app);
  setupAppealRoutes(app);
}