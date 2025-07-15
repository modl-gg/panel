import { STORAGE_LIMITS } from './storage-quota-service';

export interface StorageSettings {
  serverName: string;
  overageLimit: number;
  overageEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AIUsageRecord {
  date: string; // YYYY-MM-DD format
  requests: number;
  tokensUsed: number;
  cost: number;
  services: {
    moderation: number;
    ticket_analysis: number;
    appeal_analysis: number;
    other: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Get storage settings for a server from MongoDB
 */
export async function getStorageSettings(serverName: string): Promise<StorageSettings> {
  try {
    const { getTenantConnection } = await import('../db/connectionManager');
    const connection = await getTenantConnection(serverName);
    
    if (!connection) {
      throw new Error('Database connection not available');
    }
    
    // Try to get existing model or create new one
    let StorageSettingsModel;
    try {
      StorageSettingsModel = connection.model('StorageSettings');
    } catch {
      // Model doesn't exist, create it
      const { Schema } = await import('mongoose');
      const StorageSettingsSchema = new Schema({
        serverName: { type: String, required: true, unique: true },
        overageLimit: { type: Number, default: STORAGE_LIMITS.DEFAULT_OVERAGE_LIMIT },
        overageEnabled: { type: Boolean, default: true },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now }
      });
      
      StorageSettingsModel = connection.model('StorageSettings', StorageSettingsSchema);
    }
    
    let settings = await StorageSettingsModel.findOne({ serverName });
    
    if (!settings) {
      // Create default settings
      settings = await StorageSettingsModel.create({
        serverName,
        overageLimit: STORAGE_LIMITS.DEFAULT_OVERAGE_LIMIT,
        overageEnabled: true,
      });
    }
    
    return {
      serverName: settings.serverName,
      overageLimit: settings.overageLimit,
      overageEnabled: settings.overageEnabled,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    };
  } catch (error) {
    console.error('Error getting storage settings:', error);
    // Return defaults on error
    return {
      serverName,
      overageLimit: STORAGE_LIMITS.DEFAULT_OVERAGE_LIMIT,
      overageEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

/**
 * Update storage settings for a server in MongoDB
 */
export async function updateStorageSettings(
  serverName: string, 
  updates: Partial<Pick<StorageSettings, 'overageLimit' | 'overageEnabled'>>
): Promise<StorageSettings> {
  try {
    const { getTenantConnection } = await import('../db/connectionManager');
    const connection = await getTenantConnection(serverName);
    
    if (!connection) {
      throw new Error('Database connection not available');
    }
    
    // Try to get existing model or create new one
    let StorageSettingsModel;
    try {
      StorageSettingsModel = connection.model('StorageSettings');
    } catch {
      // Model doesn't exist, create it
      const { Schema } = await import('mongoose');
      const StorageSettingsSchema = new Schema({
        serverName: { type: String, required: true, unique: true },
        overageLimit: { type: Number, default: STORAGE_LIMITS.DEFAULT_OVERAGE_LIMIT },
        overageEnabled: { type: Boolean, default: true },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now }
      });
      
      StorageSettingsModel = connection.model('StorageSettings', StorageSettingsSchema);
    }
    
    const settings = await StorageSettingsModel.findOneAndUpdate(
      { serverName },
      { 
        ...updates, 
        updatedAt: new Date() 
      },
      { 
        new: true, 
        upsert: true,
        setDefaultsOnInsert: true 
      }
    );
    
    return {
      serverName: settings.serverName,
      overageLimit: settings.overageLimit,
      overageEnabled: settings.overageEnabled,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    };
  } catch (error) {
    console.error('Error updating storage settings:', error);
    throw error;
  }
}

/**
 * Log an AI request for audit and usage tracking
 */
export async function logAIRequest(
  serverName: string,
  service: 'moderation' | 'ticket_analysis' | 'appeal_analysis' | 'other',
  tokensUsed: number = 1,
  cost: number = 0.01
): Promise<void> {
  try {
    const { getTenantConnection } = await import('../db/connectionManager');
    const connection = await getTenantConnection(serverName);
    
    if (!connection) {
      console.warn('Database connection not available for AI usage logging');
      return;
    }
    
    // Try to get existing model or create new one
    let AIUsageModel;
    try {
      AIUsageModel = connection.model('AIUsage');
    } catch {
      // Model doesn't exist, create it
      const { Schema } = await import('mongoose');
      const AIUsageSchema = new Schema({
        date: { type: String, required: true }, // YYYY-MM-DD format
        requests: { type: Number, default: 0 },
        tokensUsed: { type: Number, default: 0 },
        cost: { type: Number, default: 0 },
        services: {
          moderation: { type: Number, default: 0 },
          ticket_analysis: { type: Number, default: 0 },
          appeal_analysis: { type: Number, default: 0 },
          other: { type: Number, default: 0 }
        },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now }
      });
      
      // Create compound index for efficient querying
      AIUsageSchema.index({ date: 1 });
      
      AIUsageModel = connection.model('AIUsage', AIUsageSchema);
    }
    
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    await AIUsageModel.findOneAndUpdate(
      { date: today },
      {
        $inc: {
          requests: 1,
          tokensUsed: tokensUsed,
          cost: cost,
          [`services.${service}`]: 1
        },
        $set: {
          updatedAt: new Date()
        }
      },
      { 
        upsert: true,
        new: true 
      }
    );
  } catch (error) {
    console.error('Error logging AI request:', error);
    // Don't throw error to avoid breaking the main flow
  }
}

/**
 * Get AI usage for a specific period
 */
export async function getAIUsage(
  serverName: string,
  startDate?: string,
  endDate?: string
): Promise<AIUsageRecord[]> {
  try {
    const { getTenantConnection } = await import('../db/connectionManager');
    const connection = await getTenantConnection(serverName);
    
    if (!connection) {
      return [];
    }
    
    let AIUsageModel;
    try {
      AIUsageModel = connection.model('AIUsage');
    } catch {
      return []; // Model doesn't exist yet
    }
    
    const query: any = {};
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate;
      if (endDate) query.date.$lte = endDate;
    }
    
    const usage = await AIUsageModel.find(query).sort({ date: -1 }).limit(31); // Last 31 days max
    
    return usage.map((record: any) => ({
      date: record.date,
      requests: record.requests || 0,
      tokensUsed: record.tokensUsed || 0,
      cost: record.cost || 0,
      services: {
        moderation: record.services?.moderation || 0,
        ticket_analysis: record.services?.ticket_analysis || 0,
        appeal_analysis: record.services?.appeal_analysis || 0,
        other: record.services?.other || 0,
      },
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }));
  } catch (error) {
    console.error('Error getting AI usage:', error);
    return [];
  }
}

/**
 * Get current month's AI usage summary
 */
export async function getCurrentMonthAIUsage(serverName: string): Promise<{
  totalRequests: number;
  totalCost: number;
  byService: Record<string, number>;
}> {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startDate = startOfMonth.toISOString().split('T')[0];
    
    const usage = await getAIUsage(serverName, startDate);
    
    const summary = usage.reduce(
      (acc, record) => {
        acc.totalRequests += record.requests;
        acc.totalCost += record.cost;
        acc.byService.moderation += record.services.moderation;
        acc.byService.ticket_analysis += record.services.ticket_analysis;
        acc.byService.appeal_analysis += record.services.appeal_analysis;
        acc.byService.other += record.services.other;
        return acc;
      },
      {
        totalRequests: 0,
        totalCost: 0,
        byService: {
          moderation: 0,
          ticket_analysis: 0,
          appeal_analysis: 0,
          other: 0,
        },
      }
    );
    
    return summary;
  } catch (error) {
    console.error('Error getting current month AI usage:', error);
    return {
      totalRequests: 0,
      totalCost: 0,
      byService: {
        moderation: 0,
        ticket_analysis: 0,
        appeal_analysis: 0,
        other: 0,
      },
    };
  }
}