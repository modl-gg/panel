import React, { useState, useEffect } from 'react';
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
  icon_color?: string;
  action_type: 'url' | 'category_dropdown';
  action_url?: string;
  action_button_text?: string;
  category_id?: string;
  background_color?: string;
  is_enabled: boolean;
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
  const [editingCard, setEditingCard] = useState<HomepageCard | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cardToDelete, setCardToDelete] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    icon: 'BookOpen',
    icon_color: '#3b82f6', // Default blue color
    action_type: 'url' as 'url' | 'category_dropdown',
    action_url: '',
    action_button_text: '',
    category_id: '',
    background_color: '',
    is_enabled: true
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
      toast({ title: 'Success', description: 'Homepage card created successfully.' });
      queryClient.invalidateQueries({ queryKey: ['homepageCards'] });
      resetForm();
      setIsCreating(false);
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
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
      toast({ title: 'Success', description: 'Homepage card updated successfully.' });
      queryClient.invalidateQueries({ queryKey: ['homepageCards'] });
      setEditingCard(null);
      setIsCreating(false);
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
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
      toast({ title: 'Success', description: 'Homepage card deleted successfully.' });
      queryClient.invalidateQueries({ queryKey: ['homepageCards'] });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      icon: 'BookOpen',
      icon_color: '#3b82f6',
      action_type: 'url',
      action_url: '',
      action_button_text: '',
      category_id: '',
      background_color: '',
      is_enabled: true
    });
  };

  const handleCreateCard = () => {
    if (!formData.title.trim() || !formData.description.trim()) {
      toast({ title: 'Error', description: 'Title and description are required.', variant: 'destructive' });
      return;
    }

    if (formData.action_type === 'url' && !formData.action_url.trim()) {
      toast({ title: 'Error', description: 'URL is required for URL actions.', variant: 'destructive' });
      return;
    }

    if (formData.action_type === 'category_dropdown' && !formData.category_id) {
      toast({ title: 'Error', description: 'Category is required for category dropdown actions.', variant: 'destructive' });
      return;
    }

    createCardMutation.mutate(formData);
  };

  const handleUpdateCard = () => {
    if (!editingCard) return;

    if (!formData.title.trim() || !formData.description.trim()) {
      toast({ title: 'Error', description: 'Title and description are required.', variant: 'destructive' });
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
      icon_color: card.icon_color || '#3b82f6',
      action_type: card.action_type,
      action_url: card.action_url || '',
      action_button_text: card.action_button_text || '',
      category_id: card.category_id || '',
      background_color: card.background_color || '',
      is_enabled: card.is_enabled
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
      <Card>
        <CardHeader>
          <CardTitle>Homepage Cards</CardTitle>
          <CardDescription>
            Customize the action cards displayed on your homepage. Choose between URL actions or category dropdowns.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isCreating ? (
            <Button onClick={() => setIsCreating(true)} className="w-full">
              <Plus className="mr-2 h-4 w-4" /> Add New Card
            </Button>
          ) : (
            <Card className="p-4 border-2 border-dashed">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      placeholder="Card title"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="icon">Icon</Label>
                    <Select value={formData.icon} onValueChange={(value) => setFormData({ ...formData, icon: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-48">
                        {availableIcons.map(iconName => (
                          <SelectItem key={iconName} value={iconName}>
                            <div className="flex items-center gap-2">
                              <IconPreview iconName={iconName} color={formData.icon_color} />
                              {iconName}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="icon_color">Icon Color</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      id="icon_color"
                      type="color"
                      value={formData.icon_color}
                      onChange={(e) => setFormData({ ...formData, icon_color: e.target.value })}
                      className="w-16 h-10 p-1 rounded cursor-pointer"
                    />
                    <Input
                      type="text"
                      placeholder="#3b82f6"
                      value={formData.icon_color}
                      onChange={(e) => setFormData({ ...formData, icon_color: e.target.value })}
                      className="flex-1"
                    />
                    <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-muted/30">
                      <IconPreview iconName={formData.icon} color={formData.icon_color} />
                      <span className="text-sm text-muted-foreground">Preview</span>
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Card description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="action_type">Action Type</Label>
                  <Select 
                    value={formData.action_type} 
                    onValueChange={(value: 'url' | 'category_dropdown') => setFormData({ ...formData, action_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="url">URL Action</SelectItem>
                      <SelectItem value="category_dropdown">Category Dropdown</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.action_type === 'url' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="action_url">URL</Label>
                      <Input
                        id="action_url"
                        placeholder="https://example.com or /internal-page"
                        value={formData.action_url}
                        onChange={(e) => setFormData({ ...formData, action_url: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="action_button_text">Button Text</Label>
                      <Input
                        id="action_button_text"
                        placeholder="Learn More"
                        value={formData.action_button_text}
                        onChange={(e) => setFormData({ ...formData, action_button_text: e.target.value })}
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="category_id">Category</Label>
                    <Select 
                      value={formData.category_id} 
                      onValueChange={(value) => setFormData({ ...formData, category_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a category" />
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
                    id="is_enabled"
                    checked={formData.is_enabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_enabled: checked })}
                  />
                  <Label htmlFor="is_enabled">Enabled</Label>
                </div>

                <div className="flex gap-2">
                  <Button 
                    onClick={editingCard ? handleUpdateCard : handleCreateCard}
                    disabled={createCardMutation.isPending || updateCardMutation.isPending}
                  >
                    {editingCard ? 'Update Card' : 'Create Card'}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setIsCreating(false);
                      setEditingCard(null);
                      resetForm();
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* List existing cards */}
          <div className="space-y-2">
            {isLoadingCards ? (
              <div className="text-center py-4">Loading cards...</div>
            ) : homepageCards?.length ? (
              homepageCards.map((card) => (
                <Card key={card.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
                      <IconPreview iconName={card.icon} color={card.icon_color} />
                      <div>
                        <h4 className="font-medium">{card.title}</h4>
                        <p className="text-sm text-muted-foreground">{card.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {card.action_type === 'url' ? `URL: ${card.action_url}` : `Category: ${card.category?.name}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {card.is_enabled ? (
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
                No homepage cards configured. Add your first card to get started.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Homepage Card</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this homepage card? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteCard} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default HomepageCardSettings;
