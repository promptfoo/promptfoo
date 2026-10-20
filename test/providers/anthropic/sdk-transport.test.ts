import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';
import { AnthropicMessagesProvider } from '../../../src/providers/anthropic/messages';

const servers: Server[] = [];

async function createMessagesServer(status: 200 | 401) {
  const requests: {
    method: string | undefined;
    url: string | undefined;
    apiKey: string | undefined;
    body: unknown;
  }[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.from(chunk));
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    requests.push({
      method: request.method,
      url: request.url,
      apiKey: request.headers['x-api-key'] as string | undefined,
      body,
    });

    const payload =
      status === 200
        ? {
            id: 'msg_local',
            type: 'message',
            role: 'assistant',
            model: 'claude-sonnet-4-6',
            content: [{ type: 'text', text: 'pong' }],
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: { input_tokens: 3, output_tokens: 1 },
          }
        : { type: 'error', error: { type: 'authentication_error', message: 'bad key' } };
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(payload));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);

  return { baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, requests };
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

describe('Anthropic Messages SDK transport', () => {
  it('sends a request and parses a response through the installed SDK', async () => {
    const { baseUrl, requests } = await createMessagesServer(200);
    const provider = new AnthropicMessagesProvider('claude-sonnet-4-6', {
      config: { apiKey: 'local-qa-key', apiBaseUrl: baseUrl },
    });

    const result = await provider.callApi('ping');

    expect(requests).toMatchObject([
      {
        method: 'POST',
        url: '/v1/messages',
        apiKey: 'local-qa-key',
        body: {
          model: 'claude-sonnet-4-6',
          messages: [{ role: 'user', content: [{ type: 'text', text: 'ping' }] }],
        },
      },
    ]);
    expect(result).toMatchObject({ output: 'pong', tokenUsage: { prompt: 3, completion: 1 } });
  });

  it('returns an authentication error from the installed SDK', async () => {
    const { baseUrl, requests } = await createMessagesServer(401);
    const provider = new AnthropicMessagesProvider('claude-sonnet-4-6', {
      config: { apiKey: 'local-qa-key', apiBaseUrl: baseUrl },
    });

    const result = await provider.callApi('ping');

    expect(requests).toHaveLength(1);
    expect(result.error).toContain('bad key');
    expect(result.error).not.toContain('local-qa-key');
    expect(result.output).toBeUndefined();
  });
});
