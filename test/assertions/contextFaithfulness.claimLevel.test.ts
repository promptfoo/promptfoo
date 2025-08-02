import { handleContextFaithfulness } from '../../src/assertions/contextFaithfulness';
import { matchesContextFaithfulness } from '../../src/matchers';
import * as ContextUtils from '../../src/assertions/contextUtils';

import type { AssertionParams, GradingResult } from '../../src/types';

jest.mock('../../src/matchers');
jest.mock('../../src/assertions/contextUtils');

describe('handleContextFaithfulness with claim-level analysis', () => {
  const mockMatchesContextFaithfulness = jest.mocked(matchesContextFaithfulness);
  const mockResolveContext = jest.mocked(ContextUtils.resolveContext);

  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveContext.mockResolvedValue('Test context');
  });

  it('should enable claim-level analysis when config.claimLevel is true', async () => {
    const params: AssertionParams = {
      assertion: {
        type: 'context-faithfulness',
        threshold: 0.8,
        config: { claimLevel: true },
      },
      test: {
        vars: { query: 'What is the capital of France?' },
      },
      output: 'Paris is the capital of France. It has the Eiffel Tower.',
      outputString: 'Paris is the capital of France. It has the Eiffel Tower.',
      prompt: 'test prompt',
      providerResponse: { output: 'test output' },
      renderedValue: '',
      inverse: false,
      baseType: 'context-faithfulness',
    };

    const mockResult: Omit<GradingResult, 'assertion'> = {
      pass: true,
      score: 0.9,
      reason: '2/2 claims supported (100.0%)',
      metadata: {
        claimLevel: true,
        claims: [
          {
            claim: 'Paris is the capital of France',
            supported: true,
            explanation: 'The context explicitly states this',
          },
          {
            claim: 'Paris has the Eiffel Tower',
            supported: true,
            explanation: 'The context mentions the Eiffel Tower in Paris',
          },
        ],
        supportedCount: 2,
        totalClaims: 2,
      },
    };

    mockMatchesContextFaithfulness.mockResolvedValue(mockResult);

    const result = await handleContextFaithfulness(params);

    // Verify matchesContextFaithfulness was called with enableClaimLevel
    expect(mockMatchesContextFaithfulness).toHaveBeenCalledWith(
      'What is the capital of France?',
      'Paris is the capital of France. It has the Eiffel Tower.',
      'Test context',
      0.8,
      { enableClaimLevel: true },
    );

    // Verify the result includes claim-level metadata
    expect(result.metadata).toEqual({
      context: 'Test context',
      claimLevel: true,
      claims: expect.arrayContaining([
        expect.objectContaining({
          claim: expect.any(String),
          supported: expect.any(Boolean),
          explanation: expect.any(String),
        }),
      ]),
      supportedCount: 2,
      totalClaims: 2,
    });
  });

  it('should not enable claim-level analysis when config.claimLevel is false or undefined', async () => {
    const params: AssertionParams = {
      assertion: {
        type: 'context-faithfulness',
        threshold: 0.8,
      },
      test: {
        vars: { query: 'What is the capital of France?' },
      },
      output: 'Paris is the capital of France.',
      outputString: 'Paris is the capital of France.',
      prompt: 'test prompt',
      providerResponse: { output: 'test output' },
      renderedValue: '',
      inverse: false,
      baseType: 'context-faithfulness',
    };

    const mockResult: Omit<GradingResult, 'assertion'> = {
      pass: true,
      score: 0.95,
      reason: 'Faithfulness 0.95 is >= 0.8',
    };

    mockMatchesContextFaithfulness.mockResolvedValue(mockResult);

    const result = await handleContextFaithfulness(params);

    // Verify matchesContextFaithfulness was called without enableClaimLevel
    expect(mockMatchesContextFaithfulness).toHaveBeenCalledWith(
      'What is the capital of France?',
      'Paris is the capital of France.',
      'Test context',
      0.8,
      { enableClaimLevel: false },
    );

    // Verify the result does not include claim-level metadata
    expect(result.metadata).toEqual({
      context: 'Test context',
    });
  });

  it('should handle responses with unsupported claims', async () => {
    const params: AssertionParams = {
      assertion: {
        type: 'context-faithfulness',
        threshold: 0.7,
        config: { claimLevel: true },
      },
      test: {
        vars: { query: 'Tell me about Paris' },
      },
      output:
        'Paris is the capital of France. It has 5 million residents. The city was founded in 250 BC.',
      outputString:
        'Paris is the capital of France. It has 5 million residents. The city was founded in 250 BC.',
      prompt: 'test prompt',
      providerResponse: { output: 'test output' },
      renderedValue: '',
      inverse: false,
      baseType: 'context-faithfulness',
    };

    const mockResult: Omit<GradingResult, 'assertion'> = {
      pass: false,
      score: 0.33,
      reason:
        '1/3 claims supported (33.3%)\nUnsupported claims:\n- "Paris has 5 million residents"\n- "The city was founded in 250 BC"',
      metadata: {
        claimLevel: true,
        claims: [
          {
            claim: 'Paris is the capital of France',
            supported: true,
            explanation: 'The context states this',
          },
          {
            claim: 'Paris has 5 million residents',
            supported: false,
            explanation: 'The context does not mention population',
          },
          {
            claim: 'The city was founded in 250 BC',
            supported: false,
            explanation: 'The context does not mention founding date',
          },
        ],
        supportedCount: 1,
        totalClaims: 3,
      },
    };

    mockMatchesContextFaithfulness.mockResolvedValue(mockResult);

    const result = await handleContextFaithfulness(params);

    expect(result.pass).toBe(false);
    expect(result.score).toBe(0.33);
    expect(result.reason).toContain('Unsupported claims:');
    expect(result.metadata?.claims).toHaveLength(3);
  });
});
