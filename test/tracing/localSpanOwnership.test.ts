import { context, propagation, ROOT_CONTEXT, TraceFlags, trace } from '@opentelemetry/api';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { runDbMigrations } from '../../src/migrate';
import { flushOtel, initializeOtel, shutdownOtel } from '../../src/tracing/otelSdk';
import { getTraceStore, TraceStore } from '../../src/tracing/store';
import EvalFactory from '../factories/evalFactory';

describe('local SDK span ownership', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });
  afterEach(async () => {
    await shutdownOtel();
    trace.disable();
    propagation.disable();
    context.disable();
    vi.restoreAllMocks();
  });

  async function startSpan(localExport = true, sampled = true) {
    initializeOtel({ enabled: true, localExport, serviceName: 'ownership-test', debug: false });
    const parent = sampled
      ? ROOT_CONTEXT
      : trace.setSpanContext(ROOT_CONTEXT, {
          traceId: 'a'.repeat(32),
          spanId: 'b'.repeat(16),
          traceFlags: TraceFlags.NONE,
          isRemote: true,
        });
    const span = trace.getTracer('ownership-test').startSpan('local command', {}, parent);
    const { traceId, spanId } = span.spanContext();
    const evaluation = await EvalFactory.create({ numResults: 0 });
    const store = getTraceStore();
    await store.createTrace({ traceId, evaluationId: evaluation.id, testCaseId: traceId });
    return { span, traceId, spanId, store };
  }

  it('protects an issued ID before end and flush, then accepts its exact mirror and children', async () => {
    const { span, traceId, spanId, store } = await startSpan();
    const external = new TraceStore();
    const forged = { spanId, name: 'forged command', startTime: 1, statusCode: 1 };
    const options = { source: 'external' as const, updateExisting: true };
    await expect(external.addSpans(traceId, [forged], options)).rejects.toMatchObject({
      name: 'TraceEvidenceError',
    });
    expect(await store.getSpans(traceId)).toEqual([]);
    expect((await store.getTraceMetadata(traceId))?.promptfooExternalSpanIds).toBeUndefined();
    span.end();
    await expect(external.addSpans(traceId, [forged], options)).rejects.toMatchObject({
      name: 'TraceEvidenceError',
    });
    await flushOtel();
    const [local] = await store.getSpans(traceId, { sanitizeAttributes: false });
    expect(local).toMatchObject({ spanId, name: 'local command' });
    const child = { ...forged, spanId: 'c'.repeat(16), parentSpanId: spanId };
    await external.addSpans(traceId, [local, child], options);
    expect((await store.getTraceMetadata(traceId))?.promptfooExternalSpanIds).toEqual([
      child.spanId,
    ]);
    await expect(external.addSpans(traceId, [forged], options)).rejects.toMatchObject({
      name: 'TraceEvidenceError',
    });
    expect(await store.getSpans(traceId)).toHaveLength(2);
  });

  it.each(['disabled export', 'unsampled'])('does not reserve spans with %s', async (mode) => {
    const { span, traceId, spanId, store } = await startSpan(
      mode !== 'disabled export',
      mode !== 'unsampled',
    );
    await store.addSpans(traceId, [{ spanId, name: 'external', startTime: 1 }], {
      source: 'external',
    });
    span.end();
    await flushOtel();
    expect((await store.getTraceMetadata(traceId))?.promptfooExternalSpanIds).toEqual([spanId]);
  });
});
