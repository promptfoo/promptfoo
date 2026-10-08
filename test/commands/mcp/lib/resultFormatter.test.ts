import { describe, expect, it } from 'vitest';
import { runAssertions } from '../../../../src/assertions/index';
import { formatEvaluationResults } from '../../../../src/commands/mcp/lib/resultFormatter';
import { createEvaluateResult, createEvaluateStats } from '../../../factories/eval';

import type { Assertion, AssertionOrSet, GradingResult } from '../../../../src/types/index';

function format(assert: AssertionOrSet[], gradingResult: GradingResult) {
  return formatEvaluationResults({
    version: 3,
    timestamp: new Date(0).toISOString(),
    prompts: [],
    stats: createEvaluateStats(),
    results: [createEvaluateResult({ testCase: { assert }, gradingResult })],
  }).results[0].assertions;
}

describe('MCP assertion results', () => {
  it.each(['fixture', 'other'])(
    'labels only reached checks when the source expects %s',
    async (value) => {
      const assert: Assertion[] = [
        { type: 'equals', value, fallback: 'next', metric: 'Cheap' },
        { type: 'contains', value: 'fix' },
        { type: 'starts-with', value: 'fix', metric: 'Separate' },
      ];
      const gradingResult = await runAssertions({
        test: { assert },
        providerResponse: { output: 'fixture' },
        prompt: 'Fixture',
      });
      expect(format(assert, gradingResult)).toMatchObject({
        totalAssertions: 2,
        passedAssertions: 2,
        failedAssertions: 0,
        componentResults: [
          {
            type: value === 'fixture' ? 'equals' : 'contains',
            metric: value === 'fixture' ? 'Cheap' : undefined,
          },
          { type: 'starts-with', metric: 'Separate' },
        ],
      });
    },
  );

  it('preserves labels for legacy component results without assertion metadata', () => {
    const result = format([{ type: 'equals', value: 'fixture', metric: 'Legacy' }], {
      pass: true,
      score: 1,
      reason: 'Fixture',
      componentResults: [{ pass: true, score: 1, reason: 'Fixture' }],
    });
    expect(result?.componentResults[0]).toMatchObject({ type: 'equals', metric: 'Legacy' });
  });

  it('labels an assertion set after a collapsed fallback from its own metadata', async () => {
    const assert: AssertionOrSet[] = [
      { type: 'equals', value: 'other', fallback: 'next', metric: 'Cheap' },
      { type: 'contains', value: 'fix', metric: 'Fallback' },
      {
        type: 'assert-set',
        metric: 'Set',
        assert: [{ type: 'starts-with', value: 'fix' }],
      },
    ];
    const gradingResult = await runAssertions({
      test: { assert },
      providerResponse: { output: 'fixture' },
    });
    expect(format(assert, gradingResult)).toMatchObject({
      totalAssertions: 3,
      passedAssertions: 3,
      componentResults: [
        { type: 'contains', metric: 'Fallback' },
        { type: 'assert-set', metric: 'Set' },
        { type: 'starts-with', metric: undefined },
      ],
    });
  });
});
