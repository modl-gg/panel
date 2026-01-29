import React, { useState, useEffect } from 'react';
import { MessageCircle, Tag, Plus, X, ChevronDown, ChevronRight, Layers, Shield, Edit3, Trash2, GripVertical, Save, CheckCircle, Settings, Crown } from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { Textarea } from '@modl-gg/shared-web/components/ui/textarea';
import { Label } from '@modl-gg/shared-web/components/ui/label';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import { Switch } from '@modl-gg/shared-web/components/ui/switch';
import { Slider } from '@modl-gg/shared-web/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@modl-gg/shared-web/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@modl-gg/shared-web/components/ui/collapsible';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Card, CardContent, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';
import { Separator } from '@modl-gg/shared-web/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@modl-gg/shared-web/components/ui/dialog';
import { QuickResponseAction, QuickResponseCategory, QuickResponsesConfiguration, defaultQuickResponsesConfig } from '@/types/quickResponses';
import { useBillingStatus } from '@/hooks/use-data';
import { useAuth } from '@/hooks/use-auth';

// Import the types we need for the form builder
interface TicketFormField {
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

interface TicketFormSection {
  id: string;
  title: string;
  description?: string;
  order: number;
  showIfFieldId?: string;
  showIfValue?: string;
  showIfValues?: string[];
  hideByDefault?: boolean;
}

interface TicketFormSettings {
  fields: TicketFormField[];
  sections: TicketFormSection[];
}

interface TicketFormsConfiguration {
  bug: TicketFormSettings;
  support: TicketFormSettings;
  application: TicketFormSettings;
}

interface TicketSettingsProps {
  // Quick Responses State
  quickResponsesState: QuickResponsesConfiguration;
  setQuickResponsesState: (value: QuickResponsesConfiguration) => void;
  
  // Tag Management State
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
  aiModerationSettings: any;
  setAiModerationSettings: (value: any) => void;
  punishmentTypesState: any[];

  // Optional callbacks that may be passed from parent
  onEditSection?: (section: TicketFormSection) => void;
  onDeleteSection?: (sectionId: string) => void;
  onEditField?: (field: TicketFormField) => void;
  onDeleteField?: (fieldId: string) => void;
  onAddField?: () => void;
  moveField?: (dragIndex: number, hoverIndex: number, sectionId: string) => void;
  moveFieldBetweenSections?: (fieldId: string, fromSectionId: string, toSectionId: string, targetIndex?: number) => void;
}

const TicketSettings = ({
  quickResponsesState,
  setQuickResponsesState,
  bugReportTags,
  setBugReportTags,
  playerReportTags,
  setPlayerReportTags,
  appealTags,
  setAppealTags,
  newBugTag,
  setNewBugTag,
  newPlayerTag,
  setNewPlayerTag,
  newAppealTag,
  setNewAppealTag,
  ticketForms,
  setTicketForms,
  selectedTicketFormType,
  setSelectedTicketFormType,
  aiModerationSettings,
  setAiModerationSettings,
  punishmentTypesState,
  // Optional props with defaults
  onEditSection,
  onDeleteSection,
  onEditField,
  onDeleteField,
  onAddField,
  moveField,
  moveFieldBetweenSections
}: TicketSettingsProps) => {
  // User authentication and role information
  const { user: currentUser } = useAuth();
  
  // Billing status for premium gating
  const { data: billingStatus } = useBillingStatus();
  
  // Check if user has premium access
  const isPremiumUser = () => {
    if (!billingStatus) return false;
    const { subscriptionStatus, currentPeriodEnd, plan } = billingStatus;
    
    // For cancelled subscriptions, check if the period has ended
    if (subscriptionStatus === 'canceled') {
      if (!currentPeriodEnd) return false;
      const endDate = new Date(currentPeriodEnd);
      const now = new Date();
      return endDate > now && plan === 'premium';
    }
    
    // Active, trialing, or payment issues within period
    return (['active', 'trialing'].includes(subscriptionStatus) && plan === 'premium') ||
           (['past_due', 'unpaid', 'incomplete'].includes(subscriptionStatus) && plan === 'premium' && 
            currentPeriodEnd && new Date(currentPeriodEnd) > new Date());
  };

  // Collapsible state
  const [isQuickResponsesExpanded, setIsQuickResponsesExpanded] = useState(false);
  const [isTagManagementExpanded, setIsTagManagementExpanded] = useState(false);
  const [isTicketFormsExpanded, setIsTicketFormsExpanded] = useState(false);
  const [isAIModerationExpanded, setIsAIModerationExpanded] = useState(false);

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
  const [newTicketFormFieldGoToSection, setNewTicketFormFieldGoToSection] = useState('');
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
  const [selectedAIPunishmentType, setSelectedAIPunishmentType] = useState<any | null>(null);
  const [selectedPunishmentTypeId, setSelectedPunishmentTypeId] = useState<number | null>(null);
  const [newAIPunishmentDescription, setNewAIPunishmentDescription] = useState('');

  // Ticket form management functions
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
      setTicketForms(prev => ({
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
    console.log('addTicketFormSection called with:', newTicketFormSectionTitle);
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
            section.id === selectedTicketFormSection.id ? { ...newSection, id: selectedTicketFormSection.id } : section
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
  const defaultMoveFieldBetweenSections = React.useCallback((fieldId: string, fromSectionId: string, toSectionId: string, targetIndex?: number) => {
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

  // AI Moderation computed values
  const availablePunishmentTypes = punishmentTypesState?.filter(pt => 
    pt.isCustomizable && (!aiModerationSettings.aiPunishmentConfigs?.[pt.id] || !aiModerationSettings.aiPunishmentConfigs[pt.id].enabled)
  ) || [];

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

  return (
    <div className="space-y-6 p-6">
      <div>
        <h3 className="text-lg font-medium mb-4">Ticket Settings</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Configure ticket tags, quick responses, and form settings.
        </p>

        <div className="space-y-6">
          {/* Quick Responses Section */}
          <Collapsible open={isQuickResponsesExpanded} onOpenChange={setIsQuickResponsesExpanded}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors">
              <div className="flex items-center">
                <MessageCircle className="h-4 w-4 mr-2" />
                <h4 className="text-base font-medium">Quick Responses</h4>
              </div>
              <div className="flex items-center space-x-2">
                {!isQuickResponsesExpanded && (
                  <span className="text-sm text-muted-foreground">
                    {quickResponsesState?.categories?.length || 0} categories configured
                  </span>
                )}
                {isQuickResponsesExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </div>
            </CollapsibleTrigger>
            
            <CollapsibleContent className="pt-4">
              <div className="border rounded-lg p-4">
                <DndProvider backend={HTML5Backend}>
                  <p className="text-sm text-muted-foreground mb-6">
                    Configure pre-written responses for different ticket categories and actions.
                  </p>
                  
                  <div className="space-y-6">
                  {quickResponsesState?.categories?.length > 0 ? quickResponsesState.categories.map((category) => (
                    <Card key={category.id} className="border-l-4 border-l-blue-500">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-base">{category.name}</CardTitle>
                            <p className="text-sm text-muted-foreground mt-1">
                              {category.ticketTypes.join(', ')} • {category.actions.length} actions
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
                              const updatedConfig = {
                                ...quickResponsesState,
                                categories: quickResponsesState.categories.map(cat => 
                                  cat.id === category.id
                                    ? { ...cat, actions: cat.actions.filter(a => a.id !== action.id) }
                                    : cat
                                )
                              };
                              setQuickResponsesState(updatedConfig);
                            }}
                          />
                        ))}
                        {category.actions.length === 0 && (
                          <div className="text-center py-6 text-muted-foreground">
                            <p className="text-sm">No quick responses configured</p>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="mt-2"
                              onClick={() => {
                                setSelectedCategoryId(category.id);
                                setEditingAction(null);
                                setShowActionDialog(true);
                              }}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Add First Response
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <p className="text-sm">Loading quick response configuration...</p>
                    </div>
                  )}
                  </div>
                </DndProvider>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Tag Management Section */}
          <Collapsible open={isTagManagementExpanded} onOpenChange={setIsTagManagementExpanded}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors">
              <div className="flex items-center">
                <Tag className="h-4 w-4 mr-2" />
                <h4 className="text-base font-medium">Tag Management</h4>
              </div>
              <div className="flex items-center space-x-2">
                {!isTagManagementExpanded && (
                  <span className="text-sm text-muted-foreground">
                    {bugReportTags.length + playerReportTags.length + appealTags.length} tags configured
                  </span>
                )}
                {isTagManagementExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </div>
            </CollapsibleTrigger>
            
            <CollapsibleContent className="pt-4">
              <div className="border rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-6">
                  Customize tags for different ticket categories. These tags will appear as options when staff respond to tickets.
                </p>

                <div className="space-y-8">
                  {/* Bug Report Tags */}
                  <div className="space-y-3">
                    <h4 className="text-base font-medium">Bug Report Tags</h4>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {bugReportTags.map((tag, index) => (
                        <Badge key={index} variant="outline" className="py-1.5 pl-3 pr-2 flex items-center gap-1 bg-background">
                          {tag}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4 rounded-full hover:bg-muted ml-1"
                            onClick={() => {
                              setBugReportTags(bugReportTags.filter((_, i) => i !== index));
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2 items-center">
                      <Input
                        placeholder="New tag name"
                        className="max-w-xs"
                        value={newBugTag}
                        onChange={(e) => setNewBugTag(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newBugTag.trim()) {
                            setBugReportTags([...bugReportTags, newBugTag.trim()]);
                            setNewBugTag('');
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          if (newBugTag.trim()) {
                            setBugReportTags([...bugReportTags, newBugTag.trim()]);
                            setNewBugTag('');
                          }
                        }}
                        disabled={!newBugTag.trim()}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Tag
                      </Button>
                    </div>
                  </div>

                  {/* Player Report Tags */}
                  <div className="space-y-3">
                    <h4 className="text-base font-medium">Player Report Tags</h4>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {playerReportTags.map((tag, index) => (
                        <Badge key={index} variant="outline" className="py-1.5 pl-3 pr-2 flex items-center gap-1 bg-background">
                          {tag}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4 rounded-full hover:bg-muted ml-1"
                            onClick={() => {
                              setPlayerReportTags(playerReportTags.filter((_, i) => i !== index));
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2 items-center">
                      <Input
                        placeholder="New tag name"
                        className="max-w-xs"
                        value={newPlayerTag}
                        onChange={(e) => setNewPlayerTag(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newPlayerTag.trim()) {
                            setPlayerReportTags([...playerReportTags, newPlayerTag.trim()]);
                            setNewPlayerTag('');
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          if (newPlayerTag.trim()) {
                            setPlayerReportTags([...playerReportTags, newPlayerTag.trim()]);
                            setNewPlayerTag('');
                          }
                        }}
                        disabled={!newPlayerTag.trim()}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Tag
                      </Button>
                    </div>
                  </div>

                  {/* Appeal Tags */}
                  <div className="space-y-3">
                    <h4 className="text-base font-medium">Appeal Tags</h4>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {appealTags.map((tag, index) => (
                        <Badge key={index} variant="outline" className="py-1.5 pl-3 pr-2 flex items-center gap-1 bg-background">
                          {tag}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4 rounded-full hover:bg-muted ml-1"
                            onClick={() => {
                              setAppealTags(appealTags.filter((_, i) => i !== index));
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2 items-center">
                      <Input
                        placeholder="New tag name"
                        className="max-w-xs"
                        value={newAppealTag}
                        onChange={(e) => setNewAppealTag(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newAppealTag.trim()) {
                            setAppealTags([...appealTags, newAppealTag.trim()]);
                            setNewAppealTag('');
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          if (newAppealTag.trim()) {
                            setAppealTags([...appealTags, newAppealTag.trim()]);
                            setNewAppealTag('');
                          }
                        }}
                        disabled={!newAppealTag.trim()}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Tag
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Ticket Form Configuration Section */}
          <Collapsible open={isTicketFormsExpanded} onOpenChange={setIsTicketFormsExpanded}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors">
              <div className="flex items-center">
                <Layers className="h-4 w-4 mr-2" />
                <h4 className="text-base font-medium">Ticket Form Configuration</h4>
              </div>
              <div className="flex items-center space-x-2">
                {!isTicketFormsExpanded && (
                  <span className="text-sm text-muted-foreground">
                    {Object.entries(ticketForms || {}).reduce((acc, [, form]) => acc + (form && typeof form === 'object' && 'sections' in form && Array.isArray(form.sections) ? form.sections.length : 0), 0)} sections across {Object.keys(ticketForms || {}).length} forms
                  </span>
                )}
                {isTicketFormsExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </div>
            </CollapsibleTrigger>
            
            <CollapsibleContent className="pt-4">
              <div className="border rounded-lg p-4">
                <DndProvider backend={HTML5Backend}>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Configure custom forms for bug reports, support requests, and applications. These forms will be used when players submit tickets.
                    </p>

                    {/* Form Type Selector */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Form Type</Label>
                      <div className="flex gap-2">
                        <Button
                          variant={selectedTicketFormType === 'bug' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setSelectedTicketFormType('bug')}
                        >
                          Bug Report
                        </Button>
                        <Button
                          variant={selectedTicketFormType === 'support' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setSelectedTicketFormType('support')}
                        >
                          Support Request
                        </Button>
                        <Button
                          variant={selectedTicketFormType === 'application' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setSelectedTicketFormType('application')}
                        >
                          Staff Application
                        </Button>
                      </div>
                    </div>

                    {/* Form Sections */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h5 className="text-sm font-medium">
                          {selectedTicketFormType === 'bug' && 'Bug Report Form Structure'}
                          {selectedTicketFormType === 'support' && 'Support Request Form Structure'}
                          {selectedTicketFormType === 'application' && 'Application Form Structure'}
                        </h5>
                        <Button
                          size="sm"
                          onClick={() => setIsAddTicketFormSectionDialogOpen(true)}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Create Section
                        </Button>
                      </div>

                      {/* Section List with nested fields */}
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
                              onDeleteSection={removeTicketFormSection}
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
                                setIsAddTicketFormFieldDialogOpen(true);
                              }}
                              onDeleteField={removeTicketFormField}
                              onAddField={() => {
                                // Clear all field form state for new field
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
                              moveFieldBetweenSections={moveFieldBetweenSections}
                            />
                          ))}

                        {(!ticketForms[selectedTicketFormType]?.sections || ticketForms[selectedTicketFormType]?.sections?.length === 0) && (
                          <div className="text-center py-12 text-muted-foreground border-2 border-dashed border-muted rounded-lg">
                            <Layers className="h-8 w-8 mx-auto mb-3 opacity-50" />
                            <p className="text-sm font-medium">No sections configured</p>
                            <p className="text-xs mt-1 mb-3">Create sections to organize your form fields</p>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setIsAddTicketFormSectionDialogOpen(true)}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Create First Section
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </DndProvider>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* AI Moderation Settings Section */}
          <Collapsible open={isAIModerationExpanded} onOpenChange={isPremiumUser() ? setIsAIModerationExpanded : undefined}>
            <CollapsibleTrigger className={`flex items-center justify-between w-full p-4 bg-muted/50 rounded-lg transition-colors ${isPremiumUser() ? 'hover:bg-muted/70' : 'cursor-not-allowed opacity-60'}`}>
              <div className="flex items-center">
                <Shield className="h-4 w-4 mr-2" />
                <h4 className="text-base font-medium">AI Moderation Settings</h4>
                {!isPremiumUser() && (
                  <Badge variant="secondary" className="ml-2 bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100">
                    <Crown className="h-3 w-3 mr-1" />
                    Premium
                  </Badge>
                )}
              </div>
              <div className="flex items-center space-x-2">
                {!isAIModerationExpanded && isPremiumUser() && (
                  <span className="text-sm text-muted-foreground">
                    {aiModerationSettings.enableAutomatedActions ? 'Automated' : 'Manual'} • {aiModerationSettings.strictnessLevel}
                  </span>
                )}
                {!isPremiumUser() && (
                  <span className="text-sm text-muted-foreground">Premium Required</span>
                )}
                {isPremiumUser() && (isAIModerationExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                ))}
              </div>
            </CollapsibleTrigger>
            
            <CollapsibleContent className="pt-4">
              <div className={`border rounded-lg p-4 ${!isPremiumUser() ? 'opacity-60 pointer-events-none' : ''}`}>
                {!isPremiumUser() ? (
                  <div className="text-center py-8">
                    <Crown className="h-12 w-12 mx-auto mb-4 text-orange-500" />
                    <h3 className="text-lg font-medium mb-2">Premium Feature</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      AI moderation is available for Premium subscribers only. Upgrade to access AI-powered chat analysis, automated moderation, and intelligent punishment suggestions.
                    </p>
                    <Button variant="default" className="bg-orange-600 hover:bg-orange-700">
                      <Crown className="h-4 w-4 mr-2" />
                      Upgrade to Premium
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Configure how the AI analyzes and moderates chat reports. AI suggestions can help staff make faster, more consistent decisions.
                    </p>

                    <div className="space-y-6">
                      {/* Enable AI Review Toggle */}
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <Label htmlFor="enable-ai-review" className="text-sm font-medium">
                            Enable AI Review
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Enable AI-powered analysis and moderation of chat reports. When disabled, all AI features are turned off.
                          </p>
                        </div>
                        <Switch
                          id="enable-ai-review"
                          checked={aiModerationSettings.enableAIReview !== false}
                          onCheckedChange={(checked) => {
                            setAiModerationSettings((prev: any) => ({
                              ...prev,
                              enableAIReview: checked
                            }));
                          }}
                        />
                      </div>

                      {/* AI Settings Content - Disabled when AI Review is off */}
                      <div className={`space-y-6 ${aiModerationSettings.enableAIReview === false ? 'opacity-50 pointer-events-none' : ''}`}>
                        {/* Enable Automated Actions Toggle */}
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <Label htmlFor="enable-automated-actions" className="text-sm font-medium">
                              Enable Automated Actions
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              When enabled, the AI will automatically apply suggested punishments for clear violations. When disabled, the AI will only provide suggestions for staff review.
                            </p>
                          </div>
                          <Switch
                            id="enable-automated-actions"
                            checked={aiModerationSettings.enableAutomatedActions}
                            onCheckedChange={(checked) => {
                              setAiModerationSettings((prev: any) => ({
                                ...prev,
                                enableAutomatedActions: checked
                              }));
                            }}
                          />
                        </div>

                        {/* Strictness Level */}
                        <div className="space-y-3">
                          <Label className="text-sm font-medium">AI Strictness Level</Label>
                          <Select
                            value={aiModerationSettings.strictnessLevel}
                            onValueChange={(value) => {
                              setAiModerationSettings((prev: any) => ({
                                ...prev,
                                strictnessLevel: value
                              }));
                            }}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select strictness level" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="lenient">Lenient - Only flagrant violations</SelectItem>
                              <SelectItem value="standard">Standard - Balanced approach</SelectItem>
                              <SelectItem value="strict">Strict - Zero tolerance policy</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            Controls how sensitive the AI is to rule violations. Higher strictness means more actions will be flagged.
                          </p>
                        </div>

                        {/* AI Punishment Types Management Section */}
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-base font-medium">AI Punishment Types</h4>
                              <p className="text-sm text-muted-foreground">
                                Manage which punishment types the AI can reference when analyzing reports. Only enabled punishment types will be available to the AI moderation system.
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedPunishmentTypeId(null);
                                setNewAIPunishmentDescription('');
                                setIsAddAIPunishmentDialogOpen(true);
                              }}
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Add Type
                            </Button>
                          </div>

                          <div className="space-y-4">
                            {/* Current AI Punishment Types */}
                            <div className="space-y-3">
                        {Object.values(aiModerationSettings.aiPunishmentConfigs || {}).map((punishmentType: any) => (
                          <div key={punishmentType.id} className="flex items-start justify-between p-4 border rounded-lg bg-card">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-3">
                                <Switch
                                  checked={punishmentType.enabled}
                                  onCheckedChange={(checked) => {
                                    setAiModerationSettings((prev: any) => ({
                                      ...prev,
                                      aiPunishmentConfigs: {
                                        ...prev.aiPunishmentConfigs,
                                        [punishmentType.id]: {
                                          ...punishmentType,
                                          enabled: checked
                                        }
                                      }
                                    }));
                                  }}
                                />
                                <div>
                                  <h5 className="font-medium">{punishmentType.name}</h5>
                                </div>
                              </div>
                              <p className="text-sm text-muted-foreground ml-10">
                                {punishmentType.aiDescription}
                              </p>
                            </div>
                            <div className="flex gap-2 ml-4">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedAIPunishmentType(punishmentType);
                                  setNewAIPunishmentDescription(punishmentType.aiDescription);
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => {
                                  setAiModerationSettings((prev: any) => {
                                    const newConfigs = { ...prev.aiPunishmentConfigs };
                                    delete newConfigs[punishmentType.id];
                                    return { ...prev, aiPunishmentConfigs: newConfigs };
                                  });
                                }}
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        ))}

                              {Object.keys(aiModerationSettings.aiPunishmentConfigs || {}).length === 0 && (
                                <div className="text-center py-8 text-muted-foreground">
                                  <p className="text-sm">No AI punishment types configured.</p>
                                  <p className="text-xs">Add punishment types for the AI to reference when analyzing reports.</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      {/* Add AI Punishment Type Dialog */}
      {isAddAIPunishmentDialogOpen && (
        <Dialog open={isAddAIPunishmentDialogOpen} onOpenChange={setIsAddAIPunishmentDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Enable AI Punishment Type</DialogTitle>
              <DialogDescription>
                {selectedPunishmentTypeId ? (() => {
                  const selectedType = punishmentTypesState.find(t => t.id === selectedPunishmentTypeId);
                  return selectedType ? `Configure AI description for "${selectedType.name}" punishment type.` : 'Configure AI description for the selected punishment type.';
                })() : 'Select a punishment type to enable for AI analysis.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Show selected punishment type details */}
              {selectedPunishmentTypeId && (() => {
                const selectedType = punishmentTypesState.find(t => t.id === selectedPunishmentTypeId);
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

              {/* Punishment Type Selection */}
              {!selectedPunishmentTypeId && (
                <div className="space-y-2">
                  <Label>Select Punishment Type</Label>
                  <Select value={selectedPunishmentTypeId?.toString() || ''} onValueChange={(value) => setSelectedPunishmentTypeId(parseInt(value))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a punishment type..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-60 overflow-y-auto">
                      {punishmentTypesState
                        .filter(pt => !Object.values(aiModerationSettings.aiPunishmentConfigs || {}).some((config: any) => config.name === pt.name))
                        .map((punishmentType) => (
                          <SelectItem key={punishmentType.id} value={punishmentType.id.toString()}>
                            {punishmentType.name} ({punishmentType.category})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* AI Description */}
              {selectedPunishmentTypeId && (
                <div className="space-y-2">
                  <Label htmlFor="ai-punishment-desc">AI Description</Label>
                  <Textarea
                    id="ai-punishment-desc"
                    className="min-h-[100px]"
                    placeholder="Describe when this punishment type should be used. Be specific about the behaviors or violations it covers."
                    value={newAIPunishmentDescription}
                    onChange={(e) => setNewAIPunishmentDescription(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    This description helps the AI understand when to suggest this punishment type.
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsAddAIPunishmentDialogOpen(false);
                  setSelectedPunishmentTypeId(null);
                  setNewAIPunishmentDescription('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (selectedPunishmentTypeId && newAIPunishmentDescription.trim()) {
                    const selectedType = punishmentTypesState.find(t => t.id === selectedPunishmentTypeId);
                    if (selectedType) {
                      const newId = Date.now().toString();
                      setAiModerationSettings((prev: any) => ({
                        ...prev,
                        aiPunishmentConfigs: {
                          ...prev.aiPunishmentConfigs,
                          [newId]: {
                            id: newId,
                            name: selectedType.name,
                            aiDescription: newAIPunishmentDescription.trim(),
                            enabled: true
                          }
                        }
                      }));
                    }
                    setIsAddAIPunishmentDialogOpen(false);
                    setSelectedPunishmentTypeId(null);
                    setNewAIPunishmentDescription('');
                  }
                }}
                disabled={!selectedPunishmentTypeId || !newAIPunishmentDescription.trim()}
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
                Modify the AI description for "{selectedAIPunishmentType.name}" punishment type.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Show punishment type details */}
              <div className="bg-muted/30 p-3 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="font-medium">{selectedAIPunishmentType.name}</h5>
                  </div>
                </div>
              </div>

              {/* AI Description */}
              <div className="space-y-2">
                <Label htmlFor="edit-ai-punishment-desc">AI Description</Label>
                <Textarea
                  id="edit-ai-punishment-desc"
                  className="min-h-[100px]"
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
                  setSelectedAIPunishmentType(null);
                  setNewAIPunishmentDescription('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (selectedAIPunishmentType && newAIPunishmentDescription.trim()) {
                    setAiModerationSettings((prev: any) => ({
                      ...prev,
                      aiPunishmentConfigs: {
                        ...prev.aiPunishmentConfigs,
                        [selectedAIPunishmentType.id]: {
                          ...selectedAIPunishmentType,
                          aiDescription: newAIPunishmentDescription.trim()
                        }
                      }
                    }));
                    setSelectedAIPunishmentType(null);
                    setNewAIPunishmentDescription('');
                  }
                }}
                disabled={!newAIPunishmentDescription.trim()}
              >
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Quick Response Action Dialog */}
      <Dialog open={showActionDialog} onOpenChange={setShowActionDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingAction ? 'Edit Quick Response' : 'Add Quick Response'}
            </DialogTitle>
            <DialogDescription>
              Configure a quick response action with optional punishment or appeal handling.
            </DialogDescription>
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
            <DialogTitle>
              {editingCategory ? 'Edit Category' : 'Add Category'}
            </DialogTitle>
            <DialogDescription>
              Configure category settings and ticket type associations.
            </DialogDescription>
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

      {/* Add/Edit Ticket Form Field Dialog */}
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
              <Select value={newTicketFormFieldType} onValueChange={(value: 'text' | 'textarea' | 'dropdown' | 'multiple_choice' | 'checkbox' | 'file_upload' | 'checkboxes' | 'description') => setNewTicketFormFieldType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="description">Description (Display Only)</SelectItem>
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

            {/* Required Toggle - Hide for description fields */}
            {newTicketFormFieldType !== 'description' && (
              <div className="flex items-center space-x-2">
                <Switch
                  id="field-required"
                  checked={newTicketFormFieldRequired}
                  onCheckedChange={setNewTicketFormFieldRequired}
                />
                <Label htmlFor="field-required">Required Field</Label>
              </div>
            )}

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
                  {ticketForms[selectedTicketFormType as keyof TicketFormsConfiguration]?.sections
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
                            value={newTicketFormFieldOptionSectionMapping[option] || ''}
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
                              {ticketForms[selectedTicketFormType as keyof TicketFormsConfiguration]?.sections
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

      {/* Add Section Dialog */}
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

            {/* Hide by Default Option */}
            <div className="flex items-center space-x-2">
              <Switch
                id="hide-by-default"
                checked={newTicketFormSectionHideByDefault}
                onCheckedChange={setNewTicketFormSectionHideByDefault}
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
                setIsAddTicketFormSectionDialogOpen(false);
                setSelectedTicketFormSection(null);
                setNewTicketFormSectionTitle('');
                setNewTicketFormSectionDescription('');
                setNewTicketFormSectionHideByDefault(false);
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
    </div>
  );
};

// Quick Response Action Form Component
const QuickResponseActionForm = ({ 
  action, 
  categoryId, 
  quickResponsesState, 
  setQuickResponsesState, 
  punishmentTypes, 
  onSave, 
  onCancel 
}: {
  action: QuickResponseAction | null;
  categoryId: string | null;
  quickResponsesState: QuickResponsesConfiguration;
  setQuickResponsesState: (value: QuickResponsesConfiguration) => void;
  punishmentTypes: any[];
  onSave: () => void;
  onCancel: () => void;
}) => {
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
          <Label htmlFor="action-name">Action Name</Label>
          <Input
            id="action-name"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            placeholder="e.g., Accept & Punish"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="action-message">Response Message</Label>
          <Textarea
            id="action-message"
            value={formData.message}
            onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
            placeholder="Enter the message that will be sent to the user..."
            className="min-h-[100px]"
          />
        </div>

        <div className="space-y-4">
          <Separator />
          <h4 className="font-medium">Action Settings</h4>
          
          <div className="flex items-center space-x-2">
            <Switch
              id="close-ticket"
              checked={formData.closeTicket}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, closeTicket: checked }))}
            />
            <Label htmlFor="close-ticket">Close ticket when this response is used</Label>
          </div>
        </div>

        {/* Punishment Settings - Only for Player/Chat Reports */}
        {isReportCategory && (
          <div className="space-y-4">
            <Separator />
            <h4 className="font-medium">Punishment Settings</h4>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="show-punishment"
                checked={formData.showPunishment || false}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, showPunishment: checked }))}
              />
              <Label htmlFor="show-punishment">Show punishment interface when this response is used</Label>
            </div>
            
            <p className="text-sm text-muted-foreground">
              When enabled, staff will see the punishment interface when using this response, allowing them to apply punishments with full flexibility.
            </p>
          </div>
        )}

        {isAppealCategory && (
          <div className="space-y-4">
            <Separator />
            <h4 className="font-medium">Appeal Action</h4>
            
            <div className="space-y-2">
              <Label>Appeal Decision</Label>
              <Select
                value={formData.appealAction}
                onValueChange={(value: 'pardon' | 'reduce' | 'reject' | 'none') => setFormData(prev => ({ ...prev, appealAction: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No automatic action</SelectItem>
                  <SelectItem value="pardon">Pardon (remove punishment)</SelectItem>
                  <SelectItem value="reduce">Reduce punishment duration</SelectItem>
                  <SelectItem value="reject">Reject appeal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.appealAction === 'reduce' && (
              <div className="space-y-2 pl-6">
                <p className="text-sm text-muted-foreground">
                  Duration reduction will be handled through the ticket form when this response is used.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={!formData.name || !formData.message}>
          <Save className="h-4 w-4 mr-2" />
          Save Response
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
          <Label htmlFor="category-name">Category Name</Label>
          <Input
            id="category-name"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            placeholder="e.g., Report Actions"
          />
        </div>

        <div className="space-y-2">
          <Label>Ticket Types</Label>
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
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={!formData.name || formData.ticketTypes.length === 0}>
          <Save className="h-4 w-4 mr-2" />
          Save Category
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
  // Add null check for field
  if (!field || !field.id) {
    return null;
  }
  
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
      case 'description': return 'Description';
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
                  Hidden by default
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
          onClick={onAddField}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Field
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
                  <Badge variant="secondary" className="text-xs">Close</Badge>
                )}
                {action.showPunishment && (
                  <Badge variant="destructive" className="text-xs">Punish</Badge>
                )}
                {action.appealAction === 'pardon' && (
                  <Badge variant="secondary" className="text-xs">Pardon</Badge>
                )}
                {action.appealAction === 'reduce' && (
                  <Badge variant="outline" className="text-xs">Reduce</Badge>
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
            Edit
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