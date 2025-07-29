import * as path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { getDb } from './database';

//@ts-expect-error
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Run migrations on the database, skipping the ones already applied. Also creates the sqlite db if it doesn't exist.
 */
export function runDbMigrations() {
  try {
    const db = getDb();
    const migrationsFolder = path.join(__dirname, '..', 'drizzle');
    console.log(`[DB Migrate] Running migrations from ${migrationsFolder}...`);
    migrate(db, { migrationsFolder });
    console.log('[DB Migrate] Migrations completed');
  } catch (error) {
    console.error(`Error running database migrations: ${error}`);
  }
}

runDbMigrations();
