import { Connection } from 'mongoose';

declare global {
  namespace Express {
    interface Request {
      serverName?: string;
      serverDbConnection?: Connection;
      modlServer?: any;
      user?: any;
      webhookSettings?: any;
    }
  }
}
