import { pathToFileURL } from 'node:url';

import { createClient } from '@libsql/client/node';
import { closeDb, getDb, getDbPath } from '../../../src/database/index';
import type { Client } from '@libsql/client/node';

export interface LockRecoveryProbeResult {
  firstError: string | null;
  followupError: string | null;
  followupRowsAffected: number | null;
  transactionAfterFailureError: string | null;
  callbackCalls: number;
  clientClosedAfterFailure: boolean;
  beforeCloseIds: number[];
  afterCloseIds: number[];
  attachedRowCount: number | null;
  pragmas: Record<string, number>;
}

if (!process.env.PROMPTFOO_CONFIG_DIR) {
  throw new Error('PROMPTFOO_CONFIG_DIR is required for the lock recovery probe');
}

async function captureError(operation: () => Promise<unknown>): Promise<string | null> {
  try {
    await operation();
    return null;
  } catch (error) {
    return error instanceof Error
      ? `${error.message}: ${String(error.cause ?? '')}`
      : String(error);
  }
}

const mode = process.argv[2];
const db = await getDb();
const client = (db as typeof db & { $client: Client }).$client;
const url = pathToFileURL(getDbPath()).href;
const attachedPath = `${getDbPath()}.attached`;
const contender = createClient({ url: mode === 'script' ? pathToFileURL(attachedPath).href : url });
const result: LockRecoveryProbeResult = {
  firstError: null,
  followupError: null,
  followupRowsAffected: null,
  transactionAfterFailureError: null,
  callbackCalls: 0,
  clientClosedAfterFailure: false,
  beforeCloseIds: [],
  afterCloseIds: [],
  attachedRowCount: null,
  pragmas: {},
};

async function readPersistedIds(): Promise<number[]> {
  const verifier = createClient({ url });
  try {
    const rows = await verifier.execute('SELECT id FROM lock_recovery_test ORDER BY id');
    return rows.rows.map((row) => Number(row.id));
  } finally {
    verifier.close();
  }
}

try {
  await db.run('CREATE TABLE lock_recovery_test (id INTEGER PRIMARY KEY)');
  await db.run('INSERT INTO lock_recovery_test VALUES (1)');
  // Exercise the JS retry/recovery path without blocking this process's lock holder.
  await db.run('PRAGMA busy_timeout = 0');

  if (mode === 'root-in-transaction') {
    await db.transaction(async (tx) => {
      result.callbackCalls++;
      await tx.run('INSERT INTO lock_recovery_test VALUES (2)');
      await db.run('PRAGMA busy_timeout = 0');
      result.firstError = await captureError(() =>
        db.run('INSERT INTO lock_recovery_test VALUES (3)'),
      );
    });
  } else {
    if (mode === 'script') {
      await contender.execute('CREATE TABLE attached_rows (id INTEGER PRIMARY KEY)');
    }
    await contender.execute('BEGIN IMMEDIATE');
    try {
      switch (mode) {
        case 'begin':
          result.firstError = await captureError(() =>
            db.transaction(async (tx) => {
              result.callbackCalls++;
              await tx.run('INSERT INTO lock_recovery_test VALUES (2)');
            }),
          );
          break;
        case 'script': {
          const escapedPath = attachedPath.replace(/'/g, "''");
          result.firstError = await captureError(() =>
            client.executeMultiple(`
              ATTACH DATABASE '${escapedPath}' AS attached_db;
              INSERT INTO lock_recovery_test DEFAULT VALUES;
              INSERT INTO attached_db.attached_rows DEFAULT VALUES;
            `),
          );
          break;
        }
        case 'reconnect-failure':
        case 'configuration-failure': {
          const reconnect = client.reconnect.bind(client);
          client.reconnect = async () => {
            if (mode === 'reconnect-failure') {
              throw new Error('Injected reconnect failure');
            }
            await reconnect();
            // Simulate losing the replacement connection before restoring its PRAGMAs.
            client.close();
          };
          result.firstError = await captureError(() =>
            db.run('INSERT INTO lock_recovery_test VALUES (2)'),
          );
          break;
        }
        case 'terminal':
          result.firstError = await captureError(() =>
            db.run('INSERT INTO lock_recovery_test VALUES (2)'),
          );
          break;
        default:
          throw new Error(`Unknown lock recovery probe mode: ${mode}`);
      }
    } finally {
      await contender.execute('ROLLBACK');
    }
  }

  result.clientClosedAfterFailure = client.closed;
  if (!client.closed) {
    for (const pragma of ['busy_timeout', 'foreign_keys', 'synchronous', 'wal_autocheckpoint']) {
      const query = await client.execute(`PRAGMA ${pragma}`);
      result.pragmas[pragma] = Number(query.rows[0]?.[query.columns[0]]);
    }
  }
  result.followupError = await captureError(async () => {
    const insert = await db.run(
      `INSERT INTO lock_recovery_test VALUES (${mode === 'root-in-transaction' ? 4 : 3})`,
    );
    result.followupRowsAffected = insert.rowsAffected;
  });
  if (mode === 'reconnect-failure' || mode === 'configuration-failure') {
    result.transactionAfterFailureError = await captureError(() =>
      db.transaction(async (tx) => {
        result.callbackCalls++;
        await tx.run('INSERT INTO lock_recovery_test VALUES (4)');
      }),
    );
  }
  if (mode === 'script') {
    const query = await contender.execute('SELECT COUNT(*) AS count FROM attached_rows');
    result.attachedRowCount = Number(query.rows[0]?.count);
  }
  result.beforeCloseIds = await readPersistedIds();
  await closeDb();
  result.afterCloseIds = await readPersistedIds();
  console.log(`PROMPTFOO_DATABASE_PROBE_RESULT=${JSON.stringify(result)}`);
} finally {
  contender.close();
  await closeDb();
}
