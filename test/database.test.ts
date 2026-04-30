import fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { sql } from 'drizzle-orm';
import Database from 'libsql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProcessEnv } from './util/utils';

const ORIGINAL_ENV = { ...process.env };

describe('database WAL mode', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.resetModules();
    mockProcessEnv({ ...ORIGINAL_ENV }, { clear: true });
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-dbtest-'));
    mockProcessEnv({ PROMPTFOO_CONFIG_DIR: tempDir });
    mockProcessEnv({ IS_TESTING: undefined });
    mockProcessEnv({ PROMPTFOO_DISABLE_WAL_MODE: undefined });
  });

  afterEach(async () => {
    mockProcessEnv(ORIGINAL_ENV, { clear: true });
    // Close the database connection if it exists
    try {
      const database = await import('../src/database');
      await database.closeDb();
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
    await database.getDb();

    // Close it to ensure we don't get resource conflicts
    await database.closeDb();

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
    mockProcessEnv({ PROMPTFOO_DISABLE_WAL_MODE: 'true' });

    const database = await import('../src/database');
    await database.getDb();
    await database.closeDb();

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

  it('does not enable WAL mode while testing', async () => {
    mockProcessEnv({ IS_TESTING: 'true' });

    const database = await import('../src/database');
    const db = await database.getDb();

    // Unit tests use a shared in-memory DB and skip WAL setup.
    expect(db).toBeDefined();
  });

  describe('closeDbIfOpen', () => {
    it('should close database when it is open', async () => {
      const database = await import('../src/database');

      // Open the database
      await database.getDb();
      expect(database.isDbOpen()).toBe(true);

      // Close it using closeDbIfOpen
      await database.closeDbIfOpen();
      expect(database.isDbOpen()).toBe(false);
    });

    it('should do nothing when database is not open', async () => {
      const database = await import('../src/database');

      // Ensure database is not open
      expect(database.isDbOpen()).toBe(false);

      // closeDbIfOpen should not throw
      await expect(database.closeDbIfOpen()).resolves.toBeUndefined();
      expect(database.isDbOpen()).toBe(false);
    });

    it('should be safe to call multiple times', async () => {
      const database = await import('../src/database');

      // Open the database
      await database.getDb();
      expect(database.isDbOpen()).toBe(true);

      // Close multiple times - should not throw
      await database.closeDbIfOpen();
      expect(database.isDbOpen()).toBe(false);

      await database.closeDbIfOpen();
      expect(database.isDbOpen()).toBe(false);

      await database.closeDbIfOpen();
      expect(database.isDbOpen()).toBe(false);
    });
  });

  it('verifies WAL checkpoint settings', async () => {
    const database = await import('../src/database');
    const db = await database.getDb();

    const autocheckpoint = (await db.get(sql`PRAGMA wal_autocheckpoint;`)) as unknown as {
      wal_autocheckpoint: number;
    };
    expect(autocheckpoint.wal_autocheckpoint).toBe(1000);

    const synchronous = (await db.get(sql`PRAGMA synchronous;`)) as unknown as {
      synchronous: number;
    };
    // NORMAL = 1 in SQLite
    expect(synchronous.synchronous).toBe(1);
  });
});
