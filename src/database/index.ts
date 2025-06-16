import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { DefaultLogger, type LogWriter } from 'drizzle-orm/logger';
import * as path from 'path';
import { getEnvBool } from '../envars';
import logger from '../logger';
import { getConfigDirectoryPath } from '../util/config/manage';

class DrizzleLogWriter implements LogWriter {
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
    sqliteInstance = new Database(getEnvBool('IS_TESTING') ? ':memory:' : getDbPath());
    try {
      sqliteInstance.pragma('journal_mode = WAL');
    } catch {}
    const logger = new DefaultLogger({ writer: new DrizzleLogWriter() });
    dbInstance = drizzle(sqliteInstance, { logger });
  }
  return dbInstance;
}

export function closeDb() {
  if (sqliteInstance) {
    try {
      sqliteInstance.close();
      sqliteInstance = null;
      dbInstance = null;
    } catch (err) {
      logger.error(`Error closing database connection: ${err}`);
    }
  }
}

export { DrizzleLogWriter, dbInstance, sqliteInstance };
