// Centralized type definitions for appeal and ticket form fields

// Appeal form types
export interface AppealFormField {
  id: string;
  type: 'text' | 'textarea' | 'dropdown' | 'multiple_choice' | 'checkbox' | 'file_upload' | 'checkboxes';
  label: string;
  description?: string;
  required: boolean;
  options?: string[];
  order: number;
  sectionId?: string;
  goToSection?: string;
  optionSectionMapping?: Record<string, string>;
}

export interface AppealFormSection {
  id: string;
  title: string;
  description?: string;
  order: number;
  showIfFieldId?: string;
  showIfValue?: string;
  showIfValues?: string[];
  hideByDefault?: boolean;
}

export interface AppealFormSettings {
  fields: AppealFormField[];
  sections: AppealFormSection[];
}

// Ticket form types
export interface TicketFormField {
  id: string;
  type: 'text' | 'textarea' | 'dropdown' | 'multiple_choice' | 'checkbox' | 'file_upload' | 'checkboxes' | 'description';
  label: string;
  description?: string;
  required: boolean;
  options?: string[];
  order: number;
  sectionId?: string;
  goToSection?: string;
  optionSectionMapping?: Record<string, string>;
}

export interface TicketFormSection {
  id: string;
  title: string;
  description?: string;
  order: number;
  showIfFieldId?: string;
  showIfValue?: string;
  showIfValues?: string[];
  hideByDefault?: boolean;
}

export interface TicketFormSettings {
  requireEmail?: boolean;
  requireEmailAuth?: boolean;
  allowEmailNotifications?: boolean;
  fields: TicketFormField[];
  sections: TicketFormSection[];
}

export interface TicketFormsConfiguration {
  bug: TicketFormSettings;
  support: TicketFormSettings;
  application: TicketFormSettings;
}
