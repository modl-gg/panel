import React, { useRef } from 'react';
import { useDrag, useDrop, DropTargetMonitor } from 'react-dnd';
import { Card } from '@modl-gg/shared-web/components/ui/card';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { GripVertical, Edit, Trash2, Eye, EyeOff } from 'lucide-react';
import { KnowledgebaseArticle } from '@modl-gg/shared-web/types';

export const ItemTypes = {
  ARTICLE: 'article',
  // CATEGORY: 'category', // If needed from here, but likely defined in parent
};

interface ArticleDragItem {
  id: string;
  originalIndex: number;
  categoryId: string;
  type: typeof ItemTypes.ARTICLE;
}

interface ArticleListItemProps {
  article: KnowledgebaseArticle;
  index: number;
  categoryId: string;
  moveArticle: (categoryId: string, dragIndex: number, hoverIndex: number) => void;
  onEdit: (article: KnowledgebaseArticle) => void;
  onDelete: (categoryId: string, articleId: string) => void;
  onDropArticle: (categoryId: string) => void; // To trigger save on drop
  // deleteArticleMutation: any; // If needed directly, or handled by parent
}

const ArticleListItem: React.FC<ArticleListItemProps> = ({
  article,
  index,
  categoryId,
  moveArticle,
  onEdit,
  onDelete,
  onDropArticle,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  const [{ handlerId }, drop] = useDrop<ArticleDragItem, void, { handlerId: any }>({
    accept: ItemTypes.ARTICLE,
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
      };
    },
    hover(item: ArticleDragItem, monitor: DropTargetMonitor) {
      if (!ref.current) return;
      // Ensure we are only reordering within the same category
      if (item.categoryId !== categoryId) return;

      const dragIndex = item.originalIndex;
      const hoverIndex = index;
      if (dragIndex === hoverIndex) return;

      // Determine rectangle on screen
      const hoverBoundingRect = ref.current?.getBoundingClientRect();
      // Get vertical middle
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      // Determine mouse position
      const clientOffset = monitor.getClientOffset();
      // Get pixels to the top
      const hoverClientY = clientOffset!.y - hoverBoundingRect.top;

      // Only perform the move when the mouse has crossed half of the items height
      // When dragging downwards, only move when the cursor is below 50%
      // When dragging upwards, only move when the cursor is above 50%
      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) return;
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) return;

      moveArticle(categoryId, dragIndex, hoverIndex);
      item.originalIndex = hoverIndex; // Mutate the item to avoid re-firing
    },
  });

  const [{ isDragging }, drag, preview] = useDrag({
    type: ItemTypes.ARTICLE,
    item: () => ({ id: article.id, originalIndex: index, categoryId, type: ItemTypes.ARTICLE }),
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    end: (item, monitor) => {
      if (monitor.didDrop()) {
        onDropArticle(item.categoryId);
      }
    }
  });

  drop(drag(ref)); // Attach both drag and drop to the same ref

  return (
    <div ref={preview} style={{ opacity: isDragging ? 0.5 : 1 }} data-handler-id={handlerId}>
      <Card ref={ref} className="p-2 bg-muted/50 mb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <GripVertical className="mr-2 h-5 w-5 text-muted-foreground cursor-grab" />
            <span className="text-sm">{article.title}</span>
            {article.is_visible ? (
              <Eye className="ml-2 h-3 w-3 text-green-600" />
            ) : (
              <EyeOff className="ml-2 h-3 w-3 text-gray-400" />
            )}
          </div>
          <div className="space-x-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onEdit(article)}
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onDelete(categoryId, article.id)}
              // disabled={deleteArticleMutation?.isPending} // Example if mutation passed
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default ArticleListItem;