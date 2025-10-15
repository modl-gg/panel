import { Connection } from 'mongoose';
import { connectToGlobalModlDb } from '../db/connectionManager';
import { ModlServerSchema } from '@modl-gg/shared-web/schemas/ModlServerSchema';

export async function updateServerStats(
  serverName: string,
  options: {
    incrementUserCount?: boolean;
    incrementTicketCount?: boolean;
    updateLastActivity?: boolean;
  }
): Promise<void> {
  try {
    const globalConnection = await connectToGlobalModlDb();
    const ModlServerModel = globalConnection.models.ModlServer || globalConnection.model('ModlServer', ModlServerSchema);

    const updateData: any = {
      updatedAt: new Date()
    };

    if (options.updateLastActivity) {
      updateData.lastActivityAt = new Date();
    }

    if (options.incrementUserCount) {
      updateData.$inc = { ...(updateData.$inc || {}), userCount: 1 };
    }

    if (options.incrementTicketCount) {
      updateData.$inc = { ...(updateData.$inc || {}), ticketCount: 1 };
    }

    await ModlServerModel.findOneAndUpdate(
      { customDomain: serverName },
      updateData,
      { new: true }
    );
  } catch (error) {
    console.error(`[updateServerStats] Failed to update stats for ${serverName}:`, error);
  }
}

export async function syncServerStats(
  serverName: string,
  serverDbConnection: Connection
): Promise<void> {
  try {
    const globalConnection = await connectToGlobalModlDb();
    const ModlServerModel = globalConnection.models.ModlServer || globalConnection.model('ModlServer', ModlServerSchema);

    const [totalPlayers, totalTickets] = await Promise.allSettled([
      serverDbConnection.collection('players').countDocuments(),
      serverDbConnection.collection('tickets').countDocuments()
    ]);

    const playerCount = totalPlayers.status === 'fulfilled' ? totalPlayers.value : 0;
    const ticketCount = totalTickets.status === 'fulfilled' ? totalTickets.value : 0;

    await ModlServerModel.findOneAndUpdate(
      { customDomain: serverName },
      {
        userCount: playerCount,
        ticketCount: ticketCount,
        lastActivityAt: new Date(),
        updatedAt: new Date()
      },
      { new: true }
    );
  } catch (error) {
    console.error(`[syncServerStats] Failed to sync stats for ${serverName}:`, error);
  }
}

