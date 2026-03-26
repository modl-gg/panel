export function generateCreatorIdentifier(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  const userAgent = navigator.userAgent.substring(0, 50);
  const screenInfo = `${screen.width}x${screen.height}`;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const components = [timestamp, random, userAgent, screenInfo, timezone].join('|');

  let hash = 0;
  for (let i = 0; i < components.length; i++) {
    const char = components.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  const hashStr = Math.abs(hash).toString(16);
  const suffix = Math.random().toString(36).substring(2, 8);
  
  return `creator_${hashStr}_${suffix}`;
}

export function getCreatorIdentifier(ticketId: string): string {
  const storageKey = `ticket_creator_${ticketId}`;
  
  try {
    const existingId = localStorage.getItem(storageKey);
    if (existingId) {
      return existingId;
    }

    const newId = generateCreatorIdentifier();
    localStorage.setItem(storageKey, newId);
    
    return newId;
  } catch (error) {
    console.warn('Failed to access localStorage for creator verification:', error);
    const sessionKey = `session_creator_${ticketId}`;
    if (!(window as any)[sessionKey]) {
      (window as any)[sessionKey] = generateCreatorIdentifier();
    }
    return (window as any)[sessionKey];
  }
}

export function isVerifiedCreator(ticketId: string, replyCreatorId?: string): boolean {
  if (!replyCreatorId) {
    return false;
  }

  try {
    const currentCreatorId = getCreatorIdentifier(ticketId);
    return currentCreatorId === replyCreatorId;
  } catch (error) {
    console.warn('Error checking creator verification:', error);
    return false;
  }
}

export function shouldShowUnverifiedBadge(ticketId: string, replyCreatorId?: string, isStaffPanel: boolean = false): boolean {
  try {
    // Legacy messages without creatorIdentifier shouldn't show unverified badge
    if (!replyCreatorId) {
      return false;
    }

    // Verification is only meaningful for the player-facing ticket page
    if (isStaffPanel) {
      return false;
    }

    return !isVerifiedCreator(ticketId, replyCreatorId);
  } catch (error) {
    console.warn('Error checking if should show unverified badge:', error);
    return false;
  }
}

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

export function clearCreatorIdentifier(ticketId: string): void {
  const storageKey = `ticket_creator_${ticketId}`;
  
  try {
    localStorage.removeItem(storageKey);
  } catch (error) {
    console.warn('Failed to clear localStorage for creator verification:', error);
  }
  
  const sessionKey = `session_creator_${ticketId}`;
  delete (window as any)[sessionKey];
}

export function getUnverifiedExplanation(): string {
  return "This reply was made from a different browser or device than the original ticket creator, or the browser data was cleared. It could still be the same person using a different device, or it could be an attempt at impersonating the original ticket creator.";
}
