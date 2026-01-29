export interface QuickResponseAction {
  id: string;
  name: string;
  message: string;
  order: number;
  closeTicket?: boolean; // Whether this action should close the ticket
  
  // Punishment flag - determines if punishment interface should be shown for this response
  showPunishment?: boolean;
  
  // For appeal actions (simplified - no duration reduction settings here)
  appealAction?: 'pardon' | 'reduce' | 'reject' | 'none';
}

export interface QuickResponseCategory {
  id: string;
  name: string;
  ticketTypes: string[]; // ['player_report', 'chat_report', 'bug', 'appeal', 'support', 'application']
  actions: QuickResponseAction[];
  order: number;
}

export interface QuickResponsesConfiguration {
  categories: QuickResponseCategory[];
}

// Default configuration - empty so only configured quick responses show
// "Comment" and "Close" are hardcoded in the UI, everything else comes from settings
export const defaultQuickResponsesConfig: QuickResponsesConfiguration = {
  categories: []
};