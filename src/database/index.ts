import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { DefaultLogger, type LogWriter } from 'drizzle-orm/logger';
import * as path from 'path';
import { getEnvBool } from '../envars';
import logger from '../logger';
import { getConfigDirectoryPath } from '../util/config/manage';

let mysqlModule: any = null;
let mysqlDrizzle: any = null;
let mysqlIndex: any = null;

/**
 * Determines whether MySQL should be used instead of SQLite.
 * Checks for explicit PROMPTFOO_USE_MYSQL flag or presence of MySQL environment variables.
 * 
 * @returns {boolean} True if MySQL should be used, false for SQLite
 */
export function shouldUseMysql(): boolean {
  // Check explicit flag
  if (getEnvBool('PROMPTFOO_USE_MYSQL', false)) {
    return true;
  }
  
  const mysqlHost = process.env.PROMPTFOO_MYSQL_HOST;
  const mysqlDatabase = process.env.PROMPTFOO_MYSQL_DATABASE;
  
  return !!(mysqlHost && mysqlDatabase) && !getEnvBool('IS_TESTING');
}

/**
 * Lazily loads MySQL modules to avoid errors if mysql2 package is not installed.
 * Modules are cached after first successful load.
 * 
 * @returns {boolean} True if modules loaded successfully, false otherwise
 */
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

/**
 * Custom log writer for Drizzle ORM that respects PROMPTFOO_ENABLE_DATABASE_LOGS setting.
 */
export class DrizzleLogWriter implements LogWriter {
  write(message: string) {
    if (getEnvBool('PROMPTFOO_ENABLE_DATABASE_LOGS', false)) {
      logger.debug(`Drizzle: ${message}`);
    }
  }
}

let dbInstance: ReturnType<typeof drizzle> | null = null;
let sqliteInstance: Database.Database | null = null;

/**
 * Gets the database file path or MySQL config path.
 * 
 * @returns {string} Absolute path to the database file or MySQL config directory
 */
export function getDbPath() {
  if (shouldUseMysql() && mysqlIndex) {
    return mysqlIndex.getDbPath();
  }
  return path.resolve(getConfigDirectoryPath(true /* createIfNotExists */), 'promptfoo.db');
}

/**
 * Gets the path to the signal file used to track when evaluations are written.
 * 
 * @returns {string} Absolute path to the signal file
 */
export function getDbSignalPath() {
  if (shouldUseMysql() && mysqlIndex) {
    return mysqlIndex.getDbSignalPath();
  }
  return path.resolve(getConfigDirectoryPath(true /* createIfNotExists */), 'evalLastWritten');
}

/**
 * Gets or creates the database instance (SQLite or MySQL).
 * Automatically configures WAL mode for SQLite when applicable.
 * 
 * @returns {ReturnType<typeof drizzle>} Drizzle ORM database instance
 */
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

    logger.debug('Using SQLite database');
    const isMemoryDb = getEnvBool('IS_TESTING');
    const dbPath = isMemoryDb ? ':memory:' : getDbPath();

    sqliteInstance = new Database(dbPath);

    if (!isMemoryDb && !getEnvBool('PROMPTFOO_DISABLE_WAL_MODE', false)) {
      try {
        sqliteInstance.pragma('journal_mode = WAL');

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

        sqliteInstance.pragma('wal_autocheckpoint = 1000');
        sqliteInstance.pragma('synchronous = NORMAL');
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
 * Async version of getDb that properly handles both MySQL and SQLite.
 * For MySQL, awaits the async connection. For SQLite, returns the sync instance.
 * 
 * @returns {Promise<ReturnType<typeof drizzle>>} Promise resolving to Drizzle ORM database instance
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
  
  return getDb();
}

/**
 * Universal transaction wrapper that works with both SQLite and MySQL.
 * For SQLite, wraps async operations in a manual BEGIN/COMMIT transaction using the raw database.
 * 
 * @template T - Return type of the callback function
 * @param {(db: any) => T | Promise<T>} callback - Function to execute within transaction
 * @returns {Promise<T>} Promise resolving to the callback's return value
 */
export async function withTransaction<T>(callback: (db: any) => T | Promise<T>): Promise<T> {
  if (shouldUseMysql()) {
    if (loadMysqlModules()) {
      const db = await mysqlIndex.getDb();
      // MySQL uses async transactions
      return db.transaction(async (tx: any) => callback(tx));
    }
  }

  // SQLite: For async callbacks, use manual transaction control with raw database
  const db = getDb();
  
  // Check if callback is async
  const isAsync = callback.constructor.name === 'AsyncFunction';
  
  if (isAsync) {
    // Get the raw better-sqlite3 database instance
    const rawDb = (db as any).$client || sqliteInstance;
    if (!rawDb) {
      throw new Error('Unable to access raw SQLite database for transaction');
    }
    
    // Manual transaction for async operations
    rawDb.prepare('BEGIN').run();
    try {
      const result = await callback(db);
      rawDb.prepare('COMMIT').run();
      return result;
    } catch (error) {
      rawDb.prepare('ROLLBACK').run();
      throw error;
    }
  } else {
    // Synchronous callback can use better-sqlite3's transaction()
    const rawDb = (db as any).$client || sqliteInstance;
    if (!rawDb) {
      throw new Error('Unable to access raw SQLite database for transaction');
    }
    const runTransaction = rawDb.transaction(() => callback(db));
    return runTransaction();
  }
}

/**
 * Closes the database connection and performs cleanup.
 * For SQLite, checkpoints WAL file before closing.
 * For MySQL, closes the connection pool.
 * 
 * @returns {Promise<void>}
 */
export async function closeDb() {
  if (shouldUseMysql() && mysqlIndex) {
    // Close MySQL connection
    await mysqlIndex.closeDb();
    dbInstance = null;
  } else if (sqliteInstance) {
    try {
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
 * Checks if the database is currently open.
 * 
 * @returns {boolean} True if database connection is open, false otherwise
 */
export function isDbOpen(): boolean {
  if (shouldUseMysql() && mysqlIndex) {
    return mysqlIndex.isDbOpen();
  }
  return sqliteInstance !== null && dbInstance !== null;
}

/**
 * Tests the MySQL connection to verify connectivity.
 * Requires MySQL to be configured via environment variables.
 * 
 * @returns {Promise<boolean>} Promise resolving to true if connection successful
 * @throws {Error} If MySQL is not configured or modules not available
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
 * Checks if MySQL mode is currently enabled.
 * 
 * @returns {boolean} True if MySQL mode is active, false if using SQLite
 */
export function isMysqlMode(): boolean {
  return shouldUseMysql();
}

/**
 * Converts a Date object to the appropriate format for the current database.
 * MySQL expects Date objects, SQLite expects Unix timestamps (numbers).
 * 
 * @param {Date} date - The date to convert
 * @returns {Date | number} Date object for MySQL, Unix timestamp for SQLite
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
 * Database-agnostic conflict resolution for insert operations.
 * SQLite uses onConflictDoNothing(), MySQL requires try/catch handling.
 * 
 * @param {any} insertQuery - The insert query to modify
 * @returns {any} Modified query with conflict handling
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
 * Universal database access function that works with both MySQL and SQLite.
 * Should be used in static methods and other contexts requiring database access.
 * 
 * @returns {Promise<ReturnType<typeof drizzle>>} Promise resolving to database instance
 */
export async function getDbUniversal() {
  if (shouldUseMysql()) {
    return await getDbAsync();
  } else {
    return getDb();
  }
}

/**
 * Executes an insert query with conflict handling for MySQL.
 * Ignores duplicate key errors (ER_DUP_ENTRY) as expected behavior.
 * For SQLite, use onConflictDoNothing() directly on the query.
 * 
 * @param {any} insertQuery - The insert query to execute
 * @returns {Promise<void>}
 * @throws {Error} Re-throws non-duplicate key errors
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
 * Executes an insert query with RETURNING support for both databases.
 * MySQL doesn't support RETURNING, so returns insert metadata instead.
 * SQLite supports RETURNING and returns the actual inserted rows.
 * 
 * @param {any} insertQuery - The insert query to execute
 * @param {any} returningColumns - Columns to return (SQLite only)
 * @returns {Promise<any>} Insert result (format varies by database)
 * - MySQL: { insertId: number, affectedRows: number } or null on duplicate
 * - SQLite: Array of inserted rows with selected columns
 */
export async function executeInsertWithReturning(insertQuery: any, returningColumns: any) {
    if (shouldUseMysql()) {
        try {
            const result = await insertQuery;
            return {
                insertId: result.insertId,
                affectedRows: result.affectedRows
            };
        } catch (error) {
            const isDuplicateKey = (error as any).code === 'ER_DUP_ENTRY' ||
                (error as any).errno === 1062 ||
                ((error as any).cause && ((error as any).cause.code === 'ER_DUP_ENTRY' || (error as any).cause.errno === 1062)) ||
                ((error as any).message && (error as any).message.includes('Duplicate entry'));
            
            if (isDuplicateKey) {
                return null;
            }
            throw error;
        }
    } else {
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
 * Checks if the current database supports the RETURNING clause.
 * SQLite supports RETURNING, MySQL does not.
 * 
 * @returns {boolean} True if database supports RETURNING clause
 */
export function supportsReturning() {
    return !shouldUseMysql();
}
