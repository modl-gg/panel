import React, { useState } from 'react';
import { Plus, Minus, GripVertical, Palette, Eye, Info, Trash2 } from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { Label } from '@modl-gg/shared-web/components/ui/label';
import { Textarea } from '@modl-gg/shared-web/components/ui/textarea';
import { Switch } from '@modl-gg/shared-web/components/ui/switch';
import { Separator } from '@modl-gg/shared-web/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@modl-gg/shared-web/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@modl-gg/shared-web/components/ui/tabs';

interface EmbedField {
  name: string;
  value: string;
  inline: boolean;
}

interface EmbedTemplate {
  title: string;
  description: string;
  color: string;
  fields: EmbedField[];
}

interface EmbedTemplateEditorProps {
  template: EmbedTemplate;
  templateType: 'newTickets' | 'newPunishments' | 'auditLogs';
  onChange: (template: EmbedTemplate) => void;
  disabled?: boolean;
}

const EmbedTemplateEditor: React.FC<EmbedTemplateEditorProps> = ({
  template,
  templateType,
  onChange,
  disabled = false
}) => {
  const [activeTab, setActiveTab] = useState('basic');

  const getAvailableVariables = () => {
    switch (templateType) {
      case 'newTickets':
        return ['id', 'type', 'title', 'priority', 'category', 'submittedBy'];
      case 'newPunishments':
        return ['id', 'playerName', 'type', 'severity', 'reason', 'duration', 'issuer', 'ticketId'];
      case 'auditLogs':
        return ['user', 'action', 'target', 'details'];
      default:
        return [];
    }
  };

  const getExampleValues = () => {
    switch (templateType) {
      case 'newTickets':
        return {
          id: 'SUPPORT-123456',
          type: 'support',
          title: 'Login Issues',
          priority: 'High',
          category: 'Technical',
          submittedBy: 'PlayerName'
        };
      case 'newPunishments':
        return {
          id: 'PUN-789012',
          playerName: 'Griefer123',
          type: 'Temporary Ban',
          severity: 'High',
          reason: 'Griefing other players',
          duration: '7 days',
          issuer: 'ModeratorName',
          ticketId: 'REPORT-456789'
        };
      case 'auditLogs':
        return {
          user: 'AdminName',
          action: 'Player Ban',
          target: 'PlayerName',
          details: 'Banned for 7 days'
        };
      default:
        return {};
    }
  };

  const replaceVariablesForPreview = (text: string) => {
    const examples = getExampleValues();
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return examples[key as keyof typeof examples] || match;
    });
  };

  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };

  const updateTemplate = (updates: Partial<EmbedTemplate>) => {
    onChange({ ...template, ...updates });
  };

  const addField = () => {
    const newField: EmbedField = { name: 'Field Name', value: '{{}}', inline: true };
    updateTemplate({ fields: [...template.fields, newField] });
  };

  const updateField = (index: number, updates: Partial<EmbedField>) => {
    const newFields = [...template.fields];
    newFields[index] = { ...newFields[index], ...updates };
    updateTemplate({ fields: newFields });
  };

  const removeField = (index: number) => {
    const newFields = template.fields.filter((_, i) => i !== index);
    updateTemplate({ fields: newFields });
  };

  const moveField = (fromIndex: number, toIndex: number) => {
    const newFields = [...template.fields];
    const [removed] = newFields.splice(fromIndex, 1);
    newFields.splice(toIndex, 0, removed);
    updateTemplate({ fields: newFields });
  };

  const VariableHelper = ({ onInsert }: { onInsert: (variable: string) => void }) => {
    const variables = getAvailableVariables();
    const examples = getExampleValues();

    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" disabled={disabled}>
            <Info className="h-3 w-3 mr-1" />
            Variables
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80">
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Available Variables</h4>
            <p className="text-xs text-muted-foreground">Click to insert into current field</p>
            <div className="grid gap-1">
              {variables.map(variable => (
                <Button
                  key={variable}
                  variant="ghost"
                  size="sm"
                  className="justify-start h-auto p-2"
                  onClick={() => onInsert(`{{${variable}}}`)}
                  disabled={disabled}
                >
                  <div className="flex flex-col items-start">
                    <Badge variant="secondary" className="text-xs mb-1">
                      {`{{${variable}}}`}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Example: {examples[variable as keyof typeof examples]}
                    </span>
                  </div>
                </Button>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  const ColorPicker = ({ value, onChange: onColorChange }: { value: string; onChange: (color: string) => void }) => {
    const presetColors = [
      '#3498db', // Blue
      '#e74c3c', // Red
      '#f39c12', // Orange
      '#2ecc71', // Green
      '#9b59b6', // Purple
      '#1abc9c', // Teal
      '#34495e', // Dark Gray
      '#e67e22', // Dark Orange
      '#e91e63', // Pink
      '#607d8b', // Blue Gray
    ];

    return (
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onColorChange(e.target.value)}
          disabled={disabled}
          className="w-8 h-8 rounded border border-border cursor-pointer disabled:cursor-not-allowed"
        />
        <Input
          value={value}
          onChange={(e) => onColorChange(e.target.value)}
          placeholder="#3498db"
          disabled={disabled}
          className="w-24"
        />
        <div className="flex gap-1">
          {presetColors.map(color => (
            <button
              key={color}
              type="button"
              className="w-6 h-6 rounded border border-border cursor-pointer hover:scale-110 transition-transform disabled:cursor-not-allowed"
              style={{ backgroundColor: color }}
              onClick={() => onColorChange(color)}
              disabled={disabled}
            />
          ))}
        </div>
      </div>
    );
  };

  const EmbedPreview = () => {
    const rgb = hexToRgb(template.color);
    const borderColor = rgb ? `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` : '#3498db';

    return (
      <div className="bg-[#2f3136] p-4 rounded-lg max-w-md mx-auto">
        <div className="bg-[#36393f] rounded-lg p-4 border-l-4 max-w-[432px]" style={{ borderLeftColor: borderColor }}>
          {template.title && (
            <div className="text-white font-semibold text-sm mb-1">
              {replaceVariablesForPreview(template.title)}
            </div>
          )}
          {template.description && (
            <div className="text-[#dcddde] text-sm mb-3">
              {replaceVariablesForPreview(template.description)}
            </div>
          )}
          {template.fields.length > 0 && (
            <div className="space-y-2">
              {(() => {
                const fields = template.fields;
                const result = [];
                let i = 0;
                
                while (i < fields.length) {
                  const currentField = fields[i];
                  
                  if (currentField.inline && i < fields.length - 1 && fields[i + 1].inline) {
                    // Two inline fields side by side
                    result.push(
                      <div key={`inline-row-${i}`} className="flex gap-4">
                        <div className="flex-1">
                          <div className="text-white font-medium text-xs mb-1">
                            {replaceVariablesForPreview(currentField.name)}
                          </div>
                          <div className="text-[#dcddde] text-xs">
                            {replaceVariablesForPreview(currentField.value)}
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="text-white font-medium text-xs mb-1">
                            {replaceVariablesForPreview(fields[i + 1].name)}
                          </div>
                          <div className="text-[#dcddde] text-xs">
                            {replaceVariablesForPreview(fields[i + 1].value)}
                          </div>
                        </div>
                      </div>
                    );
                    i += 2; // Skip next field as we've already processed it
                  } else if (currentField.inline && i < fields.length - 1 && fields[i + 1].inline && i < fields.length - 2 && fields[i + 2].inline) {
                    // Three inline fields in a row
                    result.push(
                      <div key={`inline-row-${i}`} className="flex gap-2">
                        <div className="flex-1">
                          <div className="text-white font-medium text-xs mb-1">
                            {replaceVariablesForPreview(currentField.name)}
                          </div>
                          <div className="text-[#dcddde] text-xs">
                            {replaceVariablesForPreview(currentField.value)}
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="text-white font-medium text-xs mb-1">
                            {replaceVariablesForPreview(fields[i + 1].name)}
                          </div>
                          <div className="text-[#dcddde] text-xs">
                            {replaceVariablesForPreview(fields[i + 1].value)}
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="text-white font-medium text-xs mb-1">
                            {replaceVariablesForPreview(fields[i + 2].name)}
                          </div>
                          <div className="text-[#dcddde] text-xs">
                            {replaceVariablesForPreview(fields[i + 2].value)}
                          </div>
                        </div>
                      </div>
                    );
                    i += 3; // Skip next two fields
                  } else {
                    // Single field (either non-inline or single inline)
                    result.push(
                      <div key={`field-${i}`} className={currentField.inline ? "flex-1" : "block"}>
                        <div className="text-white font-medium text-xs mb-1">
                          {replaceVariablesForPreview(currentField.name)}
                        </div>
                        <div className="text-[#dcddde] text-xs">
                          {replaceVariablesForPreview(currentField.value)}
                        </div>
                      </div>
                    );
                    i += 1;
                  }
                }
                
                return result;
              })()}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="basic">Basic Settings</TabsTrigger>
          <TabsTrigger value="fields">Fields</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Basic Embed Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Title */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor={`title-${templateType}`}>Embed Title</Label>
                  <VariableHelper onInsert={(variable) => {
                    updateTemplate({ title: template.title + variable });
                  }} />
                </div>
                <Input
                  id={`title-${templateType}`}
                  value={template.title}
                  onChange={(e) => updateTemplate({ title: e.target.value })}
                  placeholder="🎫 New Ticket Created"
                  disabled={disabled}
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor={`description-${templateType}`}>Description</Label>
                  <VariableHelper onInsert={(variable) => {
                    updateTemplate({ description: template.description + variable });
                  }} />
                </div>
                <Textarea
                  id={`description-${templateType}`}
                  value={template.description}
                  onChange={(e) => updateTemplate({ description: e.target.value })}
                  placeholder="A new **{{type}}** ticket has been submitted."
                  rows={3}
                  disabled={disabled}
                />
              </div>

              {/* Color */}
              <div className="space-y-2">
                <Label>Embed Color</Label>
                <ColorPicker
                  value={template.color}
                  onChange={(color) => updateTemplate({ color })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fields" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Embed Fields</CardTitle>
              <Button onClick={addField} size="sm" disabled={disabled}>
                <Plus className="h-4 w-4 mr-1" />
                Add Field
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {template.fields.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No fields configured. Add a field to get started.
                </div>
              ) : (
                template.fields.map((field, index) => (
                  <Card key={index} className="border-muted">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                          <span className="font-medium">Field {index + 1}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center space-x-2">
                            <Switch
                              id={`inline-${index}`}
                              checked={field.inline}
                              onCheckedChange={(checked) => updateField(index, { inline: checked })}
                              disabled={disabled}
                            />
                            <Label htmlFor={`inline-${index}`} className="text-sm">Inline</Label>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeField(index)}
                            disabled={disabled}
                            className="h-8 w-8 p-0 ml-2"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Label>Field Name</Label>
                          <VariableHelper onInsert={(variable) => {
                            updateField(index, { name: field.name + variable });
                          }} />
                        </div>
                        <Input
                          value={field.name}
                          onChange={(e) => updateField(index, { name: e.target.value })}
                          placeholder="Ticket ID"
                          disabled={disabled}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Label>Field Value</Label>
                          <VariableHelper onInsert={(variable) => {
                            updateField(index, { value: field.value + variable });
                          }} />
                        </div>
                        <Input
                          value={field.value}
                          onChange={(e) => updateField(index, { value: e.target.value })}
                          placeholder="#{{id}}"
                          disabled={disabled}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Live Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EmbedPreview />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default EmbedTemplateEditor;