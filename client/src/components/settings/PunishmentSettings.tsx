import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GamepadIcon, MessageCircle, Lock, Plus, Trash2 } from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { Label } from '@modl-gg/shared-web/components/ui/label';
import { Separator } from '@modl-gg/shared-web/components/ui/separator';
import { Slider } from '@modl-gg/shared-web/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@modl-gg/shared-web/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@modl-gg/shared-web/components/ui/alert-dialog';

interface PunishmentType {
  id: number;
  name: string;
  category: string;
  isCustomizable: boolean;
  ordinal: number;
}

interface StatusThresholds {
  gameplay: {
    medium: number;
    habitual: number;
    pointExpiryMonths: number;
  };
  social: {
    medium: number;
    habitual: number;
    pointExpiryMonths: number;
  };
}

interface PunishmentSettingsProps {
  statusThresholds: StatusThresholds;
  setStatusThresholds: (value: StatusThresholds | ((prev: StatusThresholds) => StatusThresholds)) => void;
  punishmentTypes: PunishmentType[];
  newPunishmentName: string;
  setNewPunishmentName: (value: string) => void;
  newPunishmentCategory: 'Gameplay' | 'Social';
  setNewPunishmentCategory: (value: 'Gameplay' | 'Social') => void;
  addPunishmentType: () => void;
  removePunishmentType: (id: number) => void;
  setSelectedPunishment: (punishment: PunishmentType) => void;
  // Optional prop to show only a specific section
  // 'thresholds' | 'types' | undefined (show all)
  visibleSection?: string;
}

const PunishmentSettings = ({
  statusThresholds,
  setStatusThresholds,
  punishmentTypes,
  newPunishmentName,
  setNewPunishmentName,
  newPunishmentCategory,
  setNewPunishmentCategory,
  addPunishmentType,
  removePunishmentType,
  setSelectedPunishment,
  visibleSection
}: PunishmentSettingsProps) => {
  const { t } = useTranslation();
  const [showCorePunishments, setShowCorePunishments] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [punishmentToDelete, setPunishmentToDelete] = useState<PunishmentType | null>(null);

  const formatMonths = (months: number): string => {
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    if (years === 0) return `${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`;
    if (remainingMonths === 0) return `${years} year${years !== 1 ? 's' : ''}`;
    return `${years} year${years !== 1 ? 's' : ''} ${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`;
  };

  // Determine which sections to show
  const showThresholds = !visibleSection || visibleSection === 'thresholds';
  const showTypes = !visibleSection || visibleSection === 'types';

  const handleDeleteClick = (type: PunishmentType) => {
    setPunishmentToDelete(type);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (punishmentToDelete) {
      removePunishmentType(punishmentToDelete.id);
    }
    setDeleteDialogOpen(false);
    setPunishmentToDelete(null);
  };

  return (
    <div className="space-y-6 p-4">
      {/* Status Thresholds Section */}
      {showThresholds && (
      <div>
        <p className="text-sm text-muted-foreground mb-4">
          {t('settings.punishment.thresholdsDesc')}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="space-y-4 border rounded-md p-4">
            <h5 className="font-medium flex items-center">
              <GamepadIcon className="h-4 w-4 mr-2 text-amber-500" />
              {t('settings.punishment.gameplayThresholds')}
            </h5>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label htmlFor="gameplay-medium">{t('settings.punishment.mediumOffender')}</Label>
                  <span className="text-sm text-muted-foreground">{statusThresholds.gameplay.medium}+ {t('settings.punishment.points')}</span>
                </div>
                <Slider
                  id="gameplay-medium"
                  value={[statusThresholds.gameplay.medium]}
                  min={1}
                  max={20}
                  step={1}
                  onValueChange={values => setStatusThresholds(prev => ({
                    ...prev,
                    gameplay: {
                      ...prev.gameplay,
                      medium: values[0]
                    }
                  }))}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label htmlFor="gameplay-habitual">{t('settings.punishment.habitualOffender')}</Label>
                  <span className="text-sm text-muted-foreground">{statusThresholds.gameplay.habitual}+ {t('settings.punishment.points')}</span>
                </div>
                <Slider
                  id="gameplay-habitual"
                  value={[statusThresholds.gameplay.habitual]}
                  min={statusThresholds.gameplay.medium + 1}
                  max={30}
                  step={1}
                  onValueChange={values => setStatusThresholds(prev => ({
                    ...prev,
                    gameplay: {
                      ...prev.gameplay,
                      habitual: values[0]
                    }
                  }))}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label htmlFor="gameplay-point-expiry">{t('settings.punishment.pointExpiry')}</Label>
                  <span className="text-sm text-muted-foreground">{formatMonths(statusThresholds.gameplay.pointExpiryMonths)}</span>
                </div>
                <Slider
                  id="gameplay-point-expiry"
                  value={[statusThresholds.gameplay.pointExpiryMonths]}
                  min={1}
                  max={60}
                  step={1}
                  onValueChange={values => setStatusThresholds(prev => ({
                    ...prev,
                    gameplay: {
                      ...prev.gameplay,
                      pointExpiryMonths: values[0]
                    }
                  }))}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 border rounded-md p-4">
            <h5 className="font-medium flex items-center">
              <MessageCircle className="h-4 w-4 mr-2 text-blue-500" />
              {t('settings.punishment.socialThresholds')}
            </h5>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label htmlFor="social-medium">{t('settings.punishment.mediumOffender')}</Label>
                  <span className="text-sm text-muted-foreground">{statusThresholds.social.medium}+ {t('settings.punishment.points')}</span>
                </div>
                <Slider
                  id="social-medium"
                  value={[statusThresholds.social.medium]}
                  min={1}
                  max={20}
                  step={1}
                  onValueChange={values => setStatusThresholds(prev => ({
                    ...prev,
                    social: {
                      ...prev.social,
                      medium: values[0]
                    }
                  }))}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label htmlFor="social-habitual">{t('settings.punishment.habitualOffender')}</Label>
                  <span className="text-sm text-muted-foreground">{statusThresholds.social.habitual}+ {t('settings.punishment.points')}</span>
                </div>
                <Slider
                  id="social-habitual"
                  value={[statusThresholds.social.habitual]}
                  min={statusThresholds.social.medium + 1}
                  max={30}
                  step={1}
                  onValueChange={values => setStatusThresholds(prev => ({
                    ...prev,
                    social: {
                      ...prev.social,
                      habitual: values[0]
                    }
                  }))}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label htmlFor="social-point-expiry">{t('settings.punishment.pointExpiry')}</Label>
                  <span className="text-sm text-muted-foreground">{formatMonths(statusThresholds.social.pointExpiryMonths)}</span>
                </div>
                <Slider
                  id="social-point-expiry"
                  value={[statusThresholds.social.pointExpiryMonths]}
                  min={1}
                  max={60}
                  step={1}
                  onValueChange={values => setStatusThresholds(prev => ({
                    ...prev,
                    social: {
                      ...prev.social,
                      pointExpiryMonths: values[0]
                    }
                  }))}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {showThresholds && showTypes && <Separator />}

      {showTypes && (
      <div>
        <p className="text-sm text-muted-foreground mb-4">
          {t('settings.punishment.typesDesc')}
        </p>
        {/* Administrative Punishment Types Section (Ordinals 0-5) */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-base font-medium flex items-center">
              <Lock className="h-4 w-4 mr-2 text-gray-500" />
              {t('settings.punishment.coreAdminPunishments')}
            </h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCorePunishments(!showCorePunishments)}
              className="text-xs"
            >
              {showCorePunishments ? t('common.hide') : t('common.show')}
            </Button>
          </div>

          {showCorePunishments && (
            <div className="space-y-2 mb-6">
              {punishmentTypes
                .filter(pt => pt.ordinal >= 0 && pt.ordinal <= 5)
                .sort((a, b) => a.ordinal - b.ordinal)
                .map(type => (
                  <div key={type.id} className="flex items-center justify-between p-2 border rounded-md bg-card">
                    <div className="flex items-center">
                      <span className={`text-xs font-mono px-1.5 py-0.5 rounded mr-3 bg-primary/10 text-primary`}>
                        {type.ordinal}
                      </span>
                      <span>{type.name} ({type.category})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {type.ordinal !== 0 && type.ordinal !== 5 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedPunishment(type)}
                          className="text-xs px-2 h-7 text-muted-foreground"
                        >
                          {t('common.configure')}
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              }
            </div>
          )}

          {!showCorePunishments && (
            <div className="text-sm text-muted-foreground mb-6">
              {t('settings.punishment.coreAdminHint')}
            </div>
          )}
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="w-full md:w-1/2">
            <h4 className="text-base font-medium mb-3 flex items-center">
              <GamepadIcon className="h-4 w-4 mr-2 text-amber-500" />
              {t('settings.punishment.gameplayRelated')}
            </h4>
            <div className="space-y-2">
              {punishmentTypes
                .filter(pt => pt.category?.toLowerCase().trim() === 'gameplay' && pt.ordinal > 5)
                .sort((a, b) => a.ordinal - b.ordinal)
                .map(type => (
                  <div key={type.id} className="flex items-center justify-between p-2 border rounded-md bg-card hover:bg-accent/50">
                    <div className="flex items-center">
                      <span className={`text-xs font-mono px-1.5 py-0.5 rounded mr-3 bg-muted`}>
                        {type.ordinal}
                      </span>
                      <span>{type.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {type.isCustomizable && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedPunishment(type)}
                          className="text-xs px-2 h-7 text-muted-foreground"
                        >
                          {t('common.configure')}
                        </Button>
                      )}
                      {type.isCustomizable && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteClick(type)}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              }
            </div>
          </div>

          <div className="w-full md:w-1/2">
            <h4 className="text-base font-medium mb-3 flex items-center">
              <MessageCircle className="h-4 w-4 mr-2 text-blue-500" />
              {t('settings.punishment.socialRelated')}
            </h4>
            <div className="space-y-2">
              {punishmentTypes
                .filter(pt => pt.category?.toLowerCase().trim() === 'social' && pt.ordinal > 5)
                .sort((a, b) => a.ordinal - b.ordinal)
                .map(type => (
                  <div key={type.id} className="flex items-center justify-between p-2 border rounded-md bg-card hover:bg-accent/50">
                    <div className="flex items-center">
                      <span className={`text-xs font-mono px-1.5 py-0.5 rounded mr-3 bg-muted`}>
                        {type.ordinal}
                      </span>
                      <span>{type.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {type.isCustomizable && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedPunishment(type)}
                          className="text-xs px-2 h-7 text-muted-foreground"
                        >
                          {t('common.configure')}
                        </Button>
                      )}
                      {type.isCustomizable && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteClick(type)}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('settings.punishment.deletePunishmentType')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('settings.punishment.deletePunishmentTypeConfirm', { name: punishmentToDelete?.name })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {t('common.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Separator className="my-6" />

        <div className="space-y-4">
          <h4 className="text-base font-medium">{t('settings.punishment.addNewType')}</h4>
          <div className="flex gap-3 items-end">
            <div className="space-y-2 flex-grow">
              <Label htmlFor="punishment-name">{t('settings.punishment.punishmentName')}</Label>
              <Input
                id="punishment-name"
                placeholder={t('settings.punishment.punishmentNamePlaceholder')}
                value={newPunishmentName}
                onChange={(e) => setNewPunishmentName(e.target.value)}
              />
            </div>
            <div className="space-y-2 w-48">
              <Label htmlFor="punishment-category">{t('settings.punishment.category')}</Label>
              <Select
                value={newPunishmentCategory}
                onValueChange={(value) => setNewPunishmentCategory(value as 'Gameplay' | 'Social')}
              >
                <SelectTrigger id="punishment-category">
                  <SelectValue placeholder={t('settings.punishment.selectCategory')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Gameplay">{t('settings.punishment.categoryGameplay')}</SelectItem>
                  <SelectItem value="Social">{t('settings.punishment.categorySocial')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={addPunishmentType}
              disabled={!newPunishmentName.trim()}
            >
              <Plus className="h-4 w-4 mr-1" />
              {t('settings.punishment.addType')}
            </Button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};

export default PunishmentSettings;