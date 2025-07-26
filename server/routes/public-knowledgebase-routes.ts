import express, { Request, Response } from 'express';
import {
  KnowledgebaseCategorySchema,
  KnowledgebaseArticleSchema,
  KnowledgebaseCategory,
  KnowledgebaseArticle
} from '@modl-gg/shared-web';
import mongoose, { Model, Connection } from 'mongoose';

const router = express.Router();

// Helper to get the KnowledgebaseCategory model for the current tenant
const getKnowledgebaseCategoryModel = (req: Request): Model<KnowledgebaseCategory> => {
  const customReq = req as Request & { serverDbConnection?: Connection };
  if (!customReq.serverDbConnection) {
    throw new Error('Database connection not found for this tenant.');
  }
  if (!customReq.serverDbConnection.models.KnowledgebaseCategory) {
    customReq.serverDbConnection.model<KnowledgebaseCategory>('KnowledgebaseCategory', KnowledgebaseCategorySchema);
  }
  return customReq.serverDbConnection.model<KnowledgebaseCategory>('KnowledgebaseCategory');
};

// Helper to get the KnowledgebaseArticle model for the current tenant
const getKnowledgebaseArticleModel = (req: Request): Model<KnowledgebaseArticle> => {
  const customReq = req as Request & { serverDbConnection?: Connection };
  if (!customReq.serverDbConnection) {
    throw new Error('Database connection not found for this tenant.');
  }
  if (!customReq.serverDbConnection.models.KnowledgebaseArticle) {
    customReq.serverDbConnection.model<KnowledgebaseArticle>('KnowledgebaseArticle', KnowledgebaseArticleSchema);
  }
  return customReq.serverDbConnection.model<KnowledgebaseArticle>('KnowledgebaseArticle');
};

// GET /api/public/knowledgebase/categories - List all visible categories and their visible articles
router.get('/categories', async (req: Request, res: Response) => {
  try {
    const KnowledgebaseCategory = getKnowledgebaseCategoryModel(req);
    const KnowledgebaseArticle = getKnowledgebaseArticleModel(req);

    const categories = await KnowledgebaseCategory.find()
      .sort({ ordinal: 1 })
      .lean(); // Use lean for performance as we are modifying the result

    const populatedCategories = await Promise.all(
      categories.map(async (cat) => {
        const articles = await KnowledgebaseArticle.find({
          category: cat._id,
          is_visible: true,
        })
        .select('id title slug ordinal is_visible') // Select only necessary fields
        .sort({ ordinal: 1 })
        .lean();
        return {
          id: cat._id.toString(),
          name: cat.name,
          slug: cat.slug,
          description: cat.description,
          ordinal: cat.ordinal,
          articles: articles.map(art => ({
            id: art._id.toString(),
            title: art.title,
            slug: art.slug,
            ordinal: art.ordinal,
            is_visible: art.is_visible,
          })),
        };
      })
    );

    res.status(200).json(populatedCategories);
  } catch (error: any) {
    console.error('Error fetching public knowledgebase categories:', error);
    if (error.message.startsWith('Database connection')) {
      const customReq = req as Request & { serverDbConnection?: Connection };
      if (!customReq.serverDbConnection) {
        return res.status(503).json({ message: error.message });
      }
    }
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// GET /api/public/knowledgebase/articles/:articleIdOrSlug - Get a single visible article by ID or slug
router.get('/articles/:articleIdOrSlug', async (req: Request, res: Response) => {
  try {
    const KnowledgebaseArticle = getKnowledgebaseArticleModel(req);
    const { articleIdOrSlug } = req.params;

    let article;
    if (mongoose.Types.ObjectId.isValid(articleIdOrSlug)) {
      article = await KnowledgebaseArticle.findOne({
        _id: articleIdOrSlug,
        is_visible: true,
      }).populate('category', 'name slug');
    } else {
      article = await KnowledgebaseArticle.findOne({
        slug: articleIdOrSlug,
        is_visible: true,
      }).populate('category', 'name slug');
    }

    if (!article) {
      return res.status(404).json({ message: 'Article not found or not visible.' });
    }

    res.status(200).json({
      id: (article._id as mongoose.Types.ObjectId).toString(),
      title: article.title,
      slug: article.slug,
      content: article.content,
      is_visible: article.is_visible,
      ordinal: article.ordinal,
      category: article.category ? {
        // @ts-ignore
        id: article.category._id.toString(),
        // @ts-ignore
        name: article.category.name,
        // @ts-ignore
        slug: article.category.slug,
      } : null,
      created_at: article.created_at,
      updated_at: article.updated_at,
    });
  } catch (error: any) {
    console.error('Error fetching public article:', error);
    if (error.message.startsWith('Database connection')) {
      const customReq = req as Request & { serverDbConnection?: Connection };
      if (!customReq.serverDbConnection) {
        return res.status(503).json({ message: error.message });
      }
    }
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// GET /api/public/knowledgebase/search?q=<query> - Search articles
router.get('/search', async (req: Request, res: Response) => {
  try {
    const KnowledgebaseArticle = getKnowledgebaseArticleModel(req);
    const query = req.query.q as string;

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return res.status(400).json({ message: 'Search query must be at least 2 characters long.' });
    }

    // Basic text search (case-insensitive) on title and content
    // For more advanced search, consider MongoDB text indexes ($text, $search)
    const articles = await KnowledgebaseArticle.find({
      is_visible: true,
      $or: [
        { title: { $regex: query, $options: 'i' } },
        { content: { $regex: query, $options: 'i' } },
      ],
    })
    .select('id title slug category is_visible ordinal') // Add category for context
    .populate('category', 'name slug') // Populate category name and slug
    .sort({ title: 1 }) // Or sort by relevance if using text indexes
    .limit(20); // Limit results for performance

    res.status(200).json(articles.map(art => ({
      id: (art._id as mongoose.Types.ObjectId).toString(),
      title: art.title,
      slug: art.slug,
      is_visible: art.is_visible,
      ordinal: art.ordinal,
      category: art.category ? {
        // @ts-ignore
        id: art.category._id.toString(),
        // @ts-ignore
        name: art.category.name,
        // @ts-ignore
        slug: art.category.slug,
      } : null,
    })));
  } catch (error: any) {
    console.error('Error searching public articles:', error);
    if (error.message.startsWith('Database connection')) {
      const customReq = req as Request & { serverDbConnection?: Connection };
      if (!customReq.serverDbConnection) {
        return res.status(503).json({ message: error.message });
      }
    }
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

export default router;