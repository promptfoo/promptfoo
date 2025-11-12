import { getEnvBool } from '../envars';

// Database configuration switching logic
export function shouldUseMysql(): boolean {
  return getEnvBool('PROMPTFOO_USE_MYSQL', false);
}

// Export appropriate database module based on configuration
export async function getDb() {
  if (shouldUseMysql()) {
    const { getDb: getMysqlDb } = await import('./mysql-index');
    return getMysqlDb();
  } else {
    const { getDb: getSqliteDb } = await import('./index');
    return getSqliteDb();
  }
}

export async function closeDb() {
  if (shouldUseMysql()) {
    const { closeDb: closeMysqlDb } = await import('./mysql-index');
    return closeMysqlDb();
  } else {
    const { closeDb: closeSqliteDb } = await import('./index');
    return closeSqliteDb();
  }
}

export function isDbOpen(): boolean {
  if (shouldUseMysql()) {
    const { isDbOpen: isMysqlDbOpen } = require('./mysql-index');
    return isMysqlDbOpen();
  } else {
    const { isDbOpen: isSqliteDbOpen } = require('./index');
    return isSqliteDbOpen();
  }
}

export async function runDbMigrations(): Promise<void> {
  if (shouldUseMysql()) {
    const { runMysqlDbMigrations } = await import('./mysql-migrate');
    return runMysqlDbMigrations();
  } else {
    const { runDbMigrations: runSqliteMigrations } = await import('../migrate');
    return runSqliteMigrations();
  }
}

export function getDbPath() {
  if (shouldUseMysql()) {
    const { getDbPath: getMysqlDbPath } = require('./mysql-index');
    return getMysqlDbPath();
  } else {
    const { getDbPath: getSqliteDbPath } = require('./index');
    return getSqliteDbPath();
  }
}

export function getDbSignalPath() {
  if (shouldUseMysql()) {
    const { getDbSignalPath: getMysqlDbSignalPath } = require('./mysql-index');
    return getMysqlDbSignalPath();
  } else {
    const { getDbSignalPath: getSqliteDbSignalPath } = require('./index');
    return getSqliteDbSignalPath();
  }
}