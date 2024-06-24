import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as path from 'path';
import { getDb } from './database';
import logger from './logger';

/**
 * Run migrations on the database, skipping the ones already applied. Also creates the sqlite db if it doesn't exist.
 */
export async function runDbMigrations() {
  try {
    const db = getDb();
    const migrationsFolder = path.join(__dirname, '..', 'drizzle');
    logger.debug(`Running migrations from ${migrationsFolder}...`);
    await migrate(db, { migrationsFolder });
  } catch (error) {
    logger.error('Error running database migrations:', error);
  }
}

if (require.main === module) {
  runDbMigrations();
}
