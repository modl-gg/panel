import { Request, Response, NextFunction } from 'express';
import { logAIRequest, getCurrentMonthAIUsage } from '../services/storage-settings-service';

export interface AIUsageRequest extends Request {
  aiUsageLogged?: boolean;
}

/**
 * Middleware to check AI usage limits before processing AI requests
 */
export const checkAIUsageLimit = (service: 'moderation' | 'ticket_analysis' | 'appeal_analysis' | 'other') => {
  return async (req: AIUsageRequest, res: Response, next: NextFunction) => {
    try {
      // Get server name from request
      const serverName = (req as any).modlServer?.customDomain || req.headers.host?.split('.')[0] || 'default';
      
      // Get user's subscription status
      const server = (req as any).modlServer;
      const isPremium = server && (
        (server.subscription_status === 'active' && server.plan === 'premium') ||
        (server.subscription_status === 'canceled' && server.plan === 'premium' && 
         server.current_period_end && new Date(server.current_period_end) > new Date())
      );
      
      // Free users can't use AI
      if (!isPremium) {
        return res.status(403).json({
          error: 'AI features are only available for premium users',
          message: 'Upgrade to premium to access AI-powered moderation and analysis features.',
          code: 'AI_PREMIUM_REQUIRED'
        });
      }
      
      // Get current month's usage
      const currentUsage = await getCurrentMonthAIUsage(serverName);
      const baseLimit = 1000; // 1000 requests for premium users
      
      // Check if user has exceeded their limit
      if (currentUsage.totalRequests >= baseLimit) {
        // Calculate overage cost
        const overageRequests = currentUsage.totalRequests - baseLimit;
        const overageCost = overageRequests * 0.01;
        
        // For now, allow overage but log the cost
        // In production, you might want to implement overage limits
        console.warn(`AI usage overage for ${serverName}: ${overageRequests} requests, $${overageCost.toFixed(2)} cost`);
      }
      
      // Proceed to next middleware
      next();
    } catch (error) {
      console.error('Error checking AI usage limit:', error);
      // Don't block the request on error, just proceed
      next();
    }
  };
};

/**
 * Middleware to log AI requests after successful processing
 */
export const logAIUsage = (service: 'moderation' | 'ticket_analysis' | 'appeal_analysis' | 'other', tokensUsed: number = 1) => {
  return async (req: AIUsageRequest, res: Response, next: NextFunction) => {
    // Store the original json method
    const originalJson = res.json;
    
    // Override the json method to log usage after successful response
    res.json = function(data: any) {
      // Only log if the response was successful (status < 400)
      if (res.statusCode < 400 && !req.aiUsageLogged) {
        const serverName = (req as any).modlServer?.customDomain || req.headers.host?.split('.')[0] || 'default';
        
        // Log the AI request asynchronously
        logAIRequest(serverName, service, tokensUsed, 0.01)
          .catch(error => console.error('Error logging AI usage:', error));
        
        req.aiUsageLogged = true;
      }
      
      // Call the original json method
      return originalJson.call(this, data);
    };
    
    next();
  };
};

/**
 * Combined middleware for AI usage checking and logging
 */
export const withAIUsageTracking = (service: 'moderation' | 'ticket_analysis' | 'appeal_analysis' | 'other', tokensUsed: number = 1) => {
  return [
    checkAIUsageLimit(service),
    logAIUsage(service, tokensUsed)
  ];
};

/**
 * Get AI usage information for current user (utility function for routes)
 */
export const getAIUsageInfo = async (req: Request): Promise<{
  canUseAI: boolean;
  remainingRequests: number;
  overageRequests: number;
  estimatedCost: number;
}> => {
  try {
    const serverName = (req as any).modlServer?.customDomain || req.headers.host?.split('.')[0] || 'default';
    const server = (req as any).modlServer;
    const isPremium = server && (
      (server.subscription_status === 'active' && server.plan === 'premium') ||
      (server.subscription_status === 'canceled' && server.plan === 'premium' && 
       server.current_period_end && new Date(server.current_period_end) > new Date())
    );
    
    if (!isPremium) {
      return {
        canUseAI: false,
        remainingRequests: 0,
        overageRequests: 0,
        estimatedCost: 0,
      };
    }
    
    const currentUsage = await getCurrentMonthAIUsage(serverName);
    const baseLimit = 1000;
    const remainingRequests = Math.max(0, baseLimit - currentUsage.totalRequests);
    const overageRequests = Math.max(0, currentUsage.totalRequests - baseLimit);
    const estimatedCost = overageRequests * 0.01;
    
    return {
      canUseAI: true,
      remainingRequests,
      overageRequests,
      estimatedCost,
    };
  } catch (error) {
    console.error('Error getting AI usage info:', error);
    return {
      canUseAI: false,
      remainingRequests: 0,
      overageRequests: 0,
      estimatedCost: 0,
    };
  }
};