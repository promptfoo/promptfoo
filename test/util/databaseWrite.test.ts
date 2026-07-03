import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../src/database/index';
import { updateSignalFile } from '../../src/database/signal';
import { datasetsTable, evalsTable, promptsTable, tagsTable } from '../../src/database/tables';
import { runDbMigrations } from '../../src/migrate';
import {
  clearStandaloneEvalCache,
  getStandaloneEvals,
  writeResultsToDatabase,
} from '../../src/util/database';
import {
  getCachedStandaloneEvals,
  getStandaloneEvalCacheKey,
} from '../../src/util/standaloneEvalCache';
import { createEvaluateSummaryV2 } from '../factories/eval';

vi.mock('../../src/database/signal', async () => {
  const actual = await vi.importActual('../../src/database/signal');
  return {
    ...actual,
    updateSignalFile: vi.fn(),
  };
});

function expectWrittenHistoryCached() {
  expect(getCachedStandaloneEvals(getStandaloneEvalCacheKey())).toBeDefined();
}

describe('writeResultsToDatabase', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  beforeEach(async () => {
    const db = await getDb();
    await db.run('DROP TRIGGER IF EXISTS fail_evals_to_tags_insert');
    await db.run('DELETE FROM evals_to_datasets');
    await db.run('DELETE FROM evals_to_prompts');
    await db.run('DELETE FROM evals_to_tags');
    await db.run('DELETE FROM evals');
    await db.run('DELETE FROM datasets');
    await db.run('DELETE FROM prompts');
    await db.run('DELETE FROM tags');
    clearStandaloneEvalCache();
  });

  it('rolls back related rows when a dependent insert fails', async () => {
    const db = await getDb();
    await db.run(`
      CREATE TRIGGER fail_evals_to_tags_insert
      BEFORE INSERT ON evals_to_tags
      BEGIN
        SELECT RAISE(ABORT, 'forced tag failure');
      END;
    `);

    await expect(
      writeResultsToDatabase(
        createEvaluateSummaryV2(),
        {
          tags: { suite: 'regression' },
          tests: [],
        },
        new Date('2024-01-01T00:00:00.000Z'),
      ),
    ).rejects.toThrow();

    await expect(db.select().from(evalsTable).all()).resolves.toHaveLength(0);
    await expect(db.select().from(promptsTable).all()).resolves.toHaveLength(0);
    await expect(db.select().from(datasetsTable).all()).resolves.toHaveLength(0);
    await expect(db.select().from(tagsTable).all()).resolves.toHaveLength(0);
  });

  it('keeps cached history when a later write rolls back', async () => {
    const firstEvalId = await writeResultsToDatabase(createEvaluateSummaryV2(), {}, new Date());
    const beforeIds = (await getStandaloneEvals()).map((row) => row.evalId);
    expect(beforeIds).toContain(firstEvalId);
    expectWrittenHistoryCached();
    const secondDate = new Date(Date.now() + 1000);

    const db = await getDb();
    await db.run(`
      CREATE TRIGGER fail_evals_to_tags_insert
      BEFORE INSERT ON evals_to_tags
      BEGIN
        SELECT RAISE(ABORT, 'forced tag failure');
      END;
    `);

    await expect(
      writeResultsToDatabase(
        createEvaluateSummaryV2(),
        {
          tags: { suite: 'regression' },
          tests: [],
        },
        secondDate,
      ),
    ).rejects.toThrow();

    const cachedIds = getCachedStandaloneEvals(getStandaloneEvalCacheKey())?.map(
      (row) => row.evalId,
    );
    expect(cachedIds).toContain(firstEvalId);
  });

  it('includes newly persisted evals after history has been cached', async () => {
    const firstDate = new Date();
    const firstEvalId = await writeResultsToDatabase(createEvaluateSummaryV2(), {}, firstDate);
    const beforeIds = (await getStandaloneEvals()).map((row) => row.evalId);
    expect(beforeIds).toContain(firstEvalId);
    expectWrittenHistoryCached();

    const secondEvalId = await writeResultsToDatabase(
      createEvaluateSummaryV2(),
      {},
      new Date(firstDate.getTime() + 1000),
    );

    const afterIds = (await getStandaloneEvals()).map((row) => row.evalId);
    expect(afterIds).toContain(firstEvalId);
    expect(afterIds).toContain(secondEvalId);
    expect(updateSignalFile).toHaveBeenCalledWith(secondEvalId);
  });
});
