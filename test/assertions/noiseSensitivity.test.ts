import { handleNoiseSensitivity } from '../../src/assertions/noiseSensitivity';

import type { AssertionParams, GradingResult } from '../../src/types';
import type { ContextChunk } from '../../src/matchers';

// Mock the matchers module
jest.mock('../../src/matchers', () => ({
  matchesNoiseSensitivity: jest.fn(),
}));

// Mock the contextUtils module
jest.mock('../../src/assertions/contextUtils', () => ({
  resolveContext: jest.fn(),
}));

import { matchesNoiseSensitivity } from '../../src/matchers';
import { resolveContext } from '../../src/assertions/contextUtils';

describe('handleNoiseSensitivity', () => {
  const createContext = (vars: Record<string, any>) => ({
    vars,
    prompt: 'Test prompt',
    test: { vars },
    logProbs: undefined,
    provider: undefined,
    providerResponse: undefined,
  });
  const mockMatchesNoiseSensitivity = jest.mocked(matchesNoiseSensitivity);
  const mockResolveContext = jest.mocked(resolveContext);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should pass when noise sensitivity is below threshold (legacy string format)', async () => {
    mockResolveContext.mockResolvedValue('Context with some noise');
    mockMatchesNoiseSensitivity.mockResolvedValue({
      pass: true,
      score: 0.1,
      reason: 'Noise sensitivity score: 0.10. Found 1 incorrect claims out of 10 total claims. In relevant mode, all incorrect claims indicate sensitivity to noise. Score 0.10 is <= threshold 0.20.',
      tokensUsed: { total: 100, prompt: 80, completion: 20 },
      metadata: {
        totalClaims: 10,
        incorrectClaimsCount: 1,
        noiseInfluencedClaimsCount: 1,
        incorrectClaims: ['Some incorrect claim'],
        noiseInfluencedClaims: ['Some incorrect claim'],
        claimAnalyses: [],
        mode: 'relevant',
      },
    });

    const params: AssertionParams = {
      assertion: {
        type: 'noise-sensitivity',
        value: 'Paris is the capital of France',
        threshold: 0.2,
      },
      test: {
        vars: {
          query: 'What is the capital of France?',
          context: 'Paris is the capital of France. Berlin is the capital of Germany.',
        },
      },
      output: 'Paris is the capital of France.',
      outputString: 'Paris is the capital of France.',
      prompt: 'Answer the question based on context',
      providerResponse: { output: 'Paris is the capital of France.' },
      renderedValue: 'Paris is the capital of France',
      inverse: false,
      baseType: 'noise-sensitivity',
      context: createContext({ query: 'What is the capital of France?', context: 'Paris is the capital of France. Berlin is the capital of Germany.' }),
    };

    const result = await handleNoiseSensitivity(params);

    expect(result.pass).toBe(true);
    expect(result.score).toBe(0.1);
    expect(result.reason).toContain('Score 0.10 is <= threshold 0.20');
    expect(mockMatchesNoiseSensitivity).toHaveBeenCalledWith(
      'What is the capital of France?',
      'Paris is the capital of France.',
      'Paris is the capital of France',
      'Context with some noise', // Legacy string format
      'relevant',
      0.2,
      undefined,
      { query: 'What is the capital of France?', context: 'Paris is the capital of France. Berlin is the capital of Germany.' },
    );
  });

  it('should fail when noise sensitivity exceeds threshold', async () => {
    mockResolveContext.mockResolvedValue('Noisy context');
    mockMatchesNoiseSensitivity.mockResolvedValue({
      pass: false,
      score: 0.5,
      reason: 'Noise sensitivity score: 0.50. Found 5 incorrect claims out of 10 total claims. In relevant mode, all incorrect claims indicate sensitivity to noise. Score 0.50 is > threshold 0.20.',
      tokensUsed: { total: 100, prompt: 80, completion: 20 },
    });

    const params: AssertionParams = {
      assertion: {
        type: 'noise-sensitivity',
        value: 'Expected answer',
        threshold: 0.2,
      },
      test: {
        vars: {
          query: 'Test question?',
        },
      },
      output: 'Output with noise influence',
      outputString: 'Output with noise influence',
      prompt: 'Test prompt',
      providerResponse: { output: 'Output with noise influence' },
      renderedValue: 'Expected answer',
      inverse: false,
      baseType: 'noise-sensitivity',
      context: createContext({ query: 'Test question?' }),
    };

    const result = await handleNoiseSensitivity(params);

    expect(result.pass).toBe(false);
    expect(result.score).toBe(0.5);
    expect(result.reason).toContain('Score 0.50 is > threshold 0.20');
  });

  it('should use custom noise context when provided', async () => {
    mockResolveContext.mockResolvedValue('Original context');
    mockMatchesNoiseSensitivity.mockResolvedValue({
      pass: true,
      score: 0.15,
      reason: 'Noise sensitivity score: 0.15. Found 2 claims influenced by noise out of 10 total claims. Score 0.15 is <= threshold 0.30.',
      tokensUsed: { total: 100, prompt: 80, completion: 20 },
    });

    const params: AssertionParams = {
      assertion: {
        type: 'noise-sensitivity',
        value: 'Ground truth',
        threshold: 0.3,
        config: {
          noiseContext: 'Additional irrelevant information',
          mode: 'relevant',
        },
      },
      test: {
        vars: {
          query: 'Question?',
        },
      },
      output: 'Answer',
      outputString: 'Answer',
      prompt: 'Prompt',
      providerResponse: { output: 'Answer' },
      renderedValue: 'Ground truth',
      inverse: false,
      baseType: 'noise-sensitivity',
      context: createContext({ query: 'Question?' }),
    };

    const result = await handleNoiseSensitivity(params);

    expect(mockMatchesNoiseSensitivity).toHaveBeenCalledWith(
      'Question?',
      'Answer',
      'Ground truth',
      'Original context\n\nAdditional irrelevant information',
      'relevant',
      0.3,
      undefined, // grading config
      { query: 'Question?' },
    );
  });

  it('should handle irrelevant mode correctly', async () => {
    mockResolveContext.mockResolvedValue('Irrelevant context');
    mockMatchesNoiseSensitivity.mockResolvedValue({
      pass: true,
      score: 0.7,
      reason: 'Noise sensitivity score: 0.70. Found 7 claims influenced by noise out of 10 total claims. Model made 0 incorrect claims when given irrelevant context.',
      tokensUsed: { total: 100, prompt: 80, completion: 20 },
    });

    const params: AssertionParams = {
      assertion: {
        type: 'noise-sensitivity',
        value: 'Ground truth',
        threshold: 0.6,
        config: {
          mode: 'irrelevant',
        },
      },
      test: {
        vars: {
          query: 'Question?',
        },
      },
      output: 'Answer ignoring context',
      outputString: 'Answer ignoring context',
      prompt: 'Prompt',
      providerResponse: { output: 'Answer ignoring context' },
      renderedValue: 'Ground truth',
      inverse: false,
      baseType: 'noise-sensitivity',
      context: createContext({ query: 'Question?' }),
    };

    const result = await handleNoiseSensitivity(params);

    expect(mockMatchesNoiseSensitivity).toHaveBeenCalledWith(
      'Question?',
      'Answer ignoring context',
      'Ground truth',
      'Irrelevant context',
      'irrelevant',
      0.6,
      undefined, // grading config
      { query: 'Question?' },
    );
  });

  it('should throw error when query is missing', async () => {
    const params: AssertionParams = {
      assertion: {
        type: 'noise-sensitivity',
        value: 'Ground truth',
      },
      test: {
        vars: {},
      },
      output: 'Output',
      outputString: 'Output',
      prompt: 'Prompt',
      providerResponse: { output: 'Output' },
      renderedValue: 'Ground truth',
      inverse: false,
      baseType: 'noise-sensitivity',
      context: createContext({}),
    };

    await expect(handleNoiseSensitivity(params)).rejects.toThrow(
      'noise-sensitivity assertion requires a "query" variable with the user question',
    );
  });

  it('should throw error when query is not a string', async () => {
    const params: AssertionParams = {
      assertion: {
        type: 'noise-sensitivity',
        value: 'Ground truth',
      },
      test: {
        vars: {
          query: { not: 'a string' },
        },
      },
      output: 'Output',
      outputString: 'Output',
      prompt: 'Prompt',
      providerResponse: { output: 'Output' },
      renderedValue: 'Ground truth',
      inverse: false,
      baseType: 'noise-sensitivity',
      context: createContext({ query: { not: 'a string' } }),
    };

    await expect(handleNoiseSensitivity(params)).rejects.toThrow(
      'noise-sensitivity assertion requires a "query" variable with the user question',
    );
  });

  it('should throw error when output is not a string', async () => {
    const params: AssertionParams = {
      assertion: {
        type: 'noise-sensitivity',
        value: 'Ground truth',
      },
      test: {
        vars: {
          query: 'Question?',
        },
      },
      output: { not: 'a string' },
      outputString: '[object Object]',
      prompt: 'Prompt',
      providerResponse: { output: { not: 'a string' } },
      renderedValue: 'Ground truth',
      inverse: false,
      baseType: 'noise-sensitivity',
      context: createContext({ query: 'Question?' }),
    };

    await expect(handleNoiseSensitivity(params)).rejects.toThrow(
      'noise-sensitivity assertion requires string output from the provider',
    );
  });

  it('should throw error when ground truth is not a string', async () => {
    const params: AssertionParams = {
      assertion: {
        type: 'noise-sensitivity',
        value: { not: 'a string' },
      },
      test: {
        vars: {
          query: 'Question?',
        },
      },
      output: 'Output',
      outputString: 'Output',
      prompt: 'Prompt',
      providerResponse: { output: 'Output' },
      renderedValue: '[object Object]',
      inverse: false,
      baseType: 'noise-sensitivity',
      context: createContext({ query: 'Question?' }),
    };

    await expect(handleNoiseSensitivity(params)).rejects.toThrow(
      'noise-sensitivity assertion requires a ground truth value to compare against',
    );
  });

  it('should use default threshold when not specified', async () => {
    mockResolveContext.mockResolvedValue('Context');
    mockMatchesNoiseSensitivity.mockResolvedValue({
      pass: true,
      score: 0.1,
      reason: 'Noise sensitivity score: 0.10. Found 1 claims influenced by noise out of 10 total claims. Score 0.10 is <= threshold 0.20.',
      tokensUsed: { total: 100, prompt: 80, completion: 20 },
    });

    const params: AssertionParams = {
      assertion: {
        type: 'noise-sensitivity',
        value: 'Ground truth',
        // No threshold specified - should use default 0.2
      },
      test: {
        vars: {
          query: 'Question?',
        },
      },
      output: 'Answer',
      outputString: 'Answer',
      prompt: 'Prompt',
      providerResponse: { output: 'Answer' },
      renderedValue: 'Ground truth',
      inverse: false,
      baseType: 'noise-sensitivity',
      context: createContext({ query: 'Question?' }),
    };

    const result = await handleNoiseSensitivity(params);

    expect(mockMatchesNoiseSensitivity).toHaveBeenCalledWith(
      'Question?',
      'Answer',
      'Ground truth',
      'Context',
      'relevant',
      0.2, // Default threshold
      undefined,
      { query: 'Question?' },
    );
  });

  it('should support new chunk-based context format', async () => {
    const chunks: ContextChunk[] = [
      { text: 'Paris is the capital of France.', relevant: true },
      { text: 'Berlin has many museums.', relevant: false },
    ];
    
    mockResolveContext.mockResolvedValue('Default context');
    mockMatchesNoiseSensitivity.mockResolvedValue({
      pass: true,
      score: 0.0,
      reason: 'Noise sensitivity score: 0.00. Found 0 incorrect claims, of which 0 came from irrelevant context chunks. In irrelevant mode, only claims from irrelevant chunks count toward noise sensitivity. Score 0.00 is <= threshold 0.30.',
      tokensUsed: { total: 100, prompt: 80, completion: 20 },
      metadata: {
        totalClaims: 2,
        incorrectClaimsCount: 0,
        noiseInfluencedClaimsCount: 0,
        incorrectClaims: [],
        noiseInfluencedClaims: [],
        claimAnalyses: [],
        mode: 'irrelevant',
        contextChunks: chunks.map(c => ({ text: c.text.substring(0, 100) + '...', relevant: c.relevant })),
      },
    });

    const params: AssertionParams = {
      assertion: {
        type: 'noise-sensitivity',
        value: 'Paris is the capital of France',
        threshold: 0.3,
        config: {
          mode: 'irrelevant',
          contextChunks: chunks,
        },
      },
      test: {
        vars: {
          query: 'What is the capital of France?',
        },
      },
      output: 'Paris is the capital of France.',
      outputString: 'Paris is the capital of France.',
      prompt: 'Answer the question',
      providerResponse: { output: 'Paris is the capital of France.' },
      renderedValue: 'Paris is the capital of France',
      inverse: false,
      baseType: 'noise-sensitivity',
      context: createContext({ query: 'What is the capital of France?' }),
    };

    const result = await handleNoiseSensitivity(params);

    expect(result.pass).toBe(true);
    expect(result.score).toBe(0.0);
    expect(mockMatchesNoiseSensitivity).toHaveBeenCalledWith(
      'What is the capital of France?',
      'Paris is the capital of France.',
      'Paris is the capital of France',
      chunks, // Should pass chunks directly
      'irrelevant',
      0.3,
      undefined, // grading config
      { query: 'What is the capital of France?' },
    );
    expect(result.metadata?.contextChunks).toEqual(chunks.map(c => ({ 
      text: c.text.substring(0, 100) + '...', 
      relevant: c.relevant 
    })));
  });

  it('should include metadata in result', async () => {
    const metadata = {
      context: 'The context used',
      mode: 'relevant',
      totalClaims: 5,
      incorrectClaimsCount: 1,
      noiseInfluencedClaimsCount: 1,
      incorrectClaims: ['Wrong claim'],
      noiseInfluencedClaims: ['Wrong claim'],
    };

    mockResolveContext.mockResolvedValue('Context');
    mockMatchesNoiseSensitivity.mockResolvedValue({
      pass: true,
      score: 0.2,
      reason: 'Passed',
      tokensUsed: { total: 100, prompt: 80, completion: 20 },
      metadata: {
        totalClaims: 5,
        incorrectClaimsCount: 1,
        noiseInfluencedClaimsCount: 1,
        incorrectClaims: ['Wrong claim'],
        noiseInfluencedClaims: ['Wrong claim'],
        claimAnalyses: [],
        mode: 'relevant',
      },
    });

    const params: AssertionParams = {
      assertion: {
        type: 'noise-sensitivity',
        value: 'Ground truth',
      },
      test: {
        vars: {
          query: 'Question?',
        },
      },
      output: 'Answer',
      outputString: 'Answer',
      prompt: 'Prompt',
      providerResponse: { output: 'Answer' },
      renderedValue: 'Ground truth',
      inverse: false,
      baseType: 'noise-sensitivity',
      context: createContext({ query: 'Question?' }),
    };

    const result = await handleNoiseSensitivity(params);

    expect(result.metadata).toMatchObject({
      context: 'Context',
      mode: 'relevant',
      totalClaims: 5,
      incorrectClaimsCount: 1,
      noiseInfluencedClaimsCount: 1,
      incorrectClaims: ['Wrong claim'],
      noiseInfluencedClaims: ['Wrong claim'],
    });
  });
});