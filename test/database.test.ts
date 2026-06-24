import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { createClient } from '@libsql/client/node';
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProcessEnv } from './util/utils';

const ORIGINAL_ENV = { ...process.env };

function createWriteLockWorker(url: string, holdMs: number) {
  const worker = new Worker(
    `
      const { parentPort, workerData } = require('node:worker_threads');
      const { createClient } = require('@libsql/client/node');
      (async () => {
        const client = createClient({ url: workerData.url });
        const transaction = await client.transaction('write');
        await transaction.execute("INSERT INTO transaction_lock_probe VALUES ('holder')");
        parentPort.postMessage('locked');
        setTimeout(async () => {
          await transaction.commit();
          client.close();
          parentPort.postMessage('released');
        }, workerData.holdMs);
      })().catch((error) => {
        parentPort.postMessage({ error: error instanceof Error ? error.message : String(error) });
      });
    `,
    { eval: true, workerData: { holdMs, url } },
  );
  const waitForMessage = (expected: 'locked' | 'released') =>
    new Promise<void>((resolve, reject) => {
      worker.once('error', reject);
      worker.on('message', (message) => {
        if (message === expected) {
          resolve();
        } else if (message && typeof message === 'object' && 'error' in message) {
          reject(new Error(String(message.error)));
        }
      });
    });
  return {
    locked: waitForMessage('locked'),
    released: waitForMessage('released'),
    worker,
  };
}

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

  it('waits for brief transaction contention and restores connection settings', async () => {
    const database = await import('../src/database');
    const db = await database.getDb();
    await db.run('CREATE TABLE transaction_lock_probe (id TEXT PRIMARY KEY)');

    // Complete one transaction first so libSQL releases its configured connection. A later
    // transaction may then acquire a fresh logical connection without the PRAGMA timeout.
    await db.transaction(async (tx) => {
      await tx.run("INSERT INTO transaction_lock_probe VALUES ('warm')");
    });

    const lock = createWriteLockWorker(pathToFileURL(database.getDbPath()).href, 1500);
    try {
      await lock.locked;

      const startedAt = Date.now();
      const transactionOutcome = db
        .transaction(async (tx) => {
          await tx.run("INSERT INTO transaction_lock_probe VALUES ('retried')");
        })
        .then(
          () => ({ ok: true as const }),
          (error) => ({ ok: false as const, error }),
        );

      expect(await transactionOutcome).toEqual({ ok: true });
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(1000);
      await expect(db.all('SELECT id FROM transaction_lock_probe ORDER BY id')).resolves.toEqual([
        { id: 'holder' },
        { id: 'retried' },
        { id: 'warm' },
      ]);
      await expect(db.get(sql`PRAGMA foreign_keys;`)).resolves.toEqual({ foreign_keys: 1 });
      await expect(db.get(sql`PRAGMA busy_timeout;`)).resolves.toEqual({ timeout: 5000 });
      await expect(db.get(sql`PRAGMA synchronous;`)).resolves.toEqual({ synchronous: 1 });
    } finally {
      await lock.worker.terminate();
    }
  });

  it('does not multiply the busy timeout across transaction retries', async () => {
    const database = await import('../src/database');
    const db = await database.getDb();
    await db.run('CREATE TABLE transaction_lock_probe (id TEXT PRIMARY KEY)');

    const lock = createWriteLockWorker(pathToFileURL(database.getDbPath()).href, 5500);
    try {
      await lock.locked;
      const startedAt = Date.now();
      const outcome = await db
        .transaction(async (tx) => {
          await tx.run("INSERT INTO transaction_lock_probe VALUES ('blocked')");
        })
        .then(
          () => ({ ok: true as const }),
          (error) => ({ ok: false as const, error }),
        );
      const elapsedMs = Date.now() - startedAt;
      await lock.released;

      expect(outcome.ok).toBe(false);
      expect(elapsedMs).toBeGreaterThanOrEqual(4500);
      expect(elapsedMs).toBeLessThan(9000);
      await expect(db.all('SELECT id FROM transaction_lock_probe ORDER BY id')).resolves.toEqual([
        { id: 'holder' },
      ]);
    } finally {
      await lock.worker.terminate();
    }
  }, 12_000);
});
