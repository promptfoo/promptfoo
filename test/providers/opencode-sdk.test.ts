import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, disableCache, enableCache } from '../../src/cache';
import { runEval } from '../../src/evaluator';
import logger from '../../src/logger';
import {
  convertPermissionConfigToRuleset,
  FS_READONLY_TOOLS,
  OpenCodeSDKProvider,
} from '../../src/providers/opencode-sdk';
import { providerRegistry } from '../../src/providers/providerRegistry';
import { createDeferred } from '../util/utils';
import type { MockInstance } from 'vitest';

import type { OpenCodeSDKConfig } from '../../src/providers/opencode-sdk';
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
vi.mock('@opencode-ai/sdk/v2', () => {
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
const mockSessionAbort = vi.fn();

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
  parts: Array<{
    type: string;
    text?: string;
    tool?: string;
    state?: {
      status?: string;
      input?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    };
  }>,
  tokens?: {
    total?: number;
    input?: number;
    output?: number;
    reasoning?: number;
    cache?:
      | number
      | {
          read?: number;
          write?: number;
        };
  },
  cost?: number,
  structured?: unknown,
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
            ...(tokens.total === undefined ? {} : { total: tokens.total }),
            ...(tokens.reasoning === undefined ? {} : { reasoning: tokens.reasoning }),
            ...(tokens.cache === undefined ? {} : { cache: tokens.cache }),
          }
        : undefined,
      ...(cost === undefined ? {} : { cost }),
      structured,
      time: { created: Date.now() },
    },
    parts,
  },
});

// Helper to stamp history anchors onto a mock prompt response. The provider
// slices session history between the assistant message's parentID (start) and
// its own id (end), so tests that exercise skill tracking need both set.
const createMockPromptResponseWithAnchors = (
  text: string,
  anchors: { id: string; parentID: string },
) => {
  const base = createMockPromptResponse([{ type: 'text', text }]);
  return { data: { ...base.data, info: { ...base.data.info, ...anchors } } };
};

describe('OpenCodeSDKProvider', () => {
  let tempDirSpy: MockInstance;
  let statSyncSpy: MockInstance;
  let rmSpy: MockInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Fully reset session mocks (calls + queued implementations) so a
    // mockImplementationOnce in one test cannot leak into another under
    // random test ordering.
    mockSessionCreate.mockReset();
    mockSessionPrompt.mockReset();
    mockSessionMessages.mockReset();
    mockSessionDelete.mockReset();
    mockSessionAbort.mockReset();

    // Setup mock client with session.prompt()
    const mockClient = {
      session: {
        create: mockSessionCreate,
        prompt: mockSessionPrompt,
        messages: mockSessionMessages,
        delete: mockSessionDelete,
        list: mockSessionList,
        abort: mockSessionAbort,
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
    mockSessionDelete.mockResolvedValue(undefined);
    mockSessionAbort.mockResolvedValue(undefined);
    mockSessionMessages.mockResolvedValue([]);

    // File system mocks
    tempDirSpy = vi.spyOn(fs, 'mkdtempSync').mockReturnValue('/tmp/test-temp-dir');
    statSyncSpy = vi.spyOn(fs, 'statSync').mockReturnValue({
      isDirectory: () => true,
      mtimeMs: 1234567890,
    } as fs.Stats);
    rmSpy = vi.spyOn(fsPromises, 'rm').mockResolvedValue(undefined);
    vi.spyOn(fs, 'readdirSync').mockReturnValue([]);
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
            './v2': {
              import: './dist/v2/index.js',
              types: './dist/v2/index.d.ts',
            },
          },
        });
      }
      return '';
    });
  });

  afterEach(async () => {
    await providerRegistry.shutdownAll();
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
        expect(mockSessionCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            title: expect.stringMatching(/^promptfoo-\d+$/),
          }),
        );

        // Verify session.prompt was called with the flattened v2 parameter shape
        expect(mockSessionPrompt).toHaveBeenCalledWith(
          expect.objectContaining({
            sessionID: 'test-session-123',
            parts: [{ type: 'text', text: 'Test prompt' }],
          }),
        );
      });

      it('should leave cost undefined when OpenCode does not report one', async () => {
        mockSessionPrompt.mockResolvedValue(
          createMockPromptResponse([{ type: 'text', text: 'No cost response' }], {
            input: 5,
            output: 10,
          }),
        );

        const provider = new OpenCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result.cost).toBeUndefined();
      });

      it('should preserve reasoning and cache token details', async () => {
        mockSessionPrompt.mockResolvedValue(
          createMockPromptResponse(
            [{ type: 'text', text: 'Test response' }],
            {
              input: 10,
              output: 20,
              total: 42,
              reasoning: 7,
              cache: { read: 3, write: 2 },
            },
            0.001,
          ),
        );

        const provider = new OpenCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result.tokenUsage).toEqual({
          prompt: 10,
          completion: 20,
          total: 42,
          cached: 3,
          completionDetails: {
            reasoning: 7,
            cacheReadInputTokens: 3,
            cacheCreationInputTokens: 2,
          },
        });
      });

      it('should fall back to the v1 nested request shape when v2 is unavailable', async () => {
        const { importModule } = await import('../../src/esm');
        vi.mocked(importModule).mockImplementation(async (modulePath: string) => {
          if (/[/\\]dist[/\\]v2[/\\]/.test(modulePath)) {
            throw new Error('v2 unavailable');
          }
          return {
            createOpencode: mockCreateOpencode,
            createOpencodeClient: mockCreateOpencodeClient,
          };
        });

        const provider = new OpenCodeSDKProvider({
          config: {
            working_dir: '/test/dir',
            permission: {
              bash: 'allow',
            },
          },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect(mockSessionCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            body: expect.objectContaining({
              title: expect.stringMatching(/^promptfoo-\d+$/),
            }),
            query: {
              directory: '/test/dir',
            },
          }),
        );
        expect(mockCreateOpencode).toHaveBeenCalledWith(
          expect.objectContaining({
            config: expect.objectContaining({
              tools: {
                '*': false,
                glob: true,
                grep: true,
                list: true,
                read: true,
              },
              permission: { bash: 'allow' },
            }),
          }),
        );
        expect(mockSessionPrompt).toHaveBeenCalledWith(
          expect.objectContaining({
            path: {
              id: 'test-session-123',
              sessionID: 'test-session-123',
            },
            query: {
              directory: '/test/dir',
            },
            body: expect.objectContaining({
              parts: [{ type: 'text', text: 'Test prompt' }],
            }),
          }),
        );
        const promptBody = mockSessionPrompt.mock.calls[0][0].body;
        expect(promptBody).not.toHaveProperty('tools');
        expect(promptBody).not.toHaveProperty('permission');
        expect(mockSessionDelete).toHaveBeenCalledWith(
          expect.objectContaining({
            path: {
              id: 'test-session-123',
              sessionID: 'test-session-123',
            },
            query: {
              directory: '/test/dir',
            },
          }),
        );
      });

      it('applies static v1 permission policy through the locally started server', async () => {
        const { importModule } = await import('../../src/esm');
        vi.mocked(importModule).mockImplementation(async (modulePath: string) => {
          if (/[/\\]dist[/\\]v2[/\\]/.test(modulePath)) {
            throw new Error('v2 unavailable');
          }
          return {
            createOpencode: mockCreateOpencode,
            createOpencodeClient: mockCreateOpencodeClient,
          };
        });
        const provider = new OpenCodeSDKProvider({
          config: {
            working_dir: '/test/dir',
            tools: { write: true, bash: true },
            permission: { edit: 'deny', bash: 'deny' },
          },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect(mockCreateOpencode).toHaveBeenCalledWith(
          expect.objectContaining({
            config: expect.objectContaining({
              tools: {
                '*': false,
                glob: true,
                grep: true,
                list: true,
                read: true,
                bash: true,
                edit: true,
              },
              permission: { edit: 'deny', bash: 'deny' },
            }),
          }),
        );
        expect(mockSessionPrompt.mock.calls[0][0].body).toEqual({
          parts: [{ type: 'text', text: 'Test prompt' }],
        });
      });

      it('atomically reapplies a complete v1 tools policy on persisted sessions', async () => {
        const { importModule } = await import('../../src/esm');
        vi.mocked(importModule).mockImplementation(async (modulePath: string) => {
          if (/[/\\]dist[/\\]v2[/\\]/.test(modulePath)) {
            throw new Error('v2 unavailable');
          }
          return {
            createOpencode: mockCreateOpencode,
            createOpencodeClient: mockCreateOpencodeClient,
          };
        });
        const provider = new OpenCodeSDKProvider({
          config: { persist_sessions: true, tools: { bash: true } },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        await provider.callApi('First prompt');
        await provider.callApi('Second prompt');

        expect(mockSessionCreate).toHaveBeenCalledTimes(1);
        expect(mockSessionPrompt.mock.calls.map(([parameters]) => parameters.body.tools)).toEqual([
          { '*': false, bash: true },
          { '*': false, bash: true },
        ]);
      });

      it('applies v1 explicit-session tools atomically on each prompt', async () => {
        const { importModule } = await import('../../src/esm');
        vi.mocked(importModule).mockImplementation(async (modulePath: string) => {
          if (/[/\\]dist[/\\]v2[/\\]/.test(modulePath)) {
            throw new Error('v2 unavailable');
          }
          return {
            createOpencode: mockCreateOpencode,
            createOpencodeClient: mockCreateOpencodeClient,
          };
        });
        const firstPrompt = createDeferred<ReturnType<typeof createMockPromptResponse>>();
        mockSessionPrompt
          .mockImplementationOnce(() => firstPrompt.promise)
          .mockResolvedValueOnce(createMockPromptResponse([{ type: 'text', text: 'Second' }]));
        const provider = new OpenCodeSDKProvider({
          config: { session_id: 'shared-v1', tools: { bash: true } },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        const firstCall = provider.callApi('First');
        await vi.waitFor(() => expect(mockSessionPrompt).toHaveBeenCalledTimes(1));
        const secondCall = provider.callApi('Second');
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        expect(mockSessionPrompt).toHaveBeenCalledTimes(1);

        firstPrompt.resolve(createMockPromptResponse([{ type: 'text', text: 'First' }]));
        await firstCall;
        await vi.waitFor(() => expect(mockSessionPrompt).toHaveBeenCalledTimes(2));
        await secondCall;

        expect(mockSessionPrompt.mock.calls.map(([parameters]) => parameters.body.tools)).toEqual([
          { '*': false, bash: true },
          { '*': false, bash: true },
        ]);
      });

      it('normalizes apply_patch in custom-agent tools on v1', async () => {
        const { importModule } = await import('../../src/esm');
        vi.mocked(importModule).mockImplementation(async (modulePath: string) => {
          if (/[/\\]dist[/\\]v2[/\\]/.test(modulePath)) {
            throw new Error('v2 unavailable');
          }
          return {
            createOpencode: mockCreateOpencode,
            createOpencodeClient: mockCreateOpencodeClient,
          };
        });
        const provider = new OpenCodeSDKProvider({
          config: {
            custom_agent: {
              description: 'patch reviewer',
              tools: { apply_patch: true },
            },
          },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect(mockCreateOpencode).toHaveBeenCalledWith(
          expect.objectContaining({
            config: expect.objectContaining({
              agent: {
                custom: expect.objectContaining({ tools: { edit: true } }),
              },
            }),
          }),
        );
        expect(mockSessionPrompt.mock.calls[0][0].body.tools).toEqual({
          '*': false,
          edit: true,
        });
      });

      it('rejects v1 explicit-session pattern permissions before prompting', async () => {
        const { importModule } = await import('../../src/esm');
        vi.mocked(importModule).mockImplementation(async (modulePath: string) => {
          if (/[/\\]dist[/\\]v2[/\\]/.test(modulePath)) {
            throw new Error('v2 unavailable');
          }
          return {
            createOpencode: mockCreateOpencode,
            createOpencodeClient: mockCreateOpencodeClient,
          };
        });
        const provider = new OpenCodeSDKProvider({
          config: { session_id: 'shared-v1', permission: { bash: 'deny' } },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        expect(result.error).toMatch(
          /supports permission rules only.*sessions started by Promptfoo/,
        );
        expect(mockSessionPrompt).not.toHaveBeenCalled();
      });

      it('rejects a v1 prompt-level policy before starting or poisoning the server', async () => {
        const { importModule } = await import('../../src/esm');
        vi.mocked(importModule).mockImplementation(async (modulePath: string) => {
          if (/[/\\]dist[/\\]v2[/\\]/.test(modulePath)) {
            throw new Error('v2 unavailable');
          }
          return {
            createOpencode: mockCreateOpencode,
            createOpencodeClient: mockCreateOpencodeClient,
          };
        });
        const provider = new OpenCodeSDKProvider({
          config: { permission: { bash: 'deny' } },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        const rejected = await provider.callApi('Override', {
          prompt: {
            raw: 'Override',
            label: 'override',
            config: { permission: { bash: 'allow' } },
          },
          vars: {},
        });

        expect(rejected.error).toMatch(/provider-level configuration/);
        expect(mockCreateOpencode).not.toHaveBeenCalled();

        const accepted = await provider.callApi('Base policy');
        expect(accepted.output).toBe('Test response');
        expect(mockCreateOpencode).toHaveBeenCalledWith(
          expect.objectContaining({
            config: expect.objectContaining({ permission: { bash: 'deny' } }),
          }),
        );
      });

      it('allows static v1 permissions on provider-owned persisted sessions', async () => {
        const { importModule } = await import('../../src/esm');
        vi.mocked(importModule).mockImplementation(async (modulePath: string) => {
          if (/[/\\]dist[/\\]v2[/\\]/.test(modulePath)) {
            throw new Error('v2 unavailable');
          }
          return {
            createOpencode: mockCreateOpencode,
            createOpencodeClient: mockCreateOpencodeClient,
          };
        });
        const provider = new OpenCodeSDKProvider({
          config: { persist_sessions: true, permission: { bash: 'deny' } },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        await provider.callApi('First');
        await provider.callApi('Second');

        expect(mockSessionCreate).toHaveBeenCalledTimes(1);
        expect(mockSessionPrompt).toHaveBeenCalledTimes(2);
        expect(mockSessionPrompt.mock.calls[0][0].body).not.toHaveProperty('tools');
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

      it('should normalize first-class skill tool parts into skillCalls metadata', async () => {
        mockSessionPrompt.mockResolvedValue(
          createMockPromptResponse([
            {
              type: 'tool',
              tool: 'skill',
              state: {
                status: 'completed',
                input: { name: 'review-standards' },
                metadata: {
                  name: 'review-standards',
                  dir: '/repo/.agents/skills/review-standards',
                },
              },
            },
            { type: 'text', text: 'Skill applied.' },
          ]),
        );

        const provider = new OpenCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Use the review-standards skill');

        expect(result.metadata?.skillCalls).toEqual([
          {
            name: 'review-standards',
            input: { name: 'review-standards' },
            path: path.join('/repo/.agents/skills/review-standards', 'SKILL.md'),
            source: 'tool',
          },
        ]);
      });

      it('should retain failed skill tool attempts as errored skillCalls', async () => {
        mockSessionPrompt.mockResolvedValue(
          createMockPromptResponse([
            {
              type: 'tool',
              tool: 'skill',
              state: {
                status: 'error',
                input: { name: 'missing-skill' },
              },
            },
          ]),
        );

        const provider = new OpenCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Use the missing skill');

        expect(result.metadata?.skillCalls).toEqual([
          {
            name: 'missing-skill',
            input: { name: 'missing-skill' },
            source: 'tool',
            is_error: true,
          },
        ]);
      });

      it('should capture skill calls from intermediate turns via session history', async () => {
        // The skill tool is invoked in turn 1; the final response (turn 2) has only
        // a text part. Without fetching the full session history, deriveSkillCalls
        // would see no tool parts and return [] — causing skill-used assertions to fail.
        // parentID on the assistant message anchors the slice to the user message
        // that triggered this prompt, so only the relevant turns are inspected.
        mockSessionPrompt.mockResolvedValue(
          createMockPromptResponseWithAnchors('All done.', {
            id: 'assistant-msg-1',
            parentID: 'user-msg-1',
          }),
        );
        // Session messages use { info: { id }, parts } structure (matching the real API)
        mockSessionMessages.mockResolvedValue([
          // Message from a PREVIOUS prompt — must not bleed into this evaluation
          {
            info: { id: 'user-msg-0', role: 'user' },
            parts: [{ type: 'text', text: 'Previous prompt' }],
          },
          {
            info: { id: 'assistant-msg-0', role: 'assistant' },
            parts: [
              {
                type: 'tool',
                tool: 'skill',
                state: {
                  status: 'completed',
                  input: { name: 'old-skill' },
                  metadata: { name: 'old-skill', dir: '/repo/.agents/skills/old-skill' },
                },
              },
            ],
          },
          // Messages belonging to THIS prompt (anchor: user-msg-1)
          {
            info: { id: 'user-msg-1', role: 'user' },
            parts: [{ type: 'text', text: 'Apply the code standards skill' }],
          },
          {
            info: { id: 'intermediate-msg-1', role: 'assistant' },
            parts: [
              {
                type: 'tool',
                tool: 'skill',
                state: {
                  status: 'completed',
                  input: { name: 'code-standards' },
                  metadata: {
                    name: 'code-standards',
                    dir: '/repo/.agents/skills/code-standards',
                  },
                },
              },
            ],
          },
          {
            info: { id: 'assistant-msg-1', role: 'assistant' },
            parts: [{ type: 'text', text: 'All done.' }],
          },
        ]);

        const provider = new OpenCodeSDKProvider({
          config: { tools: { skill: true } },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Apply the code standards skill');

        // Only the skill from THIS prompt's turns must appear — not old-skill
        expect(result.metadata?.skillCalls).toEqual([
          {
            name: 'code-standards',
            input: { name: 'code-standards' },
            path: path.join('/repo/.agents/skills/code-standards', 'SKILL.md'),
            source: 'tool',
          },
        ]);
      });

      it('should not include messages from a concurrent prompt on the same session', async () => {
        // If another prompt fires on the same persistent session while session.messages
        // is in flight, messages after the current assistant message must be excluded.
        // The end anchor (assistantMessage.id) bounds the slice from above.
        mockSessionPrompt.mockResolvedValue(
          createMockPromptResponseWithAnchors('Done.', {
            id: 'assistant-msg-1',
            parentID: 'user-msg-1',
          }),
        );
        mockSessionMessages.mockResolvedValue([
          {
            info: { id: 'user-msg-1', role: 'user' },
            parts: [{ type: 'text', text: 'Current prompt' }],
          },
          {
            info: { id: 'assistant-msg-1', role: 'assistant' },
            parts: [{ type: 'text', text: 'Done.' }],
          },
          // Messages from a CONCURRENT prompt — must not be included
          {
            info: { id: 'user-msg-2', role: 'user' },
            parts: [{ type: 'text', text: 'Concurrent prompt' }],
          },
          {
            info: { id: 'concurrent-intermediate', role: 'assistant' },
            parts: [
              {
                type: 'tool',
                tool: 'skill',
                state: {
                  status: 'completed',
                  input: { name: 'other-skill' },
                  metadata: { name: 'other-skill', dir: '/repo/.agents/skills/other-skill' },
                },
              },
            ],
          },
        ]);

        const provider = new OpenCodeSDKProvider({
          config: { tools: { skill: true } },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Current prompt');

        // other-skill from the concurrent prompt must not appear
        expect(result.metadata?.skillCalls).toBeUndefined();
      });

      it('should fall back to final response parts when session.messages fails', async () => {
        mockSessionPrompt.mockResolvedValue(
          createMockPromptResponse([
            {
              type: 'tool',
              tool: 'skill',
              state: {
                status: 'completed',
                input: { name: 'review-standards' },
                metadata: {
                  name: 'review-standards',
                  dir: '/repo/.agents/skills/review-standards',
                },
              },
            },
            { type: 'text', text: 'Done.' },
          ]),
        );
        mockSessionMessages.mockRejectedValue(new Error('messages endpoint unavailable'));

        const provider = new OpenCodeSDKProvider({
          config: { tools: { skill: true } },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Use skill');

        // The fetch was attempted and failed
        expect(mockSessionMessages).toHaveBeenCalledTimes(1);
        // Graceful degradation: skill in final parts is still captured
        expect(result.metadata?.skillCalls).toEqual([
          {
            name: 'review-standards',
            input: { name: 'review-standards' },
            path: path.join('/repo/.agents/skills/review-standards', 'SKILL.md'),
            source: 'tool',
          },
        ]);
      });

      it('should fall back to final response parts when the parent message is missing from history', async () => {
        // A truncated/paginated history (or a server that does not echo the
        // parent user message) must not cause the whole session history to be
        // attributed to this prompt — that would resurrect cross-prompt bleed.
        mockSessionPrompt.mockResolvedValue(
          createMockPromptResponseWithAnchors('Done.', {
            id: 'assistant-msg-9',
            parentID: 'user-msg-9',
          }),
        );
        // History from earlier prompts only; user-msg-9 is absent
        mockSessionMessages.mockResolvedValue([
          {
            info: { id: 'assistant-msg-0', role: 'assistant' },
            parts: [
              {
                type: 'tool',
                tool: 'skill',
                state: {
                  status: 'completed',
                  input: { name: 'old-skill' },
                  metadata: { name: 'old-skill', dir: '/repo/.agents/skills/old-skill' },
                },
              },
            ],
          },
          {
            info: { id: 'assistant-msg-9', role: 'assistant' },
            parts: [{ type: 'text', text: 'Done.' }],
          },
        ]);

        const provider = new OpenCodeSDKProvider({
          config: { tools: { skill: true } },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Current prompt');

        // old-skill from the unanchored history must not be attributed
        expect(result.metadata?.skillCalls).toBeUndefined();
      });

      it('should not attribute later skill calls when the assistant end anchor is missing from history', async () => {
        mockSessionPrompt.mockResolvedValue(
          createMockPromptResponseWithAnchors('Done.', {
            id: 'assistant-msg-1',
            parentID: 'user-msg-1',
          }),
        );
        mockSessionMessages.mockResolvedValue([
          {
            info: { id: 'user-msg-1', role: 'user' },
            parts: [{ type: 'text', text: 'Current prompt' }],
          },
          {
            info: { id: 'concurrent-assistant', role: 'assistant' },
            parts: [
              {
                type: 'tool',
                tool: 'skill',
                state: {
                  status: 'completed',
                  input: { name: 'other-skill' },
                  metadata: { name: 'other-skill', dir: '/repo/.agents/skills/other-skill' },
                },
              },
            ],
          },
        ]);

        const provider = new OpenCodeSDKProvider({
          config: { tools: { skill: true } },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Current prompt');

        expect(mockSessionMessages).toHaveBeenCalledTimes(1);
        expect(result.metadata?.skillCalls).toBeUndefined();
      });

      it('should skip the history fetch when the response has no assistant end anchor', async () => {
        const promptResponse = createMockPromptResponse([{ type: 'text', text: 'Done.' }]);
        (promptResponse.data.info as Record<string, unknown>).parentID = 'user-msg-1';
        delete (promptResponse.data.info as Record<string, unknown>).id;
        mockSessionPrompt.mockResolvedValue(promptResponse);

        const provider = new OpenCodeSDKProvider({
          config: { tools: { skill: true } },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Current prompt');

        expect(mockSessionMessages).not.toHaveBeenCalled();
        expect(result.metadata?.skillCalls).toBeUndefined();
      });

      it('should skip the history fetch when the response has no parentID anchor', async () => {
        const promptResponse = createMockPromptResponse([{ type: 'text', text: 'Done.' }]);
        delete (promptResponse.data.info as Record<string, unknown>).parentID;
        mockSessionPrompt.mockResolvedValue(promptResponse);

        const provider = new OpenCodeSDKProvider({
          config: { tools: { skill: true } },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Current prompt');

        expect(mockSessionMessages).not.toHaveBeenCalled();
        expect(result.metadata?.skillCalls).toBeUndefined();
      });

      it('should skip session.messages fetch when skill tool is disabled', async () => {
        const provider = new OpenCodeSDKProvider({
          config: { tools: { skill: false } },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider.callApi('Do something without skills');

        expect(mockSessionMessages).not.toHaveBeenCalled();
      });

      it('should fetch session history when skill is allowed through the permission config', async () => {
        // The tool policy denies everything by default via the `*` wildcard, but
        // permission rules are applied after it and win on a last-match basis.
        mockSessionPrompt.mockResolvedValue(
          createMockPromptResponseWithAnchors('All done.', {
            id: 'assistant-msg-1',
            parentID: 'user-msg-1',
          }),
        );
        mockSessionMessages.mockResolvedValue([
          {
            info: { id: 'user-msg-1', role: 'user' },
            parts: [{ type: 'text', text: 'Use the skill' }],
          },
          {
            info: { id: 'intermediate-msg-1', role: 'assistant' },
            parts: [
              {
                type: 'tool',
                tool: 'skill',
                state: { status: 'completed', input: { name: 'code-standards' } },
              },
            ],
          },
          {
            info: { id: 'assistant-msg-1', role: 'assistant' },
            parts: [{ type: 'text', text: 'All done.' }],
          },
        ]);

        const provider = new OpenCodeSDKProvider({
          config: { permission: { skill: 'allow' } },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Use the skill');

        expect(mockSessionMessages).toHaveBeenCalledTimes(1);
        expect(result.metadata?.skillCalls).toEqual([
          { name: 'code-standards', input: { name: 'code-standards' }, source: 'tool' },
        ]);
      });

      it('should fetch session history when a patterned policy allows some skills', async () => {
        mockSessionPrompt.mockResolvedValue(
          createMockPromptResponseWithAnchors('All done.', {
            id: 'assistant-msg-1',
            parentID: 'user-msg-1',
          }),
        );
        mockSessionMessages.mockResolvedValue([
          {
            info: { id: 'user-msg-1', role: 'user' },
            parts: [{ type: 'text', text: 'Use the code standards skill' }],
          },
          {
            info: { id: 'intermediate-msg-1', role: 'assistant' },
            parts: [
              {
                type: 'tool',
                tool: 'skill',
                state: { status: 'completed', input: { name: 'code-standards' } },
              },
            ],
          },
          {
            info: { id: 'assistant-msg-1', role: 'assistant' },
            parts: [{ type: 'text', text: 'All done.' }],
          },
        ]);

        const provider = new OpenCodeSDKProvider({
          config: {
            permission: {
              skill: {
                '*': 'allow',
                'blocked-skill': 'deny',
              },
            },
          },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Use the code standards skill');

        expect(mockSessionMessages).toHaveBeenCalledTimes(1);
        expect(result.metadata?.skillCalls).toEqual([
          { name: 'code-standards', input: { name: 'code-standards' }, source: 'tool' },
        ]);
      });

      it('should skip session.messages fetch when tools config is omitted (skill disabled by default)', async () => {
        // The default tool policy denies every tool through the `*` wildcard, so
        // no skill parts can exist and the fetch must be skipped.
        const provider = new OpenCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Do something with default tools');

        expect(mockSessionMessages).not.toHaveBeenCalled();
        expect(result.output).toBe('Test response');
      });

      it('should not fetch session history when the call is aborted during the prompt', async () => {
        const controller = new AbortController();
        mockSessionPrompt.mockImplementation(async () => {
          controller.abort();
          return createMockPromptResponse([{ type: 'text', text: 'Late response' }]);
        });

        const provider = new OpenCodeSDKProvider({
          config: { tools: { skill: true } },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Do something', undefined, {
          abortSignal: controller.signal,
        });

        expect(result.error).toBe('OpenCode SDK call aborted');
        expect(mockSessionMessages).not.toHaveBeenCalled();
      });

      it('should forward the abort signal to session.messages and honor aborts during the fetch', async () => {
        const controller = new AbortController();
        mockSessionMessages.mockImplementation(async () => {
          controller.abort();
          return [];
        });

        const provider = new OpenCodeSDKProvider({
          config: { tools: { skill: true } },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Do something', undefined, {
          abortSignal: controller.signal,
        });

        // The v2 client takes the fetch options (including the signal) as a
        // second argument, so a timeout can cancel the in-flight history fetch.
        expect(mockSessionMessages).toHaveBeenCalledWith(
          expect.objectContaining({ sessionID: 'test-session-123' }),
          { signal: controller.signal },
        );
        // An abort that fires while the history fetch is in flight must not
        // produce (or cache) a successful response.
        expect(result.error).toBe('OpenCode SDK call aborted');
        expect(result.output).toBeUndefined();
        expect(mockSessionAbort).not.toHaveBeenCalled();
      });

      it('should use the v1 nested request shape for the history fetch when v2 is unavailable', async () => {
        const { importModule } = await import('../../src/esm');
        vi.mocked(importModule).mockImplementation(async (modulePath: string) => {
          if (/[/\\]dist[/\\]v2[/\\]/.test(modulePath)) {
            throw new Error('v2 unavailable');
          }
          return {
            createOpencode: mockCreateOpencode,
            createOpencodeClient: mockCreateOpencodeClient,
          };
        });
        mockSessionPrompt.mockResolvedValue(
          createMockPromptResponseWithAnchors('All done.', {
            id: 'assistant-msg-1',
            parentID: 'user-msg-1',
          }),
        );
        mockSessionMessages.mockResolvedValue([
          {
            info: { id: 'user-msg-1', role: 'user' },
            parts: [{ type: 'text', text: 'Use the skill' }],
          },
          {
            info: { id: 'intermediate-msg-1', role: 'assistant' },
            parts: [
              {
                type: 'tool',
                tool: 'skill',
                state: { status: 'completed', input: { name: 'code-standards' } },
              },
            ],
          },
          {
            info: { id: 'assistant-msg-1', role: 'assistant' },
            parts: [{ type: 'text', text: 'All done.' }],
          },
        ]);

        const provider = new OpenCodeSDKProvider({
          config: { tools: { skill: true } },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Use the skill');

        expect(mockSessionMessages).toHaveBeenCalledWith({
          path: { id: 'test-session-123', sessionID: 'test-session-123' },
          query: undefined,
        });
        expect(result.metadata?.skillCalls).toEqual([
          { name: 'code-standards', input: { name: 'code-standards' }, source: 'tool' },
        ]);
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

      it('propagates SDK error envelopes', async () => {
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
        mockSessionPrompt.mockResolvedValue({ error: 'upstream unavailable' });

        const provider = new OpenCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result.error).toBe(
          'Error calling OpenCode SDK: OpenCode SDK prompt error: upstream unavailable',
        );
        errorSpy.mockRestore();
      });

      it('retains public SDK HTTP error tags and sibling status without exposing the response body', async () => {
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
        mockSessionPrompt
          .mockResolvedValueOnce({
            error: { _tag: 'BadRequest' },
            response: new Response('synthetic-private-response-body', { status: 400 }),
          })
          .mockResolvedValueOnce({
            error: { _tag: 'InvalidRequestError', message: 'The model field is required' },
            response: new Response('synthetic-private-response-body', { status: 400 }),
          })
          .mockResolvedValueOnce({
            error: { name: 'NotFoundError', data: { message: 'Session no longer exists' } },
            response: new Response('synthetic-private-response-body', { status: 404 }),
          });
        const provider = new OpenCodeSDKProvider({ env: { ANTHROPIC_API_KEY: 'test-api-key' } });

        const bad = await provider.callApi('bad request');
        const invalid = await provider.callApi('invalid request');
        const missing = await provider.callApi('missing request');

        expect(bad.error).toContain('BadRequest: HTTP 400');
        expect(invalid.error).toContain(
          'InvalidRequestError: HTTP 400: The model field is required',
        );
        expect(missing.error).toContain('NotFoundError: HTTP 404: Session no longer exists');
        expect(JSON.stringify({ bad, invalid, missing, logs: errorSpy.mock.calls })).not.toContain(
          'synthetic-private-response-body',
        );
      });

      it('preserves the documented assistant content-filter classification', async () => {
        const response = createMockPromptResponse([]);
        mockSessionPrompt.mockResolvedValueOnce({
          data: {
            ...response.data,
            info: {
              ...response.data.info,
              error: { name: 'ContentFilterError', data: { message: 'Request rejected' } },
            },
          },
        });
        const provider = new OpenCodeSDKProvider({ env: { ANTHROPIC_API_KEY: 'test-api-key' } });

        const result = await provider.callApi('content filter');

        expect(result.error).toBeUndefined();
        expect(result.output).toEqual(expect.stringMatching(/(refus|cannot|can’t|can't)/i));
        expect(result.guardrails).toMatchObject({ flagged: true, flaggedOutput: true });
      });

      it('redacts structured SDK errors without exposing arbitrary headers, bodies, or credentials', async () => {
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
        const configured = 'synthetic-config-secret-0919';
        const environment = 'synthetic-env-secret-0919';
        const bearer = 'synthetic-bearer-0919';
        const queryKey = 'synthetic-query-secret-0919';
        const body = 'synthetic-raw-body-0919';
        const upstream: Record<string, unknown> = {
          name: 'APIError',
          data: {
            statusCode: 502,
            message: `Failed: ${configured} ${environment} Bearer ${bearer} https://example.test/?api_key=${queryKey}`,
            responseHeaders: { authorization: `Bearer ${body}` },
            responseBody: body,
            opaque: 123n,
          },
        };
        upstream.loop = upstream;
        mockSessionPrompt.mockResolvedValue({ error: upstream });
        const provider = new OpenCodeSDKProvider({
          config: { provider_id: 'anthropic', apiKey: configured },
          env: { ANTHROPIC_API_KEY: environment },
        });

        const result = await provider.callApi('Test prompt');

        expect(result.error).toContain('OpenCode SDK prompt error: APIError: HTTP 502: Failed:');
        expect(result.error).toContain('[REDACTED]');
        expect(result.output).toBeUndefined();
        const observable = JSON.stringify({ result, errors: errorSpy.mock.calls });
        for (const value of [configured, environment, bearer, queryKey, body]) {
          expect(observable).not.toContain(value);
        }
        expect(observable).not.toContain('responseHeaders');
        expect(observable).not.toContain('responseBody');
      });

      it.each([
        {
          name: 'custom MCP headers and OAuth',
          config: {
            mcp: {
              gateway: {
                type: 'remote',
                url: 'https://example.test/mcp',
                headers: { 'X-Gateway-Key': 'synthetic-custom-gateway-0919' },
                oauth: {
                  clientId: 'synthetic-client-id-0919',
                  clientSecret: 'synthetic-oauth-secret-0919',
                },
              },
            },
          },
          secrets: [
            'synthetic-custom-gateway-0919',
            'synthetic-client-id-0919',
            'synthetic-oauth-secret-0919',
          ],
        },
        {
          name: 'MCP Authorization and Cookie header components echoed without their schemes',
          config: {
            mcp: {
              gateway: {
                type: 'remote',
                url: 'https://example.test/mcp',
                headers: {
                  Authorization: 'Bearer synthetic-bare-bearer-0919',
                  'Proxy-Authorization': `Basic ${Buffer.from('synthetic-basic-user-0919:synthetic-basic-pass-0919').toString('base64')}`,
                  Cookie: 'session_id=synthetic-cookie-0919; custom=synthetic-cookie-extra-0919',
                },
              },
            },
          },
          secrets: [
            'synthetic-bare-bearer-0919',
            Buffer.from('synthetic-basic-user-0919:synthetic-basic-pass-0919').toString('base64'),
            'synthetic-basic-user-0919',
            'synthetic-basic-pass-0919',
            'synthetic-cookie-0919',
            'synthetic-cookie-extra-0919',
          ],
        },
        {
          name: 'MCP subprocess environment and command arguments',
          config: {
            mcp: {
              gateway: {
                type: 'local',
                command: ['example-server', '--credential=synthetic-command-0919'],
                environment: { CUSTOM_GATEWAY: 'synthetic-local-env-0919' },
              },
            },
          },
          secrets: ['synthetic-command-0919', 'synthetic-local-env-0919'],
        },
        {
          name: 'structured MCP subprocess authorization and connection environment values',
          config: {
            mcp: {
              gateway: {
                type: 'local',
                command: ['example-server'],
                environment: {
                  MCP_AUTHORIZATION: 'Bearer private_gateway_synthetic_value',
                  DATABASE_URL: 'postgres://example:synthetic_database_pass@db.example/db',
                },
              },
            },
          },
          secrets: ['private_gateway_synthetic_value', 'synthetic_database_pass'],
        },
        {
          name: 'opaque MCP path credentials without URL userinfo or query parameters',
          config: {
            mcp: {
              gateway: {
                type: 'remote',
                url: 'https://example.test/mcp/5d6c7112-5990-4ef7-8f20-87ae7b13bcca',
              },
            },
          },
          secrets: [
            '5d6c7112-5990-4ef7-8f20-87ae7b13bcca',
            'https://example.test/mcp/5d6c7112-5990-4ef7-8f20-87ae7b13bcca',
          ],
        },
        {
          name: 'short configured path credentials echoed in a different URL',
          config: {
            mcp: { gateway: { type: 'remote', url: 'https://example.test/mcp/q7x9' } },
          },
          secrets: ['q7x9', 'https://different.test/mcp/q7x9/detail'],
        },
        {
          name: 'path and query credentials in a malformed MCP URL',
          config: {
            mcp: {
              gateway: {
                type: 'remote',
                url: 'https://example:synthetic-invalid-password@[bad]/mcp/synthetic-invalid-path?opaque=synthetic-invalid-query',
              },
            },
          },
          secrets: [
            'synthetic-invalid-password',
            'synthetic-invalid-path',
            'synthetic-invalid-query',
          ],
        },
        {
          name: 'non-Bearer authorization schemes and comma-separated credential parameters',
          config: {
            mcp: {
              gateway: {
                type: 'remote',
                url: 'https://example.test/mcp',
                headers: {
                  Authorization: 'Token private_gateway_synthetic_value',
                  'X-Authorization':
                    'Digest username="synthetic_user_value", response="synthetic_digest_response"',
                },
              },
            },
          },
          secrets: [
            'private_gateway_synthetic_value',
            'synthetic_user_value',
            'synthetic_digest_response',
          ],
        },
        {
          name: 'equivalent lowercase and twice-percent-encoded provider keys',
          config: { provider_id: 'groq', apiKey: 'a/b/cdefgABC' },
          secrets: ['a%2fb%2fcdefgABC', 'a%2Fb%2FcdefgABC', 'a%252fb%252fcdefgABC'],
        },
        {
          name: 'MCP remote URL credentials and arbitrary query parameters',
          config: {
            mcp: {
              gateway: {
                type: 'remote',
                url: 'https://synthetic-user-0919:synthetic-pass-0919@example.test/mcp?opaque=synthetic%2Bquery-0919',
              },
            },
          },
          secrets: [
            'synthetic-user-0919',
            'synthetic-pass-0919',
            'synthetic+query-0919',
            'synthetic%2Bquery-0919',
          ],
        },
        {
          name: 'literal plus signs in encoded URL userinfo separately from form query encoding',
          config: {
            mcp: {
              gateway: {
                type: 'remote',
                url: 'https://example:abc+def%24secret@example.test/mcp?opaque=synthetic+query%24value',
              },
            },
          },
          secrets: ['abc+def$secret', 'abc+def%24secret', 'synthetic query$value'],
        },
        {
          name: 'the OpenCode base URL',
          config: {
            baseUrl:
              'https://synthetic-base-user-0919:synthetic-base-pass-0919@example.test/?opaque=synthetic-base-value-0919',
          },
          secrets: [
            'synthetic-base-user-0919',
            'synthetic-base-pass-0919',
            'synthetic-base-value-0919',
          ],
        },
      ] satisfies Array<{ name: string; config: OpenCodeSDKConfig; secrets: string[] }>)(
        'redacts credentials from $name in SDK and assistant errors and logs',
        async ({ config, secrets }) => {
          const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
          const details = {
            name: 'APIError',
            data: { message: `upstream rejected supplied values: ${secrets.join(' | ')}` },
          };
          const response = createMockPromptResponse([]);
          mockSessionPrompt.mockResolvedValueOnce({ error: details }).mockResolvedValueOnce({
            data: { ...response.data, info: { ...response.data.info, error: details } },
          });
          const provider = new OpenCodeSDKProvider({
            config: config as OpenCodeSDKConfig,
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });

          const sdkFailure = await provider.callApi('top-level failure');
          const assistantFailure = await provider.callApi('assistant failure');

          for (const result of [sdkFailure, assistantFailure]) {
            expect(result.error).toContain('APIError: upstream rejected supplied values:');
            expect(result.error).toContain('[REDACTED]');
          }
          const observable = JSON.stringify({
            sdkFailure,
            assistantFailure,
            errors: errorSpy.mock.calls,
          });
          for (const secret of secrets) {
            expect(observable).not.toContain(secret);
          }
        },
      );

      it('preserves a useful diagnostic for an ordinary configured MCP endpoint', async () => {
        mockSessionPrompt.mockResolvedValueOnce({
          error: {
            name: 'APIError',
            data: { message: 'The mcp endpoint at /mcp returned an unexpected status' },
          },
        });
        const provider = new OpenCodeSDKProvider({
          config: { mcp: { gateway: { type: 'remote', url: 'https://example.test/mcp' } } },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('ordinary MCP diagnostic');

        expect(result.error).toContain('The mcp endpoint at /mcp returned an unexpected status');
      });

      it('redacts the credential that initialized the reused server when later prompts omit or replace it', async () => {
        const firstToken = 'synthetic-first-server-credential-0919';
        const nextToken = 'synthetic-current-prompt-credential-0919';
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
        const withMcp = (token: string): CallApiContextParams => ({
          vars: {},
          prompt: {
            raw: 'configured prompt',
            label: 'configured prompt',
            config: {
              mcp: {
                gateway: {
                  type: 'remote',
                  url: 'https://example.test/mcp',
                  headers: { Authorization: `Bearer ${token}` },
                },
              },
            },
          },
        });
        const assistant = createMockPromptResponse([]);
        const error = {
          name: 'APIError',
          data: { message: `Rejected supplied values ${firstToken} | ${nextToken}` },
        };
        mockSessionPrompt
          .mockResolvedValueOnce(
            createMockPromptResponse([{ type: 'text', text: 'server initialized' }]),
          )
          .mockResolvedValueOnce({
            error: { name: 'APIError', data: { message: `Rejected supplied value ${firstToken}` } },
          })
          .mockResolvedValueOnce({
            data: { ...assistant.data, info: { ...assistant.data.info, error } },
          });
        const provider = new OpenCodeSDKProvider({ env: { ANTHROPIC_API_KEY: 'test-api-key' } });

        await provider.callApi('initial prompt', withMcp(firstToken));
        const omitted = await provider.callApi('omitted configuration');
        const replaced = await provider.callApi('replaced configuration', withMcp(nextToken));

        expect(mockCreateOpencode).toHaveBeenCalledTimes(1);
        expect(mockCreateOpencode).toHaveBeenCalledWith(
          expect.objectContaining({
            config: expect.objectContaining({
              mcp: expect.objectContaining({
                gateway: expect.objectContaining({
                  headers: { Authorization: `Bearer ${firstToken}` },
                }),
              }),
            }),
          }),
        );
        for (const result of [omitted, replaced]) {
          expect(result.error).toContain('Rejected supplied value');
          expect(result.error).toContain('[REDACTED]');
        }
        const observable = JSON.stringify({ omitted, replaced, logs: errorSpy.mock.calls });
        expect(observable).not.toContain(firstToken);
        expect(observable).not.toContain(nextToken);
      });

      it('retains forwarded environment credentials until the server has closed', async () => {
        const previous = 'synthetic-initial-forwarded-0919';
        const next = 'synthetic-replacement-forwarded-0919';
        vi.stubEnv('SYNTHETIC_GATEWAY_TOKEN', previous);
        try {
          const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
          const provider = new OpenCodeSDKProvider();
          mockSessionPrompt
            .mockResolvedValueOnce(
              createMockPromptResponse([{ type: 'text', text: 'initialized' }]),
            )
            .mockResolvedValue({
              error: { name: 'APIError', data: { message: `Rejected previous value ${previous}` } },
            });

          await provider.callApi('initial process environment');
          vi.stubEnv('SYNTHETIC_GATEWAY_TOKEN', next);
          const reused = await provider.callApi('changed process environment');

          expect(reused.error).toContain('[REDACTED]');
          expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(previous);
          await provider.cleanup();
          expect(mockServerClose).toHaveBeenCalledOnce();
          errorSpy.mockClear();
          const restarted = await provider.callApi('fresh server environment');

          expect(mockCreateOpencode).toHaveBeenCalledTimes(2);
          expect(restarted.error).toContain(previous);
        } finally {
          vi.unstubAllEnvs();
        }
      });

      it('retains previous credentials for a request still returning when cleanup closes the server', async () => {
        const previous = 'synthetic-inflight-server-credential-0919';
        const pending = createDeferred<unknown>();
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
        mockSessionPrompt
          .mockResolvedValueOnce(createMockPromptResponse([{ type: 'text', text: 'initialized' }]))
          .mockImplementationOnce(() => pending.promise);
        const provider = new OpenCodeSDKProvider();
        await provider.callApi('initial prompt credential', {
          vars: {},
          prompt: {
            raw: 'initial',
            label: 'initial',
            config: {
              mcp: {
                gateway: {
                  type: 'remote',
                  url: 'https://example.test/mcp',
                  headers: { Authorization: `Bearer ${previous}` },
                },
              },
            },
          },
        });

        const inFlight = provider.callApi('later prompt without configuration');
        await vi.waitFor(() => expect(mockSessionPrompt).toHaveBeenCalledTimes(2));
        await provider.cleanup();
        expect(mockServerClose).toHaveBeenCalledOnce();
        pending.resolve({
          error: { name: 'APIError', data: { message: `Rejected previous value ${previous}` } },
        });
        const result = await inFlight;

        expect(result.error).toContain('[REDACTED]');
        expect(JSON.stringify({ result, logs: errorSpy.mock.calls })).not.toContain(previous);
      });

      it('keeps prior credentials redacted if the SDK cannot confirm the server closed', async () => {
        const previous = 'synthetic-unclosed-server-0919';
        const next = 'synthetic-next-server-0919';
        vi.stubEnv('SYNTHETIC_GATEWAY_TOKEN', previous);
        try {
          const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
          const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
          mockSessionPrompt
            .mockResolvedValueOnce(
              createMockPromptResponse([{ type: 'text', text: 'initialized' }]),
            )
            .mockResolvedValueOnce({
              error: { name: 'APIError', data: { message: `Previous value ${previous}` } },
            });
          mockServerClose.mockImplementationOnce(() => {
            throw new Error(`Close failed for ${previous}`);
          });
          const provider = new OpenCodeSDKProvider();

          await provider.callApi('initial unclosed server');
          vi.stubEnv('SYNTHETIC_GATEWAY_TOKEN', next);
          await provider.cleanup();
          const failure = await provider.callApi('after unverified closure');

          expect(failure.error).toContain('[REDACTED]');
          expect(debugSpy).toHaveBeenCalledWith('Failed to close OpenCode server', {
            error: expect.stringContaining('[REDACTED]'),
          });
          expect(
            JSON.stringify({ debug: debugSpy.mock.calls, errors: errorSpy.mock.calls }),
          ).not.toContain(previous);
        } finally {
          vi.unstubAllEnvs();
        }
      });

      it('sanitizes persistent-session cleanup failures with the running server credentials', async () => {
        const previous = 'synthetic-persistent-session-credential-0919';
        vi.stubEnv('SYNTHETIC_GATEWAY_TOKEN', previous);
        try {
          const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
          const provider = new OpenCodeSDKProvider({ config: { persist_sessions: true } });
          await provider.callApi('persistent credential');
          vi.stubEnv('SYNTHETIC_GATEWAY_TOKEN', 'synthetic-next-session-credential-0919');
          mockSessionDelete.mockRejectedValueOnce(new Error(`Deleting with ${previous}`));

          await provider.cleanup();

          expect(debugSpy).toHaveBeenCalledWith('Failed to delete persistent OpenCode session', {
            sessionId: 'test-session-123',
            error: expect.stringContaining('[REDACTED]'),
          });
          expect(JSON.stringify(debugSpy.mock.calls)).not.toContain(previous);
        } finally {
          vi.unstubAllEnvs();
        }
      });

      it('does not replace the SDK diagnostic when a provider ID has an invalid runtime type', async () => {
        mockSessionPrompt.mockRejectedValueOnce(new Error('original SDK failure'));
        const provider = new OpenCodeSDKProvider({
          config: { provider_id: 42 } as unknown as OpenCodeSDKConfig,
        });

        await expect(provider.callApi('invalid provider ID')).resolves.toMatchObject({
          error: expect.stringContaining('original SDK failure'),
        });
      });

      it('redacts credentials inherited by the OpenCode server for additional providers', async () => {
        const groq = 'gsk_synthetic-groq-value-0919';
        const applicationKey = 'synthetic-private-key-0919';
        const proxyPassword = 'synthetic-proxy-pass-0919';
        const signingKey = 'synthetic-signing-key-0919';
        const legacyPassword = 'synthetic-legacy-pwd-0919';
        vi.stubEnv('GROQ_API_KEY', groq);
        vi.stubEnv('CUSTOM_PRIVATE_KEY', applicationKey);
        vi.stubEnv('CUSTOM_PROXY_URL', `https://proxy-user:${proxyPassword}@proxy.test`);
        vi.stubEnv('CUSTOM_SIGNING_KEY', signingKey);
        vi.stubEnv('LEGACY_PWD', legacyPassword);
        try {
          const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
          const values = [groq, applicationKey, proxyPassword, signingKey, legacyPassword];
          const details = {
            name: 'APIError',
            data: { message: `upstream rejected supplied values: ${values.join(' | ')}` },
          };
          const response = createMockPromptResponse([]);
          mockSessionPrompt.mockResolvedValueOnce({ error: details }).mockResolvedValueOnce({
            data: { ...response.data, info: { ...response.data.info, error: details } },
          });
          const provider = new OpenCodeSDKProvider({ config: { provider_id: 'groq' } });

          const sdkFailure = await provider.callApi('top-level inherited credential failure');
          const assistantFailure = await provider.callApi('assistant inherited credential failure');

          expect(mockCreateOpencode).toHaveBeenCalledWith(
            expect.objectContaining({ env: expect.objectContaining({ GROQ_API_KEY: groq }) }),
          );
          for (const result of [sdkFailure, assistantFailure]) {
            expect(result.error).toContain('APIError: upstream rejected supplied values:');
            expect(result.error).toContain('[REDACTED]');
          }
          const observable = JSON.stringify({
            sdkFailure,
            assistantFailure,
            errors: errorSpy.mock.calls,
          });
          for (const value of values) {
            expect(observable).not.toContain(value);
          }
        } finally {
          vi.unstubAllEnvs();
        }
      });

      it.each([
        ['null server', null],
        ['local server with no command', { type: 'local' }],
      ])(
        'returns rather than masking the original error for a malformed MCP %s',
        async (_name, server) => {
          const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
          const provider = new OpenCodeSDKProvider({
            config: { mcp: { malformed: server } } as unknown as OpenCodeSDKConfig,
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });

          const result = await provider.callApi('malformed MCP config');

          expect(result.error).toMatch(/^Error calling OpenCode SDK: .+/);
          expect(result.output).toBeUndefined();
          expect(errorSpy).toHaveBeenCalledWith('Error calling OpenCode SDK', {
            error: result.error?.replace('Error calling OpenCode SDK: ', ''),
          });
        },
      );

      it('preserves an SDK failure when unused MCP header or environment config has malformed values', async () => {
        mockSessionPrompt.mockRejectedValueOnce(new Error('original provider failure'));
        const provider = new OpenCodeSDKProvider({
          config: {
            mcp: {
              remote: { type: 'remote', url: 'https://example.test/mcp', headers: { sample: 123 } },
              local: { type: 'local', command: ['example-server', null], environment: 'malformed' },
            },
          } as unknown as OpenCodeSDKConfig,
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        await expect(provider.callApi('malformed credential metadata')).resolves.toMatchObject({
          error: 'Error calling OpenCode SDK: original provider failure',
        });
      });

      it('surfaces assistant-message errors and does not cache them as successful empty answers', async () => {
        enableCache();
        const first = createMockPromptResponse([]);
        mockSessionPrompt
          .mockResolvedValueOnce({
            data: {
              ...first.data,
              info: {
                ...first.data.info,
                error: {
                  name: 'ProviderAuthError',
                  data: { message: 'Provider rejected authentication' },
                },
              },
            },
          })
          .mockResolvedValueOnce(createMockPromptResponse([{ type: 'text', text: 'recovered' }]));
        const provider = new OpenCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        const failure = await provider.callApi('same error-envelope prompt');
        const success = await provider.callApi('same error-envelope prompt');

        expect(failure.error).toContain('ProviderAuthError: Provider rejected authentication');
        expect(failure.output).toBeUndefined();
        expect(failure.cached).not.toBe(true);
        expect(success.output).toBe('recovered');
        expect(mockSessionPrompt).toHaveBeenCalledTimes(2);
      });

      it.each([
        ['false', false],
        ['zero', 0],
        ['empty', ''],
        ['opaque object', { name: 'synthetic-secret-name-0919', detail: 2n }],
      ])(
        'handles a malformed but present SDK error without stringifying arbitrary data (%s)',
        async (_name, error) => {
          const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
          mockSessionPrompt.mockResolvedValue({ error });
          const provider = new OpenCodeSDKProvider({ env: { ANTHROPIC_API_KEY: 'test-api-key' } });

          const result = await provider.callApi('Test prompt');

          expect(result.error).toBe(
            'Error calling OpenCode SDK: OpenCode SDK prompt error: Unknown OpenCode error',
          );
          expect(result.output).toBeUndefined();
          expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('synthetic-secret-name-0919');
        },
      );

      it('accepts an explicitly empty SDK error next to successful data and bounds thrown diagnostics', async () => {
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
        mockSessionPrompt.mockResolvedValueOnce({
          ...createMockPromptResponse([{ type: 'text', text: 'successful' }]),
          error: null,
        });
        const provider = new OpenCodeSDKProvider({ env: { ANTHROPIC_API_KEY: 'test-api-key' } });
        expect((await provider.callApi('valid SDK response')).output).toBe('successful');

        mockSessionPrompt.mockRejectedValueOnce(new Error(`before\n${'x'.repeat(800)}`));
        const result = await provider.callApi('uncached thrown response');

        expect(result.error).toContain('before ');
        expect(result.error).not.toContain('\n');
        expect(result.error!.length).toBeLessThanOrEqual(
          'Error calling OpenCode SDK: '.length + 500,
        );
        expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('x'.repeat(550));
      });

      it('does not abort a server session that already returned an SDK error envelope', async () => {
        const controller = new AbortController();
        mockSessionPrompt.mockResolvedValue({ error: 'upstream unavailable' });
        mockSessionDelete.mockImplementationOnce(async () => controller.abort());
        const provider = new OpenCodeSDKProvider({ env: { ANTHROPIC_API_KEY: 'test-api-key' } });

        const result = await provider.callApi('Test prompt', undefined, {
          abortSignal: controller.signal,
        });

        expect(result.error).toContain('upstream unavailable');
        expect(mockSessionAbort).not.toHaveBeenCalled();
      });

      it('preserves a successful response when temporary-directory cleanup fails', async () => {
        const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
        rmSpy.mockRejectedValueOnce(new Error('cleanup failed'));

        const provider = new OpenCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result.output).toBe('Test response');
        expect(debugSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to remove temp directory'),
          expect.objectContaining({ workingDir: '/tmp/test-temp-dir', error: expect.any(Error) }),
        );
        debugSpy.mockRestore();
      });

      it('preserves a provider failure when cleanup fails and retries the temporary directory', async () => {
        mockSessionPrompt.mockRejectedValueOnce(new Error('original provider failure'));
        rmSpy.mockRejectedValueOnce(new Error('initial directory cleanup failure'));
        const provider = new OpenCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('uncached failed request');

        expect(result.error).toContain('original provider failure');
        expect(result.error).not.toContain('directory cleanup');
        await provider.cleanup();
        expect(rmSpy).toHaveBeenCalledTimes(2);
        expect(rmSpy).toHaveBeenLastCalledWith('/tmp/test-temp-dir', {
          recursive: true,
          force: true,
        });
      });

      it('should handle empty parts in response', async () => {
        mockSessionPrompt.mockResolvedValue(createMockPromptResponse([], { input: 5, output: 10 }));

        const provider = new OpenCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result.output).toBe('');
      });

      it('should prefer structured payloads for json_schema output', async () => {
        mockSessionPrompt.mockResolvedValue(
          createMockPromptResponse(
            [{ type: 'text', text: '```json\n{"language":"python"}\n```' }],
            { input: 5, output: 10 },
            0.0005,
            { language: 'python', task: 'Generate Fibonacci output' },
          ),
        );

        const provider = new OpenCodeSDKProvider({
          config: {
            format: {
              type: 'json_schema',
              schema: {
                type: 'object',
                properties: {
                  language: { type: 'string' },
                  task: { type: 'string' },
                },
                required: ['language', 'task'],
              },
            },
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result.output).toBe('{"language":"python","task":"Generate Fibonacci output"}');
      });

      it('should normalize fenced json text when structured payload is missing', async () => {
        mockSessionPrompt.mockResolvedValue(
          createMockPromptResponse(
            [
              {
                type: 'text',
                text: '```json\n{\n  "language": "python",\n  "task": "Generate Fibonacci output"\n}\n```',
              },
            ],
            { input: 5, output: 10 },
            0.0005,
          ),
        );

        const provider = new OpenCodeSDKProvider({
          config: {
            format: {
              type: 'json_schema',
              schema: {
                type: 'object',
                properties: {
                  language: { type: 'string' },
                  task: { type: 'string' },
                },
                required: ['language', 'task'],
              },
            },
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result.output).toBe('{"language":"python","task":"Generate Fibonacci output"}');
      });
    });

    describe('working directory', () => {
      it('should use temp directory when no working_dir specified', async () => {
        const provider = new OpenCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider.callApi('Test prompt');

        expect(tempDirSpy).toHaveBeenCalledWith(expect.stringContaining('promptfoo-opencode-sdk-'));
        expect(rmSpy).toHaveBeenCalledWith('/tmp/test-temp-dir', {
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
        expect(mockSessionCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            directory: '/custom/dir',
          }),
        );
        expect(mockSessionPrompt).toHaveBeenCalledWith(
          expect.objectContaining({
            directory: '/custom/dir',
          }),
        );
      });

      it('should resolve relative working_dir from cliState.basePath', async () => {
        const provider = new OpenCodeSDKProvider({
          config: { working_dir: './workspace' },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider.callApi('Test prompt');

        const resolvedWorkingDir = path.resolve('/test/basePath', 'workspace');
        expect(statSyncSpy).toHaveBeenCalledWith(resolvedWorkingDir);
        expect(mockSessionCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            directory: resolvedWorkingDir,
          }),
        );
        expect(mockSessionPrompt).toHaveBeenCalledWith(
          expect.objectContaining({
            directory: resolvedWorkingDir,
          }),
        );
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

      it('should share one client initialization across concurrent first calls', async () => {
        const initialization = createDeferred<{
          client: Record<string, unknown>;
          server: { url: string; close: typeof mockServerClose };
        }>();
        mockCreateOpencode.mockReturnValue(initialization.promise);
        const provider = new OpenCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        const firstCall = provider.callApi('First');
        const secondCall = provider.callApi('Second');
        await vi.waitFor(() => expect(mockCreateOpencode).toHaveBeenCalledTimes(1));

        initialization.resolve({
          client: {
            session: {
              create: mockSessionCreate,
              prompt: mockSessionPrompt,
              messages: mockSessionMessages,
              delete: mockSessionDelete,
              list: mockSessionList,
              abort: mockSessionAbort,
            },
          },
          server: { url: 'http://127.0.0.1:4096', close: mockServerClose },
        });

        await expect(Promise.all([firstCall, secondCall])).resolves.toHaveLength(2);
        expect(mockCreateOpencode).toHaveBeenCalledTimes(1);
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
            sessionID: 'existing-session',
            tools: { '*': false },
          }),
        );
      });

      it('should reject v2 session resumes that try to rebind permissions', async () => {
        const provider = new OpenCodeSDKProvider({
          config: {
            session_id: 'existing-session',
            permission: { bash: 'deny' },
          },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        await expect(provider.callApi('Test prompt')).resolves.toEqual({
          error:
            'Error calling OpenCode SDK: OpenCode SDK v2 explicit session_id resumes cannot safely rebind permission rules; create a new session to change permission.',
        });
        expect(mockCreateOpencode).not.toHaveBeenCalled();
        expect(mockSessionPrompt).not.toHaveBeenCalled();
      });

      it.each([false, true])(
        'should reapply v2 tool policy when resuming a session with bash=%s',
        async (bash) => {
          const provider = new OpenCodeSDKProvider({
            config: {
              session_id: 'existing-session',
              tools: { bash },
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });

          const result = await provider.callApi('Test prompt');

          expect(result.output).toBe('Test response');
          expect(mockSessionCreate).not.toHaveBeenCalled();
          expect(mockSessionPrompt).toHaveBeenCalledWith(
            expect.objectContaining({
              sessionID: 'existing-session',
              tools: { '*': false, bash },
            }),
          );
        },
      );

      it('should reapply custom-agent tool policy when resuming a v2 session', async () => {
        const provider = new OpenCodeSDKProvider({
          config: {
            session_id: 'existing-session',
            custom_agent: { description: 'restricted agent', tools: { bash: true } },
          },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        expect(result.output).toBe('Test response');
        expect(mockSessionPrompt).toHaveBeenCalledWith(
          expect.objectContaining({
            sessionID: 'existing-session',
            tools: { '*': false, bash: true },
          }),
        );
      });

      it.each([
        {
          tools: { bash: true },
          customTools: { '*': false },
          expected: [
            ['bash', true],
            ['*', false],
          ],
        },
        {
          tools: { bash: false },
          customTools: { '*': true },
          expected: [
            ['bash', false],
            ['*', true],
          ],
        },
      ])(
        'should preserve custom-agent-last tool ordering when resuming %#',
        async ({ tools, customTools, expected }) => {
          const provider = new OpenCodeSDKProvider({
            config: {
              session_id: 'existing-session',
              tools,
              custom_agent: { description: 'ordered policy', tools: customTools },
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });

          await provider.callApi('Test prompt');

          expect(Object.entries(mockSessionPrompt.mock.calls[0][0].tools)).toEqual(expected);
        },
      );

      it.each([
        {
          tools: { '*': false },
          expected: [
            ['*', false],
            ['glob', true],
            ['grep', true],
            ['list', true],
            ['read', true],
          ],
        },
        {
          tools: { read: false, '*': true },
          expected: [
            ['*', true],
            ['glob', true],
            ['grep', true],
            ['list', true],
            ['read', false],
          ],
        },
      ])(
        'should preserve new-session default and top-level ordering when resuming %#',
        async ({ tools, expected }) => {
          const provider = new OpenCodeSDKProvider({
            config: {
              session_id: 'existing-session',
              working_dir: '/test/dir',
              tools,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });

          await provider.callApi('Test prompt');

          expect(Object.entries(mockSessionPrompt.mock.calls[0][0].tools)).toEqual(expected);
        },
      );

      it('should reject v2 session resumes with custom-agent permission policy', async () => {
        const provider = new OpenCodeSDKProvider({
          config: {
            session_id: 'existing-session',
            custom_agent: {
              description: 'restricted agent',
              permission: { bash: 'deny' },
            },
          },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        expect(result.error).toMatch(/cannot safely rebind/);
        expect(mockSessionPrompt).not.toHaveBeenCalled();
      });

      it.each([{ permission: {} }, { tools: {} }])(
        'should apply defaults to v2 session resumes with empty policy %#',
        async (emptyPolicy) => {
          const provider = new OpenCodeSDKProvider({
            config: {
              session_id: 'existing-session',
              ...emptyPolicy,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });

          await provider.callApi('Test prompt');

          expect(mockSessionPrompt).toHaveBeenCalledWith(
            expect.objectContaining({
              sessionID: 'existing-session',
              tools: { '*': false },
            }),
          );
        },
      );

      it('should reapply read-only defaults when resuming a v2 session', async () => {
        const provider = new OpenCodeSDKProvider({
          config: {
            session_id: 'existing-session',
            working_dir: '/test/dir',
          },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect(mockSessionPrompt).toHaveBeenCalledWith(
          expect.objectContaining({
            sessionID: 'existing-session',
            tools: {
              '*': false,
              glob: true,
              grep: true,
              list: true,
              read: true,
            },
          }),
        );
      });

      it('should reapply defaults when resuming through a remote v2 client', async () => {
        const provider = new OpenCodeSDKProvider({
          config: {
            baseUrl: 'https://opencode.example.test',
            session_id: 'existing-session',
          },
        });

        await provider.callApi('Test prompt');

        expect(mockCreateOpencodeClient).toHaveBeenCalledWith({
          baseUrl: 'https://opencode.example.test',
        });
        expect(mockSessionCreate).not.toHaveBeenCalled();
        expect(mockSessionPrompt).toHaveBeenCalledWith(
          expect.objectContaining({
            sessionID: 'existing-session',
            tools: { '*': false },
          }),
        );
      });

      it.each([
        [] as any,
        null as any,
        false as any,
        { bash: 42 } as any,
        { bash: [] } as any,
        { bash: { '*': 'permit' } } as any,
      ])('should reject malformed permission config before resuming %#', async (permission) => {
        const provider = new OpenCodeSDKProvider({
          config: { session_id: 'existing-session', permission },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        expect(result.error).toMatch(/OpenCode permission/);
        expect(mockSessionCreate).not.toHaveBeenCalled();
        expect(mockSessionPrompt).not.toHaveBeenCalled();
      });

      it.each([
        { tools: { bash: 'yes' } } as any,
        { permission: { bash: { '*': 'permit' } } } as any,
      ])(
        'should reject malformed custom-agent policy before loading a client %#',
        async (policy) => {
          const provider = new OpenCodeSDKProvider({
            config: {
              custom_agent: { description: 'bad policy', ...policy },
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });

          const result = await provider.callApi('Test prompt');

          expect(result.error).toMatch(/OpenCode (tools|permission)/);
          expect(mockCreateOpencode).not.toHaveBeenCalled();
          expect(mockCreateOpencodeClient).not.toHaveBeenCalled();
          expect(mockSessionPrompt).not.toHaveBeenCalled();
        },
      );

      it('should reuse session when persist_sessions is true without cache', async () => {
        const provider = new OpenCodeSDKProvider({
          config: { persist_sessions: true },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Same prompt');
        await provider.callApi('Same prompt');

        expect(mockSessionCreate).toHaveBeenCalledTimes(1);
      });

      it('should create one persisted session for concurrent calls and serialize prompts', async () => {
        const firstPrompt = createDeferred<ReturnType<typeof createMockPromptResponse>>();
        mockSessionPrompt
          .mockImplementationOnce(() => firstPrompt.promise)
          .mockResolvedValueOnce(createMockPromptResponse([{ type: 'text', text: 'Second' }]));
        const provider = new OpenCodeSDKProvider({
          config: { persist_sessions: true },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        const firstCall = provider.callApi('First');
        await vi.waitFor(() => expect(mockSessionPrompt).toHaveBeenCalledTimes(1));
        const secondCall = provider.callApi('Second');
        await new Promise<void>((resolve) => queueMicrotask(resolve));

        expect(mockSessionCreate).toHaveBeenCalledTimes(1);
        expect(mockSessionPrompt).toHaveBeenCalledTimes(1);

        firstPrompt.resolve(createMockPromptResponse([{ type: 'text', text: 'First' }]));
        await expect(firstCall).resolves.toMatchObject({ output: 'First' });
        await expect(secondCall).resolves.toMatchObject({ output: 'Second' });
        expect(mockSessionCreate).toHaveBeenCalledTimes(1);
        expect(mockSessionPrompt).toHaveBeenCalledTimes(2);
      });

      it('should abort while waiting for a serialized persisted session', async () => {
        const firstPrompt = createDeferred<ReturnType<typeof createMockPromptResponse>>();
        mockSessionPrompt.mockImplementationOnce(() => firstPrompt.promise);
        const provider = new OpenCodeSDKProvider({
          config: { persist_sessions: true },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        const firstCall = provider.callApi('First');
        await vi.waitFor(() => expect(mockSessionPrompt).toHaveBeenCalledTimes(1));
        const firstQueue = Array.from((provider as any).sessionQueues.values())[0];
        const abortController = new AbortController();
        const secondCall = provider.callApi('Second', undefined, {
          abortSignal: abortController.signal,
        });
        await vi.waitFor(() => {
          expect(Array.from((provider as any).sessionQueues.values())[0]).not.toBe(firstQueue);
        });
        abortController.abort();

        await expect(secondCall).resolves.toEqual({ error: 'OpenCode SDK call aborted' });
        expect(mockSessionPrompt).toHaveBeenCalledTimes(1);

        const thirdCall = provider.callApi('Third');
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        expect(mockSessionPrompt).toHaveBeenCalledTimes(1);

        firstPrompt.resolve(createMockPromptResponse([{ type: 'text', text: 'First' }]));
        await expect(firstCall).resolves.toMatchObject({ output: 'First' });
        await expect(thirdCall).resolves.toMatchObject({ output: 'Test response' });
        expect(mockSessionPrompt).toHaveBeenCalledTimes(2);
      });

      it('should delete non-persistent sessions after each call', async () => {
        const provider = new OpenCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect(mockSessionDelete).toHaveBeenCalledWith({
          sessionID: 'test-session-123',
        });
      });

      it('should swallow delete errors for non-persistent sessions', async () => {
        const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
        mockSessionDelete.mockRejectedValue(new Error('delete failed'));

        const provider = new OpenCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        expect(result.output).toBe('Test response');
        expect(debugSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to delete non-persistent session test-session-123'),
          { error: 'delete failed' },
        );

        debugSpy.mockRestore();
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

      it('should not share cached responses across credential identities', async () => {
        mockSessionPrompt
          .mockResolvedValueOnce(
            createMockPromptResponse([{ type: 'text', text: 'Credential A response' }]),
          )
          .mockResolvedValueOnce(
            createMockPromptResponse([{ type: 'text', text: 'Credential B response' }]),
          );
        const providerA = new OpenCodeSDKProvider({
          config: { provider_id: 'anthropic' },
          env: { ANTHROPIC_API_KEY: 'credential-a' },
        });
        const providerB = new OpenCodeSDKProvider({
          config: { provider_id: 'anthropic' },
          env: { ANTHROPIC_API_KEY: 'credential-b' },
        });

        expect((await providerA.callApi('Same prompt')).output).toBe('Credential A response');
        expect((await providerB.callApi('Same prompt')).output).toBe('Credential B response');
        expect(mockSessionPrompt).toHaveBeenCalledTimes(2);
      });

      it('should not share cached responses across ambient AWS account identities', async () => {
        try {
          mockSessionPrompt
            .mockResolvedValueOnce(
              createMockPromptResponse([{ type: 'text', text: 'AWS account A' }]),
            )
            .mockResolvedValueOnce(
              createMockPromptResponse([{ type: 'text', text: 'AWS account B' }]),
            );
          vi.stubEnv('AWS_ACCESS_KEY_ID', 'account-a');
          vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'secret-a');
          const providerA = new OpenCodeSDKProvider({
            config: { provider_id: 'amazon-bedrock' },
          });
          expect((await providerA.callApi('Same Bedrock prompt')).output).toBe('AWS account A');

          vi.stubEnv('AWS_ACCESS_KEY_ID', 'account-b');
          vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'secret-b');
          const providerB = new OpenCodeSDKProvider({
            config: { provider_id: 'amazon-bedrock' },
          });
          expect((await providerB.callApi('Same Bedrock prompt')).output).toBe('AWS account B');
          expect(mockSessionPrompt).toHaveBeenCalledTimes(2);
        } finally {
          vi.unstubAllEnvs();
        }
      });

      it('should isolate cached responses across provider instances with the same credential', async () => {
        mockSessionPrompt
          .mockResolvedValueOnce(
            createMockPromptResponse([{ type: 'text', text: 'First provider response' }]),
          )
          .mockResolvedValueOnce(
            createMockPromptResponse([{ type: 'text', text: 'Second provider response' }]),
          );
        const options = {
          config: { provider_id: 'anthropic' },
          env: { ANTHROPIC_API_KEY: 'shared-credential' },
        };
        const providerA = new OpenCodeSDKProvider(options);
        const providerB = new OpenCodeSDKProvider(options);

        expect((await providerA.callApi('Shared credential prompt')).output).toBe(
          'First provider response',
        );
        expect((await providerB.callApi('Shared credential prompt')).output).toBe(
          'Second provider response',
        );
        expect(mockSessionPrompt).toHaveBeenCalledTimes(2);
      });

      it('should partition cached responses by remote OpenCode server', async () => {
        mockSessionPrompt
          .mockResolvedValueOnce(createMockPromptResponse([{ type: 'text', text: 'Server A' }]))
          .mockResolvedValueOnce(createMockPromptResponse([{ type: 'text', text: 'Server B' }]));
        const providerA = new OpenCodeSDKProvider({
          config: { baseUrl: 'https://opencode-a.example.test' },
        });
        const providerB = new OpenCodeSDKProvider({
          config: { baseUrl: 'https://opencode-b.example.test' },
        });

        expect((await providerA.callApi('Same prompt')).output).toBe('Server A');
        expect((await providerB.callApi('Same prompt')).output).toBe('Server B');
        expect(mockSessionPrompt).toHaveBeenCalledTimes(2);
      });

      it.each([
        'https://user:password@opencode.example.test',
        'https://opencode.example.test?access_token=secret',
      ])('should bypass caching for credential-bearing baseUrl %s', async (baseUrl) => {
        mockSessionPrompt
          .mockResolvedValueOnce(createMockPromptResponse([{ type: 'text', text: 'First' }]))
          .mockResolvedValueOnce(createMockPromptResponse([{ type: 'text', text: 'Second' }]));
        const provider = new OpenCodeSDKProvider({ config: { baseUrl } });

        expect((await provider.callApi('Same prompt')).output).toBe('First');
        expect((await provider.callApi('Same prompt')).output).toBe('Second');
        expect(mockSessionPrompt).toHaveBeenCalledTimes(2);
      });

      it('should disable caching when MCP is configured', async () => {
        mockSessionPrompt.mockResolvedValue(
          createMockPromptResponse([{ type: 'text', text: 'Response' }]),
        );

        const provider = new OpenCodeSDKProvider({
          config: {
            mcp: {
              weather: {
                type: 'local',
                command: ['deterministic-weather-mcp'],
              },
            },
          },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        // Both calls should hit the API since caching is disabled with MCP
        await provider.callApi('Test prompt');
        await provider.callApi('Test prompt');
        expect(mockSessionPrompt).toHaveBeenCalledTimes(2);
      });

      it('should not cache MCP configurations with positional command arguments', async () => {
        mockSessionPrompt.mockResolvedValue(
          createMockPromptResponse([{ type: 'text', text: 'Sensitive MCP response' }]),
        );
        const provider = new OpenCodeSDKProvider({
          config: {
            cache_mcp: true,
            mcp: {
              database: {
                type: 'local',
                command: ['database-mcp', 'postgres://user:password@db.example.test/app'],
              },
            },
          },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');
        await provider.callApi('Test prompt');

        expect(mockSessionPrompt).toHaveBeenCalledTimes(2);
      });

      it('should cache MCP responses when cache_mcp is true', async () => {
        mockSessionPrompt.mockResolvedValue(
          createMockPromptResponse([{ type: 'text', text: 'MCP cached response' }]),
        );

        const provider = new OpenCodeSDKProvider({
          config: {
            cache_mcp: true,
            mcp: {
              weather: {
                type: 'local',
                command: ['deterministic-weather-mcp'],
              },
            },
          },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        // First call - should hit the API
        const result1 = await provider.callApi('Test prompt');
        expect(result1.output).toBe('MCP cached response');
        expect(mockSessionPrompt).toHaveBeenCalledTimes(1);

        // Second call with same prompt - should use cache
        const result2 = await provider.callApi('Test prompt');
        expect(result2.output).toBe('MCP cached response');
        expect(mockSessionPrompt).toHaveBeenCalledTimes(1);
      });

      it('should produce different cache keys for different MCP configs when cache_mcp is true', async () => {
        mockSessionPrompt
          .mockResolvedValueOnce(createMockPromptResponse([{ type: 'text', text: 'Response A' }]))
          .mockResolvedValueOnce(createMockPromptResponse([{ type: 'text', text: 'Response B' }]));
        const provider = new OpenCodeSDKProvider({
          config: { cache_mcp: true },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const contextFor = (name: string): CallApiContextParams => ({
          prompt: {
            raw: 'Test prompt',
            label: 'Test prompt',
            config: {
              mcp: {
                [name]: {
                  type: 'local',
                  command: [`deterministic-${name}-mcp`],
                },
              },
            },
          },
          vars: {},
        });

        const firstA = await provider.callApi('Test prompt', contextFor('weather'));
        const firstB = await provider.callApi('Test prompt', contextFor('search'));
        const secondA = await provider.callApi('Test prompt', contextFor('weather'));

        expect(firstA.output).toBe('Response A');
        expect(firstB.output).toBe('Response B');
        expect(secondA.output).toBe('Response A');
        expect(secondA.cached).toBe(true);
        expect(mockSessionPrompt).toHaveBeenCalledTimes(2);
      });

      it('should bypass response caching for mutable session_id history', async () => {
        mockSessionPrompt.mockResolvedValueOnce(
          createMockPromptResponse([{ type: 'text', text: 'Response from session A' }]),
        );
        mockSessionPrompt.mockResolvedValueOnce(
          createMockPromptResponse([{ type: 'text', text: 'Second response from session A' }]),
        );

        const providerForSessionA = new OpenCodeSDKProvider({
          config: { session_id: 'session-A' },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        const resultFromSessionA = await providerForSessionA.callApi('Test prompt');
        expect(resultFromSessionA.output).toBe('Response from session A');

        const secondResultFromSessionA = await providerForSessionA.callApi('Test prompt');
        expect(secondResultFromSessionA.output).toBe('Second response from session A');
        expect(mockSessionPrompt).toHaveBeenCalledTimes(2);

        mockSessionPrompt.mockResolvedValueOnce(
          createMockPromptResponse([{ type: 'text', text: 'Response from session B' }]),
        );

        const providerForSessionB = new OpenCodeSDKProvider({
          config: { session_id: 'session-B' },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        const resultFromSessionB = await providerForSessionB.callApi('Test prompt');
        expect(resultFromSessionB.output).toBe('Response from session B');
        expect(mockSessionPrompt).toHaveBeenCalledTimes(3);
      });

      it('should produce different cache keys for different parent_session_id values', async () => {
        mockSessionPrompt.mockResolvedValueOnce(
          createMockPromptResponse([{ type: 'text', text: 'Response from parent A' }]),
        );

        const providerForParentA = new OpenCodeSDKProvider({
          config: { parent_session_id: 'parent-A' },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        const resultFromParentA = await providerForParentA.callApi('Test prompt');
        expect(resultFromParentA.output).toBe('Response from parent A');

        const cachedResultFromParentA = await providerForParentA.callApi('Test prompt');
        expect(cachedResultFromParentA.output).toBe('Response from parent A');
        expect(mockSessionPrompt).toHaveBeenCalledTimes(1);

        mockSessionPrompt.mockResolvedValueOnce(
          createMockPromptResponse([{ type: 'text', text: 'Response from parent B' }]),
        );

        const providerForParentB = new OpenCodeSDKProvider({
          config: { parent_session_id: 'parent-B' },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        const resultFromParentB = await providerForParentB.callApi('Test prompt');
        expect(resultFromParentB.output).toBe('Response from parent B');
        expect(mockSessionPrompt).toHaveBeenCalledTimes(2);
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
            model: expect.objectContaining({
              modelID: 'prompt-model',
            }),
          }),
        );
      });

      it('should reject per-prompt apiKey overrides before loading a client', async () => {
        const provider = new OpenCodeSDKProvider({
          config: { apiKey: 'provider-key', provider_id: 'openai' },
        });

        await expect(
          provider.callApi('Test prompt', {
            prompt: {
              raw: 'Test prompt',
              label: 'test',
              config: { apiKey: 'different-key' },
            },
            vars: {},
          }),
        ).rejects.toThrow(/apiKey is provider-level configuration/);
        expect(mockCreateOpencode).not.toHaveBeenCalled();
        expect(mockSessionPrompt).not.toHaveBeenCalled();
      });

      it('should reject per-prompt baseUrl overrides before loading a client', async () => {
        const provider = new OpenCodeSDKProvider({
          config: { baseUrl: 'https://opencode.example.test' },
        });

        await expect(
          provider.callApi('Test prompt', {
            prompt: {
              raw: 'Test prompt',
              label: 'test',
              config: { baseUrl: 'https://other.example.test' },
            },
            vars: {},
          }),
        ).rejects.toThrow(/baseUrl is provider-level configuration/);
        expect(mockCreateOpencodeClient).not.toHaveBeenCalled();
        expect(mockSessionPrompt).not.toHaveBeenCalled();
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
            sessionID: 'test-session-123',
            model: {
              providerID: 'anthropic',
              modelID: 'claude-sonnet-4-20250514',
            },
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
            sessionID: 'test-session-123',
            parts: [{ type: 'text', text: 'Test prompt' }],
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

    it('should delete tracked persistent sessions on cleanup', async () => {
      const provider = new OpenCodeSDKProvider({
        config: { persist_sessions: true },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      await provider.callApi('Test prompt');
      await provider.cleanup();

      expect(mockSessionDelete).toHaveBeenCalledWith({
        sessionID: 'test-session-123',
      });
    });

    it('retries a failed owned temporary directory and forgets it only after a successful removal', async () => {
      rmSpy
        .mockRejectedValueOnce(new Error('initial cleanup failed'))
        .mockRejectedValueOnce(new Error('first explicit cleanup failed'))
        .mockResolvedValue(undefined);
      const provider = new OpenCodeSDKProvider({ env: { ANTHROPIC_API_KEY: 'test-api-key' } });

      const result = await provider.callApi('cleanup does not mask success');
      expect(result.output).toBe('Test response');
      await expect(provider.cleanup()).resolves.toBeUndefined();
      await expect(provider.cleanup()).resolves.toBeUndefined();
      await expect(provider.cleanup()).resolves.toBeUndefined();

      expect(rmSpy).toHaveBeenCalledTimes(3);
      for (let index = 1; index <= 3; index++) {
        expect(rmSpy).toHaveBeenNthCalledWith(index, '/tmp/test-temp-dir', {
          recursive: true,
          force: true,
        });
      }
    });

    it('retries an owned path through evaluator shutdown even when validation exits before client creation', async () => {
      rmSpy.mockRejectedValueOnce(new Error('initial temp removal failed'));
      const provider = new OpenCodeSDKProvider({
        config: { permission: { bash: 'invalid' } } as unknown as OpenCodeSDKConfig,
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      const result = await provider.callApi('early invalid policy');

      expect(result.error).toContain('permission');
      expect(mockCreateOpencode).not.toHaveBeenCalled();
      expect(rmSpy).toHaveBeenCalledTimes(1);
      await providerRegistry.shutdownAll();
      expect(rmSpy).toHaveBeenCalledTimes(2);
      expect(rmSpy).toHaveBeenLastCalledWith('/tmp/test-temp-dir', {
        recursive: true,
        force: true,
      });
    });

    it('closes an active server through evaluator shutdown and does not close it twice', async () => {
      const provider = new OpenCodeSDKProvider({ env: { ANTHROPIC_API_KEY: 'test-api-key' } });

      await provider.callApi('registered server');
      expect(mockServerClose).not.toHaveBeenCalled();
      await providerRegistry.shutdownAll();
      await providerRegistry.shutdownAll();

      expect(mockServerClose).toHaveBeenCalledTimes(1);
    });

    it('registers the same instance again when a subsequent evaluation reuses it', async () => {
      const provider = new OpenCodeSDKProvider({ env: { ANTHROPIC_API_KEY: 'test-api-key' } });

      await provider.callApi('first registered evaluation');
      await providerRegistry.shutdownAll();
      await provider.callApi('second registered evaluation');
      await providerRegistry.shutdownAll();

      expect(mockCreateOpencode).toHaveBeenCalledTimes(2);
      expect(mockServerClose).toHaveBeenCalledTimes(2);
    });

    it('keeps a direct-cleanup failure registered until a lifecycle retry succeeds', async () => {
      rmSpy
        .mockRejectedValueOnce(new Error('per-call removal failed'))
        .mockRejectedValueOnce(new Error('direct cleanup removal failed'));
      const provider = new OpenCodeSDKProvider({ env: { ANTHROPIC_API_KEY: 'test-api-key' } });

      await provider.callApi('direct then lifecycle cleanup');
      await provider.cleanup();
      expect(rmSpy).toHaveBeenCalledTimes(2);
      await providerRegistry.shutdownAll();
      expect(rmSpy).toHaveBeenCalledTimes(3);
      await providerRegistry.shutdownAll();
      expect(rmSpy).toHaveBeenCalledTimes(3);
    });

    it('retries each failed temporary path but never removes a user-provided working directory', async () => {
      tempDirSpy
        .mockReturnValueOnce('/tmp/promptfoo-owned-first')
        .mockReturnValueOnce('/tmp/promptfoo-owned-second');
      const attempts = new Map<string, number>();
      rmSpy.mockImplementation(async (value) => {
        const key = String(value);
        const count = (attempts.get(key) ?? 0) + 1;
        attempts.set(key, count);
        if (count === 1) {
          throw new Error('retry requested');
        }
      });
      const provider = new OpenCodeSDKProvider({ env: { ANTHROPIC_API_KEY: 'test-api-key' } });
      await provider.callApi('first uncached prompt');
      await provider.callApi('second uncached prompt');
      await provider.callApi('user directory', {
        vars: {},
        prompt: {
          raw: 'user directory',
          label: 'user directory',
          config: { working_dir: '/test/user-dir' },
        },
      });
      await provider.cleanup();

      expect([...attempts]).toEqual([
        ['/tmp/promptfoo-owned-first', 2],
        ['/tmp/promptfoo-owned-second', 2],
      ]);
      expect(rmSpy).not.toHaveBeenCalledWith('/test/user-dir', expect.anything());
    });

    it('shares an in-flight retry when explicit cleanup is called concurrently', async () => {
      const entered = createDeferred<void>();
      const released = createDeferred<void>();
      rmSpy
        .mockRejectedValueOnce(new Error('initial cleanup failed'))
        .mockImplementationOnce(async () => {
          entered.resolve();
          await released.promise;
        });
      const provider = new OpenCodeSDKProvider({ env: { ANTHROPIC_API_KEY: 'test-api-key' } });
      await provider.callApi('uncached cleanup concurrency');
      const first = provider.cleanup();
      const second = provider.cleanup();
      await entered.promise;
      expect(rmSpy).toHaveBeenCalledTimes(2);
      released.resolve();
      await Promise.all([first, second]);
      await provider.cleanup();
      expect(rmSpy).toHaveBeenCalledTimes(2);
    });

    it('keeps a reused persistent session and evicts the actual least recently used one', async () => {
      let created = 0;
      mockSessionCreate.mockImplementation(async () =>
        createMockSessionResponse('lru-session-' + created++),
      );
      const provider = new OpenCodeSDKProvider({
        config: { working_dir: '/test/work', persist_sessions: true },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });
      const withModel = (index: number): CallApiContextParams => ({
        vars: {},
        prompt: { raw: 'lru', label: 'lru', config: { model: 'test-model-' + index } },
      });

      for (let index = 0; index < 100; index++) {
        await provider.callApi('lru', withModel(index));
      }
      await provider.callApi('lru', withModel(0));
      await provider.callApi('lru', withModel(100));

      expect(mockSessionCreate).toHaveBeenCalledTimes(101);
      expect(mockSessionDelete).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ sessionID: 'lru-session-1' }),
      );
      expect(mockSessionDelete).not.toHaveBeenCalledWith(
        expect.objectContaining({ sessionID: 'lru-session-0' }),
      );
      await provider.cleanup();
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
      expect(rmSpy).toHaveBeenCalled();
      expect(mockSessionCreate.mock.calls[0][0].permission).toEqual([
        { permission: '*', pattern: '*', action: 'deny' },
      ]);
      expect(mockSessionPrompt.mock.calls[0][0]).not.toHaveProperty('tools');
    });

    it('should enable read-only tools with working_dir', async () => {
      const provider = new OpenCodeSDKProvider({
        config: { working_dir: '/test/dir' },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      await provider.callApi('Test prompt');

      // No temp dir should be created
      expect(tempDirSpy).not.toHaveBeenCalled();

      expect(mockSessionCreate.mock.calls[0][0].permission).toEqual([
        { permission: '*', pattern: '*', action: 'deny' },
        { permission: 'glob', pattern: '*', action: 'allow' },
        { permission: 'grep', pattern: '*', action: 'allow' },
        { permission: 'list', pattern: '*', action: 'allow' },
        { permission: 'read', pattern: '*', action: 'allow' },
      ]);
      expect(mockSessionPrompt.mock.calls[0][0]).not.toHaveProperty('tools');
    });

    it('should merge explicit tools with safe defaults and normalize edit aliases', async () => {
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

      expect(mockSessionCreate.mock.calls[0][0].permission).toEqual([
        { permission: '*', pattern: '*', action: 'deny' },
        { permission: 'glob', pattern: '*', action: 'allow' },
        { permission: 'grep', pattern: '*', action: 'allow' },
        { permission: 'list', pattern: '*', action: 'allow' },
        { permission: 'read', pattern: '*', action: 'allow' },
        { permission: 'bash', pattern: '*', action: 'allow' },
        { permission: 'edit', pattern: '*', action: 'allow' },
      ]);
      expect(mockSessionPrompt.mock.calls[0][0]).not.toHaveProperty('tools');
    });

    it('should keep read-only defaults when a partial tools config is provided', async () => {
      const provider = new OpenCodeSDKProvider({
        config: { working_dir: '/test/dir', tools: { bash: false } },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      await provider.callApi('Test prompt');

      expect(mockSessionCreate.mock.calls[0][0].permission).toEqual([
        { permission: '*', pattern: '*', action: 'deny' },
        { permission: 'glob', pattern: '*', action: 'allow' },
        { permission: 'grep', pattern: '*', action: 'allow' },
        { permission: 'list', pattern: '*', action: 'allow' },
        { permission: 'read', pattern: '*', action: 'allow' },
        { permission: 'bash', pattern: '*', action: 'deny' },
      ]);
    });

    it.each([null, [], { bash: 'false' }, { bash: 0 }, { '': true }])(
      'should reject malformed tools config and clean up its temp directory %#',
      async (tools) => {
        const provider = new OpenCodeSDKProvider({
          config: { tools: tools as any },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        expect(result.error).toMatch(/OpenCode tool/);
        expect(mockSessionCreate).not.toHaveBeenCalled();
        expect(mockSessionPrompt).not.toHaveBeenCalled();
        expect(rmSpy).toHaveBeenCalledWith('/tmp/test-temp-dir', {
          recursive: true,
          force: true,
        });
      },
    );

    it('should reject conflicting edit tool aliases', async () => {
      const provider = new OpenCodeSDKProvider({
        config: { tools: { edit: false, write: true } },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toMatch(/share one permission and cannot conflict/);
      expect(mockSessionCreate).not.toHaveBeenCalled();
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

  describe('convertPermissionConfigToRuleset', () => {
    it('returns undefined for undefined input', () => {
      expect(convertPermissionConfigToRuleset(undefined)).toBeUndefined();
    });

    it('returns undefined for an empty config', () => {
      expect(convertPermissionConfigToRuleset({})).toBeUndefined();
    });

    it('skips keys whose value is undefined', () => {
      expect(convertPermissionConfigToRuleset({ bash: undefined, edit: 'allow' })).toEqual([
        { permission: 'edit', pattern: '*', action: 'allow' },
      ]);
    });

    it('expands simple string values into a wildcard rule', () => {
      expect(
        convertPermissionConfigToRuleset({
          bash: 'allow',
          webfetch: 'deny',
        }),
      ).toEqual([
        { permission: 'bash', pattern: '*', action: 'allow' },
        { permission: 'webfetch', pattern: '*', action: 'deny' },
      ]);
    });

    it('expands pattern objects into one rule per pattern', () => {
      expect(
        convertPermissionConfigToRuleset({
          bash: { '*': 'ask', 'git *': 'allow' },
        }),
      ).toEqual([
        { permission: 'bash', pattern: '*', action: 'ask' },
        { permission: 'bash', pattern: 'git *', action: 'allow' },
      ]);
    });

    it('handles a mix of simple and pattern-based entries', () => {
      const ruleset = convertPermissionConfigToRuleset({
        bash: 'ask',
        edit: { '*.md': 'allow', 'src/**': 'deny' },
      });
      expect(ruleset).toEqual([
        { permission: 'bash', pattern: '*', action: 'ask' },
        { permission: 'edit', pattern: '*.md', action: 'allow' },
        { permission: 'edit', pattern: 'src/**', action: 'deny' },
      ]);
    });

    it('preserves an explicitly undefined config as a no-op', () => {
      expect(convertPermissionConfigToRuleset({ bash: undefined })).toBeUndefined();
    });

    it.each([
      [] as any,
      null as any,
      false as any,
      { bash: 42 } as any,
      { bash: null } as any,
      { bash: [] } as any,
      { bash: { '*': 'permit' } } as any,
    ])('rejects malformed permission config %#', (permission) => {
      expect(() => convertPermissionConfigToRuleset(permission)).toThrow(/OpenCode permission/);
    });
  });

  describe('new tools configuration', () => {
    it('should include question, skill, lsp tools in disabled mode by default', async () => {
      const provider = new OpenCodeSDKProvider({
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      await provider.callApi('Test prompt');

      expect(mockSessionCreate.mock.calls[0][0].permission).toEqual([
        { permission: '*', pattern: '*', action: 'deny' },
      ]);
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

      expect(mockSessionCreate.mock.calls[0][0].permission).toEqual([
        { permission: '*', pattern: '*', action: 'deny' },
        { permission: 'glob', pattern: '*', action: 'allow' },
        { permission: 'grep', pattern: '*', action: 'allow' },
        { permission: 'list', pattern: '*', action: 'allow' },
        { permission: 'read', pattern: '*', action: 'allow' },
        { permission: 'question', pattern: '*', action: 'allow' },
        { permission: 'skill', pattern: '*', action: 'allow' },
        { permission: 'lsp', pattern: '*', action: 'allow' },
      ]);
    });
  });

  describe('new permission types', () => {
    it('should convert simple permissions into a v2 rule array on session.create', async () => {
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

      const createCall = mockSessionCreate.mock.calls[0][0];
      expect(createCall.permission).toEqual([
        { permission: '*', pattern: '*', action: 'deny' },
        { permission: 'glob', pattern: '*', action: 'allow' },
        { permission: 'grep', pattern: '*', action: 'allow' },
        { permission: 'list', pattern: '*', action: 'allow' },
        { permission: 'read', pattern: '*', action: 'allow' },
        { permission: 'bash', pattern: '*', action: 'allow' },
        { permission: 'doom_loop', pattern: '*', action: 'deny' },
        { permission: 'external_directory', pattern: '*', action: 'deny' },
      ]);
    });

    it('should expand pattern-based permissions into one rule per pattern', async () => {
      const provider = new OpenCodeSDKProvider({
        config: {
          working_dir: '/test/dir',
          permission: {
            bash: {
              '*': 'ask',
              'git *': 'allow',
              'rm *': 'deny',
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

      const createCall = mockSessionCreate.mock.calls[0][0];
      expect(createCall.permission).toEqual([
        { permission: '*', pattern: '*', action: 'deny' },
        { permission: 'glob', pattern: '*', action: 'allow' },
        { permission: 'grep', pattern: '*', action: 'allow' },
        { permission: 'list', pattern: '*', action: 'allow' },
        { permission: 'read', pattern: '*', action: 'allow' },
        { permission: 'bash', pattern: '*', action: 'ask' },
        { permission: 'bash', pattern: 'git *', action: 'allow' },
        { permission: 'bash', pattern: 'rm *', action: 'deny' },
        { permission: 'edit', pattern: '*.md', action: 'allow' },
        { permission: 'edit', pattern: 'src/**', action: 'ask' },
      ]);
    });

    it('should still apply the safe tools policy when explicit permissions are empty', async () => {
      const provider = new OpenCodeSDKProvider({
        config: {
          working_dir: '/test/dir',
          permission: {},
        },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      await provider.callApi('Test prompt');

      const createCall = mockSessionCreate.mock.calls[0][0];
      expect(createCall.permission).toEqual([
        { permission: '*', pattern: '*', action: 'deny' },
        { permission: 'glob', pattern: '*', action: 'allow' },
        { permission: 'grep', pattern: '*', action: 'allow' },
        { permission: 'list', pattern: '*', action: 'allow' },
        { permission: 'read', pattern: '*', action: 'allow' },
      ]);
    });
  });

  describe('updated api support', () => {
    it('should pass workspace through create and prompt queries', async () => {
      const provider = new OpenCodeSDKProvider({
        config: {
          working_dir: '/test/dir',
          workspace: 'feature-branch',
        },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      await provider.callApi('Test prompt');

      expect(mockSessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          directory: '/test/dir',
          workspace: 'feature-branch',
        }),
      );
      expect(mockSessionPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          directory: '/test/dir',
          workspace: 'feature-branch',
        }),
      );
    });

    it('should require working_dir or baseUrl when workspace is configured', async () => {
      const provider = new OpenCodeSDKProvider({
        config: { workspace: 'feature-branch' },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      await expect(provider.callApi('Test prompt')).rejects.toThrow(
        'OpenCode SDK workspace support requires either baseUrl or working_dir',
      );
    });

    it('should pass JSON schema format and variant to prompt body', async () => {
      const provider = new OpenCodeSDKProvider({
        config: {
          provider_id: 'openai',
          model: 'gpt-4o-mini',
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                answer: { type: 'string' },
              },
              required: ['answer'],
            },
            retryCount: 2,
          },
          variant: 'fast',
        },
        env: { OPENAI_API_KEY: 'test-api-key' },
      });

      await provider.callApi('Test prompt');

      expect(mockSessionPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                answer: { type: 'string' },
              },
              required: ['answer'],
            },
            retryCount: 2,
          },
          variant: 'fast',
        }),
      );
    });

    it('should inject apiKey into server config for the selected provider', async () => {
      const provider = new OpenCodeSDKProvider({
        config: {
          apiKey: 'test-api-key',
          provider_id: 'openai',
        },
      });

      await provider.callApi('Test prompt');

      expect(mockCreateOpencode).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            provider: {
              openai: {
                options: {
                  apiKey: 'test-api-key',
                },
              },
            },
          }),
        }),
      );
    });

    it('should pass env overrides to the spawned server process', async () => {
      const provider = new OpenCodeSDKProvider({
        env: {
          OPENAI_API_KEY: 'override-openai',
          ANTHROPIC_API_KEY: 'override-anthropic',
        },
      });

      await provider.callApi('Test prompt');

      expect(mockCreateOpencode).toHaveBeenCalledWith(
        expect.objectContaining({
          env: expect.objectContaining({
            OPENAI_API_KEY: 'override-openai',
            ANTHROPIC_API_KEY: 'override-anthropic',
          }),
        }),
      );
    });
  });

  describe('custom agent new properties', () => {
    it('composes custom-agent and top-level policies in override order', async () => {
      const provider = new OpenCodeSDKProvider({
        config: {
          custom_agent: {
            description: 'restricted agent',
            tools: { bash: true, write: true },
            permission: { bash: 'ask', edit: 'deny' },
          },
          tools: { bash: false },
          permission: { edit: 'allow' },
        },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      await provider.callApi('Test prompt');

      expect(mockSessionCreate.mock.calls[0][0].permission).toEqual([
        { permission: '*', pattern: '*', action: 'deny' },
        { permission: 'bash', pattern: '*', action: 'deny' },
        { permission: 'edit', pattern: '*', action: 'allow' },
        { permission: 'bash', pattern: '*', action: 'allow' },
        { permission: 'edit', pattern: '*', action: 'allow' },
        { permission: 'bash', pattern: '*', action: 'ask' },
        { permission: 'edit', pattern: '*', action: 'deny' },
      ]);
    });

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

  describe('parent_session_id (forked sessions)', () => {
    it('forwards parent_session_id as parentID on session.create for v2', async () => {
      const provider = new OpenCodeSDKProvider({
        config: { parent_session_id: 'parent-session-abc' },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      await provider.callApi('Test prompt');

      expect(mockSessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({ parentID: 'parent-session-abc' }),
      );
    });

    it('does not include parentID when parent_session_id is unset', async () => {
      const provider = new OpenCodeSDKProvider({
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      await provider.callApi('Test prompt');

      const createArgs = mockSessionCreate.mock.calls[0]?.[0];
      expect(createArgs).not.toHaveProperty('parentID');
    });

    it('uses a separate cached session per parent_session_id', async () => {
      const baseConfig = { persist_sessions: true };
      const providerForParentA = new OpenCodeSDKProvider({
        config: { ...baseConfig, parent_session_id: 'parent-A' },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });
      const providerForParentB = new OpenCodeSDKProvider({
        config: { ...baseConfig, parent_session_id: 'parent-B' },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      // Distinct sessions for two distinct parent IDs
      mockSessionCreate
        .mockResolvedValueOnce(createMockSessionResponse('child-of-A'))
        .mockResolvedValueOnce(createMockSessionResponse('child-of-B'));

      await providerForParentA.callApi('Hello A');
      await providerForParentB.callApi('Hello B');

      expect(mockSessionCreate).toHaveBeenCalledTimes(2);
      expect(mockSessionCreate.mock.calls[0]?.[0]).toMatchObject({ parentID: 'parent-A' });
      expect(mockSessionCreate.mock.calls[1]?.[0]).toMatchObject({ parentID: 'parent-B' });
    });
  });

  describe('enable_streaming dead-config warning', () => {
    it('warns once when enable_streaming is set, then stays quiet on subsequent calls', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const provider = new OpenCodeSDKProvider({
        config: { enable_streaming: true, persist_sessions: true },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      await provider.callApi('first');
      await provider.callApi('second');

      const streamingWarnings = warnSpy.mock.calls.filter((call) =>
        String(call[0] ?? '').includes('enable_streaming is currently a no-op'),
      );
      expect(streamingWarnings).toHaveLength(1);
    });

    it('does not warn when enable_streaming is unset', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const provider = new OpenCodeSDKProvider({
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      await provider.callApi('Test prompt');

      const streamingWarnings = warnSpy.mock.calls.filter((call) =>
        String(call[0] ?? '').includes('enable_streaming'),
      );
      expect(streamingWarnings).toHaveLength(0);
    });
  });

  describe('abortSignal mid-flight cancellation', () => {
    it('calls session.abort when the caller aborts during the prompt', async () => {
      const controller = new AbortController();
      const promptStarted = createDeferred<void>();
      // The prompt mock waits for the abort signal itself, then returns a
      // canned response — that mirrors how a real server completes after an
      // abort request rather than hanging forever.
      mockSessionPrompt.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            promptStarted.resolve();
            controller.signal.addEventListener(
              'abort',
              () =>
                resolve(
                  createMockPromptResponse([{ type: 'text', text: 'Discarded' }], {
                    input: 1,
                    output: 1,
                  }),
                ),
              { once: true },
            );
          }),
      );

      const provider = new OpenCodeSDKProvider({
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      const callPromise = provider.callApi('Test prompt', undefined, {
        abortSignal: controller.signal,
      });

      await promptStarted.promise;
      controller.abort();

      const result = await callPromise;
      expect(mockSessionAbort).toHaveBeenCalledWith(
        expect.objectContaining({ sessionID: 'test-session-123' }),
      );
      expect(result.error).toBe('OpenCode SDK call aborted');
    });

    it('does not call session.abort when no signal is provided', async () => {
      const provider = new OpenCodeSDKProvider({
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });
      await provider.callApi('Test prompt');
      expect(mockSessionAbort).not.toHaveBeenCalled();
    });

    it('does not call session.abort when the signal never fires', async () => {
      const controller = new AbortController();
      const provider = new OpenCodeSDKProvider({
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      await provider.callApi('Test prompt', undefined, {
        abortSignal: controller.signal,
      });

      expect(mockSessionAbort).not.toHaveBeenCalled();
    });

    it('returns the abort-before-start error when the signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      const provider = new OpenCodeSDKProvider({
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      const result = await provider.callApi('Test prompt', undefined, {
        abortSignal: controller.signal,
      });

      expect(result.error).toBe('OpenCode SDK call aborted before it started');
      expect(mockSessionPrompt).not.toHaveBeenCalled();
      expect(mockSessionAbort).not.toHaveBeenCalled();
    });
  });

  describe('structured prompt outcome contracts', () => {
    it.each([true, false])(
      'retains only safe assistant usage and the actual session for output failures (wrapped=%s)',
      async (wrapped) => {
        enableCache();
        try {
          const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
          const response = createMockPromptResponse(
            [{ type: 'text', text: 'synthetic-private-part' }],
            { input: 23, output: 7, total: 44, reasoning: 4, cache: { read: 5, write: 6 } },
            0.125,
            { synthetic: 'synthetic-private-structured-output' },
          );
          const failed = {
            ...response.data,
            info: {
              ...response.data.info,
              sessionID: 'synthetic-private-info-session',
              error: {
                name: 'MessageOutputLengthError',
                data: {
                  message: 'The generation exceeded its output limit',
                  responseBody: 'synthetic-private-error-body',
                },
              },
            },
          };
          mockSessionCreate.mockResolvedValueOnce(createMockSessionResponse('metered-session'));
          mockSessionPrompt
            .mockResolvedValueOnce(wrapped ? { data: failed } : failed)
            .mockResolvedValueOnce(createMockPromptResponse([{ type: 'text', text: 'recovered' }]));
          const provider = new OpenCodeSDKProvider({ env: { ANTHROPIC_API_KEY: 'test-api-key' } });
          const prompt = `uncached metered assistant failure ${wrapped}`;

          const failure = await provider.callApi(prompt);
          const success = await provider.callApi(prompt);
          const cachedSuccess = await provider.callApi(prompt);

          expect(failure).toMatchObject({
            error: expect.stringContaining('MessageOutputLengthError'),
            tokenUsage: {
              prompt: 23,
              completion: 7,
              total: 44,
              cached: 5,
              completionDetails: {
                reasoning: 4,
                cacheReadInputTokens: 5,
                cacheCreationInputTokens: 6,
              },
            },
            cost: 0.125,
            sessionId: 'metered-session',
          });
          expect(failure.error).toContain('The generation exceeded its output limit');
          expect(failure).not.toHaveProperty('output');
          expect(failure).not.toHaveProperty('raw');
          expect(failure.cached).not.toBe(true);
          const observable = JSON.stringify({ failure, loggedErrors: errorSpy.mock.calls });
          for (const value of [
            'synthetic-private-part',
            'synthetic-private-structured-output',
            'synthetic-private-info-session',
            'synthetic-private-error-body',
          ]) {
            expect(observable).not.toContain(value);
          }
          expect(success.output).toBe('recovered');
          expect(cachedSuccess).toMatchObject({ output: 'recovered', cached: true });
          expect(mockSessionPrompt).toHaveBeenCalledTimes(2);
        } finally {
          disableCache();
        }
      },
    );

    it('ignores untrusted or invalid accounting fields on other assistant failures', async () => {
      const response = createMockPromptResponse([]);
      const makeFailure = (tokens: unknown, cost: unknown) => ({
        data: {
          ...response.data,
          info: {
            ...response.data.info,
            tokens,
            cost,
            error: { _tag: 'StructuredOutputError', data: { message: 'Schema validation failed' } },
          },
        },
      });
      mockSessionPrompt
        .mockResolvedValueOnce(
          makeFailure(
            {
              input: 'synthetic-private-accounting-value',
              output: 4,
              total: Number.POSITIVE_INFINITY,
              reasoning: -3,
              cache: { read: 'synthetic-private-accounting-value', write: 2 },
            },
            'synthetic-private-accounting-value',
          ),
        )
        .mockResolvedValueOnce(
          makeFailure({ input: -1, total: Number.NaN, cache: { read: 0.5 } }, -0.25),
        )
        .mockResolvedValueOnce(makeFailure({ input: 0, output: 0, cache: 0 }, 0));
      const provider = new OpenCodeSDKProvider({ env: { ANTHROPIC_API_KEY: 'test-api-key' } });

      const partial = await provider.callApi('partially valid accounting');
      const invalid = await provider.callApi('invalid accounting');
      const zero = await provider.callApi('zero accounting');

      expect(partial).toMatchObject({
        error: expect.stringContaining('StructuredOutputError: Schema validation failed'),
        sessionId: 'test-session-123',
        tokenUsage: {
          prompt: 0,
          completion: 4,
          total: 4,
          cached: 0,
          completionDetails: { cacheReadInputTokens: 0, cacheCreationInputTokens: 2 },
        },
      });
      expect(partial).not.toHaveProperty('cost');
      expect(JSON.stringify(partial)).not.toContain('synthetic-private-accounting-value');
      expect(invalid).not.toHaveProperty('tokenUsage');
      expect(invalid).not.toHaveProperty('cost');
      expect(zero).toMatchObject({
        tokenUsage: { prompt: 0, completion: 0, total: 0, cached: 0 },
        cost: 0,
      });
    });

    it('grades assistant content filtering as a private refusal and leaves it uncached', async () => {
      enableCache();
      try {
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
        const response = createMockPromptResponse(
          [{ type: 'text', text: 'synthetic-private-filtered-output' }],
          { input: 8, output: 3 },
          0.025,
          { response: 'synthetic-private-filtered-structured-output' },
        );
        const refusal = {
          data: {
            ...response.data,
            info: {
              ...response.data.info,
              error: {
                name: 'ContentFilterError',
                data: {
                  message: 'synthetic-private-upstream-content-filter-message',
                  responseBody: 'synthetic-private-content-filter-body',
                },
              },
            },
          },
        };
        mockSessionPrompt
          .mockResolvedValueOnce(refusal)
          .mockResolvedValueOnce(refusal)
          .mockResolvedValueOnce(createMockPromptResponse([{ type: 'text', text: 'recovered' }]));
        const provider = new OpenCodeSDKProvider({
          config: { format: { type: 'json_schema', schema: { type: 'object' } } },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        const direct = await provider.callApi('filter direct synthetic prompt');
        const [graded] = await runEval({
          delay: 0,
          testIdx: 0,
          promptIdx: 0,
          repeatIndex: 0,
          isRedteam: false,
          provider,
          prompt: { raw: 'filter evaluator synthetic prompt', label: 'test' },
          test: { assert: [{ type: 'is-refusal' }, { type: 'not-guardrails' }] },
          conversations: {},
          registers: {},
        });
        const recovered = await provider.callApi('filter direct synthetic prompt');

        expect(direct).toMatchObject({
          output: 'I cannot assist with this request because it was blocked by a content filter.',
          isRefusal: true,
          guardrails: { flagged: true, flaggedOutput: true },
          tokenUsage: { prompt: 8, completion: 3, total: 11 },
          cost: 0.025,
          sessionId: 'test-session-123',
        });
        expect(direct).not.toHaveProperty('error');
        expect(direct).not.toHaveProperty('raw');
        expect(direct.cached).not.toBe(true);
        expect(graded).toMatchObject({
          success: true,
          gradingResult: {
            componentResults: [
              expect.objectContaining({ pass: true, assertion: { type: 'is-refusal' } }),
              expect.objectContaining({ pass: true, assertion: { type: 'not-guardrails' } }),
            ],
          },
        });
        const observable = JSON.stringify({ direct, graded, loggedErrors: errorSpy.mock.calls });
        for (const value of [
          'synthetic-private-filtered-output',
          'synthetic-private-filtered-structured-output',
          'synthetic-private-upstream-content-filter-message',
          'synthetic-private-content-filter-body',
        ]) {
          expect(observable).not.toContain(value);
        }
        expect(recovered.output).toBe('recovered');
        expect(mockSessionPrompt).toHaveBeenCalledTimes(3);
      } finally {
        disableCache();
      }
    });

    it('does not turn a transport error or its adjacent assistant-like data into a refusal', async () => {
      const response = createMockPromptResponse([], { input: 40, output: 30 }, 0.2);
      mockSessionPrompt.mockResolvedValueOnce({
        data: {
          ...response.data,
          info: {
            ...response.data.info,
            error: { name: 'ContentFilterError' },
          },
        },
        error: {
          name: 'ContentFilterError',
          data: { message: 'Gateway filtering failed before an assistant response' },
        },
        response: new Response(null, { status: 500 }),
      });
      const provider = new OpenCodeSDKProvider({ env: { ANTHROPIC_API_KEY: 'test-api-key' } });

      const result = await provider.callApi('transport filtering');

      expect(result.error).toContain('ContentFilterError: HTTP 500: Gateway filtering failed');
      for (const field of ['output', 'guardrails', 'isRefusal', 'tokenUsage', 'cost', 'raw']) {
        expect(result).not.toHaveProperty(field);
      }
    });

    it.each([
      {
        label: 'assistant credit code in message',
        delivery: 'assistant',
        details: {
          statusCode: 429,
          isRetryable: false,
          message: 'credit_balance_exhausted: there are no credits',
          responseBody: 'synthetic-private-quota-body',
        },
        diagnostic: 'credit_balance_exhausted: there are no credits',
      },
      {
        label: 'transport response body and sibling HTTP status',
        delivery: 'transport',
        details: {
          isRetryable: false,
          message: 'Upstream rejected the request',
          responseBody: JSON.stringify({
            error: {
              code: 'billing_hard_limit_reached',
              message: 'synthetic-private-quota-body',
            },
            internal: 'synthetic-private-quota-header',
          }),
        },
        diagnostic: 'Upstream rejected the request',
      },
      {
        label: 'thrown SDK natural billing message',
        delivery: 'throw',
        details: {
          statusCode: 429,
          isRetryable: false,
          message: 'Your credit balance is too low to use this model',
          responseHeaders: { authorization: 'synthetic-private-quota-header' },
        },
        diagnostic: 'Your credit balance is too low to use this model',
      },
      {
        label: 'assistant quota code on the error data',
        delivery: 'assistant',
        details: {
          statusCode: 429,
          isRetryable: false,
          code: 'insufficient_quota',
          message: 'No balance remains',
        },
        diagnostic: 'No balance remains',
      },
      {
        label: 'transport sibling status despite a malformed SDK status',
        delivery: 'transport',
        outerStatus: 'synthetic-private-quota-body',
        details: {
          isRetryable: false,
          type: 'billing_not_active',
          message: 'The account cannot be charged',
        },
        diagnostic: 'The account cannot be charged',
      },
    ])('stops scheduler retries for $label without exposing the raw SDK error', async (entry) => {
      const { isProviderResponseRateLimited } = await import('../../src/scheduler/types');
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
      const error = {
        _tag: 'APIError',
        ...('outerStatus' in entry ? { statusCode: entry.outerStatus } : {}),
        data: entry.details,
      };
      if (entry.delivery === 'assistant') {
        const response = createMockPromptResponse([], { input: 6, output: 0 }, 0.01);
        mockSessionPrompt.mockResolvedValueOnce({
          data: { ...response.data, info: { ...response.data.info, error } },
        });
      } else if (entry.delivery === 'transport') {
        mockSessionPrompt.mockResolvedValueOnce({
          error,
          response: new Response(null, { status: 429 }),
        });
      } else {
        mockSessionPrompt.mockRejectedValueOnce(error);
      }
      const provider = new OpenCodeSDKProvider({ env: { ANTHROPIC_API_KEY: 'test-api-key' } });

      const result = await provider.callApi(`quota ${entry.label}`);

      expect(result.error).toContain('APIError: HTTP 429');
      expect(result.error).toContain(entry.diagnostic);
      expect(result.metadata).toEqual({ rateLimitKind: 'quota' });
      expect(isProviderResponseRateLimited(result, undefined)).toBe(false);
      expect(result).not.toHaveProperty('output');
      expect(result).not.toHaveProperty('raw');
      if (entry.delivery === 'assistant') {
        expect(result).toMatchObject({
          tokenUsage: { prompt: 6, completion: 0, total: 6 },
          cost: 0.01,
          sessionId: 'test-session-123',
        });
      }
      const observable = JSON.stringify({ result, loggedErrors: errorSpy.mock.calls });
      expect(observable).not.toContain('synthetic-private-quota-body');
      expect(observable).not.toContain('synthetic-private-quota-header');
    });

    it.each([
      { isRetryable: true, message: 'rate_limit_exceeded: too many requests' },
      { isRetryable: true, message: 'The requests per minute quota is temporarily saturated' },
      { isRetryable: false, message: 'rate_limit_exceeded: too many requests' },
    ])('keeps ordinary HTTP 429 diagnostics retryable for $message', async (details) => {
      const { isProviderResponseRateLimited } = await import('../../src/scheduler/types');
      mockSessionPrompt.mockResolvedValueOnce({
        error: {
          name: 'APIError',
          data: {
            ...details,
            statusCode: 429,
            responseBody: JSON.stringify({ request: { code: 'credit_balance_exhausted' } }),
          },
        },
      });
      const provider = new OpenCodeSDKProvider({ env: { ANTHROPIC_API_KEY: 'test-api-key' } });

      const result = await provider.callApi(`rate limit ${details.message}`);

      expect(result.error).toContain(`APIError: HTTP 429: ${details.message}`);
      expect(result.metadata).toEqual({ rateLimitKind: 'rate_limit' });
      expect(isProviderResponseRateLimited(result, undefined)).toBe(true);
      expect(result).not.toHaveProperty('raw');
    });
  });
});
