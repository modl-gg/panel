import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import MongoStore from "connect-mongo";
import path from "path";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { subdomainDbMiddleware } from "./middleware/subdomainDbMiddleware";
import { globalRateLimit } from "./middleware/rate-limiter";
import { csrfProtection, csrfTokenProvider, getCSRFToken } from "./middleware/csrf-middleware";
import { securityHeaders } from "./middleware/security-headers";

// SECURITY: Block development mode execution
if (process.env.NODE_ENV === 'development') {
  console.error('🚫 DEVELOPMENT MODE NOT SUPPORTED');
  console.error('');
  console.error('This application has been hardened for production security and');
  console.error('development mode has been completely disabled to prevent security vulnerabilities.');
  console.error('');
  console.error('For local development, please use:');
  console.error('  NODE_ENV=production (with proper environment variables)');
  console.error('  or');
  console.error('  NODE_ENV=staging (if staging mode is implemented)');
  console.error('');
  console.error('Required environment variables:');
  console.error('  - SESSION_SECRET');
  console.error('  - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS');
  console.error('  - DATABASE_URL');
  console.error('  - GLOBAL_MODL_DB_URI');
  console.error('  - APP_DOMAIN');
  console.error('');
  process.exit(1);
}

const app = express();

// Security headers first (before any content is served)
app.use(securityHeaders);

// The Stripe webhook needs a raw body, so we can't use express.json() globally for all routes.
// We'll apply it conditionally, excluding the webhook route.
app.use((req, res, next) => {
  if (req.originalUrl === '/stripe-public-webhooks/stripe-webhooks') {
    return next();
  }
  return express.json()(req, res, next);
});

app.use((req, res, next) => {
  if (req.originalUrl === '/stripe-public-webhooks/stripe-webhooks') {
    return next();
  }
  return express.urlencoded({ extended: false })(req, res, next);
});

// If running behind a reverse proxy (like Nginx, Cloudflare, etc.),
// trust the first proxy hop to correctly identify the protocol (HTTP/HTTPS).
// This is important for 'secure' cookies and rate limiting by IP.
// Cloudflare is always used, so we enable this in all environments.
app.set('trust proxy', 1);

// Apply global rate limiting to all requests
app.use(globalRateLimit);

const MONGODB_URI = process.env.GLOBAL_MODL_DB_URI;
const isProduction = process.env.NODE_ENV === 'production';

// Apply the subdomain DB middleware early in the stack.
// It needs to run before any routes that depend on req.serverDbConnection.
app.use(subdomainDbMiddleware);

app.use((req: Request, res: Response, next: NextFunction) => {
  // @ts-ignore
  const serverDbConn = req.serverDbConnection;
  // @ts-ignore
  const mongoClient = serverDbConn && serverDbConn.getClient ? serverDbConn.getClient() : null;

  const cookieSettings = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as 'lax' | 'strict' | 'none' | undefined, // Type assertion for 'lax'
    maxAge: 14 * 24 * 60 * 60 * 1000
  };

  if (serverDbConn && mongoClient) {
    // Require SESSION_SECRET - mandatory for all environments
    const sessionSecret = process.env.SESSION_SECRET;
    if (!sessionSecret) {
      console.error('SECURITY ERROR: SESSION_SECRET environment variable is required!');
      process.exit(1);
    }

    const serverSpecificSession = session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({
        client: mongoClient, // Use the mongoClient variable that was already retrieved and checked
        ttl: 14 * 24 * 60 * 60,
        autoRemove: 'native',
      }),
      cookie: cookieSettings
    });
    serverSpecificSession(req, res, next);
  } else {
    // @ts-ignore
    log(`[Session] No valid serverDbConnection or mongoClient for path ${req.path} (serverDbConn: ${!!serverDbConn}, mongoClient: ${!!mongoClient}), skipping session initialization.`);
    next();
  }
});

// Add CSRF protection after session middleware but before routes
app.use(csrfProtection);
app.use(csrfTokenProvider);

// CSRF token endpoint for client-side access
app.get('/api/csrf-token', (req, res) => {
  getCSRFToken(req, res);
});

(async () => {
  // Serve static files from uploads directory (for server icons)
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
  
  const server = await registerRoutes(app);


  // Start the domain status updater for monitoring custom domains
  try {
    const { connectToGlobalModlDb } = await import('./db/connectionManager');
    const { startDomainStatusUpdater } = await import('./api/cloudflare');
    
    const globalDb = await connectToGlobalModlDb();
    startDomainStatusUpdater(globalDb, 10); // Check every 10 minutes
    console.log('✅ Domain status updater started - monitoring custom domains');
  } catch (error) {
    console.warn('⚠️  Failed to start domain status updater:', error);
  }

  // Initialize AI moderation system if Gemini API key is provided
  if (process.env.GEMINI_API_KEY) {
    console.log('🤖 Initializing AI moderation system...');
    // The AI moderation service will be initialized per server connection
    // as it needs access to each server's database
    console.log('✅ AI moderation system ready - will initialize per server connection');
  } else {
    console.log('⚠️  GEMINI_API_KEY not found - AI moderation features will be disabled');
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "staging") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
  }, () => {
    log(`serving on port ${port}`);
  });
})();
