import express from 'express';
import { startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay, eachDayOfInterval, format } from 'date-fns';
import { isAuthenticated } from '../middleware/auth-middleware';
// Note: Permission functions will be imported dynamically to avoid circular dependency issues

const router = express.Router();

// Ensure all analytics routes require authentication and audit permission
router.use(isAuthenticated);

// Add permission check middleware for all routes
router.use(async (req, res, next) => {
  try {
    const { hasPermission } = await import('../middleware/permission-middleware');
    const canViewAudit = await hasPermission(req, 'admin.audit.view');
    
    if (!canViewAudit) {
      return res.status(403).json({ 
        message: 'Forbidden: You do not have permission to view analytics. Audit access required.',
        required: ['admin.audit.view']
      });
    }
    next();
  } catch (error) {
    console.error('Error checking analytics permissions:', error);
    res.status(500).json({ message: 'Internal server error while checking permissions.' });
  }
});

// Helper function to get punishment types from settings (using both storage methods)
async function getPunishmentTypesConfig(db: any) {
  try {
    const Settings = db.model('Settings');
    let punishmentTypes = null;
    
    // First try the dedicated punishmentTypes document
    const punishmentTypesDoc = await Settings.findOne({ type: 'punishmentTypes' });
    if (punishmentTypesDoc?.data) {
      punishmentTypes = typeof punishmentTypesDoc.data === 'string' 
        ? JSON.parse(punishmentTypesDoc.data) 
        : punishmentTypesDoc.data;
    } else {
      // Fallback to settings.punishmentTypes
      const settings = await Settings.findOne({});
      if (settings?.settings?.punishmentTypes) {
        punishmentTypes = typeof settings.settings.punishmentTypes === 'string' 
          ? JSON.parse(settings.settings.punishmentTypes) 
          : settings.settings.punishmentTypes;
      } else {
      }
    }
    
    
    return punishmentTypes || [];
  } catch (error) {
    console.warn('Failed to load punishment types from settings:', error.message);
    return [];
  }
}

// Helper function to map punishment type using settings
function mapPunishmentType(type: string, typeOrdinal: number, punishmentTypesConfig: any[]) {
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
}

// Since this router is mounted under `/panel/analytics` and the panel router already applies authentication,
// we don't need additional auth middleware here. The isAuthenticated middleware is already applied.

// Middleware to ensure only users with audit permission can access analytics
const requireAuditPermission = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    // Check if user has audit access using existing permission system
    const { hasPermission } = await import('../middleware/permission-middleware');
    
    if (!req.currentUser || !(await hasPermission(req, 'admin.audit.view'))) {
      return res.status(403).json({ message: 'Access denied. Audit permission required.' });
    }
    next();
  } catch (error) {
    console.error('Error checking analytics permissions:', error);
    return res.status(500).json({ message: 'Internal server error while checking permissions.' });
  }
};

router.use(requireAuditPermission);

// Get overview statistics
router.get('/overview', async (req, res) => {
  try {
    if (!req.serverDbConnection) {
      return res.status(503).json({ error: 'Database connection not available' });
    }
    
    const db = req.serverDbConnection;
    
    const Ticket = db.model('Ticket');
    const Player = db.model('Player');
    const Staff = db.model('Staff');
    const Log = db.model('Log');

    const now = new Date();
    const thirtyDaysAgo = subMonths(now, 1);
    const sixtyDaysAgo = subMonths(now, 2);

    // Get current counts
    const [totalTickets, totalPlayers, totalStaff, activeTickets] = await Promise.all([
      Ticket.countDocuments(),
      Player.countDocuments(),
      Staff.countDocuments(),
      Ticket.countDocuments({ status: 'Open' })
    ]);

    // Get previous period counts for comparison
    const [prevTickets, prevPlayers] = await Promise.all([
      Ticket.countDocuments({ created: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } }),
      Player.countDocuments({ 'usernames.date': { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } })
    ]);

    // Get recent period counts
    const [recentTickets, recentPlayers] = await Promise.all([
      Ticket.countDocuments({ created: { $gte: thirtyDaysAgo } }),
      Player.countDocuments({ 'usernames.date': { $gte: thirtyDaysAgo } })
    ]);

    // Calculate percentage changes
    const ticketChange = prevTickets > 0 ? ((recentTickets - prevTickets) / prevTickets) * 100 : 0;
    const playerChange = prevPlayers > 0 ? ((recentPlayers - prevPlayers) / prevPlayers) * 100 : 0;

    res.json({
      overview: {
        totalTickets,
        totalPlayers,
        totalStaff,
        activeTickets,
        ticketChange: Math.round(ticketChange),
        playerChange: Math.round(playerChange)
      }
    });
  } catch (error) {
    console.error('Analytics overview error:', error);
    res.status(500).json({ message: 'Failed to fetch analytics overview' });
  }
});

// Get ticket analytics
router.get('/tickets', async (req, res) => {
  try {
    if (!req.serverDbConnection) {
      return res.status(503).json({ error: 'Database connection not available' });
    }
    
    const db = req.serverDbConnection;
    const Ticket = db.model('Ticket');
    
    const { period = '30d' } = req.query;
    let startDate = new Date();
    
    switch (period) {
      case '7d':
        startDate = subMonths(new Date(), 0.25);
        break;
      case '30d':
        startDate = subMonths(new Date(), 1);
        break;
      case '90d':
        startDate = subMonths(new Date(), 3);
        break;
      case '1y':
        startDate = subMonths(new Date(), 12);
        break;
    }

    // Get tickets by status (exclude unfinished statuses)
    const finishedStatuses = ['Resolved', 'Closed', 'resolved', 'closed'];
    const ticketsByStatus = await Ticket.aggregate([
      { $match: { created: { $gte: startDate }, status: { $in: finishedStatuses } } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Get tickets by category (exclude unfinished statuses) - using type field
    const ticketsByCategory = await Ticket.aggregate([
      { $match: { created: { $gte: startDate }, status: { $in: finishedStatuses } } },
      {
        $addFields: {
          normalizedCategory: { 
            $switch: {
              branches: [
                { case: { $eq: ['$type', 'bug'] }, then: 'Bug' },
                { case: { $eq: ['$type', 'support'] }, then: 'Support' },
                { case: { $eq: ['$type', 'appeal'] }, then: 'Appeal' },
                { case: { $eq: ['$type', 'player'] }, then: 'Player Report' },
                { case: { $eq: ['$type', 'chat'] }, then: 'Chat Report' },
                { case: { $eq: ['$type', 'staff'] }, then: 'Application' },
                { case: { $or: [
                  { $eq: ['$type', null] }, 
                  { $eq: ['$type', ''] },
                  { $not: ['$type'] }
                ]}, then: 'Other' }
              ],
              default: 'Other'
            }
          }
        }
      },
      { $group: { _id: '$normalizedCategory', count: { $sum: 1 } } }
    ]);

    // Get average resolution time by category - using type field
    const avgResolutionByCategory = await Ticket.aggregate([
      { 
        $match: { 
          status: { $in: finishedStatuses },
          created: { $gte: startDate },
          updatedAt: { $exists: true }
        } 
      },
      {
        $addFields: {
          normalizedCategory: { 
            $switch: {
              branches: [
                { case: { $eq: ['$type', 'bug'] }, then: 'Bug' },
                { case: { $eq: ['$type', 'support'] }, then: 'Support' },
                { case: { $eq: ['$type', 'appeal'] }, then: 'Appeal' },
                { case: { $eq: ['$type', 'player'] }, then: 'Player Report' },
                { case: { $eq: ['$type', 'chat'] }, then: 'Chat Report' },
                { case: { $eq: ['$type', 'staff'] }, then: 'Application' },
                { case: { $or: [
                  { $eq: ['$type', null] }, 
                  { $eq: ['$type', ''] },
                  { $not: ['$type'] }
                ]}, then: 'Other' }
              ],
              default: 'Other'
            }
          },
          resolutionTimeMs: { $subtract: ['$updatedAt', '$created'] }
        }
      },
      {
        $group: {
          _id: '$normalizedCategory',
          avgResolutionMs: { $avg: '$resolutionTimeMs' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Calculate overall average resolution time
    const overallAvgResolution = await Ticket.aggregate([
      { 
        $match: { 
          status: { $in: finishedStatuses },
          created: { $gte: startDate },
          updatedAt: { $exists: true }
        } 
      },
      {
        $addFields: {
          resolutionTimeMs: { $subtract: ['$updatedAt', '$created'] }
        }
      },
      {
        $group: {
          _id: null,
          avgResolutionMs: { $avg: '$resolutionTimeMs' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Get daily trend data by category - using type field
    const dailyTrendByCategory = await Ticket.aggregate([
      { $match: { created: { $gte: startDate } } },
      {
        $addFields: {
          normalizedCategory: { 
            $switch: {
              branches: [
                { case: { $eq: ['$type', 'bug'] }, then: 'Bug' },
                { case: { $eq: ['$type', 'support'] }, then: 'Support' },
                { case: { $eq: ['$type', 'appeal'] }, then: 'Appeal' },
                { case: { $eq: ['$type', 'player'] }, then: 'Player Report' },
                { case: { $eq: ['$type', 'chat'] }, then: 'Chat Report' },
                { case: { $eq: ['$type', 'staff'] }, then: 'Application' },
                { case: { $or: [
                  { $eq: ['$type', null] }, 
                  { $eq: ['$type', ''] },
                  { $not: ['$type'] }
                ]}, then: 'Other' }
              ],
              default: 'Other'
            }
          }
        }
      },
      {
        $group: {
          _id: { 
            date: { $dateToString: { format: '%Y-%m-%d', date: '$created' } },
            category: '$normalizedCategory',
            status: '$status'
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);

    // Get response time data by category - using type field
    const responseTimeByCategory = await Ticket.aggregate([
      { 
        $match: { 
          created: { $gte: startDate },
          'messages.0': { $exists: true } // Has at least one response
        } 
      },
      {
        $addFields: {
          normalizedCategory: { 
            $switch: {
              branches: [
                { case: { $eq: ['$type', 'bug'] }, then: 'Bug' },
                { case: { $eq: ['$type', 'support'] }, then: 'Support' },
                { case: { $eq: ['$type', 'appeal'] }, then: 'Appeal' },
                { case: { $eq: ['$type', 'player'] }, then: 'Player Report' },
                { case: { $eq: ['$type', 'chat'] }, then: 'Chat Report' },
                { case: { $eq: ['$type', 'staff'] }, then: 'Application' },
                { case: { $or: [
                  { $eq: ['$type', null] }, 
                  { $eq: ['$type', ''] },
                  { $not: ['$type'] }
                ]}, then: 'Other' }
              ],
              default: 'Other'
            }
          },
          firstResponse: { $arrayElemAt: ['$messages', 0] },
          responseTimeMs: { 
            $subtract: [
              { $arrayElemAt: ['$messages.timestamp', 0] },
              '$created'
            ]
          }
        }
      },
      {
        $match: {
          responseTimeMs: { $gt: 0 } // Valid response time
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$created' } },
            category: '$normalizedCategory'
          },
          avgResponseTimeMs: { $avg: '$responseTimeMs' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);

    // Format resolution times
    const formatResolutionTime = (ms) => {
      if (!ms) return { seconds: 0, minutes: 0, hours: 0, display: '0s' };
      
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      
      let display = '';
      if (days > 0) display += `${days}d `;
      if (hours % 24 > 0) display += `${hours % 24}h `;
      if (minutes % 60 > 0) display += `${minutes % 60}m `;
      if (seconds % 60 > 0 && days === 0) display += `${seconds % 60}s`;
      
      return {
        seconds: seconds % 60,
        minutes: minutes % 60,
        hours: hours % 24,
        days,
        totalSeconds: seconds,
        totalMinutes: minutes,
        totalHours: hours,
        display: display.trim() || '0s'
      };
    };
    
    const avgResolutionByCtg = avgResolutionByCategory.map(item => ({
      category: item._id || 'Uncategorized',
      ...formatResolutionTime(item.avgResolutionMs),
      ticketCount: item.count
    }));

    const overallAvg = overallAvgResolution.length > 0 ? 
      formatResolutionTime(overallAvgResolution[0].avgResolutionMs) : 
      formatResolutionTime(0);

    res.json({
      byStatus: ticketsByStatus.map(item => ({ status: item._id, count: item.count })),
      byCategory: ticketsByCategory.map(item => ({ category: item._id || 'Uncategorized', count: item.count })),
      avgResolutionByCategory: avgResolutionByCtg,
      overallAvgResolution: overallAvg,
      dailyTrendByCategory,
      responseTimeByCategory,
      totalFinishedTickets: overallAvgResolution.length > 0 ? overallAvgResolution[0].count : 0
    });
  } catch (error) {
    console.error('Ticket analytics error:', error);
    res.status(500).json({ message: 'Failed to fetch ticket analytics' });
  }
});

// Get staff performance analytics
router.get('/staff-performance', async (req, res) => {
  try {
    if (!req.serverDbConnection) {
      return res.status(503).json({ error: 'Database connection not available' });
    }
    
    const db = req.serverDbConnection;
    const Ticket = db.model('Ticket');
    const Player = db.model('Player');
    const Staff = db.model('Staff');
    
    const { period = '30d' } = req.query;
    let startDate = new Date();
    
    switch (period) {
      case '7d':
        startDate = subMonths(new Date(), 0.25);
        break;
      case '30d':
        startDate = subMonths(new Date(), 1);
        break;
      case '90d':
        startDate = subMonths(new Date(), 3);
        break;
    }

    const staffMembers = await Staff.find({});
    const staffPerformance = [];

    for (const staff of staffMembers) {
      // Count ticket responses
      const ticketResponses = await Ticket.countDocuments({
        'replies.name': staff.username,
        'replies.created': { $gte: startDate }
      });

      // Count punishments issued
      const punishmentsIssued = await Player.countDocuments({
        'punishments.issuerName': staff.username,
        'punishments.issued': { $gte: startDate }
      });

      // Count notes added
      const notesAdded = await Player.countDocuments({
        'notes.issuerName': staff.username,
        'notes.date': { $gte: startDate }
      });

      staffPerformance.push({
        id: staff._id,
        username: staff.username,
        role: staff.role,
        ticketResponses,
        punishmentsIssued,
        notesAdded,
        totalActions: ticketResponses + punishmentsIssued + notesAdded
      });
    }

    // Sort by total actions
    staffPerformance.sort((a, b) => b.totalActions - a.totalActions);

    res.json({ staffPerformance });
  } catch (error) {
    console.error('Staff performance analytics error:', error);
    res.status(500).json({ message: 'Failed to fetch staff performance analytics' });
  }
});

// Get punishment analytics
router.get('/punishments', async (req, res) => {
  try {
    if (!req.serverDbConnection) {
      return res.status(503).json({ error: 'Database connection not available' });
    }
    
    const db = req.serverDbConnection;
    const Player = db.model('Player');
    
    const { period = '30d' } = req.query;
    let startDate = new Date();
    
    switch (period) {
      case '7d':
        startDate = subMonths(new Date(), 0.25);
        break;
      case '30d':
        startDate = subMonths(new Date(), 1);
        break;
      case '90d':
        startDate = subMonths(new Date(), 3);
        break;
      case '1y':
        startDate = subMonths(new Date(), 12);
        break;
    }

    // Get punishment type settings from database
    const punishmentTypesConfig = await getPunishmentTypesConfig(db);

    // Get punishments by type using proper type mapping
    const punishmentTypesData = await Player.aggregate([
      { $unwind: '$punishments' },
      { $match: { 'punishments.issued': { $gte: startDate } } },
      {
        $group: {
          _id: '$punishments.type_ordinal',
          count: { $sum: 1 }
        }
      }
    ]);

    // Map punishment types using settings configuration
    const punishmentsByType = punishmentTypesData.map(item => ({
      type: mapPunishmentType(null, item._id, punishmentTypesConfig),
      count: item.count
    }));

    // Get daily punishment trend
    const dailyPunishments = await Player.aggregate([
      { $unwind: '$punishments' },
      { $match: { 'punishments.issued': { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$punishments.issued' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get top punishment reasons
    const topReasons = await Player.aggregate([
      { $unwind: '$punishments' },
      { $match: { 
        'punishments.issued': { $gte: startDate },
        'punishments.data.reason': { $exists: true }
      }},
      { $group: { _id: '$punishments.data.reason', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Get top punishers (staff members)
    const topPunishersData = await Player.aggregate([
      { $unwind: '$punishments' },
      { $match: { 
        'punishments.issued': { $gte: startDate },
        'punishments.issuerName': { $exists: true, $ne: null }
      }},
      { $group: { 
        _id: '$punishments.issuerName', 
        punishmentCount: { $sum: 1 } 
      }},
      { $sort: { punishmentCount: -1 } },
      { $limit: 10 }
    ]);

    // Get staff roles for top punishers
    const Staff = db.model('Staff');
    const topPunishers = await Promise.all(
      topPunishersData.map(async (punisher) => {
        const staffDoc = await Staff.findOne({ username: punisher._id });
        return {
          staffName: punisher._id,
          role: staffDoc?.role || 'User',
          punishmentCount: punisher.punishmentCount
        };
      })
    );

    res.json({
      byType: punishmentsByType,
      dailyTrend: dailyPunishments.map(item => ({ date: item._id, count: item.count })),
      topReasons: topReasons.map(item => ({ reason: item._id, count: item.count })),
      topPunishers: topPunishers
    });
  } catch (error) {
    console.error('Punishment analytics error:', error);
    res.status(500).json({ message: 'Failed to fetch punishment analytics' });
  }
});

// Get player activity analytics
router.get('/player-activity', async (req, res) => {
  try {
    if (!req.serverDbConnection) {
      return res.status(503).json({ error: 'Database connection not available' });
    }
    
    const db = req.serverDbConnection;
    const Player = db.model('Player');
    
    const { period = '30d' } = req.query;
    let startDate = new Date();
    
    switch (period) {
      case '7d':
        startDate = subMonths(new Date(), 0.25);
        break;
      case '30d':
        startDate = subMonths(new Date(), 1);
        break;
      case '90d':
        startDate = subMonths(new Date(), 3);
        break;
    }

    // Get new players trend
    const newPlayersTrend = await Player.aggregate([
      { $unwind: '$usernames' },
      { $match: { 'usernames.date': { $gte: startDate } } },
      {
        $group: {
          _id: { 
            date: { $dateToString: { format: '%Y-%m-%d', date: '$usernames.date' } },
            uuid: '$minecraftUuid'
          }
        }
      },
      {
        $group: {
          _id: '$_id.date',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get player login activity by country
    const loginsByCountry = await Player.aggregate([
      { $unwind: '$ipAddresses' },
      { $match: { 'ipAddresses.firstLogin': { $gte: startDate } } },
      { $group: { _id: '$ipAddresses.country', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Get suspicious activity (proxy/hosting IPs)
    const suspiciousActivity = await Player.aggregate([
      { $unwind: '$ipAddresses' },
      { $match: { 
        'ipAddresses.firstLogin': { $gte: startDate },
        $or: [
          { 'ipAddresses.proxy': true },
          { 'ipAddresses.hosting': true }
        ]
      }},
      { $group: { 
        _id: null, 
        proxyCount: { $sum: { $cond: ['$ipAddresses.proxy', 1, 0] } },
        hostingCount: { $sum: { $cond: ['$ipAddresses.hosting', 1, 0] } }
      }}
    ]);

    res.json({
      newPlayersTrend: newPlayersTrend.map(item => ({ date: item._id, count: item.count })),
      loginsByCountry: loginsByCountry.map(item => ({ 
        country: item._id || 'Unknown', 
        count: item.count 
      })),
      suspiciousActivity: suspiciousActivity[0] || { proxyCount: 0, hostingCount: 0 }
    });
  } catch (error) {
    console.error('Player activity analytics error:', error);
    res.status(500).json({ message: 'Failed to fetch player activity analytics' });
  }
});

// Get audit log analytics
router.get('/audit-logs', async (req, res) => {
  try {
    if (!req.serverDbConnection) {
      return res.status(503).json({ error: 'Database connection not available' });
    }
    
    const db = req.serverDbConnection;
    const Log = db.model('Log');
    
    const { period = '7d' } = req.query;
    let startDate = new Date();
    
    switch (period) {
      case '24h':
        startDate = subMonths(new Date(), 0.033);
        break;
      case '7d':
        startDate = subMonths(new Date(), 0.25);
        break;
      case '30d':
        startDate = subMonths(new Date(), 1);
        break;
    }

    // Get logs by level
    const logsByLevel = await Log.aggregate([
      { $match: { created: { $gte: startDate } } },
      { $group: { _id: '$level', count: { $sum: 1 } } }
    ]);

    // Get logs by source
    const logsBySource = await Log.aggregate([
      { $match: { created: { $gte: startDate } } },
      { $group: { _id: '$source', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Get hourly log trend for last 24 hours
    const hourlyTrend = await Log.aggregate([
      { $match: { created: { $gte: subMonths(new Date(), 0.033) } } },
      {
        $group: {
          _id: { 
            $dateToString: { 
              format: '%Y-%m-%d %H:00', 
              date: '$created' 
            }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      byLevel: logsByLevel.map(item => ({ level: item._id, count: item.count })),
      bySource: logsBySource.map(item => ({ source: item._id, count: item.count })),
      hourlyTrend: hourlyTrend.map(item => ({ hour: item._id, count: item.count }))
    });
  } catch (error) {
    console.error('Audit log analytics error:', error);
    res.status(500).json({ message: 'Failed to fetch audit log analytics' });
  }
});

export default router;