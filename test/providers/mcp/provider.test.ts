import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import cliState from '../../../src/cliState';
import { MCPProvider } from '../../../src/providers/mcp';
import { MCPClient } from '../../../src/providers/mcp/client';
import { createDeferred } from '../../util/utils';

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

  it('initializes from the current configuration on first use', async () => {
    const provider = new MCPProvider({
      config: { enabled: true, server: { url: '{{ env.MCP_URL }}' } },
    });
    expect(MCPClient).not.toHaveBeenCalled();
    provider.config = { enabled: true, server: { url: 'http://localhost:1234/mcp' } };
    await provider.getAvailableTools();
    expect(MCPClient).toHaveBeenCalledWith({ ...provider.config, basePath: expect.any(String) });
  });

  it('binds a preconstructed provider before initialization and retains its directory on reuse', async () => {
    const provider = new MCPProvider({ config: { enabled: true, server: { path: 'server.js' } } });
    provider.setConfigBasePath('/config/first');
    await provider.getAvailableTools();
    await provider.cleanup();
    provider.setConfigBasePath('/config/second');
    await provider.getAvailableTools();
    expect(MCPClient).toHaveBeenCalledTimes(2);
    for (const [config] of vi.mocked(MCPClient).mock.calls) {
      expect(config.basePath).toBe(path.resolve('/config/first'));
    }
  });

  it('preserves an explicit provider basePath when binding a config directory', async () => {
    const provider = new MCPProvider({ config: { enabled: true, basePath: '/explicit' } });
    provider.setConfigBasePath('/config');
    await provider.getAvailableTools();
    expect(MCPClient).toHaveBeenCalledWith(
      expect.objectContaining({ basePath: path.resolve('/explicit') }),
    );
  });

  it('loads the response transform from the current configuration', async () => {
    const provider = new MCPProvider({ config: { enabled: true } });
    provider.config = { enabled: true, responseParser: 'content.toUpperCase()' };
    mcpClientMock.callTool.mockResolvedValue({ content: 'current config' });
    expect((await provider.callTool('echo', {})).output).toBe('CURRENT CONFIG');
  });

  it.each(['config', 'cli-state'])(
    'keeps the transform directory from %s across initialization and reuse',
    async (source) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-transform-base-'));
      const oldBasePath = cliState.basePath;
      const providers: MCPProvider[] = [];
      try {
        for (const name of ['first', 'second']) {
          const directory = path.join(root, name);
          fs.mkdirSync(directory);
          fs.writeFileSync(
            path.join(directory, 'transform.mjs'),
            name === 'first'
              ? "export default (_result, content) => 'first:' + content;"
              : "export default (_result, content) => 'second:' + content;",
          );
          cliState.basePath = directory;
          providers.push(
            new MCPProvider({
              config: {
                enabled: true,
                ...(source === 'config' ? { basePath: directory } : {}),
                transformResponse: 'file://transform.mjs',
              },
            }),
          );
        }
        mcpClientMock.callTool.mockResolvedValue({ content: 'echo' });
        expect((await providers[0].callTool('echo', {})).output).toBe('first:echo');
        expect((await providers[1].callTool('echo', {})).output).toBe('second:echo');
        expect(MCPClient).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({ basePath: path.join(root, 'first') }),
        );
        expect(MCPClient).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ basePath: path.join(root, 'second') }),
        );
        await providers[0].cleanup();
        cliState.basePath = root;
        expect((await providers[0].callTool('echo', {})).output).toBe('first:echo');
        expect(MCPClient).toHaveBeenNthCalledWith(
          3,
          expect.objectContaining({ basePath: path.join(root, 'first') }),
        );
      } finally {
        await Promise.all(providers.map((provider) => provider.cleanup()));
        cliState.basePath = oldBasePath;
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it('cleans up while initialization is still pending', async () => {
    const pending = createDeferred<void>();
    mcpClientMock.initialize.mockReturnValueOnce(pending.promise);
    const provider = new MCPProvider({ config: { enabled: true } });
    const initialized = provider.getAvailableTools();
    let cleaned = false;
    const cleanup = provider.cleanup().then(() => {
      cleaned = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    try {
      expect(cleaned).toBe(true);
      expect(mcpClientMock.cleanup).toHaveBeenCalledOnce();
    } finally {
      pending.resolve(undefined);
      await Promise.allSettled([initialized, cleanup]);
    }
  });

  it('reopens a cleaned provider once when concurrent calls reuse it', async () => {
    const provider = new MCPProvider({ config: { enabled: true } });
    await provider.getAvailableTools();
    await provider.cleanup();
    mcpClientMock.callTool.mockResolvedValue({ content: 'reconnected' });
    const [api, tool] = await Promise.all([
      provider.callApi(JSON.stringify({ tool: 'lookup_user', args: {} })),
      provider.callTool('lookup_user', {}),
      provider.getAvailableTools(),
    ]);
    expect(mcpClientMock.initialize).toHaveBeenCalledTimes(2);
    expect(mcpClientMock.cleanup).toHaveBeenCalledTimes(1);
    expect(api.output).toBe('reconnected');
    expect(tool.output).toBe('reconnected');
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
