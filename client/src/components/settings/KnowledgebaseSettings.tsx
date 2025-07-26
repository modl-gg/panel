import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@modl-gg/shared-web/components/ui/card';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { Textarea } from '@modl-gg/shared-web/components/ui/textarea';
import { useToast } from '@modl-gg/shared-web/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Plus, Edit, Trash2, GripVertical, Eye, EyeOff, ArrowUpDown } from 'lucide-react';
import { DndProvider, useDrag, useDrop, DropTargetMonitor } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import ArticleListItem, { ItemTypes as ArticleItemTypes } from './ArticleListItem';
import MarkdownEditor from '@modl-gg/shared-web/components/ui/MarkdownEditor';
import { KnowledgebaseCategory, KnowledgebaseArticle } from '@modl-gg/shared-web/types';
// For now, we'll mock dnd as it's a larger setup.
// Consider using a library like @dnd-kit/core for a more modern approach if not already in use.

// TODO: Define these types based on your backend schema

const fetchCategories = async (): Promise<KnowledgebaseCategory[]> => {
  const response = await fetch('/api/panel/knowledgebase/categories');
  if (!response.ok) {
    throw new Error('Failed to fetch categories');
  }
  return response.json();
};
const ItemTypes = {
  CATEGORY: 'category',
  ARTICLE: 'article',
};

interface CategoryItemProps {
  category: KnowledgebaseCategory;
  index: number;
  moveCategory: (dragIndex: number, hoverIndex: number) => void;
  onEdit: (category: KnowledgebaseCategory) => void;
  onDelete: (categoryId: string) => void;
  onAddArticle: (categoryId: string) => void;
  editingCategory: KnowledgebaseCategory | null;
  handleUpdateCategory: () => void;
  setEditingCategory: React.Dispatch<React.SetStateAction<KnowledgebaseCategory | null>>;
  updateCategoryMutation: any;
  deleteCategoryMutation: any;
  editingArticle: KnowledgebaseArticle | null;
  setEditingArticle: React.Dispatch<React.SetStateAction<KnowledgebaseArticle | null>>;
  handleUpdateArticle: () => void;
  handleDeleteArticle: (categoryId: string, articleId: string) => void;
  updateArticleMutation: any; // This should be specific to article update
  deleteArticleMutation: any;
  handleDropCategory: () => void;
  reorderArticlesMutation: any; // Add mutation for reordering articles
}

const CategoryItem: React.FC<CategoryItemProps> = ({
  category,
  index,
  moveCategory,
  onEdit,
  onDelete,
  onAddArticle,
  editingCategory,
  handleUpdateCategory,
  setEditingCategory,
  updateCategoryMutation,
  deleteCategoryMutation,
  editingArticle,
  setEditingArticle,
  handleUpdateArticle, // This is the global one for opening edit modal
  handleDeleteArticle, // This is the global one
  updateArticleMutation: uam, // This is the global update mutation
  deleteArticleMutation: dam, // This is the global delete mutation
  handleDropCategory,
  reorderArticlesMutation
}) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const [displayedCategoryArticles, setDisplayedCategoryArticles] = useState<KnowledgebaseArticle[]>([]);

  useEffect(() => {
    if (category.articles) {
      setDisplayedCategoryArticles(category.articles.sort((a,b) => a.ordinal - b.ordinal));
    }
  }, [category.articles]);

  const moveArticleInCategory = useCallback((categoryIdToUpdate: string, dragIndex: number, hoverIndex: number) => {
    if (categoryIdToUpdate !== category.id) return; // Ensure we are in the correct category context
    setDisplayedCategoryArticles((prevArticles) => {
      const updatedArticles = [...prevArticles];
      const [draggedItem] = updatedArticles.splice(dragIndex, 1);
      updatedArticles.splice(hoverIndex, 0, draggedItem);
      return updatedArticles;
    });
  }, [category.id]);

  const handleDropArticleInCategory = useCallback((categoryIdToUpdate: string) => {
    if (categoryIdToUpdate !== category.id) return;
    const orderedArticleIds = displayedCategoryArticles.map(art => art.id);
    reorderArticlesMutation.mutate({ categoryId: category.id, orderedArticleIds });
  }, [category.id, displayedCategoryArticles, reorderArticlesMutation]);

  const [{ handlerId }, drop] = useDrop<CategoryDragItem, void, { handlerId: any }>({
    accept: ItemTypes.CATEGORY,
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
      };
    },
    hover(item: CategoryDragItem, monitor: DropTargetMonitor) {
      if (!ref.current) return;
      const dragIndex = item.originalIndex;
      const hoverIndex = index;
      if (dragIndex === hoverIndex) return;
      moveCategory(dragIndex, hoverIndex);
      item.originalIndex = hoverIndex;
    },
  });

  const [{ isDragging }, drag, preview] = useDrag({
    type: ItemTypes.CATEGORY,
    item: () => ({ id: category.id, originalIndex: index, type: ItemTypes.CATEGORY }),
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    end: (item, monitor) => {
      // If the item was dropped on a compatible target (which it will be, even if it's its own spot after moving)
      // and the drop was not cancelled, then we persist the order.
      if (monitor.didDrop()) {
        handleDropCategory();
      }
    }
  });

  drop(drag(ref));

  // Extracted CategoryItem component's JSX
  return (
    <div ref={preview} style={{ opacity: isDragging ? 0.5 : 1 }} data-handler-id={handlerId}>
      <Card ref={ref} className="p-3 mb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center flex-1">
            <GripVertical className="mr-2 h-5 w-5 text-muted-foreground cursor-grab" />
            {editingCategory?.id === category.id ? (
              <div className="flex-1 space-y-2">
                <Input
                  type="text"
                  value={editingCategory.name}
                  onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                  placeholder="Category name"
                  className="h-8"
                  autoFocus
                />
                <Input
                  type="text"
                  value={editingCategory.description || ''}
                  onChange={(e) => setEditingCategory({ ...editingCategory, description: e.target.value })}
                  placeholder="Category description (optional)"
                  className="h-8"
                />
              </div>
            ) : (
              <div className="flex-1 cursor-pointer hover:bg-muted/50 p-2 rounded" onClick={() => onEdit(category)}>
                <div className="font-medium">{category.name}</div>
                {category.description && (
                  <div className="text-sm text-muted-foreground">{category.description}</div>
                )}
              </div>
            )}
          </div>
          <div className="space-x-2">
            {editingCategory?.id === category.id ? (
              <>
                <Button size="sm" onClick={handleUpdateCategory} disabled={updateCategoryMutation.isPending}>Save</Button>
                <Button variant="ghost" size="sm" onClick={() => setEditingCategory(null)}>Cancel</Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => onEdit(category)}><Edit className="h-4 w-4" /></Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => onDelete(category.id)} disabled={deleteCategoryMutation.isPending}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        </div>
        <div className="mt-4 pl-6 space-y-3">
          <h4 className="font-semibold text-sm">Articles in "{category.name}"</h4>
          <div className="space-y-1"> {/* Wrapper for consistent spacing */}
            {(displayedCategoryArticles || []).map((article, articleIndex) => (
              <ArticleListItem
                key={article.id}
                article={article}
                index={articleIndex}
                categoryId={category.id}
                moveArticle={moveArticleInCategory}
                onEdit={(art) => setEditingArticle({...art, categoryId: category.id})} // Uses setEditingArticle from CategoryItem props
                onDelete={handleDeleteArticle} // Uses handleDeleteArticle from CategoryItem props
                onDropArticle={handleDropArticleInCategory}
              />
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="mt-3" // Adjusted margin for consistency
            onClick={() => onAddArticle(category.id)}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Article
          </Button>
        </div>
      </Card>
    </div>
  );
};

const KnowledgebaseSettings: React.FC = () => {
  const { toast } = useToast();
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  // editingCategory state is now part of KnowledgebaseSettings
  const [editingArticle, setEditingArticle] = useState<KnowledgebaseArticle | null>(null);
  // const [selectedCategoryForNewArticle, setSelectedCategoryForNewArticle] = useState<string | null>(null); // Replaced by newArticleForModal
  const [newArticleForModal, setNewArticleForModal] = useState<{ categoryId: string; title: string; content: string; is_visible: boolean } | null>(null);


  const { data: categories, isLoading: isLoadingCategories, refetch: refetchCategories } = useQuery<KnowledgebaseCategory[], Error>({
    queryKey: ['knowledgebaseCategories'],
    queryFn: fetchCategories,
    // Keep data fresh but don't refetch too often during D&D
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  // Mutations (using React Query's useMutation)
  const createCategoryMutation = useMutation<KnowledgebaseCategory, Error, { name: string; description?: string }>({
    mutationFn: async (newCategory) => {
      const { csrfFetch } = await import('@/utils/csrf');
      const response = await csrfFetch('/api/panel/knowledgebase/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCategory),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to create category' }));
        throw new Error(errorData.message);
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'Category created successfully.' });
      queryClient.invalidateQueries({ queryKey: ['knowledgebaseCategories'] });
      setNewCategoryName('');
      setNewCategoryDescription('');
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateCategoryMutation = useMutation<KnowledgebaseCategory, Error, { id: string; name: string; description?: string }>({
    mutationFn: async (updatedCategory) => {
      const { csrfFetch } = await import('@/utils/csrf');
      const response = await csrfFetch(`/api/panel/knowledgebase/categories/${updatedCategory.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: updatedCategory.name, description: updatedCategory.description }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to update category' }));
        throw new Error(errorData.message);
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'Category updated successfully.' });
      queryClient.invalidateQueries({ queryKey: ['knowledgebaseCategories'] });
      setEditingCategoryState(null); // Use renamed state setter
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteCategoryMutation = useMutation<void, Error, string>({
    mutationFn: async (categoryId) => {
      const { csrfFetch } = await import('@/utils/csrf');
      const response = await csrfFetch(`/api/panel/knowledgebase/categories/${categoryId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to delete category' }));
        throw new Error(errorData.message);
      }
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'Category deleted successfully.' });
      queryClient.invalidateQueries({ queryKey: ['knowledgebaseCategories'] });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const reorderCategoriesMutation = useMutation<void, Error, { orderedCategoryIds: string[] }>({
    mutationFn: async (data) => {
      const { csrfFetch } = await import('@/utils/csrf');
      const response = await csrfFetch('/api/panel/knowledgebase/categories/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to reorder categories' }));
        throw new Error(errorData.message);
      }
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'Categories reordered successfully.' });
      queryClient.invalidateQueries({ queryKey: ['knowledgebaseCategories'] });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });


  // State for local optimistic updates during D&D
  const [displayedCategories, setDisplayedCategories] = useState<KnowledgebaseCategory[]>([]);
  const [editingCategoryState, setEditingCategoryState] = useState<KnowledgebaseCategory | null>(null); // Renamed to avoid conflict

  useEffect(() => {
    if (categories) {
      setDisplayedCategories(categories.sort((a, b) => a.ordinal - b.ordinal));
    }
  }, [categories]);


  const handleCreateCategory = () => {
    if (newCategoryName.trim()) {
      createCategoryMutation.mutate({ 
        name: newCategoryName.trim(),
        description: newCategoryDescription.trim() || undefined
      });
    }
  };
  const handleUpdateCategoryLocal = () => { // Renamed to avoid conflict with prop
    if (editingCategoryState && editingCategoryState.name.trim()) {
      updateCategoryMutation.mutate({ 
        id: editingCategoryState.id, 
        name: editingCategoryState.name.trim(),
        description: editingCategoryState.description?.trim() || undefined
      });
      // setEditingCategoryState(null); // Already handled in onSuccess of mutation
    }
  };

  const handleDeleteCategory = (categoryId: string) => {
    if (window.confirm('Are you sure you want to delete this category and all its articles?')) {
      deleteCategoryMutation.mutate(categoryId);
    }
  };

  const moveCategory = useCallback((dragIndex: number, hoverIndex: number) => {
    setDisplayedCategories((prevCategories) => {
      const updatedCategories = [...prevCategories];
      const [draggedItem] = updatedCategories.splice(dragIndex, 1);
      updatedCategories.splice(hoverIndex, 0, draggedItem);
      return updatedCategories;
    });
  }, []);

  const handleDropCategory = () => {
    // This function is called when a drag operation ends
    // To be called from useDrop's drop handler in CategoryItem or DndProvider
    const orderedCategoryIds = displayedCategories.map(cat => cat.id);
    reorderCategoriesMutation.mutate({ orderedCategoryIds });
  };


  // Article Mutations
  const createArticleMutation = useMutation<KnowledgebaseArticle, Error, { categoryId: string; title: string; content: string; is_visible?: boolean }>({
    mutationFn: async (newArticle) => {
      const { csrfFetch } = await import('@/utils/csrf');
      const response = await csrfFetch(`/api/panel/knowledgebase/categories/${newArticle.categoryId}/articles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newArticle.title, content: newArticle.content, is_visible: newArticle.is_visible }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to create article' }));
        throw new Error(errorData.message);
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'Article created successfully.' });
      queryClient.invalidateQueries({ queryKey: ['knowledgebaseCategories'] }); // Refetch categories to update articles list
      setEditingArticle(null); // Clear editing article if open
      setNewArticleForModal(null); // Clear new article form
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateArticleMutation = useMutation<KnowledgebaseArticle, Error, { categoryId: string; articleId: string; title: string; content: string; is_visible: boolean }>({
    mutationFn: async (updatedArticle) => {
      const { csrfFetch } = await import('@/utils/csrf');
      const response = await csrfFetch(`/api/panel/knowledgebase/categories/${updatedArticle.categoryId}/articles/${updatedArticle.articleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: updatedArticle.title, content: updatedArticle.content, is_visible: updatedArticle.is_visible }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to update article' }));
        throw new Error(errorData.message);
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'Article updated successfully.' });
      queryClient.invalidateQueries({ queryKey: ['knowledgebaseCategories'] });
      setEditingArticle(null);
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteArticleMutation = useMutation<void, Error, { categoryId: string; articleId: string }>({
    mutationFn: async ({ categoryId, articleId }) => {
      const { csrfFetch } = await import('@/utils/csrf');
      const response = await csrfFetch(`/api/panel/knowledgebase/categories/${categoryId}/articles/${articleId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to delete article' }));
        throw new Error(errorData.message);
      }
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'Article deleted successfully.' });
      queryClient.invalidateQueries({ queryKey: ['knowledgebaseCategories'] });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const reorderArticlesMutation = useMutation<void, Error, { categoryId: string; orderedArticleIds: string[] }>({
    mutationFn: async (data) => {
      const { csrfFetch } = await import('@/utils/csrf');
      const response = await csrfFetch(`/api/panel/knowledgebase/categories/${data.categoryId}/articles/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedArticleIds: data.orderedArticleIds }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to reorder articles' }));
        throw new Error(errorData.message);
      }
    },
    onSuccess: (data, variables) => {
      toast({ title: 'Success', description: `Articles in category reordered successfully.` });
      queryClient.invalidateQueries({ queryKey: ['knowledgebaseCategories'] });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });


  const openCreateArticleModal = (categoryId: string) => {
    setNewArticleForModal({ categoryId, title: '', content: '', is_visible: true });
    
    // Scroll to the article writing section with smooth animation
    setTimeout(() => {
      const articleFormElement = document.querySelector('[data-article-form="true"]');
      if (articleFormElement) {
        articleFormElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start',
          inline: 'nearest'
        });
      }
    }, 100); // Small delay to ensure the form is rendered
  };

  const handleCreateArticleFromModal = () => {
    if (newArticleForModal && newArticleForModal.title.trim() && newArticleForModal.content.trim()) {
      createArticleMutation.mutate({
        categoryId: newArticleForModal.categoryId,
        title: newArticleForModal.title,
        content: newArticleForModal.content,
        is_visible: newArticleForModal.is_visible,
      });
    } else {
      toast({ title: "Error", description: "Title and content are required.", variant: "destructive" });
    }
  };

  const handleUpdateArticle = () => {
    if (editingArticle && editingArticle.title.trim() && editingArticle.content.trim()) {
      updateArticleMutation.mutate({
        categoryId: editingArticle.categoryId,
        articleId: editingArticle.id,
        title: editingArticle.title,
        content: editingArticle.content,
        is_visible: editingArticle.is_visible,
      });
    }
  };

  const handleDeleteArticle = (categoryId: string, articleId: string) => {
    if (window.confirm('Are you sure you want to delete this article?')) {
      deleteArticleMutation.mutate({ categoryId, articleId });
    }
  };

  const onDragEndArticles = (categoryId: string, result: any /* DropResult */) => {
    // if (!result.destination) return;
    // const category = categories?.find(cat => cat.id === categoryId);
    // if (!category) return;
    // const items = Array.from(category.articles || []);
    // const [reorderedItem] = items.splice(result.source.index, 1);
    // items.splice(result.destination.index, 0, reorderedItem);
    // const orderedArticleIds = items.map(item => item.id);
    // reorderArticlesMutation.mutate({ categoryId, orderedArticleIds });
    toast({ title: "Drag & Drop", description: "Article drag & drop reordering is not yet implemented.", variant: "default" });
  };

  if (isLoadingCategories) {
    return <p>Loading knowledgebase settings...</p>;
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Manage Categories</CardTitle>
            <CardDescription>Create, edit, delete, and reorder knowledgebase categories.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex space-x-2">
                <Input
                  type="text"
                  placeholder="New category name"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="flex-grow"
                />
                <Button onClick={handleCreateCategory} disabled={createCategoryMutation.isPending}>
                  <Plus className="mr-2 h-4 w-4" /> Add Category
                </Button>
              </div>
              <Input
                type="text"
                placeholder="Category description (optional)"
                value={newCategoryDescription}
                onChange={(e) => setNewCategoryDescription(e.target.value)}
                className="w-full"
              />
            </div>

            {/* List Categories - Drag and Drop will be added here */}
            <div className="space-y-2">
              {(displayedCategories || []).map((category, index) => (
                <CategoryItem
                  key={category.id}
                  index={index}
                  category={category}
                  moveCategory={moveCategory}
                  onEdit={setEditingCategoryState}
                  onDelete={handleDeleteCategory}
                  onAddArticle={openCreateArticleModal}
                  editingCategory={editingCategoryState}
                  handleUpdateCategory={handleUpdateCategoryLocal}
                  setEditingCategory={setEditingCategoryState}
                  updateCategoryMutation={updateCategoryMutation}
                  deleteCategoryMutation={deleteCategoryMutation}
                  // Pass article related props
                  editingArticle={editingArticle}
                  setEditingArticle={setEditingArticle}
                  handleUpdateArticle={handleUpdateArticle}
                  handleDeleteArticle={handleDeleteArticle} // Global delete
                  updateArticleMutation={updateArticleMutation} // Global update for articles (modal)
                  deleteArticleMutation={deleteArticleMutation} // Global delete for articles
                  handleDropCategory={handleDropCategory}
                  reorderArticlesMutation={reorderArticlesMutation} // Pass down the reorder mutation
                />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Modals for editing/creating articles with Markdown editor */}
        {/* Edit Article Modal */}
        {editingArticle && !newArticleForModal && ( // Ensure only one modal is trying to render if states overlap by mistake
            <Card className="mt-6">
                <CardHeader>
                    <CardTitle>Edit Article: {editingArticle.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Input
                        placeholder="Article Title"
                        value={editingArticle.title}
                        onChange={(e) => setEditingArticle(prev => prev ? {...prev, title: e.target.value} : null)}
                    />
                    <MarkdownEditor
                        value={editingArticle.content}
                        onChange={(value) => setEditingArticle(prev => prev ? { ...prev, content: value } : null)}
                        placeholder="Article Content (Markdown)"
                    />
                    <div className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            id={`article-visible-${editingArticle.id}`}
                            checked={editingArticle.is_visible}
                            onChange={(e) => setEditingArticle(prev => prev ? {...prev, is_visible: e.target.checked} : null)}
                        />
                        <label htmlFor={`article-visible-${editingArticle.id}`}>Visible to users</label>
                    </div>
                    <div className="flex justify-end space-x-2">
                        <Button variant="outline" onClick={() => setEditingArticle(null)}>Cancel</Button>
                        <Button onClick={handleUpdateArticle} disabled={updateArticleMutation.isPending}>Save Article</Button>
                    </div>
                </CardContent>
            </Card>
        )}
        
        {/* Create Article Modal */}
        {newArticleForModal && (
          <Card className="mt-6" data-article-form="true">
            <CardHeader>
              <CardTitle>Create New Article</CardTitle>
              <CardDescription>In category: {categories?.find(c => c.id === newArticleForModal.categoryId)?.name || 'Unknown'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Article Title"
                value={newArticleForModal.title}
                onChange={(e) => setNewArticleForModal(prev => prev ? { ...prev, title: e.target.value } : null)}
              />
              <MarkdownEditor
                value={newArticleForModal.content}
                onChange={(value) => setNewArticleForModal(prev => prev ? { ...prev, content: value } : null)}
                placeholder="Article Content (Markdown)"
              />
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="new-article-visible"
                  checked={newArticleForModal.is_visible}
                  onChange={(e) => setNewArticleForModal(prev => prev ? { ...prev, is_visible: e.target.checked } : null)}
                />
                <label htmlFor="new-article-visible">Visible to users</label>
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setNewArticleForModal(null)}>Cancel</Button>
                <Button onClick={handleCreateArticleFromModal} disabled={createArticleMutation.isPending}>
                  {createArticleMutation.isPending ? "Creating..." : "Create Article"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

      </div>
    </DndProvider>
  );
};

export default KnowledgebaseSettings;