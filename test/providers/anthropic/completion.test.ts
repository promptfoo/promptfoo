import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, disableCache, enableCache } from '../../../src/cache';
import { AnthropicCompletionProvider } from '../../../src/providers/anthropic/completion';

vi.mock('proxy-agent', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    ProxyAgent: vi.fn().mockImplementation(function () {
      return {};
    }),
  };
});

const originalEnv = process.env;
const TEST_API_KEY = 'test-api-key';

describe('AnthropicCompletionProvider', () => {
  beforeEach(() => {
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: TEST_API_KEY };
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await clearCache();
    enableCache();
    process.env = originalEnv;
  });

  describe('callApi', () => {
    it('should return output for default behavior', async () => {
      const provider = new AnthropicCompletionProvider('claude-1');
      vi.spyOn(provider.anthropic.completions, 'create').mockResolvedValue({
        id: 'test-id',
        model: 'claude-1',
        stop_reason: 'stop_sequence',
        type: 'completion',
        completion: 'Test output',
      });
      const result = await provider.callApi('Test prompt');

      expect(provider.anthropic.completions.create).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        output: 'Test output',
        tokenUsage: {},
      });
    });

    it('should return cached output with caching enabled', async () => {
      const provider = new AnthropicCompletionProvider('claude-1');
      vi.spyOn(provider.anthropic.completions, 'create').mockResolvedValue({
        id: 'test-id',
        model: 'claude-1',
        stop_reason: 'stop_sequence',
        type: 'completion',
        completion: 'Test output',
      });
      const result = await provider.callApi('Test prompt');

      expect(provider.anthropic.completions.create).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        output: 'Test output',
        tokenUsage: {},
      });

      vi.mocked(provider.anthropic.completions.create).mockClear();
      const cachedResult = await provider.callApi('Test prompt');

      expect(provider.anthropic.completions.create).toHaveBeenCalledTimes(0);
      expect(cachedResult.cached).toBe(true);
      expect(cachedResult).toMatchObject({
        output: 'Test output',
        tokenUsage: {},
      });
    });

    it('should return fresh output with caching disabled', async () => {
      const provider = new AnthropicCompletionProvider('claude-1');
      vi.spyOn(provider.anthropic.completions, 'create').mockResolvedValue({
        id: 'test-id',
        model: 'claude-1',
        stop_reason: 'stop_sequence',
        type: 'completion',
        completion: 'Test output',
      });
      const result = await provider.callApi('Test prompt');

      expect(provider.anthropic.completions.create).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        output: 'Test output',
        tokenUsage: {},
      });

      vi.mocked(provider.anthropic.completions.create).mockClear();

      disableCache();

      const freshResult = await provider.callApi('Test prompt');

      expect(provider.anthropic.completions.create).toHaveBeenCalledTimes(1);
      expect(freshResult).toMatchObject({
        output: 'Test output',
        tokenUsage: {},
      });
    });

    it('should handle API call error', async () => {
      const provider = new AnthropicCompletionProvider('claude-1');
      vi.spyOn(provider.anthropic.completions, 'create').mockRejectedValue(
        new Error('API call failed'),
      );

      const result = await provider.callApi('Test prompt');
      expect(result).toMatchObject({
        error: 'API call error: Error: API call failed',
      });
    });
  });
});
