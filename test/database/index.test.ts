import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeDb,
  DrizzleLogWriter,
  getDb,
  getDbPath,
  getDbSignalPath,
  isDbOpen,
} from '../../src/database/index';
import { getEnvBool } from '../../src/envars';
import logger from '../../src/logger';
import { getConfigDirectoryPath } from '../../src/util/config/manage';

vi.mock('../../src/envars');
vi.mock('../../src/logger');
vi.mock('../../src/util/config/manage');

describe('database', () => {
  let tempConfigDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(getConfigDirectoryPath).mockReset();
    vi.mocked(getEnvBool).mockReset();
    await closeDb();
    tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-db-index-'));
    vi.mocked(getConfigDirectoryPath).mockReturnValue(tempConfigDir);
    vi.mocked(getEnvBool).mockImplementation((key) => {
      if (key === 'IS_TESTING') {
        return true;
      }
      return false;
    });
  });

  afterEach(async () => {
    await closeDb();
    fs.rmSync(tempConfigDir, { force: true, recursive: true });
  });

  describe('getDbPath', () => {
    it('should return path in config directory', () => {
      const configPath = '/test/config/path';
      vi.mocked(getConfigDirectoryPath).mockReturnValue(configPath);

      expect(getDbPath()).toBe(path.resolve(configPath, 'promptfoo.db'));
    });
  });

  describe('getDbSignalPath', () => {
    it('should return evalLastWritten path in config directory', () => {
      const configPath = '/test/config/path';
      vi.mocked(getConfigDirectoryPath).mockReturnValue(configPath);

      expect(getDbSignalPath()).toBe(path.resolve(configPath, 'evalLastWritten'));
    });
  });

  describe('getDb', () => {
    beforeEach(() => {
      vi.mocked(getEnvBool).mockImplementation((key) => {
        if (key === 'IS_TESTING') {
          return true;
        }
        return false;
      });
    });

    it('should return a database when testing', async () => {
      const db = await getDb();
      expect(db).toBeDefined();
    });

    it('should use an in-memory database when testing', async () => {
      await getDb();

      expect(fs.existsSync(getDbPath())).toBe(false);
    });

    it('should initialize database with WAL mode', async () => {
      const db = await getDb();
      expect(db).toBeDefined();
    });

    it('should return same instance on subsequent calls', async () => {
      const db1 = await getDb();
      const db2 = await getDb();
      expect(db1).toBe(db2);
    });

    it('should serialize concurrent top-level transactions', async () => {
      const db = await getDb();
      await db.run('CREATE TABLE transaction_queue_test (id TEXT PRIMARY KEY)');

      await Promise.all([
        db.transaction(async (tx) => {
          await tx.run("INSERT INTO transaction_queue_test (id) VALUES ('a')");
        }),
        db.transaction(async (tx) => {
          await tx.run("INSERT INTO transaction_queue_test (id) VALUES ('b')");
        }),
      ]);

      await expect(
        db.all<{ id: string }>('SELECT id FROM transaction_queue_test ORDER BY id'),
      ).resolves.toEqual([{ id: 'a' }, { id: 'b' }]);
    });

    it('should serialize plain statements with top-level transactions', async () => {
      const db = await getDb();
      await db.run('CREATE TABLE transaction_plain_statement_test (id TEXT PRIMARY KEY)');

      let markTransactionStarted: () => void;
      const transactionStarted = new Promise<void>((resolve) => {
        markTransactionStarted = resolve;
      });
      let releaseTransaction!: () => void;
      const transactionRelease = new Promise<void>((resolve) => {
        releaseTransaction = resolve;
      });

      const transactionPromise = db.transaction(async (tx) => {
        await tx.run("INSERT INTO transaction_plain_statement_test (id) VALUES ('transaction')");
        markTransactionStarted();
        await transactionRelease;
      });

      await transactionStarted;
      const statementPromise = db.run(
        "INSERT INTO transaction_plain_statement_test (id) VALUES ('statement')",
      );
      releaseTransaction();

      await Promise.all([transactionPromise, statementPromise]);
      await expect(
        db.all<{ id: string }>('SELECT id FROM transaction_plain_statement_test ORDER BY id'),
      ).resolves.toEqual([{ id: 'statement' }, { id: 'transaction' }]);
    });

    it('should reuse the active transaction for nested root transactions', async () => {
      const db = await getDb();
      await db.run('CREATE TABLE nested_transaction_test (id TEXT PRIMARY KEY)');

      await expect(
        Promise.race([
          db.transaction(async (tx) => {
            await tx.run("INSERT INTO nested_transaction_test (id) VALUES ('outer')");
            await db.transaction(async (nestedTx) => {
              await nestedTx.run("INSERT INTO nested_transaction_test (id) VALUES ('inner')");
            });
          }),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('nested transaction timed out')), 1_000);
          }),
        ]),
      ).resolves.toBeUndefined();

      await expect(
        db.all<{ id: string }>('SELECT id FROM nested_transaction_test ORDER BY id'),
      ).resolves.toEqual([{ id: 'inner' }, { id: 'outer' }]);
    });

    it('does not deadlock when a transaction callback calls root db.* helpers', async () => {
      const db = await getDb();
      await db.run('CREATE TABLE root_call_inside_tx_test (id INTEGER PRIMARY KEY, val TEXT)');

      await expect(
        Promise.race([
          db.transaction(async (tx) => {
            await tx.run("INSERT INTO root_call_inside_tx_test (id, val) VALUES (1, 'in-tx')");
            const rows = await db.all<{ value: number }>('SELECT 1 AS value');
            expect(rows[0]?.value).toBe(1);
          }),
          new Promise((_, reject) => {
            setTimeout(
              () => reject(new Error('root db call inside transaction deadlocked')),
              1_000,
            );
          }),
        ]),
      ).resolves.toBeUndefined();
    });

    it('should enforce foreign keys inside top-level transactions', async () => {
      const db = await getDb();
      await db.run('CREATE TABLE transaction_fk_parent (id TEXT PRIMARY KEY)');
      await db.run(`
        CREATE TABLE transaction_fk_child (
          id TEXT PRIMARY KEY,
          parent_id TEXT NOT NULL REFERENCES transaction_fk_parent(id)
        )
      `);

      await expect(
        db.transaction(async (tx) => {
          await tx.run(
            "INSERT INTO transaction_fk_child (id, parent_id) VALUES ('child', 'missing')",
          );
        }),
      ).rejects.toThrow();
    });
  });

  describe('DrizzleLogWriter', () => {
    it('should log debug message when database logs enabled', () => {
      vi.mocked(getEnvBool).mockImplementation((key) => {
        if (key === 'PROMPTFOO_ENABLE_DATABASE_LOGS') {
          return true;
        }
        return false;
      });
      const writer = new DrizzleLogWriter();
      writer.write('test message');
      expect(logger.debug).toHaveBeenCalledWith('Drizzle: test message');
    });

    it('should not log debug message when database logs disabled', () => {
      vi.mocked(getEnvBool).mockReturnValue(false);
      const writer = new DrizzleLogWriter();
      writer.write('test message');
      expect(logger.debug).not.toHaveBeenCalled();
    });
  });

  describe('closeDb', () => {
    it('should close database connection and reset instances', async () => {
      const _db = await getDb();
      expect(isDbOpen()).toBe(true);
      await closeDb();
      expect(isDbOpen()).toBe(false);
      const newDb = await getDb();
      expect(newDb).toBeDefined();
      expect(isDbOpen()).toBe(true);
    });

    it('should handle errors when closing database', async () => {
      const _db = await getDb();
      await closeDb();
      await closeDb(); // Second close should be handled gracefully
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should handle close errors gracefully', async () => {
      const _db = await getDb();
      // Force an error by closing twice
      await closeDb();
      await closeDb();
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe('isDbOpen', () => {
    it('should return false when database is not initialized', async () => {
      await closeDb(); // Ensure clean state
      expect(isDbOpen()).toBe(false);
    });

    it('should return true when database is open', async () => {
      const _db = await getDb();
      expect(isDbOpen()).toBe(true);
    });

    it('should return false after closing database', async () => {
      const _db = await getDb();
      expect(isDbOpen()).toBe(true);
      await closeDb();
      expect(isDbOpen()).toBe(false);
    });
  });
});
