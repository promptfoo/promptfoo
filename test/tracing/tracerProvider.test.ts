import { ROOT_CONTEXT, TraceFlags, trace } from '@opentelemetry/api';
import { InMemorySpanExporter, TracerProvider } from '@opentelemetry/sdk-trace';
import { afterEach, expect, it, vi } from 'vitest';
import { batchProcessorFromEnv, traceOptionsFromEnv } from '../../src/tracing/tracerProvider';

afterEach(() => vi.unstubAllEnvs());

it.each([
  // Sampler, ratio, and recording decisions for a root, sampled parent, and unsampled parent.
  [undefined, undefined, [true, true, false]],
  ['parentbased_always_on', undefined, [true, true, false]],
  ['always_on', undefined, [true, true, true]],
  ['always_off', undefined, [false, false, false]],
  ['parentbased_always_off', undefined, [false, true, false]],
  ['traceidratio', '0', [false, false, false]],
  ['parentbased_traceidratio', '0', [false, true, false]],
  ['traceidratio', '1', [true, true, true]],
  ['traceidratio', '2', [true, true, true]],
  ['traceidratio', undefined, [true, true, true]],
  ['unknown', undefined, [true, true, false]],
] as const)(
  'applies sampler %s with ratio %s to root and remote child spans',
  async (name, ratio, expected) => {
    vi.stubEnv('OTEL_TRACES_SAMPLER', name);
    vi.stubEnv('OTEL_TRACES_SAMPLER_ARG', ratio);
    const provider = new TracerProvider(traceOptionsFromEnv());
    try {
      const tracer = provider.getTracer('test');
      const parents = [
        ROOT_CONTEXT,
        ...[TraceFlags.SAMPLED, TraceFlags.NONE].map((traceFlags) =>
          trace.setSpanContext(ROOT_CONTEXT, {
            traceId: '0123456789abcdef0123456789abcdef',
            spanId: '0123456789abcdef',
            isRemote: true,
            traceFlags,
          }),
        ),
      ];
      const recording = parents.map((parent) => {
        const span = tracer.startSpan('test', {}, parent);
        const sampled = span.isRecording();
        span.end();
        return sampled;
      });
      expect(recording).toEqual(expected);
    } finally {
      await provider.shutdown();
    }
  },
);

it('applies span limits and exports a full batch without waiting for the scheduled flush', async () => {
  vi.stubEnv('OTEL_ATTRIBUTE_COUNT_LIMIT', '1');
  vi.stubEnv('OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT', '2');
  vi.stubEnv('OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT', '3');
  vi.stubEnv('OTEL_BSP_MAX_EXPORT_BATCH_SIZE', '1');
  vi.stubEnv('OTEL_BSP_SCHEDULE_DELAY', '60000');
  const exporter = new InMemorySpanExporter();
  const provider = new TracerProvider({
    ...traceOptionsFromEnv(),
    spanProcessors: [batchProcessorFromEnv(exporter)],
  });
  try {
    const span = provider.getTracer('test').startSpan('limited');
    span.setAttributes({ first: 'abcdefgh', second: 2, third: 3 });
    span.end();
    await vi.waitFor(() => expect(exporter.getFinishedSpans()).toHaveLength(1));
    expect(exporter.getFinishedSpans()[0].attributes).toEqual({ first: 'abc', second: 2 });
  } finally {
    await provider.shutdown();
  }
});
