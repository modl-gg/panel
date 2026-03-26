export interface QuickResponseAction {
  id: string;
  name: string;
  message: string;
  order: number;
  closeTicket?: boolean;
  showPunishment?: boolean;
  appealAction?: 'pardon' | 'reduce' | 'reject' | 'none';
}

export interface QuickResponseCategory {
  id: string;
  name: string;
  ticketTypes: string[];
  actions: QuickResponseAction[];
  order: number;
}

export interface QuickResponsesConfiguration {
  categories: QuickResponseCategory[];
}

export const defaultQuickResponsesConfig: QuickResponsesConfiguration = {
  categories: []
};