import express, { Request, Response } from 'express';
import {
  HomepageCardSchema,
  KnowledgebaseCategorySchema,
  KnowledgebaseArticleSchema,
  IHomepageCard,
  IKnowledgebaseCategory,
  IKnowledgebaseArticle
} from '@modl-gg/shared-web';
import mongoose, { Model } from 'mongoose';
import { isAuthenticated } from '../middleware/auth-middleware';
// Note: Permission functions will be imported dynamically to avoid circular dependency issues
import { check, validationResult } from 'express-validator';

const router = express.Router();

// Apply permission middleware to all routes that modify homepage cards
const homepagePermissionMiddleware = async (req: Request, res: Response, next: Function) => {
  // Skip permission check for GET requests (read-only)
  if (req.method === 'GET') {
    return next();
  }
  
  try {
    const { hasPermission } = await import('../middleware/permission-middleware');
    const hasAdminPermission = await hasPermission(req, 'admin.settings.modify');
    
    if (!hasAdminPermission) {
      return res.status(403).json({ 
        message: 'Forbidden: You do not have permission to manage homepage cards.',
        required: ['admin.settings.modify']
      });
    }
    next();
  } catch (error) {
    console.error('Error checking homepage permissions:', error);
    res.status(500).json({ message: 'Internal server error while checking permissions.' });
  }
};

// Apply the permission middleware to all routes
router.use(homepagePermissionMiddleware);

// Helper to get the HomepageCard model for the current tenant
const getHomepageCardModel = (req: Request): Model<IHomepageCard> => {
  if (!req.serverDbConnection) {
    throw new Error('Database connection not found for this tenant.');
  }
  if (!req.serverDbConnection.models.HomepageCard) {
    req.serverDbConnection.model<IHomepageCard>('HomepageCard', HomepageCardSchema);
  }
  return req.serverDbConnection.model<IHomepageCard>('HomepageCard');
};

// Helper to get the KnowledgebaseCategory model for the current tenant
const getKnowledgebaseCategoryModel = (req: Request): Model<IKnowledgebaseCategory> => {
  if (!req.serverDbConnection) {
    throw new Error('Database connection not found for this tenant.');
  }
  if (!req.serverDbConnection.models.KnowledgebaseCategory) {
    req.serverDbConnection.model<IKnowledgebaseCategory>('KnowledgebaseCategory', KnowledgebaseCategorySchema);
  }
  return req.serverDbConnection.model<IKnowledgebaseCategory>('KnowledgebaseCategory');
};

// GET /api/panel/homepage-cards - List all homepage cards for admin
router.get(
  '/homepage-cards',
  isAuthenticated,
  
  async (req: Request, res: Response) => {
    try {
      
      const HomepageCard = getHomepageCardModel(req);
      

      const cards = await HomepageCard.find()
        .sort({ ordinal: 1 })
        .populate('category', 'name slug description')
        .lean();
      
      console.log('[Homepage Cards] Cards fetched:', cards.length);

      const formattedCards = cards.map(card => ({
        id: (card._id as any).toString(),
        title: card.title,
        description: card.description,
        icon: card.icon,
        action_type: card.action_type,
        action_url: card.action_url,
        action_button_text: card.action_button_text,
        category_id: card.category_id?.toString(),
        background_color: card.background_color,
        is_enabled: card.is_enabled,
        ordinal: card.ordinal,
        category: (card as any).category
      }));

      console.log('[Homepage Cards] Formatted cards:', formattedCards.length);
      res.status(200).json(formattedCards);
    } catch (error: any) {
      console.error('Error fetching homepage cards:', error);
      if (error.message.startsWith('Database connection')) {
        return res.status(503).json({ message: error.message });
      }
      res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  }
);

// POST /api/panel/homepage-cards - Create a new homepage card
router.post(
  '/homepage-cards',
  isAuthenticated,
  
  [
    check('title', 'Title is required').not().isEmpty().trim(),
    check('description', 'Description is required').not().isEmpty().trim(),
    check('icon', 'Icon is required').not().isEmpty().trim(),
    check('action_type', 'Action type must be url or category_dropdown').isIn(['url', 'category_dropdown']),
    check('action_button_text', 'Button text must be a string').optional().isString().trim(),
    check('category_id', 'Category ID must be valid').optional().isMongoId(),
    check('background_color', 'Background color must be a string').optional().isString().trim(),
    check('is_enabled', 'Enabled status must be boolean').optional().isBoolean(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const HomepageCard = getHomepageCardModel(req);
      const { 
        title, 
        description, 
        icon, 
        action_type, 
        action_url, 
        action_button_text, 
        category_id, 
        background_color, 
        is_enabled 
      } = req.body;

      // Validate action-specific requirements
      if (action_type === 'url') {
        if (!action_url) {
          return res.status(400).json({ message: 'URL is required for URL actions' });
        }
        // Validate URL format
        try {
          new URL(action_url);
        } catch (e) {
          return res.status(400).json({ message: 'Invalid URL format' });
        }
      }
      
      if (action_type === 'category_dropdown' && !category_id) {
        return res.status(400).json({ message: 'Category is required for category dropdown actions' });
      }

      // If category_id is provided, verify it exists
      if (category_id) {
        const KnowledgebaseCategory = getKnowledgebaseCategoryModel(req);
        const category = await KnowledgebaseCategory.findById(category_id);
        if (!category) {
          return res.status(400).json({ message: 'Category not found' });
        }
      }

      // Get next ordinal
      const highestOrdinalCard = await HomepageCard.findOne().sort({ ordinal: -1 });
      const nextOrdinal = highestOrdinalCard ? highestOrdinalCard.ordinal + 1 : 0;

      const newCard = new HomepageCard({
        title,
        description,
        icon,
        action_type,
        action_url: action_type === 'url' ? action_url : undefined,
        action_button_text: action_type === 'url' ? (action_button_text || 'Learn More') : undefined,
        category_id: action_type === 'category_dropdown' ? category_id : undefined,
        background_color,
        is_enabled: is_enabled !== undefined ? is_enabled : true,
        ordinal: nextOrdinal
      });

      await newCard.save();
      await newCard.populate('category', 'name slug description');

      res.status(201).json({
        id: (newCard._id as any).toString(),
        title: newCard.title,
        description: newCard.description,
        icon: newCard.icon,
        action_type: newCard.action_type,
        action_url: newCard.action_url,
        action_button_text: newCard.action_button_text,
        category_id: newCard.category_id?.toString(),
        background_color: newCard.background_color,
        is_enabled: newCard.is_enabled,
        ordinal: newCard.ordinal,
        category: (newCard as any).category
      });
    } catch (error: any) {
      console.error('Error creating homepage card:', error);
      if (error.message.startsWith('Database connection')) {
        return res.status(503).json({ message: error.message });
      }
      res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  }
);

// PUT /api/panel/homepage-cards/:cardId - Update a homepage card
router.put(
  '/homepage-cards/:cardId',
  isAuthenticated,
  
  [
    check('title', 'Title must be a non-empty string').optional().notEmpty().trim(),
    check('description', 'Description must be a non-empty string').optional().notEmpty().trim(),
    check('icon', 'Icon must be a non-empty string').optional().notEmpty().trim(),
    check('action_type', 'Action type must be url or category_dropdown').optional().isIn(['url', 'category_dropdown']),
    check('action_button_text', 'Button text must be a string').optional().isString().trim(),
    check('category_id', 'Category ID must be valid').optional().isMongoId(),
    check('background_color', 'Background color must be a string').optional().isString().trim(),
    check('is_enabled', 'Enabled status must be boolean').optional().isBoolean(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const HomepageCard = getHomepageCardModel(req);
      const { cardId } = req.params;
      const updateData = req.body;

      if (!mongoose.Types.ObjectId.isValid(cardId)) {
        return res.status(400).json({ message: 'Invalid card ID format.' });
      }

      const card = await HomepageCard.findById(cardId);
      if (!card) {
        return res.status(404).json({ message: 'Homepage card not found.' });
      }

      // Validate action-specific requirements if action_type is being updated
      const actionType = updateData.action_type || card.action_type;
      if (actionType === 'url') {
        const actionUrl = updateData.action_url !== undefined ? updateData.action_url : card.action_url;
        if (!actionUrl) {
          return res.status(400).json({ message: 'URL is required for URL actions' });
        }
        // Validate URL format
        try {
          new URL(actionUrl);
        } catch (e) {
          return res.status(400).json({ message: 'Invalid URL format' });
        }
      }
      
      if (actionType === 'category_dropdown') {
        const categoryId = updateData.category_id !== undefined ? updateData.category_id : card.category_id;
        if (!categoryId) {
          return res.status(400).json({ message: 'Category is required for category dropdown actions' });
        }
      }

      // If category_id is being updated, verify it exists
      if (updateData.category_id) {
        const KnowledgebaseCategory = getKnowledgebaseCategoryModel(req);
        const category = await KnowledgebaseCategory.findById(updateData.category_id);
        if (!category) {
          return res.status(400).json({ message: 'Category not found' });
        }
      }

      // Update the card
      Object.assign(card, updateData);
      
      // Clear irrelevant fields based on action type
      if (card.action_type === 'url') {
        card.category_id = undefined;
      } else if (card.action_type === 'category_dropdown') {
        card.action_url = undefined;
        card.action_button_text = undefined;
      }

      await card.save();
      await card.populate('category', 'name slug description');

      res.status(200).json({
        id: (card._id as any).toString(),
        title: card.title,
        description: card.description,
        icon: card.icon,
        action_type: card.action_type,
        action_url: card.action_url,
        action_button_text: card.action_button_text,
        category_id: card.category_id?.toString(),
        background_color: card.background_color,
        is_enabled: card.is_enabled,
        ordinal: card.ordinal,
        category: (card as any).category
      });
    } catch (error: any) {
      console.error('Error updating homepage card:', error);
      if (error.message.startsWith('Database connection')) {
        return res.status(503).json({ message: error.message });
      }
      res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  }
);

// DELETE /api/panel/homepage-cards/:cardId - Delete a homepage card
router.delete(
  '/homepage-cards/:cardId',
  isAuthenticated,
  
  async (req: Request, res: Response) => {
    try {
      const HomepageCard = getHomepageCardModel(req);
      const { cardId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(cardId)) {
        return res.status(400).json({ message: 'Invalid card ID format.' });
      }

      const deletedCard = await HomepageCard.findByIdAndDelete(cardId);
      if (!deletedCard) {
        return res.status(404).json({ message: 'Homepage card not found.' });
      }

      res.status(200).json({ message: 'Homepage card deleted successfully.' });
    } catch (error: any) {
      console.error('Error deleting homepage card:', error);
      if (error.message.startsWith('Database connection')) {
        return res.status(503).json({ message: error.message });
      }
      res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  }
);

// PUT /api/panel/homepage-cards/reorder - Reorder homepage cards
router.put(
  '/homepage-cards/reorder',
  isAuthenticated,
  
  [
    check('cardIds', 'Card IDs must be an array').isArray(),
    check('cardIds.*', 'Each card ID must be a valid ObjectId').isMongoId(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const HomepageCard = getHomepageCardModel(req);
      const { cardIds } = req.body;

      // Update ordinal for each card
      const updatePromises = cardIds.map((cardId: string, index: number) =>
        HomepageCard.findByIdAndUpdate(cardId, { ordinal: index })
      );

      await Promise.all(updatePromises);

      res.status(200).json({ message: 'Homepage cards reordered successfully.' });
    } catch (error: any) {
      console.error('Error reordering homepage cards:', error);
      if (error.message.startsWith('Database connection')) {
        return res.status(503).json({ message: error.message });
      }
      res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  }
);

export default router;
