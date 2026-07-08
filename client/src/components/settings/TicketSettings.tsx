import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle, Plus, X, ChevronDown, ChevronRight, Layers, Edit3, Trash2, GripVertical, Save } from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { Textarea } from '@modl-gg/shared-web/components/ui/textarea';
import { Label } from '@modl-gg/shared-web/components/ui/label';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import { Switch } from '@modl-gg/shared-web/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@modl-gg/shared-web/components/ui/select';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Card, CardContent, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';
import { Separator } from '@modl-gg/shared-web/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@modl-gg/shared-web/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@modl-gg/shared-web/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@modl-gg/shared-web/components/ui/alert-dialog';
import { type QuickResponseAction, type QuickResponseCategory, type QuickResponsesConfiguration, defaultQuickResponsesConfig } from '@/types/quickResponses';
import { type TicketFormField, type TicketFormSection, type TicketFormsConfiguration } from '@/types/forms';
import { useBillingStatus } from '@/hooks/use-data';
import { useAuth } from '@/hooks/use-auth';
import { hasPremiumAccess } from '@/lib/backend-enums';
import type { PunishmentType } from '@modl-gg/proto/modl/v1/settings_pb.ts';

// Label type definition
interface Label {
  id: string;
  name: string;
  color: string;
  description?: string;
}

export interface AIPunishmentConfig {
  id: string;
  name: string;
  aiDescription: string;
  enabled: boolean;
}

export interface AIModerationSettings {
  enableAIReview: boolean;
  enableAutomatedActions: boolean;
  aiPunishmentConfigs: Record<string, AIPunishmentConfig>;
}

interface TicketSettingsProps {
  // Quick Responses State
  quickResponsesState: QuickResponsesConfiguration;
  setQuickResponsesState: (value: QuickResponsesConfiguration | ((prev: QuickResponsesConfiguration) => QuickResponsesConfiguration)) => void;

  // Label Management State (new unified system)
  labels: Label[];
  setLabels: (value: Label[]) => void;

  // Deprecated Tag Management State - kept for backwards compatibility
  bugReportTags: string[];
  setBugReportTags: (value: string[]) => void;
  playerReportTags: string[];
  setPlayerReportTags: (value: string[]) => void;
  appealTags: string[];
  setAppealTags: (value: string[]) => void;
  newBugTag: string;
  setNewBugTag: (value: string) => void;
  newPlayerTag: string;
  setNewPlayerTag: (value: string) => void;
  newAppealTag: string;
  setNewAppealTag: (value: string) => void;
  
  // Ticket Forms State
  ticketForms: TicketFormsConfiguration;
  setTicketForms: (value: TicketFormsConfiguration | ((prev: TicketFormsConfiguration) => TicketFormsConfiguration)) => void;
  selectedTicketFormType: 'bug' | 'support' | 'application';
  setSelectedTicketFormType: (value: 'bug' | 'support' | 'application') => void;
  
  // AI Moderation State
  aiModerationSettings: AIModerationSettings;
  setAiModerationSettings: (value: AIModerationSettings | ((prev: AIModerationSettings) => AIModerationSettings)) => void;
  punishmentTypesState: PunishmentType[];

  moveFieldBetweenSections?: (fieldId: string, fromSectionId: string, toSectionId: string, targetIndex?: number) => void;

  visibleSection: 'quick-responses' | 'label-management' | 'ticket-forms' | 'ai-moderation';
}

// Default label colors for the color picker
const DEFAULT_LABEL_COLORS = [
  '#d73a4a', // Red
  '#e99695', // Light red
  '#0969da', // Blue
  '#1f6feb', // Light blue
  '#8250df', // Purple
  '#a371f7', // Light purple
  '#238636', // Green
  '#3fb950', // Light green
  '#f9c513', // Yellow
  '#d29922', // Orange
  '#6e7781', // Gray
  '#ffffff', // White
];

const TICKET_TYPE_LABEL_KEYS: Record<string, string> = {
  chat_report: 'tickets.chatReport',
  player_report: 'tickets.playerReport',
  bug: 'tickets.bugReport',
  appeal: 'tickets.banAppeal',
  support: 'tickets.support',
  application: 'tickets.staffApplication',
};

function formatTicketTypeLabel(type: string, t: (key: string) => string): string {
  const key = TICKET_TYPE_LABEL_KEYS[type];
  if (key) {
    return t(key);
  }
  return type
    .split('_')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
}

// Label Management Table Component
interface LabelManagementTableProps {
  labels: Label[];
  onLabelsChange: (labels: Label[]) => void;
}

function LabelManagementTable({ labels, onLabelsChange }: LabelManagementTableProps) {
  const { t } = useTranslation();
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#6b7280');
  const [newLabelDescription, setNewLabelDescription] = useState('');
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editLabelName, setEditLabelName] = useState('');
  const [editLabelColor, setEditLabelColor] = useState('');
  const [editLabelDescription, setEditLabelDescription] = useState('');

  const handleAddLabel = () => {
    if (!newLabelName.trim()) return;

    const newLabel: Label = {
      id: Date.now().toString(),
      name: newLabelName.trim(),
      color: newLabelColor,
      description: newLabelDescription.trim() || undefined,
    };

    onLabelsChange([...labels, newLabel]);
    setNewLabelName('');
    setNewLabelColor('#6b7280');
    setNewLabelDescription('');
  };

  const [labelDeleteDialogOpen, setLabelDeleteDialogOpen] = useState(false);
  const [labelToDelete, setLabelToDelete] = useState<{id: string; name: string} | null>(null);

  const handleDeleteLabel = (labelId: string, labelName: string) => {
    setLabelToDelete({ id: labelId, name: labelName });
    setLabelDeleteDialogOpen(true);
  };

  const confirmLabelDelete = () => {
    if (labelToDelete) {
      onLabelsChange(labels.filter((l) => l.id !== labelToDelete.id));
    }
    setLabelDeleteDialogOpen(false);
    setLabelToDelete(null);
  };

  const handleStartEdit = (label: Label) => {
    setEditingLabelId(label.id);
    setEditLabelName(label.name);
    setEditLabelColor(label.color);
    setEditLabelDescription(label.description || '');
  };

  const handleSaveEdit = () => {
    if (!editingLabelId || !editLabelName.trim()) return;

    onLabelsChange(
      labels.map((l) =>
        l.id === editingLabelId
          ? {
              ...l,
              name: editLabelName.trim(),
              color: editLabelColor,
              description: editLabelDescription.trim() || undefined,
            }
          : l
      )
    );
    setEditingLabelId(null);
  };

  const handleCancelEdit = () => {
    setEditingLabelId(null);
  };

  return (
    <div className="space-y-4">
      {/* Labels table */}
      {labels.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 text-sm font-medium">{t('settings.tickets.label')}</th>
                <th className="text-left p-3 text-sm font-medium">{t('settings.tickets.description')}</th>
                <th className="text-right p-3 text-sm font-medium">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {labels.map((label) => (
                <tr key={label.id} className="border-t border-border">
                  {editingLabelId === label.id ? (
                    <>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={editLabelColor}
                            onChange={(e) => setEditLabelColor(e.target.value)}
                            className="w-6 h-6 rounded cursor-pointer border-0"
                          />
                          <Input
                            value={editLabelName}
                            onChange={(e) => setEditLabelName(e.target.value)}
                            className="max-w-[150px] h-8"
                            placeholder={t('settings.tickets.labelName')}
                          />
                        </div>
                      </td>
                      <td className="p-3">
                        <Input
                          value={editLabelDescription}
                          onChange={(e) => setEditLabelDescription(e.target.value)}
                          className="h-8"
                          placeholder={t('settings.tickets.descriptionOptional')}
                        />
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                            {t('common.cancel')}
                          </Button>
                          <Button size="sm" onClick={handleSaveEdit}>
                            <Save className="h-3.5 w-3.5 mr-1" />
                            {t('common.save')}
                          </Button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-4 h-4 rounded-full flex-shrink-0"
                            style={{ backgroundColor: label.color }}
                          />
                          <span className="font-medium">{label.name}</span>
                        </div>
                      </td>
                      <td className="p-3 text-sm text-muted-foreground">
                        {label.description || '-'}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleStartEdit(label)}
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeleteLabel(label.id, label.name)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add new label form */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end p-4 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={newLabelColor}
            onChange={(e) => setNewLabelColor(e.target.value)}
            className="w-8 h-8 rounded cursor-pointer border-0 mt-5"
          />
          <div className="space-y-1">
            <Label className="text-xs">{t('settings.tickets.name')}</Label>
            <Input
              value={newLabelName}
              onChange={(e) => setNewLabelName(e.target.value)}
              className="w-[150px] h-8"
              placeholder={t('settings.tickets.labelNamePlaceholder')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddLabel();
              }}
            />
          </div>
        </div>
        <div className="flex-1 space-y-1">
          <Label className="text-xs">{t('settings.tickets.descriptionOptional')}</Label>
          <Input
            value={newLabelDescription}
            onChange={(e) => setNewLabelDescription(e.target.value)}
            className="h-8"
            placeholder={t('settings.tickets.labelDescriptionPlaceholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddLabel();
            }}
          />
        </div>
        <Button size="sm" onClick={handleAddLabel} disabled={!newLabelName.trim()}>
          <Plus className="h-4 w-4 mr-1" />
          {t('settings.tickets.addLabel')}
        </Button>
      </div>

      {/* Color preset palette */}
      <div className="flex flex-wrap gap-1.5 pt-2">
        <span className="text-xs text-muted-foreground mr-2">{t('settings.tickets.quickColors')}</span>
        {DEFAULT_LABEL_COLORS.map((color) => (
          <button
            key={color}
            className="w-5 h-5 rounded border border-border hover:scale-110 transition-transform"
            style={{ backgroundColor: color }}
            onClick={() => setNewLabelColor(color)}
            title={color}
          />
        ))}
      </div>

      {/* Label Deletion Dialog */}
      <AlertDialog open={labelDeleteDialogOpen} onOpenChange={setLabelDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.tickets.deleteLabelTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.tickets.deleteLabelConfirm', { name: labelToDelete?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmLabelDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const TicketSettings = ({
  quickResponsesState,
  setQuickResponsesState,
  labels,
  setLabels,
  bugReportTags,
  setBugReportTags,
  playerReportTags,
  setPlayerReportTags,
  appealTags,
  setAppealTags,
  ticketForms,
  setTicketForms,
  selectedTicketFormType,
  setSelectedTicketFormType,
  aiModerationSettings,
  setAiModerationSettings,
  punishmentTypesState,
  moveFieldBetweenSections,
  visibleSection
}: TicketSettingsProps) => {
  const { t } = useTranslation();
  useAuth();
  
  // Billing status for premium gating
  const { data: billingStatus } = useBillingStatus();
  
  // Check if user has premium access
  const isPremiumUser = () => {
    if (!billingStatus) return false;

    return hasPremiumAccess({
      plan: billingStatus.plan,
      subscriptionStatus: billingStatus.subscriptionStatus,
      currentPeriodEnd: billingStatus.currentPeriodEnd,
    });
  };

  // Quick Response editing states
  const [editingAction, setEditingAction] = useState<QuickResponseAction | null>(null);
  const [editingCategory, setEditingCategory] = useState<QuickResponseCategory | null>(null);
  const [showActionDialog, setShowActionDialog] = useState(false);

  // Form builder states for ticket forms - we need these internally since they weren't passed as props
  const [selectedTicketFormField, setSelectedTicketFormField] = useState<TicketFormField | null>(null);
  const [selectedTicketFormSection, setSelectedTicketFormSection] = useState<TicketFormSection | null>(null);
  const [isAddTicketFormFieldDialogOpen, setIsAddTicketFormFieldDialogOpen] = useState(false);
  const [isAddTicketFormSectionDialogOpen, setIsAddTicketFormSectionDialogOpen] = useState(false);
  const [newTicketFormFieldLabel, setNewTicketFormFieldLabel] = useState('');
  const [newTicketFormFieldType, setNewTicketFormFieldType] = useState<'text' | 'textarea' | 'dropdown' | 'multiple_choice' | 'checkbox' | 'file_upload' | 'checkboxes' | 'description'>('text');
  const [newTicketFormFieldDescription, setNewTicketFormFieldDescription] = useState('');
  const [newTicketFormFieldRequired, setNewTicketFormFieldRequired] = useState(false);
  const [newTicketFormFieldOptions, setNewTicketFormFieldOptions] = useState<string[]>([]);
  const [newTicketFormFieldSectionId, setNewTicketFormFieldSectionId] = useState('');
  const [, setNewTicketFormFieldGoToSection] = useState('');
  const [newTicketFormFieldOptionSectionMapping, setNewTicketFormFieldOptionSectionMapping] = useState<Record<string, string>>({});
  const [newTicketFormOption, setNewTicketFormOption] = useState('');
  const [isOptionNavigationExpanded, setIsOptionNavigationExpanded] = useState(false);
  
  // Section builder states
  const [newTicketFormSectionTitle, setNewTicketFormSectionTitle] = useState('');
  const [newTicketFormSectionDescription, setNewTicketFormSectionDescription] = useState('');
  const [newTicketFormSectionHideByDefault, setNewTicketFormSectionHideByDefault] = useState(false);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  
  // AI Punishment Types states
  const [isAddAIPunishmentDialogOpen, setIsAddAIPunishmentDialogOpen] = useState(false);
  const [selectedAIPunishmentType, setSelectedAIPunishmentType] = useState<AIPunishmentConfig | null>(null);

  // Quick Response deletion confirmation state
  const [quickResponseDeleteDialogOpen, setQuickResponseDeleteDialogOpen] = useState(false);
  const [quickResponseToDelete, setQuickResponseToDelete] = useState<{categoryId: string; actionId: string; actionName: string} | null>(null);

  // AI Punishment Type deletion confirmation state
  const [aiPunishmentDeleteDialogOpen, setAiPunishmentDeleteDialogOpen] = useState(false);
  const [aiPunishmentToDelete, setAiPunishmentToDelete] = useState<{id: string; name: string} | null>(null);

  // Tag deletion confirmation states
  const [tagDeleteDialogOpen, setTagDeleteDialogOpen] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<{type: 'bug' | 'player' | 'appeal'; index: number; name: string} | null>(null);

  const confirmTagDelete = () => {
    if (tagToDelete) {
      if (tagToDelete.type === 'bug') {
        setBugReportTags(bugReportTags.filter((_, i) => i !== tagToDelete.index));
      } else if (tagToDelete.type === 'player') {
        setPlayerReportTags(playerReportTags.filter((_, i) => i !== tagToDelete.index));
      } else {
        setAppealTags(appealTags.filter((_, i) => i !== tagToDelete.index));
      }
    }
    setTagDeleteDialogOpen(false);
    setTagToDelete(null);
  };

  // Form field/section deletion confirmation states
  const [fieldDeleteDialogOpen, setFieldDeleteDialogOpen] = useState(false);
  const [fieldToDelete, setFieldToDelete] = useState<{id: string; label: string} | null>(null);
  const [sectionDeleteDialogOpen, setSectionDeleteDialogOpen] = useState(false);
  const [sectionToDelete, setSectionToDelete] = useState<{id: string; title: string} | null>(null);

  const handleFieldDeleteClick = (fieldId: string, fieldLabel: string) => {
    setFieldToDelete({ id: fieldId, label: fieldLabel });
    setFieldDeleteDialogOpen(true);
  };

  const confirmFieldDelete = () => {
    if (fieldToDelete) {
      removeTicketFormField(fieldToDelete.id);
    }
    setFieldDeleteDialogOpen(false);
    setFieldToDelete(null);
  };

  const handleSectionDeleteClick = (sectionId: string, sectionTitle: string) => {
    setSectionToDelete({ id: sectionId, title: sectionTitle });
    setSectionDeleteDialogOpen(true);
  };

  const confirmSectionDelete = () => {
    if (sectionToDelete) {
      removeTicketFormSection(sectionToDelete.id);
    }
    setSectionDeleteDialogOpen(false);
    setSectionToDelete(null);
  };

  // Ticket form management functions
  const addTicketFormField = () => {
    if (!newTicketFormFieldLabel.trim()) return;

    const optionNavigationKeys = newTicketFormFieldType === 'checkbox'
      ? ['true']
      : (newTicketFormFieldType === 'dropdown' || newTicketFormFieldType === 'multiple_choice' || newTicketFormFieldType === 'checkboxes')
        ? newTicketFormFieldOptions
        : [];

    const filteredOptionSectionMapping = Object.fromEntries(
      Object.entries(newTicketFormFieldOptionSectionMapping).filter(([key, value]) =>
        optionNavigationKeys.includes(key) && value !== '' && value !== '__none__'
      )
    );
    
    const newField: TicketFormField = {
      id: Date.now().toString(),
      type: newTicketFormFieldType,
      label: newTicketFormFieldLabel,
      description: newTicketFormFieldDescription || undefined,
      required: newTicketFormFieldRequired,
      options: (newTicketFormFieldType === 'dropdown' || newTicketFormFieldType === 'multiple_choice' || newTicketFormFieldType === 'checkboxes') ? newTicketFormFieldOptions : undefined,
      order: ticketForms[selectedTicketFormType]?.fields?.length || 0,
      sectionId: newTicketFormFieldSectionId || undefined,
      optionSectionMapping: Object.keys(filteredOptionSectionMapping).length > 0 ? filteredOptionSectionMapping : undefined,
    };

    if (selectedTicketFormField) {
      // Update existing field
      setTicketForms(prev => ({
        ...prev,
        [selectedTicketFormType]: {
          ...prev[selectedTicketFormType],
          fields: (prev[selectedTicketFormType]?.fields || []).map(field =>
            field.id === selectedTicketFormField.id
              ? { ...newField, id: selectedTicketFormField.id, order: field.order }
              : field
          )
        }
      }));
    } else {
      // Add new field
      setTicketForms(prev => ({
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
    setTicketForms(prev => ({
      ...prev,
      [selectedTicketFormType]: {
        ...prev[selectedTicketFormType],
        fields: (prev[selectedTicketFormType]?.fields || [])
          .filter(f => f.id !== fieldId)
          .map((field, index) => ({ ...field, order: index }))
      }
    }));
  };

  // Section Management Functions
  const addTicketFormSection = () => {
    if (!newTicketFormSectionTitle.trim()) return;
    
    const newSection: TicketFormSection = {
      id: Date.now().toString(),
      title: newTicketFormSectionTitle,
      description: newTicketFormSectionDescription || undefined,
      order: ticketForms[selectedTicketFormType]?.sections?.length || 0,
      hideByDefault: newTicketFormSectionHideByDefault,
    };

    if (selectedTicketFormSection) {
      // Update existing section
      setTicketForms(prev => ({
        ...prev,
        [selectedTicketFormType]: {
          ...prev[selectedTicketFormType],
          sections: (prev[selectedTicketFormType]?.sections || []).map(section =>
            section.id === selectedTicketFormSection.id
              ? { ...newSection, id: selectedTicketFormSection.id, order: section.order }
              : section
          )
        }
      }));
    } else {
      // Add new section
      setTicketForms(prev => ({
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
    setTicketForms(prev => ({
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

  // Drag and drop handlers for sections
  const moveSectionInForm = React.useCallback((dragIndex: number, hoverIndex: number) => {
    setTicketForms(prev => {
      const sections = [...(prev[selectedTicketFormType]?.sections || [])];
      const dragSection = sections[dragIndex];
      if (!dragSection) {
        return prev;
      }
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
  }, [selectedTicketFormType, setTicketForms]);

  // Drag and drop handlers for fields within sections
  const moveFieldInForm = React.useCallback((dragIndex: number, hoverIndex: number, sectionId: string) => {
    setTicketForms(prev => {
      const allFields = [...(prev[selectedTicketFormType]?.fields || [])];
      
      // Get fields for the specific section
      const sectionFields = allFields.filter(f => f.sectionId === sectionId);
      const otherFields = allFields.filter(f => f.sectionId !== sectionId);
      
      // Reorder within section
      const dragField = sectionFields[dragIndex];
      if (!dragField) {
        return prev;
      }
      sectionFields.splice(dragIndex, 1);
      sectionFields.splice(hoverIndex, 0, dragField);

      // Update order values for fields in this section
      const updatedSectionFields = sectionFields.map((field, index) => ({
        ...field,
        order: index
      }));
      
      // Combine back together
      const updatedFields = [...otherFields, ...updatedSectionFields]
        .sort((a, b) => a.order - b.order);

      return {
        ...prev,
        [selectedTicketFormType]: {
          ...prev[selectedTicketFormType],
          fields: updatedFields
        }
      };
    });
  }, [selectedTicketFormType, setTicketForms]);

  // Create default implementations for optional callbacks
  const defaultMoveFieldBetweenSections = React.useCallback((fieldId: string, _fromSectionId: string, toSectionId: string, targetIndex?: number) => {
    setTicketForms(prev => {
      const allFields = [...(prev[selectedTicketFormType]?.fields || [])];
      
      // Find the field to move
      const fieldToMove = allFields.find(f => f.id === fieldId);
      if (!fieldToMove) return prev;
      
      // Remove field from its current position
      const otherFields = allFields.filter(f => f.id !== fieldId);
      
      // Get target section fields
      const targetSectionFields = otherFields.filter(f => f.sectionId === toSectionId);
      
      // Insert at target index or at end
      const insertIndex = targetIndex !== undefined ? targetIndex : targetSectionFields.length;
      targetSectionFields.splice(insertIndex, 0, { ...fieldToMove, sectionId: toSectionId });
      
      // Update order values for target section
      const updatedTargetFields = targetSectionFields.map((field, index) => ({
        ...field,
        order: index
      }));
      
      // Get fields from other sections
      const otherSectionFields = otherFields.filter(f => f.sectionId !== toSectionId);
      
      // Combine back together
      const updatedFields = [...otherSectionFields, ...updatedTargetFields]
        .sort((a, b) => a.order - b.order);

      return {
        ...prev,
        [selectedTicketFormType]: {
          ...prev[selectedTicketFormType],
          fields: updatedFields
        }
      };
    });
  }, [selectedTicketFormType, setTicketForms]);

  // Move action within a category
  const moveAction = React.useCallback((categoryId: string, dragIndex: number, hoverIndex: number) => {
    setQuickResponsesState(prev => ({
      ...prev,
      categories: prev.categories.map(category => 
        category.id === categoryId 
          ? {
              ...category,
              actions: (() => {
                const actions = [...category.actions];
                const draggedAction = actions[dragIndex];
                if (!draggedAction) {
                  return category.actions;
                }
                actions.splice(dragIndex, 1);
                actions.splice(hoverIndex, 0, draggedAction);

                // Update order values
                return actions.map((action, index) => ({
                  ...action,
                  order: index
                }));
              })()
            }
          : category
      )
    }));
  }, [setQuickResponsesState]);

  // Initialize quick responses with defaults if empty
  useEffect(() => {
    if (!quickResponsesState || !quickResponsesState.categories || quickResponsesState.categories.length === 0) {
      setQuickResponsesState(defaultQuickResponsesConfig);
    }
  }, [quickResponsesState, setQuickResponsesState]);

  // Clear form when dialog opens for new field (not editing)
  useEffect(() => {
    if (isAddTicketFormFieldDialogOpen && !selectedTicketFormField) {
      // This is for adding a new field, ensure form is clean
      setNewTicketFormFieldLabel('');
      setNewTicketFormFieldType('text');
      setNewTicketFormFieldDescription('');
      setNewTicketFormFieldRequired(false);
      setNewTicketFormFieldOptions([]);
      setNewTicketFormFieldGoToSection('');
      setNewTicketFormFieldOptionSectionMapping({});
      setIsOptionNavigationExpanded(false);
    }
  }, [isAddTicketFormFieldDialogOpen, selectedTicketFormField]);

  // Helper to render Quick Responses content
  const quickResponsesContent = (
    <DndProvider backend={HTML5Backend}>
      <p className="text-sm text-muted-foreground mb-6">
        {t('settings.tickets.quickResponsesDesc')}
      </p>

      <div className="space-y-6">
      {quickResponsesState?.categories?.length > 0 ? quickResponsesState.categories.map((category) => (
        <Card key={category.id} className="border-l-4 border-l-blue-500 rounded-card shadow-card-inner bg-surface-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">{category.name}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {category.ticketTypes.map((type) => formatTicketTypeLabel(type, t)).join(', ')} - {t('settings.tickets.actionsCount', { count: category.actions.length })}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingCategory(category);
                    setShowCategoryDialog(true);
                  }}
                >
                  <Edit3 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedCategoryId(category.id);
                    setEditingAction(null);
                    setShowActionDialog(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {category.actions.map((action, index) => (
              <DraggableQuickResponseAction
                key={action.id}
                action={action}
                index={index}
                categoryId={category.id}
                moveAction={moveAction}
                onEdit={() => {
                  setEditingAction(action);
                  setSelectedCategoryId(category.id);
                  setShowActionDialog(true);
                }}
                onDelete={() => {
                  setQuickResponseToDelete({
                    categoryId: category.id,
                    actionId: action.id,
                    actionName: action.name,
                  });
                  setQuickResponseDeleteDialogOpen(true);
                }}
              />
            ))}
          </CardContent>
        </Card>
      )) : (
        <div className="text-center py-8 border-2 border-dashed border-muted rounded-lg">
          <MessageCircle className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground mb-4">{t('settings.tickets.noCategoriesYet')}</p>
          <Button
            onClick={() => {
              setEditingCategory(null);
              setShowCategoryDialog(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('settings.tickets.createCategory')}
          </Button>
        </div>
      )}
      </div>

      {quickResponsesState?.categories?.length > 0 && (
        <div className="mt-4 pt-4 border-t">
          <Button
            onClick={() => {
              setEditingCategory(null);
              setShowCategoryDialog(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('settings.tickets.addCategory')}
          </Button>
        </div>
      )}
    </DndProvider>
  );

  // Helper to render Label Management content
  const labelManagementContent = (
    <div>
      <p className="text-sm text-muted-foreground mb-4">
        {t('settings.tickets.labelManagementDesc')}
      </p>

      <LabelManagementTable
        labels={labels || []}
        onLabelsChange={setLabels}
      />
    </div>
  );

  // Helper function to render all dialogs (shared between both return paths)
  const renderDialogs = () => (
    <>
      {/* Add AI Punishment Type Dialog */}
      {isAddAIPunishmentDialogOpen && (
        <AddAIPunishmentDialog
          punishmentTypes={punishmentTypesState}
          existingConfigs={aiModerationSettings?.aiPunishmentConfigs || {}}
          onEnable={(selectedType, aiDescription) => {
            if (selectedType.ordinal != null) {
              const configKey = String(selectedType.ordinal);
              setAiModerationSettings((prev) => ({
                ...prev,
                aiPunishmentConfigs: {
                  ...prev.aiPunishmentConfigs,
                  [configKey]: {
                    id: configKey,
                    name: selectedType.name,
                    aiDescription,
                    enabled: true
                  }
                }
              }));
            }
            setIsAddAIPunishmentDialogOpen(false);
          }}
          onClose={() => setIsAddAIPunishmentDialogOpen(false)}
        />
      )}

      {/* Tag Deletion Dialog */}
      <AlertDialog open={tagDeleteDialogOpen} onOpenChange={setTagDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.tickets.deleteTagTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.tickets.deleteTagConfirm', { name: tagToDelete?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmTagDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Field Deletion Dialog */}
      <AlertDialog open={fieldDeleteDialogOpen} onOpenChange={setFieldDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.tickets.deleteFormFieldTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.tickets.deleteFormFieldConfirm', { label: fieldToDelete?.label })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmFieldDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Section Deletion Dialog */}
      <AlertDialog open={sectionDeleteDialogOpen} onOpenChange={setSectionDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.tickets.deleteSectionTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.tickets.deleteSectionConfirm', { title: sectionToDelete?.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSectionDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Quick Response Delete Dialog */}
      <AlertDialog open={quickResponseDeleteDialogOpen} onOpenChange={setQuickResponseDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.tickets.deleteQuickResponseTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.tickets.deleteQuickResponseConfirm', { name: quickResponseToDelete?.actionName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (quickResponseToDelete) {
                  const updatedConfig = {
                    ...quickResponsesState,
                    categories: quickResponsesState.categories.map(cat =>
                      cat.id === quickResponseToDelete.categoryId
                        ? { ...cat, actions: cat.actions.filter(a => a.id !== quickResponseToDelete.actionId) }
                        : cat
                    )
                  };
                  setQuickResponsesState(updatedConfig);
                }
                setQuickResponseDeleteDialogOpen(false);
                setQuickResponseToDelete(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AI Punishment Delete Dialog */}
      <AlertDialog open={aiPunishmentDeleteDialogOpen} onOpenChange={setAiPunishmentDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.tickets.removeAIPunishmentTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.tickets.removeAIPunishmentConfirm', { name: aiPunishmentToDelete?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (aiPunishmentToDelete) {
                  setAiModerationSettings((prev) => {
                    const newConfigs = { ...prev.aiPunishmentConfigs };
                    delete newConfigs[aiPunishmentToDelete.id];
                    return { ...prev, aiPunishmentConfigs: newConfigs };
                  });
                }
                setAiPunishmentDeleteDialogOpen(false);
                setAiPunishmentToDelete(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AI Punishment Edit Dialog */}
      {selectedAIPunishmentType && (
        <EditAIPunishmentDialog
          config={selectedAIPunishmentType}
          onSave={(aiDescription) => {
            setAiModerationSettings((prev) => ({
              ...prev,
              aiPunishmentConfigs: {
                ...prev.aiPunishmentConfigs,
                [selectedAIPunishmentType.id]: {
                  ...(prev.aiPunishmentConfigs[selectedAIPunishmentType.id] ?? selectedAIPunishmentType),
                  aiDescription
                }
              }
            }));
            setSelectedAIPunishmentType(null);
          }}
          onClose={() => setSelectedAIPunishmentType(null)}
        />
      )}

      {/* Quick Response Action Dialog */}
      <Dialog open={showActionDialog} onOpenChange={setShowActionDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingAction ? t('settings.tickets.editQuickResponse') : t('settings.tickets.addQuickResponse')}</DialogTitle>
            <DialogDescription>{t('settings.tickets.quickResponseDialogDesc')}</DialogDescription>
          </DialogHeader>
          <QuickResponseActionForm
            action={editingAction}
            categoryId={selectedCategoryId}
            quickResponsesState={quickResponsesState}
            setQuickResponsesState={setQuickResponsesState}
            punishmentTypes={punishmentTypesState}
            onSave={() => {
              setShowActionDialog(false);
              setEditingAction(null);
            }}
            onCancel={() => {
              setShowActionDialog(false);
              setEditingAction(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Quick Response Category Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? t('settings.tickets.editCategory') : t('settings.tickets.addCategory')}</DialogTitle>
            <DialogDescription>{t('settings.tickets.quickResponseCategoryDialogDesc')}</DialogDescription>
          </DialogHeader>
          <QuickResponseCategoryForm
            category={editingCategory}
            quickResponsesState={quickResponsesState}
            setQuickResponsesState={setQuickResponsesState}
            onSave={() => {
              setShowCategoryDialog(false);
              setEditingCategory(null);
            }}
            onCancel={() => {
              setShowCategoryDialog(false);
              setEditingCategory(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Add/Edit Field Dialog */}
      <Dialog open={isAddTicketFormFieldDialogOpen} onOpenChange={setIsAddTicketFormFieldDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedTicketFormField ? t('settings.tickets.editFormField') : t('settings.tickets.addFormField')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('settings.tickets.fieldLabel')}</Label>
              <Input
                value={newTicketFormFieldLabel}
                onChange={(e) => setNewTicketFormFieldLabel(e.target.value)}
                placeholder={t('settings.tickets.fieldLabelPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('settings.tickets.fieldType')}</Label>
              <Select value={newTicketFormFieldType} onValueChange={(v) => setNewTicketFormFieldType(v as typeof newTicketFormFieldType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">{t('settings.tickets.fieldTypeText')}</SelectItem>
                  <SelectItem value="textarea">{t('settings.tickets.fieldTypeTextarea')}</SelectItem>
                  <SelectItem value="dropdown">{t('settings.tickets.fieldTypeDropdown')}</SelectItem>
                  <SelectItem value="multiple_choice">{t('settings.tickets.fieldTypeMultipleChoice')}</SelectItem>
                  <SelectItem value="checkbox">{t('settings.tickets.fieldTypeCheckbox')}</SelectItem>
                  <SelectItem value="checkboxes">{t('settings.tickets.fieldTypeCheckboxes')}</SelectItem>
                  <SelectItem value="file_upload">{t('settings.tickets.fieldTypeFileUpload')}</SelectItem>
                  <SelectItem value="description">{t('settings.tickets.fieldTypeDescription')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('settings.tickets.descriptionOptional')}</Label>
              <Input
                value={newTicketFormFieldDescription}
                onChange={(e) => setNewTicketFormFieldDescription(e.target.value)}
                placeholder={t('settings.tickets.fieldDescriptionPlaceholder')}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={newTicketFormFieldRequired}
                onCheckedChange={setNewTicketFormFieldRequired}
              />
              <Label>{t('settings.tickets.required')}</Label>
            </div>
            {['dropdown', 'multiple_choice', 'checkboxes'].includes(newTicketFormFieldType) && (
              <div className="space-y-2">
                <Label>{t('settings.tickets.options')}</Label>
                <div className="space-y-2">
                  {newTicketFormFieldOptions.map((opt, idx) => (
                    <div key={idx} className="flex gap-2">
                      <Input value={opt} onChange={(e) => {
                        const newOpts = [...newTicketFormFieldOptions];
                        newOpts[idx] = e.target.value;
                        setNewTicketFormFieldOptions(newOpts);
                      }} />
                      <Button variant="ghost" size="sm" onClick={() => {
                        setNewTicketFormFieldOptions(newTicketFormFieldOptions.filter((_, i) => i !== idx));
                      }}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input
                      value={newTicketFormOption}
                      onChange={(e) => setNewTicketFormOption(e.target.value)}
                      placeholder={t('settings.tickets.addOptionPlaceholder')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newTicketFormOption.trim()) {
                          setNewTicketFormFieldOptions([...newTicketFormFieldOptions, newTicketFormOption.trim()]);
                          setNewTicketFormOption('');
                        }
                      }}
                    />
                    <Button size="sm" onClick={() => {
                      if (newTicketFormOption.trim()) {
                        setNewTicketFormFieldOptions([...newTicketFormFieldOptions, newTicketFormOption.trim()]);
                        setNewTicketFormOption('');
                      }
                    }}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {['dropdown', 'multiple_choice', 'checkbox', 'checkboxes'].includes(newTicketFormFieldType) &&
              (newTicketFormFieldType === 'checkbox' || newTicketFormFieldOptions.length > 0) && (
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
                  <Label className="text-sm font-medium cursor-pointer">
                    {t('settings.tickets.optionNavigationOptional')}
                  </Label>
                </button>

                {isOptionNavigationExpanded && (
                  <div className="pl-6 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      {t('settings.tickets.optionNavigationDesc')}
                    </p>
                    {(newTicketFormFieldType === 'checkbox'
                      ? [{ value: 'true', label: t('settings.tickets.checkedOption') }]
                      : newTicketFormFieldOptions.map((option) => ({ value: option, label: option }))
                    ).map((option) => (
                      <div key={option.value} className="flex items-center gap-3">
                        <div className="flex-1">
                          <Label className="text-sm font-medium">{option.label}</Label>
                        </div>
                        <div className="flex-1">
                          <Select
                            value={newTicketFormFieldOptionSectionMapping[option.value] || '__none__'}
                            onValueChange={(value) => setNewTicketFormFieldOptionSectionMapping(prev => ({
                              ...prev,
                              [option.value]: value
                            }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={t('settings.tickets.noNavigation')} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">{t('settings.tickets.noNavigation')}</SelectItem>
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
            <Button variant="outline" onClick={() => setIsAddTicketFormFieldDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => {
              addTicketFormField();
            }}>
              {selectedTicketFormField ? t('common.update') : t('common.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Section Dialog */}
      <Dialog open={isAddTicketFormSectionDialogOpen} onOpenChange={setIsAddTicketFormSectionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedTicketFormSection ? t('settings.tickets.editSection') : t('settings.tickets.addSection')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('settings.tickets.sectionTitle')}</Label>
              <Input
                value={newTicketFormSectionTitle}
                onChange={(e) => setNewTicketFormSectionTitle(e.target.value)}
                placeholder={t('settings.tickets.sectionTitlePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('settings.tickets.descriptionOptional')}</Label>
              <Input
                value={newTicketFormSectionDescription}
                onChange={(e) => setNewTicketFormSectionDescription(e.target.value)}
                placeholder={t('settings.tickets.sectionDescriptionPlaceholder')}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={newTicketFormSectionHideByDefault}
                onCheckedChange={setNewTicketFormSectionHideByDefault}
              />
              <div className="space-y-1">
                <Label>{t('settings.tickets.hideByDefault')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('settings.tickets.hideByDefaultDesc')}
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsAddTicketFormSectionDialogOpen(false);
              setSelectedTicketFormSection(null);
            }}>{t('common.cancel')}</Button>
            <Button onClick={() => {
              addTicketFormSection();
            }}>
              {selectedTicketFormSection ? t('common.update') : t('common.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return (
    <div className="space-y-6 p-2">
      {visibleSection === 'quick-responses' && quickResponsesContent}
      {visibleSection === 'label-management' && labelManagementContent}
      {visibleSection === 'ticket-forms' && (
        <DndProvider backend={HTML5Backend}>
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              {t('settings.tickets.ticketFormsDesc')}
            </p>

            <Tabs
              value={selectedTicketFormType}
              onValueChange={(value) => setSelectedTicketFormType(value as 'bug' | 'support' | 'application')}
              className="w-full space-y-6"
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="bug">{t('settings.tickets.bugReport')}</TabsTrigger>
                <TabsTrigger value="support">{t('settings.tickets.supportRequest')}</TabsTrigger>
                <TabsTrigger value="application">{t('settings.tickets.staffApplication')}</TabsTrigger>
              </TabsList>

              <TabsContent value={selectedTicketFormType} className="mt-0 space-y-6">
                <p className="text-sm text-muted-foreground">
                  {selectedTicketFormType === 'bug' && t('settings.tickets.bugReportFormStructure')}
                  {selectedTicketFormType === 'support' && t('settings.tickets.supportRequestFormStructure')}
                  {selectedTicketFormType === 'application' && t('settings.tickets.applicationFormStructure')}
                </p>

                <div className="space-y-4">
                  <h5 className="text-sm font-medium">{t('settings.tickets.generalSettings')}</h5>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div>
                        <Label className="text-sm font-medium">{t('settings.tickets.requireEmailForCreation')}</Label>
                        <p className="text-xs text-muted-foreground">{t('settings.tickets.requireEmailForCreationDesc')}</p>
                      </div>
                      <Switch
                        checked={ticketForms[selectedTicketFormType]?.requireEmail ?? false}
                        onCheckedChange={(checked) =>
                          setTicketForms(prev => ({
                            ...prev,
                            [selectedTicketFormType]: {
                              ...prev[selectedTicketFormType],
                              requireEmail: checked,
                              ...(!checked ? { requireEmailAuth: false } : {}),
                            }
                          }))
                        }
                      />
                    </div>
                    <div className={`flex items-center justify-between p-3 bg-muted/50 rounded-lg ${!(ticketForms[selectedTicketFormType]?.requireEmail) ? 'opacity-50' : ''}`}>
                      <div>
                        <Label className="text-sm font-medium">{t('settings.tickets.requireEmailAuthToAccess')}</Label>
                        <p className="text-xs text-muted-foreground">{t('settings.tickets.requireEmailAuthToAccessDesc')}</p>
                      </div>
                      <Switch
                        checked={ticketForms[selectedTicketFormType]?.requireEmailAuth ?? false}
                        disabled={!(ticketForms[selectedTicketFormType]?.requireEmail)}
                        onCheckedChange={(checked) =>
                          setTicketForms(prev => ({
                            ...prev,
                            [selectedTicketFormType]: {
                              ...prev[selectedTicketFormType],
                              requireEmailAuth: checked,
                            }
                          }))
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div>
                        <Label className="text-sm font-medium">{t('settings.tickets.allowEmailNotifications')}</Label>
                        <p className="text-xs text-muted-foreground">{t('settings.tickets.allowEmailNotificationsDesc')}</p>
                      </div>
                      <Switch
                        checked={ticketForms[selectedTicketFormType]?.allowEmailNotifications !== false}
                        onCheckedChange={(checked) =>
                          setTicketForms(prev => ({
                            ...prev,
                            [selectedTicketFormType]: {
                              ...prev[selectedTicketFormType],
                              allowEmailNotifications: checked,
                            }
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Form Sections */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h5 className="text-sm font-medium">{t('settings.tickets.formSections')}</h5>
                    <Button
                      size="sm"
                      onClick={() => setIsAddTicketFormSectionDialogOpen(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      {t('settings.tickets.createSection')}
                    </Button>
                  </div>

                  {/* Section List */}
                  <div className="space-y-3">
                    {ticketForms[selectedTicketFormType]?.sections
                      ?.sort((a, b) => a.order - b.order)
                      .map((section, sectionIndex) => (
                        <DraggableSectionCard
                          key={section.id}
                          section={section}
                          index={sectionIndex}
                          moveSection={moveSectionInForm}
                          selectedTicketFormType={selectedTicketFormType}
                          ticketForms={ticketForms}
                          onEditSection={(section) => {
                            setSelectedTicketFormSection(section);
                            setNewTicketFormSectionTitle(section.title);
                            setNewTicketFormSectionDescription(section.description || '');
                            setNewTicketFormSectionHideByDefault(section.hideByDefault || false);
                            setIsAddTicketFormSectionDialogOpen(true);
                          }}
                          onDeleteSection={(sectionId) => {
                            const sectionToRemove = ticketForms[selectedTicketFormType]?.sections?.find(s => s.id === sectionId);
                            if (sectionToRemove) {
                              handleSectionDeleteClick(sectionId, sectionToRemove.title);
                            }
                          }}
                          onEditField={(field) => {
                            setSelectedTicketFormField(field);
                            setNewTicketFormFieldLabel(field.label);
                            setNewTicketFormFieldType(field.type);
                            setNewTicketFormFieldDescription(field.description || '');
                            setNewTicketFormFieldRequired(field.required);
                            setNewTicketFormFieldOptions(field.options || []);
                            setNewTicketFormFieldSectionId(field.sectionId || '');
                            setNewTicketFormFieldGoToSection(field.goToSection || '');
                            setNewTicketFormFieldOptionSectionMapping(field.optionSectionMapping || {});
                            setIsOptionNavigationExpanded(Object.keys(field.optionSectionMapping || {}).length > 0);
                            setIsAddTicketFormFieldDialogOpen(true);
                          }}
                          onDeleteField={(fieldId) => {
                            const fieldToRemove = ticketForms[selectedTicketFormType]?.fields?.find(f => f.id === fieldId);
                            if (fieldToRemove) {
                              handleFieldDeleteClick(fieldId, fieldToRemove.label);
                            }
                          }}
                          onAddField={() => {
                            setSelectedTicketFormField(null);
                            setNewTicketFormFieldLabel('');
                            setNewTicketFormFieldType('text');
                            setNewTicketFormFieldDescription('');
                            setNewTicketFormFieldRequired(false);
                            setNewTicketFormFieldOptions([]);
                            setNewTicketFormFieldSectionId(section.id);
                            setNewTicketFormFieldGoToSection('');
                            setNewTicketFormFieldOptionSectionMapping({});
                            setIsOptionNavigationExpanded(false);
                            setIsAddTicketFormFieldDialogOpen(true);
                          }}
                          moveField={moveFieldInForm}
                          moveFieldBetweenSections={moveFieldBetweenSections ?? defaultMoveFieldBetweenSections}
                        />
                      ))}

                    {(!ticketForms[selectedTicketFormType]?.sections || ticketForms[selectedTicketFormType]?.sections?.length === 0) && (
                      <div className="text-center py-8 border-2 border-dashed border-muted rounded-lg">
                        <Layers className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground mb-4">{t('settings.tickets.noSectionsYet')}</p>
                        <Button
                          onClick={() => setIsAddTicketFormSectionDialogOpen(true)}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          {t('settings.tickets.createFirstSection')}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </DndProvider>
      )}
      {visibleSection === 'ai-moderation' && isPremiumUser() && (
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            {t('settings.tickets.aiModerationDesc')}
          </p>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div>
                <Label className="text-sm font-medium">{t('settings.tickets.enableAIModeration')}</Label>
                <p className="text-xs text-muted-foreground">{t('settings.tickets.enableAIModerationDesc')}</p>
              </div>
              <Switch
                checked={aiModerationSettings.enableAIReview !== false}
                onCheckedChange={(checked) =>
                  setAiModerationSettings((prev) => ({ ...prev, enableAIReview: checked }))
                }
              />
            </div>

            {aiModerationSettings.enableAIReview && (
              <>
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div>
                    <Label className="text-sm font-medium">{t('settings.tickets.enableAutomatedActions')}</Label>
                    <p className="text-xs text-muted-foreground">{t('settings.tickets.enableAutomatedActionsDesc')}</p>
                  </div>
                  <Switch
                    checked={aiModerationSettings.enableAutomatedActions}
                    onCheckedChange={(checked) =>
                      setAiModerationSettings((prev) => ({ ...prev, enableAutomatedActions: checked }))
                    }
                  />
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-medium">{t('settings.tickets.aiPunishmentTypes')}</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    {t('settings.tickets.aiPunishmentTypesDesc')}
                  </p>

                  {aiModerationSettings.aiPunishmentConfigs && Object.keys(aiModerationSettings.aiPunishmentConfigs).length > 0 ? (
                    <div className="space-y-3">
                      {Object.values(aiModerationSettings.aiPunishmentConfigs).map((config: AIPunishmentConfig) => (
                        <div key={config.id} className="flex items-start justify-between p-4 border rounded-lg bg-card">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-3">
                              <Switch
                                checked={config.enabled}
                                onCheckedChange={(checked) => {
                                  setAiModerationSettings((prev) => ({
                                    ...prev,
                                    aiPunishmentConfigs: {
                                      ...prev.aiPunishmentConfigs,
                                      [config.id]: { ...config, enabled: checked }
                                    }
                                  }));
                                }}
                              />
                              <h5 className="font-medium">{config.name || 'Unknown Type'}</h5>
                            </div>
                            <p className="text-sm text-muted-foreground ml-10">{config.aiDescription}</p>
                          </div>
                          <div className="flex gap-2 ml-4">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedAIPunishmentType(config)}
                            >
                              {t('common.edit')}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                setAiPunishmentToDelete({ id: config.id, name: config.name || 'Unknown' });
                                setAiPunishmentDeleteDialogOpen(true);
                              }}
                            >
                              {t('common.remove')}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 border-2 border-dashed border-muted rounded-lg">
                      <p className="text-sm text-muted-foreground mb-2">{t('settings.tickets.noAIPunishmentTypes')}</p>
                    </div>
                  )}

                  <Button
                    size="sm"
                    onClick={() => setIsAddAIPunishmentDialogOpen(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {t('settings.tickets.addPunishmentType')}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {renderDialogs()}
    </div>
  );
};

// Quick Response Action Form Component
interface AddAIPunishmentDialogProps {
  punishmentTypes: PunishmentType[];
  existingConfigs: Record<string, AIPunishmentConfig>;
  onEnable: (punishmentType: PunishmentType, aiDescription: string) => void;
  onClose: () => void;
}

const AddAIPunishmentDialog = ({ punishmentTypes, existingConfigs, onEnable, onClose }: AddAIPunishmentDialogProps) => {
  const { t } = useTranslation();
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const selectedType = selectedTypeId != null ? punishmentTypes.find(pt => pt.id === selectedTypeId) : undefined;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('settings.tickets.enableAIPunishmentType')}</DialogTitle>
          <DialogDescription>
            {selectedTypeId != null
              ? (selectedType ? t('settings.tickets.configureAIDescFor', { name: selectedType.name }) : t('settings.tickets.configureAIDescSelected'))
              : t('settings.tickets.selectPunishmentTypeForAI')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {selectedType && (
            <div className="bg-muted/30 p-3 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h5 className="font-medium">{selectedType.name}</h5>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {selectedType.category}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {t('settings.tickets.ordinal')}: {selectedType.ordinal}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectedTypeId == null && (
            <div className="space-y-2">
              <Label>{t('settings.tickets.selectPunishmentType')}</Label>
              <Select value="" onValueChange={(value) => setSelectedTypeId(parseInt(value))}>
                <SelectTrigger>
                  <SelectValue placeholder={t('settings.tickets.choosePunishmentType')} />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {punishmentTypes
                    .filter(pt => !Object.values(existingConfigs).some((config: AIPunishmentConfig) => config.name === pt.name))
                    .map((punishmentType) => (
                      <SelectItem key={punishmentType.id} value={String(punishmentType.id)}>
                        {punishmentType.name} ({punishmentType.category})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedTypeId != null && (
            <div className="space-y-2">
              <Label htmlFor="ai-punishment-desc">{t('settings.tickets.aiDescription')}</Label>
              <Textarea
                id="ai-punishment-desc"
                className="min-h-[100px]"
                placeholder={t('settings.tickets.aiDescriptionPlaceholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => {
              if (selectedType && description.trim()) {
                onEnable(selectedType, description.trim());
              }
            }}
            disabled={!selectedType || !description.trim()}
          >
            {t('settings.tickets.enableForAI')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface EditAIPunishmentDialogProps {
  config: AIPunishmentConfig;
  onSave: (aiDescription: string) => void;
  onClose: () => void;
}

const EditAIPunishmentDialog = ({ config, onSave, onClose }: EditAIPunishmentDialogProps) => {
  const { t } = useTranslation();
  const [description, setDescription] = useState(config.aiDescription);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('settings.tickets.editAIPunishmentConfig')}</DialogTitle>
          <DialogDescription>
            {t('settings.tickets.updateAIDescFor', { name: config.name })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-ai-punishment-desc">{t('settings.tickets.aiDescription')}</Label>
            <textarea
              id="edit-ai-punishment-desc"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-[100px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t('settings.tickets.aiDescriptionHelp')}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => {
              if (description.trim()) {
                onSave(description.trim());
              }
            }}
            disabled={!description.trim()}
          >
            {t('common.saveChanges')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const QuickResponseActionForm = ({
  action,
  categoryId,
  quickResponsesState,
  setQuickResponsesState,
  onSave,
  onCancel
}: {
  action: QuickResponseAction | null;
  categoryId: string | null;
  quickResponsesState: QuickResponsesConfiguration;
  setQuickResponsesState: (value: QuickResponsesConfiguration) => void;
  punishmentTypes: PunishmentType[];
  onSave: () => void;
  onCancel: () => void;
}) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Partial<QuickResponseAction>>({
    name: action?.name || '',
    message: action?.message || '',
    closeTicket: action?.closeTicket || false,
    showPunishment: action?.showPunishment || false,
    appealAction: action?.appealAction || 'none'
  });

  const category = quickResponsesState.categories.find(c => c.id === categoryId);
  const isReportCategory = category?.ticketTypes.some(type => type.includes('report'));
  const isAppealCategory = category?.ticketTypes.includes('appeal');

  const handleSave = () => {
    if (!formData.name || !formData.message || !categoryId) return;

    const newAction: QuickResponseAction = {
      id: action?.id || `action_${Date.now()}`,
      name: formData.name,
      message: formData.message,
      order: action?.order || category?.actions.length || 0,
      ...formData
    };

    const updatedConfig = {
      ...quickResponsesState,
      categories: quickResponsesState.categories.map(cat => 
        cat.id === categoryId
          ? {
              ...cat,
              actions: action
                ? cat.actions.map(a => a.id === action.id ? newAction : a)
                : [...cat.actions, newAction]
            }
          : cat
      )
    };

    setQuickResponsesState(updatedConfig);
    onSave();
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="action-name">{t('settings.tickets.actionName')}</Label>
          <Input
            id="action-name"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            placeholder={t('settings.tickets.actionNamePlaceholder')}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="action-message">{t('settings.tickets.responseMessage')}</Label>
          <Textarea
            id="action-message"
            value={formData.message}
            onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
            placeholder={t('settings.tickets.responseMessagePlaceholder')}
            className="min-h-[100px]"
          />
        </div>

        <div className="space-y-4">
          <Separator />
          <h4 className="font-medium">{t('settings.tickets.actionSettings')}</h4>

          <div className="flex items-center space-x-2">
            <Switch
              id="close-ticket"
              checked={formData.closeTicket}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, closeTicket: checked }))}
            />
            <Label htmlFor="close-ticket">{t('settings.tickets.closeTicketOnResponse')}</Label>
          </div>
        </div>

        {/* Punishment Settings - Only for Player/Chat Reports */}
        {isReportCategory && (
          <div className="space-y-4">
            <Separator />
            <h4 className="font-medium">{t('settings.tickets.punishmentSettings')}</h4>

            <div className="flex items-center space-x-2">
              <Switch
                id="show-punishment"
                checked={formData.showPunishment || false}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, showPunishment: checked }))}
              />
              <Label htmlFor="show-punishment">{t('settings.tickets.showPunishmentInterface')}</Label>
            </div>

            <p className="text-sm text-muted-foreground">
              {t('settings.tickets.showPunishmentInterfaceDesc')}
            </p>
          </div>
        )}

        {isAppealCategory && (
          <div className="space-y-4">
            <Separator />
            <h4 className="font-medium">{t('settings.tickets.appealAction')}</h4>

            <div className="space-y-2">
              <Label>{t('settings.tickets.appealDecision')}</Label>
              <Select
                value={formData.appealAction}
                onValueChange={(value: 'pardon' | 'reduce' | 'reject' | 'none') => setFormData(prev => ({ ...prev, appealAction: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('settings.tickets.appealNoAction')}</SelectItem>
                  <SelectItem value="pardon">{t('settings.tickets.appealPardon')}</SelectItem>
                  <SelectItem value="reduce">{t('settings.tickets.appealReduce')}</SelectItem>
                  <SelectItem value="reject">{t('settings.tickets.appealReject')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.appealAction === 'reduce' && (
              <div className="space-y-2 pl-6">
                <p className="text-sm text-muted-foreground">
                  {t('settings.tickets.appealReduceDesc')}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button onClick={handleSave} disabled={!formData.name || !formData.message}>
          <Save className="h-4 w-4 mr-2" />
          {t('settings.tickets.saveResponse')}
        </Button>
      </DialogFooter>
    </div>
  );
};

// Quick Response Category Form Component
const QuickResponseCategoryForm = ({ 
  category, 
  quickResponsesState, 
  setQuickResponsesState, 
  onSave, 
  onCancel 
}: {
  category: QuickResponseCategory | null;
  quickResponsesState: QuickResponsesConfiguration;
  setQuickResponsesState: (value: QuickResponsesConfiguration) => void;
  onSave: () => void;
  onCancel: () => void;
}) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    name: category?.name || '',
    ticketTypes: category?.ticketTypes || []
  });

  const availableTicketTypes = ['player_report', 'chat_report', 'bug', 'appeal', 'support', 'application'];

  const handleSave = () => {
    if (!formData.name || formData.ticketTypes.length === 0) return;

    const newCategory: QuickResponseCategory = {
      id: category?.id || `category_${Date.now()}`,
      name: formData.name,
      ticketTypes: formData.ticketTypes,
      order: category?.order || quickResponsesState.categories.length,
      actions: category?.actions || []
    };

    const updatedConfig = {
      ...quickResponsesState,
      categories: category
        ? quickResponsesState.categories.map(cat => cat.id === category.id ? newCategory : cat)
        : [...quickResponsesState.categories, newCategory]
    };

    setQuickResponsesState(updatedConfig);
    onSave();
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="category-name">{t('settings.tickets.categoryName')}</Label>
          <Input
            id="category-name"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            placeholder={t('settings.tickets.categoryNamePlaceholder')}
          />
        </div>

        <div className="space-y-2">
          <Label>{t('settings.tickets.ticketTypes')}</Label>
          <div className="grid grid-cols-2 gap-2">
            {availableTicketTypes.map(type => (
              <div key={type} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id={type}
                  checked={formData.ticketTypes.includes(type)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setFormData(prev => ({ ...prev, ticketTypes: [...prev.ticketTypes, type] }));
                    } else {
                      setFormData(prev => ({ ...prev, ticketTypes: prev.ticketTypes.filter(t => t !== type) }));
                    }
                  }}
                />
                <Label htmlFor={type} className="capitalize">
                  {type.replace('_', ' ')}
                </Label>
              </div>
            ))}
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button onClick={handleSave} disabled={!formData.name || formData.ticketTypes.length === 0}>
          <Save className="h-4 w-4 mr-2" />
          {t('settings.tickets.saveCategory')}
        </Button>
      </DialogFooter>
    </div>
  );
};

// FieldDropZone Component for cross-section field drops
interface FieldDropZoneProps {
  sectionId: string;
  moveFieldBetweenSections: (fieldId: string, fromSectionId: string, toSectionId: string, targetIndex?: number) => void;
}

const FieldDropZone = ({ sectionId, moveFieldBetweenSections }: FieldDropZoneProps) => {
  const { t } = useTranslation();
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
        <span>{t('settings.tickets.dropFieldHere')}</span>
      ) : canDrop ? (
        <span className="opacity-50">{t('settings.tickets.dropFieldsFromOtherSections')}</span>
      ) : (
        <span className="opacity-0">{t('settings.tickets.dropZone')}</span>
      )}
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
  const { t } = useTranslation();

  const [{ isDragging }, drag] = useDrag({
    type: 'field',
    item: { index, sectionId, fieldId: field?.id ?? '' },
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

  if (!field || !field.id) {
    return null;
  }

  const getFieldTypeLabel = (type: string) => {
    switch (type) {
      case 'text': return t('settings.tickets.fieldTypeText');
      case 'textarea': return t('settings.tickets.fieldTypeTextarea');
      case 'dropdown': return t('settings.tickets.fieldTypeDropdown');
      case 'multiple_choice': return t('settings.tickets.fieldTypeMultipleChoice');
      case 'checkbox': return t('settings.tickets.fieldTypeCheckbox');
      case 'file_upload': return t('settings.tickets.fieldTypeFileUpload');
      case 'checkboxes': return t('settings.tickets.fieldTypeCheckboxes');
      case 'description': return t('settings.tickets.fieldTypeDescription');
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
                  {t('settings.tickets.required')}
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
  onAddField: () => void;
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
  const { t } = useTranslation();
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
  const sectionFields = ticketForms[selectedTicketFormType as keyof TicketFormsConfiguration]?.fields
    ?.filter(field => field && field.id && field.sectionId === section.id)
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
                  {t('settings.tickets.hiddenByDefault')}
                </Badge>
              )}
            </div>
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
            {t('common.edit')}
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
          onClick={onAddField}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          {t('settings.tickets.addField')}
        </Button>
      </div>
    </div>
  );
};

// DraggableQuickResponseAction Component
interface DraggableQuickResponseActionProps {
  action: QuickResponseAction;
  index: number;
  categoryId: string;
  moveAction: (categoryId: string, dragIndex: number, hoverIndex: number) => void;
  onEdit: () => void;
  onDelete: () => void;
}

const DraggableQuickResponseAction = ({
  action,
  index,
  categoryId,
  moveAction,
  onEdit,
  onDelete
}: DraggableQuickResponseActionProps) => {
  const { t } = useTranslation();
  const [{ isDragging }, drag] = useDrag({
    type: 'quick-response-action',
    item: { index, categoryId },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [, drop] = useDrop({
    accept: 'quick-response-action',
    hover: (item: { index: number; categoryId: string }) => {
      if (item.categoryId === categoryId && item.index !== index) {
        moveAction(categoryId, item.index, index);
        item.index = index;
      }
    },
  });

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
              <h6 className="font-medium">{action.name}</h6>
              <div className="flex items-center space-x-1">
                {action.closeTicket && (
                  <Badge variant="secondary" className="text-xs">{t('settings.tickets.badgeClose')}</Badge>
                )}
                {action.showPunishment && (
                  <Badge variant="destructive" className="text-xs">{t('settings.tickets.badgePunish')}</Badge>
                )}
                {action.appealAction === 'pardon' && (
                  <Badge variant="secondary" className="text-xs">{t('settings.tickets.badgePardon')}</Badge>
                )}
                {action.appealAction === 'reduce' && (
                  <Badge variant="outline" className="text-xs">{t('settings.tickets.badgeReduce')}</Badge>
                )}
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {action.message}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onEdit}
          >
            {t('common.edit')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TicketSettings;
