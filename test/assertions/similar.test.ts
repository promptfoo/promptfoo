import { handleSimilar } from '../../src/assertions/similar';

jest.mock('../../src/matchers', () => ({
  matchesSimilarity: jest.fn().mockImplementation(async (expected, output, threshold, inverse) => {
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
      context: {
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
        provider: { id: () => 'test-provider', callApi: async () => ({}) },
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
      context: {
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
        provider: { id: () => 'test-provider', callApi: async () => ({}) },
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
      context: {
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
        provider: { id: () => 'test-provider', callApi: async () => ({}) },
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
      context: {
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
        provider: { id: () => 'test-provider', callApi: async () => ({}) },
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
      context: {
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
        provider: { id: () => 'test-provider', callApi: async () => ({}) },
        providerResponse: { output: 'completely different' },
      },
      output: 'completely different',
      providerResponse: { output: 'completely different' },
    });

    expect(result.pass).toBe(false);
    expect(result.reason).toBe('None of the provided values met the similarity threshold');
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
        context: {
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
          provider: { id: () => 'test-provider', callApi: async () => ({}) },
          providerResponse: { output: 'test' },
        },
        output: 'test',
        providerResponse: { output: 'test' },
      }),
    ).rejects.toThrow('Similarity assertion type must have a string or array of strings value');
  });
});
