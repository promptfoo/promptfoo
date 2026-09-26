import { InvokeModelWithBidirectionalStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NovaSonicProvider } from '../../../src/providers/bedrock/nova-sonic';
import { createDeferred } from '../../util/utils';
import type { InvokeModelWithBidirectionalStreamInput } from '@aws-sdk/client-bedrock-runtime';

type Input = AsyncIterable<InvokeModelWithBidirectionalStreamInput>;
type Event = Record<string, any>;

type SessionAccess = {
  createSession(id: string): { promptName: string; input: Input };
  sendEvent(id: string, event: { event: Event }): Promise<void>;
  sessions: Map<string, unknown>;
};

function decode(value: InvokeModelWithBidirectionalStreamInput): Event {
  return JSON.parse(new TextDecoder().decode(value.chunk?.bytes)).event;
}

function encode(event: Event) {
  return { chunk: { bytes: new TextEncoder().encode(JSON.stringify({ event })) } };
}

async function collect(input: Input): Promise<Event[]> {
  const events: Event[] = [];
  for await (const event of input) {
    events.push(decode(event));
  }
  return events;
}

vi.mock('../../../src/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('Nova Sonic request stream', () => {
  let provider: NovaSonicProvider;
  let session: SessionAccess;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    provider = new NovaSonicProvider();
    session = provider as unknown as SessionAccess;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('drains buffered events and both protocol terminators before EOF', async () => {
    const { promptName, input } = session.createSession('buffered');
    for (let index = 0; index < 50; index++) {
      await session.sendEvent('buffered', { event: { textInput: { content: `${index}: 雪` } } });
    }
    const ending = provider.endSession('buffered');
    await vi.runAllTimersAsync();
    await ending;

    const events = await collect(input);
    expect(events).toEqual([
      ...Array.from({ length: 50 }, (_, index) => ({ textInput: { content: `${index}: 雪` } })),
      { promptEnd: { promptName } },
      { sessionEnd: {} },
    ]);
    await session.sendEvent('buffered', { event: { textInput: { content: 'too late' } } });
    await expect(input[Symbol.asyncIterator]().next()).resolves.toMatchObject({ done: true });
    await provider.endSession('buffered');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('wakes an empty reader and serializes concurrent reads without losing events', async () => {
    const input = session.createSession('pending').input[Symbol.asyncIterator]();
    const first = input.next();
    const second = input.next();
    await session.sendEvent('pending', { event: { first: {} } });
    await session.sendEvent('pending', { event: { second: {} } });
    expect(decode((await first).value)).toEqual({ first: {} });
    expect(decode((await second).value)).toEqual({ second: {} });

    const remaining = collect({ [Symbol.asyncIterator]: () => input });
    const ending = provider.endSession('pending');
    await vi.runAllTimersAsync();
    await ending;
    expect((await remaining).map((event) => Object.keys(event)[0])).toEqual([
      'promptEnd',
      'sessionEnd',
    ]);
  });

  it('isolates concurrent sessions', async () => {
    const one = collect(session.createSession('one').input);
    const two = collect(session.createSession('two').input);
    await session.sendEvent('one', { event: { textInput: { content: 'one' } } });
    await session.sendEvent('two', { event: { textInput: { content: 'two' } } });
    const endings = Promise.all([provider.endSession('one'), provider.endSession('two')]);
    await vi.runAllTimersAsync();
    await endings;
    expect((await one)[0]).toEqual({ textInput: { content: 'one' } });
    expect((await two)[0]).toEqual({ textInput: { content: 'two' } });
    expect(await one).toHaveLength(3);
    expect(await two).toHaveLength(3);
  });

  it('allows the transport to stop consuming without accepting later events', async () => {
    const input = session.createSession('cancelled').input[Symbol.asyncIterator]();
    await session.sendEvent('cancelled', { event: { first: {} } });
    expect(decode((await input.next()).value)).toEqual({ first: {} });
    await input.return?.();
    await session.sendEvent('cancelled', { event: { tooLate: {} } });
    await provider.endSession('cancelled');
    await expect(input.next()).resolves.toMatchObject({ done: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['success', 'response error', 'request error', 'malformed response'])(
    'finishes the actual provider request after %s',
    async (outcome) => {
      const audioEnded = createDeferred<void>();
      let requestEvents: Promise<Event[]> | undefined;
      const send = vi.fn(async (command: InvokeModelWithBidirectionalStreamCommand) => {
        const events: Event[] = [];
        requestEvents = (async () => {
          let audioContentName: string | undefined;
          for await (const value of command.input.body!) {
            const event = decode(value);
            events.push(event);
            if (event.contentStart?.type === 'AUDIO') {
              audioContentName = event.contentStart.contentName;
            }
            if (audioContentName && event.contentEnd?.contentName === audioContentName) {
              audioEnded.resolve();
            }
          }
          return events;
        })();
        await audioEnded.promise;
        if (outcome === 'request error') {
          throw new Error('access denied by Bedrock');
        }
        return {
          body: (async function* () {
            if (outcome === 'response error') {
              throw new Error('connection timed out');
            }
            if (outcome === 'malformed response') {
              yield { chunk: { bytes: new TextEncoder().encode('{invalid JSON') } };
              return;
            }
            yield encode({ textOutput: { role: 'ASSISTANT', content: 'Hello from Sonic' } });
            yield encode({ contentEnd: { stopReason: 'END_TURN' } });
          })(),
        };
      });
      Object.assign(provider, { bedrockClient: { send } });

      const resultPromise = provider.callApi('YXVkaW8=');
      await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
      await vi.runAllTimersAsync();
      const result = await resultPromise;
      const events = await requestEvents;
      expect(send).toHaveBeenCalledOnce();
      expect(events?.map((event) => Object.keys(event)[0])).toEqual([
        'sessionStart',
        'promptStart',
        'contentStart',
        'textInput',
        'contentEnd',
        'contentStart',
        'audioInput',
        'contentEnd',
        'promptEnd',
        'sessionEnd',
      ]);
      expect(events?.[6].audioInput.content).toBe('YXVkaW8=');
      if (outcome === 'success') {
        expect(result).toMatchObject({ output: 'Hello from Sonic\n', cached: false });
        expect(result.error).toBeUndefined();
      } else {
        expect(result.error).toBeTruthy();
        expect(result.metadata?.errorType).toBe(
          outcome === 'request error'
            ? 'api'
            : outcome === 'response error'
              ? 'timeout'
              : 'parsing',
        );
      }
      expect(session.sessions.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
