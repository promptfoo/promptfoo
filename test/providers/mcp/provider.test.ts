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

import { MCPProvider } from '../../../src/providers/mcp';

function createContext(payload: Record<string, unknown>) {
  return {
    vars: { prompt: JSON.stringify(payload) },
  } as any;
}

describe('MCPProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mcpClientMock.initialize.mockResolvedValue(undefined);
    mcpClientMock.getAllTools.mockReturnValue([]);
    mcpClientMock.callTool.mockReset();
    mcpClientMock.cleanup.mockResolvedValue(undefined);
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
