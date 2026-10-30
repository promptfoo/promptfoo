import { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as assertions from '../../../src/assertions/index';
import { startHttpMcpServer } from '../../../src/commands/mcp/server';
import { createDeferred, mockProcessEnv } from '../../util/utils';
import type { JSONRPCRequest, JSONRPCResponse } from '@modelcontextprotocol/sdk/types.js';

async function readMessages(response: Response): Promise<JSONRPCResponse[]> {
  expect(response.headers.get('content-type')).toContain('text/event-stream');
  return (await response.text())
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice('data: '.length)));
}

describe('MCP HTTP transport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  it('rejects oversized HTTP batches before tool dispatch and keeps the session usable', async () => {
    const restoreEnv = mockProcessEnv({ MCP_TRANSPORT: undefined });
    const runAssertions = vi.spyOn(assertions, 'runAssertions');
    const listening = createDeferred<Server>();
    const listen = Server.prototype.listen;
    let httpServer: Server | undefined;
    // Keep the production listener, but let the OS reserve an available loopback port.
    vi.spyOn(Server.prototype, 'listen').mockImplementationOnce(function (this: Server, ...args) {
      httpServer = this;
      this.once('listening', () => listening.resolve(this));
      this.once('error', listening.reject);
      return Reflect.apply(listen, this, [0, '127.0.0.1', args.at(-1)]);
    });
    const signals = ['SIGINT', 'SIGTERM'] as const;
    const existingHandlers = new Set(signals.flatMap((signal) => process.listeners(signal)));
    const running = startHttpMcpServer(3100);
    let nextId = 1;
    let sessionId: string | null = null;

    function batch(size: number): JSONRPCRequest[] {
      return Array.from({ length: size }, () => ({
        jsonrpc: '2.0',
        id: nextId++,
        method: 'tools/call',
        params: {
          name: 'run_assertion',
          arguments: { output: 'ok', assertion: { type: 'equals', value: 'ok' } },
        },
      }));
    }

    try {
      const server = await Promise.race([
        listening.promise,
        running.then(() => {
          throw new Error('MCP server stopped before listening');
        }),
      ]);
      const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
      function post(body: unknown) {
        return fetch(endpoint, {
          method: 'POST',
          headers: {
            Accept: 'application/json, text/event-stream',
            'Content-Type': 'application/json',
            'mcp-protocol-version': LATEST_PROTOCOL_VERSION,
            ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
          },
          body: JSON.stringify(body),
        });
      }

      const initialized = await post({
        jsonrpc: '2.0',
        id: 0,
        method: 'initialize',
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'batch-test-client', version: '1.0.0' },
        },
      });
      expect(initialized.status).toBe(200);
      expect(await readMessages(initialized)).toMatchObject([
        { id: 0, result: { capabilities: {} } },
      ]);
      sessionId = initialized.headers.get('mcp-session-id');
      expect(sessionId).toBeTruthy();
      const ready = await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
      expect(ready.status).toBe(202);
      await ready.text();

      for (const size of [2, 100]) {
        const requests = batch(size);
        const response = await post(requests);
        expect(response.status).toBe(200);
        const results = await readMessages(response);
        expect(results).toHaveLength(size);
        expect(results).toEqual(
          expect.arrayContaining(
            requests.map(({ id }) => ({
              jsonrpc: '2.0',
              id,
              result: {
                content: [{ type: 'text', text: expect.stringContaining('"pass": true') }],
                isError: false,
              },
            })),
          ),
        );
      }
      expect(runAssertions).toHaveBeenCalledTimes(102);

      const rejected = await post(batch(101));
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toEqual({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Invalid Request: Batch must not exceed 100 messages' },
      });
      expect(runAssertions).toHaveBeenCalledTimes(102);

      const [request] = batch(1);
      const recovered = await post(request);
      expect(recovered.status).toBe(200);
      expect(await readMessages(recovered)).toMatchObject([
        { id: request.id, result: { isError: false } },
      ]);
      expect(runAssertions).toHaveBeenCalledTimes(103);
    } finally {
      const handlers = signals.flatMap((signal) =>
        process
          .listeners(signal)
          .filter((handler) => !existingHandlers.has(handler))
          .map((handler) => ({ signal, handler })),
      );
      try {
        const shutdown = handlers[0];
        shutdown?.handler(shutdown.signal);
        httpServer?.closeAllConnections();
        await running;
      } finally {
        for (const { signal, handler } of handlers) {
          process.removeListener(signal, handler);
        }
        restoreEnv();
      }
    }
  });
});
