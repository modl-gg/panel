import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@modl-gg/shared-web/components/ui/card';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { Textarea } from '@modl-gg/shared-web/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@modl-gg/shared-web/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@modl-gg/shared-web/components/ui/alert-dialog';
import { useToast } from '@modl-gg/shared-web/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { apiFetch } from '@/lib/api';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Plus, Edit, Trash2, GripVertical, Eye, EyeOff } from 'lucide-react';
import { Switch } from '@modl-gg/shared-web/components/ui/switch';
import { Label } from '@modl-gg/shared-web/components/ui/label';
import * as LucideIcons from 'lucide-react';

// Get list of curated icons suitable for homepage cards
const getAvailableIcons = () => {
  return [
    // Common actions
    'Shield', 'UserPlus', 'MessageCircle', 'Mail', 'Phone', 'Scale',
    'Users', 'User', 'UserCheck', 'UserX', 'Crown', 'Award',
    
    // Content & knowledge
    'BookOpen', 'Book', 'FileText', 'File', 'ScrollText', 'Newspaper',
    'Library', 'GraduationCap', 'HelpCircle', 'Info', 'AlertCircle',
    
    // Navigation & links
    'ExternalLink', 'Link', 'ArrowRight', 'ChevronRight', 'Home',
    'Search', 'Eye', 'Download', 'Upload', 'Share',
    
    // Communication
    'MessageSquare', 'Send', 'Inbox', 'Bell', 'Megaphone',
    'Radio', 'Headphones', 'Mic', 'Video', 'Calendar',
    
    // Games & servers
    'Gamepad2', 'Zap', 'Server', 'Globe', 'Wifi', 'Signal',
    'Activity', 'BarChart', 'TrendingUp', 'Target', 'Trophy',
    
    // Settings & tools
    'Settings', 'Tool', 'Wrench', 'Cog', 'Sliders', 'Filter',
    'Lock', 'Unlock', 'Key', 'ShieldCheck', 'ShieldAlert',
    
    // Actions & status
    'Plus', 'Minus', 'Check', 'X', 'AlertTriangle', 'CheckCircle',
    'XCircle', 'Clock', 'Timer', 'Pause', 'Play', 'Stop',
    
    // Commerce & misc
    'CreditCard', 'DollarSign', 'Gift', 'Star', 'Heart', 'ThumbsUp',
    'Flag', 'Map', 'Compass', 'Navigation', 'Bookmark', 'Tag'
  ].sort();
};

interface HomepageCard {
  id: string;
  title: string;
  description: string;
  icon: string;
  iconColor?: string;
  actionType: 'url' | 'category_dropdown';
  actionUrl?: string;
  actionButtonText?: string;
  categoryId?: string;
  backgroundColor?: string;
  isEnabled: boolean;
  ordinal: number;
  category?: {
    id: string;
    name: string;
    slug: string;
    description?: string;
  };
}

interface KnowledgebaseCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  ordinal: number;
}

const fetchHomepageCards = async (): Promise<HomepageCard[]> => {
  const { getApiUrl, getCurrentDomain } = await import('@/lib/api');
  const response = await fetch(getApiUrl('/v1/panel/homepage-cards'), {
    credentials: 'include',
    headers: { 'X-Server-Domain': getCurrentDomain() }
  });
  if (!response.ok) {
    throw new Error('Failed to fetch homepage cards');
  }
  return response.json();
};

const fetchCategories = async (): Promise<KnowledgebaseCategory[]> => {
  const { getApiUrl, getCurrentDomain } = await import('@/lib/api');
  const response = await fetch(getApiUrl('/v1/panel/knowledgebase/categories'), {
    credentials: 'include',
    headers: { 'X-Server-Domain': getCurrentDomain() }
  });
  if (!response.ok) {
    throw new Error('Failed to fetch categories');
  }
  return response.json();
};

const HomepageCardSettings: React.FC = () => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [editingCard, setEditingCard] = useState<HomepageCard | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cardToDelete, setCardToDelete] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    icon: 'BookOpen',
    iconColor: '#3b82f6', // Default blue color
    actionType: 'url' as 'url' | 'category_dropdown',
    actionUrl: '',
    actionButtonText: '',
    categoryId: '',
    backgroundColor: '',
    isEnabled: true
  });

  const availableIcons = getAvailableIcons();

  const { data: homepageCards, isLoading: isLoadingCards } = useQuery<HomepageCard[]>({
    queryKey: ['homepageCards'],
    queryFn: fetchHomepageCards,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: categories } = useQuery<KnowledgebaseCategory[]>({
    queryKey: ['knowledgebaseCategories'],
    queryFn: fetchCategories,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const createCardMutation = useMutation<HomepageCard, Error, Partial<HomepageCard>>({
    mutationFn: async (newCard) => {
      const csrfFetch = apiFetch;
      const response = await csrfFetch('/v1/panel/homepage-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCard),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to create card' }));
        throw new Error(errorData.message);
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: t('toast.success'), description: t('settings.homepage.cardCreated') });
      queryClient.invalidateQueries({ queryKey: ['homepageCards'] });
      resetForm();
      setIsCreating(false);
    },
    onError: (error) => {
      toast({ title: t('toast.error'), description: error.message, variant: 'destructive' });
    },
  });

  const updateCardMutation = useMutation<HomepageCard, Error, { id: string } & Partial<HomepageCard>>({
    mutationFn: async (updatedCard) => {
      const { id, ...updateData } = updatedCard;
      const csrfFetch = apiFetch;
      const response = await csrfFetch(`/v1/panel/homepage-cards/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to update card' }));
        throw new Error(errorData.message);
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: t('toast.success'), description: t('settings.homepage.cardUpdated') });
      queryClient.invalidateQueries({ queryKey: ['homepageCards'] });
      setEditingCard(null);
      setIsCreating(false);
    },
    onError: (error) => {
      toast({ title: t('toast.error'), description: error.message, variant: 'destructive' });
    },
  });

  const deleteCardMutation = useMutation<void, Error, string>({
    mutationFn: async (cardId) => {
      const csrfFetch = apiFetch;
      const response = await csrfFetch(`/v1/panel/homepage-cards/${cardId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to delete card' }));
        throw new Error(errorData.message);
      }
    },
    onSuccess: () => {
      toast({ title: t('toast.success'), description: t('settings.homepage.cardDeleted') });
      queryClient.invalidateQueries({ queryKey: ['homepageCards'] });
    },
    onError: (error) => {
      toast({ title: t('toast.error'), description: error.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      icon: 'BookOpen',
      iconColor: '#3b82f6',
      actionType: 'url',
      actionUrl: '',
      actionButtonText: '',
      categoryId: '',
      backgroundColor: '',
      isEnabled: true
    });
  };

  const handleCreateCard = () => {
    if (!formData.title.trim() || !formData.description.trim()) {
      toast({ title: t('toast.error'), description: t('settings.homepage.titleDescRequired'), variant: 'destructive' });
      return;
    }

    if (formData.actionType === 'url' && !formData.actionUrl.trim()) {
      toast({ title: t('toast.error'), description: t('settings.homepage.urlRequired'), variant: 'destructive' });
      return;
    }

    if (formData.actionType === 'category_dropdown' && !formData.categoryId) {
      toast({ title: t('toast.error'), description: t('settings.homepage.categoryRequired'), variant: 'destructive' });
      return;
    }

    createCardMutation.mutate(formData);
  };

  const handleUpdateCard = () => {
    if (!editingCard) return;

    if (!formData.title.trim() || !formData.description.trim()) {
      toast({ title: t('toast.error'), description: t('settings.homepage.titleDescRequired'), variant: 'destructive' });
      return;
    }

    updateCardMutation.mutate({ id: editingCard.id, ...formData });
  };

  const handleEditCard = (card: HomepageCard) => {
    setEditingCard(card);
    setFormData({
      title: card.title,
      description: card.description,
      icon: card.icon,
      iconColor: card.iconColor || '#3b82f6',
      actionType: card.actionType,
      actionUrl: card.actionUrl || '',
      actionButtonText: card.actionButtonText || '',
      categoryId: card.categoryId || '',
      backgroundColor: card.backgroundColor || '',
      isEnabled: card.isEnabled
    });
    setIsCreating(true);
  };

  const handleDeleteCard = (cardId: string) => {
    setCardToDelete(cardId);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteCard = () => {
    if (cardToDelete) {
      deleteCardMutation.mutate(cardToDelete);
    }
    setDeleteDialogOpen(false);
    setCardToDelete(null);
  };

  const IconPreview = ({ iconName, color }: { iconName: string; color?: string }) => {
    const IconComponent = (LucideIcons as any)[iconName] || LucideIcons.BookOpen;
    return <IconComponent className="h-5 w-5" style={{ color: color || 'currentColor' }} />;
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-card shadow-card">
        <CardHeader>
          <CardTitle>{t('settings.homepage.title')}</CardTitle>
          <CardDescription>
            {t('settings.homepage.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!isCreating ? (
            <Button onClick={() => setIsCreating(true)} className="w-full">
              <Plus className="mr-2 h-4 w-4" /> {t('settings.homepage.addNewCard')}
            </Button>
          ) : (
            <Card className="p-4 border-2 border-dashed rounded-card shadow-card-inner bg-surface-2">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="title">{t('settings.homepage.cardTitle')}</Label>
                    <Input
                      id="title"
                      placeholder={t('settings.homepage.cardTitlePlaceholder')}
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="icon">{t('settings.homepage.icon')}</Label>
                    <Select value={formData.icon} onValueChange={(value) => setFormData({ ...formData, icon: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-48">
                        {availableIcons.map(iconName => (
                          <SelectItem key={iconName} value={iconName}>
                            <div className="flex items-center gap-2">
                              <IconPreview iconName={iconName} color={formData.iconColor} />
                              {iconName}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="iconColor">{t('settings.homepage.iconColor')}</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      id="iconColor"
                      type="color"
                      value={formData.iconColor}
                      onChange={(e) => setFormData({ ...formData, iconColor: e.target.value })}
                      className="w-16 h-10 p-1 rounded cursor-pointer"
                    />
                    <Input
                      type="text"
                      placeholder="#3b82f6"
                      value={formData.iconColor}
                      onChange={(e) => setFormData({ ...formData, iconColor: e.target.value })}
                      className="flex-1"
                    />
                    <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-muted/30">
                      <IconPreview iconName={formData.icon} color={formData.iconColor} />
                      <span className="text-sm text-muted-foreground">{t('common.preview')}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor="description">{t('settings.homepage.cardDescription')}</Label>
                  <Textarea
                    id="description"
                    placeholder={t('settings.homepage.cardDescriptionPlaceholder')}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="actionType">{t('settings.homepage.actionType')}</Label>
                  <Select 
                    value={formData.actionType} 
                    onValueChange={(value: 'url' | 'category_dropdown') => setFormData({ ...formData, actionType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="url">{t('settings.homepage.urlAction')}</SelectItem>
                      <SelectItem value="category_dropdown">{t('settings.homepage.categoryDropdown')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.actionType === 'url' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="actionUrl">{t('settings.homepage.url')}</Label>
                      <Input
                        id="actionUrl"
                        placeholder="https://example.com or /internal-page"
                        value={formData.actionUrl}
                        onChange={(e) => setFormData({ ...formData, actionUrl: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="actionButtonText">{t('settings.homepage.buttonText')}</Label>
                      <Input
                        id="actionButtonText"
                        placeholder={t('settings.homepage.buttonTextPlaceholder')}
                        value={formData.actionButtonText}
                        onChange={(e) => setFormData({ ...formData, actionButtonText: e.target.value })}
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="categoryId">{t('settings.homepage.category')}</Label>
                    <Select
                      value={formData.categoryId}
                      onValueChange={(value) => setFormData({ ...formData, categoryId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('settings.homepage.selectCategory')} />
                      </SelectTrigger>
                      <SelectContent>
                        {categories?.map(category => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <Switch
                    id="isEnabled"
                    checked={formData.isEnabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, isEnabled: checked })}
                  />
                  <Label htmlFor="isEnabled">{t('common.enabled')}</Label>
                </div>

                <div className="flex gap-2">
                  <Button 
                    onClick={editingCard ? handleUpdateCard : handleCreateCard}
                    disabled={createCardMutation.isPending || updateCardMutation.isPending}
                  >
                    {editingCard ? t('settings.homepage.updateCard') : t('settings.homepage.createCard')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsCreating(false);
                      setEditingCard(null);
                      resetForm();
                    }}
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* List existing cards */}
          <div className="space-y-2">
            {isLoadingCards ? (
              <div className="text-center py-4">{t('settings.homepage.loadingCards')}</div>
            ) : homepageCards?.length ? (
              homepageCards.map((card) => (
                <Card key={card.id} className="p-4 rounded-card shadow-card-inner bg-surface-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
                      <IconPreview iconName={card.icon} color={card.iconColor} />
                      <div>
                        <h4 className="font-medium">{card.title}</h4>
                        <p className="text-sm text-muted-foreground">{card.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {card.actionType === 'url' ? `URL: ${card.actionUrl}` : `${t('settings.homepage.category')}: ${card.category?.name}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {card.isEnabled ? (
                        <Eye className="h-4 w-4 text-green-600" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditCard(card)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteCard(card.id)}
                        disabled={deleteCardMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                {t('settings.homepage.noCards')}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.homepage.deleteCardTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.homepage.deleteCardConfirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteCard} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default HomepageCardSettings;

