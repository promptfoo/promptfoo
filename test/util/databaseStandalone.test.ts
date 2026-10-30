import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrizzleLogWriter, getDb } from '../../src/database/index';
import { updateSignalFile } from '../../src/database/signal';
import { evalsTable } from '../../src/database/tables';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { generateIdFromPrompt } from '../../src/models/prompt';
import {
  type CompletedPrompt,
  type EvaluateSummaryV2,
  type Prompt,
  ResultFailureReason,
} from '../../src/types/index';
import {
  clearStandaloneEvalCache,
  deleteEval,
  getDatasetFromHash,
  getPrompts,
  getPromptsForTestCasesHash,
  getStandaloneEvals,
  getTestCases,
  updateResult,
  writeResultsToDatabase,
} from '../../src/util/database';
import {
  getCachedStandaloneEvals,
  getStandaloneEvalCacheKey,
} from '../../src/util/standaloneEvalCache';
import { createEmptyTokenUsage } from '../../src/util/tokenUsageUtils';
import { clearEvalTables } from '../util/evalDb';

vi.mock('../../src/database/signal', async () => {
  const actual = await vi.importActual('../../src/database/signal');
  return {
    ...actual,
    updateSignalFile: vi.fn(),
  };
});

const completedPrompt: CompletedPrompt = {
  raw: 'hello',
  label: 'hello',
  provider: 'test-provider',
  metrics: {
    score: 1,
    testPassCount: 1,
    testFailCount: 0,
    testErrorCount: 0,
    assertPassCount: 1,
    assertFailCount: 0,
    totalLatencyMs: 0,
    tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0 },
    namedScores: {},
    namedScoresCount: {},
    cost: 0,
  },
};

const renderedPrompts: Prompt[] = [{ raw: 'hello', label: 'hello' }];

// Mirrors the CASE expression in drizzle/0024_repair_eval_redteam_flags.sql.
const isRedteamCase = sql`CASE
  WHEN json_valid(${evalsTable.config}) AND json_type(${evalsTable.config}, '$.redteam') IS NOT NULL THEN 1
  ELSE 0
END`;

async function createEvalWithPrompts(config: Partial<Parameters<typeof Eval.create>[0]>) {
  return Eval.create(config as Parameters<typeof Eval.create>[0], renderedPrompts, {
    completedPrompts: [completedPrompt],
  });
}

const resetEvalTables = () => clearEvalTables(() => clearStandaloneEvalCache());

async function setIsRedteam(evalId: string, value: boolean) {
  const db = await getDb();
  await db.update(evalsTable).set({ isRedteam: value }).where(eq(evalsTable.id, evalId)).run();
}

function expectStandaloneHistoryCached(options?: Parameters<typeof getStandaloneEvalCacheKey>[0]) {
  expect(getCachedStandaloneEvals(getStandaloneEvalCacheKey(options))).toBeDefined();
}

describe('getStandaloneEvals', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(resetEvalTables);

  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });

  it('limits evaluations before expanding prompts, without multiplying rows by tags', async () => {
    const prompts = [completedPrompt, { ...completedPrompt, raw: 'goodbye', label: 'goodbye' }];
    const older = await Eval.create({}, renderedPrompts, {
      createdAt: new Date('2026-01-01'),
      completedPrompts: [completedPrompt],
    });
    const newer = await Eval.create({ tags: { team: 'red', owner: 'alice' } }, prompts, {
      createdAt: new Date('2026-01-02'),
      completedPrompts: prompts,
    });

    const rows = await getStandaloneEvals({ limit: 2 });
    expect(rows.map((row) => row.evalId)).toEqual([newer.id, newer.id, older.id]);
    expect(rows.slice(0, 2).map((row) => row.promptId)).toEqual(prompts.map(generateIdFromPrompt));
    expect(new Set(rows.map((row) => row.uuid)).size).toBe(3);
    expect((await getStandaloneEvals({ limit: 1 })).map((row) => row.raw)).toEqual([
      'hello',
      'goodbye',
    ]);
  });

  it('applies tag and description filters before the evaluation limit', async () => {
    const matching = await createEvalWithPrompts({
      description: 'matching',
      tags: { team: 'red', owner: 'alice' },
    });
    await createEvalWithPrompts({ description: 'other', tags: { team: 'red' } });
    await createEvalWithPrompts({ description: 'matching', tags: { team: 'blue' } });

    const rows = await getStandaloneEvals({
      limit: 1,
      description: 'matching',
      tag: { key: 'team', value: 'red' },
    });
    expect(rows.map((row) => row.evalId)).toEqual([matching.id]);
    expect(await getStandaloneEvals({ tag: { key: 'team', value: 'missing' } })).toEqual([]);
  });

  it('counts completed plugin results by column, including sparse and repeated result cells', async () => {
    const prompts = [completedPrompt, { ...completedPrompt, provider: 'other-provider' }];
    const eval_ = await Eval.create({}, renderedPrompts, { completedPrompts: prompts });
    const addResult = (testIdx: number, promptIdx: number, success: boolean) =>
      eval_.addResult({
        promptIdx,
        testIdx,
        testCase: { metadata: { pluginId: 'plugin-a' } },
        promptId: generateIdFromPrompt(completedPrompt),
        provider: { id: prompts[promptIdx].provider },
        prompt: renderedPrompts[0],
        vars: {},
        response: { output: 'result' },
        error: success ? null : 'failed',
        failureReason: success ? ResultFailureReason.NONE : ResultFailureReason.ERROR,
        success,
        score: success ? 1 : 0,
        latencyMs: 1,
        gradingResult: null,
        namedScores: {},
        cost: 0,
        metadata: {},
      });
    await addResult(0, 0, false);
    await addResult(0, 1, true);
    await addResult(0, 0, true);
    await addResult(1, 1, false);

    const rows = await getStandaloneEvals();
    expect(rows).toHaveLength(2);
    expect(rows[0].pluginPassCount).toEqual({ 'plugin-a': 1 });
    expect(rows[0].pluginFailCount).toEqual({ 'plugin-a': 0 });
    expect(rows[1].pluginPassCount).toEqual({ 'plugin-a': 1 });
    expect(rows[1].pluginFailCount).toEqual({ 'plugin-a': 1 });
  });

  it('preserves legacy table prompts, authored IDs, and plugin counts', async () => {
    const legacyPrompt = { ...completedPrompt, raw: 'legacy', label: '', id: 'authored-id' };
    const legacyResults: EvaluateSummaryV2 = {
      version: 2,
      timestamp: '2026-01-01T00:00:00.000Z',
      results: [],
      stats: { successes: 1, failures: 1, errors: 0, tokenUsage: createEmptyTokenUsage() },
      table: {
        head: { prompts: [legacyPrompt], vars: [] },
        body: [true, false].map((pass, testIdx) => ({
          testIdx,
          vars: [],
          test: { metadata: { pluginId: 'legacy-plugin' } },
          outputs: [
            {
              id: `legacy-${testIdx}`,
              pass,
              cost: 0,
              latencyMs: 1,
              score: Number(pass),
              text: 'legacy output',
              prompt: legacyPrompt.raw,
              testCase: {},
              namedScores: {},
              failureReason: pass ? ResultFailureReason.NONE : ResultFailureReason.ASSERT,
            },
          ],
        })),
      },
    };
    await writeResultsToDatabase(legacyResults, { env: { PROMPTFOO_STRIP_METADATA: 'true' } });

    const [row] = await getStandaloneEvals();
    expect(row.raw).toBe('legacy');
    expect(row.promptId).toBe(generateIdFromPrompt(legacyPrompt));
    expect(row.pluginPassCount).toEqual({ 'legacy-plugin': 1 });
    expect(row.pluginFailCount).toEqual({ 'legacy-plugin': 1 });
  });

  it('uses persisted prompt identities without hashing generated IDs again', async () => {
    const prompt = { raw: 'unlabeled', label: '' };
    const id = generateIdFromPrompt(prompt);
    await Eval.create({}, [prompt], {
      completedPrompts: [{ ...prompt, id, provider: 'test-provider' }],
    });

    expect((await getStandaloneEvals())[0].promptId).toBe(id);
  });

  it.each([true, false])(
    'honors per-eval metadata stripping when configured as %s',
    async (strip) => {
      vi.stubEnv('PROMPTFOO_STRIP_METADATA', String(!strip));
      const eval_ = await createEvalWithPrompts({
        env: { PROMPTFOO_STRIP_METADATA: String(strip) },
      });
      await eval_.addResult({
        promptIdx: 0,
        testIdx: 0,
        testCase: { metadata: { pluginId: 'constructor' } },
        promptId: generateIdFromPrompt(completedPrompt),
        provider: { id: 'test-provider' },
        prompt: renderedPrompts[0],
        vars: {},
        response: { output: 'result' },
        error: null,
        failureReason: ResultFailureReason.NONE,
        success: true,
        score: 1,
        latencyMs: 1,
        gradingResult: null,
        namedScores: {},
        cost: 0,
        metadata: {},
      });

      const [row] = await getStandaloneEvals();
      expect(Object.entries(row.pluginPassCount)).toEqual(strip ? [] : [['constructor', 1]]);
      expect(Object.entries(row.pluginFailCount)).toEqual(strip ? [] : [['constructor', 0]]);
    },
  );

  it('keeps history query count bounded as the number of evaluations grows', async () => {
    await createEvalWithPrompts({});
    const queries = vi.spyOn(DrizzleLogWriter.prototype, 'write');
    try {
      await getStandaloneEvals();
      const singleEvalQueries = queries.mock.calls.length;
      for (let index = 0; index < 5; index++) {
        await createEvalWithPrompts({});
      }
      queries.mockClear();
      const rows = await getStandaloneEvals();
      expect(rows).toHaveLength(6);
      expect(queries.mock.calls.length).toBe(singleEvalQueries);
      expect(queries.mock.calls.length).toBeLessThanOrEqual(3);
    } finally {
      queries.mockRestore();
    }
  });

  it.each([false, true])('keeps dataset identities when output stripping is %s', async (strip) => {
    vi.stubEnv('PROMPTFOO_STRIP_TEST_VARS', String(strip));
    const tests = [{ vars: { doc: 'https://cdn.example/doc?X-Amz-Signature=short-secret' } }];
    const created = await createEvalWithPrompts({ tests });
    const persisted = await Eval.findById(created.id);
    const datasetId = persisted!.datasetId!;

    expect(datasetId).toBeTruthy();
    const datasets = await getTestCases();
    expect(datasets).toHaveLength(1);
    expect(datasets[0].id).toBe(datasetId);
    expect(JSON.stringify(datasets[0].testCases)).not.toContain('short-secret');
    expect((await getDatasetFromHash(datasetId))?.id).toBe(datasetId);
    expect((await getPrompts())[0].evals[0].datasetId).toBe(datasetId);
    expect(await getPromptsForTestCasesHash(datasetId)).toHaveLength(1);
    expect(persisted!.config.tests).toEqual(tests);
  });

  it('returns isRedteam from the materialized column, not raw JSON inspection', async () => {
    const redteamEval = await createEvalWithPrompts({ redteam: {} as any });
    const regularEval = await createEvalWithPrompts({});

    // Flip the column away from what the JSON config would imply; the query must trust the column.
    await setIsRedteam(redteamEval.id, false);
    await setIsRedteam(regularEval.id, true);

    const rows = await getStandaloneEvals();
    const byId = new Map(rows.map((row) => [row.evalId, row.isRedteam] as const));

    expect(byId.get(redteamEval.id)).toBe(false);
    expect(byId.get(regularEval.id)).toBe(true);
  });

  it('reflects flag transitions after updateResult rewrites config without stale cached history', async () => {
    const eval_ = await createEvalWithPrompts({});
    expect((await getStandaloneEvals()).find((row) => row.evalId === eval_.id)?.isRedteam).toBe(
      false,
    );

    await updateResult(eval_.id, { redteam: {} as any });

    expect((await getStandaloneEvals()).find((row) => row.evalId === eval_.id)?.isRedteam).toBe(
      true,
    );
  });

  it('drops deleted evals from cached history immediately', async () => {
    const keep = await createEvalWithPrompts({});
    const drop = await createEvalWithPrompts({});

    const beforeIds = (await getStandaloneEvals()).map((row) => row.evalId);
    expect(beforeIds).toEqual(expect.arrayContaining([keep.id, drop.id]));

    await deleteEval(drop.id);

    const afterIds = (await getStandaloneEvals()).map((row) => row.evalId);
    expect(afterIds).toContain(keep.id);
    expect(afterIds).not.toContain(drop.id);
  });

  it('includes newly created evals after history has been cached', async () => {
    const first = await createEvalWithPrompts({});
    const beforeIds = (await getStandaloneEvals()).map((row) => row.evalId);
    const limitedBeforeIds = (await getStandaloneEvals({ limit: 5 })).map((row) => row.evalId);
    expect(beforeIds).toContain(first.id);
    expect(limitedBeforeIds).toContain(first.id);
    expectStandaloneHistoryCached();
    expectStandaloneHistoryCached({ limit: 5 });

    const second = await createEvalWithPrompts({});

    const afterIds = (await getStandaloneEvals()).map((row) => row.evalId);
    const limitedAfterIds = (await getStandaloneEvals({ limit: 5 })).map((row) => row.evalId);
    expect(afterIds).toContain(first.id);
    expect(afterIds).toContain(second.id);
    expect(limitedAfterIds).toContain(first.id);
    expect(limitedAfterIds).toContain(second.id);
  });

  it('includes copied evals after history has been cached', async () => {
    const source = await createEvalWithPrompts({});
    const beforeIds = (await getStandaloneEvals()).map((row) => row.evalId);
    expect(beforeIds).toContain(source.id);
    expectStandaloneHistoryCached();

    const persistedSource = await Eval.findById(source.id);
    expect(persistedSource).toBeDefined();
    const copy = await persistedSource!.copy('copy of source');

    const afterIds = (await getStandaloneEvals()).map((row) => row.evalId);
    expect(afterIds).toContain(source.id);
    expect(afterIds).toContain(copy.id);
    expect(updateSignalFile).toHaveBeenCalledWith(copy.id);
  });

  it('includes direct eval saves after history has been cached', async () => {
    const eval_ = await createEvalWithPrompts({});
    const beforeRow = (await getStandaloneEvals()).find((row) => row.evalId === eval_.id);
    expect(beforeRow?.description).toBeNull();
    expectStandaloneHistoryCached();

    const persistedEval = await Eval.findById(eval_.id);
    expect(persistedEval).toBeDefined();
    persistedEval!.config.description = 'updated description';
    await persistedEval!.save();

    const afterRow = (await getStandaloneEvals()).find((row) => row.evalId === eval_.id);
    expect(afterRow?.description).toBe('updated description');
    expect(updateSignalFile).toHaveBeenCalledWith(eval_.id);
  });

  it('includes prompt changes after history has been cached', async () => {
    const eval_ = await createEvalWithPrompts({});
    const beforeRow = (await getStandaloneEvals()).find((row) => row.evalId === eval_.id);
    expect(beforeRow?.raw).toBe('hello');
    expectStandaloneHistoryCached();

    await eval_.addPrompts([
      {
        ...completedPrompt,
        raw: 'goodbye',
        label: 'goodbye',
      },
    ]);

    const afterRow = (await getStandaloneEvals()).find((row) => row.evalId === eval_.id);
    expect(afterRow?.raw).toBe('goodbye');
  });

  it('includes result changes after history has been cached', async () => {
    const eval_ = await createEvalWithPrompts({});
    const beforeRow = (await getStandaloneEvals()).find((row) => row.evalId === eval_.id);
    expect(beforeRow?.pluginFailCount['plugin-a']).toBeUndefined();
    expectStandaloneHistoryCached();

    await eval_.setResults([
      new EvalResult({
        id: 'set-results-history-row',
        evalId: eval_.id,
        promptIdx: 0,
        testIdx: 0,
        testCase: { vars: {}, metadata: { pluginId: 'plugin-a' } },
        prompt: renderedPrompts[0],
        provider: { id: 'test-provider' },
        response: { output: 'bad' },
        gradingResult: null,
        namedScores: {},
        metadata: {},
        success: false,
        score: 0,
        latencyMs: 1,
        cost: 0,
        failureReason: ResultFailureReason.ASSERT,
      }),
    ]);

    const afterRow = (await getStandaloneEvals()).find((row) => row.evalId === eval_.id);
    expect(afterRow?.pluginFailCount['plugin-a']).toBe(1);
  });

  it('includes incrementally added results after history has been cached', async () => {
    const eval_ = await createEvalWithPrompts({});
    const beforeRow = (await getStandaloneEvals()).find((row) => row.evalId === eval_.id);
    expect(beforeRow?.pluginFailCount['plugin-add']).toBeUndefined();
    expectStandaloneHistoryCached();

    await eval_.addResult({
      promptIdx: 0,
      testIdx: 0,
      testCase: { vars: {}, metadata: { pluginId: 'plugin-add' } },
      promptId: 'prompt-add',
      provider: { id: 'test-provider' },
      prompt: renderedPrompts[0],
      vars: {},
      response: { output: 'bad' },
      error: null,
      failureReason: ResultFailureReason.ASSERT,
      success: false,
      score: 0,
      latencyMs: 1,
      gradingResult: null,
      namedScores: {},
      cost: 0,
      metadata: {},
    });

    const afterRow = (await getStandaloneEvals()).find((row) => row.evalId === eval_.id);
    expect(afterRow?.pluginFailCount['plugin-add']).toBe(1);
  });

  it('classifies redteam: null as redteam, matching the runtime predicate', async () => {
    const eval_ = await createEvalWithPrompts({ redteam: null as any });

    const db = await getDb();
    const stored = await db
      .select({ isRedteam: evalsTable.isRedteam })
      .from(evalsTable)
      .where(eq(evalsTable.id, eval_.id))
      .get();
    expect(stored?.isRedteam).toBe(true);

    const row = (await getStandaloneEvals()).find((r) => r.evalId === eval_.id);
    expect(row?.isRedteam).toBe(true);
  });
});

describe('getTestCases', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(resetEvalTables);

  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });

  it('returns sanitized test cases without loading eval results', async () => {
    const tests = [
      {
        description: 'says hello',
        vars: { name: 'Ada' },
        metadata: { topic: 'greeting' },
      },
    ];
    const created = await createEvalWithPrompts({
      tests,
      env: { PROMPTFOO_STRIP_METADATA: 'true' },
    });
    const persisted = await Eval.findById(created.id);
    expect(persisted?.config.tests).toEqual(tests);

    const toResultsFile = vi.spyOn(Eval.prototype, 'toResultsFile');
    const findResults = vi.spyOn(EvalResult, 'findManyByEvalId');
    try {
      const datasets = await getTestCases();

      expect(datasets).toHaveLength(1);
      expect(datasets[0].testCases).toEqual([
        {
          description: 'says hello',
          vars: { name: 'Ada' },
        },
      ]);
      expect(toResultsFile).not.toHaveBeenCalled();
      expect(findResults).not.toHaveBeenCalled();
    } finally {
      toResultsFile.mockRestore();
      findResults.mockRestore();
    }
  });
});

describe('migration 0024 repair semantics', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(resetEvalTables);

  it('classifies {redteam: null} as redteam via json_type (not json_extract)', async () => {
    const db = await getDb();
    const evalNullRedteam = await Eval.create({ redteam: null as any }, []);
    const evalNoRedteam = await Eval.create({}, []);
    const evalWithRedteam = await Eval.create({ redteam: {} as any }, []);

    const classify = (id: string) =>
      db
        .select({
          fromMigration: sql<number>`${isRedteamCase}`,
          fromLegacyExtract: sql<number>`CASE
            WHEN json_valid(${evalsTable.config}) AND json_extract(${evalsTable.config}, '$.redteam') IS NOT NULL THEN 1
            ELSE 0
          END`,
        })
        .from(evalsTable)
        .where(eq(evalsTable.id, id))
        .get();

    const nullRow = await classify(evalNullRedteam.id);
    const missingRow = await classify(evalNoRedteam.id);
    const presentRow = await classify(evalWithRedteam.id);

    expect(nullRow?.fromMigration).toBe(1);
    expect(missingRow?.fromMigration).toBe(0);
    expect(presentRow?.fromMigration).toBe(1);

    // Legacy json_extract collapses {redteam: null} to non-redteam — the divergence this migration repairs.
    expect(nullRow?.fromLegacyExtract).toBe(0);
    expect(missingRow?.fromLegacyExtract).toBe(0);
    expect(presentRow?.fromLegacyExtract).toBe(1);
  });

  it('idempotently repairs only stale rows', async () => {
    const db = await getDb();
    const evalWithRedteam = await Eval.create({ redteam: {} as any }, []);
    const evalRegular = await Eval.create({}, []);

    await setIsRedteam(evalWithRedteam.id, false);
    await setIsRedteam(evalRegular.id, true);

    const repairSql = sql`UPDATE evals SET is_redteam = ${isRedteamCase} WHERE is_redteam != ${isRedteamCase}`;

    expect((await db.run(repairSql)).rowsAffected).toBe(2);
    expect((await db.run(repairSql)).rowsAffected).toBe(0);

    const rows = await db
      .select({ id: evalsTable.id, isRedteam: evalsTable.isRedteam })
      .from(evalsTable)
      .all();
    const byId = new Map(rows.map((row) => [row.id, row.isRedteam] as const));
    expect(byId.get(evalWithRedteam.id)).toBe(true);
    expect(byId.get(evalRegular.id)).toBe(false);
  });
});
