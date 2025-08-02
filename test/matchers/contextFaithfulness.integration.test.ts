/**
 * Integration test to verify our claim-level faithfulness implementation
 * follows RAGAS approach exactly.
 */

import { matchesContextFaithfulness } from '../../src/matchers';

// Mock the provider
const mockProvider = {
  id: () => 'mock-provider',
  callApi: jest.fn(),
};

// Mock getDefaultProviders
jest.mock('../../src/providers/defaults', () => ({
  getDefaultProviders: jest.fn().mockResolvedValue({
    gradingProvider: mockProvider,
  }),
}));

// Mock getAndCheckProvider to return our mock provider
jest.mock('../../src/matchers', () => {
  const actual = jest.requireActual('../../src/matchers');
  return {
    ...actual,
    getAndCheckProvider: jest.fn().mockResolvedValue(mockProvider),
  };
});

describe('RAGAS-style faithfulness implementation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProvider.callApi.mockClear();
  });

  it('should follow RAGAS two-step process', async () => {
    // Step 1: Statement extraction (RAGAS format)
    mockProvider.callApi
      .mockResolvedValueOnce({
        output: `statements:
Paris is the capital of France.
The Eiffel Tower is located in Paris.
Paris has over 2 million residents.`,
        tokenUsage: { total: 100, prompt: 80, completion: 20 },
      })
      // Step 2: NLI verification (RAGAS format)
      .mockResolvedValueOnce({
        output: `1. Paris is the capital of France.
Explanation: The context explicitly states that Paris is the capital of France.
Verdict: Yes.
2. The Eiffel Tower is located in Paris.
Explanation: The context mentions the Eiffel Tower is in Paris.
Verdict: Yes.
3. Paris has over 2 million residents.
Explanation: The population is not mentioned in the provided context.
Verdict: No.
Final verdict for each statement in order: Yes. Yes. No.`,
        tokenUsage: { total: 150, prompt: 100, completion: 50 },
      });

    const result = await matchesContextFaithfulness(
      'Tell me about Paris',
      'Paris is the capital of France. The Eiffel Tower is located in Paris. Paris has over 2 million residents.',
      'Paris is the capital of France. The Eiffel Tower is a famous landmark in Paris.',
      0.6, // threshold
      { enableClaimLevel: true },
    );

    // Verify two API calls were made
    expect(mockProvider.callApi).toHaveBeenCalledTimes(2);

    // Verify the prompts used match RAGAS format
    const extractionCall = mockProvider.callApi.mock.calls[0][0];
    expect(extractionCall).toContain('Given a question and answer, create one or more statements');
    expect(extractionCall).toContain('question: Tell me about Paris');
    expect(extractionCall).toContain('answer: Paris is the capital of France');

    const verificationCall = mockProvider.callApi.mock.calls[1][0];
    expect(verificationCall).toContain('Natural language inference');
    expect(verificationCall).toContain('Consider the given context and following statements');

    // Verify the result follows RAGAS scoring
    expect(result.score).toBeCloseTo(2 / 3); // 2 supported out of 3 claims
    expect(result.pass).toBe(true); // 0.667 >= 0.6
    expect(result.reason).toContain('2/3 claims supported');
    expect(result.reason).toContain('Paris has over 2 million residents'); // Unsupported claim

    // Verify metadata structure
    expect(result.metadata).toMatchObject({
      claimLevel: true,
      claims: [
        {
          claim: 'Paris is the capital of France.',
          supported: true,
          explanation: expect.stringContaining('capital'),
        },
        {
          claim: 'The Eiffel Tower is located in Paris.',
          supported: true,
          explanation: expect.stringContaining('Eiffel Tower'),
        },
        {
          claim: 'Paris has over 2 million residents.',
          supported: false,
          explanation: expect.stringContaining('population'),
        },
      ],
      supportedCount: 2,
      totalClaims: 3,
    });
  });

  it('should handle RAGAS edge case: empty statements', async () => {
    mockProvider.callApi.mockResolvedValueOnce({
      output: 'statements:\n',
      tokenUsage: { total: 50 },
    });

    const result = await matchesContextFaithfulness(
      'Is this appropriate?',
      "I can't help with that request.",
      'Context about appropriateness',
      0.8,
      { enableClaimLevel: true },
    );

    // RAGAS behavior: no claims = perfect score
    expect(result.score).toBe(1.0);
    expect(result.pass).toBe(true);
    expect(result.reason).toBe('No factual claims to verify in the response');
    expect(result.metadata?.claims).toEqual([]);
  });

  it('should match existing non-claim-level implementation when disabled', async () => {
    // Test the existing RAGAS implementation path
    mockProvider.callApi
      .mockResolvedValueOnce({
        // Statement extraction
        output: `Albert Einstein was born in Germany.
Albert Einstein was a theoretical physicist.`,
        tokenUsage: { total: 80 },
      })
      .mockResolvedValueOnce({
        // NLI verification
        output: `1. Albert Einstein was born in Germany.
Explanation: Confirmed by context.
Verdict: Yes.
2. Albert Einstein was a theoretical physicist.
Explanation: Not mentioned in context.
Verdict: No.
Final verdict for each statement in order: Yes. No.`,
        tokenUsage: { total: 120 },
      });

    const result = await matchesContextFaithfulness(
      'Who was Einstein?',
      'Albert Einstein was a German-born theoretical physicist.',
      'Albert Einstein was born in Germany.',
      0.5,
      { enableClaimLevel: false }, // Use existing implementation
    );

    // Should use the existing verdict parsing logic
    expect(result.score).toBe(0.5); // 1 - (1 "no" / 2 statements)
    expect(result.reason).toContain('Faithfulness 0.50');
    expect(result.metadata).toBeUndefined(); // No detailed metadata in existing implementation
  });
});
