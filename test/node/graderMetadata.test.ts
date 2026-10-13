import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { assertions, evaluate, ResultFailureReason } from '../../src/index';
import { isGraderFailure } from '../../src/matchers/llmGrading';
import { runDbMigrations } from '../../src/migrate';
import { getErrorResultIds } from '../../src/node/retry';

import type { ApiProvider, AtomicTestCase, ProviderResponse } from '../../src/types/index';

beforeAll(() => runDbMigrations());
afterEach(() => vi.restoreAllMocks());

it.each([
  { method: 'callEmbeddingApi', response: { error: 'Embedding unavailable' } },
  { method: 'callEmbeddingApi', response: {} },
  { method: 'callEmbeddingApi', response: { embedding: [] } },
  { method: 'callSimilarityApi', response: { error: 'Similarity unavailable' } },
  { method: 'callSimilarityApi', response: {} },
])(
  'marks unavailable similarity verdicts as retryable errors: %j',
  async ({ method, response }) => {
    const grader: ApiProvider = Object.assign(
      { id: () => 'similarity-grader', callApi: async () => ({ output: 'unused' }) },
      { [method]: async () => response },
    );
    const tests: AtomicTestCase[] = (['similar', 'not-similar'] as const).flatMap((type) =>
      ['reference', ['reference', 'another reference']].map((value) => ({
        assert: [{ type, value, metric: 'quality' }],
        options: { provider: grader },
      })),
    );
    const record = await evaluate(
      { providers: ['echo'], prompts: ['answer'], tests, writeLatestResults: true },
      { cache: false, maxConcurrency: 1 },
    );
    const exported = await record.toResultsFile();
    const rows = exported.results.results;
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row).toMatchObject({
        success: false,
        score: 0,
        failureReason: ResultFailureReason.ERROR,
        namedScores: {},
        gradingResult: { metadata: { graderError: true } },
      });
      expect(row.gradingResult?.componentResults?.[0].metadata?.graderError).toBe(true);
    }
    expect(exported.results.stats).toMatchObject({ successes: 0, failures: 0, errors: 4 });
    expect(exported.prompts?.[0].metrics).toMatchObject({
      assertPassCount: 0,
      assertFailCount: 0,
      namedScores: {},
    });
    expect((await getErrorResultIds(record.id)).sort()).toEqual(rows.map((row) => row.id).sort());
  },
);

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
