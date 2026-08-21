import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Crown, Plus } from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Label } from '@modl-gg/shared-web/components/ui/label';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import { Switch } from '@modl-gg/shared-web/components/ui/switch';
import { Textarea } from '@modl-gg/shared-web/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@modl-gg/shared-web/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@modl-gg/shared-web/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@modl-gg/shared-web/components/ui/alert-dialog';
import { StatusBanner } from '@modl-gg/shared-web/components/ui/status-banner';
import type { PunishmentType } from '@modl-gg/proto/modl/v1/settings_pb.ts';
import { useServerPremium } from '@/hooks/data/server';

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

interface TicketAiModerationSettingsProps {
  aiModerationSettings: AIModerationSettings;
  setAiModerationSettings: (value: AIModerationSettings | ((prev: AIModerationSettings) => AIModerationSettings)) => void;
  punishmentTypes: PunishmentType[];
}

const TicketAiModerationSettings = ({
  aiModerationSettings,
  setAiModerationSettings,
  punishmentTypes,
}: TicketAiModerationSettingsProps) => {
  const { t } = useTranslation();
  const isPremium = useServerPremium();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editedConfig, setEditedConfig] = useState<AIPunishmentConfig | null>(null);
  const [configPendingRemoval, setConfigPendingRemoval] = useState<{ id: string; name: string } | null>(null);

  if (isPremium === false) {
    return (
      <StatusBanner
        variant="warning"
        icon={<Crown className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
        title={t('settings.tickets.premiumFeature')}
      >
        {t('settings.tickets.aiModerationPremiumDesc')}
      </StatusBanner>
    );
  }

  return (
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
                          onClick={() => setEditedConfig(config)}
                        >
                          {t('common.edit')}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setConfigPendingRemoval({ id: config.id, name: config.name || 'Unknown' })}
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
                onClick={() => setIsAddDialogOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                {t('settings.tickets.addPunishmentType')}
              </Button>
            </div>
          </>
        )}
      </div>

      {isAddDialogOpen && (
        <AddAIPunishmentDialog
          punishmentTypes={punishmentTypes}
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
            setIsAddDialogOpen(false);
          }}
          onClose={() => setIsAddDialogOpen(false)}
        />
      )}

      <AlertDialog open={configPendingRemoval !== null} onOpenChange={(open) => { if (!open) setConfigPendingRemoval(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.tickets.removeAIPunishmentTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.tickets.removeAIPunishmentConfirm', { name: configPendingRemoval?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (configPendingRemoval) {
                  setAiModerationSettings((prev) => {
                    const remaining = { ...prev.aiPunishmentConfigs };
                    delete remaining[configPendingRemoval.id];
                    return { ...prev, aiPunishmentConfigs: remaining };
                  });
                }
                setConfigPendingRemoval(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editedConfig && (
        <EditAIPunishmentDialog
          config={editedConfig}
          onSave={(aiDescription) => {
            setAiModerationSettings((prev) => ({
              ...prev,
              aiPunishmentConfigs: {
                ...prev.aiPunishmentConfigs,
                [editedConfig.id]: {
                  ...(prev.aiPunishmentConfigs[editedConfig.id] ?? editedConfig),
                  aiDescription
                }
              }
            }));
            setEditedConfig(null);
          }}
          onClose={() => setEditedConfig(null)}
        />
      )}
    </div>
  );
};

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

export default TicketAiModerationSettings;
