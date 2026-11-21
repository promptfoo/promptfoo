import { describe, expect, it, vi } from 'vitest';
import { assertionUsesTrace, runAssertion } from '../../src/assertions/index';
import { handleTrajectoryToolSet } from '../../src/assertions/trajectoryToolSet';
import * as utils from '../../src/assertions/utils';
import { assertionFromString } from '../../src/csv';
import { AssertionSchema } from '../../src/types/index';

import type { AssertionParams } from '../../src/types/index';
import type { TraceSpan } from '../../src/types/tracing';

function check(value: unknown, spans?: TraceSpan[], inverse = false) {
  return handleTrajectoryToolSet({
    assertion: { type: inverse ? 'not-trajectory:tool-set' : 'trajectory:tool-set', value },
    renderedValue: value,
    inverse,
    assertionValueContext: { trace: spans ? { traceId: 'fixture-trace', spans } : undefined },
  } as AssertionParams);
}
const span = (name: string, attributes?: Record<string, unknown>): TraceSpan => ({
  spanId: name,
  name,
  startTime: 1,
  endTime: 2,
  attributes,
});

describe('trajectory:tool-set', () => {
  const spans = [
    span('first', { 'gen_ai.tool.name': ' lookup ' }),
    span('second', { 'tool.name': 'summarize' }),
    span('third', { 'tool.name': 'lookup' }),
    span('llm.completion'),
  ];
  it('compares exact names independent of order and repeated calls', () => {
    expect(check(['summarize', ' lookup ', 'lookup'], spans)).toMatchObject({
      pass: true,
      score: 1,
    });
    expect(check(['summarize', 'lookup'], spans, true)).toMatchObject({ pass: false, score: 0 });
    expect(assertionUsesTrace({ type: 'trajectory:tool-set', value: [] })).toBe(true);
  });
  it('reports missing and unexpected tools, including command tools', () => {
    const result = check(
      ['lookup', 'missing'],
      [
        ...spans,
        span('command', { 'tool.name': 'exec_command', command: 'ordinary fixture text' }),
      ],
    );
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('Missing: ["missing"]');
    expect(result.reason).toContain('Unexpected: ["summarize","exec_command"]');
    expect(result.reason).not.toContain('ordinary fixture text');
    expect(check(['lookup'], spans, true).pass).toBe(true);
  });
  it('accepts an empty set only when no attributed tools are present', () => {
    expect(check([], [span('llm.completion')]).pass).toBe(true);
    expect(check([], spans).pass).toBe(false);
    expect(() => check([], undefined, true)).toThrow('No trace data');
  });
  it.each([null, 'lookup', {}, [''], [' '], [1], { tools: ['lookup'], mode: 'subset' }])(
    'rejects invalid configuration %j',
    (value) => {
      expect(AssertionSchema.safeParse({ type: 'trajectory:tool-set', value }).success).toBe(false);
      expect(() => check(value, spans)).toThrow('array of tool names');
    },
  );
  it('treats wildcard characters as literal name characters', () => {
    expect(check(['look*'], spans).pass).toBe(false);
  });

  it.each([
    'trajectory:tool-set:["{{ tool }}"]',
    'trajectory:tool-set:file://expected.json',
    'not-trajectory:tool-set:[]',
  ])('grades the CSV cell %s', async (cell) => {
    using _file = vi.spyOn(utils, 'processFileReference').mockReturnValue(['{{ tool }}']);
    const result = await runAssertion({
      assertion: AssertionSchema.parse(assertionFromString(cell)),
      test: { vars: { tool: 'lookup' } },
      providerResponse: { output: 'ok' },
      traceId: 'fixture',
      traceData: {
        traceId: 'fixture',
        evaluationId: 'eval',
        testCaseId: 'test',
        spans: [spans[0]],
      },
    });
    expect(result.pass).toBe(true);
  });
});
