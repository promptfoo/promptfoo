import * as path from 'path';

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { getDb } from './database';
import logger from './logger';
import { getDirname, isMainModule } from './util/module-paths';

/**
 * Robustly find the drizzle migrations folder
 */
function findMigrationsFolder(): string {
  // Allow environment override for tests
  if (process.env.DRIZZLE_MIGRATIONS_DIR) {
    return process.env.DRIZZLE_MIGRATIONS_DIR;
  }

  // Try multiple resolution strategies
  const candidates = [
    // Relative to module directory (runtime ESM)
    getDirname().endsWith('/src') ? path.resolve(getDirname(), '..', 'drizzle') : null,
    // Relative to current working directory (Jest/CI)
    path.resolve(process.cwd(), 'drizzle'),
    // Fallback for CJS environments
    typeof __dirname !== 'undefined' ? path.resolve(__dirname, '..', 'drizzle') : null,
  ].filter(Boolean) as string[];

  // Return the first path that exists
  for (const candidate of candidates) {
    try {
      if (require('fs').existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // Continue to next candidate
    }
  }

  // Default fallback
  return path.resolve(process.cwd(), 'drizzle');
}

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
        const migrationsFolder = findMigrationsFolder();
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

// Cross-compatible main check
// Skip if we're in the CLI bundle to avoid conflicts
if (isMainModule() && !(global as any).__PROMPTFOO_CLI_BUNDLE__) {
  // Run migrations and exit with appropriate code
  runDbMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
