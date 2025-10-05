import { runDbMigrations } from '../../src/migrate';
import { getDb, closeDb } from '../../src/database';
import { sql } from 'drizzle-orm';

/**
 * Set up a unique in-memory database for integration tests
 * Each test suite gets its own isolated database instance
 */
export async function setupTestDatabase(testSuiteName: string) {
  // Ensure we're using in-memory database for tests
  process.env.IS_TESTING = 'true';

  // Set a unique test ID for file-based databases
  // We're now using file-based databases for all platforms in tests
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  process.env.TEST_DB_ID = `${testSuiteName}-${timestamp}-${random}`;

  // Close any existing connection to ensure we get a fresh database
  await closeDb();

  // Get the database instance first to ensure it's created
  const db = getDb();

  // Run migrations on the database
  await runDbMigrations();

  // Verify migrations worked by checking for tables
  const tables = await db.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type='table'`,
  );
  if (tables.length === 0) {
    throw new Error('Migrations failed - no tables created');
  }

  // Specifically check for evals table
  const evalsTableExists = await db.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type='table' AND name='evals'`,
  );
  if (evalsTableExists.length === 0) {
    throw new Error('Migrations failed - evals table not created');
  }

  console.log(
    `Database setup complete for ${testSuiteName}, tables:`,
    tables.map((t) => t.name),
  );
}

/**
 * Clean up test database after tests complete
 */
export async function cleanupTestDatabase() {
  // Clean up test database files for all platforms
  if (process.env.TEST_DB_ID) {
    await closeDb();

    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');
    const tmpDir = os.tmpdir();
    const dbPath = path.join(tmpDir, `promptfoo-test-${process.env.TEST_DB_ID}.db`);

    try {
      // Delete the database file and any associated files (WAL, SHM)
      await fs.unlink(dbPath).catch(() => {});
      await fs.unlink(`${dbPath}-wal`).catch(() => {});
      await fs.unlink(`${dbPath}-shm`).catch(() => {});
    } catch (_error) {
      // Ignore cleanup errors
    }

    delete process.env.TEST_DB_ID;
  }
}
