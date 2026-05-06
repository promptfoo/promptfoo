import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, disableCache, enableCache, getCache } from '../../../src/cache';
import logger from '../../../src/logger';
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
    vi.restoreAllMocks();
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

    it('should hash request params in cache keys', async () => {
      const provider = new AnthropicCompletionProvider('claude-1');
      const cache = await getCache();
      const getSpy = vi.spyOn(cache, 'get');
      const setSpy = vi.spyOn(cache, 'set');
      vi.spyOn(provider.anthropic.completions, 'create').mockResolvedValue({
        id: 'test-id',
        model: 'claude-1',
        stop_reason: 'stop_sequence',
        type: 'completion',
        completion: 'Test output',
      });

      await provider.callApi('Sensitive prompt sk-ant-secret');

      const cacheKey = getSpy.mock.calls[0]?.[0] as string;
      expect(cacheKey).toMatch(
        /^anthropic:completion:claude-1:[a-f0-9]{64}:[a-f0-9]{64}:[a-f0-9]{64}$/,
      );
      expect(cacheKey).not.toContain('Sensitive prompt');
      expect(cacheKey).not.toContain('sk-ant-secret');
      expect(setSpy).toHaveBeenCalledWith(cacheKey, JSON.stringify('Test output'));
    });

    it('should isolate hashed cache keys by resolved API key', async () => {
      const providerA = new AnthropicCompletionProvider('claude-1', {
        config: { apiKey: 'sk-ant-tenant-a' },
      });
      const providerB = new AnthropicCompletionProvider('claude-1', {
        config: { apiKey: 'sk-ant-tenant-b' },
      });
      const cache = await getCache();
      const getSpy = vi.spyOn(cache, 'get').mockResolvedValue(undefined);
      vi.spyOn(cache, 'set').mockResolvedValue(undefined);
      vi.spyOn(providerA.anthropic.completions, 'create').mockResolvedValue({
        id: 'test-id-a',
        model: 'claude-1',
        stop_reason: 'stop_sequence',
        type: 'completion',
        completion: 'Tenant A output',
      });
      vi.spyOn(providerB.anthropic.completions, 'create').mockResolvedValue({
        id: 'test-id-b',
        model: 'claude-1',
        stop_reason: 'stop_sequence',
        type: 'completion',
        completion: 'Tenant B output',
      });

      await providerA.callApi('Shared sensitive prompt');
      await providerB.callApi('Shared sensitive prompt');

      const [cacheKeyA, cacheKeyB] = getSpy.mock.calls.map(([key]) => key as string);
      expect(cacheKeyA).toMatch(
        /^anthropic:completion:claude-1:[a-f0-9]{64}:[a-f0-9]{64}:[a-f0-9]{64}$/,
      );
      expect(cacheKeyB).toMatch(
        /^anthropic:completion:claude-1:[a-f0-9]{64}:[a-f0-9]{64}:[a-f0-9]{64}$/,
      );
      expect(cacheKeyA).not.toBe(cacheKeyB);
      for (const cacheKey of [cacheKeyA, cacheKeyB]) {
        expect(cacheKey).not.toContain('Shared sensitive prompt');
        expect(cacheKey).not.toContain('sk-ant-tenant-a');
        expect(cacheKey).not.toContain('sk-ant-tenant-b');
      }
    });

    it('should keep auth cache namespace stable across module reloads', async () => {
      async function getNamespaceFromFreshModule() {
        vi.resetModules();
        const { getAnthropicAuthCacheNamespace } = await import(
          '../../../src/providers/anthropic/generic'
        );
        return getAnthropicAuthCacheNamespace('sk-ant-reload-secret');
      }

      const firstNamespace = await getNamespaceFromFreshModule();
      const secondNamespace = await getNamespaceFromFreshModule();

      expect(firstNamespace).toBe(secondNamespace);
      expect(firstNamespace).toMatch(/^[a-f0-9]{64}$/);
      expect(firstNamespace).not.toContain('sk-ant-reload-secret');
    });

    it('should avoid logging prompts and generated outputs in debug metadata', async () => {
      const provider = new AnthropicCompletionProvider('claude-1');
      const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
      vi.spyOn(provider.anthropic.completions, 'create').mockResolvedValue({
        id: 'test-id',
        model: 'claude-1',
        stop_reason: 'stop_sequence',
        type: 'completion',
        completion: 'Generated secret output',
      });

      await provider.callApi('Sensitive prompt with sk-ant-secret');

      const debugLogs = JSON.stringify(debugSpy.mock.calls);
      expect(debugLogs).not.toContain('Sensitive prompt');
      expect(debugLogs).not.toContain('sk-ant-secret');
      expect(debugLogs).not.toContain('Generated secret output');
      debugSpy.mockRestore();
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
