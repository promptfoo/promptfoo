import { describe, expect, it } from 'vitest';
import { formatEvaluationResults } from '../../../../src/commands/mcp/lib/resultFormatter';

import type { EvaluateSummaryV3, GradingResult } from '../../../../src/types/index';

describe('batched rubric result formatting', () => {
  const children: GradingResult[] = [
    {
      pass: true,
      score: 1,
      reason: 'Correct',
      assertion: { type: 'llm-rubric', metric: 'accuracy', value: 'Answers correctly' },
    },
    {
      pass: false,
      score: 0,
      reason: 'Verbose',
      assertion: { type: 'llm-rubric', metric: 'style', value: 'Uses plain language' },
    },
  ];

  it.each([
    { threshold: undefined, nested: false, passed: 1, failed: 1 },
    { threshold: 0.5, nested: false, passed: 1, failed: 1 },
    { threshold: undefined, nested: true, passed: 1, failed: 2 },
    { threshold: 0.5, nested: true, passed: 2, failed: 1 },
  ])(
    'formats dimension counts and identities (nested=$nested, threshold=$threshold)',
    ({ threshold, nested, passed, failed }) => {
      const batch: GradingResult = {
        pass: threshold === 0.5,
        score: 0.5,
        reason: 'Batch summary',
        assertion: {
          type: 'llm-rubric',
          threshold,
          value: {
            components: [
              { metric: 'accuracy', value: 'Answers correctly' },
              { metric: 'style', value: 'Uses plain language' },
            ],
          },
        },
        componentResults: children,
        metadata: { renderedGradingPrompt: 'Shared grading prompt' },
      };
      const gradingResult: GradingResult = {
        pass: batch.pass,
        score: batch.score,
        reason: batch.reason,
        componentResults: [batch, ...children],
      };
      const assertionSet = {
        type: 'assert-set' as const,
        assert: [batch.assertion!],
        metric: 'set-quality',
      };
      const componentResults = nested
        ? [
            {
              ...gradingResult,
              metadata: { assertionSet: { type: 'assert-set', metric: 'set-quality' } },
            },
            batch,
            ...children,
          ]
        : [batch, ...children];
      const summary = {
        version: 3,
        results: [
          {
            testCase: { assert: nested ? [assertionSet] : [batch.assertion!] },
            vars: {},
            prompt: { raw: 'Prompt' },
            provider: { id: 'local' },
            response: { output: 'Candidate' },
            success: batch.pass,
            score: batch.score,
            namedScores: {},
            failureReason: batch.pass ? 0 : 1,
            gradingResult: { ...gradingResult, componentResults },
          },
        ],
      } as EvaluateSummaryV3;

      const formatted = formatEvaluationResults(summary);
      expect(formatted.results[0].assertions).toMatchObject({
        totalAssertions: passed + failed,
        passedAssertions: passed,
        failedAssertions: failed,
        componentResults: expect.arrayContaining([
          expect.objectContaining({ type: 'llm-rubric', metric: 'accuracy', pass: true }),
          expect.objectContaining({ type: 'llm-rubric', metric: 'style', pass: false }),
        ]),
      });
      expect(summary.results[0].gradingResult?.componentResults).toContain(batch);
      expect(batch.metadata?.renderedGradingPrompt).toBe('Shared grading prompt');
      expect(formatted.results[0].assertions?.componentResults[0]).toMatchObject(
        nested
          ? { type: 'assert-set', metric: 'set-quality' }
          : { type: 'llm-rubric', metric: 'accuracy' },
      );
    },
  );

  it('preserves the legacy assert-set configuration count and formatter', () => {
    const set: GradingResult = {
      pass: false,
      score: 0.5,
      reason: 'Set failed',
      componentResults: children,
    };
    const summary = {
      version: 3,
      results: [
        {
          testCase: { assert: [{ type: 'assert-set', assert: children.map((r) => r.assertion!) }] },
          vars: {},
          prompt: { raw: 'Prompt' },
          provider: { id: 'local' },
          success: false,
          score: 0.5,
          failureReason: 1,
          gradingResult: { ...set, componentResults: [set, ...children] },
        },
      ],
    } as EvaluateSummaryV3;

    expect(formatEvaluationResults(summary).results[0].assertions).toMatchObject({
      totalAssertions: 1,
      passedAssertions: 1,
      failedAssertions: 2,
      componentResults: [
        expect.objectContaining({ type: 'assert-set' }),
        expect.objectContaining({ type: 'unknown' }),
        expect.objectContaining({ type: 'unknown' }),
      ],
    });
  });

  it.each([undefined, []])('counts a grader failure with children=%j once', (componentResults) => {
    const failure: GradingResult = {
      pass: false,
      score: 0,
      reason: 'Invalid grader response',
      assertion: {
        type: 'not-llm-rubric',
        value: { components: [{ metric: 'accuracy', value: 'Answers correctly' }] },
      },
      componentResults,
      metadata: { graderError: true },
    };
    const summary = {
      version: 3,
      results: [
        {
          testCase: { assert: [failure.assertion!] },
          vars: {},
          prompt: { raw: 'Prompt' },
          provider: { id: 'local' },
          success: false,
          score: 0,
          failureReason: 1,
          gradingResult: { ...failure, componentResults: [failure] },
        },
      ],
    } as EvaluateSummaryV3;

    expect(formatEvaluationResults(summary).results[0].assertions).toMatchObject({
      totalAssertions: 1,
      passedAssertions: 0,
      failedAssertions: 1,
      componentResults: [expect.objectContaining({ reason: 'Invalid grader response' })],
    });
  });
});
