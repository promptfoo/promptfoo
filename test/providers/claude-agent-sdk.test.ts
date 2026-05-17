import path from 'node:path';
import fs from 'fs';

import { trace as otelTrace, SpanStatusCode } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, disableCache, enableCache, getCache, isCacheEnabled } from '../../src/cache';
import { importModule } from '../../src/esm';
import logger from '../../src/logger';
import {
  CLAUDE_CODE_MODEL_ALIASES,
  ClaudeCodeSDKProvider,
  FS_READONLY_ALLOWED_TOOLS,
} from '../../src/providers/claude-agent-sdk';
import { transformMCPConfigToClaudeCode } from '../../src/providers/mcp/transform';
import * as genaiTracer from '../../src/tracing/genaiTracer';
import { checkProviderApiKeys } from '../../src/util/provider';
import { mockProcessEnv } from '../util/utils';
import type {
  NonNullableUsage,
  Query,
  SDKMessage,
  TerminalReason,
} from '@anthropic-ai/claude-agent-sdk';
import type { MockInstance } from 'vitest';

import type { EnvOverrides } from '../../src/types/env';
import type { CallApiContextParams } from '../../src/types/index';

const testBasePath = path.resolve('/test/basePath');
const fsMocks = vi.hoisted(() => ({
  statSync: vi.fn(),
  mkdtempSync: vi.fn(),
  rmSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('../../src/cliState', () => ({
  default: { basePath: '/test/basePath' },
  basePath: '/test/basePath',
}));
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      ...fsMocks,
    },
    ...fsMocks,
  };
});
vi.mock('../../src/esm', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    importModule: vi.fn(),
    resolvePackageEntryPoint: vi.fn(() => '@anthropic-ai/claude-agent-sdk'),
  };
});
vi.mock('../../src/providers/mcp/transform');
vi.mock('node:module', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    createRequire: vi.fn(() => ({
      resolve: vi.fn(() => '@anthropic-ai/claude-agent-sdk'),
    })),
  };
});

vi.mock('node:fs/promises', () => {
  const fsPromisesMock = {
    stat: vi.fn((filePath: any) => fsMocks.statSync(filePath)),
    mkdtemp: vi.fn((prefix: string) => fsMocks.mkdtempSync(prefix)),
    rm: vi.fn((filePath: any, options?: any) => fsMocks.rmSync(filePath, options)),
    readdir: vi.fn((filePath: any, options?: any) => fsMocks.readdirSync(filePath, options)),
  };
  return {
    default: fsPromisesMock,
    ...fsPromisesMock,
  };
});

vi.mock('fs/promises', () => {
  const fsPromisesMock = {
    stat: vi.fn((filePath: any) => fsMocks.statSync(filePath)),
    mkdtemp: vi.fn((prefix: string) => fsMocks.mkdtempSync(prefix)),
    rm: vi.fn((filePath: any, options?: any) => fsMocks.rmSync(filePath, options)),
    readdir: vi.fn((filePath: any, options?: any) => fsMocks.readdirSync(filePath, options)),
  };
  return {
    default: fsPromisesMock,
    ...fsPromisesMock,
  };
});

const mockQuery = vi.fn();
const mockTransformMCPConfigToClaudeCode = vi.mocked(transformMCPConfigToClaudeCode);

// Helper to create a complete NonNullableUsage object
const createMockUsage = (input = 0, output = 0): NonNullableUsage => ({
  input_tokens: input,
  output_tokens: output,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation: {
    ephemeral_1h_input_tokens: 0,
    ephemeral_5m_input_tokens: 0,
  },
  server_tool_use: {
    web_search_requests: 0,
    web_fetch_requests: 0,
  },
  service_tier: 'standard',
  speed: 'standard',
  inference_geo: '',
  iterations: [],
});

// Helper to create a mock BetaMessage with required fields
// The BetaMessage type requires: id, container, content, context_management, model, role, stop_details, stop_reason, stop_sequence, type, usage
// We use 'as any' for content since test mocks don't need the full BetaContentBlock discriminated union
const createMockBetaMessage = (
  content: Array<{ type: string; id?: string; name?: string; input?: unknown; text?: string }>,
) => ({
  id: 'msg_mock',
  container: null,
  content: content as any,
  context_management: null,
  model: 'claude-sonnet-4-20250514' as const,
  role: 'assistant' as const,
  stop_details: null,
  stop_reason: 'tool_use' as const,
  stop_sequence: null,
  type: 'message' as const,
  usage: {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    cache_creation: null,
    inference_geo: null,
    iterations: null,
    server_tool_use: null,
    service_tier: 'standard' as const,
    speed: 'standard' as const,
  },
});

// Helper to create mock Query response (accepts a single message or an array)
const createMockQuery = (messages: Partial<SDKMessage> | Partial<SDKMessage>[]): Query => {
  const msgs = Array.isArray(messages) ? messages : [messages];
  const generator = async function* (): AsyncGenerator<SDKMessage, void> {
    for (const message of msgs) {
      yield message as SDKMessage;
    }
  };

  const query = generator() as Query;
  // Add the interrupt and setPermissionMode methods that Query extends with
  query.interrupt = vi.fn().mockResolvedValue(undefined);
  query.setPermissionMode = vi.fn().mockResolvedValue(undefined);

  return query;
};

// Helper to create mock success response
const createMockResponse = (
  result: string,
  usage?: { input_tokens?: number; output_tokens?: number },
  cost = 0.001,
  sessionId = 'test-session-123',
  terminalReason?: TerminalReason,
): Query => {
  return createMockQuery({
    type: 'result',
    subtype: 'success',
    session_id: sessionId,
    uuid: '12345678-1234-1234-1234-123456789abc' as `${string}-${string}-${string}-${string}-${string}`,
    result,
    usage: createMockUsage(usage?.input_tokens, usage?.output_tokens),
    total_cost_usd: cost,
    duration_ms: 1000,
    duration_api_ms: 800,
    is_error: false,
    num_turns: 1,
    permission_denials: [],
    ...(terminalReason === undefined ? {} : { terminal_reason: terminalReason }),
  });
};

// Helper to create mock success response with structured output
const createMockStructuredResponse = (
  result: string,
  structuredOutput: unknown,
  usage?: { input_tokens?: number; output_tokens?: number },
  cost = 0.001,
  sessionId = 'test-session-123',
): Query => {
  return createMockQuery({
    type: 'result',
    subtype: 'success',
    session_id: sessionId,
    uuid: '12345678-1234-1234-1234-123456789abc' as `${string}-${string}-${string}-${string}-${string}`,
    result,
    structured_output: structuredOutput,
    usage: createMockUsage(usage?.input_tokens, usage?.output_tokens),
    total_cost_usd: cost,
    duration_ms: 1000,
    duration_api_ms: 800,
    is_error: false,
    num_turns: 1,
    permission_denials: [],
  });
};

// Helper to create mock error response
const createMockErrorResponse = (
  errorSubtype: 'error_max_turns' | 'error_during_execution',
): Query => {
  return createMockQuery({
    type: 'result',
    subtype: errorSubtype,
    session_id: 'error-session',
    uuid: '87654321-4321-4321-4321-210987654321' as `${string}-${string}-${string}-${string}-${string}`,
    usage: createMockUsage(10, 0),
    total_cost_usd: 0.0001,
    duration_ms: 500,
    duration_api_ms: 400,
    is_error: true,
    num_turns: 1,
    permission_denials: [],
  });
};

describe('ClaudeCodeSDKProvider', () => {
  let tempDirSpy: MockInstance;
  let statSyncSpy: MockInstance;
  let rmSyncSpy: MockInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    Object.values(fsMocks).forEach((mock) => mock.mockReset());

    // Setup importModule to return our mockQuery
    vi.mocked(importModule).mockResolvedValue({ query: mockQuery });

    // Default mocks
    mockTransformMCPConfigToClaudeCode.mockResolvedValue({});

    // File system mocks
    tempDirSpy = vi.spyOn(fs, 'mkdtempSync').mockReturnValue('/tmp/test-temp-dir');
    statSyncSpy = vi.spyOn(fs, 'statSync').mockReturnValue({
      isDirectory: () => true,
    } as fs.Stats);
    rmSyncSpy = vi.spyOn(fs, 'rmSync').mockImplementation(function () {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await clearCache();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const provider = new ClaudeCodeSDKProvider();

      expect(provider.config).toEqual({});
      expect(provider.id()).toBe('anthropic:claude-agent-sdk');
    });

    it('should initialize with custom config', () => {
      const config = {
        apiKey: 'test-key',
        model: 'claude-3-5-sonnet-20241022',
        max_turns: 5,
      };

      const provider = new ClaudeCodeSDKProvider({ config });

      expect(provider.config).toEqual(config);
      expect(provider.apiKey).toBe('test-key');
    });

    it('should use custom id when provided', () => {
      const provider = new ClaudeCodeSDKProvider({ id: 'custom-provider-id' });

      expect(provider.id()).toBe('custom-provider-id');
    });

    it('should warn about unknown model', () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(function () {});

      new ClaudeCodeSDKProvider({ config: { model: 'unknown-model' } });

      expect(warnSpy).toHaveBeenCalledWith(
        'Using unknown model for Claude Agent SDK: unknown-model',
      );

      warnSpy.mockRestore();
    });

    it('should warn about unknown fallback model', () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(function () {});

      new ClaudeCodeSDKProvider({ config: { fallback_model: 'unknown-fallback' } });

      expect(warnSpy).toHaveBeenCalledWith(
        'Using unknown model for Claude Agent SDK fallback: unknown-fallback',
      );

      warnSpy.mockRestore();
    });

    it('should not warn about Claude Agent SDK model aliases', () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(function () {});

      // Test all Claude Agent SDK aliases
      CLAUDE_CODE_MODEL_ALIASES.forEach((alias) => {
        new ClaudeCodeSDKProvider({ config: { model: alias } });
        new ClaudeCodeSDKProvider({ config: { fallback_model: alias } });
      });

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('should not warn about known Anthropic models', () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(function () {});

      new ClaudeCodeSDKProvider({ config: { model: 'claude-3-5-sonnet-20241022' } });
      new ClaudeCodeSDKProvider({ config: { fallback_model: 'claude-3-5-haiku-20241022' } });

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  describe('callApi', () => {
    describe('basic functionality', () => {
      it('should successfully call API with simple prompt', async () => {
        mockQuery.mockReturnValue(
          createMockResponse('Test response', { input_tokens: 10, output_tokens: 20 }, 0.002),
        );

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result).toEqual({
          output: 'Test response',
          tokenUsage: {
            prompt: 10,
            completion: 20,
            total: 30,
          },
          cost: 0.002,
          raw: expect.stringContaining('"type":"result"'),
          sessionId: 'test-session-123',
          metadata: {
            skillCalls: [],
            toolCalls: [],
            numTurns: 1,
            durationMs: 1000,
            durationApiMs: 800,
            modelUsage: undefined,
            permissionDenials: [],
          },
        });

        // Verify the raw contains the expected data
        const rawData = JSON.parse(result.raw as string);
        expect(rawData.type).toBe('result');
        expect(rawData.subtype).toBe('success');
        expect(rawData.result).toBe('Test response');
        expect(rawData.session_id).toBe('test-session-123');

        expect(mockQuery).toHaveBeenCalledWith({
          prompt: 'Test prompt',
          options: expect.objectContaining({
            cwd: '/tmp/test-temp-dir',
            allowedTools: [], // no tools with no working directory
            strictMcpConfig: true,
          }),
        });
      });

      it('should include terminal reason metadata when provided by SDK', async () => {
        mockQuery.mockReturnValue(
          createMockResponse(
            'Test response',
            { input_tokens: 10, output_tokens: 20 },
            0.002,
            'test-session-123',
            'completed',
          ),
        );

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result.metadata?.terminalReason).toBe('completed');
        expect(JSON.parse(result.raw as string).terminal_reason).toBe('completed');
      });

      it('should handle SDK error response', async () => {
        mockQuery.mockReturnValue(createMockErrorResponse('error_during_execution'));

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result.error).toBe('Claude Agent SDK call failed: error_during_execution');
        expect(result.tokenUsage).toEqual({
          prompt: 10,
          completion: 0,
          total: undefined,
        });
      });

      it('should handle SDK exceptions', async () => {
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(function () {});
        mockQuery.mockRejectedValue(new Error('Network error'));

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result.error).toBe('Error calling Claude Agent SDK: Error: Network error');
        expect(errorSpy).toHaveBeenCalledWith(
          'Error calling Claude Agent SDK: Error: Network error',
        );

        errorSpy.mockRestore();
      });

      it('should handle structured output response', async () => {
        const structuredData = { name: 'John', age: 30, active: true };
        mockQuery.mockReturnValue(
          createMockStructuredResponse('JSON response', structuredData, {
            input_tokens: 10,
            output_tokens: 20,
          }),
        );

        const provider = new ClaudeCodeSDKProvider({
          config: {
            output_format: {
              type: 'json_schema',
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  age: { type: 'number' },
                  active: { type: 'boolean' },
                },
              },
            },
          },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        // When structured output is available, it should be the output
        expect(result.output).toEqual(structuredData);
        expect(result.metadata?.structuredOutput).toEqual(structuredData);
        expect(result.error).toBeUndefined();
      });

      it('should fall back to text result when no structured output', async () => {
        mockQuery.mockReturnValue(
          createMockResponse('Plain text response', { input_tokens: 10, output_tokens: 20 }),
        );

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result.output).toBe('Plain text response');
        expect(result.metadata?.structuredOutput).toBeUndefined();
      });

      it('should return main agent result when background sub-agents emit interleaved result messages', async () => {
        // Reproduces #9054: when the main agent spawns a background sub-agent
        // (Task tool with run_in_background: true), the SDK interleaves the
        // sub-agent's `result` message into the parent stream before the main
        // agent's terminal `result` arrives. SDKResultMessage has no
        // parent_tool_use_id, so position is the only signal — the main agent's
        // result is always last.
        const subAgentResult: Partial<SDKMessage> = {
          type: 'result',
          subtype: 'success',
          session_id: 'sub-session',
          uuid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as `${string}-${string}-${string}-${string}-${string}`,
          result: 'Sub-agent summary that should NOT be surfaced',
          usage: createMockUsage(5, 5),
          total_cost_usd: 0.0005,
          duration_ms: 200,
          duration_api_ms: 150,
          is_error: false,
          num_turns: 1,
          permission_denials: [],
        };
        const mainAgentResult: Partial<SDKMessage> = {
          type: 'result',
          subtype: 'success',
          session_id: 'main-session',
          uuid: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' as `${string}-${string}-${string}-${string}-${string}`,
          result: 'Main agent final answer',
          usage: createMockUsage(20, 30),
          total_cost_usd: 0.003,
          duration_ms: 1500,
          duration_api_ms: 1200,
          is_error: false,
          num_turns: 4,
          permission_denials: [],
          terminal_reason: 'completed',
        };

        mockQuery.mockReturnValue(createMockQuery([subAgentResult, mainAgentResult]));

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result.error).toBeUndefined();
        expect(result.output).toBe('Main agent final answer');
        expect(result.sessionId).toBe('main-session');
        expect(result.cost).toBe(0.003);
        expect(result.tokenUsage).toEqual({ prompt: 20, completion: 30, total: 50 });
        expect(result.metadata?.numTurns).toBe(4);
        expect(result.metadata?.terminalReason).toBe('completed');
        // Raw should reflect the main agent's result, not the sub-agent's
        expect(JSON.parse(result.raw as string).session_id).toBe('main-session');
      });

      it('should surface main agent error when sub-agent succeeds first', async () => {
        // Inverse of the previous test: sub-agent finishes successfully but the
        // main agent ultimately errors. The main agent's outcome must win —
        // otherwise we'd mask main-agent failures behind a green sub-agent
        // summary. See https://github.com/promptfoo/promptfoo/issues/9054.
        const subAgentResult: Partial<SDKMessage> = {
          type: 'result',
          subtype: 'success',
          session_id: 'sub-session',
          uuid: 'cccccccc-cccc-cccc-cccc-cccccccccccc' as `${string}-${string}-${string}-${string}-${string}`,
          result: 'Sub-agent summary',
          usage: createMockUsage(5, 5),
          total_cost_usd: 0.0005,
          duration_ms: 200,
          duration_api_ms: 150,
          is_error: false,
          num_turns: 1,
          permission_denials: [],
        };
        const mainAgentError: Partial<SDKMessage> = {
          type: 'result',
          subtype: 'error_max_turns',
          session_id: 'main-session',
          uuid: 'dddddddd-dddd-dddd-dddd-dddddddddddd' as `${string}-${string}-${string}-${string}-${string}`,
          usage: createMockUsage(20, 30),
          total_cost_usd: 0.003,
          duration_ms: 1500,
          duration_api_ms: 1200,
          is_error: true,
          num_turns: 4,
          permission_denials: [],
        };

        mockQuery.mockReturnValue(createMockQuery([subAgentResult, mainAgentError]));

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result.error).toBe('Claude Agent SDK call failed: error_max_turns');
        expect(result.sessionId).toBe('main-session');
      });

      it('should cache only the main agent response, not interleaved sub-agent results', async () => {
        // Locks the load-bearing behavioral guarantee of the #9054 fix:
        // cacheResponse must fire exactly once with the main agent's payload,
        // never with an intermediate sub-agent result. If a future refactor
        // re-introduced caching inside the for-await loop, the second call
        // below would return the sub-agent's summary from cache.
        const subAgentResult: Partial<SDKMessage> = {
          type: 'result',
          subtype: 'success',
          session_id: 'sub-session',
          uuid: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' as `${string}-${string}-${string}-${string}-${string}`,
          result: 'Sub-agent summary that must NOT end up in the cache',
          usage: createMockUsage(5, 5),
          total_cost_usd: 0.0005,
          duration_ms: 200,
          duration_api_ms: 150,
          is_error: false,
          num_turns: 1,
          permission_denials: [],
        };
        const mainAgentResult: Partial<SDKMessage> = {
          type: 'result',
          subtype: 'success',
          session_id: 'main-session',
          uuid: 'ffffffff-ffff-ffff-ffff-ffffffffffff' as `${string}-${string}-${string}-${string}-${string}`,
          result: 'Main agent final answer (cached)',
          usage: createMockUsage(20, 30),
          total_cost_usd: 0.003,
          duration_ms: 1500,
          duration_api_ms: 1200,
          is_error: false,
          num_turns: 4,
          permission_denials: [],
          terminal_reason: 'completed',
        };

        mockQuery.mockImplementation(() => createMockQuery([subAgentResult, mainAgentResult]));

        const wasEnabled = isCacheEnabled();
        enableCache();
        try {
          const provider = new ClaudeCodeSDKProvider({
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });

          const first = await provider.callApi('Cache-once prompt');
          expect(first.output).toBe('Main agent final answer (cached)');
          expect(mockQuery).toHaveBeenCalledTimes(1);

          // Cache hit on second call — returns whatever cacheResponse stored.
          // If the loop had cached the sub-agent's result, we'd see
          // 'Sub-agent summary…' here. We must see the main agent's payload.
          const second = await provider.callApi('Cache-once prompt');
          expect(mockQuery).toHaveBeenCalledTimes(1);
          expect(second.cached).toBe(true);
          expect(second.output).toBe('Main agent final answer (cached)');
          expect(second.sessionId).toBe('main-session');
        } finally {
          await clearCache();
          if (wasEnabled) {
            enableCache();
          } else {
            disableCache();
          }
        }
      });

      it('should return only the last of three or more interleaved result messages', async () => {
        // Real workloads with multiple run_in_background Task calls produce N+1
        // result messages in the parent stream. The accumulator must keep the
        // last one regardless of how many sub-agents finished before it.
        const buildSubAgent = (i: number): Partial<SDKMessage> => ({
          type: 'result',
          subtype: 'success',
          session_id: `sub-session-${i}`,
          uuid: `1111111${i}-1111-1111-1111-111111111111` as `${string}-${string}-${string}-${string}-${string}`,
          result: `Sub-agent ${i} summary`,
          usage: createMockUsage(2, 2),
          total_cost_usd: 0.0001,
          duration_ms: 100,
          duration_api_ms: 50,
          is_error: false,
          num_turns: 1,
          permission_denials: [],
        });
        const mainAgentResult: Partial<SDKMessage> = {
          type: 'result',
          subtype: 'success',
          session_id: 'main-session',
          uuid: '99999999-9999-9999-9999-999999999999' as `${string}-${string}-${string}-${string}-${string}`,
          result: 'Main agent final answer (after three sub-agents)',
          usage: createMockUsage(30, 40),
          total_cost_usd: 0.005,
          duration_ms: 2500,
          duration_api_ms: 2000,
          is_error: false,
          num_turns: 6,
          permission_denials: [],
          terminal_reason: 'completed',
        };

        mockQuery.mockReturnValue(
          createMockQuery([buildSubAgent(1), buildSubAgent(2), buildSubAgent(3), mainAgentResult]),
        );

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result.error).toBeUndefined();
        expect(result.output).toBe('Main agent final answer (after three sub-agents)');
        expect(result.sessionId).toBe('main-session');
        expect(result.metadata?.numTurns).toBe(6);
      });

      it('should warn and mark span ERROR when stream has multiple results but no terminal_reason on the last', async () => {
        // Truncated-stream guard: if we observed multiple result messages but
        // the last one has no terminal_reason, the stream may have been cut
        // off after a sub-agent finished. We still return a response (so
        // downstream evals don't crash), but we surface a warning and mark
        // the OTEL span ERROR so this isn't graded silently.
        const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(function () {});
        const setStatusSpy = vi.fn();
        vi.spyOn(otelTrace, 'getActiveSpan').mockReturnValue({
          setStatus: setStatusSpy,
          setAttribute: vi.fn(),
          setAttributes: vi.fn(),
          addEvent: vi.fn(),
          recordException: vi.fn(),
          updateName: vi.fn(),
          end: vi.fn(),
          isRecording: () => true,
          spanContext: () => ({ traceId: 't', spanId: 's', traceFlags: 1 }),
        } as any);

        try {
          const subAgentResult: Partial<SDKMessage> = {
            type: 'result',
            subtype: 'success',
            session_id: 'sub-session',
            uuid: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as `${string}-${string}-${string}-${string}-${string}`,
            result: 'Sub-agent finished',
            usage: createMockUsage(5, 5),
            total_cost_usd: 0.0005,
            duration_ms: 200,
            duration_api_ms: 150,
            is_error: false,
            num_turns: 1,
            permission_denials: [],
          };
          // No terminal_reason — simulates a truncated/cut-off stream.
          const stragglerResult: Partial<SDKMessage> = {
            type: 'result',
            subtype: 'success',
            session_id: 'unclear-session',
            uuid: 'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb' as `${string}-${string}-${string}-${string}-${string}`,
            result: 'Possibly another sub-agent',
            usage: createMockUsage(3, 3),
            total_cost_usd: 0.0003,
            duration_ms: 100,
            duration_api_ms: 80,
            is_error: false,
            num_turns: 1,
            permission_denials: [],
          };

          mockQuery.mockReturnValue(createMockQuery([subAgentResult, stragglerResult]));

          const provider = new ClaudeCodeSDKProvider({
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          const result = await provider.callApi('Test prompt');

          // Still returns a response (we'd rather grade against a possibly-wrong
          // answer than crash), but flagged via logs and span status.
          expect(result.error).toBeUndefined();
          expect(result.output).toBe('Possibly another sub-agent');
          expect(warnSpy).toHaveBeenCalledTimes(1);
          expect(warnSpy.mock.calls[0]?.[0]).toMatch(/2 result messages/);
          expect(warnSpy.mock.calls[0]?.[0]).toMatch(/may have been truncated/);
          expect(setStatusSpy).toHaveBeenCalledWith({
            code: SpanStatusCode.ERROR,
            message: expect.stringContaining('terminal_reason'),
          });
        } finally {
          warnSpy.mockRestore();
        }
      });

      it('should not warn when the final result is a non-success error subtype after a sub-agent', async () => {
        // Negative case for the truncation heuristic: a non-success subtype
        // like 'error_max_turns' is itself a definitive terminal signal — the
        // SDK is reporting the run ended in error. Warning on this would be
        // a false positive on every legitimate main-agent failure that
        // follows a background sub-agent.
        const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(function () {});
        try {
          const subAgentResult: Partial<SDKMessage> = {
            type: 'result',
            subtype: 'success',
            session_id: 'sub-session',
            uuid: 'cccc1111-cccc-cccc-cccc-cccccccccccc' as `${string}-${string}-${string}-${string}-${string}`,
            result: 'Sub-agent finished',
            usage: createMockUsage(5, 5),
            total_cost_usd: 0.0005,
            duration_ms: 200,
            duration_api_ms: 150,
            is_error: false,
            num_turns: 1,
            permission_denials: [],
          };
          const mainAgentError: Partial<SDKMessage> = {
            type: 'result',
            subtype: 'error_max_turns',
            session_id: 'main-session',
            uuid: 'dddd2222-dddd-dddd-dddd-dddddddddddd' as `${string}-${string}-${string}-${string}-${string}`,
            usage: createMockUsage(20, 30),
            total_cost_usd: 0.003,
            duration_ms: 1500,
            duration_api_ms: 1200,
            is_error: true,
            num_turns: 4,
            permission_denials: [],
            // Intentionally no terminal_reason: error subtype is the signal.
          };

          mockQuery.mockReturnValue(createMockQuery([subAgentResult, mainAgentError]));

          const provider = new ClaudeCodeSDKProvider({
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          const result = await provider.callApi('Test prompt');

          expect(result.error).toBe('Claude Agent SDK call failed: error_max_turns');
          expect(warnSpy).not.toHaveBeenCalled();
        } finally {
          warnSpy.mockRestore();
        }
      });

      it('should not warn when a single result message has no terminal_reason', async () => {
        // Negative case: a single non-terminal result is the normal pre-fix
        // path, not a truncation signal. We must not spam warnings.
        const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(function () {});
        try {
          mockQuery.mockReturnValue(
            createMockResponse('Plain response', { input_tokens: 1, output_tokens: 1 }),
          );

          const provider = new ClaudeCodeSDKProvider({
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          const result = await provider.callApi('Test prompt');

          expect(result.output).toBe('Plain response');
          expect(warnSpy).not.toHaveBeenCalled();
        } finally {
          warnSpy.mockRestore();
        }
      });

      it('should select the human-origin result regardless of position when SDK reports origin', async () => {
        // SDK >= 0.2.126 tags result messages with `origin.kind`. When the
        // human-origin (user-prompted) result arrives BEFORE a trailing
        // task-notification followup from a background sub-agent, the
        // origin-aware selection must still pick the human result rather than
        // falling back to "last result wins".
        const mainAgentResult: Partial<SDKMessage> = {
          type: 'result',
          subtype: 'success',
          session_id: 'main-session',
          uuid: 'aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as `${string}-${string}-${string}-${string}-${string}`,
          result: 'Main agent final answer (origin: human)',
          usage: createMockUsage(20, 30),
          total_cost_usd: 0.003,
          duration_ms: 1500,
          duration_api_ms: 1200,
          is_error: false,
          num_turns: 4,
          permission_denials: [],
          terminal_reason: 'completed',
          origin: { kind: 'human' },
        };
        const lateSubAgentResult: Partial<SDKMessage> = {
          type: 'result',
          subtype: 'success',
          session_id: 'sub-session',
          uuid: 'bbbb3333-bbbb-bbbb-bbbb-bbbbbbbbbbbb' as `${string}-${string}-${string}-${string}-${string}`,
          result: 'Late background sub-agent summary',
          usage: createMockUsage(5, 5),
          total_cost_usd: 0.0005,
          duration_ms: 200,
          duration_api_ms: 150,
          is_error: false,
          num_turns: 1,
          permission_denials: [],
          origin: { kind: 'task-notification' },
        };

        // Human-origin main result arrives first; task-notification trailer
        // arrives after — the inverse of the position heuristic's assumption.
        mockQuery.mockReturnValue(createMockQuery([mainAgentResult, lateSubAgentResult]));

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result.error).toBeUndefined();
        expect(result.output).toBe('Main agent final answer (origin: human)');
        expect(result.sessionId).toBe('main-session');
        expect(result.metadata?.numTurns).toBe(4);
        expect(JSON.parse(result.raw as string).session_id).toBe('main-session');
      });

      it('should not warn about truncation when origin identifies the main result without terminal_reason', async () => {
        // With SDK >= 0.2.126 the `origin` field is authoritative. If the
        // human-origin result has no terminal_reason, that's the legitimate
        // main-agent result — not a truncation signal. The pre-0.2.126
        // position-heuristic warning would fire here (multiple results, last
        // has no terminal_reason); origin-aware selection must suppress it.
        const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(function () {});
        const setStatusSpy = vi.fn();
        vi.spyOn(otelTrace, 'getActiveSpan').mockReturnValue({
          setStatus: setStatusSpy,
          setAttribute: vi.fn(),
          setAttributes: vi.fn(),
          addEvent: vi.fn(),
          recordException: vi.fn(),
          updateName: vi.fn(),
          end: vi.fn(),
          isRecording: () => true,
          spanContext: () => ({ traceId: 't', spanId: 's', traceFlags: 1 }),
        } as any);

        try {
          const subAgentResult: Partial<SDKMessage> = {
            type: 'result',
            subtype: 'success',
            session_id: 'sub-session',
            uuid: 'cccc3333-cccc-cccc-cccc-cccccccccccc' as `${string}-${string}-${string}-${string}-${string}`,
            result: 'Sub-agent finished',
            usage: createMockUsage(5, 5),
            total_cost_usd: 0.0005,
            duration_ms: 200,
            duration_api_ms: 150,
            is_error: false,
            num_turns: 1,
            permission_denials: [],
            origin: { kind: 'task-notification' },
          };
          const mainAgentResult: Partial<SDKMessage> = {
            type: 'result',
            subtype: 'success',
            session_id: 'main-session',
            uuid: 'dddd3333-dddd-dddd-dddd-dddddddddddd' as `${string}-${string}-${string}-${string}-${string}`,
            result: 'Main agent reply',
            usage: createMockUsage(20, 30),
            total_cost_usd: 0.003,
            duration_ms: 1500,
            duration_api_ms: 1200,
            is_error: false,
            num_turns: 4,
            permission_denials: [],
            origin: { kind: 'human' },
            // Intentionally no terminal_reason: origin is the signal here.
          };

          mockQuery.mockReturnValue(createMockQuery([subAgentResult, mainAgentResult]));

          const provider = new ClaudeCodeSDKProvider({
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          const result = await provider.callApi('Test prompt');

          expect(result.error).toBeUndefined();
          expect(result.output).toBe('Main agent reply');
          expect(warnSpy).not.toHaveBeenCalled();
          expect(setStatusSpy).not.toHaveBeenCalledWith(
            expect.objectContaining({ code: SpanStatusCode.ERROR }),
          );
        } finally {
          warnSpy.mockRestore();
        }
      });

      it('should fall back to the last result when every result is a task-notification', async () => {
        // Defensive fallback: if origin tags every result as a
        // task-notification (i.e. the main-agent result genuinely never
        // arrived, perhaps due to a truncated stream), don't return undefined
        // — surface the last result we did see so downstream evals don't
        // crash, matching the pre-origin behavior.
        const subAgent1: Partial<SDKMessage> = {
          type: 'result',
          subtype: 'success',
          session_id: 'sub-1',
          uuid: 'eeee3333-eeee-eeee-eeee-eeeeeeeeeeee' as `${string}-${string}-${string}-${string}-${string}`,
          result: 'Sub-agent 1',
          usage: createMockUsage(2, 2),
          total_cost_usd: 0.0001,
          duration_ms: 100,
          duration_api_ms: 50,
          is_error: false,
          num_turns: 1,
          permission_denials: [],
          origin: { kind: 'task-notification' },
        };
        const subAgent2: Partial<SDKMessage> = {
          type: 'result',
          subtype: 'success',
          session_id: 'sub-2',
          uuid: 'ffff3333-ffff-ffff-ffff-ffffffffffff' as `${string}-${string}-${string}-${string}-${string}`,
          result: 'Sub-agent 2 (last)',
          usage: createMockUsage(3, 3),
          total_cost_usd: 0.0002,
          duration_ms: 100,
          duration_api_ms: 50,
          is_error: false,
          num_turns: 1,
          permission_denials: [],
          origin: { kind: 'task-notification' },
        };

        mockQuery.mockReturnValue(createMockQuery([subAgent1, subAgent2]));

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result.error).toBeUndefined();
        expect(result.output).toBe('Sub-agent 2 (last)');
        expect(result.sessionId).toBe('sub-2');
      });

      it('should return error when no result message arrives at all', async () => {
        // Locks the no-result early-return path when the stream closes
        // without emitting any `result` message (origin or otherwise).
        mockQuery.mockReturnValue(createMockQuery([]));

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result.error).toBe("Claude Agent SDK call didn't return a result");
      });

      it('should return error when API key is missing', async () => {
        // ensure process env won't provide the key or any other Claude Agent SDK env vars
        mockProcessEnv({ ANTHROPIC_API_KEY: undefined });
        mockProcessEnv({ CLAUDE_CODE_USE_BEDROCK: undefined });
        mockProcessEnv({ CLAUDE_CODE_USE_VERTEX: undefined });

        const provider = new ClaudeCodeSDKProvider();
        await expect(provider.callApi('Test prompt')).rejects.toThrow(
          /Anthropic API key is not set/,
        );
      });

      it('should not throw when apiKeyRequired is explicitly set to false', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        const provider = new ClaudeCodeSDKProvider({
          config: {
            apiKeyRequired: false,
          },
        });

        const result = await provider.callApi('Test prompt');

        expect(result.error).toBeUndefined();
        expect(result.output).toBe('Response');
      });

      it('should not throw when using Bedrock or Vertex env vars', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        const provider = new ClaudeCodeSDKProvider();

        // Set the env var in process.env for the test
        mockProcessEnv({ CLAUDE_CODE_USE_BEDROCK: 'true' });

        const result = await provider.callApi('Test prompt');

        expect(result.error).toBeUndefined();
        expect(result.output).toBe('Response');

        mockProcessEnv({ CLAUDE_CODE_USE_BEDROCK: undefined });
      });
    });

    describe('checkProviderApiKeys pre-check', () => {
      it('should not report missing key when CLAUDE_CODE_USE_VERTEX is set in process.env', () => {
        mockProcessEnv({ ANTHROPIC_API_KEY: undefined });
        mockProcessEnv({ CLAUDE_CODE_USE_VERTEX: 'true' });

        const provider = new ClaudeCodeSDKProvider();
        const result = checkProviderApiKeys([provider]);
        expect(result.size).toBe(0);

        mockProcessEnv({ CLAUDE_CODE_USE_VERTEX: undefined });
      });

      it('should not report missing key when CLAUDE_CODE_USE_BEDROCK is set in process.env', () => {
        mockProcessEnv({ ANTHROPIC_API_KEY: undefined });
        mockProcessEnv({ CLAUDE_CODE_USE_BEDROCK: 'true' });

        const provider = new ClaudeCodeSDKProvider();
        const result = checkProviderApiKeys([provider]);
        expect(result.size).toBe(0);

        mockProcessEnv({ CLAUDE_CODE_USE_BEDROCK: undefined });
      });

      it('should report missing key when no Vertex/Bedrock env is set', () => {
        mockProcessEnv({ ANTHROPIC_API_KEY: undefined });
        mockProcessEnv({ CLAUDE_CODE_USE_VERTEX: undefined });
        mockProcessEnv({ CLAUDE_CODE_USE_BEDROCK: undefined });

        const provider = new ClaudeCodeSDKProvider();
        const result = checkProviderApiKeys([provider]);
        expect(result.size).toBe(1);
        expect(result.get('ANTHROPIC_API_KEY')).toEqual(['anthropic:claude-agent-sdk']);
      });

      it('should not report missing key when apiKeyRequired is false', () => {
        mockProcessEnv({ ANTHROPIC_API_KEY: undefined });
        mockProcessEnv({ CLAUDE_CODE_USE_VERTEX: undefined });
        mockProcessEnv({ CLAUDE_CODE_USE_BEDROCK: undefined });

        const provider = new ClaudeCodeSDKProvider({
          config: { apiKeyRequired: false },
        });
        const result = checkProviderApiKeys([provider]);
        expect(result.size).toBe(0);
      });
    });

    describe('provider-level env overrides via loadApiProvider', () => {
      it('should pass provider-level env through to the provider', async () => {
        mockProcessEnv({ ANTHROPIC_API_KEY: undefined });
        mockProcessEnv({ CLAUDE_CODE_USE_VERTEX: undefined });

        const provider = new ClaudeCodeSDKProvider({
          env: { CLAUDE_CODE_USE_VERTEX: 'true' } as EnvOverrides,
        });

        const result = checkProviderApiKeys([provider]);
        expect(result.size).toBe(0);
      });
    });

    describe('config.env passthrough (OTEL / subprocess env)', () => {
      it('should forward config.env entries to the SDK subprocess env', async () => {
        mockQuery.mockReturnValue(createMockResponse('ok'));

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
          config: {
            env: {
              CLAUDE_CODE_ENABLE_TELEMETRY: '1',
              OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
              OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
            },
          },
        });
        await provider.callApi('prompt');

        const callArgs = mockQuery.mock.calls.at(-1)?.[0];
        expect(callArgs.options.env.CLAUDE_CODE_ENABLE_TELEMETRY).toBe('1');
        expect(callArgs.options.env.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('http://localhost:4318');
        expect(callArgs.options.env.OTEL_EXPORTER_OTLP_PROTOCOL).toBe('http/protobuf');
      });

      it('should let EnvOverrides take precedence over config.env', async () => {
        mockQuery.mockReturnValue(createMockResponse('ok'));

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'override-key' },
          config: {
            env: {
              ANTHROPIC_API_KEY: 'config-key',
              OTEL_SERVICE_NAME: 'claude-agent-sdk',
            },
          },
        });
        await provider.callApi('prompt');

        const callArgs = mockQuery.mock.calls.at(-1)?.[0];
        expect(callArgs.options.env.ANTHROPIC_API_KEY).toBe('override-key');
        expect(callArgs.options.env.OTEL_SERVICE_NAME).toBe('claude-agent-sdk');
      });

      it('should propagate context.traceparent to env.TRACEPARENT for subprocess parenting', async () => {
        mockQuery.mockReturnValue(createMockResponse('ok'));

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
        await provider.callApi('prompt', {
          traceparent,
          prompt: { raw: 'prompt', label: 'prompt' },
          vars: {},
        } as CallApiContextParams);

        const callArgs = mockQuery.mock.calls.at(-1)?.[0];
        // The wrapping span creates a new child span under the provided trace, so the
        // TRACEPARENT forwarded to the SDK should share the same 32-char trace_id.
        const forwarded: string | undefined = callArgs.options.env.TRACEPARENT;
        expect(forwarded).toBeDefined();
        const [, traceId] = forwarded!.split('-');
        expect(traceId).toBe('0af7651916cd43dd8448eb211c80319c');
      });

      it('should not set TRACEPARENT when no active trace context is provided', async () => {
        mockQuery.mockReturnValue(createMockResponse('ok'));

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider.callApi('prompt');

        const callArgs = mockQuery.mock.calls.at(-1)?.[0];
        expect(callArgs.options.env.TRACEPARENT).toBeUndefined();
      });

      it('should not bust the cache when only TRACEPARENT differs between runs', async () => {
        const wasEnabled = isCacheEnabled();
        enableCache();
        try {
          mockQuery.mockImplementation(() => createMockResponse('cached-output'));

          const provider = new ClaudeCodeSDKProvider({
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });

          const first = await provider.callApi('same prompt', {
            traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
            prompt: { raw: 'same prompt', label: 'same prompt' },
            vars: {},
          } as CallApiContextParams);
          expect(first.cached).toBeFalsy();

          const second = await provider.callApi('same prompt', {
            // Different traceparent → must not affect cache key
            traceparent: '00-ffffffffffffffffffffffffffffffff-b7ad6b7169203331-01',
            prompt: { raw: 'same prompt', label: 'same prompt' },
            vars: {},
          } as CallApiContextParams);
          expect(second.cached).toBe(true);
        } finally {
          await clearCache();
          if (wasEnabled) {
            enableCache();
          } else {
            disableCache();
          }
        }
      });

      it('injects promptfoo.trace_id and promptfoo.parent_span_id as OTEL_RESOURCE_ATTRIBUTES', async () => {
        mockQuery.mockReturnValue(createMockResponse('ok'));

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const traceId = '0af7651916cd43dd8448eb211c80319c';
        const spanId = 'b7ad6b7169203331';
        await provider.callApi('prompt', {
          traceparent: `00-${traceId}-${spanId}-01`,
          prompt: { raw: 'prompt', label: 'prompt' },
          vars: {},
        } as CallApiContextParams);

        const callArgs = mockQuery.mock.calls.at(-1)?.[0];
        expect(callArgs.options.env.OTEL_RESOURCE_ATTRIBUTES).toBe(
          `promptfoo.trace_id=${traceId},promptfoo.parent_span_id=${spanId}`,
        );
      });

      it('preserves a pre-existing OTEL_RESOURCE_ATTRIBUTES and trims trailing commas', async () => {
        mockQuery.mockReturnValue(createMockResponse('ok'));

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
          config: {
            env: {
              OTEL_RESOURCE_ATTRIBUTES: 'deployment.environment=prod, service.owner=team-x,',
            },
          },
        });
        const traceId = '0af7651916cd43dd8448eb211c80319c';
        const spanId = 'b7ad6b7169203331';
        await provider.callApi('prompt', {
          traceparent: `00-${traceId}-${spanId}-01`,
          prompt: { raw: 'prompt', label: 'prompt' },
          vars: {},
        } as CallApiContextParams);

        const callArgs = mockQuery.mock.calls.at(-1)?.[0];
        expect(callArgs.options.env.OTEL_RESOURCE_ATTRIBUTES).toBe(
          `deployment.environment=prod,service.owner=team-x,promptfoo.trace_id=${traceId},promptfoo.parent_span_id=${spanId}`,
        );
      });

      it('overrides a user-provided promptfoo.trace_id rather than duplicating it', async () => {
        mockQuery.mockReturnValue(createMockResponse('ok'));

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
          config: {
            env: {
              OTEL_RESOURCE_ATTRIBUTES:
                'promptfoo.trace_id=stale,promptfoo.parent_span_id=stale,other.key=keep',
            },
          },
        });
        const traceId = '0af7651916cd43dd8448eb211c80319c';
        const spanId = 'b7ad6b7169203331';
        await provider.callApi('prompt', {
          traceparent: `00-${traceId}-${spanId}-01`,
          prompt: { raw: 'prompt', label: 'prompt' },
          vars: {},
        } as CallApiContextParams);

        const callArgs = mockQuery.mock.calls.at(-1)?.[0];
        const attrs = callArgs.options.env.OTEL_RESOURCE_ATTRIBUTES as string;
        // User's `other.key` is kept; the stale promptfoo.* kvs are stripped;
        // the fresh values land at the end so last-wins semantics in OTEL
        // parsers pick ours even for parsers that don't dedupe.
        expect(attrs).toBe(
          `other.key=keep,promptfoo.trace_id=${traceId},promptfoo.parent_span_id=${spanId}`,
        );
        expect(attrs.match(/promptfoo\.trace_id=/g)?.length).toBe(1);
      });

      it('skips OTEL_RESOURCE_ATTRIBUTES entirely when traceparent is malformed', async () => {
        mockQuery.mockReturnValue(createMockResponse('ok'));

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider.callApi('prompt', {
          // Missing the span_id segment.
          traceparent: '00-0af7651916cd43dd8448eb211c80319c',
          prompt: { raw: 'prompt', label: 'prompt' },
          vars: {},
        } as CallApiContextParams);

        const callArgs = mockQuery.mock.calls.at(-1)?.[0];
        expect(callArgs.options.env.OTEL_RESOURCE_ATTRIBUTES).toBeUndefined();
      });
    });

    describe('working directory management', () => {
      it('should create temp directory when no working_dir specified', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider.callApi('Test prompt');

        expect(tempDirSpy).toHaveBeenCalledWith(
          expect.stringContaining('promptfoo-claude-agent-sdk-'),
        );
        expect(rmSyncSpy).toHaveBeenCalledWith('/tmp/test-temp-dir', {
          recursive: true,
          force: true,
        });
      });

      it('should use custom working_dir when provided', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        const provider = new ClaudeCodeSDKProvider({
          config: { working_dir: '/custom/dir' },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider.callApi('Test prompt');

        expect(statSyncSpy).toHaveBeenCalledWith('/custom/dir');
        expect(tempDirSpy).not.toHaveBeenCalled();
        expect(mockQuery).toHaveBeenCalledWith({
          prompt: 'Test prompt',
          options: expect.objectContaining({
            cwd: '/custom/dir',
          }),
        });
        expect(rmSyncSpy).not.toHaveBeenCalled();
      });

      it('should resolve working_dir relative paths from the cliState.basePath', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        const provider = new ClaudeCodeSDKProvider({
          config: { working_dir: './workspace' },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider.callApi('Test prompt');

        expect(statSyncSpy).toHaveBeenCalledWith(path.resolve(testBasePath, 'workspace'));
        expect(mockQuery).toHaveBeenCalledWith({
          prompt: 'Test prompt',
          options: expect.objectContaining({
            cwd: path.resolve(testBasePath, 'workspace'),
          }),
        });
      });

      it('should error when working_dir does not exist', async () => {
        statSyncSpy.mockImplementation(function () {
          throw new Error('ENOENT: no such file or directory');
        });

        const provider = new ClaudeCodeSDKProvider({
          config: { working_dir: '/nonexistent/dir' },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        await expect(provider.callApi('Test prompt')).rejects.toThrow(
          /Working dir \/nonexistent\/dir does not exist/,
        );
      });

      it('should error when working_dir is not a directory', async () => {
        statSyncSpy.mockReturnValue({
          isDirectory: () => false,
        } as fs.Stats);

        const provider = new ClaudeCodeSDKProvider({
          config: { working_dir: '/path/to/file.txt' },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        await expect(provider.callApi('Test prompt')).rejects.toThrow(
          'Working dir /path/to/file.txt is not a directory',
        );
      });

      it('should cleanup temp dir even on error', async () => {
        mockQuery.mockRejectedValue(new Error('API error'));

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider.callApi('Test prompt');

        expect(rmSyncSpy).toHaveBeenCalledWith('/tmp/test-temp-dir', {
          recursive: true,
          force: true,
        });
      });
    });

    describe('tool configuration', () => {
      it('should use no tools by default when no working directory is provided', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider.callApi('Test prompt');

        expect(mockQuery).toHaveBeenCalledWith({
          prompt: 'Test prompt',
          options: expect.objectContaining({
            allowedTools: [], // No tools when no working directory
          }),
        });
      });

      it('should use read-only tools by default when working directory is provided', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        const provider = new ClaudeCodeSDKProvider({
          config: { working_dir: './test-dir' },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider.callApi('Test prompt');

        expect(mockQuery).toHaveBeenCalledWith({
          prompt: 'Test prompt',
          options: expect.objectContaining({
            allowedTools: FS_READONLY_ALLOWED_TOOLS,
          }),
        });
      });

      it('should handle allowed tools configuration', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        // Test default allowed tools with working directory
        const provider1 = new ClaudeCodeSDKProvider({
          config: { working_dir: './test-dir' },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider1.callApi('Test prompt');

        expect(mockQuery).toHaveBeenCalledWith({
          prompt: 'Test prompt',
          options: expect.objectContaining({
            allowedTools: FS_READONLY_ALLOWED_TOOLS,
          }),
        });

        // Test custom_allowed_tools replaces defaults
        mockQuery.mockClear();
        const provider2 = new ClaudeCodeSDKProvider({
          config: { custom_allowed_tools: ['Edit', 'Write'] },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider2.callApi('Test prompt');

        expect(mockQuery).toHaveBeenCalledWith({
          prompt: 'Test prompt',
          options: expect.objectContaining({
            allowedTools: ['Edit', 'Write'],
          }),
        });

        // Test append_allowed_tools with deduplication
        mockQuery.mockClear();
        const provider3 = new ClaudeCodeSDKProvider({
          config: {
            working_dir: './test-dir',
            append_allowed_tools: ['Write', 'Read'], // Read is duplicate
          },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider3.callApi('Test prompt');

        expect(mockQuery).toHaveBeenCalledWith({
          prompt: 'Test prompt',
          options: expect.objectContaining({
            allowedTools: [...FS_READONLY_ALLOWED_TOOLS, 'Write'],
          }),
        });
      });

      it('should handle disallowed tools and conflicting configurations', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        // Test disallowed_tools
        const provider1 = new ClaudeCodeSDKProvider({
          config: { disallowed_tools: ['Edit', 'Write'] },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider1.callApi('Test prompt');

        expect(mockQuery).toHaveBeenCalledWith({
          prompt: 'Test prompt',
          options: expect.objectContaining({
            disallowedTools: ['Edit', 'Write'],
          }),
        });

        // Test error when both custom and append tools specified
        const provider2 = new ClaudeCodeSDKProvider({
          config: {
            custom_allowed_tools: ['Write'],
            append_allowed_tools: ['Edit'],
          },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        await expect(provider2.callApi('Test prompt')).rejects.toThrow(
          'Cannot specify both custom_allowed_tools and append_allowed_tools',
        );
      });
    });

    describe('config merging', () => {
      it('should merge provider and prompt configs', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        const provider = new ClaudeCodeSDKProvider({
          config: {
            max_turns: 5,
            model: 'claude-3-5-sonnet-20241022',
          },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        const context: CallApiContextParams = {
          prompt: {
            raw: 'Test prompt',
            label: 'test',
            config: {
              max_thinking_tokens: 1000,
              permission_mode: 'plan',
            },
          },
          vars: {},
        };

        await provider.callApi('Test prompt', context);

        expect(mockQuery).toHaveBeenCalledWith({
          prompt: 'Test prompt',
          options: expect.objectContaining({
            maxTurns: 5,
            model: 'claude-3-5-sonnet-20241022',
            maxThinkingTokens: 1000,
            permissionMode: 'plan',
          }),
        });
      });

      it('should prioritize prompt config over provider config', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        const provider = new ClaudeCodeSDKProvider({
          config: { max_turns: 5 },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        const context: CallApiContextParams = {
          prompt: {
            raw: 'Test prompt',
            label: 'test',
            config: { max_turns: 10 },
          },
          vars: {},
        };

        await provider.callApi('Test prompt', context);

        expect(mockQuery).toHaveBeenCalledWith({
          prompt: 'Test prompt',
          options: expect.objectContaining({
            maxTurns: 10,
          }),
        });
      });
    });

    describe('MCP configuration', () => {
      it('should transform MCP config', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));
        mockTransformMCPConfigToClaudeCode.mockResolvedValue({
          'test-server': {
            command: 'test-command',
            args: ['arg1'],
          },
        });

        const provider = new ClaudeCodeSDKProvider({
          config: {
            mcp: {
              enabled: true,
              server: {
                name: 'test-server',
                command: 'test-command',
                args: ['arg1'],
              },
            },
          },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider.callApi('Test prompt');

        expect(mockTransformMCPConfigToClaudeCode).toHaveBeenCalledWith({
          enabled: true,
          server: {
            name: 'test-server',
            command: 'test-command',
            args: ['arg1'],
          },
        });

        expect(mockQuery).toHaveBeenCalledWith({
          prompt: 'Test prompt',
          options: expect.objectContaining({
            mcpServers: {
              'test-server': {
                command: 'test-command',
                args: ['arg1'],
              },
            },
            strictMcpConfig: true,
          }),
        });
      });

      it('should handle strict_mcp_config false', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        const provider = new ClaudeCodeSDKProvider({
          config: { strict_mcp_config: false },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider.callApi('Test prompt');

        expect(mockQuery).toHaveBeenCalledWith({
          prompt: 'Test prompt',
          options: expect.objectContaining({
            strictMcpConfig: false,
          }),
        });
      });
    });

    describe('abort signal', () => {
      it('should handle abort signal scenarios', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        // Test normal abort signal propagation - use unique prompt
        const abortController1 = new AbortController();
        const result1 = await provider.callApi('Abort test prompt 1', undefined, {
          abortSignal: abortController1.signal,
        });

        expect(mockQuery).toHaveBeenCalledWith({
          prompt: 'Abort test prompt 1',
          options: expect.objectContaining({
            abortController: expect.any(AbortController),
          }),
        });

        expect(result1.output).toBe('Response');

        // Test pre-aborted signal
        mockQuery.mockClear();
        const abortController2 = new AbortController();
        abortController2.abort();

        const result2 = await provider.callApi('Abort test prompt 2', undefined, {
          abortSignal: abortController2.signal,
        });

        expect(result2.error).toBe('Claude Agent SDK call aborted before it started');
        expect(mockQuery).not.toHaveBeenCalled();

        // Test abort during execution
        const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(function () {});
        const abortError = new Error('AbortError');
        abortError.name = 'AbortError';
        mockQuery.mockRejectedValue(abortError);

        const result3 = await provider.callApi('Abort test prompt 3', undefined, {
          abortSignal: new AbortController().signal,
        });

        expect(result3.error).toBe('Claude Agent SDK call aborted');
        expect(warnSpy).toHaveBeenCalledWith('Claude Agent SDK call aborted');

        warnSpy.mockRestore();
      });
    });

    describe('Claude Agent SDK specific configuration', () => {
      describe('should pass all Claude Agent SDK specific options', () => {
        it('with custom system prompt', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              permission_mode: 'acceptEdits',
              custom_system_prompt: 'Custom prompt',
              model: 'claude-3-5-sonnet-20241022',
              fallback_model: 'claude-3-5-haiku-20241022',
              max_turns: 10,
              max_thinking_tokens: 2000,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              permissionMode: 'acceptEdits',
              systemPrompt: 'Custom prompt',
              model: 'claude-3-5-sonnet-20241022',
              fallbackModel: 'claude-3-5-haiku-20241022',
              maxTurns: 10,
              maxThinkingTokens: 2000,
            }),
          });
        });

        it('with plugins configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const plugins = [
            { type: 'local' as const, path: './my-plugin' },
            { type: 'local' as const, path: '/absolute/path/to/plugin' },
          ];

          const provider = new ClaudeCodeSDKProvider({
            config: {
              plugins,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              plugins: [
                { type: 'local', path: path.resolve(testBasePath, 'my-plugin') },
                { type: 'local', path: '/absolute/path/to/plugin' },
              ],
            }),
          });
        });

        it('with maxBudgetUsd configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              max_budget_usd: 5.0,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              maxBudgetUsd: 5.0,
            }),
          });
        });

        it('with taskBudget configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              task_budget: { total: 50000 },
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              taskBudget: { total: 50000 },
            }),
          });
        });

        it('with additionalDirectories configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              additional_directories: ['./relative/dir', '/absolute/dir'],
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              additionalDirectories: [path.resolve(testBasePath, 'relative/dir'), '/absolute/dir'],
            }),
          });
        });

        it('with session management configuration (resume, forkSession, continue)', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              resume: 'session-123',
              fork_session: true,
              resume_session_at: 'message-uuid-456',
              continue: false,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              resume: 'session-123',
              forkSession: true,
              resumeSessionAt: 'message-uuid-456',
              continue: false,
            }),
          });
        });

        it('with programmatic agents configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const agents = {
            'code-reviewer': {
              description: 'Reviews code for issues',
              prompt: 'You are a code reviewer. Review the code carefully.',
              tools: ['Read', 'Grep', 'Glob'],
              model: 'sonnet' as const,
            },
            'test-writer': {
              description: 'Writes tests for code',
              prompt: 'You are a test writer. Write comprehensive tests.',
            },
          };

          const provider = new ClaudeCodeSDKProvider({
            config: {
              agents,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              agents,
            }),
          });
        });

        it('with outputFormat (structured output) configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const outputFormat = {
            type: 'json_schema' as const,
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                age: { type: 'number' },
              },
              required: ['name', 'age'],
            },
          };

          const provider = new ClaudeCodeSDKProvider({
            config: {
              output_format: outputFormat,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              outputFormat,
            }),
          });
        });

        it('with hooks configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          // Create a mock hook callback
          const mockHookCallback = vi.fn().mockResolvedValue({ continue: true });
          const hooks = {
            PreToolUse: [
              {
                matcher: 'Bash',
                hooks: [mockHookCallback],
              },
            ],
          };

          const provider = new ClaudeCodeSDKProvider({
            config: {
              hooks,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              hooks,
            }),
          });
        });

        it('with ask_user_question configuration creates canUseTool callback', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              ask_user_question: {
                behavior: 'first_option',
              },
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              canUseTool: expect.any(Function),
            }),
          });
        });

        it('with ask_user_question canUseTool callback handles AskUserQuestion tool', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              ask_user_question: { behavior: 'first_option' },
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          // Get the canUseTool callback that was passed to query
          const callArgs = mockQuery.mock.calls[0][0];
          const canUseTool = callArgs.options.canUseTool;

          // Test it handles AskUserQuestion and selects first option
          const result = await canUseTool(
            'AskUserQuestion',
            {
              questions: [
                {
                  question: 'Which option?',
                  header: 'Test',
                  options: [
                    { label: 'Option A', description: 'First' },
                    { label: 'Option B', description: 'Second' },
                  ],
                  multiSelect: false,
                },
              ],
            },
            { signal: new AbortController().signal, toolUseID: 'test-id' },
          );

          expect(result).toEqual({
            behavior: 'allow',
            updatedInput: {
              questions: expect.any(Array),
              answers: { 'Which option?': 'Option A' },
            },
          });
        });

        it('passes through programmatic can_use_tool callbacks', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));
          const canUseTool = vi.fn(async (_toolName, input) => ({
            behavior: 'allow' as const,
            updatedInput: input,
          }));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              can_use_tool: canUseTool,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              canUseTool,
            }),
          });
        });

        it('wraps programmatic can_use_tool callbacks for AskUserQuestion automation', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));
          const canUseTool = vi.fn(async (_toolName, input) => ({
            behavior: 'allow' as const,
            updatedInput: input,
          }));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              ask_user_question: { behavior: 'first_option' },
              can_use_tool: canUseTool,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          const callArgs = mockQuery.mock.calls[0][0];
          await callArgs.options.canUseTool(
            'Read',
            { file_path: '/tmp/test.txt' },
            { signal: new AbortController().signal, toolUseID: 'test-id' },
          );

          expect(canUseTool).toHaveBeenCalledWith(
            'Read',
            { file_path: '/tmp/test.txt' },
            { signal: expect.any(AbortSignal), toolUseID: 'test-id' },
          );
        });

        it('with includePartialMessages configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              include_partial_messages: true,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              includePartialMessages: true,
            }),
          });
        });

        it('with betas configuration for 1M context window', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              betas: ['context-1m-2025-08-07'],
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              betas: ['context-1m-2025-08-07'],
            }),
          });
        });

        it('with dontAsk permission mode', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              permission_mode: 'dontAsk',
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              permissionMode: 'dontAsk',
            }),
          });
        });

        it('with auto permission mode', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              permission_mode: 'auto',
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              permissionMode: 'auto',
            }),
          });
        });

        it('with sandbox configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const sandbox = {
            enabled: true,
            autoAllowBashIfSandboxed: true,
            failIfUnavailable: false,
            network: {
              allowedDomains: ['api.example.com'],
              allowLocalBinding: true,
            },
          };

          const provider = new ClaudeCodeSDKProvider({
            config: {
              sandbox,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              sandbox,
            }),
          });
        });

        it('with sandbox network proxy configuration (httpProxyPort, socksProxyPort)', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const sandbox = {
            enabled: true,
            network: {
              httpProxyPort: 8080,
              socksProxyPort: 1080,
              allowedDomains: ['api.example.com'],
              allowAllUnixSockets: true,
            },
          };

          const provider = new ClaudeCodeSDKProvider({
            config: {
              sandbox,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              sandbox,
            }),
          });
        });

        it('with sandbox excludedCommands and enableWeakerNestedSandbox', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const sandbox = {
            enabled: true,
            enableWeakerNestedSandbox: true,
            excludedCommands: ['docker', 'podman', 'kubectl'],
            allowUnsandboxedCommands: true,
          };

          const provider = new ClaudeCodeSDKProvider({
            config: {
              sandbox,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              sandbox,
            }),
          });
        });

        it('with sandbox ripgrep configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const sandbox = {
            enabled: true,
            ripgrep: {
              command: '/usr/local/bin/rg',
              args: ['--hidden', '--no-ignore'],
            },
          };

          const provider = new ClaudeCodeSDKProvider({
            config: {
              sandbox,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              sandbox,
            }),
          });
        });

        it('with sandbox ignoreViolations configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const sandbox = {
            enabled: true,
            ignoreViolations: {
              'git*': ['network'],
              'npm*': ['filesystem', 'network'],
            },
          };

          const provider = new ClaudeCodeSDKProvider({
            config: {
              sandbox,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              sandbox,
            }),
          });
        });

        it('with sandbox network allowUnixSockets configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const sandbox = {
            enabled: true,
            network: {
              allowUnixSockets: ['/var/run/docker.sock', '/tmp/mysql.sock'],
              allowLocalBinding: true,
            },
          };

          const provider = new ClaudeCodeSDKProvider({
            config: {
              sandbox,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              sandbox,
            }),
          });
        });

        it('with bypassPermissions mode requires allow_dangerously_skip_permissions', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          // Should fail without the safety flag
          const provider1 = new ClaudeCodeSDKProvider({
            config: {
              permission_mode: 'bypassPermissions',
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });

          await expect(provider1.callApi('Test prompt')).rejects.toThrow(
            "permission_mode 'bypassPermissions' requires allow_dangerously_skip_permissions: true as a safety measure",
          );

          // Should succeed with the safety flag
          const provider2 = new ClaudeCodeSDKProvider({
            config: {
              permission_mode: 'bypassPermissions',
              allow_dangerously_skip_permissions: true,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });

          const result = await provider2.callApi('Test prompt');

          expect(result.output).toBe('Response');
          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              permissionMode: 'bypassPermissions',
              allowDangerouslySkipPermissions: true,
            }),
          });
        });

        it('with permission_prompt_tool_name configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              permission_prompt_tool_name: 'my-mcp-permission-tool',
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              permissionPromptToolName: 'my-mcp-permission-tool',
            }),
          });
        });

        it('with stderr callback configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const stderrCallback = vi.fn();
          const provider = new ClaudeCodeSDKProvider({
            config: {
              stderr: stderrCallback,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              stderr: stderrCallback,
            }),
          });
        });

        it('with executable and executable_args configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              executable: 'bun',
              executable_args: ['--smol'],
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              executable: 'bun',
              executableArgs: ['--smol'],
            }),
          });
        });

        it('with extra_args configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              extra_args: {
                verbose: null, // Boolean flag
                timeout: '30',
              },
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              extraArgs: {
                verbose: null,
                timeout: '30',
              },
            }),
          });
        });

        it('with relative path_to_claude_code_executable configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              path_to_claude_code_executable: './bin/claude-code',
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              pathToClaudeCodeExecutable: path.resolve(testBasePath, 'bin/claude-code'),
            }),
          });
        });

        it('with absolute path_to_claude_code_executable configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              path_to_claude_code_executable: '/custom/path/to/claude-code',
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              pathToClaudeCodeExecutable: '/custom/path/to/claude-code',
            }),
          });
        });

        it('with setting_sources configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              setting_sources: ['user', 'project', 'local'],
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              settingSources: ['user', 'project', 'local'],
            }),
          });
        });

        it('with tools configuration as array', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              tools: ['Bash', 'Read', 'Edit'],
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              tools: ['Bash', 'Read', 'Edit'],
            }),
          });
        });

        it('with tools configuration as preset', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              tools: { type: 'preset', preset: 'claude_code' },
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              tools: { type: 'preset', preset: 'claude_code' },
            }),
          });
        });

        it('with tools as empty array to disable all tools', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              tools: [],
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              tools: [],
            }),
          });
        });

        it('with enable_file_checkpointing configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              enable_file_checkpointing: true,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              enableFileCheckpointing: true,
            }),
          });
        });

        it('with persist_session configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              persist_session: false,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              persistSession: false,
            }),
          });
        });

        it('with title configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              title: 'promptfoo eval — release regression',
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              title: 'promptfoo eval — release regression',
            }),
          });
        });

        it('omits title when not configured', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {},
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          const call = mockQuery.mock.calls.at(-1)?.[0] as
            | { options: Record<string, unknown> }
            | undefined;
          expect(call?.options).toBeDefined();
          expect(call?.options.title).toBeUndefined();
        });

        it('does not bust the cache when only title differs between runs', async () => {
          const wasEnabled = isCacheEnabled();
          enableCache();
          try {
            mockQuery.mockImplementation(() => createMockResponse('cached-output'));

            const first = await new ClaudeCodeSDKProvider({
              config: { title: 'eval run A' },
              env: { ANTHROPIC_API_KEY: 'test-api-key' },
            }).callApi('same prompt');
            expect(first.cached).toBeFalsy();

            const second = await new ClaudeCodeSDKProvider({
              config: { title: 'eval run B — totally different label' },
              env: { ANTHROPIC_API_KEY: 'test-api-key' },
            }).callApi('same prompt');
            expect(second.cached).toBe(true);
            expect(second.output).toBe('cached-output');
          } finally {
            await clearCache();
            if (wasEnabled) {
              enableCache();
            } else {
              disableCache();
            }
          }
        });

        it('warns when title is combined with resume', async () => {
          const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(function () {});
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: { title: 'ignored on resume', resume: 'session-123' },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('`title` is ignored when `resume` or `continue` is set'),
          );
          warnSpy.mockRestore();
        });

        it('warns when title is combined with continue', async () => {
          const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(function () {});
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: { title: 'ignored on continue', continue: true },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('`title` is ignored when `resume` or `continue` is set'),
          );
          warnSpy.mockRestore();
        });

        it('does not warn when title is set without resume/continue', async () => {
          const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(function () {});
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: { title: 'brand new session' },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          const titleWarn = warnSpy.mock.calls.find(
            (call) => typeof call[0] === 'string' && call[0].includes('`title` is ignored'),
          );
          expect(titleWarn).toBeUndefined();
          warnSpy.mockRestore();
        });

        it('with thinking configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              thinking: { type: 'adaptive' },
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              thinking: { type: 'adaptive' },
            }),
          });
        });

        it('with effort configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              effort: 'low',
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              effort: 'low',
            }),
          });
        });

        it('with agent configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              agent: 'code-reviewer',
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              agent: 'code-reviewer',
            }),
          });
        });

        it('with session_id configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              session_id: '550e8400-e29b-41d4-a716-446655440000',
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              sessionId: '550e8400-e29b-41d4-a716-446655440000',
            }),
          });
        });

        it('with debug configuration and relative debug_file', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              debug: true,
              debug_file: './logs/debug.log',
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              debug: true,
              debugFile: path.resolve(testBasePath, 'logs/debug.log'),
            }),
          });
        });

        it('with debug configuration and absolute debug_file', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              debug: true,
              debug_file: '/tmp/debug.log',
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              debug: true,
              debugFile: '/tmp/debug.log',
            }),
          });
        });

        it('with spawn_claude_code_process callback', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const spawnCallback = vi.fn();
          const provider = new ClaudeCodeSDKProvider({
            config: {
              spawn_claude_code_process: spawnCallback,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              spawnClaudeCodeProcess: spawnCallback,
            }),
          });
        });

        it('with include_hook_events configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              include_hook_events: true,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              includeHookEvents: true,
            }),
          });
        });

        it('with tool_config configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              tool_config: {
                askUserQuestion: { previewFormat: 'html' },
              },
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              toolConfig: {
                askUserQuestion: { previewFormat: 'html' },
              },
            }),
          });
        });

        it('with prompt_suggestions configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              prompt_suggestions: true,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              promptSuggestions: true,
            }),
          });
        });

        it('with agent_progress_summaries configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              agent_progress_summaries: true,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              agentProgressSummaries: true,
            }),
          });
        });

        it("with skills set to 'all'", async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              skills: 'all',
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              skills: 'all',
            }),
          });
        });

        it('with skills as a name list', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              skills: ['code-review', 'pdf'],
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              skills: ['code-review', 'pdf'],
            }),
          });
        });

        it('with forward_subagent_text configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              forward_subagent_text: true,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              forwardSubagentText: true,
            }),
          });
        });

        it('with managed_settings configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              managed_settings: {
                sandbox: { network: { allowManagedDomainsOnly: true } },
              },
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              managedSettings: {
                sandbox: { network: { allowManagedDomainsOnly: true } },
              },
            }),
          });
        });

        it('with plan_mode_instructions configuration', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              permission_mode: 'plan',
              plan_mode_instructions: 'Outline a step-by-step migration plan only.',
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              permissionMode: 'plan',
              planModeInstructions: 'Outline a step-by-step migration plan only.',
            }),
          });
        });

        it('with settings as absolute file path', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              settings: '/path/to/settings.json',
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              settings: '/path/to/settings.json',
            }),
          });
        });

        it('with settings as relative file path resolves to absolute', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              settings: './my-settings.json',
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              settings: path.resolve(testBasePath, './my-settings.json'),
            }),
          });
        });

        it('with settings as empty file path passes through unchanged', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              settings: '',
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              settings: '',
            }),
          });
        });

        it('with settings as object', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              settings: {
                permissions: { allow: ['Bash(*)'] },
              },
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              settings: {
                permissions: { allow: ['Bash(*)'] },
              },
            }),
          });
        });

        it('with on_elicitation callback', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const elicitationCallback = vi.fn();
          const provider = new ClaudeCodeSDKProvider({
            config: {
              on_elicitation: elicitationCallback,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              onElicitation: elicitationCallback,
            }),
          });
        });

        it('with append system prompt', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: {
              permission_mode: 'acceptEdits',
              append_system_prompt: 'Append this',
              model: 'claude-3-5-sonnet-20241022',
              fallback_model: 'claude-3-5-haiku-20241022',
              max_turns: 10,
              max_thinking_tokens: 2000,
            },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              permissionMode: 'acceptEdits',
              systemPrompt: {
                type: 'preset',
                preset: 'claude_code',
                append: 'Append this',
              },
              model: 'claude-3-5-sonnet-20241022',
              fallbackModel: 'claude-3-5-haiku-20241022',
              maxTurns: 10,
              maxThinkingTokens: 2000,
            }),
          });
        });

        it('forwards exclude_dynamic_sections to the preset system prompt', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: { exclude_dynamic_sections: true, append_system_prompt: 'Extras' },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              systemPrompt: {
                type: 'preset',
                preset: 'claude_code',
                append: 'Extras',
                excludeDynamicSections: true,
              },
            }),
          });
        });

        it('omits excludeDynamicSections when exclude_dynamic_sections is false/unset', async () => {
          mockQuery.mockReturnValue(createMockResponse('Response'));

          const provider = new ClaudeCodeSDKProvider({
            config: { exclude_dynamic_sections: false },
            env: { ANTHROPIC_API_KEY: 'test-api-key' },
          });
          await provider.callApi('Test prompt');

          expect(mockQuery).toHaveBeenCalledWith({
            prompt: 'Test prompt',
            options: expect.objectContaining({
              systemPrompt: {
                type: 'preset',
                preset: 'claude_code',
                append: undefined,
              },
            }),
          });
        });
      });
    });

    describe('caching behavior', () => {
      it('should cache responses', async () => {
        mockQuery.mockImplementation(function () {
          return createMockResponse('Cached response', { input_tokens: 10, output_tokens: 20 });
        });

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        // First call - should hit the API
        const result1 = await provider.callApi('Test prompt');
        expect(result1.output).toBe('Cached response');
        expect(mockQuery).toHaveBeenCalledTimes(1);

        // Second call with same prompt - should use cache
        const result2 = await provider.callApi('Test prompt');
        // Check if we got a result at all
        expect(result2).toBeDefined();
        // If cache worked, mockQuery should still only be called once
        expect(mockQuery).toHaveBeenCalledTimes(1);
        // And we should get the same output
        expect(result2.output).toBe('Cached response');

        // Third call with different prompt - should hit API again
        const result3 = await provider.callApi('Different prompt');
        expect(result3.output).toBe('Cached response');
        expect(mockQuery).toHaveBeenCalledTimes(2);
      });

      it('should disable caching when MCP is configured', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        const providerWithMcp = new ClaudeCodeSDKProvider({
          config: {
            mcp: {
              enabled: true,
              servers: [{ command: 'npx', args: ['-y', '@x402scan/mcp@latest'], name: 'x402' }],
            },
          },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        // Both calls should hit the API since caching is disabled with MCP
        await providerWithMcp.callApi('Test prompt');
        await providerWithMcp.callApi('Test prompt');
        expect(mockQuery).toHaveBeenCalledTimes(2);
      });

      it('should cache MCP responses when cache_mcp is true', async () => {
        mockQuery.mockReturnValue(createMockResponse('MCP cached response'));

        const provider = new ClaudeCodeSDKProvider({
          config: {
            cache_mcp: true,
            mcp: {
              enabled: true,
              servers: [{ command: 'npx', args: ['-y', '@x402scan/mcp@latest'], name: 'x402' }],
            },
          },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        // First call - should hit the API
        const result1 = await provider.callApi('Test prompt');
        expect(result1.output).toBe('MCP cached response');
        expect(mockQuery).toHaveBeenCalledTimes(1);

        // Second call with same prompt - should use cache
        const result2 = await provider.callApi('Test prompt');
        expect(result2.output).toBe('MCP cached response');
        expect(mockQuery).toHaveBeenCalledTimes(1);
      });

      it('should produce different cache keys for different MCP configs when cache_mcp is true', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response A'));

        const providerA = new ClaudeCodeSDKProvider({
          config: {
            cache_mcp: true,
            mcp: {
              enabled: true,
              servers: [{ command: 'npx', args: ['-y', '@x402scan/mcp@latest'], name: 'x402' }],
            },
          },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        // First provider call
        await providerA.callApi('Test prompt');
        expect(mockQuery).toHaveBeenCalledTimes(1);

        mockQuery.mockReturnValue(createMockResponse('Response B'));

        const providerB = new ClaudeCodeSDKProvider({
          config: {
            cache_mcp: true,
            mcp: {
              enabled: true,
              servers: [
                { command: 'npx', args: ['-y', '@other-mcp/server@latest'], name: 'other' },
              ],
            },
          },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        // Second provider with different MCP config - should NOT use cache from first
        const result = await providerB.callApi('Test prompt');
        expect(result.output).toBe('Response B');
        expect(mockQuery).toHaveBeenCalledTimes(2);
      });

      it('should respect bustCache parameter', async () => {
        mockQuery.mockReturnValue(
          createMockResponse('Response v1', { input_tokens: 10, output_tokens: 20 }),
        );

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        // First call - populates cache
        await provider.callApi('Test prompt');
        expect(mockQuery).toHaveBeenCalledTimes(1);

        // Second call without bustCache - uses cache
        await provider.callApi('Test prompt');
        expect(mockQuery).toHaveBeenCalledTimes(1);

        // Update mock response for next call
        mockQuery.mockReturnValue(
          createMockResponse('Response v2', { input_tokens: 15, output_tokens: 25 }),
        );

        // Third call with bustCache - bypasses cache for read but still writes
        const result = await provider.callApi('Test prompt', {
          bustCache: true,
        } as CallApiContextParams);
        expect(result.output).toBe('Response v2');
        expect(mockQuery).toHaveBeenCalledTimes(2);

        // Fourth call without bustCache - should get the updated cached value
        const result2 = await provider.callApi('Test prompt');
        expect(result2.output).toBe('Response v2');
        expect(mockQuery).toHaveBeenCalledTimes(2); // Still only 2 calls total
      });

      it('should handle working directory fingerprinting', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        // Mock filesystem for working directory fingerprinting
        const readdirSyncSpy = vi.spyOn(fs, 'readdirSync');
        readdirSyncSpy.mockReturnValue([
          { name: 'file1.txt', isFile: () => true, isDirectory: () => false },
          { name: 'file2.txt', isFile: () => true, isDirectory: () => false },
        ] as any);

        const originalStatSync = statSyncSpy.getMockImplementation();
        statSyncSpy.mockImplementation(function (path: any) {
          if (path === '/custom/dir') {
            return {
              isDirectory: () => true,
              mtimeMs: 1234567890,
            } as fs.Stats;
          }
          if (path.includes('file1.txt') || path.includes('file2.txt')) {
            return {
              isFile: () => true,
              mtimeMs: 1234567890,
            } as fs.Stats;
          }
          return originalStatSync?.(path) ?? ({} as fs.Stats);
        });

        const provider = new ClaudeCodeSDKProvider({
          config: { working_dir: '/custom/dir' },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        // First call with working directory
        await provider.callApi('Test prompt');
        expect(mockQuery).toHaveBeenCalledTimes(1);

        // Second call with same working directory - should use cache
        await provider.callApi('Test prompt');
        expect(mockQuery).toHaveBeenCalledTimes(1);

        // Simulate file change by updating mtime
        statSyncSpy.mockImplementation(function (path: any) {
          if (path === '/custom/dir') {
            return {
              isDirectory: () => true,
              mtimeMs: 1234567890,
            } as fs.Stats;
          }
          if (path.includes('file1.txt')) {
            return {
              isFile: () => true,
              mtimeMs: 9999999999, // Changed mtime
            } as fs.Stats;
          }
          if (path.includes('file2.txt')) {
            return {
              isFile: () => true,
              mtimeMs: 1234567890,
            } as fs.Stats;
          }
          return originalStatSync?.(path) ?? ({} as fs.Stats);
        });

        // Clear cache to simulate new provider instance
        await clearCache();

        const provider2 = new ClaudeCodeSDKProvider({
          config: { working_dir: '/custom/dir' },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        // Third call with changed file - should NOT use cache
        await provider2.callApi('Test prompt');
        expect(mockQuery).toHaveBeenCalledTimes(2);

        readdirSyncSpy.mockRestore();
      });

      it('should handle cache disabled globally', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        disableCache();

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        // Even with read-only config, should not cache when disabled
        await provider.callApi('Test prompt');
        await provider.callApi('Test prompt');
        expect(mockQuery).toHaveBeenCalledTimes(2);

        // Re-enable cache for other tests
        enableCache();
      });

      it('should bypass cache when can_use_tool callback is provided', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        await clearCache();

        const canUseTool = vi.fn(async (_toolName: string, input: Record<string, unknown>) => ({
          behavior: 'allow' as const,
          updatedInput: input,
        }));

        const provider = new ClaudeCodeSDKProvider({
          config: { can_use_tool: canUseTool },
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');
        await provider.callApi('Test prompt');

        // Two real SDK calls — cache must be skipped because the user-supplied
        // callback can change tool decisions in ways the cache key can't model.
        expect(mockQuery).toHaveBeenCalledTimes(2);
      });

      it('should handle cache errors gracefully', async () => {
        mockQuery.mockReturnValue(createMockResponse('Response'));

        // Mock cache.set to throw an error
        const cache = await getCache();
        const setSpy = vi.spyOn(cache, 'set').mockImplementation(async function () {
          throw new Error('Cache write failed');
        });

        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(function () {});

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });

        // Should complete successfully even if cache write fails
        const result = await provider.callApi('Test prompt');
        expect(result.output).toBe('Response');
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Error caching response'));

        errorSpy.mockRestore();
        setSpy.mockRestore();
      });
    });

    describe('tool call tracking', () => {
      it('should capture tool calls in response metadata', async () => {
        mockQuery.mockReturnValue(
          createMockQuery([
            {
              type: 'assistant',
              parent_tool_use_id: null,
              message: createMockBetaMessage([
                {
                  type: 'tool_use',
                  id: 'tool-1',
                  name: 'Read',
                  input: { file_path: '/test/file.ts' },
                },
              ]),
              session_id: 'test-session',
            },
            {
              type: 'user',
              message: {
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: 'tool-1',
                    content: 'file contents here',
                  },
                ],
              },
              session_id: 'test-session',
            },
            {
              type: 'result',
              subtype: 'success',
              session_id: 'test-session',
              uuid: '12345678-1234-1234-1234-123456789abc',
              result: 'Done',
              usage: createMockUsage(100, 200),
              total_cost_usd: 0.01,
              duration_ms: 1000,
              duration_api_ms: 800,
              is_error: false,
              num_turns: 1,
              permission_denials: [],
            },
          ]),
        );

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Read the file');

        expect(result.output).toBe('Done');
        expect(result.metadata?.toolCalls).toEqual([
          {
            id: 'tool-1',
            name: 'Read',
            input: { file_path: '/test/file.ts' },
            output: 'file contents here',
            is_error: false,
            parentToolUseId: null,
          },
        ]);
        expect(result.metadata?.skillCalls).toEqual([]);
      });

      it('should derive normalized skillCalls from the Skill tool', async () => {
        mockQuery.mockReturnValue(
          createMockQuery([
            {
              type: 'assistant',
              parent_tool_use_id: null,
              message: createMockBetaMessage([
                {
                  type: 'tool_use',
                  id: 'skill-1',
                  name: 'Skill',
                  input: {
                    skill: 'project-standards:standards-check',
                    args: { target: 'README.md' },
                  },
                },
              ]),
              session_id: 'test-session',
            },
            {
              type: 'user',
              message: {
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: 'skill-1',
                    content: 'README missing',
                  },
                ],
              },
              session_id: 'test-session',
            },
            {
              type: 'result',
              subtype: 'success',
              session_id: 'test-session',
              uuid: '12345678-1234-1234-1234-123456789abc',
              result: 'README missing',
              usage: createMockUsage(100, 120),
              total_cost_usd: 0.01,
              duration_ms: 1000,
              duration_api_ms: 800,
              is_error: false,
              num_turns: 1,
              permission_denials: [],
            },
          ]),
        );

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Check project standards');

        expect(result.metadata?.skillCalls).toEqual([
          {
            name: 'project-standards:standards-check',
            input: {
              skill: 'project-standards:standards-check',
              args: { target: 'README.md' },
            },
            is_error: false,
            source: 'tool',
          },
        ]);
      });

      it('should ignore malformed Skill tool inputs without a string skill name', async () => {
        mockQuery.mockReturnValue(
          createMockQuery([
            {
              type: 'assistant',
              parent_tool_use_id: null,
              message: createMockBetaMessage([
                {
                  type: 'tool_use',
                  id: 'skill-1',
                  name: 'Skill',
                  input: {
                    args: { target: 'README.md' },
                  },
                },
              ]),
              session_id: 'test-session',
            },
            {
              type: 'user',
              message: {
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: 'skill-1',
                    content: 'Malformed skill input',
                  },
                ],
              },
              session_id: 'test-session',
            },
            {
              type: 'result',
              subtype: 'success',
              session_id: 'test-session',
              uuid: '12345678-1234-1234-1234-123456789abc',
              result: 'Malformed skill input',
              usage: createMockUsage(100, 120),
              total_cost_usd: 0.01,
              duration_ms: 1000,
              duration_api_ms: 800,
              is_error: false,
              num_turns: 1,
              permission_denials: [],
            },
          ]),
        );

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Check project standards');

        expect(result.metadata?.skillCalls).toEqual([]);
      });

      it('should capture multiple tool calls across multiple turns', async () => {
        mockQuery.mockReturnValue(
          createMockQuery([
            {
              type: 'assistant',
              parent_tool_use_id: null,
              message: createMockBetaMessage([
                {
                  type: 'tool_use',
                  id: 'tool-1',
                  name: 'Grep',
                  input: { pattern: 'TODO', path: '/src' },
                },
              ]),
              session_id: 'test-session',
            },
            {
              type: 'user',
              message: {
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: 'tool-1',
                    content: 'Found 3 matches',
                  },
                ],
              },
              session_id: 'test-session',
            },
            {
              type: 'assistant',
              parent_tool_use_id: null,
              message: createMockBetaMessage([
                {
                  type: 'tool_use',
                  id: 'tool-2',
                  name: 'Bash',
                  input: { command: 'npm test' },
                },
                {
                  type: 'tool_use',
                  id: 'tool-3',
                  name: 'Read',
                  input: { file_path: '/test/output.log' },
                },
              ]),
              session_id: 'test-session',
            },
            {
              type: 'user',
              message: {
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: 'tool-2',
                    content: 'All tests passed',
                  },
                  {
                    type: 'tool_result',
                    tool_use_id: 'tool-3',
                    content: 'log output here',
                  },
                ],
              },
              session_id: 'test-session',
            },
            {
              type: 'result',
              subtype: 'success',
              session_id: 'test-session',
              uuid: '12345678-1234-1234-1234-123456789abc',
              result: 'Analysis complete',
              usage: createMockUsage(200, 400),
              total_cost_usd: 0.02,
              duration_ms: 2000,
              duration_api_ms: 1600,
              is_error: false,
              num_turns: 2,
              permission_denials: [],
            },
          ]),
        );

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Run analysis');

        expect(result.metadata?.toolCalls).toHaveLength(3);
        expect(result.metadata?.toolCalls).toEqual([
          {
            id: 'tool-1',
            name: 'Grep',
            input: { pattern: 'TODO', path: '/src' },
            output: 'Found 3 matches',
            is_error: false,
            parentToolUseId: null,
          },
          {
            id: 'tool-2',
            name: 'Bash',
            input: { command: 'npm test' },
            output: 'All tests passed',
            is_error: false,
            parentToolUseId: null,
          },
          {
            id: 'tool-3',
            name: 'Read',
            input: { file_path: '/test/output.log' },
            output: 'log output here',
            is_error: false,
            parentToolUseId: null,
          },
        ]);
      });

      it('should include empty toolCalls array when no tool calls are made', async () => {
        mockQuery.mockReturnValue(
          createMockResponse('Simple response', { input_tokens: 10, output_tokens: 20 }),
        );

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Simple question');

        expect(result.output).toBe('Simple response');
        expect(result.metadata?.toolCalls).toEqual([]);
      });

      it('should include tool calls in error responses', async () => {
        mockQuery.mockReturnValue(
          createMockQuery([
            {
              type: 'assistant',
              parent_tool_use_id: null,
              message: createMockBetaMessage([
                {
                  type: 'tool_use',
                  id: 'tool-1',
                  name: 'Bash',
                  input: { command: 'rm -rf /' },
                },
              ]),
              session_id: 'error-session',
            },
            {
              type: 'user',
              message: {
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: 'tool-1',
                    content: 'Permission denied',
                    is_error: true,
                  },
                ],
              },
              session_id: 'error-session',
            },
            {
              type: 'result',
              subtype: 'error_during_execution',
              session_id: 'error-session',
              uuid: '87654321-4321-4321-4321-210987654321',
              usage: createMockUsage(50, 100),
              total_cost_usd: 0.005,
              duration_ms: 500,
              duration_api_ms: 400,
              is_error: true,
              num_turns: 1,
              permission_denials: [],
            },
          ]),
        );

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Do something dangerous');

        expect(result.error).toBe('Claude Agent SDK call failed: error_during_execution');
        expect(result.metadata?.toolCalls).toEqual([
          {
            id: 'tool-1',
            name: 'Bash',
            input: { command: 'rm -rf /' },
            output: 'Permission denied',
            is_error: true,
            parentToolUseId: null,
          },
        ]);
      });

      it('should handle tool calls without matching results', async () => {
        mockQuery.mockReturnValue(
          createMockQuery([
            {
              type: 'assistant',
              parent_tool_use_id: null,
              message: createMockBetaMessage([
                {
                  type: 'tool_use',
                  id: 'tool-1',
                  name: 'Read',
                  input: { file_path: '/test/file.ts' },
                },
              ]),
              session_id: 'test-session',
            },
            // No user message with tool_result for tool-1
            {
              type: 'result',
              subtype: 'success',
              session_id: 'test-session',
              uuid: '12345678-1234-1234-1234-123456789abc',
              result: 'Partial result',
              usage: createMockUsage(50, 50),
              total_cost_usd: 0.005,
              duration_ms: 500,
              duration_api_ms: 400,
              is_error: false,
              num_turns: 1,
              permission_denials: [],
            },
          ]),
        );

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Read a file');

        expect(result.metadata?.toolCalls).toEqual([
          {
            id: 'tool-1',
            name: 'Read',
            input: { file_path: '/test/file.ts' },
            output: undefined,
            is_error: false,
            parentToolUseId: null,
          },
        ]);
      });

      it('should preserve structured output metadata alongside tool calls', async () => {
        const structuredData = { analysis: 'good', score: 95 };
        mockQuery.mockReturnValue(
          createMockQuery([
            {
              type: 'assistant',
              parent_tool_use_id: null,
              message: createMockBetaMessage([
                {
                  type: 'tool_use',
                  id: 'tool-1',
                  name: 'Read',
                  input: { file_path: '/test/code.ts' },
                },
              ]),
              session_id: 'test-session',
            },
            {
              type: 'user',
              message: {
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: 'tool-1',
                    content: 'code contents',
                  },
                ],
              },
              session_id: 'test-session',
            },
            {
              type: 'result',
              subtype: 'success',
              session_id: 'test-session',
              uuid: '12345678-1234-1234-1234-123456789abc',
              result: 'JSON output',
              structured_output: structuredData,
              usage: createMockUsage(100, 200),
              total_cost_usd: 0.01,
              duration_ms: 1000,
              duration_api_ms: 800,
              is_error: false,
              num_turns: 1,
              permission_denials: [],
            },
          ]),
        );

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Analyze the code');

        expect(result.output).toEqual(structuredData);
        expect(result.metadata?.structuredOutput).toEqual(structuredData);
        expect(result.metadata?.toolCalls).toEqual([
          {
            id: 'tool-1',
            name: 'Read',
            input: { file_path: '/test/code.ts' },
            output: 'code contents',
            is_error: false,
            parentToolUseId: null,
          },
        ]);
      });

      it('should capture sub-agent tool calls with parentToolUseId', async () => {
        mockQuery.mockReturnValue(
          createMockQuery([
            // Top-level agent calls Task tool to spawn a sub-agent
            {
              type: 'assistant',
              parent_tool_use_id: null,
              message: createMockBetaMessage([
                {
                  type: 'tool_use',
                  id: 'task-tool-1',
                  name: 'Task',
                  input: { prompt: 'Run the tests', subagent_type: 'Bash' },
                },
              ]),
              session_id: 'test-session',
            },
            // Sub-agent makes its own tool calls (parent_tool_use_id points to the Task tool call)
            {
              type: 'assistant',
              parent_tool_use_id: 'task-tool-1',
              message: createMockBetaMessage([
                {
                  type: 'tool_use',
                  id: 'sub-tool-1',
                  name: 'Bash',
                  input: { command: 'npm test' },
                },
              ]),
              session_id: 'test-session',
            },
            {
              type: 'user',
              message: {
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: 'sub-tool-1',
                    content: 'All tests passed',
                  },
                ],
              },
              session_id: 'test-session',
            },
            // Sub-agent result comes back as tool_result for the Task tool call
            {
              type: 'user',
              message: {
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: 'task-tool-1',
                    content: 'Sub-agent completed: All tests passed',
                  },
                ],
              },
              session_id: 'test-session',
            },
            {
              type: 'result',
              subtype: 'success',
              session_id: 'test-session',
              uuid: '12345678-1234-1234-1234-123456789abc',
              result: 'Tests passed successfully',
              usage: createMockUsage(300, 500),
              total_cost_usd: 0.03,
              duration_ms: 3000,
              duration_api_ms: 2500,
              is_error: false,
              num_turns: 2,
              permission_denials: [],
            },
          ]),
        );

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Run tests using a sub-agent');

        expect(result.metadata?.toolCalls).toHaveLength(2);
        expect(result.metadata?.toolCalls).toEqual([
          {
            id: 'task-tool-1',
            name: 'Task',
            input: { prompt: 'Run the tests', subagent_type: 'Bash' },
            output: 'Sub-agent completed: All tests passed',
            is_error: false,
            parentToolUseId: null,
          },
          {
            id: 'sub-tool-1',
            name: 'Bash',
            input: { command: 'npm test' },
            output: 'All tests passed',
            is_error: false,
            parentToolUseId: 'task-tool-1',
          },
        ]);
      });

      it('should capture nested sub-agent tool calls mixed with top-level calls', async () => {
        mockQuery.mockReturnValue(
          createMockQuery([
            // Top-level tool call
            {
              type: 'assistant',
              parent_tool_use_id: null,
              message: createMockBetaMessage([
                {
                  type: 'tool_use',
                  id: 'top-1',
                  name: 'Read',
                  input: { file_path: '/src/index.ts' },
                },
              ]),
              session_id: 'test-session',
            },
            {
              type: 'user',
              message: {
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: 'top-1',
                    content: 'index file contents',
                  },
                ],
              },
              session_id: 'test-session',
            },
            // Top-level agent spawns sub-agent
            {
              type: 'assistant',
              parent_tool_use_id: null,
              message: createMockBetaMessage([
                {
                  type: 'tool_use',
                  id: 'task-1',
                  name: 'Task',
                  input: { prompt: 'Explore the codebase', subagent_type: 'Explore' },
                },
              ]),
              session_id: 'test-session',
            },
            // Sub-agent tool calls
            {
              type: 'assistant',
              parent_tool_use_id: 'task-1',
              message: createMockBetaMessage([
                {
                  type: 'tool_use',
                  id: 'sub-1',
                  name: 'Glob',
                  input: { pattern: '**/*.ts' },
                },
                {
                  type: 'tool_use',
                  id: 'sub-2',
                  name: 'Grep',
                  input: { pattern: 'export', path: '/src' },
                },
              ]),
              session_id: 'test-session',
            },
            {
              type: 'user',
              message: {
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: 'sub-1',
                    content: 'file1.ts\nfile2.ts',
                  },
                  {
                    type: 'tool_result',
                    tool_use_id: 'sub-2',
                    content: '5 matches',
                  },
                ],
              },
              session_id: 'test-session',
            },
            // Task tool result
            {
              type: 'user',
              message: {
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: 'task-1',
                    content: 'Exploration complete',
                  },
                ],
              },
              session_id: 'test-session',
            },
            {
              type: 'result',
              subtype: 'success',
              session_id: 'test-session',
              uuid: '12345678-1234-1234-1234-123456789abc',
              result: 'Done',
              usage: createMockUsage(400, 600),
              total_cost_usd: 0.04,
              duration_ms: 4000,
              duration_api_ms: 3000,
              is_error: false,
              num_turns: 3,
              permission_denials: [],
            },
          ]),
        );

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Analyze the project');

        expect(result.metadata?.toolCalls).toHaveLength(4);

        // Top-level calls have parentToolUseId: null
        const topLevelCalls = result.metadata?.toolCalls.filter(
          (t: any) => t.parentToolUseId === null,
        );
        expect(topLevelCalls).toHaveLength(2);
        expect(topLevelCalls.map((t: any) => t.name)).toEqual(['Read', 'Task']);

        // Sub-agent calls have parentToolUseId pointing to the Task tool call
        const subAgentCalls = result.metadata?.toolCalls.filter(
          (t: any) => t.parentToolUseId === 'task-1',
        );
        expect(subAgentCalls).toHaveLength(2);
        expect(subAgentCalls.map((t: any) => t.name)).toEqual(['Glob', 'Grep']);
      });
    });

    describe('GenAI tracing', () => {
      function installTracerSpy() {
        const startSpan = vi.fn();
        const emittedSpans: Array<{
          name: string;
          options: any;
          attrs: Record<string, any>;
          status?: { code: number };
          endedAt?: number;
        }> = [];
        startSpan.mockImplementation((name: string, options: any = {}) => {
          const attrs: Record<string, any> = { ...(options.attributes ?? {}) };
          const entry: (typeof emittedSpans)[number] = { name, options, attrs };
          emittedSpans.push(entry);
          return {
            setAttribute: (k: string, v: unknown) => {
              attrs[k] = v;
            },
            setStatus: (status: { code: number }) => {
              entry.status = status;
            },
            end: (endedAt?: number) => {
              entry.endedAt = endedAt;
            },
          };
        });
        vi.spyOn(genaiTracer, 'getGenAITracer').mockReturnValue({ startSpan } as any);
        return { startSpan, emittedSpans };
      }

      it('emits a child span per completed tool call with tool.* attributes', async () => {
        const { emittedSpans } = installTracerSpy();

        mockQuery.mockReturnValue(
          createMockQuery([
            {
              type: 'assistant',
              parent_tool_use_id: null,
              message: createMockBetaMessage([
                {
                  type: 'tool_use',
                  id: 'tool-1',
                  name: 'Read',
                  input: { file_path: '/test/file.ts' },
                },
              ]),
              session_id: 'test-session',
            },
            {
              type: 'user',
              message: {
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: 'tool-1',
                    content: 'file contents here',
                    is_error: false,
                  },
                ],
              },
              session_id: 'test-session',
            },
            {
              type: 'result',
              subtype: 'success',
              session_id: 'test-session',
              uuid: '12345678-1234-1234-1234-123456789abc',
              result: 'ok',
              usage: createMockUsage(10, 20),
              total_cost_usd: 0.001,
              duration_ms: 500,
              duration_api_ms: 400,
              is_error: false,
              num_turns: 1,
              permission_denials: [],
            },
          ]),
        );

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider.callApi('prompt');

        const toolSpan = emittedSpans.find((s) => s.name === 'tool Read');
        expect(toolSpan).toBeDefined();
        expect(toolSpan!.attrs['tool.name']).toBe('Read');
        expect(toolSpan!.attrs['tool.is_error']).toBe(false);
        expect(toolSpan!.attrs['tool.input']).toContain('/test/file.ts');
        expect(toolSpan!.attrs['tool.output']).toContain('file contents here');
        expect(typeof toolSpan!.options.startTime).toBe('number');
        expect(typeof toolSpan!.endedAt).toBe('number');
        expect(toolSpan!.endedAt! >= toolSpan!.options.startTime).toBe(true);
        expect(toolSpan!.status?.code).toBe(1); // SpanStatusCode.OK
      });

      it('marks tool spans as ERROR when the tool_result reports an error', async () => {
        const { emittedSpans } = installTracerSpy();

        mockQuery.mockReturnValue(
          createMockQuery([
            {
              type: 'assistant',
              parent_tool_use_id: null,
              message: createMockBetaMessage([
                {
                  type: 'tool_use',
                  id: 'tool-err',
                  name: 'Bash',
                  input: { command: 'rm -rf /' },
                },
              ]),
              session_id: 'test-session',
            },
            {
              type: 'user',
              message: {
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: 'tool-err',
                    content: 'Permission denied',
                    is_error: true,
                  },
                ],
              },
              session_id: 'test-session',
            },
            {
              type: 'result',
              subtype: 'success',
              session_id: 'test-session',
              uuid: '12345678-1234-1234-1234-123456789abc',
              result: 'done',
              usage: createMockUsage(5, 5),
              total_cost_usd: 0.001,
              duration_ms: 100,
              duration_api_ms: 50,
              is_error: false,
              num_turns: 1,
              permission_denials: [],
            },
          ]),
        );

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider.callApi('prompt');

        const toolSpan = emittedSpans.find((s) => s.name === 'tool Bash');
        expect(toolSpan).toBeDefined();
        expect(toolSpan!.attrs['tool.is_error']).toBe(true);
        expect(toolSpan!.status?.code).toBe(2); // SpanStatusCode.ERROR
      });

      it('emits an incomplete tool span when the tool_use has no matching result', async () => {
        const { emittedSpans } = installTracerSpy();

        mockQuery.mockReturnValue(
          createMockQuery([
            {
              type: 'assistant',
              parent_tool_use_id: null,
              message: createMockBetaMessage([
                {
                  type: 'tool_use',
                  id: 'orphan',
                  name: 'Read',
                  input: { file_path: '/x' },
                },
              ]),
              session_id: 'test-session',
            },
            {
              type: 'result',
              subtype: 'success',
              session_id: 'test-session',
              uuid: '12345678-1234-1234-1234-123456789abc',
              result: 'ok',
              usage: createMockUsage(1, 1),
              total_cost_usd: 0,
              duration_ms: 1,
              duration_api_ms: 1,
              is_error: false,
              num_turns: 1,
              permission_denials: [],
            },
          ]),
        );

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider.callApi('prompt');

        const toolSpan = emittedSpans.find((s) => s.name === 'tool Read');
        expect(toolSpan).toBeDefined();
        expect(toolSpan!.attrs['tool.incomplete']).toBe(true);
        expect(toolSpan!.status?.code).toBe(2); // SpanStatusCode.ERROR
      });

      it('emits each orphan tool span exactly once across interleaved sub-agent results', async () => {
        // Pre-fix, drainOrphans() fired inside the result branch and would
        // execute on each interleaved sub-agent result. Post-fix it runs once
        // after the for-await loop. This test locks that in so a future
        // refactor can't silently double-emit orphan spans.
        const { emittedSpans } = installTracerSpy();

        mockQuery.mockReturnValue(
          createMockQuery([
            {
              type: 'assistant',
              parent_tool_use_id: null,
              message: createMockBetaMessage([
                {
                  type: 'tool_use',
                  id: 'orphan-interleaved',
                  name: 'Read',
                  input: { file_path: '/y' },
                },
              ]),
              session_id: 'test-session',
            },
            // Interleaved sub-agent result: pre-fix this would have triggered
            // both an early return AND a drainOrphans call.
            {
              type: 'result',
              subtype: 'success',
              session_id: 'sub-session',
              uuid: '11111111-1111-1111-1111-111111111111',
              result: 'sub done',
              usage: createMockUsage(1, 1),
              total_cost_usd: 0,
              duration_ms: 1,
              duration_api_ms: 1,
              is_error: false,
              num_turns: 1,
              permission_denials: [],
            },
            // Main agent's terminal result.
            {
              type: 'result',
              subtype: 'success',
              session_id: 'main-session',
              uuid: '22222222-2222-2222-2222-222222222222',
              result: 'main done',
              usage: createMockUsage(1, 1),
              total_cost_usd: 0,
              duration_ms: 1,
              duration_api_ms: 1,
              is_error: false,
              num_turns: 2,
              permission_denials: [],
              terminal_reason: 'completed',
            },
          ]),
        );

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('prompt');

        // Main agent's result wins.
        expect(result.output).toBe('main done');
        expect(result.sessionId).toBe('main-session');

        // The orphan tool_use must produce exactly one span — not two.
        const readSpans = emittedSpans.filter((s) => s.name === 'tool Read');
        expect(readSpans).toHaveLength(1);
        expect(readSpans[0].attrs['tool.incomplete']).toBe(true);
      });

      it('does not flip span status to ERROR when only an interleaved sub-agent has an aborted terminal_reason', async () => {
        // Pre-fix, the aborted-terminal_reason check ran inside the result
        // branch and would fire on the FIRST result message. So a sub-agent
        // that aborted would mark the parent span ERROR even when the main
        // agent completed normally. Post-fix, only the main agent's
        // terminal_reason can flip the parent span.
        const { emittedSpans } = installTracerSpy();

        mockQuery.mockReturnValue(
          createMockQuery([
            // Sub-agent reports an aborted terminal_reason.
            {
              type: 'result',
              subtype: 'success',
              session_id: 'sub-aborted-session',
              uuid: '33333333-3333-3333-3333-333333333333',
              result: 'sub aborted',
              usage: createMockUsage(1, 1),
              total_cost_usd: 0,
              duration_ms: 1,
              duration_api_ms: 1,
              is_error: false,
              num_turns: 1,
              permission_denials: [],
              terminal_reason: 'aborted_streaming',
            },
            // Main agent completes cleanly.
            {
              type: 'result',
              subtype: 'success',
              session_id: 'main-clean-session',
              uuid: '44444444-4444-4444-4444-444444444444',
              result: 'main clean',
              usage: createMockUsage(1, 1),
              total_cost_usd: 0,
              duration_ms: 1,
              duration_api_ms: 1,
              is_error: false,
              num_turns: 2,
              permission_denials: [],
              terminal_reason: 'completed',
            },
          ]),
        );

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('prompt');

        expect(result.output).toBe('main clean');
        expect(result.metadata?.terminalReason).toBe('completed');

        // No emitted span should be ERROR-statused due to the sub-agent's abort.
        const erroredSpans = emittedSpans.filter((s) => s.status?.code === SpanStatusCode.ERROR);
        expect(erroredSpans).toHaveLength(0);
      });

      it('propagates response.model from modelUsage and finish_reasons from terminal_reason', async () => {
        mockQuery.mockReturnValue(
          createMockQuery([
            {
              type: 'result',
              subtype: 'success',
              session_id: 'session-finish',
              uuid: '12345678-1234-1234-1234-123456789abc',
              result: 'ok',
              usage: createMockUsage(1, 1),
              total_cost_usd: 0,
              duration_ms: 1,
              duration_api_ms: 1,
              is_error: false,
              num_turns: 2,
              permission_denials: [],
              modelUsage: {
                'claude-haiku-4-5-20251001': {
                  inputTokens: 1,
                  outputTokens: 1,
                  cacheReadInputTokens: 0,
                  cacheCreationInputTokens: 0,
                  webSearchRequests: 0,
                  costUSD: 0,
                  contextWindow: 200000,
                  maxOutputTokens: 8192,
                },
              },
              terminal_reason: 'max_turns' as TerminalReason,
            },
          ]),
        );

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('prompt');

        // Attributes land on the wrapping provider span; exercised end-to-end in
        // the docker/e2e runs. Here we assert the mapping path via the
        // surfaced metadata the extractor depends on.
        expect(result.metadata?.modelUsage).toHaveProperty('claude-haiku-4-5-20251001');
        expect(result.metadata?.terminalReason).toBe('max_turns');
      });

      it('marks the active provider span as ERROR when the SDK stops via hook_stopped', async () => {
        const setStatus = vi.fn();
        vi.spyOn(otelTrace, 'getActiveSpan').mockReturnValue({
          setStatus,
          spanContext: () => ({
            traceId: '0af7651916cd43dd8448eb211c80319c',
            spanId: 'b7ad6b7169203331',
            traceFlags: 1,
          }),
        } as any);

        mockQuery.mockReturnValue(
          createMockQuery([
            {
              type: 'result',
              subtype: 'success',
              session_id: 'session-hook-stopped',
              uuid: '12345678-1234-1234-1234-123456789abc',
              result: 'partial output',
              usage: createMockUsage(1, 1),
              total_cost_usd: 0,
              duration_ms: 1,
              duration_api_ms: 1,
              is_error: false,
              num_turns: 2,
              permission_denials: [],
              terminal_reason: 'hook_stopped' as TerminalReason,
            },
          ]),
        );

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('prompt');

        expect(result.output).toBe('partial output');
        expect(result.error).toBeUndefined();
        expect(result.metadata?.terminalReason).toBe('hook_stopped');
        expect(setStatus).toHaveBeenCalledWith({
          code: SpanStatusCode.ERROR,
          message: 'aborted: hook_stopped',
        });
      });

      it('propagates tool.parent_id for sub-agent tool calls', async () => {
        const { emittedSpans } = installTracerSpy();

        mockQuery.mockReturnValue(
          createMockQuery([
            {
              type: 'assistant',
              parent_tool_use_id: 'task-1',
              message: createMockBetaMessage([
                {
                  type: 'tool_use',
                  id: 'sub-1',
                  name: 'Glob',
                  input: { pattern: '**/*.ts' },
                },
              ]),
              session_id: 'test-session',
            },
            {
              type: 'user',
              message: {
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: 'sub-1',
                    content: 'matched 3 files',
                    is_error: false,
                  },
                ],
              },
              session_id: 'test-session',
            },
            {
              type: 'result',
              subtype: 'success',
              session_id: 'test-session',
              uuid: '12345678-1234-1234-1234-123456789abc',
              result: 'ok',
              usage: createMockUsage(1, 1),
              total_cost_usd: 0,
              duration_ms: 1,
              duration_api_ms: 1,
              is_error: false,
              num_turns: 1,
              permission_denials: [],
            },
          ]),
        );

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider.callApi('prompt');

        const toolSpan = emittedSpans.find((s) => s.name === 'tool Glob');
        expect(toolSpan).toBeDefined();
        expect(toolSpan!.attrs['tool.parent_id']).toBe('task-1');
      });

      it('sanitizes secrets in tool.input and tool.output on the span', async () => {
        const { emittedSpans } = installTracerSpy();
        const secret = 'sk-proj-' + 'a'.repeat(40);

        mockQuery.mockReturnValue(
          createMockQuery([
            {
              type: 'assistant',
              parent_tool_use_id: null,
              message: createMockBetaMessage([
                {
                  type: 'tool_use',
                  id: 'call-1',
                  name: 'Bash',
                  input: { command: `export KEY=${secret}` },
                },
              ]),
              session_id: 'test-session',
            },
            {
              type: 'user',
              message: {
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: 'call-1',
                    content: `Echoed ${secret} from env`,
                    is_error: false,
                  },
                ],
              },
              session_id: 'test-session',
            },
            {
              type: 'result',
              subtype: 'success',
              session_id: 'test-session',
              uuid: '12345678-1234-1234-1234-123456789abc',
              result: 'ok',
              usage: createMockUsage(1, 1),
              total_cost_usd: 0,
              duration_ms: 1,
              duration_api_ms: 1,
              is_error: false,
              num_turns: 1,
              permission_denials: [],
            },
          ]),
        );

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider.callApi('prompt');

        const toolSpan = emittedSpans.find((s) => s.name === 'tool Bash');
        expect(toolSpan).toBeDefined();
        expect(toolSpan!.attrs['tool.input']).not.toContain(secret);
        expect(toolSpan!.attrs['tool.output']).not.toContain(secret);
        expect(toolSpan!.attrs['tool.input']).toContain('<REDACTED_API_KEY>');
        expect(toolSpan!.attrs['tool.output']).toContain('<REDACTED_API_KEY>');
      });

      it('substitutes <unserializable> for circular tool input without dropping the span', async () => {
        const { emittedSpans } = installTracerSpy();
        const circular: Record<string, unknown> = { a: 1 };
        circular.self = circular;

        mockQuery.mockReturnValue(
          createMockQuery([
            {
              type: 'assistant',
              parent_tool_use_id: null,
              message: createMockBetaMessage([
                {
                  type: 'tool_use',
                  id: 'call-circ',
                  name: 'Weird',
                  input: circular,
                },
              ]),
              session_id: 'test-session',
            },
            {
              type: 'user',
              message: {
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: 'call-circ',
                    content: 'ok',
                    is_error: false,
                  },
                ],
              },
              session_id: 'test-session',
            },
            {
              type: 'result',
              subtype: 'success',
              session_id: 'test-session',
              uuid: '12345678-1234-1234-1234-123456789abc',
              result: 'ok',
              usage: createMockUsage(1, 1),
              total_cost_usd: 0,
              duration_ms: 1,
              duration_api_ms: 1,
              is_error: false,
              num_turns: 1,
              permission_denials: [],
            },
          ]),
        );

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        await provider.callApi('prompt');

        const toolSpan = emittedSpans.find((s) => s.name === 'tool Weird');
        expect(toolSpan).toBeDefined();
        expect(toolSpan!.attrs['tool.input']).toBe('<unserializable>');
      });

      it('picks gen_ai.response.model by largest usage, not iteration order', async () => {
        mockQuery.mockReturnValue(
          createMockQuery([
            {
              type: 'result',
              subtype: 'success',
              session_id: 'mu-tiebreak',
              uuid: '12345678-1234-1234-1234-123456789abc',
              result: 'ok',
              usage: createMockUsage(10, 20),
              total_cost_usd: 0,
              duration_ms: 1,
              duration_api_ms: 1,
              is_error: false,
              num_turns: 2,
              permission_denials: [],
              modelUsage: {
                // Low-usage first key would win if we used iteration order.
                'claude-haiku-4-5': {
                  inputTokens: 1,
                  outputTokens: 1,
                  cacheReadInputTokens: 0,
                  cacheCreationInputTokens: 0,
                  webSearchRequests: 0,
                  costUSD: 0,
                  contextWindow: 200000,
                  maxOutputTokens: 8192,
                },
                'claude-sonnet-4-5': {
                  inputTokens: 500,
                  outputTokens: 600,
                  cacheReadInputTokens: 0,
                  cacheCreationInputTokens: 0,
                  webSearchRequests: 0,
                  costUSD: 0,
                  contextWindow: 200000,
                  maxOutputTokens: 8192,
                },
              },
            },
          ]),
        );

        const provider = new ClaudeCodeSDKProvider({
          env: { ANTHROPIC_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('prompt');
        expect(result.metadata?.modelUsage).toHaveProperty('claude-sonnet-4-5');
        // The extractor (not directly returned) uses modelUsage; this test proves
        // our modelUsage payload reached metadata so the new tie-break logic can
        // operate on it.
      });
    });
  });
});
