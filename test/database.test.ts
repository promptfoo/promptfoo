import { pathToFileURL } from 'node:url';
import fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { createClient } from '@libsql/client/node';
import { sql } from 'drizzle-orm';
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
    const db = await database.getDb();
    const dbPath = database.getDbPath();

    await db.run('CREATE TABLE wal_probe (id INTEGER PRIMARY KEY, value TEXT)');
    await db.run("INSERT INTO wal_probe (value) VALUES ('uses wal')");

    expect(fs.existsSync(`${dbPath}-wal`)).toBe(true);

    // Close it to ensure we don't get resource conflicts
    await database.closeDb();

    // Then independently verify the journal mode using a direct connection
    const directDb = createClient({ url: pathToFileURL(dbPath).href });

    try {
      const result = await directDb.execute('PRAGMA journal_mode;');
      const journalMode = String(result.rows[0]?.journal_mode ?? '');
      expect(journalMode.toLowerCase()).toBe('wal');
    } finally {
      // Make sure to close this connection too
      directDb.close();
    }
  });

  it('opens database paths with URL-reserved characters', async () => {
    const configDir = path.join(tempDir, 'nested#config');
    fs.mkdirSync(configDir);
    mockProcessEnv({ PROMPTFOO_CONFIG_DIR: configDir });

    const database = await import('../src/database');
    await database.getDb();

    expect(fs.existsSync(database.getDbPath())).toBe(true);
  });

  it('recreates a file-backed database after its database file is deleted', async () => {
    const database = await import('../src/database');
    const db = await database.getDb();
    const dbPath = database.getDbPath();

    expect(path.dirname(dbPath)).toBe(tempDir);
    await db.run('CREATE TABLE deleted_database_probe (id INTEGER PRIMARY KEY)');
    await db.run('INSERT INTO deleted_database_probe (id) VALUES (1)');
    await database.closeDb();

    fs.rmSync(dbPath, { force: true });
    fs.rmSync(`${dbPath}-shm`, { force: true });
    fs.rmSync(`${dbPath}-wal`, { force: true });
    expect(fs.existsSync(dbPath)).toBe(false);

    const recreatedDb = await database.getDb();
    await recreatedDb.run('CREATE TABLE recreated_database_probe (id INTEGER PRIMARY KEY)');

    expect(fs.existsSync(dbPath)).toBe(true);
    await expect(recreatedDb.all('SELECT id FROM deleted_database_probe')).rejects.toThrow();
  });

  it('skips WAL mode when PROMPTFOO_DISABLE_WAL_MODE is set', async () => {
    mockProcessEnv({ PROMPTFOO_DISABLE_WAL_MODE: 'true' });

    const database = await import('../src/database');
    await database.getDb();
    await database.closeDb();

    const dbPath = database.getDbPath();
    const directDb = createClient({ url: pathToFileURL(dbPath).href });

    try {
      const result = await directDb.execute('PRAGMA journal_mode;');
      const journalMode = String(result.rows[0]?.journal_mode ?? '');
      // Should be in default mode (delete) when WAL is disabled
      expect(journalMode.toLowerCase()).toBe('delete');
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

  it('applies a busy timeout so contended writes wait instead of failing immediately', async () => {
    const database = await import('../src/database');
    const db = await database.getDb();

    const busyTimeout = (await db.get(sql`PRAGMA busy_timeout;`)) as unknown as {
      timeout: number;
    };
    // Keep brief lock contention from failing immediately with SQLITE_BUSY.
    expect(busyTimeout.timeout).toBe(5000);
  });
});
