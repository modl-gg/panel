import express, { Request, Response } from 'express';
import {
  HomepageCardSchema
} from '@modl-gg/shared-web/schemas/TenantSchemas';
import {
  KnowledgebaseCategorySchema,
  KnowledgebaseArticleSchema
} from '@modl-gg/shared-web/schemas/TenantSchemas';
import {
  IHomepageCard,
  IKnowledgebaseCategory,
  IKnowledgebaseArticle
} from '@modl-gg/shared-web/types';
import mongoose, { Model } from 'mongoose';

const router = express.Router();

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

// Helper to get the KnowledgebaseArticle model for the current tenant
const getKnowledgebaseArticleModel = (req: Request): Model<IKnowledgebaseArticle> => {
  if (!req.serverDbConnection) {
    throw new Error('Database connection not found for this tenant.');
  }
  if (!req.serverDbConnection.models.KnowledgebaseArticle) {
    req.serverDbConnection.model<IKnowledgebaseArticle>('KnowledgebaseArticle', KnowledgebaseArticleSchema);
  }
  return req.serverDbConnection.model<IKnowledgebaseArticle>('KnowledgebaseArticle');
};

// GET /api/public/homepage-cards - Get enabled homepage cards with category data
router.get('/homepage-cards', async (req: Request, res: Response) => {
  try {
    const HomepageCard = getHomepageCardModel(req);
    const KnowledgebaseArticle = getKnowledgebaseArticleModel(req);

    const cards = await HomepageCard.find({ is_enabled: true })
      .sort({ ordinal: 1 })
      .populate('category', 'name slug description')
      .lean();

    // For category dropdown cards, fetch articles
    const populatedCards = await Promise.all(
      cards.map(async (card) => {
        const baseCard = {
          id: (card._id as any).toString(),
          title: card.title,
          description: card.description,
          icon: card.icon,
          action_type: card.action_type,
          action_url: card.action_url,
          action_button_text: card.action_button_text,
          background_color: card.background_color,
          ordinal: card.ordinal
        };

        if (card.action_type === 'category_dropdown' && card.category_id) {
          // Fetch articles for this category
          const articles = await KnowledgebaseArticle.find({
            category: card.category_id,
            is_visible: true,
          })
          .select('id title slug ordinal')
          .sort({ ordinal: 1 })
          .lean();

          return {
            ...baseCard,
            category: {
              id: ((card as any).category._id as any).toString(),
              name: (card as any).category.name,
              slug: (card as any).category.slug,
              description: (card as any).category.description,
              articles: articles.map(art => ({
                id: (art._id as any).toString(),
                title: art.title,
                slug: art.slug,
                ordinal: art.ordinal
              }))
            }
          };
        }

        return baseCard;
      })
    );

    res.status(200).json(populatedCards);
  } catch (error: any) {
    console.error('Error fetching public homepage cards:', error);
    if (error.message.startsWith('Database connection')) {
      return res.status(503).json({ message: error.message });
    }
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

export default router;
