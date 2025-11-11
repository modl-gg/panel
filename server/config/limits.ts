/**
 * System Limits Configuration
 * 
 * Centralized configuration for all system limits to prevent abuse
 * and ensure scalability. Different limits apply based on subscription plan.
 */

export const SYSTEM_LIMITS = {
  FREE: {
    /**
     * Maximum number of custom punishment types that can be created
     * Note: Does not include the 6 core administrative types (Kick, Manual Mute, Manual Ban, etc.)
     */
    MAX_PUNISHMENT_TYPES: 50,

    /**
     * Maximum number of custom roles that can be created
     * Note: Does not include default roles (Super Admin, Admin, Moderator, Helper)
     */
    MAX_CUSTOM_ROLES: 50,

    /**
     * Maximum number of knowledgebase categories
     */
    MAX_KNOWLEDGEBASE_CATEGORIES: 30,

    /**
     * Maximum number of articles per knowledgebase category
     */
    MAX_ARTICLES_PER_CATEGORY: 20,

    /**
     * Maximum number of homepage cards
     */
    MAX_HOMEPAGE_CARDS: 20,

    /**
     * Maximum number of quick response actions per category
     */
    MAX_QUICK_RESPONSES_PER_CATEGORY: 10,

    /**
     * Maximum number of tags per type
     * Applies to: bug report tags, player report tags, appeal tags
     */
    MAX_TAGS_PER_TYPE: 15,

    /**
     * Maximum number of sections per form
     * Applies to ticket forms and appeal forms
     */
    MAX_FORM_SECTIONS: 15,

    /**
     * Maximum number of fields per form section
     */
    MAX_FORM_FIELDS_PER_SECTION: 10,

    /**
     * Maximum number of fields in a Discord webhook embed
     */
    MAX_WEBHOOK_EMBED_FIELDS: 15,

    /**
     * Maximum number of staff members per server
     */
    MAX_STAFF_MEMBERS: 15,

    /**
     * Maximum number of pending staff invitations at any time
     */
    MAX_PENDING_STAFF_INVITES: 5,

    /**
     * Maximum number of appeal form fields per punishment type
     */
    MAX_APPEAL_FORM_FIELDS: 10,

    /**
     * Maximum number of appeal form sections per punishment type
     */
    MAX_APPEAL_FORM_SECTIONS: 5,
  },
  
  PREMIUM: {
    /**
     * Maximum number of custom punishment types that can be created
     * Note: Does not include the 6 core administrative types (Kick, Manual Mute, Manual Ban, etc.)
     */
    MAX_PUNISHMENT_TYPES: 100,

    /**
     * Maximum number of custom roles that can be created
     * Note: Does not include default roles (Super Admin, Admin, Moderator, Helper)
     */
    MAX_CUSTOM_ROLES: 100,

    /**
     * Maximum number of knowledgebase categories
     */
    MAX_KNOWLEDGEBASE_CATEGORIES: 50,

    /**
     * Maximum number of articles per knowledgebase category
     */
    MAX_ARTICLES_PER_CATEGORY: 50,

    /**
     * Maximum number of homepage cards
     */
    MAX_HOMEPAGE_CARDS: 50,

    /**
     * Maximum number of quick response actions per category
     */
    MAX_QUICK_RESPONSES_PER_CATEGORY: 20,

    /**
     * Maximum number of tags per type
     * Applies to: bug report tags, player report tags, appeal tags
     */
    MAX_TAGS_PER_TYPE: 30,

    /**
     * Maximum number of sections per form
     * Applies to ticket forms and appeal forms
     */
    MAX_FORM_SECTIONS: 30,

    /**
     * Maximum number of fields per form section
     */
    MAX_FORM_FIELDS_PER_SECTION: 20,

    /**
     * Maximum number of fields in a Discord webhook embed
     */
    MAX_WEBHOOK_EMBED_FIELDS: 20,

    /**
     * Maximum number of staff members per server
     */
    MAX_STAFF_MEMBERS: 1_000_000,

    /**
     * Maximum number of pending staff invitations at any time
     */
    MAX_PENDING_STAFF_INVITES: 100,

    /**
     * Maximum number of appeal form fields per punishment type
     */
    MAX_APPEAL_FORM_FIELDS: 20,

    /**
     * Maximum number of appeal form sections per punishment type
     */
    MAX_APPEAL_FORM_SECTIONS: 10,
  },
} as const;

/**
 * Type representing the subscription plan tier
 */
export type PlanTier = 'free' | 'premium';

/**
 * Helper function to get the appropriate limits based on the subscription plan
 */
export function getLimitsForPlan(plan: PlanTier = 'free') {
  return plan === 'premium' ? SYSTEM_LIMITS.PREMIUM : SYSTEM_LIMITS.FREE;
}

/**
 * Helper function to determine if a server has premium access
 * This checks the billing status to determine the plan tier
 */
export function isPremiumPlan(billingStatus: any): boolean {
  if (!billingStatus) return false;
  
  const { subscription_status, current_period_end, plan } = billingStatus;
  
  // For cancelled subscriptions, check if the period has ended
  if (subscription_status === 'canceled') {
    if (!current_period_end) return false;
    const endDate = new Date(current_period_end);
    const now = new Date();
    return endDate > now && plan === 'premium';
  }
  
  // Only active or trialing subscriptions get premium benefits
  // Past due, unpaid, or incomplete subscriptions lose premium immediately
  return ['active', 'trialing'].includes(subscription_status) && plan === 'premium';
}

/**
 * Helper function to get plan tier from billing status
 */
export function getPlanTier(billingStatus: any): PlanTier {
  return isPremiumPlan(billingStatus) ? 'premium' : 'free';
}

/**
 * Helper function to create a standardized limit exceeded error message
 */
export function createLimitExceededError(
  itemType: string,
  currentCount: number,
  maxAllowed: number,
  context?: string,
  planTier?: PlanTier
): string {
  let baseMessage = `${itemType} limit exceeded: ${currentCount} exists, maximum allowed is ${maxAllowed}`;
  
  if (planTier === 'free') {
    baseMessage += ' (upgrade to Premium for higher limits)';
  }
  
  baseMessage += '.';
  return context ? `${baseMessage} ${context}` : baseMessage;
}

/**
 * Helper function to validate if adding new items would exceed a limit
 */
export function wouldExceedLimit(
  currentCount: number,
  itemsToAdd: number,
  maxAllowed: number
): boolean {
  return currentCount + itemsToAdd > maxAllowed;
}

