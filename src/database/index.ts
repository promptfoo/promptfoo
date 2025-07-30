import * as path from 'path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
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
let sqliteInstance: Database.Database | null = null;

export function getDbPath() {
  return path.resolve(getConfigDirectoryPath(true /* createIfNotExists */), 'promptfoo.db');
}

export function getDbSignalPath() {
  return path.resolve(getConfigDirectoryPath(true /* createIfNotExists */), 'evalLastWritten');
}

export function getDb() {
  if (!dbInstance) {
    const isMemoryDb = getEnvBool('IS_TESTING');
    const dbPath = isMemoryDb ? ':memory:' : getDbPath();

    sqliteInstance = new Database(dbPath);

    // Configure WAL mode unless explicitly disabled or using in-memory database
    if (!isMemoryDb && !getEnvBool('PROMPTFOO_DISABLE_WAL_MODE', false)) {
      try {
        // Enable WAL mode for better concurrency
        sqliteInstance.pragma('journal_mode = WAL');

        // Verify WAL mode was actually enabled
        const result = sqliteInstance.prepare('PRAGMA journal_mode').get() as {
          journal_mode: string;
        };

        if (result.journal_mode.toLowerCase() === 'wal') {
          logger.debug('Successfully enabled SQLite WAL mode');
        } else {
          logger.warn(
            `Failed to enable WAL mode (got '${result.journal_mode}'). ` +
              'Database performance may be reduced. This can happen on network filesystems. ' +
              'Set PROMPTFOO_DISABLE_WAL_MODE=true to suppress this warning.',
          );
        }

        // Additional WAL configuration for optimal performance
        sqliteInstance.pragma('wal_autocheckpoint = 1000'); // Checkpoint every 1000 pages
        sqliteInstance.pragma('synchronous = NORMAL'); // Good balance of safety and speed with WAL
      } catch (err) {
        logger.warn(
          `Error configuring SQLite WAL mode: ${err}. ` +
            'Database will use default journal mode. Performance may be reduced. ' +
            'This can happen on network filesystems or certain containerized environments. ' +
            'Set PROMPTFOO_DISABLE_WAL_MODE=true to suppress this warning.',
        );
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
      // Attempt to checkpoint WAL file before closing
      if (!getEnvBool('IS_TESTING') && !getEnvBool('PROMPTFOO_DISABLE_WAL_MODE', false)) {
        try {
          sqliteInstance.pragma('wal_checkpoint(TRUNCATE)');
          logger.debug('Successfully checkpointed WAL file before closing');
        } catch (err) {
          logger.debug(`Could not checkpoint WAL file: ${err}`);
        }
      }

      sqliteInstance.close();
      logger.debug('Database connection closed successfully');
    } catch (err) {
      logger.error(`Error closing database connection: ${err}`);
      // Even if close fails, we should still clear the instances
      // to prevent reuse of a potentially corrupted connection
    } finally {
      sqliteInstance = null;
      dbInstance = null;
    }
  }
}

/**
 * Check if the database is currently open
 */
export function isDbOpen(): boolean {
  return sqliteInstance !== null && dbInstance !== null;
}
