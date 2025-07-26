import mongoose from 'mongoose';
import { PlayerSchema, StaffSchema, TicketSchema, LogSchema, SettingsSchema } from '@modl-gg/shared-web/schemas/TenantSchemas';
import { createDefaultSettings, addDefaultPunishmentTypes } from '../routes/settings-routes';
import { Connection } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

// Helper function to get ticket category from type
function getTicketCategory(type: string): string {
  switch(type) {
    case 'bug': return 'Bug Report';
    case 'player': return 'Player Report';
    case 'chat': return 'Chat Report';
    case 'appeal': return 'Punishment Appeal';
    case 'staff': return 'Staff Application';
    case 'support': return 'General Support';
    default: return 'Other';
  }
}

// Generate a random date within a range
function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// Pick a random item from an array
function randomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

// Generate a random punishment ID
function generatePunishmentId(): string {
  const prefix = randomItem(['ban', 'mute', 'warn', 'kick']);
  const numbers = Math.floor(10000 + Math.random() * 90000).toString();
  return `${prefix}-${numbers}`;
}

// Generate random IP address
function generateIpAddress(): string {
  return `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
}

// Generate UUID
function generateUuid(): string {
  return uuidv4();
}

// Seed the database with initial data including 20 players and 15 tickets
export async function seedEnhancedDatabase(dbConnection: Connection) {
  console.log('Seeding database with enhanced mock data...');
  
  if (!dbConnection) {
    throw new Error('Database connection is required for seeding');
  }

  // Get or create models using the provided connection
  const Player = dbConnection.models.Player || dbConnection.model('Player', PlayerSchema);
  const Staff = dbConnection.models.Staff || dbConnection.model('Staff', StaffSchema);
  const Ticket = dbConnection.models.Ticket || dbConnection.model('Ticket', TicketSchema);
  const Log = dbConnection.models.Log || dbConnection.model('Log', LogSchema);
  const Settings = dbConnection.models.Settings || dbConnection.model('Settings', SettingsSchema);
  
  try {
    // Clear existing data
    await Player.deleteMany({});
    await Ticket.deleteMany({});
    await Log.deleteMany({});
    
    // Keep staff and settings as they are
    
    // Sample staff members for reference
    const staffMembers = await Staff.find({});
    const staffIds = staffMembers.map(staff => staff._id);
    const staffNames = staffMembers.map(staff => staff.username);
    
    // Default staff if none exist
    const defaultStaffId = 'staff-001';
    const defaultStaffName = 'AdminUser';
    
    // Arrays for generating random data
    const countries = ['US', 'UK', 'CA', 'AU', 'DE', 'FR', 'JP', 'BR', 'IN', 'RU'];
    const regions = ['West', 'East', 'North', 'South', 'Central'];
    const asns = ['AS12345', 'AS67890', 'AS54321', 'AS09876', 'AS13579'];
    
    // Initialize default settings including punishment types
    await createDefaultSettings(dbConnection);
    console.log('Initialized default settings with punishment types');
    
    // Get punishment types for realistic punishment generation
    const SettingsSchema = new mongoose.Schema({ 
      type: { type: String, required: true },
      data: { type: mongoose.Schema.Types.Mixed, required: true }
    });
    const SettingsModel = dbConnection.models.Settings || dbConnection.model('Settings', SettingsSchema);
    const punishmentTypesDoc = await SettingsModel.findOne({ type: 'punishmentTypes' });
    const punishmentTypes: Array<{ ordinal: number; name: string; [key: string]: any }> = punishmentTypesDoc?.data || [];
    
    const punishmentReasons = [
      'Using inappropriate language in chat',
      'Harassing other players',
      'Using unauthorized modifications',
      'Spamming the chat',
      'Inappropriate username',
      'Bug exploitation',
      'Advertising other servers',
      'Impersonating staff',
      'Ban evasion',
      'Team griefing',
      'Combat logging',
      'Inappropriate skin',
      'Causing lag intentionally',
      'Toxic behavior'
    ];
    
    const noteTexts = [
      'Warned for minor chat violations',
      'Requested username change',
      'Has alt accounts',
      'Previously banned on another server',
      'Technical issues reported',
      'Helped newer players',
      'Participated in server events',
      'Contacted support multiple times',
      'VPN user',
      'Donator status expired'
    ];
    
    const playerUsernames = [
      'CraftMaster', 'DiamondDigger', 'PixelWarrior', 'BlockBuilder', 'EnderDragon',
      'RedstoneGenius', 'MinerPro', 'WorldExplorer', 'CaveDweller', 'SkyWalker',
      'LavaSwimmer', 'IronForger', 'GoldHunter', 'TreePuncher', 'NightRaider',
      'DayWanderer', 'WaterStrider', 'MountainClimber', 'DesertNomad', 'JungleRunner',
      'SnowTrekker', 'OceanDiver', 'NetherTraveler', 'EndPortalFinder', 'VillageTrader',
      'ZombieSlayer', 'SpiderClimber', 'CreeperDefeater', 'SkeletonArcher', 'GhastFighter'
    ];
    
    // Ticket related data
    const ticketTypes = ['bug', 'player', 'chat', 'appeal'];
    const ticketSubjects = [
      'Can\'t access inventory',
      'Player harassment report',
      'Game crash during minigame',
      'Appeal for unfair ban',
      'Missing items after server restart',
      'Reporting inappropriate chat',
      'Request to join staff team',
      'Payment issue with store',
      'Bug in new game mode',
      'Requesting clan feature',
      'Performance problems',
      'Map rendering issues',
      'Chat filter too strict',
      'Server lag report',
      'Player using hacks'
    ];
    
    // We only support 'Unfinished', 'Open', 'Closed' statuses in our schema
    const ticketStatuses = ['Open', 'Closed'];
    const ticketPriorities = ['Critical', 'Medium', 'Low', 'Fixed'];
    const ticketCategories = ['Bug Report', 'Player Report', 'Punishment Appeal', 'Other'];
    
    const ticketTags = [
      'bug', 'crash', 'performance', 'UI', 'gameplay', 'critical',
      'player', 'chat', 'harassment', 'hacking', 'griefing', 'appeal',
      'payment', 'store', 'suggestion', 'question', 'low-priority'
    ];
    
    const ticketContents = [
      'I found a bug where items disappear from my inventory when logging out.',
      'Player [NAME] was harassing me in chat. Screenshots attached.',
      'The game crashes every time I try to enter the Nether dimension.',
      'I was banned unfairly. I wasn\'t using any hacks, it was just my high ping.',
      'After the server restarted, all my items in my ender chest were gone.',
      'There\'s a player using inappropriate language in general chat.',
      'I\'d like to apply for a moderator position. I have experience on other servers.',
      'I made a purchase in the store but didn\'t receive the items.',
      'There\'s a bug in the new minigame where the timer doesn\'t reset properly.',
      'I think the server would benefit from adding a clan/faction system.',
      'I\'m experiencing severe lag spikes every few minutes.',
      'Parts of the map aren\'t rendering correctly in the spawn area.',
      'The chat filter is blocking normal words like "night" and "grape".',
      'The server has been lagging badly for the past 3 hours.',
      'I saw a player flying and moving very fast. I think they\'re using hacks.'
    ];
    
    const responseContents = [
      'Thank you for your report. We\'ll investigate this issue.',
      'We\'ve taken action against the player in question.',
      'This is a known issue and we\'re working on a fix.',
      'Your ban has been reviewed and upheld. The evidence clearly shows rule violations.',
      'Please provide more information so we can better assist you.',
      'This issue has been resolved in the latest update.',
      'We\'re not currently looking for new staff members.',
      'Your payment has been verified and the items have been added to your account.',
      'Thanks for the bug report. This has been fixed and will be in the next update.',
      'We like your suggestion and will consider it for future updates.',
      'We\'re investigating the performance issues. It may be related to recent changes.',
      'The rendering issue has been fixed. Please clear your cache and restart the game.',
      'We\'ve adjusted the chat filter to fix these false positives.',
      'The lag issues should be resolved now. We had to restart the server to fix it.',
      'We\'ve banned the player you reported. Thank you for helping keep the server fair.'
    ];
    
    const staffNotes = [
      'Verified issue, added to bug tracker',
      'Checked logs, confirmed report accuracy',
      'User has multiple previous violations',
      'Not enough evidence to take action',
      'Found and fixed the underlying issue',
      'User was polite and provided good details',
      'Seems to be a duplicate of ticket #12345',
      'This is actually a feature request, not a bug',
      'Recommended for priority fix in next update',
      'Consistent issue reported by multiple users'
    ];
    
    // Generate 20 players
    const players = [];
    
    for (let i = 0; i < 20; i++) {
      const uuid = generateUuid();
      const usernameBase = randomItem(playerUsernames);
      const username = `${usernameBase}${Math.floor(Math.random() * 1000)}`;
      
      // Generate 1-3 username history entries
      const usernameCount = Math.floor(Math.random() * 3) + 1;
      const usernames = [];
      const currentDate = new Date();
      let lastDate = new Date(currentDate.getFullYear() - 2, 0, 1); // 2 years ago
      
      for (let j = 0; j < usernameCount; j++) {
        const usernameDate = randomDate(lastDate, currentDate);
        const historicalUsername = j === usernameCount - 1 ?
          username :
          `${usernameBase}${Math.floor(Math.random() * 1000)}`;

        usernames.push({
          username: historicalUsername,
          date: usernameDate
        });
        
        lastDate = usernameDate;
      }
      
      // Generate 0-3 notes
      const noteCount = Math.floor(Math.random() * 4);
      const notes = [];
      
      for (let j = 0; j < noteCount; j++) {
        const staffId = staffIds.length > 0 ? randomItem(staffIds) : defaultStaffId;
        const staffName = staffNames.length > 0 ? randomItem(staffNames) : defaultStaffName;
        
        notes.push({
          text: randomItem(noteTexts),
          date: randomDate(new Date(currentDate.getFullYear() - 1, 0, 1), currentDate),
          issuerName: staffName,
          issuerId: staffId
        });
      }
      
      // Generate 1-2 IP addresses
      const ipCount = Math.floor(Math.random() * 2) + 1;
      const ipList = [];
      
      for (let j = 0; j < ipCount; j++) {
        ipList.push({
          ipAddress: generateIpAddress(),
          country: randomItem(countries),
          region: randomItem(regions),
          asn: randomItem(asns),
          firstLogin: randomDate(new Date(currentDate.getFullYear() - 1, 0, 1), currentDate)
        });
      }
      
      // Generate 0-2 punishments
      const punishmentCount = Math.floor(Math.random() * 3);
      const punishments = [];
      
      for (let j = 0; j < punishmentCount; j++) {
        const staffId = staffIds.length > 0 ? randomItem(staffIds) : defaultStaffId;
        const staffName = staffNames.length > 0 ? randomItem(staffNames) : defaultStaffName;
        const issueDate = randomDate(new Date(currentDate.getFullYear() - 1, 0, 1), currentDate);
        
        // Determine if it expires - 30% chance of permanent ban
        const isPermanent = Math.random() < 0.3;
        let expiryDate = null;
        
        if (!isPermanent) {
          // Random duration between 1 day and 30 days
          const duration = (Math.floor(Math.random() * 30) + 1) * 24 * 60 * 60 * 1000;
          expiryDate = new Date(issueDate.getTime() + duration);
        }
        
        // 50% chance the punishment is still active
        const isActive = Math.random() < 0.5;
        
        // Select a random punishment type using ordinals
        const randomPunishmentType = punishmentTypes.length > 0 ? randomItem(punishmentTypes) : { ordinal: 1 };
        
        const punishmentData = new Map<string, string | boolean | number>();
        punishmentData.set('severity', randomItem(['Low', 'Medium', 'High']));
        punishmentData.set('autoDetected', Math.random() < 0.3);
        
        punishments.push({
          id: generatePunishmentId(),
          type_ordinal: randomPunishmentType.ordinal,
          issuerId: staffId,
          issuerName: staffName,
          reason: randomItem(punishmentReasons),
          date: issueDate,
          expires: expiryDate,
          active: isActive,
          data: punishmentData,
          attachedTicketIds: []
        });
      }
      
      players.push({
        _id: uuid,
        minecraftUuid: uuid,
        usernames,
        notes,
        ipList,
        punishments,
        pendingNotifications: []
      });
    }
    
    // Generate 15 tickets
    const tickets = [];
    
    for (let i = 0; i < 15; i++) {
      const oldType = randomItem(ticketTypes);
      const type = oldType === 'appeal' ? 'appeal' : oldType === 'player' ? 'player' : oldType === 'chat' ? 'chat' : 'bug';
      
      const ticketId = `${oldType.toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`;
      const creationDate = randomDate(new Date(new Date().getFullYear() - 1, 0, 1), new Date());
      
      // Pick a random player as creator
      const creator = players[Math.floor(Math.random() * players.length)];
      const creatorUsername = creator.usernames[creator.usernames.length - 1].username;
      const creatorUuid = creator.minecraftUuid;
      
      // Generate 2-5 tags
      const tagCount = Math.floor(Math.random() * 4) + 2;
      const tags = [];
      
      // Always include the ticket type as a tag
      tags.push(oldType);
      
      // Add additional unique tags
      while (tags.length < tagCount) {
        const tag = randomItem(ticketTags);
        if (!tags.includes(tag)) {
          tags.push(tag);
        }
      }
      
      // Generate 1-5 replies
      const replyCount = Math.floor(Math.random() * 5) + 1;
      const replies = [];
      
      // First reply is always from the creator
      const ticketContent = randomItem(ticketContents);
      let lastReplyDate = creationDate;
      
      replies.push({
        name: creatorUsername,
        content: ticketContent,
        type: 'player',
        created: creationDate,
        staff: false
      });
      
      // Add system message for assignment if more than one reply
      if (replyCount > 1) {
        const assignmentDate = new Date(lastReplyDate.getTime() + 1000 * 60 * 30);
        const staffName = staffNames.length > 0 ? randomItem(staffNames) : defaultStaffName;
        
        replies.push({
          name: 'System',
          content: `Ticket has been assigned to ${staffName}`,
          type: 'system',
          created: assignmentDate,
          staff: false
        });
        
        lastReplyDate = assignmentDate;
      }
      
      // Add staff and player responses alternating
      for (let j = 2; j < replyCount; j++) {
        const replyDate = new Date(lastReplyDate.getTime() + 1000 * 60 * 60 * (Math.floor(Math.random() * 48) + 1)); // 1-48 hours later
        const isStaffReply = j % 2 === 0;
        
        if (isStaffReply) {
          const staffName = staffNames.length > 0 ? randomItem(staffNames) : defaultStaffName;
          
          replies.push({
            name: staffName,
            content: randomItem(responseContents),
            type: 'staff',
            created: replyDate,
            staff: true
          });
        } else {
          replies.push({
            name: creatorUsername,
            content: `Thanks for the response. ${Math.random() < 0.5 ? 'I have additional information.' : 'I appreciate your help.'}`,
            type: 'player',
            created: replyDate,
            staff: false
          });
        }
        
        lastReplyDate = replyDate;
      }
      
      // Generate 0-3 staff notes
      const noteCount = Math.floor(Math.random() * 4);
      const notes = [];
      
      for (let j = 0; j < noteCount; j++) {
        const staffName = staffNames.length > 0 ? randomItem(staffNames) : defaultStaffName;
        const noteDate = randomDate(creationDate, new Date());
        
        notes.push({
          content: randomItem(staffNotes),
          author: staffName,
          date: noteDate
        });
      }
      
      // Determine ticket metadata
      const status = randomItem(ticketStatuses);
      const priority = randomItem(ticketPriorities);
      const category = type === 'bug' ? 'Bug Report' : 
                      type === 'player' ? 'Player Report' :
                      type === 'appeal' ? 'Punishment Appeal' : 'Other';
                      
      const subject = randomItem(ticketSubjects);
      const staffName = staffNames.length > 0 ? randomItem(staffNames) : defaultStaffName;
      
      // Additional data for specific ticket types
      const data = new Map<string, string | boolean | number>();
      data.set('status', status);
      data.set('priority', priority);
      data.set('category', category);
      data.set('subject', subject);
      
      // 80% chance of having assigned staff
      if (Math.random() < 0.8) {
        data.set('assignedTo', staffName);
      }
      
      // If it's a player report, 90% chance of having related player
      if (category === 'Player Report' && Math.random() < 0.9) {
        const relatedPlayer = players[Math.floor(Math.random() * players.length)];
        data.set('relatedPlayer', relatedPlayer.usernames[relatedPlayer.usernames.length - 1].username);
        data.set('relatedPlayerId', relatedPlayer._id);
      }
      
      // If it's an appeal, always have a punishment ID
      if (category === 'Punishment Appeal') {
        // Try to find a player with a punishment, otherwise generate random ID
        let punishmentId = generatePunishmentId();
        for (const player of players) {
          if (player.punishments.length > 0) {
            punishmentId = player.punishments[0].id;
            data.set('playerUuid', player._id);
            break;
          }
        }
        data.set('punishmentId', punishmentId);
      }
      
      // Create a ticket with our new schema format
      tickets.push({
        _id: ticketId,
        type: type,
        status: data.get('status') as string || 'Open',
        subject: data.get('subject') as string || 'No Subject',
        created: creationDate,
        creator: creatorUsername,
        creatorUuid: creatorUuid,
        locked: false,
        tags,
        replies,
        notes,
        reportedPlayer: data.get('relatedPlayer') as string,
        reportedPlayerUuid: data.get('relatedPlayerId') as string,
        formData: data
      });
    }
    
    // Insert data into collections
    await Player.insertMany(players);
    await Ticket.insertMany(tickets);
    
    // Create logs for all these actions
    const logs = [];
    
    // Player creation logs
    for (const player of players) {
      logs.push({
        description: `Player ${player.usernames[player.usernames.length - 1].username} registered`,
        level: 'info',
        source: 'system',
        created: player.usernames[0].date
      });
      
      // Logs for punishments
      for (const punishment of player.punishments) {
        const punishmentType = punishmentTypes.find(pt => pt.ordinal === punishment.type_ordinal);
        const typeName = punishmentType ? punishmentType.name : `Unknown Type (${punishment.type_ordinal})`;
        
        logs.push({
          description: `Player ${player.usernames[player.usernames.length - 1].username} received ${typeName} punishment: ${punishment.reason}`,
          level: 'moderation',
          source: punishment.issuerName,
          created: punishment.date
        });
      }
    }
    
    // Ticket logs
    for (const ticket of tickets) {
      const category = getTicketCategory(ticket.type);
      
      logs.push({
        description: `New ${category} ticket created: ${ticket._id}`,
        level: 'info',
        source: 'system',
        created: ticket.created
      });
      
      // Logs for status changes to resolved/closed
      if (ticket.status === 'Resolved' || ticket.status === 'Closed') {
        logs.push({
          description: `Ticket ${ticket._id} marked as ${ticket.status}`,
          level: 'info',
          source: 'system',
          created: ticket.replies[ticket.replies.length - 1].created
        });
      }
    }
    
    await Log.insertMany(logs);
    
    console.log('Enhanced database seed completed successfully!');
    console.log(`Created ${players.length} players and ${tickets.length} tickets`);
    console.log(`Added ${logs.length} log entries`);
    
  } catch (error) {
    console.error('Error seeding enhanced database:', error);
  }
}