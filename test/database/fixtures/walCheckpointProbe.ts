import { pathToFileURL } from 'node:url';

import { createClient } from '@libsql/client/node';
import { closeDb, getDb, getDbPath, isDbOpen } from '../../../src/database/index';
import logger from '../../../src/logger';

const RESULT_PREFIX = 'PROMPTFOO_WAL_PROBE_RESULT=';

export interface WalCheckpointProbeResult {
  elapsedMs: number;
  isDbOpen: boolean;
  logs: Array<{
    context?: Record<string, unknown>;
    level: 'debug' | 'warn';
    message: string;
  }>;
  rowCount: number;
}

const logs: WalCheckpointProbeResult['logs'] = [];

logger.debug = (message, context) => logs.push({ level: 'debug', message, context });
logger.warn = (message, context) => logs.push({ level: 'warn', message, context });

const db = await getDb();
await db.run('PRAGMA wal_autocheckpoint = 0');
await db.run('CREATE TABLE wal_checkpoint_test (id INTEGER PRIMARY KEY)');
await db.run('INSERT INTO wal_checkpoint_test DEFAULT VALUES');

const holdReader = process.env.PROMPTFOO_WAL_HOLD_READER === 'true';
const reader = holdReader
  ? createClient({ url: pathToFileURL(getDbPath()).toString() })
  : undefined;
let readerTransactionOpen = false;

try {
  if (reader) {
    await reader.execute('BEGIN');
    readerTransactionOpen = true;
    await reader.execute('SELECT * FROM wal_checkpoint_test');
    await db.run('INSERT INTO wal_checkpoint_test DEFAULT VALUES');
  }

  const startedAt = Date.now();
  await closeDb();
  const elapsedMs = Date.now() - startedAt;
  const databaseStillOpen = isDbOpen();

  if (readerTransactionOpen && reader) {
    await reader.execute('ROLLBACK');
    readerTransactionOpen = false;
  }

  const verifier = createClient({ url: pathToFileURL(getDbPath()).toString() });
  const countResult = await verifier.execute('SELECT COUNT(*) AS count FROM wal_checkpoint_test');
  verifier.close();

  console.log(
    `${RESULT_PREFIX}${JSON.stringify({
      elapsedMs,
      isDbOpen: databaseStillOpen,
      logs,
      rowCount: Number(countResult.rows[0]?.count),
    })}`,
  );
} finally {
  if (readerTransactionOpen && reader) {
    await reader.execute('ROLLBACK');
  }
  reader?.close();
  await closeDb();
}
