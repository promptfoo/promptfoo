import { afterEach, describe, expect, it, vi } from 'vitest';

describe('MCP client optional dependency', () => {
  afterEach(() => {
    vi.doUnmock('@modelcontextprotocol/sdk/client/index.js');
    vi.resetModules();
  });

  it('explains how to install the MCP SDK when provider mode is requested', async () => {
    vi.doMock('@modelcontextprotocol/sdk/client/index.js', () => {
      throw new Error('Cannot find package @modelcontextprotocol/sdk');
    });

    const { MCPClient } = await import('../../../src/providers/mcp/client');
    const client = new MCPClient({
      enabled: true,
      server: {
        command: 'node',
        args: ['server.js'],
      },
    });
    const initializePromise = client.initialize();

    await expect(initializePromise).rejects.toThrow(
      'The @modelcontextprotocol/sdk package is required for MCP provider support.',
    );
    await expect(initializePromise).rejects.toThrow('npm install @modelcontextprotocol/sdk');
  });
});
