import { describe, expect, it } from 'vitest';
import { stripDecompressionHeaders } from '../../../src/util/fetch/stripDecompressionHeaders';
import type { Dispatcher } from 'undici';

type RawHeaderPairs = [string, string][];
type ResponseCallbackMode = 'started' | 'start' | 'both';
type TrackedEvent =
  | {
      method: 'onResponseStart';
      args: [Dispatcher.DispatchController, number, Record<string, string | string[]>, string];
    }
  | {
      method: 'onResponseStarted';
      args: [];
    };

interface DispatchResponseStartOptions {
  rawHeaders?: Buffer[] | null;
  parsedHeaders: Record<string, string | string[]>;
  statusCode?: number;
  dispatchResult?: boolean;
  callbackMode?: ResponseCallbackMode;
}

interface DispatchResponseStartResult {
  controller: Dispatcher.DispatchController & { rawHeaders?: Buffer[] | null };
  events: TrackedEvent[];
  dispatched: boolean;
}

function makeRawHeaders(pairs: RawHeaderPairs): Buffer[] {
  return pairs.flatMap(([name, value]) => [Buffer.from(name), Buffer.from(value)]);
}

function rawHeadersToPairs(rawHeaders: Buffer[]): RawHeaderPairs {
  const pairs: RawHeaderPairs = [];
  for (let i = 0; i + 1 < rawHeaders.length; i += 2) {
    pairs.push([rawHeaders[i].toString(), rawHeaders[i + 1].toString()]);
  }
  return pairs;
}

/**
 * Drives the strip interceptor with a synthetic controller the way undici's
 * v7→v8 bridge does on Node 26: the controller carries the original raw
 * headers while the parsed headers reflect any rewriting the decompress
 * interceptor performed. This exercises the strip logic on every Node
 * version, without needing a Node 26 fetch.
 */
function dispatchResponseStart({
  rawHeaders,
  parsedHeaders,
  statusCode = 200,
  dispatchResult = true,
  callbackMode = 'both',
}: DispatchResponseStartOptions): DispatchResponseStartResult {
  const events: TrackedEvent[] = [];
  const innerHandler: Dispatcher.DispatchHandler = {
    onResponseStart(controller, status, headers, statusMessage) {
      events.push({
        method: 'onResponseStart',
        args: [controller, status, headers, statusMessage],
      });
    },
    onResponseStarted() {
      events.push({ method: 'onResponseStarted', args: [] });
    },
  };
  const controller = { rawHeaders } as unknown as Dispatcher.DispatchController & {
    rawHeaders?: Buffer[] | null;
  };
  // Real undici handlers use one callback generation. Tests can select either
  // generation explicitly; "both" is only a compact harness mode.
  const dispatch: Parameters<Dispatcher.DispatchInterceptor>[0] = (_opts, handler) => {
    if (callbackMode === 'both' || callbackMode === 'started') {
      handler.onResponseStarted?.();
    }
    if (callbackMode === 'both' || callbackMode === 'start') {
      handler.onResponseStart?.(controller, statusCode, parsedHeaders, 'OK');
    }
    return dispatchResult;
  };
  const composed = stripDecompressionHeaders()(dispatch);
  const dispatched = composed(
    { path: '/', method: 'GET' } as Dispatcher.DispatchOptions,
    innerHandler,
  );
  return { controller, events, dispatched };
}

describe('stripDecompressionHeaders', () => {
  it('strips content-encoding and content-length from rawHeaders when decompress decoded the body', () => {
    // decompress removed both headers from the parsed headers => body is decoded.
    const { controller, events } = dispatchResponseStart({
      rawHeaders: makeRawHeaders([
        ['content-type', 'application/json'],
        ['content-encoding', 'gzip'],
        ['content-length', '123'],
        ['x-request-id', 'abc'],
      ]),
      parsedHeaders: { 'content-type': 'application/json', 'x-request-id': 'abc' },
    });

    expect(rawHeadersToPairs(controller.rawHeaders as Buffer[])).toEqual([
      ['content-type', 'application/json'],
      ['x-request-id', 'abc'],
    ]);
    expect(events.map((e) => e.method)).toEqual(['onResponseStarted', 'onResponseStart']);
  });

  it('strips mixed-case and repeated content-encoding entries', () => {
    // Defensive: undici's parseHeaders merges repeated names into one array
    // value and decompress rejects array-valued content-encoding, so this
    // exact state is synthetic — the strip should still handle it sanely.
    const { controller } = dispatchResponseStart({
      rawHeaders: makeRawHeaders([
        ['Content-Encoding', 'gzip'],
        ['content-encoding', 'br'],
        ['Content-Length', '99'],
        ['Content-Type', 'text/plain'],
      ]),
      parsedHeaders: { 'content-type': 'text/plain' },
    });

    expect(rawHeadersToPairs(controller.rawHeaders as Buffer[])).toEqual([
      ['Content-Type', 'text/plain'],
    ]);
  });

  it('leaves rawHeaders untouched when the parsed headers still carry content-encoding (decompress skipped)', () => {
    // An unsupported encoding makes the decompress interceptor pass the
    // response through with its original headers. The raw content-encoding
    // must survive so callers can tell the body is still encoded.
    const rawHeaders = makeRawHeaders([
      ['content-encoding', 'x-snappy'],
      ['content-length', '40'],
    ]);
    const { controller } = dispatchResponseStart({
      rawHeaders,
      parsedHeaders: { 'content-encoding': 'x-snappy', 'content-length': '40' },
    });

    expect(controller.rawHeaders).toBe(rawHeaders);
    expect(rawHeadersToPairs(controller.rawHeaders as Buffer[])).toEqual([
      ['content-encoding', 'x-snappy'],
      ['content-length', '40'],
    ]);
  });

  it('leaves content-length untouched on responses that were never compressed', () => {
    const rawHeaders = makeRawHeaders([
      ['content-type', 'application/json'],
      ['content-length', '123'],
    ]);
    const { controller } = dispatchResponseStart({
      rawHeaders,
      parsedHeaders: { 'content-type': 'application/json', 'content-length': '123' },
    });

    expect(controller.rawHeaders).toBe(rawHeaders);
    expect(rawHeadersToPairs(controller.rawHeaders as Buffer[])).toEqual([
      ['content-type', 'application/json'],
      ['content-length', '123'],
    ]);
  });

  it.each([
    undefined,
    null,
  ])('passes through when controller.rawHeaders is %s (not an array)', (rawHeaders) => {
    const { controller, events } = dispatchResponseStart({
      rawHeaders,
      parsedHeaders: { 'content-type': 'application/json' },
    });

    expect(controller.rawHeaders).toBe(rawHeaders);
    expect(events.map((e) => e.method)).toEqual(['onResponseStarted', 'onResponseStart']);
  });

  it('blocks the strip when the parsed content-encoding key is not lowercase', () => {
    // Decompress only decodes on the exact lowercase key, so a differently
    // cased parsed key means the body was not decoded — the case-insensitive
    // fallback in the gate must block the strip.
    const rawHeaders = makeRawHeaders([
      ['content-encoding', 'x-snappy'],
      ['content-length', '40'],
    ]);
    const { controller } = dispatchResponseStart({
      rawHeaders,
      parsedHeaders: { 'Content-Encoding': 'x-snappy' },
    });

    expect(controller.rawHeaders).toBe(rawHeaders);
  });

  it.each([true, false])('propagates the dispatch backpressure result (%s)', (dispatchResult) => {
    const { dispatched } = dispatchResponseStart({
      rawHeaders: makeRawHeaders([['content-type', 'text/plain']]),
      parsedHeaders: { 'content-type': 'text/plain' },
      dispatchResult,
    });

    expect(dispatched).toBe(dispatchResult);
  });

  it('preserves a trailing unpaired rawHeaders element when stripping', () => {
    const rawHeaders = [
      ...makeRawHeaders([
        ['content-encoding', 'gzip'],
        ['x-request-id', 'abc'],
      ]),
      Buffer.from('dangling'),
    ];
    const { controller } = dispatchResponseStart({
      rawHeaders,
      parsedHeaders: { 'x-request-id': 'abc' },
    });

    const result = controller.rawHeaders as Buffer[];
    expect(rawHeadersToPairs(result)).toEqual([['x-request-id', 'abc']]);
    expect(result[result.length - 1].toString()).toBe('dangling');
  });

  it('forwards response events and arguments to the inner handler unchanged', () => {
    const parsedHeaders = { 'content-type': 'application/json' };
    const { controller, events } = dispatchResponseStart({
      rawHeaders: makeRawHeaders([['content-type', 'application/json']]),
      parsedHeaders,
      callbackMode: 'start',
    });

    const start = events.find((e) => e.method === 'onResponseStart');
    expect(start?.args[0]).toBe(controller);
    expect(start?.args[1]).toBe(200);
    expect(start?.args[2]).toBe(parsedHeaders);
    expect(start?.args[3]).toBe('OK');
  });
});
