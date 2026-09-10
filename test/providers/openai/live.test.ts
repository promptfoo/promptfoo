import type { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAiLiveProvider } from '../../../src/providers/openai/live';
import { providerRegistry } from '../../../src/providers/providerRegistry';
import { mockProcessEnv } from '../../util/utils';

import type { OpenAiLiveOptions } from '../../../src/providers/openai/liveTypes';

interface Socket extends EventEmitter {
  readyState: number;
  url: string;
  options: {
    headers: Record<string, string>;
    followRedirects: boolean;
    agent?: { destroy: () => void; getProxyForUrl: (url: string) => string };
  };
  sent: any[];
  send(value: string): void;
  terminate: ReturnType<typeof vi.fn>;
}
const { sockets, loadCallback } = vi.hoisted(() => ({
  sockets: [] as Socket[],
  loadCallback: vi.fn(),
}));
vi.mock('../../../src/util/functions/loadFunction', () => ({
  loadCallbackFromFileUrl: loadCallback,
}));
vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    default: class extends EventEmitter {
      static OPEN = 1;
      readyState = 0;
      sent: any[] = [];
      terminate = vi.fn(() => {
        this.readyState = 3;
        this.emit('close');
      });
      constructor(
        public url: string,
        public options: Socket['options'],
      ) {
        super();
        sockets.push(this as Socket);
      }
      send(value: string) {
        this.sent.push(JSON.parse(value));
      }
    },
  };
});

const provider = (config: OpenAiLiveOptions = {}) =>
  new OpenAiLiveProvider('gpt-live-1', {
    config: {
      apiKey: 'fixture-key',
      responseWindowMs: 100,
      websocketTimeout: 200,
      closeTimeoutMs: 100,
      ...config,
    },
  });
const emit = (socket: Socket, event: object) =>
  socket.emit('message', Buffer.from(JSON.stringify(event)));
async function connect() {
  await vi.advanceTimersByTimeAsync(0);
  const socket = sockets.at(-1)!;
  socket.readyState = 1;
  socket.emit('open');
  return socket;
}
function start(socket: Socket, id = 'live_fixture') {
  emit(socket, { type: 'session.started', session: { id } });
}
function text(socket: Socket, delta = 'Hello', role = 'output', start_ms = 0, end_ms = 10) {
  emit(socket, { type: `session.${role}_transcript.delta`, delta, start_ms, end_ms });
}
function closed(socket: Socket, seconds = 12) {
  emit(socket, { type: 'session.closed', reason: 'close_requested', usage: { seconds } });
}
function backend(socket: Socket, event: object) {
  emit(socket, { type: 'response.event', delegation_id: 'delegation_1', event });
}

describe('OpenAiLiveProvider', () => {
  let restoreEnv: () => void;
  beforeEach(() => {
    restoreEnv = mockProcessEnv({}, { clear: true });
    vi.useFakeTimers();
    sockets.length = 0;
    loadCallback.mockReset();
  });
  afterEach(() => {
    restoreEnv();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('exposes its provider identity and OpenAI audio input format', () => {
    const p = provider();
    expect(p.id()).toBe('openai:live:gpt-live-1');
    expect(p.getAudioInputFormat()).toBe('openai');
  });

  it('starts Live, waits for readiness, and returns exact transcripts, WAV audio, and final duration cost', async () => {
    const result = provider({ audio: { output: { voice: 'quartz' } } }).callApi('Hello');
    const socket = await connect();
    expect(socket.url).toBe('wss://api.openai.com/v1/live/sessions');
    expect(socket.options).toMatchObject({
      followRedirects: false,
      headers: { Authorization: 'Bearer fixture-key', 'X-OpenAI-Originator': 'promptfoo' },
    });
    expect(socket.sent).toEqual([
      {
        type: 'session.start',
        session: {
          model: 'gpt-live-1',
          input: [
            { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
          ],
          audio: { format: { type: 'audio/pcm', rate: 24000 }, output: { voice: 'quartz' } },
          delegation: { type: 'client' },
        },
      },
    ]);
    start(socket);
    expect(socket.sent[1]).toMatchObject({
      type: 'session.instructions.append',
      event_id: 'promptfoo_start',
      delegation_id: null,
    });
    expect(socket.sent.some((event) => event.type === 'session.commentary.append')).toBe(false);
    emit(socket, { type: 'session.instructions.appended', client_event_id: 'another_command' });
    expect(socket.sent.some((event) => event.type === 'session.commentary.append')).toBe(false);
    emit(socket, { type: 'session.instructions.appended', client_event_id: 'promptfoo_start' });
    expect(socket.sent.at(-1)).toEqual({
      type: 'session.commentary.append',
      delegation_id: null,
      content: 'Begin now, following the instructions provided.',
    });
    emit(socket, { type: 'session.instructions.appended', client_event_id: 'promptfoo_start' });
    expect(socket.sent.filter((event) => event.type === 'session.commentary.append')).toHaveLength(
      1,
    );
    text(socket, 'Hi');
    text(socket, ' there', 'output', 10, 20);
    text(socket, 'Hello', 'input', 5, 15);
    emit(socket, {
      type: 'session.output_audio.delta',
      delta: Buffer.from([1, 0, 2, 0]).toString('base64'),
    });
    emit(socket, { type: 'session.usage.updated', usage: { seconds: 5 } });
    emit(socket, { type: 'session.usage.updated', usage: { seconds: 10 } });
    await vi.advanceTimersByTimeAsync(100);
    expect(socket.sent.at(-1)).toEqual({ type: 'session.close' });
    closed(socket);
    const response = await result;
    expect(response).toMatchObject({
      output: 'Hi there',
      cached: false,
      sessionId: 'live_fixture',
      tokenUsage: { numRequests: 1 },
      metadata: { voiceSeconds: 12, finalUsageConfirmed: true, inputTranscript: 'Hello' },
    });
    expect(response.cost).toBeCloseTo(0.01);
    expect(response.error).toBeUndefined();
    expect(response.metadata?.transcript).toHaveLength(3);
    const wav = Buffer.from(response.audio!.data!, 'base64');
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.subarray(44)).toEqual(Buffer.from([1, 0, 2, 0]));
    expect(socket.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('paces input audio and keeps streaming silence after the clip', async () => {
    const audio = Buffer.alloc(1920, 1);
    const result = provider().callApi(
      JSON.stringify([
        {
          role: 'user',
          content: [
            {
              type: 'input_audio',
              input_audio: { data: audio.toString('base64'), format: 'pcm16' },
            },
          ],
        },
      ]),
    );
    const socket = await connect();
    start(socket);
    const frames = () => socket.sent.filter((event) => event.type === 'session.input_audio.append');
    expect(frames()).toHaveLength(1);
    expect(Buffer.from(frames()[0].audio, 'base64')).toEqual(audio.subarray(0, 960));
    await vi.advanceTimersByTimeAsync(19);
    expect(frames()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(21);
    expect(frames()).toHaveLength(3);
    expect(Buffer.from(frames()[2].audio, 'base64')).toEqual(Buffer.alloc(960));
    expect(socket.sent.some((event) => event.type === 'session.instructions.append')).toBe(false);
    text(socket);
    await vi.advanceTimersByTimeAsync(100);
    closed(socket);
    expect((await result).error).toBeUndefined();
  });

  it.each([401, 403, 429, 500])('reports HTTP %s during the handshake', async (statusCode) => {
    const result = provider().callApi('Hi');
    await vi.advanceTimersByTimeAsync(0);
    sockets[0].emit('unexpected-response', {}, { statusCode, resume: vi.fn() });
    expect((await result).error).toContain(`HTTP ${statusCode}`);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps audio on its timeline when sending frames takes time', async () => {
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    const result = provider().callApi('Hi');
    const socket = await connect();
    const startedAt = Date.now();
    const frameTimes: number[] = [];
    const send = socket.send.bind(socket);
    vi.spyOn(socket, 'send').mockImplementation((value) => {
      send(value);
      if (JSON.parse(value).type === 'session.input_audio.append') {
        frameTimes.push(Date.now() - startedAt);
        vi.advanceTimersByTime(7);
      }
    });
    start(socket);
    text(socket);
    await vi.advanceTimersByTimeAsync(100);
    expect(frameTimes).toEqual([0, 20, 40, 60, 80]);
    expect(socket.sent.at(-1)).toEqual({ type: 'session.close' });
    closed(socket);
    expect((await result).error).toBeUndefined();
  });

  it('reserves startup and finalization time including the last padded audio frame', async () => {
    mockProcessEnv({ REQUEST_TIMEOUT_MS: '419' });
    expect((await provider({ responseWindowMs: 101 }).callApi('Hi')).error).toContain(
      'REQUEST_TIMEOUT_MS',
    );
    expect(sockets).toHaveLength(0);
    mockProcessEnv({ REQUEST_TIMEOUT_MS: '420' });
    const result = provider({ responseWindowMs: 101 }).callApi('Hi');
    const socket = await connect();
    await vi.advanceTimersByTimeAsync(199);
    start(socket);
    text(socket);
    await vi.advanceTimersByTimeAsync(120);
    expect(socket.sent.at(-1)).toEqual({ type: 'session.close' });
    await vi.advanceTimersByTimeAsync(99);
    closed(socket);
    expect((await result).metadata?.finalUsageConfirmed).toBe(true);
  });

  it('rejects a five-minute capture unless the overall request budget is increased', async () => {
    expect((await provider({ responseWindowMs: 300_000 }).callApi('Hi')).error).toContain(
      'REQUEST_TIMEOUT_MS',
    );
    expect(sockets).toHaveLength(0);
  });

  it('reports startup timeout and releases the socket', async () => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    await vi.advanceTimersByTimeAsync(200);
    expect((await result).error).toContain('session.started');
    expect(socket.terminate).toHaveBeenCalledOnce();
  });

  it('does not request new speech after the capture window closes', async () => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    start(socket);
    text(socket);
    await vi.advanceTimersByTimeAsync(100);
    emit(socket, { type: 'session.instructions.appended', client_event_id: 'promptfoo_start' });
    expect(socket.sent.at(-1)).toEqual({ type: 'session.close' });
    closed(socket);
    expect((await result).error).toBeUndefined();
  });

  it('preserves partial output and usage when finalization times out', async () => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    start(socket);
    text(socket);
    emit(socket, { type: 'session.usage.updated', usage: { seconds: 3 } });
    await vi.advanceTimersByTimeAsync(200);
    expect(await result).toMatchObject({
      output: 'Hello',
      error: expect.stringContaining('session.closed'),
      metadata: { finalUsageConfirmed: false, voiceSeconds: 3 },
    });
    expect((await result).cost).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not treat a transport close as successful finalization', async () => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    start(socket);
    text(socket);
    socket.emit('close');
    expect((await result).error).toContain('before session.closed');
  });

  it.each([{}, { seconds: -1 }, { seconds: '12' }])(
    'rejects missing or invalid final usage %j',
    async (usage) => {
      const result = provider().callApi('Hi');
      const socket = await connect();
      start(socket);
      text(socket);
      emit(socket, { type: 'session.usage.updated', usage: { seconds: 5 } });
      emit(socket, { type: 'session.closed', reason: 'close_requested', usage });
      expect((await result).metadata?.finalUsageConfirmed).toBe(false);
      expect((await result).error).toContain('usage is unconfirmed');
    },
  );

  it('records safety termination with final usage', async () => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    start(socket);
    text(socket, 'I cannot help');
    emit(socket, { type: 'session.closed', reason: 'content', usage: { seconds: 5 } });
    expect(await result).toMatchObject({
      isRefusal: true,
      error: expect.stringContaining('content'),
      metadata: { finalUsageConfirmed: true },
    });
  });

  it('reports a missing client handler rather than silently dropping delegated work', async () => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    start(socket);
    emit(socket, { type: 'session.delegation.created', delegation: { id: 'd', target: 'client' } });
    expect(socket.sent.at(-1)).toEqual({ type: 'session.close' });
    closed(socket);
    expect((await result).error).toContain('no delegationHandler');
  });

  it('rejects aborts and cleans up simultaneous sessions independently', async () => {
    const p = provider();
    const controller = new AbortController();
    const one = p.callApi('One', undefined, { abortSignal: controller.signal });
    const oneRejected = expect(one).rejects.toMatchObject({ name: 'AbortError' });
    await connect();
    start(sockets[0]);
    const two = p.callApi('Two');
    const twoRejected = expect(two).rejects.toMatchObject({ name: 'AbortError' });
    await connect();
    start(sockets[1]);
    controller.abort();
    await oneRejected;
    expect(sockets[0].terminate).toHaveBeenCalledOnce();
    expect(sockets[1].terminate).not.toHaveBeenCalled();
    await providerRegistry.shutdownAll();
    await twoRejected;
    expect(sockets[1].terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not open a socket for an already aborted request or invalid input', async () => {
    await expect(
      provider().callApi('Hi', undefined, { abortSignal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect((await provider({ responseWindowMs: 0 }).callApi('Hi')).error).toContain(
      'responseWindowMs',
    );
    expect(
      (
        await provider({ delegation: { type: 'responses', responses: { model: '' } } }).callApi(
          'Hi',
        )
      ).error,
    ).toContain('backend model');
    expect(sockets).toHaveLength(0);
  });

  it('preserves custom auth headers and IDs without duplicate bearer credentials', async () => {
    const p = new OpenAiLiveProvider('gpt-live-1', {
      id: 'custom',
      config: {
        apiBaseUrl: 'http://localhost:1234/v1',
        headers: { authorization: 'Bearer custom-token' },
        responseWindowMs: 100,
      },
    });
    expect(p.id()).toBe('custom');
    const result = p.callApi('Hi');
    const socket = await connect();
    expect(socket.options.headers).toEqual({ authorization: 'Bearer custom-token' });
    expect(socket.url).toBe('ws://localhost:1234/v1/live/sessions');
    start(socket);
    text(socket);
    closed(socket);
    await result;
  });

  it('uses prompt-scoped headers, including a case-insensitive authorization override', async () => {
    const result = provider({ headers: { 'X-Route': 'provider' } }).callApi('Hi', {
      vars: {},
      prompt: {
        raw: 'Hi',
        label: 'Hi',
        config: { headers: { authorization: 'Bearer prompt-token', 'X-Route': 'prompt' } },
      },
    });
    const socket = await connect();
    expect(socket.options.headers).toEqual({
      'X-OpenAI-Originator': 'promptfoo',
      authorization: 'Bearer prompt-token',
      'X-Route': 'prompt',
    });
    start(socket);
    text(socket);
    closed(socket);
    await result;
  });

  it('handles nested function calls even when the terminal response output is empty', async () => {
    const handler = vi.fn().mockResolvedValue('result');
    const result = provider({
      delegation: {
        type: 'responses',
        responses: {
          model: 'gpt-4.1-mini',
          tools: [{ type: 'function', name: 'lookup', parameters: {}, strict: false }],
        },
      },
      functionCallHandler: handler,
    }).callApi('Check my order');
    const socket = await connect();
    start(socket);
    backend(socket, { type: 'response.created', response: { id: 'resp_1' } });
    const item = {
      type: 'function_call',
      call_id: 'call_1',
      name: 'lookup',
      arguments: '{"id":42}',
    };
    backend(socket, { type: 'response.output_item.done', item });
    backend(socket, { type: 'response.output_item.done', item });
    backend(socket, {
      type: 'response.output_item.done',
      item: { ...item, call_id: 'call_2', arguments: '{"id":43}' },
    });
    expect(handler).not.toHaveBeenCalled();
    const response = {
      id: 'resp_1',
      model: 'gpt-4.1-mini',
      output: [],
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        total_tokens: 15,
        input_tokens_details: { cached_tokens: 0 },
      },
    };
    backend(socket, { type: 'response.completed', response });
    backend(socket, { type: 'response.completed', response });
    await vi.advanceTimersByTimeAsync(0);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(1, 'lookup', '{"id":42}', expect.any(AbortSignal));
    expect(handler).toHaveBeenNthCalledWith(2, 'lookup', '{"id":43}', expect.any(AbortSignal));
    expect(socket.sent.slice(-3)).toEqual([
      {
        type: 'response.item.create',
        item: { type: 'function_call_output', call_id: 'call_1', output: 'result' },
      },
      {
        type: 'response.item.create',
        item: { type: 'function_call_output', call_id: 'call_2', output: 'result' },
      },
      { type: 'response.create' },
    ]);
    backend(socket, { type: 'response.created', response: { id: 'resp_2' } });
    backend(socket, { type: 'response.completed', response: { ...response, id: 'resp_2' } });
    text(socket);
    await vi.advanceTimersByTimeAsync(100);
    closed(socket, 60);
    const output = await result;
    expect(output.error).toBeUndefined();
    expect(output.tokenUsage).toMatchObject({
      prompt: 20,
      completion: 10,
      total: 30,
      numRequests: 3,
    });
    expect(output.cost).toBeCloseTo(0.050024);
    expect(output.metadata?.backendResponses).toHaveLength(2);
  });

  it.each(['unconfigured', 'missing-handler', 'invalid-arguments'])(
    'rejects %s backend function calls without executing a tool',
    async (scenario) => {
      const handler = vi.fn().mockResolvedValue('result');
      const result = provider({
        delegation: {
          type: 'responses',
          responses: {
            model: 'gpt-4.1-mini',
            tools: [{ type: 'function', name: 'lookup', parameters: {}, strict: false }],
          },
        },
        functionCallHandler: scenario === 'missing-handler' ? undefined : handler,
      }).callApi('Hi');
      const socket = await connect();
      start(socket);
      backend(socket, { type: 'response.created', response: { id: 'resp_1' } });
      backend(socket, {
        type: 'response.output_item.done',
        item: {
          type: 'function_call',
          call_id: 'call_1',
          name: scenario === 'unconfigured' ? 'delete_everything' : 'lookup',
          arguments: scenario === 'invalid-arguments' ? {} : '{}',
        },
      });
      backend(socket, { type: 'response.completed', response: { id: 'resp_1', output: [] } });
      await vi.advanceTimersByTimeAsync(0);
      expect(handler).not.toHaveBeenCalled();
      expect(socket.sent.some((event) => event.type === 'response.create')).toBe(false);
      expect(socket.sent.at(-1)).toEqual({ type: 'session.close' });
      closed(socket);
      expect((await result).error).toContain(
        scenario === 'missing-handler' ? 'no functionCallHandler' : 'handler failed',
      );
    },
  );

  it('reports incomplete Responses work when the capture ends before a response is created', async () => {
    const result = provider({
      delegation: { type: 'responses', responses: { model: 'gpt-4.1-mini' } },
    }).callApi('Hi');
    const socket = await connect();
    start(socket);
    emit(socket, {
      type: 'session.delegation.created',
      delegation: { id: 'd', target: 'responses' },
    });
    text(socket);
    await vi.advanceTimersByTimeAsync(100);
    closed(socket);
    const response = await result;
    expect(response.error).toContain('backend work pending');
    expect(response.cost).toBeUndefined();
  });

  it('provides transcript context to a file-backed client handler and returns the opaque delegation ID', async () => {
    const handler = vi.fn().mockResolvedValue('The order shipped.');
    loadCallback.mockResolvedValue(handler);
    const result = provider({ delegationHandler: 'file://backend.js' }).callApi('My order');
    const socket = await connect();
    start(socket);
    text(socket, 'order 42', 'input');
    const event = {
      type: 'session.delegation.created',
      offset_ms: 42,
      delegation: { id: 'opaque-id', target: 'client' },
    };
    emit(socket, event);
    emit(socket, event);
    await vi.advanceTimersByTimeAsync(0);
    expect(loadCallback).toHaveBeenCalledWith('file://backend.js');
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0]).toMatchObject({
      id: 'opaque-id',
      offsetMs: 42,
      transcript: [{ role: 'user', delta: 'order 42' }],
    });
    expect(socket.sent.at(-1)).toEqual({
      type: 'session.commentary.append',
      delegation_id: 'opaque-id',
      content: 'The order shipped.',
    });
    text(socket, 'Shipped.');
    await vi.advanceTimersByTimeAsync(100);
    closed(socket);
    const output = await result;
    expect(output.error).toBeUndefined();
    expect(output.cost).toBeUndefined();
    expect(output.metadata?.backendCost).toBeUndefined();
    expect(output.metadata?.voiceCost).toBeCloseTo(0.01);
  });

  it('ignores late callback results after the capture ends', async () => {
    let resolve!: (value: string) => void;
    const handler = vi.fn(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    );
    const result = provider({ delegationHandler: handler }).callApi('Hi');
    const socket = await connect();
    start(socket);
    emit(socket, {
      type: 'session.delegation.created',
      offset_ms: 0,
      delegation: { id: 'd', target: 'client' },
    });
    await vi.advanceTimersByTimeAsync(100);
    closed(socket);
    expect((await result).error).toContain('backend work pending');
    resolve('sensitive late result');
    await vi.advanceTimersByTimeAsync(0);
    expect(socket.sent.some((event) => event.content === 'sensitive late result')).toBe(false);
  });

  it('uses HTTPS_PROXY for the upgrade and destroys the agent after connection errors', async () => {
    mockProcessEnv({ HTTPS_PROXY: 'http://proxy.example:8080' });
    const result = provider().callApi('Hi');
    const socket = await connect();
    expect(socket.options.agent?.getProxyForUrl(socket.url)).toBe('http://proxy.example:8080');
    const destroy = vi.spyOn(socket.options.agent!, 'destroy');
    socket.emit('error', Object.assign(new Error('sensitive details'), { code: 'ENOTFOUND' }));
    expect((await result).error).toContain('(ENOTFOUND)');
    expect((await result).error).not.toContain('sensitive details');
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('honors NO_PROXY for WebSocket upgrade requests', async () => {
    mockProcessEnv({ HTTPS_PROXY: 'http://proxy.example:8080', NO_PROXY: 'api.openai.com' });
    const result = provider().callApi('Hi');
    const socket = await connect();
    expect(socket.options.agent).toBeUndefined();
    start(socket);
    text(socket);
    closed(socket);
    expect((await result).error).toBeUndefined();
  });

  it('reports a handler failure without returning its exception text', async () => {
    const result = provider({
      delegationHandler: async () => {
        throw new Error('secret-api-key');
      },
    }).callApi('Hi');
    const socket = await connect();
    start(socket);
    emit(socket, {
      type: 'session.delegation.created',
      offset_ms: 0,
      delegation: { id: 'd', target: 'client' },
    });
    await vi.advanceTimersByTimeAsync(0);
    closed(socket);
    const output = await result;
    expect(output.error).toBe('GPT-Live backend handler failed.');
    expect(JSON.stringify(output)).not.toContain('secret-api-key');
  });

  it.each([
    ['audio/pcmu', 255, [-31100, -30076, -29052]],
    ['audio/pcma', 213, [-5248, -6016, -5760]],
  ] as const)(
    'streams %s silence and converts output to playable PCM16 WAV',
    async (type, silence, samples) => {
      const result = provider({ audio: { format: { type, rate: 8000 } } }).callApi('Hi');
      const socket = await connect();
      start(socket);
      expect(Buffer.from(socket.sent[2].audio, 'base64')).toEqual(Buffer.alloc(160, silence));
      emit(socket, { type: 'session.output_audio.delta', delta: 'AQID' });
      await vi.advanceTimersByTimeAsync(100);
      closed(socket);
      const audio = (await result).audio!;
      expect(audio).toMatchObject({ format: 'wav', sampleRate: 8000 });
      const wav = Buffer.from(audio.data!, 'base64');
      expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
      expect(wav.readUInt32LE(24)).toBe(8000);
      expect([wav.readInt16LE(44), wav.readInt16LE(46), wav.readInt16LE(48)]).toEqual(samples);
    },
  );
});
