import { afterEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    '2',
    '**2**',
    'Text 2',
    '<Text index="2"> fits best.',
    'Text 2 is best. I choose 2.',
    'Text 2 is best for the 2025 criteria.',
    'Comparing all 3 texts, I choose 2.',
    'Confidence 0.9: text 2 is best.',
    'Rubric v1: text 2 is best.',
  ])('selects the only distinct output index in %j', async (output) => {
    const result = await matchesSelectBest('best answer', ['A', 'B', 'C'], {
      provider: createSelectBestProvider(output),
    });

    expect(result.map(({ pass }) => pass)).toEqual([false, false, true]);
    expect(result.map(({ score }) => score)).toEqual([0, 0, 1]);
  });

  it.each([
    'Text 0 is too long and text 1 is vague, so the best fit is 2.',
    'Text 1 repeats the question; text 2 answers it. Best: 2',
    'The best fit is 2. Text 0 and text 1 miss the tone.',
  ])('does not guess a winner when %j mentions different output indexes', async (output) => {
    const result = await matchesSelectBest('best answer', ['A', 'B', 'C'], {
      provider: createSelectBestProvider(output),
    });

    expect(result).toHaveLength(3);
    for (const grade of result) {
      expect(grade).toMatchObject({
        pass: false,
        score: 0,
        reason: 'Ambiguous select-best verdict: multiple output indexes',
      });
    }
  });

  it.each(['-1', '+1', '−1', '0.9', '.9', '1e2', 'v1', '0,1', '0-2'])(
    'does not read a numeric fragment in %j as an output index',
    async (output) => {
      const result = await matchesSelectBest('best answer', ['A', 'B', 'C'], {
        provider: createSelectBestProvider(output),
      });

      expect(result.every(({ pass, score }) => !pass && score === 0)).toBe(true);
      expect(result[0].reason).toMatch(/^Invalid select-best verdict:/);
    },
  );

  it.each([
    {
      description: 'coverage counts',
      output: 'Text 0 covers 2 of the 3 requested points; text 1 covers all of them. Best: 1',
      outputCount: 3,
    },
    {
      description: 'score fractions',
      output: "Output 1 wins, scoring 9/10 against output 0's 7/10.",
      outputCount: 3,
    },
    {
      description: 'a count of criteria',
      output: 'Using the 2 criteria, text 0 wins.',
      outputCount: 3,
    },
    {
      description: 'a multi-digit winner and runner-up',
      output: 'Output 10 is best; output 2 is second.',
      outputCount: 12,
    },
    {
      description: 'elimination reasoning',
      output: 'After eliminating 0 and 2, the winner is 1.',
      outputCount: 3,
    },
    {
      description: 'quoted candidate text',
      output:
        'Text 0 says "I have 2 dogs", which is irrelevant; text 1 answers the question. Best: 1',
      outputCount: 3,
    },
  ])(
    'rejects clear-verdict prose containing $description instead of inferring its winner',
    async ({ output, outputCount }) => {
      const outputs = Array.from({ length: outputCount }, (_value, index) => 'Output ' + index);
      const result = await matchesSelectBest('best answer', outputs, {
        provider: createSelectBestProvider(output),
      });

      expect(result).toHaveLength(outputCount);
      for (const grade of result) {
        expect(grade).toMatchObject({
          pass: false,
          score: 0,
          reason: 'Ambiguous select-best verdict: multiple output indexes',
        });
      }
    },
  );

  it('preserves the documented limitation for a lone incidental index without a verdict', async () => {
    const result = await matchesSelectBest('best answer', ['A', 'B', 'C'], {
      provider: createSelectBestProvider("Text 2's opening is strong."),
    });

    expect(result.map(({ pass }) => pass)).toEqual([false, false, true]);
    expect(result.map(({ score }) => score)).toEqual([0, 0, 1]);
  });

  it('preserves cache provenance and independent results for an ambiguous verdict', async () => {
    const provider = createMockProvider({
      response: {
        output: 'Text 0 is too long. Text 1 is best.',
        cached: true,
        tokenUsage: { total: 7, prompt: 3, completion: 4 },
      },
    });

    const result = await matchesSelectBest('best answer', ['A', 'B'], { provider });

    expect(result[0]).not.toBe(result[1]);
    for (const grade of result) {
      expect(grade).toMatchObject({
        pass: false,
        score: 0,
        reason: 'Ambiguous select-best verdict: multiple output indexes',
        metadata: { cachedResponse: true },
        tokensUsed: { total: 7, prompt: 3, completion: 4, cached: 7 },
      });
    }
  });

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
