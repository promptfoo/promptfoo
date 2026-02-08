import fs from 'fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createOpenClawProvider,
  OpenClawAgentProvider,
  OpenClawChatProvider,
  OpenClawResponsesProvider,
  OpenClawToolInvokeProvider,
  readOpenClawConfig,
  resetConfigCache,
  resolveAuthToken,
  resolveGatewayUrl,
} from '../../src/providers/openclaw';

vi.mock('../../src/envars', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/envars')>();
  return {
    ...actual,
    getEnvString: vi.fn((key: string) => {
      if (key === 'OPENCLAW_GATEWAY_URL') {
        return process.env.OPENCLAW_GATEWAY_URL;
      }
      if (key === 'OPENCLAW_GATEWAY_TOKEN') {
        return process.env.OPENCLAW_GATEWAY_TOKEN;
      }
      return undefined;
    }),
  };
});

vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const websocketMocks = vi.hoisted(() => {
  let factory: (() => any) | null = null;

  const WebSocketMock = vi.fn(function () {
    return factory?.() ?? {};
  });

  const setFactory = (nextFactory: () => any) => {
    factory = nextFactory;
  };

  return { WebSocketMock, setFactory };
});

vi.mock('ws', () => ({
  default: websocketMocks.WebSocketMock,
}));

const mockFetchWithProxy = vi.hoisted(() => vi.fn());
vi.mock('../../src/util/fetch/index', () => ({
  fetchWithProxy: mockFetchWithProxy,
}));

describe('OpenClaw Provider', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    resetConfigCache();
    process.env = { ...originalEnv };
    delete process.env.OPENCLAW_GATEWAY_URL;
    delete process.env.OPENCLAW_GATEWAY_TOKEN;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('readOpenClawConfig', () => {
    it('should return undefined when config file does not exist', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      expect(readOpenClawConfig()).toBeUndefined();
    });

    it('should parse valid JSON config', () => {
      const configContent = JSON.stringify({
        gateway: {
          port: 19000,
          auth: {
            mode: 'token',
            token: 'test-token-abc123',
          },
        },
      });
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 1000 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(configContent);

      const config = readOpenClawConfig();
      expect(config?.gateway?.port).toBe(19000);
      expect(config?.gateway?.auth?.token).toBe('test-token-abc123');
    });

    it('should handle JSON5 with comments and trailing commas', () => {
      const json5Content = `{
        // This is a comment
        "gateway": {
          "port": 19000,
          "auth": {
            "token": "my-token",
          },
        },
      }`;
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 2000 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(json5Content);

      const config = readOpenClawConfig();
      expect(config?.gateway?.port).toBe(19000);
      expect(config?.gateway?.auth?.token).toBe('my-token');
    });

    it('should handle JSON5 with block comments', () => {
      const json5Content = `{
        /* block comment */
        "gateway": {
          "port": 19000
        }
      }`;
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 3000 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(json5Content);

      const config = readOpenClawConfig();
      expect(config?.gateway?.port).toBe(19000);
    });

    it('should preserve URLs in strings when stripping comments', () => {
      const json5Content = `{
        // This is a comment
        "gateway": {
          "port": 19000,
          "url": "http://example.com/path"
        }
      }`;
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 4000 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(json5Content);

      const config = readOpenClawConfig();
      expect(config?.gateway?.port).toBe(19000);
      expect((config?.gateway as any)?.url).toBe('http://example.com/path');
    });

    it('should return undefined on parse error', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 5000 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue('not valid json {{{');

      expect(readOpenClawConfig()).toBeUndefined();
    });

    it('should use cached config when mtime has not changed', () => {
      const configContent = JSON.stringify({
        gateway: { port: 19000 },
      });
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 6000 } as fs.Stats);
      const readSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue(configContent);

      // First call reads the file
      const config1 = readOpenClawConfig();
      expect(config1?.gateway?.port).toBe(19000);
      expect(readSpy).toHaveBeenCalledTimes(1);

      // Second call with same mtime should use cache
      const config2 = readOpenClawConfig();
      expect(config2?.gateway?.port).toBe(19000);
      expect(readSpy).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should re-read config when mtime changes', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const statSpy = vi.spyOn(fs, 'statSync');
      const readSpy = vi.spyOn(fs, 'readFileSync');

      // First call
      statSpy.mockReturnValue({ mtimeMs: 7000 } as fs.Stats);
      readSpy.mockReturnValue(JSON.stringify({ gateway: { port: 19000 } }));
      const config1 = readOpenClawConfig();
      expect(config1?.gateway?.port).toBe(19000);

      // Second call with different mtime
      statSpy.mockReturnValue({ mtimeMs: 8000 } as fs.Stats);
      readSpy.mockReturnValue(JSON.stringify({ gateway: { port: 20000 } }));
      const config2 = readOpenClawConfig();
      expect(config2?.gateway?.port).toBe(20000);
      expect(readSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('resolveGatewayUrl', () => {
    it('should use explicit config first', () => {
      expect(resolveGatewayUrl({ gateway_url: 'http://custom:9999' })).toBe('http://custom:9999');
    });

    it('should use environment variable second', () => {
      process.env.OPENCLAW_GATEWAY_URL = 'http://env-host:8888';
      expect(resolveGatewayUrl()).toBe('http://env-host:8888');
    });

    it('should auto-detect from config file third', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 9000 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ gateway: { port: 20000 } }));

      expect(resolveGatewayUrl()).toBe('http://127.0.0.1:20000');
    });

    it('should use bind field from config when not loopback', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 10000 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({ gateway: { port: 20000, bind: '0.0.0.0' } }),
      );

      expect(resolveGatewayUrl()).toBe('http://0.0.0.0:20000');
    });

    it('should treat loopback bind as 127.0.0.1', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 11000 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({ gateway: { port: 20000, bind: 'loopback' } }),
      );

      expect(resolveGatewayUrl()).toBe('http://127.0.0.1:20000');
    });

    it('should fall back to default', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      expect(resolveGatewayUrl()).toBe('http://127.0.0.1:18789');
    });
  });

  describe('resolveAuthToken', () => {
    it('should use explicit config first', () => {
      expect(resolveAuthToken({ auth_token: 'explicit-token' })).toBe('explicit-token');
    });

    it('should use environment variable second', () => {
      process.env.OPENCLAW_GATEWAY_TOKEN = 'env-token';
      expect(resolveAuthToken()).toBe('env-token');
    });

    it('should auto-detect from config file third', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 12000 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          gateway: { auth: { token: 'config-file-token' } },
        }),
      );

      expect(resolveAuthToken()).toBe('config-file-token');
    });

    it('should return undefined when no token available', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      expect(resolveAuthToken()).toBeUndefined();
    });
  });

  describe('OpenClawChatProvider', () => {
    beforeEach(() => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    });

    it('should initialize with correct agent ID', () => {
      const provider = new OpenClawChatProvider('main', {});
      expect(provider.id()).toBe('openclaw:main');
    });

    it('should return correct string representation', () => {
      const provider = new OpenClawChatProvider('coding-agent', {});
      expect(provider.toString()).toBe('[OpenClaw Provider coding-agent]');
    });

    it('should return correct default API URL', () => {
      const provider = new OpenClawChatProvider('main', {});
      expect(provider.getApiUrlDefault()).toBe('http://127.0.0.1:18789/v1');
    });

    it('should use explicit gateway URL from config', () => {
      const provider = new OpenClawChatProvider('main', {
        config: { gateway_url: 'http://myhost:9999' },
      });
      expect(provider.config.apiBaseUrl).toBe('http://myhost:9999/v1');
    });

    it('should use auth token from config', () => {
      const provider = new OpenClawChatProvider('main', {
        config: { auth_token: 'my-secret-token' },
      });
      expect(provider.config.apiKey).toBe('my-secret-token');
    });

    it('should set agent ID header', () => {
      const provider = new OpenClawChatProvider('coding-agent', {});
      expect(provider.config.headers?.['x-openclaw-agent-id']).toBe('coding-agent');
    });

    it('should set session key header when provided', () => {
      const provider = new OpenClawChatProvider('main', {
        config: { session_key: 'my-session' },
      });
      expect(provider.config.headers?.['x-openclaw-session-key']).toBe('my-session');
    });

    it('should not set session key header when not provided', () => {
      const provider = new OpenClawChatProvider('main', {});
      expect(provider.config.headers?.['x-openclaw-session-key']).toBeUndefined();
    });

    it('should set thinking level header when provided', () => {
      const provider = new OpenClawChatProvider('main', {
        config: { thinking_level: 'high' },
      });
      expect(provider.config.headers?.['x-openclaw-thinking-level']).toBe('high');
    });

    it('should not set thinking level header when not provided', () => {
      const provider = new OpenClawChatProvider('main', {});
      expect(provider.config.headers?.['x-openclaw-thinking-level']).toBeUndefined();
    });
  });

  describe('OpenClawResponsesProvider', () => {
    beforeEach(() => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    });

    it('should initialize with correct agent ID', () => {
      const provider = new OpenClawResponsesProvider('main', {});
      expect(provider.id()).toBe('openclaw:responses:main');
    });

    it('should return correct string representation', () => {
      const provider = new OpenClawResponsesProvider('coding-agent', {});
      expect(provider.toString()).toBe('[OpenClaw Responses Provider coding-agent]');
    });

    it('should use explicit gateway URL from config', () => {
      const provider = new OpenClawResponsesProvider('main', {
        config: { gateway_url: 'http://myhost:9999' },
      });
      expect(provider.config.apiBaseUrl).toBe('http://myhost:9999/v1');
    });

    it('should use auth token from config', () => {
      const provider = new OpenClawResponsesProvider('main', {
        config: { auth_token: 'my-secret-token' },
      });
      expect(provider.config.apiKey).toBe('my-secret-token');
    });

    it('should set agent ID header', () => {
      const provider = new OpenClawResponsesProvider('beta', {});
      expect(provider.config.headers?.['x-openclaw-agent-id']).toBe('beta');
    });

    it('should set session key and thinking level headers', () => {
      const provider = new OpenClawResponsesProvider('main', {
        config: { session_key: 'my-session', thinking_level: 'high' },
      });
      expect(provider.config.headers?.['x-openclaw-session-key']).toBe('my-session');
      expect(provider.config.headers?.['x-openclaw-thinking-level']).toBe('high');
    });

    it('should strip text field from request body in getOpenAiBody', async () => {
      const provider = new OpenClawResponsesProvider('main', {});
      const result = await provider.getOpenAiBody('test prompt');
      expect(result.body).not.toHaveProperty('text');
    });
  });

  describe('OpenClawToolInvokeProvider', () => {
    beforeEach(() => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    });

    it('should initialize with correct tool name', () => {
      const provider = new OpenClawToolInvokeProvider('bash', {});
      expect(provider.id()).toBe('openclaw:tools:bash');
    });

    it('should return correct string representation', () => {
      const provider = new OpenClawToolInvokeProvider('agents_list', {});
      expect(provider.toString()).toBe('[OpenClaw Tool Provider agents_list]');
    });

    it('should handle successful tool invocation', async () => {
      const provider = new OpenClawToolInvokeProvider('bash', {
        config: { gateway_url: 'http://test:18789' },
      });

      const mockResponse = { ok: true, result: 'command output' };
      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await provider.callApi('{"command": "echo hello"}');
      expect(result.output).toBe('command output');
    });

    it('should handle JSON args from prompt', async () => {
      const provider = new OpenClawToolInvokeProvider('bash', {
        config: { gateway_url: 'http://test:18789' },
      });

      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: 'ok' }),
      } as Response);

      await provider.callApi('{"key": "value"}');

      const fetchCall = mockFetchWithProxy.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.tool).toBe('bash');
      expect(body.args).toEqual({ key: 'value' });
    });

    it('should fall back to input arg for non-JSON prompts', async () => {
      const provider = new OpenClawToolInvokeProvider('bash', {
        config: { gateway_url: 'http://test:18789' },
      });

      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: 'ok' }),
      } as Response);

      await provider.callApi('echo hello');

      const fetchCall = mockFetchWithProxy.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.args).toEqual({ input: 'echo hello' });
    });

    it('should handle tool errors', async () => {
      const provider = new OpenClawToolInvokeProvider('bash', {
        config: { gateway_url: 'http://test:18789' },
      });

      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: false, error: 'command not found' }),
      } as Response);

      const result = await provider.callApi('{"command": "bad"}');
      expect(result.error).toBe('command not found');
    });

    it('should handle HTTP errors', async () => {
      const provider = new OpenClawToolInvokeProvider('bash', {
        config: { gateway_url: 'http://test:18789' },
      });

      mockFetchWithProxy.mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      } as Response);

      const result = await provider.callApi('{}');
      expect(result.error).toContain('404');
    });

    it('should include auth token in request', async () => {
      const provider = new OpenClawToolInvokeProvider('bash', {
        config: { gateway_url: 'http://test:18789', auth_token: 'my-token' },
      });

      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: 'ok' }),
      } as Response);

      await provider.callApi('{}');

      const fetchCall = mockFetchWithProxy.mock.calls[0];
      const headers = fetchCall[1]?.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer my-token');
    });

    it('should include session key when configured', async () => {
      const provider = new OpenClawToolInvokeProvider('bash', {
        config: { gateway_url: 'http://test:18789', session_key: 'my-session' },
      });

      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: 'ok' }),
      } as Response);

      await provider.callApi('{}');

      const fetchCall = mockFetchWithProxy.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.sessionKey).toBe('my-session');
    });

    it('should stringify non-string results', async () => {
      const provider = new OpenClawToolInvokeProvider('bash', {
        config: { gateway_url: 'http://test:18789' },
      });

      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: { key: 'value' } }),
      } as Response);

      const result = await provider.callApi('{}');
      expect(result.output).toBe('{"key":"value"}');
    });

    it('should handle network errors', async () => {
      const provider = new OpenClawToolInvokeProvider('bash', {
        config: { gateway_url: 'http://test:18789' },
      });

      mockFetchWithProxy.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await provider.callApi('{}');
      expect(result.error).toContain('ECONNREFUSED');
    });
  });

  describe('OpenClawAgentProvider', () => {
    let mockWs: any;
    let messageHandlers: Map<string, Function>;

    beforeEach(() => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      messageHandlers = new Map();
      mockWs = {
        on: vi.fn((event: string, handler: Function) => {
          messageHandlers.set(event, handler);
        }),
        send: vi.fn(),
        close: vi.fn(),
      };
      websocketMocks.WebSocketMock.mockClear();
      websocketMocks.setFactory(() => mockWs);
    });

    it('should initialize with correct agent ID', () => {
      const provider = new OpenClawAgentProvider('main', {});
      expect(provider.id()).toBe('openclaw:agent:main');
    });

    it('should return correct string representation', () => {
      const provider = new OpenClawAgentProvider('my-agent', {});
      expect(provider.toString()).toBe('[OpenClaw Agent Provider my-agent]');
    });

    /** Helper: simulate challenge → connect → agent accepted flow, return agent req ID */
    function simulateHandshake(onMessage: Function) {
      // Challenge
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'connect.challenge',
            payload: { nonce: 'abc', ts: Date.now() },
          }),
        ),
      );

      // Connect response
      const connectReq = JSON.parse(mockWs.send.mock.calls[0][0]);
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'res',
            id: connectReq.id,
            ok: true,
            payload: { type: 'hello-ok' },
          }),
        ),
      );

      const agentReq = JSON.parse(mockWs.send.mock.calls[1][0]);

      // Agent accepted → triggers agent.wait
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'res',
            id: agentReq.id,
            ok: true,
            payload: { runId: 'run-1', status: 'accepted' },
          }),
        ),
      );

      const waitReq = JSON.parse(mockWs.send.mock.calls[2][0]);
      return { connectReq, agentReq, waitReq };
    }

    it('should complete full handshake and receive response', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789', auth_token: 'test-token' },
      });

      const promise = provider.callApi('Hello agent');
      const onMessage = messageHandlers.get('message')!;
      const { connectReq, agentReq, waitReq } = simulateHandshake(onMessage);

      // Verify connect request
      expect(connectReq.type).toBe('req');
      expect(connectReq.method).toBe('connect');
      expect(connectReq.params.auth.token).toBe('test-token');

      // Verify agent request
      expect(agentReq.method).toBe('agent');
      expect(agentReq.params.message).toBe('Hello agent');
      expect(agentReq.params.agentId).toBe('main');

      // Verify wait request
      expect(waitReq.method).toBe('agent.wait');
      expect(waitReq.params.runId).toBe('run-1');

      // Streaming event with assistant text
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'agent',
            payload: {
              runId: 'run-1',
              stream: 'assistant',
              data: { text: 'Agent reply' },
              seq: 1,
              ts: Date.now(),
            },
          }),
        ),
      );

      // Wait response signals completion
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'res',
            id: waitReq.id,
            ok: true,
            payload: { runId: 'run-1', status: 'ok' },
          }),
        ),
      );

      const result = await promise;
      expect(result.output).toBe('Agent reply');
    });

    it('should use last text from streaming events', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789' },
      });

      const promise = provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;
      const { waitReq } = simulateHandshake(onMessage);

      // Streaming events — text is accumulated (full text so far), not incremental
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'agent',
            payload: {
              runId: 'run-1',
              stream: 'assistant',
              data: { text: 'Hello ' },
              seq: 1,
              ts: 1,
            },
          }),
        ),
      );
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'agent',
            payload: {
              runId: 'run-1',
              stream: 'assistant',
              data: { text: 'Hello world!' },
              seq: 2,
              ts: 2,
            },
          }),
        ),
      );

      // Wait response
      onMessage(
        Buffer.from(
          JSON.stringify({ type: 'res', id: waitReq.id, ok: true, payload: { status: 'ok' } }),
        ),
      );

      const result = await promise;
      expect(result.output).toBe('Hello world!');
    });

    it('should ignore streaming events from other runIds', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789' },
      });

      const promise = provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;
      const { waitReq } = simulateHandshake(onMessage);

      // Event from a different run should be ignored
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'agent',
            payload: {
              runId: 'other-run',
              stream: 'assistant',
              data: { text: 'Wrong answer' },
              seq: 1,
              ts: 1,
            },
          }),
        ),
      );

      // Event from the correct run
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'agent',
            payload: {
              runId: 'run-1',
              stream: 'assistant',
              data: { text: 'Correct answer' },
              seq: 1,
              ts: 1,
            },
          }),
        ),
      );

      // Wait response
      onMessage(
        Buffer.from(
          JSON.stringify({ type: 'res', id: waitReq.id, ok: true, payload: { status: 'ok' } }),
        ),
      );

      const result = await promise;
      expect(result.output).toBe('Correct answer');
    });

    it('should handle connect failure', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789' },
      });

      const promise = provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;

      // Challenge
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'connect.challenge',
            payload: { nonce: 'n', ts: 1 },
          }),
        ),
      );

      // Connect error
      const connectReq = JSON.parse(mockWs.send.mock.calls[0][0]);
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'res',
            id: connectReq.id,
            ok: false,
            error: { code: 'AUTH_FAILED', message: 'Invalid token' },
          }),
        ),
      );

      const result = await promise;
      expect(result.error).toContain('Invalid token');
    });

    it('should handle agent error response', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789' },
      });

      const promise = provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;

      // Challenge → connect
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'connect.challenge',
            payload: { nonce: 'n', ts: 1 },
          }),
        ),
      );
      const connectReq = JSON.parse(mockWs.send.mock.calls[0][0]);
      onMessage(
        Buffer.from(JSON.stringify({ type: 'res', id: connectReq.id, ok: true, payload: {} })),
      );
      const agentReq = JSON.parse(mockWs.send.mock.calls[1][0]);

      // Agent rejection
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'res',
            id: agentReq.id,
            ok: false,
            error: { code: 'AGENT_TIMEOUT', message: 'Agent timed out' },
          }),
        ),
      );

      const result = await promise;
      expect(result.error).toContain('Agent timed out');
    });

    it('should handle WebSocket errors', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789' },
      });

      const promise = provider.callApi('Hello');
      const onError = messageHandlers.get('error')!;
      onError(new Error('Connection refused'));

      const result = await promise;
      expect(result.error).toContain('Connection refused');
    });

    it('should handle timeout', async () => {
      vi.useFakeTimers();

      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789', timeoutMs: 5000 },
      });

      const promise = provider.callApi('Hello');

      // Advance past timeout
      vi.advanceTimersByTime(6000);

      const result = await promise;
      expect(result.error).toContain('timed out');

      vi.useRealTimers();
    });

    it('should include session key and thinking level when configured', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: {
          gateway_url: 'http://test:18789',
          session_key: 'my-session',
          thinking_level: 'high',
        },
      });

      const promise = provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;
      const { agentReq, waitReq } = simulateHandshake(onMessage);

      expect(agentReq.params.sessionKey).toBe('my-session');
      expect(agentReq.params.thinking).toBe('high');

      // Wait response to resolve
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'res',
            id: waitReq.id,
            ok: true,
            payload: { status: 'ok' },
          }),
        ),
      );

      const result = await promise;
      expect(result.output).toBe('No output from agent');
    });

    it('should handle agent.wait error response', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789' },
      });

      const promise = provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;
      const { waitReq } = simulateHandshake(onMessage);

      // Wait response with error
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'res',
            id: waitReq.id,
            ok: false,
            error: { code: 'AGENT_CRASH', message: 'Agent crashed during execution' },
          }),
        ),
      );

      const result = await promise;
      expect(result.error).toContain('Agent crashed during execution');
    });

    it('should resolve with error on unexpected WS close', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789' },
      });

      const promise = provider.callApi('Hello');
      const onClose = messageHandlers.get('close')!;

      // Server closes connection unexpectedly
      onClose();

      const result = await promise;
      expect(result.error).toContain('closed unexpectedly');
    });

    it('should cleanup WS connection', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789' },
      });

      // Start a call to create a WS
      provider.callApi('Hello');
      await provider.cleanup();
      expect(mockWs.close).toHaveBeenCalled();
    });
  });

  describe('createOpenClawProvider', () => {
    beforeEach(() => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    });

    it('should create chat provider for openclaw:main', () => {
      const provider = createOpenClawProvider('openclaw:main');
      expect(provider).toBeInstanceOf(OpenClawChatProvider);
      expect(provider.id()).toBe('openclaw:main');
    });

    it('should default to main agent when no agent specified', () => {
      const provider = createOpenClawProvider('openclaw');
      expect(provider).toBeInstanceOf(OpenClawChatProvider);
      expect(provider.id()).toBe('openclaw:main');
    });

    it('should support custom agent IDs for chat', () => {
      const provider = createOpenClawProvider('openclaw:my-custom-agent');
      expect(provider).toBeInstanceOf(OpenClawChatProvider);
      expect(provider.id()).toBe('openclaw:my-custom-agent');
    });

    it('should create responses provider for openclaw:responses', () => {
      const provider = createOpenClawProvider('openclaw:responses');
      expect(provider).toBeInstanceOf(OpenClawResponsesProvider);
      expect(provider.id()).toBe('openclaw:responses:main');
    });

    it('should create responses provider with agent ID', () => {
      const provider = createOpenClawProvider('openclaw:responses:beta');
      expect(provider).toBeInstanceOf(OpenClawResponsesProvider);
      expect(provider.id()).toBe('openclaw:responses:beta');
    });

    it('should create agent provider for openclaw:agent', () => {
      const provider = createOpenClawProvider('openclaw:agent');
      expect(provider).toBeInstanceOf(OpenClawAgentProvider);
      expect(provider.id()).toBe('openclaw:agent:main');
    });

    it('should create agent provider with agent ID', () => {
      const provider = createOpenClawProvider('openclaw:agent:my-agent');
      expect(provider).toBeInstanceOf(OpenClawAgentProvider);
      expect(provider.id()).toBe('openclaw:agent:my-agent');
    });

    it('should create tool provider for openclaw:tools:bash', () => {
      const provider = createOpenClawProvider('openclaw:tools:bash');
      expect(provider).toBeInstanceOf(OpenClawToolInvokeProvider);
      expect(provider.id()).toBe('openclaw:tools:bash');
    });

    it('should throw for openclaw:tools without tool name', () => {
      expect(() => createOpenClawProvider('openclaw:tools')).toThrow(
        'OpenClaw tools provider requires a tool name',
      );
    });

    it('should pass config options through', () => {
      const provider = createOpenClawProvider('openclaw:main', {
        config: {
          gateway_url: 'http://test:1234',
          auth_token: 'test-token',
        },
      }) as OpenClawChatProvider;
      expect(provider.config.apiBaseUrl).toBe('http://test:1234/v1');
      expect(provider.config.apiKey).toBe('test-token');
    });

    it('should pass env overrides through', () => {
      const provider = createOpenClawProvider(
        'openclaw:main',
        {},
        { OPENCLAW_GATEWAY_TOKEN: 'env-override' },
      ) as OpenClawChatProvider;
      expect(provider.env?.OPENCLAW_GATEWAY_TOKEN).toBe('env-override');
    });
  });
});
