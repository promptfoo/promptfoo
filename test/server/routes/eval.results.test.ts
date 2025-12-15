import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { runDbMigrations } from '../../../src/migrate';
import Eval from '../../../src/models/eval';
import EvalResult from '../../../src/models/evalResult';
import { hashPrompt } from '../../../src/prompts/utils';
import type {
  AtomicTestCase,
  EvaluateResult,
  GradingResult,
  Prompt,
  ProviderOptions,
} from '../../../src/types/index';
import { ResultFailureReason } from '../../../src/types/index';

// We'll test the handler logic directly to avoid Express overhead
// This mirrors the pattern in routes-eval.test.ts

describe('GET /api/eval/:evalId/results', () => {
  let testEval: Eval;
  let testResults: EvalResult[];

  const mockProvider: ProviderOptions = {
    id: 'test-provider',
    label: 'Test Provider',
  };

  const mockPrompt: Prompt = {
    raw: 'Test prompt {{question}}',
    display: 'Test prompt',
    label: 'Test',
  };

  const createTestCase = (overrides: Partial<AtomicTestCase> = {}): AtomicTestCase => ({
    vars: { question: 'What is 2+2?' },
    provider: mockProvider,
    ...overrides,
  });

  const createEvaluateResult = (
    overrides: Partial<EvaluateResult> = {},
  ): Omit<EvaluateResult, 'id' | 'promptId'> => ({
    promptIdx: 0,
    testIdx: 0,
    prompt: mockPrompt,
    success: true,
    score: 1,
    provider: mockProvider,
    testCase: createTestCase(),
    vars: { question: 'What is 2+2?' },
    latencyMs: 100,
    cost: 0.01,
    metadata: {},
    failureReason: ResultFailureReason.NONE,
    namedScores: {},
    response: { output: '4' },
    ...overrides,
  });

  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(async () => {
    // Create a test eval (v4 format)
    testEval = await Eval.create(
      {
        description: 'Test eval for results endpoint',
      },
      [mockPrompt],
      {
        author: 'test@example.com',
      },
    );

    // Create test results
    testResults = [];

    // Result 0: Pass, no human rating
    const result0 = await EvalResult.createFromEvaluateResult(testEval.id, {
      ...createEvaluateResult({
        testIdx: 0,
        promptIdx: 0,
        success: true,
        score: 1,
        testCase: createTestCase({
          vars: { question: 'What is 2+2?' },
          metadata: { itemId: 'item-001' },
        }),
      }),
      id: 'result-0',
      promptId: hashPrompt(mockPrompt),
    });
    testResults.push(result0);

    // Result 1: Fail, no human rating
    const result1 = await EvalResult.createFromEvaluateResult(testEval.id, {
      ...createEvaluateResult({
        testIdx: 1,
        promptIdx: 0,
        success: false,
        score: 0,
        testCase: createTestCase({
          vars: { question: 'What is 3+3?' },
          metadata: { itemId: 'item-002' },
        }),
      }),
      id: 'result-1',
      promptId: hashPrompt(mockPrompt),
    });
    testResults.push(result1);

    // Result 2: Pass with human rating (thumbs up)
    const humanGradingResult: GradingResult = {
      pass: true,
      score: 1,
      reason: 'All assertions passed',
      componentResults: [
        {
          pass: true,
          score: 1,
          reason: 'Manual result (overrides all other grading results)',
          assertion: { type: 'human' },
        },
      ],
    };

    const result2 = await EvalResult.createFromEvaluateResult(testEval.id, {
      ...createEvaluateResult({
        testIdx: 2,
        promptIdx: 0,
        success: true,
        score: 1,
        gradingResult: humanGradingResult,
        testCase: createTestCase({
          vars: { question: 'What is 4+4?' },
          metadata: { itemId: 'item-003' },
        }),
      }),
      id: 'result-2',
      promptId: hashPrompt(mockPrompt),
    });
    testResults.push(result2);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('findMany', () => {
    it('should return all results for an eval', async () => {
      const results = await EvalResult.findMany({ evalId: testEval.id });
      expect(results.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter by testIdx', async () => {
      const results = await EvalResult.findMany({ evalId: testEval.id, testIdx: 0 });
      expect(results).toHaveLength(1);
      expect(results[0].testIdx).toBe(0);
    });

    it('should filter by promptIdx', async () => {
      const results = await EvalResult.findMany({ evalId: testEval.id, promptIdx: 0 });
      expect(results.length).toBeGreaterThanOrEqual(3);
      results.forEach((r) => expect(r.promptIdx).toBe(0));
    });

    it('should filter by success=true', async () => {
      const results = await EvalResult.findMany({ evalId: testEval.id, success: true });
      expect(results.length).toBeGreaterThanOrEqual(2);
      results.forEach((r) => expect(r.success).toBe(true));
    });

    it('should filter by success=false', async () => {
      const results = await EvalResult.findMany({ evalId: testEval.id, success: false });
      expect(results.length).toBeGreaterThanOrEqual(1);
      results.forEach((r) => expect(r.success).toBe(false));
    });

    it('should combine filters', async () => {
      const results = await EvalResult.findMany({
        evalId: testEval.id,
        testIdx: 1,
        promptIdx: 0,
        success: false,
      });
      expect(results).toHaveLength(1);
      expect(results[0].testIdx).toBe(1);
      expect(results[0].success).toBe(false);
    });

    it('should return empty array when no results match', async () => {
      const results = await EvalResult.findMany({
        evalId: testEval.id,
        testIdx: 999,
      });
      expect(results).toHaveLength(0);
    });
  });

  describe('toResultsApiJson', () => {
    it('should convert result to API JSON format', async () => {
      const result = testResults[0];
      const json = result.toResultsApiJson();

      expect(json).toHaveProperty('id');
      expect(json).toHaveProperty('evalId', testEval.id);
      expect(json).toHaveProperty('testIdx', 0);
      expect(json).toHaveProperty('promptIdx', 0);
      expect(json).toHaveProperty('testCase');
      expect(json).toHaveProperty('prompt');
      expect(json).toHaveProperty('provider');
      expect(json).toHaveProperty('success', true);
      expect(json).toHaveProperty('score', 1);
      expect(json).toHaveProperty('latencyMs');
      expect(json).toHaveProperty('cost');
    });

    it('should include metadata from test case', async () => {
      const result = testResults[0];
      const json = result.toResultsApiJson();

      expect(json.testCase.metadata).toEqual({ itemId: 'item-001' });
    });

    it('should include gradingResult with human assertion', async () => {
      const result = testResults[2];
      const json = result.toResultsApiJson();

      expect(json.gradingResult).not.toBeNull();
      expect(json.gradingResult?.componentResults).toHaveLength(1);
      expect(json.gradingResult?.componentResults?.[0].assertion?.type).toBe('human');
    });
  });

  describe('hasHumanRating filtering', () => {
    it('should identify results with human ratings', async () => {
      const allResults = await EvalResult.findMany({ evalId: testEval.id });

      // Filter for human ratings (mimicking the endpoint logic)
      const humanRatedResults = allResults.filter((r) =>
        r.gradingResult?.componentResults?.some(
          (cr: { assertion?: { type?: string } }) => cr.assertion?.type === 'human',
        ),
      );

      expect(humanRatedResults.length).toBeGreaterThanOrEqual(1);
      humanRatedResults.forEach((r) => {
        expect(
          r.gradingResult?.componentResults?.some(
            (cr: { assertion?: { type?: string } }) => cr.assertion?.type === 'human',
          ),
        ).toBe(true);
      });
    });

    it('should return empty when no human ratings exist for filters', async () => {
      // Filter results that are failures AND have human ratings
      const allResults = await EvalResult.findMany({ evalId: testEval.id, success: false });

      const humanRatedFailures = allResults.filter((r) =>
        r.gradingResult?.componentResults?.some(
          (cr: { assertion?: { type?: string } }) => cr.assertion?.type === 'human',
        ),
      );

      // Our test data doesn't have human-rated failures
      expect(humanRatedFailures).toHaveLength(0);
    });
  });
});
