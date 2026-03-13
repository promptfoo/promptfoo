import { describe, expect, it } from 'vitest';
import { runAssertions } from '../../src/assertions/index';
import { selectMaxScore } from '../../src/matchers';

import type { Assertion, GradingResult } from '../../src/types/index';

describe('max-score assertion integration', () => {
  it('should exclude max-score from regular assertion processing', async () => {
    const test = {
      assert: [
        { type: 'contains', value: 'test' } as Assertion,
        { type: 'max-score' } as Assertion,
      ],
    };

    const result = await runAssertions({
      prompt: 'test prompt',
      providerResponse: { output: 'test output' },
      test,
    });

    // Only the contains assertion should be processed
    expect(result.componentResults).toHaveLength(1);
    expect(result.componentResults![0].assertion?.type).toBe('contains');
  });

  it('should filter out select-best and max-score from processing', async () => {
    const test = {
      assert: [
        { type: 'contains', value: 'test' } as Assertion,
        { type: 'select-best', value: 'best criteria' } as Assertion,
        { type: 'max-score' } as Assertion,
        { type: 'equals', value: 'test output' } as Assertion,
      ],
    };

    const result = await runAssertions({
      prompt: 'test prompt',
      providerResponse: { output: 'test output' },
      test,
    });

    // Only contains and equals should be processed
    expect(result.componentResults).toHaveLength(2);
    const processedTypes = result.componentResults!.map((cr) => cr.assertion?.type);
    expect(processedTypes).toEqual(['contains', 'equals']);
  });

  it('should include nested assert-set child scores when selecting the max score', async () => {
    const assertion = {
      type: 'max-score',
      value: { method: 'average' },
    } as Assertion;

    const results = await selectMaxScore(
      ['first output', 'second output'],
      [
        {
          gradingResult: {
            componentResults: [
              {
                pass: true,
                score: 1,
                reason: 'Assert-set passed',
                componentResults: [
                  {
                    pass: true,
                    score: 0.9,
                    reason: 'Nested assertion passed',
                    assertion: { type: 'equals', value: 'first' } as Assertion,
                  },
                ],
              } satisfies GradingResult,
            ],
          },
        },
        {
          gradingResult: {
            componentResults: [
              {
                pass: true,
                score: 1,
                reason: 'Assert-set passed',
                componentResults: [
                  {
                    pass: true,
                    score: 0.3,
                    reason: 'Nested assertion passed',
                    assertion: { type: 'equals', value: 'second' } as Assertion,
                  },
                ],
              } satisfies GradingResult,
            ],
          },
        },
      ],
      assertion,
    );

    expect(results[0].pass).toBe(true);
    expect(results[1].pass).toBe(false);
    expect(results[0].score).toBe(1);
    expect(results[1].score).toBe(0);
  });
});
