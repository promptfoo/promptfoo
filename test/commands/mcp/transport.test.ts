import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it } from 'vitest';
import type { JSONRPCRequest } from '@modelcontextprotocol/sdk/types.js';

describe('MCP HTTP transport', () => {
  it('rejects oversized parsed batches without dispatching tools or breaking the session', async () => {
    const server = new McpServer({ name: 'batch-test', version: '1.0.0' });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => 'batch-test-session',
      enableJsonResponse: true,
    });
    let calls = 0;
    let nextId = 1;
    server.registerTool('echo', {}, async () => {
      calls += 1;
      return { content: [{ type: 'text', text: 'ok' }] };
    });

    function post(parsedBody: unknown) {
      const request = new Request('http://localhost/mcp', {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
          'mcp-session-id': 'batch-test-session',
          'mcp-protocol-version': LATEST_PROTOCOL_VERSION,
        },
      });
      // Promptfoo parses JSON with Express before passing it to the SDK.
      return transport.handleRequest(request, { parsedBody });
    }

    function batch(size: number): JSONRPCRequest[] {
      return Array.from({ length: size }, () => ({
        jsonrpc: '2.0',
        id: nextId++,
        method: 'tools/call',
        params: { name: 'echo', arguments: {} },
      }));
    }

    try {
      await server.connect(transport);
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
      expect(await initialized.json()).toMatchObject({ id: 0, result: { capabilities: {} } });
      const ready = await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
      expect(ready.status).toBe(202);

      for (const size of [2, 100]) {
        const requests = batch(size);
        const response = await post(requests);
        expect(response.status).toBe(200);
        const results = await response.json();
        expect(results).toHaveLength(size);
        expect(results).toEqual(
          expect.arrayContaining(
            requests.map(({ id }) => ({
              jsonrpc: '2.0',
              id,
              result: { content: [{ type: 'text', text: 'ok' }] },
            })),
          ),
        );
      }
      expect(calls).toBe(102);

      const rejected = await post(batch(101));
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toEqual({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Invalid Request: Batch must not exceed 100 messages' },
      });
      expect(calls).toBe(102);

      const [request] = batch(1);
      const recovered = await post(request);
      expect(recovered.status).toBe(200);
      expect(await recovered.json()).toEqual({
        jsonrpc: '2.0',
        id: request.id,
        result: { content: [{ type: 'text', text: 'ok' }] },
      });
      expect(calls).toBe(103);
    } finally {
      await server.close();
    }
  });
});
