import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import { expect, it } from 'vitest';
import {
  markEvaluatorSpan,
  SPAN_ORIGIN_ATTRIBUTE,
  setReceivedSpanOwnership,
} from '../../src/tracing/otlpOwnership';
import { SPAN_ROLE_ATTRIBUTE } from '../../src/tracing/spanRoles';

it('authenticates wrappers after export and rejects claims copied to a different span', async () => {
  const exporter = new InMemorySpanExporter();
  const provider = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] });
  const name = 'grader match';
  const span = provider.getTracer('host').startSpan(name, {
    attributes: { [SPAN_ROLE_ATTRIBUTE]: 'grader', public: 1 },
  });
  markEvaluatorSpan(span, 'grader', name);
  span.end();
  await provider.forceFlush();
  const [exported] = exporter.getFinishedSpans();
  await provider.shutdown();
  const { traceId, spanId } = exported.spanContext();
  const receive = (
    overrides: Partial<{
      traceId: string;
      spanId: string;
      name: string;
      parentSpanId: string;
      role: string;
      origin: string;
    }> = {},
  ) => {
    const attributes = {
      ...exported.attributes,
      'promptfoo.openai.hosted_trace': 'forged',
    } as Record<string, unknown>;
    if (overrides.role) {
      attributes[SPAN_ROLE_ATTRIBUTE] = overrides.role;
    }
    if (overrides.origin) {
      attributes[SPAN_ORIGIN_ATTRIBUTE] = overrides.origin;
    }
    setReceivedSpanOwnership({
      traceId: overrides.traceId ?? traceId,
      span: { spanId, name, ...overrides, startTime: 0, attributes },
    });
    return attributes;
  };
  expect(receive()).toEqual({ public: 1, [SPAN_ROLE_ATTRIBUTE]: 'grader' });
  for (const overrides of [
    { spanId: 'other' },
    { traceId: 'other' },
    { name: 'other' },
    { parentSpanId: 'other' },
    { role: 'target' },
    { origin: 'invalid' },
  ]) {
    expect(receive(overrides)).toEqual({ public: 1 });
  }
});
