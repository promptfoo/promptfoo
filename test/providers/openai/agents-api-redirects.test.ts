import { once } from 'node:events';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { text } from 'node:stream/consumers';
import type { AddressInfo } from 'node:net';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OpenAiAgentsApiProvider } from '../../../src/providers/openai/agents-api';
import { mockProcessEnv } from '../../util/utils';

const gatewayKey = 'synthetic-gateway-key';
const prompt = 'synthetic private input';
const tool = {
  type: 'mcp',
  server_label: 'fixture',
  server_url: 'https://mcp.example.test',
  headers: { 'x-mcp-key': 'synthetic-tool-key' },
};
const servers: Server[] = [];

async function startServer(handle: (path: string | undefined, response: ServerResponse) => void) {
  const requests: { method?: string; gatewayKey?: string | string[]; body: string }[] = [];
  const server = createServer(async (req, res) => {
    requests.push({
      method: req.method,
      gatewayKey: req.headers['api-key'],
      body: await text(req),
    });
    handle(req.url, res);
  });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, requests };
}

function createSession(origin: string) {
  return new OpenAiAgentsApiProvider('fixture', {
    config: {
      apiBaseUrl: `${origin}/v1`,
      headers: { 'api-key': gatewayKey },
      useDefaultApiKey: false,
      agent: { tools: [tool] },
      maxRetries: 0,
    },
  }).callApi(prompt);
}

describe('Agents API session creation redirects', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = mockProcessEnv({ NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1' });
  });

  afterEach(async () => {
    restoreEnv();
    await Promise.all(
      servers.splice(0).map((server) => {
        const closed = once(server, 'close');
        server.close();
        server.closeAllConnections();
        return closed;
      }),
    );
  });

  it.each([307, 308])('blocks a cross-origin %i before forwarding the session', async (status) => {
    const recipient = await startServer((_path, res) => res.writeHead(403).end());
    const source = await startServer((_path, res) => {
      res.writeHead(status, { location: `${recipient.origin}/redirected` }).end();
    });

    const result = await createSession(source.origin);

    expect(source.requests).toHaveLength(1);
    expect(source.requests[0]).toMatchObject({ method: 'POST', gatewayKey });
    expect(JSON.parse(source.requests[0].body)).toMatchObject({
      input: prompt,
      agent: { tools: [tool] },
    });
    expect(recipient.requests).toEqual([]);
    expect(result.error).toContain('redirect to a different origin');
  });

  it.each([307, 308])(
    'preserves the credential and POST body on a same-origin %i',
    async (status) => {
      const source = await startServer((path, res) => {
        if (path === '/v1/agents/sessions') {
          res.writeHead(status, { location: '/redirected' }).end();
        } else {
          res.writeHead(403).end(JSON.stringify({ error: 'fixture reached' }));
        }
      });

      const result = await createSession(source.origin);

      expect(result.error).toContain('fixture reached');
      expect(source.requests).toHaveLength(2);
      expect(source.requests[0]).toMatchObject({ method: 'POST', gatewayKey });
      expect(JSON.parse(source.requests[0].body)).toMatchObject({
        input: prompt,
        agent: { tools: [tool] },
      });
      expect(source.requests[1]).toEqual(source.requests[0]);
    },
  );
});
