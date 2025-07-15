import express from 'express';
import { startOfDay, endOfDay, subDays, subMonths, eachDayOfInterval, format } from 'date-fns';

const router = express.Router();

// Middleware to ensure database connection
router.use((req, res, next) => {
  if (!req.serverDbConnection) {
    return res.status(503).json({ error: 'Database connection not available' });
  }
  next();
});

// Helper function to get punishment types config
async function getPunishmentTypesConfig(db: any) {
  try {
    const Settings = db.model('Settings');
    let punishmentTypes = null;
    
    const punishmentTypesDoc = await Settings.findOne({ type: 'punishmentTypes' });
    if (punishmentTypesDoc?.data) {
      punishmentTypes = typeof punishmentTypesDoc.data === 'string' 
        ? JSON.parse(punishmentTypesDoc.data) 
        : punishmentTypesDoc.data;
    } else {
      const settings = await Settings.findOne({});
      if (settings?.settings?.punishmentTypes) {
        punishmentTypes = typeof settings.settings.punishmentTypes === 'string' 
          ? JSON.parse(settings.settings.punishmentTypes) 
          : settings.settings.punishmentTypes;
      }
    }
    
    return punishmentTypes || [];
  } catch (error) {
    console.warn('Failed to load punishment types from settings:', error.message);
    return [];
  }
}

// Helper function to map punishment type
function mapPunishmentType(type: string, typeOrdinal: number, punishmentTypesConfig: any[]) {
  if (type && type.trim() !== '') {
    return type;
  }
  
  if (typeof typeOrdinal === 'number') {
    const punishmentTypeByOrdinal = punishmentTypesConfig.find(pt => pt.ordinal === typeOrdinal);
    if (punishmentTypeByOrdinal) {
      return punishmentTypeByOrdinal.name;
    }
    
    const punishmentTypeById = punishmentTypesConfig.find(pt => pt.id === typeOrdinal);
    if (punishmentTypeById) {
      return punishmentTypeById.name;
    }
    
    const fallbackMap = {
      0: 'kick',
      1: 'mute', 
      2: 'ban',
      3: 'tempban',
      4: 'warn',
      5: 'blacklist'
    };
    
    if (fallbackMap[typeOrdinal]) {
      return fallbackMap[typeOrdinal];
    }
    
    return `punishment_${typeOrdinal}`;
  }
  
  return 'unknown';
}

// GET /api/panel/dashboard/metrics?period=7d
router.get('/metrics', async (req, res) => {
  try {
    const db = req.serverDbConnection;
    const { period = '7d' } = req.query;
    
    const Player = db.model('Player');
    const Ticket = db.model('Ticket');
    
    let startDate = new Date();
    let dateInterval = 'day';
    
    switch (period) {
      case '7d':
        startDate = subDays(new Date(), 7);
        dateInterval = 'day';
        break;
      case '30d':
        startDate = subDays(new Date(), 30);
        dateInterval = 'day';
        break;
      case '90d':
        startDate = subDays(new Date(), 90);
        dateInterval = 'day';
        break;
      case '1y':
        startDate = subMonths(new Date(), 12);
        dateInterval = 'week';
        break;
    }

    // Generate date range for chart
    const dates = eachDayOfInterval({ start: startDate, end: new Date() });
    const metricsData = [];

    for (const date of dates) {
      const dayStart = startOfDay(date);
      const dayEnd = endOfDay(date);
      
      // Get metrics for this day
      const [
        openTickets,
        newTickets,
        onlinePlayers,
        newPlayers,
        punishmentsIssued
      ] = await Promise.all([
        // Open tickets (tickets that were open at the end of this day)
        Ticket.countDocuments({
          created: { $lte: dayEnd },
          $or: [
            { status: { $in: ['Open', 'Under Review', 'Pending Player Response'] } },
            { 'data.status': { $in: ['Open', 'Under Review', 'Pending Player Response'] } },
            { status: { $exists: false }, 'data.status': { $exists: false } }
          ]
        }),
        
        // New tickets created on this day
        Ticket.countDocuments({
          created: { $gte: dayStart, $lte: dayEnd }
        }),
        
        // Online players (players active on this day)
        Player.countDocuments({
          $or: [
            { lastSeen: { $gte: dayStart, $lte: dayEnd } },
            { lastActivity: { $gte: dayStart, $lte: dayEnd } },
            { updatedAt: { $gte: dayStart, $lte: dayEnd } }
          ]
        }),
        
        // New players (players who joined on this day)
        Player.countDocuments({
          'usernames.date': { $gte: dayStart, $lte: dayEnd }
        }),
        
        // Punishments issued on this day
        Player.countDocuments({
          'punishments.issued': { $gte: dayStart, $lte: dayEnd }
        })
      ]);

      metricsData.push({
        date: format(date, 'yyyy-MM-dd'),
        openTickets,
        onlinePlayers,
        newPlayers,
        punishmentsIssued,
        newTickets
      });
    }

    res.json(metricsData);
  } catch (error) {
    console.error('Dashboard metrics error:', error);
    res.status(500).json({ message: 'Failed to fetch dashboard metrics' });
  }
});

// GET /api/panel/dashboard/recent-tickets?limit=5
router.get('/recent-tickets', async (req, res) => {
  try {
    const db = req.serverDbConnection;
    const { limit = 5 } = req.query;
    
    const Ticket = db.model('Ticket');
    
    const tickets = await Ticket.find({})
      .sort({ created: -1 })
      .limit(parseInt(limit as string))
      .lean();

    const recentTickets = tickets.map(ticket => {
      // Get the initial message from multiple possible sources
      let initialMessage = 'No message available';
      
      // Try messages array first (both old and new format)
      if (ticket.messages && ticket.messages.length > 0) {
        const firstMessage = ticket.messages[0];
        initialMessage = firstMessage.content || 
                        firstMessage.message || 
                        firstMessage.text || 
                        firstMessage.body ||
                        'No message content';
      } 
      // Try replies array (alternative structure)
      else if (ticket.replies && ticket.replies.length > 0) {
        const firstReply = ticket.replies[0];
        initialMessage = firstReply.content || 
                        firstReply.message || 
                        firstReply.text || 
                        firstReply.body ||
                        'No reply content';
      }
      // Try direct description fields
      else if (ticket.description) {
        initialMessage = ticket.description;
      } 
      else if (ticket.data?.description) {
        initialMessage = ticket.data.description;
      }
      // Try data fields that might contain the initial message
      else if (ticket.data?.initialMessage) {
        initialMessage = ticket.data.initialMessage;
      }
      else if (ticket.data?.message) {
        initialMessage = ticket.data.message;
      }
      else if (ticket.content) {
        initialMessage = ticket.content;
      }

      // Truncate to first 30 words and add "..." if longer
      if (initialMessage && initialMessage !== 'No message available') {
        const words = initialMessage.trim().split(/\s+/);
        if (words.length > 30) {
          initialMessage = words.slice(0, 30).join(' ') + '...';
        }
      }

      // Determine status
      let status = ticket.status || ticket.data?.status || 'open';
      if (status === 'Closed') status = 'closed';
      else if (status === 'Under Review') status = 'under_review';
      else if (status === 'Pending Player Response') status = 'pending_player_response';
      else status = 'open';

      // Determine priority
      let priority = ticket.priority || ticket.data?.priority || 'medium';
      priority = priority.toLowerCase();

      return {
        id: ticket._id.toString(),
        title: ticket.subject || ticket.title || 'Untitled Ticket',
        initialMessage: initialMessage, // Already properly truncated above
        status: status as 'open' | 'closed' | 'under_review' | 'pending_player_response',
        priority: priority as 'low' | 'medium' | 'high' | 'urgent',
        createdAt: ticket.created || ticket.createdAt,
        playerName: ticket.creator || ticket.playerName || 'Unknown',
        type: ticket.type || ticket.category || 'general'
      };
    });

    res.json(recentTickets);
  } catch (error) {
    console.error('Recent tickets error:', error);
    res.status(500).json({ message: 'Failed to fetch recent tickets' });
  }
});

// GET /api/panel/dashboard/recent-punishments?limit=10
router.get('/recent-punishments', async (req, res) => {
  try {
    const db = req.serverDbConnection;
    const { limit = 10 } = req.query;
    
    const Player = db.model('Player');
    const punishmentTypesConfig = await getPunishmentTypesConfig(db);
    
    // Find players with recent punishments
    const players = await Player.find({
      'punishments.issued': { $exists: true }
    })
    .sort({ 'punishments.issued': -1 })
    .limit(parseInt(limit as string) * 3) // Get more to filter and sort properly
    .lean();

    const recentPunishments = [];

    for (const player of players) {
      if (!player.punishments) continue;
      
      // Sort punishments by issued date (most recent first)
      const sortedPunishments = player.punishments
        .filter(p => p.issued)
        .sort((a, b) => new Date(b.issued).getTime() - new Date(a.issued).getTime());

      for (const punishment of sortedPunishments.slice(0, 2)) { // Max 2 per player
        const playerName = player.usernames && player.usernames.length > 0
          ? player.usernames[player.usernames.length - 1].username
          : 'Unknown';

        // Determine punishment type
        const type = mapPunishmentType(
          punishment.type, 
          punishment.type_ordinal, 
          punishmentTypesConfig
        ) as 'ban' | 'kick' | 'mute' | 'warn' | 'tempban';

        // Get reason
        let reason = 'No reason provided';
        if (punishment.data?.reason) {
          reason = punishment.data.reason;
        } else if (punishment.reason) {
          reason = punishment.reason;
        }

        // Get duration
        let duration;
        if (punishment.data?.duration) {
          duration = punishment.data.duration;
        } else if (punishment.data?.expiry && punishment.issued) {
          const expiryTime = new Date(punishment.data.expiry).getTime();
          const issuedTime = new Date(punishment.issued).getTime();
          const durationMs = expiryTime - issuedTime;
          
          if (durationMs > 0) {
            const days = Math.floor(durationMs / (1000 * 60 * 60 * 24));
            const hours = Math.floor((durationMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            
            if (days > 0) {
              duration = `${days}d`;
            } else if (hours > 0) {
              duration = `${hours}h`;
            } else {
              duration = '< 1h';
            }
          }
        }

        // Check if punishment is active
        let active = true;
        if (punishment.data?.active !== undefined) {
          active = punishment.data.active;
        } else if (punishment.data?.expiry) {
          active = new Date(punishment.data.expiry) > new Date();
        }

        recentPunishments.push({
          id: punishment.id || punishment._id?.toString() || Math.random().toString(),
          type,
          playerName,
          playerUuid: player.minecraftUuid,
          reason,
          duration,
          issuedBy: punishment.issuerName || 'System',
          issuedAt: punishment.issued,
          active
        });

        if (recentPunishments.length >= parseInt(limit as string)) {
          break;
        }
      }

      if (recentPunishments.length >= parseInt(limit as string)) {
        break;
      }
    }

    // Sort all punishments by issued date and limit
    recentPunishments.sort((a, b) => 
      new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime()
    );

    res.json(recentPunishments.slice(0, parseInt(limit as string)));
  } catch (error) {
    console.error('Recent punishments error:', error);
    res.status(500).json({ message: 'Failed to fetch recent punishments' });
  }
});

export default router;