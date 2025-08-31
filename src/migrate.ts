import * as path from 'path';
import * as fs from 'fs';

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

  const dirname = getDirname();
  logger.debug(`findMigrationsFolder: getDirname() returned: ${dirname}`);

  // Try multiple resolution strategies
  const candidates = [
    // Relative to module directory (runtime ESM)
    dirname.endsWith('/src') ? path.resolve(dirname, '..', 'drizzle') : null,
    // Relative to current working directory (Jest/CI)
    path.resolve(process.cwd(), 'drizzle'),
    // Fallback for CJS environments
    typeof __dirname !== 'undefined' ? path.resolve(__dirname, '..', 'drizzle') : null,
    // For bundled contexts, try relative to dist
    dirname.includes('/dist/') ? path.resolve(dirname, '../../../drizzle') : null,
    // For bundled contexts, try dist/drizzle
    path.resolve(process.cwd(), 'dist', 'drizzle'),
  ].filter(Boolean) as string[];

  logger.debug(`findMigrationsFolder: trying candidates: ${JSON.stringify(candidates)}`);

  // Return the first path that exists
  for (const candidate of candidates) {
    try {
      logger.debug(`findMigrationsFolder: checking if exists: ${candidate}`);
      if (fs.existsSync(candidate)) {
        logger.debug(`findMigrationsFolder: found migrations at: ${candidate}`);
        return candidate;
      } else {
        logger.debug(`findMigrationsFolder: does not exist: ${candidate}`);
      }
    } catch (error) {
      logger.debug(`findMigrationsFolder: error checking ${candidate}: ${String(error)}`);
    }
  }

  logger.error(
    `findMigrationsFolder: no valid migrations folder found. Candidates tried: ${JSON.stringify(candidates)}`,
  );
  throw new Error('Could not find drizzle migrations folder');
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
