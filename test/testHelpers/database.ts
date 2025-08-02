import { runDbMigrations } from '../../src/migrate';

/**
 * Set up a unique in-memory database for integration tests
 * Each test suite gets its own isolated database instance
 */
export async function setupTestDatabase(testSuiteName: string) {
  // Unmock database module
  jest.unmock('../../src/database');
  
  // Ensure we're using in-memory database for tests
  process.env.IS_TESTING = 'true';
  
  // Force close any existing database connection
  const { closeDb } = await import('../../src/database');
  closeDb();
  
  // Run migrations on the new in-memory database
  await runDbMigrations();
}

/**
 * Clean up test database after tests complete
 */
export async function cleanupTestDatabase() {
  const { closeDb } = await import('../../src/database');
  
  // Close the in-memory database connection
  closeDb();
}