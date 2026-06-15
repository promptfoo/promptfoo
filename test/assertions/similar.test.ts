import { describe, expect, it, vi } from 'vitest';
import { handleSimilar } from '../../src/assertions/similar';
import { matchesSimilarity } from '../../src/matchers/similarity';
import { createMockProvider } from '../factories/provider';

vi.mock('../../src/matchers/similarity', () => ({
  matchesSimilarity: vi.fn().mockImplementation(async (expected, output, _threshold, inverse) => {
    if (inverse) {
      return {
        pass: expected !== output,
        score: expected === output ? 0 : 1,
      };
    }
    return {
      pass: expected === output,
      score: expected === output ? 1 : 0,
    };
  }),
}));

describe('handleSimilar', () => {
  it('should handle string similarity assertion', async () => {
    const result = await handleSimilar({
      assertion: {
        type: 'similar',
        value: 'hello world',
      },
      baseType: 'similar' as any,
      renderedValue: 'hello world',
      outputString: 'hello world',
      inverse: false,
      test: {
        description: 'test',
        vars: {},
        assert: [],
        options: {},
      },
      assertionValueContext: {
        prompt: 'test prompt',
        vars: {},
        test: {
          description: 'test',
          vars: {},
          assert: [],
          options: {},
        },
        logProbs: undefined,
        // @ts-ignore
        provider: createMockProvider({ response: {} }),
        providerResponse: { output: 'hello world' },
      },
      output: 'hello world',
      providerResponse: { output: 'hello world' },
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  it('should handle array of strings similarity assertion', async () => {
    const result = await handleSimilar({
      assertion: {
        type: 'similar',
        value: ['hello world', 'hi world'],
      },
      baseType: 'similar' as any,
      renderedValue: ['hello world', 'hi world'],
      outputString: 'hello world',
      inverse: false,
      test: {
        description: 'test',
        vars: {},
        assert: [],
        options: {},
      },
      assertionValueContext: {
        prompt: 'test prompt',
        vars: {},
        test: {
          description: 'test',
          vars: {},
          assert: [],
          options: {},
        },
        logProbs: undefined,
        // @ts-ignore
        provider: createMockProvider({ response: {} }),
        providerResponse: { output: 'hello world' },
      },
      output: 'hello world',
      providerResponse: { output: 'hello world' },
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  it('should handle custom threshold', async () => {
    const result = await handleSimilar({
      assertion: {
        type: 'similar',
        value: 'hello world',
        threshold: 0.5,
      },
      baseType: 'similar' as any,
      renderedValue: 'hello world',
      outputString: 'hello world',
      inverse: false,
      test: {
        description: 'test',
        vars: {},
        assert: [],
        options: {},
      },
      assertionValueContext: {
        prompt: 'test prompt',
        vars: {},
        test: {
          description: 'test',
          vars: {},
          assert: [],
          options: {},
        },
        logProbs: undefined,
        // @ts-ignore
        provider: createMockProvider({ response: {} }),
        providerResponse: { output: 'hello world' },
      },
      output: 'hello world',
      providerResponse: { output: 'hello world' },
    });

    expect(result.pass).toBe(true);
  });

  it('should handle inverse similarity assertion', async () => {
    const result = await handleSimilar({
      assertion: {
        type: 'similar',
        value: 'hello world',
      },
      baseType: 'similar' as any,
      renderedValue: 'hello world',
      outputString: 'completely different',
      inverse: true,
      test: {
        description: 'test',
        vars: {},
        assert: [],
        options: {},
      },
      assertionValueContext: {
        prompt: 'test prompt',
        vars: {},
        test: {
          description: 'test',
          vars: {},
          assert: [],
          options: {},
        },
        logProbs: undefined,
        // @ts-ignore
        provider: createMockProvider({ response: {} }),
        providerResponse: { output: 'completely different' },
      },
      output: 'completely different',
      providerResponse: { output: 'completely different' },
    });

    expect(result.pass).toBe(true);
  });

  it('should fail when no array values meet threshold', async () => {
    const result = await handleSimilar({
      assertion: {
        type: 'similar',
        value: ['hello world', 'hi world'],
        threshold: 0.9,
      },
      baseType: 'similar' as any,
      renderedValue: ['hello world', 'hi world'],
      outputString: 'completely different',
      inverse: false,
      test: {
        description: 'test',
        vars: {},
        assert: [],
        options: {},
      },
      assertionValueContext: {
        prompt: 'test prompt',
        vars: {},
        test: {
          description: 'test',
          vars: {},
          assert: [],
          options: {},
        },
        logProbs: undefined,
        // @ts-ignore
        provider: createMockProvider({ response: {} }),
        providerResponse: { output: 'completely different' },
      },
      output: 'completely different',
      providerResponse: { output: 'completely different' },
    });

    expect(result.pass).toBe(false);
    expect(result.reason).toBe('None of the provided values met the similarity threshold');
  });

  it('should report the best (highest) score when no array values meet threshold', async () => {
    // Neither value passes, but the output is closer to the second one.
    vi.mocked(matchesSimilarity)
      .mockResolvedValueOnce({ pass: false, score: 0.2 } as any)
      .mockResolvedValueOnce({ pass: false, score: 0.6 } as any);

    const result = await handleSimilar({
      assertion: {
        type: 'similar',
        value: ['far value', 'closer value'],
        threshold: 0.9,
      },
      baseType: 'similar' as any,
      renderedValue: ['far value', 'closer value'],
      outputString: 'some output',
      inverse: false,
      test: {
        description: 'test',
        vars: {},
        assert: [],
        options: {},
      },
      assertionValueContext: {
        prompt: 'test prompt',
        vars: {},
        test: {
          description: 'test',
          vars: {},
          assert: [],
          options: {},
        },
        logProbs: undefined,
        // @ts-ignore
        provider: createMockProvider({ response: {} }),
        providerResponse: { output: 'some output' },
      },
      output: 'some output',
      providerResponse: { output: 'some output' },
    });

    expect(result.pass).toBe(false);
    // Report how close the output got to its closest value (0.6), not the worst (0.2).
    expect(result.score).toBe(0.6);
  });

  it('should FAIL not-similar with an array when the output is similar to ANY value', async () => {
    // not-similar means "dissimilar to ALL". The output is too similar to the
    // first value (inverse check fails there) but dissimilar to the second.
    // It must fail — not pass on the strength of the second value.
    vi.mocked(matchesSimilarity)
      .mockResolvedValueOnce({ pass: false, score: 0.05, reason: 'too similar' } as any)
      .mockResolvedValueOnce({ pass: true, score: 0.9, reason: 'dissimilar' } as any);

    const result = await handleSimilar({
      assertion: {
        type: 'similar',
        value: ['forbidden answer A', 'unrelated answer B'],
        threshold: 0.75,
      },
      baseType: 'similar' as any,
      renderedValue: ['forbidden answer A', 'unrelated answer B'],
      outputString: 'forbidden answer A',
      inverse: true,
      test: {
        description: 'test',
        vars: {},
        assert: [],
        options: {},
      },
      assertionValueContext: {
        prompt: 'test prompt',
        vars: {},
        test: { description: 'test', vars: {}, assert: [], options: {} },
        logProbs: undefined,
        // @ts-ignore
        provider: createMockProvider({ response: {} }),
        providerResponse: { output: 'forbidden answer A' },
      },
      output: 'forbidden answer A',
      providerResponse: { output: 'forbidden answer A' },
    });

    // Before the fix this returned pass: true (dissimilar to the second value
    // short-circuited the loop). The output is identical to value A, so it must fail.
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0.05);
  });

  it('should PASS not-similar with an array only when dissimilar to ALL values', async () => {
    // Dissimilar to every value → not-similar passes; report the lowest score
    // (the value it came closest to / tightest margin).
    vi.mocked(matchesSimilarity)
      .mockResolvedValueOnce({ pass: true, score: 0.8, reason: 'dissimilar' } as any)
      .mockResolvedValueOnce({ pass: true, score: 0.95, reason: 'dissimilar' } as any);

    const result = await handleSimilar({
      assertion: {
        type: 'similar',
        value: ['forbidden answer A', 'forbidden answer B'],
        threshold: 0.75,
      },
      baseType: 'similar' as any,
      renderedValue: ['forbidden answer A', 'forbidden answer B'],
      outputString: 'a totally different response',
      inverse: true,
      test: {
        description: 'test',
        vars: {},
        assert: [],
        options: {},
      },
      assertionValueContext: {
        prompt: 'test prompt',
        vars: {},
        test: { description: 'test', vars: {}, assert: [], options: {} },
        logProbs: undefined,
        // @ts-ignore
        provider: createMockProvider({ response: {} }),
        providerResponse: { output: 'a totally different response' },
      },
      output: 'a totally different response',
      providerResponse: { output: 'a totally different response' },
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBe(0.8);
  });

  it('should throw error for invalid renderedValue type', async () => {
    await expect(
      handleSimilar({
        assertion: {
          type: 'similar',
          value: 'test',
        },
        baseType: 'similar' as any,
        renderedValue: 123 as any,
        outputString: 'test',
        inverse: false,
        test: {
          description: 'test',
          vars: {},
          assert: [],
          options: {},
        },
        assertionValueContext: {
          prompt: 'test prompt',
          vars: {},
          test: {
            description: 'test',
            vars: {},
            assert: [],
            options: {},
          },
          logProbs: undefined,
          // @ts-ignore
          provider: createMockProvider({ response: {} }),
          providerResponse: { output: 'test' },
        },
        output: 'test',
        providerResponse: { output: 'test' },
      }),
    ).rejects.toThrow('Similarity assertion type must have a string or array of strings value');
  });

  it('should throw error for empty array value', async () => {
    await expect(
      handleSimilar({
        assertion: {
          type: 'similar',
          value: [],
        },
        baseType: 'similar' as any,
        renderedValue: [],
        outputString: 'test',
        inverse: false,
        test: {
          description: 'test',
          vars: {},
          assert: [],
          options: {},
        },
        assertionValueContext: {
          prompt: 'test prompt',
          vars: {},
          test: {
            description: 'test',
            vars: {},
            assert: [],
            options: {},
          },
          logProbs: undefined,
          // @ts-ignore
          provider: createMockProvider({ response: {} }),
          providerResponse: { output: 'test' },
        },
        output: 'test',
        providerResponse: { output: 'test' },
      }),
    ).rejects.toThrow('Similarity assertion must have at least one value to compare against');
  });

  it('should use dot_product metric when specified', async () => {
    const mockMatchesSimilarity = vi.mocked(matchesSimilarity);

    await handleSimilar({
      assertion: {
        type: 'similar:dot',
        value: 'hello world',
      },
      baseType: 'similar' as any,
      renderedValue: 'hello world',
      outputString: 'hello world',
      inverse: false,
      test: {
        description: 'test',
        vars: {},
        assert: [],
        options: {},
      },
      assertionValueContext: {
        prompt: 'test prompt',
        vars: {},
        test: {
          description: 'test',
          vars: {},
          assert: [],
          options: {},
        },
        logProbs: undefined,
        // @ts-ignore
        provider: createMockProvider({ response: {} }),
        providerResponse: { output: 'hello world' },
      },
      output: 'hello world',
      providerResponse: { output: 'hello world' },
    });

    // Verify that matchesSimilarity was called with dot_product metric
    expect(mockMatchesSimilarity).toHaveBeenCalledWith(
      'hello world',
      'hello world',
      expect.any(Number),
      false,
      expect.any(Object),
      'dot_product',
    );
  });

  it('should use euclidean metric when specified', async () => {
    const mockMatchesSimilarity = vi.mocked(matchesSimilarity);

    await handleSimilar({
      assertion: {
        type: 'similar:euclidean',
        value: 'hello world',
      },
      baseType: 'similar' as any,
      renderedValue: 'hello world',
      outputString: 'hello world',
      inverse: false,
      test: {
        description: 'test',
        vars: {},
        assert: [],
        options: {},
      },
      assertionValueContext: {
        prompt: 'test prompt',
        vars: {},
        test: {
          description: 'test',
          vars: {},
          assert: [],
          options: {},
        },
        logProbs: undefined,
        // @ts-ignore
        provider: createMockProvider({ response: {} }),
        providerResponse: { output: 'hello world' },
      },
      output: 'hello world',
      providerResponse: { output: 'hello world' },
    });

    // Verify that matchesSimilarity was called with euclidean metric
    expect(mockMatchesSimilarity).toHaveBeenCalledWith(
      'hello world',
      'hello world',
      expect.any(Number),
      false,
      expect.any(Object),
      'euclidean',
    );
  });

  it('should default to cosine metric when not specified', async () => {
    const mockMatchesSimilarity = vi.mocked(matchesSimilarity);

    await handleSimilar({
      assertion: {
        type: 'similar',
        value: 'hello world',
      },
      baseType: 'similar' as any,
      renderedValue: 'hello world',
      outputString: 'hello world',
      inverse: false,
      test: {
        description: 'test',
        vars: {},
        assert: [],
        options: {},
      },
      assertionValueContext: {
        prompt: 'test prompt',
        vars: {},
        test: {
          description: 'test',
          vars: {},
          assert: [],
          options: {},
        },
        logProbs: undefined,
        // @ts-ignore
        provider: createMockProvider({ response: {} }),
        providerResponse: { output: 'hello world' },
      },
      output: 'hello world',
      providerResponse: { output: 'hello world' },
    });

    // Verify that matchesSimilarity was called with cosine metric (default)
    expect(mockMatchesSimilarity).toHaveBeenCalledWith(
      'hello world',
      'hello world',
      expect.any(Number),
      false,
      expect.any(Object),
      'cosine',
    );
  });
});
