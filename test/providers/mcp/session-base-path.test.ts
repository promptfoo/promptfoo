import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import { MCPProvider } from '../../../src/providers/mcp';
import { providerRegistry } from '../../../src/providers/providerRegistry';

const mocks = vi.hoisted(() => ({
  transportPaths: [] as string[],
  callTool: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    async connect() {}
    async listTools() {
      return { tools: [{ name: 'echo', inputSchema: { type: 'object' } }] };
    }
    callTool = mocks.callTool;
    async close() {}
  },
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: class {
    constructor(options: { args: string[] }) {
      mocks.transportPaths.push(path.resolve(options.args[0]));
    }
    async close() {}
  },
}));

vi.mock('../../../src/logger');

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transportPaths.length = 0;
  mocks.callTool.mockResolvedValue({ content: [{ type: 'text', text: 'OK' }] });
});

afterEach(async () => {
  await providerRegistry.shutdownAll();
  vi.restoreAllMocks();
});

describe('MCP reconnection base path', () => {
  it.each([
    { serverField: 'server', pathKind: 'absolute' },
    { serverField: 'servers', pathKind: 'absolute' },
    { serverField: 'server', pathKind: 'relative' },
    { serverField: 'servers', pathKind: 'relative' },
    { serverField: 'server', pathKind: 'default' },
    { serverField: 'servers', pathKind: 'default' },
  ])(
    'retains $serverField paths from a $pathKind loading scope across evaluations',
    async ({ serverField, pathKind }) => {
      const basePath =
        pathKind === 'absolute'
          ? path.resolve('fixtures/original-config')
          : pathKind === 'relative'
            ? 'fixtures/original-config'
            : undefined;
      const relativeServer = { path: 'server.js' };
      const absoluteServer = { path: path.resolve('fixtures/absolute-server.py') };
      const provider = cliState.withBasePath(
        basePath,
        () =>
          new MCPProvider({
            config: {
              enabled: true,
              basePath,
              ...(serverField === 'server'
                ? { server: relativeServer }
                : { servers: [relativeServer, absoluteServer] }),
            },
          }),
      );

      const call = () =>
        providerRegistry.withEvaluation(() =>
          providerRegistry.withProvider(provider, () => provider.callApi('{"tool":"echo"}')),
        );
      const expectedPaths = [
        path.resolve(basePath ?? '.', relativeServer.path),
        ...(serverField === 'servers' ? [absoluteServer.path] : []),
      ];

      // Construction mirrors loadApiProvider's temporary basePath scope. Evaluation
      // can happen later, without its own basePath or under another config's scope.
      expect(await cliState.withBasePath(undefined, call)).not.toHaveProperty('error');
      expect(mocks.transportPaths).toEqual(expectedPaths);
      expect(await cliState.withBasePath(undefined, call)).not.toHaveProperty('error');
      expect(
        await cliState.withBasePath(path.resolve('fixtures/other-config'), call),
      ).not.toHaveProperty('error');

      expect(mocks.transportPaths).toEqual([...expectedPaths, ...expectedPaths, ...expectedPaths]);
      expect(mocks.callTool).toHaveBeenCalledTimes(3);
      expect(relativeServer.path).toBe('server.js');
    },
  );
});
