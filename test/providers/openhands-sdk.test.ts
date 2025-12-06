import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import fs from 'fs';

import { clearCache, disableCache, enableCache } from '../../src/cache';
import { OpenHandsSDKProvider } from '../../src/providers/openhands-sdk';

import type { CallApiContextParams } from '../../src/types/index';

// Mock child_process spawn
vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => ({
    stdout: {
      on: vi.fn(),
    },
    stderr: {
      on: vi.fn(),
    },
    on: vi.fn(),
    kill: vi.fn(),
    killed: false,
  })),
}));

// Mock fetch with proxy
const mockFetchWithProxy = vi.fn();
vi.mock('../../src/util/fetch/index', () => ({
  fetchWithProxy: (...args: unknown[]) => mockFetchWithProxy(...args),
}));

// Helper to create mock conversation response
const createMockConversationResponse = (conversationId = 'conv-123') => ({
  conversation_id: conversationId,
  id: conversationId,
});

// Helper to create mock conversation state (matches actual OpenHands API)
const createMockConversationState = (
  executionStatus:
    | 'idle'
    | 'running'
    | 'paused'
    | 'waiting_for_confirmation'
    | 'finished'
    | 'error'
    | 'stuck' = 'finished',
) => ({
  id: 'conv-123',
  execution_status: executionStatus,
});

// Helper to create mock events response (matches actual OpenHands API)
const createMockEventsResponse = (
  messages: Array<{ role: string; content: string }> = [
    { role: 'user', content: 'test prompt' },
    { role: 'assistant', content: 'Test response from OpenHands' },
  ],
) => ({
  results: messages.map((m, i) => ({
    id: `event-${i}`,
    kind: 'MessageEvent',
    source: m.role === 'assistant' ? 'agent' : 'user',
    llm_message: {
      role: m.role,
      content: [{ type: 'text', text: m.content }],
    },
  })),
});

describe('OpenHandsSDKProvider', () => {
  let tempDirSpy: MockInstance;
  let statSyncSpy: MockInstance;
  let rmSyncSpy: MockInstance;
  let _readdirSyncSpy: MockInstance;

  beforeEach(async () => {
    vi.clearAllMocks();

    // File system mocks
    tempDirSpy = vi.spyOn(fs, 'mkdtempSync').mockReturnValue('/tmp/test-temp-dir');
    statSyncSpy = vi.spyOn(fs, 'statSync').mockReturnValue({
      isDirectory: () => true,
      mtimeMs: 1234567890,
    } as fs.Stats);
    rmSyncSpy = vi.spyOn(fs, 'rmSync').mockImplementation(() => {});
    _readdirSyncSpy = vi.spyOn(fs, 'readdirSync').mockReturnValue([]);

    // Default fetch mock - matches actual OpenHands API
    mockFetchWithProxy.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.includes('/health')) {
        // Health check
        return { ok: true };
      }
      if (url.endsWith('/api/conversations') && options?.method === 'POST') {
        // Create conversation with initial message
        return {
          ok: true,
          json: async () => createMockConversationResponse(),
        };
      }
      if (url.includes('/run') && options?.method === 'POST') {
        // Run conversation
        return { ok: true };
      }
      if (url.includes('/messages') && options?.method === 'POST') {
        // Send message (for existing sessions)
        return { ok: true };
      }
      if (url.includes('/events/search')) {
        // Get events
        return {
          ok: true,
          json: async () => createMockEventsResponse(),
        };
      }
      if (url.match(/\/api\/conversations\/[^/]+$/) && !options?.method) {
        // Get conversation state
        return {
          ok: true,
          json: async () => createMockConversationState('finished'),
        };
      }
      if (url.match(/\/api\/conversations\/[^/]+$/) && options?.method === 'DELETE') {
        // Delete conversation
        return { ok: true };
      }
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Not Found',
      };
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await clearCache();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const provider = new OpenHandsSDKProvider();

      expect(provider.config).toEqual({});
      expect(provider.id()).toBe('openhands:sdk');
    });

    it('should initialize with custom config', () => {
      const config = {
        apiKey: 'test-key',
        model: 'claude-sonnet-4-5-20250929',
        provider_id: 'anthropic',
      };

      const provider = new OpenHandsSDKProvider({ config });

      expect(provider.config).toEqual(config);
      expect(provider.getApiKey()).toBe('test-key');
    });

    it('should use custom id when provided', () => {
      const provider = new OpenHandsSDKProvider({ id: 'custom-provider-id' });

      expect(provider.id()).toBe('custom-provider-id');
    });
  });

  describe('getApiKey', () => {
    it('should return apiKey from config', () => {
      const provider = new OpenHandsSDKProvider({
        config: { apiKey: 'config-key' },
      });

      expect(provider.getApiKey()).toBe('config-key');
    });

    it('should return Anthropic key when provider_id is anthropic', () => {
      const provider = new OpenHandsSDKProvider({
        config: { provider_id: 'anthropic' },
        env: { ANTHROPIC_API_KEY: 'anthropic-env-key' },
      });

      expect(provider.getApiKey()).toBe('anthropic-env-key');
    });

    it('should return OpenAI key when provider_id is openai', () => {
      const provider = new OpenHandsSDKProvider({
        config: { provider_id: 'openai' },
        env: { OPENAI_API_KEY: 'openai-env-key' },
      });

      expect(provider.getApiKey()).toBe('openai-env-key');
    });

    it('should return Google key when provider_id is google', () => {
      const provider = new OpenHandsSDKProvider({
        config: { provider_id: 'google' },
        env: { GOOGLE_API_KEY: 'google-env-key' },
      });

      expect(provider.getApiKey()).toBe('google-env-key');
    });

    it('should fall back to common env vars when no provider_id', () => {
      const provider = new OpenHandsSDKProvider({
        env: { ANTHROPIC_API_KEY: 'fallback-key' },
      });

      expect(provider.getApiKey()).toBe('fallback-key');
    });
  });

  describe('toString', () => {
    it('should return provider string', () => {
      const provider = new OpenHandsSDKProvider();
      expect(provider.toString()).toBe('[OpenHands SDK Provider]');
    });
  });

  describe('callApi', () => {
    beforeEach(() => {
      disableCache();
    });

    afterEach(async () => {
      enableCache();
    });

    it('should call API and return response', async () => {
      const provider = new OpenHandsSDKProvider({
        config: {
          baseUrl: 'http://localhost:3000', // Use existing server
          provider_id: 'anthropic',
          model: 'claude-sonnet-4-5-20250929',
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.output).toBe('Test response from OpenHands');
      expect(result.sessionId).toBe('conv-123');
    });

    it('should use temp directory when no working_dir specified', async () => {
      const provider = new OpenHandsSDKProvider({
        config: {
          baseUrl: 'http://localhost:3000',
        },
      });

      await provider.callApi('Test prompt');

      expect(tempDirSpy).toHaveBeenCalledWith(expect.stringContaining('promptfoo-openhands-sdk-'));
      expect(rmSyncSpy).toHaveBeenCalledWith('/tmp/test-temp-dir', {
        recursive: true,
        force: true,
      });
    });

    it('should validate working directory when specified', async () => {
      statSyncSpy.mockReturnValue({
        isDirectory: () => true,
        mtimeMs: 1234567890,
      } as fs.Stats);

      const provider = new OpenHandsSDKProvider({
        config: {
          baseUrl: 'http://localhost:3000',
          working_dir: '/test/working/dir',
        },
      });

      await provider.callApi('Test prompt');

      expect(statSyncSpy).toHaveBeenCalledWith('/test/working/dir');
      expect(tempDirSpy).not.toHaveBeenCalled();
      expect(rmSyncSpy).not.toHaveBeenCalled();
    });

    it('should throw error when working directory does not exist', async () => {
      statSyncSpy.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const provider = new OpenHandsSDKProvider({
        config: {
          baseUrl: 'http://localhost:3000',
          working_dir: '/nonexistent/dir',
        },
      });

      await expect(provider.callApi('Test prompt')).rejects.toThrow(
        /Working directory .* does not exist/,
      );
    });

    it('should throw error when working directory is not a directory', async () => {
      statSyncSpy.mockReturnValue({
        isDirectory: () => false,
        mtimeMs: 1234567890,
      } as fs.Stats);

      const provider = new OpenHandsSDKProvider({
        config: {
          baseUrl: 'http://localhost:3000',
          working_dir: '/path/to/file',
        },
      });

      await expect(provider.callApi('Test prompt')).rejects.toThrow(
        /Working directory .* is not a directory/,
      );
    });

    it('should return error when abort signal is triggered before start', async () => {
      const provider = new OpenHandsSDKProvider({
        config: {
          baseUrl: 'http://localhost:3000',
        },
      });

      const abortController = new AbortController();
      abortController.abort();

      const result = await provider.callApi('Test prompt', undefined, {
        abortSignal: abortController.signal,
      });

      expect(result.error).toBe('OpenHands SDK call aborted before it started');
    });

    it('should handle API errors gracefully', async () => {
      mockFetchWithProxy.mockImplementation(async (url: string, options?: RequestInit) => {
        if (url.endsWith('/api/conversations') && options?.method === 'POST') {
          return {
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            text: async () => 'Internal Server Error',
          };
        }
        return { ok: true };
      });

      const provider = new OpenHandsSDKProvider({
        config: {
          baseUrl: 'http://localhost:3000',
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Error calling OpenHands SDK');
    });

    it('should merge config from context', async () => {
      const provider = new OpenHandsSDKProvider({
        config: {
          baseUrl: 'http://localhost:3000',
          model: 'default-model',
        },
      });

      const context: CallApiContextParams = {
        prompt: {
          raw: 'Test prompt',
          label: 'test',
          config: {
            model: 'overridden-model',
          },
        },
        vars: {},
      };

      await provider.callApi('Test prompt', context);

      // The provider should use the merged config internally
      // We verify this by checking the provider was called successfully
      expect(mockFetchWithProxy).toHaveBeenCalled();
    });
  });

  describe('buildToolsConfig', () => {
    beforeEach(() => {
      disableCache();
    });

    afterEach(async () => {
      enableCache();
    });

    it('should disable all tools when no working_dir', async () => {
      const provider = new OpenHandsSDKProvider({
        config: {
          baseUrl: 'http://localhost:3000',
        },
      });

      // Access the private method through callApi behavior
      // Without working_dir, tools should be disabled
      await provider.callApi('Test prompt');

      // Verify the provider ran (tools config is internal)
      expect(mockFetchWithProxy).toHaveBeenCalled();
    });

    it('should enable read-only tools with working_dir', async () => {
      statSyncSpy.mockReturnValue({
        isDirectory: () => true,
        mtimeMs: 1234567890,
      } as fs.Stats);

      const provider = new OpenHandsSDKProvider({
        config: {
          baseUrl: 'http://localhost:3000',
          working_dir: '/test/working/dir',
        },
      });

      await provider.callApi('Test prompt');

      // Verify the provider ran with working_dir
      expect(statSyncSpy).toHaveBeenCalledWith('/test/working/dir');
    });

    it('should use explicit tools config when provided', async () => {
      const provider = new OpenHandsSDKProvider({
        config: {
          baseUrl: 'http://localhost:3000',
          tools: {
            terminal: true,
            file_editor: true,
            task_tracker: true,
            browser: false,
          },
        },
      });

      await provider.callApi('Test prompt');

      // Verify the provider ran with explicit tools
      expect(mockFetchWithProxy).toHaveBeenCalled();
    });
  });

  describe('session management', () => {
    beforeEach(() => {
      disableCache();
    });

    afterEach(async () => {
      enableCache();
    });

    it('should create new session for each call by default', async () => {
      const provider = new OpenHandsSDKProvider({
        config: {
          baseUrl: 'http://localhost:3000',
        },
      });

      await provider.callApi('First prompt');
      await provider.callApi('Second prompt');

      // Should have called create conversation twice (POST to /api/conversations exactly)
      const createCalls = mockFetchWithProxy.mock.calls.filter(
        (call) => call[0].endsWith('/api/conversations') && call[1]?.method === 'POST',
      );
      expect(createCalls).toHaveLength(2);
    });

    it('should reuse session when session_id is provided', async () => {
      const provider = new OpenHandsSDKProvider({
        config: {
          baseUrl: 'http://localhost:3000',
          session_id: 'existing-session-id',
        },
      });

      await provider.callApi('Test prompt');

      // Should not have called create conversation (POST to /api/conversations exactly)
      const createCalls = mockFetchWithProxy.mock.calls.filter(
        (call) => call[0].endsWith('/api/conversations') && call[1]?.method === 'POST',
      );
      expect(createCalls).toHaveLength(0);

      // Should have sent message to the existing session
      const messageCalls = mockFetchWithProxy.mock.calls.filter((call) =>
        call[0].includes('/messages'),
      );
      expect(messageCalls).toHaveLength(1);
      expect(messageCalls[0][0]).toContain('existing-session-id');
    });

    it('should return sessionId in response', async () => {
      const provider = new OpenHandsSDKProvider({
        config: {
          baseUrl: 'http://localhost:3000',
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.sessionId).toBe('conv-123');
    });
  });

  describe('cleanup', () => {
    beforeEach(() => {
      disableCache();
    });

    afterEach(async () => {
      enableCache();
    });

    it('should clear sessions on cleanup', async () => {
      const provider = new OpenHandsSDKProvider({
        config: {
          baseUrl: 'http://localhost:3000',
        },
      });

      await provider.callApi('Test prompt');
      await provider.cleanup();

      // After cleanup, sessions should be cleared
      // Verify by calling again - it should create a new session
      await provider.callApi('Another prompt');

      // Should have called create conversation twice (POST to /api/conversations exactly)
      const createCalls = mockFetchWithProxy.mock.calls.filter(
        (call) => call[0].endsWith('/api/conversations') && call[1]?.method === 'POST',
      );
      expect(createCalls).toHaveLength(2);
    });
  });

  describe('caching', () => {
    beforeEach(async () => {
      enableCache();
      await clearCache();
    });

    it('should cache responses', async () => {
      const provider = new OpenHandsSDKProvider({
        config: {
          baseUrl: 'http://localhost:3000',
        },
      });

      // First call - should hit API
      const result1 = await provider.callApi('Test prompt');
      expect(result1.output).toBe('Test response from OpenHands');

      // Reset mock to verify cache hit
      mockFetchWithProxy.mockClear();

      // Second call with same prompt - should use cache
      const result2 = await provider.callApi('Test prompt');
      expect(result2.output).toBe('Test response from OpenHands');

      // Should not have made any API calls for the cached response
      // (The health check might still be called for server init, but not conversation API)
      const conversationCalls = mockFetchWithProxy.mock.calls.filter((call) =>
        call[0].includes('/api/conversations'),
      );
      expect(conversationCalls).toHaveLength(0);
    });

    it('should bust cache when bustCache is true', async () => {
      const provider = new OpenHandsSDKProvider({
        config: {
          baseUrl: 'http://localhost:3000',
        },
      });

      // First call
      await provider.callApi('Test prompt');

      // Clear mock
      mockFetchWithProxy.mockClear();

      // Second call with bustCache - should hit API again
      await provider.callApi('Test prompt', {
        bustCache: true,
        prompt: { raw: 'Test prompt', label: 'test' },
        vars: {},
      });

      const conversationCalls = mockFetchWithProxy.mock.calls.filter((call) =>
        call[0].includes('/api/conversations'),
      );
      expect(conversationCalls.length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      disableCache();
    });

    afterEach(async () => {
      enableCache();
    });

    it('should handle conversation creation failure', async () => {
      mockFetchWithProxy.mockImplementation(async (url: string, options?: RequestInit) => {
        if (url.endsWith('/api/conversations') && options?.method === 'POST') {
          return {
            ok: false,
            status: 400,
            statusText: 'Bad Request',
            text: async () => 'Bad Request: Invalid parameters',
          };
        }
        return { ok: true };
      });

      const provider = new OpenHandsSDKProvider({
        config: {
          baseUrl: 'http://localhost:3000',
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Error calling OpenHands SDK');
    });

    it('should handle message send failure', async () => {
      mockFetchWithProxy.mockImplementation(async (url: string, options?: RequestInit) => {
        if (url.endsWith('/api/conversations') && options?.method === 'POST') {
          return {
            ok: true,
            json: async () => createMockConversationResponse(),
          };
        }
        if (url.includes('/events/search')) {
          return {
            ok: true,
            json: async () => createMockEventsResponse(),
          };
        }
        if (url.includes('/messages') && options?.method === 'POST') {
          return {
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            text: async () => 'Internal Server Error',
          };
        }
        if (url.match(/\/api\/conversations\/[^/]+$/) && !options?.method) {
          return {
            ok: true,
            json: async () => createMockConversationState('finished'),
          };
        }
        return { ok: true };
      });

      const provider = new OpenHandsSDKProvider({
        config: {
          baseUrl: 'http://localhost:3000',
          session_id: 'existing-session', // Use existing session to test message send
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Error calling OpenHands SDK');
    });

    it('should handle conversation state polling failure', async () => {
      mockFetchWithProxy.mockImplementation(async (url: string, options?: RequestInit) => {
        if (url.endsWith('/api/conversations') && options?.method === 'POST') {
          return {
            ok: true,
            json: async () => createMockConversationResponse(),
          };
        }
        if (url.includes('/run') && options?.method === 'POST') {
          return { ok: true };
        }
        if (url.match(/\/api\/conversations\/[^/]+$/) && !options?.method) {
          return {
            ok: false,
            status: 404,
            statusText: 'Not Found',
            text: async () => 'Conversation not found',
          };
        }
        return { ok: true };
      });

      const provider = new OpenHandsSDKProvider({
        config: {
          baseUrl: 'http://localhost:3000',
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Error calling OpenHands SDK');
    });

    it('should handle error state in conversation', async () => {
      mockFetchWithProxy.mockImplementation(async (url: string, options?: RequestInit) => {
        if (url.endsWith('/api/conversations') && options?.method === 'POST') {
          return {
            ok: true,
            json: async () => createMockConversationResponse(),
          };
        }
        if (url.includes('/run') && options?.method === 'POST') {
          return { ok: true };
        }
        if (url.includes('/events/search')) {
          return {
            ok: true,
            json: async () =>
              createMockEventsResponse([
                { role: 'user', content: 'test' },
                { role: 'assistant', content: 'Error occurred' },
              ]),
          };
        }
        if (url.match(/\/api\/conversations\/[^/]+$/) && !options?.method) {
          return {
            ok: true,
            json: async () => createMockConversationState('error'),
          };
        }
        return { ok: true };
      });

      const provider = new OpenHandsSDKProvider({
        config: {
          baseUrl: 'http://localhost:3000',
        },
      });

      const result = await provider.callApi('Test prompt');

      // Error state still returns the output (last assistant message from events)
      expect(result.output).toBe('Error occurred');
    });
  });
});
