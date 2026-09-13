import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeCallback } from '../../src/providers/functionCallbackExecutor';
import { normalizeMcpToolContent } from '../../src/providers/mcp/util';
import { createDeferred } from '../util/utils';

afterEach(() => vi.restoreAllMocks());

const identity = { name: 'lookup', args: '{"id":1}', callId: 'call-1' };

describe('callback execution records', () => {
  it('preserves structured output, identity and the adapter invocation shape', async () => {
    const callback = vi.fn().mockResolvedValue({ found: true });
    const result = await executeCallback({
      ...identity,
      reference: callback,
      cache: {},
      loadFile: vi.fn(),
    });
    expect(result).toEqual({
      name: 'lookup',
      arguments: '{"id":1}',
      callId: 'call-1',
      output: { found: true },
      isError: false,
    });
    expect(callback).toHaveBeenCalledWith('{"id":1}');
  });

  it('passes context only for adapters that request it', async () => {
    const context = { user: 'fixture' };
    const callback = vi.fn().mockResolvedValue('result');
    await executeCallback({
      ...identity,
      reference: callback,
      cache: {},
      loadFile: vi.fn(),
      context,
      passContext: true,
    });
    expect(callback).toHaveBeenCalledWith('{"id":1}', context);
  });

  it('retains the original error for provider-specific fallback handling', async () => {
    const error = new Error('fixture load failure');
    const result = await executeCallback({
      ...identity,
      reference: 'file://fixture.js:lookup',
      cache: {},
      loadFile: vi.fn().mockRejectedValue(error),
    });
    expect(result).toEqual({
      name: 'lookup',
      arguments: '{"id":1}',
      callId: 'call-1',
      isError: true,
      error,
    });
  });

  it('reuses a reference and reloads after a prompt changes that reference', async () => {
    const cache = {};
    const loadFile = vi
      .fn()
      .mockResolvedValueOnce(() => 'first')
      .mockResolvedValueOnce(() => 'second');
    const call = (reference: string) =>
      executeCallback({ ...identity, reference, cache, loadFile });
    expect((await call('file://first.js')).output).toBe('first');
    expect((await call('file://first.js')).output).toBe('first');
    expect((await call('file://second.js')).output).toBe('second');
    expect(loadFile).toHaveBeenCalledTimes(2);
  });

  it('keeps overlapping requests bound to their own callback reference', async () => {
    const cache = {};
    const first = createDeferred<Function>();
    const loadFile = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(() => 'second');
    const call = (reference: string) =>
      executeCallback({ ...identity, reference, cache, loadFile });
    const a = call('file://first.js');
    const b = call('file://second.js');
    expect((await b).output).toBe('second');
    first.resolve(() => 'first');
    expect((await a).output).toBe('first');
    expect((await call('file://second.js')).output).toBe('second');
    expect(loadFile).toHaveBeenCalledTimes(2);
  });

  it('caches the newest overlapping reference even when the older load finishes first', async () => {
    const cache = {};
    const first = createDeferred<Function>();
    const second = createDeferred<Function>();
    const loadFile = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const call = (reference: string) =>
      executeCallback({ ...identity, reference, cache, loadFile });
    const oldCall = call('file://first.js');
    const newCall = call('file://second.js');
    first.resolve(() => 'first');
    expect((await oldCall).output).toBe('first');
    second.resolve(() => 'second');
    expect((await newCall).output).toBe('second');
    expect((await call('file://second.js')).output).toBe('second');
    expect(loadFile).toHaveBeenCalledTimes(2);
  });

  it('does not let an older load overwrite a reference that changed back', async () => {
    const cache = {};
    const first = createDeferred<Function>();
    const newer = createDeferred<Function>();
    const loadFile = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(() => 'second')
      .mockReturnValueOnce(newer.promise);
    const call = (reference: string) =>
      executeCallback({ ...identity, reference, cache, loadFile });
    const oldCall = call('file://first.js');
    expect((await call('file://second.js')).output).toBe('second');
    const newCall = call('file://first.js');
    newer.resolve(() => 'new first');
    expect((await newCall).output).toBe('new first');
    first.resolve(() => 'old first');
    expect((await oldCall).output).toBe('old first');
    expect((await call('file://first.js')).output).toBe('new first');
    expect(loadFile).toHaveBeenCalledTimes(3);
  });

  it('lets an older load populate the cache when a newer load fails', async () => {
    const cache = {};
    const first = createDeferred<Function>();
    const loadFile = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockRejectedValueOnce(new Error('new load failed'));
    const call = (reference: string) =>
      executeCallback({ ...identity, reference, cache, loadFile });
    const oldCall = call('file://first.js');
    expect(await call('file://second.js')).toMatchObject({ isError: true });
    first.resolve(() => 'first');
    expect((await oldCall).output).toBe('first');
    expect((await call('file://first.js')).output).toBe('first');
    expect(loadFile).toHaveBeenCalledTimes(2);
  });

  it('recovers a completed predecessor when the newer load fails later', async () => {
    const cache = {};
    const first = createDeferred<Function>();
    const second = createDeferred<Function>();
    const loadFile = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const call = (reference: string) =>
      executeCallback({ ...identity, reference, cache, loadFile });
    const oldCall = call('file://first.js');
    const newCall = call('file://second.js');
    first.resolve(() => 'first');
    expect((await oldCall).output).toBe('first');
    second.reject(new Error('new load failed'));
    expect(await newCall).toMatchObject({ isError: true });
    expect((await call('file://first.js')).output).toBe('first');
    expect(loadFile).toHaveBeenCalledTimes(2);
  });

  it.each([undefined, null, ''])(
    'treats missing callback reference %s as absent',
    async (reference) => {
      const loadFile = vi.fn();
      const result = await executeCallback({ ...identity, reference, cache: {}, loadFile });
      expect(result).toMatchObject({
        isError: true,
        error: new Error("No callback found for function 'lookup'"),
      });
      expect(loadFile).not.toHaveBeenCalled();
    },
  );

  it.each(['constructor', 'toString', '__proto__'])(
    'requires a configured reference for %s',
    async (name) => {
      const result = await executeCallback({
        ...identity,
        name,
        reference: undefined,
        cache: {},
        loadFile: vi.fn(),
      });
      expect(result).toMatchObject({
        isError: true,
        error: new Error(`No callback found for function '${name}'`),
      });
    },
  );

  it('caches a configured __proto__ callback without changing the cache prototype', async () => {
    const cache = {};
    const callback = vi.fn().mockReturnValue('configured tool');
    const result = await executeCallback({
      ...identity,
      name: '__proto__',
      reference: callback,
      cache,
      loadFile: vi.fn(),
    });
    expect(result).toMatchObject({ isError: false, output: 'configured tool' });
    expect(Object.getPrototypeOf(cache)).toBe(Object.prototype);
    expect(Object.hasOwn(cache, '__proto__')).toBe(true);
  });

  it('does not load an already-cancelled callback', async () => {
    const loadFile = vi.fn();
    await expect(
      executeCallback({
        ...identity,
        reference: 'file://fixture.js',
        cache: {},
        loadFile,
        signal: AbortSignal.abort(new Error('cancelled')),
      }),
    ).rejects.toThrow('cancelled');
    expect(loadFile).not.toHaveBeenCalled();
  });

  it('cancels a pending load without invoking its eventual callback', async () => {
    const controller = new AbortController();
    const loaded = createDeferred<Function>();
    const callback = vi.fn();
    const pending = executeCallback({
      ...identity,
      reference: 'file://fixture.js',
      cache: {},
      loadFile: () => loaded.promise,
      signal: controller.signal,
    });
    controller.abort(new Error('cancelled load'));
    await expect(pending).rejects.toThrow('cancelled load');
    loaded.resolve(callback);
    await Promise.resolve();
    expect(callback).not.toHaveBeenCalled();
  });
});

it('normalizes mixed MCP result blocks consistently', () => {
  expect(
    normalizeMcpToolContent([
      'plain',
      { text: 'text' },
      { json: { found: true } },
      { data: [1, 2] },
      { extra: false },
      0,
      null,
    ]),
  ).toBe('plain\ntext\n{"found":true}\n[1,2]\n{"extra":false}\n0\nnull');
  expect(normalizeMcpToolContent(undefined)).toBe('');
  expect(normalizeMcpToolContent('')).toBe('');
});

it('normalizes MCP content with BigInt and circular JSON blocks', () => {
  const circular: { value: number; self?: unknown } = { value: 2 };
  circular.self = circular;
  expect(normalizeMcpToolContent([{ json: 1n }, { data: circular }])).toBe('1\n[object Object]');
  expect(normalizeMcpToolContent(circular)).toBe('[object Object]');
});
