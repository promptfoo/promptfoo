import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from './database';
import logger from './logger';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Run migrations on the database, skipping the ones already applied. Also creates the sqlite db if it doesn't exist.
 */
export async function runDbMigrations() {
  try {
    const db = getDb();
    const migrationsFolder = path.join(currentDir, '..', 'drizzle');
    logger.debug(`[DB Migrate] Running migrations from ${migrationsFolder}...`);
    await migrate(db, { migrationsFolder });
    logger.debug('[DB Migrate] Migrations completed');
  } catch (error) {
    logger.error(`Error running database migrations: ${error}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDbMigrations();
}

export { currentDir };
