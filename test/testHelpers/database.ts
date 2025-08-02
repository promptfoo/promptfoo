import { runDbMigrations } from '../../src/migrate';

/**
 * Set up a unique in-memory database for integration tests
 * Each test suite gets its own isolated database instance
 */
export async function setupTestDatabase(testSuiteName: string) {
  // Ensure we're using in-memory database for tests
  process.env.IS_TESTING = 'true';

  // On Windows, we need a unique test ID for file-based databases
  if (process.platform === 'win32') {
    // Close any existing connection first
    const { closeDb } = await import('../../src/database');
    closeDb();

    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    process.env.TEST_DB_ID = `${testSuiteName}-${timestamp}-${random}`;
  }

  // Run migrations on the database
  await runDbMigrations();
}

/**
 * Clean up test database after tests complete
 */
export async function cleanupTestDatabase() {
  // On Windows, we need to close the connection and clean up the file
  if (process.platform === 'win32' && process.env.TEST_DB_ID) {
    const { closeDb } = await import('../../src/database');
    closeDb();

    const fs = await import('fs/promises');
    const path = await import('path');
    const tmpDir = process.env.TEMP || process.env.TMP || 'C:\\Temp';
    const dbPath = path.join(tmpDir, `test-${process.env.TEST_DB_ID}.db`);

    try {
      // Delete the database file and any associated files (WAL, SHM)
      await fs.unlink(dbPath).catch(() => {});
      await fs.unlink(`${dbPath}-wal`).catch(() => {});
      await fs.unlink(`${dbPath}-shm`).catch(() => {});
    } catch (error) {
      // Ignore cleanup errors
    }

    delete process.env.TEST_DB_ID;
  }
  // In-memory databases are automatically cleaned up
  // We don't close the connection on non-Windows to avoid issues with parallel tests
}
