import express, { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Connection, Document } from 'mongoose';
import { createSystemLog } from './log-routes';
import { calculatePlayerStatus, updatePunishmentDataStructure } from '../utils/player-status-calculator';
import { checkPermission } from '../middleware/permission-middleware';
import { checkRole } from '../middleware/role-middleware';

// Local type definitions (temporary replacement for missing shared types)
interface IIPAddress {
  ipAddress: string;
  country?: string;
  region?: string;
  asn?: string;
  proxy?: boolean;
  hosting?: boolean;
  firstLogin: Date;
  logins: Date[];
}

interface IUsername {
  username: string;
  date: Date;
}

interface INote {
  id: string;
  text: string;
  issuerName: string;
  date: Date;
}

interface IPunishmentNote {
  _id?: any;
  text: string;
  issuerName: string;
  date: Date;
}

interface IEvidence {
  text: string;
  issuerName: string;
  date: Date;
}

interface IPunishment {
  id: string;
  issuerName: string;
  issued: Date;
  started?: Date;
  type_ordinal: number;
  modifications: any[];
  notes: IPunishmentNote[];
  evidence: (string | IEvidence)[];
  attachedTicketIds: string[];
  data: Map<string, any>;
}

interface IPlayer {
  _id?: any;
  minecraftUuid: string;
  usernames: IUsername[];
  ipAddresses: IIPAddress[];
  notes: INote[];
  punishments: IPunishment[];
  save(): Promise<IPlayer>;
}

interface IIPInfo {
  status?: string;
  message?: string;
  countryCode?: string;
  regionName?: string;
  city?: string;
  as?: string;
  proxy?: boolean;
  hosting?: boolean;
}

const router = express.Router();

router.use((req: Request, res: Response, next: NextFunction): void => {
  if (!req.serverDbConnection) {
    console.error('Player route accessed without serverDbConnection.');
    res.status(503).json({
      status: 503,
      error: 'Service Unavailable: Database connection not established for this server.'
    });
    return;
  }
  if (!req.serverName) {
    console.error('Player route accessed without serverName.');
    res.status(500).json({
      status: 500,
      error: 'Internal Server Error: Server name not identified.'
    });
    return;
  }
  next();
});

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const Player = req.serverDbConnection!.model<IPlayer>('Player');
  try {
    const search = req.query.search as string;
    let query = {};
    
    if (search) {
      // Check if search term is a UUID
      const isUuid = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(search);
      
      if (isUuid) {
        query = { minecraftUuid: search };
      } else {
        // Search by username (case-insensitive, exact match for better accuracy)
        query = {
          'usernames.username': { $regex: new RegExp(`^${search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') }
        };
      }
    }
    
    const players = await Player.find(query);
    const formattedPlayers = players.map(player => {
      // Check if player is currently online
      const isOnline = player.data?.get('isOnline') === true;
      
      // Check if player is banned
      const isBanned = player.punishments?.some((p: any) => p.type === 'BAN' && p.active);
      
      // Determine status
      let status = 'Offline';
      if (isBanned) {
        status = 'Banned';
      } else if (isOnline) {
        status = 'Online';
      }
      
      return {
        uuid: player.minecraftUuid,
        username: player.usernames?.length > 0 
          ? player.usernames[player.usernames.length - 1].username 
          : 'Unknown',
        status: status,
        lastOnline: player.data?.get('lastLogin') || null
      };
    });
    res.json(formattedPlayers);
  } catch (error) {
    console.error('Error fetching players:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:uuid', async (req: Request<{ uuid: string }>, res: Response): Promise<void> => {
  const Player = req.serverDbConnection!.model<IPlayer>('Player');
  try {
    const player = await Player.findOne({ minecraftUuid: req.params.uuid });
    if (!player) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    // Calculate player status
    try {
      const Settings = req.serverDbConnection!.model('Settings');
      const settings = await Settings.findOne({});
      
      let punishmentTypes = [];
      let thresholds = {
        gameplay: { medium: 5, habitual: 10 },
        social: { medium: 4, habitual: 8 }
      };

      if (settings?.settings) {
        // Get punishment types
        if (settings.settings.punishmentTypes) {
          punishmentTypes = typeof settings.settings.punishmentTypes === 'string' 
            ? JSON.parse(settings.settings.punishmentTypes) 
            : settings.settings.punishmentTypes;
        }

        // Get status thresholds
        if (settings.settings.statusThresholds) {
          const settingsThresholds = typeof settings.settings.statusThresholds === 'string'
            ? JSON.parse(settings.settings.statusThresholds)
            : settings.settings.statusThresholds;
          
          if (settingsThresholds) {
            thresholds = settingsThresholds;
          }
        }
      }

      // Calculate status using the player's punishments
      const playerStatus = calculatePlayerStatus(
        player.punishments || [],
        punishmentTypes,
        thresholds
      );      // Calculate latest IP data with proxy/non-proxy priority
      let latestIPData = null;
      const ipList = player.ipList || player.ipAddresses || []; // Support both field names
      if (ipList && ipList.length > 0) {
        // Sort IPs by recency first
        const sortedIPs = ipList.sort((a, b) => {
          const aLatest = a.logins && a.logins.length > 0 ? 
            Math.max(...a.logins.map(login => new Date(login).getTime())) : 
            new Date(a.firstLogin).getTime();
          const bLatest = b.logins && b.logins.length > 0 ? 
            Math.max(...b.logins.map(login => new Date(login).getTime())) : 
            new Date(b.firstLogin).getTime();
          return bLatest - aLatest;
        });
        
        // Prefer latest non-proxy IP, fallback to latest proxy IP if no non-proxy exists
        const latestNonProxyIP = sortedIPs.find(ip => !ip.proxy && !ip.hosting);
        const latestIP = latestNonProxyIP || sortedIPs[0];
        
        if (latestIP) {
          latestIPData = {
            country: latestIP.country,
            region: latestIP.region,
            ipAddress: latestIP.ipAddress,
            proxy: latestIP.proxy || false,
            hosting: latestIP.hosting || false,
            asn: latestIP.asn
          };
        }
      }

      // Calculate additional player metrics
      const totalPlaytime = player.data?.get('totalPlaytime') || 0; // in milliseconds
      const lastServer = player.data?.get('lastServer') || 'Unknown';
      
      // Convert player data Map to plain object for JSON serialization
      const playerObj = player.toObject();
      const dataObj: { [key: string]: any } = {};
      if (playerObj.data && playerObj.data instanceof Map) {
        for (const [key, value] of playerObj.data.entries()) {
          dataObj[key] = value;
        }
      } else if (playerObj.data) {
        Object.assign(dataObj, playerObj.data);
      }

      // Add calculated status to player data
      const enhancedPlayer = {
        ...playerObj,
        data: dataObj, // Use converted plain object
        social: playerStatus.social,
        gameplay: playerStatus.gameplay,
        socialPoints: playerStatus.socialPoints,
        gameplayPoints: playerStatus.gameplayPoints,
        latestIPData: latestIPData,
        lastServer: lastServer,
        playtime: Math.round(totalPlaytime / (1000 * 60 * 60 * 100)) / 100, // Convert to hours with 2 decimal places
        // Transform punishments to include properly extracted data from Maps
        punishments: player.punishments.map((punishment: any) => {
          const punishmentObj = punishment.toObject ? punishment.toObject() : punishment;
          
          // If data is a Map, convert it to a plain object
          if (punishmentObj.data && punishmentObj.data instanceof Map) {
            const dataObj: { [key: string]: any } = {};
            for (const [key, value] of punishmentObj.data.entries()) {
              dataObj[key] = value;
            }
            punishmentObj.data = dataObj;
          }
          
          // Extract common fields that might be in the data Map
          const expires = punishmentObj.data?.expires;
          const duration = punishmentObj.data?.duration;
          const active = punishmentObj.data?.active;
          
          return {
            ...punishmentObj,
            expires: expires,
            duration: duration,
            active: active !== false, // Default to true if not explicitly false
          };
        })
      };

      res.json(enhancedPlayer);    } catch (statusError) {
      console.error('Error calculating player status:', statusError);
      
      // Calculate latest IP data with proxy/non-proxy priority (same as above)
      let latestIPData = null;
      const ipList = player.ipList || player.ipAddresses || []; // Support both field names
      if (ipList && ipList.length > 0) {
        // Sort IPs by recency first
        const sortedIPs = ipList.sort((a, b) => {
          const aLatest = a.logins && a.logins.length > 0 ? 
            Math.max(...a.logins.map(login => new Date(login).getTime())) : 
            new Date(a.firstLogin).getTime();
          const bLatest = b.logins && b.logins.length > 0 ? 
            Math.max(...b.logins.map(login => new Date(login).getTime())) : 
            new Date(b.firstLogin).getTime();
          return bLatest - aLatest;
        });
        
        // Prefer latest non-proxy IP, fallback to latest proxy IP if no non-proxy exists
        const latestNonProxyIP = sortedIPs.find(ip => !ip.proxy && !ip.hosting);
        const latestIP = latestNonProxyIP || sortedIPs[0];
        
        if (latestIP) {
          latestIPData = {
            country: latestIP.country,
            region: latestIP.region,
            ipAddress: latestIP.ipAddress,
            proxy: latestIP.proxy || false,
            hosting: latestIP.hosting || false,
            asn: latestIP.asn
          };
        }
      }
      
      // Calculate additional player metrics (same as above)
      const totalPlaytime = player.data?.get('totalPlaytime') || 0; // in milliseconds
      const lastServer = player.data?.get('lastServer') || 'Unknown';
      
      // Convert player data Map to plain object for JSON serialization (same as above)
      const playerObj = player.toObject();
      const dataObj: { [key: string]: any } = {};
      if (playerObj.data && playerObj.data instanceof Map) {
        for (const [key, value] of playerObj.data.entries()) {
          dataObj[key] = value;
        }
      } else if (playerObj.data) {
        Object.assign(dataObj, playerObj.data);
      }
      
      // Return player without calculated status if calculation fails, but still process punishments
      const enhancedPlayer = {
        ...playerObj,
        data: dataObj, // Use converted plain object
        latestIPData: latestIPData,
        lastServer: lastServer,
        playtime: Math.round(totalPlaytime / (1000 * 60 * 60 * 100)) / 100, // Convert to hours with 2 decimal places
        // Transform punishments to include properly extracted data from Maps
        punishments: player.punishments.map((punishment: any) => {
          const punishmentObj = punishment.toObject ? punishment.toObject() : punishment;
          
          // If data is a Map, convert it to a plain object
          if (punishmentObj.data && punishmentObj.data instanceof Map) {
            const dataObj: { [key: string]: any } = {};
            for (const [key, value] of punishmentObj.data.entries()) {
              dataObj[key] = value;
            }
            punishmentObj.data = dataObj;
          }
          
          // Extract common fields that might be in the data Map
          const expires = punishmentObj.data?.expires;
          const duration = punishmentObj.data?.duration;
          const active = punishmentObj.data?.active;
          
          return {
            ...punishmentObj,
            expires: expires,
            duration: duration,
            active: active !== false, // Default to true if not explicitly false
          };
        })
      };
      res.json(enhancedPlayer);
    }
  } catch (error) {
    console.error('Error fetching player:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

interface PlayerLoginBody {
  minecraftUuid: string;
  username: string;
  ipAddress: string;
}

router.post('/login', async (req: Request<{}, {}, PlayerLoginBody>, res: Response): Promise<void> => {
  const Player = req.serverDbConnection!.model<IPlayer>('Player');
  
  try {
    const { minecraftUuid, username, ipAddress } = req.body;

    if (!minecraftUuid || !username || !ipAddress) {
        return res.status(400).json({ error: 'Missing minecraftUuid, username, or ipAddress' });
    }

    let ipInfo: IIPInfo = {};
    try {
        const response = await fetch(`http://ip-api.com/json/${ipAddress}?fields=status,message,countryCode,regionName,city,as,proxy,hosting`);
        ipInfo = await response.json() as IIPInfo;
        if (ipInfo.status !== 'success') {
            console.warn(`Failed to fetch IP info for ${ipAddress}: ${ipInfo.message}`);
        }
    } catch (fetchError) {
        console.error(`Error fetching IP info for ${ipAddress}:`, fetchError);
    }

    let player = await Player.findOne({ minecraftUuid });    if (player) {
      const existingIp = player.ipAddresses.find((ip: any) => ip.ipAddress === ipAddress);
      if (existingIp) {
        existingIp.logins.push(new Date());
      } else {
        player.ipAddresses.push({
          ipAddress,
          country: ipInfo.countryCode,
          region: ipInfo.city ? `${ipInfo.regionName}, ${ipInfo.city}` : ipInfo.regionName,
          asn: ipInfo.as,
          proxy: ipInfo.proxy || false,
          hosting: ipInfo.hosting || false,
          firstLogin: new Date(),
          logins: [new Date()]
        });
      }

      const existingUsername = player.usernames.find((u: any) => u.username.toLowerCase() === username.toLowerCase());
      if (!existingUsername) {
        player.usernames.push({ username, date: new Date() });
      }
      player.data = player.data || new Map<string, any>();
      player.data.set('lastLogin', new Date());
      
      await player.save({ validateBeforeSave: false });
      await createSystemLog(req.serverDbConnection, req.serverName, `Player ${username} (${minecraftUuid}) logged in. IP: ${ipAddress}.`, 'info', 'player-api');
      return res.status(200).json(player);
    }    player = new Player({
      _id: uuidv4(),
      minecraftUuid,
      usernames: [{ username, date: new Date() }],
      notes: [],
      ipAddresses: [{
        ipAddress,
        country: ipInfo.countryCode,
        region: ipInfo.city ? `${ipInfo.regionName}, ${ipInfo.city}` : ipInfo.regionName,
        asn: ipInfo.as,
        proxy: ipInfo.proxy || false,
        hosting: ipInfo.hosting || false,
        firstLogin: new Date(),
        logins: [new Date()]
      }],
      punishments: [],
      pendingNotifications: [],
      data: new Map<string, any>([['firstJoin', new Date()], ['lastLogin', new Date()]])
    });

    await player.save({ validateBeforeSave: false });
    await createSystemLog(req.serverDbConnection, req.serverName, `New player ${username} (${minecraftUuid}) created and logged in. IP: ${ipAddress}.`, 'info', 'player-api');
    res.status(201).json(player);
  } catch (error) {
    console.error('Error in player login/creation:', error);
    await createSystemLog(req.serverDbConnection, req.serverName, `Error in player login/creation for ${req.body.username} (${req.body.minecraftUuid}): ${(error as Error).message}`, 'error', 'player-api');
    res.status(500).json({ error: 'Internal server error' });
  }
});

interface CreatePlayerBody {
    minecraftUuid: string;
    username: string;
}
router.post('/', async (req: Request<{}, {}, CreatePlayerBody>, res: Response): Promise<void> => {
  const Player = req.serverDbConnection!.model<IPlayer>('Player');
  try {
    const { minecraftUuid, username } = req.body;    if (!minecraftUuid || !username) {
        res.status(400).json({ error: 'Missing minecraftUuid or username' });
        return;
    }
        
    const existingPlayer = await Player.findOne({ minecraftUuid });
    if (existingPlayer) {
      res.status(400).json({ error: 'Player already exists' });
      return;
    }
      const player = new Player({
      _id: uuidv4(),
      minecraftUuid,
      usernames: [{ username, date: new Date() }],
      notes: [],
      ipAddresses: [],
      punishments: [],
      pendingNotifications: [],
      data: new Map<string, any>([['firstJoin', new Date()]])
    });
    
    await player.save({ validateBeforeSave: false });
    await createSystemLog(req.serverDbConnection, req.serverName, `New player ${username} (${minecraftUuid}) created via API.`, 'info', 'player-api');
    res.status(201).json(player);
  } catch (error) {
    console.error('Error creating player:', error);
    await createSystemLog(req.serverDbConnection, req.serverName, `Error creating player ${req.body.username} (${req.body.minecraftUuid}): ${(error as Error).message}`, 'error', 'player-api');
    res.status(500).json({ error: 'Internal server error' });
  }
});

interface AddUsernameBody {
    username: string;
}
router.post('/:uuid/usernames', async (req: Request<{ uuid: string }, {}, AddUsernameBody>, res: Response): Promise<void> => {
  const Player = req.serverDbConnection!.model<IPlayer>('Player');
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username is required' });
    
    const player = await Player.findOne({ minecraftUuid: req.params.uuid });
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    const existingUsername = player.usernames.find((u: any) => u.username.toLowerCase() === username.toLowerCase());
    if (!existingUsername) {
        player.usernames.push({ username, date: new Date() });
        await player.save({ validateBeforeSave: false });
        await createSystemLog(req.serverDbConnection, req.serverName, `Username ${username} added to player ${req.params.uuid}.`, 'info', 'player-api');
    }
    res.json(player);
  } catch (error) {
    console.error('Error adding username:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

interface AddNoteBody {
    text: string;
    issuerName: string;
    issuerId?: string;
}
router.post('/:uuid/notes', async (req: Request<{ uuid: string }, {}, AddNoteBody>, res: Response): Promise<void> => {
  const Player = req.serverDbConnection!.model<IPlayer>('Player');
  try {
    const { text, issuerName, issuerId } = req.body;
    if (!text || !issuerName) return res.status(400).json({ error: 'Text and issuerName are required for notes' });
    
    const player = await Player.findOne({ minecraftUuid: req.params.uuid });
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    player.notes.push({ text, issuerName, issuerId, date: new Date() });
    await player.save({ validateBeforeSave: false });
    await createSystemLog(req.serverDbConnection, req.serverName, `Note added to player ${req.params.uuid} by ${issuerName}.`, 'info', 'player-api');
    res.json(player);
  } catch (error) {
    console.error('Error adding note:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

interface AddIpBody {
    ipAddress: string;
}
router.post('/:uuid/ips', async (req: Request<{ uuid: string }, {}, AddIpBody>, res: Response): Promise<void> => {
  const Player = req.serverDbConnection!.model<IPlayer>('Player');
  try {
    const { ipAddress } = req.body; 
    if (!ipAddress) return res.status(400).json({ error: 'ipAddress is required' });

    let ipInfo: IIPInfo = {};
    try {
        const response = await fetch(`http://ip-api.com/json/${ipAddress}?fields=status,message,countryCode,regionName,city,as,proxy,hosting`);
        ipInfo = await response.json() as IIPInfo;
        if (ipInfo.status !== 'success') {
            console.warn(`Failed to fetch IP info for ${ipAddress}: ${ipInfo.message}`);
        }
    } catch (fetchError) {
        console.error(`Error fetching IP info for ${ipAddress}:`, fetchError);
    }
    
    const player = await Player.findOne({ minecraftUuid: req.params.uuid });
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
      const existingIp = player.ipAddresses.find((ip: any) => ip.ipAddress === ipAddress);
    if (existingIp) {
      existingIp.logins.push(new Date());
    } else {
      player.ipAddresses.push({
        ipAddress,
        country: ipInfo.countryCode,
        region: ipInfo.city ? `${ipInfo.regionName}, ${ipInfo.city}` : ipInfo.regionName,
        asn: ipInfo.as,
        proxy: ipInfo.proxy || ipInfo.hosting,
        firstLogin: new Date(),
        logins: [new Date()]
      });
    }
    
    await player.save({ validateBeforeSave: false });
    await createSystemLog(req.serverDbConnection, req.serverName, `IP ${ipAddress} added/updated for player ${req.params.uuid}.`, 'info', 'player-api');
    res.json(player);
  } catch (error) {
    console.error('Error adding IP address:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

interface AddPunishmentBody {
    issuerName: string;
    type_ordinal: number;
    notes?: string[];
    evidence?: string[];
    attachedTicketIds?: string[];
    severity?: string;
    status?: string;
    data?: Record<string, any>; // For Map conversion
}
router.post('/:uuid/punishments', async (req: Request<{ uuid: string }, {}, AddPunishmentBody>, res: Response): Promise<void> => {
  // Permission checking is handled dynamically based on punishment type
  const Player = req.serverDbConnection!.model<IPlayer>('Player');
  try {
    const {
      issuerName, 
      type_ordinal,
      notes, 
      evidence,
      attachedTicketIds,
      severity,
      status,
      data
    } = req.body;

    if (!issuerName || type_ordinal === undefined) {
        return res.status(400).json({ error: 'issuerName and type_ordinal are required for punishments' });
    }

    // Check permission based on punishment type
    try {
      const Settings = req.serverDbConnection!.model('Settings');
      const punishmentTypesDoc = await Settings.findOne({ type: 'punishmentTypes' });
      let punishmentTypeName = 'Unknown';
      
      if (punishmentTypesDoc?.data) {
        const punishmentTypes = punishmentTypesDoc.data;
        const punishmentType = punishmentTypes.find((pt: any) => pt.ordinal === type_ordinal);
        if (punishmentType) {
          punishmentTypeName = punishmentType.name;
        }
      }

      const requiredPermission = `punishment.apply.${punishmentTypeName.toLowerCase().replace(/\s+/g, '-')}`;
      const { hasPermission } = await import('../middleware/permission-middleware');
      const hasRequiredPermission = await hasPermission(req, requiredPermission);
      
      if (!hasRequiredPermission) {
        return res.status(403).json({ 
          error: 'Forbidden: You do not have permission to apply this punishment type',
          required: requiredPermission,
          punishmentType: punishmentTypeName
        });
      }
    } catch (permissionError) {
      console.error('Error checking punishment permission:', permissionError);
      return res.status(500).json({ error: 'Internal server error while checking permissions' });
    }
    
    const player = await Player.findOne({ minecraftUuid: req.params.uuid });
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
      const id = uuidv4().substring(0, 8).toUpperCase();
      const punishmentData = new Map<string, any>();
    
    // Initialize required fields with defaults
    punishmentData.set('duration', 0);
    punishmentData.set('blockedName', null);
    punishmentData.set('blockedSkin', null);
    punishmentData.set('linkedBanId', null);
    punishmentData.set('linkedBanExpiry', null); // Set to null by default, only set for linked bans
    punishmentData.set('chatLog', null);
    punishmentData.set('altBlocking', false);
    punishmentData.set('wipeAfterExpiry', false);
    
    // Add severity and status to data map
    if (severity) {
        punishmentData.set('severity', severity);
    }
    if (status) {
        punishmentData.set('status', status);
    }
    
    // Override with any provided data (duration and other fields come from here now)
    if (data && typeof data === 'object') {
        for (const [key, value] of Object.entries(data)) {
            // Don't include reason in data - it should be the first note
            if (key !== 'reason') {
                punishmentData.set(key, value);
            }
        }
    }
    
    // Set linkedBanExpiry only for linked bans
    if (data?.linkedBanId) {
        punishmentData.set('linkedBanExpiry', new Date());
    }

    // Don't set expiry date until punishment is started by server
    // Duration will be used to calculate expiry when punishment is acknowledged as started
    
    const newPunishment: IPunishment = {
      id,
      issuerName,
      issued: new Date(),
      // Don't set started until server acknowledges execution
      started: undefined,
      type_ordinal,
      modifications: [],
      notes: notes || [],
      evidence: evidence || [],
      attachedTicketIds: attachedTicketIds || [],
      data: punishmentData
    };

    player.punishments.push(newPunishment);
    await player.save({ validateBeforeSave: false });
    await createSystemLog(req.serverDbConnection, req.serverName, `Punishment ID ${id} (Type: ${type_ordinal}) added to player ${req.params.uuid} by ${issuerName}.`, 'moderation', 'player-api');
    res.json(player);
  } catch (error) {
    console.error('Error adding punishment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

interface AddPunishmentModificationBody {
    type: string;
    issuerName: string;
    effectiveDuration?: number;
    reason?: string;
    appealTicketId?: string;
}
router.post('/:uuid/punishments/:punishmentId/modifications', async (req: Request<{ uuid: string, punishmentId: string }, {}, AddPunishmentModificationBody>, res: Response): Promise<void> => {
  const Player = req.serverDbConnection!.model<IPlayer>('Player');
  try {
    const { type, issuerName, effectiveDuration, reason, appealTicketId } = req.body;
    if (!type || !issuerName) return res.status(400).json({ error: 'Type and issuerName are required for modifications' });
    
    const player = await Player.findOne({ minecraftUuid: req.params.uuid });
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    const punishment = player.punishments.find((p: any) => p.id === req.params.punishmentId);
    if (!punishment) {
      return res.status(404).json({ error: 'Punishment not found' });
    }
      punishment.modifications.push({
      type,
      issuerName,
      issued: new Date(),
      effectiveDuration,
      reason,
      appealTicketId
    });
    
    // Apply the modification to the punishment's current state
    if (type === 'MANUAL_PARDON' || type === 'APPEAL_ACCEPT') {
      // Mark punishment as inactive
      punishment.data.set('active', false);
    } else if (type === 'APPEAL_REJECT') {
      // Appeal rejected - punishment remains active, just mark as reviewed
      punishment.data.set('appealReviewed', true);
    } else if (type === 'MANUAL_DURATION_CHANGE' || type === 'APPEAL_DURATION_CHANGE') {
      // Update the duration and recalculate expiry
      if (effectiveDuration !== undefined) {
        punishment.data.set('duration', effectiveDuration);
        
        // For duration modifications, calculate expiry from the modification time (not original punishment time)
        const modificationTime = new Date(); // Use current time as modification time
        if (effectiveDuration === 0) {
          // Permanent punishment
          punishment.data.delete('expires');
        } else {
          const newExpiry = new Date(modificationTime.getTime() + effectiveDuration);
          punishment.data.set('expires', newExpiry);
        }
      }
    } else if (type === 'SET_ALT_BLOCKING_TRUE') {
      punishment.data.set('altBlocking', true);
    } else if (type === 'SET_ALT_BLOCKING_FALSE') {
      punishment.data.set('altBlocking', false);
    } else if (type === 'SET_WIPING_TRUE') {
      punishment.data.set('wiping', true);
    } else if (type === 'SET_WIPING_FALSE') {
      punishment.data.set('wiping', false);
    }
    
    await player.save({ validateBeforeSave: false });
    await createSystemLog(req.serverDbConnection, req.serverName, `Modification of type '${type}' added to punishment ${req.params.punishmentId} for player ${req.params.uuid} by ${issuerName}.`, 'moderation', 'player-api');
    res.json(player);
  } catch (error) {
    console.error('Error adding modification:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:uuid/activePunishments', async (req: Request<{ uuid: string }>, res: Response): Promise<void> => {
  const Player = req.serverDbConnection!.model<IPlayer>('Player');
  try {
    const player = await Player.findOne({ minecraftUuid: req.params.uuid });
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
      const activePunishments = player.punishments.filter((punishment: any) => {
      if (punishment.data && punishment.data.get('active') === false) return false;
      if (!punishment.started) return false;

      const duration = punishment.data ? punishment.data.get('duration') : undefined;
      if (duration === -1 || duration === undefined) return true; 
      
      const startTime = new Date(punishment.started).getTime();
      const endTime = startTime + Number(duration);
      
      return endTime > Date.now();
    }).map((punishment: any) => {
      const punishmentObj = punishment.toObject ? punishment.toObject() : punishment;
      
      // If data is a Map, convert it to a plain object
      if (punishmentObj.data && punishmentObj.data instanceof Map) {
        const dataObj: { [key: string]: any } = {};
        for (const [key, value] of punishmentObj.data.entries()) {
          dataObj[key] = value;
        }
        punishmentObj.data = dataObj;
      }
      
      // Extract common fields that might be in the data Map
      const expires = punishmentObj.data?.expires;
      const duration = punishmentObj.data?.duration;
      const active = punishmentObj.data?.active;
      
      return {
        ...punishmentObj,
        expires: expires,
        duration: duration,
        active: active !== false, // Default to true if not explicitly false
      };
    });
    
    res.json(activePunishments);
  } catch (error) {
    console.error('Error fetching active punishments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get punishment by ID (searches across all players)
router.get('/punishment/:punishmentId', async (req: Request<{ punishmentId: string }>, res: Response): Promise<void> => {
  const Player = req.serverDbConnection!.model<IPlayer>('Player');
  try {
    const punishmentId = req.params.punishmentId;
    
    // Search for the punishment across all players
    const player = await Player.findOne({ 'punishments.id': punishmentId });
    
    if (!player) {
      return res.status(404).json({ error: 'Punishment not found' });
    }
    
    // Find the specific punishment within the player's punishments
    const punishment = player.punishments.find((p: any) => p.id === punishmentId);
    
    if (!punishment) {
      return res.status(404).json({ error: 'Punishment not found' });
    }
      // Get the punishment type name from settings if available
    let punishmentTypeName = 'Unknown';
    let punishmentTypeIsAppealable = true; // Default to appealable
    
    // First try to get from settings
    try {
      const Settings = req.serverDbConnection!.model('Settings');
      
      // Try both the punishmentTypes collection and settings.punishmentTypes
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
        }
      }
      
      if (punishmentTypes) {
        const punishmentType = punishmentTypes.find((pt: any) => pt.ordinal === punishment.type_ordinal);
        if (punishmentType) {
          punishmentTypeName = punishmentType.name;
          punishmentTypeIsAppealable = punishmentType.isAppealable !== false; // Default to true if not specified
        }
      }
    } catch (settingsError) {
      console.warn('Could not fetch punishment type name from settings:', settingsError);
    }
    
    // Fallback to core administrative types if still unknown
    if (punishmentTypeName === 'Unknown') {
      const coreTypes: { [key: number]: string } = {
        0: 'Kick',
        1: 'Manual Mute', 
        2: 'Manual Ban',
        3: 'Security Ban',
        4: 'Linked Ban',
        5: 'Blacklist'
      };
      if (coreTypes[punishment.type_ordinal]) {
        punishmentTypeName = coreTypes[punishment.type_ordinal];
      }
    }
      // Transform punishment data for the frontend
    const transformedPunishment = {
      id: punishment.id,
      type: punishmentTypeName,
      isAppealable: punishmentTypeIsAppealable,
      reason: punishment.data?.get('reason') || 'No reason provided',
      issued: punishment.issued,
      started: punishment.started,
      issuerName: punishment.issuerName,
      playerUuid: player.minecraftUuid,
      playerUsername: player.usernames.length > 0 ? player.usernames[player.usernames.length - 1].username : 'Unknown',
      active: true, // Default to true
      expires: null as Date | null,
      // Additional fields
      notes: punishment.notes || [],
      evidence: punishment.evidence || [],
      attachedTicketIds: punishment.attachedTicketIds || [],
      modifications: punishment.modifications || [],
      severity: punishment.data?.get('severity') || null,
      altBlocking: punishment.data?.get('altBlocking') || false,
      statWiping: punishment.data?.get('statWiping') || false,
      offenseLevel: punishment.data?.get('offenseLevel') || null,
      status: punishment.data?.get('status') || null
    };
    
    // Check if punishment is active
    if (punishment.data && punishment.data.get('active') === false) {
      transformedPunishment.active = false;
    }
    
    // Check expiry
    const duration = punishment.data?.get('duration');
    if (duration && duration > 0 && punishment.started) {
      const expiryDate = new Date(punishment.started.getTime() + duration);
      transformedPunishment.expires = expiryDate;
      
      if (expiryDate < new Date()) {
        transformedPunishment.active = false;
      }
    }
    
    res.json(transformedPunishment);
  } catch (error) {
    console.error('Error fetching punishment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search punishments by ID or player name
router.get('/punishments/search', async (req: Request, res: Response): Promise<void> => {
  const Player = req.serverDbConnection!.model<IPlayer>('Player');
  try {
    const query = req.query.q as string;
    const activeOnly = req.query.activeOnly === 'true';
    
    if (!query || query.trim().length < 2) {
      return res.json([]);
    }
    
    const searchTerm = query.trim();
    const results: any[] = [];
    
    // Search by punishment ID first (exact match)
    const playerByPunishmentId = await Player.findOne({ 'punishments.id': searchTerm });
    if (playerByPunishmentId) {
      const punishment = playerByPunishmentId.punishments.find((p: any) => p.id === searchTerm);
      if (punishment) {
        const isActive = punishment.data?.get ? punishment.data.get('active') !== false : punishment.data?.active !== false;
        const playerName = playerByPunishmentId.usernames.length > 0 
          ? playerByPunishmentId.usernames[playerByPunishmentId.usernames.length - 1].username 
          : 'Unknown';
        
        if (!activeOnly || isActive) {
          results.push({
            id: punishment.id,
            playerName,
            type: punishment.type_ordinal,
            status: isActive ? 'Active' : 'Inactive',
            issued: punishment.issued
          });
        }
      }
    }
    
    // Search by player name (if not found by punishment ID or if we want more results)
    if (results.length < 10) {
      const playersByName = await Player.find({
        'usernames.username': { $regex: new RegExp(searchTerm, 'i') }
      }).limit(10);
      
      for (const player of playersByName) {
        const playerName = player.usernames.length > 0 
          ? player.usernames[player.usernames.length - 1].username 
          : 'Unknown';
        
        for (const punishment of player.punishments) {
          const isActive = punishment.data?.get ? punishment.data.get('active') !== false : punishment.data?.active !== false;
          
          if (!activeOnly || isActive) {
            // Avoid duplicates if we already found this punishment by ID
            if (!results.find(r => r.id === punishment.id)) {
              results.push({
                id: punishment.id,
                playerName,
                type: punishment.type_ordinal,
                status: isActive ? 'Active' : 'Inactive',
                issued: punishment.issued
              });
            }
          }
        }
      }
    }
    
    // Sort by issued date (newest first) and limit results
    results.sort((a, b) => new Date(b.issued).getTime() - new Date(a.issued).getTime());
    res.json(results.slice(0, 20));
  } catch (error) {
    console.error('Error searching punishments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

interface AddPunishmentNoteBody {
  text: string;
  issuerName: string;
}

router.post('/:uuid/punishments/:punishmentId/notes', async (req: Request<{ uuid: string, punishmentId: string }, {}, AddPunishmentNoteBody>, res: Response): Promise<void> => {
  const Player = req.serverDbConnection!.model<IPlayer>('Player');
  try {
    const { text, issuerName } = req.body;
    if (!text || !issuerName) {
      res.status(400).json({ error: 'Text and issuerName are required for notes' });
      return;
    }
    
    const player = await Player.findOne({ minecraftUuid: req.params.uuid });
    if (!player) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }
    
    const punishment = player.punishments.find((p: any) => p.id === req.params.punishmentId);
    if (!punishment) {
      res.status(404).json({ error: 'Punishment not found' });
      return;
    }
    
    // Add note to punishment as an object with the required schema fields
    const newNote = {
      text: text,
      issuerName: issuerName,
      date: new Date()
    };
    
    punishment.notes.push(newNote);
    
    await player.save({ validateBeforeSave: false });
    await createSystemLog(req.serverDbConnection, req.serverName, `Note added to punishment ${req.params.punishmentId} for player ${req.params.uuid} by ${issuerName}.`, 'moderation', 'player-api');
    res.json(player);
  } catch (error) {
    console.error('Error adding punishment note:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get linked accounts for a player (panel version)
router.get('/:uuid/linked', async (req: Request<{ uuid: string }>, res: Response): Promise<void> => {
  const Player = req.serverDbConnection!.model<IPlayer>('Player');
  const minecraftUuid = req.params.uuid;
  
  try {
    const player = await Player.findOne({ minecraftUuid }).lean<IPlayer>();
    if (!player) {
      res.status(200).json({ linkedAccounts: [] });
      return;
    }

    const linkedAccountUuids = new Set<string>();

    // Method 1: Get linked accounts from stored data (new system)
    const storedLinkedAccounts = player.data?.linkedAccounts || [];
    if (storedLinkedAccounts && Array.isArray(storedLinkedAccounts)) {
      storedLinkedAccounts.forEach((uuid: string) => linkedAccountUuids.add(uuid));
      
    }

    // Method 2: Get linked accounts by IP addresses (legacy/fallback system)
    if (player.ipAddresses && player.ipAddresses.length > 0) {
      const playerIps = player.ipAddresses.map((ip: any) => ip.ipAddress);
      const ipLinkedPlayers = await Player.find({
        minecraftUuid: { $ne: minecraftUuid },
        'ipAddresses.ipAddress': { $in: playerIps }
      }).select('minecraftUuid').lean();
      
      ipLinkedPlayers.forEach((p: any) => linkedAccountUuids.add(p.minecraftUuid));
      
    }

    if (linkedAccountUuids.size === 0) {
      
      res.status(200).json({ linkedAccounts: [] });
      return;
    }

    // Get full player data for all linked accounts
    const linkedPlayers = await Player.find({
      minecraftUuid: { $in: Array.from(linkedAccountUuids) }
    }).select('minecraftUuid usernames punishments data').lean<IPlayer[]>();

    const formattedLinkedAccounts = linkedPlayers.map((acc: IPlayer) => {
      // Count active punishments (simplified - just check for recent punishments)
      const activeBans = acc.punishments ? acc.punishments.filter((p: any) => 
        (p.type_ordinal === 2 || p.type_ordinal === 4) && 
        p.started && 
        (!p.data?.expires || new Date(p.data.expires) > new Date())
      ).length : 0;
      
      const activeMutes = acc.punishments ? acc.punishments.filter((p: any) => 
        p.type_ordinal === 1 && 
        p.started && 
        (!p.data?.expires || new Date(p.data.expires) > new Date())
      ).length : 0;
      
      const lastLinkedUpdate = acc.data?.lastLinkedAccountUpdate;
      
      return {
        minecraftUuid: acc.minecraftUuid,
        username: acc.usernames && acc.usernames.length > 0 ? acc.usernames[acc.usernames.length - 1].username : 'N/A',
        activeBans,
        activeMutes,
        lastLinkedUpdate: lastLinkedUpdate || null
      };
    });
    
    
    res.status(200).json({ linkedAccounts: formattedLinkedAccounts });
  } catch (error: any) {
    console.error('Error getting linked accounts:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Find and link accounts endpoint for player window
router.post('/:uuid/find-linked', async (req: Request<{ uuid: string }>, res: Response): Promise<void> => {
  const Player = req.serverDbConnection!.model<IPlayer>('Player');
  const minecraftUuid = req.params.uuid;
  const serverName = req.serverName!;
  
  try {
    const player = await Player.findOne({ minecraftUuid });
    if (!player) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    // Get player's IP addresses for linking
    const playerIPs = player.ipAddresses?.map((ip: any) => ip.ipAddress) || [];
    
    if (playerIPs.length === 0) {
      res.status(200).json({ 
        success: true,
        message: 'No IP addresses found for player',
        linkedAccountsFound: 0
      });
      return;
    }

    

    // Call the minecraft routes function (we need to import it)
    // For now, let's implement a simplified version here
    await findAndLinkAccountsForPanel(req.serverDbConnection!, playerIPs, minecraftUuid, serverName);

    // Get updated linked accounts count
    const updatedPlayer = await Player.findOne({ minecraftUuid });
    const linkedAccounts = updatedPlayer?.data?.get ? updatedPlayer.data.get('linkedAccounts') : updatedPlayer?.data?.linkedAccounts || [];

    res.status(200).json({ 
      success: true,
      message: 'Account linking search completed',
      linkedAccountsFound: Array.isArray(linkedAccounts) ? linkedAccounts.length : 0
    });
  } catch (error) {
    console.error('Error triggering account linking search:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      uuid: minecraftUuid,
      serverName: serverName
    });
    res.status(500).json({ 
      error: 'Failed to trigger linked account search',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Find and link accounts for panel (simplified version of minecraft-routes function)
 */
async function findAndLinkAccountsForPanel(
  dbConnection: any,
  ipAddresses: string[],
  currentPlayerUuid: string,
  serverName: string
): Promise<void> {
  try {
    const Player = dbConnection.model('Player');
    
    if (!ipAddresses || ipAddresses.length === 0) {
      return;
    }
    
    // Find all players that have used any of these IP addresses
    const potentialLinkedPlayers = await Player.find({
      minecraftUuid: { $ne: currentPlayerUuid }, // Exclude current player
      'ipAddresses.ipAddress': { $in: ipAddresses }
    }).lean();

    const currentPlayer = await Player.findOne({ minecraftUuid: currentPlayerUuid });
    if (!currentPlayer) {
      console.error(`[Panel Account Linking] Current player ${currentPlayerUuid} not found`);
      return;
    }

    const linkedAccounts: string[] = [];

    for (const player of potentialLinkedPlayers) {
      let shouldLink = false;
      const matchingIPs: string[] = [];

      // Check each IP address for linking criteria
      for (const ipAddress of ipAddresses) {
        const playerIpEntry = player.ipAddresses?.find((ip: any) => ip.ipAddress === ipAddress);
        const currentPlayerIpEntry = currentPlayer.ipAddresses?.find((ip: any) => ip.ipAddress === ipAddress);
        
        if (playerIpEntry && currentPlayerIpEntry) {
          // Both players have used this IP
          const isProxy = playerIpEntry.proxy || currentPlayerIpEntry.proxy;
          
          if (!isProxy) {
            // Non-proxy IP - always link
            shouldLink = true;
            matchingIPs.push(ipAddress);
          } else {
            // Proxy IP - only link if used within 6 hours of each other
            const playerLastLogin = playerIpEntry.logins && playerIpEntry.logins.length > 0 
              ? new Date(Math.max(...playerIpEntry.logins.map((d: any) => new Date(d).getTime())))
              : playerIpEntry.firstLogin;
            
            const currentPlayerLastLogin = currentPlayerIpEntry.logins && currentPlayerIpEntry.logins.length > 0
              ? new Date(Math.max(...currentPlayerIpEntry.logins.map((d: any) => new Date(d).getTime())))
              : currentPlayerIpEntry.firstLogin;

            if (playerLastLogin && currentPlayerLastLogin) {
              const timeDiff = Math.abs(playerLastLogin.getTime() - currentPlayerLastLogin.getTime());
              const sixHours = 6 * 60 * 60 * 1000;
              
              if (timeDiff <= sixHours) {
                shouldLink = true;
                matchingIPs.push(`${ipAddress} (proxy, within 6h)`);
              }
            }
          }
        }
      }

      if (shouldLink) {
        linkedAccounts.push(player.minecraftUuid);
        
        // Update both players' linked accounts
        await updatePlayerLinkedAccountsForPanel(dbConnection, currentPlayer.minecraftUuid, player.minecraftUuid);
        await updatePlayerLinkedAccountsForPanel(dbConnection, player.minecraftUuid, currentPlayer.minecraftUuid);
        
        
        
        // Create system log
        await createSystemLog(
          dbConnection,
          serverName,
          `Panel account linking: ${currentPlayer.usernames[0]?.username || 'Unknown'} (${currentPlayer.minecraftUuid}) linked to ${player.usernames[0]?.username || 'Unknown'} (${player.minecraftUuid}) via shared IPs: ${matchingIPs.join(', ')}`,
          'info',
          'panel-linking'
        );
      }
    }

    if (linkedAccounts.length > 0) {
      
    } else {
      
    }
  } catch (error) {
    console.error(`[Panel Account Linking] Error finding linked accounts:`, error);
    console.error(`[Panel Account Linking] Error details:`, {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      currentPlayerUuid,
      ipAddresses,
      serverName
    });
    throw error; // Re-throw to be caught by the endpoint handler
  }
}

/**
 * Update a player's linked accounts list for panel
 */
async function updatePlayerLinkedAccountsForPanel(
  dbConnection: any,
  playerUuid: string,
  linkedUuid: string
): Promise<void> {
  try {
    const Player = dbConnection.model('Player');
    
    const player = await Player.findOne({ minecraftUuid: playerUuid });
    if (!player) {
      return;
    }

    // Initialize linkedAccounts if it doesn't exist
    if (!player.data) {
      player.data = new Map<string, any>();
    }
    
    const existingLinkedAccounts = player.data.get ? player.data.get('linkedAccounts') : player.data.linkedAccounts || [];
    
    // Only add if not already linked
    if (!existingLinkedAccounts.includes(linkedUuid)) {
      const updatedLinkedAccounts = [...existingLinkedAccounts, linkedUuid];
      if (player.data.set) {
        player.data.set('linkedAccounts', updatedLinkedAccounts);
        player.data.set('lastLinkedAccountUpdate', new Date());
      } else {
        player.data.linkedAccounts = updatedLinkedAccounts;
        player.data.lastLinkedAccountUpdate = new Date();
      }
      await player.save({ validateBeforeSave: false });
      
      
    }
  } catch (error) {
    console.error(`[Panel Account Linking] Error updating player linked accounts:`, error);
  }
}

// Add evidence to a punishment
router.post('/:uuid/punishments/:punishmentId/evidence', async (req: Request<{ uuid: string; punishmentId: string }>, res: Response): Promise<void> => {
  const Player = req.serverDbConnection!.model<IPlayer>('Player');
  try {
    const { uuid, punishmentId } = req.params;
    const { text, issuerName, date, type, fileUrl, fileName, fileType, fileSize } = req.body;
    
    if (!text?.trim()) {
      return res.status(400).json({ error: 'Evidence text is required' });
    }
    
    // Find the player
    const player = await Player.findOne({ minecraftUuid: uuid });
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    // Find the punishment
    const punishment = player.punishments.find((p: any) => p.id === punishmentId);
    if (!punishment) {
      return res.status(404).json({ error: 'Punishment not found' });
    }
    
    // Determine evidence type
    let evidenceType = type || 'text';
    if (!type) {
      // Auto-detect type based on content
      if (text.trim().match(/^https?:\/\//)) {
        evidenceType = 'url';
      } else if (fileUrl) {
        evidenceType = 'file';
      }
    }
    
    // Add the evidence
    const evidenceItem: any = {
      text: text.trim(),
      issuerName: issuerName || 'System',
      date: date || new Date(),
      type: evidenceType
    };
    
    // Add file-related fields if this is a file upload
    if (evidenceType === 'file' && fileUrl) {
      evidenceItem.fileUrl = fileUrl;
      evidenceItem.fileName = fileName || 'Unknown file';
      evidenceItem.fileType = fileType || 'application/octet-stream';
      evidenceItem.fileSize = fileSize || 0;
    }
    
    if (!punishment.evidence) {
      punishment.evidence = [];
    }
    
    punishment.evidence.push(evidenceItem);
    
    // Save the player
    await player.save({ validateBeforeSave: false });
    
    res.json({ message: 'Evidence added successfully', evidence: evidenceItem });
  } catch (error) {
    console.error('Error adding evidence to punishment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Lookup punishment by ID across all players
router.get('/punishment-lookup/:punishmentId', async (req: Request<{ punishmentId: string }>, res: Response): Promise<void> => {
  try {
    const punishmentId = req.params.punishmentId;
    
    if (!req.serverDbConnection) {
      res.status(500).json({ error: 'Database connection not available' });
      return;
    }
    
    const Player = req.serverDbConnection.model<IPlayer>('Player');
    
    // Search for the punishment across all players
    const player = await Player.findOne({ 'punishments.id': punishmentId });
    
    if (!player) {
      res.status(404).json({ error: 'Punishment not found' });
      return;
    }
    
    // Find the specific punishment within the player's punishments
    const punishment = player.punishments?.find((p: any) => p.id === punishmentId);
    
    if (!punishment) {
      res.status(404).json({ error: 'Punishment not found' });
      return;
    }
    
    // Get the player's most recent username
    let playerUsername = player.username;
    if (!playerUsername && player.usernames && player.usernames.length > 0) {
      // If no direct username, get the most recent from usernames array
      playerUsername = player.usernames[player.usernames.length - 1].username;
    }
    
    // Return simplified punishment data with player info
    res.json({
      playerUuid: player.minecraftUuid,
      playerUsername: playerUsername || null,
      punishment: {
        id: punishment.id,
        type: punishment.type,
        reason: punishment.reason,
        severity: punishment.severity,
        status: punishment.status,
        issued: punishment.issued,
        expiry: punishment.expiry,
        active: punishment.active,
      }
    });
  } catch (error) {
    console.error('Error looking up punishment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Avatar proxy route to avoid CORS issues with Crafatar
router.get('/avatar/:uuid', async (req: Request, res: Response) => {
  try {
    const { uuid } = req.params;
    const { size = '32', overlay = 'true' } = req.query;
    
    // Validate UUID format (basic check)
    if (!uuid || !/^[a-f0-9\-]{32,36}$/i.test(uuid)) {
      return res.status(400).json({ error: 'Invalid UUID format' });
    }
    
    // Construct Crafatar URL
    const crafatarUrl = `https://crafatar.com/avatars/${uuid}?size=${size}&default=MHF_Steve${overlay === 'true' ? '&overlay' : ''}`;
    
    // Fetch the image from Crafatar
    const response = await fetch(crafatarUrl);
    
    if (!response.ok) {
      return res.status(404).json({ error: 'Avatar not found' });
    }
    
    // Get the image buffer
    const imageBuffer = await response.arrayBuffer();
    
    // Set appropriate headers
    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      'Cross-Origin-Resource-Policy': 'cross-origin'
    });
    
    // Send the image
    res.send(Buffer.from(imageBuffer));
  } catch (error) {
    console.error('Error proxying avatar:', error);
    res.status(500).json({ error: 'Failed to fetch avatar' });
  }
});

export default router;