const { createWarningLoggerModule } = await vi.hoisted(async () => import('../factories/logger'));

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCache, isCacheEnabled } from '../../src/cache';
import { BlandProvider, createBlandProvider, getUserTurns } from '../../src/providers/bland';
import { loadApiProvider } from '../../src/providers/index';
import { fetchWithTimeout } from '../../src/util/fetch/index';
import { trackResponseDeadline } from '../../src/util/fetch/responseDeadline';
import {
  composeResponseHeadersObservers,
  createResponseHeadersObserver,
  isResponseHeadersObserverErrorResponse,
} from '../../src/util/fetch/responseHeadersObserver';

import type { BlandTurnData } from '../../src/providers/bland';

vi.mock('../../src/util/fetch/index', async () => {
  const actual = await vi.importActual<typeof import('../../src/util/fetch/index')>(
    '../../src/util/fetch/index',
  );
  return { ...actual, fetchWithTimeout: vi.fn() };
});
vi.mock('../../src/logger', () => createWarningLoggerModule());
vi.mock('../../src/cache', async () => {
  const actual = await vi.importActual<typeof import('../../src/cache')>('../../src/cache');
  return { ...actual, getCache: vi.fn(), isCacheEnabled: vi.fn() };
});

interface Recorded {
  url: string;
  headers: Record<string, string>;
  body: any;
}

/**
 * A stand-in for Bland's pathway chat API. `reply` decides what the agent says to
 * each message (`null` is the empty greeting request).
 */
function fakeBland(reply: (message: string | null, turn: number) => Partial<BlandTurnData>) {
  const requests: Recorded[] = [];
  const turns = new Map<string, number>();
  let chats = 0;
  vi.mocked(fetchWithTimeout).mockImplementation(async (url, options: any = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    requests.push({ url: String(url), headers: options.headers, body });
    const path = new URL(String(url)).pathname;
    if (path === '/v1/pathway/chat/create') {
      const chatId = `chat-${++chats}`;
      turns.set(chatId, 0);
      return Response.json({
        data: { chat_id: chatId, message: 'Chat instance created successfully', variables: null },
        errors: null,
      });
    }
    const match = path.match(/^\/v1\/pathway\/chat\/(.+)$/);
    if (match) {
      const chatId = decodeURIComponent(match[1]);
      const turn = turns.get(chatId) ?? 0;
      turns.set(chatId, turn + 1);
      const message = typeof body.message === 'string' ? body.message : null;
      return Response.json({
        data: {
          chat_id: chatId,
          current_node_id: `node-${turn}`,
          current_node_name: `Node ${turn}`,
          variables: {},
          completed: false,
          ...reply(message, turn),
        },
        errors: null,
      });
    }
    throw new Error(`unexpected request ${url}`);
  });
  return { requests, turns: () => requests.filter((r) => r.url.includes('/chat/chat-')) };
}

const echo = (message: string | null) => ({
  assistant_responses: [
    message === null ? 'Hi, this is the clinic. How can I help?' : `You said: ${message}`,
  ],
});

describe('BlandProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(isCacheEnabled).mockReturnValue(false);
    vi.stubEnv('BLAND_API_KEY', 'test-bland-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('routing', () => {
    it('creates agent and pathway targets', () => {
      expect(createBlandProvider('bland:agent:agt_123').id()).toBe('bland:agent:agt_123');
      expect(createBlandProvider('bland:pathway:pw-1').id()).toBe('bland:pathway:pw-1');
    });

    it('is loaded through the provider registry', async () => {
      const provider = await loadApiProvider('bland:agent:agt_123');
      expect(provider).toBeInstanceOf(BlandProvider);
    });

    it('rejects unknown target types and missing IDs', () => {
      expect(() => createBlandProvider('bland:call:abc')).toThrow(/Unknown Bland target/);
      expect(() => createBlandProvider('bland:agent:')).toThrow(/requires a agent ID/);
    });

    it('rejects pathway-only settings on agents and agentVersion on pathways', () => {
      expect(() => createBlandProvider('bland:agent:a', { config: { startNodeId: 'n1' } })).toThrow(
        /use agentVersion/,
      );
      expect(() =>
        createBlandProvider('bland:pathway:p', { config: { agentVersion: 'staging' } }),
      ).toThrow(/use pathwayVersion/);
    });

    it('honors a custom provider id', () => {
      expect(createBlandProvider('bland:agent:a', { id: 'front-desk' }).id()).toBe('front-desk');
    });
  });

  describe('single prompt', () => {
    it('opens a chat, takes the greeting, then sends the prompt', async () => {
      const api = fakeBland(echo);
      const provider = createBlandProvider('bland:agent:agt_123', {
        config: { agentVersion: 'staging' },
      });

      const result = await provider.callApi('I need to reschedule');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('You said: I need to reschedule');
      expect(result.sessionId).toBe('chat-1');
      expect(api.requests.map((r) => [new URL(r.url).pathname, r.body])).toEqual([
        ['/v1/pathway/chat/create', { agent_id: 'agt_123', agent_version: 'staging' }],
        ['/v1/pathway/chat/chat-1', {}],
        ['/v1/pathway/chat/chat-1', { message: 'I need to reschedule' }],
      ]);
      expect(api.requests[0].headers.authorization).toBe('test-bland-key');
      expect(result.metadata?.bland.transcript).toEqual([
        {
          user: null,
          assistant: ['Hi, this is the clinic. How can I help?'],
          nodeId: 'node-0',
          nodeName: 'Node 0',
        },
        {
          user: 'I need to reschedule',
          assistant: ['You said: I need to reschedule'],
          nodeId: 'node-1',
          nodeName: 'Node 1',
        },
      ]);
    });

    it('skips the greeting when includeGreeting is false', async () => {
      const api = fakeBland(echo);
      const provider = createBlandProvider('bland:pathway:pw-1', {
        config: {
          includeGreeting: false,
          pathwayVersion: 3,
          startNodeId: 'n7',
          useCandidateModel: true,
        },
      });

      await provider.callApi('hello');

      expect(api.requests[0].body).toEqual({
        pathway_id: 'pw-1',
        pathway_version: 3,
        start_node_id: 'n7',
        use_candidate_model: true,
      });
      expect(api.turns().map((r) => r.body)).toEqual([{ message: 'hello' }]);
    });

    it('joins multiple assistant messages from one turn', async () => {
      fakeBland(() => ({ assistant_responses: ['Sure.', 'What day works?'] }));
      const result = await createBlandProvider('bland:agent:a', {
        config: { includeGreeting: false },
      }).callApi('reschedule');
      expect(result.output).toBe('Sure.\nWhat day works?');
    });

    it('renders requestData with the test vars', async () => {
      const api = fakeBland(echo);
      const provider = createBlandProvider('bland:agent:a', {
        config: {
          requestData: { from: '+15555550100', patient: { name: '{{name}}' }, tags: ['{{tier}}'] },
        },
      });

      await provider.callApi('hi', {
        vars: { name: 'Ada', tier: 'gold' },
        prompt: { raw: 'hi', label: 'hi' },
      });

      expect(api.requests[0].body.request_data).toEqual({
        from: '+15555550100',
        patient: { name: 'Ada' },
        tags: ['gold'],
      });
    });

    it('surfaces variables, variable changes and the current node', async () => {
      fakeBland((message) =>
        message === null
          ? { assistant_responses: ['Hello'] }
          : {
              assistant_responses: ['Booked for Tuesday.'],
              current_node_name: 'Confirm booking',
              variables: { appointment_day: 'Tuesday' },
              variable_changes: {
                added: { appointment_day: 'Tuesday' },
                modified: {},
                removed: [],
              },
            },
      );
      const result = await createBlandProvider('bland:agent:a').callApi('Tuesday please');
      expect(result.metadata?.bland).toMatchObject({
        chatId: 'chat-1',
        currentNodeName: 'Confirm booking',
        variables: { appointment_day: 'Tuesday' },
        variableChanges: { added: { appointment_day: 'Tuesday' } },
        completed: false,
      });
      expect(result.conversationEnded).toBeUndefined();
    });

    it('marks the conversation ended when the agent completes', async () => {
      fakeBland((message) => ({
        assistant_responses: [message === null ? 'Hi' : 'Goodbye!'],
        completed: message !== null,
      }));
      const result = await createBlandProvider('bland:agent:a').callApi('bye');
      expect(result.conversationEnded).toBe(true);
      expect(result.conversationEndReason).toBe('agent_completed');
      expect(result.metadata?.bland.completed).toBe(true);
    });
  });

  describe('multi-turn', () => {
    it('replays the user turns of a chat-formatted prompt in one conversation', async () => {
      const api = fakeBland(echo);
      const prompt = JSON.stringify([
        { role: 'system', content: 'ignored' },
        { role: 'user', content: 'I want to book' },
        { role: 'assistant', content: 'stale reply that the agent will not see' },
        { role: 'user', content: 'Tuesday' },
      ]);

      const result = await createBlandProvider('bland:agent:a').callApi(prompt);

      expect(api.requests.filter((r) => r.url.endsWith('/create'))).toHaveLength(1);
      expect(api.turns().map((r) => r.body)).toEqual([
        {},
        { message: 'I want to book' },
        { message: 'Tuesday' },
      ]);
      expect(result.output).toBe('You said: Tuesday');
      expect(result.metadata?.bland.transcript).toHaveLength(3);
    });

    it('stops sending turns once the agent ends the conversation', async () => {
      const api = fakeBland((message) => ({
        assistant_responses: [`re: ${message}`],
        completed: message === 'cancel',
      }));
      const prompt = JSON.stringify([
        { role: 'user', content: 'cancel' },
        { role: 'user', content: 'are you there?' },
      ]);
      const result = await createBlandProvider('bland:agent:a').callApi(prompt);
      expect(api.turns().map((r) => r.body)).toEqual([{}, { message: 'cancel' }]);
      expect(result.output).toBe('re: cancel');
      expect(result.conversationEnded).toBe(true);
    });

    it('continues an existing chat when the test passes a sessionId', async () => {
      const api = fakeBland(echo);
      const provider = createBlandProvider('bland:agent:a');

      const first = await provider.callApi('first');
      const second = await provider.callApi('second', {
        vars: { sessionId: first.sessionId! },
        prompt: { raw: 'second', label: 'second' },
      });

      expect(second.sessionId).toBe(first.sessionId);
      expect(api.requests.filter((r) => r.url.endsWith('/create'))).toHaveLength(1);
      expect(api.requests.at(-1)?.url).toBe('https://api.bland.ai/v1/pathway/chat/chat-1');
      expect(api.requests.at(-1)?.body).toEqual({ message: 'second' });
    });

    it('sends only the newest user turn of a chat template when continuing a session', async () => {
      // Stateful strategies such as Crescendo pass the rendered target template on
      // every round; the chat already holds the earlier turns.
      const api = fakeBland(echo);
      const provider = createBlandProvider('bland:agent:a', { config: { includeGreeting: false } });
      const first = await provider.callApi('hello');
      const prompt = JSON.stringify([
        { role: 'system', content: 'You are a patient.' },
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'You said: hello' },
        { role: 'user', content: 'can I move my visit?' },
      ]);
      await provider.callApi(prompt, {
        vars: { sessionId: first.sessionId! },
        prompt: { raw: prompt, label: 'p' },
      });
      expect(api.turns().map((r) => r.body)).toEqual([
        { message: 'hello' },
        { message: 'can I move my visit?' },
      ]);
    });

    it('returns the whole transcript, greeting included, after a continuation', async () => {
      fakeBland(echo);
      const provider = createBlandProvider('bland:agent:a');
      const first = await provider.callApi('first');
      const second = await provider.callApi('second', {
        vars: { sessionId: first.sessionId! },
        prompt: { raw: 'second', label: 'second' },
      });
      const transcript = (second.metadata as any).bland.transcript;
      expect(transcript.map((t: any) => t.user)).toEqual([null, 'first', 'second']);
      expect(second.output).toBe('You said: second');
      // The first response's transcript is not changed by the continuation.
      expect((first.metadata as any).bland.transcript).toHaveLength(2);
    });

    it('isolates an overlapping evaluation even when it receives a live chat ID', async () => {
      const api = fakeBland(echo);
      const provider = createBlandProvider('bland:agent:a');
      const ctx = { vars: {}, prompt: { raw: 'p', label: 'p' } };
      const first = await provider.callApi('first', { ...ctx, evaluationId: 'A' });
      const other = await provider.callApi('second', {
        ...ctx,
        evaluationId: 'B',
        vars: { sessionId: first.sessionId! },
      });
      expect(other.sessionId).not.toBe(first.sessionId);
      expect(api.requests.filter((r) => r.url.endsWith('/create'))).toHaveLength(2);
    });

    it('does not continue chats from an earlier evaluation after cleanup', async () => {
      const api = fakeBland(echo);
      const provider = createBlandProvider('bland:agent:a');
      const first = await provider.callApi('first');
      await provider.cleanupAfterEvaluation?.({ reason: 'evaluation-complete' });
      const rerun = await provider.callApi('again', {
        vars: { sessionId: first.sessionId! },
        prompt: { raw: 'again', label: 'again' },
      });
      expect(rerun.sessionId).toBe('chat-2');
      expect(api.requests.filter((r) => r.url.endsWith('/create'))).toHaveLength(2);
    });

    it('starts a new chat when sessionId is a client-side ID, not a Bland chat', async () => {
      // Red team configs often set sessionId to a fresh UUID per test for correlation.
      const api = fakeBland(echo);
      const result = await createBlandProvider('bland:agent:a').callApi('hi', {
        vars: { sessionId: '0b4f3c1e-8d1a-4c55-9b7e-2f6a9d1c7e10' },
        prompt: { raw: 'hi', label: 'hi' },
      });
      expect(api.requests[0].url).toBe('https://api.bland.ai/v1/pathway/chat/create');
      expect(result.sessionId).toMatch(/^chat-/);
      expect(result.output).toBe('You said: hi');
    });
  });

  describe('getUserTurns', () => {
    it('treats plain text and non-chat JSON as a single turn', () => {
      expect(getUserTurns('hello')).toEqual(['hello']);
      expect(getUserTurns("{'appointment': 'Tuesday'}")).toEqual(["{'appointment': 'Tuesday'}"]);
      expect(getUserTurns('{"a":1}')).toEqual(['{"a":1}']);
      expect(getUserTurns('[1, 2]')).toEqual(['[1, 2]']);
    });

    it('reads YAML chat prompts and stringifies structured content', () => {
      expect(getUserTurns('- role: user\n  content: hi\n- role: user\n  content: there')).toEqual([
        'hi',
        'there',
      ]);
      expect(
        getUserTurns(JSON.stringify([{ role: 'user', content: [{ type: 'text', text: 'x' }] }])),
      ).toEqual(['[{"type":"text","text":"x"}]']);
    });

    it('falls back to the raw prompt when a chat has no user messages', () => {
      const prompt = JSON.stringify([{ role: 'system', content: 'only system' }]);
      expect(getUserTurns(prompt)).toEqual([prompt]);
    });
  });

  describe('errors', () => {
    it('returns an error without calling the API when no key is set', async () => {
      vi.unstubAllEnvs();
      vi.stubEnv('BLAND_API_KEY', '');
      const result = await createBlandProvider('bland:agent:a').callApi('hi');
      expect(result.error).toMatch(/BLAND_API_KEY/);
      expect(fetchWithTimeout).not.toHaveBeenCalled();
    });

    it('prefers the config apiKey and a custom base URL', async () => {
      const api = fakeBland(echo);
      await createBlandProvider('bland:agent:a', {
        config: { apiKey: 'cfg-key', apiBaseUrl: 'https://eu.api.bland.ai/' },
      }).callApi('hi');
      expect(api.requests[0].url).toBe('https://eu.api.bland.ai/v1/pathway/chat/create');
      expect(api.requests[0].headers.authorization).toBe('cfg-key');
    });

    it('reports Bland errors with the status and keeps the partial transcript', async () => {
      let call = 0;
      vi.mocked(fetchWithTimeout).mockImplementation(async (url) => {
        call++;
        if (String(url).endsWith('/create')) {
          return Response.json({ data: { chat_id: 'chat-1' }, errors: null });
        }
        if (call === 2) {
          return Response.json({ data: { assistant_responses: ['Hello'] }, errors: null });
        }
        return Response.json(
          { data: null, errors: [{ message: 'ROUTE_NO_MATCH_NO_FALLBACK at node Intake' }] },
          { status: 422 },
        );
      });

      const result = await createBlandProvider('bland:agent:a').callApi('???');

      expect(result.error).toBe(
        'Bland API 422 on /v1/pathway/chat/chat-1: ROUTE_NO_MATCH_NO_FALLBACK at node Intake',
      );
      expect(result.sessionId).toBe('chat-1');
      expect(result.metadata?.bland.transcript).toHaveLength(1);
    });

    it('reports errors returned with a 200 status', async () => {
      vi.mocked(fetchWithTimeout).mockResolvedValue(
        Response.json({ data: null, errors: ['Invalid agent_id'] }),
      );
      const result = await createBlandProvider('bland:agent:nope').callApi('hi');
      expect(result.error).toBe('Bland API 200 on /v1/pathway/chat/create: Invalid agent_id');
    });

    it('reports a non-JSON error body', async () => {
      vi.mocked(fetchWithTimeout).mockResolvedValue(
        new Response('upstream timeout', { status: 502, statusText: 'Bad Gateway' }),
      );
      const result = await createBlandProvider('bland:agent:a').callApi('hi');
      expect(result.error).toBe('Bland API 502 on /v1/pathway/chat/create: upstream timeout');
    });

    it('retries the same turn after a 429, honoring Retry-After', async () => {
      vi.useFakeTimers();
      try {
        const api = fakeBland(echo);
        const real = vi.mocked(fetchWithTimeout).getMockImplementation()!;
        let limited = false;
        vi.mocked(fetchWithTimeout).mockImplementation(async (url, options) => {
          if (
            !limited &&
            String(url).endsWith('/chat-1') &&
            JSON.parse((options as any).body).message
          ) {
            limited = true;
            return new Response('rate limited', { status: 429, headers: { 'Retry-After': '1' } });
          }
          return real(url, options as any, 0);
        });

        const onResponseHeaders = vi.fn();
        const pending = createBlandProvider('bland:agent:a').callApi('hi', undefined, {
          onResponseHeaders,
        });
        await vi.advanceTimersByTimeAsync(1000);
        const result = await pending;

        expect(result.output).toBe('You said: hi');
        expect(api.turns().map((r) => r.body)).toEqual([{}, { message: 'hi' }]);
        expect(fetchWithTimeout).toHaveBeenCalledTimes(4);
        // The backoff is published so the scheduler can hold other queued calls.
        expect(onResponseHeaders).toHaveBeenCalledTimes(1);
        const [headers, backoff] = onResponseHeaders.mock.calls[0];
        expect(headers['retry-after']).toBe('1');
        expect(backoff).toMatchObject({ status: 429, headers });
        expect(typeof backoff.resetAt).toBe('number');
      } finally {
        vi.useRealTimers();
      }
    });

    it('releases each retried 429 body and publishes the final 429 too', async () => {
      vi.useFakeTimers();
      try {
        const cancels: number[] = [];
        let limited = 0;
        vi.mocked(fetchWithTimeout).mockImplementation(async (url) => {
          if (String(url).endsWith('/create')) {
            return Response.json({ data: { chat_id: 'chat-1' }, errors: null });
          }
          const n = ++limited;
          // highWaterMark 0: nothing is read until a consumer asks, so cancel() is observable.
          const body = new ReadableStream(
            {
              pull(controller) {
                controller.enqueue(new TextEncoder().encode('rate limited'));
                controller.close();
              },
              cancel() {
                cancels.push(n);
              },
            },
            { highWaterMark: 0 },
          );
          return new Response(body, { status: 429, headers: { 'Retry-After': '1' } });
        });
        const onResponseHeaders = vi.fn();
        const pending = createBlandProvider('bland:agent:a', {
          config: { includeGreeting: false },
        }).callApi('hi', undefined, { onResponseHeaders });
        await vi.advanceTimersByTimeAsync(10_000);
        const result = await pending;

        expect(result.error).toMatch(/Bland API 429/);
        expect(result.metadata?.rateLimitRetryable).toBe(false);
        // Every 429, including the last one, reaches the scheduler.
        expect(onResponseHeaders).toHaveBeenCalledTimes(limited);
        // Retried responses are cancelled; the last one is read for the error message.
        expect(cancels).toEqual(Array.from({ length: limited - 1 }, (_, i) => i + 1));
      } finally {
        vi.useRealTimers();
      }
    });

    it("marks a throwing onResponseHeaders callback as the caller's error", async () => {
      vi.mocked(fetchWithTimeout).mockImplementation(async (url) =>
        String(url).endsWith('/create')
          ? Response.json({ data: { chat_id: 'chat-1' }, errors: null })
          : new Response('rate limited', { status: 429, headers: { 'Retry-After': '1' } }),
      );
      const failure = new Error('rate limit exceeded');
      const observer = composeResponseHeadersObservers(
        createResponseHeadersObserver({}, () => true),
        () => {
          throw failure;
        },
      );
      const result = await createBlandProvider('bland:agent:a', {
        config: { includeGreeting: false },
      }).callApi('hi', undefined, { onResponseHeaders: observer });

      expect(result.error).toBe('rate limit exceeded');
      expect(isResponseHeadersObserverErrorResponse(result)).toBe(true);
    });

    it('stops waiting out a 429 as soon as the caller cancels', async () => {
      vi.mocked(fetchWithTimeout).mockImplementation(async (url) =>
        String(url).endsWith('/create')
          ? Response.json({ data: { chat_id: 'chat-1' }, errors: null })
          : new Response('rate limited', { status: 429, headers: { 'Retry-After': '3600' } }),
      );
      const controller = new AbortController();
      const pending = createBlandProvider('bland:agent:a').callApi('hi', undefined, {
        abortSignal: controller.signal,
      });
      setTimeout(() => controller.abort(), 10);

      await expect(pending).rejects.toThrow(/abort/i);
      expect(fetchWithTimeout).toHaveBeenCalledTimes(2);
    });

    it('keeps the request timeout active while reading a stalled body', async () => {
      vi.mocked(fetchWithTimeout).mockImplementation(async () => {
        // Headers arrive, then the body never finishes.
        const response = new Response(new ReadableStream({ start() {} }), { status: 200 });
        trackResponseDeadline(response, {
          controller: new AbortController(),
          expiresAt: performance.now() + 20,
          timeout: 20,
        });
        return response;
      });
      const result = await createBlandProvider('bland:agent:a', {
        config: { timeout: 20 },
      }).callApi('hi');
      expect(result.error).toMatch(/timed out after 20 ms/);
    });

    it('never asks the scheduler to replay a call', () => {
      expect(createBlandProvider('bland:agent:a').handlesOwnRetries).toBe(true);
    });
  });

  describe('caching', () => {
    it('never caches, since responses carry a live chat ID', async () => {
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      fakeBland(echo);
      const provider = createBlandProvider('bland:agent:a');

      const first = await provider.callApi('hi');
      const second = await provider.callApi('hi');

      expect(getCache).not.toHaveBeenCalled();
      expect(first.sessionId).toBe('chat-1');
      expect(second.sessionId).toBe('chat-2');
      expect(second.cached).toBeUndefined();
    });
  });
});
