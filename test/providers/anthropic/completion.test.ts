import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, disableCache, enableCache } from '../../../src/cache';
import { AnthropicCompletionProvider } from '../../../src/providers/anthropic/completion';
import { mockProcessEnv } from '../../util/utils';

vi.mock('proxy-agent', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    ProxyAgent: vi.fn().mockImplementation(function () {
      return {};
    }),
  };
});

const originalEnv = { ...process.env };
const TEST_API_KEY = 'test-api-key';

describe('AnthropicCompletionProvider', () => {
  beforeEach(() => {
    mockProcessEnv({ ...originalEnv, ANTHROPIC_API_KEY: TEST_API_KEY }, { clear: true });
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await clearCache();
    enableCache();
    mockProcessEnv(originalEnv, { clear: true });
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

    it('should preserve an explicit max_tokens_to_sample value of 0', async () => {
      mockProcessEnv({ ANTHROPIC_MAX_TOKENS: '1024' });

      const provider = new AnthropicCompletionProvider('claude-2.1', {
        config: { max_tokens_to_sample: 0 },
      });
      vi.spyOn(provider.anthropic.completions, 'create').mockResolvedValue({
        id: 'test-id',
        model: 'claude-2.1',
        stop_reason: 'stop_sequence',
        type: 'completion',
        completion: 'Test output',
      });

      await provider.callApi('Test prompt');

      expect(provider.anthropic.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens_to_sample: 0 }),
      );
    });
  });

  describe('requiresApiKey', () => {
    it('always requires an API key even when apiKeyRequired: false is set', () => {
      // Claude Code OAuth tokens only work on the Messages API; forwarding
      // them to the legacy completions endpoint would fail at request time,
      // so the completion subclass must not honor `apiKeyRequired: false`.
      // Surface the missing key at preflight instead. The cast bypasses the
      // `AnthropicCompletionOptions` type which deliberately does not expose
      // the field — this test documents the runtime guard for anyone who
      // bypasses the type system.
      mockProcessEnv({ ANTHROPIC_API_KEY: undefined });
      const provider = new AnthropicCompletionProvider('claude-2.1', {
        config: { apiKeyRequired: false } as never,
      });
      expect(provider.requiresApiKey()).toBe(true);
    });
  });
});
