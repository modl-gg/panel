import { Router } from 'express';
import { Connection, Document } from 'mongoose';
import { ISystemLog } from '@modl-gg/shared-web/types';

export async function createSystemLog(
  dbConnection: Connection | undefined | null,
  serverName: string | undefined | null,
  description: string,
  level: 'info' | 'warning' | 'error' | 'moderation' = 'info',
  source: string = 'system'
): Promise<ISystemLog | null> {
  if (!dbConnection) {
    console.error('createSystemLog called without a dbConnection. Log will not be saved.');
    const serverIdMessage = serverName || 'Unknown Server';
    return null;
  }
  try {
    const LogModel = dbConnection.model<ISystemLog>('Log');
    const logEntry = new LogModel({
      description,
      level,
      source,
      created: new Date(),
    });
    await logEntry.save();
    const serverIdMessage = serverName || dbConnection.name;
    return logEntry;
  } catch (error) {
    const serverIdMessage = serverName || (dbConnection ? dbConnection.name : 'Unknown Server');
    console.error(`Error creating system log for ${serverIdMessage}:`, error);
    return null;
  }
}

const router = Router();

router.get('/', async (req, res) => {
  if (!req.serverDbConnection) {
    console.error('Error fetching logs: No server-specific database connection found.');
    return res.status(500).json({ message: 'Server context not found, cannot fetch logs.' });
  }

  try {
    const LogModel = req.serverDbConnection.model<ISystemLog>('Log');
    const limit = parseInt(req.query.limit as string) || 100;
    const logs = await LogModel.find().sort({ created: -1 }).limit(limit);
    res.json(logs);
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ message: 'Failed to fetch logs from database.' });
  }
});

export default router;