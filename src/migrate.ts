import * as path from 'path';

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { migrate as migrateLibsql } from 'drizzle-orm/libsql/migrator';
import { getDb } from './database';
import { getEnvBool, getEnvString } from './envars';
import logger from './logger';

/**
 * Run migrations on the database, skipping the ones already applied. Also creates the sqlite db if it doesn't exist.
 *
 * Note: While the underlying drizzle-orm migrate() function is synchronous, we wrap it in a Promise
 * with setImmediate to avoid blocking the event loop during startup. This allows other async
 * operations to proceed while migrations run.
 */
export async function runDbMigrations(): Promise<void> {
  const isTestEnvironment = getEnvBool('IS_TESTING');
  const useTurso = getEnvBool('PROMPTFOO_USE_TURSO', false);
  const tursoUrl = getEnvString('TURSO_DATABASE_URL') || getEnvString('DATABASE_URL');
  
  if (!isTestEnvironment && useTurso && tursoUrl) {
    // Use async LibSQL migrations for Turso
    try {
      const db = getDb();
      const migrationsFolder = path.join(__dirname, '..', 'drizzle');
      logger.debug(`Running LibSQL database migrations...`);
      await migrateLibsql(db as any, { migrationsFolder });
      logger.debug('LibSQL database migrations completed');
    } catch (error) {
      logger.error(`LibSQL database migration failed: ${error}`);
      throw error;
    }
  } else {
    // Use sync SQLite migrations for better-sqlite3
    return new Promise((resolve, reject) => {
      // Run the synchronous migration in the next tick to avoid blocking
      setImmediate(() => {
        try {
          const db = getDb();
          const migrationsFolder = path.join(__dirname, '..', 'drizzle');
          logger.debug(`Running SQLite database migrations...`);
          migrate(db as any, { migrationsFolder });
          logger.debug('SQLite database migrations completed');
          resolve();
        } catch (error) {
          logger.error(`SQLite database migration failed: ${error}`);
          reject(error);
        }
      });
    });
  }
}

if (require.main === module) {
  // Run migrations and exit with appropriate code
  runDbMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
