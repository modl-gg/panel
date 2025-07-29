import dotenv from 'dotenv';
import mongoose, { Connection, ConnectOptions } from 'mongoose';
import {
  PlayerSchema,
  TicketSchema,
  StaffSchema,
  SettingsSchema,
  LogSchema,
  InvitationSchema,
  KnowledgebaseArticleSchema,
  KnowledgebaseCategorySchema,
  HomepageCardSchema
} from '@modl-gg/shared-web';
import { ModlServerSchema } from '@modl-gg/shared-web';

dotenv.config();

// Configuration constants
const GLOBAL_MODL_DB_URI = process.env.GLOBAL_MODL_DB_URI;
const PANEL_DB_PREFIX = process.env.PANEL_DB_PREFIX || 'server_';
const IS_DEVELOPMENT = process.env.NODE_ENV === 'staging';
const MONGODB_URI_TEMPLATE = process.env.MONGODB_URI_TEMPLATE;

// Scalable connection pool configuration
const CONNECTION_CONFIG: ConnectOptions = {
  maxPoolSize: 5, // Reduced per-connection pool size for better memory management
  minPoolSize: 1,  // Minimum connections per pool
  maxIdleTimeMS: 15000, // Close internal connections after 15 seconds of inactivity
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 30000, // Reduced socket timeout
  family: 4,
  bufferCommands: false,
  heartbeatFrequencyMS: 10000,
  retryWrites: true,
  retryReads: true,
};

// Scalability limits and configuration
const CONNECTION_LIMITS = {
  maxServerConnections: parseInt(process.env.MAX_SERVER_CONNECTIONS || '100'), // Configurable limit
  maxIdleTime: parseInt(process.env.CONNECTION_IDLE_TIME || '300000'), // 5 minutes default
  evictionCheckInterval: parseInt(process.env.EVICTION_CHECK_INTERVAL || '120000'), // 2 minutes
  connectionTimeout: 10000,
  healthCheckInterval: 30000,
  lruEvictionCount: parseInt(process.env.LRU_EVICTION_COUNT || '5'), // Evict 5 at a time
};

// Enhanced connection health monitoring with LRU tracking
interface ConnectionHealth {
  connection: Connection;
  lastHealthCheck: Date;
  lastUsed: Date; // For LRU eviction
  isHealthy: boolean;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  useCount: number; // Track usage frequency
  created: Date; // Connection creation time
}

// Connection pools and LRU management
let globalModlConnection: Connection | null = null;
const serverConnections = new Map<string, ConnectionHealth>();
const connectionAccessOrder = new Set<string>(); // LRU tracking - most recent at end
const maxReconnectAttempts = 3;

// Graceful shutdown handling
let isShuttingDown = false;
let evictionTimer: NodeJS.Timeout | null = null;
let healthCheckTimer: NodeJS.Timeout | null = null;

// Tenant schemas registry
const tenantSchemas: Record<string, mongoose.Schema<any>> = {
  Player: PlayerSchema,
  Ticket: TicketSchema,
  Staff: StaffSchema,
  Settings: SettingsSchema,
  Log: LogSchema,
  Invitation: InvitationSchema,
  KnowledgebaseArticle: KnowledgebaseArticleSchema,
  KnowledgebaseCategory: KnowledgebaseCategorySchema,
  HomepageCard: HomepageCardSchema
};

// Enhanced logging utility
const log = {
  info: (message: string, meta?: any) => {
    // if (IS_DEVELOPMENT || process.env.ENABLE_CONNECTION_LOGS === 'true') {
    //   console.log(`[ConnectionManager] ${message}`, meta ? JSON.stringify(meta) : '');
    // }
  },
  warn: (message: string, meta?: any) => {
    console.warn(`[ConnectionManager] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  error: (message: string, error?: any) => {
    console.error(`[ConnectionManager] ${message}`, error);
  },
  metrics: (message: string, meta?: any) => {
    // Always log metrics for monitoring
    //console.log(`[ConnectionManager:METRICS] ${message}`, meta ? JSON.stringify(meta) : '');
  }
};

/**
 * Validates required environment variables
 */
function validateEnvironment(): void {
  const requiredVars = ['GLOBAL_MODL_DB_URI', 'MONGODB_URI_TEMPLATE'];
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * Updates LRU tracking for a connection
 */
function updateLRUAccess(connectionKey: string): void {
  // Remove from current position and add to end (most recent)
  connectionAccessOrder.delete(connectionKey);
  connectionAccessOrder.add(connectionKey);
  
  // Update connection health
  const connectionHealth = serverConnections.get(connectionKey);
  if (connectionHealth) {
    connectionHealth.lastUsed = new Date();
    connectionHealth.useCount++;
  }
}

/**
 * Gets least recently used connections for eviction
 */
function getLRUConnectionsForEviction(count: number): string[] {
  const now = Date.now();
  const candidates: Array<{ key: string; lastUsed: number; useCount: number }> = [];
  
  for (const [key, health] of serverConnections) {
    const idleTime = now - health.lastUsed.getTime();
    if (idleTime > CONNECTION_LIMITS.maxIdleTime) {
      candidates.push({
        key,
        lastUsed: health.lastUsed.getTime(),
        useCount: health.useCount
      });
    }
  }
  
  // Sort by last used time (oldest first), then by use count (least used first)
  candidates.sort((a, b) => {
    if (a.lastUsed !== b.lastUsed) {
      return a.lastUsed - b.lastUsed;
    }
    return a.useCount - b.useCount;
  });
  
  return candidates.slice(0, count).map(c => c.key);
}

/**
 * Evicts idle and LRU connections to maintain limits
 */
async function evictIdleConnections(): Promise<void> {
  if (isShuttingDown || serverConnections.size <= CONNECTION_LIMITS.maxServerConnections) {
    return;
  }
  
  const connectionsToEvict = getLRUConnectionsForEviction(CONNECTION_LIMITS.lruEvictionCount);
  
  if (connectionsToEvict.length === 0) {
    return;
  }
  
  log.metrics('Evicting idle connections', {
    connectionsToEvict: connectionsToEvict.length,
    totalConnections: serverConnections.size,
    maxConnections: CONNECTION_LIMITS.maxServerConnections
  });
  
  const evictionPromises = connectionsToEvict.map(async (connectionKey) => {
    try {
      const serverName = IS_DEVELOPMENT ? 'modl_test' : connectionKey;
      await closeServerDbConnection(serverName);
      log.info('Evicted idle connection', { connectionKey });
    } catch (error) {
      log.error('Error evicting connection', { connectionKey, error });
    }
  });
  
  await Promise.allSettled(evictionPromises);
}

/**
 * Registers tenant models on a connection with proper error handling
 */
function registerTenantModels(connection: Connection): void {
  if (!connection || connection.readyState !== 1) {
    throw new Error('Cannot register models on invalid connection');
  }

  for (const [modelName, schema] of Object.entries(tenantSchemas)) {
    if (!schema) {
      log.warn(`Schema for model '${modelName}' not found, skipping registration`, { 
        connectionName: connection.name 
      });
      continue;
    }

    try {
      // Check if model is already registered
      connection.model(modelName);
      log.info(`Model '${modelName}' already registered`, { connectionName: connection.name });
    } catch (error) {
      try {
        // Model doesn't exist, register it
        connection.model(modelName, schema);
        log.info(`Successfully registered model '${modelName}'`, { connectionName: connection.name });
      } catch (registrationError) {
        log.error(`Failed to register model '${modelName}'`, registrationError);
        throw registrationError;
      }
    }
  }
}

/**
 * Sets up connection event handlers for monitoring and logging
 */
function setupConnectionEventHandlers(connection: Connection, connectionKey: string): void {
  connection.on('connected', () => {
    log.info(`Database connected`, { connectionKey, readyState: connection.readyState });
  });

  connection.on('error', (error) => {
    log.error(`Database connection error`, { connectionKey, error });
  });

  connection.on('disconnected', () => {
    log.info(`Database disconnected`, { connectionKey });
  });

  connection.on('reconnected', () => {
    log.info(`Database reconnected`, { connectionKey });
  });

  connection.on('close', () => {
    log.info(`Database connection closed`, { connectionKey });
  });
}

/**
 * Performs a health check on a connection
 */
async function performHealthCheck(connectionHealth: ConnectionHealth): Promise<boolean> {
  try {
    const { connection } = connectionHealth;
    
    if (connection.readyState !== 1) {
      return false;
    }

    // Perform a simple ping operation
    await connection.db?.admin().ping();
    
    connectionHealth.lastHealthCheck = new Date();
    connectionHealth.isHealthy = true;
    connectionHealth.reconnectAttempts = 0;
    
    return true;
  } catch (error) {
    log.error('Health check failed', error);
    connectionHealth.isHealthy = false;
    return false;
  }
}

/**
 * Attempts to reconnect a failed connection
 */
async function attemptReconnection(connectionKey: string, connectionHealth: ConnectionHealth): Promise<boolean> {
  if (connectionHealth.reconnectAttempts >= connectionHealth.maxReconnectAttempts) {
    log.error(`Max reconnection attempts reached for ${connectionKey}`);
    return false;
  }

  try {
    connectionHealth.reconnectAttempts++;
    log.info(`Attempting reconnection ${connectionHealth.reconnectAttempts}/${connectionHealth.maxReconnectAttempts}`, { connectionKey });

    // Close the existing connection if it's still open
    if (connectionHealth.connection.readyState !== 0) {
      await connectionHealth.connection.close();
    }

    // For server connections, recreate the connection
    if (connectionKey !== 'global') {
      const serverName = IS_DEVELOPMENT ? 'modl_test' : connectionKey;
      const newConnection = await createServerConnection(serverName);
      connectionHealth.connection = newConnection;
      connectionHealth.created = new Date();
      setupConnectionEventHandlers(newConnection, connectionKey);
      registerTenantModels(newConnection);
    }

    const isHealthy = await performHealthCheck(connectionHealth);
    if (isHealthy) {
      log.info(`Successfully reconnected`, { connectionKey });
      return true;
    }
  } catch (error) {
    log.error(`Reconnection attempt failed for ${connectionKey}`, error);
  }

  return false;
}

/**
 * Creates a new server database connection
 */
async function createServerConnection(serverName: string): Promise<Connection> {
  if (!MONGODB_URI_TEMPLATE) {
    throw new Error('MONGODB_URI_TEMPLATE is not defined in environment variables');
  }

  const actualDbName = IS_DEVELOPMENT ? 'modl_test' : `${PANEL_DB_PREFIX}${serverName}`;
  const serverDbUri = MONGODB_URI_TEMPLATE.replace('<dbName>', actualDbName);

  log.info(`Creating new connection`, { serverName, actualDbName });

  const connection = mongoose.createConnection(serverDbUri, CONNECTION_CONFIG);
  await connection.asPromise();

  return connection;
}

/**
 * Connects to the global MODL database with improved error handling and monitoring
 */
export async function connectToGlobalModlDb(): Promise<Connection> {
  if (isShuttingDown) {
    throw new Error('System is shutting down, cannot create new connections');
  }

  validateEnvironment();

  if (globalModlConnection && globalModlConnection.readyState === 1) {
    return globalModlConnection;
  }

  try {
    log.info('Connecting to Global MODL Database');
    
    const connection = mongoose.createConnection(GLOBAL_MODL_DB_URI!, CONNECTION_CONFIG);
    await connection.asPromise();
    
    // Register the Server model
    connection.model('Server', ModlServerSchema);
    
    // Setup event handlers
    setupConnectionEventHandlers(connection, 'global');
    
    globalModlConnection = connection;
    log.info('Successfully connected to Global MODL Database');
    
    return connection;
  } catch (error) {
    log.error('Failed to connect to Global MODL Database', error);
    throw error;
  }
}

/**
 * Retrieves the Server model from the global database
 */
export async function getModlServersModel() {
  const connection = await connectToGlobalModlDb();
  return connection.model('Server');
}

/**
 * Connects to a specific server's database with health monitoring and LRU management
 */
export async function connectToServerDb(serverName: string): Promise<Connection> {
  if (isShuttingDown) {
    throw new Error('System is shutting down, cannot create new connections');
  }

  validateEnvironment();

  const connectionKey = IS_DEVELOPMENT ? 'modl_test' : serverName;
  const actualServerName = IS_DEVELOPMENT ? 'modl_test' : serverName;

  // Check if we have a healthy existing connection
  if (serverConnections.has(connectionKey)) {
    const connectionHealth = serverConnections.get(connectionKey)!;
    
    if (connectionHealth.connection.readyState === 1 && connectionHealth.isHealthy) {
      // Update LRU tracking
      updateLRUAccess(connectionKey);
      
      // Perform health check if it's been a while
      const timeSinceLastCheck = Date.now() - connectionHealth.lastHealthCheck.getTime();
      if (timeSinceLastCheck > CONNECTION_LIMITS.healthCheckInterval) {
        const isHealthy = await performHealthCheck(connectionHealth);
        if (!isHealthy) {
          await attemptReconnection(connectionKey, connectionHealth);
        }
      }
      
      if (connectionHealth.isHealthy) {
        return connectionHealth.connection;
      }
    } else {
      // Connection is not healthy, attempt reconnection
      const reconnected = await attemptReconnection(connectionKey, connectionHealth);
      if (reconnected && connectionHealth.isHealthy) {
        updateLRUAccess(connectionKey);
        return connectionHealth.connection;
      }
      
      // Remove failed connection
      serverConnections.delete(connectionKey);
      connectionAccessOrder.delete(connectionKey);
    }
  }

  // Check if we need to evict connections before creating a new one
  if (serverConnections.size >= CONNECTION_LIMITS.maxServerConnections) {
    log.metrics('Connection limit reached, evicting connections', {
      currentConnections: serverConnections.size,
      maxConnections: CONNECTION_LIMITS.maxServerConnections
    });
    await evictIdleConnections();
  }

  try {
    // Create new connection
    const newConnection = await createServerConnection(actualServerName);
    
    // Setup event handlers
    setupConnectionEventHandlers(newConnection, connectionKey);
    
    // Register tenant models
    registerTenantModels(newConnection);
    
    // Create health monitoring object
    const now = new Date();
    const connectionHealth: ConnectionHealth = {
      connection: newConnection,
      lastHealthCheck: now,
      lastUsed: now,
      isHealthy: true,
      reconnectAttempts: 0,
      maxReconnectAttempts,
      useCount: 1,
      created: now
    };
    
    serverConnections.set(connectionKey, connectionHealth);
    updateLRUAccess(connectionKey);
    
    log.metrics('Created new server connection', { 
      serverName, 
      connectionKey, 
      totalConnections: serverConnections.size,
      actualDbName: IS_DEVELOPMENT ? 'modl_test' : `${PANEL_DB_PREFIX}${serverName}` 
    });
    
    return newConnection;
  } catch (error) {
    log.error(`Failed to connect to server database`, { serverName, connectionKey, error });
    throw error;
  }
}

/**
 * Closes connection to a specific server database
 */
export async function closeServerDbConnection(serverName: string): Promise<void> {
  const connectionKey = IS_DEVELOPMENT ? 'modl_test' : serverName;
  
  if (serverConnections.has(connectionKey)) {
    const connectionHealth = serverConnections.get(connectionKey)!;
    
    try {
      await connectionHealth.connection.close();
      log.info(`Closed server database connection`, { serverName, connectionKey });
    } catch (error) {
      log.error(`Error closing server database connection`, { serverName, connectionKey, error });
    } finally {
      serverConnections.delete(connectionKey);
      connectionAccessOrder.delete(connectionKey);
    }
  } else {
    log.warn(`No active connection found for server`, { serverName, connectionKey });
  }
}

/**
 * Closes the global database connection
 */
export async function closeGlobalModlDbConnection(): Promise<void> {
  if (globalModlConnection) {
    try {
      await globalModlConnection.close();
      log.info('Closed Global MODL Database connection');
    } catch (error) {
      log.error('Error closing Global MODL Database connection', error);
    } finally {
      globalModlConnection = null;
    }
  }
}

/**
 * Closes all database connections with proper cleanup
 */
export async function closeAllConnections(): Promise<void> {
  if (isShuttingDown) {
    log.info('Shutdown already in progress');
    return;
  }

  isShuttingDown = true;
  log.info('Starting graceful shutdown of all database connections');

  // Stop background tasks
  if (evictionTimer) {
    clearInterval(evictionTimer);
    evictionTimer = null;
  }
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }

  const closePromises: Promise<void>[] = [];

  // Close global connection
  closePromises.push(closeGlobalModlDbConnection());

  // Close all server connections
  for (const connectionKey of Array.from(serverConnections.keys())) {
    const serverName = IS_DEVELOPMENT ? 'modl_test' : connectionKey;
    closePromises.push(closeServerDbConnection(serverName));
  }

  try {
    await Promise.allSettled(closePromises);
    log.info('All database connections closed successfully');
  } catch (error) {
    log.error('Error during connection cleanup', error);
  }
}

/**
 * Gets detailed connection statistics for monitoring
 */
function getConnectionStatsInternal() {
  const now = Date.now();
  return {
    globalConnection: {
      connected: globalModlConnection?.readyState === 1,
      readyState: globalModlConnection?.readyState
    },
    serverConnections: Array.from(serverConnections.entries()).map(([key, health]) => ({
      key,
      connected: health.connection.readyState === 1,
      readyState: health.connection.readyState,
      isHealthy: health.isHealthy,
      lastHealthCheck: health.lastHealthCheck,
      lastUsed: health.lastUsed,
      idleTime: now - health.lastUsed.getTime(),
      useCount: health.useCount,
      age: now - health.created.getTime(),
      reconnectAttempts: health.reconnectAttempts
    })),
    limits: CONNECTION_LIMITS,
    totalConnections: serverConnections.size + (globalModlConnection ? 1 : 0),
    lruOrder: Array.from(connectionAccessOrder)
  };
}

/**
 * Performs health checks on all connections
 */
async function performHealthChecksInternal(): Promise<void> {
  const healthCheckPromises: Promise<void>[] = [];

  // Check server connections
  for (const connectionKey of Array.from(serverConnections.keys())) {
    const connectionHealth = serverConnections.get(connectionKey)!;
    healthCheckPromises.push(
      performHealthCheck(connectionHealth).then(async (isHealthy) => {
        if (!isHealthy) {
          log.warn(`Health check failed for ${connectionKey}, attempting reconnection`);
          await attemptReconnection(connectionKey, connectionHealth);
        }
      }).catch(error => {
        log.error(`Health check error for ${connectionKey}`, error);
      })
    );
  }

  await Promise.allSettled(healthCheckPromises);
}

/**
 * Starts health monitoring and eviction background tasks
 */
function startHealthMonitoring(): void {
  // Health check timer
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
  }

  healthCheckTimer = setInterval(async () => {
    if (!isShuttingDown && serverConnections.size > 0) {
      await performHealthChecksInternal();
    }
  }, CONNECTION_LIMITS.healthCheckInterval);

  // Eviction timer
  if (evictionTimer) {
    clearInterval(evictionTimer);
  }

  evictionTimer = setInterval(async () => {
    if (!isShuttingDown) {
      await evictIdleConnections();
    }
  }, CONNECTION_LIMITS.evictionCheckInterval);

  log.info('Health monitoring and eviction started', { 
    healthCheckInterval: CONNECTION_LIMITS.healthCheckInterval,
    evictionCheckInterval: CONNECTION_LIMITS.evictionCheckInterval
  });
}

/**
 * Stops health monitoring and eviction background tasks
 */
function stopHealthMonitoring(): void {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
  if (evictionTimer) {
    clearInterval(evictionTimer);
    evictionTimer = null;
  }
  log.info('Health monitoring and eviction stopped');
}

/**
 * Forces eviction of idle connections (for manual cleanup)
 */
export async function forceEvictIdleConnections(): Promise<void> {
  await evictIdleConnections();
}

/**
 * Gets current connection count
 */
export function getConnectionCount(): number {
  return serverConnections.size + (globalModlConnection ? 1 : 0);
}

// Start health monitoring and eviction when module loads
startHealthMonitoring();

// Enhanced graceful shutdown handlers
process.on('SIGTERM', async () => {
  log.info('Received SIGTERM, initiating graceful shutdown');
  stopHealthMonitoring();
  await closeAllConnections();
  process.exit(0);
});

process.on('SIGINT', async () => {
  log.info('Received SIGINT, initiating graceful shutdown');
  stopHealthMonitoring();
  await closeAllConnections();
  process.exit(0);
});

process.on('uncaughtException', async (error) => {
  log.error('Uncaught exception, shutting down', error);
  stopHealthMonitoring();
  await closeAllConnections();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  log.error('Unhandled rejection, shutting down', { reason, promise });
  stopHealthMonitoring();
  await closeAllConnections();
  process.exit(1);
});

// Export health monitoring functions for external use
export { 
  getConnectionStatsInternal as getConnectionStats, 
  performHealthChecksInternal as performHealthChecks, 
  startHealthMonitoring, 
  stopHealthMonitoring 
};
