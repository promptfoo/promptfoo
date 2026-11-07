import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mock } from 'node:test';

import { sql } from 'drizzle-orm';
import { closeDb, DrizzleLogWriter, getDb, getDbPath } from '../../../src/database/index';
import { runDbMigrations } from '../../../src/migrate';
import { calculateFilteredMetrics } from '../../../src/util/calculateFilteredMetrics';

export type FilteredMetricsSnapshotProbeResult = Awaited<
  ReturnType<typeof calculateFilteredMetrics>
>[number];

if (!process.env.PROMPTFOO_CONFIG_DIR) {
  throw new Error('PROMPTFOO_CONFIG_DIR is required for the metrics snapshot probe');
}

try {
  await runDbMigrations();
  const db = await getDb();
  await db.run(sql`INSERT INTO evals (id, results, config) VALUES ('snapshot', '{}', '{}')`);
  const insert = `
    INSERT INTO eval_results (id, eval_id, test_idx, prompt_idx, test_case, prompt, provider, success, score, named_scores, grading_result)
    VALUES (?, 'snapshot', 0, 0, '{}', '{}', '{}', 1, 1, '{"accuracy":1}', '{"componentResults":[{"pass":true}]}')`;
  await db.$client.execute({ sql: insert, args: ['initial'] });
  const writeRetry = () =>
    execFileSync(process.execPath, [
      '-e',
      `const db = new (require('node:sqlite').DatabaseSync)(process.argv[1]);
       db.prepare(process.argv[2]).run(process.argv[3]);
       db.close();`,
      getDbPath(),
      insert,
      'retry',
    ]);
  // The writer must commit after the preflight and before aggregation.
  mock
    .method(DrizzleLogWriter.prototype, 'write', () => {})
    .mock.mockImplementationOnce(writeRetry, 1);
  const read = () =>
    calculateFilteredMetrics({
      evalId: 'snapshot',
      numPrompts: 1,
      whereSql: sql`eval_id = 'snapshot'`,
    });

  const [snapshot] = await read();
  await assert.rejects(read(), /overlapping attempts/);
  console.log(`PROMPTFOO_DATABASE_PROBE_RESULT=${JSON.stringify(snapshot)}`);
} finally {
  mock.restoreAll();
  await closeDb();
}
