import { describe, expect, it, vi } from 'vitest';
import { matchesSelectBest } from '../../src/matchers/comparison';
import { createMockProvider } from '../factories/provider';

import type { ApiProvider, GradingConfig } from '../../src/types/index';

function createSelectBestProvider(output: string): ApiProvider {
  return createMockProvider({
    id: 'select-best-test-provider',
    response: {
      output,
      tokenUsage: { total: 7, prompt: 3, completion: 4 },
    },
  });
}

describe('matchesSelectBest', () => {
  it('should parse multi-digit verdict indexes', async () => {
    const provider = createSelectBestProvider('10');
    const outputs = Array.from({ length: 12 }, (_value, index) => `Output ${index}`);
    const grading: GradingConfig = { provider };

    const result = await matchesSelectBest('choose the best output', outputs, grading);

    expect(result[10]).toMatchObject({
      pass: true,
      score: 1,
      reason: 'Output selected as the best: choose the best output',
    });
    expect(result.filter((item) => item.pass)).toHaveLength(1);
  });

  it('should return independent failure results for invalid verdicts', async () => {
    const provider = createSelectBestProvider('no verdict');
    const grading: GradingConfig = { provider };

    const result = await matchesSelectBest('choose the best output', ['A', 'B'], grading);

    expect(result).toHaveLength(2);
    expect(result[0]).not.toBe(result[1]);
    expect(result[0]).toMatchObject({
      pass: false,
      reason: 'Invalid select-best verdict: NaN',
      tokensUsed: {
        total: 7,
        prompt: 3,
        completion: 4,
      },
    });
  });

  it('preserves cache provenance and logical token usage for cached comparison responses', async () => {
    const provider = createMockProvider({
      id: 'cached-select-best-provider',
      response: {
        output: '0',
        cached: true,
        tokenUsage: { total: 30, prompt: 18, completion: 12, numRequests: 1 },
      },
    });

    const result = await matchesSelectBest('choose the best output', ['A', 'B'], { provider });

    for (const gradingResult of result) {
      expect(gradingResult).toMatchObject({
        metadata: { cachedResponse: true },
        tokensUsed: { total: 30, prompt: 18, completion: 12, cached: 30, numRequests: 1 },
      });
    }
  });

  it('preserves cache provenance when a cached comparison response is malformed', async () => {
    const provider = createMockProvider({
      id: 'cached-invalid-select-best-provider',
      response: {
        output: 'not a verdict',
        cached: true,
        tokenUsage: { total: 30, prompt: 18, completion: 12, numRequests: 1 },
      },
    });

    const result = await matchesSelectBest('choose the best output', ['A', 'B'], { provider });

    for (const gradingResult of result) {
      expect(gradingResult).toMatchObject({
        pass: false,
        metadata: { cachedResponse: true },
        tokensUsed: { total: 30, cached: 30 },
      });
    }
  });

  // The prompt asks for a single integer, but graders explain the choice first, and the
  // first integer in that explanation is reasoning, not the verdict (#12242).
  it.each([
    {
      label: 'reasoning that names other texts before the verdict',
      output: 'Text 0 is too long and text 1 is vague, so the best fit is 2.',
      expected: 2,
    },
    {
      label: 'verdict after a colon at the end of the reply',
      output: 'Text 1 repeats the question; text 2 answers it. Best: 2',
      expected: 2,
    },
    {
      label: 'a count mentioned mid-sentence before the verdict',
      output: 'Comparing all 3 texts, I choose 1.',
      expected: 1,
    },
    {
      label: 'a labelled verdict at the end of the reply',
      output: 'Text 1 repeats the question; text 2 answers it. Best: 2',
      expected: 2,
    },
    {
      label: 'an Answer label with no space',
      output: 'Comparing all 3 texts, I choose Answer:1',
      expected: 1,
    },
  ])(
    'selects the verdict, not the first integer, when the reply explains first ($label)',
    async ({ output, expected }) => {
      const provider = createSelectBestProvider(output);
      const outputs = ['A', 'B', 'C'];

      const result = await matchesSelectBest('choose the best output', outputs, { provider });

      expect(result[expected]).toMatchObject({ pass: true, score: 1 });
      expect(result.filter((item) => item.pass)).toHaveLength(1);
    },
  );

  it('fails loudly instead of guessing when the reply keeps enumerating after the verdict', async () => {
    // "Best: 2 (0 and 1 were weaker)" names the winner but does not end in an integer, so no
    // verdict is read: an ambiguous reply must not silently select the wrong output.
    const provider = createSelectBestProvider('Best: 2 (0 and 1 were weaker)');

    const result = await matchesSelectBest('choose the best output', ['A', 'B', 'C'], { provider });

    expect(result[0]).toMatchObject({ pass: false, reason: 'Invalid select-best verdict: NaN' });
    expect(result.filter((item) => item.pass)).toHaveLength(0);
  });

  it.each([
    { label: 'valid verdict', response: { output: '0' } },
    { label: 'invalid verdict', response: { output: 'not a verdict' } },
    { label: 'provider error', response: { error: 'comparison provider failed', output: '' } },
  ])('preserves mixed cached and incurred comparison usage for a $label', async ({ response }) => {
    const provider = createMockProvider({
      id: 'mixed-cache-select-best-provider',
      response: {
        ...response,
        tokenUsage: {
          total: 100,
          prompt: 70,
          completion: 30,
          cached: 70,
          numRequests: 2,
          completionDetails: { reasoning: 9 },
          incurredTokenUsage: {
            total: 30,
            prompt: 20,
            completion: 10,
            numRequests: 1,
            completionDetails: { reasoning: 4 },
          },
        },
      },
    });

    const result = await matchesSelectBest('choose the best output', ['A', 'B'], { provider });

    for (const gradingResult of result) {
      expect(gradingResult.tokensUsed).toMatchObject({
        total: 100,
        prompt: 70,
        completion: 30,
        cached: 70,
        numRequests: 2,
        completionDetails: { reasoning: 9 },
        incurredTokenUsage: {
          total: 30,
          prompt: 20,
          completion: 10,
          numRequests: 1,
          completionDetails: { reasoning: 4 },
        },
      });
    }
  });

  it('should keep reserved criteria and outputs vars ahead of user vars', async () => {
    const provider = createSelectBestProvider('0');
    const grading: GradingConfig = {
      provider,
      rubricPrompt: 'criteria={{ criteria }}\noutputs={{ outputs }}\nextra={{ extra }}',
    };

    await matchesSelectBest('criteria from assertion', ['first output', 'second output'], grading, {
      criteria: 'vars criteria sentinel',
      outputs: 'vars outputs sentinel',
      extra: 'kept user var',
    });

    const [prompt, callApiContext] = vi.mocked(provider.callApi).mock.calls[0];
    expect(prompt).toContain('criteria=criteria from assertion');
    expect(prompt).toContain('first output');
    expect(prompt).toContain('extra=kept user var');
    expect(prompt).not.toContain('vars criteria sentinel');
    expect(prompt).not.toContain('vars outputs sentinel');
    expect(callApiContext?.vars).toMatchObject({
      criteria: 'criteria from assertion',
      extra: 'kept user var',
    });
  });
});
