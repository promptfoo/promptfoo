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

  // Run migrations on the in-memory database
  await runDbMigrations();
}

/**
 * Clean up test database after tests complete
 */
export async function cleanupTestDatabase() {
  // In-memory databases are automatically cleaned up
  // We don't close the connection to avoid issues with parallel tests
}
