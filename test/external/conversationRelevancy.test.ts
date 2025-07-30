import { handleConversationRelevance } from '../../src/external/assertions/deepeval';
import { matchesConversationRelevance } from '../../src/external/matchers/deepeval';
import { ConversationRelevancyTemplate } from '../../src/external/matchers/conversationRelevancyTemplate';
import { getDefaultProviders } from '../../src/providers/defaults';
import type { AssertionParams, AtomicTestCase } from '../../src/types';

jest.mock('../../src/providers/defaults', () => ({
  getDefaultProviders: jest.fn(),
}));

jest.mock('../../src/matchers', () => ({
  ...jest.requireActual('../../src/matchers'),
  getAndCheckProvider: jest.fn().mockImplementation(async (type, provider, defaultProvider) => {
    return provider || defaultProvider;
  }),
}));

describe('ConversationRelevancyTemplate', () => {
  describe('generateVerdicts', () => {
    it('should generate proper verdict prompt', () => {
      const messages = [
        { role: 'user' as const, content: 'What is the weather?' },
        { role: 'assistant' as const, content: 'It is sunny today.' },
      ];

      const prompt = ConversationRelevancyTemplate.generateVerdicts(messages);
      expect(prompt).toContain(
        'generate a JSON object to indicate whether the LAST `assistant` message is relevant',
      );
      expect(prompt).toContain(JSON.stringify(messages, null, 2));
    });
  });

  describe('generateReason', () => {
    it('should generate proper reason prompt', () => {
      const score = 0.6;
      const irrelevancies = [
        'Response about weather was not related to math question',
        'Assistant talked about food when asked about programming',
      ];

      const prompt = ConversationRelevancyTemplate.generateReason(score, irrelevancies);
      expect(prompt).toContain(`Relevancy Score:\n${score}`);
      expect(prompt).toContain(JSON.stringify(irrelevancies, null, 2));
    });
  });
});

describe('matchesConversationRelevance with template', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should use ConversationRelevancyTemplate for prompts', async () => {
    const mockProvider = {
      id: () => 'mock-provider',
      callApi: jest.fn().mockResolvedValue({
        output: JSON.stringify({ verdict: 'yes' }),
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
      }),
    };

    jest.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: mockProvider,
      gradingJsonProvider: mockProvider,
      gradingProvider: mockProvider,
      llmRubricProvider: mockProvider,
      moderationProvider: mockProvider,
      suggestionsProvider: mockProvider,
      synthesizeProvider: mockProvider,
    });

    const messages = [
      { input: 'What is 2+2?', output: '4' },
      { input: 'What is the capital of France?', output: 'Paris' },
    ];

    await matchesConversationRelevance(messages, 0.5);

    const callArg = mockProvider.callApi.mock.calls[0][0];
    // Should contain the template structure
    expect(callArg).toContain(
      'generate a JSON object to indicate whether the LAST `assistant` message is relevant',
    );
    expect(callArg).toContain('"role": "user"');
    expect(callArg).toContain('"role": "assistant"');
  });
});

describe('handleConversationRelevance with reason generation', () => {
  it('should generate comprehensive reason when there are irrelevancies', async () => {
    // Mock provider for verdict generation
    let callCount = 0;
    const mockProvider = {
      id: () => 'mock-provider',
      callApi: jest.fn().mockImplementation(async (prompt: string) => {
        callCount++;
        // First few calls are verdicts, last one is reason generation
        if (prompt.includes('irrelevancies')) {
          // This is the reason generation call
          return {
            output: JSON.stringify({
              reason:
                'The score is 0.6 because 2 out of 5 responses were irrelevant to the conversation context.',
            }),
            tokenUsage: { total: 20, prompt: 10, completion: 10, cached: 0 },
          };
        } else {
          // Verdict calls - with 5 windows and windowSize 3, we evaluate positions 1-5
          // Make positions 3 and 5 irrelevant (2 out of 5)
          const isIrrelevant = callCount === 3 || callCount === 5;
          return {
            output: JSON.stringify({
              verdict: isIrrelevant ? 'no' : 'yes',
              ...(isIrrelevant && {
                reason: `Response ${callCount} was irrelevant`,
              }),
            }),
            tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
          };
        }
      }),
    };

    jest.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: mockProvider,
      gradingJsonProvider: mockProvider,
      gradingProvider: mockProvider,
      llmRubricProvider: mockProvider,
      moderationProvider: mockProvider,
      suggestionsProvider: mockProvider,
      synthesizeProvider: mockProvider,
    });

    const conversation = [
      { input: 'Question 1', output: 'Answer 1' },
      { input: 'Question 2', output: 'Answer 2' },
      { input: 'Question 3', output: 'Answer 3' },
      { input: 'Question 4', output: 'Answer 4' },
      { input: 'Question 5', output: 'Answer 5' },
    ];

    const params: AssertionParams = {
      baseType: 'conversation-relevance' as const,
      assertion: {
        type: 'conversation-relevance',
        threshold: 0.8,
        config: { windowSize: 3 },
      },
      context: {
        vars: {},
        test: {} as AtomicTestCase,
        prompt: 'test',
        logProbs: undefined,
        provider: mockProvider,
        providerResponse: { output: 'test' },
      },
      output: 'test',
      outputString: 'test',
      providerResponse: { output: 'test' },
      test: {
        vars: { _conversation: conversation },
        options: { provider: mockProvider },
      } as AtomicTestCase,
      inverse: false,
    };

    const result = await handleConversationRelevance(params);

    // Should have generated a comprehensive reason
    expect(result.reason).toContain(
      'The score is 0.6 because 2 out of 5 responses were irrelevant',
    );
    expect(result.tokensUsed).toBeDefined();
    expect(result.tokensUsed!.total).toBeGreaterThan(0);
  });

  it('should handle empty conversations gracefully', async () => {
    const mockProvider = {
      id: () => 'mock-provider',
      callApi: jest.fn().mockResolvedValue({
        output: JSON.stringify({ verdict: 'yes' }),
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
      }),
    };

    jest.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: mockProvider,
      gradingJsonProvider: mockProvider,
      gradingProvider: mockProvider,
      llmRubricProvider: mockProvider,
      moderationProvider: mockProvider,
      suggestionsProvider: mockProvider,
      synthesizeProvider: mockProvider,
    });

    const params: AssertionParams = {
      baseType: 'conversation-relevance' as const,
      assertion: {
        type: 'conversation-relevance',
        threshold: 0.8,
      },
      context: {
        vars: {},
        test: {} as AtomicTestCase,
        prompt: 'Hello',
        logProbs: undefined,
        provider: mockProvider,
        providerResponse: { output: 'Hi there!' },
      },
      output: 'Hi there!',
      outputString: 'Hi there!',
      providerResponse: { output: 'Hi there!' },
      prompt: 'Hello',
      test: {
        vars: {},
        options: { provider: mockProvider },
      } as AtomicTestCase,
      inverse: false,
    };

    const result = await handleConversationRelevance(params);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });
});
