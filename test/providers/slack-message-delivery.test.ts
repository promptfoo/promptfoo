import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SlackProvider } from '../../src/providers/slack';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';

const post = '/api/chat.postMessage';
const history = '/api/conversations.history';

function posted() {
  return Response.json({ ok: true, channel: 'C123', ts: '100' });
}

function reply() {
  return Response.json({ ok: true, messages: [{ type: 'message', ts: '101', text: 'reply' }] });
}

function interrupted() {
  return new Response(
    new ReadableStream({
      start(controller) {
        // An underlying error mentioning rate limits must not trigger a scheduler retry either.
        controller.error(new TypeError('rate limit proxy interrupted the response body'));
      },
    }),
    { status: 200 },
  );
}

async function callWithResponses(...responses: Response[]) {
  const transport = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('Unexpected request'));
  for (const response of responses) {
    transport.mockResolvedValueOnce(response);
  }
  const provider = new SlackProvider({ config: { token: 'test-token', channel: 'C123' } });
  const registry = new RateLimitRegistry({ maxConcurrency: 1 });
  try {
    const pending = wrapProviderWithRateLimiting(provider, registry).callApi('prompt');
    await vi.runAllTimersAsync();
    const result = await pending;
    const methods = transport.mock.calls.map(([url]) => new URL(String(url)).pathname);
    return { result, methods };
  } finally {
    registry.dispose();
  }
}

describe('Slack message delivery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each([
    ['interrupted body', interrupted],
    ['JSON null', () => Response.json(null)],
    [
      'invalid response metadata with scope headers',
      () =>
        Response.json(
          { ok: true, response_metadata: null },
          { headers: { 'x-oauth-scopes': 'chat:write' } },
        ),
    ],
  ] as const)('sends once when Slack returns HTTP 200 with %s', async (_label, response) => {
    const { result, methods } = await callWithResponses(response(), posted(), reply());

    expect(methods).toEqual([post]);
    expect(result).toEqual({
      error: 'Slack may have posted the message. Check the channel before retrying.',
      metadata: { rateLimitRetryable: false },
    });
  });

  it('polls for a reply after an acknowledged post', async () => {
    const { result, methods } = await callWithResponses(posted(), reply());

    expect(methods).toEqual([post, history]);
    expect(result).toMatchObject({ output: 'reply', metadata: { messageTs: '100' } });
  });

  it('retries a post that Slack rejected with HTTP 429', async () => {
    const rateLimited = new Response(null, { status: 429, headers: { 'retry-after': '1' } });
    const { result, methods } = await callWithResponses(rateLimited, posted(), reply());

    expect(methods).toEqual([post, post, history]);
    expect(result.output).toBe('reply');
  });

  it('retries an interrupted history read without resending the prompt', async () => {
    const { result, methods } = await callWithResponses(posted(), interrupted(), reply());

    expect(methods).toEqual([post, history, history]);
    expect(result.output).toBe('reply');
  });
});
