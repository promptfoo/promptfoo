import fs from 'fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, disableCache, enableCache } from '../../src/cache';
import logger from '../../src/logger';
import { FS_READONLY_TOOLS, OpenCodeSDKProvider } from '../../src/providers/opencode-sdk';
import type { MockInstance } from 'vitest';

import type { CallApiContextParams } from '../../src/types/index';

vi.mock('../../src/cliState', () => ({
  default: { basePath: '/test/basePath' },
  basePath: '/test/basePath',
}));
vi.mock('../../src/esm', async (importOriginal) => ({
  ...(await importOriginal()),
  importModule: vi.fn(),
}));
// Mock @opencode-ai/sdk to fail on direct import, forcing fallback to smart resolution
vi.mock('@opencode-ai/sdk', () => {
  throw new Error('Direct import blocked - use smart ESM resolution');
});
// Mock node:module createRequire for ESM package resolution
vi.mock('node:module', async (importOriginal) => ({
  ...(await importOriginal()),
  createRequire: vi.fn(() => ({
    resolve: vi.fn((pkg: string) => {
      if (pkg === '@opencode-ai/sdk/package.json') {
        return '/test/basePath/node_modules/@opencode-ai/sdk/package.json';
      }
      throw new Error(`Cannot find module '${pkg}'`);
    }),
  })),
}));

// Mock OpenCode SDK client
const mockSessionCreate = vi.fn();
const mockSessionPrompt = vi.fn();
const mockSessionMessages = vi.fn();
const mockSessionDelete = vi.fn();
const mockSessionList = vi.fn();

// Mock server
const mockServerClose = vi.fn();

// Mock createOpencode function that returns { client, server }
const mockCreateOpencode = vi.fn();
const mockCreateOpencodeClient = vi.fn();

// Helper to create mock session create response
// SDK returns: { id, title, version, time }
const createMockSessionResponse = (id = 'test-session-123') => ({
  id,
  title: `promptfoo-${Date.now()}`,
  version: 1,
  time: new Date().toISOString(),
});

// Helper to create mock prompt response
// SDK session.prompt() returns: { info: AssistantMessage, parts: Part[] }
const createMockPromptResponse = (
  parts: Array<{ type: string; text?: string }>,
  tokens?: { input?: number; output?: number; reasoning?: number; cache?: number },
  cost?: number,
) => ({
  data: {
    info: {
      id: 'msg-123',
      sessionID: 'test-session-123',
      role: 'assistant',
      parentID: 'user-msg-123',
      modelID: 'claude-sonnet-4-20250514',
      providerID: 'anthropic',
      mode: 'default',
      path: { cwd: '/test', root: '/test' },
      tokens: tokens
        ? {
            input: tokens.input ?? 0,
            output: tokens.output ?? 0,
            reasoning: tokens.reasoning ?? 0,
            cache: tokens.cache ?? 0,
          }
        : undefined,
      cost: cost ?? 0,
      time: { created: Date.now() },
    },
    parts,
  },
});

describe('OpenCodeSDKProvider', () => {
  let tempDirSpy: MockInstance;
  let statSyncSpy: MockInstance;
  let rmSyncSpy: MockInstance;
  let _readdirSyncSpy: MockInstance;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup mock client with session.prompt()
    const mockClient = {
      session: {
        create: mockSessionCreate,
        prompt: mockSessionPrompt,
        messages: mockSessionMessages,
        delete: mockSessionDelete,
        list: mockSessionList,
      },
    };

    // Setup mock server
    const mockServer = {
      url: 'http://127.0.0.1:4096',
      close: mockServerClose,
    };

    // Setup createOpencode mock
    mockCreateOpencode.mockResolvedValue({
      client: mockClient,
      server: mockServer,
    });

    mockCreateOpencodeClient.mockReturnValue(mockClient);

    // Setup importModule to return our mocks
    const { importModule } = await import('../../src/esm');
    vi.mocked(importModule).mockResolvedValue({
      createOpencode: mockCreateOpencode,
      createOpencodeClient: mockCreateOpencodeClient,
    });

    // Default session mocks
    mockSessionCreate.mockResolvedValue(createMockSessionResponse());
    mockSessionPrompt.mockResolvedValue(
      createMockPromptResponse(
        [{ type: 'text', text: 'Test response' }],
        { input: 10, output: 20 },
        0.001,
      ),
    );

    // File system mocks
    tempDirSpy = vi.spyOn(fs, 'mkdtempSync').mockReturnValue('/tmp/test-temp-dir');
    statSyncSpy = vi.spyOn(fs, 'statSync').mockReturnValue({
      isDirectory: () => true,
      mtimeMs: 1234567890,
    } as fs.Stats);
    rmSyncSpy = vi.spyOn(fs, 'rmSync').mockImplementation(() => {});
    _readdirSyncSpy = vi.spyOn(fs, 'readdirSync').mockReturnValue([]);
    // Mock readFileSync to return package.json for SDK resolution
    vi.spyOn(fs, 'readFileSync').mockImplementation((filePath: fs.PathOrFileDescriptor) => {
      if (String(filePath).includes('@opencode-ai/sdk/package.json')) {
        return JSON.stringify({
          name: '@opencode-ai/sdk',
          exports: {
            '.': {
              import: './dist/index.js',
              types: './dist/index.d.ts',
            },
          },
        });
      }
      return '';
    });
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
      expect(provider.getApiKey()).toBe('test-key');
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

      expect(provider.getApiKey()).toBe('config-key');
    });

    it('should use ANTHROPIC_API_KEY for anthropic provider', () => {
      const provider = new OpenCodeSDKProvider({
        config: { provider_id: 'anthropic' },
        env: { ANTHROPIC_API_KEY: 'anthropic-key' },
      });

      expect(provider.getApiKey()).toBe('anthropic-key');
    });

    it('should use OPENAI_API_KEY for openai provider', () => {
      const provider = new OpenCodeSDKProvider({
        config: { provider_id: 'openai' },
        env: { OPENAI_API_KEY: 'openai-key' },
      });

      expect(provider.getApiKey()).toBe('openai-key');
    });

    it('should fall back to common env vars', () => {
      const provider = new OpenCodeSDKProvider({
        env: { ANTHROPIC_API_KEY: 'fallback-key' },
      });

      expect(provider.getApiKey()).toBe('fallback-key');
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
        mockSessionPrompt.mockResolvedValue(
          createMockPromptResponse(
            [{ type: 'text', text: 'Test response' }],
            { input: 10, output: 20 },
            0.001,
          ),
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
        expect(result.cost).toBe(0.001);
        expect(result.sessionId).toBe('test-session-123');
        expect(result.error).toBeUndefined();

        // Verify session.create was called with body.title
        expect(mockSessionCreate).toHaveBeenCalledTimes(1);
        expect(mockSessionCreate).toHaveBeenCalledWith({
          body: expect.objectContaining({
            title: expect.stringMatching(/^promptfoo-\d+$/),
          }),
        });

        // Verify session.prompt was called with { path: { id }, body: { parts } }
        expect(mockSessionPrompt).toHaveBeenCalledWith(
          expect.objectContaining({
            path: { id: 'test-session-123' },
            body: expect.objectContaining({
              parts: [{ type: 'text', text: 'Test prompt' }],
            }),
          }),
        );
      });

      it('should handle multiple text parts in response', async () => {
        mockSessionPrompt.mockResolvedValue(
          createMockPromptResponse([
            { type: 'text', text: 'Part 1' },
            { type: 'tool', text: undefined },
            { type: 'text', text: 'Part 2' },
          ]),
        );

        const provider = new OpenCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result.output).toBe('Part 1\nPart 2');
      });

      it('should handle SDK exceptions', async () => {
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
        mockSessionPrompt.mockRejectedValue(new Error('Network error'));

        const provider = new OpenCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result.error).toBe('Error calling OpenCode SDK: Network error');
        expect(errorSpy).toHaveBeenCalled();

        errorSpy.mockRestore();
      });

      it('should handle empty parts in response', async () => {
        mockSessionPrompt.mockResolvedValue(createMockPromptResponse([], { input: 5, output: 10 }));

        const provider = new OpenCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result.output).toBe('');
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
          /Working directory \/nonexistent .* does not exist/,
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
          /Working directory \/some\/file.txt .* is not a directory/,
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
        // session.prompt is called with the provided session ID
        expect(mockSessionPrompt).toHaveBeenCalledWith(
          expect.objectContaining({
            path: { id: 'existing-session' },
          }),
        );
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
        mockSessionPrompt.mockRejectedValue(abortError);

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
        mockSessionPrompt.mockResolvedValue(
          createMockPromptResponse(
            [{ type: 'text', text: 'Cached response' }],
            { input: 5, output: 10 },
            0.0005,
          ),
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
        expect(mockSessionPrompt).toHaveBeenCalledTimes(1);
      });

      it('should bust cache when context.bustCache is true', async () => {
        mockSessionPrompt.mockResolvedValue(
          createMockPromptResponse([{ type: 'text', text: 'Fresh response' }]),
        );

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
        expect(mockSessionPrompt).toHaveBeenCalledTimes(2);
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
        // The merged config should use 'prompt-model'
        expect(mockSessionPrompt).toHaveBeenCalledWith(
          expect.objectContaining({
            body: expect.objectContaining({
              model: expect.objectContaining({
                modelID: 'prompt-model',
              }),
            }),
          }),
        );
      });
    });

    describe('model and provider config', () => {
      it('should pass model config to prompt body', async () => {
        const provider = new OpenCodeSDKProvider({
          config: {
            provider_id: 'anthropic',
            model: 'claude-sonnet-4-20250514',
          },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        // SDK expects model: { providerID, modelID } in the body
        expect(mockSessionPrompt).toHaveBeenCalledWith(
          expect.objectContaining({
            path: { id: 'test-session-123' },
            body: expect.objectContaining({
              model: {
                providerID: 'anthropic',
                modelID: 'claude-sonnet-4-20250514',
              },
            }),
          }),
        );
      });

      it('should work without model config', async () => {
        const provider = new OpenCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        // Should still call prompt without model config
        expect(mockSessionPrompt).toHaveBeenCalledWith(
          expect.objectContaining({
            path: { id: 'test-session-123' },
            body: expect.objectContaining({
              parts: [{ type: 'text', text: 'Test prompt' }],
            }),
          }),
        );
      });
    });
  });

  describe('cleanup', () => {
    it('should close server on cleanup', async () => {
      const provider = new OpenCodeSDKProvider({
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      // Make a call to initialize server
      await provider.callApi('Test prompt');

      // Cleanup
      await provider.cleanup();

      expect(mockServerClose).toHaveBeenCalled();
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

      // Verify tools config includes read-only tools
      expect(mockSessionPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            tools: expect.objectContaining({
              read: true,
              grep: true,
              glob: true,
              list: true,
              bash: false,
              write: false,
              edit: false,
            }),
          }),
        }),
      );
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

      expect(mockSessionPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            tools: {
              read: true,
              write: true,
              bash: true,
            },
          }),
        }),
      );
    });
  });

  describe('existing server connection', () => {
    it('should connect to existing server via baseUrl', async () => {
      const provider = new OpenCodeSDKProvider({
        config: { baseUrl: 'http://localhost:8080' },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      await provider.callApi('Test prompt');

      // Should use createOpencodeClient instead of createOpencode
      expect(mockCreateOpencodeClient).toHaveBeenCalledWith({
        baseUrl: 'http://localhost:8080',
      });
      expect(mockCreateOpencode).not.toHaveBeenCalled();
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

  describe('new tools configuration', () => {
    it('should include question, skill, lsp tools in disabled mode by default', async () => {
      const provider = new OpenCodeSDKProvider({
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      await provider.callApi('Test prompt');

      // Verify tools config includes new tools (disabled)
      expect(mockSessionPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            tools: expect.objectContaining({
              question: false,
              skill: false,
              lsp: false,
            }),
          }),
        }),
      );
    });

    it('should allow enabling new tools explicitly', async () => {
      const provider = new OpenCodeSDKProvider({
        config: {
          working_dir: '/test/dir',
          tools: {
            read: true,
            question: true,
            skill: true,
            lsp: true,
          },
        },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      await provider.callApi('Test prompt');

      expect(mockSessionPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            tools: {
              read: true,
              question: true,
              skill: true,
              lsp: true,
            },
          }),
        }),
      );
    });
  });

  describe('new permission types', () => {
    it('should support doom_loop and external_directory permissions', async () => {
      const provider = new OpenCodeSDKProvider({
        config: {
          working_dir: '/test/dir',
          permission: {
            bash: 'allow',
            doom_loop: 'deny',
            external_directory: 'deny',
          },
        },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      await provider.callApi('Test prompt');

      expect(mockSessionPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            permission: {
              bash: 'allow',
              doom_loop: 'deny',
              external_directory: 'deny',
            },
          }),
        }),
      );
    });

    it('should support pattern-based permissions', async () => {
      const provider = new OpenCodeSDKProvider({
        config: {
          working_dir: '/test/dir',
          permission: {
            bash: {
              'git *': 'allow',
              'rm *': 'deny',
              '*': 'ask',
            },
            edit: {
              '*.md': 'allow',
              'src/**': 'ask',
            },
          },
        },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      await provider.callApi('Test prompt');

      expect(mockSessionPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            permission: {
              bash: {
                'git *': 'allow',
                'rm *': 'deny',
                '*': 'ask',
              },
              edit: {
                '*.md': 'allow',
                'src/**': 'ask',
              },
            },
          }),
        }),
      );
    });
  });

  describe('custom agent new properties', () => {
    it('should pass top_p, steps, color, disable, hidden to server config', async () => {
      const provider = new OpenCodeSDKProvider({
        config: {
          custom_agent: {
            description: 'Test agent',
            model: 'test-model',
            temperature: 0.5,
            top_p: 0.9,
            steps: 10,
            color: '#ff5500',
            disable: false,
            hidden: true,
            mode: 'subagent',
          },
        },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      await provider.callApi('Test prompt');

      // Verify createOpencode was called with the custom agent config
      expect(mockCreateOpencode).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            agent: {
              custom: expect.objectContaining({
                description: 'Test agent',
                model: 'test-model',
                temperature: 0.5,
                top_p: 0.9,
                maxSteps: 10, // steps maps to maxSteps
                color: '#ff5500',
                disable: false,
                hidden: true,
                mode: 'subagent',
              }),
            },
          }),
        }),
      );
    });

    it('should support deprecated maxSteps as fallback', async () => {
      const provider = new OpenCodeSDKProvider({
        config: {
          custom_agent: {
            description: 'Test agent',
            maxSteps: 5,
          },
        },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      await provider.callApi('Test prompt');

      expect(mockCreateOpencode).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            agent: {
              custom: expect.objectContaining({
                maxSteps: 5,
              }),
            },
          }),
        }),
      );
    });

    it('should prefer steps over maxSteps when both provided', async () => {
      const provider = new OpenCodeSDKProvider({
        config: {
          custom_agent: {
            description: 'Test agent',
            steps: 10,
            maxSteps: 5, // Should be ignored
          },
        },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      await provider.callApi('Test prompt');

      expect(mockCreateOpencode).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            agent: {
              custom: expect.objectContaining({
                maxSteps: 10, // steps takes precedence
              }),
            },
          }),
        }),
      );
    });
  });

  describe('MCP OAuth configuration', () => {
    it('should support OAuth config for remote MCP servers', async () => {
      const provider = new OpenCodeSDKProvider({
        config: {
          mcp: {
            'oauth-server': {
              type: 'remote',
              url: 'https://secure.example.com/mcp',
              oauth: {
                clientId: 'test-client-id',
                clientSecret: 'test-secret',
                scope: 'read write',
              },
            },
          },
        },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      await provider.callApi('Test prompt');

      expect(mockCreateOpencode).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            mcp: {
              'oauth-server': {
                type: 'remote',
                url: 'https://secure.example.com/mcp',
                oauth: {
                  clientId: 'test-client-id',
                  clientSecret: 'test-secret',
                  scope: 'read write',
                },
              },
            },
          }),
        }),
      );
    });
  });
});
