import * as path from 'path';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Use currentDir instead of __dirname to avoid Jest/CJS conflicts
// Guard import.meta usage for dual CJS/ESM builds
const currentDir = (() => {
  if (typeof process.env.BUILD_FORMAT === 'undefined' || process.env.BUILD_FORMAT === 'esm') {
    return path.dirname(fileURLToPath(import.meta.url));
  }
  return __dirname;
})();

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { getDb } from './database/index';
import logger from './logger';

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
        const migrationsFolder = path.join(currentDir, '..', 'drizzle');
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

// ESM replacement for require.main === module check
if (typeof process.env.BUILD_FORMAT === 'undefined' || process.env.BUILD_FORMAT === 'esm') {
  if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
    // Run migrations and exit with appropriate code
    runDbMigrations()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  }
}
