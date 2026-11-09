import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../src/database/index';
import { evalResultsTable } from '../../src/database/tables';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import { deleteErrorResults, getReplacedErrorResultIds } from '../../src/node/retry';
import { ResultFailureReason } from '../../src/types/index';

vi.mock('../../src/logger');

beforeAll(async () => {
  await runDbMigrations();
});

afterEach(() => {
  vi.resetAllMocks();
});

async function insertResult(
  record: Eval,
  suffix: string,
  testIdx: number,
  promptIdx: number,
  reason: number = ResultFailureReason.ERROR,
) {
  const id = record.id + '-' + suffix;
  const db = await getDb();
  await db.insert(evalResultsTable).values({
    id,
    evalId: record.id,
    testIdx,
    promptIdx,
    testCase: { vars: {} },
    prompt: { raw: 'prompt', label: 'prompt' },
    provider: { id: 'echo' },
    success: reason === ResultFailureReason.NONE,
    score: reason === ResultFailureReason.NONE ? 1 : 0,
    failureReason: reason,
  });
  return id;
}

describe('persisted retry replacement coverage', () => {
  it.each([ResultFailureReason.NONE, ResultFailureReason.ERROR])(
    'uses only non-original rows at the same eval/test/prompt pair (replacement=%s)',
    async (reason) => {
      const record = await Eval.create({}, []);
      const other = await Eval.create({}, []);
      const original = [
        await insertResult(record, 'old-a', 0, 0),
        await insertResult(record, 'old-b', 0, 0),
        await insertResult(record, 'old-prompt', 0, 1),
        await insertResult(record, 'old-test', 1, 0),
      ];
      await insertResult(other, 'other-eval', 0, 0, ResultFailureReason.NONE);
      await insertResult(record, 'other-prompt', 0, 2, ResultFailureReason.NONE);
      expect(await getReplacedErrorResultIds(record, original)).toEqual([]);

      const replacement = await insertResult(record, 'replacement', 0, 0, reason);
      const deletable = await getReplacedErrorResultIds(record, original);
      expect(deletable).toEqual(original.slice(0, 2));
      await deleteErrorResults(deletable);

      const db = await getDb();
      const remaining = await db
        .select()
        .from(evalResultsTable)
        .where(eq(evalResultsTable.evalId, record.id))
        .all();
      expect(remaining.map((row) => row.id)).toEqual(
        expect.arrayContaining([replacement, ...original.slice(2)]),
      );
      expect(remaining.find((row) => row.id === replacement)?.failureReason).toBe(reason);
    },
  );

  it('keeps every original row when result persistence failed', async () => {
    const record = await Eval.create({}, []);
    const original = await insertResult(record, 'old', 0, 0);
    await insertResult(record, 'replacement', 0, 0, ResultFailureReason.NONE);
    record.resultPersistenceFailed = true;
    expect(await getReplacedErrorResultIds(record, [original])).toEqual([]);
    const db = await getDb();
    expect(
      await db.select().from(evalResultsTable).where(eq(evalResultsTable.id, original)).all(),
    ).toHaveLength(1);
  });
});
