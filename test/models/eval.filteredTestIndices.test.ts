import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../src/database/index';
import { runDbMigrations } from '../../src/migrate';
import EvalFactory from '../factories/evalFactory';

describe('Eval.getFilteredTestIndices', () => {
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
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns all test indices across batches with no filters', async () => {
    const eval_ = await EvalFactory.create({ numResults: 7, resultTypes: ['success'] });

    const { testIndices, filteredCount } = await eval_.getFilteredTestIndices({ batchSize: 3 });

    expect(filteredCount).toBe(7);
    expect(testIndices).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('returns only error indices when filterMode=errors', async () => {
    const eval_ = await EvalFactory.create({
      numResults: 6,
      resultTypes: ['success', 'error', 'failure'],
    });

    const { testIndices, filteredCount } = await eval_.getFilteredTestIndices({
      filterMode: 'errors',
      batchSize: 2,
    });

    expect(filteredCount).toBe(2);
    expect(testIndices).toEqual([1, 4]);
  });

  it('filters by searchQuery across batches', async () => {
    const eval_ = await EvalFactory.create({
      numResults: 5,
      resultTypes: ['success', 'failure'],
      searchableContent: 'needle',
    });

    const { testIndices, filteredCount } = await eval_.getFilteredTestIndices({
      searchQuery: 'needle',
      batchSize: 1,
    });

    expect(filteredCount).toBe(2);
    expect(testIndices).toEqual([1, 3]);
  });
});
