import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadApiProvider } from '../../src/providers/index';
import { hasWebSearchCapability, loadWebSearchProvider } from '../../src/providers/webSearchUtils';

import type { ApiProvider } from '../../src/types/index';

vi.mock('../../src/providers', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    loadApiProvider: vi.fn(),
  };
});

vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('webSearchUtils', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('hasWebSearchCapability', () => {
    it('should return false for null provider', () => {
      expect(hasWebSearchCapability(null)).toBe(false);
    });

    it('should return false for undefined provider', () => {
      expect(hasWebSearchCapability(undefined)).toBe(false);
    });

    it('should return true for Perplexity provider', () => {
      const provider: Partial<ApiProvider> = {
        id: () => 'perplexity:sonar-pro',
      };
      expect(hasWebSearchCapability(provider as ApiProvider)).toBe(true);
    });

    it('should return true for Perplexity provider with different model', () => {
      const provider: Partial<ApiProvider> = {
        id: () => 'perplexity:sonar',
      };
      expect(hasWebSearchCapability(provider as ApiProvider)).toBe(true);
    });

    it('should return true for Google provider with googleSearch tool', () => {
      const provider: Partial<ApiProvider> = {
        id: () => 'google:gemini-3-pro-preview',
        config: {
          tools: [{ googleSearch: {} }],
        },
      };
      expect(hasWebSearchCapability(provider as ApiProvider)).toBe(true);
    });

    it('should return false for Google provider without googleSearch tool', () => {
      const provider: Partial<ApiProvider> = {
        id: () => 'google:gemini-3-pro-preview',
        config: {
          tools: [{ codeExecution: {} }],
        },
      };
      expect(hasWebSearchCapability(provider as ApiProvider)).toBe(false);
    });

    it('should return true for Vertex provider with googleSearch tool', () => {
      const provider: Partial<ApiProvider> = {
        id: () => 'vertex:gemini-3-pro-preview',
        config: {
          tools: [{ googleSearch: {} }],
        },
      };
      expect(hasWebSearchCapability(provider as ApiProvider)).toBe(true);
    });

    it('should return true for xAI provider with search_parameters mode on', () => {
      const provider: Partial<ApiProvider> = {
        id: () => 'xai:grok-4-1-fast-reasoning',
        config: {
          search_parameters: { mode: 'on' },
        },
      };
      expect(hasWebSearchCapability(provider as ApiProvider)).toBe(true);
    });

    it('should return false for xAI provider without search_parameters', () => {
      const provider: Partial<ApiProvider> = {
        id: () => 'xai:grok-4-1-fast-reasoning',
        config: {},
      };
      expect(hasWebSearchCapability(provider as ApiProvider)).toBe(false);
    });

    it('should return false for xAI provider with search_parameters mode off', () => {
      const provider: Partial<ApiProvider> = {
        id: () => 'xai:grok-4-1-fast-reasoning',
        config: {
          search_parameters: { mode: 'off' },
        },
      };
      expect(hasWebSearchCapability(provider as ApiProvider)).toBe(false);
    });

    it('should return true for OpenAI responses provider with web_search_preview tool', () => {
      const provider: Partial<ApiProvider> = {
        id: () => 'openai:responses:gpt-5.1',
        config: {
          tools: [{ type: 'web_search_preview' }],
        },
      };
      expect(hasWebSearchCapability(provider as ApiProvider)).toBe(true);
    });

    it('should return false for OpenAI responses provider without web_search_preview', () => {
      const provider: Partial<ApiProvider> = {
        id: () => 'openai:responses:gpt-5.1',
        config: {
          tools: [{ type: 'code_interpreter' }],
        },
      };
      expect(hasWebSearchCapability(provider as ApiProvider)).toBe(false);
    });

    it('should return false for OpenAI chat provider (not responses)', () => {
      const provider: Partial<ApiProvider> = {
        id: () => 'openai:chat:gpt-4',
        config: {
          tools: [{ type: 'web_search_preview' }],
        },
      };
      expect(hasWebSearchCapability(provider as ApiProvider)).toBe(false);
    });

    it('should return true for Anthropic provider with web_search tool', () => {
      const provider: Partial<ApiProvider> = {
        id: () => 'anthropic:messages:claude-opus-4-6-20260205',
        config: {
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
        },
      };
      expect(hasWebSearchCapability(provider as ApiProvider)).toBe(true);
    });

    it('should return false for Anthropic provider without web_search tool', () => {
      const provider: Partial<ApiProvider> = {
        id: () => 'anthropic:messages:claude-opus-4-6-20260205',
        config: {
          tools: [{ type: 'computer_use' }],
        },
      };
      expect(hasWebSearchCapability(provider as ApiProvider)).toBe(false);
    });

    it('should return false for Anthropic provider without config', () => {
      const provider: Partial<ApiProvider> = {
        id: () => 'anthropic:messages:claude-opus-4-6-20260205',
      };
      expect(hasWebSearchCapability(provider as ApiProvider)).toBe(false);
    });

    it('should return false for provider with no tools configured', () => {
      const provider: Partial<ApiProvider> = {
        id: () => 'openai:responses:gpt-5.1',
        config: {},
      };
      expect(hasWebSearchCapability(provider as ApiProvider)).toBe(false);
    });

    it('should return false for unknown provider', () => {
      const provider: Partial<ApiProvider> = {
        id: () => 'custom:my-model',
        config: {},
      };
      expect(hasWebSearchCapability(provider as ApiProvider)).toBe(false);
    });
  });

  describe('loadWebSearchProvider', () => {
    const mockLoadApiProvider = vi.mocked(loadApiProvider);

    it('should return null when no providers can be loaded', async () => {
      mockLoadApiProvider.mockRejectedValue(new Error('API key not found'));

      const result = await loadWebSearchProvider();

      expect(result).toBeNull();
    });

    it('should load Anthropic provider first when preferAnthropic is true', async () => {
      const mockProvider: Partial<ApiProvider> = {
        id: () => 'anthropic:messages:claude-opus-4-6-20260205',
      };
      mockLoadApiProvider.mockResolvedValueOnce(mockProvider as ApiProvider);

      const result = await loadWebSearchProvider(true);

      expect(result).toBe(mockProvider);
      expect(mockLoadApiProvider).toHaveBeenCalledWith(
        'anthropic:messages:claude-opus-4-6-20260205',
        expect.objectContaining({
          options: expect.objectContaining({
            config: expect.objectContaining({
              tools: expect.arrayContaining([
                expect.objectContaining({ type: 'web_search_20250305' }),
              ]),
            }),
          }),
        }),
      );
    });

    it('should load OpenAI provider first when preferAnthropic is false', async () => {
      const mockProvider: Partial<ApiProvider> = {
        id: () => 'openai:responses:gpt-5.1',
      };
      mockLoadApiProvider.mockResolvedValueOnce(mockProvider as ApiProvider);

      const result = await loadWebSearchProvider(false);

      expect(result).toBe(mockProvider);
      expect(mockLoadApiProvider).toHaveBeenCalledWith(
        'openai:responses:gpt-5.1',
        expect.objectContaining({
          options: expect.objectContaining({
            config: expect.objectContaining({
              tools: expect.arrayContaining([
                expect.objectContaining({ type: 'web_search_preview' }),
              ]),
            }),
          }),
        }),
      );
    });

    it('should fallback to next provider when first fails', async () => {
      const mockProvider: Partial<ApiProvider> = {
        id: () => 'openai:responses:gpt-5.1',
      };
      mockLoadApiProvider
        .mockRejectedValueOnce(new Error('Anthropic API key not found'))
        .mockResolvedValueOnce(mockProvider as ApiProvider);

      const result = await loadWebSearchProvider(true);

      expect(result).toBe(mockProvider);
      expect(mockLoadApiProvider).toHaveBeenCalledTimes(2);
    });

    it('should try all providers in order until one succeeds', async () => {
      const mockProvider: Partial<ApiProvider> = {
        id: () => 'perplexity:sonar-pro',
      };
      mockLoadApiProvider
        .mockRejectedValueOnce(new Error('Anthropic failed'))
        .mockRejectedValueOnce(new Error('OpenAI failed'))
        .mockResolvedValueOnce(mockProvider as ApiProvider);

      const result = await loadWebSearchProvider(true);

      expect(result).toBe(mockProvider);
      expect(mockLoadApiProvider).toHaveBeenCalledTimes(3);
    });

    it('should load Perplexity without additional config', async () => {
      const mockProvider: Partial<ApiProvider> = {
        id: () => 'perplexity:sonar-pro',
      };
      mockLoadApiProvider
        .mockRejectedValueOnce(new Error('Anthropic failed'))
        .mockRejectedValueOnce(new Error('OpenAI failed'))
        .mockResolvedValueOnce(mockProvider as ApiProvider);

      await loadWebSearchProvider(true);

      expect(mockLoadApiProvider).toHaveBeenCalledWith('perplexity:sonar-pro');
    });

    it('should configure Google provider with googleSearch tool', async () => {
      const mockProvider: Partial<ApiProvider> = {
        id: () => 'google:gemini-3-pro-preview',
      };
      mockLoadApiProvider
        .mockRejectedValueOnce(new Error('Anthropic failed'))
        .mockRejectedValueOnce(new Error('OpenAI failed'))
        .mockRejectedValueOnce(new Error('Perplexity failed'))
        .mockResolvedValueOnce(mockProvider as ApiProvider);

      await loadWebSearchProvider(true);

      expect(mockLoadApiProvider).toHaveBeenCalledWith(
        'google:gemini-3-pro-preview',
        expect.objectContaining({
          options: expect.objectContaining({
            config: expect.objectContaining({
              tools: expect.arrayContaining([expect.objectContaining({ googleSearch: {} })]),
            }),
          }),
        }),
      );
    });

    it('should configure xAI provider with search_parameters', async () => {
      const mockProvider: Partial<ApiProvider> = {
        id: () => 'xai:grok-4-1-fast-reasoning',
      };
      mockLoadApiProvider
        .mockRejectedValueOnce(new Error('Anthropic failed'))
        .mockRejectedValueOnce(new Error('OpenAI failed'))
        .mockRejectedValueOnce(new Error('Perplexity failed'))
        .mockRejectedValueOnce(new Error('Google failed'))
        .mockRejectedValueOnce(new Error('Vertex failed'))
        .mockResolvedValueOnce(mockProvider as ApiProvider);

      await loadWebSearchProvider(true);

      expect(mockLoadApiProvider).toHaveBeenCalledWith(
        'xai:grok-4-1-fast-reasoning',
        expect.objectContaining({
          options: expect.objectContaining({
            config: expect.objectContaining({
              search_parameters: { mode: 'on' },
            }),
          }),
        }),
      );
    });

    it('should use default value (false) for preferAnthropic parameter', async () => {
      const mockProvider: Partial<ApiProvider> = {
        id: () => 'openai:responses:gpt-5.1',
      };
      mockLoadApiProvider.mockResolvedValueOnce(mockProvider as ApiProvider);

      await loadWebSearchProvider();

      // Should try OpenAI first (since preferAnthropic defaults to false)
      expect(mockLoadApiProvider).toHaveBeenCalledWith(
        'openai:responses:gpt-5.1',
        expect.anything(),
      );
    });
  });
});
