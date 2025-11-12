import * as path from 'path';

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { getDbAsync, isMysqlMode } from './database/index';
import logger from './logger';

/**
 * Run migrations on the database, skipping the ones already applied. Also creates the sqlite db if it doesn't exist.
 *
 * Note: While the underlying drizzle-orm migrate() function is synchronous, we wrap it in a Promise
 * with setImmediate to avoid blocking the event loop during startup. This allows other async
 * operations to proceed while migrations run.
 */
export async function runDbMigrations(): Promise<void> {
  // Check if MySQL mode is enabled
  if (isMysqlMode()) {
    // Use MySQL migrations
    const { runMysqlDbMigrations } = await import('./database/mysql-migrate');
    return runMysqlDbMigrations();
  }

  // Use SQLite migrations
  return new Promise((resolve, reject) => {
    // Run the synchronous migration in the next tick to avoid blocking
    setImmediate(async () => {
      try {
        const db = await getDbAsync();
        const migrationsFolder = path.join(__dirname, '..', 'drizzle');
        logger.debug(`Running SQLite database migrations...`);
        migrate(db, { migrationsFolder });
        logger.debug('SQLite database migrations completed');
        resolve();
      } catch (error) {
        logger.error(`SQLite database migration failed: ${error}`);
        reject(error);
      }
    });
  });
}

if (require.main === module) {
  // Run migrations and exit with appropriate code
  runDbMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
