import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

import { createOpencodeClient as createInstalledOpencodeClient } from '@opencode-ai/sdk/v2/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, disableCache, enableCache } from '../../src/cache';
import { evaluate, runEval } from '../../src/evaluator';
import {
  type InMemoryEvaluation,
  InMemoryEvaluationStore,
} from '../../src/evaluator/inMemoryStore';
import logger from '../../src/logger';
import { initializeAgenticCache } from '../../src/providers/agentic-utils';
import {
  convertPermissionConfigToRuleset,
  FS_READONLY_TOOLS,
  OpenCodeSDKProvider,
} from '../../src/providers/opencode-sdk';
import { providerRegistry } from '../../src/providers/providerRegistry';
import { createDeferred, mockProcessEnv } from '../util/utils';
import type { MockInstance } from 'vitest';

import type { OpenCodeSDKConfig } from '../../src/providers/opencode-sdk';
import type { ApiProvider, CallApiContextParams, TestSuite } from '../../src/types/index';

vi.mock('../../src/cliState', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/cliState')>();
  actual.default.basePath = '/test/basePath';
  return actual;
});
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

const createPromptContext = (config: OpenCodeSDKConfig): CallApiContextParams => ({
  vars: {},
  prompt: { raw: 'configured', label: 'configured', config },
});

const remoteMcpWithBearer = (token: string): OpenCodeSDKConfig['mcp'] => ({
  gateway: {
    type: 'remote',
    url: 'https://example.test/mcp',
    headers: { Authorization: `Bearer ${token}` },
  },
});

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
    mockSessionAbort.mockResolvedValue({ data: true });
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
      it('passes scoped env-file defaults to the server while preserving provider overrides', async () => {
        const { default: cliState } =
          await vi.importActual<typeof import('../../src/cliState')>('../../src/cliState');
        const restoreEnv = mockProcessEnv({ PROMPTFOO_REVIEW_ENV_PROBE: 'host' });
        mockSessionPrompt.mockResolvedValue(
          createMockPromptResponse([{ type: 'text', text: 'ok' }]),
        );
        try {
          const provider = new OpenCodeSDKProvider({
            env: { ANTHROPIC_API_KEY: 'provider-key' },
          });
          const result = await cliState.withEnvFileOverrides(
            { PROMPTFOO_REVIEW_ENV_PROBE: 'file', ANTHROPIC_API_KEY: 'file-key' },
            () => provider.callApi('Test prompt'),
          );
          expect(result.output).toBe('ok');
          expect(mockCreateOpencode).toHaveBeenCalledWith(
            expect.objectContaining({
              env: expect.objectContaining({
                PROMPTFOO_REVIEW_ENV_PROBE: 'file',
                ANTHROPIC_API_KEY: 'provider-key',
              }),
            }),
          );
          expect(process.env.PROMPTFOO_REVIEW_ENV_PROBE).toBe('host');
        } finally {
          restoreEnv();
        }
      });

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
        expect(mockSessionCreate.mock.calls.map(([parameters]) => parameters)).toContainEqual(
          expect.objectContaining({
            title: expect.stringMatching(/^promptfoo-\d+$/),
          }),
        );

        // Verify session.prompt was called with the flattened v2 parameter shape
        expect(mockSessionPrompt.mock.calls.map(([parameters]) => parameters)).toContainEqual(
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

        expect(mockSessionCreate.mock.calls.map(([parameters]) => parameters)).toContainEqual(
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
        expect(mockSessionPrompt.mock.calls.map(([parameters]) => parameters)).toContainEqual(
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
          { signal: expect.any(AbortSignal) },
        );
        expect(mockSessionMessages.mock.calls[0][1].signal.aborted).toBe(true);
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
          signal: expect.any(AbortSignal),
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
          name: 'individual semicolon-delimited URL query and fragment values',
          config: {
            mcp: {
              gateway: {
                type: 'remote',
                url: 'https://example.test/mcp?route=public;opaque=synthetic-semicolon-query-0919;second=synthetic%2Bsemicolon-0919#route=public;opaque=synthetic-semicolon-fragment-0919',
              },
            },
          },
          secrets: [
            'synthetic-semicolon-query-0919',
            'synthetic+semicolon-0919',
            'synthetic%2Bsemicolon-0919',
            'synthetic-semicolon-fragment-0919',
          ],
        },
        {
          name: 'individual semicolon-delimited values even when the configured URL is malformed',
          config: {
            mcp: {
              gateway: {
                type: 'remote',
                url: 'https://[invalid]/mcp?route=public;opaque=synthetic-invalid-semicolon-0919#route=public;opaque=synthetic-invalid-fragment-0919',
              },
            },
          },
          secrets: ['synthetic-invalid-semicolon-0919', 'synthetic-invalid-fragment-0919'],
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

      it('redacts JSON-escaped and nested representations of configured header credentials', async () => {
        const credential = 'synthetic-"quoted"\\gateway/value-0919';
        const escapeJson = (value: string) => JSON.stringify(value).slice(1, -1);
        const jsonEscaped = escapeJson(credential);
        const nestedJson = escapeJson(jsonEscaped);
        const jsonEscapedSlash = jsonEscaped.replaceAll('/', '\\/');
        const unicodeEscaped = credential.replace(
          /["\\]/g,
          (character) => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'),
        );
        const unicodeEscapedUppercase = unicodeEscaped.replace(
          /\\u([0-9a-f]{4})/g,
          (_, hex) => '\\u' + String(hex).toUpperCase(),
        );
        const variants = [jsonEscaped, nestedJson, jsonEscapedSlash, unicodeEscapedUppercase];
        const diagnostics = [
          JSON.stringify({ 'X-Gateway': credential }),
          JSON.stringify(JSON.stringify({ 'X-Gateway': credential })),
          `{ "X-Gateway": "${jsonEscapedSlash}" }`,
          `{ "X-Gateway": "${unicodeEscapedUppercase}" }`,
        ];
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
        const provider = new OpenCodeSDKProvider({
          config: {
            mcp: {
              gateway: {
                type: 'remote',
                url: 'https://example.test/mcp',
                headers: { 'X-Gateway': credential },
              },
            },
          },
        });
        const original = createMockPromptResponse([]);
        for (const [index, diagnostic] of diagnostics.entries()) {
          const error = {
            name: 'APIError',
            data: { message: `Upstream diagnostic ${diagnostic}; ordinary context` },
          };
          if (index % 2 === 0) {
            mockSessionPrompt.mockResolvedValueOnce({ error });
          } else {
            mockSessionPrompt.mockResolvedValueOnce({
              data: { ...original.data, info: { ...original.data.info, error } },
            });
          }
          const result = await provider.callApi(`JSON credential case ${index}`);
          const logged = errorSpy.mock.lastCall?.[1] as { error?: string } | undefined;
          for (const diagnosticResult of [result.error, logged?.error]) {
            expect(diagnosticResult).toContain('[REDACTED]');
            expect(diagnosticResult).toContain('ordinary context');
            for (const variant of [credential, ...variants]) {
              expect(diagnosticResult).not.toContain(variant);
            }
          }
        }
      });

      it('redacts Unicode-escaped credentials while preserving unrecognized diagnostic text', async () => {
        const credential = 'synthetic-snowman-☃-and-emoji-🔐';
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
        const escaped = 'synthetic-snowman-\\u2603-and-emoji-\\uD83D\\uDD10';
        const provider = new OpenCodeSDKProvider({ config: { apiKey: credential } });
        mockSessionPrompt.mockResolvedValueOnce({
          error: { name: 'APIError', data: { message: `Upstream ${escaped}; useful context` } },
        });

        const result = await provider.callApi('Unicode credential diagnostic');
        const logged = errorSpy.mock.lastCall?.[1] as { error?: string } | undefined;

        for (const diagnostic of [result.error, logged?.error]) {
          expect(diagnostic).toContain('[REDACTED]; useful context');
          expect(diagnostic).not.toContain(escaped);
          expect(diagnostic).not.toContain(credential);
        }
      });

      it.each([
        {
          name: 'Go-style HTML-safe JSON characters',
          credential: 'synthetic-gateway-<&>-value-991',
          rendered: 'synthetic-gateway-\\u003c\\u0026\\u003e-value-991',
        },
        {
          name: 'selective script-close solidus escaping',
          credential: 'synthetic/path</script/end-991',
          rendered: 'synthetic/path<\\/script/end-991',
        },
        {
          name: 'HTML-safe line separators with otherwise unescaped Unicode',
          credential: 'synthetic-é-and-\u2028-and-\u2029-value-991',
          rendered: 'synthetic-é-and-\\u2028-and-\\u2029-value-991',
        },
        {
          name: 'HTML-escaped diagnostic values',
          credential: 'synthetic-gateway-<&>-value-991',
          rendered: 'synthetic-gateway-&lt;&amp;&gt;-value-991',
        },
        {
          name: 'plain Python-style HTML double quotes and ampersands',
          credential: 'synthetic-"quoted"&-991',
          rendered: 'synthetic-&quot;quoted&quot;&amp;-991',
        },
        {
          name: 'Python-style HTML hexadecimal apostrophes',
          credential: "synthetic-'single'-991",
          rendered: 'synthetic-&#x27;single&#x27;-991',
        },
        {
          name: 'XML-style named apostrophes and uppercase entity names',
          credential: "synthetic-'single'&-991",
          rendered: 'synthetic-&APOS;single&APOS;&AMP;-991',
        },
        {
          name: 'zero-padded hexadecimal HTML entities',
          credential: 'synthetic-"quoted"&-991',
          rendered: 'synthetic-&#x0022;quoted&#X0022;&#x0026;-991',
        },
      ])(
        'redacts configured custom headers echoed with $name',
        async ({ credential, rendered }) => {
          const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
          const provider = new OpenCodeSDKProvider({
            config: {
              mcp: {
                gateway: {
                  type: 'remote',
                  url: 'https://example.test/mcp',
                  headers: { 'X-Trace': credential },
                },
              },
            },
          });
          const original = createMockPromptResponse([]);
          const error = {
            name: 'APIError',
            data: { message: `Upstream ${rendered}; valid context` },
          };
          mockSessionPrompt.mockResolvedValueOnce({ error }).mockResolvedValueOnce({
            data: { ...original.data, info: { ...original.data.info, error } },
          });

          for (const label of ['SDK response', 'assistant response']) {
            const result = await provider.callApi(label);
            const logged = errorSpy.mock.lastCall?.[1] as { error?: string } | undefined;
            for (const diagnostic of [result.error, logged?.error]) {
              expect(diagnostic).toContain('[REDACTED]; valid context');
              expect(diagnostic).not.toContain(rendered);
              expect(diagnostic).not.toContain(credential);
            }
          }
        },
      );

      it.each(['OAuth client secret', 'semicolon URL value'])(
        'redacts canonical form encoding of a configured %s from SDK and assistant errors',
        async (source) => {
          const credential = 'synthetic pass!~(value)-991';
          const formEncoded = new URLSearchParams({ credential })
            .toString()
            .slice('credential='.length);
          const twiceEncoded = new URLSearchParams({ credential: formEncoded })
            .toString()
            .slice('credential='.length);
          expect(formEncoded).toBe('synthetic+pass%21%7E%28value%29-991');
          const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
          const provider = new OpenCodeSDKProvider({
            config: {
              mcp: {
                gateway: {
                  type: 'remote',
                  url:
                    source === 'semicolon URL value'
                      ? `https://example.test/mcp?route=public;opaque=${encodeURIComponent(credential)}`
                      : 'https://example.test/mcp',
                  ...(source === 'OAuth client secret'
                    ? { oauth: { clientId: 'synthetic-form-client-id', clientSecret: credential } }
                    : {}),
                },
              },
            },
          });
          const original = createMockPromptResponse([]);
          const error = {
            name: 'APIError',
            data: { message: `Upstream ${formEncoded} or ${twiceEncoded}; valid context` },
          };
          mockSessionPrompt.mockResolvedValueOnce({ error }).mockResolvedValueOnce({
            data: { ...original.data, info: { ...original.data.info, error } },
          });

          for (const label of ['SDK form', 'assistant form']) {
            const result = await provider.callApi(label);
            const logged = errorSpy.mock.lastCall?.[1] as { error?: string } | undefined;
            for (const diagnostic of [result.error, logged?.error]) {
              expect(diagnostic).toContain('[REDACTED] or [REDACTED]; valid context');
              for (const variant of [credential, formEncoded, twiceEncoded]) {
                expect(diagnostic).not.toContain(variant);
              }
            }
          }
        },
      );

      it.each([
        ['shell command', ['sh', '-c', 'exec my-mcp --token synthetic-shell-private-991']],
        [
          'wrapped shell command',
          [
            'env',
            'SAFE_CONTEXT=true',
            '/bin/bash',
            '-lc',
            'exec my-mcp --token synthetic-shell-private-991',
          ],
        ],
        [
          'computed shell command',
          ['bash', '-c', 'exec my-mcp --token "$(printf synthetic-shell-%s private-991)"'],
        ],
        [
          'inline Python',
          ['python3', '-c', 'value = "synthetic-shell-" + "private-991"; start(value)'],
        ],
        ['inline JavaScript', ['node', '--eval', 'start("synthetic-shell-" + "private-991")']],
        ['inline Deno', ['deno', 'eval', 'start("synthetic-shell-" + "private-991")']],
        ['inline tsx', ['tsx', '-e', 'start(["synthetic-shell","private-991"].join("-"))']],
        ['inline ts-node', ['ts-node', '-e', 'start(["synthetic-shell","private-991"].join("-"))']],
        ['npx shell call', ['npx', '-c', 'exec my-mcp --token synthetic-shell-private-991']],
        [
          'npx long shell call',
          ['npx', '--call', 'exec my-mcp --token synthetic-shell-private-991'],
        ],
        [
          'npm shell call',
          ['npm', 'exec', '--call', 'exec my-mcp --token synthetic-shell-private-991'],
        ],
        [
          'package runner with Node print',
          ['npx', 'node', '-p', '"synthetic-shell-" + "private-991"'],
        ],
        [
          'env split-string shell',
          [
            '/usr/bin/env',
            '-S',
            'sh -c "exec my-mcp --token $(printf synthetic-shell-%s private-991)"',
          ],
        ],
        [
          'long env split-string shell',
          [
            '/usr/bin/env',
            '--split-string=sh -c "exec my-mcp --token synthetic-shell-private-991"',
          ],
        ],
        [
          'unknown evaluation wrapper',
          ['other-mcp-wrapper', '--eval', 'start(["synthetic-shell","private-991"].join("-"))'],
        ],
        [
          'bare programming expression for a wrapper',
          ['other-mcp-wrapper', 'start(["synthetic-shell","private-991"].join("-"))'],
        ],
        ['PowerShell', ['pwsh', '-Command', 'Start-Mcp -Token synthetic-shell-private-991']],
        ['Windows command', ['cmd.exe', '/c', 'my-mcp --token synthetic-shell-private-991']],
        [
          'custom compound argument',
          ['custom-launcher', 'exec my-mcp --token synthetic-shell-private-991'],
        ],
      ])('withholds untrusted diagnostic text for a configured %s', async (_label, command) => {
        const secret = 'synthetic-shell-private-991';
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
        const provider = new OpenCodeSDKProvider({
          config: { mcp: { gateway: { type: 'local', command } } },
        });
        const original = createMockPromptResponse([]);
        const error = {
          name: 'APIError',
          data: { statusCode: 502, message: `Gateway rejected supplied value ${secret}` },
        };
        mockSessionPrompt.mockResolvedValueOnce({ error }).mockResolvedValueOnce({
          data: { ...original.data, info: { ...original.data.info, error } },
        });

        for (const prompt of ['SDK failure', 'assistant failure']) {
          const result = await provider.callApi(prompt);
          const logged = errorSpy.mock.lastCall?.[1] as { error?: string } | undefined;
          for (const diagnostic of [result.error, logged?.error]) {
            expect(diagnostic).toContain('APIError: HTTP 502: Upstream diagnostic withheld');
            expect(diagnostic).not.toContain(secret);
            expect(diagnostic).not.toContain('Gateway rejected supplied value');
          }
        }
      });

      it.each([
        ['short npx package', ['npx', '-p', '@example/mcp', 'server']],
        ['long npx package', ['npx', '--package', '@example/mcp', 'server']],
        ['joined npx package', ['npx', '-p@example/mcp', 'server']],
        [
          'repeated npx packages named like interpreters',
          ['npx', '-p', 'node', '-p', 'python', 'server'],
        ],
        ['npm package', ['npm', 'exec', '--package', '@example/mcp', '--', 'server']],
        [
          'wrapped npx package',
          ['env', 'SAFE_CONTEXT=true', 'npx', '-p', '@example/mcp', 'server'],
        ],
      ])(
        'preserves upstream diagnostics for an ordinary %s selection',
        async (_source, command) => {
          const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
          const provider = new OpenCodeSDKProvider({
            config: { mcp: { gateway: { type: 'local', command } } },
          });
          const original = createMockPromptResponse([]);
          const error = {
            name: 'APIError',
            data: { statusCode: 404, message: 'The requested model does not exist' },
          };
          mockSessionPrompt.mockResolvedValueOnce({ error }).mockResolvedValueOnce({
            data: { ...original.data, info: { ...original.data.info, error } },
          });

          for (const prompt of ['SDK package diagnostic', 'assistant package diagnostic']) {
            const result = await provider.callApi(prompt);
            const logged = errorSpy.mock.lastCall?.[1] as { error?: string } | undefined;
            for (const diagnostic of [result.error, logged?.error]) {
              expect(diagnostic).toContain('HTTP 404: The requested model does not exist');
            }
          }
        },
      );

      it('retains compound-command protection for a reused server and releases it only on successful cleanup', async () => {
        const secret = 'synthetic-shell-private-991';
        const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
        const provider = new OpenCodeSDKProvider({ config: { tools: { skill: true } } });
        await provider.callApi(
          'initialize shell server',
          createPromptContext({
            mcp: {
              gateway: {
                type: 'local',
                command: ['sh', '-c', 'exec my-mcp --token synthetic-shell-private-991'],
              },
            },
          }),
        );
        mockSessionMessages.mockRejectedValueOnce(new Error(`history echoed ${secret}`));
        const ordinary = await provider.callApi('successful next call without configuration');
        expect(ordinary.output).toBe('Test response');
        expect(debugSpy).toHaveBeenCalledWith(
          '[OpenCode SDK] Could not fetch session history for skill tracking',
          { error: expect.stringContaining('Upstream diagnostic withheld') },
        );
        const failure = {
          error: {
            name: 'APIError',
            data: { statusCode: 503, message: `Previously used value ${secret}` },
          },
        };
        mockSessionPrompt.mockResolvedValueOnce(failure).mockResolvedValueOnce(failure);
        const reused = await provider.callApi('reused server without config');
        expect(reused.error).toContain('APIError: HTTP 503: Upstream diagnostic withheld');
        expect(
          JSON.stringify({ reused, logs: errorSpy.mock.calls, debug: debugSpy.mock.calls }),
        ).not.toContain(secret);

        await provider.cleanup();
        const fresh = await provider.callApi('new server without compound config');
        expect(mockCreateOpencode).toHaveBeenCalledTimes(2);
        expect(fresh.error).toContain(`APIError: HTTP 503: Previously used value ${secret}`);
      });

      it('preserves safe scheduler timing and typed errors even when compound command messages are withheld', async () => {
        const provider = new OpenCodeSDKProvider({
          config: {
            mcp: {
              gateway: {
                type: 'local',
                command: ['sh', '-c', 'exec my-mcp --token synthetic-shell-private-991'],
              },
            },
          },
        });
        mockSessionPrompt.mockResolvedValueOnce({
          error: {
            name: 'APIError',
            data: {
              statusCode: 429,
              isRetryable: true,
              message: 'Temporary limit synthetic-shell-private-991',
              responseHeaders: { 'Retry-After': '30', 'Set-Cookie': 'synthetic-shell-private-991' },
            },
          },
        });

        const result = await provider.callApi('compound throttling');

        expect(result.error).toContain('APIError: HTTP 429: Upstream diagnostic withheld');
        expect(result.metadata).toEqual({
          rateLimitKind: 'rate_limit',
          headers: { 'retry-after': '30' },
        });
        expect(JSON.stringify(result)).not.toContain('synthetic-shell-private-991');
      });

      it.each([
        ['provider API key', { apiKey: 'q7x9' }],
        [
          'custom MCP header',
          {
            mcp: {
              gateway: {
                type: 'remote',
                url: 'https://example.test/mcp',
                headers: { 'X-Gateway': 'q7x9' },
              },
            },
          },
        ],
        [
          'OAuth client secret',
          {
            mcp: {
              gateway: {
                type: 'remote',
                url: 'https://example.test/mcp',
                oauth: { clientId: 'ordinary-client', clientSecret: 'q7x9' },
              },
            },
          },
        ],
        [
          'opaque query value',
          {
            mcp: {
              gateway: { type: 'remote', url: 'https://example.test/mcp?route=3;opaque=q7x9' },
            },
          },
        ],
        [
          'local subprocess credential flag',
          { mcp: { gateway: { type: 'local', command: ['test-server', '--token', 'q7x9'] } } },
        ],
      ] satisfies Array<[string, OpenCodeSDKConfig]>)(
        'redacts short %s even when embedded within an upstream identifier',
        async (_source, config) => {
          const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
          const provider = new OpenCodeSDKProvider({ config });
          mockSessionPrompt.mockResolvedValueOnce({
            error: {
              name: 'APIError',
              data: { statusCode: 502, message: 'Context prefix-q7x9-suffix and readable text' },
            },
          });

          const result = await provider.callApi('short synthetic credential');
          const logged = errorSpy.mock.lastCall?.[1] as { error?: string } | undefined;

          for (const diagnostic of [result.error, logged?.error]) {
            expect(diagnostic).toContain(
              'HTTP 502: Context prefix-[REDACTED]-suffix and readable text',
            );
            expect(diagnostic).not.toContain('q7x9');
          }
        },
      );

      it('retains short custom credentials from a previous prompt without filtering innocent numeric retry headers', async () => {
        const provider = new OpenCodeSDKProvider();
        await provider.callApi(
          'initialize short credential',
          createPromptContext({
            mcp: {
              gateway: {
                type: 'remote',
                url: 'https://example.test/mcp?route=3',
                headers: { 'X-Gateway': 'q7x9' },
              },
            },
          }),
        );
        mockSessionPrompt.mockResolvedValueOnce({
          error: {
            name: 'APIError',
            data: {
              statusCode: 429,
              isRetryable: true,
              message: 'Context prefix-q7x9-suffix',
              responseHeaders: { 'Retry-After': '30' },
            },
          },
        });

        const result = await provider.callApi('later short credential error');

        expect(result.error).toContain('Context prefix-[REDACTED]-suffix');
        expect(result.metadata).toEqual({
          rateLimitKind: 'rate_limit',
          headers: { 'retry-after': '30' },
        });
      });

      it.each([
        {
          name: 'local MCP database URL',
          config: {
            mcp: {
              gateway: {
                type: 'local',
                command: ['test-server'],
                environment: { DATABASE_URL: 'postgres://user:q7x9@db.example/db' },
              },
            },
          },
        },
        {
          name: 'local MCP HTTPS proxy',
          config: {
            mcp: {
              gateway: {
                type: 'local',
                command: ['test-server'],
                environment: { HTTPS_PROXY: 'https://user:q7x9@example.test/mcp' },
              },
            },
          },
        },
        {
          name: 'provider-level database URL',
          env: { DATABASE_URL: 'postgres://user:q7x9@db.example/db' },
        },
        {
          name: 'local connection string password',
          config: {
            mcp: {
              gateway: {
                type: 'local',
                command: ['test-server'],
                environment: { CONNECTION_STRING: 'Server=example;Port=30;Pwd="q7x9";' },
              },
            },
          },
        },
        {
          name: 'provider-level DSN password',
          env: { SERVICE_DSN: "Server=example;Pwd='q7x9';Port=30" },
        },
        {
          name: 'local positional credential URL',
          config: {
            mcp: {
              gateway: {
                type: 'local',
                command: ['test-server', 'postgres://user:q7x9@db.example/db'],
              },
            },
          },
        },
        {
          name: 'local credential URL flag',
          config: {
            mcp: {
              gateway: {
                type: 'local',
                command: ['test-server', '--database-url=postgres://user:q7x9@db.example/db'],
              },
            },
          },
        },
        {
          name: 'local authorization header flag',
          config: {
            mcp: {
              gateway: {
                type: 'local',
                command: ['test-server', '--header=Authorization: Bearer q7x9'],
              },
            },
          },
        },
      ] as Array<{ name: string; config?: OpenCodeSDKConfig; env?: Record<string, string> }>)(
        'redacts short passwords embedded in $name from SDK and assistant errors',
        async ({ config, env }) => {
          const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
          const provider = new OpenCodeSDKProvider({ config, env });
          const original = createMockPromptResponse([]);
          const error = {
            name: 'APIError',
            data: { statusCode: 502, message: 'Context prefix-q7x9-suffix and readable text' },
          };
          mockSessionPrompt.mockResolvedValueOnce({ error }).mockResolvedValueOnce({
            data: { ...original.data, info: { ...original.data.info, error } },
          });

          for (const prompt of ['SDK environment diagnostic', 'assistant environment diagnostic']) {
            const result = await provider.callApi(prompt);
            const logged = errorSpy.mock.lastCall?.[1] as { error?: string } | undefined;
            for (const diagnostic of [result.error, logged?.error]) {
              expect(diagnostic).toContain(
                'HTTP 502: Context prefix-[REDACTED]-suffix and readable text',
              );
              expect(diagnostic).not.toContain('q7x9');
            }
          }
        },
      );

      it('redacts inherited URL passwords without strongly redacting ordinary inherited paths or retry headers', async () => {
        vi.stubEnv('SYNTHETIC_DATABASE_URL', 'postgres://user:q7x9@db.example/simple');
        try {
          const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
          const provider = new OpenCodeSDKProvider();
          mockSessionPrompt.mockResolvedValueOnce({
            error: {
              name: 'APIError',
              data: {
                statusCode: 429,
                isRetryable: true,
                message: 'Context prefix-q7x9-suffix; simple-work continues',
                responseHeaders: { 'Retry-After': '30' },
              },
            },
          });

          const result = await provider.callApi('inherited environment diagnostic');
          const logged = errorSpy.mock.lastCall?.[1] as { error?: string } | undefined;

          for (const diagnostic of [result.error, logged?.error]) {
            expect(diagnostic).toContain('Context prefix-[REDACTED]-suffix; simple-work continues');
          }
          expect(result.metadata).toEqual({
            rateLimitKind: 'rate_limit',
            headers: { 'retry-after': '30' },
          });
        } finally {
          vi.unstubAllEnvs();
        }
      });

      it.each([
        ['ODBC braces', 'CONNECTION_STRING', 'Server=example;Pwd={q7x9};', 'q7x9'],
        ['ODBC semicolon', 'SERVICE_DSN', 'Server=example;Pwd={q7;x9};Port=30', 'q7;x9'],
        ['escaped ODBC brace', 'SERVICE_DSN', 'Server=example;Pwd={q7}}x9};Port=30', 'q7}x9'],
        ['quoted ODBC semicolon', 'SERVICE_DSN', 'Server=example;Pwd="q7;x9";Port=30', 'q7;x9'],
        [
          'Oracle JDBC thin',
          'JDBC_URL',
          'jdbc:oracle:thin:user/q7x9@db.example:1521/service',
          'q7x9',
        ],
        [
          'Oracle JDBC OCI',
          'JDBC_URL',
          'jdbc:oracle:oci:user/q7x9@db.example:1521/service',
          'q7x9',
        ],
        [
          'Postgres JDBC authority',
          'JDBC_URL',
          'jdbc:postgresql://user:q7x9@db.example/database',
          'q7x9',
        ],
      ])('redacts decoded %s connection credentials', async (_source, key, value, credential) => {
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
        for (const options of [
          {
            config: {
              mcp: {
                gateway: { type: 'local', command: ['test-server'], environment: { [key]: value } },
              },
            },
          },
          { env: { [key]: value } },
        ] as Array<{ config?: OpenCodeSDKConfig; env?: Record<string, string> }>) {
          const provider = new OpenCodeSDKProvider(options);
          const original = createMockPromptResponse([]);
          const error = {
            name: 'APIError',
            data: {
              statusCode: 502,
              message: `Context prefix-${credential}-suffix and readable text`,
            },
          };
          mockSessionPrompt.mockResolvedValueOnce({ error }).mockResolvedValueOnce({
            data: { ...original.data, info: { ...original.data.info, error } },
          });

          for (const prompt of ['SDK connection diagnostic', 'assistant connection diagnostic']) {
            const result = await provider.callApi(prompt);
            const logged = errorSpy.mock.lastCall?.[1] as { error?: string } | undefined;
            for (const diagnostic of [result.error, logged?.error]) {
              expect(diagnostic).toContain(
                'HTTP 502: Context prefix-[REDACTED]-suffix and readable text',
              );
              expect(diagnostic).not.toContain(credential);
            }
          }
        }
      });

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

      it('redacts a previous prompt credential from history diagnostics while preserving a successful result', async () => {
        const previous = 'synthetic-secondary-history-credential-0919';
        const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
        const provider = new OpenCodeSDKProvider({ config: { tools: { skill: true } } });
        mockSessionMessages
          .mockResolvedValueOnce([])
          .mockRejectedValueOnce(new Error(`History temporarily failed for ${previous}`));

        await provider.callApi(
          'initialize server for history',
          createPromptContext({ mcp: remoteMcpWithBearer(previous) }),
        );
        const result = await provider.callApi('next prompt without MCP configuration');

        expect(result.error).toBeUndefined();
        expect(result.output).toBe('Test response');
        expect(mockSessionMessages).toHaveBeenCalledTimes(2);
        expect(debugSpy).toHaveBeenCalledWith(
          '[OpenCode SDK] Could not fetch session history for skill tracking',
          { error: 'History temporarily failed for [REDACTED]' },
        );
        expect(JSON.stringify({ result, logs: debugSpy.mock.calls })).not.toContain(previous);
      });

      it('redacts echoed credentials in missing history-anchor diagnostics', async () => {
        const previous = 'synthetic-secondary-anchor-credential-0919';
        const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
        const provider = new OpenCodeSDKProvider({ config: { tools: { skill: true } } });
        await provider.callApi(
          'initialize server for history anchors',
          createPromptContext({ mcp: remoteMcpWithBearer(previous) }),
        );
        mockSessionPrompt
          .mockResolvedValueOnce(
            createMockPromptResponseWithAnchors('missing parent fallback', {
              id: 'assistant-safe',
              parentID: previous,
            }),
          )
          .mockResolvedValueOnce(
            createMockPromptResponseWithAnchors('missing assistant fallback', {
              id: previous,
              parentID: 'parent-safe',
            }),
          );
        mockSessionMessages
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ info: { id: 'parent-safe', role: 'user' }, parts: [] }]);

        const parentResult = await provider.callApi('prompt with missing parent');
        const assistantResult = await provider.callApi('prompt with missing assistant');

        expect(parentResult.output).toBe('missing parent fallback');
        expect(assistantResult.output).toBe('missing assistant fallback');
        expect(debugSpy).toHaveBeenCalledWith(
          '[OpenCode SDK] Parent message not found in fetched messages; falling back to final-message parts for skill tracking',
          { parentId: '[REDACTED]', messageCount: 0 },
        );
        expect(debugSpy).toHaveBeenCalledWith(
          '[OpenCode SDK] Assistant message not found after its parent in fetched messages; falling back to final-message parts for skill tracking',
          { assistantId: '[REDACTED]', messageCount: 1 },
        );
        expect(JSON.stringify(debugSpy.mock.calls)).not.toContain(previous);
      });

      it('redacts a previous prompt credential when a detached abort rejects after cleanup', async () => {
        const previous = 'synthetic-secondary-abort-credential-0919';
        const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
        const abortResult = createDeferred<unknown>();
        const promptResult = createDeferred<ReturnType<typeof createMockPromptResponse>>();
        const controller = new AbortController();
        const provider = new OpenCodeSDKProvider();
        await provider.callApi(
          'initialize server for abort',
          createPromptContext({ mcp: remoteMcpWithBearer(previous) }),
        );
        mockSessionPrompt.mockImplementationOnce(() => promptResult.promise);
        mockSessionAbort.mockImplementationOnce(() => abortResult.promise);

        const pendingCall = provider.callApi('next prompt without MCP configuration', undefined, {
          abortSignal: controller.signal,
        });
        await vi.waitFor(() => expect(mockSessionPrompt).toHaveBeenCalledTimes(2));
        controller.abort();
        expect(mockSessionAbort).toHaveBeenCalledOnce();
        promptResult.resolve(createMockPromptResponse([{ type: 'text', text: 'late response' }]));
        await expect(pendingCall).resolves.toMatchObject({ error: 'OpenCode SDK call aborted' });
        await provider.cleanup();
        expect(mockServerClose).toHaveBeenCalledOnce();
        abortResult.reject(new Error(`Abort temporarily failed for ${previous}`));

        await vi.waitFor(() =>
          expect(debugSpy).toHaveBeenCalledWith('[OpenCode SDK] Failed to abort session', {
            sessionId: 'test-session-123',
            error: 'Abort temporarily failed for [REDACTED]',
          }),
        );
        expect(JSON.stringify(debugSpy.mock.calls)).not.toContain(previous);
      });

      it('redacts synchronous SDK abort failures without interrupting local cancellation', async () => {
        const previous = 'synthetic-secondary-sync-abort-credential-0919';
        const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
        const controller = new AbortController();
        const provider = new OpenCodeSDKProvider();
        await provider.callApi(
          'initialize server for sync abort',
          createPromptContext({ mcp: remoteMcpWithBearer(previous) }),
        );
        mockSessionAbort.mockImplementationOnce(() => {
          throw new Error(`Abort immediately failed for ${previous}`);
        });
        mockSessionPrompt.mockImplementationOnce(async () => {
          controller.abort();
          return createMockPromptResponse([{ type: 'text', text: 'late response' }]);
        });

        const result = await provider.callApi('next prompt', undefined, {
          abortSignal: controller.signal,
        });

        expect(result.error).toBe('OpenCode SDK call aborted');
        expect(debugSpy).toHaveBeenCalledWith('[OpenCode SDK] Failed to abort session', {
          sessionId: 'test-session-123',
          error: 'Abort immediately failed for [REDACTED]',
        });
        expect(JSON.stringify({ result, logs: debugSpy.mock.calls })).not.toContain(previous);
      });

      it('does not start credential-bearing detached deletion when a persistent session leaves the LRU', async () => {
        const previous = 'synthetic-secondary-eviction-credential-0919';
        const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
        let sessionIndex = 0;
        mockSessionCreate.mockImplementation(async () =>
          createMockSessionResponse(`secondary-session-${sessionIndex++}`),
        );
        const provider = new OpenCodeSDKProvider({
          config: { working_dir: '/test/work', persist_sessions: true },
        });
        await provider.callApi(
          'initialize server for eviction',
          createPromptContext({ model: 'test-model-0', mcp: remoteMcpWithBearer(previous) }),
        );
        for (let index = 1; index < 100; index++) {
          await provider.callApi(
            'next model',
            createPromptContext({ model: `test-model-${index}` }),
          );
        }
        const result = await provider.callApi(
          'evict first session',
          createPromptContext({ model: 'test-model-100' }),
        );
        expect(result.output).toBe('Test response');
        expect(mockSessionDelete).not.toHaveBeenCalled();
        await provider.cleanup();
        expect(mockServerClose).toHaveBeenCalledOnce();
        expect(mockSessionDelete).toHaveBeenCalledTimes(100);
        expect(mockSessionDelete).not.toHaveBeenCalledWith(
          expect.objectContaining({ sessionID: 'secondary-session-0' }),
        );
        expect(JSON.stringify({ result, logs: debugSpy.mock.calls })).not.toContain(previous);
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
        expect(mockSessionCreate.mock.calls.map(([parameters]) => parameters)).toContainEqual(
          expect.objectContaining({
            directory: '/custom/dir',
          }),
        );
        expect(mockSessionPrompt.mock.calls.map(([parameters]) => parameters)).toContainEqual(
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
        expect(mockSessionCreate.mock.calls.map(([parameters]) => parameters)).toContainEqual(
          expect.objectContaining({
            directory: resolvedWorkingDir,
          }),
        );
        expect(mockSessionPrompt.mock.calls.map(([parameters]) => parameters)).toContainEqual(
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
        expect(mockSessionPrompt.mock.calls.map(([parameters]) => parameters)).toContainEqual(
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
          expect(mockSessionPrompt.mock.calls.map(([parameters]) => parameters)).toContainEqual(
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
        expect(mockSessionPrompt.mock.calls.map(([parameters]) => parameters)).toContainEqual(
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

          expect(mockSessionPrompt.mock.calls.map(([parameters]) => parameters)).toContainEqual(
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

        expect(mockSessionPrompt.mock.calls.map(([parameters]) => parameters)).toContainEqual(
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
        expect(mockSessionPrompt.mock.calls.map(([parameters]) => parameters)).toContainEqual(
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

        expect(mockSessionDelete).toHaveBeenCalledWith(
          { sessionID: 'test-session-123' },
          { signal: expect.any(AbortSignal) },
        );
      });

      it('should swallow delete errors for non-persistent sessions', async () => {
        const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
        mockSessionDelete.mockRejectedValue(new Error('delete failed'));

        const provider = new OpenCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        expect(result.output).toBe('Test response');
        expect(debugSpy).toHaveBeenCalledWith('Failed to delete non-persistent OpenCode session', {
          sessionId: 'test-session-123',
          error: 'delete failed',
        });

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

      it.each([
        [
          'wrapped assistant content filtering',
          'v2',
          true,
          'ContentFilterError',
          'legacy-output-marker',
        ],
        ['direct assistant API error', 'v2', false, 'APIError', 'legacy-output-marker'],
        ['wrapped assistant error with diagnostics only', 'v2', true, 'ProviderAuthError', ''],
        [
          'v1 wrapped assistant content filtering',
          'v1',
          true,
          'ContentFilterError',
          'legacy-output-marker',
        ],
      ])(
        'does not replay a pre-error-handling cache entry for %s',
        async (_description, apiVersion, wrapped, name, legacyOutput) => {
          if (apiVersion === 'v1') {
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
          }
          const baseUrl = 'https://opencode-legacy-cache.example.test';
          const prompt = 'pre-error-handling cache fixture ' + apiVersion + ' ' + name;
          const oldSdkResponse = {
            info: {
              role: 'assistant',
              error: { name, data: { message: 'legacy-raw-diagnostic-marker' } },
            },
            parts: [{ type: 'text', text: 'legacy-filtered-part-marker' }],
          };
          const legacy = {
            output: legacyOutput,
            raw: JSON.stringify(wrapped ? { data: oldSdkResponse } : oldSdkResponse),
            sessionId: 'legacy-session',
          };
          // Match the public, default remote key emitted before prompt errors were normalized.
          const legacyCache = await initializeAgenticCache(
            { cacheKeyPrefix: 'opencode:sdk' },
            {
              prompt,
              baseUrl,
              tools: { '*': false },
              toolPolicyContractVersion: 2,
              apiVersion,
            },
          );
          expect(legacyCache.cache).toBeDefined();
          expect(legacyCache.cacheKey).toBeDefined();
          await legacyCache.cache!.set(legacyCache.cacheKey!, JSON.stringify(legacy));
          expect(await legacyCache.cache!.get(legacyCache.cacheKey!)).toBe(JSON.stringify(legacy));
          mockSessionPrompt.mockResolvedValueOnce(
            createMockPromptResponse([{ type: 'text', text: 'fresh reviewed response' }]),
          );

          const provider = new OpenCodeSDKProvider({ config: { baseUrl } });
          const fresh = await provider.callApi(prompt);
          const cached = await new OpenCodeSDKProvider({ config: { baseUrl } }).callApi(prompt);

          expect(mockSessionPrompt).toHaveBeenCalledTimes(1);
          expect(fresh).toMatchObject({ output: 'fresh reviewed response' });
          expect(fresh.cached).not.toBe(true);
          expect(cached).toMatchObject({ output: 'fresh reviewed response', cached: true });
          for (const result of [fresh, cached]) {
            expect(JSON.stringify(result)).not.toMatch(
              /legacy-(?:output|raw-diagnostic|filtered-part)-marker|legacy-session/,
            );
          }
          // The migration must not remove users' existing cache contents.
          expect(await legacyCache.cache!.get(legacyCache.cacheKey!)).toBe(JSON.stringify(legacy));
        },
      );

      it.each(['ContentFilterError', 'ProviderAuthError'])(
        'does not persist a fresh remote %s while continuing to cache a later success',
        async (name) => {
          const baseUrl = 'https://opencode-current-cache.example.test';
          const prompt = 'current response-cache failure fixture ' + name;
          const partial = createMockPromptResponse([
            { type: 'text', text: 'fresh-filtered-part-marker' },
          ]).data;
          mockSessionPrompt
            .mockResolvedValueOnce({
              data: {
                ...partial,
                info: {
                  ...partial.info,
                  error: { name, data: { message: 'fixture upstream failure' } },
                },
              },
            })
            .mockResolvedValueOnce(
              createMockPromptResponse([{ type: 'text', text: 'recovered current response' }]),
            );
          const provider = new OpenCodeSDKProvider({ config: { baseUrl } });

          const failure = await provider.callApi(prompt);
          const recovery = await provider.callApi(prompt);
          const cached = await new OpenCodeSDKProvider({ config: { baseUrl } }).callApi(prompt);

          expect(mockSessionPrompt).toHaveBeenCalledTimes(2);
          expect(failure.cached).not.toBe(true);
          expect(failure.raw).toBeUndefined();
          expect(JSON.stringify(failure)).not.toContain('fresh-filtered-part-marker');
          if (name === 'ContentFilterError') {
            expect(failure).toMatchObject({ isRefusal: true, guardrails: { flagged: true } });
            expect(failure.error).toBeUndefined();
          } else {
            expect(failure.error).toContain('ProviderAuthError');
            expect(failure.output).toBeUndefined();
          }
          expect(recovery).toMatchObject({ output: 'recovered current response' });
          expect(recovery.cached).not.toBe(true);
          expect(cached).toMatchObject({ output: 'recovered current response', cached: true });
        },
      );

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
        expect(mockSessionPrompt.mock.calls.map(([parameters]) => parameters)).toContainEqual(
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
        expect(mockSessionPrompt.mock.calls.map(([parameters]) => parameters)).toContainEqual(
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
        expect(mockSessionPrompt.mock.calls.map(([parameters]) => parameters)).toContainEqual(
          expect.objectContaining({
            sessionID: 'test-session-123',
            parts: [{ type: 'text', text: 'Test prompt' }],
          }),
        );
      });
    });
  });

  describe('cleanup', () => {
    const runEvaluation = (
      id: string,
      apiProvider: ApiProvider,
      tests: TestSuite['tests'] = [{}],
    ) => {
      const evaluation: InMemoryEvaluation = {
        id,
        config: {},
        persisted: false,
        prompts: [],
        results: [],
        vars: [],
        resultPersistenceFailed: false,
        finalResults: [],
        failedResults: [],
      };
      return evaluate(
        { providers: [apiProvider], prompts: [{ raw: id, label: id }], tests },
        evaluation,
        { maxConcurrency: 1 },
        {
          createEvaluationStore: (record) => new InMemoryEvaluationStore(record),
          createResultWriters: () => [],
        },
      );
    };

    const registerDiskBackedLocalServers = () => {
      const history = new Map<string, string[]>();
      const closes: Array<ReturnType<typeof vi.fn>> = [];
      let nextId = 0;
      mockSessionCreate.mockImplementation(async () => {
        const id = `owned-local-${++nextId}`;
        history.set(id, []);
        return createMockSessionResponse(id);
      });
      mockSessionPrompt.mockImplementation(async ({ sessionID, parts }) => {
        const messages = history.get(sessionID);
        if (!messages) {
          return { error: { name: 'NotFoundError', data: { message: '404: session not found' } } };
        }
        messages.push(parts[0].text);
        return createMockPromptResponse([{ type: 'text', text: messages.join(' | ') }]);
      });
      mockSessionDelete.mockImplementation(async ({ sessionID }) => {
        history.delete(sessionID);
      });
      mockCreateOpencode.mockReset().mockImplementation(async () => {
        const close = vi.fn();
        closes.push(close);
        return {
          client: {
            session: {
              create: mockSessionCreate,
              prompt: mockSessionPrompt,
              messages: mockSessionMessages,
              delete: mockSessionDelete,
              abort: mockSessionAbort,
            },
          },
          server: { url: `http://127.0.0.1:${4200 + closes.length}`, close },
        };
      });
      return { history, closes };
    };

    it.each(['explicit cleanup', 'manual shutdown'] as const)(
      'redacts a persisted-session reconnect failure during %s',
      async (mode) => {
        const credential = 'sk-opencode-cleanup-hidden-123456';
        const provider = new OpenCodeSDKProvider({
          config: { baseUrl: 'http://localhost:4096', apiKey: credential, persist_sessions: true },
        });
        await provider.callApi('create a persistent session');
        await provider.shutdown('evaluation');
        mockCreateOpencodeClient.mockImplementationOnce(() => {
          throw new Error(`Reconnect rejected ${credential}`);
        });

        const cleanup = mode === 'explicit cleanup' ? provider.cleanup() : provider.shutdown();
        const error = await cleanup.then(
          () => undefined,
          (reason: unknown) => reason,
        );

        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Reconnect rejected [REDACTED]');
        expect(String(error)).not.toContain(credential);
        expect((error as Error).cause).toBeUndefined();
      },
    );

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

    it('preserves remote persistent sessions across evaluations and explicit resumption', async () => {
      const liveSessions = new Set<string>();
      mockSessionCreate.mockImplementation(async () => {
        const id = `remote-persistent-${liveSessions.size + 1}`;
        liveSessions.add(id);
        return createMockSessionResponse(id);
      });
      mockSessionDelete.mockImplementation(async ({ sessionID }) => {
        liveSessions.delete(sessionID);
      });
      mockSessionPrompt.mockImplementation(async ({ sessionID }) =>
        liveSessions.has(sessionID)
          ? createMockPromptResponse([{ type: 'text', text: `continued ${sessionID}` }])
          : { error: { name: 'NotFoundError', data: { message: 'Session no longer exists' } } },
      );
      const baseUrl = 'http://127.0.0.1:4096';
      const provider = new OpenCodeSDKProvider({
        config: { baseUrl, working_dir: '/test/work', persist_sessions: true },
      });

      const first = await runEvaluation('remote-persistence-first', provider);
      await provider.cleanup('evaluation');
      const sessionId = first.results[0].response?.sessionId;
      expect(sessionId).toBe('remote-persistent-1');
      expect(mockSessionDelete).not.toHaveBeenCalled();

      const second = await runEvaluation('remote-persistence-second', provider);
      await provider.cleanup('evaluation');
      const resumed = await runEvaluation(
        'remote-persistence-resumed',
        new OpenCodeSDKProvider({
          config: { baseUrl, working_dir: '/test/work', session_id: sessionId },
        }),
      );
      for (const result of [second, resumed]) {
        expect(result.results[0]).toMatchObject({
          success: true,
          response: { output: 'continued remote-persistent-1', sessionId: 'remote-persistent-1' },
        });
      }
      expect(mockSessionCreate).toHaveBeenCalledOnce();
      expect(mockSessionDelete).not.toHaveBeenCalled();
      expect(mockServerClose).not.toHaveBeenCalled();

      await provider.cleanup();
      expect(mockSessionDelete).toHaveBeenCalledExactlyOnceWith({
        sessionID: 'remote-persistent-1',
        directory: '/test/work',
      });
    });

    it('preserves owned local persistent sessions across evaluation server restarts and explicit resumption', async () => {
      const { history, closes } = registerDiskBackedLocalServers();
      const provider = new OpenCodeSDKProvider({
        config: { working_dir: '/test/work', persist_sessions: true },
      });

      const first = await runEvaluation('owned-local-first', provider);
      await provider.cleanup('evaluation');
      expect(first.results[0]).toMatchObject({
        success: true,
        response: { output: 'owned-local-first', sessionId: 'owned-local-1' },
      });
      expect(closes).toHaveLength(1);
      expect(closes[0]).toHaveBeenCalledOnce();
      expect(history.has('owned-local-1')).toBe(true);
      expect(mockSessionDelete).not.toHaveBeenCalled();

      const second = await runEvaluation('owned-local-second', provider);
      await provider.cleanup('evaluation');
      const resumed = await runEvaluation(
        'owned-local-resumed',
        new OpenCodeSDKProvider({
          config: { working_dir: '/test/work', session_id: 'owned-local-1' },
        }),
      );
      expect(second.results[0]).toMatchObject({
        success: true,
        response: { output: 'owned-local-first | owned-local-second', sessionId: 'owned-local-1' },
      });
      expect(resumed.results[0]).toMatchObject({
        success: true,
        response: {
          output: 'owned-local-first | owned-local-second | owned-local-resumed',
          sessionId: 'owned-local-1',
        },
      });
      expect(closes).toHaveLength(3);
      for (const close of closes) {
        expect(close).toHaveBeenCalledOnce();
      }
      expect(mockSessionCreate).toHaveBeenCalledOnce();
      expect(mockSessionDelete).not.toHaveBeenCalled();

      await provider.cleanup();
      expect(mockSessionDelete).toHaveBeenCalledExactlyOnceWith({
        sessionID: 'owned-local-1',
        directory: '/test/work',
      });
      expect(history.has('owned-local-1')).toBe(false);
      expect(closes).toHaveLength(4);
      expect(closes[3]).toHaveBeenCalledOnce();

      const restarted = await runEvaluation('owned-local-new', provider);
      expect(restarted.results[0]).toMatchObject({
        success: true,
        response: { output: 'owned-local-new', sessionId: 'owned-local-2' },
      });
      await provider.cleanup();
    });

    it('preserves owned local prompt-configured persistent sessions but deletes ephemeral sessions', async () => {
      const { history, closes } = registerDiskBackedLocalServers();
      const provider = new OpenCodeSDKProvider({ config: { working_dir: '/test/work' } });
      await providerRegistry.withEvaluationScope(() =>
        provider.callApi('prompt-persistent-one', createPromptContext({ persist_sessions: true })),
      );
      expect(history.has('owned-local-1')).toBe(true);
      expect(closes[0]).toHaveBeenCalledOnce();
      await providerRegistry.withEvaluationScope(() =>
        provider.callApi('prompt-persistent-two', createPromptContext({ persist_sessions: true })),
      );
      expect(history.get('owned-local-1')).toEqual([
        'prompt-persistent-one',
        'prompt-persistent-two',
      ]);

      await runEvaluation('owned-local-ephemeral', provider);
      expect(history.has('owned-local-2')).toBe(false);
      expect(history.has('owned-local-1')).toBe(true);
      expect(mockSessionDelete).toHaveBeenCalledExactlyOnceWith(
        { sessionID: 'owned-local-2', directory: '/test/work' },
        { signal: expect.any(AbortSignal) },
      );
      await provider.cleanup();
      expect(history.size).toBe(0);
    });

    it('closes the owned local server at process shutdown without deleting persistent sessions', async () => {
      const { history, closes } = registerDiskBackedLocalServers();
      const provider = new OpenCodeSDKProvider({
        config: { working_dir: '/test/work', persist_sessions: true },
      });
      const first = await provider.callApi('before local process shutdown');
      expect(first.sessionId).toBe('owned-local-1');

      await provider.shutdown('process');
      expect(closes[0]).toHaveBeenCalledOnce();
      expect(history.has('owned-local-1')).toBe(true);
      expect(mockSessionDelete).not.toHaveBeenCalled();
      await provider.cleanup();
      expect(closes).toHaveLength(1);
      expect(history.has('owned-local-1')).toBe(true);

      const resumed = new OpenCodeSDKProvider({
        config: { working_dir: '/test/work', session_id: 'owned-local-1' },
      });
      const result = await resumed.callApi('after local process shutdown');
      expect(result).toMatchObject({
        output: 'before local process shutdown | after local process shutdown',
        sessionId: 'owned-local-1',
      });
      await resumed.cleanup();
      expect(closes[1]).toHaveBeenCalledOnce();
      expect(history.has('owned-local-1')).toBe(true);
      expect(mockSessionCreate).toHaveBeenCalledOnce();
      expect(mockSessionDelete).not.toHaveBeenCalled();
    });

    it.each(['active prompt', 'late accepted create'] as const)(
      'reclaims an owned local ephemeral session before closing its process during %s',
      async (stage) => {
        const entered = createDeferred<void>();
        const accepted = createDeferred<unknown>();
        const sessions = new Set<string>();
        const events: string[] = [];
        let alive = true;
        let serverSignal: AbortSignal | undefined;
        const close = vi.fn(() => {
          events.push('server closed');
          alive = false;
        });
        mockSessionCreate.mockImplementation(() => {
          sessions.add('owned-local-ephemeral');
          if (stage === 'late accepted create') {
            entered.resolve();
            return accepted.promise;
          }
          return Promise.resolve({ data: createMockSessionResponse('owned-local-ephemeral') });
        });
        mockSessionPrompt.mockImplementation(() => {
          entered.resolve();
          return new Promise<never>(() => {});
        });
        mockSessionDelete.mockImplementation(async ({ sessionID }) => {
          events.push(`delete while alive=${alive}`);
          if (!alive) {
            throw new Error('the owned OpenCode server no longer accepts requests');
          }
          sessions.delete(sessionID);
          return { data: true, response: { ok: true, status: 200 } };
        });
        mockCreateOpencode.mockReset().mockImplementation(async (options) => {
          serverSignal = options.signal;
          serverSignal?.addEventListener(
            'abort',
            () => {
              events.push('server lifetime aborted');
              alive = false;
            },
            { once: true },
          );
          return {
            client: {
              session: {
                create: mockSessionCreate,
                prompt: mockSessionPrompt,
                messages: mockSessionMessages,
                delete: mockSessionDelete,
                abort: mockSessionAbort,
              },
            },
            server: { url: 'http://127.0.0.1:4250', close },
          };
        });
        const provider = new OpenCodeSDKProvider({ config: { working_dir: '/test/work' } });
        const call = provider.callApi('ephemeral local shutdown');
        await entered.promise;
        vi.useFakeTimers();
        try {
          const shutdown = provider.shutdown('process');
          if (stage === 'late accepted create') {
            await vi.advanceTimersByTimeAsync(100);
            expect(serverSignal?.aborted).toBe(false);
            accepted.resolve({ data: createMockSessionResponse('owned-local-ephemeral') });
          }
          await shutdown;
          await expect(call).resolves.toMatchObject({ error: 'OpenCode SDK call aborted' });
          expect(mockSessionDelete).toHaveBeenCalledOnce();
          expect(sessions.size).toBe(0);
          expect(events[0]).toBe('delete while alive=true');
          expect(close).toHaveBeenCalledOnce();
          expect(serverSignal?.aborted).toBe(true);
          await vi.advanceTimersByTimeAsync(0);
          expect(vi.getTimerCount()).toBe(0);
        } finally {
          accepted.resolve({ data: createMockSessionResponse('owned-local-ephemeral') });
          await vi.runAllTimersAsync();
          vi.useRealTimers();
        }
      },
    );

    it.each(['local', 'remote'] as const)(
      'lets the actual SDK receive an accepted %s ephemeral ID during process-shutdown grace',
      async (transport) => {
        const actualSdk = await import('@opencode-ai/sdk/v2/client');
        const entered = createDeferred<void>();
        const accepted = createDeferred<void>();
        const sessions = new Set<string>();
        const events: string[] = [];
        let createSignal: AbortSignal | undefined;
        let alive = true;
        const fetchMock: typeof fetch = async (input, init) => {
          const request = input instanceof Request ? input : new Request(input, init);
          if (!alive) {
            throw new Error('the owned OpenCode server has closed');
          }
          if (request.method === 'POST' && new URL(request.url).pathname === '/session') {
            sessions.add('real-sdk-late-id');
            events.push('create accepted');
            createSignal = request.signal;
            entered.resolve();
            const abort = createDeferred<never>();
            const onAbort = () => abort.reject(new DOMException('Aborted', 'AbortError'));
            if (request.signal.aborted) {
              onAbort();
            } else {
              request.signal.addEventListener('abort', onAbort, { once: true });
            }
            try {
              await Promise.race([accepted.promise, abort.promise]);
            } finally {
              request.signal.removeEventListener('abort', onAbort);
            }
            events.push('create id received');
            return Response.json(createMockSessionResponse('real-sdk-late-id'));
          }
          if (request.method === 'DELETE') {
            events.push('delete received');
            sessions.delete('real-sdk-late-id');
            return Response.json(true);
          }
          throw new Error(`unexpected SDK request ${request.method} ${request.url}`);
        };
        const realClient = actualSdk.createOpencodeClient({
          baseUrl: 'http://opencode.test',
          fetch: fetchMock,
        });
        const close = vi.fn(() => {
          events.push('server closed');
          alive = false;
        });
        if (transport === 'remote') {
          mockCreateOpencodeClient.mockReturnValue(realClient);
        } else {
          mockCreateOpencode.mockReset().mockImplementation(async (options) => {
            options.signal.addEventListener('abort', () => {
              alive = false;
            });
            return { client: realClient, server: { url: 'http://opencode.test', close } };
          });
        }
        const provider = new OpenCodeSDKProvider({
          config: {
            working_dir: '/test/work',
            ...(transport === 'remote' ? { baseUrl: 'http://opencode.test' } : {}),
          },
        });
        const call = provider.callApi('actual accepted SDK session');
        await entered.promise;
        const shutdown = provider.shutdown('process');
        await expect(call).resolves.toMatchObject({ error: 'OpenCode SDK call aborted' });
        expect(createSignal?.aborted).toBe(false);
        accepted.resolve();
        await shutdown;
        expect(sessions.size).toBe(0);
        expect(events).toEqual(
          transport === 'local'
            ? ['create accepted', 'create id received', 'delete received', 'server closed']
            : ['create accepted', 'create id received', 'delete received'],
        );
      },
    );

    it.each(['local', 'remote'] as const)(
      'cancels an unresponsive %s ephemeral create at the shared process deadline',
      async (transport) => {
        const entered = createDeferred<void>();
        let createSignal: AbortSignal | undefined;
        mockSessionCreate.mockImplementation((_parameters, options) => {
          createSignal = options.signal;
          entered.resolve();
          return new Promise((_resolve, reject) => {
            createSignal?.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true },
            );
          });
        });
        const provider = new OpenCodeSDKProvider({
          config: {
            working_dir: '/test/work',
            ...(transport === 'remote' ? { baseUrl: 'http://127.0.0.1:4096' } : {}),
          },
        });
        const call = provider.callApi('unknown ephemeral create ID');
        await entered.promise;
        vi.useFakeTimers();
        try {
          let completed = false;
          const shutdown = provider.shutdown('process').then(() => {
            completed = true;
          });
          await expect(call).resolves.toMatchObject({ error: 'OpenCode SDK call aborted' });
          await vi.advanceTimersByTimeAsync(999);
          expect(completed).toBe(false);
          expect(createSignal?.aborted).toBe(false);
          expect(mockServerClose).not.toHaveBeenCalled();
          await vi.advanceTimersByTimeAsync(1);
          await shutdown;
          expect(createSignal?.aborted).toBe(true);
          expect(mockSessionDelete).not.toHaveBeenCalled();
          expect(mockServerClose).toHaveBeenCalledTimes(transport === 'local' ? 1 : 0);
          expect(vi.getTimerCount()).toBe(0);
        } finally {
          await vi.runAllTimersAsync();
          vi.useRealTimers();
        }
      },
    );

    it('closes an owned local process at the shared deadline when ephemeral deletion never settles', async () => {
      const prompting = createDeferred<void>();
      const deleting = createDeferred<void>();
      let deleteSignal: AbortSignal | undefined;
      mockSessionPrompt.mockImplementation(() => {
        prompting.resolve();
        return new Promise<never>(() => {});
      });
      mockSessionDelete.mockImplementation((_parameters, options) => {
        deleteSignal = options.signal;
        deleting.resolve();
        return new Promise<never>(() => {});
      });
      const provider = new OpenCodeSDKProvider({ config: { working_dir: '/test/work' } });
      const call = provider.callApi('unresponsive local deletion');
      await prompting.promise;
      const serverSignal = mockCreateOpencode.mock.calls[0][0].signal as AbortSignal;
      vi.useFakeTimers();
      try {
        let completed = false;
        const shutdown = provider.shutdown('process').then(() => {
          completed = true;
        });
        await deleting.promise;
        expect(deleteSignal?.aborted).toBe(false);
        expect(serverSignal.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(999);
        expect(completed).toBe(false);
        expect(mockServerClose).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        await shutdown;
        await expect(call).resolves.toMatchObject({ error: 'OpenCode SDK call aborted' });
        expect(mockServerClose).toHaveBeenCalledOnce();
        expect(deleteSignal?.aborted).toBe(true);
        expect(serverSignal.aborted).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        await vi.runAllTimersAsync();
        vi.useRealTimers();
      }
    });

    it('retains local prompt credentials for a delayed server-close diagnostic after the caller finishes', async () => {
      const credential = 'synthetic-delayed-local-close-credential-2026';
      const entered = createDeferred<void>();
      const accepted = createDeferred<unknown>();
      const debug = vi.spyOn(logger, 'debug').mockImplementation(() => {});
      mockSessionCreate.mockImplementation(() => {
        entered.resolve();
        return accepted.promise;
      });
      mockServerClose.mockImplementationOnce(() => {
        throw new Error(`server close echoed ${credential}`);
      });
      const provider = new OpenCodeSDKProvider({ config: { working_dir: '/test/work' } });
      const call = provider.callApi(
        'retained redaction during shutdown',
        createPromptContext({ mcp: remoteMcpWithBearer(credential) }),
      );
      await entered.promise;
      const shutdown = provider.shutdown('process');
      await expect(call).resolves.toMatchObject({ error: 'OpenCode SDK call aborted' });
      expect(mockServerClose).not.toHaveBeenCalled();
      accepted.resolve({ data: createMockSessionResponse('delayed-close-session') });
      await shutdown;
      expect(debug).toHaveBeenCalledWith('Failed to close OpenCode server', {
        error: 'server close echoed [REDACTED]',
      });
      const closeDiagnostics = debug.mock.calls.filter(
        ([message]) => message === 'Failed to close OpenCode server',
      );
      expect(JSON.stringify(closeDiagnostics)).not.toContain(credential);
    });

    it('detaches a resource-free local validation failure without unregistering live ownership', async () => {
      const unregister = vi.spyOn(providerRegistry, 'unregister');
      const invalid = new OpenCodeSDKProvider({
        config: {
          working_dir: '/test/work',
          permission: { bash: 'invalid' },
        } as unknown as OpenCodeSDKConfig,
      });
      const invalidResult = await invalid.callApi('invalid local policy');
      expect(invalidResult.error).toContain('permission');
      expect(mockCreateOpencode).not.toHaveBeenCalled();
      expect(unregister).toHaveBeenCalledExactlyOnceWith(invalid);

      unregister.mockClear();
      const valid = new OpenCodeSDKProvider({ config: { working_dir: '/test/work' } });
      await valid.callApi('active server');
      await valid.callApi(
        'invalid second call',
        createPromptContext({ permission: { bash: 'invalid' } } as unknown as OpenCodeSDKConfig),
      );
      expect(unregister).not.toHaveBeenCalled();
      await valid.cleanup();
      expect(unregister).toHaveBeenCalledExactlyOnceWith(valid);
    });

    it('forces an active local call to abort and closes its server on process shutdown', async () => {
      const entered = createDeferred<void>();
      const pendingPrompt = createDeferred<ReturnType<typeof createMockPromptResponse>>();
      let transportSignal: AbortSignal | undefined;
      mockSessionPrompt.mockImplementation((parameters, options) => {
        transportSignal = options?.signal ?? parameters.signal;
        transportSignal?.addEventListener(
          'abort',
          () => pendingPrompt.resolve(createMockPromptResponse([{ type: 'text', text: 'late' }])),
          { once: true },
        );
        entered.resolve();
        return pendingPrompt.promise;
      });
      const provider = new OpenCodeSDKProvider({
        config: { working_dir: '/test/work', persist_sessions: true },
      });
      const pending = provider.callApi('active when signal arrives');
      await entered.promise;

      try {
        await providerRegistry.shutdownForProcess();
        await vi.waitFor(() => expect(mockServerClose).toHaveBeenCalledOnce(), { timeout: 300 });
        expect(transportSignal?.aborted).toBe(true);
        expect(mockSessionAbort).toHaveBeenCalledExactlyOnceWith(
          { sessionID: 'test-session-123', directory: '/test/work' },
          { signal: expect.any(AbortSignal) },
        );
        await expect(pending).resolves.toMatchObject({ error: 'OpenCode SDK call aborted' });
      } finally {
        pendingPrompt.resolve(createMockPromptResponse([{ type: 'text', text: 'released' }]));
        await pending;
        await provider.cleanup();
      }
    });

    it('keeps a direct local conversation alive across an unrelated scoped evaluation', async () => {
      mockSessionCreate
        .mockResolvedValueOnce(createMockSessionResponse('direct-conversation'))
        .mockResolvedValue(createMockSessionResponse('unexpected-recreated-conversation'));
      const direct = new OpenCodeSDKProvider({
        config: { working_dir: '/test/work', persist_sessions: true },
      });
      await direct.callApi('first discovery question');

      try {
        const unrelated = await runEvaluation('unrelated-to-discovery', {
          id: () => 'echo',
          callApi: async () => ({ output: 'unrelated completed' }),
        });
        expect(unrelated.results[0]).toMatchObject({ success: true });
        expect(mockSessionDelete).not.toHaveBeenCalled();
        expect(mockServerClose).not.toHaveBeenCalled();

        const second = await direct.callApi('second discovery question');
        expect(second.sessionId).toBe('direct-conversation');
        expect(mockSessionCreate).toHaveBeenCalledOnce();
      } finally {
        await direct.cleanup();
      }

      expect(mockSessionDelete).toHaveBeenCalledOnce();
      expect(mockServerClose).toHaveBeenCalledOnce();
    });

    it('keeps remote persistent sessions resumable when they leave the local LRU', async () => {
      let nextSession = 0;
      mockSessionCreate.mockImplementation(async () =>
        createMockSessionResponse(`remote-lru-${nextSession++}`),
      );
      const provider = new OpenCodeSDKProvider({
        config: {
          baseUrl: 'http://127.0.0.1:4096',
          working_dir: '/test/work',
          persist_sessions: true,
        },
      });
      for (let index = 0; index <= 100; index++) {
        await provider.callApi(
          'remote lru prompt',
          createPromptContext({ model: `model-${index}` }),
        );
      }

      expect(mockSessionCreate).toHaveBeenCalledTimes(101);
      expect(mockSessionDelete).not.toHaveBeenCalled();
      await provider.cleanup();
      expect(mockSessionDelete).toHaveBeenCalledTimes(100);
      expect(mockSessionDelete).not.toHaveBeenCalledWith(
        expect.objectContaining({ sessionID: 'remote-lru-0' }),
      );
    });

    it('still deletes remote ephemeral sessions during ordinary evaluation cleanup', async () => {
      const provider = new OpenCodeSDKProvider({
        config: { baseUrl: 'http://127.0.0.1:4096', working_dir: '/test/work' },
      });

      const evaluation = await runEvaluation('remote-ephemeral-evaluation', provider);

      expect(evaluation.results[0]).toMatchObject({ success: true });
      expect(mockSessionDelete).toHaveBeenCalledExactlyOnceWith(
        { sessionID: 'test-session-123', directory: '/test/work' },
        { signal: expect.any(AbortSignal) },
      );
      expect(mockServerClose).not.toHaveBeenCalled();
    });

    it('aborts an uncooperative remote prompt on process termination without deleting its persistent session', async () => {
      const entered = createDeferred<void>();
      const never = new Promise<never>(() => {});
      let promptSignal: AbortSignal | undefined;
      let abortSignal: AbortSignal | undefined;
      mockSessionPrompt.mockImplementation((_parameters, options) => {
        promptSignal = options.signal;
        entered.resolve();
        return never;
      });
      mockSessionAbort.mockImplementation((_parameters, options) => {
        abortSignal = options.signal;
        return never;
      });
      const provider = new OpenCodeSDKProvider({
        config: {
          baseUrl: 'http://127.0.0.1:4096',
          working_dir: '/test/work',
          persist_sessions: true,
        },
      });
      const call = provider.callApi('remote pending');
      await entered.promise;

      vi.useFakeTimers();
      try {
        await providerRegistry.shutdownForProcess();
        await expect(call).resolves.toMatchObject({ error: 'OpenCode SDK call aborted' });
        expect(promptSignal?.aborted).toBe(true);
        expect(mockSessionAbort).toHaveBeenCalledOnce();
        expect(abortSignal?.aborted).toBe(false);
        expect(mockSessionDelete).not.toHaveBeenCalled();
        expect(mockServerClose).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1_000);
        expect(abortSignal?.aborted).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        await vi.runAllTimersAsync();
        vi.useRealTimers();
      }
    });

    it('uses cancellable nested v1 transports during forced remote process cleanup', async () => {
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
      const entered = createDeferred<void>();
      let promptSignal: AbortSignal | undefined;
      mockSessionPrompt.mockImplementation((parameters) => {
        promptSignal = parameters.signal;
        entered.resolve();
        return new Promise<never>(() => {});
      });
      const provider = new OpenCodeSDKProvider({
        config: {
          baseUrl: 'http://127.0.0.1:4096',
          working_dir: '/test/work',
          persist_sessions: true,
        },
      });
      const call = provider.callApi('v1 pending');
      await entered.promise;

      await providerRegistry.shutdownForProcess();
      await expect(call).resolves.toMatchObject({ error: 'OpenCode SDK call aborted' });

      expect(mockSessionCreate.mock.calls[0]).toEqual([
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ]);
      expect(promptSignal?.aborted).toBe(true);
      expect(mockSessionAbort).toHaveBeenCalledExactlyOnceWith({
        path: { id: 'test-session-123', sessionID: 'test-session-123' },
        query: { directory: '/test/work' },
        signal: expect.any(AbortSignal),
      });
      expect(mockSessionDelete).not.toHaveBeenCalled();
    });

    it('reclaims a remote ephemeral session on process termination with a bounded fresh transport', async () => {
      const entered = createDeferred<void>();
      const deleting = createDeferred<void>();
      const never = new Promise<never>(() => {});
      let deleteSignal: AbortSignal | undefined;
      mockSessionPrompt.mockImplementation(() => {
        entered.resolve();
        return never;
      });
      mockSessionDelete.mockImplementation((_parameters, options) => {
        deleteSignal = options.signal;
        deleting.resolve();
        return never;
      });
      const provider = new OpenCodeSDKProvider({
        config: { baseUrl: 'http://127.0.0.1:4096', working_dir: '/test/work' },
      });
      const call = provider.callApi('remote ephemeral pending');
      await entered.promise;

      vi.useFakeTimers();
      try {
        const shutdown = providerRegistry.shutdownForProcess();
        await deleting.promise;
        expect(deleteSignal?.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1_000);

        await shutdown;
        await expect(call).resolves.toMatchObject({ error: 'OpenCode SDK call aborted' });
        expect(deleteSignal?.aborted).toBe(true);
        expect(mockSessionDelete).toHaveBeenCalledExactlyOnceWith(
          { sessionID: 'test-session-123', directory: '/test/work' },
          { signal: expect.any(AbortSignal) },
        );
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        await vi.runAllTimersAsync();
        vi.useRealTimers();
      }
    });

    it.each(['v2', 'v1'] as const)(
      'reclaims an accepted remote ephemeral %s session whose ID arrives after process shutdown',
      async (apiVersion) => {
        if (apiVersion === 'v1') {
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
        }
        const entered = createDeferred<void>();
        const accepted = createDeferred<unknown>();
        const deletionEntered = createDeferred<void>();
        let createSignal: AbortSignal | undefined;
        let deleteSignal: AbortSignal | undefined;
        mockSessionCreate.mockImplementation((parameters, options) => {
          createSignal = apiVersion === 'v2' ? options.signal : parameters.signal;
          entered.resolve();
          return accepted.promise;
        });
        mockSessionDelete.mockImplementation((parameters, options) => {
          deleteSignal = apiVersion === 'v2' ? options.signal : parameters.signal;
          deletionEntered.resolve();
          return new Promise<never>(() => {});
        });
        const provider = new OpenCodeSDKProvider({
          config: { baseUrl: 'http://127.0.0.1:4096', working_dir: '/test/work' },
        });
        const call = provider.callApi('process shutdown during remote session creation');
        await entered.promise;

        vi.useFakeTimers();
        try {
          let completed = false;
          const shutdown = provider.shutdown('process').then(() => {
            completed = true;
          });
          await expect(call).resolves.toMatchObject({ error: 'OpenCode SDK call aborted' });
          expect(createSignal?.aborted).toBe(false);
          expect(mockSessionPrompt).not.toHaveBeenCalled();
          expect(mockSessionDelete).not.toHaveBeenCalled();
          await vi.advanceTimersByTimeAsync(300);
          expect(completed).toBe(false);
          accepted.resolve({ data: createMockSessionResponse('late-accepted-ephemeral') });
          await vi.advanceTimersByTimeAsync(0);
          expect(mockSessionDelete).toHaveBeenCalledOnce();
          await deletionEntered.promise;
          expect(deleteSignal?.aborted).toBe(false);
          if (apiVersion === 'v2') {
            expect(mockSessionDelete).toHaveBeenCalledExactlyOnceWith(
              { sessionID: 'late-accepted-ephemeral', directory: '/test/work' },
              { signal: expect.any(AbortSignal) },
            );
          } else {
            expect(mockSessionDelete).toHaveBeenCalledExactlyOnceWith({
              path: { id: 'late-accepted-ephemeral', sessionID: 'late-accepted-ephemeral' },
              query: { directory: '/test/work' },
              signal: expect.any(AbortSignal),
            });
          }
          await vi.advanceTimersByTimeAsync(700);
          expect(deleteSignal?.aborted).toBe(true);
          await shutdown;
          await vi.advanceTimersByTimeAsync(300);
          expect(vi.getTimerCount()).toBe(0);
        } finally {
          await vi.runAllTimersAsync();
          vi.useRealTimers();
        }
      },
    );

    it.each(['v2', 'v1'] as const)(
      'bounds an already-started remote ephemeral %s deletion after process shutdown',
      async (apiVersion) => {
        if (apiVersion === 'v1') {
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
        }
        const deletionEntered = createDeferred<void>();
        let deleteSignal: AbortSignal | undefined;
        mockSessionDelete.mockImplementation((parameters, options) => {
          deleteSignal = apiVersion === 'v2' ? options?.signal : parameters.signal;
          deletionEntered.resolve();
          return new Promise<never>(() => {});
        });
        const provider = new OpenCodeSDKProvider({
          config: { baseUrl: 'http://127.0.0.1:4096' },
        });
        const call = provider.callApi('process shutdown during normal remote deletion');
        await deletionEntered.promise;
        expect(mockSessionDelete).toHaveBeenCalledOnce();
        expect(deleteSignal?.aborted).toBe(false);
        expect(rmSpy).not.toHaveBeenCalled();

        vi.useFakeTimers();
        try {
          let completed = false;
          const shutdown = provider.shutdown('process').then(() => {
            completed = true;
          });
          await vi.advanceTimersByTimeAsync(500);
          expect(completed).toBe(false);
          expect(deleteSignal?.aborted).toBe(false);
          expect(rmSpy).not.toHaveBeenCalled();
          await vi.advanceTimersByTimeAsync(500);
          expect(deleteSignal?.aborted).toBe(true);
          await shutdown;
          await expect(call).resolves.toMatchObject({ output: 'Test response' });
          expect(mockSessionDelete).toHaveBeenCalledOnce();
          expect(rmSpy).toHaveBeenCalledExactlyOnceWith('/tmp/test-temp-dir', {
            recursive: true,
            force: true,
          });
          expect(vi.getTimerCount()).toBe(0);
        } finally {
          await vi.runAllTimersAsync();
          vi.useRealTimers();
        }
      },
    );

    it.each(['late create', 'in-flight delete'] as const)(
      'keeps process shutdown pending until cooperative remote ephemeral %s cleanup completes',
      async (stage) => {
        const entered = createDeferred<void>();
        const accepted = createDeferred<unknown>();
        const deletion = createDeferred<unknown>();
        if (stage === 'late create') {
          mockSessionCreate.mockImplementation(() => {
            entered.resolve();
            return accepted.promise;
          });
        }
        mockSessionDelete.mockImplementation(() => {
          if (stage === 'in-flight delete') {
            entered.resolve();
          }
          return deletion.promise;
        });
        const provider = new OpenCodeSDKProvider({
          config: { baseUrl: 'http://127.0.0.1:4096', working_dir: '/test/work' },
        });
        const call = provider.callApi('cooperative shutdown');
        await entered.promise;
        vi.useFakeTimers();
        try {
          let shutdownCompleted = false;
          const shutdown = provider.shutdown('process').then(() => {
            shutdownCompleted = true;
          });
          await vi.advanceTimersByTimeAsync(300);
          expect(shutdownCompleted).toBe(false);
          if (stage === 'late create') {
            accepted.resolve({ data: createMockSessionResponse('cooperative-remote-session') });
            await vi.advanceTimersByTimeAsync(0);
          }
          expect(mockSessionDelete).toHaveBeenCalledOnce();
          expect(shutdownCompleted).toBe(false);
          deletion.resolve({ data: true, response: { ok: true, status: 200 } });
          await shutdown;
          expect(shutdownCompleted).toBe(true);
          await expect(call).resolves.toMatchObject(
            stage === 'late create'
              ? { error: 'OpenCode SDK call aborted' }
              : { output: 'Test response' },
          );
          expect(vi.getTimerCount()).toBe(0);
        } finally {
          await vi.runAllTimersAsync();
          vi.useRealTimers();
        }
      },
    );

    it.each([
      { status: 503, attempts: 2, logged: false },
      { status: 404, attempts: 1, logged: false },
      { status: 403, attempts: 1, logged: true },
    ])(
      'handles SDK-resolved HTTP $status when reclaiming a late remote ephemeral session',
      async ({ status, attempts, logged }) => {
        const credential = 'synthetic-resolved-ephemeral-credential-2026';
        const entered = createDeferred<void>();
        const accepted = createDeferred<unknown>();
        const debug = vi.spyOn(logger, 'debug').mockImplementation(() => {});
        mockSessionCreate.mockImplementation(() => {
          entered.resolve();
          return accepted.promise;
        });
        mockSessionDelete
          .mockResolvedValueOnce({
            error: { name: 'APIError', data: { message: `cleanup echoed ${credential}` } },
            response: { ok: false, status },
          })
          .mockResolvedValue({ data: true, response: { ok: true, status: 200 } });
        const provider = new OpenCodeSDKProvider({
          config: {
            baseUrl: 'http://127.0.0.1:4096',
            working_dir: '/test/work',
            mcp: remoteMcpWithBearer(credential),
          },
        });
        const call = provider.callApi('resolved cleanup');
        await entered.promise;
        const shutdown = provider.shutdown('process');
        await call;
        accepted.resolve({ data: createMockSessionResponse('late-http-result') });
        await shutdown;
        expect(mockSessionDelete).toHaveBeenCalledTimes(attempts);
        const failures = debug.mock.calls.filter(
          ([message]) => message === 'Failed to delete non-persistent OpenCode session',
        );
        if (logged) {
          expect(failures).toEqual([
            [
              'Failed to delete non-persistent OpenCode session',
              {
                sessionId: 'late-http-result',
                error: expect.stringContaining('[REDACTED]'),
              },
            ],
          ]);
          expect(JSON.stringify(failures)).not.toContain(credential);
        } else {
          expect(failures).toEqual([]);
        }
      },
    );

    it('preserves a remote persistent session whose ID arrives after process shutdown', async () => {
      const entered = createDeferred<void>();
      const accepted = createDeferred<unknown>();
      mockSessionCreate.mockImplementation(() => {
        entered.resolve();
        return accepted.promise;
      });
      const provider = new OpenCodeSDKProvider({
        config: {
          baseUrl: 'http://127.0.0.1:4096',
          working_dir: '/test/work',
          persist_sessions: true,
        },
      });
      const call = provider.callApi('persistent remote creation');
      await entered.promise;
      await provider.shutdown('process');
      await expect(call).resolves.toMatchObject({ error: 'OpenCode SDK call aborted' });
      accepted.resolve({ data: createMockSessionResponse('late-accepted-persistent') });
      await accepted.promise;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(mockSessionPrompt).not.toHaveBeenCalled();
      expect(mockSessionDelete).not.toHaveBeenCalled();
    });

    it('redacts captured credentials when detached late ephemeral deletion rejects', async () => {
      const credential = 'synthetic-late-ephemeral-credential-2026';
      const entered = createDeferred<void>();
      const accepted = createDeferred<unknown>();
      const deletion = createDeferred<unknown>();
      const debug = vi.spyOn(logger, 'debug').mockImplementation(() => {});
      mockSessionCreate.mockImplementation(() => {
        entered.resolve();
        return accepted.promise;
      });
      mockSessionDelete.mockImplementation(() => deletion.promise);
      const provider = new OpenCodeSDKProvider({
        config: {
          baseUrl: 'http://127.0.0.1:4096',
          working_dir: '/test/work',
          mcp: remoteMcpWithBearer(credential),
        },
      });
      const call = provider.callApi('redacted late cleanup');
      await entered.promise;
      const shutdown = provider.shutdown('process');
      await call;
      accepted.resolve({ data: createMockSessionResponse(`late-${credential}`) });
      await vi.waitFor(() => expect(mockSessionDelete).toHaveBeenCalledOnce());
      deletion.reject(new Error(`late cleanup echoed ${credential}`));
      await vi.waitFor(() =>
        expect(debug).toHaveBeenCalledWith('Failed to delete non-persistent OpenCode session', {
          sessionId: 'late-[REDACTED]',
          error: 'late cleanup echoed [REDACTED]',
        }),
      );
      const failures = debug.mock.calls.filter(([message]) =>
        String(message).includes('Failed to delete'),
      );
      expect(JSON.stringify(failures)).not.toContain(credential);
      await shutdown;
    });

    it('returns on process termination during startup and closes a local server that starts late', async () => {
      const starting = createDeferred<void>();
      const ready = createDeferred<unknown>();
      mockCreateOpencode.mockImplementationOnce(() => {
        starting.resolve();
        return ready.promise;
      });
      const provider = new OpenCodeSDKProvider({ config: { working_dir: '/test/work' } });
      const call = provider.callApi('prompt while process is starting');
      await starting.promise;
      const startupSignal = mockCreateOpencode.mock.calls[0][0].signal as AbortSignal;
      expect(startupSignal.aborted).toBe(false);

      await providerRegistry.shutdownForProcess();
      await expect(call).resolves.toMatchObject({ error: 'OpenCode SDK call aborted' });
      expect(startupSignal.aborted).toBe(true);
      expect(mockServerClose).not.toHaveBeenCalled();
      expect(mockSessionPrompt).not.toHaveBeenCalled();

      ready.resolve({
        client: {
          session: {
            create: mockSessionCreate,
            prompt: mockSessionPrompt,
            messages: mockSessionMessages,
            delete: mockSessionDelete,
          },
        },
        server: { url: 'http://127.0.0.1:4096', close: mockServerClose },
      });
      await vi.waitFor(() => expect(mockServerClose).toHaveBeenCalledOnce());
      expect(mockSessionPrompt).not.toHaveBeenCalled();
      const registrations = vi.spyOn(providerRegistry, 'registerScoped');
      await expect(provider.callApi('queued after process termination')).resolves.toMatchObject({
        error: 'OpenCode SDK call aborted before it started',
      });
      expect(registrations).not.toHaveBeenCalled();
      expect(mockCreateOpencode).toHaveBeenCalledOnce();
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

    it('lets an unrelated evaluation finish without closing an in-flight evaluation', async () => {
      const entered = createDeferred<void>();
      const pending = createDeferred<ReturnType<typeof createMockPromptResponse>>();
      mockSessionPrompt.mockImplementationOnce(() => {
        entered.resolve();
        return pending.promise;
      });
      const provider = new OpenCodeSDKProvider({
        config: { working_dir: '/test/work', persist_sessions: true },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      const activeEvaluation = runEvaluation('active-opencode-evaluation', provider);
      await entered.promise;
      try {
        const unrelated = await runEvaluation('unrelated-evaluation', {
          id: () => 'echo',
          callApi: async () => ({ output: 'unrelated completed' }),
        });

        expect(unrelated.results[0]).toMatchObject({ success: true });
        expect(mockSessionDelete).not.toHaveBeenCalled();
        expect(mockServerClose).not.toHaveBeenCalled();
      } finally {
        pending.resolve(createMockPromptResponse([{ type: 'text', text: 'active completed' }]));
        await activeEvaluation;
      }

      const completed = await activeEvaluation;
      expect(completed.results[0]).toMatchObject({
        success: true,
        response: { output: 'active completed' },
      });
      expect(mockSessionDelete).not.toHaveBeenCalled();
      expect(mockServerClose).toHaveBeenCalledOnce();
    });

    it('preserves a persistent session while its evaluation grades between serial calls', async () => {
      const grading = createDeferred<void>();
      const continueGrading = createDeferred<void>();
      mockSessionCreate
        .mockResolvedValueOnce(createMockSessionResponse('ongoing-evaluation-session'))
        .mockResolvedValue(createMockSessionResponse('unexpected-recreated-session'));
      const provider = new OpenCodeSDKProvider({
        config: { working_dir: '/test/work', persist_sessions: true },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });
      const ongoing = runEvaluation('serial-opencode-evaluation', provider, [
        {
          assert: [
            {
              type: 'javascript',
              value: async () => {
                grading.resolve();
                await continueGrading.promise;
                return true;
              },
            },
          ],
        },
        {},
      ]);
      await grading.promise;

      try {
        const unrelated = await runEvaluation('unrelated-while-grading', {
          id: () => 'echo',
          callApi: async () => ({ output: 'unrelated completed' }),
        });
        expect(unrelated.results[0]).toMatchObject({ success: true });
        expect(mockSessionPrompt).toHaveBeenCalledOnce();
        expect(mockSessionDelete).not.toHaveBeenCalled();
        expect(mockServerClose).not.toHaveBeenCalled();
      } finally {
        continueGrading.resolve();
        await ongoing;
      }

      const finished = await ongoing;
      expect(finished.results.map((result) => result.success)).toEqual([true, true]);
      expect(mockSessionCreate).toHaveBeenCalledOnce();
      expect(mockSessionPrompt.mock.calls.map(([parameters]) => parameters.sessionID)).toEqual([
        'ongoing-evaluation-session',
        'ongoing-evaluation-session',
      ]);
      expect(mockSessionDelete).not.toHaveBeenCalled();
      expect(mockServerClose).toHaveBeenCalledOnce();
    });

    it('defers automatic shutdown when another call is still starting the server', async () => {
      const starting = createDeferred<void>();
      const ready = createDeferred<unknown>();
      mockCreateOpencode.mockImplementationOnce(() => {
        starting.resolve();
        return ready.promise;
      });
      const provider = new OpenCodeSDKProvider({
        config: { working_dir: '/test/work', persist_sessions: true },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });
      const call = provider.callApi('prompt while starting');
      await starting.promise;
      try {
        await providerRegistry.shutdownAll();
        expect(mockSessionPrompt).not.toHaveBeenCalled();
        expect(mockServerClose).not.toHaveBeenCalled();
      } finally {
        ready.resolve({
          client: {
            session: {
              create: mockSessionCreate,
              prompt: mockSessionPrompt,
              messages: mockSessionMessages,
              delete: mockSessionDelete,
            },
          },
          server: { url: 'http://127.0.0.1:4096', close: mockServerClose },
        });
        await call;
      }

      await expect(call).resolves.toMatchObject({ output: 'Test response' });
      await vi.waitFor(() => expect(mockServerClose).toHaveBeenCalledOnce());
      expect(mockSessionDelete).toHaveBeenCalledOnce();
    });

    it('waits for active and queued calls to drain before automatically deleting a shared session', async () => {
      const firstEntered = createDeferred<void>();
      const secondEntered = createDeferred<void>();
      const firstPending = createDeferred<ReturnType<typeof createMockPromptResponse>>();
      const secondPending = createDeferred<ReturnType<typeof createMockPromptResponse>>();
      mockSessionPrompt
        .mockImplementationOnce(() => {
          firstEntered.resolve();
          return firstPending.promise;
        })
        .mockImplementationOnce(() => {
          secondEntered.resolve();
          return secondPending.promise;
        });
      const provider = new OpenCodeSDKProvider({
        config: { working_dir: '/test/work', persist_sessions: true },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      const first = provider.callApi('first active call');
      await firstEntered.promise;
      const second = provider.callApi('second queued call');
      try {
        await providerRegistry.shutdownAll();
        await providerRegistry.shutdownAll();
        expect(mockSessionDelete).not.toHaveBeenCalled();
        expect(mockServerClose).not.toHaveBeenCalled();
        expect(mockSessionPrompt).toHaveBeenCalledOnce();

        firstPending.resolve(createMockPromptResponse([{ type: 'text', text: 'first completed' }]));
        await expect(first).resolves.toMatchObject({ output: 'first completed' });
        await secondEntered.promise;
        await providerRegistry.shutdownAll();
        expect(mockSessionCreate).toHaveBeenCalledOnce();
        expect(mockSessionDelete).not.toHaveBeenCalled();
        expect(mockServerClose).not.toHaveBeenCalled();

        secondPending.resolve(
          createMockPromptResponse([{ type: 'text', text: 'second completed' }]),
        );
        await expect(second).resolves.toMatchObject({ output: 'second completed' });
        await expect(provider.callApi('next sequential row')).resolves.toMatchObject({
          output: 'Test response',
        });
        expect(mockSessionCreate).toHaveBeenCalledOnce();
        expect(mockSessionDelete).not.toHaveBeenCalled();
        await vi.waitFor(() => expect(mockServerClose).toHaveBeenCalledOnce());
        expect(mockSessionDelete).toHaveBeenCalledOnce();
        await providerRegistry.shutdownAll();
        expect(mockServerClose).toHaveBeenCalledOnce();
      } finally {
        firstPending.resolve(createMockPromptResponse([{ type: 'text', text: 'first completed' }]));
        secondPending.resolve(
          createMockPromptResponse([{ type: 'text', text: 'second completed' }]),
        );
        await Promise.allSettled([first, second]);
      }
    });

    it('holds a new call behind cleanup already in progress and registers its new server', async () => {
      const deleting = createDeferred<void>();
      const pendingDelete = createDeferred<unknown>();
      const provider = new OpenCodeSDKProvider({
        config: { working_dir: '/test/work', persist_sessions: true },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });
      await provider.callApi('first evaluation');
      mockSessionDelete.mockImplementationOnce(() => {
        deleting.resolve();
        return pendingDelete.promise;
      });

      const automatic = providerRegistry.shutdownAll();
      await deleting.promise;
      const nextCall = provider.callApi('second evaluation');
      try {
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(mockSessionPrompt).toHaveBeenCalledOnce();
        expect(mockServerClose).not.toHaveBeenCalled();
      } finally {
        pendingDelete.resolve(undefined);
        await automatic;
      }

      await expect(nextCall).resolves.toMatchObject({ output: 'Test response' });
      expect(mockCreateOpencode).toHaveBeenCalledTimes(2);
      expect(mockServerClose).toHaveBeenCalledOnce();
      await providerRegistry.shutdownAll();
      expect(mockServerClose).toHaveBeenCalledTimes(2);
    });

    it.each([
      { server: 'local', baseUrl: undefined },
      { server: 'remote', baseUrl: 'http://127.0.0.1:4096' },
    ])('bounds $server session deletion when the transport ignores abort', async ({ baseUrl }) => {
      const never = new Promise<never>(() => {});
      const bothDeletesStarted = createDeferred<void>();
      let deleteCount = 0;
      let stalledSignal: AbortSignal | undefined;
      const settled = vi.fn();
      mockSessionCreate
        .mockResolvedValueOnce(createMockSessionResponse('stalled-session'))
        .mockResolvedValueOnce(createMockSessionResponse('reachable-session'));
      mockSessionDelete.mockImplementation((parameters, options) => {
        if (++deleteCount === 2) {
          bothDeletesStarted.resolve();
        }
        if (parameters.sessionID === 'stalled-session') {
          stalledSignal = options.signal;
          return never;
        }
        return Promise.resolve();
      });
      rmSpy
        .mockRejectedValueOnce(new Error('first per-call temp removal failed'))
        .mockRejectedValueOnce(new Error('second per-call temp removal failed'));
      const provider = new OpenCodeSDKProvider({
        config: { baseUrl, persist_sessions: true },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });
      await provider.callApi('first model', createPromptContext({ model: 'model-one' }));
      await provider.callApi('second model', createPromptContext({ model: 'model-two' }));
      expect(rmSpy).toHaveBeenCalledTimes(2);

      vi.useFakeTimers();
      try {
        const initialTimers = vi.getTimerCount();
        const shutdown = providerRegistry.shutdownAll().then(settled);
        await bothDeletesStarted.promise;

        expect(mockSessionDelete).toHaveBeenCalledTimes(2);
        expect(stalledSignal).toBeInstanceOf(AbortSignal);
        expect(stalledSignal?.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(999);
        expect(settled).not.toHaveBeenCalled();
        expect(rmSpy).toHaveBeenCalledTimes(2);

        await vi.advanceTimersByTimeAsync(1);
        await shutdown;
        expect(stalledSignal?.aborted).toBe(true);
        expect(settled).toHaveBeenCalledOnce();
        expect(rmSpy).toHaveBeenCalledTimes(3);
        expect(mockServerClose).toHaveBeenCalledTimes(baseUrl ? 0 : 1);
        expect(vi.getTimerCount()).toBe(initialTimers);
        await providerRegistry.shutdownAll();
        expect(mockSessionDelete).toHaveBeenCalledTimes(2);
      } finally {
        await vi.runAllTimersAsync();
        vi.useRealTimers();
      }
    });

    it('clears the shutdown timer when session deletion succeeds promptly', async () => {
      const provider = new OpenCodeSDKProvider({
        config: { working_dir: '/test/work', persist_sessions: true },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });
      await provider.callApi('prompt');

      vi.useFakeTimers();
      try {
        const initialTimers = vi.getTimerCount();
        await providerRegistry.shutdownAll();

        expect(mockServerClose).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(initialTimers);
      } finally {
        vi.useRealTimers();
      }
    });

    it('handles and sanitizes a session deletion that rejects after automatic shutdown finishes', async () => {
      const previous = 'synthetic-late-shutdown-credential-0919';
      const debug = vi.spyOn(logger, 'debug').mockImplementation(() => {});
      const deleting = createDeferred<void>();
      const lateDelete = createDeferred<unknown>();
      const provider = new OpenCodeSDKProvider({
        config: { working_dir: '/test/work', persist_sessions: true },
      });
      await provider.callApi(
        'persistent prompt with previous credential',
        createPromptContext({ mcp: remoteMcpWithBearer(previous) }),
      );
      mockSessionDelete.mockImplementationOnce(() => {
        deleting.resolve();
        return lateDelete.promise;
      });

      vi.useFakeTimers();
      try {
        const shutdown = providerRegistry.shutdownAll();
        await deleting.promise;
        await vi.advanceTimersByTimeAsync(1_000);
        await shutdown;
        expect(mockServerClose).toHaveBeenCalledOnce();

        lateDelete.reject(new Error(`Deletion failed for ${previous}`));
        await vi.advanceTimersByTimeAsync(0);
        expect(debug).toHaveBeenCalledWith('Failed to delete persistent OpenCode session', {
          sessionId: 'test-session-123',
          error: 'Deletion failed for [REDACTED]',
        });
        expect(JSON.stringify(debug.mock.calls)).not.toContain(previous);
      } finally {
        lateDelete.resolve(undefined);
        await vi.runAllTimersAsync();
        vi.useRealTimers();
      }
    });

    it('passes automatic deletion cancellation in the v1 request options', async () => {
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
        config: { working_dir: '/test/work', persist_sessions: true },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });
      await provider.callApi('legacy persistent call');
      await providerRegistry.shutdownAll();

      expect(mockSessionDelete).toHaveBeenCalledExactlyOnceWith({
        path: { id: 'test-session-123', sessionID: 'test-session-123' },
        query: { directory: '/test/work' },
        signal: expect.any(AbortSignal),
      });
      expect(mockServerClose).toHaveBeenCalledOnce();
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

    it('keeps an automatic temp-directory failure registered for a later lifecycle retry', async () => {
      rmSpy
        .mockRejectedValueOnce(new Error('per-call removal failed'))
        .mockRejectedValueOnce(new Error('automatic removal failed'));
      const provider = new OpenCodeSDKProvider({ env: { ANTHROPIC_API_KEY: 'test-api-key' } });

      await provider.callApi('automatic temp cleanup');
      await providerRegistry.shutdownAll();
      expect(rmSpy).toHaveBeenCalledTimes(2);
      expect(mockServerClose).toHaveBeenCalledOnce();

      await providerRegistry.shutdownAll();
      expect(rmSpy).toHaveBeenCalledTimes(3);
      await providerRegistry.shutdownAll();
      expect(rmSpy).toHaveBeenCalledTimes(3);
      expect(mockServerClose).toHaveBeenCalledOnce();
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

    it('keeps a reused local persistent session and evicts only the least recently used lookup', async () => {
      const { history } = registerDiskBackedLocalServers();
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
      expect(mockSessionDelete).not.toHaveBeenCalled();
      const explicitlyResumed = await provider.callApi(
        'explicit oldest',
        createPromptContext({ session_id: 'owned-local-2' }),
      );
      expect(explicitlyResumed).toMatchObject({
        output: 'lru | explicit oldest',
        sessionId: 'owned-local-2',
      });
      await provider.callApi('implicit retained', withModel(0));
      const newLookup = await provider.callApi('implicit recreated', withModel(1));
      expect(newLookup.sessionId).toBe('owned-local-102');
      expect(mockSessionCreate).toHaveBeenCalledTimes(102);
      expect(mockSessionDelete).not.toHaveBeenCalled();

      await provider.cleanup();
      expect(mockSessionDelete).toHaveBeenCalledTimes(100);
      expect(mockSessionDelete).not.toHaveBeenCalledWith(
        expect.objectContaining({ sessionID: 'owned-local-2' }),
      );
      expect(history.has('owned-local-2')).toBe(true);
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

    it('preserves trusted local validation diagnostics when a compound MCP command is configured', async () => {
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
      const mcp = { local: { type: 'local' as const, command: ['node', '-e', '0'] } };
      const invalidTools = new OpenCodeSDKProvider({
        config: { mcp, tools: { bash: 'no' } } as unknown as OpenCodeSDKConfig,
      });
      const invalidPermission = new OpenCodeSDKProvider({
        config: { mcp, permission: { bash: { '*': 'invalid' } } } as unknown as OpenCodeSDKConfig,
      });
      const invalidSession = new OpenCodeSDKProvider({
        config: { mcp, session_id: 'public-test-session', permission: { bash: 'deny' } },
      });

      const tools = await invalidTools.callApi('local tool validation');
      const permission = await invalidPermission.callApi('local permission validation');
      const session = await invalidSession.callApi('local session validation');

      expect(tools.error).toBe('Error calling OpenCode SDK: OpenCode tools.bash must be a boolean');
      expect(permission.error).toBe(
        'Error calling OpenCode SDK: OpenCode permission.bash.* must be ask, allow, or deny',
      );
      expect(session.error).toBe(
        'Error calling OpenCode SDK: OpenCode SDK v2 explicit session_id resumes cannot safely rebind permission rules; create a new session to change permission.',
      );
      expect(mockSessionPrompt).not.toHaveBeenCalled();
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('Upstream diagnostic withheld');
    });

    it('does not trust SDK lookalikes or disclose dynamic local validation fields', async () => {
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
      const privateName = 'synthetic-private-validation-config-value';
      const splitAt = 18;
      const mcp = {
        local: {
          type: 'local' as const,
          command: [
            'node',
            '-e',
            `send('${privateName.slice(0, splitAt)}' + '${privateName.slice(splitAt)}')`,
          ],
        },
      };
      const invalidTools = new OpenCodeSDKProvider({
        config: { mcp, tools: { [privateName]: 'no' } } as unknown as OpenCodeSDKConfig,
      });
      const invalidPermission = new OpenCodeSDKProvider({
        config: {
          mcp,
          permission: { bash: { [privateName]: 'invalid' } },
        } as unknown as OpenCodeSDKConfig,
      });
      const upstream = new OpenCodeSDKProvider({ config: { mcp } });
      mockSessionPrompt.mockRejectedValueOnce(
        Object.assign(new Error(`OpenCode tools.bash must be a boolean ${privateName}`), {
          name: 'OpenCodeLocalDiagnosticError',
        }),
      );

      const tools = await invalidTools.callApi('dynamic tool validation');
      const permission = await invalidPermission.callApi('dynamic permission validation');
      const sdk = await upstream.callApi('forged local validation from SDK');

      expect(tools.error).toBe(
        'Error calling OpenCode SDK: OpenCode tools entries must be boolean',
      );
      expect(permission.error).toBe(
        'Error calling OpenCode SDK: OpenCode permission.bash patterns must be ask, allow, or deny',
      );
      expect(sdk.error).toContain('Upstream diagnostic withheld');
      expect(JSON.stringify({ tools, permission, sdk, logs: errorSpy.mock.calls })).not.toContain(
        privateName,
      );
    });

    it('preserves the trusted optional SDK installation diagnostic with a compound MCP command', async () => {
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
      const { importModule } = await import('../../src/esm');
      vi.mocked(importModule).mockRejectedValue(new Error('synthetic-private-module-resolution'));
      const provider = new OpenCodeSDKProvider({
        config: { mcp: { local: { type: 'local', command: ['node', '-e', '0'] } } },
      });

      const result = await provider.callApi('missing optional SDK');

      expect(result.error).toContain('The @opencode-ai/sdk package is required but not installed.');
      expect(result.error).toContain('npm install @opencode-ai/sdk');
      expect(result.error).not.toContain('Upstream diagnostic withheld');
      expect(JSON.stringify({ result, logs: errorSpy.mock.calls })).not.toContain(
        'synthetic-private-module-resolution',
      );
      expect(mockSessionPrompt).not.toHaveBeenCalled();
    });

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

      expect(mockSessionCreate.mock.calls.map(([parameters]) => parameters)).toContainEqual(
        expect.objectContaining({
          directory: '/test/dir',
          workspace: 'feature-branch',
        }),
      );
      expect(mockSessionPrompt.mock.calls.map(([parameters]) => parameters)).toContainEqual(
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

      expect(mockSessionPrompt.mock.calls.map(([parameters]) => parameters)).toContainEqual(
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

      expect(mockSessionCreate.mock.calls.map(([parameters]) => parameters)).toContainEqual(
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

    it.each([
      ['explicit v2', { session_id: 'shared-explicit' }, 'v2'],
      ['persistent v2', { persist_sessions: true }, 'v2'],
      ['explicit v1', { session_id: 'shared-explicit' }, 'v1'],
      ['persistent v1', { persist_sessions: true }, 'v1'],
    ] as const)(
      'waits for a %s session cancellation acknowledgement before releasing its next prompt',
      async (_kind, config, version) => {
        if (version === 'v1') {
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
        }
        const started = createDeferred<void>();
        const acknowledgement = createDeferred<void>();
        const controller = new AbortController();
        const events: string[] = [];
        mockSessionPrompt
          .mockImplementationOnce(
            (parameters, options) =>
              new Promise((_resolve, reject) => {
                events.push('first');
                started.resolve();
                const signal = options?.signal ?? parameters.signal;
                signal.addEventListener(
                  'abort',
                  () => reject(new DOMException('Aborted', 'AbortError')),
                  { once: true },
                );
              }),
          )
          .mockImplementationOnce(async () => {
            events.push('second');
            return createMockPromptResponse([{ type: 'text', text: 'second survived' }]);
          });
        mockSessionAbort.mockImplementationOnce(async () => {
          events.push('abort sent');
          await acknowledgement.promise;
          events.push('abort acknowledged');
          return { data: true };
        });
        const provider = new OpenCodeSDKProvider({ config });
        const first = provider.callApi('first', undefined, { abortSignal: controller.signal });
        await started.promise;
        const second = provider.callApi('second');

        try {
          controller.abort();
          await vi.waitFor(() => expect(mockSessionAbort).toHaveBeenCalledOnce());
          await new Promise<void>((resolve) => setImmediate(resolve));
          expect(mockSessionPrompt).toHaveBeenCalledTimes(1);
          acknowledgement.resolve();
          await expect(first).resolves.toMatchObject({ error: 'OpenCode SDK call aborted' });
          await expect(second).resolves.toMatchObject({ output: 'second survived' });
          expect(events).toEqual(['first', 'abort sent', 'abort acknowledged', 'second']);
        } finally {
          acknowledgement.resolve();
          await Promise.allSettled([first, second]);
        }
      },
    );

    it('quarantines a shared session if cancellation is still unacknowledged after its bounded wait', async () => {
      const started = createDeferred<void>();
      const acknowledgement = createDeferred<void>();
      const controller = new AbortController();
      let cancellationSignal: AbortSignal | undefined;
      mockSessionPrompt.mockImplementationOnce(
        (_parameters, options) =>
          new Promise((_resolve, reject) => {
            started.resolve();
            options.signal.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true },
            );
          }),
      );
      mockSessionAbort.mockImplementationOnce(async (_parameters, options) => {
        cancellationSignal = options?.signal;
        await acknowledgement.promise;
        return { data: true };
      });
      const provider = new OpenCodeSDKProvider({ config: { session_id: 'shared-explicit' } });
      const first = provider.callApi('first', undefined, { abortSignal: controller.signal });
      await started.promise;
      const second = provider.callApi('second');

      try {
        controller.abort();
        await expect(first).resolves.toMatchObject({ error: 'OpenCode SDK call aborted' });
        await expect(second).resolves.toMatchObject({
          error: expect.stringContaining('previous cancellation could not be confirmed'),
        });
        expect(mockSessionPrompt).toHaveBeenCalledTimes(1);
        expect(cancellationSignal?.aborted).toBe(true);
        await expect(provider.callApi('while unsafe')).resolves.toMatchObject({
          error: expect.stringContaining('previous cancellation could not be confirmed'),
        });
        expect(mockSessionPrompt).toHaveBeenCalledTimes(1);

        acknowledgement.resolve();
        await new Promise<void>((resolve) => setImmediate(resolve));
        await expect(provider.callApi('after acknowledgement')).resolves.toMatchObject({
          output: 'Test response',
        });
        expect(mockSessionPrompt).toHaveBeenCalledTimes(2);
      } finally {
        acknowledgement.resolve();
        await Promise.allSettled([first, second]);
      }
    });

    it('does not resume a shared session when its abort request returns a structured error', async () => {
      const started = createDeferred<void>();
      const controller = new AbortController();
      mockSessionPrompt.mockImplementationOnce(
        (_parameters, options) =>
          new Promise((_resolve, reject) => {
            started.resolve();
            options.signal.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true },
            );
          }),
      );
      mockSessionAbort.mockResolvedValueOnce({
        error: { name: 'APIError', data: { message: 'no acknowledgement' } },
      });
      const provider = new OpenCodeSDKProvider({ config: { session_id: 'shared-explicit' } });
      const first = provider.callApi('first', undefined, { abortSignal: controller.signal });
      await started.promise;
      const second = provider.callApi('second');
      controller.abort();

      await expect(first).resolves.toMatchObject({ error: 'OpenCode SDK call aborted' });
      await expect(second).resolves.toMatchObject({
        error: expect.stringContaining('previous cancellation could not be confirmed'),
      });
      expect(mockSessionPrompt).toHaveBeenCalledTimes(1);
      await expect(
        provider.callApi(
          'different session',
          createPromptContext({ session_id: 'unrelated-explicit' }),
        ),
      ).resolves.toMatchObject({ output: 'Test response' });
      expect(mockSessionPrompt).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['persistent', 'explicit'],
      ['explicit', 'persistent'],
    ] as const)(
      'keeps a cancelled session locked across %s to %s addressing until affirmative acknowledgement',
      async (firstMode, secondMode) => {
        const sessionId = 'same-server-session';
        const contextFor = (mode: string) =>
          mode === 'explicit' ? createPromptContext({ session_id: sessionId }) : undefined;
        const started = createDeferred<void>();
        const acknowledgement = createDeferred<void>();
        const controller = new AbortController();
        const events: string[] = [];
        mockSessionCreate.mockResolvedValue(createMockSessionResponse(sessionId));
        const provider = new OpenCodeSDKProvider({ config: { persist_sessions: true } });
        await expect(provider.callApi('warm automatic session')).resolves.toMatchObject({
          sessionId,
        });
        mockSessionPrompt
          .mockImplementationOnce(
            (_parameters, options) =>
              new Promise((_resolve, reject) => {
                events.push('first');
                started.resolve();
                options.signal.addEventListener(
                  'abort',
                  () => reject(new DOMException('Aborted', 'AbortError')),
                  { once: true },
                );
              }),
          )
          .mockImplementationOnce(async () => {
            events.push('second');
            return createMockPromptResponse([{ type: 'text', text: 'second survived' }]);
          });
        mockSessionAbort.mockImplementationOnce(async () => {
          events.push('abort sent');
          await acknowledgement.promise;
          events.push('abort acknowledged');
          return { data: true };
        });
        const first = provider.callApi('first', contextFor(firstMode), {
          abortSignal: controller.signal,
        });
        await started.promise;
        const second = provider.callApi('second', contextFor(secondMode));

        try {
          controller.abort();
          await vi.waitFor(() => expect(mockSessionAbort).toHaveBeenCalledOnce());
          await new Promise<void>((resolve) => setImmediate(resolve));
          expect(mockSessionPrompt).toHaveBeenCalledTimes(2);
          acknowledgement.resolve();
          await expect(first).resolves.toMatchObject({ error: 'OpenCode SDK call aborted' });
          await expect(second).resolves.toMatchObject({ output: 'second survived', sessionId });
          expect(events).toEqual(['first', 'abort sent', 'abort acknowledged', 'second']);
        } finally {
          acknowledgement.resolve();
          await Promise.allSettled([first, second]);
        }
      },
    );

    it.each([
      ['persistent', 'explicit'],
      ['explicit', 'persistent'],
    ] as const)(
      'does not bypass session quarantine by changing %s to %s addressing',
      async (firstMode, secondMode) => {
        const sessionId = 'same-server-session';
        const contextFor = (mode: string) =>
          mode === 'explicit' ? createPromptContext({ session_id: sessionId }) : undefined;
        const started = createDeferred<void>();
        const controller = new AbortController();
        mockSessionCreate.mockResolvedValue(createMockSessionResponse(sessionId));
        const provider = new OpenCodeSDKProvider({ config: { persist_sessions: true } });
        await expect(provider.callApi('warm automatic session')).resolves.toMatchObject({
          sessionId,
        });
        mockSessionPrompt.mockImplementationOnce(
          (_parameters, options) =>
            new Promise((_resolve, reject) => {
              started.resolve();
              options.signal.addEventListener(
                'abort',
                () => reject(new DOMException('Aborted', 'AbortError')),
                { once: true },
              );
            }),
        );
        mockSessionAbort.mockRejectedValueOnce(new Error('no acknowledgement'));
        const first = provider.callApi('first', contextFor(firstMode), {
          abortSignal: controller.signal,
        });
        await started.promise;
        controller.abort();

        await expect(first).resolves.toMatchObject({ error: 'OpenCode SDK call aborted' });
        await expect(
          provider.callApi('same id through alias', contextFor(secondMode)),
        ).resolves.toMatchObject({
          error: expect.stringContaining('previous cancellation could not be confirmed'),
        });
        expect(mockSessionPrompt).toHaveBeenCalledTimes(2);
      },
    );

    it.each([
      ['undefined', () => undefined],
      ['null', () => null],
      ['empty payload', () => ({})],
      ['null data', () => ({ data: null, response: new Response('null', { status: 200 }) })],
      [
        'empty HTTP 200',
        () => ({
          data: {},
          response: new Response(null, { status: 200, headers: { 'Content-Length': '0' } }),
        }),
      ],
      ['HTTP 204', () => ({ data: {}, response: new Response(null, { status: 204 }) })],
      ['false data', () => ({ data: false, response: new Response('false', { status: 200 }) })],
      [
        'affirmative data with a non-contract status',
        () => ({ data: true, response: new Response('true', { status: 201 }) }),
      ],
    ] as Array<[string, () => unknown]>)(
      'requires affirmative successful confirmation, not %s',
      async (_label, makeResponse) => {
        const started = createDeferred<void>();
        const controller = new AbortController();
        mockSessionPrompt.mockImplementationOnce(
          (_parameters, options) =>
            new Promise((_resolve, reject) => {
              started.resolve();
              options.signal.addEventListener(
                'abort',
                () => reject(new DOMException('Aborted', 'AbortError')),
                { once: true },
              );
            }),
        );
        mockSessionAbort.mockResolvedValueOnce(makeResponse());
        const provider = new OpenCodeSDKProvider({ config: { session_id: 'shared-explicit' } });
        const first = provider.callApi('first', undefined, { abortSignal: controller.signal });
        await started.promise;
        const second = provider.callApi('second');
        controller.abort();

        await expect(first).resolves.toMatchObject({ error: 'OpenCode SDK call aborted' });
        await expect(second).resolves.toMatchObject({
          error: expect.stringContaining('previous cancellation could not be confirmed'),
        });
        expect(mockSessionPrompt).toHaveBeenCalledTimes(1);
      },
    );

    it('quarantines a shared session if the server does not expose a cancellation endpoint', async () => {
      const started = createDeferred<void>();
      const controller = new AbortController();
      mockCreateOpencodeClient.mockReturnValue({
        session: {
          create: mockSessionCreate,
          prompt: mockSessionPrompt,
          messages: mockSessionMessages,
          delete: mockSessionDelete,
          list: mockSessionList,
        },
      });
      mockSessionPrompt.mockImplementationOnce(
        (_parameters, options) =>
          new Promise((_resolve, reject) => {
            started.resolve();
            options.signal.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true },
            );
          }),
      );
      const provider = new OpenCodeSDKProvider({
        config: { baseUrl: 'http://127.0.0.1:4096', session_id: 'shared-explicit' },
      });
      const first = provider.callApi('first', undefined, { abortSignal: controller.signal });
      await started.promise;
      const second = provider.callApi('second');
      controller.abort();

      await expect(first).resolves.toMatchObject({ error: 'OpenCode SDK call aborted' });
      await expect(second).resolves.toMatchObject({
        error: expect.stringContaining('previous cancellation could not be confirmed'),
      });
      expect(mockSessionAbort).not.toHaveBeenCalled();
      expect(mockSessionPrompt).toHaveBeenCalledTimes(1);
    });

    it('allows a new persistent session after explicit cleanup of an unconfirmed old session', async () => {
      const started = createDeferred<void>();
      const controller = new AbortController();
      mockSessionCreate
        .mockResolvedValueOnce(createMockSessionResponse('old-session'))
        .mockResolvedValueOnce(createMockSessionResponse('fresh-session'));
      mockSessionPrompt.mockImplementationOnce(
        (_parameters, options) =>
          new Promise((_resolve, reject) => {
            started.resolve();
            options.signal.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true },
            );
          }),
      );
      mockSessionAbort.mockRejectedValueOnce(new Error('server abort failed'));
      const provider = new OpenCodeSDKProvider({ config: { persist_sessions: true } });
      const first = provider.callApi('first', undefined, { abortSignal: controller.signal });
      await started.promise;
      controller.abort();

      await expect(first).resolves.toMatchObject({ error: 'OpenCode SDK call aborted' });
      await expect(provider.callApi('old session')).resolves.toMatchObject({
        error: expect.stringContaining('previous cancellation could not be confirmed'),
      });
      await provider.cleanup();
      await expect(provider.callApi('fresh session')).resolves.toMatchObject({
        output: 'Test response',
        sessionId: 'fresh-session',
      });
      expect(mockSessionPrompt).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['shared', 'existing-v1'],
      ['ephemeral', undefined],
    ])('sends an ordinary caller cancellation to a v1 %s session', async (_kind, sessionId) => {
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
      const started = createDeferred<void>();
      const controller = new AbortController();
      mockSessionPrompt.mockImplementationOnce(
        (parameters) =>
          new Promise((_resolve, reject) => {
            started.resolve();
            parameters.signal.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true },
            );
          }),
      );
      mockSessionAbort.mockResolvedValueOnce({ data: true });
      const provider = new OpenCodeSDKProvider({
        config: {
          baseUrl: 'http://127.0.0.1:4096',
          working_dir: '/test/work',
          session_id: sessionId,
        },
      });
      const first = provider.callApi('first', undefined, { abortSignal: controller.signal });
      await started.promise;
      controller.abort();

      await expect(first).resolves.toMatchObject({ error: 'OpenCode SDK call aborted' });
      expect(mockSessionAbort).toHaveBeenCalledOnce();
      expect(mockSessionAbort.mock.calls[0]).toEqual([
        expect.objectContaining({
          path: { id: sessionId ?? 'test-session-123', sessionID: sessionId ?? 'test-session-123' },
          query: { directory: '/test/work' },
          ...(sessionId ? { signal: expect.any(AbortSignal) } : {}),
        }),
      ]);
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
      { label: 'final parts with history denied', useHistory: false },
      { label: 'final and intermediate parts with history enabled', useHistory: true },
    ])('grades completed skill evidence on a refusal from $label', async ({ useHistory }) => {
      const makeSkill = (name: string, status = 'completed') => ({
        type: 'tool',
        tool: 'skill',
        state: {
          status,
          input: { name, extra: 'synthetic-private-filtered-skill-input' },
          metadata: { dir: '/synthetic-private-filtered-skill-dir' },
          output: 'synthetic-private-filtered-skill-output',
        },
      });
      const finalParts = [
        makeSkill('final-skill'),
        makeSkill('unfinished-skill', 'running'),
        makeSkill('failed-skill', 'error'),
        { type: 'text', text: 'synthetic-private-filtered-response' },
      ];
      const response = createMockPromptResponse(finalParts, { input: 2, output: 1 }, 0.01, {
        text: 'synthetic-private-filtered-structured',
      });
      mockSessionPrompt.mockResolvedValue({
        data: {
          ...response.data,
          info: {
            ...response.data.info,
            error: {
              name: 'ContentFilterError',
              data: { message: 'synthetic-private-filtered-upstream-message' },
            },
          },
        },
      });
      mockSessionMessages.mockResolvedValue([
        { info: { id: 'previous-assistant' }, parts: [makeSkill('previous-skill')] },
        { info: { id: 'user-msg-123' }, parts: [] },
        { info: { id: 'intermediate' }, parts: [makeSkill('history-skill')] },
        { info: { id: 'msg-123' }, parts: finalParts },
        { info: { id: 'later-assistant' }, parts: [makeSkill('later-skill')] },
      ]);
      const provider = new OpenCodeSDKProvider({
        config: { tools: { skill: useHistory } },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      const direct = await provider.callApi(`refusal with skill ${useHistory}`);
      const [graded] = await runEval({
        delay: 0,
        testIdx: 0,
        promptIdx: 0,
        repeatIndex: 0,
        isRedteam: false,
        provider,
        prompt: { raw: `grade refusal with skill ${useHistory}`, label: 'test' },
        test: {
          assert: [
            { type: 'is-refusal' },
            { type: 'skill-used', value: { name: 'final-skill', min: 1, max: 1 } },
            { type: 'not-skill-used', value: 'final-skill' },
            { type: useHistory ? 'skill-used' : 'not-skill-used', value: 'history-skill' },
            { type: 'not-skill-used', value: 'unfinished-skill' },
            { type: 'not-skill-used', value: 'failed-skill' },
            { type: 'not-skill-used', value: 'previous-skill' },
            { type: 'not-skill-used', value: 'later-skill' },
          ],
        },
        conversations: {},
        registers: {},
      });

      expect(mockSessionMessages).toHaveBeenCalledTimes(useHistory ? 2 : 0);
      expect(direct).toMatchObject({ isRefusal: true, guardrails: { flagged: true } });
      expect(direct.metadata?.skillCalls).toEqual(
        (useHistory ? ['history-skill', 'final-skill'] : ['final-skill']).map((name) => ({
          name,
          input: { name },
          source: 'tool',
        })),
      );
      expect(graded.success).toBe(false);
      expect(graded.gradingResult?.componentResults?.map(({ pass }) => pass)).toEqual([
        true,
        true,
        false,
        true,
        true,
        true,
        true,
        true,
      ]);
      expect(direct).not.toHaveProperty('error');
      expect(direct).not.toHaveProperty('raw');
      expect(JSON.stringify({ direct, graded })).not.toContain('synthetic-private-filtered');
    });

    it('retains final refusal skill evidence when the allowed history fetch fails', async () => {
      const response = createMockPromptResponse([
        { type: 'tool', tool: 'skill', state: { status: 'completed', input: { name: 'review' } } },
        { type: 'text', text: 'synthetic-private-filtered-response' },
      ]);
      mockSessionPrompt.mockResolvedValueOnce({
        data: {
          ...response.data,
          info: { ...response.data.info, error: { _tag: 'ContentFilterError' } },
        },
      });
      mockSessionMessages.mockRejectedValueOnce(new Error('History unavailable'));
      const provider = new OpenCodeSDKProvider({
        config: { tools: { skill: true } },
        env: { ANTHROPIC_API_KEY: 'test-api-key' },
      });

      const result = await provider.callApi('refusal with unavailable history');

      expect(mockSessionMessages).toHaveBeenCalledTimes(1);
      expect(result.metadata?.skillCalls).toEqual([
        { name: 'review', input: { name: 'review' }, source: 'tool' },
      ]);
      expect(result).toMatchObject({ isRefusal: true, guardrails: { flagged: true } });
      expect(JSON.stringify(result)).not.toContain('synthetic-private-filtered-response');
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
      ...['credit_balance_exhausted', 'billing_hard_limit_reached'].map((code) => ({
        label: `assistant explicit body code ${code} overrides the SDK retry flag`,
        delivery: 'assistant',
        details: {
          statusCode: 429,
          isRetryable: true,
          message: 'Upstream rejected the request',
          responseBody: JSON.stringify({
            error: { code, message: 'synthetic-private-quota-body' },
          }),
          responseHeaders: { 'retry-after': '31', authorization: 'synthetic-private-quota-header' },
        },
        diagnostic: 'Upstream rejected the request',
      })),
      {
        label: 'transport definitive type without a retry flag',
        delivery: 'transport',
        details: {
          message: 'Upstream rejected the request',
          responseBody: JSON.stringify({
            error: { code: 'rate_limit_exceeded', type: 'billing_not_active' },
          }),
        },
        diagnostic: 'Upstream rejected the request',
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

    it('keeps an ambiguous quota code retryable when the SDK marks a throttle as retryable', async () => {
      const { isProviderResponseRateLimited } = await import('../../src/scheduler/types');
      const response = createMockPromptResponse([]);
      mockSessionPrompt.mockResolvedValueOnce({
        data: {
          ...response.data,
          info: {
            ...response.data.info,
            error: {
              name: 'APIError',
              data: {
                statusCode: 429,
                isRetryable: true,
                message: 'The requests per minute quota is temporarily saturated',
                responseBody: JSON.stringify({ error: { code: 'insufficient_quota' } }),
                responseHeaders: { 'Retry-After': '2' },
              },
            },
          },
        },
      });
      const provider = new OpenCodeSDKProvider({ env: { ANTHROPIC_API_KEY: 'test-api-key' } });

      const result = await provider.callApi('ambiguous quota window');

      expect(result.metadata).toMatchObject({ rateLimitKind: 'rate_limit' });
      expect(isProviderResponseRateLimited(result, undefined)).toBe(true);
    });

    it.each([
      {
        label: 'billing body despite the SDK recommending a retry',
        delivery: 'assistant',
        isRetryable: true,
        body: {
          code: 'insufficient_quota',
          message: 'You exceeded your current quota. Check your plan and billing details.',
        },
        headers: {},
        expected: 'quota',
      },
      {
        label: 'transient code over ambiguous type despite the SDK discouraging a retry',
        delivery: 'assistant',
        isRetryable: false,
        body: {
          code: 'rate_limit_exceeded',
          type: 'insufficient_quota',
          message: 'Too many requests',
        },
        headers: { 'Retry-After': '2' },
        expected: 'rate_limit',
      },
      {
        label: 'transient code over ambiguous type with no recovery header',
        delivery: 'throw',
        isRetryable: false,
        body: {
          code: 'rate_limit_exceeded',
          type: 'insufficient_quota',
          message: 'Too many requests',
        },
        headers: {},
        expected: 'rate_limit',
      },
      {
        label: 'ambiguous body code with a short gateway recovery hint',
        delivery: 'transport',
        isRetryable: false,
        body: { code: 'insufficient_quota', message: 'Too many requests' },
        headers: { 'Retry-After': '2' },
        expected: 'rate_limit',
      },
      {
        label: 'ambiguous body code with a short reset hint',
        delivery: 'assistant',
        isRetryable: false,
        body: { code: 'quota_exceeded', message: 'Quota exceeded' },
        headers: { 'X-RateLimit-Reset-Requests': '30s' },
        expected: 'rate_limit',
      },
      {
        label: 'ambiguous body code with a far recovery hint',
        delivery: 'throw',
        isRetryable: true,
        body: { code: 'insufficient_quota', message: 'Check billing' },
        headers: { 'Retry-After': '7200' },
        expected: 'quota',
      },
      {
        label: 'definitive type even with a transient code and short recovery hint',
        delivery: 'transport',
        isRetryable: true,
        body: { code: 'rate_limit_exceeded', type: 'billing_hard_limit_reached' },
        headers: { 'Retry-After': '2' },
        expected: 'quota',
      },
    ])('matches the shared HTTP 429 contract for $label', async (entry) => {
      const { createProviderRateLimitOptions } = await import(
        '../../src/scheduler/providerWrapper'
      );
      const error = {
        name: 'APIError',
        data: {
          statusCode: 429,
          isRetryable: entry.isRetryable,
          message: 'Upstream rejected the request',
          responseBody: JSON.stringify({
            error: entry.body,
            private: 'synthetic-private-rate-body',
          }),
          ...(entry.delivery === 'transport' ? {} : { responseHeaders: entry.headers }),
        },
      };
      if (entry.delivery === 'assistant') {
        const response = createMockPromptResponse([]);
        mockSessionPrompt.mockResolvedValueOnce({
          data: { ...response.data, info: { ...response.data.info, error } },
        });
      } else if (entry.delivery === 'transport') {
        mockSessionPrompt.mockResolvedValueOnce({
          error,
          response: new Response(null, {
            status: 429,
            headers: entry.headers as Record<string, string>,
          }),
        });
      } else {
        mockSessionPrompt.mockRejectedValueOnce(error);
      }
      const provider = new OpenCodeSDKProvider({ env: { ANTHROPIC_API_KEY: 'test-api-key' } });

      const result = await provider.callApi(`quota precedence ${entry.label}`);

      const scheduler = createProviderRateLimitOptions();
      expect(result.metadata?.rateLimitKind).toBe(entry.expected);
      expect(scheduler.isRateLimited?.(result, undefined)).toBe(entry.expected === 'rate_limit');
      if (entry.expected === 'quota') {
        expect(scheduler.getHeaders?.(result)).toBeUndefined();
        expect(scheduler.getRetryAfter?.(result, undefined)).toBeUndefined();
      } else if ('Retry-After' in entry.headers) {
        expect(scheduler.getRetryAfter?.(result, undefined)).toBe(2000);
      } else if ('X-RateLimit-Reset-Requests' in entry.headers) {
        expect(scheduler.getHeaders?.(result)).toEqual({ 'x-ratelimit-reset-requests': '30s' });
      }
      expect(JSON.stringify(result)).not.toContain('synthetic-private-rate-body');
    });

    it.each([
      {
        label: 'nested definitive credit balance',
        body: { error: { code: 'credit_balance_exhausted' } },
        status: 429,
        expected: 'quota',
      },
      {
        label: 'nested definitive billing with a gateway retry header',
        body: {
          error: { code: 'billing_hard_limit_reached', message: 'synthetic-private-gateway-body' },
        },
        status: 429,
        retryAfter: '2',
        expected: 'quota',
      },
      {
        label: 'top-level billing code with a misleading raw status',
        body: { code: 'credit_balance_exhausted', statusCode: 400 },
        status: 429,
        expected: 'quota',
      },
      {
        label: 'definitive type alongside an otherwise transient code',
        body: { error: { code: 'rate_limit_exceeded', type: 'billing_not_active' } },
        status: 429,
        retryAfter: '2',
        expected: 'quota',
      },
      {
        label: 'ambiguous quota with no recovery header',
        body: { error: { code: 'insufficient_quota' } },
        status: 429,
        expected: 'quota',
      },
      {
        label: 'ambiguous quota with a short recovery header',
        body: { error: { code: 'insufficient_quota' } },
        status: 429,
        retryAfter: '2',
        expected: 'rate_limit',
      },
      {
        label: 'ordinary throttle with an ambiguous type',
        body: { error: { code: 'rate_limit_exceeded', type: 'insufficient_quota' } },
        status: 429,
        retryAfter: '2',
        expected: 'rate_limit',
      },
      {
        label: 'unrelated request details containing a billing code',
        body: { request: { code: 'credit_balance_exhausted' } },
        status: 429,
        retryAfter: '2',
        expected: 'rate_limit',
      },
      {
        label: 'ordinary plaintext gateway throttling',
        body: 'Too many requests',
        status: 429,
        retryAfter: '2',
        expected: 'rate_limit',
      },
      {
        label: 'an untagged body cannot replace a non-429 HTTP status',
        body: { error: { code: 'credit_balance_exhausted' }, statusCode: 429 },
        status: 400,
        retryAfter: '2',
        expected: undefined,
      },
    ])('classifies untagged gateway errors from the installed SDK: $label', async (entry) => {
      const { createProviderRateLimitOptions } = await import(
        '../../src/scheduler/providerWrapper'
      );
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
      const gatewayFetch = vi.fn<typeof fetch>().mockImplementation(async () => {
        const headers = {
          authorization: 'synthetic-private-gateway-header',
          ...(entry.retryAfter ? { 'retry-after': entry.retryAfter } : {}),
        };
        return typeof entry.body === 'string'
          ? new Response(entry.body, { status: entry.status, headers })
          : Response.json(entry.body, { status: entry.status, headers });
      });
      const baseUrl = 'http://127.0.0.1:4086';
      const actualClient = createInstalledOpencodeClient({ baseUrl, fetch: gatewayFetch });
      const sdkPrompt = vi.spyOn(actualClient.session, 'prompt');
      mockCreateOpencodeClient.mockReturnValueOnce(actualClient);
      const provider = new OpenCodeSDKProvider({
        config: { baseUrl, session_id: 'gateway-session' },
      });

      const result = await provider.callApi(`gateway error ${entry.label}`);

      expect(gatewayFetch).toHaveBeenCalledTimes(1);
      expect(gatewayFetch.mock.calls[0][0]).toMatchObject({
        method: 'POST',
        url: `${baseUrl}/session/gateway-session/message`,
      });
      const sdkResult = await sdkPrompt.mock.results[0].value;
      expect(sdkResult.error).toEqual(entry.body);
      expect(sdkResult.response.status).toBe(entry.status);
      expect(result.error).toContain(`HTTP ${entry.status}`);
      if (entry.status !== 429) {
        expect(result.error).not.toContain('429');
      }
      expect(result.metadata?.rateLimitKind).toBe(entry.expected);
      const scheduler = createProviderRateLimitOptions();
      expect(scheduler.isRateLimited?.(result, undefined)).toBe(entry.expected === 'rate_limit');
      if (entry.expected === 'rate_limit' && entry.retryAfter) {
        expect(scheduler.getHeaders?.(result)).toEqual({ 'retry-after': entry.retryAfter });
        expect(scheduler.getRetryAfter?.(result, undefined)).toBe(2000);
      } else {
        expect(scheduler.getHeaders?.(result)).toBeUndefined();
        expect(scheduler.getRetryAfter?.(result, undefined)).toBeUndefined();
      }
      expect(result).not.toHaveProperty('raw');
      expect(JSON.stringify({ result, logs: errorSpy.mock.calls })).not.toContain(
        'synthetic-private-gateway',
      );
    });

    it('does not classify untagged billing details without a trusted HTTP 429', async () => {
      const { isProviderResponseRateLimited } = await import('../../src/scheduler/types');
      const body = { error: { code: 'credit_balance_exhausted' } };
      mockSessionPrompt.mockResolvedValueOnce({ error: body });
      const provider = new OpenCodeSDKProvider({
        config: { session_id: 'gateway-session' },
      });

      const result = await provider.callApi('untagged billing without HTTP status');

      expect(result.metadata?.rateLimitKind).toBeUndefined();
      expect(isProviderResponseRateLimited(result, undefined)).toBe(false);
    });

    it.each(['assistant', 'transport', 'throw'])(
      'forwards only scheduler timing headers from %s rate limits',
      async (delivery) => {
        const { parseRateLimitHeaders } = await import('../../src/scheduler/headerParser');
        const { createProviderRateLimitOptions } = await import(
          '../../src/scheduler/providerWrapper'
        );
        const { getProviderResponseHeaders } = await import('../../src/scheduler/types');
        const retryDate = new Date(Date.now() + 60_000).toUTCString();
        const resetTimestamp = new Date(Date.now() + 120_000).toISOString();
        const trusted = {
          'Retry-After': retryDate,
          'Retry-After-Ms': '1200',
          'X-RateLimit-Remaining-Requests': '0',
          'X-RateLimit-Limit-Requests': '100',
          'X-RateLimit-Reset-Requests': '1m30s',
          'X-RateLimit-Remaining-Tokens': '15',
          'X-RateLimit-Limit-Tokens': '2000',
          'X-RateLimit-Reset-Tokens': '2m',
          'Anthropic-RateLimit-Requests-Remaining': '20',
          'Anthropic-RateLimit-Requests-Limit': '300',
          'Anthropic-RateLimit-Requests-Reset': resetTimestamp,
          'Anthropic-RateLimit-Tokens-Remaining': '400',
          'Anthropic-RateLimit-Tokens-Limit': '5000',
          'Anthropic-RateLimit-Tokens-Reset': resetTimestamp,
          'RateLimit-Remaining': '2',
          'RateLimit-Limit': '10',
          'RateLimit-Reset': '60',
          'X-RateLimit-Remaining': '3',
          'X-RateLimit-Limit': '11',
          'X-RateLimit-Reset': '60.5',
        };
        const unsafe = {
          Authorization: 'Bearer synthetic-private-rate-authorization',
          'Set-Cookie': 'session=synthetic-private-rate-cookie',
          'X-Request-Id': 'synthetic-private-rate-id',
          'X-RateLimit-Custom': 'synthetic-private-rate-custom',
        };
        const error = {
          name: 'APIError',
          data: {
            statusCode: 429,
            isRetryable: true,
            message: 'Too many requests',
            ...(delivery === 'transport' ? {} : { responseHeaders: { ...trusted, ...unsafe } }),
          },
        };
        if (delivery === 'assistant') {
          const response = createMockPromptResponse([]);
          mockSessionPrompt.mockResolvedValueOnce({
            data: { ...response.data, info: { ...response.data.info, error } },
          });
        } else if (delivery === 'transport') {
          mockSessionPrompt.mockResolvedValueOnce({
            error,
            response: new Response(null, { status: 429, headers: { ...trusted, ...unsafe } }),
          });
        } else {
          mockSessionPrompt.mockRejectedValueOnce(error);
        }
        const provider = new OpenCodeSDKProvider({ env: { ANTHROPIC_API_KEY: 'test-api-key' } });

        const result = await provider.callApi(`scheduler headers from ${delivery}`);

        const expected = Object.fromEntries(
          Object.entries(trusted).map(([key, value]) => [key.toLowerCase(), value]),
        );
        expect(result.metadata).toEqual({ rateLimitKind: 'rate_limit', headers: expected });
        expect(getProviderResponseHeaders(result)).toEqual(expected);
        const scheduler = createProviderRateLimitOptions();
        expect(scheduler.isRateLimited?.(result, undefined)).toBe(true);
        expect(scheduler.getRetryAfter?.(result, undefined)).toBe(1200);
        expect(parseRateLimitHeaders(scheduler.getHeaders?.(result) ?? {})).toMatchObject({
          retryAfterMs: 1200,
          remainingRequests: 0,
          limitRequests: 100,
          remainingTokens: 15,
          limitTokens: 2000,
          resetAt: expect.any(Number),
        });
        expect(JSON.stringify(result)).not.toContain('synthetic-private-rate');
        expect(result).not.toHaveProperty('raw');
      },
    );

    it('keeps scheduler timestamps that contain a short configured credential', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-01-01T00:00:00.098Z'));
      vi.stubEnv('OPENCODE_TEST_PASSWORD', '098');
      try {
        const timestamp = new Date(Date.now() + 120_000).toISOString();
        mockSessionPrompt.mockResolvedValue({
          error: { name: 'APIError', data: { statusCode: 429, isRetryable: true } },
          response: new Response(null, {
            status: 429,
            headers: { 'Anthropic-Ratelimit-Requests-Reset': timestamp },
          }),
        });

        const result = await new OpenCodeSDKProvider().callApi('scheduler timestamps');

        expect(result.metadata?.headers).toEqual({
          'anthropic-ratelimit-requests-reset': timestamp,
        });
        const exactCredential = await new OpenCodeSDKProvider({
          config: { apiKey: timestamp },
        }).callApi('timestamp is the credential');
        expect(exactCredential.metadata?.headers).toBeUndefined();
      } finally {
        vi.unstubAllEnvs();
        vi.useRealTimers();
      }
    });

    it('prefers upstream timing and only forwards gateway timing on retryable transport failures', async () => {
      const { createProviderRateLimitOptions } = await import(
        '../../src/scheduler/providerWrapper'
      );
      mockSessionPrompt
        .mockResolvedValueOnce({
          error: {
            name: 'APIError',
            data: {
              statusCode: 429,
              isRetryable: true,
              message: 'Too many requests',
              responseHeaders: { 'Retry-After': '7' },
            },
          },
          response: new Response(null, {
            status: 429,
            headers: { 'Retry-After': '2', 'RateLimit-Remaining': '0' },
          }),
        })
        .mockResolvedValueOnce({
          error: { name: 'UnknownError', data: { message: 'Gateway throttle' } },
          response: new Response(null, { status: 429, headers: { 'Retry-After': '3' } }),
        })
        .mockResolvedValueOnce({
          error: { name: 'UnknownError', data: { message: 'Gateway unavailable' } },
          response: new Response(null, { status: 500, headers: { 'Retry-After': '4' } }),
        });
      const provider = new OpenCodeSDKProvider({ env: { ANTHROPIC_API_KEY: 'test-api-key' } });
      const scheduler = createProviderRateLimitOptions();

      const upstream = await provider.callApi('upstream timing');
      const gatewayThrottle = await provider.callApi('gateway timing');
      const gatewayFailure = await provider.callApi('gateway non-rate failure');

      expect(upstream.metadata?.headers).toEqual({
        'retry-after': '7',
        'ratelimit-remaining': '0',
      });
      expect(scheduler.getRetryAfter?.(upstream, undefined)).toBe(7000);
      expect(scheduler.isRateLimited?.(gatewayThrottle, undefined)).toBe(true);
      expect(scheduler.getRetryAfter?.(gatewayThrottle, undefined)).toBe(3000);
      expect(gatewayFailure).not.toHaveProperty('metadata');
      expect(scheduler.getRetryAfter?.(gatewayFailure, undefined)).toBeUndefined();
    });

    it('rejects secrets and malformed values even under scheduler timing header names', async () => {
      const { createProviderRateLimitOptions } = await import(
        '../../src/scheduler/providerWrapper'
      );
      const response = createMockPromptResponse([]);
      mockSessionPrompt.mockResolvedValueOnce({
        data: {
          ...response.data,
          info: {
            ...response.data.info,
            error: {
              name: 'APIError',
              data: {
                statusCode: 429,
                isRetryable: true,
                message: 'Too many requests',
                responseHeaders: {
                  'Retry-After': 'Bearer synthetic-private-header',
                  'Retry-After-Ms': '1200 synthetic-private-header',
                  'X-RateLimit-Remaining-Requests': '10synthetic-private-header',
                  'X-RateLimit-Limit-Tokens': '812345679012345',
                  'X-RateLimit-Reset-Tokens': 'synthetic-private-header',
                  'Anthropic-RateLimit-Tokens-Reset': '1s; synthetic-private-header',
                  'RateLimit-Reset': ['120', 'synthetic-private-header'],
                  'RateLimit-Limit': '40',
                },
              },
            },
          },
        },
      });
      const provider = new OpenCodeSDKProvider({
        env: { ANTHROPIC_API_KEY: '812345679012345' },
      });

      const result = await provider.callApi('unsafe timing headers');

      expect(result.metadata).toEqual({
        rateLimitKind: 'rate_limit',
        headers: { 'ratelimit-limit': '40' },
      });
      expect(createProviderRateLimitOptions().getRetryAfter?.(result, undefined)).toBeUndefined();
      expect(JSON.stringify(result)).not.toContain('synthetic-private-header');
      expect(JSON.stringify(result)).not.toContain('812345679012345');
    });
  });
});
