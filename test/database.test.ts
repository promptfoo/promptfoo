import Database from 'better-sqlite3';
import fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ORIGINAL_ENV = { ...process.env };

describe('database WAL mode', () => {
  let tempDir: string;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-dbtest-'));
    process.env.PROMPTFOO_CONFIG_DIR = tempDir;
    delete process.env.IS_TESTING;
  });

  afterEach(async () => {
    process.env = ORIGINAL_ENV;
    // Close the database connection if it exists
    try {
      const database = await import('../src/database');
      database.closeDb();
    } catch (err) {
      console.error('Error closing database:', err);
    }

    // Add a small delay to ensure connections are fully closed on Windows
    if (process.platform === 'win32') {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (err) {
      console.warn(`Could not remove temp directory ${tempDir}:`, err);
      // On Windows, sometimes we need multiple attempts
      if (process.platform === 'win32') {
        try {
          // Try a second time after a short delay
          await new Promise((resolve) => setTimeout(resolve, 500));
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
          console.error(`Failed to remove temp directory after retry: ${tempDir}`);
        }
      }
    }
  });

  it('enables WAL journal mode', async () => {
    // First import and initialize the database to trigger WAL mode configuration
    const database = await import('../src/database');
    database.getDb();

    // Close it to ensure we don't get resource conflicts
    database.closeDb();

    // Then independently verify the journal mode using a direct connection
    const dbPath = database.getDbPath();
    const directDb = new Database(dbPath);

    try {
      // Using run() function with a well-typed return value
      const result = directDb.prepare('PRAGMA journal_mode;').get() as { journal_mode: string };
      expect(result.journal_mode.toLowerCase()).toBe('wal');
    } finally {
      // Make sure to close this connection too
      directDb.close();
    }
  });
});
