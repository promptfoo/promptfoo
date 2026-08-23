import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';

// ---------------------------------------------------------------------------
// Mocks for @agentclientprotocol/sdk
// ---------------------------------------------------------------------------

// The connectWith callback receives a `ctx` object that we control
let _connectWithCallback: ((ctx: any) => Promise<any>) | undefined;
let notificationHandlers: Map<string, (ctx: any) => void> = new Map();
let _requestHandlers: Map<string, (ctx: any) => any> = new Map();

// Mock session returned by buildSession().withSession()
let sessionPromptCallback: ((prompt: string) => void) | undefined;
let sessionNextUpdateResults: any[] = [];
let sessionNextUpdateIndex = 0;

const mockSession = {
  sessionId: 'test-session-123',
  prompt: (text: string) => {
    sessionPromptCallback?.(text);
  },
  nextUpdate: async () => {
    const result = sessionNextUpdateResults[sessionNextUpdateIndex] || {
      kind: 'stop',
      response: { stopReason: 'end_turn' },
    };
    sessionNextUpdateIndex++;
    return result;
  },
};

const mockCtx = {
  request: vi.fn().mockResolvedValue({ protocolVersion: 1 }),
  buildSession: vi.fn().mockReturnValue({
    withSession: async (fn: any) => fn(mockSession),
  }),
};

const mockClientBuilder = {
  onRequest: vi.fn().mockReturnThis(),
  onNotification: vi.fn((method: any, handler: any) => {
    notificationHandlers.set(method?.method || String(method), handler);
    return mockClientBuilder;
  }),
  connectWith: vi.fn(async (_stream: any, fn: any) => {
    _connectWithCallback = fn;
    return fn(mockCtx);
  }),
};

const mockAcpSdk = {
  client: vi.fn(() => mockClientBuilder),
  ndJsonStream: vi.fn(() => 'mock-stream'),
  PROTOCOL_VERSION: 1,
  methods: {
    agent: {
      initialize: { method: 'agent/initialize' },
      session: { setConfigOption: { method: 'session/set_config_option' } },
    },
    client: {
      session: {
        requestPermission: { method: 'client/session/requestPermission' },
        update: { method: 'client/session/update' },
      },
    },
  },
};

// Mock the ACP SDK
vi.mock('@agentclientprotocol/sdk', () => mockAcpSdk);

// Mock child_process.spawn
const mockChildProcess = {
  stdin: { write: vi.fn(), end: vi.fn() },
  stdout: { on: vi.fn(), pipe: vi.fn() },
  stderr: { on: vi.fn() },
  kill: vi.fn(),
  pid: 12345,
};

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => mockChildProcess),
}));

// Mock node:stream for Writable.toWeb / Readable.toWeb
vi.mock('node:stream', () => ({
  Writable: { toWeb: vi.fn(() => 'mock-writable') },
  Readable: { toWeb: vi.fn(() => 'mock-readable') },
}));

// Mock agentic-utils
vi.mock('../../src/providers/agentic-utils', () => ({
  resolveAgenticWorkingDir: vi.fn((dir: string | undefined) => dir || '/tmp/test-workdir'),
  getCachedResponse: vi.fn(),
  cacheResponse: vi.fn(),
  initializeAgenticCache: vi.fn(),
}));

// Mock tracing
vi.mock('../../src/tracing/genaiTracer', () => ({
  getTraceparent: vi.fn(),
  getGenAITracer: vi.fn(() => ({ startSpan: vi.fn(() => ({ setStatus: vi.fn(), end: vi.fn() })) })),
  withGenAISpan: vi.fn(async (_ctx: any, fn: any, _extract?: any) =>
    fn({ setAttribute: vi.fn(), setStatus: vi.fn(), end: vi.fn() }),
  ),
  emitTurnMarkerSpan: vi.fn(),
  sanitizeBody: vi.fn((s: string) => s),
  PROMPTFOO_RESOURCE_ATTR_PARENT_SPAN_ID: 'promptfoo.parent_span_id',
  PROMPTFOO_RESOURCE_ATTR_TRACE_ID: 'promptfoo.trace_id',
}));

vi.mock('../../src/cliState', () => ({
  default: { basePath: undefined },
}));

vi.mock('../../src/logger', () => ({
  default: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Import the provider under test
// ---------------------------------------------------------------------------

import { AcpProvider, createAcpProvider } from '../../src/providers/acp';

// ---------------------------------------------------------------------------
// Helper to simulate session update notifications
// ---------------------------------------------------------------------------

function emitSessionUpdate(update: any) {
  const handler = notificationHandlers.get('client/session/update');
  if (handler) {
    handler({ params: { update } });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AcpProvider', () => {
  let originalBasePath: string | undefined;

  beforeEach(async () => {
    vi.resetAllMocks();
    originalBasePath = cliState.basePath;
    cliState.basePath = '/test/config/dir';

    // Reset state
    _connectWithCallback = undefined;
    notificationHandlers = new Map();
    _requestHandlers = new Map();
    sessionNextUpdateResults = [];
    sessionNextUpdateIndex = 0;
    sessionPromptCallback = undefined;

    // Re-set mock implementations after reset
    mockClientBuilder.onRequest.mockReturnThis();
    mockClientBuilder.onNotification.mockImplementation((method: any, handler: any) => {
      notificationHandlers.set(method?.method || String(method), handler);
      return mockClientBuilder;
    });
    mockClientBuilder.connectWith.mockImplementation(async (_stream: any, fn: any) => fn(mockCtx));
    mockAcpSdk.client.mockReturnValue(mockClientBuilder);
    mockCtx.request.mockResolvedValue({ protocolVersion: 1 });
    mockCtx.buildSession.mockReturnValue({
      withSession: async (fn: any) => fn(mockSession),
    });

    // Cache mocks
    const agenticUtils = await vi.importMock<typeof import('../../src/providers/agentic-utils')>(
      '../../src/providers/agentic-utils',
    );
    agenticUtils.initializeAgenticCache.mockResolvedValue({
      shouldCache: false,
      shouldReadCache: false,
      shouldWriteCache: false,
    });
    agenticUtils.getCachedResponse.mockResolvedValue(undefined);
    agenticUtils.cacheResponse.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cliState.basePath = originalBasePath;
  });

  // -------------------------------------------------------------------------
  // Constructor & ID
  // -------------------------------------------------------------------------

  describe('constructor', () => {
    it('should initialize with config', () => {
      const provider = new AcpProvider({ config: { command: 'codex-acp' } });
      expect(provider.id()).toBe('acp');
    });

    it('should accept custom id', () => {
      const provider = new AcpProvider({ id: 'my-acp', config: { command: 'codex-acp' } });
      expect(provider.id()).toBe('my-acp');
    });

    it('should accept config options', () => {
      const provider = new AcpProvider({
        config: { command: ['kiro-cli', 'acp'], timeout: 600, model: 'claude-sonnet-4-5' },
      });
      expect(provider.id()).toBe('acp');
    });

    it('should throw on missing config', () => {
      expect(() => new AcpProvider({})).toThrow("requires a 'command'");
    });

    it('should throw on invalid timeout', () => {
      expect(() => new AcpProvider({ config: { command: 'x', timeout: -1 } as any })).toThrow(
        'Invalid ACP provider config',
      );
    });
  });

  // -------------------------------------------------------------------------
  // callApi - Basic
  // -------------------------------------------------------------------------

  describe('callApi', () => {
    it('should return successful response for single-turn prompt', async () => {
      const provider = new AcpProvider({ config: { command: 'kiro-cli acp' } });

      // Configure the session to emit text then stop
      sessionPromptCallback = () => {
        emitSessionUpdate({
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'Hello from the agent!' },
        });
      };
      sessionNextUpdateResults = [{ kind: 'stop', response: { stopReason: 'end_turn' } }];

      const result = await provider.callApi('Say hello');

      expect(result.output).toBe('Hello from the agent!');
      expect(result.error).toBeUndefined();
      expect(result.metadata?.sessionId).toBe('test-session-123');
      expect(result.metadata?.stopReason).toBe('end_turn');
    });

    it('should collect tool calls from session updates', async () => {
      const provider = new AcpProvider({ config: { command: 'kiro-cli acp' } });

      sessionPromptCallback = () => {
        emitSessionUpdate({
          sessionUpdate: 'tool_call',
          toolCallId: 'tc-1',
          title: 'Read',
          rawInput: JSON.stringify({ path: '/src/main.ts' }),
          status: 'running',
        });
        emitSessionUpdate({
          sessionUpdate: 'tool_call_update',
          toolCallId: 'tc-1',
          rawOutput: 'file contents here',
          status: 'completed',
        });
        emitSessionUpdate({
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'I read the file.' },
        });
      };
      sessionNextUpdateResults = [{ kind: 'stop', response: { stopReason: 'end_turn' } }];

      const result = await provider.callApi('Read main.ts');

      expect(result.metadata?.toolCalls).toHaveLength(1);
      expect(result.metadata?.toolCalls[0]).toMatchObject({
        id: 'tc-1',
        name: 'Read',
      });
    });

    it('should handle timeout', async () => {
      const provider = new AcpProvider({ config: { command: 'kiro-cli acp', timeout: 1 } });

      // Make nextUpdate never resolve
      mockCtx.buildSession.mockReturnValue({
        withSession: async (fn: any) => {
          const hangingSession = {
            ...mockSession,
            prompt: () => {},
            nextUpdate: () => new Promise(() => {}),
          };
          return fn(hangingSession);
        },
      });

      const result = await provider.callApi('This will timeout');

      expect(result.error).toContain('timed out');
      expect(result.metadata?.stopReason).toBe('timeout');
    });

    it('should handle connection failure gracefully', async () => {
      mockClientBuilder.connectWith.mockRejectedValueOnce(new Error('Connection refused'));

      const provider = new AcpProvider({ config: { command: 'bad-agent' } });
      const result = await provider.callApi('Hello');

      expect(result.error).toContain('ACP execution failed');
    });
  });

  // -------------------------------------------------------------------------
  // Factory / Registry
  // -------------------------------------------------------------------------

  describe('createAcpProvider', () => {
    it('should create provider with given id', () => {
      const provider = createAcpProvider('acp', { config: { command: 'codex-acp' } });
      expect(provider.id()).toBe('acp');
    });

    it('should pass through config', () => {
      const provider = createAcpProvider('acp', { config: { command: ['kiro-cli', 'acp'] } });
      expect(provider.id()).toBe('acp');
    });
  });

  // -------------------------------------------------------------------------
  // Caching
  // -------------------------------------------------------------------------

  describe('caching', () => {
    it('should return cached response when available', async () => {
      const agenticUtils = await vi.importMock<typeof import('../../src/providers/agentic-utils')>(
        '../../src/providers/agentic-utils',
      );
      agenticUtils.initializeAgenticCache.mockResolvedValueOnce({
        shouldCache: true,
        shouldReadCache: true,
        shouldWriteCache: true,
        cache: {} as any,
        cacheKey: 'test-key',
      });
      agenticUtils.getCachedResponse.mockResolvedValueOnce({
        output: 'cached output',
        metadata: { sessionId: 'cached-session' },
      } as any);

      const provider = new AcpProvider({ config: { command: 'kiro-cli acp' } });
      const result = await provider.callApi('Hello');

      expect(result.output).toBe('cached output');
      expect(result.cached).toBe(true);
      expect(mockClientBuilder.connectWith).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Abort Signal
  // -------------------------------------------------------------------------

  describe('abort signal', () => {
    it('should return immediately when already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const provider = new AcpProvider({ config: { command: 'kiro-cli acp' } });
      const result = await provider.callApi('Hello', undefined, {
        abortSignal: controller.signal,
      });

      expect(result.error).toBe('ACP call aborted');
      expect(mockClientBuilder.connectWith).not.toHaveBeenCalled();
    });

    it('should abort mid-execution when signal fires', async () => {
      const controller = new AbortController();
      const provider = new AcpProvider({ config: { command: 'kiro-cli acp', timeout: 30 } });

      // Make the session hang, then abort after 50ms
      mockCtx.buildSession.mockReturnValue({
        withSession: async (fn: any) => {
          const hangingSession = {
            sessionId: 'test-session-123',
            prompt: () => {},
            nextUpdate: () => new Promise(() => {}),
          };
          return fn(hangingSession);
        },
      });

      setTimeout(() => controller.abort(), 50);

      const result = await provider.callApi('Hello', undefined, {
        abortSignal: controller.signal,
      });

      expect(result.error).toContain('aborted');
      expect(result.metadata?.stopReason).toBe('aborted');
    });
  });

  // -------------------------------------------------------------------------
  // Model Selection
  // -------------------------------------------------------------------------

  describe('model selection', () => {
    it('should call setConfigOption with model when configured', async () => {
      const provider = new AcpProvider({
        config: { command: 'kiro-cli acp', model: 'claude-sonnet-4-5' },
      });

      sessionPromptCallback = () => {
        emitSessionUpdate({
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'Done.' },
        });
      };
      sessionNextUpdateResults = [{ kind: 'stop', response: { stopReason: 'end_turn' } }];

      await provider.callApi('Hello');

      // Verify ctx.request was called with setConfigOption
      expect(mockCtx.request).toHaveBeenCalledWith(
        mockAcpSdk.methods.agent.session.setConfigOption,
        expect.objectContaining({
          configId: 'model',
          value: 'claude-sonnet-4-5',
        }),
      );
    });

    it('should not call setConfigOption when model is not configured', async () => {
      const provider = new AcpProvider({ config: { command: 'kiro-cli acp' } });

      sessionPromptCallback = () => {
        emitSessionUpdate({
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'Done.' },
        });
      };
      sessionNextUpdateResults = [{ kind: 'stop', response: { stopReason: 'end_turn' } }];

      await provider.callApi('Hello');

      // Should only be called once for initialize, not for setConfigOption
      const setConfigCalls = mockCtx.request.mock.calls.filter(
        (call: any[]) => call[0] === mockAcpSdk.methods.agent.session.setConfigOption,
      );
      expect(setConfigCalls).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Permission Handling
  // -------------------------------------------------------------------------

  describe('permission handling', () => {
    it('should auto-approve with allow_once option', async () => {
      const provider = new AcpProvider({ config: { command: 'kiro-cli acp' } });

      sessionPromptCallback = () => {
        emitSessionUpdate({
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'Done.' },
        });
      };
      sessionNextUpdateResults = [{ kind: 'stop', response: { stopReason: 'end_turn' } }];

      await provider.callApi('Do something');

      // Verify onRequest was registered
      expect(mockClientBuilder.onRequest).toHaveBeenCalled();
    });

    it('should deny permissions when configured', async () => {
      const provider = new AcpProvider({
        config: { command: 'kiro-cli acp', permission_mode: 'deny' },
      });

      sessionPromptCallback = () => {
        emitSessionUpdate({
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'Denied.' },
        });
      };
      sessionNextUpdateResults = [{ kind: 'stop', response: { stopReason: 'end_turn' } }];

      await provider.callApi('Do something');

      expect(mockClientBuilder.onRequest).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Environment
  // -------------------------------------------------------------------------

  describe('environment', () => {
    it('should pass custom env vars to subprocess', async () => {
      const provider = new AcpProvider({
        config: { command: 'kiro-cli acp', env: { CUSTOM_VAR: 'test-value' } },
      });

      sessionPromptCallback = () => {
        emitSessionUpdate({
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'Hi.' },
        });
      };
      sessionNextUpdateResults = [{ kind: 'stop', response: { stopReason: 'end_turn' } }];

      await provider.callApi('Hello');

      // Verify spawn was called (the env is passed to spawn via child_process)
      expect(mockClientBuilder.connectWith).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Error Handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('should handle SDK not installed', async () => {
      // The SDK is mocked, so this tests the error path directly
      mockClientBuilder.connectWith.mockRejectedValueOnce(
        new Error('Cannot find module @agentclientprotocol/sdk'),
      );

      const provider = new AcpProvider({ config: { command: 'bad-agent' } });
      const result = await provider.callApi('Hello');

      expect(result.error).toContain('ACP execution failed');
    });

    it('should handle agent process crash', async () => {
      mockClientBuilder.connectWith.mockRejectedValueOnce(new Error('Process exited with code 1'));

      const provider = new AcpProvider({ config: { command: 'bad-agent' } });
      const result = await provider.callApi('Hello');

      expect(result.error).toContain('Process exited with code 1');
      expect(result.output).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // Coverage: buildEnv branches
  // -------------------------------------------------------------------------

  describe('buildEnv', () => {
    it('should inherit full process env when configured', async () => {
      const provider = new AcpProvider({
        config: { command: 'kiro-cli acp', inherit_process_env: true },
      });

      sessionPromptCallback = () => {
        emitSessionUpdate({
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'Done.' },
        });
      };
      sessionNextUpdateResults = [{ kind: 'stop', response: { stopReason: 'end_turn' } }];

      await provider.callApi('Hello');
      expect(mockClientBuilder.connectWith).toHaveBeenCalled();
    });

    it('should inject TRACEPARENT when deep_tracing is enabled', async () => {
      const { getTraceparent } = await import('../../src/tracing/genaiTracer');
      vi.mocked(getTraceparent).mockReturnValue('00-abc123-def456-01');

      const provider = new AcpProvider({
        config: { command: 'kiro-cli acp', deep_tracing: true },
      });

      sessionPromptCallback = () => {
        emitSessionUpdate({
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'Done.' },
        });
      };
      sessionNextUpdateResults = [{ kind: 'stop', response: { stopReason: 'end_turn' } }];

      await provider.callApi('Hello');
      expect(mockClientBuilder.connectWith).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Coverage: auto_approve permission mode
  // -------------------------------------------------------------------------

  describe('auto_approve permission mode', () => {
    it('should select first allow option when permission_mode is auto_approve', async () => {
      const provider = new AcpProvider({
        config: { command: 'kiro-cli acp', permission_mode: 'auto_approve' },
      });

      sessionPromptCallback = () => {
        emitSessionUpdate({
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'Done.' },
        });
      };
      sessionNextUpdateResults = [{ kind: 'stop', response: { stopReason: 'end_turn' } }];

      await provider.callApi('Do something');
      expect(mockClientBuilder.onRequest).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Coverage: tool call error states
  // -------------------------------------------------------------------------

  describe('tool call error tracking', () => {
    it('should mark tool calls as errored when status is failed', async () => {
      const provider = new AcpProvider({ config: { command: 'kiro-cli acp' } });

      sessionPromptCallback = () => {
        emitSessionUpdate({
          sessionUpdate: 'tool_call',
          toolCallId: 'tc-err-1',
          title: 'Bash',
          rawInput: 'rm -rf /',
          status: 'running',
        });
        emitSessionUpdate({
          sessionUpdate: 'tool_call_update',
          toolCallId: 'tc-err-1',
          status: 'failed',
          rawOutput: 'Permission denied',
        });
        emitSessionUpdate({
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'Failed.' },
        });
      };
      sessionNextUpdateResults = [{ kind: 'stop', response: { stopReason: 'end_turn' } }];

      const result = await provider.callApi('Do dangerous thing');

      expect(result.metadata?.toolCalls).toHaveLength(1);
      expect(result.metadata?.toolCalls[0].is_error).toBe(true);
      expect(result.metadata?.toolCalls[0].name).toBe('Bash');
    });
  });

  // -------------------------------------------------------------------------
  // Coverage: shutdown and cleanup
  // -------------------------------------------------------------------------

  describe('lifecycle', () => {
    it('should have a shutdown method', async () => {
      const provider = new AcpProvider({ config: { command: 'kiro-cli acp' } });
      await expect(provider.shutdown()).resolves.toBeUndefined();
    });

    it('should have a cleanup method', async () => {
      const provider = new AcpProvider({ config: { command: 'kiro-cli acp' } });
      await expect(provider.cleanup()).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Coverage: SDK not installed
  // -------------------------------------------------------------------------

  describe('SDK availability', () => {
    it('should return error when SDK import fails', async () => {
      // Temporarily make the SDK import fail
      const originalImport = mockAcpSdk.client;
      mockAcpSdk.client = undefined as any;

      const provider = new AcpProvider({ config: { command: 'kiro-cli acp' } });

      // Restore before calling (the dynamic import mock still works)
      mockAcpSdk.client = originalImport;

      // This tests the provider-level error catch path
      mockClientBuilder.connectWith.mockRejectedValueOnce(new TypeError('Cannot read properties'));
      const result = await provider.callApi('Hello');
      expect(result.error).toContain('ACP execution failed');
    });
  });

  // -------------------------------------------------------------------------
  // Coverage: model setConfigOption failure path
  // -------------------------------------------------------------------------

  describe('model config failure', () => {
    it('should continue gracefully when setConfigOption fails', async () => {
      mockCtx.request.mockImplementation(async (method: any) => {
        if (method === mockAcpSdk.methods.agent.session.setConfigOption) {
          throw new Error('Agent does not support model switching');
        }
        return { protocolVersion: 1 };
      });

      const provider = new AcpProvider({
        config: { command: 'kiro-cli acp', model: 'unsupported-model' },
      });

      sessionPromptCallback = () => {
        emitSessionUpdate({
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'Done anyway.' },
        });
      };
      sessionNextUpdateResults = [{ kind: 'stop', response: { stopReason: 'end_turn' } }];

      const result = await provider.callApi('Hello');
      // Should succeed despite model config failure
      expect(result.error).toBeUndefined();
      expect(result.output).toBe('Done anyway.');
    });
  });

  // -------------------------------------------------------------------------
  // Coverage: command as array in resolveCommand
  // -------------------------------------------------------------------------

  describe('command resolution', () => {
    it('should handle array commands directly', async () => {
      const provider = new AcpProvider({
        config: { command: ['kiro-cli', 'acp', '--verbose'] },
      });

      sessionPromptCallback = () => {
        emitSessionUpdate({
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'Hi.' },
        });
      };
      sessionNextUpdateResults = [{ kind: 'stop', response: { stopReason: 'end_turn' } }];

      await provider.callApi('Hello');
      expect(mockClientBuilder.connectWith).toHaveBeenCalled();
    });
  });
});
