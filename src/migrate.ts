import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as path from 'node:path';
import { getDirname } from './util/paths.js';
import { getDb } from './database';
import logger from './logger';

/**
 * Run database migrations
 * This function applies all pending migrations to the database
 */
export async function runDbMigrations() {
  try {
    const db = getDb();
    const migrationsFolder = path.join(getDirname(import.meta.url), '..', 'drizzle');
    logger.debug(`[DB Migrate] Running migrations from ${migrationsFolder}...`);
    await migrate(db, { migrationsFolder });
    logger.debug('[DB Migrate] Migrations completed');
  } catch (error) {
    logger.error(`Error running database migrations: ${error}`);
  }
}
