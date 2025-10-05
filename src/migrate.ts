import * as path from 'path';

import { migrate } from 'drizzle-orm/libsql/migrator';
import { getDb } from './database/index';
import logger from './logger';

/**
 * Run migrations on the database, skipping the ones already applied. Also creates the sqlite db if it doesn't exist.
 */
export async function runDbMigrations(): Promise<void> {
  try {
    const db = getDb();
    // In compiled code, __dirname will be dist/src, so we need to go up two levels
    // In tests, we need to handle the path differently
    let migrationsFolder: string;

    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
      // In tests, use process.cwd() to find the drizzle folder
      migrationsFolder = path.join(process.cwd(), 'drizzle');
    } else {
      migrationsFolder = path.join(__dirname, '..', 'drizzle');
    }

    logger.debug(`Running database migrations from: ${migrationsFolder}`);

    // Check if migrations folder exists
    const fs = await import('fs');
    if (!fs.existsSync(migrationsFolder)) {
      logger.error(`Migrations folder not found: ${migrationsFolder}`);
      throw new Error(`Migrations folder not found: ${migrationsFolder}`);
    }

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
