import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { assertions, evaluate, ResultFailureReason } from '../../src/index';
import { isGraderFailure } from '../../src/matchers/llmGrading';
import { runDbMigrations } from '../../src/migrate';

import type { AtomicTestCase, ProviderResponse } from '../../src/types/index';

beforeAll(() => runDbMigrations());
afterEach(() => vi.restoreAllMocks());

it.each<{
  name: string;
  response: ProviderResponse;
  pass: boolean;
  graderError: boolean;
}>([
  {
    name: 'provider error',
    response: { error: 'Grader unavailable' },
    pass: false,
    graderError: true,
  },
  { name: 'no output', response: {}, pass: false, graderError: true },
  { name: 'malformed verdict', response: { output: 'Uncertain' }, pass: false, graderError: true },
  {
    name: 'valid negative',
    response: { output: 'Criterion not met. N' },
    pass: false,
    graderError: false,
  },
  {
    name: 'valid positive',
    response: { output: 'Criterion met. Y' },
    pass: true,
    graderError: false,
  },
])(
  'preserves $name metadata through public APIs and JSON export',
  async ({ response, pass, graderError }) => {
    const test: AtomicTestCase = {
      assert: [{ type: 'model-graded-closedqa', value: 'Reference answer' }],
      options: { provider: { id: () => 'metadata-grader', callApi: async () => response } },
    };
    const grade = await assertions.runAssertions({
      test,
      providerResponse: { output: 'ok' },
      prompt: 'ok',
    });
    expect(grade.pass).toBe(pass);
    expect(isGraderFailure(grade)).toBe(graderError);
    expect(grade.componentResults?.[0].metadata?.graderError).toBe(graderError || undefined);

    const record = await evaluate(
      { providers: ['echo'], prompts: ['ok'], tests: [test], writeLatestResults: false },
      { cache: false, maxConcurrency: 1 },
    );
    const exported = JSON.parse(JSON.stringify(await record.toResultsFile()));
    const row = exported.results.results[0];
    expect(row).toMatchObject({
      success: pass,
      score: Number(pass),
      failureReason: pass
        ? ResultFailureReason.NONE
        : graderError
          ? ResultFailureReason.ERROR
          : ResultFailureReason.ASSERT,
    });
    expect(row.gradingResult.metadata?.graderError).toBe(graderError || undefined);
    expect(row.gradingResult.reason).toBe(grade.reason);
    expect(exported.results.stats).toMatchObject({
      successes: Number(pass),
      failures: Number(!pass && !graderError),
      errors: Number(graderError),
    });
  },
);
