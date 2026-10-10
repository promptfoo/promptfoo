import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnthropicManagedAgentsProvider } from '../../../src/providers/anthropic/managedAgents';

const servers: Server[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
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
  let stream: ServerResponse | undefined;
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
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.flushHeaders();
      if (stream) {
        // A reconnect meets the same stream again.
        res.end(events);
      } else {
        stream = res;
      }
    } else {
      res.writeHead(200, { 'content-type': 'application/json' });
      if (path.endsWith('/events') && req.method === 'POST') {
        // Write one byte at a time to exercise framing across UTF-8 and CRLF boundaries.
        for (const byte of Buffer.from(events)) {
          stream!.write(Buffer.from([byte]));
        }
        stream!.end();
        res.end('{}');
      } else if (path.endsWith('/events')) {
        // The session's history holds nothing the streams did not carry.
        res.end(JSON.stringify({ data: [], next_page: null }));
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

// The API gives every event its own id, which is what a reconnect deduplicates on.
let eventSequence = 0;
function event(type: string, fields: Record<string, unknown> = {}) {
  return `event: ${type}\r\ndata: ${JSON.stringify({ id: `sevt-${++eventSequence}`, type, ...fields })}\r\n\r\n`;
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
      '/v1/environments/env-test',
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

  const existing = (apiBaseUrl: string) =>
    new AnthropicManagedAgentsProvider({
      config: {
        apiKey: 'local-test-key',
        apiBaseUrl,
        agent_id: 'agent-test',
        environment_id: 'env-test',
      },
    });
  const streamsOpened = (requests: { path: string }[]) =>
    requests.filter((request) => request.path.endsWith('/events/stream')).length;

  it.each([
    ['data: {bad-json}\n\n', 'Claude Managed Agents stream contains invalid JSON'],
    ['data: null\n\n', 'Claude Managed Agents stream contains an invalid event'],
  ])('fails at once on a stream that cannot be read %#', async (events, error) => {
    const { apiBaseUrl, requests } = await serve(events);
    const result = await existing(apiBaseUrl).callApi('test');
    expect(result.error).toBe(error);
    expect(streamsOpened(requests)).toBe(1);
    expect(result.metadata?.sessionArchived).toBe(true);
    expect(result.output).toBeUndefined();
  });

  it.each([
    ['data: {"type":"agent.message"}', 'the stream ended with an incomplete event'],
    [
      event('error', { error: { type: 'overloaded_error', message: 'private' } }),
      'the stream reported an API error (overloaded_error)',
    ],
  ])(
    'reconnects after a stream that fails, and reports why it gave up %#',
    async (events, reason) => {
      const { apiBaseUrl, requests } = await serve(events);
      const result = await existing(apiBaseUrl).callApi('test');
      expect(result.error).toBe(
        `Claude Managed Agents event stream ended before the session completed (${reason})`,
      );
      // Each of the two reconnects opened a stream and then read the history.
      expect(streamsOpened(requests)).toBe(3);
      expect(requests.filter((r) => r.method === 'GET' && r.path.endsWith('/events'))).toHaveLength(
        2,
      );
      expect(result.error).not.toContain('private');
      expect(result.metadata?.sessionArchived).toBe(true);
      expect(result.output).toBeUndefined();
    },
  );

  it('reconnects through the installed SDK after the connection drops', async () => {
    const text = (id: string, value: string) => ({
      id,
      type: 'agent.message',
      content: [{ type: 'text', text: value }],
    });
    const working = text('sevt-working', 'working');
    const answer = text('sevt-answer', 'answer');
    const done = {
      id: 'sevt-done',
      type: 'session.status_idle',
      stop_reason: { type: 'end_turn' },
    };
    const frame = (value: { type: string }) =>
      `event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`;
    const requests: string[] = [];
    let first: ServerResponse | undefined;
    const server = createServer(async (req, res) => {
      for await (const _chunk of req) {
        // Drain the request body.
      }
      const path = new URL(req.url!, 'http://localhost').pathname;
      requests.push(`${req.method} ${path}`);
      if (path.endsWith('/events/stream')) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.flushHeaders();
        if (first) {
          // The second connection only carries what happens after it opened.
          res.write(frame(done));
        } else {
          first = res;
        }
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      if (path.endsWith('/events') && req.method === 'POST') {
        first!.write(frame(working));
        // The session keeps running after its stream is cut.
        first!.destroy();
        res.end('{}');
      } else if (path.endsWith('/events')) {
        res.end(JSON.stringify({ data: [working, answer], next_page: null }));
      } else {
        res.end(JSON.stringify({ id: 'sesn-http', usage: { input_tokens: 1, output_tokens: 2 } }));
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    const result = await new AnthropicManagedAgentsProvider({
      config: {
        apiKey: 'local-test-key',
        apiBaseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        agent_id: 'agent-test',
        environment_id: 'env-test',
      },
    }).callApi('test');
    expect(result.error).toBeUndefined();
    // `answer` was emitted while disconnected and is only in the history.
    expect(result.output).toBe('answer');
    expect(requests).toEqual([
      'GET /v1/environments/env-test',
      'POST /v1/sessions',
      'GET /v1/sessions/sesn-http/events/stream',
      'POST /v1/sessions/sesn-http/events',
      'GET /v1/sessions/sesn-http/events/stream',
      'GET /v1/sessions/sesn-http/events',
      'GET /v1/sessions/sesn-http',
      'POST /v1/sessions/sesn-http/archive',
    ]);
  });

  it('archives a session whose create lost its response', async () => {
    const requests: string[] = [];
    const server = createServer(async (req, res) => {
      for await (const _chunk of req) {
        // Drain the request body.
      }
      const url = new URL(req.url!, 'http://localhost');
      requests.push(`${req.method} ${url.pathname}${url.searchParams.get('agent_id') ?? ''}`);
      if (req.method === 'POST' && url.pathname === '/v1/sessions') {
        // The session exists from here on, but the caller never learns its id.
        res.destroy();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify(
          req.method === 'GET' && url.pathname === '/v1/sessions'
            ? { data: [{ id: 'sesn-orphan', agent: { id: 'agent-http' } }], next_page: null }
            : { id: 'agent-http' },
        ),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    const result = await new AnthropicManagedAgentsProvider({
      config: {
        apiKey: 'local-test-key',
        apiBaseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        agent: { name: 'QA', model: 'claude-sonnet-5' },
        environment_id: 'env-test',
      },
    }).callApi('test');
    expect(result.error).toBe('Claude Managed Agents API request failed (connection error)');
    expect(result.metadata).toMatchObject({ sessionId: 'sesn-orphan', sessionArchived: true });
    expect(requests).toEqual([
      'GET /v1/environments/env-test',
      'POST /v1/agents',
      'POST /v1/sessions',
      'GET /v1/sessionsagent-http',
      'POST /v1/sessions/sesn-orphan/archive',
      'POST /v1/agents/agent-http/archive',
    ]);
  });

  it('does not suggest a create went through when nothing is listening', async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const result = await new AnthropicManagedAgentsProvider({
      config: {
        apiKey: 'local-test-key',
        apiBaseUrl: `http://127.0.0.1:${port}`,
        agent: { name: 'QA', model: 'claude-sonnet-5' },
        environment: { name: 'QA' },
      },
    }).callApi('test');
    expect(result.error).toBe('Claude Managed Agents API request failed (connection error)');
    expect(result.metadata).not.toHaveProperty('unconfirmedCreate');
  });

  it('authenticates with an API key rendered from a template', async () => {
    const { apiBaseUrl, requests } = await serve(
      event('agent.message', { content: [{ type: 'text', text: 'ok' }] }) +
        event('session.status_idle', { stop_reason: { type: 'end_turn' } }),
    );
    const result = await new AnthropicManagedAgentsProvider({
      config: {
        apiKey: '{{tenantKey}}',
        apiBaseUrl,
        agent_id: 'agent-test',
        environment_id: 'env-test',
      },
    }).callApi('test', {
      vars: { tenantKey: 'tenant-key-123' },
      prompt: { raw: 'test', label: 'test' },
    });
    expect(result.error).toBeUndefined();
    expect(requests.length).toBeGreaterThan(3);
    for (const request of requests) {
      expect(request.key).toBe('tenant-key-123');
    }
  });

  it.each([
    [
      'set for the provider',
      undefined,
      'anthropic-beta: env-beta-2026-01-01',
      'env-beta-2026-01-01,managed-agents-2026-04-01',
    ],
    [
      'set for the process',
      'anthropic-beta: env-beta-2026-01-01',
      undefined,
      'env-beta-2026-01-01,managed-agents-2026-04-01',
    ],
    [
      // The client drops every process header once the provider has its own set.
      'set for the process and replaced for the provider',
      'anthropic-beta: process-beta-2026-01-01',
      'x-scoped-only: 1',
      'managed-agents-2026-04-01',
    ],
  ])(
    'sends the betas of an ANTHROPIC_CUSTOM_HEADERS %s',
    async (_name, processValue, scoped, beta) => {
      if (processValue) {
        vi.stubEnv('ANTHROPIC_CUSTOM_HEADERS', processValue);
      }
      const { apiBaseUrl, requests } = await serve(
        event('agent.message', { content: [{ type: 'text', text: 'ok' }] }) +
          event('session.status_idle', { stop_reason: { type: 'end_turn' } }),
      );
      const result = await new AnthropicManagedAgentsProvider({
        config: {
          apiKey: 'local-test-key',
          apiBaseUrl,
          agent_id: 'agent-test',
          environment_id: 'env-test',
        },
        ...(scoped && { env: { ANTHROPIC_CUSTOM_HEADERS: scoped } }),
      }).callApi('test');
      expect(result.error).toBeUndefined();
      expect(requests.length).toBeGreaterThan(3);
      for (const request of requests) {
        expect(request.beta).toBe(beta);
      }
    },
  );

  it('keeps the required beta when the config adds its own anthropic-beta header', async () => {
    const { apiBaseUrl, requests } = await serve(
      event('agent.message', { content: [{ type: 'text', text: 'ok' }] }) +
        event('session.status_idle', { stop_reason: { type: 'end_turn' } }),
    );
    const result = await new AnthropicManagedAgentsProvider({
      config: {
        apiKey: 'local-test-key',
        apiBaseUrl,
        agent_id: 'agent-test',
        environment_id: 'env-test',
        headers: { 'anthropic-beta': 'extra-beta-2026-01-01' },
      },
    }).callApi('test');
    expect(result.error).toBeUndefined();
    expect(requests.length).toBeGreaterThan(3);
    for (const request of requests) {
      expect(request.beta).toContain('managed-agents-2026-04-01');
      expect(request.beta).toContain('extra-beta-2026-01-01');
    }
  });

  it('does not echo a credential the runtime rejects as a header value', async () => {
    const { apiBaseUrl, requests } = await serve('');
    const result = await new AnthropicManagedAgentsProvider({
      config: {
        apiKey: 'local-test-key\nsecond-line-secret',
        apiBaseUrl,
        agent_id: 'agent-test',
        environment_id: 'env-test',
      },
    }).callApi('test');
    expect(result.error).toContain('invalid header value');
    expect(result.error).not.toContain('local-test-key');
    expect(result.error).not.toContain('second-line-secret');
    expect(requests).toHaveLength(0);
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
