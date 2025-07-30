import * as path from 'path';

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { getDb } from './database';
import logger from './logger';

/**
 * Get the directory name of the current file.
 * This is a workaround to support both CommonJS and ESM.
 */
const dirname = (() => {
  try {
    // ES module approach
    // @ts-expect-error - `module` is set to "CommonJS" in the tsconfig.json file
    return path.dirname(new URL(import.meta.url).pathname);
  } catch {
    // CommonJS approach (global __dirname is available)
    return __dirname;
  }
})();

/**
 * Run migrations on the database, skipping the ones already applied. Also creates the sqlite db if it doesn't exist.
 *
 * Note: While the underlying drizzle-orm migrate() function is synchronous, we wrap it in a Promise
 * with setImmediate to avoid blocking the event loop during startup. This allows other async
 * operations to proceed while migrations run.
 */
export async function runDbMigrations(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Run the synchronous migration in the next tick to avoid blocking
    setImmediate(() => {
      try {
        const db = getDb();
        const migrationsFolder = path.join(dirname, '..', 'drizzle');
        logger.debug(`Running database migrations...`);
        migrate(db, { migrationsFolder });
        logger.debug('Database migrations completed');
        resolve();
      } catch (error) {
        logger.error(`Database migration failed: ${error}`);
        reject(error);
      }
    });
  });
}
