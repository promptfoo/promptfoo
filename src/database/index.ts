import { AsyncLocalStorage } from 'node:async_hooks';
import { pathToFileURL } from 'node:url';
import * as path from 'path';

import { DefaultLogger, type LogWriter } from 'drizzle-orm/logger';
import { getEnvBool } from '../envars';
import logger from '../logger';
import { getConfigDirectoryPath } from '../util/config/manage';

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

export function getDbPath() {
  return path.resolve(getConfigDirectoryPath(true /* createIfNotExists */), 'promptfoo.db');
}

export function getDbSignalPath() {
  return path.resolve(getConfigDirectoryPath(true /* createIfNotExists */), 'evalLastWritten');
}

async function configureDatabase(client: Client, skipWalMode: boolean): Promise<void> {
  // Enable foreign key constraints (required for referential integrity)
  await client.execute('PRAGMA foreign_keys = ON');

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
      // it behind the outer transaction would deadlock.
      if (activeTransaction.getStore()) {
        return method(...args);
      }
      return runSerialized(() => method(...args));
    };
  };

  // better-sqlite3 executed statements synchronously on one connection. libsql opens a
  // new logical connection for top-level statements and interactive transactions, so an
  // ordinary write started while a transaction owns the write lock fails with SQLITE_BUSY.
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

      await configureDatabase(client, isTesting);

      const drizzleLogger = new DefaultLogger({ writer: new DrizzleLogWriter() });
      dbInstance = serializeTopLevelOperations(client, drizzle(client, { logger: drizzleLogger }));
      return dbInstance;
    })().catch((error) => {
      sqliteInstance?.close();
      sqliteInstance = null;
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
      if (!getEnvBool('IS_TESTING') && !getEnvBool('PROMPTFOO_DISABLE_WAL_MODE', false)) {
        try {
          await sqliteInstance.execute('PRAGMA wal_checkpoint(TRUNCATE)');
          logger.debug('Successfully checkpointed WAL file before closing');
        } catch (err) {
          logger.debug(`Could not checkpoint WAL file: ${err}`);
        }
      }

      // libsql Client.close() is synchronous; the WAL checkpoint above already
      // awaited the I/O that needed to finish before the underlying connection drops.
      sqliteInstance.close();
      logger.debug('Database connection closed successfully');
    } catch (err) {
      logger.error(`Error closing database connection: ${err}`);
      // Even if close fails, we should still clear the instances
      // to prevent reuse of a potentially corrupted connection
    } finally {
      sqliteInstance = null;
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
