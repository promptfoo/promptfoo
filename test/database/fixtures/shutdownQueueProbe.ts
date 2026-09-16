import assert from 'node:assert/strict';

import { closeDb, getDb, isDbOpen } from '../../../src/database/index';

export interface ShutdownQueueProbeResult {
  isDbOpen: boolean;
  persistedIds: number[];
}

if (!process.env.PROMPTFOO_CONFIG_DIR) {
  throw new Error('PROMPTFOO_CONFIG_DIR is required for the shutdown queue probe');
}

// A separate process releases native statement handles before Windows removes the fixture DB.
const db = await getDb();
await db.run('CREATE TABLE shutdown_test (id INTEGER PRIMARY KEY)');
let markStarted!: () => void;
const started = new Promise<void>((resolve) => {
  markStarted = resolve;
});
let releaseTransaction!: () => void;
const release = new Promise<void>((resolve) => {
  releaseTransaction = resolve;
});
const transaction = db.transaction(async (tx) => {
  markStarted();
  await release;
  await assert.rejects(closeDb(), /inside a transaction/);
  await tx.run('INSERT INTO shutdown_test VALUES (1)');
});
await started;
const accepted = db.run('INSERT INTO shutdown_test VALUES (2)').execute();
const closing = closeDb();
const secondClose = closeDb();
try {
  await assert.rejects(getDb(), /closing/);
  await assert.rejects(db.run('INSERT INTO shutdown_test VALUES (3)').execute());
  await assert.rejects(
    db.transaction(async () => {}),
    /closing/,
  );
} finally {
  releaseTransaction();
}
await Promise.all([transaction, accepted, closing, secondClose]);
const databaseStillOpen = isDbOpen();
try {
  const reopened = await getDb();
  const rows = await reopened.all<{ id: number }>('SELECT id FROM shutdown_test ORDER BY id');
  await assert.rejects(db.run('INSERT INTO shutdown_test VALUES (4)').execute());
  console.log(
    `PROMPTFOO_DATABASE_PROBE_RESULT=${JSON.stringify({
      isDbOpen: databaseStillOpen,
      persistedIds: rows.map((row) => row.id),
    } satisfies ShutdownQueueProbeResult)}`,
  );
} finally {
  await closeDb();
}
