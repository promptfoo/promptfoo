import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';
import { AnthropicManagedAgentsProvider } from '../../../src/providers/anthropic/managedAgents';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});

async function serve(events: string, status = 200) {
  const requests: { path: string; method?: string; body?: unknown; beta?: string; key?: string }[] =
    [];
  let stream: ServerResponse;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    const text = Buffer.concat(chunks).toString('utf8');
    const path = new URL(req.url!, 'http://localhost').pathname;
    requests.push({
      path,
      method: req.method,
      body: text ? JSON.parse(text) : undefined,
      beta: req.headers['anthropic-beta'] as string,
      key: req.headers['x-api-key'] as string,
    });
    if (status !== 200) {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          type: 'error',
          error: { type: 'authentication_error', message: 'do not echo local-test-key' },
        }),
      );
    } else if (path.endsWith('/events/stream')) {
      stream = res;
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.flushHeaders();
    } else {
      res.writeHead(200, { 'content-type': 'application/json' });
      if (path.endsWith('/events')) {
        // Write one byte at a time to exercise framing across UTF-8 and CRLF boundaries.
        for (const byte of Buffer.from(events)) {
          stream.write(Buffer.from([byte]));
        }
        stream.end();
        res.end('{}');
      } else {
        res.end(
          JSON.stringify({
            id: 'sesn-http',
            usage: {
              input_tokens: 1,
              output_tokens: 2,
              list_cost: { amount: '5', currency: 'USD' },
            },
          }),
        );
      }
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return { apiBaseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, requests };
}

function event(type: string, fields: Record<string, unknown> = {}) {
  return `event: ${type}\r\ndata: ${JSON.stringify({ id: `event-${type}`, type, ...fields })}\r\n\r\n`;
}

describe('Claude Managed Agents SDK transport', () => {
  it('preserves workflow events through the installed SDK and waits for the final answer', async () => {
    const { apiBaseUrl, requests } = await serve(
      ': keepalive\r\n\r\n' +
        event('workflow_run.created', { workflow_run_id: 'wrun-http' }) +
        event('agent.message', { content: [{ type: 'text', text: 'early' }] }) +
        event('session.status_idle', { stop_reason: { type: 'end_turn' } }) +
        event('workflow_run.phase_started', {
          workflow_run_id: 'wrun-http',
          workflow_run_phase_id: 'phase',
        }) +
        event('workflow_run.status_ended', {
          workflow_run_id: 'wrun-http',
          result: { type: 'completed' },
        }) +
        event('agent.message', { content: [{ type: 'text', text: 'verified café ☕' }] }) +
        event('session.status_idle', { stop_reason: { type: 'end_turn' } }),
    );
    const provider = new AnthropicManagedAgentsProvider({
      config: {
        apiKey: 'local-test-key',
        apiBaseUrl,
        agent_id: 'agent-test',
        environment_id: 'env-test',
      },
    });
    const result = await provider.callApi('verify');
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('verified café ☕');
    expect(result.cost).toBe(0.05);
    expect(result.metadata?.workflowRuns).toMatchObject([{ id: 'wrun-http', status: 'ended' }]);
    expect(requests.map((r) => r.path)).toEqual([
      '/v1/sessions',
      '/v1/sessions/sesn-http/events/stream',
      '/v1/sessions/sesn-http/events',
      '/v1/sessions/sesn-http',
      '/v1/sessions/sesn-http/archive',
    ]);
    for (const request of requests) {
      expect(request.beta).toContain('managed-agents-2026-04-01');
      expect(request.key).toBe('local-test-key');
    }
  });

  it.each([
    ['data: {bad-json}\n\n', 'invalid JSON'],
    ['data: null\n\n', 'invalid event'],
    ['data: {"type":"agent.message"}', 'incomplete event'],
    [
      event('error', { error: { type: 'overloaded_error', message: 'private' } }),
      'reported an API error (overloaded_error)',
    ],
  ])('rejects malformed or failed SSE %#', async (events, error) => {
    const { apiBaseUrl } = await serve(events);
    const provider = new AnthropicManagedAgentsProvider({
      config: {
        apiKey: 'local-test-key',
        apiBaseUrl,
        agent_id: 'agent-test',
        environment_id: 'env-test',
      },
    });
    const result = await provider.callApi('test');
    expect(result.error).toContain(error);
    expect(result.error).not.toContain('private');
    expect(result.metadata?.sessionArchived).toBe(true);
    expect(result.output).toBeUndefined();
  });

  it('does not retry a failed creation or echo API error bodies', async () => {
    const { apiBaseUrl, requests } = await serve('', 401);
    const result = await new AnthropicManagedAgentsProvider({
      config: {
        apiKey: 'local-test-key',
        apiBaseUrl,
        agent_id: 'agent-test',
        environment_id: 'env-test',
      },
    }).callApi('test');
    expect(result.error).toContain('401');
    expect(result.error).not.toContain('local-test-key');
    expect(requests).toHaveLength(1);
  });
});
