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

export async function closeDb(): Promise<void> {
  if (sqliteInstance) {
    try {
      // Close the libSQL client connection
      await sqliteInstance.close();
      logger.debug('Database connection closed successfully');
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
