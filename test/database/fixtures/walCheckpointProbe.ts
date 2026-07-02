import { pathToFileURL } from 'node:url';

import { createClient } from '@libsql/client/node';
import { closeDb, getDb, getDbPath, isDbOpen } from '../../../src/database/index';
import logger from '../../../src/logger';

const RESULT_PREFIX = 'PROMPTFOO_WAL_PROBE_RESULT=';

export interface WalCheckpointProbeResult {
  elapsedMs: number;
  insertAcknowledged: boolean;
  isDbOpen: boolean;
  logs: Array<{
    context?: Record<string, unknown>;
    level: 'debug' | 'warn';
    message: string;
  }>;
  rowCount: number;
}

const logs: WalCheckpointProbeResult['logs'] = [];

if (!process.env.PROMPTFOO_CONFIG_DIR) {
  throw new Error('PROMPTFOO_CONFIG_DIR is required for the WAL checkpoint probe');
}

logger.debug = (message, context) => logs.push({ level: 'debug', message, context });
logger.warn = (message, context) => logs.push({ level: 'warn', message, context });

const db = await getDb();
await db.run('PRAGMA wal_autocheckpoint = 0');
await db.run('CREATE TABLE wal_checkpoint_test (id INTEGER PRIMARY KEY)');
await db.run('INSERT INTO wal_checkpoint_test DEFAULT VALUES');

const holdReader = process.env.PROMPTFOO_WAL_HOLD_READER === 'true';
const holdWriter = process.env.PROMPTFOO_WAL_HOLD_WRITER === 'true';
const contender =
  holdReader || holdWriter
    ? createClient({ url: pathToFileURL(getDbPath()).toString() })
    : undefined;
let contenderTransactionOpen = false;
let insertAcknowledged = false;

try {
  let elapsedMs: number;

  if (contender && holdWriter) {
    // Mirror the acknowledged-write-loss scenario: another connection holds the write
    // lock and rolls back after 300ms while this process queues an insert and closeDb().
    // The acknowledged insert must survive a reopen.
    //
    // The contender lives in this process, so SQLite's synchronous busy-wait would
    // block the event loop and keep the 300ms rollback timer from ever firing — the
    // insert would burn the whole busy budget before failing. A real cross-process
    // writer releases the lock independently. Shrink the busy budget so the insert
    // fails fast and takes the retry path, which is exactly the path that used to
    // acknowledge a write that never became durable (libsql leaves the connection
    // wedged after a busy write failure).
    await db.run('PRAGMA busy_timeout = 100');
    await contender.execute('BEGIN IMMEDIATE');
    contenderTransactionOpen = true;
    const release = setTimeout(() => {
      contender
        .execute('ROLLBACK')
        .then(() => {
          contenderTransactionOpen = false;
        })
        .catch(() => {});
    }, 300);
    const insertPromise = db.run('INSERT INTO wal_checkpoint_test DEFAULT VALUES').then(
      () => {
        insertAcknowledged = true;
      },
      (error) => {
        logs.push({ level: 'warn', message: `insert rejected: ${error}` });
      },
    );
    const startedAt = Date.now();
    const closePromise = closeDb();
    await insertPromise;
    await closePromise;
    elapsedMs = Date.now() - startedAt;
    clearTimeout(release);
  } else {
    if (contender && holdReader) {
      await contender.execute('BEGIN');
      contenderTransactionOpen = true;
      await contender.execute('SELECT * FROM wal_checkpoint_test');
      await db.run('INSERT INTO wal_checkpoint_test DEFAULT VALUES');
      insertAcknowledged = true;
    }

    const startedAt = Date.now();
    await closeDb();
    elapsedMs = Date.now() - startedAt;
  }

  const databaseStillOpen = isDbOpen();

  if (contenderTransactionOpen && contender) {
    await contender.execute('ROLLBACK');
    contenderTransactionOpen = false;
  }

  const verifier = createClient({ url: pathToFileURL(getDbPath()).toString() });
  const countResult = await verifier.execute('SELECT COUNT(*) AS count FROM wal_checkpoint_test');
  verifier.close();

  console.log(
    `${RESULT_PREFIX}${JSON.stringify({
      elapsedMs,
      insertAcknowledged,
      isDbOpen: databaseStillOpen,
      logs,
      rowCount: Number(countResult.rows[0]?.count),
    })}`,
  );
} finally {
  if (contenderTransactionOpen && contender) {
    await contender.execute('ROLLBACK');
  }
  contender?.close();
  await closeDb();
}
