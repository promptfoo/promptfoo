import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../src/database/index';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import { ResultFailureReason } from '../../src/types/index';
import { recalculatePromptMetrics } from '../../src/util/recalculatePromptMetrics';
import EvalFactory from '../factories/evalFactory';

describe('recalculatePromptMetrics', () => {
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

  it('handles empty results', async () => {
    const eval_ = await EvalFactory.create({ numResults: 0 });

    await recalculatePromptMetrics(eval_);

    const updatedEval = await Eval.findById(eval_.id);
    const metrics = updatedEval?.prompts[0].metrics;

    expect(metrics).toMatchObject({
      score: 0,
      testPassCount: 0,
      testFailCount: 0,
      testErrorCount: 0,
      assertPassCount: 0,
      assertFailCount: 0,
      totalLatencyMs: 0,
      cost: 0,
    });
    expect(metrics?.namedScores).toEqual({});
    expect(metrics?.namedScoresCount).toEqual({});
    expect(metrics?.tokenUsage.total).toBe(0);
    expect(metrics?.tokenUsage.assertions?.total).toBe(0);
  });

  it('counts pass/fail/error results and assertion outcomes', async () => {
    const eval_ = await EvalFactory.create({ numResults: 0 });

    await eval_.addResult({
      promptIdx: 0,
      testIdx: 0,
      testCase: { vars: {} },
      promptId: 'prompt-1',
      provider: { id: 'test-provider', label: 'test' },
      prompt: { raw: 'Prompt', label: 'Prompt' },
      vars: {},
      response: { output: 'pass' },
      error: null,
      failureReason: ResultFailureReason.NONE,
      success: true,
      score: 1,
      latencyMs: 110,
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'pass',
        componentResults: [
          {
            pass: true,
            score: 1,
            reason: 'pass',
            assertion: { type: 'equals', value: 'pass' },
          },
        ],
      },
      namedScores: {},
      cost: 0.001,
      metadata: {},
    });

    await eval_.addResult({
      promptIdx: 0,
      testIdx: 1,
      testCase: { vars: {} },
      promptId: 'prompt-1',
      provider: { id: 'test-provider', label: 'test' },
      prompt: { raw: 'Prompt', label: 'Prompt' },
      vars: {},
      response: { output: 'fail' },
      error: null,
      failureReason: ResultFailureReason.ASSERT,
      success: false,
      score: 0,
      latencyMs: 90,
      gradingResult: {
        pass: false,
        score: 0,
        reason: 'fail',
        componentResults: [
          {
            pass: false,
            score: 0,
            reason: 'fail',
            assertion: { type: 'contains', value: 'pass' },
          },
        ],
      },
      namedScores: {},
      cost: 0.001,
      metadata: {},
    });

    await eval_.addResult({
      promptIdx: 0,
      testIdx: 2,
      testCase: { vars: {} },
      promptId: 'prompt-1',
      provider: { id: 'test-provider', label: 'test' },
      prompt: { raw: 'Prompt', label: 'Prompt' },
      vars: {},
      response: { output: 'error' },
      error: 'Provider error',
      failureReason: ResultFailureReason.ERROR,
      success: false,
      score: 0,
      latencyMs: 70,
      namedScores: {},
      cost: 0.001,
      metadata: {},
    });

    await recalculatePromptMetrics(eval_);

    const updatedEval = await Eval.findById(eval_.id);
    const metrics = updatedEval?.prompts[0].metrics;

    expect(metrics?.testPassCount).toBe(1);
    expect(metrics?.testFailCount).toBe(1);
    expect(metrics?.testErrorCount).toBe(1);
    expect(metrics?.assertPassCount).toBe(1);
    expect(metrics?.assertFailCount).toBe(1);
    expect(metrics?.score).toBe(1);
    expect(metrics?.totalLatencyMs).toBe(270);
  });

  it('tracks named scores with template variables', async () => {
    const eval_ = await EvalFactory.create({ numResults: 0 });

    await eval_.addResult({
      promptIdx: 0,
      testIdx: 0,
      testCase: { vars: { metricName: 'alpha' } },
      promptId: 'prompt-1',
      provider: { id: 'test-provider', label: 'test' },
      prompt: { raw: 'Prompt', label: 'Prompt' },
      vars: { metricName: 'alpha' },
      response: { output: 'ok' },
      error: null,
      failureReason: ResultFailureReason.NONE,
      success: true,
      score: 1,
      latencyMs: 50,
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'ok',
        componentResults: [
          {
            pass: true,
            score: 1,
            reason: 'ok',
            assertion: {
              type: 'equals',
              value: 'ok',
              metric: 'score-{{metricName}}',
            },
          },
          {
            pass: true,
            score: 1,
            reason: 'ok',
            assertion: {
              type: 'contains',
              value: 'ok',
              metric: 'score-{{metricName}}',
            },
          },
        ],
      },
      namedScores: { 'score-alpha': 0.7 },
      cost: 0.001,
      metadata: {},
    });

    await recalculatePromptMetrics(eval_);

    const updatedEval = await Eval.findById(eval_.id);
    const metrics = updatedEval?.prompts[0].metrics;

    expect(metrics?.namedScores['score-alpha']).toBeCloseTo(0.7, 5);
    expect(metrics?.namedScoresCount['score-alpha']).toBe(2);
  });

  it('accumulates response and assertion token usage', async () => {
    const eval_ = await EvalFactory.create({ numResults: 0 });

    await eval_.addResult({
      promptIdx: 0,
      testIdx: 0,
      testCase: { vars: {} },
      promptId: 'prompt-1',
      provider: { id: 'test-provider', label: 'test' },
      prompt: { raw: 'Prompt', label: 'Prompt' },
      vars: {},
      response: {
        output: 'ok',
        tokenUsage: { total: 10, prompt: 4, completion: 6, cached: 1 },
      },
      error: null,
      failureReason: ResultFailureReason.NONE,
      success: true,
      score: 1,
      latencyMs: 30,
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'ok',
        tokensUsed: { total: 3, prompt: 1, completion: 2, cached: 0 },
        componentResults: [
          {
            pass: true,
            score: 1,
            reason: 'ok',
            assertion: { type: 'equals', value: 'ok' },
          },
        ],
      },
      namedScores: {},
      cost: 0.001,
      metadata: {},
    });

    await recalculatePromptMetrics(eval_);

    const updatedEval = await Eval.findById(eval_.id);
    const metrics = updatedEval?.prompts[0].metrics;

    expect(metrics?.tokenUsage.total).toBe(10);
    expect(metrics?.tokenUsage.prompt).toBe(4);
    expect(metrics?.tokenUsage.completion).toBe(6);
    expect(metrics?.tokenUsage.cached).toBe(1);
    expect(metrics?.tokenUsage.numRequests).toBe(1);
    expect(metrics?.tokenUsage.assertions?.total).toBe(3);
    expect(metrics?.tokenUsage.assertions?.prompt).toBe(1);
    expect(metrics?.tokenUsage.assertions?.completion).toBe(2);
    expect(metrics?.tokenUsage.assertions?.numRequests).toBe(0);
  });
});
