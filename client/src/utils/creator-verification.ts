/**
 * Utility functions for managing creator verification using localStorage
 * This helps distinguish between the original ticket creator and others who may have accessed the public URL
 */

/**
 * Generate a unique browser identifier for creator verification
 * This combines timestamp, random values, and basic browser info for uniqueness
 */
export function generateCreatorIdentifier(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  const userAgent = navigator.userAgent.substring(0, 50); // First 50 chars of user agent
  const screenInfo = `${screen.width}x${screen.height}`;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  // Create a hash-like identifier from these components
  const components = [timestamp, random, userAgent, screenInfo, timezone].join('|');
  
  // Simple hash function to create a shorter, more manageable identifier
  let hash = 0;
  for (let i = 0; i < components.length; i++) {
    const char = components.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Convert to positive hex string and add random suffix for extra uniqueness
  const hashStr = Math.abs(hash).toString(16);
  const suffix = Math.random().toString(36).substring(2, 8);
  
  return `creator_${hashStr}_${suffix}`;
}

/**
 * Get or create a creator identifier for a specific ticket
 * This ensures each ticket has its own creator identifier
 */
export function getCreatorIdentifier(ticketId: string): string {
  const storageKey = `ticket_creator_${ticketId}`;
  
  try {
    // Try to get existing identifier
    const existingId = localStorage.getItem(storageKey);
    if (existingId) {
      return existingId;
    }
    
    // Generate new identifier if none exists
    const newId = generateCreatorIdentifier();
    localStorage.setItem(storageKey, newId);
    
    return newId;
  } catch (error) {
    console.warn('Failed to access localStorage for creator verification:', error);
    // Fallback to session-based identifier if localStorage fails
    const sessionKey = `session_creator_${ticketId}`;
    if (!(window as any)[sessionKey]) {
      (window as any)[sessionKey] = generateCreatorIdentifier();
    }
    return (window as any)[sessionKey];
  }
}

/**
 * Check if a reply was made by the verified creator
 */
export function isVerifiedCreator(ticketId: string, replyCreatorId?: string): boolean {
  if (!replyCreatorId) {
    return false;
  }

  const currentCreatorId = getCreatorIdentifier(ticketId);
  return currentCreatorId === replyCreatorId;
}

/**
 * Check if we should show the unverified badge for a message
 * This handles legacy messages that don't have creatorIdentifier
 */
export function shouldShowUnverifiedBadge(ticketId: string, replyCreatorId?: string): boolean {
  // If there's no creatorIdentifier, this might be a legacy message
  // Don't show unverified badge for legacy messages
  if (!replyCreatorId) {
    return false;
  }

  // If we have a creatorIdentifier, check if it matches the current one
  return !isVerifiedCreator(ticketId, replyCreatorId);
}

/**
 * Get the current creator identifier without creating a new one
 * Useful for checking if we already have an identifier stored
 */
export function getCurrentCreatorIdentifier(ticketId: string): string | null {
  const storageKey = `ticket_creator_${ticketId}`;
  
  try {
    return localStorage.getItem(storageKey);
  } catch (error) {
    console.warn('Failed to access localStorage for creator verification:', error);
    const sessionKey = `session_creator_${ticketId}`;
    return (window as any)[sessionKey] || null;
  }
}

/**
 * Clear creator identifier for a ticket (useful for testing or cleanup)
 */
export function clearCreatorIdentifier(ticketId: string): void {
  const storageKey = `ticket_creator_${ticketId}`;
  
  try {
    localStorage.removeItem(storageKey);
  } catch (error) {
    console.warn('Failed to clear localStorage for creator verification:', error);
  }
  
  // Also clear session fallback
  const sessionKey = `session_creator_${ticketId}`;
  delete (window as any)[sessionKey];
}

/**
 * Get explanation text for why a reply might be unverified
 */
export function getUnverifiedExplanation(): string {
  return "This reply was made from a different browser or device than the original ticket creator, or the browser data was cleared. It could still be the same person using a different device, or it could be an attempt at impersonating the original ticket creator.";
}
