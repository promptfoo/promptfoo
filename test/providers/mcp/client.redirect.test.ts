import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MCPClient } from '../../../src/providers/mcp/client';

interface RecordedRequest {
  method: string | undefined;
  path: string | undefined;
  headers: IncomingHttpHeaders;
  body: string;
}

const apiKey = 'local-redirect-test-key';
const servers: Server[] = [];
const mcpServers: McpServer[] = [];
const clients: MCPClient[] = [];

async function startServer(
  handle: (
    record: RecordedRequest,
    request: IncomingMessage,
    response: ServerResponse,
  ) => void | Promise<void>,
) {
  const requests: RecordedRequest[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.from(chunk));
    }
    const record = {
      method: request.method,
      path: request.url,
      headers: request.headers,
      body: Buffer.concat(chunks).toString('utf8'),
    };
    requests.push(record);
    await handle(record, request, response);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, requests };
}

function createClient(url: string) {
  const client = new MCPClient({
    enabled: true,
    server: { url, headers: { 'X-API-Key': apiKey } },
  });
  clients.push(client);
  return client;
}

afterEach(async () => {
  try {
    await Promise.all([
      ...clients.splice(0).map((client) => client.cleanup()),
      ...mcpServers.splice(0).map((server) => server.close()),
    ]);
  } finally {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
            server.closeAllConnections();
          }),
      ),
    );
  }
});

describe('MCP client HTTP redirects', () => {
  it.each([307, 308])(
    'does not send credentials or bodies to another origin after a %i',
    async (status) => {
      const destination = await startServer((_record, _request, response) => {
        response.writeHead(405).end();
      });
      const origin = await startServer((_record, _request, response) => {
        response.writeHead(status, { location: `${destination.url}/mcp` }).end();
      });
      const client = createClient(`${origin.url}/mcp`);

      await expect(client.initialize()).rejects.toThrow('Failed to connect to MCP server');

      expect(client.hasInitialized).toBe(false);
      const initialize = origin.requests.find((request) => request.method === 'POST');
      expect(initialize?.headers['x-api-key']).toBe(apiKey);
      expect(JSON.parse(initialize!.body)).toMatchObject({ method: 'initialize' });
      // Promptfoo also tries the SSE transport after Streamable HTTP fails.
      expect(origin.requests).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({ 'x-api-key': apiKey }),
          }),
        ]),
      );
      expect(destination.requests).toEqual([]);
    },
  );

  it.each([
    { name: 'a direct endpoint', status: undefined },
    { name: 'a same-origin 307 redirect', status: 307 },
    { name: 'a same-origin 308 redirect', status: 308 },
  ])('initializes and calls tools through $name', async ({ status }) => {
    const server = new McpServer({ name: 'redirect-test', version: '1.0.0' });
    mcpServers.push(server);
    server.registerTool('echo', { inputSchema: { message: z.string() } }, async ({ message }) => ({
      content: [{ type: 'text', text: message }],
    }));
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => 'redirect-test-session',
      enableJsonResponse: true,
    });
    await server.connect(transport);
    const origin = await startServer(async (record, request, response) => {
      if (status && record.path === '/redirect') {
        response.writeHead(status, { location: '/mcp' }).end();
      } else if (record.method === 'GET') {
        // This fixture only needs JSON responses, not a long-lived notification stream.
        response.writeHead(405).end();
      } else {
        await transport.handleRequest(
          request,
          response,
          record.body ? JSON.parse(record.body) : undefined,
        );
      }
    });
    const client = createClient(`${origin.url}/${status ? 'redirect' : 'mcp'}`);

    await client.initialize();
    expect(client.getAllTools()).toEqual([expect.objectContaining({ name: 'echo' })]);
    const result = await client.callTool('echo', { message: 'local-private-tool-input' });
    expect(result).toMatchObject({
      content: JSON.stringify([{ type: 'text', text: 'local-private-tool-input' }]),
    });
    const toolCall = origin.requests.find(
      (request) =>
        request.path === '/mcp' && request.body && JSON.parse(request.body).method === 'tools/call',
    );
    expect(toolCall?.headers).toMatchObject({
      'x-api-key': apiKey,
      'mcp-session-id': 'redirect-test-session',
    });
    expect(JSON.parse(toolCall!.body)).toMatchObject({
      params: { name: 'echo', arguments: { message: 'local-private-tool-input' } },
    });
  });
});
