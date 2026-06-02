import { AsyncLocalStorage } from 'node:async_hooks';
import { pathToFileURL } from 'node:url';
import * as os from 'os';
import * as path from 'path';

import { DefaultLogger, type LogWriter } from 'drizzle-orm/logger';
import { getEnvBool, getEnvString } from '../envars';
import logger from '../logger';
import { getConfigDirectoryPath } from '../util/config/manage';
import { sleep } from '../util/time';
import {
  closeTestDatabaseClient,
  registerTestDatabaseClient,
  unregisterTestDatabaseClient,
} from './testing';

// Lazy types; the runtime modules below are imported inside getDb() so that a
// missing libsql platform binding (`@libsql/<target>`) surfaces as a catchable
// error from getDb() rather than crashing module load before any handler can
// translate it into a friendly message.
type Client = import('@libsql/client/node').Client;
type Drizzle = ReturnType<typeof import('drizzle-orm/libsql/node').drizzle>;

export class DrizzleLogWriter implements LogWriter {
  write(message: string) {
    if (getEnvBool('PROMPTFOO_ENABLE_DATABASE_LOGS', false)) {
      logger.debug(`Drizzle: ${message}`);
    }
  }
}

let dbInstance: Drizzle | null = null;
let dbPromise: Promise<Drizzle> | null = null;
let sqliteInstance: Client | null = null;
let sqliteInstanceIsTesting = false;

function assertSafeTestDatabasePath(dbPath: string): void {
  const isTestProcess =
    getEnvString('NODE_ENV') === 'test' ||
    getEnvBool('VITEST', false) ||
    Boolean(getEnvString('JEST_WORKER_ID'));
  if (!isTestProcess) {
    return;
  }

  const defaultUserDbPath = path.resolve(os.homedir(), '.promptfoo', 'promptfoo.db');
  if (dbPath === defaultUserDbPath) {
    throw new Error(
      'Refusing to open the default Promptfoo database while running tests. ' +
        'Set IS_TESTING=true for an in-memory database or set PROMPTFOO_CONFIG_DIR to a test-only directory.',
    );
  }
}

function getSafeDatabaseDirectoryPath(): string {
  const configDirectoryPath = getConfigDirectoryPath();
  const dbPath = path.resolve(configDirectoryPath, 'promptfoo.db');
  assertSafeTestDatabasePath(dbPath);
  getConfigDirectoryPath(true /* createIfNotExists */);
  return configDirectoryPath;
}

export function getDbPath() {
  return path.resolve(getSafeDatabaseDirectoryPath(), 'promptfoo.db');
}

export function getDbSignalPath() {
  return path.resolve(getSafeDatabaseDirectoryPath(), 'evalLastWritten');
}

async function configureDatabase(client: Client, skipWalMode: boolean): Promise<void> {
  // Enable foreign key constraints (required for referential integrity)
  await client.execute('PRAGMA foreign_keys = ON');

  // Wait briefly when a writer contends with another process or connection for
  // the lock instead of failing immediately with SQLITE_BUSY.
  await client.execute('PRAGMA busy_timeout = 5000');

  // Configure WAL mode unless explicitly disabled or using in-memory database
  if (!skipWalMode && !getEnvBool('PROMPTFOO_DISABLE_WAL_MODE', false)) {
    try {
      // Enable WAL mode for better concurrency
      await client.execute('PRAGMA journal_mode = WAL');

      // Verify WAL mode was actually enabled
      const result = await client.execute('PRAGMA journal_mode');
      const journalMode = String(result.rows[0]?.journal_mode ?? '');

      if (journalMode.toLowerCase() === 'wal') {
        logger.debug('Successfully enabled SQLite WAL mode');
      } else {
        logger.warn(
          `Failed to enable WAL mode (got '${journalMode}'). ` +
            'Database performance may be reduced. This can happen on network filesystems. ' +
            'Set PROMPTFOO_DISABLE_WAL_MODE=true to suppress this warning.',
        );
      }

      // Additional WAL configuration for optimal performance
      await client.execute('PRAGMA wal_autocheckpoint = 1000'); // Checkpoint every 1000 pages
      await client.execute('PRAGMA synchronous = NORMAL'); // Good balance of safety and speed with WAL
    } catch (err) {
      logger.warn(
        `Error configuring SQLite WAL mode: ${err}. ` +
          'Database will use default journal mode. Performance may be reduced. ' +
          'This can happen on network filesystems or certain containerized environments. ' +
          'Set PROMPTFOO_DISABLE_WAL_MODE=true to suppress this warning.',
      );
    }
  }
}

// A statement that fails to acquire its lock never executed, so retrying it is
// safe (no risk of double-applying a write). Shared-cache table locks surface as
// SQLITE_LOCKED, which busy_timeout does NOT retry — it only covers SQLITE_BUSY.
const TRANSIENT_LOCK_RETRY_ATTEMPTS = 10;
const TRANSIENT_LOCK_RETRY_BASE_MS = 5;
const TRANSIENT_LOCK_RETRY_MAX_MS = 250;

/**
 * Detects the transient SQLite lock errors that clear once a contending writer
 * releases its lock. drizzle re-wraps the libsql error (its own message is just
 * `Failed query: ...`), so walk the cause chain and match on code/message.
 */
function isTransientDatabaseLockError(error: unknown): boolean {
  for (
    let current = error as {
        code?: unknown;
        extendedCode?: unknown;
        message?: unknown;
        cause?: unknown;
      } | null,
      depth = 0;
    current != null && depth < 6;
    current = (current.cause ?? null) as typeof current, depth++
  ) {
    const code = typeof current.code === 'string' ? current.code : '';
    const extendedCode = typeof current.extendedCode === 'string' ? current.extendedCode : '';
    if (
      code.startsWith('SQLITE_BUSY') ||
      code.startsWith('SQLITE_LOCKED') ||
      extendedCode.startsWith('SQLITE_BUSY') ||
      extendedCode.startsWith('SQLITE_LOCKED')
    ) {
      return true;
    }
    const message = typeof current.message === 'string' ? current.message : '';
    if (
      /\bSQLITE_(?:BUSY|LOCKED)\b/.test(message) ||
      /database (?:is|table is) locked/i.test(message)
    ) {
      return true;
    }
  }
  return false;
}

async function withTransientLockRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= TRANSIENT_LOCK_RETRY_ATTEMPTS || !isTransientDatabaseLockError(error)) {
        throw error;
      }
      await sleep(
        Math.min(TRANSIENT_LOCK_RETRY_BASE_MS * 2 ** (attempt - 1), TRANSIENT_LOCK_RETRY_MAX_MS),
      );
    }
  }
}

function serializeTopLevelOperations(client: Client, db: Drizzle): Drizzle {
  const transaction = db.transaction.bind(db);
  type TransactionCallback = Parameters<typeof transaction>[0];
  type TransactionContext = Parameters<TransactionCallback>[0];

  const activeTransaction = new AsyncLocalStorage<TransactionContext>();
  let operationQueue = Promise.resolve();

  const runSerialized = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = operationQueue.then(operation);
    operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const serializeClientMethod = <TArgs extends unknown[], TResult>(
    method: (...args: TArgs) => Promise<TResult>,
  ) => {
    return (...args: TArgs) => {
      // The outer transaction already owns the serialized queue. If a helper
      // called from that transaction uses the root db handle for a read, queueing
      // it behind the outer transaction would deadlock. Retrying here would also
      // deadlock (the contending lock is the very transaction we are inside), so
      // run it directly.
      if (activeTransaction.getStore()) {
        return method(...args);
      }
      // Statement-level methods are atomic, so a transient lock failure means
      // nothing was applied. libsql runs interactive transactions on their own
      // connection, so a prior writer's table lock can briefly outlive the JS
      // promise that settled it; retry rides through that window without
      // weakening isolation (reads still observe only committed rows).
      return runSerialized(() => withTransientLockRetry(() => method(...args)));
    };
  };

  // libSQL opens a new logical connection for top-level statements and interactive
  // transactions, so an ordinary write started while a transaction owns the write lock
  // fails with SQLITE_BUSY unless root-handle operations are serialized.
  client.execute = serializeClientMethod(client.execute.bind(client)) as typeof client.execute;
  client.batch = serializeClientMethod(client.batch.bind(client));
  client.migrate = serializeClientMethod(client.migrate.bind(client));
  client.executeMultiple = serializeClientMethod(client.executeMultiple.bind(client));

  db.transaction = ((callback, config) => {
    const currentTransaction = activeTransaction.getStore();
    if (currentTransaction) {
      // Reuse the transaction already owned by this async call chain. Queueing here
      // would deadlock because the outer callback is waiting for the nested promise.
      return callback(currentTransaction);
    }

    return runSerialized(() =>
      transaction((tx) => activeTransaction.run(tx, () => callback(tx)), config),
    );
  }) as typeof db.transaction;

  return db;
}

export async function getDb() {
  if (dbInstance) {
    return dbInstance;
  }
  if (!dbPromise) {
    dbPromise = (async () => {
      // Imported lazily so that a missing platform binding (e.g. @libsql/darwin-arm64)
      // surfaces here, where the friendly handler can translate it.
      const [{ createClient }, { drizzle }] = await Promise.all([
        import('@libsql/client/node'),
        import('drizzle-orm/libsql/node'),
      ]);
      const isTesting = getEnvBool('IS_TESTING');
      // libsql opens fresh connections for top-level transactions, so tests need a
      // shared in-memory database rather than connection-local `:memory:`.
      const dbUrl = isTesting ? 'file::memory:?cache=shared' : pathToFileURL(getDbPath()).href;
      const client = createClient({ url: dbUrl });
      sqliteInstance = client;
      sqliteInstanceIsTesting = isTesting;
      if (isTesting) {
        await registerTestDatabaseClient(client);
      }

      await configureDatabase(client, isTesting);

      const drizzleLogger = new DefaultLogger({ writer: new DrizzleLogWriter() });
      dbInstance = serializeTopLevelOperations(client, drizzle(client, { logger: drizzleLogger }));
      return dbInstance;
    })().catch((error) => {
      if (sqliteInstance) {
        unregisterTestDatabaseClient(sqliteInstance);
        sqliteInstance.close();
      }
      sqliteInstance = null;
      sqliteInstanceIsTesting = false;
      dbInstance = null;
      dbPromise = null;
      throw error;
    });
  }
  try {
    return await dbPromise;
  } finally {
    // Once the in-flight init has settled (success or failure handled above),
    // drop the promise reference so it can be garbage collected.
    dbPromise = null;
  }
}

export async function closeDb() {
  if (sqliteInstance) {
    try {
      // Attempt to checkpoint WAL file before closing
      if (!sqliteInstanceIsTesting && !getEnvBool('PROMPTFOO_DISABLE_WAL_MODE', false)) {
        try {
          await sqliteInstance.execute('PRAGMA wal_checkpoint(TRUNCATE)');
          logger.debug('Successfully checkpointed WAL file before closing');
        } catch (err) {
          logger.debug(`Could not checkpoint WAL file: ${err}`);
        }
      }

      if (sqliteInstanceIsTesting) {
        await closeTestDatabaseClient(sqliteInstance);
      } else {
        // libsql Client.close() is synchronous; the WAL checkpoint above already
        // awaited the I/O that needed to finish before the underlying connection drops.
        sqliteInstance.close();
      }

      logger.debug('Database connection closed successfully');
    } catch (err) {
      logger.error(`Error closing database connection: ${err}`);
      // Even if close fails, we should still clear the instances
      // to prevent reuse of a potentially corrupted connection
    } finally {
      sqliteInstance = null;
      sqliteInstanceIsTesting = false;
      dbInstance = null;
      dbPromise = null;
    }
  }
}

/**
 * Check if the database is currently open
 */
export function isDbOpen(): boolean {
  return sqliteInstance !== null && dbInstance !== null;
}

/**
 * Close database connection if it's currently open
 * Safe to call even if database was never opened
 * Should be called during graceful shutdown to prevent event loop hanging
 */
export async function closeDbIfOpen(): Promise<void> {
  if (sqliteInstance) {
    await closeDb();
  }
}
