import { promises as fs } from 'fs';
import { getDbPath } from '../../src/database';
import { runDbMigrations } from '../../src/migrate';

/**
 * Set up a unique database for integration tests
 * This prevents database locking issues when tests run in parallel
 */
export async function setupTestDatabase(testSuiteName: string) {
  // Unmock database module
  jest.unmock('../../src/database');
  
  // Use file-based database instead of in-memory for migrations to work
  delete process.env.IS_TESTING;
  
  // Create unique database directory for this test suite
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  process.env.PROMPTFOO_CONFIG_DIR = `./.local/jest/${testSuiteName}-${timestamp}-${random}`;
  
  // Run migrations
  await runDbMigrations();
}

/**
 * Clean up test database after tests complete
 */
export async function cleanupTestDatabase() {
  const { closeDb } = await import('../../src/database');
  closeDb();
  
  // Clean up test database files and directory
  const dbPath = getDbPath();
  const configDir = process.env.PROMPTFOO_CONFIG_DIR;
  
  try {
    await fs.unlink(dbPath);
    await fs.unlink(dbPath + '-shm');
    await fs.unlink(dbPath + '-wal');
    if (configDir && configDir.startsWith('./.local/jest/')) {
      await fs.rmdir(configDir);
    }
  } catch (e) {
    // Ignore errors if files don't exist
  }
  
  // Restore defaults for other tests
  process.env.IS_TESTING = 'true';
  process.env.PROMPTFOO_CONFIG_DIR = './.local/jest/config';
}