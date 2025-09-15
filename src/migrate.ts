import * as path from 'path';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Global variable defined by build system
declare const BUILD_FORMAT: string | undefined;

// Use currentDir instead of __dirname to avoid Jest/CJS conflicts
// Guard import.meta usage for dual CJS/ESM builds
const currentDir = (() => {
  // Check if BUILD_FORMAT is available at compile time, otherwise check typeof for runtime
  const isESM = typeof BUILD_FORMAT !== 'undefined' && BUILD_FORMAT === 'esm';
  if (isESM) {
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
// Check if BUILD_FORMAT is available at compile time, otherwise check typeof for runtime
const isESM = typeof BUILD_FORMAT !== 'undefined' && BUILD_FORMAT === 'esm';
if (isESM) {
  const currentModulePath = resolve(fileURLToPath(import.meta.url));
  const mainModulePath = resolve(process.argv[1]);
  const isMainModule = currentModulePath === mainModulePath;
  // Only run if this specific migrate module is being executed directly, not when imported by main.js
  const isMigrateModuleMainExecution = isMainModule && currentModulePath.endsWith('migrate.js');
  if (isMigrateModuleMainExecution) {
    // Run migrations and exit with appropriate code
    runDbMigrations()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  }
}
