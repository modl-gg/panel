import express, { Request, Response } from 'express';
import {
  KnowledgebaseCategorySchema,
  KnowledgebaseArticleSchema,
  IKnowledgebaseCategory,
  IKnowledgebaseArticle
} from 'modl-shared-web';
import mongoose, { Model } from 'mongoose';
import { isAuthenticated } from '../middleware/auth-middleware';
import { checkRole } from '../middleware/role-middleware'; // Import checkRole
import { check, validationResult } from 'express-validator'; // For validation

const router = express.Router();

// Helper to get the KnowledgebaseCategory model for the current tenant
const getKnowledgebaseCategoryModel = (req: Request): Model<IKnowledgebaseCategory> => {
  if (!req.serverDbConnection) {
    throw new Error('Database connection not found for this tenant.');
  }
  // Ensure the model is registered on the connection if not already
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


// POST /api/knowledgebase/categories - Create a new category
router.post(
  '/categories',
  isAuthenticated, // Apply authentication
  checkRole(['Super Admin', 'Admin']), // Apply authorization
  [ // Validation rules
    check('name', 'Category name is required').not().isEmpty().trim(),
    check('description', 'Description can be a string').optional().isString().trim(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const KnowledgebaseCategory = getKnowledgebaseCategoryModel(req);
      const { name, description } = req.body; // display_order is now ordinal

      // Check for existing category by name (case-insensitive)
      const existingCategory = await KnowledgebaseCategory.findOne({ name: { $regex: `^${name}$`, $options: 'i' } });
      if (existingCategory) {
        return res.status(400).json({ message: 'A category with this name already exists.' });
      }
      
      const highestOrdinalCategory = await KnowledgebaseCategory.findOne().sort({ ordinal: -1 });
      const nextOrdinal = highestOrdinalCategory ? highestOrdinalCategory.ordinal + 1 : 0;

      const newCategory = new KnowledgebaseCategory({ name, description, ordinal: nextOrdinal });
      await newCategory.save();
      
      res.status(201).json({
        id: newCategory._id.toString(),
        name: newCategory.name,
        slug: newCategory.slug,
        description: newCategory.description,
        ordinal: newCategory.ordinal,
        articles: [] // New category starts with no articles
      });
    } catch (error: any) {
      console.error('Error creating knowledgebase category:', error);
      if (error.message.startsWith('Database connection')) {
          return res.status(503).json({ message: error.message });
      }
      if (error.code === 11000) { // Mongoose duplicate key error for slug
        return res.status(400).json({ message: 'A category with this name (resulting in the same slug) already exists.' });
      }
      res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  }
);

// GET /api/knowledgebase/categories - List all categories for the tenant
router.get(
  '/categories',
  isAuthenticated,
  checkRole(['Super Admin', 'Admin']),
  async (req: Request, res: Response) => {
    try {
      const KnowledgebaseCategory = getKnowledgebaseCategoryModel(req);

      const categories = await KnowledgebaseCategory.find().sort({ ordinal: 1 }).populate({
        path: 'articles', // Virtual populate field name from schema
        model: getKnowledgebaseArticleModel(req), // Explicitly provide the model for population
        options: { sort: { ordinal: 1 } }
      });
      
      res.status(200).json(categories.map(cat => ({
        id: cat._id.toString(),
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        ordinal: cat.ordinal,
        articles: (cat.articles as IKnowledgebaseArticle[]).map(art => ({
          id: art._id.toString(),
          title: art.title,
          slug: art.slug,
          is_visible: art.is_visible,
          ordinal: art.ordinal,
          categoryId: cat._id.toString(),
        }))
      })));
    } catch (error: any) {
      console.error('Error fetching knowledgebase categories:', error);
      if (error.message.startsWith('Database connection')) {
          return res.status(503).json({ message: error.message });
      }
      res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  }
);

// GET /api/knowledgebase/categories/:categoryId - Get a specific category by ID
router.get(
  '/categories/:categoryId',
  isAuthenticated,
  checkRole(['Super Admin', 'Admin']),
  async (req: Request, res: Response) => {
    try {
      const KnowledgebaseCategory = getKnowledgebaseCategoryModel(req);
      const { categoryId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        return res.status(400).json({ message: 'Invalid category ID format.' });
      }

      const category = await KnowledgebaseCategory.findById(categoryId).populate({
        path: 'articles',
        model: getKnowledgebaseArticleModel(req),
        options: { sort: { ordinal: 1 } }
      });

      if (!category) {
        return res.status(404).json({ message: 'Knowledgebase category not found.' });
      }
      res.status(200).json({
        id: category._id.toString(),
        name: category.name,
        slug: category.slug,
        description: category.description,
        ordinal: category.ordinal,
        articles: (category.articles as IKnowledgebaseArticle[]).map(art => ({
          id: art._id.toString(),
          title: art.title,
          slug: art.slug,
          content: art.content, // Send full content for single category view
          is_visible: art.is_visible,
          ordinal: art.ordinal,
          categoryId: category._id.toString(),
        }))
      });
    } catch (error: any) {
      console.error('Error fetching category by ID:', error);
      if (error.message.startsWith('Database connection')) {
        return res.status(503).json({ message: error.message });
      }
      res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  }
);

// PUT /api/knowledgebase/categories/:categoryId - Update a category's name and description
router.put(
  '/categories/:categoryId',
  isAuthenticated,
  checkRole(['Super Admin', 'Admin']),
  [
    check('name', 'Category name must be a non-empty string').optional().notEmpty().trim(),
    check('description', 'Description must be a string').optional().isString().trim(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const KnowledgebaseCategory = getKnowledgebaseCategoryModel(req);
      const { categoryId } = req.params;
      const { name, description } = req.body;

      if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        return res.status(400).json({ message: 'Invalid category ID format.' });
      }

      const category = await KnowledgebaseCategory.findById(categoryId);
      if (!category) {
        return res.status(404).json({ message: 'Knowledgebase category not found.' });
      }

      // Check for name conflict if name is being changed
      if (name && name.toLowerCase() !== category.name.toLowerCase()) {
        const existingCategory = await KnowledgebaseCategory.findOne({
          name: { $regex: `^${name}$`, $options: 'i' },
          _id: { $ne: categoryId } // Exclude current category
        });
        if (existingCategory) {
          return res.status(400).json({ message: 'Another category with this name already exists.' });
        }
        category.name = name; // Slug will be updated by pre-save hook
      }

      if (description !== undefined) {
        category.description = description;
      }
      // Ordinal is handled by the reorder route

      const updatedCategory = await category.save();
      res.status(200).json({
        id: updatedCategory._id.toString(),
        name: updatedCategory.name,
        slug: updatedCategory.slug,
        description: updatedCategory.description,
        ordinal: updatedCategory.ordinal,
      });
    } catch (error: any) {
      console.error('Error updating knowledgebase category:', error);
      if (error.message.startsWith('Database connection')) {
        return res.status(503).json({ message: error.message });
      }
      if (error.code === 11000) {
        return res.status(400).json({ message: 'A category with this name (resulting in the same slug) already exists.' });
      }
      res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  }
);

// DELETE /api/knowledgebase/categories/:categoryId - Delete a category
router.delete(
  '/categories/:categoryId',
  isAuthenticated,
  checkRole(['Super Admin', 'Admin']),
  async (req: Request, res: Response) => {
    try {
      const KnowledgebaseCategory = getKnowledgebaseCategoryModel(req);
      const KnowledgebaseArticle = getKnowledgebaseArticleModel(req);
      const { categoryId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        return res.status(400).json({ message: 'Invalid category ID format.' });
      }

      const category = await KnowledgebaseCategory.findById(categoryId);
      if (!category) {
        return res.status(404).json({ message: 'Knowledgebase category not found.' });
      }

      // Delete all articles associated with this category
      await KnowledgebaseArticle.deleteMany({ category: category._id });

      await KnowledgebaseCategory.findByIdAndDelete(categoryId); // Use findByIdAndDelete

      res.status(200).json({ message: 'Knowledgebase category and its articles deleted successfully.' });
    } catch (error: any) {
      console.error('Error deleting knowledgebase category:', error);
      if (error.message.startsWith('Database connection')) {
        return res.status(503).json({ message: error.message });
      }
      res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  }
);

// PUT /api/knowledgebase/categories/reorder - Reorder categories
router.put(
  '/categories/reorder',
  isAuthenticated,
  checkRole(['Super Admin', 'Admin']),
  async (req: Request, res: Response) => {
    try {
      const KnowledgebaseCategory = getKnowledgebaseCategoryModel(req);
      const { orderedCategoryIds } = req.body;

      if (!Array.isArray(orderedCategoryIds) || !orderedCategoryIds.every(id => mongoose.Types.ObjectId.isValid(id))) {
        return res.status(400).json({ message: 'Invalid input. Expected an array of category IDs.' });
      }

      const bulkOps = orderedCategoryIds.map((id, index) => ({
        updateOne: {
          filter: { _id: id },
          update: { $set: { ordinal: index } }, // Use 'ordinal'
        },
      }));

      if (bulkOps.length > 0) {
        await KnowledgebaseCategory.bulkWrite(bulkOps);
      }

      res.status(200).json({ message: 'Categories reordered successfully.' });
    } catch (error: any) {
      console.error('Error reordering knowledgebase categories:', error);
      if (error.message.startsWith('Database connection')) {
        return res.status(503).json({ message: error.message });
      }
      res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  }
);


// --- Article Endpoints ---

// POST /api/knowledgebase/categories/:categoryId/articles - Create a new article in a category
router.post(
  '/categories/:categoryId/articles',
  isAuthenticated,
  checkRole(['Super Admin', 'Admin']),
  [
    check('title', 'Article title is required').not().isEmpty().trim(),
    check('content', 'Article content is required').not().isEmpty(),
    check('is_visible', 'is_visible must be a boolean').optional().isBoolean(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const KnowledgebaseCategory = getKnowledgebaseCategoryModel(req);
      const KnowledgebaseArticle = getKnowledgebaseArticleModel(req);
      const { categoryId } = req.params;
      const { title, content, is_visible = true } = req.body;
      // @ts-ignore - Assuming req.user is populated by authenticate middleware
      const authorId = req.user?._id;


      if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        return res.status(400).json({ message: 'Invalid category ID format.' });
      }

      const category = await KnowledgebaseCategory.findById(categoryId);
      if (!category) {
        return res.status(404).json({ message: 'Knowledgebase category not found.' });
      }

      const highestOrdinalArticle = await KnowledgebaseArticle.findOne({ category: category._id }).sort({ ordinal: -1 });
      const nextOrdinal = highestOrdinalArticle ? highestOrdinalArticle.ordinal + 1 : 0;

      const newArticleDoc = new KnowledgebaseArticle({
        title,
        content,
        category: category._id,
        is_visible,
        ordinal: nextOrdinal,
        author: authorId, // Optional
      });
      await newArticleDoc.save();
      
      res.status(201).json({
        id: newArticleDoc._id.toString(),
        title: newArticleDoc.title,
        slug: newArticleDoc.slug,
        content: newArticleDoc.content, // Send content back on create
        is_visible: newArticleDoc.is_visible,
        ordinal: newArticleDoc.ordinal,
        categoryId: category._id.toString(),
      });
    } catch (error: any) {
      console.error('Error creating article in category:', error);
      if (error.message.startsWith('Database connection')) {
        return res.status(503).json({ message: error.message });
      }
      if (error.code === 11000) { // Duplicate key error for article slug
        return res.status(400).json({ message: 'An article with this title (resulting in the same slug) may already exist.' });
      }
      res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  }
);

// GET /api/knowledgebase/categories/:categoryId/articles/:articleId - Get a specific article
router.get(
  '/categories/:categoryId/articles/:articleId',
  isAuthenticated, // Or make public if needed, adjust authorize accordingly
  checkRole(['Super Admin', 'Admin']),
  async (req: Request, res: Response) => {
    try {
      const KnowledgebaseArticle = getKnowledgebaseArticleModel(req);
      const { categoryId, articleId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(categoryId) || !mongoose.Types.ObjectId.isValid(articleId)) {
        return res.status(400).json({ message: 'Invalid category or article ID format.' });
      }

      const article = await KnowledgebaseArticle.findOne({ _id: articleId, category: categoryId });
      
      if (!article) {
        return res.status(404).json({ message: 'Article not found in this category.' });
      }

      res.status(200).json({
        id: article._id.toString(),
        title: article.title,
        slug: article.slug,
        content: article.content,
        is_visible: article.is_visible,
        ordinal: article.ordinal,
        categoryId: article.category.toString(),
        created_at: article.created_at,
        updated_at: article.updated_at,
        // author: article.author // Optionally populate and return author details
      });
    } catch (error: any) {
      console.error('Error fetching article:', error);
      if (error.message.startsWith('Database connection')) {
        return res.status(503).json({ message: error.message });
      }
      res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  }
);

// PUT /api/knowledgebase/categories/:categoryId/articles/:articleId - Update an article
router.put(
  '/categories/:categoryId/articles/:articleId',
  isAuthenticated,
  checkRole(['Super Admin', 'Admin']),
  [
    check('title', 'Article title must be a non-empty string').optional({ checkFalsy: true }).notEmpty().trim(),
    check('content', 'Article content must be a non-empty string').optional({ checkFalsy: true }).notEmpty(),
    check('is_visible', 'is_visible must be a boolean').optional().isBoolean(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const KnowledgebaseArticle = getKnowledgebaseArticleModel(req);
      const { categoryId, articleId } = req.params;
      const { title, content, is_visible } = req.body;
      // @ts-ignore
      const editorId = req.user?._id; // Optional: track who edited


      if (!mongoose.Types.ObjectId.isValid(categoryId) || !mongoose.Types.ObjectId.isValid(articleId)) {
        return res.status(400).json({ message: 'Invalid category or article ID format.' });
      }

      const article = await KnowledgebaseArticle.findOne({ _id: articleId, category: categoryId });
      if (!article) {
        return res.status(404).json({ message: 'Article not found in this category.' });
      }

      if (title !== undefined) article.title = title; // Slug will update via pre-save hook
      if (content !== undefined) article.content = content;
      if (is_visible !== undefined) article.is_visible = is_visible;
      // article.author = editorId; // If tracking last editor

      await article.save();
      res.status(200).json({
        id: article._id.toString(),
        title: article.title,
        slug: article.slug,
        content: article.content, // Return full content on update
        is_visible: article.is_visible,
        ordinal: article.ordinal,
        categoryId: article.category.toString(),
        updated_at: article.updated_at, // Send updated_at timestamp
      });
    } catch (error: any) {
      console.error('Error updating article:', error);
      if (error.message.startsWith('Database connection')) {
        return res.status(503).json({ message: error.message });
      }
      if (error.code === 11000) { // Mongoose duplicate key error for slug
        return res.status(400).json({ message: 'An article with this title (resulting in the same slug) may already exist.' });
      }
      res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  }
);

// DELETE /api/knowledgebase/categories/:categoryId/articles/:articleId - Delete an article
router.delete(
  '/categories/:categoryId/articles/:articleId',
  isAuthenticated,
  checkRole(['Super Admin', 'Admin']),
  async (req: Request, res: Response) => {
    try {
      const KnowledgebaseArticle = getKnowledgebaseArticleModel(req);
      const { categoryId, articleId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(categoryId) || !mongoose.Types.ObjectId.isValid(articleId)) {
        return res.status(400).json({ message: 'Invalid category or article ID format.' });
      }

      const article = await KnowledgebaseArticle.findOneAndDelete({ _id: articleId, category: categoryId });
      if (!article) {
        return res.status(404).json({ message: 'Article not found in this category or already deleted.' });
      }
      res.status(200).json({ message: 'Article deleted successfully.' });
    } catch (error: any) {
      console.error('Error deleting article:', error);
      if (error.message.startsWith('Database connection')) {
        return res.status(503).json({ message: error.message });
      }
      res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  }
);

// PUT /api/knowledgebase/categories/:categoryId/articles/reorder - Reorder articles within a category
router.put(
  '/categories/:categoryId/articles/reorder',
  isAuthenticated,
  checkRole(['Super Admin', 'Admin']),
  async (req: Request, res: Response) => {
    try {
      const KnowledgebaseCategory = getKnowledgebaseCategoryModel(req); // To verify category exists
      const KnowledgebaseArticle = getKnowledgebaseArticleModel(req);
      const { categoryId } = req.params;
      const { orderedArticleIds } = req.body;

      if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        return res.status(400).json({ message: 'Invalid category ID format.' });
      }
      if (!Array.isArray(orderedArticleIds) || !orderedArticleIds.every(id => mongoose.Types.ObjectId.isValid(id))) {
        return res.status(400).json({ message: 'Invalid input. Expected an array of article IDs.' });
      }

      const category = await KnowledgebaseCategory.findById(categoryId);
      if (!category) {
        return res.status(404).json({ message: 'Knowledgebase category not found.' });
      }

      const bulkOps = orderedArticleIds.map((id, index) => ({
        updateOne: {
          filter: { _id: id, category: categoryId }, // Ensure article is in this category
          update: { $set: { ordinal: index } },
        },
      }));

      if (bulkOps.length > 0) {
        const result = await KnowledgebaseArticle.bulkWrite(bulkOps);
        // Optional: Check result.modifiedCount to see how many were actually updated
      }
      
      res.status(200).json({ message: 'Articles reordered successfully.' });
    } catch (error: any) {
      console.error('Error reordering articles:', error);
      if (error.message.startsWith('Database connection')) {
        return res.status(503).json({ message: error.message });
      }
      res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  }
);

export default router;