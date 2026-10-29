import { ExportResultCode } from '@opentelemetry/core';
import { describe, expect, it, vi } from 'vitest';
import { setReceivedSpanOwnership, trackLocalOtlpExports } from '../../src/tracing/otlpOwnership';
import { PROMPTFOO_TRACER_NAME, SPAN_ROLE_ATTRIBUTE } from '../../src/tracing/spanRoles';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-node';

import type { SpanData } from '../../src/tracing/store';

const traceId = 'a'.repeat(32);

function localSpan(
  spanId: string,
  attributes: ReadableSpan['attributes'],
  scope = PROMPTFOO_TRACER_NAME,
): ReadableSpan {
  return {
    name: 'invoke_agent',
    attributes,
    instrumentationScope: { name: scope },
    spanContext: () => ({ traceId, spanId, traceFlags: 1 }),
  } as ReadableSpan;
}

function receive(local: ReadableSpan, overrides: Partial<SpanData> = {}) {
  const span: SpanData = {
    name: local.name,
    spanId: local.spanContext().spanId,
    startTime: 0,
    attributes: {
      [SPAN_ROLE_ATTRIBUTE]: 'grader',
      'gen_ai.tool.name': 'lookup',
    },
    ...overrides,
  };
  setReceivedSpanOwnership({ traceId, span });
  return span.attributes;
}

describe('OTLP ownership', () => {
  const tool = { 'gen_ai.tool.name': 'lookup' };

  it('restores only the local wrapper fields during export, including a pending failed export', async () => {
    const local = localSpan('1'.repeat(16), { [SPAN_ROLE_ATTRIBUTE]: 'target' });
    const foreign = localSpan('3'.repeat(16), { [SPAN_ROLE_ATTRIBUTE]: 'grader' }, 'third-party');
    const unmarked = localSpan('4'.repeat(16), {});
    const send = vi.fn<SpanExporter['export']>();
    const callback = vi.fn();
    const exporter = trackLocalOtlpExports({ export: send, shutdown: vi.fn() });
    exporter.export([local, foreign, unmarked], callback);

    try {
      expect(receive(local)).toEqual({ ...tool, [SPAN_ROLE_ATTRIBUTE]: 'target' });
      expect(receive(foreign)).toEqual(tool);
      expect(receive(unmarked)).toEqual(tool);
      expect(receive(local, { name: 'different' })).toEqual(tool);
      expect(receive(local, { parentSpanId: '5'.repeat(16) })).toEqual(tool);
      expect(receive(local, { attributes: undefined })).toBeUndefined();
    } finally {
      const failure = { code: ExportResultCode.FAILED, error: new Error('collector unavailable') };
      await Promise.resolve().then(() => send.mock.calls[0][1](failure));
      expect(callback).toHaveBeenCalledWith(failure);
    }
    expect(receive(local)).toEqual(tool);
  });

  it('releases ownership if the exporter throws before invoking its callback', () => {
    const local = localSpan('6'.repeat(16), { [SPAN_ROLE_ATTRIBUTE]: 'grader' });
    const error = new Error('export failed to start');
    const callback = vi.fn();
    const exporter = trackLocalOtlpExports({
      export: () => {
        expect(receive(local)).toEqual({ ...tool, [SPAN_ROLE_ATTRIBUTE]: 'grader' });
        throw error;
      },
      shutdown: vi.fn(),
    });
    expect(() => exporter.export([local], callback)).toThrow(error);
    expect(callback).not.toHaveBeenCalled();
    expect(receive(local)).toEqual(tool);
  });

  it('forwards exporter lifecycle promises and accepts an exporter without forceFlush', async () => {
    const flushError = new Error('flush failed');
    const forceFlush = vi.fn().mockRejectedValue(flushError);
    const shutdown = vi.fn().mockResolvedValue(undefined);
    const exporter = trackLocalOtlpExports({ export: vi.fn(), forceFlush, shutdown });
    await expect(exporter.forceFlush?.()).rejects.toBe(flushError);
    await exporter.shutdown();
    expect(forceFlush).toHaveBeenCalledOnce();
    expect(shutdown).toHaveBeenCalledOnce();

    const withoutFlush = trackLocalOtlpExports({ export: vi.fn(), shutdown });
    await expect(withoutFlush.forceFlush?.()).resolves.toBeUndefined();
  });
});
