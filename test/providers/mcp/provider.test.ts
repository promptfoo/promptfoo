import { beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../../src/logger';

const mcpClientMock = vi.hoisted(() => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  getAllTools: vi.fn().mockReturnValue([]),
  callTool: vi.fn(),
  cleanup: vi.fn().mockResolvedValue(undefined),
  connectedServers: ['test-server'],
}));

vi.mock('../../../src/providers/mcp/client', () => ({
  MCPClient: vi.fn(function MockMCPClient() {
    return mcpClientMock;
  }),
}));

import { MCPProvider } from '../../../src/providers/mcp';

function createContext(payload: Record<string, unknown>) {
  return {
    vars: { prompt: JSON.stringify(payload) },
  } as any;
}

describe('MCPProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mcpClientMock.initialize.mockReset().mockResolvedValue(undefined);
    mcpClientMock.getAllTools.mockReset().mockReturnValue([]);
    mcpClientMock.callTool.mockReset();
    mcpClientMock.cleanup.mockReset().mockResolvedValue(undefined);
  });

  it('should preserve existing output behavior without a response transform', async () => {
    const rawResult = {
      content: [{ type: 'text', text: 'raw response' }],
      structuredContent: { answer: 'structured response' },
    };
    mcpClientMock.callTool.mockResolvedValue({
      content: 'normalized response',
      raw: rawResult,
    });

    const provider = new MCPProvider({ config: { enabled: true } });
    const payload = { tool: 'lookup_user', args: { id: '123' } };

    await expect(provider.callApi('', createContext(payload))).resolves.toEqual({
      output: 'normalized response',
      raw: rawResult,
      metadata: {
        toolName: 'lookup_user',
        toolArgs: { id: '123' },
        originalPayload: payload,
      },
    });
  });

  it('merges config.defaultArgs into tool calls, with per-call args winning', async () => {
    mcpClientMock.callTool.mockResolvedValue({ content: 'ok', raw: {} });

    const provider = new MCPProvider({
      config: {
        enabled: true,
        defaultArgs: { session_id: 'sess-1', user_role: 'customer' },
      },
    });
    await provider.callApi(
      '',
      createContext({ tool: 'lookup_user', args: { id: '123', user_role: 'admin' } }),
    );

    expect(mcpClientMock.callTool).toHaveBeenCalledWith('lookup_user', {
      session_id: 'sess-1',
      user_role: 'admin',
      id: '123',
    });
  });

  it('keeps tool argument values out of debug logs and credentials out of saved metadata', async () => {
    const debug = vi.spyOn(logger, 'debug').mockImplementation(() => undefined);
    const configuredToken = 'configured-value';
    const configuredPassword = 'nested-value';
    const customValue = 'opaque-custom-value';
    const promptKey = 'prompt-value';
    const transform = vi.fn((_result, _content, context) => {
      expect(context.toolArgs.sessionToken).toBe(configuredToken);
      return { output: 'ok' };
    });
    mcpClientMock.callTool.mockResolvedValue({ content: 'ok', raw: {} });

    try {
      const provider = new MCPProvider({
        config: {
          enabled: true,
          defaultArgs: {
            sessionToken: configuredToken,
            custom: customValue,
            nested: { password: configuredPassword },
          },
          transformResponse: transform,
        },
      });
      const result = await provider.callApi(
        '',
        createContext({ tool: 'lookup_user', args: { apiKey: promptKey, id: '123' } }),
      );

      expect(mcpClientMock.callTool).toHaveBeenCalledWith('lookup_user', {
        sessionToken: configuredToken,
        custom: customValue,
        nested: { password: configuredPassword },
        apiKey: promptKey,
        id: '123',
      });
      expect(transform).toHaveBeenCalledOnce();
      expect(result.metadata).toEqual({
        toolName: 'lookup_user',
        toolArgs: {
          sessionToken: '[REDACTED]',
          custom: customValue,
          nested: { password: '[REDACTED]' },
          apiKey: '[REDACTED]',
          id: '123',
        },
        originalPayload: { tool: 'lookup_user', args: { apiKey: '[REDACTED]', id: '123' } },
      });
      expect(debug).toHaveBeenCalledWith('MCP Provider calling tool', {
        toolName: 'lookup_user',
        argumentNames: ['sessionToken', 'custom', 'nested', 'apiKey', 'id'],
      });
      const debugCalls = JSON.stringify(debug.mock.calls);
      for (const value of [configuredToken, configuredPassword, customValue, promptKey]) {
        expect(debugCalls).not.toContain(value);
      }
    } finally {
      debug.mockRestore();
    }
  });

  it('reports nested tool arguments in full', async () => {
    mcpClientMock.callTool.mockResolvedValue({ content: 'ok', raw: {} });
    const provider = new MCPProvider({ config: { enabled: true } });
    const args = {
      order: { items: [{ product: { options: { engraving: { text: 'Hi', font: 'serif' } } } }] },
    };

    const result = await provider.callApi('', createContext({ tool: 'create_order', args }));

    expect(mcpClientMock.callTool).toHaveBeenCalledWith('create_order', args);
    expect(result.metadata?.toolArgs).toEqual(args);
    expect(result.metadata?.originalPayload).toEqual({ tool: 'create_order', args });
  });

  it('redacts deep compound credentials in metadata without changing the tool call', async () => {
    mcpClientMock.callTool.mockResolvedValue({ content: 'ok', raw: {} });
    const provider = new MCPProvider({
      config: { enabled: true, defaultArgs: { dbPassword: 'configured-db-fixture' } },
    });
    const fields = {
      databasePassword: 'database-fixture',
      dbPwd: 'pwd-fixture',
      clientSecrets: ['secret-one', 'secret-two'],
      apiKeysByTenant: { tenant: 'tenant-secret', count: 2 },
      tokenUsage: { input: 4, output: 9 },
      hasCredentials: false,
      isSecret: true,
      requiresCredentials: false,
      needsPassword: true,
      supportsApiKey: false,
      tokenBudget: 4096,
      signatureAlgorithm: 'SHA256',
      dbPassword: 'db-fixture',
      databasePasswordEnabled: true,
      pageToken: 'next-page',
      maxTokens: 42,
      monkey: 'ordinary',
      key: 'record-name',
      'record.key': 'field-name',
      tokenCount: 12,
      credentialsRequired: false,
      authHeaders: {
        'User-Agent': '{"databasePassword":"header-fixture","page":2}',
        Accept: 'https://example.test/?api_key=header-fixture',
      },
      form: `data=${encodeURIComponent(JSON.stringify({ databasePassword: 'encoded-fixture', tokenCount: 12 }))}`,
      callbackUrl: `https://example.test/?data=${encodeURIComponent(JSON.stringify({ dbPassword: 'encoded-fixture', credentialsRequired: false }))}`,
      url: 'redirect=https://alice:fixture-password@example.test/path',
      byUrl: {
        'https://example.test/?api_key=short': { method: 'GET' },
      },
    };
    const args = { one: { two: { three: { four: { five: fields } } } } };
    const sanitizedArgs = {
      one: {
        two: {
          three: {
            four: {
              five: {
                ...fields,
                databasePassword: '[REDACTED]',
                dbPwd: '[REDACTED]',
                clientSecrets: ['[REDACTED]', '[REDACTED]'],
                apiKeysByTenant: { tenant: '[REDACTED]', count: '[REDACTED]' },
                dbPassword: '[REDACTED]',
                authHeaders: {
                  'User-Agent': '{"databasePassword":"[REDACTED]","page":2}',
                  Accept: 'https://example.test/?api_key=%5BREDACTED%5D',
                },
                form: `data=${encodeURIComponent(JSON.stringify({ databasePassword: '[REDACTED]', tokenCount: 12 }))}`,
                callbackUrl: `https://example.test/?data=${encodeURIComponent(JSON.stringify({ dbPassword: '[REDACTED]', credentialsRequired: false }))}`,
                url: '[REDACTED]',
                byUrl: {
                  'https://example.test/?api_key=%5BREDACTED%5D': { method: 'GET' },
                },
              },
            },
          },
        },
      },
    };

    const result = await provider.callApi('', createContext({ tool: 'lookup_user', args }));

    expect(mcpClientMock.callTool).toHaveBeenCalledWith('lookup_user', {
      dbPassword: 'configured-db-fixture',
      ...args,
    });
    expect(result.metadata?.toolArgs).toEqual({ dbPassword: '[REDACTED]', ...sanitizedArgs });
    expect(result.metadata?.originalPayload).toEqual({ tool: 'lookup_user', args: sanitizedArgs });
    expect(args.one.two.three.four.five).toEqual(fields);
  });

  it('still accepts defaultArgs passed as a constructor option', async () => {
    mcpClientMock.callTool.mockResolvedValue({ content: 'ok', raw: {} });

    const provider = new MCPProvider({
      config: { enabled: true },
      defaultArgs: { session_id: 'from-options' },
    });
    await provider.callApi('', createContext({ tool: 'lookup_user', args: { id: '123' } }));

    expect(mcpClientMock.callTool).toHaveBeenCalledWith('lookup_user', {
      session_id: 'from-options',
      id: '123',
    });
  });

  it('applies defaults to direct tool calls and reports the arguments actually sent', async () => {
    mcpClientMock.callTool.mockResolvedValue({ content: 'ok', raw: {} });
    const provider = new MCPProvider({
      config: { enabled: true, defaultArgs: { session: 'default', role: 'customer' } },
    });

    const result = await provider.callTool('lookup_user', { role: 'admin' });

    expect(mcpClientMock.callTool).toHaveBeenCalledWith('lookup_user', {
      session: 'default',
      role: 'admin',
    });
    expect(result.metadata?.toolArgs).toEqual({ session: '[REDACTED]', role: 'admin' });
  });

  it('should preserve MCP tool error results as direct provider output', async () => {
    const rawResult = {
      content: [{ type: 'text', text: 'Path traversal not allowed' }],
      isError: true,
    };
    mcpClientMock.callTool.mockResolvedValue({
      content: 'Path traversal not allowed',
      isError: true,
      raw: rawResult,
    });

    const provider = new MCPProvider({ config: { enabled: true } });

    await expect(provider.callTool('read_file', { path: '../../../etc/passwd' })).resolves.toEqual({
      output: 'Path traversal not allowed',
      raw: rawResult,
      metadata: {
        toolName: 'read_file',
        toolArgs: { path: '../../../etc/passwd' },
      },
    });
  });

  it('should preserve MCP tool error results as direct provider output via callApi', async () => {
    const rawResult = {
      content: [{ type: 'text', text: 'Path traversal not allowed' }],
      isError: true,
    };
    mcpClientMock.callTool.mockResolvedValue({
      content: 'Path traversal not allowed',
      isError: true,
      raw: rawResult,
    });

    const provider = new MCPProvider({ config: { enabled: true } });
    const payload = { tool: 'read_file', args: { path: '../../../etc/passwd' } };

    await expect(provider.callApi('', createContext(payload))).resolves.toEqual({
      output: 'Path traversal not allowed',
      raw: rawResult,
      metadata: {
        toolName: 'read_file',
        toolArgs: { path: '../../../etc/passwd' },
        originalPayload: payload,
      },
    });
  });

  it('should surface MCP client failures as a provider error', async () => {
    const failure = { content: '', error: 'connection lost' };
    mcpClientMock.callTool.mockResolvedValue(failure);

    const provider = new MCPProvider({ config: { enabled: true } });
    const payload = { tool: 'lookup_user', args: { id: '123' } };

    await expect(provider.callApi('', createContext(payload))).resolves.toEqual({
      error: 'MCP tool error: connection lost',
      raw: failure,
    });
  });

  it('should transform raw MCP results and merge provider metadata', async () => {
    const rawResult = {
      content: [{ type: 'text', text: 'raw response' }],
      structuredContent: { answer: 'structured response' },
    };
    mcpClientMock.callTool.mockResolvedValue({
      content: 'normalized response',
      raw: rawResult,
    });

    const provider = new MCPProvider({
      config: {
        enabled: true,
        transformResponse:
          '({ output: result.structuredContent.answer, metadata: { parser: "custom", content } })',
      },
    });
    const payload = { tool: 'lookup_user', args: { id: '123' } };

    await expect(provider.callApi('', createContext(payload))).resolves.toEqual({
      output: 'structured response',
      raw: rawResult,
      metadata: {
        toolName: 'lookup_user',
        toolArgs: { id: '123' },
        originalPayload: payload,
        parser: 'custom',
        content: 'normalized response',
      },
    });
  });

  it('should use deprecated responseParser when transformResponse is not configured', async () => {
    const rawResult = {
      structuredContent: { answer: 'legacy response' },
    };
    mcpClientMock.callTool.mockResolvedValue({
      content: 'normalized response',
      raw: rawResult,
    });

    const provider = new MCPProvider({
      config: {
        enabled: true,
        responseParser:
          '({ output: result.structuredContent.answer, metadata: { parser: "legacy" } })',
      },
    });

    await expect(provider.callTool('lookup_user', { id: '123' })).resolves.toEqual({
      output: 'legacy response',
      raw: rawResult,
      metadata: {
        parser: 'legacy',
        toolName: 'lookup_user',
        toolArgs: { id: '123' },
      },
    });
  });

  it('should prefer transformResponse over deprecated responseParser when both are configured', async () => {
    const rawResult = {
      structuredContent: { answer: 'structured response' },
    };
    mcpClientMock.callTool.mockResolvedValue({
      content: 'normalized response',
      raw: rawResult,
    });

    const provider = new MCPProvider({
      config: {
        enabled: true,
        responseParser: '({ output: "legacy response", metadata: { parser: "legacy" } })',
        transformResponse: '({ output: "new response", metadata: { parser: "transform" } })',
      },
    });

    await expect(provider.callTool('lookup_user', { id: '123' })).resolves.toEqual({
      output: 'new response',
      raw: rawResult,
      metadata: {
        parser: 'transform',
        toolName: 'lookup_user',
        toolArgs: { id: '123' },
      },
    });
  });

  it('should keep provider metadata authoritative when transforms return conflicting keys', async () => {
    const rawResult = {
      structuredContent: { answer: 'structured response' },
    };
    mcpClientMock.callTool.mockResolvedValue({
      content: 'normalized response',
      raw: rawResult,
    });

    const provider = new MCPProvider({
      config: {
        enabled: true,
        transformResponse: `({
          output: result.structuredContent.answer,
          metadata: {
            toolName: 'spoofed',
            toolArgs: { id: 'spoofed' },
            originalPayload: { tool: 'spoofed' },
            parser: 'custom'
          }
        })`,
      },
    });
    const payload = { tool: 'lookup_user', args: { id: '123' } };

    await expect(provider.callApi('', createContext(payload))).resolves.toEqual({
      output: 'structured response',
      raw: rawResult,
      metadata: {
        parser: 'custom',
        toolName: 'lookup_user',
        toolArgs: { id: '123' },
        originalPayload: payload,
      },
    });
  });

  it('should apply response transforms to direct tool calls', async () => {
    const rawResult = {
      structuredContent: { answer: 'direct response' },
    };
    mcpClientMock.callTool.mockResolvedValue({
      content: 'normalized response',
      raw: rawResult,
    });

    const provider = new MCPProvider({
      config: {
        enabled: true,
        transformResponse:
          '(result, _content, context) => ({ output: `${context.toolName}:${result.structuredContent.answer}` })',
      },
    });

    await expect(provider.callTool('lookup_user', { id: '123' })).resolves.toEqual({
      output: 'lookup_user:direct response',
      raw: rawResult,
      metadata: {
        toolName: 'lookup_user',
        toolArgs: { id: '123' },
      },
    });
  });

  it('should return the existing invalid prompt contract before calling tools', async () => {
    const provider = new MCPProvider({ config: { enabled: true } });

    await expect(provider.callApi('', { vars: { prompt: 'not-json' } } as any)).resolves.toEqual({
      error:
        'Invalid JSON in prompt. MCP provider expects a JSON payload with tool call information.',
    });
    expect(mcpClientMock.callTool).not.toHaveBeenCalled();
  });
});
