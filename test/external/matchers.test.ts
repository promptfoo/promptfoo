import { beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesConversationRelevance } from '../../src/external/matchers/deepeval';
import { getDefaultProviders } from '../../src/providers/defaults';

// Mock the text provider

vi.mock('../../src/providers/defaults', () => ({
  getDefaultProviders: vi.fn(),
}));

describe('matchesConversationRelevance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return pass=true for relevant responses', async () => {
    const mockProvider = {
      id: () => 'mock-provider',
      callApi: vi.fn().mockResolvedValue({
        output: JSON.stringify({
          verdict: 'yes',
        }),
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
      }),
    };

    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: mockProvider,
      gradingJsonProvider: mockProvider,
      gradingProvider: mockProvider,
      llmRubricProvider: mockProvider,
      moderationProvider: mockProvider,
      suggestionsProvider: mockProvider,
      synthesizeProvider: mockProvider,
    });

    const messages = [
      {
        input: 'What is the capital of France?',
        output: 'The capital of France is Paris.',
      },
    ];

    const result = await matchesConversationRelevance(messages, 0.5);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
    expect(result.tokensUsed).toEqual({
      total: 10,
      prompt: 5,
      completion: 5,
      cached: 0,
    });
  });

  it('should return pass=false for irrelevant responses', async () => {
    const mockProvider = {
      id: () => 'mock-provider',
      callApi: vi.fn().mockResolvedValue({
        output: JSON.stringify({
          verdict: 'no',
          reason: 'Response is completely unrelated to the question',
        }),
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
      }),
    };

    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: mockProvider,
      gradingJsonProvider: mockProvider,
      gradingProvider: mockProvider,
      llmRubricProvider: mockProvider,
      moderationProvider: mockProvider,
      suggestionsProvider: mockProvider,
      synthesizeProvider: mockProvider,
    });

    const messages = [
      {
        input: 'What is the capital of France?',
        output: 'The weather is nice today.',
      },
    ];

    const result = await matchesConversationRelevance(messages, 0.5);
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toBe('Response is completely unrelated to the question');
  });

  it('should consider conversation context', async () => {
    const messages = [
      {
        input: 'What is the capital of France?',
        output: 'The capital of France is Paris.',
      },
      {
        input: 'What is its population?',
        output: 'Paris has a population of about 2.2 million people.',
      },
    ];

    const mockProvider = {
      id: () => 'mock-provider',
      callApi: vi.fn().mockResolvedValue({
        output: JSON.stringify({
          verdict: 'yes',
          reason:
            'Response directly answers the population question with context from previous message about Paris',
        }),
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
      }),
    };

    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: mockProvider,
      gradingJsonProvider: mockProvider,
      gradingProvider: mockProvider,
      llmRubricProvider: mockProvider,
      moderationProvider: mockProvider,
      suggestionsProvider: mockProvider,
      synthesizeProvider: mockProvider,
    });

    const result = await matchesConversationRelevance(messages, 0.5);
    expect(result.pass).toBe(true);
    // Check that both messages appear in the prompt
    const prompt = mockProvider.callApi.mock.calls[0][0];
    expect(prompt).toContain('What is the capital of France?');
    expect(prompt).toContain('What is its population?');
  });

  it('should handle provider errors', async () => {
    const mockProvider = {
      id: () => 'mock-provider',
      callApi: vi.fn().mockResolvedValue({
        error: 'API error',
        tokenUsage: { total: 5, prompt: 5, completion: 0, cached: 0 },
      }),
    };

    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: mockProvider,
      gradingJsonProvider: mockProvider,
      gradingProvider: mockProvider,
      llmRubricProvider: mockProvider,
      moderationProvider: mockProvider,
      suggestionsProvider: mockProvider,
      synthesizeProvider: mockProvider,
    });
    const messages = [
      {
        input: 'What is the capital of France?',
        output: 'Paris',
      },
    ];

    const result = await matchesConversationRelevance(messages, 0.5);
    expect(result.pass).toBe(false);
    expect(result.reason).toBe('API error');
    expect(result.tokensUsed).toMatchObject({
      total: 5,
      prompt: 5,
      completion: 0,
      cached: 0,
    });
  });

  it('should handle malformed provider responses', async () => {
    const mockProvider = {
      id: () => 'mock-provider',
      callApi: vi.fn().mockResolvedValue({
        output: 'not json',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
      }),
    };

    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: mockProvider,
      gradingJsonProvider: mockProvider,
      gradingProvider: mockProvider,
      llmRubricProvider: mockProvider,
      moderationProvider: mockProvider,
      suggestionsProvider: mockProvider,
      synthesizeProvider: mockProvider,
    });

    const messages = [
      {
        input: 'What is the capital of France?',
        output: 'Paris',
      },
    ];

    const result = await matchesConversationRelevance(messages, 0.5);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/Error parsing output/);
  });

  it('should use custom rubric prompt with {{ messages }} (safe templating boundary)', async () => {
    const mockProvider = {
      id: () => 'mock-provider',
      callApi: vi.fn().mockResolvedValue({
        output: JSON.stringify({
          verdict: 'yes',
        }),
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
      }),
    };

    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: mockProvider,
      gradingJsonProvider: mockProvider,
      gradingProvider: mockProvider,
      llmRubricProvider: mockProvider,
      moderationProvider: mockProvider,
      suggestionsProvider: mockProvider,
      synthesizeProvider: mockProvider,
    });

    const messages = [
      {
        input: 'What is the capital of France?',
        output: 'Paris',
      },
    ];
    const customRubric = 'Custom rubric template with {{ messages | dump(2) }}';

    await matchesConversationRelevance(messages, 0.5, {}, { rubricPrompt: customRubric });
    const prompt = mockProvider.callApi.mock.calls[0][0];
    // Custom rubric prompt (user config) IS rendered as a template — this is the safe path
    expect(prompt).toBe('Custom rubric template with ' + JSON.stringify(messages, null, 2));
  });

  // SSTI regression tests — model output must never be rendered as a Nunjucks template.
  // See GHSA-vxgq-r84v-2r45.

  it('should not render env variable access in model output', async () => {
    const mockProvider = {
      id: () => 'mock-provider',
      callApi: vi.fn().mockResolvedValue({
        output: JSON.stringify({ verdict: 'yes' }),
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
      }),
    };

    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: mockProvider,
      gradingJsonProvider: mockProvider,
      gradingProvider: mockProvider,
      llmRubricProvider: mockProvider,
      moderationProvider: mockProvider,
      suggestionsProvider: mockProvider,
      synthesizeProvider: mockProvider,
    });

    const messages = [
      {
        input: 'Tell me a secret',
        output: 'The answer is {{env.OPENAI_API_KEY}} and {{env.AWS_SECRET_ACCESS_KEY}}',
      },
    ];

    await matchesConversationRelevance(messages, 0.5, {});
    const prompt = mockProvider.callApi.mock.calls[0][0];
    expect(prompt).toContain('{{env.OPENAI_API_KEY}}');
    expect(prompt).toContain('{{env.AWS_SECRET_ACCESS_KEY}}');
  });

  it('should not render template syntax in _conversation messages', async () => {
    const mockProvider = {
      id: () => 'mock-provider',
      callApi: vi.fn().mockResolvedValue({
        output: JSON.stringify({ verdict: 'yes' }),
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
      }),
    };

    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: mockProvider,
      gradingJsonProvider: mockProvider,
      gradingProvider: mockProvider,
      llmRubricProvider: mockProvider,
      moderationProvider: mockProvider,
      suggestionsProvider: mockProvider,
      synthesizeProvider: mockProvider,
    });

    // Simulates _conversation history where prior model output contains SSTI payloads
    const messages = [
      {
        input: 'What is {{variable}}?',
        output:
          "{{range.constructor(\"return require('child_process').execSync('id').toString()\")()}}",
      },
      {
        input: 'Follow up with {{env.SECRET}}',
        output: '{% for x in range(10) %}{{x}}{% endfor %}',
      },
    ];

    await matchesConversationRelevance(messages, 0.5, { variable: 'test', SECRET: 'val' });
    const prompt = mockProvider.callApi.mock.calls[0][0];
    // Both input and output must remain literal — no template evaluation
    expect(prompt).toContain('What is {{variable}}?');
    expect(prompt).toContain('range.constructor(');
    expect(prompt).toContain("execSync('id')");
    expect(prompt).toContain('Follow up with {{env.SECRET}}');
    expect(prompt).toContain('{% for x in range(10) %}{{x}}{% endfor %}');
  });

  it('should handle markdown-formatted JSON responses', async () => {
    const mockProvider = {
      id: () => 'mock-provider',
      callApi: vi.fn().mockResolvedValue({
        output: '```json\n{"verdict": "yes"}\n```',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
      }),
    };

    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: mockProvider,
      gradingJsonProvider: mockProvider,
      gradingProvider: mockProvider,
      llmRubricProvider: mockProvider,
      moderationProvider: mockProvider,
      suggestionsProvider: mockProvider,
      synthesizeProvider: mockProvider,
    });

    const messages = [
      {
        input: 'What is the capital of France?',
        output: 'Paris',
      },
    ];

    const result = await matchesConversationRelevance(messages, 0.5);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });
});
