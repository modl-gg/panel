import { Request, Response, NextFunction } from 'express';

// Middleware to load webhook settings into request context
export const loadWebhookSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.serverDbConnection) {
      const SettingsModel = req.serverDbConnection.model('Settings');
      const webhookSettingsDoc = await SettingsModel.findOne({ type: 'webhookSettings' });
      
      // Attach webhook settings to request for use by webhook service
      req.webhookSettings = webhookSettingsDoc?.data || null;
    }
  } catch (error) {
    // Silently fail - don't let webhook loading errors affect the main application
    req.webhookSettings = null;
  }
  
  next();
};