/**
 * Tests for 'canceled' eval status (W1).
 *
 * Verifies that:
 * - setEvalStatus accepts 'canceled'
 * - save() persists 'canceled' to the results JSON column
 * - findById reads 'canceled' correctly from stored data
 * - getEvalSummaries includes evals with 'canceled' status
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../src/database/index';
import { runDbMigrations } from '../../src/migrate';
import Eval, { getEvalSummaries } from '../../src/models/eval';
import EvalFactory from '../factories/evalFactory';

describe('Eval canceled status', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(async () => {
    const db = getDb();
    await db.run('DELETE FROM eval_results');
    await db.run('DELETE FROM evals_to_datasets');
    await db.run('DELETE FROM evals_to_prompts');
    await db.run('DELETE FROM evals_to_tags');
    await db.run('DELETE FROM evals');
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('setEvalStatus accepts canceled', async () => {
    const eval_ = await EvalFactory.create();
    eval_.setEvalStatus('canceled');
    expect(eval_.evalStatus).toBe('canceled');
  });

  it('save() persists canceled to results JSON', async () => {
    const eval_ = await EvalFactory.create();
    eval_.setEvalStatus('canceled');
    await eval_.save();

    // Read the raw DB row to verify the results column
    const db = getDb();
    const row = db
      .all<{ results: string }>(
        // biome-ignore lint/style/noUnusedTemplateLiteral: raw SQL template
        `SELECT results FROM evals WHERE id = '${eval_.id}'`,
      )
      .at(0);

    expect(row).toBeDefined();
    const results = typeof row!.results === 'string' ? JSON.parse(row!.results) : row!.results;
    expect(results.status).toBe('canceled');
  });

  it('findById reads canceled from results JSON (round-trip)', async () => {
    const eval_ = await EvalFactory.create();
    eval_.setEvalStatus('canceled');
    eval_.setExpectedTestCount(50);
    await eval_.save();

    const reloaded = await Eval.findById(eval_.id);
    expect(reloaded).toBeDefined();
    expect(reloaded!.evalStatus).toBe('canceled');
    expect(reloaded!.expectedTestCount).toBe(50);
  });

  it('findById reads running and complete status correctly', async () => {
    const evalRunning = await EvalFactory.create();
    evalRunning.setEvalStatus('running');
    await evalRunning.save();

    const evalComplete = await EvalFactory.create();
    evalComplete.setEvalStatus('complete');
    await evalComplete.save();

    const reloadedRunning = await Eval.findById(evalRunning.id);
    expect(reloadedRunning!.evalStatus).toBe('running');

    const reloadedComplete = await Eval.findById(evalComplete.id);
    expect(reloadedComplete!.evalStatus).toBe('complete');
  });

  it('findById returns undefined evalStatus for unknown values', async () => {
    const eval_ = await EvalFactory.create();
    // Manually write an invalid status to the DB
    const db = getDb();
    db.run(`UPDATE evals SET results = '{"status": "bogus"}' WHERE id = '${eval_.id}'`);

    const reloaded = await Eval.findById(eval_.id);
    expect(reloaded).toBeDefined();
    expect(reloaded!.evalStatus).toBeUndefined();
  });

  it('getEvalSummaries includes canceled evals with correct evalStatus', async () => {
    const eval_ = await EvalFactory.create();
    eval_.setEvalStatus('canceled');
    eval_.setExpectedTestCount(100);
    await eval_.save();

    const summaries = await getEvalSummaries();
    const summary = summaries.find((s) => s.evalId === eval_.id);
    expect(summary).toBeDefined();
    expect(summary!.evalStatus).toBe('canceled');
    expect(summary!.expectedTestCount).toBe(100);
  });

  it('getStats includes canceled status', async () => {
    const eval_ = await EvalFactory.create();
    eval_.setEvalStatus('canceled');
    eval_.setExpectedTestCount(50);

    const stats = eval_.getStats();
    expect(stats.status).toBe('canceled');
    expect(stats.expectedTestCount).toBe(50);
  });
});
