import { jest } from '@jest/globals';
import type { CallApiContextParams } from '../../src/types';

// Mock environment variables
jest.mock('../../src/envars', () => ({
  getEnvString: jest.fn((key: string) => {
    const envMap: Record<string, string> = {
      OPENAI_API_KEY: 'test-openai-key',
      ANTHROPIC_API_KEY: 'test-anthropic-key',
      GEMINI_API_KEY: 'test-gemini-key',
    };
    return envMap[key];
  }),
}));

// Mock logger
jest.mock('../../src/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

// Import after mocks are set up
import { LLMProvider, createLLMProvider } from '../../src/providers/llm';

describe('LLMProvider', () => {
  let provider: LLMProvider;

  describe('constructor', () => {
    it('should create an instance with basic configuration', () => {
      provider = new LLMProvider('gpt-4o-mini');
      expect(provider.id()).toBe('llm:gpt-4o-mini');
      expect(provider.toString()).toBe('[LLM Provider gpt-4o-mini]');
    });

    it('should use custom id if provided', () => {
      provider = new LLMProvider('gpt-4o-mini', {
        id: 'custom-llm-provider',
      });
      expect(provider.id()).toBe('custom-llm-provider');
    });

    it('should store configuration correctly', () => {
      provider = new LLMProvider('gpt-4o-mini', {
        config: {
          temperature: 0.7,
          max_tokens: 100,
          system_prompt: 'You are helpful',
        },
      });
      expect(provider.config.temperature).toBe(0.7);
      expect(provider.config.max_tokens).toBe(100);
      expect(provider.config.system_prompt).toBe('You are helpful');
    });
  });

  describe('Model variations', () => {
    it('should support OpenAI models', () => {
      provider = new LLMProvider('gpt-4o-mini');
      expect(provider.id()).toBe('llm:gpt-4o-mini');
    });

    it('should support Anthropic models', () => {
      provider = new LLMProvider('claude-3-haiku');
      expect(provider.id()).toBe('llm:claude-3-haiku');
    });

    it('should support Google models', () => {
      provider = new LLMProvider('gemini-2.0-flash');
      expect(provider.id()).toBe('llm:gemini-2.0-flash');
    });

    it('should support Ollama models with colons', () => {
      provider = new LLMProvider('llama3.2:latest');
      expect(provider.id()).toBe('llm:llama3.2:latest');
    });
  });

  describe('createLLMProvider factory', () => {
    it('should create provider from path', () => {
      const provider = createLLMProvider('llm:gpt-4o-mini');
      expect(provider.id()).toBe('llm:gpt-4o-mini');
    });

    it('should pass options to provider', () => {
      const options = {
        id: 'custom-id',
        config: {
          temperature: 0.5,
        },
      };

      const provider = createLLMProvider('llm:gpt-4o-mini', options);
      expect(provider.id()).toBe('custom-id');
    });

    it('should handle model names with multiple colons', () => {
      const provider = createLLMProvider('llm:ollama:llama3.2:latest');
      expect(provider.id()).toBe('llm:ollama:llama3.2:latest');
    });
  });

  // Integration tests would go here but require more complex mocking
  // of child_process and promisify. The provider has been tested
  // manually with real API calls.
});
