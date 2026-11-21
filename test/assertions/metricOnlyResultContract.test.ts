import { describe, expect, it } from 'vitest';
import { runAssertions } from '../../src/assertions/index';
import { formatEvaluationResults } from '../../src/commands/mcp/lib/resultFormatter';
import { selectMaxScore } from '../../src/matchers/comparison';
import { AssertionSchema, countedComponentResults } from '../../src/types/index';

import type { EvaluateSummaryV3, GradingResult } from '../../src/types/index';

function checkEmittedAssertions(result: GradingResult) {
  const stored: GradingResult = JSON.parse(JSON.stringify(result));
  const pending = [stored];
  while (pending.length) {
    const current = pending.pop()!;
    if (current.assertion) {
      expect(AssertionSchema.safeParse(current.assertion).success).toBe(true);
    }
    pending.push(...(current.componentResults ?? []));
  }
  return stored;
}

describe('metric-only result contract', () => {
  it.each(['assertion', 'metadata'] as const)(
    'ranks and formats legacy non-boolean %s markers as ordinary results',
    async (marker) => {
      for (const metricOnly of ['false', 'true', '1', 1]) {
        const rows = [0, 1].map((index) => ({
          testCase: {},
          vars: {},
          gradingResult: {
            pass: false,
            score: 0.5,
            reason: 'Stored aggregate',
            componentResults: [
              {
                pass: true,
                score: index === 0 ? 0.8 : 0.6,
                reason: 'Quality',
                assertion: { type: 'javascript' },
              },
              {
                pass: index === 1,
                score: index,
                reason: 'Legacy result',
                assertion: { type: 'javascript' },
                [marker]: { type: 'javascript', metricOnly },
              },
            ],
          },
        }));
        const stored = JSON.parse(JSON.stringify(rows));
        const ranked = await selectMaxScore(['A', 'B'], stored, { type: 'max-score' });
        expect(ranked.map((result) => result.pass)).toEqual([false, true]);
        const formatted = formatEvaluationResults({
          results: stored,
        } as unknown as EvaluateSummaryV3);
        expect(formatted.results.map((row) => row.assertions?.totalAssertions)).toEqual([2, 2]);
        expect(formatted.results[0].assertions).toMatchObject({
          passedAssertions: 1,
          failedAssertions: 1,
        });
        expect(formatted.results[0].assertions!.componentResults[1].metricOnly).toBeUndefined();
        expect(stored).toEqual(rows);
      }
    },
  );

  it('excludes result metadata markers during ranking', async () => {
    const results = await selectMaxScore(
      ['A', 'B'],
      [
        {
          gradingResult: {
            componentResults: [
              { pass: true, score: 0.8, reason: 'quality', assertion: { type: 'javascript' } },
              {
                pass: false,
                score: 0,
                reason: 'counter',
                assertion: { type: 'javascript' },
                metadata: { metricOnly: true },
              },
            ],
          },
        },
        {
          gradingResult: {
            componentResults: [
              { pass: true, score: 0.6, reason: 'quality', assertion: { type: 'javascript' } },
              {
                pass: true,
                score: 1,
                reason: 'counter',
                assertion: { type: 'javascript' },
                metadata: { metricOnly: true },
              },
            ],
          },
        },
      ],
      { type: 'max-score' },
    );
    expect(results.map((result) => result.pass)).toEqual([true, false]);
  });
  it.each([undefined, false] as const)(
    'serializes metric-only set results with valid assertions when the set flag is %s',
    async (metricOnly) => {
      const test = {
        assert: [
          { type: 'contains' as const, value: 'hello' },
          {
            type: 'assert-set' as const,
            ...(metricOnly === undefined ? {} : { metricOnly }),
            threshold: 0.5,
            assert: [
              { type: 'contains' as const, value: 'missing', metric: 'counter', metricOnly: true },
            ],
          },
        ],
      };
      const result = await runAssertions({ test, providerResponse: { output: 'hello' } });
      const stored = checkEmittedAssertions(result);
      expect(stored).toMatchObject({ pass: true, score: 1, namedScores: { counter: 0 } });
      expect(stored.componentResults![1]).toMatchObject({
        pass: false,
        score: 0,
        metadata: { metricOnly: true },
      });
      expect(stored.componentResults![1].assertion).toBeUndefined();
      expect(countedComponentResults(stored.componentResults)).toHaveLength(1);
      const formatted = formatEvaluationResults({
        results: [
          { testCase: test, vars: {}, gradingResult: stored, response: { output: 'hello' } },
        ],
      } as unknown as EvaluateSummaryV3);
      expect(formatted.results[0].assertions).toMatchObject({
        totalAssertions: 1,
        passedAssertions: 1,
        failedAssertions: 0,
      });
      expect(formatted.results[0].assertions!.componentResults[1].metricOnly).toBe(true);
    },
  );

  it('preserves assertionless nested metric-only results without synthetic assertions', async () => {
    const leaf: GradingResult = {
      pass: false,
      score: 0,
      reason: 'grader failed',
      metadata: { source: 'offline' },
    };
    const result = await runAssertions({
      test: {
        assert: [
          {
            type: 'javascript',
            metricOnly: true,
            value: () => ({
              pass: false,
              score: 0,
              reason: 'nested failure',
              componentResults: [leaf],
            }),
          },
        ],
      },
      providerResponse: { output: 'hello' },
    });
    const stored = checkEmittedAssertions(result);
    const nested = stored.componentResults![0].componentResults![0];
    expect(nested.assertion).toBeUndefined();
    expect(nested.metadata).toEqual({ source: 'offline', metricOnly: true });
    expect(countedComponentResults([nested])).toHaveLength(0);
    expect(leaf.metadata).toEqual({ source: 'offline' });
  });

  it.each([undefined, false])(
    'clears injected metadata markers when the configured flag is %s',
    async (metricOnly) => {
      const leaf: GradingResult = {
        pass: false,
        score: 0,
        reason: 'failure',
        metadata: { metricOnly: true, source: 'offline' },
      };
      const result = await runAssertions({
        test: {
          assert: [
            {
              type: 'javascript',
              metricOnly,
              value: () => ({
                ...leaf,
                componentResults: [leaf],
              }),
            },
          ],
        },
        providerResponse: { output: 'hello' },
      });
      expect(result.pass).toBe(false);
      const parent = result.componentResults![0];
      const nested = parent.componentResults![0];
      for (const node of [parent, nested]) {
        expect(node.metadata).toEqual({ source: 'offline' });
        expect(countedComponentResults([node])).toHaveLength(1);
      }
      expect(leaf.metadata).toEqual({ source: 'offline', metricOnly: true });
    },
  );
});
