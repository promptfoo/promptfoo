import { afterEach, describe, expect, it, vi } from 'vitest';

describe('MCP client optional dependency', () => {
  afterEach(() => {
    vi.doUnmock('@modelcontextprotocol/sdk/client/index.js');
    vi.doUnmock('../../../src/util/packageImportErrors');
    vi.resetModules();
  });

  it('explains how to install the MCP SDK when provider mode is requested', async () => {
    vi.doMock('@modelcontextprotocol/sdk/client/index.js', () => {
      throw new Error('Cannot find package @modelcontextprotocol/sdk');
    });
    vi.doMock('../../../src/util/packageImportErrors', () => ({
      isMissingPackageImportError: () => true,
    }));

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

  it('keeps eager provider initialization from becoming an unhandled rejection', async () => {
    vi.doMock('@modelcontextprotocol/sdk/client/index.js', () => {
      throw new Error('Cannot find package @modelcontextprotocol/sdk');
    });
    vi.doMock('../../../src/util/packageImportErrors', () => ({
      isMissingPackageImportError: () => true,
    }));

    const unhandledRejection = vi.fn();
    process.once('unhandledRejection', unhandledRejection);

    try {
      const { MCPProvider } = await import('../../../src/providers/mcp');
      const provider = new MCPProvider({
        config: {
          enabled: true,
          server: {
            command: 'node',
            args: ['server.js'],
          },
        },
      });

      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(unhandledRejection).not.toHaveBeenCalled();
      await expect(provider.callApi('{"tool":"lookup_user"}')).resolves.toEqual({
        error:
          'MCP Provider error: The @modelcontextprotocol/sdk package is required for MCP provider support. Install it with: npm install @modelcontextprotocol/sdk',
      });
    } finally {
      process.off('unhandledRejection', unhandledRejection);
    }
  });
});
