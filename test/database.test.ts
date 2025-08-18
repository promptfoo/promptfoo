import fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import Database from 'better-sqlite3';

const ORIGINAL_ENV = { ...process.env };
// Remove Turso-related variables from the original environment for this test
delete ORIGINAL_ENV.PROMPTFOO_USE_TURSO;
delete ORIGINAL_ENV.TURSO_DATABASE_URL;
delete ORIGINAL_ENV.DATABASE_URL;
delete ORIGINAL_ENV.TURSO_AUTH_TOKEN;

describe('database WAL mode', () => {
  let tempDir: string;
  let envFileBackup: string | null = null;

  beforeEach(async () => {
    jest.resetModules();
    
    // Temporarily rename .env file to prevent dotenv from loading Turso config
    const envPath = path.join(__dirname, '..', '.env');
    const envBackupPath = path.join(__dirname, '..', '.env.test-backup');
    if (fs.existsSync(envPath)) {
      fs.renameSync(envPath, envBackupPath);
      envFileBackup = envBackupPath;
    }
    
    process.env = { ...ORIGINAL_ENV };
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-dbtest-'));
    process.env.PROMPTFOO_CONFIG_DIR = tempDir;
    delete process.env.IS_TESTING;
    delete process.env.PROMPTFOO_DISABLE_WAL_MODE;
    delete process.env.PROMPTFOO_USE_TURSO;
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    
    // Clear CLI state that might contain cached Turso config
    const cliState = (await import('../src/cliState')).default;
    // Clear the entire config to ensure no Turso configuration persists
    cliState.config = undefined;
  });

  afterEach(async () => {
    process.env = ORIGINAL_ENV;
    
    // Restore the .env file if we moved it
    if (envFileBackup) {
      const envPath = path.join(__dirname, '..', '.env');
      fs.renameSync(envFileBackup, envPath);
      envFileBackup = null;
    }
    
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

  it('enables WAL journal mode by default', async () => {
    // First import and initialize the database to trigger WAL mode configuration
    const database = await import('../src/database');
    database.getDb();

    // Close it to ensure we don't get resource conflicts
    database.closeDb();

    // Then independently verify the journal mode using a direct connection
    const dbPath = database.getDbPath();
    const directDb = new Database(dbPath);

    try {
      const result = directDb.prepare('PRAGMA journal_mode;').get() as { journal_mode: string };
      expect(result.journal_mode.toLowerCase()).toBe('wal');
    } finally {
      // Make sure to close this connection too
      directDb.close();
    }
  });

  it('skips WAL mode when PROMPTFOO_DISABLE_WAL_MODE is set', async () => {
    process.env.PROMPTFOO_DISABLE_WAL_MODE = 'true';

    const database = await import('../src/database');
    database.getDb();
    database.closeDb();

    const dbPath = database.getDbPath();
    const directDb = new Database(dbPath);

    try {
      const result = directDb.prepare('PRAGMA journal_mode;').get() as { journal_mode: string };
      // Should be in default mode (delete) when WAL is disabled
      expect(result.journal_mode.toLowerCase()).toBe('delete');
    } finally {
      directDb.close();
    }
  });

  it('does not enable WAL mode for in-memory databases', async () => {
    process.env.IS_TESTING = 'true';

    const database = await import('../src/database');
    const db = database.getDb();

    // For in-memory databases, we can't verify the journal mode
    // but we can ensure it doesn't throw
    expect(db).toBeDefined();
  });

  it('verifies WAL checkpoint settings', async () => {
    const database = await import('../src/database');
    database.getDb();
    database.closeDb();

    const dbPath = database.getDbPath();
    const directDb = new Database(dbPath);

    try {
      const autocheckpoint = directDb.prepare('PRAGMA wal_autocheckpoint;').get() as {
        wal_autocheckpoint: number;
      };
      expect(autocheckpoint.wal_autocheckpoint).toBe(1000);

      const synchronous = directDb.prepare('PRAGMA synchronous;').get() as { synchronous: number };
      // NORMAL = 1 in SQLite
      expect(synchronous.synchronous).toBe(1);
    } finally {
      directDb.close();
    }
  });
});
