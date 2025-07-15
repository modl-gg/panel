import express from 'express';
import { format } from 'date-fns';

const router = express.Router();

// Since this router is mounted under `/panel/audit` and the panel router already applies authentication,
// we don't need additional auth middleware here. The isAuthenticated middleware is already applied.

// Middleware to ensure only admins can access audit routes
const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.currentUser || (req.currentUser.role !== 'Admin' && req.currentUser.role !== 'Super Admin')) {
    return res.status(403).json({ message: 'Access denied. Admin privileges required.' });
  }
  next();
};

router.use(requireAdmin);

// Get staff performance analytics
router.get('/staff-performance', async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
    if (!req.serverDbConnection) {
      return res.status(503).json({ error: 'Database connection not available' });
    }
    
    const db = req.serverDbConnection;
    
    // Calculate date range based on period
    const now = new Date();
    let startDate: Date;
    
    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Aggregate staff performance data using mongoose model
    const Log = db.model('Log');
    const staffPerformance = await Log.aggregate([
      {
        $match: {
          created: { $gte: startDate },
          source: { $ne: 'system' }
        }
      },
      {
        $group: {
          _id: '$source',
          totalActions: { $sum: 1 },
          ticketActions: {
            $sum: {
              $cond: [
                { $regexMatch: { input: '$description', regex: /ticket/i } },
                1,
                0
              ]
            }
          },
          moderationActions: {
            $sum: {
              $cond: [
                { $or: [
                  { $eq: ['$level', 'moderation'] },
                  { $regexMatch: { input: '$description', regex: /ban|mute|kick|punishment/i } }
                ]},
                1,
                0
              ]
            }
          },
          lastActive: { $max: '$created' },
          avgResponseTime: { $avg: '$metadata.responseTime' }
        }
      },
      {
        $project: {
          username: '$_id',
          totalActions: 1,
          ticketResponses: '$ticketActions',
          punishmentsIssued: '$moderationActions',
          lastActive: 1,
          avgResponseTime: { $ifNull: ['$avgResponseTime', 60] } // Default 60 minutes if no data
        }
      },
      {
        $sort: { totalActions: -1 }
      }
    ]);

    // Get staff roles from staff collection
    const Staff = db.model('Staff');
    const staffWithRoles = await Promise.all(
      staffPerformance.map(async (staff) => {
        const userDoc = await Staff.findOne({ username: staff.username });
        return {
          id: staff._id,
          username: staff.username,
          role: userDoc?.role || 'User',
          totalActions: staff.totalActions,
          ticketResponses: staff.ticketResponses,
          punishmentsIssued: staff.punishmentsIssued,
          avgResponseTime: Math.round(staff.avgResponseTime),
          lastActive: staff.lastActive
        };
      })
    );

    res.json(staffWithRoles);
  } catch (error) {
    console.error('Error fetching staff performance:', error);
    res.status(500).json({ error: 'Failed to fetch staff performance data' });
  }
});

// Get detailed staff member analytics
router.get('/staff/:username/details', async (req, res) => {
  try {
    const { username } = req.params;
    const { period = '30d' } = req.query;
    
    if (!req.serverDbConnection) {
      return res.status(503).json({ error: 'Database connection not available' });
    }
    
    const db = req.serverDbConnection;
    
    // Calculate date range
    const now = new Date();
    let startDate: Date;
    
    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const Log = db.model('Log');
    const Player = db.model('Player');
    const Ticket = db.model('Ticket');
    const Settings = db.model('Settings');

    // Get punishment type settings for proper type mapping (using both storage methods)
    let punishmentTypesConfig = [];
    
    // First try the dedicated punishmentTypes document
    const punishmentTypesDoc = await Settings.findOne({ type: 'punishmentTypes' });
    if (punishmentTypesDoc?.data) {
      punishmentTypesConfig = typeof punishmentTypesDoc.data === 'string' 
        ? JSON.parse(punishmentTypesDoc.data) 
        : punishmentTypesDoc.data;
    } else {
      // Fallback to settings.punishmentTypes
      const settings = await Settings.findOne({});
      if (settings?.settings?.punishmentTypes) {
        punishmentTypesConfig = typeof settings.settings.punishmentTypes === 'string' 
          ? JSON.parse(settings.settings.punishmentTypes) 
          : settings.settings.punishmentTypes;
      }
    }

    // Helper function to map punishment type
    const mapPunishmentType = (type: string, typeOrdinal: number) => {
      // First try to use the direct type name if it exists
      if (type && type.trim() !== '') {
        return type;
      }
      
      // Fall back to using ordinal with settings lookup
      if (typeof typeOrdinal === 'number') {
        // First try exact ordinal match (most reliable)
        const punishmentTypeByOrdinal = punishmentTypesConfig.find(pt => pt.ordinal === typeOrdinal);
        if (punishmentTypeByOrdinal) {
          return punishmentTypeByOrdinal.name;
        }
        
        // If no ordinal match, try ID match as fallback (for backward compatibility)
        const punishmentTypeById = punishmentTypesConfig.find(pt => pt.id === typeOrdinal);
        if (punishmentTypeById) {
          return punishmentTypeById.name;
        }
        
        // Return generic type name without error logging
        return `Type ${typeOrdinal}`;
      }
      
      return 'Unknown';
    };

    // Get detailed punishment data for this staff member
    const punishments = await Player.aggregate([
      { $unwind: '$punishments' },
      { 
        $match: { 
          'punishments.issuerName': username,
          'punishments.issued': { $gte: startDate }
        }
      },
      {
        $lookup: {
          from: 'players',
          localField: 'minecraftUuid',
          foreignField: 'minecraftUuid',
          as: 'playerInfo'
        }
      },
      {
        $project: {
          playerId: '$minecraftUuid',
          playerName: { 
            $cond: {
              if: { $gt: [{ $size: { $ifNull: ['$usernames', []] } }, 0] },
              then: { $arrayElemAt: ['$usernames.username', -1] },
              else: 'Unknown'
            }
          },
          id: '$punishments.id',
          type: '$punishments.type',
          type_ordinal: '$punishments.type_ordinal',
          reason: '$punishments.data.reason',
          duration: '$punishments.data.duration',
          issued: '$punishments.issued',
          active: '$punishments.active',
          evidence: '$punishments.evidence',
          attachedTicketIds: '$punishments.attachedTicketIds',
          rolledBack: '$punishments.data.rolledBack',
          modifications: '$punishments.modifications'
        }
      },
      { $sort: { issued: -1 } },
      { $limit: 20 }
    ]);

    // Map punishment types using the helper function
    const mappedPunishments = punishments.map(punishment => ({
      ...punishment,
      type: mapPunishmentType(null, punishment.type_ordinal)
    }));

    // Get tickets that this staff member has replied to 
    const tickets = await Ticket.find({
      $or: [
        { 'messages.sender': username },
        { 'messages.name': username },
        { 'replies.name': username },
        { 'replies.sender': username }
      ]
    })
    .sort({ created: -1 })
    .limit(50)  // Get more tickets and filter later
    .select('_id subject title category status created updated updatedAt priority messages replies');
    

    // Calculate response times for tickets where staff member replied
    const ticketResponseTimes = [];
    
    for (const ticket of tickets) {
      // Combine messages and replies arrays
      const allMessages = [
        ...(ticket.messages || []),
        ...(ticket.replies || [])
      ];
      
      if (allMessages.length > 0) {
        const staffMessages = allMessages.filter(msg => {
          // More flexible matching - check if sender/name matches and message is within time period
          const msgDate = new Date(msg.timestamp || msg.created || msg.date);
          const sender = msg.sender || msg.name;
          return sender === username && msgDate >= startDate;
        });
        
        if (staffMessages.length > 0) {
          // Find the last message/reply in the ticket to determine last activity
          const lastMessage = allMessages.sort((a, b) => {
            const aDate = new Date(a.timestamp || a.created || a.date);
            const bDate = new Date(b.timestamp || b.created || b.date);
            return bDate.getTime() - aDate.getTime();
          })[0];
          
          const lastActivityDate = new Date(lastMessage.timestamp || lastMessage.created || lastMessage.date);
          const totalReplies = allMessages.length;
          
          ticketResponseTimes.push({
            ticketId: ticket._id.toString(),
            subject: ticket.subject || ticket.title || 'No Subject',
            status: ticket.status,
            replyCount: totalReplies,
            created: ticket.created,
            lastActivity: lastActivityDate,
            updatedAt: ticket.updatedAt || ticket.updated || lastActivityDate
          });
        }
      }
    }
    
    // Limit to 20 most recent
    ticketResponseTimes.splice(20);
    

    // Get daily activity breakdown with error handling
    let dailyActivity = [];
    try {
      dailyActivity = await Log.aggregate([
        {
          $match: {
            source: username,
            created: { $gte: startDate }
          }
        },
        {
          $addFields: {
            parsedDate: {
              $cond: {
                if: { $eq: [{ $type: '$created' }, 'date'] },
                then: '$created',
                else: {
                  $cond: {
                    if: { $eq: [{ $type: '$created' }, 'string'] },
                    then: { 
                      $dateFromString: { 
                        dateString: '$created',
                        onError: new Date()
                      }
                    },
                    else: new Date()
                  }
                }
              }
            }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$parsedDate'
              }
            },
            punishments: {
              $sum: {
                $cond: [
                  { $or: [
                    { $eq: ['$level', 'moderation'] },
                    { $regexMatch: { input: '$description', regex: /ban|mute|kick|warn/i } }
                  ]},
                  1,
                  0
                ]
              }
            },
            tickets: {
              $sum: {
                $cond: [
                  { $regexMatch: { input: '$description', regex: /ticket/i } },
                  1,
                  0
                ]
              }
            },
            evidence: {
              $sum: {
                $cond: [
                  { $regexMatch: { input: '$description', regex: /evidence|upload|file/i } },
                  1,
                  0
                ]
              }
            }
          }
        },
        { $sort: { _id: 1 } }
      ]);
    } catch (error) {
      console.warn('Failed to aggregate daily activity, using fallback:', error.message);
      // Fallback: get simple counts without daily breakdown
      const totalLogs = await Log.countDocuments({
        source: username,
        created: { $gte: startDate }
      });
      
      const moderationLogs = await Log.countDocuments({
        source: username,
        created: { $gte: startDate },
        $or: [
          { level: 'moderation' },
          { description: { $regex: /ban|mute|kick|warn/i } }
        ]
      });
      
      // Create a simple single-day entry for the current period
      dailyActivity = [{
        _id: format(new Date(), 'yyyy-MM-dd'),
        punishments: moderationLogs,
        tickets: totalLogs - moderationLogs,
        evidence: 0
      }];
    }

    // Get punishment type breakdown for this staff member
    const punishmentTypeBreakdownData = await Player.aggregate([
      { $unwind: '$punishments' },
      { 
        $match: { 
          'punishments.issuerName': username,
          'punishments.issued': { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$punishments.type_ordinal',
          count: { $sum: 1 }
        }
      }
    ]);

    // Map punishment type breakdown using the helper function
    const punishmentTypeBreakdown = punishmentTypeBreakdownData.map(item => ({
      type: mapPunishmentType(null, item._id),
      count: item.count
    }));

    // Count evidence uploads (from logs)
    const evidenceUploads = await Log.countDocuments({
      source: username,
      created: { $gte: startDate },
      $or: [
        { description: { $regex: /evidence|upload|file/i } },
        { level: 'info', description: { $regex: /uploaded|attachment/i } }
      ]
    });

    res.json({
      username,
      period,
      punishments: mappedPunishments,
      tickets: ticketResponseTimes,
      dailyActivity: dailyActivity.map(day => ({
        date: day._id,
        punishments: day.punishments,
        tickets: day.tickets,
        evidence: day.evidence
      })),
      punishmentTypeBreakdown: punishmentTypeBreakdown,
      evidenceUploads,
      summary: {
        totalPunishments: mappedPunishments.length,
        totalTickets: tickets.length,
        avgResponseTime: ticketResponseTimes.length > 0 
          ? Math.round(ticketResponseTimes.reduce((sum, t) => sum + t.responseTime, 0) / ticketResponseTimes.length)
          : 0,
        evidenceUploads
      }
    });
  } catch (error) {
    console.error('Error fetching staff details:', error);
    res.status(500).json({ error: 'Failed to fetch staff details' });
  }
});

// Get punishment analytics for rollback functionality
router.get('/punishments', async (req, res) => {
  try {
    const { limit = 50, canRollback } = req.query;
    
    if (!req.serverDbConnection) {
      return res.status(503).json({ error: 'Database connection not available' });
    }
    
    const db = req.serverDbConnection;

    // Get punishment logs from the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const Log = db.model('Log');
    const punishments = await Log.find({
      created: { $gte: thirtyDaysAgo },
      $or: [
        { level: 'moderation' },
        { description: { $regex: /ban|mute|kick|warn/i } }
      ],
      ...(canRollback === 'true' && {
        'metadata.canRollback': { $ne: false }
      })
    })
    .sort({ created: -1 })
    .limit(parseInt(limit as string));

    const formattedPunishments = punishments.map(log => ({
      id: log._id,
      type: extractPunishmentType(log.description),
      playerId: log.metadata?.playerId || 'unknown',
      playerName: log.metadata?.playerName || extractPlayerName(log.description),
      staffId: log.metadata?.staffId || log.source,
      staffName: log.source,
      reason: log.metadata?.reason || extractReason(log.description),
      duration: log.metadata?.duration,
      timestamp: log.created,
      canRollback: log.metadata?.canRollback !== false
    }));

    res.json(formattedPunishments);
  } catch (error) {
    console.error('Error fetching punishments:', error);
    res.status(500).json({ error: 'Failed to fetch punishment data' });
  }
});

// Rollback a punishment
router.post('/punishments/:id/rollback', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = 'Admin rollback' } = req.body;
    
    if (!req.serverDbConnection) {
      return res.status(503).json({ error: 'Database connection not available' });
    }
    
    const db = req.serverDbConnection;

    // Find the original punishment
    const Log = db.model('Log');
    const punishment = await Log.findById(id);
    
    if (!punishment) {
      return res.status(404).json({ error: 'Punishment not found' });
    }

    if (punishment.metadata?.canRollback === false) {
      return res.status(400).json({ error: 'This punishment cannot be rolled back' });
    }

    // Create rollback log entry
    const rollbackLog = {
      created: new Date().toISOString(),
      level: 'moderation',
      source: req.currentUser?.username || 'system',
      description: `Rolled back ${extractPunishmentType(punishment.description)} for ${punishment.metadata?.playerName || 'unknown player'}`,
      metadata: {
        originalPunishmentId: id,
        rollbackReason: reason,
        originalPunishment: {
          type: extractPunishmentType(punishment.description),
          player: punishment.metadata?.playerName,
          staff: punishment.source,
          originalReason: punishment.metadata?.reason
        }
      }
    };

    // Insert rollback log
    await Log.create(rollbackLog);

    // Mark original punishment as rolled back
    await Log.findByIdAndUpdate(id, { 
      $set: { 
        'metadata.rolledBack': true,
        'metadata.rollbackDate': new Date().toISOString(),
        'metadata.rollbackBy': req.currentUser?.username
      }
    });

    // TODO: Integrate with Minecraft server to actually reverse the punishment
    // This would involve calling the Minecraft API to unban/unmute the player

    res.json({ 
      success: true, 
      message: 'Punishment rolled back successfully',
      rollbackId: rollbackLog.id
    });
  } catch (error) {
    console.error('Error rolling back punishment:', error);
    res.status(500).json({ error: 'Failed to rollback punishment' });
  }
});

// Get database exploration data
router.get('/database/:table', async (req, res) => {
  try {
    const { table } = req.params;
    const { limit = 100, skip = 0 } = req.query;
    
    if (!req.serverDbConnection) {
      return res.status(503).json({ error: 'Database connection not available' });
    }
    
    const db = req.serverDbConnection;

    // Validate table name for security
    const allowedTables = ['players', 'tickets', 'staff', 'punishments', 'logs', 'settings'];
    if (!allowedTables.includes(table)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    let modelName = '';
    let pipeline: any[] = [];

    // Special handling for different "tables" (collections)
    switch (table) {
      case 'players':
        modelName = 'Player';
        pipeline = [
          {
            $project: {
              uuid: '$minecraftUuid',
              username: { 
                $cond: {
                  if: { $gt: [{ $size: { $ifNull: ['$usernames', []] } }, 0] },
                  then: { $arrayElemAt: ['$usernames.username', -1] },
                  else: 'Unknown'
                }
              },
              joinDate: { $arrayElemAt: ['$usernames.date', 0] },
              lastSeen: '$lastSeen',
              punishmentCount: { $size: { $ifNull: ['$punishments', []] } },
              noteCount: { $size: { $ifNull: ['$notes', []] } }
            }
          }
        ];
        break;

      case 'staff':
        modelName = 'Staff';
        pipeline = [
          {
            $project: {
              username: 1,
              email: 1,
              role: 1,
              joinDate: '$createdAt',
              lastActive: 1,
              permissions: 1
            }
          }
        ];
        break;

      case 'punishments':
        modelName = 'Log';
        pipeline = [
          {
            $match: {
              $or: [
                { level: 'moderation' },
                { description: { $regex: /ban|mute|kick|warn/i } }
              ]
            }
          },
          {
            $project: {
              description: 1,
              player: '$metadata.playerName',
              staff: '$source',
              reason: '$metadata.reason',
              duration: '$metadata.duration',
              created: 1,
              rolledBack: '$metadata.rolledBack'
            }
          }
        ];
        break;

      case 'tickets':
        modelName = 'Ticket';
        pipeline = [
          {
            $project: {
              subject: 1,
              category: 1,
              status: 1,
              creator: 1,
              assignedTo: 1,
              created: 1,
              priority: 1
            }
          }
        ];
        break;

      case 'logs':
        modelName = 'Log';
        pipeline = [
          {
            $project: {
              level: 1,
              source: 1,
              description: 1,
              created: 1
            }
          }
        ];
        break;

      default:
        modelName = 'Settings';
        pipeline = [
          { $project: { password: 0, sensitiveData: 0 } } // Exclude sensitive fields
        ];
    }

    // Add pagination
    pipeline.push(
      { $skip: parseInt(skip as string) },
      { $limit: parseInt(limit as string) }
    );

    const Model = db.model(modelName);
    const data = await Model.aggregate(pipeline);
    const total = await Model.countDocuments(
      pipeline[0]?.$match || {}
    );

    res.json({
      data,
      total,
      page: Math.floor(parseInt(skip as string) / parseInt(limit as string)) + 1,
      hasMore: parseInt(skip as string) + data.length < total
    });
  } catch (error) {
    console.error('Error fetching database data:', error);
    res.status(500).json({ error: 'Failed to fetch database data' });
  }
});

// Rollback individual punishment by punishment ID (from staff modal)
router.post('/punishment/:id/rollback', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = 'Staff rollback from analytics panel' } = req.body;
    
    if (!req.serverDbConnection) {
      return res.status(503).json({ error: 'Database connection not available' });
    }
    
    const db = req.serverDbConnection;
    const Player = db.model('Player');
    const Log = db.model('Log');

    // Find the punishment in player documents
    const player = await Player.findOne({ 'punishments.id': id });
    if (!player) {
      return res.status(404).json({ error: 'Punishment not found' });
    }

    const punishment = player.punishments.find(p => p.id === id);
    if (!punishment) {
      return res.status(404).json({ error: 'Punishment not found' });
    }

    // Check if already rolled back (handle both Map and Object data)
    let isRolledBack = false;
    if (punishment.data instanceof Map) {
      isRolledBack = punishment.data.get('rolledBack') === true;
    } else if (punishment.data && typeof punishment.data === 'object') {
      isRolledBack = punishment.data.rolledBack === true;
    }

    if (isRolledBack) {
      return res.status(400).json({ error: 'This punishment has already been rolled back' });
    }

    // Mark punishment as rolled back and add pardon modification
    const rollbackBy = req.currentUser?.username || 'system';
    const rollbackDate = new Date();
    
    // Handle data field (Map vs Object)
    if (punishment.data instanceof Map) {
      punishment.data.set('rolledBack', true);
      punishment.data.set('rollbackDate', rollbackDate);
      punishment.data.set('rollbackBy', rollbackBy);
      punishment.data.set('rollbackReason', reason);
    } else {
      // Initialize data as Map if it doesn't exist or convert object to Map
      if (!punishment.data) {
        punishment.data = new Map();
      } else if (!(punishment.data instanceof Map)) {
        const oldData = punishment.data;
        punishment.data = new Map();
        // Copy existing data
        for (const [key, value] of Object.entries(oldData)) {
          punishment.data.set(key, value);
        }
      }
      punishment.data.set('rolledBack', true);
      punishment.data.set('rollbackDate', rollbackDate);
      punishment.data.set('rollbackBy', rollbackBy);
      punishment.data.set('rollbackReason', reason);
    }

    // Add "Pardoned" modification to the punishment
    if (!punishment.modifications) {
      punishment.modifications = [];
    }
    
    punishment.modifications.push({
      type: 'MANUAL_PARDON',  // Use proper modification type
      issuerName: rollbackBy,
      issued: rollbackDate,   // Use 'issued' instead of 'created'
      effectiveDuration: 0,   // Required for pardons
      reason: `Rolled back by ${rollbackBy}: ${reason}`
    });
    
    try {
      await player.save({ validateBeforeSave: false });
    } catch (saveError) {
      console.error('Failed to save player during rollback:', saveError);
      return res.status(500).json({ error: 'Failed to save rollback changes' });
    }

    // Create rollback log entry
    await Log.create({
      created: new Date(),
      level: 'moderation',
      source: req.currentUser?.username || 'system',
      description: `Rolled back punishment ${id} for player ${player.usernames[0]?.username || 'Unknown'}`,
      metadata: {
        originalPunishmentId: id,
        rollbackReason: reason,
        playerId: player.minecraftUuid,
        playerName: player.usernames[0]?.username || 'Unknown'
      }
    });

    res.json({ 
      success: true, 
      message: 'Punishment rolled back successfully'
    });
  } catch (error) {
    console.error('Error rolling back punishment:', error);
    res.status(500).json({ error: 'Failed to rollback punishment' });
  }
});

// Bulk rollback all punishments by a staff member
router.post('/staff/:username/rollback-all', async (req, res) => {
  try {
    const { username } = req.params;
    const { reason = 'Bulk rollback from analytics panel', period = '30d' } = req.body;
    
    if (!req.serverDbConnection) {
      return res.status(503).json({ error: 'Database connection not available' });
    }
    
    const db = req.serverDbConnection;
    const Player = db.model('Player');
    const Log = db.model('Log');

    // Calculate date range based on period
    const now = new Date();
    let startDate: Date;
    
    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        // For 'all' or unknown periods, use a very old date
        startDate = new Date('2020-01-01');
    }

    // Find all players with punishments issued by this staff member in the time period
    const players = await Player.find({
      'punishments.issuerName': username,
      'punishments.issued': { $gte: startDate }
    });

    let rolledBackCount = 0;
    const rolledBackPunishments = [];

    for (const player of players) {
      for (const punishment of player.punishments) {
        // Check if punishment matches criteria and isn't already rolled back
        if (punishment.issuerName === username && 
            punishment.issued >= startDate && 
            punishment.data?.get('rolledBack') !== true) {
          
          const rollbackBy = req.currentUser?.username || 'system';
          const rollbackDate = new Date();
          
          // Mark punishment as rolled back
          punishment.data.set('rolledBack', true);
          punishment.data.set('rollbackDate', rollbackDate);
          punishment.data.set('rollbackBy', rollbackBy);
          punishment.data.set('rollbackReason', reason);
          
          // Add "Pardoned" modification to the punishment
          if (!punishment.modifications) {
            punishment.modifications = [];
          }
          
          punishment.modifications.push({
            type: 'MANUAL_PARDON',  // Use proper modification type
            issuerName: rollbackBy,
            issued: rollbackDate,   // Use 'issued' instead of 'created'
            effectiveDuration: 0,   // Required for pardons
            reason: `Bulk rollback by ${rollbackBy}: ${reason}`
          });
          
          rolledBackCount++;
          rolledBackPunishments.push({
            id: punishment.id,
            playerId: player.minecraftUuid,
            playerName: player.usernames[0]?.username || 'Unknown'
          });
        }
      }
      
      // Save player if any punishments were modified
      if (player.isModified()) {
        try {
          await player.save({ validateBeforeSave: false });
        } catch (saveError) {
          console.warn(`Failed to save player ${player.minecraftUuid}, skipping:`, saveError.message);
          // Continue with other players rather than failing the entire operation
        }
      }
    }

    // Create bulk rollback log entry
    await Log.create({
      created: new Date(),
      level: 'moderation',
      source: req.currentUser?.username || 'system',
      description: `Bulk rollback: ${rolledBackCount} punishments by ${username} rolled back`,
      metadata: {
        bulkRollback: true,
        staffMember: username,
        rollbackReason: reason,
        period: period,
        punishmentsRolledBack: rolledBackCount,
        rolledBackPunishments: rolledBackPunishments
      }
    });

    res.json({ 
      success: true, 
      message: `Successfully rolled back ${rolledBackCount} punishments`,
      count: rolledBackCount
    });
  } catch (error) {
    console.error('Error performing bulk rollback:', error);
    res.status(500).json({ error: 'Failed to perform bulk rollback' });
  }
});

// Get advanced analytics data
router.get('/analytics', async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    
    if (!req.serverDbConnection) {
      return res.status(503).json({ error: 'Database connection not available' });
    }
    
    const db = req.serverDbConnection;

    // Calculate date range
    const now = new Date();
    let startDate: Date;
    let days: number;
    
    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        days = 7;
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        days = 30;
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        days = 90;
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        days = 7;
    }

    // Daily activity trends
    const Log = db.model('Log');
    const dailyActivity = await Log.aggregate([
      {
        $match: { created: { $gte: startDate } }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: { $dateFromString: { dateString: '$created' } }
            }
          },
          total: { $sum: 1 },
          moderation: {
            $sum: {
              $cond: [
                { $or: [
                  { $eq: ['$level', 'moderation'] },
                  { $regexMatch: { input: '$description', regex: /ban|mute|kick/i } }
                ]},
                1,
                0
              ]
            }
          },
          tickets: {
            $sum: {
              $cond: [
                { $regexMatch: { input: '$description', regex: /ticket/i } },
                1,
                0
              ]
            }
          },
          errors: {
            $sum: {
              $cond: [{ $eq: ['$level', 'error'] }, 1, 0]
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Action type distribution
    const actionDistribution = await Log.aggregate([
      {
        $match: { created: { $gte: startDate } }
      },
      {
        $group: {
          _id: null,
          moderation: {
            $sum: {
              $cond: [
                { $or: [
                  { $eq: ['$level', 'moderation'] },
                  { $regexMatch: { input: '$description', regex: /ban|mute|kick/i } }
                ]},
                1,
                0
              ]
            }
          },
          tickets: {
            $sum: {
              $cond: [
                { $regexMatch: { input: '$description', regex: /ticket/i } },
                1,
                0
              ]
            }
          },
          system: {
            $sum: {
              $cond: [{ $eq: ['$source', 'system'] }, 1, 0]
            }
          },
          user: {
            $sum: {
              $cond: [
                { $and: [
                  { $ne: ['$source', 'system'] },
                  { $ne: ['$level', 'moderation'] },
                  { $not: { $regexMatch: { input: '$description', regex: /ticket|ban|mute|kick/i } } }
                ]},
                1,
                0
              ]
            }
          },
          settings: {
            $sum: {
              $cond: [
                { $regexMatch: { input: '$description', regex: /setting|config/i } },
                1,
                0
              ]
            }
          },
          errors: {
            $sum: {
              $cond: [{ $eq: ['$level', 'error'] }, 1, 0]
            }
          }
        }
      }
    ]);

    res.json({
      dailyActivity: dailyActivity.map(day => ({
        date: day._id,
        total: day.total,
        moderation: day.moderation,
        tickets: day.tickets,
        errors: day.errors
      })),
      actionDistribution: actionDistribution[0] || {
        moderation: 0,
        tickets: 0,
        system: 0,
        user: 0,
        settings: 0,
        errors: 0
      }
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
});

// Helper functions
function extractPunishmentType(description: string): string {
  const desc = description.toLowerCase();
  if (desc.includes('ban')) return 'ban';
  if (desc.includes('mute')) return 'mute';
  if (desc.includes('kick')) return 'kick';
  if (desc.includes('warn')) return 'warn';
  return 'unknown';
}

function extractPlayerName(description: string): string {
  // Try to extract player name from description
  const matches = description.match(/player\s+(\w+)/i) || 
                 description.match(/user\s+(\w+)/i) ||
                 description.match(/(\w+)\s+(was|has been)/i);
  
  return matches ? matches[1] : 'Unknown Player';
}

function extractReason(description: string): string {
  // Try to extract reason from description
  const reasonMatch = description.match(/reason:\s*(.+?)(?:\.|$)/i) ||
                     description.match(/for\s+(.+?)(?:\.|$)/i);
  
  return reasonMatch ? reasonMatch[1].trim() : 'No reason specified';
}

// Bulk rollback punishments by time range
router.post('/punishments/bulk-rollback', async (req, res) => {
  try {
    const { timeRange, reason = 'Bulk rollback from audit panel' } = req.body;
    
    if (!req.serverDbConnection) {
      return res.status(503).json({ error: 'Database connection not available' });
    }
    
    const db = req.serverDbConnection;
    const Player = db.model('Player');
    const Log = db.model('Log');

    // Calculate date range based on timeRange
    const now = new Date();
    let startDate: Date;
    
    switch (timeRange) {
      case '1h':
        startDate = new Date(now.getTime() - 1 * 60 * 60 * 1000);
        break;
      case '6h':
        startDate = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        break;
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        startDate = new Date('2020-01-01');
        break;
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    // Find all players with punishments in the time range that aren't already rolled back
    const players = await Player.find({
      'punishments.issued': { $gte: startDate }
    });

    let rolledBackCount = 0;
    const rolledBackPunishments = [];

    for (const player of players) {
      for (const punishment of player.punishments) {
        // Check if punishment is in time range and not already rolled back
        if (punishment.issued >= startDate && 
            punishment.data?.get('rolledBack') !== true) {
          
          const rollbackBy = req.currentUser?.username || 'system';
          const rollbackDate = new Date();
          
          // Handle data field (Map vs Object)
          if (punishment.data instanceof Map) {
            punishment.data.set('rolledBack', true);
            punishment.data.set('rollbackDate', rollbackDate);
            punishment.data.set('rollbackBy', rollbackBy);
            punishment.data.set('rollbackReason', reason);
          } else {
            // Initialize data as Map if it doesn't exist or convert object to Map
            if (!punishment.data) {
              punishment.data = new Map();
            } else if (!(punishment.data instanceof Map)) {
              const oldData = punishment.data;
              punishment.data = new Map();
              // Copy existing data
              for (const [key, value] of Object.entries(oldData)) {
                punishment.data.set(key, value);
              }
            }
            punishment.data.set('rolledBack', true);
            punishment.data.set('rollbackDate', rollbackDate);
            punishment.data.set('rollbackBy', rollbackBy);
            punishment.data.set('rollbackReason', reason);
          }

          // Add "Pardoned" modification to the punishment
          if (!punishment.modifications) {
            punishment.modifications = [];
          }
          
          punishment.modifications.push({
            type: 'MANUAL_PARDON',
            issuerName: rollbackBy,
            issued: rollbackDate,
            effectiveDuration: 0,
            reason: `Bulk rollback (${timeRange}): ${reason}`
          });
          
          rolledBackCount++;
          rolledBackPunishments.push({
            id: punishment.id,
            playerId: player.minecraftUuid,
            playerName: player.usernames[0]?.username || 'Unknown'
          });
        }
      }
      
      // Save player if any punishments were modified
      if (player.isModified()) {
        try {
          await player.save({ validateBeforeSave: false });
        } catch (saveError) {
          console.warn(`Failed to save player ${player.minecraftUuid}, skipping:`, saveError.message);
          // Continue with other players rather than failing the entire operation
        }
      }
    }

    // Create bulk rollback log entry
    await Log.create({
      created: new Date(),
      level: 'moderation',
      source: req.currentUser?.username || 'system',
      description: `Bulk rollback: ${rolledBackCount} punishments from ${timeRange} rolled back`,
      metadata: {
        bulkRollback: true,
        timeRange: timeRange,
        rollbackReason: reason,
        punishmentsRolledBack: rolledBackCount,
        rolledBackPunishments: rolledBackPunishments
      }
    });

    res.json({ 
      success: true, 
      message: `Successfully rolled back ${rolledBackCount} punishments`,
      count: rolledBackCount
    });
  } catch (error) {
    console.error('Error performing bulk rollback:', error);
    res.status(500).json({ error: 'Failed to perform bulk rollback' });
  }
});

// Rollback all punishments by a staff member within a date range
router.post('/staff/:username/rollback-date-range', async (req, res) => {
  try {
    const { username } = req.params;
    const { startDate, endDate, reason = 'Date range rollback from analytics panel' } = req.body;
    
    if (!req.serverDbConnection) {
      return res.status(503).json({ error: 'Database connection not available' });
    }
    
    const db = req.serverDbConnection;
    const Player = db.model('Player');
    const Log = db.model('Log');

    // Parse dates
    const startDateTime = new Date(startDate);
    const endDateTime = new Date(endDate);

    // Validate dates
    if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    if (endDateTime < startDateTime) {
      return res.status(400).json({ error: 'End date must be after start date' });
    }

    // Find all players with punishments issued by this staff member in the date range
    const players = await Player.find({
      'punishments.issuerName': username,
      'punishments.issued': { $gte: startDateTime, $lte: endDateTime }
    });

    let rolledBackCount = 0;
    const rolledBackPunishments = [];

    for (const player of players) {
      for (const punishment of player.punishments) {
        // Check if punishment matches criteria and isn't already rolled back
        if (punishment.issuerName === username && 
            punishment.issued >= startDateTime && 
            punishment.issued <= endDateTime &&
            punishment.data?.get('rolledBack') !== true) {
          
          const rollbackBy = req.currentUser?.username || 'system';
          const rollbackDate = new Date();
          
          // Handle data field (Map vs Object)
          if (punishment.data instanceof Map) {
            punishment.data.set('rolledBack', true);
            punishment.data.set('rollbackDate', rollbackDate);
            punishment.data.set('rollbackBy', rollbackBy);
            punishment.data.set('rollbackReason', reason);
          } else {
            // Initialize data as Map if it doesn't exist or convert object to Map
            if (!punishment.data) {
              punishment.data = new Map();
            } else if (!(punishment.data instanceof Map)) {
              const oldData = punishment.data;
              punishment.data = new Map();
              // Copy existing data
              for (const [key, value] of Object.entries(oldData)) {
                punishment.data.set(key, value);
              }
            }
            punishment.data.set('rolledBack', true);
            punishment.data.set('rollbackDate', rollbackDate);
            punishment.data.set('rollbackBy', rollbackBy);
            punishment.data.set('rollbackReason', reason);
          }

          // Add "Pardoned" modification to the punishment
          if (!punishment.modifications) {
            punishment.modifications = [];
          }
          
          punishment.modifications.push({
            type: 'MANUAL_PARDON',
            issuerName: rollbackBy,
            issued: rollbackDate,
            effectiveDuration: 0,
            reason: `Date range rollback by ${rollbackBy}: ${reason}`
          });
          
          rolledBackCount++;
          rolledBackPunishments.push({
            id: punishment.id,
            playerId: player.minecraftUuid,
            playerName: player.usernames[0]?.username || 'Unknown'
          });
        }
      }
      
      // Save player if any punishments were modified
      if (player.isModified()) {
        try {
          await player.save({ validateBeforeSave: false });
        } catch (saveError) {
          console.warn(`Failed to save player ${player.minecraftUuid}, skipping:`, saveError.message);
          // Continue with other players rather than failing the entire operation
        }
      }
    }

    // Create rollback log entry
    await Log.create({
      created: new Date(),
      level: 'moderation',
      source: req.currentUser?.username || 'system',
      description: `Date range rollback: ${rolledBackCount} punishments by ${username} rolled back (${startDate} to ${endDate})`,
      metadata: {
        dateRangeRollback: true,
        staffMember: username,
        rollbackReason: reason,
        startDate: startDate,
        endDate: endDate,
        punishmentsRolledBack: rolledBackCount,
        rolledBackPunishments: rolledBackPunishments
      }
    });

    res.json({ 
      success: true, 
      message: `Successfully rolled back ${rolledBackCount} punishments`,
      count: rolledBackCount
    });
  } catch (error) {
    console.error('Error performing date range rollback:', error);
    res.status(500).json({ error: 'Failed to perform date range rollback' });
  }
});

export default router;