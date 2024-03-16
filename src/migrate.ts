import * as path from 'path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { getDb } from './database';

/**
 * Run migrations on the database, skipping the ones already applied. Also creates the sqlite db if it doesn't exist.
 */
export async function runDbMigrations() {
  const db = getDb();
  await migrate(db, { migrationsFolder: path.join(__dirname, '..', 'drizzle') });
}

if (require.main === module) {
  runDbMigrations();
}
