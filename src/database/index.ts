import { AsyncLocalStorage } from 'node:async_hooks';
import { pathToFileURL } from 'node:url';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { DefaultLogger, type LogWriter } from 'drizzle-orm/logger';
import { getEnvBool } from '../envars';
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
let closePromise: Promise<void> | null = null;
let drainOperations: (() => Promise<void>) | null = null;
let executeForClose: Client['execute'] | null = null;

function isMissingPathError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

function resolveDatabaseFileSymlinks(filePath: string): string {
  let resolvedPath = path.resolve(filePath);
  const visitedPaths = new Set<string>();

  while (visitedPaths.size < 40) {
    if (visitedPaths.has(resolvedPath)) {
      throw new Error(`Refusing to resolve a database symlink cycle at ${resolvedPath}`);
    }
    visitedPaths.add(resolvedPath);

    let stats: fs.Stats;
    try {
      stats = fs.lstatSync(resolvedPath);
    } catch (error) {
      if (isMissingPathError(error)) {
        return resolvedPath;
      }
      throw error;
    }

    if (!stats.isSymbolicLink()) {
      return resolvedPath;
    }

    const linkTarget = fs.readlinkSync(resolvedPath);
    resolvedPath = path.isAbsolute(linkTarget)
      ? linkTarget
      : `${path.dirname(resolvedPath)}${path.sep}${linkTarget}`;
  }

  throw new Error(`Refusing to resolve an excessive database symlink chain at ${resolvedPath}`);
}

function databasePathsReferToSameFile(firstPath: string, secondPath: string): boolean {
  const resolvedFirstPath = resolveDatabaseFileSymlinks(firstPath);
  const resolvedSecondPath = resolveDatabaseFileSymlinks(secondPath);
  if (resolvedFirstPath === resolvedSecondPath) {
    return true;
  }

  try {
    const firstStats = fs.statSync(resolvedFirstPath, { bigint: true });
    const secondStats = fs.statSync(resolvedSecondPath, { bigint: true });
    if (
      firstStats.ino !== 0n &&
      firstStats.dev === secondStats.dev &&
      firstStats.ino === secondStats.ino
    ) {
      return true;
    }
  } catch (error) {
    // Missing files can still resolve through a shared directory alias below, but any
    // other identity error (EIO, ESTALE, EACCES, ...) is indeterminate — propagating it
    // fails closed instead of letting a test runner mutate user data.
    if (!isMissingPathError(error)) {
      throw error;
    }
  }

  try {
    return (
      path.join(
        fs.realpathSync.native(path.dirname(resolvedFirstPath)),
        path.basename(resolvedFirstPath),
      ) ===
      path.join(
        fs.realpathSync.native(path.dirname(resolvedSecondPath)),
        path.basename(resolvedSecondPath),
      )
    );
  } catch (error) {
    if (!isMissingPathError(error)) {
      throw error;
    }
    return false;
  }
}

export function getDbPath() {
  const configDirectoryPath = getConfigDirectoryPath();
  const dbPath = path.resolve(configDirectoryPath, 'promptfoo.db');
  // Runner-owned globals survive helpers that clear process.env; JEST_WORKER_ID alone does not
  // identify Jest because the generic jest-worker package sets it for ordinary tasks.
  const isTestProcess =
    process.env.VITEST === 'true' ||
    Object.prototype.hasOwnProperty.call(globalThis, '__vitest_worker__') ||
    Object.prototype.hasOwnProperty.call(globalThis, Symbol.for('jest-native-promise'));
  const assertSafeTestPath = () => {
    if (
      isTestProcess &&
      databasePathsReferToSameFile(dbPath, path.resolve(os.homedir(), '.promptfoo', 'promptfoo.db'))
    ) {
      throw new Error(
        'Refusing to open the default Promptfoo database while running tests. ' +
          'Set IS_TESTING=true for an in-memory database or set PROMPTFOO_CONFIG_DIR to a test-only directory.',
      );
    }
  };
  assertSafeTestPath();
  getConfigDirectoryPath(true /* createIfNotExists */);
  assertSafeTestPath();
  return dbPath;
}

export function getDbSignalPath() {
  return path.resolve(getConfigDirectoryPath(true /* createIfNotExists */), 'evalLastWritten');
}

async function configureConnection(
  execute: Client['execute'],
  busyTimeoutMs: number,
  walMode: 'enable' | 'preserve' | 'skip',
): Promise<void> {
  await execute('PRAGMA foreign_keys = ON');
  await execute(`PRAGMA busy_timeout = ${busyTimeoutMs}`);

  if (walMode !== 'skip' && !getEnvBool('PROMPTFOO_DISABLE_WAL_MODE', false)) {
    try {
      if (walMode === 'enable') {
        await execute('PRAGMA journal_mode = WAL');
      }
      const result = await execute('PRAGMA journal_mode');
      const journalMode = String(result.rows[0]?.journal_mode ?? '');

      if (journalMode.toLowerCase() === 'wal') {
        await execute('PRAGMA wal_autocheckpoint = 1000');
        await execute('PRAGMA synchronous = NORMAL');
        if (walMode === 'enable') {
          logger.debug('Successfully enabled SQLite WAL mode');
        }
      } else if (walMode === 'enable') {
        logger.warn(
          `Failed to enable WAL mode (got '${journalMode}'). ` +
            'Database performance may be reduced. This can happen on network filesystems. ' +
            'Set PROMPTFOO_DISABLE_WAL_MODE=true to suppress this warning.',
        );
      }
    } catch (err) {
      // Recovery must fail closed if it cannot restore the connection settings.
      if (walMode === 'preserve') {
        throw err;
      }
      logger.warn(
        `Error configuring SQLite WAL mode: ${err}. ` +
          'Database will use default journal mode. Performance may be reduced. ' +
          'This can happen on network filesystems or certain containerized environments. ' +
          'Set PROMPTFOO_DISABLE_WAL_MODE=true to suppress this warning.',
      );
    }
  }
}

// Shared-cache table locks surface as SQLITE_LOCKED, which busy_timeout does not retry.
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

function serializeTopLevelOperations(
  client: Client,
  db: Drizzle,
  { reconnectOnLockFailure }: { reconnectOnLockFailure: boolean },
): Drizzle {
  const rawExecute = client.execute.bind(client);

  const withLockRecovery = async <T>(operation: () => Promise<T>, retry: boolean): Promise<T> => {
    for (let attempt = 1; ; attempt++) {
      // Do not retry or reuse a client whose recovery failed.
      if (client.closed) {
        throw new Error('Database connection is closed');
      }
      try {
        return await operation();
      } catch (error) {
        if (!isTransientDatabaseLockError(error)) {
          throw error;
        }
        // libsql 0.5.29 can leave a failed statement active: later writes appear to
        // succeed but disappear at close. Heal even when this operation will not
        // retry. Reconnecting shared in-memory tests would destroy their schema.
        if (reconnectOnLockFailure) {
          try {
            const result = await rawExecute('PRAGMA busy_timeout');
            const busyTimeoutMs = Number(result.rows[0]?.timeout ?? 5000);
            await client.reconnect();
            // journal_mode persists in the file; restore only connection settings.
            await configureConnection(rawExecute, busyTimeoutMs, 'preserve');
          } catch (recoveryError) {
            logger.warn('Could not recover database connection after lock failure', {
              error: recoveryError,
            });
            try {
              client.close();
            } finally {
              throw error;
            }
          }
        }
        if (!retry || attempt >= TRANSIENT_LOCK_RETRY_ATTEMPTS) {
          throw error;
        }
        await sleep(
          Math.min(TRANSIENT_LOCK_RETRY_BASE_MS * 2 ** (attempt - 1), TRANSIENT_LOCK_RETRY_MAX_MS),
        );
      }
    }
  };
  const transaction = db.transaction.bind(db);
  type TransactionCallback = Parameters<typeof transaction>[0];
  type TransactionContext = Parameters<TransactionCallback>[0];

  type TransactionScope = { transaction: TransactionContext | undefined };
  const activeTransaction = new AsyncLocalStorage<TransactionScope>();
  let operationQueue = Promise.resolve();
  let closing = false;
  executeForClose = rawExecute;
  drainOperations = () => {
    if (activeTransaction.getStore()?.transaction) {
      throw new Error('Cannot close the database inside a transaction');
    }
    closing = true;
    return operationQueue;
  };

  const runSerialized = <T>(operation: () => Promise<T>): Promise<T> => {
    if (closing) {
      return Promise.reject(new Error('Database connection is closing'));
    }
    const result = operationQueue.then(operation);
    operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const serializeClientMethod = <TArgs extends unknown[], TResult>(
    method: (...args: TArgs) => Promise<TResult>,
    retry = true,
  ) => {
    return (...args: TArgs) => {
      // A root call cannot borrow the transaction's connection. Queueing would
      // deadlock, and reconnecting after a lock error would abort the transaction.
      if (activeTransaction.getStore()?.transaction) {
        return Promise.reject(
          new Error('Use the transaction handle (tx) for database operations inside a transaction'),
        );
      }
      return runSerialized(() => withLockRecovery(() => method(...args), retry));
    };
  };

  // Statements and batches are atomic; executeMultiple can commit a prefix before
  // failing, so retrying that script could duplicate writes.
  client.execute = serializeClientMethod(rawExecute) as typeof client.execute;
  client.batch = serializeClientMethod(client.batch.bind(client));
  client.migrate = serializeClientMethod(client.migrate.bind(client));
  client.executeMultiple = serializeClientMethod(client.executeMultiple.bind(client), false);

  db.transaction = ((callback, config) => {
    const currentTransaction = activeTransaction.getStore()?.transaction;
    if (currentTransaction) {
      // Reuse the transaction already owned by this async call chain. Queueing here
      // would deadlock because the outer callback is waiting for the nested promise.
      return callback(currentTransaction);
    }

    return runSerialized(() =>
      withLockRecovery(
        () =>
          transaction((tx) => {
            const scope: TransactionScope = { transaction: tx };
            return activeTransaction.run(scope, async () => {
              try {
                return await callback(tx);
              } finally {
                // Async resources can outlive the callback. Their root operations
                // must queue normally instead of reusing a completed transaction.
                scope.transaction = undefined;
              }
            });
          }, config),
        false,
      ),
    );
  }) as typeof db.transaction;

  return db;
}

export async function getDb() {
  if (closePromise) {
    throw new Error('Database connection is closing');
  }
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
      // Keep one shared schema across test clients from separate module graphs.
      const dbUrl = isTesting ? 'file::memory:?cache=shared' : pathToFileURL(getDbPath()).href;
      // Operations are already serialized. Reuse the configured connection so
      // every statement and transaction retains its connection-local PRAGMAs.
      const client = createClient({ url: dbUrl, concurrency: 1 });
      sqliteInstance = client;
      sqliteInstanceIsTesting = isTesting;
      if (isTesting) {
        await registerTestDatabaseClient(client);
      }

      await configureConnection(client.execute.bind(client), 5000, isTesting ? 'skip' : 'enable');

      const drizzleLogger = new DefaultLogger({ writer: new DrizzleLogWriter() });
      dbInstance = serializeTopLevelOperations(client, drizzle(client, { logger: drizzleLogger }), {
        // Never reconnect the shared-cache in-memory test database: closing its
        // last connection would drop every table mid-test.
        reconnectOnLockFailure: !isTesting,
      });
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
  // Stop accepting work synchronously, before awaiting any queued operations.
  // The drain also rejects a close from inside a transaction, even during shutdown.
  const pendingOperations = drainOperations?.();
  if (closePromise) {
    return closePromise;
  }
  const initialization = dbPromise;
  closePromise = (async () => {
    await initialization?.catch(() => undefined);
    await pendingOperations;
    // Initialization may have installed the queue while closeDb was waiting.
    await drainOperations?.();
    if (!sqliteInstance) {
      return;
    }
    const execute = executeForClose ?? sqliteInstance.execute.bind(sqliteInstance);
    try {
      // Attempt to checkpoint WAL file before closing
      if (!sqliteInstanceIsTesting && !getEnvBool('PROMPTFOO_DISABLE_WAL_MODE', false)) {
        try {
          // Queue behind pending writes, then attempt truncation without waiting on
          // readers. Native busy waits block the JS shutdown watchdog from firing.
          await execute('PRAGMA busy_timeout = 0');
          const result = await execute('PRAGMA wal_checkpoint(TRUNCATE)');
          const row = result.rows[0];
          const checkpointStatus = {
            busy: Number(row?.busy),
            log: row?.log,
            checkpointed: row?.checkpointed,
          };

          if (checkpointStatus.busy === 0) {
            logger.debug('Successfully checkpointed WAL file before closing', checkpointStatus);
          } else {
            logger.warn('WAL checkpoint incomplete before closing database', checkpointStatus);
          }
        } catch (error) {
          // Committed data is still safe: it lives in the WAL file, which replays on
          // the next open. Only the truncation optimization is lost.
          logger.warn('Could not checkpoint WAL file before close', { error });
        }
      }

      if (sqliteInstanceIsTesting) {
        await closeTestDatabaseClient(sqliteInstance, execute);
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
      drainOperations = null;
      executeForClose = null;
    }
  })();
  try {
    await closePromise;
  } finally {
    closePromise = null;
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
  if (sqliteInstance || dbPromise || closePromise) {
    await closeDb();
  }
}
