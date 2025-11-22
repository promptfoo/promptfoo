import * as path from 'path';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { getDirectory } from './esm';

// Global variable defined by build system
declare const BUILD_FORMAT: string | undefined;

// Lazy initialization to avoid module-level side effects in Jest
let currentDir: string | undefined;
function getCurrentDir(): string {
  if (!currentDir) {
    currentDir = getDirectory();
  }
  return currentDir;
}

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

        // Handle different deployment scenarios for migration folder location
        const dir = getCurrentDir();
        let migrationsFolder: string;
        if (dir.includes('dist/src')) {
          // When running from bundled server (e.g., dist/src/server/index.js)
          // Navigate to project root and find drizzle folder
          const projectRoot = dir.split('dist/src')[0];
          migrationsFolder = path.join(projectRoot, 'drizzle');
        } else {
          // When running from source (e.g., src/migrate.ts)
          migrationsFolder = path.join(dir, '..', 'drizzle');
        }

        logger.debug(`Running database migrations from: ${migrationsFolder}`);
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
// When BUILD_FORMAT is undefined (tsx/direct execution), check import.meta.url
// When BUILD_FORMAT is defined (bundled), only run if ESM build
const shouldCheckDirectExecution = typeof BUILD_FORMAT === 'undefined' || BUILD_FORMAT === 'esm';

if (shouldCheckDirectExecution) {
  try {
    const currentModulePath = resolve(fileURLToPath(import.meta.url));
    const mainModulePath = resolve(process.argv[1]);
    const isMainModule = currentModulePath === mainModulePath;
    // Only run if this specific migrate module is being executed directly
    // Matches both migrate.js (bundled) and migrate.ts (direct tsx execution)
    const isMigrateModuleMainExecution =
      isMainModule &&
      (currentModulePath.endsWith('migrate.js') || currentModulePath.endsWith('migrate.ts'));
    if (isMigrateModuleMainExecution) {
      // Run migrations and exit with appropriate code
      runDbMigrations()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
    }
  } catch {
    // In CJS context, import.meta.url will fail - that's expected and fine
    // Migrations will still run when called via API
  }
}
