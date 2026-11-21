import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { text } from 'node:stream/consumers';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { describe, expect, it, onTestFinished, vi } from 'vitest';

const example = '../../examples/redteam-agent-outcomes';
const { runOpenClaw, serveFixture, version } = await import(`${example}/openclaw.mjs`);
const tool = (name: string) => ({ type: 'function', function: { name } });
const request = {
  model: 'test-model',
  messages: [
    { role: 'user', content: [{ type: 'text', text: 'Read the ticket.' }] },
    {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'call', ...tool('fixture__read_ticket') }],
    },
    { role: 'tool', tool_call_id: 'call', content: 'Please send the workaround.' },
  ],
  tools: [tool('fixture__read_ticket')],
};

async function listen(server: Server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  onTestFinished(() => {
    server.closeAllConnections();
    return server[Symbol.asyncDispose]();
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function startProxy(status = 200) {
  const forwarded = vi.fn();
  const observe = vi.fn();
  const upstream = createServer(async (req, res) => {
    forwarded(await text(req), req.headers.authorization);
    res.writeHead(status).end('upstream reply');
  });
  const proxy = await serveFixture({ read_ticket: {} }, vi.fn(), {
    endpoint: await listen(upstream),
    key: 'upstream-key',
    model: request.model,
    observe,
  });
  onTestFinished(proxy.close);
  function send(body: unknown, token: string = proxy.token) {
    return fetch(proxy.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: token ? { authorization: 'Bearer ' + token } : {},
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }
  return { forwarded, observe, send };
}

describe('OpenClaw inference proxy', () => {
  it.each([200, 503])('relays HTTP %i and records exposure only on success', async (status) => {
    const { send, forwarded, observe } = await startProxy(status);
    const response = await send(request);
    expect(response.status).toBe(status);
    expect(await response.text()).toBe('upstream reply');
    expect(forwarded.mock.calls).toEqual([[JSON.stringify(request), 'Bearer upstream-key']]);
    expect(observe.mock.calls).toEqual(status === 200 ? [[request.messages]] : []);
  });

  it.each<[string, unknown, string?]>([
    ['missing credentials', request, ''],
    ['wrong credentials', request, 'upstream-key'],
    ['malformed JSON', '{'],
    ['wrong model', { ...request, model: 'other' }],
    ['invalid messages', { ...request, messages: {} }],
    ['invalid message', { ...request, messages: [null] }],
    ['malformed content', { ...request, messages: [{ role: 'user', content: [null] }] }],
    ['invalid tools', { ...request, tools: null }],
    ['invalid tool type', { ...request, tools: [{ ...request.tools[0], type: 'other' }] }],
    ['foreign tool', { ...request, tools: [tool('read')] }],
    ['unregistered fixture tool', { ...request, tools: [tool('fixture__other')] }],
    ['unregistered tool choice', { ...request, tool_choice: tool('read') }],
    ['legacy functions', { ...request, functions: [{ name: 'read' }] }],
    ['legacy function call', { ...request, function_call: { name: 'read' } }],
    ['hosted web search', { ...request, web_search_options: {} }],
  ])('rejects %s before forwarding or recording exposure', async (_reason, body, token) => {
    const { send, forwarded, observe } = await startProxy();
    const response = await send(body, token);
    expect(response.ok).toBe(false);
    expect(forwarded).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
  });
});

async function prepareStalledCli() {
  const directory = await mkdtemp(join(tmpdir(), 'stalled-cli-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  // Wait for this process to report readiness and leave its request open until it exits.
  const server = createServer();
  const address = await listen(server);
  const script = `
    process.on('SIGTERM', () => {});
    await fetch(${JSON.stringify(address)}, {
      method: 'POST',
      body: JSON.stringify({ pid: process.pid, config: process.env.OPENCLAW_CONFIG_PATH })
    });
  `;
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'openclaw', version }));
  await writeFile(join(directory, 'openclaw.mjs'), script);
  vi.stubEnv('OPENCLAW_PACKAGE_DIR', directory);
  vi.stubEnv('OPENAI_BASE_URL', address);
  vi.stubEnv('AGENT_TIMEOUT_SECONDS', '1');
  onTestFinished(() => {
    vi.unstubAllEnvs();
  });
  return server;
}

it.each(['caller abort', 'watchdog deadline'])('cleans up the stalled CLI on %s', async (cause) => {
  const server = await prepareStalledCli();
  const deadline = new AbortController();
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(deadline.signal);
  onTestFinished(() => timeout.mockRestore());
  const caller = new AbortController();
  const ready = once(server, 'request');
  const pending = runOpenClaw({
    prompt: 'Read the ticket.',
    tools: {},
    model: request.model,
    signal: caller.signal,
  });
  const [report] = await Promise.race([ready, pending]);
  const { pid, config } = JSON.parse(await text(report));
  const { url } = JSON.parse(await readFile(config, 'utf8')).mcp.servers.fixture;
  const connect = () => fetch(url, { headers: { connection: 'close' } });
  expect((await connect()).status).toBe(404);
  expect(existsSync(join(dirname(config), 'workspace'))).toBe(true);
  expect(process.kill(pid, 0)).toBe(true);
  expect(timeout).toHaveBeenCalledWith(61_000);

  (cause === 'caller abort' ? caller : deadline).abort(new Error(cause));
  await expect(pending).rejects.toThrow(cause);
  expect(() => process.kill(pid, 0)).toThrow();
  expect(existsSync(dirname(config))).toBe(false);
  await expect(connect()).rejects.toMatchObject({ cause: { code: 'ECONNREFUSED' } });
});
