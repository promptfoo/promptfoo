import { afterEach, describe, expect, it, vi } from 'vitest';

describe('MCP server optional dependency', () => {
  afterEach(() => {
    vi.doUnmock('@modelcontextprotocol/sdk/server/mcp.js');
    vi.doUnmock('@modelcontextprotocol/sdk/server/stdio.js');
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

  it('surfaces stdio dependency errors before console logging is muted', async () => {
    vi.doMock('@modelcontextprotocol/sdk/server/mcp.js', () => {
      throw new Error('Cannot find package @modelcontextprotocol/sdk');
    });
    vi.doMock('../../../src/util/packageImportErrors', () => ({
      isMissingPackageImportError: () => true,
    }));

    const loggerModule = await import('../../../src/logger');
    const originalTransports = [...loggerModule.default.transports];
    const consoleTransport = { constructor: { name: 'Console' }, silent: false };
    loggerModule.default.transports.splice(
      0,
      loggerModule.default.transports.length,
      consoleTransport as any,
    );

    try {
      const { startStdioMcpServer } = await import('../../../src/commands/mcp/server');

      await expect(startStdioMcpServer()).rejects.toThrow(
        'The @modelcontextprotocol/sdk package is required for MCP server support.',
      );
      expect(consoleTransport.silent).toBe(false);
    } finally {
      loggerModule.default.transports.splice(
        0,
        loggerModule.default.transports.length,
        ...originalTransports,
      );
    }
  });

  it('restores stdio console logging when server creation fails after muting', async () => {
    vi.doMock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
      McpServer: class {
        constructor() {
          throw new Error('server create failed');
        }
      },
    }));
    vi.doMock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
      StdioServerTransport: class {},
    }));

    const loggerModule = await import('../../../src/logger');
    const originalTransports = [...loggerModule.default.transports];
    const consoleTransport = { constructor: { name: 'Console' }, silent: false };
    loggerModule.default.transports.splice(
      0,
      loggerModule.default.transports.length,
      consoleTransport as any,
    );

    try {
      const { startStdioMcpServer } = await import('../../../src/commands/mcp/server');

      await expect(startStdioMcpServer()).rejects.toThrow('server create failed');
      expect(consoleTransport.silent).toBe(false);
    } finally {
      loggerModule.default.transports.splice(
        0,
        loggerModule.default.transports.length,
        ...originalTransports,
      );
    }
  });
});
