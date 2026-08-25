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
