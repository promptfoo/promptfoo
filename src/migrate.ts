import * as path from 'path';

import { migrate } from 'drizzle-orm/libsql/migrator';
import { getDb } from './database';
import logger from './logger';

/**
 * Run migrations on the database, skipping the ones already applied. Also creates the sqlite db if it doesn't exist.
 */
export async function runDbMigrations(): Promise<void> {
  try {
    const db = getDb();
    const migrationsFolder = path.join(__dirname, '..', 'drizzle');
    logger.debug(`Running database migrations...`);
    await migrate(db, { migrationsFolder });
    logger.debug('Database migrations completed');
  } catch (error) {
    logger.error(`Database migration failed: ${error}`);
    throw error;
  }
}

if (require.main === module) {
  // Run migrations and exit with appropriate code
  runDbMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
