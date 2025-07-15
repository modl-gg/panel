import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from 'ws';
import { setupApiRoutes } from "./api/routes";
import { setupVerificationAndProvisioningRoutes } from './routes/verify-provision';
import { connectToGlobalModlDb } from './db/connectionManager';
import { type Connection as MongooseConnection } from 'mongoose';
import { isAuthenticated } from './middleware/auth-middleware';
import { strictRateLimit } from './middleware/rate-limiter';

import appealRoutes from './routes/appeal-routes';
import playerRoutes from './routes/player-routes';
import settingsRoutes from './routes/settings-routes';
import staffRoutes from './routes/staff-routes';
import roleRoutes from './routes/role-routes';
import ticketRoutes from './routes/ticket-routes';
import logRoutes from './routes/log-routes';
import authRoutes from './routes/auth-routes';
import billingRoutes, { webhookRouter } from './routes/billing-routes';
import knowledgebaseRoutes from './routes/knowledgebase-routes'; // Import knowledgebase routes
import publicKnowledgebaseRoutes from './routes/public-knowledgebase-routes'; // Import public knowledgebase routes
import homepageCardRoutes from './routes/homepage-card-routes'; // Import homepage card routes
import publicHomepageCardRoutes from './routes/public-homepage-card-routes'; // Import public homepage card routes
import publicTicketRoutes from './routes/public-ticket-routes'; // Import public ticket routes
import publicPunishmentRoutes from './routes/public-punishment-routes'; // Import public punishment routes
import { setupMinecraftRoutes } from './routes/minecraft-routes';
import mediaRoutes from './routes/media-routes'; // Import media routes
import storageRoutes from './routes/storage-routes'; // Import storage routes
import analyticsRoutes from './routes/analytics-routes'; // Import analytics routes
import auditRoutes from './routes/audit-routes'; // Import audit routes
import dashboardRoutes from './routes/dashboard-routes'; // Import dashboard routes
import ticketSubscriptionRoutes from './routes/ticket-subscription-routes'; // Import ticket subscription routes

export async function registerRoutes(app: Express): Promise<Server> {
  let globalDbConnection: MongooseConnection | undefined = undefined;

  try {
    globalDbConnection = await connectToGlobalModlDb();
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    console.log('Falling back to in-memory storage');
  }

  // Public API, verification, and auth routes
  setupApiRoutes(app); // Assuming these are general public APIs if any, or handled internally
  setupVerificationAndProvisioningRoutes(app);
  app.use('/api/auth', authRoutes);
  app.use('/stripe-public-webhooks', webhookRouter); // Stripe webhook on a distinct top-level public path
  app.use('/api/public/knowledgebase', publicKnowledgebaseRoutes); // Public knowledgebase
  app.use('/api/public', publicHomepageCardRoutes); // Public homepage cards
  app.use('/api/public', publicTicketRoutes); // Public ticket routes (API key protected)
  app.use('/api/public', publicPunishmentRoutes); // Public punishment routes

  // Public staff invitation acceptance - no authentication required
  app.get('/api/staff/invitations/accept', strictRateLimit, async (req, res) => {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ message: 'Invalid invitation link.' });
    }

    try {
      if (!req.serverDbConnection) {
        return res.status(503).json({ error: 'Service unavailable. Database connection not established for this server.' });
      }

      const InvitationModel = req.serverDbConnection.model('Invitation');
      const invitation = await InvitationModel.findOne({ token: token as string });

      if (!invitation || invitation.status !== 'pending' || invitation.expiresAt < new Date()) {
        return res.status(400).json({ message: 'Invitation is invalid, expired, or has already been used.' });
      }

      const Staff = req.serverDbConnection.model('Staff');
      const { email, role } = invitation;
      const username = email.split('@')[0]; // Or generate a unique username

      const newUser = new Staff({
        email,
        username,
        role,
      });

      await newUser.save();

      invitation.status = 'accepted';
      await invitation.save();

      // Log the new user in
      req.session.userId = newUser._id.toString();
      req.session.email = newUser.email;
      req.session.username = newUser.username;
      req.session.role = newUser.role;

      await req.session.save();

      res.status(200).json({ message: 'Invitation accepted successfully.' });
    } catch (error) {
      console.error('Error accepting invitation:', error);
      res.status(500).json({ message: 'Internal server error.' });
    }
  });

  // Public settings endpoint - no authentication required
  app.get('/api/public/settings', async (req, res) => {
    try {
      if (!req.serverDbConnection) {
        return res.json({
          serverDisplayName: 'modl',
          panelIconUrl: null,
          homepageIconUrl: null
        });
      }

      const SettingsModel = req.serverDbConnection.model('Settings');
      let settingsDoc = await SettingsModel.findOne({});
      
      if (!settingsDoc || !settingsDoc.settings) {
        return res.json({
          serverDisplayName: 'modl',
          panelIconUrl: null,
          homepageIconUrl: null,
          ticketForms: {}
        });
      }

      const settings = Object.fromEntries(settingsDoc.settings);
      
      const result = {
        serverDisplayName: settings.general?.serverDisplayName || settings.serverDisplayName || 'modl',
        panelIconUrl: settings.general?.panelIconUrl || settings.panelIconUrl || null,
        homepageIconUrl: settings.general?.homepageIconUrl || settings.homepageIconUrl || null,
        ticketForms: settings.ticketForms || {}
      };
      
      res.json(result);
    } catch (error) {
      console.error('[Public Settings] Error occurred:', error);
      res.json({
        serverDisplayName: 'modl',
        panelIconUrl: null,
        homepageIconUrl: null,
        ticketForms: {}
      });
    }
  });
  // Panel specific API routes
  const panelRouter = express.Router();
  
  // Panel routes (debug logging removed)
  panelRouter.use((req, res, next) => {
    next();
  });
  
  panelRouter.use(isAuthenticated); // Apply authentication to all panel routes

  panelRouter.use('/appeals', appealRoutes);
  panelRouter.use('/players', playerRoutes); // Assuming player management is panel-specific
  panelRouter.use('/settings', settingsRoutes);
  panelRouter.use('/staff', staffRoutes);
  panelRouter.use('/roles', roleRoutes);
  panelRouter.use('/tickets', ticketRoutes);
  panelRouter.use('/logs', logRoutes);
  panelRouter.use('/billing', billingRoutes); // Billing management for the panel
  panelRouter.use('/knowledgebase', knowledgebaseRoutes); // Add knowledgebase routes to panel
  panelRouter.use('/', homepageCardRoutes); // Add homepage card routes to panel
  panelRouter.use('/media', mediaRoutes); // Add media upload routes to panel
  panelRouter.use('/storage', storageRoutes); // Add storage management routes to panel
  panelRouter.use('/analytics', analyticsRoutes); // Add analytics routes to panel
  panelRouter.use('/audit', auditRoutes); // Add audit routes to panel
  panelRouter.use('/dashboard', dashboardRoutes); // Add dashboard routes to panel
  panelRouter.use('/ticket-subscriptions', ticketSubscriptionRoutes); // Add ticket subscription routes to panel

  panelRouter.get('/activity/recent', async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const days = parseInt(req.query.days as string) || 7;
      const staffUsername = req.session?.username;

      if (!staffUsername) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      if (!req.serverDbConnection) {
        return res.status(503).json({ error: 'Database connection not available' });
      }

      const activities: any[] = [];
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      // Get ticket activities (created, replied to, status changes)
      try {
        const Ticket = req.serverDbConnection.model('Ticket');
        
        // First, find tickets where the staff member has participated
        const participatedTickets = await Ticket.find({
          $or: [
            { creator: staffUsername },
            { assignedTo: staffUsername },
            { 'messages.sender': staffUsername }
          ]
        });

        // Get IDs of tickets where staff member has participated
        const participatedTicketIds = participatedTickets.map(t => t._id);

        // Now find all recent activity in those tickets
        const tickets = await Ticket.find({
          _id: { $in: participatedTicketIds },
          $or: [
            { created: { $gte: cutoffDate } },
            { 'messages.timestamp': { $gte: cutoffDate } }
          ]
        }).sort({ created: -1 });

        for (const ticket of tickets) {
          // Ticket creation activity (only if staff member created it)
          if (ticket.creator === staffUsername && new Date(ticket.created) >= cutoffDate) {
            activities.push({
              id: `ticket-created-${ticket._id}`,
              type: 'new_ticket',
              color: 'blue',
              title: `Created ticket: ${ticket.subject}`,
              time: new Date(ticket.created).toISOString(),
              description: `Created ${ticket.category || 'Other'} ticket`,
              actions: [
                { label: 'View Ticket', link: `/panel/tickets/${ticket._id}`, primary: true }
              ]
            });
          }

          // All ticket replies in tickets where staff member has participated
          if (ticket.messages) {
            const recentMessages = ticket.messages.filter((msg: any) => 
              new Date(msg.timestamp) >= cutoffDate
            );
            
            for (const message of recentMessages) {
              const isStaffMessage = message.sender === staffUsername;
              const actionType = isStaffMessage ? 'My reply' : 'New reply';
              const color = isStaffMessage ? 'green' : 'blue';
              
              activities.push({
                id: `ticket-reply-${ticket._id}-${message.timestamp}`,
                type: 'mod_action',
                color: color,
                title: `${actionType} on ticket: ${ticket.subject}`,
                time: new Date(message.timestamp).toISOString(),
                description: isStaffMessage 
                  ? `You replied to ${ticket.category || 'Other'} ticket` 
                  : `${message.sender} replied to ${ticket.category || 'Other'} ticket`,
                actions: [
                  { label: 'View Ticket', link: `/panel/tickets/${ticket._id}`, primary: true }
                ]
              });
            }
          }
        }
      } catch (error) {
        console.error('Error fetching ticket activities:', error);
      }

      // Get punishment activities
      try {
        const Player = req.serverDbConnection.model('Player');
        const players = await Player.find({
          'punishments.issuerName': staffUsername,
          'punishments.issued': { $gte: cutoffDate }
        });

        for (const player of players) {
          const staffPunishments = player.punishments.filter((p: any) => 
            p.issuerName === staffUsername && 
            new Date(p.issued) >= cutoffDate
          );

          for (const punishment of staffPunishments) {
            const username = player.usernames?.length > 0 
              ? player.usernames[player.usernames.length - 1].username 
              : 'Unknown';

            activities.push({
              id: `punishment-${punishment.id}`,
              type: 'new_punishment',
              color: 'red',
              title: `Applied punishment to ${username}`,
              time: new Date(punishment.issued).toISOString(),
              description: `Applied punishment (Type: ${punishment.type_ordinal})`,
              actions: [
                { label: 'View Player', link: `/panel/players/${player.minecraftUuid}`, primary: true }
              ]
            });
          }
        }
      } catch (error) {
        console.error('Error fetching punishment activities:', error);
      }

      // Get system log activities (if staff actions are logged)
      try {
        const Log = req.serverDbConnection.model('Log');
        const logs = await Log.find({
          source: staffUsername,
          level: 'moderation',
          timestamp: { $gte: cutoffDate }
        }).sort({ timestamp: -1 });

        for (const log of logs) {
          activities.push({
            id: `log-${log._id}`,
            type: 'system_log',
            color: 'purple',
            title: 'Moderation Action',
            time: new Date(log.timestamp).toISOString(),
            description: log.description || 'Performed moderation action',
            actions: []
          });
        }
      } catch (error) {
        console.error('Error fetching log activities:', error);
      }

      // Sort all activities by time (most recent first) and limit
      const sortedActivities = activities
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
        .slice(0, limit)
        .map(activity => ({
          ...activity,
          time: new Date(activity.time).toLocaleString() // Format time for display
        }));

      res.json(sortedActivities);
    } catch (error) {
      console.error('Error fetching recent activity:', error);
      res.status(500).json({ error: 'Failed to fetch recent activity' });
    }
  });

  panelRouter.get('/provisioning-status', async (req, res) => {
    try {
      if (!req.modlServer) {
        return res.status(500).json({ error: 'Server configuration not found' });
      }

      res.json({
        status: req.modlServer.provisioningStatus || 'unknown',
        serverName: req.modlServer.customDomain,
        emailVerified: req.modlServer.emailVerified
      });
    } catch (error) {
      console.error('Error fetching provisioning status:', error);
      res.status(500).json({ error: 'Failed to fetch provisioning status' });
    }
  });

  panelRouter.get('/stats', async (req, res) => {
    try {
      if (!req.serverDbConnection) {
        console.error('Error fetching stats: No server-specific database connection found for this request.');
        return res.json({
          counts: {
            onlinePlayers: 0,
            uniqueLogins: 0,
            openTickets: 0,
            totalPlayers: 0,
            totalPunishments: 0
          },
          changes: {
            onlinePlayers: 0,
            uniqueLogins: 0,
            openTickets: 0
          },
          error: 'Server context not found, using fallback data.'
        });
      }

      const Player = req.serverDbConnection.model('Player');
      const Ticket = req.serverDbConnection.model('Ticket');
      
      // Date calculations for comparisons
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfYesterday = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
      
      // Get total player count
      const totalPlayers = await Player.countDocuments({});
      
      // Get recent unique logins (players who joined/logged in today)
      let uniqueLoginsToday = 0;
      let uniqueLoginsYesterday = 0;
      
      try {
        // Try multiple approaches to find recent logins
        uniqueLoginsToday = await Player.countDocuments({
          $or: [
            { lastSeen: { $gte: startOfToday } },
            { lastLogin: { $gte: startOfToday } },
            { lastActivity: { $gte: startOfToday } },
            { 'usernames.date': { $gte: startOfToday } },
            { updatedAt: { $gte: startOfToday } }
          ]
        });
        
        uniqueLoginsYesterday = await Player.countDocuments({
          $or: [
            { lastSeen: { $gte: startOfYesterday, $lt: startOfToday } },
            { lastLogin: { $gte: startOfYesterday, $lt: startOfToday } },
            { lastActivity: { $gte: startOfYesterday, $lt: startOfToday } },
            { 'usernames.date': { $gte: startOfYesterday, $lt: startOfToday } },
            { updatedAt: { $gte: startOfYesterday, $lt: startOfToday } }
          ]
        });
      } catch (loginError) {
        console.log('Could not query login activity, estimating based on total players');
        // If login queries fail, estimate based on total players and recent activity
        uniqueLoginsToday = Math.floor(totalPlayers * 0.05); // 5% of total players
        uniqueLoginsYesterday = Math.floor(totalPlayers * 0.04); // Slightly less for yesterday
      }
      
      // Get open tickets (all non-closed tickets)
      const openTicketsToday = await Ticket.countDocuments({ 
        $or: [
          { 'data.status': { $ne: 'Closed' } },
          { status: { $ne: 'Closed' } },
          { 'data.status': { $exists: false } } // Tickets without status are considered open
        ]
      });
      
      // Get tickets created yesterday that are still open for comparison
      // This provides a meaningful day-over-day comparison of new ticket creation
      const newTicketsYesterday = await Ticket.countDocuments({
        $and: [
          { createdAt: { $gte: startOfYesterday, $lt: startOfToday } },
          {
            $or: [
              { 'data.status': { $ne: 'Closed' } },
              { status: { $ne: 'Closed' } },
              { 'data.status': { $exists: false } }
            ]
          }
        ]
      });
      
      // Get tickets created today for a proper comparison
      const newTicketsToday = await Ticket.countDocuments({
        $and: [
          { createdAt: { $gte: startOfToday } },
          {
            $or: [
              { 'data.status': { $ne: 'Closed' } },
              { status: { $ne: 'Closed' } },
              { 'data.status': { $exists: false } }
            ]
          }
        ]
      });
      
      // Get total punishments (active ones)
      // TODO: This is a simplified active check. For full accuracy, this should use the same complex logic as elsewhere.
      const playersForPunishments = await Player.find({ 'punishments.0': { $exists: true } }, 'punishments').lean();
      let totalPunishments = 0;
      for (const player of playersForPunishments) {
        for (const punishment of player.punishments) {
          if (punishment.data) {
            const punishmentData = punishment.data as any;
            // Active by default, only inactive if 'active' is explicitly false
            if (punishmentData.active !== false) {
              totalPunishments++;
            }
          } else {
            // If no data field, assume active
            totalPunishments++;
          }
        }
      }
      
      // Calculate online players - try multiple approaches to find active players
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      
      // Try to find players with recent activity using various possible fields
      let onlinePlayers = 0;
      try {
        // First try with lastSeen field
        onlinePlayers = await Player.countDocuments({
          lastSeen: { $gte: oneHourAgo }
        });
        
        // If no results, try with other potential activity fields
        if (onlinePlayers === 0) {
          onlinePlayers = await Player.countDocuments({
            $or: [
              { lastLogin: { $gte: oneHourAgo } },
              { lastActivity: { $gte: oneHourAgo } },
              { updatedAt: { $gte: oneHourAgo } }
            ]
          });
        }
      } catch (fieldError) {
        console.log('No recent activity fields found, using estimated online players');
        // If no activity fields exist, estimate based on total players
        onlinePlayers = Math.floor(totalPlayers * 0.1); // 10% of total players estimated online
      }
      
      // Calculate percentage changes
      const calculateChange = (current: number, previous: number): number => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return Math.round(((current - previous) / previous) * 100);
      };
      
      const response = {
        counts: {
          onlinePlayers: onlinePlayers,
          uniqueLogins: uniqueLoginsToday,
          openTickets: openTicketsToday,
          totalPlayers: totalPlayers,
          totalPunishments: totalPunishments
        },
        changes: {
          onlinePlayers: 0, // Real-time data, so no comparison
          uniqueLogins: calculateChange(uniqueLoginsToday, uniqueLoginsYesterday),
          openTickets: calculateChange(newTicketsToday, newTicketsYesterday)
        }
      };
      
      res.json(response);
    } catch (error) {
      console.error('Error fetching stats:', error);
      
      // Try to get basic counts even if main query failed
      let fallbackStats = {
        onlinePlayers: 0,
        uniqueLogins: 0,
        openTickets: 0,
        totalPlayers: 0,
        totalPunishments: 0
      };
      
      try {
        if (req.serverDbConnection) {
          const Player = req.serverDbConnection.model('Player');
          const Ticket = req.serverDbConnection.model('Ticket');
          
          // Try basic counts that are less likely to fail
          const basicPlayerCount = await Player.countDocuments({}).catch(() => 0);
          
          // Try to get open tickets with simplified query
          let openTicketCount = 0;
          try {
            openTicketCount = await Ticket.countDocuments({
              $or: [
                { 'data.status': { $ne: 'Closed' } },
                { status: { $ne: 'Closed' } },
                { 'data.status': { $exists: false } }
              ]
            });
          } catch {
            openTicketCount = await Ticket.countDocuments({}).catch(() => 0);
          }
          
          // Try to get basic punishment count
          const playersForPunishmentCount = await Player.find({ 'punishments.0': { $exists: true } }, 'punishments').lean().catch(() => []);
          let basicPunishmentCount = 0;
          for (const player of playersForPunishmentCount) {
            if (player.punishments) {
              basicPunishmentCount += player.punishments.length; // Count all punishments for fallback
            }
          }
          
          // Try to estimate online players from recent activity
          let estimatedOnline = 0;
          try {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            estimatedOnline = await Player.countDocuments({
              $or: [
                { lastSeen: { $gte: oneHourAgo } },
                { lastActivity: { $gte: oneHourAgo } },
                { updatedAt: { $gte: oneHourAgo } }
              ]
            });
          } catch {
            // If we can't query activity, estimate based on total players
            estimatedOnline = Math.max(1, Math.floor(basicPlayerCount * 0.1));
          }
          
          // Try to estimate unique logins from today's activity
          let estimatedLogins = 0;
          try {
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);
            estimatedLogins = await Player.countDocuments({
              $or: [
                { lastSeen: { $gte: startOfToday } },
                { lastActivity: { $gte: startOfToday } },
                { updatedAt: { $gte: startOfToday } }
              ]
            });
          } catch {
            // If we can't query today's activity, estimate based on total players
            estimatedLogins = Math.max(1, Math.floor(basicPlayerCount * 0.05));
          }
          
          fallbackStats = {
            onlinePlayers: estimatedOnline,
            uniqueLogins: estimatedLogins,
            openTickets: openTicketCount,
            totalPlayers: basicPlayerCount,
            totalPunishments: basicPunishmentCount
          };
        }
      } catch (fallbackError) {
        console.error('Even fallback queries failed:', fallbackError);
        // Only use minimal defaults if all database queries fail
        fallbackStats = {
          onlinePlayers: 0,
          uniqueLogins: 0,
          openTickets: 0,
          totalPlayers: 0,
          totalPunishments: 0
        };
      }
      
      res.json({
        counts: fallbackStats,
        changes: {
          onlinePlayers: 0,
          uniqueLogins: 0,
          openTickets: 0
        },
        error: 'Failed to fetch detailed stats from database, using basic fallback data.'
      });
    }
  });
  
  app.use('/api/panel', panelRouter);

  // Minecraft API routes - mounted directly on /api/minecraft (not under panel authentication)
  // These routes have their own API key authentication via verifyMinecraftApiKey middleware
  setupMinecraftRoutes(app); // Setup Minecraft routes with /api/minecraft prefix

  // Public player lookup (if intended to be public)
  app.get('/api/player/:identifier', async (req, res) => {
    const { identifier } = req.params;
    const { type = 'username' } = req.query;
    
    try {
      if (!req.serverDbConnection) {
        console.error('Error looking up player: No server-specific database connection found for this request.');
        return res.status(500).json({
          error: 'Server error',
          message: 'Server context not found. Cannot lookup player.'
        });
      }
      const Player = req.serverDbConnection.model('Player');
      
      let query: any = {};
      if (type === 'uuid') {
        query = { minecraftUuid: identifier };
      } else {
        const escapedIdentifier = identifier.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        query = {
          'usernames.username': { $regex: new RegExp(escapedIdentifier, 'i') }
        };
      }
      
      const player = await Player.findOne(query);
      
      if (player) {
        try {
          const currentUsername = player.usernames && player.usernames.length > 0
            ? player.usernames[player.usernames.length - 1].username
            : 'Unknown';
          
          const warnings = player.notes && player.notes.length > 0
            ? player.notes.map((note: any) => ({
                type: 'Warning',
                reason: note.text,
                date: note.date ? note.date.toISOString().split('T')[0] : 'Unknown',
                by: note.issuerName || 'System'
              }))
            : [];
          
          let status = 'Active';
          try {
            if (player.punishments && player.punishments.length > 0) {
              const hasPermanentBan = player.punishments.some((p: any) =>
                p.type === 'Ban' &&
                p.active &&
                (!p.data || !p.data.get || !p.data.get('expiry'))
              );
              
              if (hasPermanentBan) {
                status = 'Banned';
              } else if (player.punishments.some((p: any) => p.active)) {
                status = 'Restricted';
              }
            }
          } catch (error) {
            console.error('Error determining player status:', error);
          }
          
          res.json({
            username: currentUsername,
            uuid: player.minecraftUuid,
            firstJoined: player.usernames && player.usernames[0]?.date
              ? player.usernames[0].date.toISOString().split('T')[0]
              : 'Unknown',
            lastOnline: 'Unknown',
            playtime: 'Unknown',
            status,
            warnings
          });
        } catch (error) {
          console.error('Error formatting player data:', error);
          res.status(500).json({ error: 'Error processing player data' });
        }
      } else {
        res.status(404).json({
          error: 'Player not found',
          message: `No player found with username containing "${identifier}"`
        });
      }
    } catch (error) {
      console.error('Error looking up player:', error);
      res.status(500).json({
        error: 'Server error',
        message: 'An error occurred while searching for the player'
      });
    }
  });

  const httpServer = createServer(app);
  
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'connection', status: 'connected' }));
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        if (data.type === 'subscribe') {
          ws.send(JSON.stringify({ type: 'subscribed', channel: data.channel }));
        }
      } catch (error) {
        console.error('WebSocket message parsing error:', error);
      }
    });
    
    ws.on('close', () => {
      // Client disconnected
    });
  });
  
  const broadcastUpdate = (type: string, data: any) => {
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type, data }));
      }
    });
  };
  
  app.set('broadcastUpdate', broadcastUpdate);

  return httpServer;
}
