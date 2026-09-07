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
