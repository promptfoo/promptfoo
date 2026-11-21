import { once } from 'node:events';
import { createServer } from 'node:http';
import { text } from 'node:stream/consumers';
import type { AddressInfo } from 'node:net';

import { describe, expect, it, onTestFinished, vi } from 'vitest';

const example = '../../examples/redteam-agent-outcomes';
const { serveFixture } = await import(`${example}/openclaw.mjs`);
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

async function startProxy(status = 200) {
  const forwarded = vi.fn();
  const observe = vi.fn();
  const upstream = createServer(async (req, res) => {
    forwarded(await text(req), req.headers.authorization);
    res.writeHead(status).end('upstream reply');
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  onTestFinished(() => upstream[Symbol.asyncDispose]());
  const proxy = await serveFixture({ read_ticket: {} }, vi.fn(), {
    endpoint: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,
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
