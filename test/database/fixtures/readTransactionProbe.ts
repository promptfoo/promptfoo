import { pathToFileURL } from 'node:url';

import { createClient } from '@libsql/client/node';
import { sql } from 'drizzle-orm';
import { closeDb, getDb, getDbPath, withReadTransaction } from '../../../src/database/index';

export interface ReadTransactionProbeResult {
  journalMode: string;
  initialValue: number;
  snapshotValueAfterWrite: number;
  valueAfterCommit: number;
  valueDuringUncommittedWrite: number;
  valueAfterRollback: number;
}

if (!process.env.PROMPTFOO_CONFIG_DIR) {
  throw new Error('PROMPTFOO_CONFIG_DIR is required for the read transaction probe');
}

// A separate process releases native statement handles before Windows removes the fixture DB.
const db = await getDb();
const writer = createClient({ url: pathToFileURL(getDbPath()).href, concurrency: 1 });
try {
  await db.run('CREATE TABLE read_snapshot_test (value INTEGER)');
  await db.run('INSERT INTO read_snapshot_test VALUES (1)');
  // Fail immediately if the reader mistakenly reserves a write lock.
  await writer.execute('PRAGMA busy_timeout = 0');
  const [mode] = await db.all<{ journal_mode: string }>('PRAGMA journal_mode');
  const readQuery = sql`SELECT value FROM read_snapshot_test`;
  const [initialValue, snapshotValueAfterWrite] = await withReadTransaction(async (reader) => {
    const [initial] = await reader.all<{ value: number }>(readQuery);
    await writer.execute('UPDATE read_snapshot_test SET value = 2');
    const [afterWrite] = await reader.all<{ value: number }>(readQuery);
    return [initial.value, afterWrite.value];
  });
  const [committed] = await db.all<{ value: number }>(readQuery);

  // A reader can also start while a separate writer holds an uncommitted update.
  const pendingWrite = await writer.transaction('write');
  let valueDuringUncommittedWrite: number;
  try {
    await pendingWrite.execute('UPDATE read_snapshot_test SET value = 3');
    valueDuringUncommittedWrite = await withReadTransaction(async (reader) => {
      const [row] = await reader.all<{ value: number }>(readQuery);
      return row.value;
    });
    await pendingWrite.rollback();
  } finally {
    pendingWrite.close();
  }
  const [rolledBack] = await db.all<{ value: number }>(readQuery);
  console.log(
    `PROMPTFOO_DATABASE_PROBE_RESULT=${JSON.stringify({
      journalMode: mode.journal_mode,
      initialValue,
      snapshotValueAfterWrite,
      valueAfterCommit: committed.value,
      valueDuringUncommittedWrite,
      valueAfterRollback: rolledBack.value,
    } satisfies ReadTransactionProbeResult)}`,
  );
} finally {
  writer.close();
  await closeDb();
}
