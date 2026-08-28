import { describe, expect, it } from 'vitest';
import { matchesClosedQa, matchesFactuality } from '../../src/matchers/llmGrading';
import { createMockProvider } from '../factories/provider';

const tokenUsage = { total: 10, prompt: 5, completion: 5 };

describe('model grader failures', () => {
  it('marks factuality provider errors as grader errors', async () => {
    const provider = createMockProvider({
      response: { error: 'grader unavailable', tokenUsage },
    });

    await expect(
      matchesFactuality('question', 'expected', 'answer', { provider }),
    ).resolves.toEqual(
      expect.objectContaining({
        pass: false,
        score: 0,
        reason: 'grader unavailable',
        metadata: { graderError: true },
      }),
    );
  });

  it('marks factuality no-output responses as grader errors', async () => {
    const provider = createMockProvider({
      response: { output: '', tokenUsage },
    });

    await expect(
      matchesFactuality('question', 'expected', 'answer', { provider }),
    ).resolves.toEqual(
      expect.objectContaining({
        pass: false,
        score: 0,
        reason: 'No output',
        metadata: { graderError: true },
      }),
    );
  });

  it('marks closed-QA provider errors as grader errors', async () => {
    const provider = createMockProvider({
      response: { error: 'grader unavailable', tokenUsage },
    });

    await expect(
      matchesClosedQa('question', 'criterion', 'answer', { provider }),
    ).resolves.toEqual(
      expect.objectContaining({
        pass: false,
        score: 0,
        reason: 'grader unavailable',
        metadata: { graderError: true },
      }),
    );
  });

  it('keeps valid negative grades as ordinary assertion failures', async () => {
    const factualityProvider = createMockProvider({
      response: {
        output: '(D) The submitted answer disagrees with the expert answer.',
        tokenUsage,
      },
    });
    const closedQaProvider = createMockProvider({
      response: { output: 'N', tokenUsage },
    });

    const factuality = await matchesFactuality('question', 'expected', 'answer', {
      provider: factualityProvider,
    });
    const closedQa = await matchesClosedQa('question', 'criterion', 'answer', {
      provider: closedQaProvider,
    });

    expect(factuality).toMatchObject({ pass: false, score: 0 });
    expect(factuality.metadata).toBeUndefined();
    expect(closedQa).toMatchObject({ pass: false, score: 0 });
    expect(closedQa.metadata).toBeUndefined();
  });
});
