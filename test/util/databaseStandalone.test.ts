import { eq, sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../src/database/index';
import { evalsTable } from '../../src/database/tables';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import {
  clearStandaloneEvalCache,
  deleteEval,
  getStandaloneEvals,
  updateResult,
} from '../../src/util/database';

import type { CompletedPrompt, Prompt } from '../../src/types/index';

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

async function resetEvalTables() {
  const db = await getDb();
  await db.run('DELETE FROM eval_results');
  await db.run('DELETE FROM evals_to_datasets');
  await db.run('DELETE FROM evals_to_prompts');
  await db.run('DELETE FROM evals_to_tags');
  await db.run('DELETE FROM evals');
  clearStandaloneEvalCache();
}

async function setIsRedteam(evalId: string, value: boolean) {
  const db = await getDb();
  await db.update(evalsTable).set({ isRedteam: value }).where(eq(evalsTable.id, evalId)).run();
}

describe('getStandaloneEvals', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(resetEvalTables);

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
    expect(beforeIds).toContain(first.id);

    const second = await createEvalWithPrompts({});

    const afterIds = (await getStandaloneEvals()).map((row) => row.evalId);
    expect(afterIds).toContain(first.id);
    expect(afterIds).toContain(second.id);
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
