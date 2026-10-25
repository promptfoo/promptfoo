import { DatabaseSync } from 'node:sqlite';

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
  let writer: DatabaseSync | undefined;
  try {
    await runDbMigrations();
    const { id } = await EvalFactory.create({
      numResults: 1,
      resultTypes: ['success'],
      withNamedScores: true,
    });
    writer = new DatabaseSync(getDbPath());
    const retry = writer.prepare(`
      INSERT INTO eval_results (id, eval_id, test_idx, prompt_idx, test_case, prompt, provider, success, score, named_scores, grading_result)
      SELECT 'retry', eval_id, test_idx, prompt_idx, test_case, prompt, provider, success, score, named_scores, grading_result
      FROM eval_results WHERE eval_id = ?`);
    // Let the overlap check finish, then commit the retry before the first aggregate reads.
    vi.spyOn(DrizzleLogWriter.prototype, 'write')
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => retry.run(id));
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
    writer?.close();
    await closeDb();
    setConfigDirectoryPath(undefined);
    restoreEnv();
    removeTempDir(dir);
  }
});
