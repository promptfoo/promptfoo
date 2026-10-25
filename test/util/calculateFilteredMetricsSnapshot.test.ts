import { execFileSync } from 'node:child_process';

import { sql } from 'drizzle-orm';
import { expect, it, vi } from 'vitest';
import { closeDb, DrizzleLogWriter, getDbPath } from '../../src/database/index';
import { runDbMigrations } from '../../src/migrate';
import { calculateFilteredMetrics } from '../../src/util/calculateFilteredMetrics';
import { setConfigDirectoryPath } from '../../src/util/config/manage';
import EvalFactory from '../factories/evalFactory';
import { createTempDir, mockProcessEnv, removeTempDir } from './utils';

it('keeps one metrics snapshot when another connection saves a retry', async () => {
  const dir = createTempDir();
  const restoreEnv = mockProcessEnv({ IS_TESTING: 'false' });
  setConfigDirectoryPath(dir);
  try {
    await runDbMigrations();
    const { id } = await EvalFactory.create({
      numResults: 1,
      resultTypes: ['success'],
      withNamedScores: true,
    });
    const retrySql = `
      INSERT INTO eval_results (id, eval_id, test_idx, prompt_idx, test_case, prompt, provider, success, score, named_scores, grading_result)
      SELECT 'retry', eval_id, test_idx, prompt_idx, test_case, prompt, provider, success, score, named_scores, grading_result
      FROM eval_results WHERE eval_id = ?`;
    const writeRetry = () =>
      execFileSync(process.execPath, [
        '-e',
        `const db = new (require('node:sqlite').DatabaseSync)(process.argv[1]);
         db.prepare(process.argv[2]).run(process.argv[3]);
         db.close();`,
        getDbPath(),
        retrySql,
        id,
      ]);
    // A separate process must acquire the WAL writer lock after preflight, before aggregation.
    vi.spyOn(DrizzleLogWriter.prototype, 'write')
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(writeRetry);
    const read = () =>
      calculateFilteredMetrics({ evalId: id, numPrompts: 1, whereSql: sql`eval_id = ${id}` });

    expect((await read())[0]).toMatchObject({
      testPassCount: 1,
      namedScores: { accuracy: 1 },
      assertPassCount: 1,
    });
    await expect(read()).rejects.toThrow('overlapping attempts');
  } finally {
    vi.restoreAllMocks();
    await closeDb();
    setConfigDirectoryPath(undefined);
    restoreEnv();
    removeTempDir(dir);
  }
});
