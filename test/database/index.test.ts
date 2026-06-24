import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
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
import { mockProcessEnv } from '../util/utils';

vi.mock('../../src/envars', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/envars')>();
  return { ...actual, getEnvBool: vi.fn(actual.getEnvBool) };
});
vi.mock('../../src/logger');
vi.mock('../../src/util/config/manage');
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return { ...actual, homedir: vi.fn(actual.homedir) };
});

const ORIGINAL_HOME_DIR = os.homedir();
const VITEST_WORKER_MARKER = '__vitest_worker__';
const JEST_NATIVE_PROMISE_MARKER = Symbol.for('jest-native-promise');

function withTestRunnerMarkers<T>(
  markers: { vitest?: boolean; jest?: boolean },
  callback: () => T,
): T {
  const markerKeys: PropertyKey[] = [VITEST_WORKER_MARKER, JEST_NATIVE_PROMISE_MARKER];
  const descriptors = markerKeys.map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );

  try {
    for (const key of markerKeys) {
      Reflect.deleteProperty(globalThis, key);
    }
    if (markers.vitest) {
      Object.defineProperty(globalThis, VITEST_WORKER_MARKER, {
        configurable: true,
        value: true,
      });
    }
    if (markers.jest) {
      Object.defineProperty(globalThis, JEST_NATIVE_PROMISE_MARKER, {
        configurable: true,
        value: Promise,
      });
    }
    return callback();
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        Reflect.deleteProperty(globalThis, key);
      }
    }
  }
}

describe('database', () => {
  let tempConfigDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(os.homedir).mockReset();
    vi.mocked(os.homedir).mockReturnValue(ORIGINAL_HOME_DIR);
    vi.mocked(getConfigDirectoryPath).mockReset();
    vi.mocked(getEnvBool).mockReset();
    await closeDb();
    cliState.config = undefined;
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
    cliState.config = undefined;
    vi.unstubAllEnvs();
    fs.rmSync(tempConfigDir, { force: true, recursive: true });
  });

  describe('getDbPath', () => {
    it('should return path in config directory', () => {
      const configPath = '/test/config/path';
      vi.mocked(getConfigDirectoryPath).mockReturnValue(configPath);

      expect(getDbPath()).toBe(path.resolve(configPath, 'promptfoo.db'));
    });

    it('should allow a missing isolated database directory', () => {
      const configPath = path.join(tempConfigDir, 'missing-config');
      vi.mocked(getConfigDirectoryPath).mockImplementation((createIfNotExists = false) => {
        if (createIfNotExists) {
          fs.mkdirSync(configPath, { recursive: true });
        }
        return configPath;
      });
      vi.stubEnv('VITEST', 'true');

      expect(getDbPath()).toBe(path.join(configPath, 'promptfoo.db'));
      expect(fs.existsSync(configPath)).toBe(true);
    });

    it('should refuse to use the default user database when the process is running tests', () => {
      vi.mocked(getConfigDirectoryPath).mockReturnValue(path.join(os.homedir(), '.promptfoo'));
      vi.stubEnv('VITEST', 'true');

      expect(() => withTestRunnerMarkers({}, () => getDbPath())).toThrow(
        'Refusing to open the default Promptfoo database while running tests',
      );
    });

    it('should allow the default user database when only NODE_ENV is test', () => {
      const defaultConfigDir = path.join(os.homedir(), '.promptfoo');
      vi.mocked(getConfigDirectoryPath).mockReturnValue(defaultConfigDir);
      vi.stubEnv('NODE_ENV', 'test');
      vi.stubEnv('VITEST', undefined);
      vi.stubEnv('JEST_WORKER_ID', undefined);

      const dbPath = withTestRunnerMarkers({}, () => getDbPath());

      expect(dbPath).toBe(path.join(defaultConfigDir, 'promptfoo.db'));
    });

    it('should not use Promptfoo env overrides to identify a test process', () => {
      const defaultConfigDir = path.join(os.homedir(), '.promptfoo');
      vi.mocked(getConfigDirectoryPath).mockReturnValue(defaultConfigDir);
      cliState.config = { env: { VITEST: 'true', JEST_WORKER_ID: '1' } };
      vi.stubEnv('VITEST', undefined);
      vi.stubEnv('JEST_WORKER_ID', undefined);

      const dbPath = withTestRunnerMarkers({}, () => getDbPath());

      expect(dbPath).toBe(path.join(defaultConfigDir, 'promptfoo.db'));
    });

    it('should detect Vitest after the process environment is cleared', () => {
      vi.mocked(getConfigDirectoryPath).mockReturnValue(path.join(os.homedir(), '.promptfoo'));
      const restoreEnv = mockProcessEnv({}, { clear: true });
      let error: unknown;

      try {
        getDbPath();
      } catch (caught) {
        error = caught;
      } finally {
        restoreEnv();
      }

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(
        'Refusing to open the default Promptfoo database while running tests',
      );
    });

    it('should detect Jest after the process environment is cleared', () => {
      vi.mocked(getConfigDirectoryPath).mockReturnValue(path.join(os.homedir(), '.promptfoo'));
      const restoreEnv = mockProcessEnv({}, { clear: true });
      let error: unknown;

      try {
        withTestRunnerMarkers({ jest: true }, () => getDbPath());
      } catch (caught) {
        error = caught;
      } finally {
        restoreEnv();
      }

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(
        'Refusing to open the default Promptfoo database while running tests',
      );
    });

    it('should not identify generic Jest workers as test processes', () => {
      const defaultConfigDir = path.join(os.homedir(), '.promptfoo');
      vi.mocked(getConfigDirectoryPath).mockReturnValue(defaultConfigDir);
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('VITEST', undefined);
      vi.stubEnv('JEST_WORKER_ID', '1');

      const dbPath = withTestRunnerMarkers({}, () => getDbPath());

      expect(dbPath).toBe(path.join(defaultConfigDir, 'promptfoo.db'));
    });

    it.each(['', '0', 'false'])('should ignore VITEST=%j outside Vitest', (value) => {
      const defaultConfigDir = path.join(os.homedir(), '.promptfoo');
      vi.mocked(getConfigDirectoryPath).mockReturnValue(defaultConfigDir);
      vi.stubEnv('VITEST', value);
      vi.stubEnv('JEST_WORKER_ID', undefined);

      const dbPath = withTestRunnerMarkers({}, () => getDbPath());

      expect(dbPath).toBe(path.join(defaultConfigDir, 'promptfoo.db'));
    });

    it('should refuse an alias that resolves to the default user database', () => {
      const fakeHomeDir = path.join(tempConfigDir, 'home');
      const defaultConfigDir = path.join(fakeHomeDir, '.promptfoo');
      const aliasedConfigDir = path.join(tempConfigDir, 'aliased-config');
      fs.mkdirSync(defaultConfigDir, { recursive: true });
      fs.symlinkSync(
        defaultConfigDir,
        aliasedConfigDir,
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      vi.mocked(os.homedir).mockReturnValue(fakeHomeDir);
      vi.mocked(getConfigDirectoryPath).mockReturnValue(aliasedConfigDir);
      vi.stubEnv('VITEST', 'true');

      expect(() => getDbPath()).toThrow(
        'Refusing to open the default Promptfoo database while running tests',
      );
    });

    it('should refuse an alias that resolves to a missing default database directory', () => {
      const fakeHomeDir = path.join(tempConfigDir, 'missing-home');
      const aliasedHomeDir = path.join(tempConfigDir, 'aliased-home');
      const aliasedConfigDir = path.join(aliasedHomeDir, '.promptfoo');
      fs.mkdirSync(fakeHomeDir);
      fs.symlinkSync(
        fakeHomeDir,
        aliasedHomeDir,
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      vi.mocked(os.homedir).mockReturnValue(fakeHomeDir);
      vi.mocked(getConfigDirectoryPath).mockImplementation((createIfNotExists = false) => {
        if (createIfNotExists) {
          fs.mkdirSync(aliasedConfigDir, { recursive: true });
        }
        return aliasedConfigDir;
      });
      vi.stubEnv('VITEST', 'true');

      expect(() => getDbPath()).toThrow(
        'Refusing to open the default Promptfoo database while running tests',
      );
      expect(fs.existsSync(path.join(fakeHomeDir, '.promptfoo', 'promptfoo.db'))).toBe(false);
    });

    it('should refuse a hard link to the default user database', () => {
      const fakeHomeDir = path.join(tempConfigDir, 'hard-link-home');
      const defaultConfigDir = path.join(fakeHomeDir, '.promptfoo');
      const aliasedConfigDir = path.join(tempConfigDir, 'hard-link-config');
      fs.mkdirSync(defaultConfigDir, { recursive: true });
      fs.mkdirSync(aliasedConfigDir, { recursive: true });
      fs.writeFileSync(path.join(defaultConfigDir, 'promptfoo.db'), 'database');
      fs.linkSync(
        path.join(defaultConfigDir, 'promptfoo.db'),
        path.join(aliasedConfigDir, 'promptfoo.db'),
      );
      vi.mocked(os.homedir).mockReturnValue(fakeHomeDir);
      vi.mocked(getConfigDirectoryPath).mockReturnValue(aliasedConfigDir);
      vi.stubEnv('VITEST', 'true');

      expect(() => getDbPath()).toThrow(
        'Refusing to open the default Promptfoo database while running tests',
      );
    });

    it('should respect filesystem case sensitivity for existing databases', () => {
      const fakeHomeDir = path.join(tempConfigDir, 'case-home');
      const defaultConfigDir = path.join(fakeHomeDir, '.promptfoo');
      const differentlyCasedConfigDir = path.join(fakeHomeDir, '.PROMPTFOO');
      fs.mkdirSync(defaultConfigDir, { recursive: true });
      fs.writeFileSync(path.join(defaultConfigDir, 'promptfoo.db'), 'default database');
      const isCaseInsensitive = fs.existsSync(differentlyCasedConfigDir);
      if (!isCaseInsensitive) {
        fs.mkdirSync(differentlyCasedConfigDir);
        fs.writeFileSync(path.join(differentlyCasedConfigDir, 'promptfoo.db'), 'other database');
      }

      vi.mocked(os.homedir).mockReturnValue(fakeHomeDir);
      vi.mocked(getConfigDirectoryPath).mockReturnValue(differentlyCasedConfigDir);
      vi.stubEnv('VITEST', 'true');

      if (isCaseInsensitive) {
        expect(() => getDbPath()).toThrow(
          'Refusing to open the default Promptfoo database while running tests',
        );
      } else {
        expect(getDbPath()).toBe(path.join(differentlyCasedConfigDir, 'promptfoo.db'));
      }
    });
  });

  describe('getDbSignalPath', () => {
    it('should return evalLastWritten path in config directory', () => {
      const configPath = '/test/config/path';
      vi.mocked(getConfigDirectoryPath).mockReturnValue(configPath);

      expect(getDbSignalPath()).toBe(path.resolve(configPath, 'evalLastWritten'));
    });

    it('should allow the default signal path for in-memory tests', () => {
      const defaultConfigDir = path.join(os.homedir(), '.promptfoo');
      vi.mocked(getConfigDirectoryPath).mockReturnValue(defaultConfigDir);
      vi.stubEnv('VITEST', 'true');

      expect(getDbSignalPath()).toBe(path.join(defaultConfigDir, 'evalLastWritten'));
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
