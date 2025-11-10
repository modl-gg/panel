import { Request, Response, NextFunction } from 'express';
import { Connection } from 'mongoose';

interface RateLimitEntry {
  apiKey: string;
  serverName: string;
  lastAttempt: Date;
  attemptCount: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const MAX_ATTEMPTS_PER_WINDOW = 3;

function cleanupOldEntries(): void {
  const now = Date.now();
  const expiredKeys: string[] = [];

  for (const [key, entry] of rateLimitStore.entries()) {
    if (now - entry.lastAttempt.getTime() > RATE_LIMIT_WINDOW) {
      expiredKeys.push(key);
    }
  }

  for (const key of expiredKeys) {
    rateLimitStore.delete(key);
  }
}

setInterval(cleanupOldEntries, 5 * 60 * 1000);

export async function migrationUploadRateLimit(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const apiKey = req.header('X-API-Key');
    const serverName = req.serverName;

    if (!apiKey || !serverName) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const rateLimitKey = `${serverName}:${apiKey}`;
    const now = new Date();

    let entry = rateLimitStore.get(rateLimitKey);

    if (!entry) {
      entry = {
        apiKey,
        serverName,
        lastAttempt: now,
        attemptCount: 1
      };
      rateLimitStore.set(rateLimitKey, entry);
      return next();
    }

    const timeSinceLastAttempt = now.getTime() - entry.lastAttempt.getTime();

    if (timeSinceLastAttempt < RATE_LIMIT_WINDOW) {
      if (entry.attemptCount >= MAX_ATTEMPTS_PER_WINDOW) {
        const remainingTime = Math.ceil((RATE_LIMIT_WINDOW - timeSinceLastAttempt) / 1000 / 60);
        
        res.status(429).json({
          error: 'Rate limit exceeded',
          message: `Too many migration upload attempts. Please wait ${remainingTime} minutes before trying again.`,
          retryAfter: Math.ceil(remainingTime * 60),
          nextAttemptAt: new Date(entry.lastAttempt.getTime() + RATE_LIMIT_WINDOW).toISOString()
        });
        return;
      }

      entry.attemptCount++;
      entry.lastAttempt = now;
    } else {
      entry.attemptCount = 1;
      entry.lastAttempt = now;
    }

    rateLimitStore.set(rateLimitKey, entry);
    next();
  } catch (error) {
    console.error('Error in migration rate limiter:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

interface MigrationCooldownEntry {
  serverName: string;
  lastSuccessfulMigration: Date;
  apiKey: string;
}

const cooldownStore = new Map<string, MigrationCooldownEntry>();

const COOLDOWN_PERIOD = 24 * 60 * 60 * 1000; // 24 hours

export async function updateMigrationCooldown(
  serverName: string,
  apiKey: string
): Promise<void> {
  const cooldownKey = `${serverName}:${apiKey}`;
  cooldownStore.set(cooldownKey, {
    serverName,
    lastSuccessfulMigration: new Date(),
    apiKey
  });
}

export async function checkMigrationCooldownByApiKey(
  serverName: string,
  apiKey: string,
  serverDbConnection: Connection
): Promise<{ onCooldown: boolean; remainingTime?: number }> {
  const cooldownKey = `${serverName}:${apiKey}`;
  const entry = cooldownStore.get(cooldownKey);

  if (!entry) {
    return { onCooldown: false };
  }

  const now = new Date();
  const timeSinceLastMigration = now.getTime() - entry.lastSuccessfulMigration.getTime();

  if (timeSinceLastMigration < COOLDOWN_PERIOD) {
    const remainingTime = COOLDOWN_PERIOD - timeSinceLastMigration;
    return { onCooldown: true, remainingTime };
  }

  return { onCooldown: false };
}

