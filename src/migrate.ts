import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as path from 'path';
import { getDb } from './database';
import logger from './logger';
import { getDirnameCompat } from './util/paths';

/**
 * Run migrations on the database, skipping the ones already applied. Also creates the sqlite db if it doesn't exist.
 */
export async function runDbMigrations() {
  try {
    const db = getDb();
    // @ts-ignore: import.meta.url is not available in CommonJS
    const currentDir = getDirnameCompat(typeof import.meta === 'undefined' ? undefined : import.meta.url);
    const migrationsFolder = path.join(currentDir, '..', 'drizzle');
    logger.debug(`[DB Migrate] Running migrations from ${migrationsFolder}...`);
    await migrate(db, { migrationsFolder });
    logger.debug('[DB Migrate] Migrations completed');
  } catch (error) {
    logger.error(`Error running database migrations: ${error}`);
  }
}

// Check if this file is being run directly
// @ts-ignore: import.meta.url is not available in CommonJS
if (typeof import.meta !== 'undefined' && import.meta.url === `file://${process.argv[1]}`) {
  runDbMigrations();
} else if (typeof require !== 'undefined' && require.main === module) {
  runDbMigrations();
}
