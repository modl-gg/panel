import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Scale, Shield, Globe, Tag, Plus, X, Fingerprint, KeyRound, Lock, QrCode, Copy, Check, Mail, Trash2, GamepadIcon, MessageCircle, Save, CheckCircle, User as UserIcon, CreditCard, BookOpen, Settings as SettingsIcon, Upload, Key, Eye, EyeOff, RefreshCw, ChevronDown, ChevronRight, Layers, GripVertical, Edit3, Users, Bot, FileText, Home } from 'lucide-react';
import { getApiUrl, getCurrentDomain, apiFetch, apiUpload } from '@/lib/api';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Card, CardContent, CardHeader } from '@modl-gg/shared-web/components/ui/card';
import { useSidebar } from '@/hooks/use-sidebar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@modl-gg/shared-web/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@modl-gg/shared-web/components/ui/collapsible';
import { Switch } from '@modl-gg/shared-web/components/ui/switch';
import { Label } from '@modl-gg/shared-web/components/ui/label';
import { Separator } from '@modl-gg/shared-web/components/ui/separator';
import { Slider } from '@modl-gg/shared-web/components/ui/slider';
import { Progress } from '@modl-gg/shared-web/components/ui/progress';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import { Checkbox } from '@modl-gg/shared-web/components/ui/checkbox';
import { useToast } from '@modl-gg/shared-web/hooks/use-toast';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@modl-gg/shared-web/components/ui/select';
import { useSettings, useBillingStatus, useUsageData, usePunishmentTypes, useTicketFormSettings, useQuickResponses } from '@/hooks/use-data';
import PageContainer from '@/components/layout/PageContainer'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@modl-gg/shared-web/components/ui/dialog";
import { queryClient } from '@/lib/queryClient';
import { useBeforeUnload } from 'react-router-dom';
import { useLocation } from "wouter"; // For wouter navigation
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@modl-gg/shared-web/components/ui/tooltip";
import { useAuth } from '@/hooks/use-auth';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePermissions } from '@/hooks/use-permissions';
import StaffManagementPanel from '@/components/settings/StaffManagementPanel';
import StaffRolesCard from '@/components/settings/StaffRolesCard';
import BillingSettings from '@/components/settings/BillingSettings';
import DomainSettings from '@/components/settings/DomainSettings';
import KnowledgebaseSettings from '@/components/settings/KnowledgebaseSettings';
import HomepageCardSettings from '@/components/settings/HomepageCardSettings';
import AccountSettings from '@/components/settings/AccountSettings';
import GeneralSettings from '@/components/settings/GeneralSettings';
import PunishmentSettings from '@/components/settings/PunishmentSettings';
import TicketSettings from '@/components/settings/TicketSettings';
import WebhookSettings from '@/components/settings/WebhookSettings';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { QuickResponsesConfiguration, defaultQuickResponsesConfig } from '@/types/quickResponses';

// Type definitions for appeal form fields
interface AppealFormField {
  id: string;
  type: 'text' | 'textarea' | 'dropdown' | 'multiple_choice' | 'checkbox' | 'file_upload' | 'checkboxes';
  label: string;
  description?: string;
  required: boolean;
  options?: string[];
  order: number;
  sectionId?: string;
  goToSection?: string;
  optionSectionMapping?: Record<string, string>; // Maps option values to section IDs
}

interface AppealFormSection {
  id: string;
  title: string;
  description?: string;
  order: number;
  showIfFieldId?: string;
  showIfValue?: string;
  showIfValues?: string[];
  hideByDefault?: boolean;
}

interface AppealFormSettings {
  fields: AppealFormField[];
  sections: AppealFormSection[];
}

// Type definitions for configurable ticket forms with sections
interface TicketFormField {
  id: string;
  type: 'text' | 'textarea' | 'dropdown' | 'multiple_choice' | 'checkbox' | 'file_upload' | 'checkboxes';
  label: string;
  description?: string;
  required: boolean;
  options?: string[]; // For dropdown, multiple_choice, and checkboxes fields
  order: number;
  sectionId?: string; // Which section this field belongs to
  goToSection?: string; // Legacy: Section to show when this field has a value
  optionSectionMapping?: Record<string, string>; // Maps option values to section IDs
}

interface TicketFormSection {
  id: string;
  title: string;
  description?: string;
  order: number;
  // Conditional display based on field values
  showIfFieldId?: string; // Field ID to watch for conditions
  showIfValue?: string; // Value that triggers showing this section
  showIfValues?: string[]; // Multiple values that can trigger showing this section
}

interface TicketFormSettings {
  fields: TicketFormField[];
  sections: TicketFormSection[];
}

// Configuration for all ticket form types
interface TicketFormsConfiguration {
  bug: TicketFormSettings;
  support: TicketFormSettings;
  application: TicketFormSettings;
}

// Type definitions for punishment types
interface PunishmentType {
  id: number;
  name: string;
  category: 'Gameplay' | 'Social' | 'Administrative';
  isCustomizable: boolean;
  ordinal: number;
  durations?: {
    low: {
      first: { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; type: 'mute' | 'ban' | 'permanent mute' | 'permanent ban'; };
      medium: { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; type: 'mute' | 'ban' | 'permanent mute' | 'permanent ban'; };
      habitual: { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; type: 'mute' | 'ban' | 'permanent mute' | 'permanent ban'; };
    };
    regular: {
      first: { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; type: 'mute' | 'ban' | 'permanent mute' | 'permanent ban'; };
      medium: { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; type: 'mute' | 'ban' | 'permanent mute' | 'permanent ban'; };
      habitual: { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; type: 'mute' | 'ban' | 'permanent mute' | 'permanent ban'; };
    };
    severe: {
      first: { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; type: 'mute' | 'ban' | 'permanent mute' | 'permanent ban'; };
      medium: { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; type: 'mute' | 'ban' | 'permanent mute' | 'permanent ban'; };
      habitual: { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; type: 'mute' | 'ban' | 'permanent mute' | 'permanent ban'; };
    };
  };
  points?: {
    low: number;
    regular: number;
    severe: number;
  };
  customPoints?: number; // For permanent punishments that don't use severity-based points
  appealForm?: AppealFormSettings; // Punishment-specific appeal form configuration
  staffDescription?: string; // Description shown to staff when applying this punishment
  playerDescription?: string; // Description shown to players (in appeals, notifications, etc.)
  canBeAltBlocking?: boolean; // Whether this punishment can block alternative accounts
  canBeStatWiping?: boolean; // Whether this punishment can wipe player statistics
  isAppealable?: boolean; // Whether this punishment type can be appealed
  singleSeverityPunishment?: boolean; // Whether this punishment uses single severity instead of three levels
  singleSeverityDurations?: {
    first: { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; type: 'mute' | 'ban' | 'permanent mute' | 'permanent ban'; };
    medium: { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; type: 'mute' | 'ban' | 'permanent mute' | 'permanent ban'; };
    habitual: { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'; type: 'mute' | 'ban' | 'permanent mute' | 'permanent ban'; };
  };
  singleSeverityPoints?: number; // Points for single severity punishments
  permanentUntilUsernameChange?: boolean; // Whether this punishment persists until player changes username
  permanentUntilSkinChange?: boolean; // Whether this punishment persists until player changes skin
}

// Type definition for offender status thresholds
interface StatusThresholds {
  gameplay: {
    medium: number;  // Points threshold for medium offender status
    habitual: number; // Points threshold for habitual offender status
  };
  social: {
    medium: number;  // Points threshold for medium offender status
    habitual: number; // Points threshold for habitual offender status
  };
}

interface AIServicePunishmentType {
  id: number;
  name: string;
  category: string;
  aiDescription: string;
  enabled: boolean;
  ordinal: number;
}

interface IAIPunishmentConfig {
  enabled: boolean;
  aiDescription: string;
}

interface IAIModerationSettings {
  enableAIReview: boolean;
  enableAutomatedActions: boolean;
  strictnessLevel: 'lenient' | 'standard' | 'strict';
  aiPunishmentConfigs: Record<string, IAIPunishmentConfig>;
}

interface AvailablePunishmentType {
  id: number;
  name: string;
  category: string;
  ordinal: number;
}

// FieldDropZone Component for cross-section field drops
interface FieldDropZoneProps {
  sectionId: string;
  moveFieldBetweenSections: (fieldId: string, fromSectionId: string, toSectionId: string, targetIndex?: number) => void;
}

const FieldDropZone = ({ sectionId, moveFieldBetweenSections }: FieldDropZoneProps) => {
  const [{ isOver, canDrop }, drop] = useDrop({
    accept: 'field',
    drop: (item: { index: number; sectionId: string; fieldId: string }) => {
      // Only handle cross-section drops
      if (item.sectionId !== sectionId) {
        moveFieldBetweenSections(item.fieldId, item.sectionId, sectionId);
      }
    },
    canDrop: (item: { index: number; sectionId: string; fieldId: string }) => {
      // Only allow drops from other sections
      return item.sectionId !== sectionId;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  return (
    <div
      ref={drop}
      className={`border-2 border-dashed rounded-lg p-2 text-center text-sm transition-colors ${
        isOver && canDrop
          ? 'border-primary bg-primary/10 text-primary'
          : canDrop
          ? 'border-muted-foreground/50 text-muted-foreground'
          : 'border-transparent'
      }`}
    >
      {isOver && canDrop ? (
        <span>Drop field here</span>
      ) : canDrop ? (
        <span className="opacity-50">Drop fields from other sections here</span>
      ) : (
        <span className="opacity-0">Drop zone</span>
      )}
    </div>
  );
};

// DraggableSectionCard Component
interface DraggableSectionCardProps {
  section: TicketFormSection;
  index: number;
  moveSection: (dragIndex: number, hoverIndex: number) => void;
  selectedTicketFormType: string;
  ticketForms: TicketFormsConfiguration;
  onEditSection: (section: TicketFormSection) => void;
  onDeleteSection: (sectionId: string) => void;
  onEditField: (field: TicketFormField) => void;
  onDeleteField: (fieldId: string) => void;
  onAddField: (sectionId: string) => void;
  moveField: (dragIndex: number, hoverIndex: number, sectionId: string) => void;
  moveFieldBetweenSections: (fieldId: string, fromSectionId: string, toSectionId: string, targetIndex?: number) => void;
}

const DraggableSectionCard = ({ 
  section, 
  index, 
  moveSection, 
  selectedTicketFormType,
  ticketForms,
  onEditSection,
  onDeleteSection,
  onEditField,
  onDeleteField,
  onAddField,
  moveField,
  moveFieldBetweenSections
}: DraggableSectionCardProps) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'section',
    item: { index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [, drop] = useDrop({
    accept: 'section',
    hover: (item: { index: number }) => {
      if (item.index !== index) {
        moveSection(item.index, index);
        item.index = index;
      }
    },
  });

  // Get fields for this section
  const sectionFields = ticketForms[selectedTicketFormType]?.fields
    ?.filter(field => field.sectionId === section.id)
    ?.sort((a, b) => a.order - b.order) || [];

  return (
    <div
      ref={(node) => drag(drop(node))}
      className={`border rounded-lg p-4 bg-card space-y-3 ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
          <div>
            <h6 className="font-medium">{section.title}</h6>
            {section.description && (
              <p className="text-sm text-muted-foreground">{section.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onEditSection(section)}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDeleteSection(section.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Fields in this section */}
      <div className="space-y-2">
        {sectionFields.map((field, fieldIndex) => (
          <DraggableFieldCard
            key={field.id}
            field={field}
            index={fieldIndex}
            sectionId={section.id}
            moveField={moveField}
            moveFieldBetweenSections={moveFieldBetweenSections}
            onEditField={onEditField}
            onDeleteField={onDeleteField}
          />
        ))}
        
        {/* Drop zone for adding fields from other sections */}
        <FieldDropZone
          sectionId={section.id}
          moveFieldBetweenSections={moveFieldBetweenSections}
        />
        
        <Button
          size="sm"
          variant="outline"
          onClick={() => onAddField(section.id)}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Field
        </Button>
      </div>
    </div>
  );
};

// DraggableFieldCard Component
interface DraggableFieldCardProps {
  field: TicketFormField;
  index: number;
  sectionId: string;
  moveField: (dragIndex: number, hoverIndex: number, sectionId: string) => void;
  moveFieldBetweenSections: (fieldId: string, fromSectionId: string, toSectionId: string, targetIndex?: number) => void;
  onEditField: (field: TicketFormField) => void;
  onDeleteField: (fieldId: string) => void;
}

const DraggableFieldCard = ({ 
  field, 
  index, 
  sectionId, 
  moveField, 
  moveFieldBetweenSections,
  onEditField, 
  onDeleteField 
}: DraggableFieldCardProps) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'field',
    item: { index, sectionId, fieldId: field.id },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [, drop] = useDrop({
    accept: 'field',
    hover: (item: { index: number; sectionId: string; fieldId: string }) => {
      // Allow movement within the same section
      if (item.sectionId === sectionId && item.index !== index) {
        moveField(item.index, index, sectionId);
        item.index = index;
      }
    },
    drop: (item: { index: number; sectionId: string; fieldId: string }) => {
      // Handle cross-section movement
      if (item.sectionId !== sectionId) {
        moveFieldBetweenSections(item.fieldId, item.sectionId, sectionId, index);
      }
    },
  });

  const getFieldTypeLabel = (type: string) => {
    switch (type) {
      case 'text': return 'Text';
      case 'textarea': return 'Textarea';
      case 'dropdown': return 'Dropdown';
      case 'multiple_choice': return 'Multiple Choice';
      case 'checkbox': return 'Checkbox';
      case 'file_upload': return 'File Upload';
      case 'checkboxes': return 'Checkboxes';
      default: return type;
    }
  };

  return (
    <div
      ref={(node) => drag(drop(node))}
      className={`border rounded p-3 bg-muted/50 ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GripVertical className="h-3 w-3 text-muted-foreground cursor-move" />
          <div>
            <p className="text-sm font-medium">{field.label}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-xs">
                {getFieldTypeLabel(field.type)}
              </Badge>
              {field.required && (
                <Badge variant="destructive" className="text-xs">
                  Required
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onEditField(field)}
            className="h-6 w-6 p-0"
          >
            <Edit3 className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDeleteField(field.id)}
            className="h-6 w-6 p-0"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
};

// Draggable Appeal Form Section Card Component
interface DraggableAppealFormSectionCardProps {
  section: AppealFormSection;
  index: number;
  moveSection: (dragIndex: number, hoverIndex: number) => void;
  selectedPunishment: PunishmentType;
  onEditSection: (section: AppealFormSection) => void;
  onDeleteSection: (sectionId: string) => void;
  onEditField: (field: AppealFormField) => void;
  onDeleteField: (fieldId: string) => void;
  onAddField: (sectionId: string) => void;
  moveField: (dragIndex: number, hoverIndex: number, sectionId: string) => void;
  moveFieldBetweenSections: (fieldId: string, fromSectionId: string, toSectionId: string, targetIndex?: number) => void;
}

const DraggableAppealFormSectionCard = ({ 
  section, 
  index, 
  moveSection, 
  selectedPunishment,
  onEditSection,
  onDeleteSection,
  onEditField,
  onDeleteField,
  onAddField,
  moveField,
  moveFieldBetweenSections
}: DraggableAppealFormSectionCardProps) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'appeal-section',
    item: { index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [, drop] = useDrop({
    accept: 'appeal-section',
    hover: (item: { index: number }) => {
      if (item.index !== index) {
        moveSection(item.index, index);
        item.index = index;
      }
    },
  });

  const sectionFields = selectedPunishment.appealForm?.fields
    ?.filter(field => field.sectionId === section.id)
    ?.sort((a, b) => a.order - b.order) || [];

  return (
    <div
      ref={(node) => drag(drop(node))}
      className={`border rounded-lg p-4 bg-card space-y-3 ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
          <div>
            <div className="flex items-center gap-2">
              <h6 className="font-medium">{section.title}</h6>
              {section.hideByDefault && (
                <Badge variant="secondary" className="text-xs">
                  Hidden by default
                </Badge>
              )}
            </div>
            {section.description && (
              <p className="text-sm text-muted-foreground mt-1">{section.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onEditSection(section)}
            className="h-8 px-2"
          >
            <Edit3 className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDeleteSection(section.id)}
            className="h-8 px-2 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Fields in this section */}
      <div className="space-y-2">
        {sectionFields.map((field, fieldIndex) => (
          <DraggableAppealFormFieldCard
            key={field.id}
            field={field}
            index={fieldIndex}
            sectionId={section.id}
            moveField={moveField}
            moveFieldBetweenSections={moveFieldBetweenSections}
            onEditField={onEditField}
            onDeleteField={onDeleteField}
          />
        ))}
        
        {/* Drop zone for adding fields from other sections */}
        <AppealFormFieldDropZone
          sectionId={section.id}
          moveFieldBetweenSections={moveFieldBetweenSections}
        />
        
        <Button
          size="sm"
          variant="outline"
          onClick={() => onAddField(section.id)}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Field
        </Button>
      </div>
    </div>
  );
};

// Draggable Appeal Form Field Card Component
interface DraggableAppealFormFieldCardProps {
  field: AppealFormField;
  index: number;
  sectionId: string;
  moveField: (dragIndex: number, hoverIndex: number, sectionId: string) => void;
  moveFieldBetweenSections: (fieldId: string, fromSectionId: string, toSectionId: string, targetIndex?: number) => void;
  onEditField: (field: AppealFormField) => void;
  onDeleteField: (fieldId: string) => void;
}

const DraggableAppealFormFieldCard = ({ 
  field, 
  index, 
  sectionId, 
  moveField, 
  moveFieldBetweenSections,
  onEditField, 
  onDeleteField 
}: DraggableAppealFormFieldCardProps) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'appeal-field',
    item: { index, sectionId, fieldId: field.id },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [, drop] = useDrop({
    accept: 'appeal-field',
    hover: (item: { index: number; sectionId: string; fieldId: string }) => {
      // Allow movement within the same section
      if (item.sectionId === sectionId && item.index !== index) {
        moveField(item.index, index, sectionId);
        item.index = index;
      }
    },
    drop: (item: { index: number; sectionId: string; fieldId: string }) => {
      // Handle cross-section movement
      if (item.sectionId !== sectionId) {
        moveFieldBetweenSections(item.fieldId, item.sectionId, sectionId, index);
      }
    },
  });

  const getFieldTypeLabel = (type: string) => {
    switch (type) {
      case 'text': return 'Text';
      case 'textarea': return 'Textarea';
      case 'dropdown': return 'Dropdown';
      case 'multiple_choice': return 'Multiple Choice';
      case 'checkbox': return 'Checkbox';
      case 'file_upload': return 'File Upload';
      case 'checkboxes': return 'Checkboxes';
      default: return type;
    }
  };

  return (
    <div
      ref={(node) => drag(drop(node))}
      className={`border rounded p-3 bg-muted/50 ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GripVertical className="h-3 w-3 text-muted-foreground cursor-move" />
          <div>
            <p className="text-sm font-medium">{field.label}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{getFieldTypeLabel(field.type)}</span>
              {field.required && <span className="text-red-500">Required</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onEditField(field)}
            className="h-7 px-2"
          >
            <Edit3 className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDeleteField(field.id)}
            className="h-7 px-2 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
};

// Appeal Form Field Drop Zone Component
interface AppealFormFieldDropZoneProps {
  sectionId: string;
  moveFieldBetweenSections: (fieldId: string, fromSectionId: string, toSectionId: string, targetIndex?: number) => void;
}

const AppealFormFieldDropZone = ({ sectionId, moveFieldBetweenSections }: AppealFormFieldDropZoneProps) => {
  const [{ isOver, canDrop }, drop] = useDrop({
    accept: 'appeal-field',
    drop: (item: { index: number; sectionId: string; fieldId: string }) => {
      // Only handle cross-section drops
      if (item.sectionId !== sectionId) {
        moveFieldBetweenSections(item.fieldId, item.sectionId, sectionId);
      }
    },
    canDrop: (item: { index: number; sectionId: string; fieldId: string }) => {
      // Only allow drops from other sections
      return item.sectionId !== sectionId;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  return (
    <div
      ref={drop}
      className={`border-2 border-dashed rounded-lg p-2 text-center text-sm transition-colors ${
        isOver && canDrop
          ? 'border-primary bg-primary/10 text-primary'
          : canDrop
          ? 'border-muted-foreground/50 text-muted-foreground'
          : 'border-transparent'
      }`}
    >
      {isOver && canDrop ? (
        <span>Drop field here</span>
      ) : canDrop ? (
        <span className="opacity-50">Drop fields from other sections here</span>
      ) : (
        <span className="opacity-0">Drop zone</span>
      )}
    </div>
  );
};

const Settings = () => {
  const { } = useSidebar();
  const [location, navigateWouter] = useLocation();
  const { user, logout } = useAuth();
  const { canAccessSettingsTab, getAccessibleSettingsTabs } = usePermissions();
  const isMobile = useIsMobile();
  const mainContentClass = "ml-[32px] pl-8";
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [expandedSubCategory, setExpandedSubCategory] = useState<string | null>(null);

  // Update URL when category changes
  const updateURL = (category: string | null, subCategory?: string | null) => {
    const url = new URL(window.location.href);
    if (category) {
      url.searchParams.set('category', category);
    } else {
      url.searchParams.delete('category');
    }
    if (subCategory) {
      url.searchParams.set('sub', subCategory);
    } else {
      url.searchParams.delete('sub');
    }
    window.history.replaceState({}, '', url.toString());
  };

  // Initialize from URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlCategory = urlParams.get('category') || urlParams.get('tab'); // Support legacy tab param
    const urlSubCategory = urlParams.get('sub') || urlParams.get('section');

    // Handle legacy session_id parameter
    if (urlParams.has('session_id') && user?.role === 'Super Admin') {
      setExpandedCategory('general');
      setExpandedSubCategory('billing');
      updateURL('general', 'billing');
      return;
    }

    // If URL has category parameter, validate and set it
    if (urlCategory && user) {
      // Map legacy tab names to new category names
      const categoryMap: Record<string, string> = {
        'tags': 'tickets',
        'homepage': 'knowledgebase',
      };
      const mappedCategory = categoryMap[urlCategory] || urlCategory;

      // Check if user can access the requested category
      if (canAccessSettingsTab(mappedCategory as any)) {
        setExpandedCategory(mappedCategory);
        if (urlSubCategory) {
          // Only use the first sub-category if multiple were provided
          setExpandedSubCategory(urlSubCategory.split(',')[0]);
        }
      }
    }
  }, [user, canAccessSettingsTab]);

  // Handle sub-category selection - only one can be selected at a time
  const handleSubCategorySelect = (category: string, subCategory: string) => {
    // If clicking the same sub-category, deselect it
    if (expandedCategory === category && expandedSubCategory === subCategory) {
      setExpandedSubCategory(null);
      updateURL(category, null);
    } else {
      setExpandedCategory(category);
      setExpandedSubCategory(subCategory);
      updateURL(category, subCategory);
    }
  };
  
  // Auto-save state
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const profileSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Separate timeout for profile
  const initialSettingsRef = useRef<any | null>(null);
  const justLoadedFromServerRef = useRef(true);
  const pendingChangesRef = useRef(false);
  const initialLoadCompletedRef = useRef(false);
  
  // Refs to capture latest profile values for auto-save
  const profileUsernameRef = useRef('');

  // Database connection state
  const [dbConnectionStatus, setDbConnectionStatus] = useState(false);
  const [mongodbUri, setMongodbUri] = useState('');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  // Punishment types state
  // State for all settings fields
  const [punishmentTypesState, setPunishmentTypesState] = useState<PunishmentType[]>([
    // Administrative punishment types (IDs 0-5, not customizable) - minimal fallback
    { id: 0, name: 'Kick', category: 'Administrative', isCustomizable: false, ordinal: 0 },
    { id: 1, name: 'Manual Mute', category: 'Administrative', isCustomizable: false, ordinal: 1 },
    { id: 2, name: 'Manual Ban', category: 'Administrative', isCustomizable: false, ordinal: 2 },
    { id: 3, name: 'Security Ban', category: 'Administrative', isCustomizable: false, ordinal: 3 },
    { id: 4, name: 'Linked Ban', category: 'Administrative', isCustomizable: false, ordinal: 4 },
    { id: 5, name: 'Blacklist', category: 'Administrative', isCustomizable: false, ordinal: 5 }
    // Social and Gameplay punishment types are loaded from server during provisioning
  ]);  const [newPunishmentNameState, setNewPunishmentNameState] = useState('');
  const [newPunishmentCategoryState, setNewPunishmentCategoryState] = useState<'Gameplay' | 'Social'>('Gameplay');

  // Threshold values for player status levels
  const [statusThresholdsState, setStatusThresholdsState] = useState<StatusThresholds>({
    gameplay: {
      medium: 5,  // 5+ points = medium offender
      habitual: 10 // 10+ points = habitual offender
    },
    social: {
      medium: 4,  // 4+ points = medium offender
      habitual: 8  // 8+ points = habitual offender
    }
  });
  // Selected punishment for editing
  const [selectedPunishmentState, setSelectedPunishmentState] = useState<PunishmentType | null>(null);

  // State to control visibility of core punishment types
  const [showCorePunishmentsState, setShowCorePunishmentsState] = useState(false);

  // Appeal form state variables
  const [selectedAppealField, setSelectedAppealField] = useState<AppealFormField | null>(null);
  const [selectedAppealSection, setSelectedAppealSection] = useState<AppealFormSection | null>(null);
  const [isAddAppealFieldDialogOpen, setIsAddAppealFieldDialogOpen] = useState(false);
  const [isAddAppealSectionDialogOpen, setIsAddAppealSectionDialogOpen] = useState(false);
  const [newAppealFieldLabel, setNewAppealFieldLabel] = useState('');
  const [newAppealFieldType, setNewAppealFieldType] = useState<'text' | 'textarea' | 'dropdown' | 'multiple_choice' | 'checkbox' | 'file_upload' | 'checkboxes'>('text');
  const [newAppealFieldDescription, setNewAppealFieldDescription] = useState('');
  const [newAppealFieldRequired, setNewAppealFieldRequired] = useState(false);
  const [newAppealFieldOptions, setNewAppealFieldOptions] = useState<string[]>([]);
  const [newAppealFieldSectionId, setNewAppealFieldSectionId] = useState('');
  const [newAppealFieldOptionSectionMapping, setNewAppealFieldOptionSectionMapping] = useState<Record<string, string>>({});
  const [isAppealOptionNavigationExpanded, setIsAppealOptionNavigationExpanded] = useState(false);
  const [newAppealSectionTitle, setNewAppealSectionTitle] = useState('');
  const [newAppealSectionDescription, setNewAppealSectionDescription] = useState('');
  const [newAppealSectionHideByDefault, setNewAppealSectionHideByDefault] = useState(false);
  const [newOption, setNewOption] = useState('');

  // Collapsible section states (all collapsed by default)
  const [isBillingExpanded, setIsBillingExpanded] = useState(false);
  const [isServerConfigExpanded, setIsServerConfigExpanded] = useState(false);
  const [isServerIconsExpanded, setIsServerIconsExpanded] = useState(false);
  const [isApiKeyExpanded, setIsApiKeyExpanded] = useState(false);
  const [isDomainExpanded, setIsDomainExpanded] = useState(false);
  // Individual section expanded states for tickets
  const [isQuickResponsesExpanded, setIsQuickResponsesExpanded] = useState(false);
  const [isTagManagementExpanded, setIsTagManagementExpanded] = useState(false);
  const [isTicketFormsExpanded, setIsTicketFormsExpanded] = useState(false);
  const [isAIModerationExpanded, setIsAIModerationExpanded] = useState(false);

  // Quick responses state for each ticket category
  const [quickResponsesState, setQuickResponsesState] = useState<QuickResponsesConfiguration>(defaultQuickResponsesConfig);

  // Labels state (new unified system)
  interface Label {
    id: string;
    name: string;
    color: string;
    description?: string;
  }
  const [labelsState, setLabelsState] = useState<Label[]>([]);

  // Tags state for each ticket category (deprecated - kept for backwards compatibility)
  const [bugReportTagsState, setBugReportTagsState] = useState<string[]>([
    'UI Issue', 'Server', 'Performance', 'Crash', 'Game Mechanics'
  ]);
  const [playerReportTagsState, setPlayerReportTagsState] = useState<string[]>([
    'Harassment', 'Cheating', 'Spam', 'Inappropriate Content', 'Griefing'
  ]);
  const [appealTagsState, setAppealTagsState] = useState<string[]>([
    'Ban Appeal', 'Mute Appeal', 'False Positive', 'Second Chance'
  ]);
  

  // For new tag input
  const [newBugTagState, setNewBugTagState] = useState('');
  const [newPlayerTagState, setNewPlayerTagState] = useState('');
  const [newAppealTagState, setNewAppealTagState] = useState('');
  
  // Ticket Forms Configuration State
  const [ticketFormsState, setTicketFormsState] = useState<TicketFormsConfiguration>({
    bug: { fields: [], sections: [] },
    support: { fields: [], sections: [] },
    application: { fields: [], sections: [] }
  });
  
  // Form builder states for each ticket type
  const [selectedTicketFormType, setSelectedTicketFormType] = useState<'bug' | 'support' | 'application'>('bug');
  const [selectedTicketFormField, setSelectedTicketFormField] = useState<TicketFormField | null>(null);
  const [selectedTicketFormSection, setSelectedTicketFormSection] = useState<TicketFormSection | null>(null);
  const [isAddTicketFormFieldDialogOpen, setIsAddTicketFormFieldDialogOpen] = useState(false);
  const [isAddTicketFormSectionDialogOpen, setIsAddTicketFormSectionDialogOpen] = useState(false);
  const [newTicketFormFieldLabel, setNewTicketFormFieldLabel] = useState('');
  const [newTicketFormFieldType, setNewTicketFormFieldType] = useState<'text' | 'textarea' | 'dropdown' | 'multiple_choice' | 'checkbox' | 'file_upload' | 'checkboxes'>('text');
  const [newTicketFormFieldDescription, setNewTicketFormFieldDescription] = useState('');
  const [newTicketFormFieldRequired, setNewTicketFormFieldRequired] = useState(false);
  const [newTicketFormFieldOptions, setNewTicketFormFieldOptions] = useState<string[]>([]);
  const [newTicketFormFieldSectionId, setNewTicketFormFieldSectionId] = useState('');
  const [newTicketFormFieldGoToSection, setNewTicketFormFieldGoToSection] = useState('');
  const [newTicketFormFieldOptionSectionMapping, setNewTicketFormFieldOptionSectionMapping] = useState<Record<string, string>>({});
  const [newTicketFormOption, setNewTicketFormOption] = useState('');
  const [isOptionNavigationExpanded, setIsOptionNavigationExpanded] = useState(false);
  
  // Section builder states
  const [newTicketFormSectionTitle, setNewTicketFormSectionTitle] = useState('');
  const [newTicketFormSectionDescription, setNewTicketFormSectionDescription] = useState('');
  const [newTicketFormSectionShowIfFieldId, setNewTicketFormSectionShowIfFieldId] = useState('__none__');
  const [newTicketFormSectionShowIfValue, setNewTicketFormSectionShowIfValue] = useState('');
  const [newTicketFormSectionShowIfValues, setNewTicketFormSectionShowIfValues] = useState<string[]>([]);
  
  // Updated AI Punishment Types management state
  const [aiPunishmentTypes, setAiPunishmentTypes] = useState<AIServicePunishmentType[]>([]);
  const [availablePunishmentTypes, setAvailablePunishmentTypes] = useState<AvailablePunishmentType[]>([]);
  const [selectedPunishmentTypeId, setSelectedPunishmentTypeId] = useState<number | null>(null);
  const [selectedAIPunishmentType, setSelectedAIPunishmentType] = useState<AIServicePunishmentType | null>(null);
  const [isAddAIPunishmentDialogOpen, setIsAddAIPunishmentDialogOpen] = useState(false);
  const [newAIPunishmentDescription, setNewAIPunishmentDescription] = useState('');

  // Security tab states
  const [has2FAState, setHas2FAState] = useState(false);
  const [hasPasskeyState, setHasPasskeyState] = useState(false);  const [showSetup2FAState, setShowSetup2FAState] = useState(false);
  const [showSetupPasskeyState, setShowSetupPasskeyState] = useState(false);
  const [recoveryCodesCopiedState, setRecoveryCodesCopiedState] = useState(false);

  // General tab states
  const [serverDisplayName, setServerDisplayName] = useState('');
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');
  const [homepageIcon, setHomepageIcon] = useState<File | null>(null);
  const [panelIcon, setPanelIcon] = useState<File | null>(null);
  const [homepageIconUrl, setHomepageIconUrl] = useState('');
  const [panelIconUrl, setPanelIconUrl] = useState('');
  const [uploadingHomepageIcon, setUploadingHomepageIcon] = useState(false);
  const [uploadingPanelIcon, setUploadingPanelIcon] = useState(false);

  // Unified API Key management states
  const [apiKey, setApiKey] = useState('');
  const [fullApiKey, setFullApiKey] = useState(''); // Store the full key for copying
  const [showApiKey, setShowApiKey] = useState(false);
  const [isGeneratingApiKey, setIsGeneratingApiKey] = useState(false);
  const [isRevokingApiKey, setIsRevokingApiKey] = useState(false);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);    // Profile settings state
  const [profileUsernameState, setProfileUsernameState] = useState('');
  
  // AI Moderation settings state
  const [aiModerationSettings, setAiModerationSettings] = useState<IAIModerationSettings>({
    enableAIReview: false,
    enableAutomatedActions: false,
    strictnessLevel: 'standard',
    aiPunishmentConfigs: {}
  });
  const [isLoadingAiSettings, setIsLoadingAiSettings] = useState(false);
  const [isSavingAiSettings, setIsSavingAiSettings] = useState(false);
  
  const { toast } = useToast();
  const { data: settingsData, isLoading: isLoadingSettings, isFetching: isFetchingSettings } = useSettings();
  const { data: ticketFormSettingsData, isLoading: isLoadingTicketForms } = useTicketFormSettings();
  const { data: punishmentTypesData, isLoading: isLoadingPunishmentTypes } = usePunishmentTypes();
  const { data: quickResponsesData, isLoading: isLoadingQuickResponses } = useQuickResponses();
  const { data: billingStatus } = useBillingStatus();
  const { data: usageData } = useUsageData();
  const [currentEmail, setCurrentEmail] = useState('');

  // Helper functions for enhanced summaries
  const getBillingSummary = () => {
    if (!billingStatus) return "Loading billing info...";
    
    // Use the same logic as BillingSettings.tsx getCurrentPlan() function
    const getCurrentPlan = () => {
      const { plan, subscriptionStatus, currentPeriodEnd } = billingStatus;
      
      // If plan is explicitly set to premium in the database, trust it
      if (plan === 'premium') {
        if (subscriptionStatus === 'canceled') {
          if (!currentPeriodEnd) {
            return 'Free';
          }
          const endDate = new Date(currentPeriodEnd);
          const now = new Date();
          if (endDate <= now) {
            return 'Free';
          }
          return 'Premium';
        }
        return 'Premium';
      }
      
      // For cancelled subscriptions, check if the period has ended
      if (subscriptionStatus === 'canceled') {
        if (!currentPeriodEnd) {
          return 'Free'; // No end date means it's already expired
        }
        const endDate = new Date(currentPeriodEnd);
        const now = new Date();
        if (endDate <= now) {
          return 'Free'; // Cancellation period has ended
        }
        return 'Premium'; // Still has access until end date
      }
      
      // Active and trialing are clearly premium
      if (['active', 'trialing'].includes(subscriptionStatus)) {
        return 'Premium';
      }
      
      // For payment issues (past_due, unpaid), check if still within period
      if (['past_due', 'unpaid', 'incomplete'].includes(subscriptionStatus)) {
        if (currentPeriodEnd) {
          const endDate = new Date(currentPeriodEnd);
          const now = new Date();
          if (endDate > now) {
            return 'Premium'; // Still within paid period despite payment issues
          }
        }
      }
      
      return 'Free';
    };

    const plan = getCurrentPlan();
    const status = billingStatus.subscriptionStatus || "active";
    const nextBilling = billingStatus.currentPeriodEnd ? new Date(billingStatus.currentPeriodEnd).toLocaleDateString() : null;
    
    let statusBadge = "";
    if (status === "active") statusBadge = "Active";
    else if (status === "canceled") statusBadge = "Cancelled";
    else if (status === "past_due") statusBadge = "Past Due";
    else statusBadge = status;
    
    return nextBilling ? `${plan} Plan • ${statusBadge} • Next: ${nextBilling}` : `${plan} Plan • ${statusBadge}`;
  };

  const getUsageSummary = () => {
    if (!usageData) return null;
    
    const highUsageItems = [];
    if (usageData.cdn && usageData.cdn.percentage > 80) {
      highUsageItems.push(`CDN: ${usageData.cdn.percentage}%`);
    }
    if (usageData.ai && usageData.ai.percentage > 80) {
      highUsageItems.push(`AI: ${usageData.ai.percentage}%`);
    }
    
    return highUsageItems.length > 0 ? ` • ${highUsageItems.join(", ")}` : "";
  };

  const getServerConfigSummary = () => {
    const parts = [];
    parts.push(serverDisplayName || 'Untitled Server');
    
    const iconStatus = (homepageIconUrl && panelIconUrl) ? "Icons ✓" : 
                      (homepageIconUrl || panelIconUrl) ? "Icons ◐" : "Icons ✗";
    parts.push(iconStatus);
    
    const apiStatus = apiKey ? "API Key ✓" : "API Key ✗";
    parts.push(apiStatus);
    
    return parts.join(" • ");
  };

  const getDomainSummary = () => {
    // We'll need to add domain status fetching here
    // For now, show a basic summary
    return "Configure custom domain";
  };

  const getWebhookSummary = () => {
    const webhookSettings = settingsData?.settings?.webhookSettings;
    if (!webhookSettings) return "Loading webhook settings...";
    
    if (!webhookSettings.enabled) {
      return "Disabled";
    }
    
    if (!webhookSettings.discordWebhookUrl) {
      return "Enabled but not configured";
    }
    
    const notificationCount = Object.values(webhookSettings.notifications || {}).filter(Boolean).length;
    return `Enabled • ${notificationCount} notification types active`;
  };

  const [savingWebhookSettings, setSavingWebhookSettings] = useState(false);

  const handleWebhookSave = async (webhookSettings: any) => {
    setSavingWebhookSettings(true);
    try {
      const csrfFetch = apiFetch;
      const response = await csrfFetch('/v1/panel/settings/webhooks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookSettings),
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to save webhook settings');
      }

      queryClient.invalidateQueries({ queryKey: ['/v1/panel/settings/general'] });
    } catch (error) {
      console.error('Error saving webhook settings:', error);
      throw error;
    } finally {
      setSavingWebhookSettings(false);
    }
  };

  // Create aliases for the state variables to maintain backward compatibility
  const punishmentTypes = punishmentTypesState;
  const newPunishmentName = newPunishmentNameState;
  const newPunishmentCategory = newPunishmentCategoryState;
  const statusThresholds = statusThresholdsState;
  const selectedPunishment = selectedPunishmentState;
  const showCorePunishments = showCorePunishmentsState;
  const labels = labelsState;
  const bugReportTags = bugReportTagsState;
  const playerReportTags = playerReportTagsState;
  const appealTags = appealTagsState;
  const newBugTag = newBugTagState;
  const newPlayerTag = newPlayerTagState;
  const newAppealTag = newAppealTagState;
  const ticketForms = ticketFormsState;
  const has2FA = has2FAState;
  const hasPasskey = hasPasskeyState;
  const showSetup2FA = showSetup2FAState;
  const showSetupPasskey = showSetupPasskeyState;  const recoveryCodesCopied = recoveryCodesCopiedState;  
  
  // Profile settings aliases
  const profileUsername = profileUsernameState;
  
  useEffect(() => {
    if (user?.email) {
      setCurrentEmail(user.email);
    }  }, [user]);  // Initialize profile settings from user data
  useEffect(() => {
    if (user) {
      justLoadedFromServerRef.current = true; // Prevent auto-save during initial load
      setProfileUsernameState(user.username || '');
      
      // Initialize the refs with the current values
      profileUsernameRef.current = user.username || '';
      
      // Mark profile data as loaded after a short delay
      setTimeout(() => {
        justLoadedFromServerRef.current = false;
        if (!initialLoadCompletedRef.current) {
          initialLoadCompletedRef.current = true;
        }
      }, 500);
    }
  }, [user]);

  // Load API key on component mount (only for users with appropriate permissions)
  useEffect(() => {
    if (user && canAccessSettingsTab('general')) {
      loadApiKey();
    }
  }, [user?.role]); // Only depend on user role, not the function

  // File upload functions
  const uploadIcon = async (file: File, iconType: 'homepage' | 'panel'): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append('icon', file);

      const response = await apiUpload(`/v1/panel/settings/upload-icon?iconType=${iconType}`, formData);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Upload failed');
      }

      const result = await response.json();
      return result.url;
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload the icon. Please try again.",
        variant: "destructive",
      });
      return null;
    }
  };

  const handleHomepageIconUpload = async (file: File) => {
    setUploadingHomepageIcon(true);
    const uploadedUrl = await uploadIcon(file, 'homepage');
    if (uploadedUrl) {
      setHomepageIcon(file);
      setHomepageIconUrl(uploadedUrl);
      toast({
        title: "Homepage Icon Uploaded",
        description: "Your homepage icon has been successfully uploaded.",
      });
    }
    setUploadingHomepageIcon(false);
  };
  const handlePanelIconUpload = async (file: File) => {
    setUploadingPanelIcon(true);
    const uploadedUrl = await uploadIcon(file, 'panel');
    if (uploadedUrl) {
      setPanelIcon(file);
      setPanelIconUrl(uploadedUrl);
      
      // Refresh webhook settings to get updated avatar URL
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/settings/general'] });

      toast({
        title: "Panel Icon Uploaded",
        description: "Your panel icon has been successfully uploaded. Webhook avatar URL updated automatically.",
      });    }
    setUploadingPanelIcon(false);
  };

  // Unified API Key management functions
  const loadApiKey = async () => {
    try {
      const response = await fetch(getApiUrl('/v1/panel/settings/api-keys/panel/exists'), {
        credentials: 'include',
        headers: { 'X-Server-Domain': getCurrentDomain() }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.exists) {
          setApiKey('•••••••••••••••••••••••••');
          setFullApiKey('');
        } else {
          setApiKey('');
          setFullApiKey('');
        }
      } else {
        const errorText = await response.text();
        console.error('Failed to load API key:', response.status, response.statusText, errorText);
        setApiKey('');
        setFullApiKey('');
      }
    } catch (error) {
      console.error('Error loading API key:', error);
      setApiKey(''); // Set to empty on error
      setFullApiKey('');
    }
  };

  const generateApiKey = async () => {
    setIsGeneratingApiKey(true);
    try {
      const csrfFetch = apiFetch;
      const response = await csrfFetch('/v1/panel/settings/api-keys/panel/generate', {
        method: 'POST',
      });
      if (response.ok) {
        const data = await response.json();
        setFullApiKey(data.apiKey); // Store the full key for copying
        setApiKey(data.apiKey); // Display the full key initially
        setShowApiKey(true);
        toast({
          title: "API Key Generated",
          description: "Your new API key has been generated. Make sure to copy it as it won't be shown again.",
        });
      } else {
        throw new Error('Failed to generate API key');
      }
    } catch (error) {
      console.error('Error generating API key:', error);
      toast({
        title: "Error",
        description: "Failed to generate API key. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingApiKey(false);
    }
  };

  const revokeApiKey = async () => {
    if (!confirm('Are you sure you want to revoke the API key? This will invalidate all existing integrations using this key.')) {
      return;
    }
    
    setIsRevokingApiKey(true);
    try {
      const csrfFetch = apiFetch;
      const response = await csrfFetch('/v1/panel/settings/api-keys/panel', {
        method: 'DELETE',
      });
      if (response.ok) {
        setApiKey('');
        setFullApiKey('');
        setShowApiKey(false);
        toast({
          title: "API Key Revoked",
          description: "The API key has been revoked successfully.",
        });
      } else {
        throw new Error('Failed to revoke API key');
      }
    } catch (error) {
      console.error('Error revoking API key:', error);
      toast({
        title: "Error",
        description: "Failed to revoke API key. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRevokingApiKey(false);
    }
  };

  const revealApiKey = async () => {
    if (showApiKey) {
      // Hide the key
      setShowApiKey(false);
      return;
    }
    
    // Show the key - fetch full key if we don't have it
    if (!fullApiKey) {
      try {
        const response = await fetch(getApiUrl('/v1/panel/settings/api-keys/panel/reveal'), {
          credentials: 'include',
          headers: { 'X-Server-Domain': getCurrentDomain() }
        });
        if (response.ok) {
          const data = await response.json();
          setFullApiKey(data.apiKey);
          setApiKey(data.apiKey);
        } else {
          throw new Error('Failed to reveal API key');
        }
      } catch (error) {
        console.error('Error revealing API key:', error);
        toast({
          title: "Error",
          description: "Failed to reveal API key. Please try again.",
          variant: "destructive",
        });
        return;
      }
    }
    
    setShowApiKey(true);
  };

  const copyApiKey = () => {
    // Use fullApiKey if available, otherwise use apiKey if shown
    const keyToCopy = fullApiKey || (showApiKey ? apiKey : '');
    
    if (keyToCopy && !keyToCopy.includes('•••')) {
      navigator.clipboard.writeText(keyToCopy);
      setApiKeyCopied(true);
      setTimeout(() => setApiKeyCopied(false), 2000);
      toast({
        title: "Copied",
        description: "API key copied to clipboard",
      });
    } else {
      toast({
        title: "Cannot copy masked key",
        description: "Please click the eye icon to reveal the key first, or regenerate a new key to copy it.",
        variant: "destructive",
      });
    }
  };

  const maskApiKey = (key: string) => {
    if (!key) return '';
    return key.substring(0, 8) + '••••••••••••••••••••••••' + key.substring(key.length - 4);
  };


  // AI Moderation settings functions
  const loadAiModerationSettings = async () => {
    setIsLoadingAiSettings(true);
    try {
      const response = await fetch(getApiUrl('/v1/panel/settings/ai-moderation'), {
        credentials: 'include',
        headers: { 'X-Server-Domain': getCurrentDomain() }
      });
      if (response.ok) {
        const data = await response.json();
        // Merge with defaults to ensure all properties exist
        setAiModerationSettings(prev => ({
          ...prev,
          ...data,
          aiPunishmentConfigs: data.aiPunishmentConfigs || prev.aiPunishmentConfigs || {}
        }));
      } else {
        console.error('Failed to load AI moderation settings:', response.status);
      }
    } catch (error) {
      console.error('Error loading AI moderation settings:', error);
    } finally {
      setIsLoadingAiSettings(false);
    }
  };

  const saveAiModerationSettings = async (settings: IAIModerationSettings, configs?: any) => {
    setIsSavingAiSettings(true);
    try {
      const payload = {
        ...settings,
        aiPunishmentConfigs: configs || settings.aiPunishmentConfigs
      };
      
      const csrfFetch = apiFetch;
      const response = await csrfFetch('/v1/panel/settings/ai-moderation', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
    } catch (error) {
      console.error('Error saving AI moderation settings:', error);
      toast({
        title: "Error",
        description: "Failed to save AI moderation settings. Please try again.",
        variant: "destructive",
      });
      
    } finally {
      setIsSavingAiSettings(false);
    }
  };

  // Load AI punishment types (enabled ones)
  const loadAiPunishmentTypes = async () => {
    try {
      const response = await fetch(getApiUrl('/v1/panel/settings/ai-punishment-types'), {
        credentials: 'include',
        headers: { 'X-Server-Domain': getCurrentDomain() }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAiModerationSettings(prev => ({
          ...prev,
          aiPunishmentConfigs: data.data
        }));
      } else {
        console.error('Failed to load AI punishment types:', response.status);
        setAiModerationSettings(prev => ({
          ...prev,
          aiPunishmentConfigs: {}
        }));
      }
    } catch (error) {
      console.error('Error loading AI punishment types:', error);
      setAiModerationSettings(prev => ({
        ...prev,
        aiPunishmentConfigs: {}
      }));
    }
  };

  // Load available punishment types for selection
  const loadAvailablePunishmentTypes = async () => {
    try {
      const response = await fetch(getApiUrl('/v1/panel/settings/punishment-types'), {
        credentials: 'include',
        headers: { 'X-Server-Domain': getCurrentDomain() }
      });
      if (response.ok) {
        const data = await response.json();
        setAvailablePunishmentTypes(data);
      } else {
        console.error('Failed to load available punishment types:', response.status);
      }
    } catch (error) {
      console.error('Error loading available punishment types:', error);
    }
  };

  // Add AI punishment type configuration
  const addAiPunishmentType = async (punishmentTypeId: number, aiDescription: string) => {
    try {
      const csrfFetch = apiFetch;
      const response = await csrfFetch('/v1/panel/settings/ai-punishment-types', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ punishmentTypeId, aiDescription }),
      });
      
      if (response.ok) {
        toast({
          title: "AI Punishment Type Added",
          description: "The punishment type has been configured for AI services.",
        });
        await loadAvailablePunishmentTypes();
      } else {
        const errorData = await response.json();
        toast({
          title: "Error",
          description: errorData.message || "Failed to add AI punishment type.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error adding AI punishment type:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Update AI punishment type
  const updateAiPunishmentType = async (id: number, updates: { enabled?: boolean; aiDescription?: string }) => {
    try {
      const csrfFetch = apiFetch;
      const response = await csrfFetch(`/v1/panel/settings/ai-punishment-types/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      
      if (response.ok) {
        if (updates.enabled === false) {
          loadAvailablePunishmentTypes();
        }
        toast({
          title: "AI Punishment Type Updated",
          description: "The punishment type configuration has been updated.",
        });
      } else {
        throw new Error('Failed to update AI punishment type');
      }
    } catch (error) {
      console.error('Error updating AI punishment type:', error);
      toast({
        title: "Error",
        description: "Failed to update AI punishment type. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Remove AI punishment type configuration
  const removeAiPunishmentType = async (id: number) => {
    try {
      const csrfFetch = apiFetch;
      const response = await csrfFetch(`/v1/panel/settings/ai-punishment-types/${id}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        loadAvailablePunishmentTypes();
        toast({
          title: "AI Punishment Type Removed",
          description: "The punishment type has been disabled for AI use.",
        });
      } else {
        throw new Error('Failed to remove AI punishment type');
      }
    } catch (error) {
      console.error('Error removing AI punishment type:', error);
      toast({
        title: "Error",
        description: "Failed to remove AI punishment type. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Load AI moderation settings on component mount (only for users with appropriate permissions)
  useEffect(() => {
    if (user && canAccessSettingsTab('tags')) {
      loadAiModerationSettings();
      loadAvailablePunishmentTypes();
    }
  }, [user?.role]); // Only depend on user role, not the function

  // Auto-save AI moderation settings when they change
  useEffect(() => {
    if (!isLoadingAiSettings && initialLoadCompletedRef.current && canAccessSettingsTab('tags')) {
      const saveTimeout = setTimeout(() => {
        saveAiModerationSettings(aiModerationSettings);
      }, 1000);
      return () => clearTimeout(saveTimeout);
    }
  }, [aiModerationSettings, isLoadingAiSettings]); // Don't include canAccessSettingsTab in dependencies

  // Auto-save AI punishment configs when they change
  useEffect(() => {
    if (!isLoadingAiSettings && initialLoadCompletedRef.current && canAccessSettingsTab('tags') && aiModerationSettings?.aiPunishmentConfigs) {
      const saveTimeout = setTimeout(() => {
        saveAiModerationSettings(aiModerationSettings);
      }, 1000);
      return () => clearTimeout(saveTimeout);
    }
  }, [aiModerationSettings?.aiPunishmentConfigs, aiModerationSettings, isLoadingAiSettings]); // Don't include canAccessSettingsTab in dependencies

  // Define captureInitialSettings first, before it's used anywhere else
  const captureInitialSettings = useCallback(() => {
    const currentSettingsSnapshot = {
      punishmentTypes: JSON.parse(JSON.stringify(punishmentTypes)), // Deep copy
      statusThresholds: JSON.parse(JSON.stringify(statusThresholds)), // Deep copy
      labels: JSON.parse(JSON.stringify(labels)), // Deep copy
      bugReportTags: JSON.parse(JSON.stringify(bugReportTags)), // Deep copy
      playerReportTags: JSON.parse(JSON.stringify(playerReportTags)), // Deep copy
      appealTags: JSON.parse(JSON.stringify(appealTags)), // Deep copy
      ticketForms: JSON.parse(JSON.stringify(ticketForms)), // Deep copy
      mongodbUri,
      has2FA,
      hasPasskey,
      serverDisplayName,
      homepageIconUrl,
      panelIconUrl,
    };
    initialSettingsRef.current = currentSettingsSnapshot;
  }, [punishmentTypes, statusThresholds, labels, bugReportTags, playerReportTags, appealTags, ticketForms, quickResponsesState, mongodbUri, has2FA, hasPasskey, serverDisplayName, homepageIconUrl, panelIconUrl]);

  // Helper to apply a settings object to all state variables without triggering auto-save
  const applySettingsObjectToState = useCallback((settingsObject: any) => {
    if (!settingsObject) return;

    justLoadedFromServerRef.current = true;

    // Use direct state setters to avoid triggering auto-save during load
    if (settingsObject.punishmentTypes) {
      const pt = settingsObject.punishmentTypes;
      setPunishmentTypesState(typeof pt === 'string' ? JSON.parse(pt) : JSON.parse(JSON.stringify(pt)));
    }
    if (settingsObject.statusThresholds) setStatusThresholdsState(JSON.parse(JSON.stringify(settingsObject.statusThresholds)));
    // Load labels (new unified system)
    if (settingsObject.labels) {
      const lbls = settingsObject.labels;
      setLabelsState(typeof lbls === 'string' ? JSON.parse(lbls) : JSON.parse(JSON.stringify(lbls)));
    }
    // Load deprecated tags for backwards compatibility
    if (settingsObject.bugReportTags) {
      const brt = settingsObject.bugReportTags;
      setBugReportTagsState(typeof brt === 'string' ? JSON.parse(brt) : JSON.parse(JSON.stringify(brt)));
    }
    if (settingsObject.playerReportTags) {
      const prt = settingsObject.playerReportTags;
      setPlayerReportTagsState(typeof prt === 'string' ? JSON.parse(prt) : JSON.parse(JSON.stringify(prt)));
    }
    if (settingsObject.appealTags) {
      const at = settingsObject.appealTags;
      setAppealTagsState(typeof at === 'string' ? JSON.parse(at) : JSON.parse(JSON.stringify(at)));
    }
    if (settingsObject.ticketForms) {
      const tf = settingsObject.ticketForms;
      const parsedTf = typeof tf === 'string' ? JSON.parse(tf) : JSON.parse(JSON.stringify(tf));
      
      // Only update if the parsed ticket forms has meaningful data
      // Check if it has at least one form type with fields or sections
      const hasData = parsedTf && typeof parsedTf === 'object' && 
        Object.values(parsedTf).some((form: any) => 
          form && (
            (Array.isArray(form.fields) && form.fields.length > 0) ||
            (Array.isArray(form.sections) && form.sections.length > 0)
          )
        );
      
      if (hasData) {
        setTicketFormsState(parsedTf);
      }
    }
    if (settingsObject.quickResponses) {
      const qr = settingsObject.quickResponses;
      const parsedQr = typeof qr === 'string' ? JSON.parse(qr) : JSON.parse(JSON.stringify(qr));
      
      // Check if it's the old format (Record<string, Record<string, string>>) and migrate to new format
      if (parsedQr && !parsedQr.categories && typeof parsedQr === 'object') {
        // Convert old format to new format
        const categories = Object.entries(parsedQr).map(([categoryName, responses], index) => ({
          id: categoryName.toLowerCase().replace(/\s+/g, '_'),
          name: categoryName,
          ticketTypes: categoryName.toLowerCase().includes('report') ? 
            (categoryName.toLowerCase().includes('chat') ? ['chat_report'] : ['player_report']) :
            categoryName.toLowerCase().includes('appeal') ? ['appeal'] :
            categoryName.toLowerCase().includes('bug') ? ['bug_report'] : ['other'],
          order: index + 1,
          actions: Object.entries(responses as Record<string, string>).map(([actionName, message], actionIndex) => ({
            id: `${categoryName.toLowerCase().replace(/\s+/g, '_')}_${actionName.toLowerCase()}`,
            name: actionName,
            message: message,
            order: actionIndex + 1,
            // Add default properties based on category
            ...(categoryName.toLowerCase().includes('report') && actionName.toLowerCase().includes('accept') ? { issuePunishment: false } : {}),
            ...(categoryName.toLowerCase().includes('appeal') ? { 
              appealAction: actionName.toLowerCase().includes('pardon') ? 'pardon' : 
                           actionName.toLowerCase().includes('reduce') ? 'reduce' : 
                           actionName.toLowerCase().includes('reject') ? 'reject' : 'none'
            } : {})
          }))
        }));
        
        setQuickResponsesState({ categories });
      } else {
        // It's already in the new format or use default
        setQuickResponsesState(parsedQr.categories ? parsedQr : defaultQuickResponsesConfig);
      }
    }
    if (settingsObject.mongodbUri !== undefined) setMongodbUri(settingsObject.mongodbUri);
    if (settingsObject.has2FA !== undefined) setHas2FAState(settingsObject.has2FA);
    if (settingsObject.hasPasskey !== undefined) setHasPasskeyState(settingsObject.hasPasskey);
    
    // Handle general settings (both direct properties and nested object)
    if (settingsObject.general) {
      if (settingsObject.general.serverDisplayName !== undefined) setServerDisplayName(settingsObject.general.serverDisplayName);
      if (settingsObject.general.discordWebhookUrl !== undefined) setDiscordWebhookUrl(settingsObject.general.discordWebhookUrl);
      if (settingsObject.general.homepageIconUrl !== undefined) setHomepageIconUrl(settingsObject.general.homepageIconUrl);
      if (settingsObject.general.panelIconUrl !== undefined) setPanelIconUrl(settingsObject.general.panelIconUrl);
    } else {
      // Fallback for direct properties (backward compatibility)
      if (settingsObject.serverDisplayName !== undefined) setServerDisplayName(settingsObject.serverDisplayName);
      if (settingsObject.discordWebhookUrl !== undefined) setDiscordWebhookUrl(settingsObject.discordWebhookUrl);
      if (settingsObject.homepageIconUrl !== undefined) setHomepageIconUrl(settingsObject.homepageIconUrl);
      if (settingsObject.panelIconUrl !== undefined) setPanelIconUrl(settingsObject.panelIconUrl);
    }

    // Handle AI moderation settings
    if (settingsObject.aiModerationSettings) {
      const aiSettings = settingsObject.aiModerationSettings;
      const parsedAiSettings = typeof aiSettings === 'string' ? JSON.parse(aiSettings) : JSON.parse(JSON.stringify(aiSettings));
      setAiModerationSettings(parsedAiSettings);
    }

    // After a short delay, reset the flag to allow auto-saving
    setTimeout(() => {
      justLoadedFromServerRef.current = false;
    }, 500);
  }, []);

  // Save settings to backend
  const saveSettings = useCallback(async () => {
    if (justLoadedFromServerRef.current || !initialLoadCompletedRef.current) {
      return; // Skip saving during initial load
    }

    setIsSaving(true);
    pendingChangesRef.current = false;

    try {
      const csrfFetch = apiFetch;

      // Save general settings (now includes tags)
      const generalSettingsPayload = {
        serverDisplayName,
        discordWebhookUrl,
        homepageIconUrl,
        panelIconUrl,
        labels,
        bugReportTags,
        playerReportTags,
        appealTags,
      };

      const response = await csrfFetch('/v1/panel/settings/general', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(generalSettingsPayload)
      });

      // Save quick responses to dedicated endpoint
      await csrfFetch('/v1/panel/settings/quick-responses', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(quickResponsesState)
      });

      // Save ticket forms to dedicated endpoint
      if (ticketForms) {
        await csrfFetch('/v1/panel/settings/ticket-forms', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(ticketForms)
        });
      }

      if (response.ok) {
        setLastSaved(new Date());
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Settings save failed:', response.status, errorData);

        if (response.status === 403) {
          toast({
            title: "Permission Denied",
            description: errorData.error || errorData.message || 'You do not have permission to modify these settings.',
            variant: "destructive"
          });
        } else {
          toast({
            title: "Error",
            description: `Failed to save settings: ${errorData.error || response.statusText}`,
            variant: "destructive"
          });
        }
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred while saving",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    punishmentTypes, statusThresholds, serverDisplayName, discordWebhookUrl, homepageIconUrl, panelIconUrl,
    labels, bugReportTags, playerReportTags, appealTags, ticketForms, quickResponsesState, mongodbUri, has2FA, hasPasskey, toast
  ]);

  // Effect: Load settings from React Query into local component state
  useEffect(() => {
    if (isLoadingSettings || isFetchingSettings) {
      return;
    }

    // Log the raw settingsData received from the hook


    if (settingsData?.settings && Object.keys(settingsData.settings).length > 0 && !initialLoadCompletedRef.current) {
      applySettingsObjectToState(settingsData.settings); // Call directly

      // Capture settings for future reference and mark initial load as complete
      // This timeout ensures state updates from applySettingsObjectToState have settled
      // before capturing and enabling auto-save.
      setTimeout(() => {
        captureInitialSettings(); // Call directly
        initialLoadCompletedRef.current = true;
      }, 600); // Delay to ensure state updates propagate
    } else if (!settingsData?.settings && !initialLoadCompletedRef.current && !isLoadingSettings && !isFetchingSettings) {
      // This case handles if the API returns no settings (e.g. empty object) on the first load
      initialLoadCompletedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsData, isLoadingSettings, isFetchingSettings]);

  // Effect: Load punishment types from the dedicated endpoint
  useEffect(() => {
    if (isLoadingPunishmentTypes || !punishmentTypesData) {
      return;
    }

    // Normalize API data: map 'customizable' to 'isCustomizable' and ensure correct structure
    const normalizedTypes = (punishmentTypesData as any[]).map((pt: any) => ({
      ...pt,
      isCustomizable: pt.isCustomizable ?? pt.customizable ?? false,
      category: pt.category || (pt.administrative ? 'Administrative' : pt.social ? 'Social' : pt.gameplay ? 'Gameplay' : 'Administrative')
    }));

    setPunishmentTypesState(normalizedTypes);
  }, [punishmentTypesData, isLoadingPunishmentTypes]);

  // Effect: Load ticket forms from the dedicated endpoint
  useEffect(() => {
    if (isLoadingTicketForms || !ticketFormSettingsData) {
      return;
    }

    // Check if the ticket forms data has meaningful content
    const hasData = ticketFormSettingsData && typeof ticketFormSettingsData === 'object' &&
      Object.values(ticketFormSettingsData).some((form: any) =>
        form && (
          (Array.isArray(form.fields) && form.fields.length > 0) ||
          (Array.isArray(form.sections) && form.sections.length > 0)
        )
      );

    if (hasData) {
      justLoadedFromServerRef.current = true;
      setTicketFormsState(ticketFormSettingsData as TicketFormsConfiguration);
      setTimeout(() => {
        justLoadedFromServerRef.current = false;
      }, 100);
    }
  }, [ticketFormSettingsData, isLoadingTicketForms]);

  // Effect: Load quick responses from the dedicated endpoint
  useEffect(() => {
    if (isLoadingQuickResponses || !quickResponsesData) {
      return;
    }

    // Check if quick responses data has categories
    if (quickResponsesData.categories && Array.isArray(quickResponsesData.categories)) {
      justLoadedFromServerRef.current = true;
      setQuickResponsesState(quickResponsesData as QuickResponsesConfiguration);
      setTimeout(() => {
        justLoadedFromServerRef.current = false;
      }, 100);
    }
  }, [quickResponsesData, isLoadingQuickResponses]);

  // Debounced auto-save effect - only trigger when settings change after initial load
  useEffect(() => {
    // Don't auto-save during initial load
    if (justLoadedFromServerRef.current || !initialLoadCompletedRef.current || isLoadingSettings || isFetchingSettings) {
      return;
    }


    // If there's a pending save, clear it
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set a flag that we have pending changes
    pendingChangesRef.current = true;

    // Schedule a new save
    saveTimeoutRef.current = setTimeout(() => {
      if (pendingChangesRef.current) {
        saveSettings();
      }
    }, 1000); // Auto-save after 1 second of inactivity

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };  }, [
    punishmentTypes, statusThresholds, serverDisplayName, discordWebhookUrl, homepageIconUrl, panelIconUrl,
    labels, bugReportTags, playerReportTags, appealTags, ticketForms, quickResponsesState, mongodbUri, has2FA, hasPasskey,
    // profileUsername removed - it has its own separate save function
    isLoadingSettings, isFetchingSettings, saveSettings
  ]);

  // Check database connection status on page load
  useEffect(() => {
    const checkDbConnection = async () => {
      if (!mongodbUri) {
        setDbConnectionStatus(false);
        return;
      }

      setIsTestingConnection(true);

      try {
        const csrfFetch = apiFetch;
        const response = await csrfFetch('/v1/panel/settings/test-database', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ uri: mongodbUri })
        });

        const data = await response.json();

        if (data.connected) {
          setDbConnectionStatus(true);
        } else {
          setDbConnectionStatus(false);
        }
      } catch (error) {
        console.error("Database connection check error:", error);
        setDbConnectionStatus(false);
      } finally {
        setIsTestingConnection(false);
      }
    };

    checkDbConnection();
  }, [mongodbUri]);

  // Wrapper functions to set state that trigger auto-save
  const setPunishmentTypes = (value: React.SetStateAction<PunishmentType[]>) => {
    // Skip auto-save during initial load
    if (justLoadedFromServerRef.current || !initialLoadCompletedRef.current) {
      setPunishmentTypesState(value);
    } else {
      setPunishmentTypesState(value);
    }
  };
  const setNewPunishmentName = (value: React.SetStateAction<string>) => {
    setNewPunishmentNameState(value);
  };
  const setNewPunishmentCategory = (value: React.SetStateAction<'Gameplay' | 'Social'>) => {
    setNewPunishmentCategoryState(value);
  };
  const setStatusThresholds = (value: React.SetStateAction<StatusThresholds>) => {
    setStatusThresholdsState(value);
  };
  const setSelectedPunishment = (value: React.SetStateAction<PunishmentType | null>) => {
    setSelectedPunishmentState(value);
  };
  const setShowCorePunishments = (value: React.SetStateAction<boolean>) => {
    setShowCorePunishmentsState(value);
  };
  const setBugReportTags = (value: React.SetStateAction<string[]>) => {
    setBugReportTagsState(value);
  };
  const setPlayerReportTags = (value: React.SetStateAction<string[]>) => {
    setPlayerReportTagsState(value);
  };
  const setAppealTags = (value: React.SetStateAction<string[]>) => {
    setAppealTagsState(value);
  };
  const setNewBugTag = (value: React.SetStateAction<string>) => {
    setNewBugTagState(value);
  };
  const setNewPlayerTag = (value: React.SetStateAction<string>) => {
    setNewPlayerTagState(value);
  };
  const setNewAppealTag = (value: React.SetStateAction<string>) => {
    setNewAppealTagState(value);
  };
  
  const setHas2FA = (value: React.SetStateAction<boolean>) => {
    setHas2FAState(value);
  };
  const setHasPasskey = (value: React.SetStateAction<boolean>) => {
    setHasPasskeyState(value);
  };
  const setShowSetup2FA = (value: React.SetStateAction<boolean>) => {
    setShowSetup2FAState(value);
  };  const setShowSetupPasskey = (value: React.SetStateAction<boolean>) => {
    setShowSetupPasskeyState(value);
  };
  const setRecoveryCodesCopied = (value: React.SetStateAction<boolean>) => {
    setRecoveryCodesCopiedState(value);
  };
  
  // Profile settings auto-save wrapper functions
  const setProfileUsername = (value: React.SetStateAction<string>) => {
    const newValue = typeof value === 'function' ? value(profileUsernameState) : value;
    setProfileUsernameState(newValue);
    profileUsernameRef.current = newValue; // Keep ref in sync
    
    // Profile username changed
      // Trigger auto-save for profile updates, but skip during initial load
    if (!justLoadedFromServerRef.current && initialLoadCompletedRef.current) {
      triggerProfileAutoSave();
    }
  };
  
  // Save profile settings function
  const saveProfileSettings = useCallback(async () => {
    try {
      const csrfFetch = apiFetch;
      const response = await csrfFetch('/v1/panel/auth/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          username: profileUsernameState
        })
      });

      // Profile save response received

      if (response.ok) {
        const data = await response.json();
        // Profile save successful
        setLastSaved(new Date());
        // Update the user context without refreshing
        if (user && data.username) {
          user.username = data.username;
        }
        
        // Don't show a toast on every auto-save to avoid spam
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error('Profile auto-save failed:', errorData.message);
        
        // Show specific error toast based on status code
        if (response.status === 403) {
          toast({
            title: "Permission Denied",
            description: errorData.error || errorData.message || 'You do not have permission to modify your profile.',
            variant: "destructive",
          });
        } else {
          toast({
            title: "Save Failed",
            description: `Failed to save profile: ${errorData.error || errorData.message || 'Unknown error'}`,
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error('Profile auto-save error:', error);
      
      // Show error toast
      toast({
        title: "Save Failed",
        description: "Failed to save profile. Please try again.",        variant: "destructive",
      });
    }
  }, [profileUsernameState, user, toast, setLastSaved]);
  
  // Auto-save function for profile settings
  const triggerProfileAutoSave = useCallback(() => {
    if (profileSaveTimeoutRef.current) {
      clearTimeout(profileSaveTimeoutRef.current);
    }
    
    profileSaveTimeoutRef.current = setTimeout(async () => {
      // Use refs to get the latest values at execution time
      const currentUsername = profileUsernameRef.current;
      
      // Skip save if username is empty
      if (!currentUsername.trim()) {
        return;
      }
      
      try {
        const csrfFetch = apiFetch;
        const response = await csrfFetch('/v1/panel/auth/profile', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username: currentUsername
          })
        });

        // Profile save attempt

        if (response.ok) {
          const data = await response.json();
          // Profile save successful
          setLastSaved(new Date());
          
          // Update the user context without refreshing
          if (user && data.username) {
            user.username = data.username;
          }
          
          // Don't show a toast on every auto-save to avoid spam
        } else {
          const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
          console.error('Profile auto-save failed:', response.status, errorData);
          
          // Show specific error toast based on status code
          if (response.status === 403) {
            toast({
              title: "Permission Denied",
              description: errorData.error || errorData.message || 'You do not have permission to modify your profile.',
              variant: "destructive",
            });
          } else {
            toast({
              title: "Save Failed",
              description: `Failed to save profile: ${errorData.error || errorData.message || 'Unknown error'}`,
              variant: "destructive",
            });
          }
        }
      } catch (error) {
        console.error('Profile auto-save error:', error);
        
        // Show error toast
        toast({
          title: "Save Failed",
          description: "Failed to save profile. Please try again.",          variant: "destructive",
        });
      }
    }, 500); // Reduced to 500ms for faster response
  }, []); // Empty dependencies since we use refs to get current values

  // Add a new punishment type
  const addPunishmentType = async () => {
    if (newPunishmentName.trim()) {
      // Default durations and points based on category
      const defaultUnit = 'minutes' as 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months';

      // Helper function to create duration objects
      const createDuration = (value: number) => ({ value, unit: defaultUnit, type: 'mute' as const });

      const defaultGameplayDurations = {
        low: {
          first: createDuration(24),
          medium: createDuration(72),
          habitual: createDuration(168)
        },
        regular: {
          first: createDuration(72),
          medium: createDuration(168),
          habitual: createDuration(336)
        },
        severe: {
          first: createDuration(168),
          medium: createDuration(336),
          habitual: createDuration(720)
        }
      };

      const defaultSocialDurations = {
        low: {
          first: createDuration(24),
          medium: createDuration(48),
          habitual: createDuration(96)
        },
        regular: {
          first: createDuration(48),
          medium: createDuration(96),
          habitual: createDuration(168)
        },
        severe: {
          first: createDuration(72),
          medium: createDuration(168),
          habitual: createDuration(336)
        }
      };

      const defaultGameplayPoints = {
        low: 2,
        regular: 4,
        severe: 6
      };
      const defaultSocialPoints = {
        low: 1,
        regular: 3,
        severe: 5
      };

      const newPunishment = {
        name: newPunishmentName.trim(),
        category: newPunishmentCategory,
        customizable: true,
        durations: newPunishmentCategory === 'Gameplay' ? defaultGameplayDurations : defaultSocialDurations,
        points: newPunishmentCategory === 'Gameplay' ? defaultGameplayPoints : defaultSocialPoints
      };

      try {
        const csrfFetch = apiFetch;
        const response = await csrfFetch('/v1/panel/settings/punishment-types', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newPunishment),
        });

        if (response.ok) {
          const createdType = await response.json();
          setPunishmentTypes(prevTypes => [...prevTypes, createdType]);
          setNewPunishmentName('');
          queryClient.invalidateQueries({ queryKey: ['/v1/panel/settings/punishment-types'] });
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          toast({
            title: "Error",
            description: errorData.error || 'Failed to create punishment type',
            variant: "destructive"
          });
        }
      } catch (error) {
        console.error('Failed to create punishment type:', error);
        toast({
          title: "Error",
          description: 'Failed to create punishment type',
          variant: "destructive"
        });
      }
    }
  };

  // Remove a punishment type
  const removePunishmentType = async (id: number) => {
    const typeToRemove = punishmentTypes.find(pt => pt.id === id);
    if (!typeToRemove || typeToRemove.ordinal < 6) {
      return;
    }

    try {
      const csrfFetch = apiFetch;
      const response = await csrfFetch(`/v1/panel/settings/punishment-types/${typeToRemove.ordinal}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setPunishmentTypes(prevTypes => prevTypes.filter(pt => pt.id !== id));
        queryClient.invalidateQueries({ queryKey: ['/v1/panel/settings/punishment-types'] });
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        toast({
          title: "Error",
          description: errorData.error || 'Failed to delete punishment type',
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Error deleting punishment type:", error);
      toast({
        title: "Error",
        description: "Failed to delete punishment type",
        variant: "destructive"
      });
    }
  };

  // Update punishment type
  const updatePunishmentType = (id: number, updates: Partial<PunishmentType>) => {
    setPunishmentTypes(prevTypes =>
      prevTypes.map(pt => (pt.id === id ? { ...pt, ...updates } : pt))
    );
  };

  // Appeal form helper functions
  const addAppealFormField = () => {
    if (!selectedPunishment || !newAppealFieldLabel.trim()) return;

    const currentFields = selectedPunishment.appealForm?.fields || [];
    const newField: AppealFormField = {
      id: selectedAppealField?.id || `field_${Date.now()}`,
      type: newAppealFieldType,
      label: newAppealFieldLabel.trim(),
      description: newAppealFieldDescription.trim() || undefined,
      required: newAppealFieldRequired,
      options: (newAppealFieldType === 'dropdown' || newAppealFieldType === 'multiple_choice') ? newAppealFieldOptions : undefined,
      order: currentFields.length,
      sectionId: newAppealFieldSectionId || undefined,
      optionSectionMapping: Object.keys(newAppealFieldOptionSectionMapping).length > 0 ? 
        Object.fromEntries(Object.entries(newAppealFieldOptionSectionMapping).filter(([, value]) => value !== '')) : 
        undefined,
    };

    let updatedFields;
    if (selectedAppealField) {
      // Update existing field
      updatedFields = currentFields.map(field => 
        field.id === selectedAppealField.id ? newField : field
      );
    } else {
      // Add new field
      updatedFields = [...currentFields, newField];
    }

    const updatedAppealForm: AppealFormSettings = {
      fields: updatedFields,
      sections: selectedPunishment.appealForm?.sections || []
    };

    setSelectedPunishment(prev => prev ? {
      ...prev,
      appealForm: updatedAppealForm
    } : null);

    // Reset form
    setNewAppealFieldLabel('');
    setNewAppealFieldType('text');
    setNewAppealFieldDescription('');
    setNewAppealFieldRequired(false);
    setNewAppealFieldOptions([]);
    setNewAppealFieldSectionId('');
    setNewAppealFieldOptionSectionMapping({});
    setSelectedAppealField(null);
    setIsAddAppealFieldDialogOpen(false);
  };

  const removeAppealFormField = useCallback((fieldId: string) => {
    if (!selectedPunishment?.appealForm?.fields) return;

    const updatedFields = selectedPunishment.appealForm.fields
      .filter(f => f.id !== fieldId)
      .map((field, index) => ({ ...field, order: index }));

    setSelectedPunishment(prev => prev ? {
      ...prev,
      appealForm: {
        ...prev.appealForm,
        fields: updatedFields
      }
    } : null);
  }, [selectedPunishment, setSelectedPunishment]);

  const addAppealFormSection = () => {
    if (!selectedPunishment || !newAppealSectionTitle.trim()) return;

    const currentSections = selectedPunishment.appealForm?.sections || [];
    const newSection: AppealFormSection = {
      id: selectedAppealSection?.id || `section_${Date.now()}`,
      title: newAppealSectionTitle.trim(),
      description: newAppealSectionDescription.trim() || undefined,
      order: currentSections.length,
      hideByDefault: newAppealSectionHideByDefault,
    };

    let updatedSections;
    if (selectedAppealSection) {
      // Update existing section
      updatedSections = currentSections.map(section => 
        section.id === selectedAppealSection.id ? newSection : section
      );
    } else {
      // Add new section
      updatedSections = [...currentSections, newSection];
    }

    const updatedAppealForm: AppealFormSettings = {
      fields: selectedPunishment.appealForm?.fields || [],
      sections: updatedSections
    };

    setSelectedPunishment(prev => prev ? {
      ...prev,
      appealForm: updatedAppealForm
    } : null);

    // Reset form
    setNewAppealSectionTitle('');
    setNewAppealSectionDescription('');
    setNewAppealSectionHideByDefault(false);
    setSelectedAppealSection(null);
    setIsAddAppealSectionDialogOpen(false);
  };

  const removeAppealFormSection = useCallback((sectionId: string) => {
    if (!selectedPunishment?.appealForm) return;

    const updatedSections = (selectedPunishment.appealForm.sections || [])
      .filter(s => s.id !== sectionId)
      .map((section, index) => ({ ...section, order: index }));
    
    // Also remove fields that belong to this section
    const updatedFields = (selectedPunishment.appealForm.fields || [])
      .filter(f => f.sectionId !== sectionId);

    setSelectedPunishment(prev => prev ? {
      ...prev,
      appealForm: {
        fields: updatedFields,
        sections: updatedSections
      }
    } : null);
  }, [selectedPunishment, setSelectedPunishment]);

  const updateAppealFormField = (fieldId: string, updates: Partial<AppealFormField>) => {
    if (!selectedPunishment?.appealForm?.fields) return;

    const updatedFields = selectedPunishment.appealForm.fields.map(field =>
      field.id === fieldId ? { ...field, ...updates } : field
    );

    setSelectedPunishment(prev => prev ? {
      ...prev,
      appealForm: {
        fields: updatedFields
      }
    } : null);
  };

  const addNewAppealFieldOption = () => {
    if (newOption.trim()) {
      setNewAppealFieldOptions(prev => [...prev, newOption.trim()]);
      setNewOption('');
    }
  };

  const removeAppealFieldOption = (index: number) => {
    setNewAppealFieldOptions(prev => prev.filter((_, i) => i !== index));
  };

  // Ticket Form Management Functions
  const addTicketFormField = () => {
    if (!newTicketFormFieldLabel.trim()) return;
    
    const newField: TicketFormField = {
      id: Date.now().toString(),
      type: newTicketFormFieldType,
      label: newTicketFormFieldLabel,
      description: newTicketFormFieldDescription || undefined,
      required: newTicketFormFieldRequired,
      options: (newTicketFormFieldType === 'dropdown' || newTicketFormFieldType === 'multiple_choice') ? newTicketFormFieldOptions : undefined,
      order: ticketForms[selectedTicketFormType]?.fields?.length || 0,
      sectionId: newTicketFormFieldSectionId || undefined,
      optionSectionMapping: Object.keys(newTicketFormFieldOptionSectionMapping).length > 0 ? 
        Object.fromEntries(Object.entries(newTicketFormFieldOptionSectionMapping).filter(([, value]) => value !== '')) : 
        undefined,
    };

    if (selectedTicketFormField) {
      // Update existing field
      setTicketFormsState(prev => ({
        ...prev,
        [selectedTicketFormType]: {
          ...prev[selectedTicketFormType],
          fields: (prev[selectedTicketFormType]?.fields || []).map(field =>
            field.id === selectedTicketFormField.id ? { ...newField, id: selectedTicketFormField.id } : field
          )
        }
      }));
    } else {
      // Add new field
      setTicketFormsState(prev => ({
        ...prev,
        [selectedTicketFormType]: {
          ...prev[selectedTicketFormType],
          fields: [...(prev[selectedTicketFormType]?.fields || []), newField]
        }
      }));
    }

    // Reset form
    setNewTicketFormFieldLabel('');
    setNewTicketFormFieldType('text');
    setNewTicketFormFieldDescription('');
    setNewTicketFormFieldRequired(false);
    setNewTicketFormFieldOptions([]);
    setNewTicketFormFieldSectionId('');
    setNewTicketFormFieldGoToSection('');
    setNewTicketFormFieldOptionSectionMapping({});
    setIsOptionNavigationExpanded(false);
    setSelectedTicketFormField(null);
    setIsAddTicketFormFieldDialogOpen(false);
  };

  const removeTicketFormField = (fieldId: string) => {
    setTicketFormsState(prev => ({
      ...prev,
      [selectedTicketFormType]: {
        ...prev[selectedTicketFormType],
        fields: (prev[selectedTicketFormType]?.fields || [])
          .filter(f => f.id !== fieldId)
          .map((field, index) => ({ ...field, order: index }))
      }
    }));
  };

  const addNewTicketFormFieldOption = () => {
    if (newTicketFormOption.trim()) {
      setNewTicketFormFieldOptions(prev => [...prev, newTicketFormOption.trim()]);
      setNewTicketFormOption('');
    }
  };

  const removeTicketFormFieldOption = (index: number) => {
    setNewTicketFormFieldOptions(prev => prev.filter((_, i) => i !== index));
  };

  // Section Management Functions
  const addTicketFormSection = () => {
    if (!newTicketFormSectionTitle.trim()) return;
    
    const newSection: TicketFormSection = {
      id: Date.now().toString(),
      title: newTicketFormSectionTitle,
      description: newTicketFormSectionDescription || undefined,
      order: ticketForms[selectedTicketFormType]?.sections?.length || 0,
    };

    if (selectedTicketFormSection) {
      // Update existing section
      setTicketFormsState(prev => ({
        ...prev,
        [selectedTicketFormType]: {
          ...prev[selectedTicketFormType],
          sections: (prev[selectedTicketFormType]?.sections || []).map(section =>
            section.id === selectedTicketFormSection.id ? { ...newSection, id: selectedTicketFormSection.id } : section
          )
        }
      }));
    } else {
      // Add new section
      setTicketFormsState(prev => ({
        ...prev,
        [selectedTicketFormType]: {
          ...prev[selectedTicketFormType],
          sections: [...(prev[selectedTicketFormType]?.sections || []), newSection]
        }
      }));
    }

    // Reset form
    setNewTicketFormSectionTitle('');
    setNewTicketFormSectionDescription('');
    setSelectedTicketFormSection(null);
    setIsAddTicketFormSectionDialogOpen(false);
  };

  const removeTicketFormSection = (sectionId: string) => {
    setTicketFormsState(prev => ({
      ...prev,
      [selectedTicketFormType]: {
        ...prev[selectedTicketFormType],
        sections: (prev[selectedTicketFormType]?.sections || [])
          .filter(s => s.id !== sectionId)
          .map((section, index) => ({ ...section, order: index })),
        // Also remove fields that belong to this section
        fields: (prev[selectedTicketFormType]?.fields || [])
          .filter(f => f.sectionId !== sectionId)
      }
    }));
  };

  // Format the last saved time
  const formatLastSaved = () => {
    if (!lastSaved) return "Not saved yet";

    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - lastSaved.getTime()) / 1000);

    if (diffSeconds < 60) {
      return "Just now";
    } else if (diffSeconds < 3600) {
      const minutes = Math.floor(diffSeconds / 60);
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else {
      return lastSaved.toLocaleTimeString();
    }
  };

  // Drag and drop handlers for sections
  const moveSectionInForm = useCallback((dragIndex: number, hoverIndex: number) => {
    setTicketFormsState(prev => {
      const sections = [...(prev[selectedTicketFormType]?.sections || [])];
      const dragSection = sections[dragIndex];
      sections.splice(dragIndex, 1);
      sections.splice(hoverIndex, 0, dragSection);
      
      // Update order values
      const updatedSections = sections.map((section, index) => ({
        ...section,
        order: index
      }));

      return {
        ...prev,
        [selectedTicketFormType]: {
          ...prev[selectedTicketFormType],
          sections: updatedSections
        }
      };
    });
  }, [selectedTicketFormType]);

  // Drag and drop handlers for fields within sections
  const moveFieldInForm = useCallback((dragIndex: number, hoverIndex: number, sectionId: string) => {
    setTicketFormsState(prev => {
      const allFields = [...(prev[selectedTicketFormType]?.fields || [])];
      
      // Get fields for the specific section
      const sectionFields = allFields.filter(f => f.sectionId === sectionId);
      
      // Get the actual field objects using the indices
      const dragField = sectionFields[dragIndex];
      const hoverField = sectionFields[hoverIndex];
      
      if (!dragField || !hoverField) return prev;
      
      // Update the order values for the two fields being swapped
      const updatedFields = allFields.map(field => {
        if (field.id === dragField.id) {
          return { ...field, order: hoverField.order };
        } else if (field.id === hoverField.id) {
          return { ...field, order: dragField.order };
        }
        return field;
      });

      return {
        ...prev,
        [selectedTicketFormType]: {
          ...prev[selectedTicketFormType],
          fields: updatedFields
        }
      };
    });
  }, [selectedTicketFormType]);

  // Function to move fields between sections
  const moveFieldBetweenSections = useCallback((fieldId: string, fromSectionId: string, toSectionId: string, targetIndex?: number) => {
    setTicketFormsState(prev => {
      const allFields = [...(prev[selectedTicketFormType]?.fields || [])];
      
      // Find the field to move
      const fieldToMove = allFields.find(f => f.id === fieldId);
      if (!fieldToMove) return prev;
      
      // Get fields in the target section
      const targetSectionFields = allFields.filter(f => f.sectionId === toSectionId);
      
      // Calculate the new order for the moved field
      let newOrder: number;
      if (targetIndex !== undefined && targetIndex < targetSectionFields.length) {
        // Insert at specific position
        const targetField = targetSectionFields[targetIndex];
        newOrder = targetField.order;
        
        // Update orders of fields in target section that come after the insertion point
        const updatedFields = allFields.map(field => {
          if (field.id === fieldId) {
            return { ...field, sectionId: toSectionId, order: newOrder };
          } else if (field.sectionId === toSectionId && field.order >= newOrder) {
            return { ...field, order: field.order + 1 };
          }
          return field;
        });
        
        return {
          ...prev,
          [selectedTicketFormType]: {
            ...prev[selectedTicketFormType],
            fields: updatedFields
          }
        };
      } else {
        // Add to the end of the target section
        newOrder = targetSectionFields.length > 0 ? Math.max(...targetSectionFields.map(f => f.order)) + 1 : 0;
        
        const updatedFields = allFields.map(field => {
          if (field.id === fieldId) {
            return { ...field, sectionId: toSectionId, order: newOrder };
          }
          return field;
        });
        
        return {
          ...prev,
          [selectedTicketFormType]: {
            ...prev[selectedTicketFormType],
            fields: updatedFields
          }
        };
      }
    });
  }, [selectedTicketFormType]);

  // Missing function implementations for ticket form management
  const onEditSection = useCallback((section: TicketFormSection) => {
    // Placeholder implementation - could open a dialog to edit section
  }, []);

  const onDeleteSection = useCallback((sectionId: string) => {
    // Placeholder implementation - remove section from form
  }, []);

  const onEditField = useCallback((field: TicketFormField) => {
    // Placeholder implementation - could open a dialog to edit field
  }, []);

  const onDeleteField = useCallback((fieldId: string) => {
    // Placeholder implementation - remove field from form
  }, []);

  const onAddField = useCallback((sectionId: string) => {
    setNewTicketFormFieldSectionId(sectionId);
    setIsAddTicketFormFieldDialogOpen(true);
  }, []);

  const moveField = useCallback((dragIndex: number, hoverIndex: number, sectionId: string) => {
    // Use the existing moveFieldInForm function
    moveFieldInForm(dragIndex, hoverIndex, sectionId);
  }, [moveFieldInForm]);

  // Drag and drop handlers for appeal form sections
  const moveAppealFormSection = useCallback((dragIndex: number, hoverIndex: number) => {
    if (!selectedPunishment?.appealForm?.sections) return;
    
    const sections = [...selectedPunishment.appealForm.sections];
    const dragSection = sections[dragIndex];
    
    sections.splice(dragIndex, 1);
    sections.splice(hoverIndex, 0, dragSection);
    
    // Update order values
    const updatedSections = sections.map((section, index) => ({
      ...section,
      order: index
    }));
    
    setSelectedPunishment(prev => prev ? {
      ...prev,
      appealForm: {
        ...prev.appealForm!,
        sections: updatedSections
      }
    } : null);
  }, [selectedPunishment]);

  // Drag and drop handlers for appeal form fields within sections
  const moveAppealFormField = useCallback((dragIndex: number, hoverIndex: number, sectionId: string) => {
    if (!selectedPunishment?.appealForm?.fields) return;
    
    const allFields = [...selectedPunishment.appealForm.fields];
    const sectionFields = allFields.filter(f => f.sectionId === sectionId);
    
    const dragField = sectionFields[dragIndex];
    const hoverField = sectionFields[hoverIndex];
    
    if (!dragField || !hoverField) return;
    
    // Update the order values
    const dragOrder = dragField.order;
    const hoverOrder = hoverField.order;
    
    const updatedFields = allFields.map(field => {
      if (field.id === dragField.id) {
        return { ...field, order: hoverOrder };
      } else if (field.id === hoverField.id) {
        return { ...field, order: dragOrder };
      }
      return field;
    });
    
    setSelectedPunishment(prev => prev ? {
      ...prev,
      appealForm: {
        ...prev.appealForm!,
        fields: updatedFields
      }
    } : null);
  }, [selectedPunishment]);

  // Function to move appeal form fields between sections
  const moveAppealFormFieldBetweenSections = useCallback((fieldId: string, fromSectionId: string, toSectionId: string, targetIndex?: number) => {
    if (!selectedPunishment?.appealForm?.fields) return;
    
    const allFields = [...selectedPunishment.appealForm.fields];
    const fieldToMove = allFields.find(f => f.id === fieldId);
    if (!fieldToMove) return;
    
    const targetSectionFields = allFields.filter(f => f.sectionId === toSectionId);
    const newOrder = targetIndex !== undefined ? targetIndex : targetSectionFields.length;
    
    const updatedFields = allFields.map(field => {
      if (field.id === fieldId) {
        return { ...field, sectionId: toSectionId, order: newOrder };
      }
      return field;
    });
    
    setSelectedPunishment(prev => prev ? {
      ...prev,
      appealForm: {
        ...prev.appealForm!,
        fields: updatedFields
      }
    } : null);
  }, [selectedPunishment]);

  // Appeal form edit and delete handlers
  const onEditAppealFormSection = useCallback((section: AppealFormSection) => {
    setSelectedAppealSection(section);
    setNewAppealSectionTitle(section.title);
    setNewAppealSectionDescription(section.description || '');
    setNewAppealSectionHideByDefault(section.hideByDefault || false);
    setIsAddAppealSectionDialogOpen(true);
  }, []);

  const onDeleteAppealFormSection = (sectionId: string) => {
    removeAppealFormSection(sectionId);
  };

  const onEditAppealFormField = useCallback((field: AppealFormField) => {
    setSelectedAppealField(field);
    setNewAppealFieldLabel(field.label);
    setNewAppealFieldType(field.type);
    setNewAppealFieldDescription(field.description || '');
    setNewAppealFieldRequired(field.required);
    setNewAppealFieldOptions(field.options || []);
    setNewAppealFieldSectionId(field.sectionId || '');
    setNewAppealFieldOptionSectionMapping(field.optionSectionMapping || {});
    setIsAddAppealFieldDialogOpen(true);
  }, []);

  const onDeleteAppealFormField = (fieldId: string) => {
    removeAppealFormField(fieldId);
  };

  const onAddAppealFormField = useCallback((sectionId: string) => {
    setNewAppealFieldSectionId(sectionId);
    setIsAddAppealFieldDialogOpen(true);
  }, []);

  // Settings categories configuration
  const settingsCategories = [
    {
      id: 'general',
      title: 'Server & Billing',
      description: 'Configure server settings, billing, API keys, and integrations',
      icon: SettingsIcon,
      permission: 'general',
      subCategories: [
        { id: 'billing', title: 'Billing', icon: CreditCard },
        { id: 'usage', title: 'Usage', icon: Globe },
        { id: 'server-config', title: 'Server Config', icon: SettingsIcon },
        { id: 'domain', title: 'Domain', icon: Globe },
        { id: 'webhooks', title: 'Webhooks', icon: MessageCircle },
      ],
    },
    {
      id: 'punishment',
      title: 'Punishments',
      description: 'Configure punishment categories, durations, and point thresholds',
      icon: Scale,
      permission: 'punishment',
      subCategories: [
        { id: 'thresholds', title: 'Thresholds', icon: Layers },
        { id: 'types', title: 'Types', icon: Scale },
      ],
    },
    {
      id: 'tickets',
      title: 'Tickets',
      description: 'Configure ticket system settings and AI moderation',
      icon: FileText,
      permission: 'tags',
      subCategories: [
        { id: 'quick-responses', title: 'Quick Responses', icon: MessageCircle },
        { id: 'label-management', title: 'Label Management', icon: Tag },
        { id: 'ticket-forms', title: 'Ticket Forms', icon: Layers },
        { id: 'ai-moderation', title: 'AI Moderation', icon: Bot },
      ],
    },
    {
      id: 'staff',
      title: 'Staff & Roles',
      description: 'Manage staff members and configure role permissions',
      icon: Users,
      permission: 'staff',
      subCategories: [
        { id: 'staff-management', title: 'Staff Management', icon: UserIcon },
        { id: 'roles-permissions', title: 'Roles & Permissions', icon: Shield },
      ],
    },
    {
      id: 'knowledgebase',
      title: 'Knowledgebase & Homepage',
      description: 'Manage knowledge base articles and homepage customization',
      icon: BookOpen,
      permission: 'knowledgebase',
      subCategories: [
        { id: 'knowledgebase-articles', title: 'Knowledgebase', icon: BookOpen },
        { id: 'homepage-cards', title: 'Homepage Cards', icon: Home },
      ],
    },
  ];

  // Get the currently expanded category object
  const currentCategory = settingsCategories.find(c => c.id === expandedCategory);

  return (
    <PageContainer>
      <div className="flex flex-col space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">Settings</h2>
          <div className="flex space-x-2 items-center">
            {isSaving ? (
              <span className="text-sm text-muted-foreground flex items-center">
                <Save className="animate-spin h-4 w-4 mr-2" />
                Saving...
              </span>
            ) : lastSaved ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <span className="text-sm text-muted-foreground flex items-center">
                      <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                      Saved {formatLastSaved()}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Changes are automatically saved</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
          </div>
        </div>

        {/* Category Cards Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {settingsCategories.map((category) => {
            // Check permission
            if (category.permission && !canAccessSettingsTab(category.permission as any)) {
              return null;
            }

            const isSelected = expandedCategory === category.id;
            const Icon = category.icon;

            return (
              <Card
                key={category.id}
                className={`transition-all ${isSelected ? 'ring-2 ring-primary bg-muted/30' : ''}`}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col items-center text-center">
                    <div className={`p-3 rounded-lg mb-3 ${isSelected ? 'bg-primary/10' : 'bg-muted'}`}>
                      <Icon className={`h-6 w-6 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <h3 className={`font-medium text-sm mb-1 ${isSelected ? 'text-primary' : ''}`}>{category.title}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-2">{category.description}</p>

                    {/* Sub-categories list */}
                    {category.subCategories && (
                      <div className="mt-3 w-full space-y-1">
                        {category.subCategories.map((sub) => {
                          const SubIcon = sub.icon;
                          const isSubSelected = isSelected && expandedSubCategory === sub.id;
                          return (
                            <div
                              key={sub.id}
                              className={`flex items-center gap-2 p-1.5 rounded text-xs cursor-pointer transition-colors ${
                                isSubSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground'
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSubCategorySelect(category.id, sub.id);
                              }}
                            >
                              <SubIcon className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{sub.title}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Expanded Content Section - Below all cards */}
        <Card>
          <CardContent className="p-6">
            {/* Account Settings - Show by default when nothing is expanded */}
            {!expandedCategory && (
              <AccountSettings
                profileUsername={profileUsername}
                setProfileUsername={setProfileUsername}
                currentEmail={currentEmail}
                setCurrentEmail={setCurrentEmail}
              />
            )}

            {/* Server & Billing Settings */}
            {expandedCategory === 'general' && expandedSubCategory && (
              <GeneralSettings
                serverDisplayName={serverDisplayName}
                setServerDisplayName={setServerDisplayName}
                discordWebhookUrl={discordWebhookUrl}
                setDiscordWebhookUrl={setDiscordWebhookUrl}
                homepageIconUrl={homepageIconUrl}
                panelIconUrl={panelIconUrl}
                uploadingHomepageIcon={uploadingHomepageIcon}
                uploadingPanelIcon={uploadingPanelIcon}
                handleHomepageIconUpload={handleHomepageIconUpload}
                handlePanelIconUpload={handlePanelIconUpload}
                apiKey={apiKey}
                fullApiKey={fullApiKey}
                showApiKey={showApiKey}
                apiKeyCopied={apiKeyCopied}
                isGeneratingApiKey={isGeneratingApiKey}
                isRevokingApiKey={isRevokingApiKey}
                generateApiKey={generateApiKey}
                revokeApiKey={revokeApiKey}
                revealApiKey={revealApiKey}
                copyApiKey={copyApiKey}
                maskApiKey={maskApiKey}
                usageData={usageData}
                getBillingSummary={getBillingSummary}
                getUsageSummary={getUsageSummary}
                getServerConfigSummary={getServerConfigSummary}
                getDomainSummary={getDomainSummary}
                webhookSettings={settingsData?.settings?.webhookSettings}
                getWebhookSummary={getWebhookSummary}
                handleWebhookSave={handleWebhookSave}
                savingWebhookSettings={savingWebhookSettings}
                visibleSection={expandedSubCategory}
              />
            )}

            {/* Punishment Settings */}
            {expandedCategory === 'punishment' && expandedSubCategory && (
              <PunishmentSettings
                statusThresholds={statusThresholds}
                setStatusThresholds={setStatusThresholds}
                punishmentTypes={punishmentTypes}
                newPunishmentName={newPunishmentName}
                setNewPunishmentName={setNewPunishmentName}
                newPunishmentCategory={newPunishmentCategory}
                setNewPunishmentCategory={setNewPunishmentCategory}
                addPunishmentType={addPunishmentType}
                removePunishmentType={removePunishmentType}
                setSelectedPunishment={setSelectedPunishment}
                visibleSection={expandedSubCategory}
              />
            )}

            {/* Tickets Settings - Show selected sub-categories */}
            {expandedCategory === 'tickets' && expandedSubCategory && (
                <div className="space-y-6">
                  {expandedSubCategory === 'quick-responses' && (
                    <div>
                      <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                        <MessageCircle className="h-5 w-5" />
                        Quick Responses
                      </h3>
                      <TicketSettings
                        quickResponsesState={quickResponsesState}
                        setQuickResponsesState={setQuickResponsesState}
                        labels={labels}
                        setLabels={setLabelsState}
                        bugReportTags={bugReportTags}
                        setBugReportTags={setBugReportTagsState}
                        playerReportTags={playerReportTags}
                        setPlayerReportTags={setPlayerReportTagsState}
                        appealTags={appealTags}
                        setAppealTags={setAppealTagsState}
                        newBugTag={newBugTag}
                        setNewBugTag={setNewBugTag}
                        newPlayerTag={newPlayerTag}
                        setNewPlayerTag={setNewPlayerTag}
                        newAppealTag={newAppealTag}
                        setNewAppealTag={setNewAppealTag}
                        ticketForms={ticketForms}
                        setTicketForms={setTicketFormsState}
                        selectedTicketFormType={selectedTicketFormType}
                        setSelectedTicketFormType={setSelectedTicketFormType}
                        aiModerationSettings={aiModerationSettings}
                        setAiModerationSettings={setAiModerationSettings}
                        punishmentTypesState={punishmentTypes}
                        onEditSection={onEditSection}
                        onDeleteSection={onDeleteSection}
                        onEditField={onEditField}
                        onDeleteField={onDeleteField}
                        onAddField={onAddField}
                        moveField={moveField}
                        moveFieldBetweenSections={moveFieldBetweenSections}
                        visibleSection="quick-responses"
                      />
                    </div>
                  )}
                  {expandedSubCategory === 'label-management' && (
                    <div>
                      <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                        <Tag className="h-5 w-5" />
                        Label Management
                      </h3>
                      <TicketSettings
                        quickResponsesState={quickResponsesState}
                        setQuickResponsesState={setQuickResponsesState}
                        labels={labels}
                        setLabels={setLabelsState}
                        bugReportTags={bugReportTags}
                        setBugReportTags={setBugReportTagsState}
                        playerReportTags={playerReportTags}
                        setPlayerReportTags={setPlayerReportTagsState}
                        appealTags={appealTags}
                        setAppealTags={setAppealTagsState}
                        newBugTag={newBugTag}
                        setNewBugTag={setNewBugTag}
                        newPlayerTag={newPlayerTag}
                        setNewPlayerTag={setNewPlayerTag}
                        newAppealTag={newAppealTag}
                        setNewAppealTag={setNewAppealTag}
                        ticketForms={ticketForms}
                        setTicketForms={setTicketFormsState}
                        selectedTicketFormType={selectedTicketFormType}
                        setSelectedTicketFormType={setSelectedTicketFormType}
                        aiModerationSettings={aiModerationSettings}
                        setAiModerationSettings={setAiModerationSettings}
                        punishmentTypesState={punishmentTypes}
                        onEditSection={onEditSection}
                        onDeleteSection={onDeleteSection}
                        onEditField={onEditField}
                        onDeleteField={onDeleteField}
                        onAddField={onAddField}
                        moveField={moveField}
                        moveFieldBetweenSections={moveFieldBetweenSections}
                        visibleSection="label-management"
                      />
                    </div>
                  )}
                  {expandedSubCategory === 'ticket-forms' && (
                    <div>
                      <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                        <Layers className="h-5 w-5" />
                        Ticket Forms
                      </h3>
                      <TicketSettings
                        quickResponsesState={quickResponsesState}
                        setQuickResponsesState={setQuickResponsesState}
                        labels={labels}
                        setLabels={setLabelsState}
                        bugReportTags={bugReportTags}
                        setBugReportTags={setBugReportTagsState}
                        playerReportTags={playerReportTags}
                        setPlayerReportTags={setPlayerReportTagsState}
                        appealTags={appealTags}
                        setAppealTags={setAppealTagsState}
                        newBugTag={newBugTag}
                        setNewBugTag={setNewBugTag}
                        newPlayerTag={newPlayerTag}
                        setNewPlayerTag={setNewPlayerTag}
                        newAppealTag={newAppealTag}
                        setNewAppealTag={setNewAppealTag}
                        ticketForms={ticketForms}
                        setTicketForms={setTicketFormsState}
                        selectedTicketFormType={selectedTicketFormType}
                        setSelectedTicketFormType={setSelectedTicketFormType}
                        aiModerationSettings={aiModerationSettings}
                        setAiModerationSettings={setAiModerationSettings}
                        punishmentTypesState={punishmentTypes}
                        onEditSection={onEditSection}
                        onDeleteSection={onDeleteSection}
                        onEditField={onEditField}
                        onDeleteField={onDeleteField}
                        onAddField={onAddField}
                        moveField={moveField}
                        moveFieldBetweenSections={moveFieldBetweenSections}
                        visibleSection="ticket-forms"
                      />
                    </div>
                  )}
                  {expandedSubCategory === 'ai-moderation' && (
                    <div>
                      <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                        <Bot className="h-5 w-5" />
                        AI Moderation
                      </h3>
                      <TicketSettings
                        quickResponsesState={quickResponsesState}
                        setQuickResponsesState={setQuickResponsesState}
                        labels={labels}
                        setLabels={setLabelsState}
                        bugReportTags={bugReportTags}
                        setBugReportTags={setBugReportTagsState}
                        playerReportTags={playerReportTags}
                        setPlayerReportTags={setPlayerReportTagsState}
                        appealTags={appealTags}
                        setAppealTags={setAppealTagsState}
                        newBugTag={newBugTag}
                        setNewBugTag={setNewBugTag}
                        newPlayerTag={newPlayerTag}
                        setNewPlayerTag={setNewPlayerTag}
                        newAppealTag={newAppealTag}
                        setNewAppealTag={setNewAppealTag}
                        ticketForms={ticketForms}
                        setTicketForms={setTicketFormsState}
                        selectedTicketFormType={selectedTicketFormType}
                        setSelectedTicketFormType={setSelectedTicketFormType}
                        aiModerationSettings={aiModerationSettings}
                        setAiModerationSettings={setAiModerationSettings}
                        punishmentTypesState={punishmentTypes}
                        onEditSection={onEditSection}
                        onDeleteSection={onDeleteSection}
                        onEditField={onEditField}
                        onDeleteField={onDeleteField}
                        onAddField={onAddField}
                        moveField={moveField}
                        moveFieldBetweenSections={moveFieldBetweenSections}
                        visibleSection="ai-moderation"
                      />
                    </div>
                  )}
                </div>
              )}

            {/* Staff & Roles Settings */}
            {expandedCategory === 'staff' && expandedSubCategory && (
              <div className="space-y-6">
                {expandedSubCategory === 'staff-management' && (
                  <div>
                    <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                      <UserIcon className="h-5 w-5" />
                      Staff Management
                    </h3>
                    <StaffManagementPanel />
                  </div>
                )}
                {expandedSubCategory === 'roles-permissions' && (
                  <div>
                    <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      Roles & Permissions
                    </h3>
                    <StaffRolesCard />
                  </div>
                )}
              </div>
            )}

            {/* Knowledgebase & Homepage Settings */}
            {/* Knowledgebase & Homepage Settings */}
            {expandedCategory === 'knowledgebase' && expandedSubCategory && (
              <div className="space-y-6">
                {expandedSubCategory === 'knowledgebase-articles' && (
                  <div>
                    <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                      <BookOpen className="h-5 w-5" />
                      Knowledgebase
                    </h3>
                    <KnowledgebaseSettings />
                  </div>
                )}
                {expandedSubCategory === 'homepage-cards' && (
                  <div>
                    <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                      <Home className="h-5 w-5" />
                      Homepage Cards
                    </h3>
                    <HomepageCardSettings />
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Punishment Configuration Dialog */}
        {selectedPunishment && (
          <Dialog open={Boolean(selectedPunishment)} onOpenChange={() => setSelectedPunishmentState(null)}>
            <DialogContent className="max-w-4xl p-6 max-h-[90vh] overflow-hidden">
              <DialogHeader>
                <DialogTitle className="text-lg font-semibold">
                  Configure Punishment Type
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  Adjust the settings for the punishment type "{selectedPunishment.name}".
                </DialogDescription>
              </DialogHeader>

              <Tabs defaultValue="configuration" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="configuration">Configuration</TabsTrigger>
                  <TabsTrigger value="appeal-form">Appeal Form</TabsTrigger>
                </TabsList>

                <TabsContent value="configuration" className="space-y-4 max-h-[60vh] overflow-y-auto">
                  {/* Show different fields based on whether it's a core administrative punishment */}
                  {selectedPunishment.isCustomizable ? (
                    <>
                      {/* Punishment Name and Category - Only for customizable punishments */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="edit-punishment-name">Punishment Name</Label>
                          <Input
                            id="edit-punishment-name"
                            value={selectedPunishment.name}
                            onChange={(e) => setSelectedPunishment(prev => prev ? { ...prev, name: e.target.value } : null)}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="edit-punishment-category">Category</Label>
                          <Select
                            value={selectedPunishment.category}
                            onValueChange={(value) => setSelectedPunishment(prev => prev ? { ...prev, category: value as 'Gameplay' | 'Social' } : null)}
                          >
                            <SelectTrigger id="edit-punishment-category">
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Gameplay">Gameplay</SelectItem>
                              <SelectItem value="Social">Social</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Core Administrative Punishment - Show read-only info */}
                      <div className="bg-muted/30 p-4 rounded-lg">
                        <h5 className="text-sm font-medium mb-2">Core Administrative Punishment</h5>
                        <p className="text-xs text-muted-foreground mb-3">
                          This is a core administrative punishment type. The name, category, durations, and points cannot be modified.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Name</Label>
                            <div className="text-sm font-medium">{selectedPunishment.name}</div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Category</Label>
                            <div className="text-sm font-medium">{selectedPunishment.category}</div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Staff and Player Descriptions - Available for all punishment types */}
                  <div className="space-y-4">
                    <h5 className="text-sm font-medium">Descriptions</h5>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="staff-description">Staff Description</Label>
                        <textarea
                          id="staff-description"
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-[80px]"
                          placeholder="Description shown to staff when applying this punishment (optional)"
                          value={selectedPunishment.staffDescription || ''}
                          onChange={(e) => setSelectedPunishment(prev => prev ? { ...prev, staffDescription: e.target.value } : null)}
                        />
                        <p className="text-xs text-muted-foreground">
                          This description will be shown to staff members when they apply this punishment type.
                        </p>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="player-description">Player Description</Label>
                        <textarea
                          id="player-description"
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-[80px]"
                          placeholder="Description shown to players in appeals, notifications, etc. (optional)"
                          value={selectedPunishment.playerDescription || ''}
                          onChange={(e) => setSelectedPunishment(prev => prev ? { ...prev, playerDescription: e.target.value } : null)}
                        />
                        <p className="text-xs text-muted-foreground">
                          This description will be shown to players in appeals, notifications, and other player-facing contexts.
                        </p>
                      </div>
                      

                    </div>
                  </div>

                  {/* Restrictions, Durations, and Points - Only for customizable punishments */}
                  {selectedPunishment.isCustomizable && (
                    <>
                      {/* Permanent Punishment Options */}
                      {/* New Punishment Options */}
                      <div className="space-y-3 p-3 border rounded-md">
                        <h5 className="text-sm font-medium">Punishment Options</h5>
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id="canBeAltBlocking"
                              checked={selectedPunishment.canBeAltBlocking || false}
                              disabled={selectedPunishment.permanentUntilUsernameChange || selectedPunishment.permanentUntilSkinChange}
                              onChange={(e) => {
                                setSelectedPunishment(prev => prev ? {
                                  ...prev,
                                  canBeAltBlocking: e.target.checked
                                } : null);
                              }}
                              className="rounded"
                            />
                            <Label htmlFor="canBeAltBlocking" className="text-sm">
                              Can be alt-blocking
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id="canBeStatWiping"
                              checked={selectedPunishment.canBeStatWiping || false}
                              disabled={selectedPunishment.permanentUntilUsernameChange || selectedPunishment.permanentUntilSkinChange}
                              onChange={(e) => {
                                setSelectedPunishment(prev => prev ? {
                                  ...prev,
                                  canBeStatWiping: e.target.checked
                                } : null);
                              }}
                              className="rounded"
                            />
                            <Label htmlFor="canBeStatWiping" className="text-sm">
                              Can be stat-wiping
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id="singleSeverityPunishment"
                              checked={selectedPunishment.singleSeverityPunishment || false}
                              disabled={selectedPunishment.permanentUntilUsernameChange || selectedPunishment.permanentUntilSkinChange}
                              onChange={(e) => {
                                setSelectedPunishment(prev => prev ? {
                                  ...prev,
                                  singleSeverityPunishment: e.target.checked,
                                  // Initialize single severity settings if checked
                                  singleSeverityDurations: e.target.checked && !prev.singleSeverityDurations ? {
                                    first: { value: 24, unit: 'hours', type: 'mute' },
                                    medium: { value: 3, unit: 'days', type: 'mute' },
                                    habitual: { value: 7, unit: 'days', type: 'mute' }
                                  } : prev.singleSeverityDurations,
                                  singleSeverityPoints: e.target.checked && !prev.singleSeverityPoints ? 3 : prev.singleSeverityPoints
                                } : null);
                              }}
                              className="rounded"
                            />
                            <Label htmlFor="singleSeverityPunishment" className="text-sm">
                              Single-severity punishment
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id="permanentUntilUsernameChange"
                              checked={selectedPunishment.permanentUntilUsernameChange || false}
                              onChange={(e) => {
                                setSelectedPunishment(prev => prev ? {
                                  ...prev,
                                  permanentUntilUsernameChange: e.target.checked,
                                  // Clear single severity if permanent is checked
                                  singleSeverityPunishment: e.target.checked ? false : prev.singleSeverityPunishment,
                                  // Clear skin change if username change is checked
                                  permanentUntilSkinChange: e.target.checked ? false : prev.permanentUntilSkinChange,
                                  // Clear alt-blocking and stat-wiping if permanent is checked
                                  canBeAltBlocking: e.target.checked ? false : prev.canBeAltBlocking,
                                  canBeStatWiping: e.target.checked ? false : prev.canBeStatWiping
                                } : null);
                              }}
                              className="rounded"
                            />
                            <Label htmlFor="permanentUntilUsernameChange" className="text-sm">
                              Permanent until username change
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id="permanentUntilSkinChange"
                              checked={selectedPunishment.permanentUntilSkinChange || false}
                              onChange={(e) => {
                                setSelectedPunishment(prev => prev ? {
                                  ...prev,
                                  permanentUntilSkinChange: e.target.checked,
                                  // Clear single severity if permanent is checked
                                  singleSeverityPunishment: e.target.checked ? false : prev.singleSeverityPunishment,
                                  // Clear username change if skin change is checked
                                  permanentUntilUsernameChange: e.target.checked ? false : prev.permanentUntilUsernameChange,
                                  // Clear alt-blocking and stat-wiping if permanent is checked
                                  canBeAltBlocking: e.target.checked ? false : prev.canBeAltBlocking,
                                  canBeStatWiping: e.target.checked ? false : prev.canBeStatWiping
                                } : null);
                              }}
                              className="rounded"
                            />
                            <Label htmlFor="permanentUntilSkinChange" className="text-sm">
                              Permanent until skin change
                            </Label>
                          </div>
                          {selectedPunishment.singleSeverityPunishment && (
                            <div className="ml-6 space-y-3 p-3 border rounded-md bg-muted/20">
                              <div>
                                <Label className="text-xs text-muted-foreground mb-2 block">Single Severity Durations</Label>
                                <div className="space-y-3">
                                  {['first', 'medium', 'habitual'].map((offenseType) => (
                                    <div key={`single-${offenseType}`}>
                                      <Label className="text-xs text-muted-foreground">
                                        {offenseType.charAt(0).toUpperCase() + offenseType.slice(1)} Offense
                                      </Label>
                                      <div className="flex gap-1 mt-1">
                                        <Input
                                          type="number"
                                          min="0"
                                          value={selectedPunishment.singleSeverityDurations?.[offenseType as keyof typeof selectedPunishment.singleSeverityDurations]?.value || ''}
                                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                            const value = Number(e.target.value);
                                            setSelectedPunishment(prev => prev ? {
                                              ...prev,
                                              singleSeverityDurations: {
                                                first: { value: 24, unit: 'hours', type: 'mute' },
                                                medium: { value: 3, unit: 'days', type: 'mute' },
                                                habitual: { value: 7, unit: 'days', type: 'mute' },
                                                ...prev.singleSeverityDurations,
                                                [offenseType]: {
                                                  ...(prev.singleSeverityDurations?.[offenseType as keyof typeof prev.singleSeverityDurations] || { value: 24, unit: 'hours', type: 'mute' }),
                                                  value
                                                }
                                              }
                                            } : null);
                                          }}
                                          className="text-center text-xs h-8 w-16"
                                          placeholder="24"
                                        />
                                        <Select
                                          value={selectedPunishment.singleSeverityDurations?.[offenseType as keyof typeof selectedPunishment.singleSeverityDurations]?.unit || 'hours'}
                                          onValueChange={(unit: string) => {
                                            setSelectedPunishment(prev => prev ? {
                                              ...prev,
                                              singleSeverityDurations: {
                                                first: { value: 24, unit: 'hours', type: 'mute' },
                                                medium: { value: 3, unit: 'days', type: 'mute' },
                                                habitual: { value: 7, unit: 'days', type: 'mute' },
                                                ...prev.singleSeverityDurations,
                                                [offenseType]: {
                                                  ...(prev.singleSeverityDurations?.[offenseType as keyof typeof prev.singleSeverityDurations] || { value: 24, unit: 'hours', type: 'mute' }),
                                                  unit: unit as 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'
                                                }
                                              }
                                            } : null);
                                          }}
                                        >
                                          <SelectTrigger className="w-[60px] h-8 text-xs">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="seconds">S</SelectItem>
                                            <SelectItem value="minutes">Min</SelectItem>
                                            <SelectItem value="hours">H</SelectItem>
                                            <SelectItem value="days">D</SelectItem>
                                            <SelectItem value="weeks">W</SelectItem>
                                            <SelectItem value="months">M</SelectItem>
                                          </SelectContent>
                                        </Select>                                        <Select
                                          value={selectedPunishment.singleSeverityDurations?.[offenseType as keyof typeof selectedPunishment.singleSeverityDurations]?.type || 'mute'}
                                          onValueChange={(type: string) => {
                                            setSelectedPunishment(prev => prev ? {
                                              ...prev,
                                              singleSeverityDurations: {
                                                first: { value: 24, unit: 'hours', type: 'mute' },
                                                medium: { value: 3, unit: 'days', type: 'mute' },
                                                habitual: { value: 7, unit: 'days', type: 'mute' },
                                                ...prev.singleSeverityDurations,
                                                [offenseType]: {
                                                  ...(prev.singleSeverityDurations?.[offenseType as keyof typeof prev.singleSeverityDurations] || { value: 24, unit: 'hours', type: 'mute' }),
                                                  type: type as 'mute' | 'ban' | 'permanent mute' | 'permanent ban'
                                                }
                                              }
                                            } : null);
                                          }}
                                        >
                                          <SelectTrigger className="w-[70px] h-8 text-xs">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="mute">Mute</SelectItem>
                                            <SelectItem value="ban">Ban</SelectItem>
                                            <SelectItem value="permanent mute">Permanent Mute</SelectItem>                                            <SelectItem value="permanent ban">Permanent Ban</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Single Severity Points</Label>
                                <Input
                                  type="number"
                                  placeholder="Points"
                                  value={selectedPunishment.singleSeverityPoints || ''}
                                  onChange={(e) => {
                                    const value = Number(e.target.value);
                                    setSelectedPunishment(prev => prev ? {
                                      ...prev,
                                      singleSeverityPoints: value
                                    } : null);
                                  }}
                                  className="text-center w-full mt-1"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Only show Durations and Points if not single severity and not permanent until change */}
                      {!selectedPunishment.singleSeverityPunishment && !selectedPunishment.permanentUntilUsernameChange && !selectedPunishment.permanentUntilSkinChange && (
                    <div className="space-y-4">
                      {/* Durations Configuration */}
                      <div>
                        <h4 className="text-base font-medium mb-2">Durations</h4>
                        <p className="text-sm text-muted-foreground mb-4">
                          Set the durations and units for low, regular, and severe levels of this punishment.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {/* Low Severity */}
                          <div className="space-y-2">
                            <Label className="font-medium">Low Severity Durations</Label>
                            <div className="space-y-3 p-2 border rounded-md">
                              {['first', 'medium', 'habitual'].map((offenseType) => (
                                <div key={`low-${offenseType}`}>
                                  <Label htmlFor={`low-${offenseType}-${selectedPunishment.id}`} className="text-xs text-muted-foreground">
                                    {offenseType.charAt(0).toUpperCase() + offenseType.slice(1)} Offense
                                  </Label>
                                  
                                  <div className="flex gap-1 mt-1">                                    <Input
                                      type="number"
                                      min="0"
                                      value={selectedPunishment.durations?.low[offenseType as keyof typeof selectedPunishment.durations.low]?.value || ''}
                                      onChange={(e) => {
                                        const value = Number(e.target.value);
                                        setSelectedPunishment(prev => prev && prev.durations ? {
                                          ...prev,
                                          durations: {
                                            ...prev.durations,
                                            low: {
                                              ...prev.durations.low,
                                              [offenseType]: {
                                                ...prev.durations.low[offenseType as keyof typeof prev.durations.low],
                                                value
                                              }
                                            }
                                          }
                                        } : null);
                                      }}
                                      disabled={selectedPunishment.durations?.low[offenseType as keyof typeof selectedPunishment.durations.low]?.type?.includes('permanent')}
                                      className={`text-center text-xs h-8 w-16 ${selectedPunishment.durations?.low[offenseType as keyof typeof selectedPunishment.durations.low]?.type?.includes('permanent') ? 'opacity-50' : ''}`}
                                      placeholder="24"
                                    />                                    <Select
                                      value={selectedPunishment.durations?.low[offenseType as keyof typeof selectedPunishment.durations.low]?.unit || 'hours'}
                                      onValueChange={(unit) => {
                                        setSelectedPunishment(prev => prev && prev.durations ? {
                                          ...prev,
                                          durations: {
                                            ...prev.durations,
                                            low: {
                                              ...prev.durations.low,
                                              [offenseType]: {
                                                ...prev.durations.low[offenseType as keyof typeof prev.durations.low],
                                                unit: unit as 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'
                                              }
                                            }
                                          }
                                        } : null);
                                      }}
                                      disabled={selectedPunishment.durations?.low[offenseType as keyof typeof selectedPunishment.durations.low]?.type?.includes('permanent')}
                                    >
                                      <SelectTrigger className={`w-[60px] h-8 text-xs ${selectedPunishment.durations?.low[offenseType as keyof typeof selectedPunishment.durations.low]?.type?.includes('permanent') ? 'opacity-50' : ''}`}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="seconds">S</SelectItem>
                                        <SelectItem value="minutes">Min</SelectItem>
                                        <SelectItem value="hours">H</SelectItem>
                                        <SelectItem value="days">D</SelectItem>
                                        <SelectItem value="weeks">W</SelectItem>
                                        <SelectItem value="months">M</SelectItem>
                                      </SelectContent>
                                    </Select>                                    <Select
                                      value={selectedPunishment.durations?.low[offenseType as keyof typeof selectedPunishment.durations.low]?.type || 'mute'}
                                      onValueChange={(type) => {
                                        setSelectedPunishment(prev => prev && prev.durations ? {
                                          ...prev,
                                          durations: {
                                            ...prev.durations,
                                            low: {
                                              ...prev.durations.low,
                                              [offenseType]: {
                                                ...prev.durations.low[offenseType as keyof typeof prev.durations.low],
                                                type: type as 'mute' | 'ban' | 'permanent mute' | 'permanent ban'
                                              }
                                            }
                                          }
                                        } : null);
                                      }}
                                    >
                                      <SelectTrigger className="w-[70px] h-8 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="mute">Mute</SelectItem>
                                        <SelectItem value="ban">Ban</SelectItem>
                                        <SelectItem value="permanent mute">Permanent Mute</SelectItem>
                                        <SelectItem value="permanent ban">Permanent Ban</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Regular Severity */}
                          <div className="space-y-2">
                            <Label className="font-medium">Regular Severity Durations</Label>
                            <div className="space-y-3 p-2 border rounded-md">
                              {['first', 'medium', 'habitual'].map((offenseType) => (
                                <div key={`regular-${offenseType}`}>
                                  <Label htmlFor={`regular-${offenseType}-${selectedPunishment.id}`} className="text-xs text-muted-foreground">
                                    {offenseType.charAt(0).toUpperCase() + offenseType.slice(1)} Offense
                                  </Label>
                                  
                                  <div className="flex gap-1 mt-1">
                                    <Input
                                      type="number"
                                      min="0"
                                      value={selectedPunishment.durations?.regular[offenseType as keyof typeof selectedPunishment.durations.regular]?.value || ''}
                                      onChange={(e) => {
                                        const value = Number(e.target.value);
                                        setSelectedPunishment(prev => prev && prev.durations ? {
                                          ...prev,
                                          durations: {
                                            ...prev.durations,
                                            regular: {
                                              ...prev.durations.regular,
                                              [offenseType]: {
                                                ...prev.durations.regular[offenseType as keyof typeof prev.durations.regular],
                                                value
                                              }
                                            }
                                          }
                                        } : null);
                                      }}
                                      disabled={selectedPunishment.durations?.regular[offenseType as keyof typeof selectedPunishment.durations.regular]?.type?.includes('permanent')}
                                      className={`text-center text-xs h-8 w-16 ${selectedPunishment.durations?.regular[offenseType as keyof typeof selectedPunishment.durations.regular]?.type?.includes('permanent') ? 'opacity-50' : ''}`}
                                      placeholder="48"
                                    />
                                    <Select
                                      value={selectedPunishment.durations?.regular[offenseType as keyof typeof selectedPunishment.durations.regular]?.unit || 'hours'}
                                      onValueChange={(unit) => {
                                        setSelectedPunishment(prev => prev && prev.durations ? {
                                          ...prev,
                                          durations: {
                                            ...prev.durations,
                                            regular: {
                                              ...prev.durations.regular,
                                              [offenseType]: {
                                                ...prev.durations.regular[offenseType as keyof typeof prev.durations.regular],
                                                unit: unit as 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'
                                              }
                                            }
                                          }
                                        } : null);
                                      }}
                                      disabled={selectedPunishment.durations?.regular[offenseType as keyof typeof selectedPunishment.durations.regular]?.type?.includes('permanent')}
                                    >
                                      <SelectTrigger className={`w-[60px] h-8 text-xs ${selectedPunishment.durations?.regular[offenseType as keyof typeof selectedPunishment.durations.regular]?.type?.includes('permanent') ? 'opacity-50' : ''}`}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="seconds">S</SelectItem>
                                        <SelectItem value="minutes">Min</SelectItem>
                                        <SelectItem value="hours">H</SelectItem>
                                        <SelectItem value="days">D</SelectItem>
                                        <SelectItem value="weeks">W</SelectItem>
                                        <SelectItem value="months">M</SelectItem>
                                      </SelectContent>
                                    </Select>                                    <Select
                                      value={selectedPunishment.durations?.regular[offenseType as keyof typeof selectedPunishment.durations.regular]?.type || 'mute'}
                                      onValueChange={(type) => {
                                        setSelectedPunishment(prev => prev && prev.durations ? {
                                          ...prev,
                                          durations: {
                                            ...prev.durations,
                                            regular: {
                                              ...prev.durations.regular,
                                              [offenseType]: {
                                                ...prev.durations.regular[offenseType as keyof typeof prev.durations.regular],
                                                type: type as 'mute' | 'ban' | 'permanent mute' | 'permanent ban'
                                              }
                                            }
                                          }
                                        } : null);
                                      }}
                                    >
                                      <SelectTrigger className="w-[70px] h-8 text-xs">
                                        <SelectValue />                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="mute">Mute</SelectItem>
                                        <SelectItem value="ban">Ban</SelectItem>
                                        <SelectItem value="permanent mute">Permanent Mute</SelectItem>
                                        <SelectItem value="permanent ban">Permanent Ban</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Severe Severity */}
                          <div className="space-y-2">
                            <Label className="font-medium">Severe Severity Durations</Label>
                            <div className="space-y-3 p-2 border rounded-md">
                              {['first', 'medium', 'habitual'].map((offenseType) => (
                                <div key={`severe-${offenseType}`}>
                                  <Label htmlFor={`severe-${offenseType}-${selectedPunishment.id}`} className="text-xs text-muted-foreground">
                                    {offenseType.charAt(0).toUpperCase() + offenseType.slice(1)} Offense
                                  </Label>
                                  
                                  <div className="flex gap-1 mt-1">
                                    <Input
                                      type="number"
                                      min="0"
                                      value={selectedPunishment.durations?.severe[offenseType as keyof typeof selectedPunishment.durations.severe]?.value || ''}
                                      onChange={(e) => {
                                        const value = Number(e.target.value);
                                        setSelectedPunishment(prev => prev && prev.durations ? {
                                          ...prev,
                                          durations: {
                                            ...prev.durations,
                                            severe: {
                                              ...prev.durations.severe,
                                              [offenseType]: {
                                                ...prev.durations.severe[offenseType as keyof typeof prev.durations.severe],
                                                value
                                              }
                                            }
                                          }
                                        } : null);
                                      }}
                                      disabled={selectedPunishment.durations?.severe[offenseType as keyof typeof selectedPunishment.durations.severe]?.type?.includes('permanent')}
                                      className={`text-center text-xs h-8 w-16 ${selectedPunishment.durations?.severe[offenseType as keyof typeof selectedPunishment.durations.severe]?.type?.includes('permanent') ? 'opacity-50' : ''}`}
                                      placeholder="72"
                                    />
                                    <Select
                                      value={selectedPunishment.durations?.severe[offenseType as keyof typeof selectedPunishment.durations.severe]?.unit || 'hours'}
                                      onValueChange={(unit) => {
                                        setSelectedPunishment(prev => prev && prev.durations ? {
                                          ...prev,
                                          durations: {
                                            ...prev.durations,
                                            severe: {
                                              ...prev.durations.severe,
                                              [offenseType]: {
                                                ...prev.durations.severe[offenseType as keyof typeof prev.durations.severe],
                                                unit: unit as 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'
                                              }
                                            }
                                          }
                                        } : null);
                                      }}
                                      disabled={selectedPunishment.durations?.severe[offenseType as keyof typeof selectedPunishment.durations.severe]?.type?.includes('permanent')}
                                    >
                                      <SelectTrigger className={`w-[60px] h-8 text-xs ${selectedPunishment.durations?.severe[offenseType as keyof typeof selectedPunishment.durations.severe]?.type?.includes('permanent') ? 'opacity-50' : ''}`}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="seconds">S</SelectItem>
                                        <SelectItem value="minutes">Min</SelectItem>
                                        <SelectItem value="hours">H</SelectItem>
                                        <SelectItem value="days">D</SelectItem>
                                        <SelectItem value="weeks">W</SelectItem>
                                        <SelectItem value="months">M</SelectItem>
                                      </SelectContent>
                                    </Select>                                    <Select
                                      value={selectedPunishment.durations?.severe[offenseType as keyof typeof selectedPunishment.durations.severe]?.type || 'mute'}
                                      onValueChange={(type) => {
                                        setSelectedPunishment(prev => prev && prev.durations ? {
                                          ...prev,
                                          durations: {
                                            ...prev.durations,
                                            severe: {
                                              ...prev.durations.severe,
                                              [offenseType]: {
                                                ...prev.durations.severe[offenseType as keyof typeof prev.durations.severe],
                                                type: type as 'mute' | 'ban' | 'permanent mute' | 'permanent ban'
                                              }
                                            }
                                          }
                                        } : null);
                                      }}
                                    >
                                      <SelectTrigger className="w-[70px] h-8 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="mute">Mute</SelectItem>
                                        <SelectItem value="ban">Ban</SelectItem>
                                        <SelectItem value="permanent mute">Permanent Mute</SelectItem>
                                        <SelectItem value="permanent ban">Permanent Ban</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Points Configuration */}
                      <div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {/* Low Severity Points */}
                          <div className="space-y-2">
                            <Label className="font-medium">Low Severity Points</Label>
                            <Input
                              type="number"
                              placeholder="Points"
                              value={selectedPunishment.points?.low || ''}
                              onChange={(e) => {
                                const value = Number(e.target.value);
                                setSelectedPunishment(prev => prev ? {
                                  ...prev,
                                  points: {
                                    low: value,
                                    regular: prev.points?.regular || 0,
                                    severe: prev.points?.severe || 0
                                  }
                                } : null);
                              }}
                              className="text-center w-full"
                            />
                          </div>

                          {/* Regular Severity Points */}
                          <div className="space-y-2">
                            <Label className="font-medium">Regular Severity Points</Label>
                            <Input
                              type="number"
                              placeholder="Points"
                              value={selectedPunishment.points?.regular || ''}
                              onChange={(e) => {
                                const value = Number(e.target.value);
                                setSelectedPunishment(prev => prev ? {
                                  ...prev,
                                  points: {
                                    low: prev.points?.low || 0,
                                    regular: value,
                                    severe: prev.points?.severe || 0
                                  }
                                } : null);
                              }}
                              className="text-center w-full"
                            />
                          </div>

                          {/* Severe Severity Points */}
                          <div className="space-y-2">
                            <Label className="font-medium">Severe Severity Points</Label>
                            <Input
                              type="number"
                              placeholder="Points"
                              value={selectedPunishment.points?.severe || ''}
                              onChange={(e) => {
                                const value = Number(e.target.value);
                                setSelectedPunishment(prev => prev ? {
                                  ...prev,
                                  points: {
                                    low: prev.points?.low || 0,
                                    regular: prev.points?.regular || 0,
                                    severe: value
                                  }
                                } : null);
                              }}
                              className="text-center w-full"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                      )}
                    </>
                  )}
                </TabsContent>                {/* Appeal Form Configuration Tab */}
                <TabsContent value="appeal-form" className="space-y-4 max-h-[60vh] overflow-y-auto">
                  <div className="space-y-4">
                    {/* Is Appealable Checkbox */}
                    <div className="flex items-center space-x-3 p-4 border rounded-lg bg-card">
                      <Checkbox
                        id="isAppealable"
                        checked={selectedPunishment.isAppealable ?? true}                        onCheckedChange={(checked: boolean) => {
                          setSelectedPunishment(prev => prev ? {
                            ...prev,
                            isAppealable: checked === true
                          } : null);
                        }}
                      />
                      <div className="flex-1">
                        <Label htmlFor="isAppealable" className="text-sm font-medium">
                          Is appealable?
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Whether players can submit appeals for this punishment type. Unchecked punishments will show "This punishment is not appealable" message.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-base font-medium">Appeal Form Configuration</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Configure custom sections and fields for players to fill out when appealing this punishment type.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setIsAddAppealSectionDialogOpen(true)}
                          disabled={selectedPunishment.isAppealable === false}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Section
                        </Button>
                      </div>
                    </div>

                    {/* Appeal Form Sections and Fields */}
                    <div className={`space-y-4 ${selectedPunishment.isAppealable === false ? 'opacity-50 pointer-events-none' : ''}`}>
                      <DndProvider backend={HTML5Backend}>
                        {selectedPunishment.appealForm?.sections
                          ?.sort((a, b) => a.order - b.order)
                          .map((section, index) => (
                            <DraggableAppealFormSectionCard
                              key={section.id}
                              section={section}
                              index={index}
                              moveSection={moveAppealFormSection}
                              selectedPunishment={selectedPunishment}
                              onEditSection={onEditAppealFormSection}
                              onDeleteSection={onDeleteAppealFormSection}
                              onEditField={onEditAppealFormField}
                              onDeleteField={onDeleteAppealFormField}
                              onAddField={onAddAppealFormField}
                              moveField={moveAppealFormField}
                              moveFieldBetweenSections={moveAppealFormFieldBetweenSections}
                            />
                          ))}

                        {/* Fields not in any section */}
                        {selectedPunishment.appealForm?.fields
                          ?.filter(field => !field.sectionId)
                          ?.sort((a, b) => a.order - b.order)
                          .map((field, index) => (
                            <DraggableAppealFormFieldCard
                              key={field.id}
                              field={field}
                              index={index}
                              sectionId=""
                              moveField={moveAppealFormField}
                              moveFieldBetweenSections={moveAppealFormFieldBetweenSections}
                              onEditField={onEditAppealFormField}
                              onDeleteField={onDeleteAppealFormField}
                            />
                          ))}

                        {(!selectedPunishment.appealForm?.fields || selectedPunishment.appealForm.fields.length === 0) && 
                         (!selectedPunishment.appealForm?.sections || selectedPunishment.appealForm.sections.length === 0) && (
                          <div className="text-center py-8 text-muted-foreground">
                            <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">
                              {selectedPunishment.isAppealable === false 
                                ? 'Appeals are disabled for this punishment type'
                                : 'No custom appeal form configured'
                              }
                            </p>
                            <p className="text-xs mt-1">
                              {selectedPunishment.isAppealable === false 
                                ? 'Players will see "This punishment is not appealable" message'
                                : 'Players will use the default appeal form'
                              }
                            </p>
                          </div>
                        )}
                      </DndProvider>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <DialogFooter className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setSelectedPunishment(null)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (selectedPunishment) {
                      setPunishmentTypes(prev =>
                        prev.map(pt => pt.id === selectedPunishment.id ? selectedPunishment : pt)
                      );
                      toast({
                        title: "Punishment Type Updated",
                        description: `The punishment type "${selectedPunishment.name}" has been updated`
                      });
                    }
                    setSelectedPunishment(null);
                  }}
                >
                  Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Add/Edit Appeal Form Field Dialog */}
        {isAddAppealFieldDialogOpen && (
          <Dialog open={isAddAppealFieldDialogOpen} onOpenChange={setIsAddAppealFieldDialogOpen}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {selectedAppealField ? 'Edit Appeal Form Field' : 'Add Appeal Form Field'}
                </DialogTitle>
                <DialogDescription>
                  Configure a custom field for the appeal form for this punishment type.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Field Label */}
                <div className="space-y-2">
                  <Label htmlFor="field-label">Field Label</Label>
                  <Input
                    id="field-label"
                    placeholder="e.g., Reason for Appeal"
                    value={newAppealFieldLabel}
                    onChange={(e) => setNewAppealFieldLabel(e.target.value)}
                  />
                </div>

                {/* Field Type */}
                <div className="space-y-2">
                  <Label htmlFor="field-type">Field Type</Label>
                  <Select
                    value={newAppealFieldType}
                    onValueChange={(value: 'text' | 'textarea' | 'dropdown' | 'multiple_choice' | 'checkbox' | 'file_upload' | 'checkboxes') => setNewAppealFieldType(value)}
                  >
                    <SelectTrigger id="field-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text Input</SelectItem>
                      <SelectItem value="textarea">Textarea</SelectItem>
                      <SelectItem value="dropdown">Dropdown</SelectItem>
                      <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                      <SelectItem value="checkbox">Checkbox</SelectItem>
                      <SelectItem value="checkboxes">Checkboxes</SelectItem>
                      <SelectItem value="file_upload">File Upload</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Field Description */}
                <div className="space-y-2">
                  <Label htmlFor="field-description">Description (Optional)</Label>
                  <Input
                    id="field-description"
                    placeholder="Help text for this field"
                    value={newAppealFieldDescription}
                    onChange={(e) => setNewAppealFieldDescription(e.target.value)}
                  />
                </div>

                {/* Required Toggle */}
                <div className="flex items-center space-x-2">
                  <Switch
                    id="field-required"
                    checked={newAppealFieldRequired}
                    onCheckedChange={setNewAppealFieldRequired}
                  />
                  <Label htmlFor="field-required">Required Field</Label>
                </div>

                {/* Section Assignment */}
                <div className="space-y-2">
                  <Label htmlFor="field-section">Section</Label>
                  <Select
                    value={newAppealFieldSectionId}
                    onValueChange={setNewAppealFieldSectionId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select section" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedPunishment?.appealForm?.sections
                        ?.sort((a, b) => a.order - b.order)
                        .map(section => (
                          <SelectItem key={section.id} value={section.id}>
                            {section.title}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Dropdown/Multiple Choice Options */}
                {(newAppealFieldType === 'dropdown' || newAppealFieldType === 'multiple_choice') && (
                  <div className="space-y-2">
                    <Label>{newAppealFieldType === 'dropdown' ? 'Dropdown' : 'Multiple Choice'} Options</Label>
                    <div className="space-y-2">
                      {newAppealFieldOptions.map((option, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Input value={option} readOnly className="flex-1" />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              const updatedOptions = newAppealFieldOptions.filter((_, i) => i !== index);
                              setNewAppealFieldOptions(updatedOptions);
                            }}
                            className="h-9 w-9 text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <Input
                          placeholder="Add option"
                          value={newOption}
                          onChange={(e) => setNewOption(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (newOption.trim()) {
                                setNewAppealFieldOptions(prev => [...prev, newOption.trim()]);
                                setNewOption('');
                              }
                            }
                          }}
                        />
                        <Button
                          type="button"
                          onClick={() => {
                            if (newOption.trim()) {
                              setNewAppealFieldOptions(prev => [...prev, newOption.trim()]);
                              setNewOption('');
                            }
                          }}
                          disabled={!newOption.trim()}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Per-Option Section Navigation for Dropdown/Multiple Choice Fields */}
                {(newAppealFieldType === 'dropdown' || newAppealFieldType === 'multiple_choice') && newAppealFieldOptions.length > 0 && (
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => setIsAppealOptionNavigationExpanded(!isAppealOptionNavigationExpanded)}
                      className="flex items-center gap-2 hover:bg-muted/50 p-1 rounded -ml-1 transition-colors"
                    >
                      {isAppealOptionNavigationExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <Label className="text-sm font-medium cursor-pointer">Option Navigation (Optional)</Label>
                    </button>
                    
                    {isAppealOptionNavigationExpanded && (
                      <div className="pl-6 space-y-3">
                        <p className="text-xs text-muted-foreground">
                          Configure which section to show when each option is selected.
                        </p>
                        {newAppealFieldOptions.map((option, index) => (
                          <div key={index} className="flex items-center gap-3">
                            <div className="flex-1">
                              <Label className="text-sm font-medium">{option}</Label>
                            </div>
                            <div className="flex-1">
                              <Select
                                value={newAppealFieldOptionSectionMapping[option] || ''}
                                onValueChange={(value) => 
                                  setNewAppealFieldOptionSectionMapping(prev => ({
                                    ...prev,
                                    [option]: value
                                  }))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="No navigation" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">No navigation</SelectItem>
                                  {selectedPunishment?.appealForm?.sections
                                    ?.filter(section => section.id !== newAppealFieldSectionId || !newAppealFieldSectionId)
                                    ?.sort((a, b) => a.order - b.order)
                                    .map(section => (
                                      <SelectItem key={section.id} value={section.id}>
                                        {section.title}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsAddAppealFieldDialogOpen(false);
                    setSelectedAppealField(null);
                    setNewAppealFieldLabel('');
                    setNewAppealFieldType('text');
                    setNewAppealFieldDescription('');
                    setNewAppealFieldRequired(false);
                    setNewAppealFieldOptions([]);
                    setNewAppealFieldSectionId('');
                    setNewAppealFieldOptionSectionMapping({});
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={addAppealFormField}
                  disabled={!newAppealFieldLabel.trim()}
                >
                  {selectedAppealField ? 'Update Field' : 'Add Field'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Add/Edit Appeal Form Section Dialog */}
        {isAddAppealSectionDialogOpen && (
          <Dialog open={isAddAppealSectionDialogOpen} onOpenChange={setIsAddAppealSectionDialogOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{selectedAppealSection ? 'Edit Section' : 'Add Section'}</DialogTitle>
                <DialogDescription>
                  {selectedAppealSection ? 'Update the section details below.' : 'Create a new section for organizing appeal form fields.'}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Section Title */}
                <div className="space-y-2">
                  <Label htmlFor="section-title">Section Title</Label>
                  <Input
                    id="section-title"
                    placeholder="Enter section title"
                    value={newAppealSectionTitle}
                    onChange={(e) => setNewAppealSectionTitle(e.target.value)}
                  />
                </div>

                {/* Section Description */}
                <div className="space-y-2">
                  <Label htmlFor="section-description">Description (Optional)</Label>
                  <Input
                    id="section-description"
                    placeholder="Enter section description"
                    value={newAppealSectionDescription}
                    onChange={(e) => setNewAppealSectionDescription(e.target.value)}
                  />
                </div>

                {/* Hide by Default Option */}
                <div className="flex items-center space-x-2">
                  <Switch
                    id="hide-by-default"
                    checked={newAppealSectionHideByDefault}
                    onCheckedChange={setNewAppealSectionHideByDefault}
                  />
                  <Label htmlFor="hide-by-default">Hide by default</Label>
                  <p className="text-xs text-muted-foreground">
                    Section will be hidden unless revealed by option navigation
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsAddAppealSectionDialogOpen(false);
                    setSelectedAppealSection(null);
                    setNewAppealSectionTitle('');
                    setNewAppealSectionDescription('');
                    setNewAppealSectionHideByDefault(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={addAppealFormSection}
                  disabled={!newAppealSectionTitle.trim()}
                >
                  {selectedAppealSection ? 'Update Section' : 'Add Section'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Add AI Punishment Type Dialog */}
        {isAddAIPunishmentDialogOpen && selectedPunishmentTypeId && (
          <Dialog open={isAddAIPunishmentDialogOpen} onOpenChange={setIsAddAIPunishmentDialogOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Enable AI Punishment Type</DialogTitle>
                <DialogDescription>
                  {(() => {
                    const selectedType = availablePunishmentTypes.find(t => t.id === selectedPunishmentTypeId);
                    return selectedType ? `Configure AI description for "${selectedType.name}" punishment type.` : 'Configure AI description for the selected punishment type.';
                  })()}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Show selected punishment type details */}
                {(() => {
                  const selectedType = availablePunishmentTypes.find(t => t.id === selectedPunishmentTypeId);
                  return selectedType ? (
                    <div className="bg-muted/30 p-3 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <h5 className="font-medium">{selectedType.name}</h5>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {selectedType.category}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              Ordinal: {selectedType.ordinal}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null;
                })()}

                {/* AI Description */}
                <div className="space-y-2">
                  <Label htmlFor="ai-punishment-desc">AI Description</Label>
                  <textarea
                    id="ai-punishment-desc"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-[100px]"
                    placeholder="Describe when this punishment type should be used. Be specific about the behaviors or violations it covers."
                    value={newAIPunishmentDescription}
                    onChange={(e) => setNewAIPunishmentDescription(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    This description helps the AI understand when to suggest this punishment type.
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsAddAIPunishmentDialogOpen(false);
                    setNewAIPunishmentDescription('');
                    setSelectedPunishmentTypeId(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    if (selectedPunishmentTypeId && newAIPunishmentDescription.trim()) {
                      await addAiPunishmentType(selectedPunishmentTypeId, newAIPunishmentDescription.trim());
                      setIsAddAIPunishmentDialogOpen(false);
                      setNewAIPunishmentDescription('');
                      setSelectedPunishmentTypeId(null);
                    }
                  }}
                  disabled={!newAIPunishmentDescription.trim()}
                >
                  Enable for AI
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Edit AI Punishment Type Dialog */}
        {selectedAIPunishmentType && (
          <Dialog open={Boolean(selectedAIPunishmentType)} onOpenChange={() => setSelectedAIPunishmentType(null)}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Edit AI Punishment Configuration</DialogTitle>
                <DialogDescription>
                  Update the AI description for "{selectedAIPunishmentType.name}".
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Show punishment type details (read-only) */}
                <div className="bg-muted/30 p-3 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="font-medium">{selectedAIPunishmentType.name}</h5>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {selectedAIPunishmentType.category}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          Ordinal: {selectedAIPunishmentType.ordinal}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Punishment type details are inherited from the main punishment configuration and cannot be edited here.
                  </p>
                </div>

                {/* AI Description */}
                <div className="space-y-2">
                  <Label htmlFor="edit-ai-punishment-desc">AI Description</Label>
                  <textarea
                    id="edit-ai-punishment-desc"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-[100px]"
                    value={selectedAIPunishmentType.aiDescription}
                    onChange={(e) => setSelectedAIPunishmentType(prev => prev ? { ...prev, aiDescription: e.target.value } : null)}
                  />
                  <p className="text-xs text-muted-foreground">
                    This description helps the AI understand when to suggest this punishment type.
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setSelectedAIPunishmentType(null)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (selectedAIPunishmentType && selectedAIPunishmentType.aiDescription.trim()) {
                      updateAiPunishmentType(selectedAIPunishmentType.id, { 
                        aiDescription: selectedAIPunishmentType.aiDescription.trim() 
                      });
                      setSelectedAIPunishmentType(null);
                    }
                  }}
                  disabled={!selectedAIPunishmentType?.aiDescription.trim()}
                >
                  Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Add/Edit Ticket Form Field Dialog */}
        {isAddTicketFormFieldDialogOpen && (
          <Dialog open={isAddTicketFormFieldDialogOpen} onOpenChange={setIsAddTicketFormFieldDialogOpen}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {selectedTicketFormField ? 'Edit Form Field' : 'Add Form Field'}
                </DialogTitle>
                <DialogDescription>
                  Configure a custom field for the {selectedTicketFormType} form.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Field Label */}
                <div className="space-y-2">
                  <Label htmlFor="field-label">Field Label</Label>
                  <Input
                    id="field-label"
                    placeholder="Enter field label"
                    value={newTicketFormFieldLabel}
                    onChange={(e) => setNewTicketFormFieldLabel(e.target.value)}
                  />
                </div>

                {/* Field Type */}
                <div className="space-y-2">
                  <Label htmlFor="field-type">Field Type</Label>
                  <Select value={newTicketFormFieldType} onValueChange={(value: 'text' | 'textarea' | 'dropdown' | 'multiple_choice' | 'checkbox' | 'file_upload' | 'checkboxes') => setNewTicketFormFieldType(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text Input</SelectItem>
                      <SelectItem value="textarea">Textarea</SelectItem>
                      <SelectItem value="dropdown">Dropdown</SelectItem>
                      <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                      <SelectItem value="checkbox">Checkbox</SelectItem>
                      <SelectItem value="checkboxes">Checkboxes</SelectItem>
                      <SelectItem value="file_upload">File Upload</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Field Description */}
                <div className="space-y-2">
                  <Label htmlFor="field-description">Description (Optional)</Label>
                  <Input
                    id="field-description"
                    placeholder="Enter field description"
                    value={newTicketFormFieldDescription}
                    onChange={(e) => setNewTicketFormFieldDescription(e.target.value)}
                  />
                </div>

                {/* Required Toggle */}
                <div className="flex items-center space-x-2">
                  <Switch
                    id="field-required"
                    checked={newTicketFormFieldRequired}
                    onCheckedChange={setNewTicketFormFieldRequired}
                  />
                  <Label htmlFor="field-required">Required Field</Label>
                </div>

                {/* Section Assignment */}
                <div className="space-y-2">
                  <Label htmlFor="field-section">Section</Label>
                  <Select
                    value={newTicketFormFieldSectionId}
                    onValueChange={setNewTicketFormFieldSectionId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select section" />
                    </SelectTrigger>
                    <SelectContent>
                      {ticketForms[selectedTicketFormType]?.sections
                        ?.sort((a, b) => a.order - b.order)
                        .map(section => (
                          <SelectItem key={section.id} value={section.id}>
                            {section.title}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Dropdown/Multiple Choice Options */}
                {(newTicketFormFieldType === 'dropdown' || newTicketFormFieldType === 'multiple_choice') && (
                  <div className="space-y-2">
                    <Label>{newTicketFormFieldType === 'dropdown' ? 'Dropdown' : 'Multiple Choice'} Options</Label>
                    <div className="space-y-2">
                      {newTicketFormFieldOptions.map((option, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Input value={option} readOnly className="flex-1" />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeTicketFormFieldOption(index)}
                            className="h-9 w-9 text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <Input
                          placeholder="Add option"
                          value={newTicketFormOption}
                          onChange={(e) => setNewTicketFormOption(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addNewTicketFormFieldOption();
                            }
                          }}
                        />
                        <Button
                          type="button"
                          onClick={addNewTicketFormFieldOption}
                          disabled={!newTicketFormOption.trim()}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Per-Option Section Navigation for Dropdown/Multiple Choice Fields */}
                {(newTicketFormFieldType === 'dropdown' || newTicketFormFieldType === 'multiple_choice') && newTicketFormFieldOptions.length > 0 && (
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => setIsOptionNavigationExpanded(!isOptionNavigationExpanded)}
                      className="flex items-center gap-2 hover:bg-muted/50 p-1 rounded -ml-1 transition-colors"
                    >
                      {isOptionNavigationExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <Label className="text-sm font-medium cursor-pointer">Option Navigation (Optional)</Label>
                    </button>
                    
                    {isOptionNavigationExpanded && (
                      <div className="pl-6 space-y-3">
                        <p className="text-xs text-muted-foreground">
                          Configure which section to show when each option is selected.
                        </p>
                        {newTicketFormFieldOptions.map((option, index) => (
                          <div key={index} className="flex items-center gap-3">
                            <div className="flex-1">
                              <Label className="text-sm font-medium">{option}</Label>
                            </div>
                            <div className="flex-1">
                              <Select
                                value={newTicketFormFieldOptionSectionMapping[option] || '__none__'}
                                onValueChange={(value) => 
                                  setNewTicketFormFieldOptionSectionMapping(prev => ({
                                    ...prev,
                                    [option]: value
                                  }))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="No navigation" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">No navigation</SelectItem>
                                  {ticketForms[selectedTicketFormType]?.sections
                                    ?.filter(section => section.id !== newTicketFormFieldSectionId || !newTicketFormFieldSectionId)
                                    ?.sort((a, b) => a.order - b.order)
                                    .map(section => (
                                      <SelectItem key={section.id} value={section.id}>
                                        {section.title}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsAddTicketFormFieldDialogOpen(false);
                    setSelectedTicketFormField(null);
                    setNewTicketFormFieldLabel('');
                    setNewTicketFormFieldType('text');
                    setNewTicketFormFieldDescription('');
                    setNewTicketFormFieldRequired(false);
                    setNewTicketFormFieldOptions([]);
                    setNewTicketFormFieldSectionId('');
                    setNewTicketFormFieldGoToSection('');
                    setNewTicketFormFieldOptionSectionMapping({});
                    setIsOptionNavigationExpanded(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={addTicketFormField}
                  disabled={!newTicketFormFieldLabel.trim()}
                >
                  {selectedTicketFormField ? 'Update Field' : 'Add Field'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Add Section Dialog */}
        {isAddTicketFormSectionDialogOpen && (
          <Dialog open={isAddTicketFormSectionDialogOpen} onOpenChange={setIsAddTicketFormSectionDialogOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{selectedTicketFormSection ? 'Edit Section' : 'Add Section'}</DialogTitle>
                <DialogDescription>
                  {selectedTicketFormSection ? 'Update the section details below.' : 'Create a new section for organizing form fields.'}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Section Title */}
                <div className="space-y-2">
                  <Label htmlFor="section-title">Section Title</Label>
                  <Input
                    id="section-title"
                    placeholder="Enter section title"
                    value={newTicketFormSectionTitle}
                    onChange={(e) => setNewTicketFormSectionTitle(e.target.value)}
                  />
                </div>

                {/* Section Description */}
                <div className="space-y-2">
                  <Label htmlFor="section-description">Description (Optional)</Label>
                  <Input
                    id="section-description"
                    placeholder="Enter section description"
                    value={newTicketFormSectionDescription}
                    onChange={(e) => setNewTicketFormSectionDescription(e.target.value)}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsAddTicketFormSectionDialogOpen(false);
                    setSelectedTicketFormSection(null);
                    setNewTicketFormSectionTitle('');
                    setNewTicketFormSectionDescription('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={addTicketFormSection}
                  disabled={!newTicketFormSectionTitle.trim()}
                >
                  {selectedTicketFormSection ? 'Update Section' : 'Add Section'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </PageContainer>
  );
};

export default Settings;
