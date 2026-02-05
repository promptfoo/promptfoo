import { describe, expect, it } from 'vitest';
import { selectMaxScore } from '../../src/matchers';
import { ResultFailureReason } from '../../src/types/index';

import type { Assertion, EvaluateResult } from '../../src/types/index';

describe('selectMaxScore', () => {
  const createMockResult = (score: number, testIdx: number): EvaluateResult => ({
    promptIdx: 0,
    testIdx,
    testCase: {
      assert: [
        { type: 'contains', value: 'apple' },
        { type: 'contains', value: 'orange' },
        { type: 'max-score' },
      ],
    },
    prompt: { raw: 'test prompt', label: 'test' },
    promptId: 'prompt-test',
    provider: { id: 'test-provider' },
    vars: {},
    response: { output: `Output ${testIdx}` },
    error: null,
    failureReason: ResultFailureReason.NONE,
    success: true,
    score,
    latencyMs: 100,
    gradingResult: {
      pass: score > 0.5,
      score,
      reason: 'Test result',
      namedScores: {},
      tokensUsed: { total: 0, prompt: 0, completion: 0, cached: 0 },
      componentResults: [
        {
          pass: true,
          score: 1,
          reason: 'Contains apple',
          assertion: { type: 'contains', value: 'apple' } as Assertion,
        },
        {
          pass: score === 1,
          score: score === 1 ? 1 : 0,
          reason: score === 1 ? 'Contains orange' : 'Does not contain orange',
          assertion: { type: 'contains', value: 'orange' } as Assertion,
        },
      ],
    },
    namedScores: {},
    cost: 0,
    metadata: {},
  });

  const mockAssertion: Assertion = {
    type: 'max-score',
  };

  it('should select the output with the highest score', async () => {
    const outputs = ['Output 0', 'Output 1', 'Output 2'];
    const results = [createMockResult(0.5, 0), createMockResult(1.0, 1), createMockResult(0.75, 2)];

    const gradingResults = await selectMaxScore(outputs, results, mockAssertion);

    expect(gradingResults).toHaveLength(3);
    expect(gradingResults[0].pass).toBe(false);
    expect(gradingResults[0].score).toBe(0);
    expect(gradingResults[0].reason).toContain('Not selected');

    expect(gradingResults[1].pass).toBe(true);
    expect(gradingResults[1].score).toBe(1);
    expect(gradingResults[1].reason).toContain('Selected as highest scoring output');

    expect(gradingResults[2].pass).toBe(false);
    expect(gradingResults[2].score).toBe(0);
    expect(gradingResults[2].reason).toContain('Not selected');
  });

  it('should handle ties by selecting the first output', async () => {
    const outputs = ['Output 0', 'Output 1', 'Output 2'];
    const results = [createMockResult(1.0, 0), createMockResult(1.0, 1), createMockResult(0.5, 2)];

    const gradingResults = await selectMaxScore(outputs, results, mockAssertion);

    expect(gradingResults[0].pass).toBe(true);
    expect(gradingResults[0].reason).toContain('Selected as highest scoring output');

    expect(gradingResults[1].pass).toBe(false);
    expect(gradingResults[1].reason).toContain('Not selected (score: 1.000, max: 1.000)');

    expect(gradingResults[2].pass).toBe(false);
  });

  it('should apply threshold when specified', async () => {
    const outputs = ['Output 0', 'Output 1'];
    const results = [createMockResult(0.6, 0), createMockResult(0.4, 1)];

    const assertionWithThreshold: Assertion = {
      type: 'max-score',
      value: {
        threshold: 0.7,
      },
    };

    const gradingResults = await selectMaxScore(outputs, results, assertionWithThreshold);

    expect(gradingResults[0].pass).toBe(false);
    expect(gradingResults[0].reason).toContain('below threshold');

    expect(gradingResults[1].pass).toBe(false);
  });

  it('should throw error with fewer than 2 outputs', async () => {
    const outputs = ['Output 0'];
    const results = [createMockResult(1.0, 0)];

    await expect(selectMaxScore(outputs, results, mockAssertion)).rejects.toThrow(
      'max-score assertion must have at least two outputs to compare between',
    );
  });

  it('should throw error when no other assertions exist', async () => {
    const outputs = ['Output 0', 'Output 1'];
    const results = [
      {
        ...createMockResult(1.0, 0),
        testCase: {
          assert: [{ type: 'max-score' }],
        },
        gradingResult: {
          ...createMockResult(1.0, 0).gradingResult,
          componentResults: [], // Empty component results
        },
      },
      {
        ...createMockResult(0.5, 1),
        testCase: {
          assert: [{ type: 'max-score' }],
        },
        gradingResult: {
          ...createMockResult(0.5, 1).gradingResult,
          componentResults: [], // Empty component results
        },
      },
    ];

    await expect(selectMaxScore(outputs, results, mockAssertion)).rejects.toThrow(
      'max-score requires at least one other assertion (besides max-score or select-best) to aggregate scores from',
    );
  });

  it('should exclude select-best assertions from validation', async () => {
    const outputs = ['Output 0', 'Output 1'];
    const results = [
      {
        ...createMockResult(1.0, 0),
        testCase: {
          assert: [
            { type: 'contains', value: 'test' },
            { type: 'select-best' },
            { type: 'max-score' },
          ],
        },
      },
      {
        ...createMockResult(0.5, 1),
        testCase: {
          assert: [
            { type: 'contains', value: 'test' },
            { type: 'select-best' },
            { type: 'max-score' },
          ],
        },
      },
    ];

    const gradingResults = await selectMaxScore(outputs, results, mockAssertion);

    expect(gradingResults).toHaveLength(2);
    expect(gradingResults[0].pass).toBe(true);
    expect(gradingResults[1].pass).toBe(false);
  });

  it('should handle results with zero scores', async () => {
    const outputs = ['Output 0', 'Output 1', 'Output 2'];
    // Create results with different component scores
    const results = [
      {
        ...createMockResult(0, 0),
        gradingResult: {
          ...createMockResult(0, 0).gradingResult,
          componentResults: [
            {
              pass: false,
              score: 0,
              reason: 'Does not contain apple',
              assertion: { type: 'contains', value: 'apple' } as Assertion,
            },
            {
              pass: false,
              score: 0,
              reason: 'Does not contain orange',
              assertion: { type: 'contains', value: 'orange' } as Assertion,
            },
          ],
        },
      },
      {
        ...createMockResult(0, 1),
        gradingResult: {
          ...createMockResult(0, 1).gradingResult,
          componentResults: [
            {
              pass: false,
              score: 0,
              reason: 'Does not contain apple',
              assertion: { type: 'contains', value: 'apple' } as Assertion,
            },
            {
              pass: false,
              score: 0,
              reason: 'Does not contain orange',
              assertion: { type: 'contains', value: 'orange' } as Assertion,
            },
          ],
        },
      },
      {
        ...createMockResult(0.1, 2),
        gradingResult: {
          ...createMockResult(0.1, 2).gradingResult,
          componentResults: [
            {
              pass: true,
              score: 0.1,
              reason: 'Partially contains apple',
              assertion: { type: 'contains', value: 'apple' } as Assertion,
            },
            {
              pass: false,
              score: 0,
              reason: 'Does not contain orange',
              assertion: { type: 'contains', value: 'orange' } as Assertion,
            },
          ],
        },
      },
    ];

    const gradingResults = await selectMaxScore(outputs, results, mockAssertion);

    expect(gradingResults[0].pass).toBe(false);
    expect(gradingResults[1].pass).toBe(false);
    expect(gradingResults[2].pass).toBe(true);
    expect(gradingResults[2].reason).toContain('Selected as highest scoring output (score: 0.050)');
  });

  it('should include score in namedScores', async () => {
    const outputs = ['Output 0', 'Output 1'];
    const results = [createMockResult(0.8, 0), createMockResult(0.6, 1)];

    const gradingResults = await selectMaxScore(outputs, results, mockAssertion);

    // Both results have the same componentResults scores (1 for apple, 0 for orange)
    // So both have average score of 0.5
    expect(gradingResults[0].namedScores?.maxScore).toBe(0.5);
    expect(gradingResults[1].namedScores?.maxScore).toBe(0.5);
    // The first one should be selected due to tie-breaking
    expect(gradingResults[0].pass).toBe(true);
    expect(gradingResults[1].pass).toBe(false);
  });

  describe('Threshold Edge Cases - Truthy vs Undefined', () => {
    it('should handle threshold=0 differently from threshold=undefined', async () => {
      const outputs = ['Output 0', 'Output 1'];
      const results = [
        createMockResult(0, 0), // Max score will be 0 (average of 1 and 0)
        createMockResult(0.5, 1), // Lower score
      ];

      // Test with threshold=undefined (no threshold)
      const assertionWithoutThreshold: Assertion = {
        type: 'max-score',
        value: {},
      };

      const resultsWithoutThreshold = await selectMaxScore(
        outputs,
        results,
        assertionWithoutThreshold,
      );

      // With no threshold, should select the winner (index 0 with score 0.5)
      expect(resultsWithoutThreshold[0].pass).toBe(true);
      expect(resultsWithoutThreshold[1].pass).toBe(false);

      // Test with threshold=0
      const assertionWithZeroThreshold: Assertion = {
        type: 'max-score',
        value: {
          threshold: 0,
        },
      };

      const resultsWithZeroThreshold = await selectMaxScore(
        outputs,
        results,
        assertionWithZeroThreshold,
      );

      // With threshold=0, max score is 0.5 which is >= 0, so should still pass
      expect(resultsWithZeroThreshold[0].pass).toBe(true);
      expect(resultsWithZeroThreshold[1].pass).toBe(false);
    });

    it('should fail all outputs when max score is below threshold=0', async () => {
      const outputs = ['Output 0', 'Output 1'];

      // Create results where all scores are negative (so max will be negative)
      const results = [
        {
          ...createMockResult(-0.5, 0),
          gradingResult: {
            ...createMockResult(-0.5, 0).gradingResult,
            componentResults: [
              {
                pass: false,
                score: -1, // Negative score
                reason: 'Negative test result',
                assertion: { type: 'contains', value: 'apple' } as Assertion,
              },
              {
                pass: false,
                score: 0,
                reason: 'Zero test result',
                assertion: { type: 'contains', value: 'orange' } as Assertion,
              },
            ],
          },
        },
        {
          ...createMockResult(-1, 1),
          gradingResult: {
            ...createMockResult(-1, 1).gradingResult,
            componentResults: [
              {
                pass: false,
                score: -2, // Even more negative
                reason: 'Very negative test result',
                assertion: { type: 'contains', value: 'apple' } as Assertion,
              },
              {
                pass: false,
                score: 0,
                reason: 'Zero test result',
                assertion: { type: 'contains', value: 'orange' } as Assertion,
              },
            ],
          },
        },
      ];

      const assertionWithZeroThreshold: Assertion = {
        type: 'max-score',
        value: {
          threshold: 0,
        },
      };

      const gradingResults = await selectMaxScore(outputs, results, assertionWithZeroThreshold);

      // Max score will be -0.5, which is < 0, so all should fail
      expect(gradingResults[0].pass).toBe(false);
      expect(gradingResults[1].pass).toBe(false);
      // The winner (index 0) should get the threshold message since it has max score but doesn't meet threshold
      expect(gradingResults[0].reason).toContain('below threshold');
      // The loser (index 1) gets the regular "not selected" message
      expect(gradingResults[1].reason).toContain('Not selected');
    });

    it('should pass winner when max score equals threshold=0', async () => {
      const outputs = ['Output 0', 'Output 1'];

      // Create results where max score will be exactly 0
      const results = [
        {
          ...createMockResult(0, 0),
          gradingResult: {
            ...createMockResult(0, 0).gradingResult,
            componentResults: [
              {
                pass: false,
                score: 0,
                reason: 'Zero score',
                assertion: { type: 'contains', value: 'apple' } as Assertion,
              },
              {
                pass: false,
                score: 0,
                reason: 'Zero score',
                assertion: { type: 'contains', value: 'orange' } as Assertion,
              },
            ],
          },
        },
        {
          ...createMockResult(-1, 1),
          gradingResult: {
            ...createMockResult(-1, 1).gradingResult,
            componentResults: [
              {
                pass: false,
                score: -2,
                reason: 'Negative score',
                assertion: { type: 'contains', value: 'apple' } as Assertion,
              },
              {
                pass: false,
                score: 2, // This balances to average of 0
                reason: 'Positive score',
                assertion: { type: 'contains', value: 'orange' } as Assertion,
              },
            ],
          },
        },
      ];

      const assertionWithZeroThreshold: Assertion = {
        type: 'max-score',
        value: {
          threshold: 0,
        },
      };

      const gradingResults = await selectMaxScore(outputs, results, assertionWithZeroThreshold);

      // Max score will be 0, which equals threshold 0, so winner should pass
      expect(gradingResults[0].pass).toBe(true); // Winner
      expect(gradingResults[1].pass).toBe(false); // Loser
    });
  });
});
