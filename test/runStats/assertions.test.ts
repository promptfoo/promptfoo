import { describe, expect, it } from 'vitest';
import { computeAssertionBreakdown, computeAssertionStats } from '../../src/runStats/assertions';
import type { StatableResult } from '../../src/runStats/types';
import type { EvaluateStats } from '../../src/types/index';

describe('computeAssertionBreakdown', () => {
  it('should return empty array for empty results', () => {
    const breakdown = computeAssertionBreakdown([]);
    expect(breakdown).toEqual([]);
  });

  it('should return empty array when no grading results', () => {
    const results: StatableResult[] = [
      { success: true, latencyMs: 100 },
      { success: true, latencyMs: 200 },
    ];
    const breakdown = computeAssertionBreakdown(results);
    expect(breakdown).toEqual([]);
  });

  it('should compute pass/fail counts per assertion type', () => {
    const results: StatableResult[] = [
      {
        success: true,
        latencyMs: 100,
        gradingResult: {
          componentResults: [
            { pass: true, score: 1, reason: '', assertion: { type: 'equals' } },
            { pass: false, score: 0, reason: '', assertion: { type: 'equals' } },
            { pass: true, score: 1, reason: '', assertion: { type: 'contains' } },
          ],
        },
      },
    ];
    const breakdown = computeAssertionBreakdown(results);
    expect(breakdown).toEqual([
      { type: 'equals', pass: 1, fail: 1, total: 2, passRate: 0.5 },
      { type: 'contains', pass: 1, fail: 0, total: 1, passRate: 1 },
    ]);
  });

  it('should sort by total volume descending', () => {
    const results: StatableResult[] = [
      {
        success: true,
        latencyMs: 100,
        gradingResult: {
          componentResults: [
            { pass: true, score: 1, reason: '', assertion: { type: 'equals' } },
            { pass: true, score: 1, reason: '', assertion: { type: 'contains' } },
            { pass: true, score: 1, reason: '', assertion: { type: 'contains' } },
            { pass: true, score: 1, reason: '', assertion: { type: 'regex' } },
            { pass: true, score: 1, reason: '', assertion: { type: 'regex' } },
            { pass: true, score: 1, reason: '', assertion: { type: 'regex' } },
          ],
        },
      },
    ];
    const breakdown = computeAssertionBreakdown(results);
    expect(breakdown.map((b) => b.type)).toEqual(['regex', 'contains', 'equals']);
  });

  it('should limit to maxTypes', () => {
    const results: StatableResult[] = [
      {
        success: true,
        latencyMs: 100,
        gradingResult: {
          componentResults: [
            { pass: true, score: 1, reason: '', assertion: { type: 'equals' } },
            { pass: true, score: 1, reason: '', assertion: { type: 'contains' } },
            { pass: true, score: 1, reason: '', assertion: { type: 'regex' } },
          ],
        },
      },
    ];
    const breakdown = computeAssertionBreakdown(results, 2);
    expect(breakdown).toHaveLength(2);
  });

  it('should use "unknown" for missing assertion type', () => {
    const results: StatableResult[] = [
      {
        success: true,
        latencyMs: 100,
        gradingResult: {
          componentResults: [
            { pass: true, score: 1, reason: '', assertion: {} as any },
            { pass: false, score: 0, reason: '' },
          ],
        },
      },
    ];
    const breakdown = computeAssertionBreakdown(results);
    expect(breakdown).toEqual([{ type: 'unknown', pass: 1, fail: 1, total: 2, passRate: 0.5 }]);
  });

  it('should aggregate across multiple results', () => {
    const results: StatableResult[] = [
      {
        success: true,
        latencyMs: 100,
        gradingResult: {
          componentResults: [{ pass: true, score: 1, reason: '', assertion: { type: 'equals' } }],
        },
      },
      {
        success: true,
        latencyMs: 200,
        gradingResult: {
          componentResults: [
            { pass: false, score: 0, reason: '', assertion: { type: 'equals' } },
            { pass: true, score: 1, reason: '', assertion: { type: 'equals' } },
          ],
        },
      },
    ];
    const breakdown = computeAssertionBreakdown(results);
    expect(breakdown).toEqual([{ type: 'equals', pass: 2, fail: 1, total: 3, passRate: 2 / 3 }]);
  });
});

describe('computeAssertionStats', () => {
  const createStats = (overrides?: Partial<EvaluateStats>): EvaluateStats =>
    ({
      successes: 0,
      failures: 0,
      errors: 0,
      tokenUsage: {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        numRequests: 0,
      },
      ...overrides,
    }) as EvaluateStats;

  it('should return zeros for empty results', () => {
    const stats = computeAssertionStats([], createStats());
    expect(stats).toEqual({
      total: 0,
      passed: 0,
      passRate: 0,
      modelGraded: 0,
      breakdown: [],
      tokenUsage: {
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        cachedTokens: 0,
        numRequests: 0,
        reasoningTokens: 0,
      },
    });
  });

  it('should count total and passed assertions', () => {
    const results: StatableResult[] = [
      {
        success: true,
        latencyMs: 100,
        gradingResult: {
          componentResults: [
            { pass: true, score: 1, reason: '', assertion: { type: 'equals' } },
            { pass: false, score: 0, reason: '', assertion: { type: 'equals' } },
            { pass: true, score: 1, reason: '', assertion: { type: 'contains' } },
          ],
        },
      },
    ];
    const stats = computeAssertionStats(results, createStats());
    expect(stats.total).toBe(3);
    expect(stats.passed).toBe(2);
    expect(stats.passRate).toBeCloseTo(2 / 3);
  });

  it('should count unique model-graded assertion types', () => {
    // llm-rubric and factuality are model-graded types
    const results: StatableResult[] = [
      {
        success: true,
        latencyMs: 100,
        gradingResult: {
          componentResults: [
            { pass: true, score: 1, reason: '', assertion: { type: 'llm-rubric' } },
            { pass: true, score: 1, reason: '', assertion: { type: 'llm-rubric' } }, // Same type, should not double-count
            { pass: true, score: 1, reason: '', assertion: { type: 'factuality' } },
            { pass: true, score: 1, reason: '', assertion: { type: 'equals' } }, // Not model-graded
          ],
        },
      },
    ];
    const stats = computeAssertionStats(results, createStats());
    // Should count unique model-graded types: llm-rubric, factuality = 2
    expect(stats.modelGraded).toBe(2);
  });

  it('should recognize all model-graded assertion types', () => {
    const modelGradedTypes = [
      'answer-relevance',
      'context-faithfulness',
      'context-recall',
      'context-relevance',
      'factuality',
      'llm-rubric',
      'model-graded-closedqa',
      'model-graded-factuality',
      'search-rubric',
    ];

    const results: StatableResult[] = [
      {
        success: true,
        latencyMs: 100,
        gradingResult: {
          componentResults: modelGradedTypes.map((type) => ({
            pass: true,
            score: 1,
            reason: '',
            assertion: { type },
          })),
        },
      },
    ];
    const stats = computeAssertionStats(results, createStats());
    expect(stats.modelGraded).toBe(modelGradedTypes.length);
  });

  it('should extract token usage from stats', () => {
    const evalStats = createStats({
      tokenUsage: {
        total: 1000,
        prompt: 800,
        completion: 200,
        cached: 100,
        numRequests: 5,
        assertions: {
          total: 500,
          prompt: 400,
          completion: 100,
          cached: 50,
          numRequests: 3,
          completionDetails: {
            reasoning: 25,
          },
        },
      },
    } as any);
    const stats = computeAssertionStats([], evalStats);
    expect(stats.tokenUsage).toEqual({
      totalTokens: 500,
      promptTokens: 400,
      completionTokens: 100,
      cachedTokens: 50,
      numRequests: 3,
      reasoningTokens: 25,
    });
  });

  it('should handle missing assertion token usage gracefully', () => {
    const evalStats = createStats();
    const stats = computeAssertionStats([], evalStats);
    expect(stats.tokenUsage).toEqual({
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
      numRequests: 0,
      reasoningTokens: 0,
    });
  });

  it('should handle null gradingResult', () => {
    const results: StatableResult[] = [
      { success: true, latencyMs: 100, gradingResult: null },
      { success: true, latencyMs: 200 },
    ];
    const stats = computeAssertionStats(results, createStats());
    expect(stats.total).toBe(0);
    expect(stats.passed).toBe(0);
  });
});
