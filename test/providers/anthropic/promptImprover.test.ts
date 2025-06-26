import { AnthropicPromptImproverProvider } from '../../../src/providers/anthropic/promptImprover';
import type { ApiProvider } from '../../../src/types';

jest.mock('@anthropic-ai/sdk');

describe('AnthropicPromptImproverProvider', () => {
  let provider: AnthropicPromptImproverProvider;
  let mockOriginalProvider: ApiProvider;

  beforeEach(() => {
    mockOriginalProvider = {
      id: () => 'mock-provider',
      callApi: jest.fn().mockResolvedValue({
        output: 'Mock output',
        tokenUsage: { numRequests: 1 },
      }),
    };

    provider = new AnthropicPromptImproverProvider({
      config: {
        apiKey: 'test-key',
        targetVariable: 'requirements',
        maxTurns: 5,
        numCandidates: 2,
        stallIterations: 3,
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const defaultProvider = new AnthropicPromptImproverProvider({});
      expect(defaultProvider.id()).toBe('promptfoo:anthropic:prompt-improver');
    });

    it('should initialize with custom config', () => {
      expect(provider.id()).toBe('promptfoo:anthropic:prompt-improver');
      expect(provider.toString()).toBe('[Anthropic Prompt Improver Provider]');
    });
  });

  describe('callApi', () => {
    it('should throw error when originalProvider is not set', async () => {
      const result = await provider.callApi('test prompt', {
        vars: { requirements: 'test' },
        test: { assert: [] },
      });

      expect(result.error).toContain('Expected originalProvider to be set');
    });

    it('should throw error when vars are not set', async () => {
      const result = await provider.callApi('test prompt', {
        originalProvider: mockOriginalProvider,
        test: { assert: [] },
      });

      expect(result.error).toContain('Expected vars to be set');
    });

    it('should throw error when test is not set', async () => {
      const result = await provider.callApi('test prompt', {
        originalProvider: mockOriginalProvider,
        vars: { requirements: 'test' },
      });

      expect(result.error).toContain('Expected test to be set');
    });

    it('should throw error when target variable is missing', async () => {
      const result = await provider.callApi('test prompt', {
        originalProvider: mockOriginalProvider,
        vars: { other: 'value' },
        test: { assert: [] },
      });

      expect(result.error).toContain('Target variable "requirements" not found');
    });

    it('should return early if all assertions already pass', async () => {
      const result = await provider.callApi('test prompt', {
        originalProvider: mockOriginalProvider,
        vars: { requirements: 'test requirements' },
        test: { assert: [] }, // No assertions = perfect score
      });

      expect(result.output).toBe('Mock output');
      expect(result.metadata?.improved).toBe(false);
      expect(result.metadata?.iterations).toBe(0);
    });

    it('should handle API errors gracefully', async () => {
      const failingProvider: ApiProvider = {
        id: () => 'failing-provider',
        callApi: jest.fn().mockRejectedValue(new Error('API Error')),
      };

      const result = await provider.callApi('test prompt', {
        originalProvider: failingProvider,
        vars: { requirements: 'test requirements' },
        test: {
          assert: [
            {
              type: 'icontains',
              value: 'expected text',
            },
          ],
        },
      });

      expect(result.error).toContain('Failed to evaluate initial prompt');
    });
  });

  describe('id and toString', () => {
    it('should return correct id', () => {
      expect(provider.id()).toBe('promptfoo:anthropic:prompt-improver');
    });

    it('should return correct string representation', () => {
      expect(provider.toString()).toBe('[Anthropic Prompt Improver Provider]');
    });
  });
}); 