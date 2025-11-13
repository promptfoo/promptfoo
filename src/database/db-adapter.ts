import { getEnvBool } from '../envars';

/**
 * Determines which database backend to use based on environment variables.
 * Checks for explicit PROMPTFOO_USE_MYSQL flag or auto-detects when MySQL
 * connection parameters are set (host and database).
 * 
 * @returns {boolean} True if MySQL should be used, false for SQLite (default)
 */
export function shouldUseMysql(): boolean {
  // Check explicit flag
  if (getEnvBool('PROMPTFOO_USE_MYSQL', false)) {
    return true;
  }

  // Auto-detect based on MySQL environment variables
  const mysqlHost = process.env.PROMPTFOO_MYSQL_HOST;
  const mysqlDatabase = process.env.PROMPTFOO_MYSQL_DATABASE;

  // Use MySQL if host and database are set, but not during testing
  return !!(mysqlHost && mysqlDatabase) && !getEnvBool('IS_TESTING');
}

/**
 * Gets the appropriate database instance based on configuration.
 * Dynamically imports and returns either MySQL or SQLite database.
 * 
 * @returns {Promise<any>} Database instance (Drizzle ORM)
 */
export async function getDb() {
  if (shouldUseMysql()) {
    const { getDb: getMysqlDb } = await import('./mysql-index');
    return getMysqlDb();
  } else {
    const { getDb: getSqliteDb } = await import('./index');
    return getSqliteDb();
  }
}

/**
 * Closes the database connection.
 * Routes to appropriate close function based on database backend.
 * 
 * @returns {Promise<void>}
 */
export async function closeDb() {
  if (shouldUseMysql()) {
    const { closeDb: closeMysqlDb } = await import('./mysql-index');
    return closeMysqlDb();
  } else {
    const { closeDb: closeSqliteDb } = await import('./index');
    return closeSqliteDb();
  }
}

/**
 * Checks if the database connection is currently open.
 * 
 * @returns {boolean} True if database is connected, false otherwise
 */
export function isDbOpen(): boolean {
  if (shouldUseMysql()) {
    const { isDbOpen: isMysqlDbOpen } = require('./mysql-index');
    return isMysqlDbOpen();
  } else {
    const { isDbOpen: isSqliteDbOpen } = require('./index');
    return isSqliteDbOpen();
  }
}

/**
 * Runs database migrations for the configured backend.
 * Applies schema changes and ensures database is up to date.
 * 
 * @returns {Promise<void>}
 * @throws {Error} If migration fails
 */
export async function runDbMigrations(): Promise<void> {
  if (shouldUseMysql()) {
    const { runMysqlDbMigrations } = await import('./mysql-migrate');
    return runMysqlDbMigrations();
  } else {
    const { runDbMigrations: runSqliteMigrations } = await import('../migrate');
    return runSqliteMigrations();
  }
}

/**
 * Gets the file path for database storage.
 * 
 * @returns {string} Absolute path to database file or config directory
 */
export function getDbPath() {
  if (shouldUseMysql()) {
    const { getDbPath: getMysqlDbPath } = require('./mysql-index');
    return getMysqlDbPath();
  } else {
    const { getDbPath: getSqliteDbPath } = require('./index');
    return getSqliteDbPath();
  }
}

/**
 * Gets the file path for the evaluation signal/timestamp file.
 * Used to track when evaluations were last written.
 * 
 * @returns {string} Absolute path to signal file
 */
export function getDbSignalPath() {
  if (shouldUseMysql()) {
    const { getDbSignalPath: getMysqlDbSignalPath } = require('./mysql-index');
    return getMysqlDbSignalPath();
  } else {
    const { getDbSignalPath: getSqliteDbSignalPath } = require('./index');
    return getSqliteDbSignalPath();
  }
}