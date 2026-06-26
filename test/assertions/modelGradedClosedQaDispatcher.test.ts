import { describe, expect, it } from 'vitest';
import { runAssertion } from '../../src/assertions/index';

import type { ApiProvider, ProviderResponse } from '../../src/types/index';

const targetProvider = {
  id: () => 'target',
  callApi: async () => ({ output: 'unused' }),
} as ApiProvider;

function grader(response: ProviderResponse): ApiProvider {
  return {
    id: () => 'grader',
    callApi: async () => response,
  } as ApiProvider;
}

async function runInverseClosedQa(response: ProviderResponse) {
  return runAssertion({
    prompt: 'question',
    provider: targetProvider,
    assertion: { type: 'not-model-graded-closedqa', value: 'criterion' },
    test: { options: { provider: grader(response) }, vars: {} },
    providerResponse: { output: 'answer' },
  });
}

describe('not-model-graded-closedqa dispatcher integration', () => {
  it.each([
    ['Y verdict', { output: 'Y' }, false, 0],
    ['N verdict', { output: 'N' }, true, 1],
  ] as const)('inverts the production %s score boundary', async (_name, response, pass, score) => {
    const result = await runInverseClosedQa(response);

    expect(result).toMatchObject({ pass, score });
    expect(result.metadata?.graderError).toBeUndefined();
  });

  it.each([
    ['provider error', { error: 'grader unavailable' }, 'grader unavailable'],
    ['missing output', {}, 'No output'],
    ['malformed verdict', { output: 'MAYBE' }, 'Model grader produced a malformed response'],
    [
      'grader refusal ending in N',
      { output: 'I cannot grade this request N', isRefusal: true },
      'Model grader refused to provide a verdict',
    ],
    [
      'grader refusal ending in Y',
      { output: 'I cannot grade this request Y', isRefusal: true },
      'Model grader refused to provide a verdict',
    ],
  ] as const)('does not invert a %s', async (_name, response, reason) => {
    const result = await runInverseClosedQa(response);

    expect(result).toMatchObject({
      pass: false,
      score: 0,
      reason: expect.stringContaining(reason),
      metadata: { graderError: true },
    });
  });
});
