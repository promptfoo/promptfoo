import { afterEach, describe, expect, it, vi } from 'vitest';

describe('MCP server optional dependency', () => {
  afterEach(() => {
    vi.doUnmock('@modelcontextprotocol/sdk/server/mcp.js');
    vi.doUnmock('../../../src/util/packageImportErrors');
    vi.resetModules();
  });

  it('explains how to install the MCP SDK when server mode is requested', async () => {
    vi.doMock('@modelcontextprotocol/sdk/server/mcp.js', () => {
      throw new Error('Cannot find package @modelcontextprotocol/sdk');
    });
    vi.doMock('../../../src/util/packageImportErrors', () => ({
      isMissingPackageImportError: () => true,
    }));

    const { createMcpServer } = await import('../../../src/commands/mcp/server');
    const createServerPromise = createMcpServer();

    await expect(createServerPromise).rejects.toThrow(
      'The @modelcontextprotocol/sdk package is required for MCP server support.',
    );
    await expect(createServerPromise).rejects.toThrow('npm install @modelcontextprotocol/sdk');
  });
});
