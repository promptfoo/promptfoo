import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { DefaultLogger, type LogWriter } from 'drizzle-orm/logger';
import * as path from 'path';
import { getEnvBool } from '../envars';
import logger from '../logger';
import { getConfigDirectoryPath } from '../util/config/manage';

// MySQL imports - conditional
let mysqlModule: any = null;
let mysqlDrizzle: any = null;
let mysqlIndex: any = null;

// Detect if MySQL should be used
export function shouldUseMysql(): boolean {
  // Check explicit flag
  if (getEnvBool('PROMPTFOO_USE_MYSQL', false)) {
    return true;
  }
  
  // Check if MySQL environment variables are set
  const mysqlHost = process.env.PROMPTFOO_MYSQL_HOST;
  const mysqlDatabase = process.env.PROMPTFOO_MYSQL_DATABASE;
  
  // Use MySQL if host is explicitly set (and not testing)
  return !!(mysqlHost && mysqlDatabase) && !getEnvBool('IS_TESTING');
}

// Lazy load MySQL modules to avoid errors if mysql2 is not installed
function loadMysqlModules() {
  if (!mysqlModule) {
    try {
      mysqlModule = require('mysql2/promise');
      mysqlDrizzle = require('drizzle-orm/mysql2');
      mysqlIndex = require('./mysql-index');
      logger.debug('MySQL modules loaded successfully');
    } catch (error) {
      logger.warn(`MySQL modules not available, falling back to SQLite: ${error}`);
      return false;
    }
  }
  return true;
}

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
  if (shouldUseMysql() && mysqlIndex) {
    return mysqlIndex.getDbPath();
  }
  return path.resolve(getConfigDirectoryPath(true /* createIfNotExists */), 'promptfoo.db');
}

export function getDbSignalPath() {
  if (shouldUseMysql() && mysqlIndex) {
    return mysqlIndex.getDbSignalPath();
  }
  return path.resolve(getConfigDirectoryPath(true /* createIfNotExists */), 'evalLastWritten');
}

export function getDb() {
  if (!dbInstance) {
    // Check if MySQL should be used
    if (shouldUseMysql()) {
      if (loadMysqlModules()) {
        logger.debug('Using MySQL database');
        // Return MySQL database instance (async)
        return mysqlIndex.getDb();
      } else {
        logger.warn('MySQL modules not available, falling back to SQLite');
      }
    }

    // Default to SQLite (synchronous)
    logger.debug('Using SQLite database');
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

/**
 * Async version of getDb that properly handles both MySQL and SQLite
 */
export async function getDbAsync() {
  if (shouldUseMysql()) {
    if (loadMysqlModules()) {
      logger.debug('Using MySQL database (async)');
      return await mysqlIndex.getDb();
    } else {
      logger.warn('MySQL modules not available, falling back to SQLite');
    }
  }
  
  // For SQLite, just return the sync version
  return getDb();
}

/**
 * Universal transaction wrapper that works with both SQLite and MySQL
 */
export async function withTransaction<T>(callback: (db: any) => T | Promise<T>): Promise<T> {
  if (shouldUseMysql()) {
    if (loadMysqlModules()) {
      const db = await mysqlIndex.getDb();
      // MySQL uses async transactions
      return await db.transaction(async (tx: any) => {
        return await callback(tx);
      });
    }
  }
  
  // SQLite doesn't support async transactions, so we handle it differently
  const db = getDb();
  
  // Check if the callback is async by calling it and checking if it returns a Promise
  const result = callback(db);
  if (result && typeof (result as any).then === 'function') {
    // If it's a Promise, we can't use SQLite transactions with async callbacks
    // Just execute the callback directly (this is acceptable for most use cases)
    return await (result as Promise<T>);
  } else {
    // If it's synchronous, we can use the transaction
    return db.transaction(() => {
      return callback(db);
    })();
  }
}

export async function closeDb() {
  if (shouldUseMysql() && mysqlIndex) {
    // Close MySQL connection
    await mysqlIndex.closeDb();
    dbInstance = null;
  } else if (sqliteInstance) {
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
  if (shouldUseMysql() && mysqlIndex) {
    return mysqlIndex.isDbOpen();
  }
  return sqliteInstance !== null && dbInstance !== null;
}

/**
 * Test MySQL connection (only works if MySQL is configured)
 */
export async function testMysqlConnection(): Promise<boolean> {
  if (!shouldUseMysql()) {
    throw new Error('MySQL is not configured. Please set PROMPTFOO_MYSQL_HOST and PROMPTFOO_MYSQL_DATABASE environment variables.');
  }
  
  if (!loadMysqlModules()) {
    throw new Error('MySQL modules not available. Please install mysql2 package.');
  }
  
  return await mysqlIndex.testMysqlConnection();
}

/**
 * Check if MySQL mode is enabled
 */
export function isMysqlMode(): boolean {
  return shouldUseMysql();
}

/**
 * Helper function to convert Date to appropriate format for the current database
 */
export function convertDateForDb(date: Date): Date | number {
  if (shouldUseMysql()) {
    // MySQL expects Date objects for timestamp columns
    return date;
  } else {
    // SQLite expects Unix timestamps (numbers) for integer columns
    return date.getTime();
  }
}

/**
 * Database-agnostic conflict resolution for insert operations
 * SQLite: uses onConflictDoNothing()
 * MySQL: uses INSERT IGNORE pattern or try/catch
 */
export function handleInsertConflict(insertQuery: any): any {
  if (shouldUseMysql()) {
    // MySQL: Use INSERT IGNORE pattern by modifying the query
    // We'll wrap in a try/catch in the calling code instead
    return insertQuery;
  } else {
    // SQLite: Use onConflictDoNothing
    return insertQuery.onConflictDoNothing();
  }
}

/**
 * Universal database access function that works with both MySQL and SQLite
 * This should be used in static methods and other contexts where you need database access
 */
export async function getDbUniversal() {
  if (shouldUseMysql()) {
    return await getDbAsync();
  } else {
    return getDb();
  }
}

/**
 * Execute insert with conflict handling for MySQL
 */
export async function executeInsertWithConflictHandling(insertQuery: any): Promise<void> {
  if (shouldUseMysql()) {
    try {
      await insertQuery;
    } catch (error: any) {
      // Check if it's a duplicate key error
      // Handle both direct MySQL errors and Drizzle-wrapped errors
      const isDuplicateKey = 
        error.code === 'ER_DUP_ENTRY' || 
        error.errno === 1062 ||
        (error.cause && (error.cause.code === 'ER_DUP_ENTRY' || error.cause.errno === 1062)) ||
        (error.message && error.message.includes('Duplicate entry'));
      
      if (isDuplicateKey) {
        // Ignore duplicate key errors - this is expected behavior
        return;
      }
      
      // Re-throw other errors
      throw error;
    }
  } else {
    // SQLite: Use the conflict resolution directly
    await insertQuery.onConflictDoNothing();
  }
}


/**
 * Execute insert with returning support for both databases
 * MySQL doesn't support RETURNING, so we need to handle it differently
 */
export async function executeInsertWithReturning(insertQuery: any, returningColumns: any) {
    if (shouldUseMysql()) {
        // MySQL doesn't support RETURNING clause
        try {
            const result = await insertQuery;
            // Return the insert result metadata instead
            return {
                insertId: result.insertId,
                affectedRows: result.affectedRows
            };
        } catch (error) {
            // Handle duplicate key errors like in executeInsertWithConflictHandling
            const isDuplicateKey = (error as any).code === 'ER_DUP_ENTRY' ||
                (error as any).errno === 1062 ||
                ((error as any).cause && ((error as any).cause.code === 'ER_DUP_ENTRY' || (error as any).cause.errno === 1062)) ||
                ((error as any).message && (error as any).message.includes('Duplicate entry'));
            
            if (isDuplicateKey) {
                // Return null for duplicates
                return null;
            }
            throw error;
        }
    } else {
        // SQLite supports RETURNING
        if (returningColumns && Array.isArray(returningColumns)) {
            return await insertQuery.returning(returningColumns.reduce((acc, col) => {
                acc[col] = true;
                return acc;
            }, {}));
        } else {
            return await insertQuery.returning();
        }
    }
}

/**
 * Check if the current database supports RETURNING clause
 */
export function supportsReturning() {
    return !shouldUseMysql();
}
