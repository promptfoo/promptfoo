import { PassThrough } from 'node:stream';
import type { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAiLiveProvider } from '../../../src/providers/openai/live';
import { providerRegistry } from '../../../src/providers/providerRegistry';
import { checkProviderApiKeys } from '../../../src/util/provider';
import { mockProcessEnv } from '../../util/utils';

import type { LiveAudioFormat } from '../../../src/providers/openai/liveInput';
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
/** Start the session and, by default, acknowledge a text prompt's opening instruction. */
function start(socket: Socket, { id = 'live_fixture', ack = true } = {}) {
  emit(socket, { type: 'session.started', session: { id } });
  if (ack) {
    emit(socket, { type: 'session.instructions.appended', client_event_id: 'promptfoo_start' });
  }
}
function text(socket: Socket, delta = 'Hello', role = 'output', start_ms = 0, end_ms = 10) {
  emit(socket, { type: `session.${role}_transcript.delta`, delta, start_ms, end_ms });
}
function closed(socket: Socket, seconds = 12) {
  const reason = socket.sent.some((event) => event.type === 'session.close')
    ? 'close_requested'
    : 'remote_hangup';
  emit(socket, { type: 'session.closed', reason, usage: { seconds } });
}
function backend(socket: Socket, event: object) {
  emit(socket, { type: 'response.event', delegation_id: 'delegation_1', event });
}
function delegateResponses(socket: Socket, response_id = 'resp_1') {
  emit(socket, {
    type: 'session.delegation.created',
    delegation: { id: 'delegation_1', target: 'responses', response_id },
  });
}
function apiError(socket: Socket, error: object) {
  emit(socket, { type: 'error', error });
}
function httpResponse(statusCode: number, body = '') {
  const response = Object.assign(new PassThrough(), { statusCode });
  response.end(body);
  return response;
}
const sentTypes = (socket: Socket) => socket.sent.map((event) => event.type);
const audioPrompt = (audio: Buffer) =>
  JSON.stringify([
    {
      role: 'user',
      content: [
        { type: 'input_audio', input_audio: { data: audio.toString('base64'), format: 'pcm16' } },
      ],
    },
  ]);
const eventId = expect.stringMatching(/^promptfoo_\d+$/);
const promptContext = (config: OpenAiLiveOptions) => ({
  vars: {},
  prompt: { raw: 'Hi', label: 'Hi', config },
});

describe('OpenAiLiveProvider', () => {
  let restoreEnv: () => void;
  beforeEach(() => {
    restoreEnv = mockProcessEnv({}, { clear: true });
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    sockets.length = 0;
    loadCallback.mockReset();
  });
  afterEach(() => {
    restoreEnv();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('exposes its provider identity', () => {
    const p = provider();
    expect(p.id()).toBe('openai:live:gpt-live-1');
  });

  it.each(['gpt-live-transcribe', 'gpt-live-transcribe-2026-08-25'])(
    'rejects direct construction with transcription-only model %s',
    (model) => {
      expect(() => new OpenAiLiveProvider(model)).toThrow('dedicated Realtime transcription');
      expect(sockets).toHaveLength(0);
    },
  );

  it.each(['gpt-realtime-1.5', 'gpt-5.6-terra', 'tts-1', 'text-embedding-3-small', 'gpt-image-1'])(
    'rejects non-Live model %s on the resolved official endpoint',
    async (model) => {
      const p = new OpenAiLiveProvider(model, {
        config: { apiKey: 'fixture-key', apiBaseUrl: 'https://gateway.example/v1' },
      });
      const result = p.callApi('Hi', promptContext({ apiBaseUrl: 'https://api.openai.com/v1' }));
      await vi.runAllTimersAsync();
      expect((await result).error).toContain('requires a gpt-live-* model');
      expect(sockets).toHaveLength(0);
    },
  );

  it.each(['gateway-voice', 'gpt-realtime-1.5'])(
    'allows custom gateway model %s after a prompt endpoint override',
    async (model) => {
      const p = new OpenAiLiveProvider(model, { config: { apiKey: 'fixture-key' } });
      const result = p.callApi('Hi', promptContext({ apiBaseUrl: 'https://gateway.example/v1' }));
      const socket = await connect();
      expect(socket.sent[0].session.model).toBe(model);
      start(socket);
      text(socket);
      closed(socket);
      expect((await result).error).toBeUndefined();
    },
  );

  it('does not use ordinary custom headers to satisfy the credential requirement', async () => {
    const result = provider({
      apiKey: undefined,
      apiBaseUrl: 'https://gateway.example/v1',
      headers: { 'X-Request-ID': 'request-123' },
    }).callApi('Hi');
    await vi.runAllTimersAsync();
    expect((await result).error).toContain('API key is not set');
    expect(sockets).toHaveLength(0);
  });

  it.each(['response.created', 'response.completed', 'response.failed', 'response.incomplete'])(
    'rejects a completed response ID reused by another delegation in %s',
    async (type) => {
      const result = provider({ delegation: lookupDelegation }).callApi('Hi');
      const socket = await connect();
      start(socket);
      text(socket);
      delegateResponses(socket);
      backend(socket, { type: 'response.created', response: { id: 'resp_1' } });
      backend(socket, { type: 'response.completed', response: { id: 'resp_1' } });
      emit(socket, {
        type: 'response.event',
        delegation_id: 'unrelated',
        event: { type, response: { id: 'resp_1' } },
      });
      closed(socket);
      expect((await result).error).toBe('GPT-Live backend response changed delegation.');
    },
  );

  it.each([false, true])(
    'requires a matching delegation by finalization (late notice: %s)',
    async (lateNotice) => {
      const result = provider({ delegation: lookupDelegation }).callApi('Hi');
      const socket = await connect();
      start(socket);
      text(socket);
      backend(socket, { type: 'response.created', response: { id: 'resp_1' } });
      backend(socket, {
        type: 'response.completed',
        response: { id: 'resp_1', usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } },
      });
      await vi.advanceTimersByTimeAsync(100);
      if (lateNotice) {
        delegateResponses(socket);
      }
      closed(socket);
      const response = await result;
      expect(response.error).toBe(
        lateNotice
          ? undefined
          : 'GPT-Live backend response completed without a matching delegation.',
      );
      if (lateNotice) {
        expect(response.cost).toBeTypeOf('number');
      } else {
        expect(response.cost).toBeUndefined();
        expect(response.metadata?.backendCost).toBeUndefined();
      }
      expect(response.tokenUsage).toMatchObject({ numRequests: 2, total: 15 });
    },
  );

  it.each([
    'matching',
    'wrong-response',
    'wrong-delegation',
    'after-close',
    'missing',
    'late-function',
  ])(
    'holds early function calls until their delegation is validated (%s notice)',
    async (notice) => {
      const handler = vi.fn().mockResolvedValue('result');
      const result = provider({
        delegation: lookupDelegation,
        functionCallHandler: handler,
      }).callApi('Hi');
      const socket = await connect();
      start(socket);
      text(socket);
      backend(socket, { type: 'response.created', response: { id: 'resp_1' } });
      backend(socket, { type: 'response.output_item.done', item: functionCall('call_1') });
      backend(socket, { type: 'response.completed', response: { id: 'resp_1' } });
      if (notice === 'late-function') {
        backend(socket, { type: 'response.output_item.done', item: functionCall('call_2') });
      }
      await vi.advanceTimersByTimeAsync(0);
      expect(handler).not.toHaveBeenCalled();
      expect(sentTypes(socket)).not.toContain('response.item.create');
      expect(sentTypes(socket)).not.toContain('response.create');
      if (notice === 'after-close') {
        await vi.advanceTimersByTimeAsync(100);
      }
      if (notice !== 'missing') {
        const event = {
          type: 'session.delegation.created',
          delegation: {
            id: notice === 'wrong-delegation' ? 'other' : 'delegation_1',
            target: 'responses',
            response_id: notice === 'wrong-response' ? 'other' : 'resp_1',
          },
        };
        emit(socket, event);
        emit(socket, event);
        await vi.advanceTimersByTimeAsync(0);
      }
      if (notice === 'matching') {
        expect(handler).toHaveBeenCalledExactlyOnceWith('lookup', '{}', expect.any(AbortSignal));
        expect(sentTypes(socket).filter((type) => type === 'response.create')).toHaveLength(1);
        backend(socket, { type: 'response.created', response: { id: 'resp_2' } });
        backend(socket, { type: 'response.completed', response: { id: 'resp_2' } });
      } else {
        expect(handler).not.toHaveBeenCalled();
      }
      await vi.advanceTimersByTimeAsync(100);
      closed(socket);
      const response = await result;
      if (notice === 'matching') {
        expect(response.error).toBeUndefined();
      } else {
        expect(response.error).toContain(
          notice === 'wrong-response'
            ? 'delegation response ID'
            : notice === 'late-function'
              ? 'without a backend response'
              : 'backend work pending',
        );
      }
    },
  );

  it('preserves transcript evidence verbatim for grading, including credential-like text', async () => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    start(socket);
    text(socket, 'fixture-key', 'input');
    text(socket, 'fixture-');
    text(socket, 'key Bearer sample-output-token');
    emit(socket, { type: 'session.output_audio.delta', delta: 'AQI=' });
    closed(socket);
    const response = await result;
    expect(response.error).toBeUndefined();
    expect(response.output).toBe('fixture-key Bearer sample-output-token');
    expect(response.audio?.transcript).toBe(response.output);
    expect(response.metadata?.inputTranscript).toBe('fixture-key');
    expect(response.metadata?.transcript.map((part: { delta: string }) => part.delta)).toEqual([
      'fixture-key',
      'fixture-',
      'key Bearer sample-output-token',
    ]);
  });

  it.each(['apiBaseUrl', 'apiHost'] as const)(
    'does not inherit gateway credential headers when a prompt overrides %s',
    async (endpoint) => {
      const headers = {
        'api-key': 'original-gateway-key',
        'X-Session-Access': 'opaque-gateway-key',
        'User-Agent': 'Bearer value-shaped-credential',
        Accept: 'application/json',
      };
      const p = provider({
        apiKey: undefined,
        apiKeyRequired: false,
        apiBaseUrl: 'https://original.example/v1',
        headers,
      });
      const result = p.callApi(
        'Hi',
        promptContext({
          [endpoint]: endpoint === 'apiHost' ? 'other.example' : 'https://api.openai.com/v1',
        }),
      );
      const socket = await connect();
      for (const name of ['api-key', 'X-Session-Access', 'User-Agent']) {
        expect(socket.options.headers).not.toHaveProperty(name);
      }
      expect(socket.options.headers.Accept).toBe('application/json');
      expect(p.config.headers).toEqual(headers);
      start(socket);
      text(socket);
      closed(socket);
      expect((await result).error).toBeUndefined();
    },
  );

  it('keeps explicitly supplied prompt credential headers on its selected endpoint', async () => {
    const result = provider({ headers: { 'api-key': 'provider-key' } }).callApi(
      'Hi',
      promptContext({
        apiBaseUrl: 'https://other.example/v1',
        headers: { 'api-key': 'prompt-key' },
      }),
    );
    const socket = await connect();
    expect(socket.options.headers['api-key']).toBe('prompt-key');
    start(socket);
    text(socket);
    closed(socket);
    expect((await result).error).toBeUndefined();
  });

  it.each(['session', 'delegation', 'envelope', 'response', 'function ID', 'function name'])(
    'rejects an empty protocol identifier for %s',
    async (kind) => {
      const handler = vi.fn();
      const result = provider({
        delegation: lookupDelegation,
        functionCallHandler: handler,
      }).callApi('Hi');
      const socket = await connect();
      start(socket, { id: kind === 'session' ? '' : 'session_1' });
      text(socket);
      if (kind === 'delegation') {
        emit(socket, {
          type: 'session.delegation.created',
          delegation: { id: '', target: 'responses' },
        });
      } else if (kind === 'envelope') {
        emit(socket, {
          type: 'response.event',
          delegation_id: '',
          event: { type: 'response.created', response: { id: 'resp_1' } },
        });
      } else if (kind !== 'session') {
        backend(socket, {
          type: 'response.created',
          response: { id: kind === 'response' ? '' : 'resp_1' },
        });
        if (kind.startsWith('function')) {
          backend(socket, {
            type: 'response.output_item.done',
            item: {
              ...functionCall(kind === 'function ID' ? '' : 'call_1'),
              ...(kind === 'function name' && { name: '' }),
            },
          });
        }
      }
      closed(socket);
      expect((await result).error).toContain('Invalid GPT-Live');
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it('rejects a delegation notice that contradicts an already active response', async () => {
    const result = provider({ delegation: lookupDelegation }).callApi('Hi');
    const socket = await connect();
    start(socket);
    text(socket);
    backend(socket, { type: 'response.created', response: { id: 'resp_1' } });
    delegateResponses(socket, 'resp_2');
    backend(socket, { type: 'response.completed', response: { id: 'resp_1' } });
    closed(socket);
    expect((await result).error).toBe('Invalid GPT-Live delegation response ID.');
  });

  it.each(['x'.repeat(257), '🙂'.repeat(65), { trim: (): string => 'model' }, 42, null])(
    'rejects an invalid configured backend model before connecting (%j)',
    async (model) => {
      const result = provider({
        delegation: { type: 'responses', responses: { model: model as string } },
      }).callApi('Hi');
      await vi.advanceTimersByTimeAsync(300);
      expect((await result).error).toContain('backend model');
      expect(sockets).toHaveLength(0);
    },
  );

  it.each(['x'.repeat(256), '🙂'.repeat(64)])(
    'accepts a configured backend model at the UTF-8 byte limit',
    async (model) => {
      const result = provider({
        delegation: { type: 'responses', responses: { model } },
      }).callApi('Hi');
      const socket = await connect();
      expect(socket.sent[0].session.delegation.responses.model).toBe(model);
      start(socket);
      text(socket);
      closed(socket);
      expect((await result).error).toBeUndefined();
    },
  );

  it('redacts protocol metadata only after raw response correlation and billing', async () => {
    const secret = 'gpt-4.1-mini';
    const delegationId = `delegation-${secret}`;
    const responseId = `response-${secret}`;
    const result = provider({
      apiKey: secret,
      delegation: { type: 'responses', responses: { model: 'gpt-4.1-mini' } },
      inputCost: 0.01,
      outputCost: 0.03,
    }).callApi('Hi');
    const socket = await connect();
    start(socket, { id: `session-${secret}` });
    text(socket);
    emit(socket, {
      type: 'session.delegation.created',
      delegation: { id: delegationId, target: 'responses', response_id: responseId },
    });
    for (const type of ['response.created', 'response.completed']) {
      emit(socket, {
        type: 'response.event',
        delegation_id: delegationId,
        event: {
          type,
          response: {
            id: responseId,
            model: secret,
            usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
          },
        },
      });
    }
    closed(socket);
    const response = await result;
    expect(response.error).toBeUndefined();
    expect(response.cost).toBeCloseTo(0.26);
    expect(response.sessionId).toBe('session-[REDACTED]');
    expect(response.metadata?.delegations[0].id).toBe('delegation-[REDACTED]');
    expect(response.metadata?.backendResponses[0]).toMatchObject({
      id: 'response-[REDACTED]',
      model: '[REDACTED]',
    });
    expect(JSON.stringify(response)).not.toContain(secret);
  });

  it('keeps raw client delegation IDs on the wire and redacts returned metadata', async () => {
    const id = 'delegation-fixture-key';
    const handler = vi.fn().mockResolvedValue('result');
    const result = provider({ delegationHandler: handler }).callApi('Hi');
    const socket = await connect();
    start(socket);
    text(socket);
    clientDelegation(socket, id);
    await vi.advanceTimersByTimeAsync(0);
    const append = delegationResults(socket)[0];
    expect(handler.mock.calls[0][0].id).toBe(id);
    expect(append.delegation_id).toBe(id);
    emit(socket, { type: 'session.commentary.appended', client_event_id: append.event_id });
    closed(socket);
    const response = await result;
    expect(response.error).toBeUndefined();
    expect(response.metadata?.delegations[0].id).toBe('delegation-[REDACTED]');
    expect(JSON.stringify(response)).not.toContain('fixture-key');
  });

  it('redacts credential echoes in close reasons and the resulting error', async () => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    start(socket);
    text(socket);
    emit(socket, { type: 'session.closed', reason: 'fixture-key', usage: { seconds: 12 } });
    const response = await result;
    expect(response.error).toBe('GPT-Live session ended: [REDACTED].');
    expect(response.metadata?.closeReason).toBe('[REDACTED]');
    expect(JSON.stringify(response)).not.toContain('fixture-key');
  });

  it.each(['before acknowledgment', 'after acknowledgment'])(
    'does not increase the output budget for delayed startup (%s)',
    async (phase) => {
      const result = provider({ websocketTimeout: 1000 }).callApi('Hi');
      const socket = await connect();
      start(socket, { ack: false });
      await vi.advanceTimersByTimeAsync(900);
      if (phase === 'after acknowledgment') {
        emit(socket, { type: 'session.instructions.appended', client_event_id: 'promptfoo_start' });
      }
      emit(socket, {
        type: 'session.output_audio.delta',
        delta: Buffer.alloc(9600).toString('base64'),
      });
      if (phase === 'before acknowledgment') {
        emit(socket, { type: 'session.instructions.appended', client_event_id: 'promptfoo_start' });
      }
      closed(socket);
      expect((await result).error).toBe('GPT-Live audio exceeded the capture limit.');
    },
  );

  it('rejects a tool continuation while its handler is still preparing results', async () => {
    let resolve!: (value: string) => void;
    const handler = vi
      .fn()
      .mockResolvedValue('unsolicited result')
      .mockImplementationOnce(
        () =>
          new Promise<string>((done) => {
            resolve = done;
          }),
      );
    const result = provider({ delegation: lookupDelegation, functionCallHandler: handler }).callApi(
      'Hi',
    );
    const socket = await connect();
    start(socket);
    delegateResponses(socket);
    for (const id of ['resp_1', 'resp_2']) {
      backend(socket, { type: 'response.created', response: { id } });
      backend(socket, { type: 'response.output_item.done', item: functionCall(`call_${id}`) });
      backend(socket, { type: 'response.completed', response: { id, output: [] } });
      await vi.advanceTimersByTimeAsync(0);
    }
    closed(socket);
    resolve('late result');
    await vi.advanceTimersByTimeAsync(0);
    const response = await result;
    expect(handler).toHaveBeenCalledTimes(1);
    expect(sentTypes(socket)).not.toContain('response.item.create');
    expect(sentTypes(socket)).not.toContain('response.create');
    expect(response.error).toContain('no continuation was requested');
  });

  it.each([true, false])(
    'uses the configured key requirement for opaque auth headers (%s)',
    async (apiKeyRequired) => {
      const result = provider({
        apiKey: undefined,
        apiKeyRequired,
        apiBaseUrl: 'http://gateway.example/v1',
        headers: { 'X-Session-Access': 'gateway-secret' },
      }).callApi('Hi');
      if (apiKeyRequired) {
        expect((await result).error).toContain('API key is not set');
        expect(sockets).toHaveLength(0);
      } else {
        const socket = await connect();
        expect(socket.options.headers).toEqual({ 'X-Session-Access': 'gateway-secret' });
        start(socket);
        text(socket);
        closed(socket);
        expect((await result).error).toBeUndefined();
      }
    },
  );

  it('does not resend moderated commentary when another pending handler finishes', async () => {
    const resolvers: ((value: string) => void)[] = [];
    const result = provider({
      delegationHandler: () => new Promise<string>((resolve) => resolvers.push(resolve)),
    }).callApi('Hi');
    const socket = await connect();
    start(socket);
    text(socket);
    clientDelegation(socket, 'first');
    clientDelegation(socket, 'second');
    expect(delegationResults(socket)).toHaveLength(0);
    resolvers[0]('first result');
    await vi.advanceTimersByTimeAsync(0);
    const first = delegationResults(socket)[0];
    apiError(socket, { code: 'moderation_blocked', client_event_id: first.event_id });
    resolvers[1]('second result');
    await vi.advanceTimersByTimeAsync(0);
    const appends = delegationResults(socket);
    expect(appends.map((event) => event.delegation_id)).toEqual(['first', 'second']);
    emit(socket, { type: 'session.commentary.appended', client_event_id: appends[1].event_id });
    closed(socket);
    const response = await result;
    expect(response.error).toBeUndefined();
    expect(response.isRefusal).toBe(true);
  });

  it.each(['input_transcript', 'output_transcript', 'output_audio'])(
    'rejects %s before session startup',
    async (kind) => {
      const result = provider().callApi('Hi');
      const socket = await connect();
      emit(socket, {
        type: `session.${kind}.delta`,
        delta: kind === 'output_audio' ? 'AQI=' : 'EARLY_CANARY',
        start_ms: 0,
        end_ms: 10,
      });
      start(socket);
      closed(socket);
      const response = await result;
      expect(response.error).toContain('before session.started');
      expect(response.output).toBe('');
      expect(response.audio).toBeUndefined();
    },
  );

  it('rejects a close acknowledgment when no close was requested', async () => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    start(socket);
    text(socket);
    emit(socket, { type: 'session.closed', reason: 'close_requested', usage: { seconds: 1 } });
    expect((await result).error).toContain('without a close request');
  });

  it.each([
    {
      type: 'response.event',
      delegation_id: 'delegation_1',
      event: { type: 'response.created', response: { id: 'resp_1' } },
    },
    { type: 'session.usage.updated', usage: { seconds: 12 } },
  ])('rejects $type before session startup', async (event) => {
    const result = provider({ delegation: lookupDelegation }).callApi('Hi');
    const socket = await connect();
    emit(socket, event);
    start(socket);
    closed(socket);
    expect((await result).error).toContain('before session.started');
  });

  it.each(['client_event_id', 'code', 'type'])(
    'redacts a credential echoed in API error %s',
    async (field) => {
      const result = provider().callApi('Hi');
      const socket = await connect();
      start(socket);
      text(socket);
      apiError(socket, { [field]: 'fixture-key', message: 'Gateway error' });
      closed(socket);
      expect(JSON.stringify(await result)).not.toContain('fixture-key');
    },
  );

  it('discards oversized API error event identifiers', async () => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    start(socket);
    apiError(socket, { client_event_id: 'x'.repeat(257), message: 'Gateway error' });
    closed(socket);
    expect((await result).metadata?.apiErrors[0].clientEventId).toBeUndefined();
  });

  it('rejects an unsolicited backend response after its delegation finished', async () => {
    const handler = vi.fn().mockResolvedValue('result');
    const result = provider({ delegation: lookupDelegation, functionCallHandler: handler }).callApi(
      'Hi',
    );
    const socket = await connect();
    start(socket);
    backend(socket, { type: 'response.created', response: { id: 'resp_1' } });
    backend(socket, { type: 'response.completed', response: { id: 'resp_1' } });
    backend(socket, { type: 'response.created', response: { id: 'unsolicited' } });
    backend(socket, { type: 'response.output_item.done', item: functionCall('call_1') });
    backend(socket, { type: 'response.completed', response: { id: 'unsolicited' } });
    closed(socket);
    expect((await result).error).toContain('already completed');
    expect(handler).not.toHaveBeenCalled();
  });

  it.each(['x'.repeat(257), { untrusted: 'model' }, 123])(
    'rejects invalid backend model metadata (%j)',
    async (model) => {
      const result = provider({ delegation: lookupDelegation }).callApi('Hi');
      const socket = await connect();
      start(socket);
      backend(socket, { type: 'response.created', response: { id: 'resp_1' } });
      backend(socket, { type: 'response.completed', response: { id: 'resp_1', model } });
      closed(socket);
      const response = await result;
      expect(response.error).toContain('Invalid GPT-Live backend model');
      expect(response.metadata?.backendResponses).toHaveLength(0);
    },
  );

  it.each([false, true])(
    'ignores output after capture closes (prior output: %s)',
    async (prior) => {
      const result = provider().callApi('Hi');
      const socket = await connect();
      start(socket);
      if (prior) {
        text(socket, 'On time');
      }
      await vi.advanceTimersByTimeAsync(100);
      expect(sentTypes(socket)).toContain('session.close');
      text(socket, 'LATE_CAPTURE_CANARY');
      text(socket, 'late input', 'input');
      emit(socket, { type: 'session.output_audio.delta', delta: 'AQI=' });
      closed(socket);
      const response = await result;
      expect(response.output).toBe(prior ? 'On time' : '');
      expect(response.audio).toBeUndefined();
      expect(response.metadata?.inputTranscript).toBe('');
      expect(response.metadata?.finalUsageConfirmed).toBe(true);
      if (prior) {
        expect(response.error).toBeUndefined();
      } else {
        expect(response.error).toContain('no transcript or audio');
      }
    },
  );

  it('releases all timers when an audio frame cannot be sent', async () => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    start(socket);
    vi.spyOn(socket, 'send').mockImplementation(() => {
      throw new Error('send failed');
    });
    await vi.advanceTimersByTimeAsync(20);
    expect((await result).error).toContain('Failed to send');
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['ftp://gateway.example/v1', 'file:///tmp/live', 'https://gateway.example/v1#tenant'])(
    'rejects an unsupported Live endpoint %s before opening a socket',
    async (apiBaseUrl) => {
      const result = provider({ apiBaseUrl }).callApi('Hi');
      await vi.runAllTimersAsync();
      expect((await result).error).toContain('GPT-Live session URL');
      expect(sockets).toHaveLength(0);
    },
  );

  it.each(['session', 'response'])('bounds the %s identifier before retention', async (kind) => {
    const result = provider({
      delegation: { type: 'responses', responses: { model: 'gpt-4.1-mini' } },
    }).callApi('Hi');
    const socket = await connect();
    const id = 'x'.repeat(257);
    if (kind === 'session') {
      start(socket, { id });
    } else {
      start(socket);
      emit(socket, {
        type: 'session.delegation.created',
        delegation: {
          id: 'delegation_1',
          target: 'responses',
          response_id: id,
        },
      });
    }
    closed(socket);
    const response = await result;
    expect(response.error).toContain('Invalid GPT-Live');
    expect(JSON.stringify(response)).not.toContain(id);
  });

  it.each(['"gateway-secret"', '"gateway%2Dsecret"', 'gateway%2Dsecret', '%22gateway%2Dsecret%22'])(
    'redacts decoded cookie values from diagnostics (%s)',
    async (cookie) => {
      const result = provider({ headers: { Cookie: `session=${cookie}; other=value` } }).callApi(
        'Hi',
      );
      const socket = await connect();
      start(socket);
      apiError(socket, { code: 'upstream_error', message: 'Invalid session gateway-secret.' });
      closed(socket);
      const response = await result;
      expect(response.error).toContain('[REDACTED]');
      expect(JSON.stringify(response)).not.toContain('gateway-secret');
    },
  );

  it.each([undefined, 'resp_1'])(
    'keeps completed backend work complete when delegation arrives late (%s)',
    async (response_id) => {
      const result = provider({
        delegation: { type: 'responses', responses: { model: 'gpt-4.1-mini' } },
      }).callApi('Hi');
      const socket = await connect();
      start(socket);
      backend(socket, { type: 'response.created', response: { id: 'resp_1' } });
      backend(socket, {
        type: 'response.completed',
        response: {
          id: 'resp_1',
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        },
      });
      emit(socket, {
        type: 'session.delegation.created',
        delegation: {
          id: 'delegation_1',
          target: 'responses',
          response_id,
        },
      });
      text(socket);
      await vi.advanceTimersByTimeAsync(100);
      closed(socket);
      const response = await result;
      expect(response.error).toBeUndefined();
      expect(response.cost).toBeTypeOf('number');
      expect(response.metadata?.delegations).toHaveLength(1);
      expect(response.tokenUsage).toMatchObject({ numRequests: 2, total: 15 });
    },
  );

  it.each(['call_id', 'name', 'arguments', 'aggregate'])(
    'bounds function-call %s before buffering or executing it',
    async (field) => {
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
      }).callApi('Hi');
      const socket = await connect();
      start(socket);
      backend(socket, { type: 'response.created', response: { id: 'resp_1' } });
      const item = { type: 'function_call', call_id: 'call_1', name: 'lookup', arguments: '{}' };
      if (field === 'aggregate') {
        item.arguments = 'x'.repeat(600_000);
        backend(socket, { type: 'response.output_item.done', item });
        item.call_id = 'call_2';
      } else {
        item[field as 'call_id' | 'name' | 'arguments'] = 'x'.repeat(
          field === 'arguments' ? 1_048_577 : 257,
        );
      }
      backend(socket, { type: 'response.output_item.done', item });
      closed(socket);
      const response = await result;
      expect(response.error).toMatch(/function.call.*(?:limit|Invalid)|Invalid.*function.call/i);
      expect(handler).not.toHaveBeenCalled();
    },
  );

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
    start(socket, { ack: false });
    expect(socket.sent[1]).toMatchObject({
      type: 'session.instructions.append',
      event_id: 'promptfoo_start',
      delegation_id: null,
    });
    expect(sentTypes(socket)).not.toContain('session.commentary.append');
    emit(socket, { type: 'session.instructions.appended', client_event_id: 'another_command' });
    expect(sentTypes(socket)).not.toContain('session.commentary.append');
    emit(socket, { type: 'session.instructions.appended', client_event_id: 'promptfoo_start' });
    expect(socket.sent.at(-1)).toEqual({
      type: 'session.commentary.append',
      event_id: 'promptfoo_opening',
      delegation_id: null,
      content: 'Begin now, following the instructions provided.',
    });
    emit(socket, { type: 'session.instructions.appended', client_event_id: 'promptfoo_start' });
    expect(sentTypes(socket).filter((type) => type === 'session.commentary.append')).toHaveLength(
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
      metadata: {
        voiceSeconds: 12,
        finalUsageConfirmed: true,
        inputTranscript: 'Hello',
        apiErrors: [],
        delegations: [],
      },
    });
    expect(response.cost).toBeCloseTo(0.01);
    expect(response.error).toBeUndefined();
    expect(response.isRefusal).toBeUndefined();
    expect(response.metadata?.transcript).toHaveLength(3);
    const wav = Buffer.from(response.audio!.data!, 'base64');
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.subarray(44)).toEqual(Buffer.from([1, 0, 2, 0]));
    expect(socket.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('prices dated gpt-live-1 snapshots at the default voice rate', async () => {
    const capture = async (model: string) => {
      const result = new OpenAiLiveProvider(model, {
        config: {
          apiKey: 'fixture-key',
          responseWindowMs: 100,
          websocketTimeout: 200,
          closeTimeoutMs: 100,
        },
      }).callApi('Hi');
      const socket = await connect();
      expect(socket.sent[0].session.model).toBe(model);
      start(socket);
      text(socket);
      await vi.advanceTimersByTimeAsync(100);
      closed(socket, 30);
      const response = await result;
      expect(response.error).toBeUndefined();
      expect(response.metadata?.voiceSeconds).toBe(30);
      return response;
    };

    const dated = await capture('gpt-live-1-2026-09-01');
    expect(dated.metadata?.voiceCost).toBeCloseTo(0.025);
    expect(dated.cost).toBeCloseTo(0.025);
    // Other model names are priced only with costPerMinute.
    const other = await capture('gpt-live-1-preview');
    expect(other.metadata?.voiceCost).toBeUndefined();
    expect(other.cost).toBeUndefined();
  });

  it.each([301, 1e300, Number.MAX_VALUE])(
    'withholds final accounting for usage beyond the request deadline (%s)',
    async (seconds) => {
      const result = provider().callApi('Hi');
      const socket = await connect();
      start(socket);
      text(socket);
      emit(socket, { type: 'session.usage.updated', usage: { seconds: 5 } });
      closed(socket, seconds);
      const response = await result;
      expect(response.error).toContain('usage is unconfirmed');
      expect(response.metadata?.voiceSeconds).toBe(5);
      expect(response.metadata?.finalUsageConfirmed).toBe(false);
      expect(response.cost).toBeUndefined();
    },
  );

  it.each([false, true])(
    'ignores impossible interim usage when final usage is available: %s',
    async (finalize) => {
      const result = provider().callApi('Hi');
      const socket = await connect();
      start(socket);
      text(socket);
      emit(socket, { type: 'session.usage.updated', usage: { seconds: 1e300 } });
      if (finalize) {
        closed(socket);
      } else {
        socket.emit('close');
      }
      const response = await result;
      if (finalize) {
        expect(response.error).toBeUndefined();
        expect(response.metadata?.voiceSeconds).toBe(12);
        expect(response.cost).toBeCloseTo(0.01);
      } else {
        expect(response.error).toContain('final usage is unconfirmed');
        expect(response.metadata?.voiceSeconds).toBeUndefined();
        expect(response.metadata?.voiceCost).toBeUndefined();
        expect(response.cost).toBeUndefined();
      }
    },
  );

  it.each([1, 1.001])(
    'bounds usage by the configured request deadline at second granularity (%s)',
    async (seconds) => {
      mockProcessEnv({ REQUEST_TIMEOUT_MS: '500' });
      const result = provider().callApi('Hi');
      const socket = await connect();
      start(socket);
      text(socket);
      closed(socket, seconds);
      const response = await result;
      expect(response.metadata?.finalUsageConfirmed).toBe(seconds === 1);
      if (seconds === 1) {
        expect(response.error).toBeUndefined();
        expect(response.cost).toBeCloseTo(0.05 / 60);
      } else {
        expect(response.error).toContain('usage is unconfirmed');
        expect(response.metadata?.voiceSeconds).toBeUndefined();
        expect(response.metadata?.voiceCost).toBeUndefined();
        expect(response.cost).toBeUndefined();
      }
    },
  );

  it.each([59, 60, 300])(
    'keeps voice accounting finite with an extreme configured rate (%s seconds)',
    async (seconds) => {
      const result = provider({ costPerMinute: Number.MAX_VALUE }).callApi('Hi');
      const socket = await connect();
      start(socket);
      text(socket);
      closed(socket, seconds);
      const response = await result;
      expect(response.metadata?.voiceSeconds).toBe(seconds);
      if (seconds <= 60) {
        expect(response.error).toBeUndefined();
        expect(response.metadata?.voiceCost).toBe((seconds / 60) * Number.MAX_VALUE);
        expect(response.cost).toBe(response.metadata?.voiceCost);
      } else {
        expect(response.error).toContain('voice cost exceeded');
        expect(response.metadata?.voiceCost).toBeUndefined();
        expect(response.cost).toBeUndefined();
      }
    },
  );

  it.each(['backend', 'total'])(
    'withholds %s cost when accounting overflows',
    async (component) => {
      const result = provider({
        delegation: lookupDelegation,
        inputCost: 1e308,
        outputCost: 0,
        costPerMinute: 1e308,
      }).callApi('Hi');
      const socket = await connect();
      start(socket);
      text(socket);
      delegateResponses(socket);
      backend(socket, { type: 'response.created', response: { id: 'resp_1' } });
      const tokens = component === 'backend' ? 2 : 1;
      backend(socket, {
        type: 'response.completed',
        response: {
          id: 'resp_1',
          model: 'gpt-4.1-mini',
          usage: { input_tokens: tokens, output_tokens: 0, total_tokens: tokens },
        },
      });
      closed(socket, 60);
      const response = await result;
      expect(response.error).toContain(`${component} cost exceeded`);
      expect(response.metadata?.voiceCost).toBe(1e308);
      expect(response.metadata?.backendCost).toBe(component === 'backend' ? undefined : 1e308);
      expect(response.cost).toBeUndefined();
    },
  );

  it('paces input audio and keeps streaming silence after the clip', async () => {
    const audio = Buffer.alloc(1920, 1);
    const result = provider().callApi(audioPrompt(audio));
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
    expect(sentTypes(socket)).not.toContain('session.instructions.append');
    text(socket);
    await vi.advanceTimersByTimeAsync(100);
    closed(socket);
    expect((await result).error).toBeUndefined();
  });

  it.each([401, 403, 429, 500])('reports HTTP %s during the handshake', async (statusCode) => {
    const result = provider().callApi('Hi');
    await vi.advanceTimersByTimeAsync(0);
    sockets[0].emit('unexpected-response', {}, httpResponse(statusCode));
    expect((await result).error).toBe(`GPT-Live WebSocket handshake failed (HTTP ${statusCode}).`);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('includes the redacted API message from a rejected handshake', async () => {
    const result = provider().callApi('Hi');
    await vi.advanceTimersByTimeAsync(0);
    sockets[0].emit(
      'unexpected-response',
      {},
      httpResponse(
        403,
        JSON.stringify({ error: { message: 'Key fixture-key does not have Live access.' } }),
      ),
    );
    expect((await result).error).toBe(
      'GPT-Live WebSocket handshake failed (HTTP 403): Key [REDACTED] does not have Live access.',
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps audio on its timeline when sending frames takes time', async () => {
    const result = provider({ responseWindowMs: 80 }).callApi(audioPrompt(Buffer.alloc(960)));
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
    mockProcessEnv({ REQUEST_TIMEOUT_MS: '421' });
    const result = provider({ responseWindowMs: 101 }).callApi('Hi');
    const socket = await connect();
    await vi.advanceTimersByTimeAsync(199);
    start(socket);
    text(socket);
    await vi.advanceTimersByTimeAsync(120);
    expect(socket.sent.at(-1)).toEqual({ type: 'session.close' });
    await vi.advanceTimersByTimeAsync(99);
    closed(socket, 1);
    expect((await result).metadata?.finalUsageConfirmed).toBe(true);
  });

  it('requires the overall request deadline to exceed startup, capture, and finalization', async () => {
    mockProcessEnv({ REQUEST_TIMEOUT_MS: '400' });
    const result = provider().callApi('Hi');
    await vi.runAllTimersAsync();
    expect((await result).error).toContain('must be less than REQUEST_TIMEOUT_MS');
    expect(sockets).toHaveLength(0);
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
    emit(socket, { type: 'session.instructions.appended', client_event_id: 'promptfoo_start' });
    expect(sentTypes(socket)).not.toContain('session.commentary.append');
    await vi.advanceTimersByTimeAsync(200);
    expect((await result).error).toContain('session.started');
    expect(socket.terminate).toHaveBeenCalledOnce();
  });

  it.each([
    { type: 'session.delegation.created', delegation: { id: 'early', target: 'client' } },
    { type: 'session.closed', reason: 'content', usage: { seconds: 1 } },
  ])('rejects $type before session.started', async (event) => {
    const handler = vi.fn().mockResolvedValue('unused');
    const result = provider({ delegationHandler: handler }).callApi('Hi');
    const socket = await connect();
    emit(socket, event);
    const response = await result;
    expect(response.error).toContain('before session.started');
    expect(handler).not.toHaveBeenCalled();
  });

  it('starts a text prompt response window after the opening instruction is acknowledged', async () => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    start(socket, { ack: false });
    await vi.advanceTimersByTimeAsync(150);
    expect(sentTypes(socket)).not.toContain('session.close');
    expect(
      sentTypes(socket).filter((type) => type === 'session.input_audio.append').length,
    ).toBeGreaterThan(5);
    emit(socket, { type: 'session.instructions.appended', client_event_id: 'promptfoo_start' });
    expect(socket.sent.at(-1)).toMatchObject({
      type: 'session.commentary.append',
      event_id: 'promptfoo_opening',
    });
    text(socket);
    await vi.advanceTimersByTimeAsync(90);
    expect(sentTypes(socket)).not.toContain('session.close');
    await vi.advanceTimersByTimeAsync(30);
    expect(socket.sent.at(-1)).toEqual({ type: 'session.close' });
    closed(socket);
    expect((await result).error).toBeUndefined();
  });

  it('fails clearly when the opening instruction is never acknowledged', async () => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    start(socket, { ack: false });
    await vi.advanceTimersByTimeAsync(200);
    expect((await result).error).toBe(
      'GPT-Live timed out waiting for the opening instruction acknowledgment.',
    );
    expect(socket.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not request new speech after the capture window closes', async () => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    start(socket);
    text(socket);
    await vi.advanceTimersByTimeAsync(100);
    emit(socket, { type: 'session.instructions.appended', client_event_id: 'promptfoo_start' });
    expect(socket.sent.at(-1)).toEqual({ type: 'session.close' });
    expect(sentTypes(socket).filter((type) => type === 'session.commentary.append')).toHaveLength(
      1,
    );
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

  it('does not leave a close timer when session.close cannot be sent', async () => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    const send = socket.send.bind(socket);
    vi.spyOn(socket, 'send').mockImplementation((value) => {
      if (JSON.parse(value).type === 'session.close') {
        throw new Error('socket closing');
      }
      send(value);
    });
    start(socket);
    text(socket);
    await vi.advanceTimersByTimeAsync(100);
    expect((await result).error).toBe('Failed to send a GPT-Live event.');
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
      await vi.advanceTimersByTimeAsync(100);
      emit(socket, { type: 'session.closed', reason: 'close_requested', usage });
      expect((await result).metadata?.finalUsageConfirmed).toBe(false);
      expect((await result).error).toContain('usage is unconfirmed');
    },
  );

  it('grades a safety termination as a refusal instead of an error', async () => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    start(socket);
    text(socket, 'I cannot help');
    emit(socket, { type: 'session.closed', reason: 'content', usage: { seconds: 5 } });
    const response = await result;
    expect(response).toMatchObject({
      output: 'I cannot help',
      isRefusal: true,
      guardrails: {
        flagged: true,
        flaggedOutput: true,
        reason: 'GPT-Live safety filter ended the session.',
      },
      finishReason: 'content_filter',
      conversationEnded: true,
      conversationEndReason: 'content',
      metadata: { finalUsageConfirmed: true, closeReason: 'content' },
    });
    expect(response.error).toBeUndefined();
  });

  it.each(['expired', 'connection_lost'])('reports a %s closure as an error', async (reason) => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    start(socket);
    text(socket);
    emit(socket, { type: 'session.closed', reason, usage: { seconds: 5 } });
    const response = await result;
    expect(response.error).toBe(`GPT-Live session ended: ${reason}.`);
    expect(response.isRefusal).toBeUndefined();
    expect(response.conversationEnded).toBeUndefined();
  });

  it('reports startup errors with the server message and records API errors', async () => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    apiError(socket, {
      type: 'invalid_request_error',
      code: 'forbidden',
      message: 'Voice session access denied.',
      param: 'session.audio.output.voice',
    });
    const response = await result;
    expect(response.error).toBe(
      'GPT-Live startup failed (forbidden): Voice session access denied.',
    );
    expect(response.metadata?.apiErrors).toEqual([
      {
        code: 'forbidden',
        type: 'invalid_request_error',
        message: 'Voice session access denied.',
        param: 'session.audio.output.voice',
      },
    ]);
    expect(socket.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps capturing after a non-terminal API error and reports it with the full transcript', async () => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    start(socket);
    text(socket, 'Before ');
    apiError(socket, {
      type: 'server_error',
      code: 'audio_glitch',
      message: 'Audio paused for fixture-key and sk-abcdefghijklmnopqrstuvwxyz.',
    });
    expect(sentTypes(socket)).not.toContain('session.close');
    text(socket, 'after.', 'output', 10, 20);
    await vi.advanceTimersByTimeAsync(100);
    expect(socket.sent.at(-1)).toEqual({ type: 'session.close' });
    closed(socket);
    const response = await result;
    expect(response.output).toBe('Before after.');
    expect(response.error).toBe(
      'GPT-Live API error (audio_glitch): Audio paused for [REDACTED] and [REDACTED].',
    );
    expect(JSON.stringify(response)).not.toContain('fixture-key');
    expect(response.isRefusal).toBeUndefined();
  });

  it.each(['Safety service unavailable', 'Moderation service timed out'])(
    'reports safety infrastructure failure: %s',
    async (message) => {
      const result = provider().callApi('Hi');
      const socket = await connect();
      start(socket);
      text(socket);
      apiError(socket, { code: 'server_error', message });
      closed(socket);
      const response = await result;
      expect(response.error).toContain(message);
      expect(response.guardrails).toBeUndefined();
      expect(response.isRefusal).toBeUndefined();
    },
  );

  it('normalizes numeric gateway credentials before redacting errors', async () => {
    const result = provider({
      apiBaseUrl: 'https://gateway.example/v1',
      apiKey: undefined,
      headers: { 'api-key': 12345678 } as unknown as Record<string, string>,
    }).callApi('Hi');
    const socket = await connect();
    start(socket);
    apiError(socket, { code: 'gateway_error', message: 'Rejected 12345678' });
    closed(socket);
    const response = await result;
    expect(socket.options.headers['api-key']).toBe('12345678');
    expect(response.error).toContain('Rejected [REDACTED]');
    expect(JSON.stringify(response)).not.toContain('12345678');
  });

  it('redacts bare values from cookie credentials', async () => {
    const result = provider({ headers: { Cookie: 'session=gateway-secret' } }).callApi('Hi');
    const socket = await connect();
    start(socket);
    apiError(socket, { code: 'gateway_error', message: 'Rejected gateway-secret' });
    closed(socket);
    expect((await result).error).toContain('Rejected [REDACTED]');
  });

  it.each(['client', 'responses'] as const)(
    'rejects delegation outside the configured %s mode',
    async (mode) => {
      const handler = vi.fn().mockResolvedValue('result');
      const result = provider({
        delegation:
          mode === 'client'
            ? { type: 'client' }
            : { type: 'responses', responses: { model: 'gpt-4.1-mini' } },
        delegationHandler: handler,
      }).callApi('Hi');
      const socket = await connect();
      start(socket);
      emit(socket, {
        type: 'session.delegation.created',
        offset_ms: 0,
        delegation: { id: 'unexpected', target: mode === 'client' ? 'responses' : 'client' },
      });
      closed(socket);
      const response = await result;
      expect(response.error).toContain('delegation target');
      expect(handler).not.toHaveBeenCalled();
      expect(response.metadata?.delegations).toEqual([]);
    },
  );

  it('rejects terminal backend events without an active response', async () => {
    const result = provider({
      delegation: { type: 'responses', responses: { model: 'gpt-4.1-mini' } },
    }).callApi('Hi');
    const socket = await connect();
    start(socket);
    backend(socket, {
      type: 'response.completed',
      response: {
        id: 'unexpected',
        usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
      },
    });
    closed(socket);
    const response = await result;
    expect(response.error).toContain('without an active response');
    expect(response.metadata?.backendResponses).toEqual([]);
    expect(response.tokenUsage?.numRequests).toBe(1);
  });

  it('bounds distinct backend response starts across delegations', async () => {
    const result = provider({
      maxToolIterations: 1,
      delegation: { type: 'responses', responses: { model: 'gpt-4.1-mini' } },
    }).callApi('Hi');
    const socket = await connect();
    start(socket);
    for (const id of ['one', 'two', 'three']) {
      emit(socket, {
        type: 'response.event',
        delegation_id: id,
        event: { type: 'response.created', response: { id } },
      });
    }
    closed(socket);
    expect((await result).error).toContain('backend response limit');
  });

  it('rejects a second backend response before the active response completes', async () => {
    const result = provider({
      delegation: { type: 'responses', responses: { model: 'gpt-4.1-mini' } },
    }).callApi('Hi');
    const socket = await connect();
    start(socket);
    backend(socket, { type: 'response.created', response: { id: 'first' } });
    backend(socket, { type: 'response.created', response: { id: 'second' } });
    closed(socket);
    expect((await result).error).toContain('before the active response completed');
  });

  it('rejects oversized delegation identifiers before retaining them', async () => {
    const result = provider({
      delegation: { type: 'responses', responses: { model: 'gpt-4.1-mini' } },
    }).callApi('Hi');
    const socket = await connect();
    start(socket);
    emit(socket, {
      type: 'session.delegation.created',
      delegation: { id: 'x'.repeat(257), target: 'responses' },
    });
    closed(socket);
    expect((await result).error).toBe('Invalid GPT-Live delegation event.');
  });

  it('treats moderation interruptions as guardrail refusals without ending the capture', async () => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    start(socket);
    text(socket, 'Here is');
    apiError(socket, {
      type: 'invalid_request_error',
      code: 'moderation_blocked',
      message: 'Assistant audio was interrupted by moderation.',
    });
    expect(sentTypes(socket)).not.toContain('session.close');
    await vi.advanceTimersByTimeAsync(100);
    closed(socket);
    const response = await result;
    expect(response.error).toBeUndefined();
    expect(response).toMatchObject({
      isRefusal: true,
      guardrails: {
        flagged: true,
        flaggedOutput: true,
        reason:
          'GPT-Live moderation interrupted the response (moderation_blocked): Assistant audio was interrupted by moderation.',
      },
    });
    expect(response.finishReason).toBeUndefined();
  });

  it('reports an error naming safety_identifier as an API error, not moderation', async () => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    start(socket);
    text(socket);
    apiError(socket, {
      type: 'invalid_request_error',
      code: 'invalid_value',
      message: "Invalid 'safety_identifier': string too long.",
      param: 'safety_identifier',
    });
    await vi.advanceTimersByTimeAsync(100);
    closed(socket);
    const response = await result;
    expect(response.error).toBe(
      "GPT-Live API error (invalid_value): Invalid 'safety_identifier': string too long.",
    );
    expect(response.isRefusal).toBeUndefined();
    expect(response.guardrails).toBeUndefined();
  });

  it('ignores errors for commands cancelled by session.close', async () => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    start(socket);
    text(socket, 'Paris.');
    await vi.advanceTimersByTimeAsync(100);
    expect(socket.sent.at(-1)).toEqual({ type: 'session.close' });
    apiError(socket, {
      type: 'invalid_request_error',
      code: 'append_cancelled',
      message: 'Pending append cancelled.',
      client_event_id: 'promptfoo_opening',
    });
    closed(socket);
    const response = await result;
    expect(response.error).toBeUndefined();
    expect(response.output).toBe('Paris.');
    expect(response.metadata?.apiErrors).toEqual([
      expect.objectContaining({ code: 'append_cancelled', clientEventId: 'promptfoo_opening' }),
    ]);
  });

  it.each([
    {
      name: 'unattributed moderation',
      error: {
        type: 'invalid_request_error',
        code: 'moderation_blocked',
        message: 'Assistant audio was interrupted by moderation.',
      },
      reason:
        'GPT-Live moderation interrupted the response (moderation_blocked): Assistant audio was interrupted by moderation.',
    },
    {
      name: 'a content policy code',
      error: {
        type: 'invalid_request_error',
        code: 'content_policy_violation',
        message: 'Blocked.',
      },
      reason: 'GPT-Live moderation interrupted the response (content_policy_violation): Blocked.',
    },
    {
      name: 'moderation rejecting a pending command',
      error: {
        type: 'invalid_request_error',
        code: 'moderation_blocked',
        message: 'Commentary blocked.',
        client_event_id: 'promptfoo_opening',
      },
      reason:
        'GPT-Live moderation rejected session.commentary.append (moderation_blocked): Commentary blocked.',
    },
  ])('grades $name received while closing as a refusal', async ({ error, reason }) => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    start(socket);
    text(socket, 'Here is');
    await vi.advanceTimersByTimeAsync(100);
    expect(socket.sent.at(-1)).toEqual({ type: 'session.close' });
    apiError(socket, error);
    closed(socket);
    const response = await result;
    expect(response.error).toBeUndefined();
    expect(response).toMatchObject({
      output: 'Here is',
      isRefusal: true,
      guardrails: { flagged: true, flaggedOutput: true, reason },
      metadata: { finalUsageConfirmed: true, closeReason: 'close_requested' },
    });
    expect(response.cost).toBeCloseTo(0.01);
  });

  it.each([
    {
      name: 'an unattributed server error',
      error: { type: 'server_error', code: 'internal_error', message: 'Finalization failed.' },
      expected: 'GPT-Live API error (internal_error): Finalization failed.',
    },
    {
      name: 'an error for an unknown client event',
      error: {
        type: 'invalid_request_error',
        code: 'invalid_value',
        message: 'Unknown event.',
        client_event_id: 'client_event_42',
      },
      expected: 'GPT-Live rejected a client event (invalid_value): Unknown event.',
    },
    {
      name: 'an error for an acknowledged command',
      acknowledged: true,
      error: {
        type: 'invalid_request_error',
        code: 'append_cancelled',
        message: 'Pending append cancelled.',
        client_event_id: 'promptfoo_opening',
      },
      expected:
        'GPT-Live rejected session.commentary.append (append_cancelled): Pending append cancelled.',
    },
  ])('reports $name received while closing', async ({ acknowledged, error, expected }) => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    start(socket);
    if (acknowledged) {
      emit(socket, { type: 'session.commentary.appended', client_event_id: 'promptfoo_opening' });
    }
    text(socket, 'Paris.');
    await vi.advanceTimersByTimeAsync(100);
    expect(socket.sent.at(-1)).toEqual({ type: 'session.close' });
    apiError(socket, error);
    closed(socket);
    const response = await result;
    expect(response.error).toBe(expected);
    expect(response.output).toBe('Paris.');
    expect(response.isRefusal).toBeUndefined();
    expect(response.metadata?.finalUsageConfirmed).toBe(true);
  });

  it('closes when Live rejects the opening prompt', async () => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    start(socket, { ack: false });
    apiError(socket, {
      type: 'invalid_request_error',
      code: 'invalid_value',
      message: 'Instruction rejected.',
      client_event_id: 'promptfoo_start',
    });
    expect(socket.sent.at(-1)).toEqual({ type: 'session.close' });
    closed(socket);
    expect((await result).error).toBe(
      'GPT-Live rejected session.instructions.append (invalid_value): Instruction rejected.',
    );
  });

  it('grades moderation rejecting the opening instruction as a refusal and ends the capture', async () => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    start(socket, { ack: false });
    apiError(socket, {
      type: 'invalid_request_error',
      code: 'moderation_blocked',
      message: 'Instruction blocked.',
      client_event_id: 'promptfoo_start',
    });
    expect(socket.sent.at(-1)).toEqual({ type: 'session.close' });
    expect(sentTypes(socket)).not.toContain('session.commentary.append');
    closed(socket, 1);
    const response = await result;
    expect(response.error).toBeUndefined();
    expect(response).toMatchObject({
      output: '',
      isRefusal: true,
      guardrails: {
        flagged: true,
        flaggedOutput: true,
        reason:
          'GPT-Live moderation rejected session.instructions.append (moderation_blocked): Instruction blocked.',
      },
      metadata: { finalUsageConfirmed: true, closeReason: 'close_requested' },
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports a rejected delegation result without ending the capture early', async () => {
    const result = provider({ delegationHandler: async () => 'The order shipped.' }).callApi('Hi');
    const socket = await connect();
    start(socket);
    emit(socket, {
      type: 'session.delegation.created',
      offset_ms: 5,
      delegation: { id: 'd', target: 'client' },
    });
    await vi.advanceTimersByTimeAsync(0);
    const append = socket.sent.find(
      (event) => event.type === 'session.commentary.append' && event.delegation_id === 'd',
    );
    expect(append.event_id).toEqual(eventId);
    apiError(socket, {
      type: 'invalid_request_error',
      code: 'invalid_value',
      message: 'Content exceeds 500 tokens.',
      client_event_id: append.event_id,
    });
    expect(sentTypes(socket)).not.toContain('session.close');
    text(socket);
    await vi.advanceTimersByTimeAsync(100);
    closed(socket);
    expect((await result).error).toBe(
      'GPT-Live rejected session.commentary.append (invalid_value): Content exceeds 500 tokens.',
    );
  });

  it.each([
    { start_ms: -1, end_ms: 0 },
    { start_ms: 2, end_ms: 1 },
  ])('rejects invalid transcript timing %j', async ({ start_ms, end_ms }) => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    start(socket);
    emit(socket, { type: 'session.output_transcript.delta', delta: 'x', start_ms, end_ms });
    expect((await result).error).toBe('Invalid GPT-Live transcript delta.');
  });

  it.each(['instructions', 'commentary'])('rejects mismatched %s acknowledgments', async (kind) => {
    const result = provider({ delegationHandler: async () => 'The order shipped.' }).callApi('Hi');
    const socket = await connect();
    start(socket, { ack: kind === 'instructions' });
    let clientEventId = 'promptfoo_start';
    if (kind === 'instructions') {
      clientDelegation(socket, 'd');
      await vi.advanceTimersByTimeAsync(0);
      clientEventId = delegationResults(socket)[0].event_id;
    }
    emit(socket, { type: `session.${kind}.appended`, client_event_id: clientEventId });
    text(socket);
    closed(socket);
    expect((await result).error).toContain('acknowledgment does not match');
  });

  it.each(['code', 'type'])(
    'clears a delegated command rejected by moderation (%s)',
    async (field) => {
      const result = provider({ delegationHandler: async () => 'The order shipped.' }).callApi(
        'Hi',
      );
      const socket = await connect();
      start(socket);
      clientDelegation(socket, 'd');
      await vi.advanceTimersByTimeAsync(0);
      apiError(socket, {
        [field]: 'moderation_blocked',
        client_event_id: delegationResults(socket)[0].event_id,
      });
      text(socket);
      await vi.advanceTimersByTimeAsync(100);
      closed(socket);
      const response = await result;
      expect(response.isRefusal).toBe(true);
      expect(response.error).toBeUndefined();
    },
  );

  it('reports unacknowledged delegated commentary when capture closes', async () => {
    const result = provider({ delegationHandler: async () => 'The order shipped.' }).callApi('Hi');
    const socket = await connect();
    start(socket);
    emit(socket, {
      type: 'session.delegation.created',
      offset_ms: 5,
      delegation: { id: 'd', target: 'client' },
    });
    await vi.advanceTimersByTimeAsync(0);
    text(socket);
    await vi.advanceTimersByTimeAsync(100);
    closed(socket);
    expect((await result).error).toContain('backend work pending');
  });

  it('bounds aggregate transcript growth', async () => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    start(socket);
    text(socket, 'x'.repeat(600_000));
    text(socket, 'y'.repeat(600_000), 'input');
    const response = await result;
    expect(response.error).toBe('GPT-Live transcript exceeded the capture limit.');
    expect(response.metadata?.transcript).toHaveLength(1);
  });

  it.each(['', '!!!', 'AQ=A', 'AR=='])('rejects malformed output audio %s', async (delta) => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    start(socket);
    emit(socket, { type: 'session.output_audio.delta', delta });
    closed(socket);
    expect((await result).error).toBe('Invalid GPT-Live audio delta.');
  });

  it.each(
    (
      [
        { type: 'audio/pcm', rate: 16_000 },
        { type: 'audio/pcm', rate: 24_000 },
        { type: 'audio/pcmu', rate: 8_000 },
        { type: 'audio/pcma', rate: 8_000 },
      ] satisfies LiveAudioFormat[]
    ).flatMap((format) => [false, true].map((overflow) => ({ format, overflow }))),
  )(
    'bounds output by capture duration ($format.type, $format.rate, overflow: $overflow)',
    async ({ format, overflow }) => {
      const result = provider({ audio: { format }, responseWindowMs: 100 }).callApi('Hi');
      const socket = await connect();
      start(socket);
      const sampleBytes = format.type === 'audio/pcm' ? 2 : 1;
      const bytes = Buffer.alloc((format.rate * sampleBytes) / 10);
      emit(socket, { type: 'session.output_audio.delta', delta: bytes.toString('base64') });
      if (overflow) {
        emit(socket, {
          type: 'session.output_audio.delta',
          delta: Buffer.alloc(sampleBytes).toString('base64'),
        });
      }
      closed(socket);
      const response = await result;
      expect(response.error).toBe(
        overflow ? 'GPT-Live audio exceeded the capture limit.' : undefined,
      );
      expect(Buffer.from(response.audio!.data!, 'base64').length).toBe(44 + (format.rate / 10) * 2);
    },
  );

  it('bounds the number of tiny output audio chunks', async () => {
    const result = provider({ responseWindowMs: 100_000 }).callApi('Hi');
    const socket = await connect();
    start(socket);
    for (let index = 0; index <= 50_000; index++) {
      emit(socket, { type: 'session.output_audio.delta', delta: 'AAA=' });
    }
    closed(socket);
    const response = await result;
    expect(response.error).toBe('GPT-Live audio exceeded the capture limit.');
    expect(Buffer.from(response.audio!.data!, 'base64').length).toBe(100_044);
  });

  it('includes replayed input duration in the output audio budget', async () => {
    const result = provider().callApi(audioPrompt(Buffer.alloc(9600)));
    const socket = await connect();
    start(socket);
    const audio = Buffer.alloc(14_400);
    emit(socket, { type: 'session.output_audio.delta', delta: audio.toString('base64') });
    await vi.advanceTimersByTimeAsync(300);
    closed(socket);
    const response = await result;
    expect(response.error).toBeUndefined();
    expect(Buffer.from(response.audio!.data!, 'base64').subarray(44)).toEqual(audio);
  });

  it('rejects excess audio before the opening acknowledgment', async () => {
    const result = provider({ audio: { format: { type: 'audio/pcmu', rate: 8_000 } } }).callApi(
      'Hi',
    );
    const socket = await connect();
    emit(socket, { type: 'session.started', session: { id: 'session_1' } });
    emit(socket, {
      type: 'session.output_audio.delta',
      delta: Buffer.alloc(1600).toString('base64'),
    });
    const response = await result;
    expect(response.error).toBe('GPT-Live audio exceeded the capture limit.');
    expect(response.audio).toBeUndefined();
    expect(socket.terminate).toHaveBeenCalledOnce();
  });

  it('accepts canonical output audio with or without padding', async () => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    start(socket);
    emit(socket, { type: 'session.output_audio.delta', delta: 'AQI' });
    emit(socket, { type: 'session.output_audio.delta', delta: 'AwQ=' });
    await vi.advanceTimersByTimeAsync(100);
    closed(socket);
    const response = await result;
    expect(response.error).toBeUndefined();
    expect(Buffer.from(response.audio!.data!, 'base64').subarray(44)).toEqual(
      Buffer.from([1, 2, 3, 4]),
    );
  });

  it.each(['AQI===', 'AQI====', 'AQ=', 'AQ=I', 'AQI!', 'AQJ'])(
    'rejects noncanonical output Base64 %s',
    async (delta) => {
      const result = provider().callApi('Hi');
      const socket = await connect();
      start(socket);
      emit(socket, { type: 'session.output_audio.delta', delta });
      await vi.runAllTimersAsync();
      const response = await result;
      expect(response.error).toBe('Invalid GPT-Live audio delta.');
      expect(response.audio).toBeUndefined();
    },
  );

  it('reports incomplete PCM16 output samples', async () => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    start(socket);
    emit(socket, { type: 'session.output_audio.delta', delta: 'AQ==' });
    await vi.advanceTimersByTimeAsync(100);
    closed(socket);
    const response = await result;
    expect(response.error).toBe('GPT-Live returned incomplete PCM16 samples.');
    expect(response.audio).toBeUndefined();
  });

  it('reports an empty capture', async () => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    start(socket);
    await vi.advanceTimersByTimeAsync(100);
    closed(socket);
    expect((await result).error).toContain('returned no transcript or audio');
  });

  it('reports a session that ends before recorded input finishes replaying', async () => {
    const result = provider().callApi(audioPrompt(Buffer.alloc(1920, 1)));
    const socket = await connect();
    start(socket);
    closed(socket);
    expect((await result).error).toBe(
      'GPT-Live session ended before input audio replay completed.',
    );
  });

  it('keeps the specific missing-handler error when later API errors arrive', async () => {
    const result = provider().callApi('Hi');
    const socket = await connect();
    start(socket);
    emit(socket, {
      type: 'session.delegation.created',
      offset_ms: 0,
      delegation: { id: 'd', target: 'client' },
    });
    expect(socket.sent.at(-1)).toEqual({ type: 'session.close' });
    apiError(socket, {
      type: 'invalid_request_error',
      code: 'delegation_cancelled',
      message: 'Delegation cancelled.',
    });
    closed(socket);
    const response = await result;
    expect(response.error).toContain('no delegationHandler');
    expect(response.metadata?.apiErrors).toHaveLength(1);
  });

  it('rejects aborts and cleans up simultaneous sessions independently', async () => {
    const p = provider();
    const controller = new AbortController();
    const one = p.callApi('One', undefined, { abortSignal: controller.signal });
    const oneRejected = expect(one).rejects.toMatchObject({ name: 'AbortError' });
    await connect();
    start(sockets[0]);
    const two = p.callApi('Two');
    const twoRejected = expect(two).rejects.toMatchObject({
      name: 'AbortError',
      message: 'GPT-Live provider shut down.',
    });
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

  it('rethrows the caller abort reason', async () => {
    const controller = new AbortController();
    const result = provider().callApi('Hi', undefined, { abortSignal: controller.signal });
    const rejected = expect(result).rejects.toThrow('eval cancelled by user');
    const socket = await connect();
    start(socket);
    controller.abort(new Error('eval cancelled by user'));
    await rejected;
    expect(socket.terminate).toHaveBeenCalledOnce();
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

  it.each([false, true])('honors prompt apiKeyRequired=%s', async (apiKeyRequired) => {
    const p = provider({ apiKey: undefined, apiKeyRequired: !apiKeyRequired });
    expect(checkProviderApiKeys([p])).toEqual(new Map());
    const result = p.callApi(
      'Hi',
      promptContext({ apiBaseUrl: 'http://localhost:1234/v1', apiKeyRequired }),
    );
    await vi.advanceTimersByTimeAsync(0);
    if (sockets.length) {
      const socket = await connect();
      start(socket);
      text(socket);
      closed(socket);
    }
    const response = await result;
    expect(sockets).toHaveLength(apiKeyRequired ? 0 : 1);
    if (apiKeyRequired) {
      expect(response.error).toContain('API key is not set');
    } else {
      expect(response.error).toBeUndefined();
    }
  });

  it.each(
    ['', '  ', [{ type: 'text', text: '' }], [{ type: 'text', text: '  ' }]].map((content) => ({
      content,
    })),
  )('rejects empty final chat content $content before connecting', async ({ content }) => {
    const result = provider().callApi(
      JSON.stringify([
        { role: 'assistant', content: 'Earlier answer' },
        { role: 'user', content },
      ]),
    );
    await vi.advanceTimersByTimeAsync(0);
    if (sockets.length) {
      const socket = await connect();
      start(socket);
      text(socket);
      closed(socket);
    }
    expect((await result).error).toContain('nonempty text or input_audio');
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

  it.each(['X-Gateway-Auth', 'X-Gateway-Key', 'X-Gateway-Authentication', 'X-Session-Access'])(
    'redacts a custom %s credential echoed in API errors',
    async (header) => {
      const result = provider({
        apiBaseUrl: 'http://localhost:1234/v1',
        headers: { [header]: 'gateway-private-value' },
      }).callApi('Hi');
      const socket = await connect();
      start(socket);
      apiError(socket, { message: 'Invalid gateway-private-value' });
      closed(socket);
      const response = await result;
      expect(response.error).toContain('[REDACTED]');
      expect(JSON.stringify(response)).not.toContain('gateway-private-value');
    },
  );

  it('preserves ordinary header values in diagnostics', async () => {
    const result = provider({ headers: { 'Content-Type': 'application/json' } }).callApi('Hi');
    const socket = await connect();
    start(socket);
    apiError(socket, { message: 'Unsupported application/json content' });
    closed(socket);
    expect((await result).error).toContain('application/json');
  });

  it.each(['api-key', 'X-Gateway-Auth', 'X-Gateway-Key', 'X-Gateway-Authentication'])(
    'accepts custom %s credentials without OPENAI_API_KEY',
    async (header) => {
      const gateway = (headers: Record<string, string>) =>
        new OpenAiLiveProvider('gpt-live-1', {
          config: {
            apiBaseUrl: 'http://localhost:1234/v1',
            headers,
            responseWindowMs: 100,
            websocketTimeout: 200,
            closeTimeoutMs: 100,
          },
        });
      const result = gateway({ [header]: 'gateway-key' }).callApi('Hi');
      const socket = await connect();
      expect(socket.options.headers).toEqual({ [header]: 'gateway-key' });
      start(socket);
      text(socket);
      closed(socket);
      expect((await result).error).toBeUndefined();
      expect((await gateway({ [header]: ' ' }).callApi('Hi')).error).toContain(
        'API key is not set',
      );
      expect(sockets).toHaveLength(1);
    },
  );

  it('does not forward an ambient OpenAI key to a gateway with its own credential header', async () => {
    mockProcessEnv({ OPENAI_API_KEY: 'ambient-openai-key' });
    const upgradeHeaders = async (config: OpenAiLiveOptions) => {
      const result = new OpenAiLiveProvider('gpt-live-1', {
        config: {
          headers: { 'api-key': 'gateway-key' },
          responseWindowMs: 100,
          websocketTimeout: 200,
          closeTimeoutMs: 100,
          ...config,
        },
      }).callApi('Hi');
      const socket = await connect();
      start(socket);
      text(socket);
      closed(socket);
      expect((await result).error).toBeUndefined();
      return socket.options.headers;
    };

    expect(await upgradeHeaders({ apiBaseUrl: 'http://localhost:1234/v1' })).toEqual({
      'api-key': 'gateway-key',
    });
    // An explicit key source or the official API still receives the OpenAI key.
    expect(
      await upgradeHeaders({
        apiBaseUrl: 'http://localhost:1234/v1',
        apiKeyEnvar: 'OPENAI_API_KEY',
      }),
    ).toMatchObject({ Authorization: 'Bearer ambient-openai-key', 'api-key': 'gateway-key' });
    expect(await upgradeHeaders({})).toMatchObject({ Authorization: 'Bearer ambient-openai-key' });
  });

  it.each<{ name: string; config: OpenAiLiveOptions }>([
    { name: 'ambient key', config: { apiKey: undefined } },
    { name: 'empty Authorization override', config: { headers: { Authorization: '' } } },
    { name: 'blank Authorization override', config: { headers: { Authorization: ' ' } } },
    { name: 'scheme-only Bearer override', config: { headers: { Authorization: 'Bearer ' } } },
    { name: 'scheme-only Basic override', config: { headers: { authorization: ' basic\t' } } },
  ])('requires credentials actually sent to the gateway ($name)', async ({ config }) => {
    mockProcessEnv({ OPENAI_API_KEY: 'ambient-openai-key' });
    const result = provider({ apiBaseUrl: 'https://gateway.example/v1', ...config }).callApi('Hi');
    await vi.runAllTimersAsync();
    expect((await result).error).toContain('API key is not set');
    expect(sockets).toHaveLength(0);
  });

  it('resolves prompt-level credentials without forwarding the ambient OpenAI key', async () => {
    mockProcessEnv({ OPENAI_API_KEY: 'ambient-openai-key', PROMPT_LIVE_KEY: 'prompt-env-key' });
    const gateway = new OpenAiLiveProvider('gpt-live-1', {
      config: {
        apiBaseUrl: 'http://localhost:1234/v1',
        headers: { 'api-key': 'gateway-key' },
        responseWindowMs: 100,
        websocketTimeout: 200,
        closeTimeoutMs: 100,
      },
    });
    const upgradeHeaders = async (config: OpenAiLiveOptions) => {
      const result = gateway.callApi('Hi', promptContext(config));
      const socket = await connect();
      start(socket);
      text(socket);
      closed(socket);
      expect((await result).error).toBeUndefined();
      return socket.options.headers;
    };

    expect(await upgradeHeaders({ apiKey: 'prompt-key' })).toEqual({
      Authorization: 'Bearer prompt-key',
      'api-key': 'gateway-key',
    });
    expect(await upgradeHeaders({ instructions: 'Answer briefly.' })).toEqual({
      'api-key': 'gateway-key',
    });
    expect(await upgradeHeaders({ apiKeyEnvar: 'PROMPT_LIVE_KEY' })).toEqual({
      Authorization: 'Bearer prompt-env-key',
      'api-key': 'gateway-key',
    });
    expect(JSON.stringify(sockets.map((socket) => socket.options.headers))).not.toContain(
      'ambient-openai-key',
    );
  });

  it.each([
    [
      { apiHost: 'provider.example' },
      { apiBaseUrl: 'http://prompt.example/v1' },
      'ws://prompt.example/v1/live/sessions',
    ],
    [
      { apiBaseUrl: 'http://provider.example/v1' },
      { apiHost: 'prompt.example' },
      'wss://prompt.example/v1/live/sessions',
    ],
  ])(
    'lets prompt endpoint alternatives override provider settings',
    async (config, promptConfig, url) => {
      const result = provider(config).callApi('Hi', promptContext(promptConfig));
      const socket = await connect();
      start(socket);
      text(socket);
      closed(socket);
      expect((await result).error).toBeUndefined();
      expect(socket.url).toBe(url);
    },
  );

  it.each([
    [{ apiKey: 'provider-key' }, { apiKeyEnvar: 'PROMPT_LIVE_KEY' }],
    [{ apiKey: undefined, apiKeyEnvar: 'PROVIDER_LIVE_KEY' }, { apiKey: 'prompt-key' }],
  ])(
    'lets prompt credential alternatives override provider settings',
    async (config, promptConfig) => {
      mockProcessEnv({ PROMPT_LIVE_KEY: 'prompt-key', PROVIDER_LIVE_KEY: 'provider-key' });
      const result = provider(config).callApi('Hi', promptContext(promptConfig));
      const socket = await connect();
      start(socket);
      text(socket);
      closed(socket);
      expect((await result).error).toBeUndefined();
      expect(socket.options.headers.Authorization).toBe('Bearer prompt-key');
    },
  );

  it('reports a missing prompt-level apiKeyEnvar instead of using OPENAI_API_KEY', async () => {
    mockProcessEnv({ OPENAI_API_KEY: 'ambient-openai-key' });
    const result = new OpenAiLiveProvider('gpt-live-1', {
      config: { responseWindowMs: 100, websocketTimeout: 200, closeTimeoutMs: 100 },
    }).callApi('Hi', promptContext({ apiKeyEnvar: 'MISSING_LIVE_KEY' }));
    await vi.advanceTimersByTimeAsync(200);
    expect((await result).error).toBe(
      'API key is not set. Set the MISSING_LIVE_KEY environment variable or add `apiKey` to the provider config.',
    );
    expect(sockets).toHaveLength(0);
  });

  it('connects to a prompt-level endpoint with that prompt’s credentials and header defaults', async () => {
    mockProcessEnv({ OPENAI_API_KEY: 'ambient-openai-key' });
    const timeouts = { responseWindowMs: 100, websocketTimeout: 200, closeTimeoutMs: 100 };
    const official = new OpenAiLiveProvider('gpt-live-1', { config: timeouts });
    const gateway = new OpenAiLiveProvider('gpt-live-1', {
      config: {
        ...timeouts,
        apiBaseUrl: 'http://provider-gateway.example/v1',
        apiKeyRequired: false,
      },
    });
    const connectWith = async (live: OpenAiLiveProvider, config?: OpenAiLiveOptions) => {
      const result = live.callApi('Hi', config && promptContext(config));
      const socket = await connect();
      start(socket);
      text(socket);
      closed(socket);
      expect((await result).error).toBeUndefined();
      return { url: socket.url, headers: socket.options.headers };
    };

    // Provider-level config alone is unchanged.
    expect(await connectWith(official)).toEqual({
      url: 'wss://api.openai.com/v1/live/sessions',
      headers: { Authorization: 'Bearer ambient-openai-key', 'X-OpenAI-Originator': 'promptfoo' },
    });
    expect(await connectWith(gateway)).toEqual({
      url: 'ws://provider-gateway.example/v1/live/sessions',
      headers: {},
    });
    // Prompt-level endpoints get that prompt's key and organization, without OpenAI's originator.
    expect(
      await connectWith(official, {
        apiBaseUrl: 'http://prompt-gateway.example/v1',
        apiKey: 'prompt-key',
        organization: 'org-prompt',
      }),
    ).toEqual({
      url: 'ws://prompt-gateway.example/v1/live/sessions',
      headers: { Authorization: 'Bearer prompt-key', 'OpenAI-Organization': 'org-prompt' },
    });
    expect(
      await connectWith(gateway, { apiHost: 'prompt-host.example', apiKey: 'prompt-key' }),
    ).toEqual({
      url: 'wss://prompt-host.example/v1/live/sessions',
      headers: { Authorization: 'Bearer prompt-key' },
    });
    expect(await connectWith(gateway, { apiHost: 'api.openai.com' })).toEqual({
      url: 'wss://api.openai.com/v1/live/sessions',
      headers: { Authorization: 'Bearer ambient-openai-key', 'X-OpenAI-Originator': 'promptfoo' },
    });
    // The merged endpoint also decides ambient-key suppression, userinfo, and query rejection.
    expect(
      await connectWith(official, {
        apiBaseUrl: 'http://prompt-gateway.example/v1',
        headers: { 'api-key': 'gateway-key' },
      }),
    ).toEqual({
      url: 'ws://prompt-gateway.example/v1/live/sessions',
      headers: { 'api-key': 'gateway-key' },
    });
    expect(
      await connectWith(official, { apiBaseUrl: 'http://user:secret@prompt-gateway.example/v1' }),
    ).toEqual({
      url: 'ws://prompt-gateway.example/v1/live/sessions',
      headers: { Authorization: `Basic ${Buffer.from('user:secret').toString('base64')}` },
    });
    const query = await official.callApi(
      'Hi',
      promptContext({ apiBaseUrl: 'http://prompt-gateway.example/v1?api-key=secret' }),
    );
    expect(query.error).toBe('GPT-Live session URLs do not accept query parameters.');
    // Nothing for a prompt-level endpoint reached the provider-level endpoint.
    expect(sockets.map((socket) => new URL(socket.url).host)).toEqual([
      'api.openai.com',
      'provider-gateway.example',
      'prompt-gateway.example',
      'prompt-host.example',
      'api.openai.com',
      'prompt-gateway.example',
      'prompt-gateway.example',
    ]);
  });

  it('sends URL userinfo as Basic authorization instead of an ambient key or socket URL credential', async () => {
    mockProcessEnv({ OPENAI_API_KEY: 'ambient-openai-key' });
    const apiBaseUrl = 'http://gateway-user:gateway%21secret@localhost:1234/v1';
    const basic = `Basic ${Buffer.from('gateway-user:gateway!secret').toString('base64')}`;
    const upgrade = async (config: OpenAiLiveOptions) => {
      const result = new OpenAiLiveProvider('gpt-live-1', {
        config: { responseWindowMs: 100, websocketTimeout: 200, closeTimeoutMs: 100, ...config },
      }).callApi('Hi');
      const socket = await connect();
      start(socket);
      text(socket);
      closed(socket);
      expect((await result).error).toBeUndefined();
      return socket;
    };

    const gateway = await upgrade({ apiBaseUrl });
    expect(gateway.url).toBe('ws://localhost:1234/v1/live/sessions');
    expect(gateway.options.headers).toEqual({ Authorization: basic });
    // An explicit key or Authorization header still wins over userinfo.
    const explicit = await upgrade({ apiBaseUrl, apiKey: 'explicit-key' });
    expect(explicit.url).toBe('ws://localhost:1234/v1/live/sessions');
    expect(explicit.options.headers).toEqual({ Authorization: 'Bearer explicit-key' });
    const custom = await upgrade({ apiBaseUrl, headers: { authorization: 'Bearer custom-token' } });
    expect(custom.options.headers).toEqual({ authorization: 'Bearer custom-token' });
    const queryCredential = await new OpenAiLiveProvider('gpt-live-1', {
      config: { apiBaseUrl: 'http://localhost:1234/v1?api-key=gateway-secret' },
    }).callApi('Hi');
    expect(queryCredential.error).toBe('GPT-Live session URLs do not accept query parameters.');
    expect(sockets).toHaveLength(3);
    // URL userinfo also satisfies the credential requirement without OPENAI_API_KEY.
    mockProcessEnv({ OPENAI_API_KEY: undefined });
    expect((await upgrade({ apiBaseUrl })).options.headers).toEqual({ Authorization: basic });
  });

  it('redacts a URL userinfo credential that a rejected handshake echoes', async () => {
    const token = Buffer.from('gateway-user:gateway!secret').toString('base64');
    const result = new OpenAiLiveProvider('gpt-live-1', {
      config: {
        apiBaseUrl: 'http://gateway-user:gateway%21secret@localhost:1234/v1',
        responseWindowMs: 100,
        websocketTimeout: 200,
        closeTimeoutMs: 100,
      },
    }).callApi('Hi');
    await vi.advanceTimersByTimeAsync(0);
    sockets[0].emit(
      'unexpected-response',
      {},
      httpResponse(
        401,
        JSON.stringify({
          error: {
            message: `Rejected Basic ${token} (${token}) for gateway-user:gateway!secret; password gateway!secret/gateway%21secret.`,
          },
        }),
      ),
    );
    const response = await result;
    expect(response.error).toBe(
      'GPT-Live WebSocket handshake failed (HTTP 401): Rejected [REDACTED] ([REDACTED]) for [REDACTED]; password [REDACTED]/[REDACTED].',
    );
    expect(JSON.stringify(response)).not.toMatch(/gateway!secret|gateway%21secret/);
    expect(JSON.stringify(response)).not.toContain(token);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('redacts a short credential header echoed by a rejected handshake as whole tokens only', async () => {
    const result = new OpenAiLiveProvider('gpt-live-1', {
      config: {
        apiBaseUrl: 'http://localhost:1234/v1',
        headers: { 'api-key': 'k9z' },
        responseWindowMs: 100,
        websocketTimeout: 200,
        closeTimeoutMs: 100,
      },
    }).callApi('Hi');
    await vi.advanceTimersByTimeAsync(0);
    sockets[0].emit(
      'unexpected-response',
      {},
      httpResponse(
        401,
        JSON.stringify({
          error: {
            message:
              'Invalid api-key k9z for "api-key":"k9z" and key=k9z (k9zz and xk9z are unrelated).',
          },
        }),
      ),
    );
    expect((await result).error).toBe(
      'GPT-Live WebSocket handshake failed (HTTP 401): Invalid api-key [REDACTED] for "api-key":"[REDACTED]" and key=[REDACTED] (k9zz and xk9z are unrelated).',
    );
  });

  it.each(
    ['Token', 'Custom+Token', 'Custom.Token', 'Custom~Token', '9Token', "!#$%&'*+-.^_`|~"].flatMap(
      (scheme) => ['handshake', 'api'].map((transport) => ({ scheme, transport })),
    ),
  )(
    'redacts tokens from $scheme authorization in $transport errors',
    async ({ scheme, transport }) => {
      const result = new OpenAiLiveProvider('gpt-live-1', {
        config: {
          apiBaseUrl: 'http://localhost:1234/v1',
          headers: { Authorization: `${scheme} gateway-secret` },
          responseWindowMs: 100,
          websocketTimeout: 200,
          closeTimeoutMs: 100,
        },
      }).callApi('Hi');
      if (transport === 'handshake') {
        await vi.advanceTimersByTimeAsync(0);
        sockets[0].emit(
          'unexpected-response',
          {},
          httpResponse(401, JSON.stringify({ error: { message: 'invalid token gateway-secret' } })),
        );
      } else {
        const socket = await connect();
        start(socket);
        text(socket);
        apiError(socket, { message: 'invalid token gateway-secret' });
        closed(socket);
      }
      const response = await result;
      expect(response.error).toContain('invalid token [REDACTED]');
      expect(JSON.stringify(response)).not.toContain('gateway-secret');
    },
  );

  it('redacts a short userinfo password from Live error text and apiErrors', async () => {
    const result = new OpenAiLiveProvider('gpt-live-1', {
      config: {
        apiBaseUrl: 'http://gateway-user:abc@localhost:1234/v1',
        responseWindowMs: 100,
        websocketTimeout: 200,
        closeTimeoutMs: 100,
      },
    }).callApi('Hi');
    const socket = await connect();
    start(socket);
    text(socket);
    apiError(socket, {
      type: 'server_error',
      code: 'upstream_error',
      message:
        'Upstream rejected password abc for gateway-user:abc@localhost; abcd and xabc are unrelated. Retry abc.',
    });
    await vi.advanceTimersByTimeAsync(100);
    closed(socket);
    const response = await result;
    const message =
      'Upstream rejected password [REDACTED] for [REDACTED]@localhost; abcd and xabc are unrelated. Retry [REDACTED].';
    expect(response.error).toBe(`GPT-Live API error (upstream_error): ${message}`);
    expect(response.metadata?.apiErrors).toEqual([
      expect.objectContaining({ code: 'upstream_error', message }),
    ]);
  });

  it.each(['gateway-user-key', 'k9z'])(
    'redacts the Basic-auth username %s from API errors',
    async (username) => {
      const result = provider({
        apiKey: undefined,
        apiBaseUrl: `http://${username}:@localhost:1234/v1`,
      }).callApi('Hi');
      const socket = await connect();
      start(socket);
      text(socket);
      apiError(socket, { code: 'upstream_error', message: `Unknown user ${username}.` });
      closed(socket);
      const response = await result;
      expect(response.error).toBe('GPT-Live API error (upstream_error): Unknown user [REDACTED].');
      expect(response.metadata?.apiErrors).toEqual([
        expect.objectContaining({ message: 'Unknown user [REDACTED].' }),
      ]);
      expect(JSON.stringify(response)).not.toContain(username);
    },
  );

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

  it.each([
    { source: 'provider', pricing: { cost: 0.02 }, expected: 0.3 },
    { source: 'prompt', pricing: { inputCost: 0.01, outputCost: 0.03 }, expected: 0.25 },
  ])(
    'honors $source token prices for delegated Responses',
    async ({ source, pricing, expected }) => {
      const result = provider({
        delegation: { type: 'responses', responses: { model: 'gpt-4.1-mini' } },
        ...(source === 'provider' ? pricing : { inputCost: 1, outputCost: 1 }),
      }).callApi('Hi', source === 'prompt' ? promptContext(pricing) : undefined);
      const socket = await connect();
      start(socket);
      delegateResponses(socket, 'priced-response');
      backend(socket, { type: 'response.created', response: { id: 'priced-response' } });
      backend(socket, {
        type: 'response.completed',
        response: {
          id: 'priced-response',
          model: 'gpt-4.1-mini',
          output: [],
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            total_tokens: 15,
            output_tokens_details: { reasoning_tokens: 0 },
          },
        },
      });
      text(socket);
      await vi.advanceTimersByTimeAsync(100);
      closed(socket, 60);
      const response = await result;

      expect(response.error).toBeUndefined();
      expect(response.metadata?.backendCost).toBeCloseTo(expected);
      expect(response.cost).toBeCloseTo(expected + 0.05);
    },
  );

  it('ignores malformed delegated Responses usage', async () => {
    const result = provider({
      delegation: { type: 'responses', responses: { model: 'gpt-4.1-mini' } },
    }).callApi('Hi');
    const socket = await connect();
    start(socket);
    backend(socket, { type: 'response.created', response: { id: 'resp_1' } });
    emit(socket, {
      type: 'session.delegation.created',
      delegation: { id: 'delegation_1', target: 'responses' },
    });
    backend(socket, {
      type: 'response.completed',
      response: {
        id: 'resp_1',
        output: [],
        usage: { input_tokens: '10', output_tokens: -1, total_tokens: 9 },
      },
    });
    text(socket);
    await vi.advanceTimersByTimeAsync(100);
    closed(socket, 60);
    const output = await result;
    expect(output.tokenUsage).toMatchObject({ numRequests: 2 });
    expect(output.tokenUsage?.total).toBe(0);
    expect(output.cost).toBeUndefined();
    expect(output.metadata?.backendResponses[0].usage).toBeUndefined();
  });

  it('rejects function calls belonging to another response', async () => {
    const handler = vi.fn().mockResolvedValue('result');
    const result = provider({ delegation: lookupDelegation, functionCallHandler: handler }).callApi(
      'Hi',
    );
    const socket = await connect();
    start(socket);
    backend(socket, { type: 'response.created', response: { id: 'resp_1' } });
    backend(socket, {
      type: 'response.output_item.done',
      response_id: 'another_response',
      item: functionCall('call_1'),
    });
    backend(socket, { type: 'response.completed', response: { id: 'resp_1' } });
    await vi.advanceTimersByTimeAsync(0);
    closed(socket);
    expect((await result).error).toContain('function-call response ID');
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([undefined, 'resp_1'])(
    'handles nested function calls when terminal output is empty (response_id: %s)',
    async (response_id) => {
      const handler = vi.fn().mockResolvedValue('result');
      const result = provider({
        delegation: {
          type: 'responses',
          responses: {
            model: 'gpt-4.1-mini',
            tools: [{ type: 'function', name: 'lookup', parameters: {}, strict: false }],
          },
        },
        inputCost: 0.01,
        outputCost: 0.02,
        functionCallHandler: handler,
      }).callApi('Check my order');
      const socket = await connect();
      start(socket);
      delegateResponses(socket);
      backend(socket, { type: 'response.created', response: { id: 'resp_1' } });
      const item = {
        type: 'function_call',
        call_id: 'call_1',
        name: 'lookup',
        arguments: '{"id":42}',
      };
      backend(socket, { type: 'response.output_item.done', response_id, item });
      backend(socket, { type: 'response.output_item.done', response_id, item });
      backend(socket, {
        type: 'response.output_item.done',
        response_id,
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
          untrusted_metadata: { nested: ['discarded'] },
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
          event_id: eventId,
          item: { type: 'function_call_output', call_id: 'call_1', output: 'result' },
        },
        {
          type: 'response.item.create',
          event_id: eventId,
          item: { type: 'function_call_output', call_id: 'call_2', output: 'result' },
        },
        { type: 'response.create', event_id: eventId },
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
      expect(output.cost).toBeCloseTo(0.45);
      expect(output.metadata?.backendResponses).toHaveLength(2);
      expect(output.metadata?.backendResponses[0].usage).toEqual({
        input_tokens: 10,
        output_tokens: 5,
        total_tokens: 15,
      });
    },
  );

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
      delegateResponses(socket);
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
      expect(sentTypes(socket)).not.toContain('response.create');
      if (scenario !== 'invalid-arguments') {
        expect(socket.sent.at(-1)).toEqual({ type: 'session.close' });
      }
      closed(socket);
      expect((await result).error).toContain(
        scenario === 'missing-handler'
          ? 'no functionCallHandler'
          : scenario === 'invalid-arguments'
            ? 'Invalid GPT-Live backend function call'
            : 'handler failed',
      );
    },
  );

  const lookupDelegation: OpenAiLiveOptions['delegation'] = {
    type: 'responses',
    responses: {
      model: 'gpt-4.1-mini',
      tools: [{ type: 'function', name: 'lookup', parameters: {}, strict: false }],
    },
  };
  const functionCall = (id: string) => ({
    type: 'function_call',
    call_id: id,
    name: 'lookup',
    arguments: '{}',
  });

  it('stops a looping delegation at maxToolIterations before invoking the handler again', async () => {
    const handler = vi.fn().mockResolvedValue('result');
    const result = provider({
      delegation: lookupDelegation,
      functionCallHandler: handler,
      maxToolIterations: 2,
    }).callApi('Hi');
    const socket = await connect();
    start(socket);
    delegateResponses(socket);
    for (const round of [1, 2, 3]) {
      backend(socket, { type: 'response.created', response: { id: `resp_${round}` } });
      backend(socket, { type: 'response.output_item.done', item: functionCall(`call_${round}`) });
      backend(socket, {
        type: 'response.completed',
        response: { id: `resp_${round}`, output: [] },
      });
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(handler).toHaveBeenCalledTimes(2);
    expect(sentTypes(socket).filter((type) => type === 'response.create')).toHaveLength(2);
    expect(
      socket.sent
        .filter((event) => event.type === 'response.item.create')
        .map((event) => event.item.call_id),
    ).toEqual(['call_1', 'call_2']);
    expect(socket.sent.at(-1)).toEqual({ type: 'session.close' });
    closed(socket);
    expect((await result).error).toBe(
      'GPT-Live backend function calls exceeded maxToolIterations=2. Increase maxToolIterations if the eval needs more calls.',
    );
  });

  it('caps streamed function calls before the backend completes', async () => {
    const handler = vi.fn().mockResolvedValue('result');
    const result = provider({
      delegation: lookupDelegation,
      functionCallHandler: handler,
      maxToolIterations: 2,
    }).callApi('Hi');
    const socket = await connect();
    start(socket);
    backend(socket, { type: 'response.created', response: { id: 'resp_1' } });
    for (const id of ['call_1', 'call_1', 'call_2']) {
      backend(socket, { type: 'response.output_item.done', item: functionCall(id) });
    }
    expect(sentTypes(socket)).not.toContain('session.close');
    backend(socket, { type: 'response.output_item.done', item: functionCall('call_3') });
    expect(socket.sent.at(-1)).toEqual({ type: 'session.close' });
    expect(handler).not.toHaveBeenCalled();
    closed(socket);
    expect((await result).error).toContain('backend function calls exceeded maxToolIterations=2');
  });

  it('bounds a single oversized batch of function calls by the default maxToolIterations', async () => {
    const handler = vi.fn().mockResolvedValue('result');
    const result = provider({
      delegation: lookupDelegation,
      functionCallHandler: handler,
    }).callApi('Hi');
    const socket = await connect();
    start(socket);
    backend(socket, { type: 'response.created', response: { id: 'resp_1' } });
    for (const index of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      backend(socket, { type: 'response.output_item.done', item: functionCall(`call_${index}`) });
    }
    backend(socket, { type: 'response.completed', response: { id: 'resp_1', output: [] } });
    await vi.advanceTimersByTimeAsync(0);
    expect(handler).not.toHaveBeenCalled();
    expect(sentTypes(socket)).not.toContain('response.item.create');
    expect(sentTypes(socket)).not.toContain('response.create');
    expect(socket.sent.at(-1)).toEqual({ type: 'session.close' });
    closed(socket);
    expect((await result).error).toBe(
      'GPT-Live backend function calls exceeded maxToolIterations=8. Increase maxToolIterations if the eval needs more calls.',
    );
  });

  it.each(['response.failed', 'response.incomplete'])(
    'reports a backend %s and closes the capture',
    async (type) => {
      const result = provider({
        delegation: { type: 'responses', responses: { model: 'gpt-4.1-mini' } },
      }).callApi('Hi');
      const socket = await connect();
      start(socket);
      backend(socket, { type: 'response.created', response: { id: 'resp_1' } });
      backend(socket, { type, response: { id: 'resp_1', output: [] } });
      expect(socket.sent.at(-1)).toEqual({ type: 'session.close' });
      closed(socket);
      const response = await result;
      expect(response.error).toBe(`GPT-Live backend ${type}.`);
      expect(response.tokenUsage).toMatchObject({ numRequests: 2 });
      expect(response.cost).toBeUndefined();
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
    expect(response.metadata?.delegations).toEqual([{ id: 'd', target: 'responses' }]);
  });

  it('reports backend work requested after the capture window ended', async () => {
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
    }).callApi('Hi');
    const socket = await connect();
    start(socket);
    text(socket);
    await vi.advanceTimersByTimeAsync(100);
    expect(socket.sent.at(-1)).toEqual({ type: 'session.close' });
    emit(socket, {
      type: 'session.delegation.created',
      offset_ms: 90,
      delegation: { id: 'delegation_1', target: 'responses' },
    });
    backend(socket, { type: 'response.created', response: { id: 'resp_1' } });
    backend(socket, {
      type: 'response.output_item.done',
      item: { type: 'function_call', call_id: 'call_1', name: 'lookup', arguments: '{}' },
    });
    backend(socket, { type: 'response.completed', response: { id: 'resp_1', output: [] } });
    closed(socket);
    const response = await result;
    expect(response.error).toBe(
      'GPT-Live backend requested work after the capture window ended. Increase responseWindowMs.',
    );
    expect(handler).not.toHaveBeenCalled();
    expect(response.metadata?.delegations).toEqual([
      { id: 'delegation_1', target: 'responses', offsetMs: 90 },
    ]);
  });

  it('reports function calls that complete after the capture window ended', async () => {
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
    }).callApi('Hi');
    const socket = await connect();
    start(socket);
    text(socket);
    await vi.advanceTimersByTimeAsync(100);
    backend(socket, { type: 'response.created', response: { id: 'resp_1' } });
    backend(socket, {
      type: 'response.output_item.done',
      item: { type: 'function_call', call_id: 'call_1', name: 'lookup', arguments: '{}' },
    });
    backend(socket, { type: 'response.completed', response: { id: 'resp_1', output: [] } });
    closed(socket);
    expect((await result).error).toContain('after the capture window ended');
    expect(handler).not.toHaveBeenCalled();
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
    const append = socket.sent.at(-1);
    expect(append).toEqual({
      type: 'session.commentary.append',
      event_id: eventId,
      delegation_id: 'opaque-id',
      content: 'The order shipped.',
    });
    emit(socket, { type: 'session.commentary.appended', client_event_id: append.event_id });
    text(socket, 'Shipped.');
    await vi.advanceTimersByTimeAsync(100);
    closed(socket);
    const output = await result;
    expect(output.error).toBeUndefined();
    expect(output.cost).toBeUndefined();
    expect(output.metadata?.backendCost).toBeUndefined();
    expect(output.metadata?.voiceCost).toBeCloseTo(0.01);
    expect(output.metadata?.delegations).toEqual([
      { id: 'opaque-id', target: 'client', offsetMs: 42 },
    ]);
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

  it.each([undefined, null, '42', -1])(
    'rejects an invalid delegation offset %s before calling the handler',
    async (offset) => {
      const handler = vi.fn().mockResolvedValue('result');
      const result = provider({ delegationHandler: handler }).callApi('Hi');
      const socket = await connect();
      start(socket);
      emit(socket, {
        type: 'session.delegation.created',
        offset_ms: offset,
        delegation: { id: 'invalid-offset', target: 'client' },
      });
      await vi.advanceTimersByTimeAsync(100);
      closed(socket);
      expect((await result).error).toContain('Invalid GPT-Live delegation offset');
      expect(handler).not.toHaveBeenCalled();
    },
  );

  const clientDelegation = (socket: Socket, id: string) =>
    emit(socket, {
      type: 'session.delegation.created',
      offset_ms: 0,
      delegation: { id, target: 'client' },
    });
  const delegationResults = (socket: Socket) =>
    socket.sent.filter(
      (event) => event.type === 'session.commentary.append' && event.delegation_id !== null,
    );
  const clientCapError =
    'GPT-Live client delegations exceeded maxToolIterations=2. Increase maxToolIterations if the eval needs more delegations.';

  it.each([
    { kind: 'ASCII at the limit', content: 'x'.repeat(65_536), oversized: false },
    { kind: 'ASCII over the limit', content: 'x'.repeat(65_537), oversized: true },
    { kind: 'UTF-8 at the limit', content: '🙂'.repeat(16_384), oversized: false },
    { kind: 'UTF-8 over the limit', content: '🙂'.repeat(16_385), oversized: true },
  ])('bounds client commentary before sending: $kind', async ({ content, oversized }) => {
    const result = provider({ delegationHandler: async () => content }).callApi('Hi');
    const socket = await connect();
    start(socket);
    text(socket);
    clientDelegation(socket, 'd');
    await vi.advanceTimersByTimeAsync(0);
    const appends = delegationResults(socket);
    expect(appends).toHaveLength(oversized ? 0 : 1);
    if (!oversized) {
      expect(appends[0].content).toBe(content);
      emit(socket, { type: 'session.commentary.appended', client_event_id: appends[0].event_id });
    }
    closed(socket);
    const response = await result;
    expect(response.error).toBe(
      oversized
        ? 'GPT-Live client commentary exceeded 64 KiB. Return a shorter delegation result.'
        : undefined,
    );
  });

  it('rejects oversized function results before sending or continuing the response', async () => {
    const result = provider({
      delegation: lookupDelegation,
      functionCallHandler: async () => 'x'.repeat(1_048_577),
    }).callApi('Hi');
    const socket = await connect();
    start(socket);
    delegateResponses(socket);
    backend(socket, { type: 'response.created', response: { id: 'resp_1' } });
    backend(socket, { type: 'response.output_item.done', item: functionCall('call_1') });
    backend(socket, { type: 'response.completed', response: { id: 'resp_1', output: [] } });
    await vi.advanceTimersByTimeAsync(0);
    expect(sentTypes(socket)).not.toContain('response.item.create');
    expect(sentTypes(socket)).not.toContain('response.create');
    closed(socket);
    expect((await result).error).toBe(
      'GPT-Live function result exceeded 1 MiB. Return a shorter result.',
    );
  });

  it.each(['text', 'entries'])('bounds pending client snapshot %s before cloning', async (kind) => {
    const resolvers: ((value: string) => void)[] = [];
    const handler = vi.fn(() => new Promise<string>((resolve) => resolvers.push(resolve)));
    const result = provider({ delegationHandler: handler }).callApi(
      kind === 'text' ? 'x'.repeat(2_000_000) : 'Hi',
    );
    const socket = await connect();
    start(socket);
    if (kind === 'entries') {
      for (let index = 0; index < 20_000; index++) {
        text(socket, '', 'input');
      }
    }
    for (let index = 0; index < 5; index++) {
      clientDelegation(socket, `d${index}`);
    }
    closed(socket);
    const response = await result;
    for (const resolve of resolvers) {
      resolve('late result');
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(response.error).toContain('client delegation snapshots exceeded');
    expect(handler).toHaveBeenCalledTimes(kind === 'text' ? 4 : 2);
    expect(delegationResults(socket)).toHaveLength(0);
  });

  it('releases the client snapshot budget when a handler settles', async () => {
    const handler = vi.fn().mockResolvedValue('result');
    const result = provider({ delegationHandler: handler, maxToolIterations: 16 }).callApi('Hi');
    const socket = await connect();
    start(socket);
    text(socket, 'x'.repeat(1_000_000));
    for (let index = 0; index < 9; index++) {
      clientDelegation(socket, `d${index}`);
      await vi.advanceTimersByTimeAsync(0);
      emit(socket, {
        type: 'session.commentary.appended',
        client_event_id: delegationResults(socket).at(-1).event_id,
      });
    }
    await vi.advanceTimersByTimeAsync(100);
    closed(socket);
    expect((await result).error).toBeUndefined();
    expect(handler).toHaveBeenCalledTimes(9);
  });

  it('caps managed Responses delegations without counting repeated IDs', async () => {
    const result = provider({
      delegation: { type: 'responses', responses: { model: 'gpt-4.1-mini' } },
      maxToolIterations: 2,
    }).callApi('Hi');
    const socket = await connect();
    start(socket);
    for (const id of ['d1', 'd1', 'd2']) {
      emit(socket, { type: 'session.delegation.created', delegation: { id, target: 'responses' } });
    }
    expect(sentTypes(socket)).not.toContain('session.close');
    for (const id of ['d3', 'd4']) {
      emit(socket, { type: 'session.delegation.created', delegation: { id, target: 'responses' } });
    }
    const closeRequested = socket.sent.at(-1)?.type === 'session.close';
    closed(socket);
    const response = await result;
    expect(closeRequested).toBe(true);
    expect(response.error).toContain('Responses delegations exceeded maxToolIterations=2');
    expect(response.metadata?.delegations).toHaveLength(2);
  });

  it('stops a client delegation loop at maxToolIterations without counting repeated IDs', async () => {
    const handler = vi.fn().mockResolvedValue('The order shipped.');
    const result = provider({ delegationHandler: handler, maxToolIterations: 2 }).callApi('Hi');
    const socket = await connect();
    start(socket);
    text(socket);
    for (const id of ['d1', 'd1', 'd2']) {
      clientDelegation(socket, id);
      await vi.advanceTimersByTimeAsync(0);
    }
    // The repeated ID runs once and doesn't count toward the cap.
    expect(handler).toHaveBeenCalledTimes(2);
    expect(delegationResults(socket).map((event) => event.delegation_id)).toEqual(['d1', 'd2']);
    expect(sentTypes(socket)).not.toContain('session.close');
    clientDelegation(socket, 'd3');
    await vi.advanceTimersByTimeAsync(0);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(socket.sent.at(-1)).toEqual({ type: 'session.close' });
    closed(socket);
    expect((await result).error).toBe(clientCapError);
  });

  it('caps a burst of client delegations before any handler finishes', async () => {
    const resolvers: ((value: string) => void)[] = [];
    const handler = vi.fn(
      () =>
        new Promise<string>((done) => {
          resolvers.push(done);
        }),
    );
    const result = provider({ delegationHandler: handler, maxToolIterations: 2 }).callApi('Hi');
    const socket = await connect();
    start(socket);
    text(socket);
    for (const id of ['d1', 'd2', 'd3', 'd4']) {
      clientDelegation(socket, id);
    }
    expect(handler).toHaveBeenCalledTimes(2);
    expect(socket.sent.at(-1)).toEqual({ type: 'session.close' });
    for (const done of resolvers) {
      done('late result');
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(delegationResults(socket)).toHaveLength(0);
    closed(socket);
    expect((await result).error).toBe(clientCapError);
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
