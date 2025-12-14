import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../src/database/index';
import { updateSignalFile } from '../../src/database/signal';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';

import type { CompletedPrompt } from '../../src/types/index';

// Mock the signal module
vi.mock('../../src/database/signal', () => ({
  updateSignalFile: vi.fn(),
}));

describe('Eval.addPrompts', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Clear all tables before each test
    const db = getDb();
    await db.run('DELETE FROM eval_results');
    await db.run('DELETE FROM evals_to_datasets');
    await db.run('DELETE FROM evals_to_prompts');
    await db.run('DELETE FROM evals_to_tags');
    await db.run('DELETE FROM evals');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should call updateSignalFile when eval is persisted', async () => {
    // Create a persisted eval
    const eval_ = await Eval.create(
      { description: 'Test eval for addPrompts' },
      [{ raw: 'Test prompt', label: 'Test' }],
    );

    const mockPrompts: CompletedPrompt[] = [
      {
        raw: 'New prompt text',
        label: 'New Prompt',
        provider: 'openai:gpt-4',
        metrics: {
          score: 0,
          testPassCount: 0,
          testFailCount: 0,
          testErrorCount: 0,
          assertPassCount: 0,
          assertFailCount: 0,
          totalLatencyMs: 0,
          tokenUsage: { total: 0, prompt: 0, completion: 0 },
          namedScores: {},
          namedScoresCount: {},
          cost: 0,
        },
      },
    ];

    // Call addPrompts
    await eval_.addPrompts(mockPrompts);

    // Verify updateSignalFile was called with the eval ID
    expect(updateSignalFile).toHaveBeenCalledWith(eval_.id);
    expect(updateSignalFile).toHaveBeenCalledTimes(1);
  });

  it('should NOT call updateSignalFile when eval is not persisted', async () => {
    // Create a non-persisted eval (in-memory only)
    const eval_ = new Eval({ description: 'Non-persisted eval' }, { persisted: false });

    const mockPrompts: CompletedPrompt[] = [
      {
        raw: 'New prompt text',
        label: 'New Prompt',
        provider: 'openai:gpt-4',
        metrics: {
          score: 0,
          testPassCount: 0,
          testFailCount: 0,
          testErrorCount: 0,
          assertPassCount: 0,
          assertFailCount: 0,
          totalLatencyMs: 0,
          tokenUsage: { total: 0, prompt: 0, completion: 0 },
          namedScores: {},
          namedScoresCount: {},
          cost: 0,
        },
      },
    ];

    // Call addPrompts
    await eval_.addPrompts(mockPrompts);

    // Verify updateSignalFile was NOT called
    expect(updateSignalFile).not.toHaveBeenCalled();
  });

  it('should update prompts in memory', async () => {
    const eval_ = new Eval({ description: 'Test eval' }, { persisted: false });

    const mockPrompts: CompletedPrompt[] = [
      {
        raw: 'Prompt 1',
        label: 'First',
        provider: 'test-provider',
      },
      {
        raw: 'Prompt 2',
        label: 'Second',
        provider: 'test-provider',
      },
    ];

    await eval_.addPrompts(mockPrompts);

    expect(eval_.prompts).toEqual(mockPrompts);
    expect(eval_.prompts).toHaveLength(2);
  });

  it('should persist prompts to database when eval is persisted', async () => {
    const eval_ = await Eval.create(
      { description: 'Persistence test' },
      [{ raw: 'Initial', label: 'Initial' }],
    );

    const mockPrompts: CompletedPrompt[] = [
      {
        raw: 'Updated prompt',
        label: 'Updated',
        provider: 'openai:gpt-4',
        metrics: {
          score: 1,
          testPassCount: 5,
          testFailCount: 0,
          testErrorCount: 0,
          assertPassCount: 10,
          assertFailCount: 0,
          totalLatencyMs: 1000,
          tokenUsage: { total: 100, prompt: 50, completion: 50 },
          namedScores: {},
          namedScoresCount: {},
          cost: 0.01,
        },
      },
    ];

    await eval_.addPrompts(mockPrompts);

    // Reload eval from database
    const reloadedEval = await Eval.findById(eval_.id);

    expect(reloadedEval).toBeDefined();
    expect(reloadedEval!.prompts).toHaveLength(1);
    expect(reloadedEval!.prompts[0].raw).toBe('Updated prompt');
    expect(reloadedEval!.prompts[0].label).toBe('Updated');
    expect(reloadedEval!.prompts[0].metrics?.testPassCount).toBe(5);
  });
});
