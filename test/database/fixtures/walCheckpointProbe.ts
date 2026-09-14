import { fork } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createClient } from '@libsql/client/node';
import { closeDb, getDb, getDbPath, isDbOpen } from '../../../src/database/index';
import logger from '../../../src/logger';
import type { Transaction } from '@libsql/client/node';

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

if (!process.env.PROMPTFOO_CONFIG_DIR) {
  throw new Error('PROMPTFOO_CONFIG_DIR is required for the WAL checkpoint probe');
}

const mode = process.argv[2];
const url = pathToFileURL(getDbPath()).href;

if (mode === 'hold-writer') {
  const writer = createClient({ url });
  const writerTransaction = await writer.transaction('write');
  // Release in another process so the parent's native busy wait cannot delay it.
  process.once('message', () => {
    setTimeout(async () => {
      await writerTransaction.rollback();
      writer.close();
      process.disconnect?.();
    }, 300);
  });
  process.once('disconnect', () => writer.close());
  process.send?.('locked');
} else {
  const logs: WalCheckpointProbeResult['logs'] = [];
  logger.debug = (message, context) => logs.push({ level: 'debug', message, context });
  logger.warn = (message, context) => logs.push({ level: 'warn', message, context });

  const db = await getDb();
  await db.run('PRAGMA wal_autocheckpoint = 0');
  await db.run('CREATE TABLE wal_checkpoint_test (id INTEGER PRIMARY KEY)');
  await db.run('INSERT INTO wal_checkpoint_test DEFAULT VALUES');

  const close =
    mode === 'shutdown' ? (await import('../../../src/mainUtils')).shutdownGracefully : closeDb;
  const reader = mode === 'reader' || mode === 'shutdown' ? createClient({ url }) : undefined;
  let readerTransaction: Transaction | undefined;
  let writer: ReturnType<typeof fork> | undefined;
  let writerExited: Promise<unknown> | undefined;
  let insertAcknowledged = false;

  try {
    if (reader) {
      readerTransaction = await reader.transaction('read');
      await readerTransaction.execute('SELECT * FROM wal_checkpoint_test');
      await db.run('INSERT INTO wal_checkpoint_test DEFAULT VALUES');
      insertAcknowledged = true;
    }
    if (mode === 'writer') {
      writer = fork(fileURLToPath(import.meta.url), ['hold-writer'], {
        execArgv: ['--import', 'tsx'],
        stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
      });
      writerExited = once(writer, 'exit');
      await Promise.race([
        once(writer, 'message'),
        writerExited.then(() => {
          throw new Error('Writer exited before acquiring the lock');
        }),
      ]);
      // Force at least one failed attempt before the other process releases its lock.
      await db.run('PRAGMA busy_timeout = 0');
      writer.send('release');
    }

    const startedAt = Date.now();
    const insertPromise = writer
      ? db.run('INSERT INTO wal_checkpoint_test DEFAULT VALUES').then(() => {
          insertAcknowledged = true;
        })
      : Promise.resolve();
    await Promise.all([insertPromise, close()]);
    const databaseStillOpen = isDbOpen();

    await readerTransaction?.rollback();
    await writerExited;
    const verifier = createClient({ url });
    let rowCount: number;
    try {
      const query = await verifier.execute('SELECT COUNT(*) AS count FROM wal_checkpoint_test');
      rowCount = Number(query.rows[0]?.count);
    } finally {
      verifier.close();
    }

    // Include the actual process exit in the shutdown measurement. A forced exit
    // before cleanup finishes cannot produce this result and fails the parent test.
    process.once('exit', () => {
      console.log(
        `PROMPTFOO_DATABASE_PROBE_RESULT=${JSON.stringify({
          elapsedMs: Date.now() - startedAt,
          insertAcknowledged,
          isDbOpen: databaseStillOpen,
          logs,
          rowCount,
        })}`,
      );
    });
  } finally {
    readerTransaction?.close();
    reader?.close();
    if (writer && writer.exitCode === null) {
      writer.kill();
    }
    await writerExited;
    await closeDb();
  }
}
