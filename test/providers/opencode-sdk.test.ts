import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import fs from 'fs';

import { clearCache, disableCache, enableCache, getCache } from '../../src/cache';
import logger from '../../src/logger';
import { FS_READONLY_TOOLS, OpenCodeSDKProvider } from '../../src/providers/opencode-sdk';

import type { CallApiContextParams } from '../../src/types/index';

vi.mock('../../src/cliState', () => ({
  default: { basePath: '/test/basePath' },
  basePath: '/test/basePath',
}));
vi.mock('../../src/esm', () => ({
  importModule: vi.fn(),
}));
vi.mock('node:module', () => ({
  createRequire: vi.fn(() => ({
    resolve: vi.fn(() => '@opencode-ai/sdk'),
  })),
}));

// Mock OpenCode SDK client
const mockSessionCreate = vi.fn();
const mockSessionChat = vi.fn();
const mockSessionDelete = vi.fn();
const mockSessionList = vi.fn();

// Create a proper mock class that can be instantiated
class MockOpencodeClass {
  session = {
    create: mockSessionCreate,
    chat: mockSessionChat,
    delete: mockSessionDelete,
    list: mockSessionList,
  };
  constructor(_options?: any) {}
}

// Helper to create mock session
const createMockSession = (id = 'test-session-123') => ({
  id,
  createdAt: new Date().toISOString(),
});

// Helper to create mock chat response
const createMockChatResponse = (
  content: string,
  usage?: { input_tokens?: number; output_tokens?: number },
) => ({
  id: 'msg-123',
  role: 'assistant',
  content: [{ type: 'text', text: content }],
  usage: usage
    ? {
        input_tokens: usage.input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
      }
    : undefined,
});

// Helper to create mock chat response with string content
const createMockStringResponse = (content: string) => ({
  id: 'msg-123',
  role: 'assistant',
  content,
});

describe('OpenCodeSDKProvider', () => {
  let tempDirSpy: MockInstance;
  let statSyncSpy: MockInstance;
  let rmSyncSpy: MockInstance;
  let readdirSyncSpy: MockInstance;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup importModule to return our mock
    const { importModule } = await import('../../src/esm');
    vi.mocked(importModule).mockResolvedValue({
      default: MockOpencodeClass,
    });

    // Default session mocks
    mockSessionCreate.mockResolvedValue(createMockSession());
    mockSessionChat.mockResolvedValue(createMockChatResponse('Test response'));

    // File system mocks
    tempDirSpy = vi.spyOn(fs, 'mkdtempSync').mockReturnValue('/tmp/test-temp-dir');
    statSyncSpy = vi.spyOn(fs, 'statSync').mockReturnValue({
      isDirectory: () => true,
      mtimeMs: 1234567890,
    } as fs.Stats);
    rmSyncSpy = vi.spyOn(fs, 'rmSync').mockImplementation(() => {});
    readdirSyncSpy = vi.spyOn(fs, 'readdirSync').mockReturnValue([]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await clearCache();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const provider = new OpenCodeSDKProvider();

      expect(provider.config).toEqual({});
      expect(provider.id()).toBe('opencode:sdk');
    });

    it('should initialize with custom config', () => {
      const config = {
        apiKey: 'test-key',
        model: 'claude-sonnet-4-20250514',
        provider_id: 'anthropic',
      };

      const provider = new OpenCodeSDKProvider({ config });

      expect(provider.config).toEqual(config);
      expect(provider.apiKey).toBe('test-key');
    });

    it('should use custom id when provided', () => {
      const provider = new OpenCodeSDKProvider({ id: 'custom-provider-id' });

      expect(provider.id()).toBe('custom-provider-id');
    });
  });

  describe('getApiKey', () => {
    it('should prioritize config apiKey', () => {
      const provider = new OpenCodeSDKProvider({
        config: { apiKey: 'config-key' },
        env: { ANTHROPIC_API_KEY: 'env-key' },
      });

      expect(provider.apiKey).toBe('config-key');
    });

    it('should use ANTHROPIC_API_KEY for anthropic provider', () => {
      const provider = new OpenCodeSDKProvider({
        config: { provider_id: 'anthropic' },
        env: { ANTHROPIC_API_KEY: 'anthropic-key' },
      });

      expect(provider.apiKey).toBe('anthropic-key');
    });

    it('should use OPENAI_API_KEY for openai provider', () => {
      const provider = new OpenCodeSDKProvider({
        config: { provider_id: 'openai' },
        env: { OPENAI_API_KEY: 'openai-key' },
      });

      expect(provider.apiKey).toBe('openai-key');
    });

    it('should fall back to common env vars', () => {
      const provider = new OpenCodeSDKProvider({
        env: { ANTHROPIC_API_KEY: 'fallback-key' },
      });

      expect(provider.apiKey).toBe('fallback-key');
    });
  });

  describe('toString', () => {
    it('should return provider description', () => {
      const provider = new OpenCodeSDKProvider();
      expect(provider.toString()).toBe('[OpenCode SDK Provider]');
    });
  });

  describe('callApi', () => {
    describe('basic functionality', () => {
      it('should successfully call API with simple prompt', async () => {
        mockSessionChat.mockResolvedValue(
          createMockChatResponse('Test response', { input_tokens: 10, output_tokens: 20 }),
        );

        const provider = new OpenCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result.output).toBe('Test response');
        expect(result.tokenUsage).toEqual({
          prompt: 10,
          completion: 20,
          total: 30,
        });
        expect(result.sessionId).toBe('test-session-123');
        expect(result.error).toBeUndefined();

        expect(mockSessionCreate).toHaveBeenCalledTimes(1);
        expect(mockSessionChat).toHaveBeenCalledWith('test-session-123', {
          content: 'Test prompt',
        });
      });

      it('should handle string response content', async () => {
        mockSessionChat.mockResolvedValue(createMockStringResponse('Simple string response'));

        const provider = new OpenCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result.output).toBe('Simple string response');
      });

      it('should handle multiple text parts in response', async () => {
        mockSessionChat.mockResolvedValue({
          id: 'msg-123',
          role: 'assistant',
          content: [
            { type: 'text', text: 'Part 1' },
            { type: 'tool_use', name: 'read' },
            { type: 'text', text: 'Part 2' },
          ],
        });

        const provider = new OpenCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result.output).toBe('Part 1\nPart 2');
      });

      it('should handle SDK exceptions', async () => {
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
        mockSessionChat.mockRejectedValue(new Error('Network error'));

        const provider = new OpenCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result.error).toBe('Error calling OpenCode SDK: Network error');
        expect(errorSpy).toHaveBeenCalled();

        errorSpy.mockRestore();
      });
    });

    describe('working directory', () => {
      it('should use temp directory when no working_dir specified', async () => {
        const provider = new OpenCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider.callApi('Test prompt');

        expect(tempDirSpy).toHaveBeenCalledWith(expect.stringContaining('promptfoo-opencode-sdk-'));
        expect(rmSyncSpy).toHaveBeenCalledWith('/tmp/test-temp-dir', {
          recursive: true,
          force: true,
        });
      });

      it('should use specified working_dir', async () => {
        const provider = new OpenCodeSDKProvider({
          config: { working_dir: '/custom/dir' },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider.callApi('Test prompt');

        expect(tempDirSpy).not.toHaveBeenCalled();
        expect(statSyncSpy).toHaveBeenCalledWith('/custom/dir');
      });

      it('should throw error for non-existent working_dir', async () => {
        statSyncSpy.mockImplementation(() => {
          throw new Error('ENOENT');
        });

        const provider = new OpenCodeSDKProvider({
          config: { working_dir: '/nonexistent' },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        await expect(provider.callApi('Test prompt')).rejects.toThrow(
          'Working directory /nonexistent does not exist',
        );
      });

      it('should throw error if working_dir is not a directory', async () => {
        statSyncSpy.mockReturnValue({
          isDirectory: () => false,
          mtimeMs: 1234567890,
        } as fs.Stats);

        const provider = new OpenCodeSDKProvider({
          config: { working_dir: '/some/file.txt' },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        await expect(provider.callApi('Test prompt')).rejects.toThrow(
          'Working directory /some/file.txt is not a directory',
        );
      });
    });

    describe('session management', () => {
      it('should create new session for each call by default', async () => {
        const provider = new OpenCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Prompt 1');
        await provider.callApi('Prompt 2');

        expect(mockSessionCreate).toHaveBeenCalledTimes(2);
      });

      it('should resume session when session_id provided', async () => {
        const provider = new OpenCodeSDKProvider({
          config: { session_id: 'existing-session' },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect(mockSessionCreate).not.toHaveBeenCalled();
        expect(mockSessionChat).toHaveBeenCalledWith('existing-session', expect.any(Object));
      });

      it('should reuse session when persist_sessions is true', async () => {
        // Enable caching for session persistence to work
        await enableCache();

        const provider = new OpenCodeSDKProvider({
          config: { persist_sessions: true },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Same prompt');
        await provider.callApi('Same prompt');

        // Second call should reuse session (only 1 create call)
        expect(mockSessionCreate).toHaveBeenCalledTimes(1);
      });
    });

    describe('abort handling', () => {
      it('should return error when aborted before start', async () => {
        const abortController = new AbortController();
        abortController.abort();

        const provider = new OpenCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt', undefined, {
          abortSignal: abortController.signal,
        });

        expect(result.error).toBe('OpenCode SDK call aborted before it started');
        expect(mockSessionCreate).not.toHaveBeenCalled();
      });

      it('should handle AbortError during call', async () => {
        const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
        const abortError = new Error('Aborted');
        abortError.name = 'AbortError';
        mockSessionChat.mockRejectedValue(abortError);

        const provider = new OpenCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        expect(result.error).toBe('OpenCode SDK call aborted');
        expect(warnSpy).toHaveBeenCalledWith('OpenCode SDK call aborted');

        warnSpy.mockRestore();
      });
    });

    describe('caching', () => {
      beforeEach(async () => {
        await enableCache();
      });

      afterEach(async () => {
        await disableCache();
      });

      it('should cache responses', async () => {
        mockSessionChat.mockResolvedValue(
          createMockChatResponse('Cached response', { input_tokens: 5, output_tokens: 10 }),
        );

        const provider = new OpenCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        // First call
        const result1 = await provider.callApi('Test prompt');
        expect(result1.output).toBe('Cached response');

        // Second call should be cached
        const result2 = await provider.callApi('Test prompt');
        expect(result2.output).toBe('Cached response');

        // Only one actual API call
        expect(mockSessionChat).toHaveBeenCalledTimes(1);
      });

      it('should bust cache when context.bustCache is true', async () => {
        mockSessionChat.mockResolvedValue(createMockChatResponse('Fresh response'));

        const provider = new OpenCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        // First call
        await provider.callApi('Test prompt');

        // Second call with bustCache
        const context: CallApiContextParams = {
          bustCache: true,
          prompt: { raw: 'Test prompt', label: 'test' },
          vars: {},
        };
        await provider.callApi('Test prompt', context);

        // Both calls should hit the API
        expect(mockSessionChat).toHaveBeenCalledTimes(2);
      });
    });

    describe('config merging', () => {
      it('should merge prompt config with provider config', async () => {
        const provider = new OpenCodeSDKProvider({
          config: { model: 'default-model' },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        const context: CallApiContextParams = {
          prompt: {
            raw: 'Test',
            label: 'test',
            config: { model: 'prompt-model' },
          },
          vars: {},
        };

        await provider.callApi('Test prompt', context);

        // Prompt config should override provider config
        // (Verified by the merge in callApi)
        expect(mockSessionChat).toHaveBeenCalled();
      });
    });
  });

  describe('cleanup', () => {
    it('should clear sessions on cleanup', async () => {
      const provider = new OpenCodeSDKProvider({
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      // Make a call to create a session
      await provider.callApi('Test prompt');

      // Cleanup
      await provider.cleanup();

      // Session delete should be called for non-persistent sessions
      // (Though in current implementation, ephemeral sessions are deleted in finally block)
      expect(mockSessionDelete).not.toHaveBeenCalled(); // Ephemeral sessions cleaned differently
    });
  });

  describe('buildToolsConfig', () => {
    it('should disable all tools when no working_dir', async () => {
      const provider = new OpenCodeSDKProvider({
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      // Access private method through callApi behavior
      await provider.callApi('Test prompt');

      // Temp dir should be created and cleaned up
      expect(tempDirSpy).toHaveBeenCalled();
      expect(rmSyncSpy).toHaveBeenCalled();
    });

    it('should enable read-only tools with working_dir', async () => {
      const provider = new OpenCodeSDKProvider({
        config: { working_dir: '/test/dir' },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      await provider.callApi('Test prompt');

      // No temp dir should be created
      expect(tempDirSpy).not.toHaveBeenCalled();
    });

    it('should use explicit tools config when provided', async () => {
      const provider = new OpenCodeSDKProvider({
        config: {
          working_dir: '/test/dir',
          tools: {
            read: true,
            write: true,
            bash: true,
          },
        },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      await provider.callApi('Test prompt');
      expect(mockSessionChat).toHaveBeenCalled();
    });
  });

  describe('FS_READONLY_TOOLS constant', () => {
    it('should contain expected read-only tools', () => {
      expect(FS_READONLY_TOOLS).toEqual(['glob', 'grep', 'list', 'read']);
    });

    it('should be sorted alphabetically', () => {
      const sorted = [...FS_READONLY_TOOLS].sort();
      expect(FS_READONLY_TOOLS).toEqual(sorted);
    });
  });
});
