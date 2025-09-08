import * as os from 'os';
import * as path from 'path';

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { DefaultLogger, type LogWriter } from 'drizzle-orm/logger';
import { getEnvBool } from '../envars';
import logger from '../logger';
import { getConfigDirectoryPath } from '../util/config/manage';

export class DrizzleLogWriter implements LogWriter {
  write(message: string) {
    if (getEnvBool('PROMPTFOO_ENABLE_DATABASE_LOGS', false)) {
      logger.debug(`Drizzle: ${message}`);
    }
  }
}

let dbInstance: ReturnType<typeof drizzle> | null = null;
let sqliteInstance: ReturnType<typeof createClient> | null = null;

// Simple queue to serialize database operations to avoid SQLITE_BUSY errors
// This is necessary because libSQL doesn't support busy_timeout like better-sqlite3
class DatabaseOperationQueue {
  private queue: Array<{
    operation: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];
  private processing = false;

  async enqueue<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ operation, resolve, reject });
      this.process();
    });
  }

  private async process() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const { operation, resolve, reject } = this.queue.shift()!;
      try {
        const result = await operation();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }

    this.processing = false;
  }
}

const dbQueue = new DatabaseOperationQueue();

export function getDbPath() {
  return path.resolve(getConfigDirectoryPath(true /* createIfNotExists */), 'promptfoo.db');
}

export function getDbSignalPath() {
  return path.resolve(getConfigDirectoryPath(true /* createIfNotExists */), 'evalLastWritten');
}

export function getDb() {
  if (!dbInstance) {
    const isMemoryDb = getEnvBool('IS_TESTING');
    const testDbId = process.env.TEST_DB_ID;

    let dbUrl: string;
    if (isMemoryDb) {
      // Use temporary file databases for tests
      // libSQL's in-memory mode seems to have issues with persistence
      const tmpDir = os.tmpdir();
      const testId = testDbId || `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const dbPath = path.join(tmpDir, `promptfoo-test-${testId}.db`);
      dbUrl = `file:${dbPath}`;
    } else {
      const dbPath = getDbPath();
      dbUrl = `file:${dbPath}`;
    }

    sqliteInstance = createClient({
      url: dbUrl,
      // Add connection options for better performance and concurrency
      syncUrl: undefined, // Local file mode only
    });

    // Note: WAL mode is enabled by default in libSQL
    // Additional pragmas can be executed via sqliteInstance.execute() if needed
    if (!isMemoryDb && !getEnvBool('PROMPTFOO_DISABLE_WAL_MODE', false)) {
      try {
        // libSQL has WAL mode enabled by default, but we can verify
        logger.debug('Using libSQL with default WAL mode enabled');
      } catch (err) {
        logger.warn(`Error with libSQL configuration: ${err}`);
      }
    }

    const drizzleLogger = new DefaultLogger({ writer: new DrizzleLogWriter() });
    dbInstance = drizzle(sqliteInstance, { logger: drizzleLogger });
  }
  return dbInstance;
}

export function closeDb() {
  if (sqliteInstance) {
    try {
      // libSQL client has a close method for proper cleanup
      if (typeof sqliteInstance.close === 'function') {
        sqliteInstance.close();
        logger.debug('Database connection closed properly');
      } else {
        // Fallback for older versions
        logger.debug('Database connection cleanup completed (no close method)');
      }
    } catch (err) {
      logger.error(`Error during database cleanup: ${err}`);
    } finally {
      sqliteInstance = null;
      dbInstance = null;
    }
  }
}

/**
 * Check if the database is currently open
 * @returns true if database connection is active
 */
export function isDbOpen(): boolean {
  return sqliteInstance !== null && dbInstance !== null;
}

/**
 * Wrapper for database operations that provides better error handling for libSQL
 * @param operation - The database operation to perform
 * @param context - Context for error reporting
 * @param options - Options for handling the operation
 * @returns Promise with the operation result
 */
export async function withDbErrorHandling<T>(
  operation: () => Promise<T>,
  context: string = 'database operation',
  options: { 
    maxRetries?: number;
    useQueue?: boolean; // For write operations that need serialization
  } = {}
): Promise<T> {
  const { maxRetries = 5, useQueue = false } = options;
  
  const executeOperation = async (): Promise<T> => {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        
        // Handle libSQL-specific errors
        if (error?.code === 'SQLITE_BUSY' || error?.message?.includes('database is locked')) {
          if (attempt < maxRetries) {
            // Exponential backoff: 50ms, 100ms, 200ms, 400ms, 800ms
            const delay = 50 * Math.pow(2, attempt);
            logger.debug(`Database busy during ${context}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          } else {
            logger.error(`Database operation ${context} failed after ${maxRetries + 1} attempts: ${error.message}`);
            throw new Error(`Database is consistently busy for ${context}. This indicates high contention or a deadlock situation.`);
          }
        } else if (error?.code === 'SQLITE_ERROR' && error?.message?.includes('no such column')) {
          logger.error(`Database schema error during ${context}: ${error.message}`);
          throw new Error(`Database schema issue in ${context}: ${error.message}. This may indicate a migration problem.`);
        } else if (error?.code?.startsWith?.('SQLITE_')) {
          logger.error(`libSQL error during ${context}: ${error.code} - ${error.message}`);
          throw new Error(`Database error in ${context}: ${error.message}`);
        }
        
        // Re-throw other errors immediately (no retry for non-busy errors)
        throw error;
      }
    }
    
    // This should never be reached, but just in case
    throw lastError;
  };

  // Use queue for write operations to prevent concurrent database access
  if (useQueue) {
    return dbQueue.enqueue(executeOperation);
  }

  return executeOperation();
}
