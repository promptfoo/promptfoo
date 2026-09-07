import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../../src/logger';
import { MCPClient } from '../../../src/providers/mcp/client';
import { createDeferred } from '../../util/utils';

const sdk = vi.hoisted(() => ({
  callTool: vi.fn(),
  connect: vi.fn(),
  close: vi.fn(),
  listTools: vi.fn(),
  transportClose: vi.fn(),
}));
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    callTool = sdk.callTool;
    connect = sdk.connect;
    close = sdk.close;
    listTools = sdk.listTools;
  },
}));
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: class {
    close = sdk.transportClose;
  },
}));
vi.mock('../../../src/logger');

beforeEach(() => {
  sdk.connect.mockReset();
  sdk.callTool.mockReset();
  sdk.close.mockReset().mockResolvedValue(undefined);
  sdk.listTools.mockReset().mockResolvedValue({ tools: [] });
  sdk.transportClose.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('MCP startup cancellation', () => {
  it('closes a partial connection when cancellation interrupts the handshake', async () => {
    const entered = createDeferred<void>();
    const handshake = createDeferred<void>();
    const transportClosed = createDeferred<void>();
    sdk.transportClose.mockReturnValue(transportClosed.promise);
    sdk.connect.mockImplementation(() => {
      entered.resolve();
      return handshake.promise;
    });
    sdk.close.mockImplementation(async () => {
      handshake.reject(new Error('closed'));
    });
    const controller = new AbortController();
    const client = new MCPClient({
      enabled: true,
      debug: true,
      server: { command: 'fixture', args: [] },
    });
    const initialization = client.initialize(controller.signal);
    const rejection = expect(initialization).rejects.toThrow('cancel handshake');
    await entered.promise;
    controller.abort(new Error('cancel handshake'));
    await rejection;
    const finished = vi.fn();
    const cleanup = client.cleanup().then(finished);
    await Promise.resolve();
    expect(finished).not.toHaveBeenCalled();
    transportClosed.resolve();
    await cleanup;
    expect(sdk.close).toHaveBeenCalled();
    expect(sdk.transportClose).toHaveBeenCalled();
    expect(sdk.listTools).not.toHaveBeenCalled();
    expect(client.connectedServers).toEqual([]);
    expect(logger.error).not.toHaveBeenCalledWith(expect.stringContaining('Failed to connect'));
  });

  it('does not create a connection for an already cancelled startup', async () => {
    const controller = new AbortController();
    controller.abort(new Error('already cancelled'));
    const client = new MCPClient({ enabled: true, server: { command: 'fixture', args: [] } });
    await expect(client.initialize(controller.signal)).rejects.toThrow('already cancelled');
    expect(sdk.connect).not.toHaveBeenCalled();
  });
});

it('forwards tool cancellation and stops waiting for a stalled MCP request', async () => {
  const controller = new AbortController();
  const started = createDeferred<void>();
  const result = createDeferred<any>();
  sdk.connect.mockResolvedValue(undefined);
  sdk.listTools.mockResolvedValue({
    tools: [{ name: 'fixture', inputSchema: { type: 'object' } }],
  });
  sdk.callTool.mockImplementation((_input, _schema, options) => {
    expect(options.signal).toBe(controller.signal);
    started.resolve();
    return result.promise;
  });
  const client = new MCPClient({ enabled: true, server: { command: 'fixture', args: [] } });
  await client.initialize();
  const pending = client.callTool('fixture', {}, controller.signal);
  await started.promise;
  controller.abort(new Error('cancelled tool'));
  await expect(pending).rejects.toThrow('cancelled tool');
  result.resolve({ content: [] });
  await client.cleanup();
});
