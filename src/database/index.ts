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

export function getDbPath() {
  return path.resolve(getConfigDirectoryPath(true /* createIfNotExists */), 'promptfoo.db');
}

export function getDbSignalPath() {
  return path.resolve(getConfigDirectoryPath(true /* createIfNotExists */), 'evalLastWritten');
}

export function getDb() {
  if (!dbInstance) {
    const sqlite = new Database(process.env.IS_TESTING ? ':memory:' : getDbPath());
    const logger = new DefaultLogger({ writer: new DrizzleLogWriter() });
    dbInstance = drizzle(sqlite, { logger });
  }
  return dbInstance;
}
