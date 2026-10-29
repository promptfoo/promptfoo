import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { runAssertion } from '../../src/assertions';
import cliState from '../../src/cliState';

const fixtureDir = fileURLToPath(new URL('../fixtures/file-script-assertions/', import.meta.url));
const trace = {
  traceId: 'a'.repeat(32),
  evaluationId: 'eval',
  testCaseId: 'case',
  spans: [
    { name: 'invoke_agent', spanId: 'wrapper', startTime: 0, endTime: 60 },
    {
      name: 'execute_tool lookup',
      spanId: 'tool',
      parentSpanId: 'wrapper',
      startTime: 1,
      endTime: 51,
      statusCode: 2,
      attributes: { 'promptfoo.openai.hosted_trace': 'wrapper' },
    },
  ],
};

describe.each([
  { type: 'not-trace-span-count', within: { max: 1 }, outside: { min: 2 } },
  { type: 'not-trace-span-duration', within: { max: 50 }, outside: { max: 49 } },
  { type: 'not-trace-error-spans', within: { max_count: 1 }, outside: { max_count: 0 } },
] as const)('$type', ({ type, within, outside }) => {
  const grade = (bounds: object, status: 'imported' | 'unavailable' = 'imported') =>
    cliState.withBasePath(fixtureDir, () =>
      runAssertion({
        // The script returns the filter as an object. Both preflight and grading must use it.
        assertion: { type, value: 'file://rubric-generator.cjs:getPattern' },
        test: { vars: { pattern: { pattern: 'execute_tool *', ...bounds } } },
        traceId: trace.traceId,
        traceData: trace,
        providerResponse: {
          output: 'done',
          metadata: {
            hostedTrace: {
              source: 'openai:agents-api',
              status,
              parentSpanId: 'wrapper',
              spanCount: 1,
              errorStatusComplete: true,
            },
          },
        },
      }),
    );

  it('inverts both passing and failing bounds returned by a filter script', async () => {
    await expect(grade(within)).resolves.toMatchObject({ pass: false, score: 0 });
    await expect(grade(outside)).resolves.toMatchObject({ pass: true, score: 1 });
    await expect(grade({ ...within, pattern: 'unobserved' })).resolves.toMatchObject({
      pass: false,
      score: 0,
    });
  });

  it('fails when the requested hosted evidence is unavailable', async () => {
    await expect(grade(outside, 'unavailable')).resolves.toMatchObject({
      pass: false,
      score: 0,
      reason: expect.stringContaining('unavailable'),
    });
  });
});
