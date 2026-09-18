import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import { deleteAllEvals, getPrompts, getTestCases } from '../../src/util/database';
import EvalFactory from '../factories/evalFactory';

describe('database prompt and dataset listings', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(async () => {
    await deleteAllEvals();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses eval configuration without materializing full result files', async () => {
    await EvalFactory.create();
    const toResultsFile = vi.spyOn(Eval.prototype, 'toResultsFile');

    const prompts = await getPrompts();
    const datasets = await getTestCases();

    expect(prompts.length).toBeGreaterThan(0);
    expect(datasets.length).toBeGreaterThan(0);
    expect(toResultsFile).not.toHaveBeenCalled();
  });
});
