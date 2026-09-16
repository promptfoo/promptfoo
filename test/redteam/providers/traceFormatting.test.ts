import { describe, expect, it } from 'vitest';
import {
  formatTraceForMetadata,
  formatTraceSummary,
} from '../../../src/redteam/providers/traceFormatting';

import type { TraceContextData } from '../../../src/tracing/traceContext';

it.each([false, true])('omits private trace insights from metadata (filtered: %s)', (filtered) => {
  const marker = 'PRIVATE_TRACE_INSIGHT';
  const span: TraceContextData['spans'][number] = {
    spanId: 'lookup',
    name: marker,
    kind: 'internal',
    startTime: 1,
    endTime: 2,
    depth: 0,
    events: [],
    attributes: {},
    status: { code: 'ok' },
  };
  const trace: TraceContextData = {
    traceId: 'trace-reference',
    fetchedAt: 123,
    spans: [span, { ...span, spanId: 'second' }],
    insights: [`Tool call inventory.search via "${marker}"`],
    ...(filtered && { summary: { spans: [span], insights: [`Tool call "${marker}"`] } }),
  };
  const original = structuredClone(trace);
  const metadata = formatTraceForMetadata(trace);

  expect(JSON.stringify(metadata)).not.toContain(marker);
  expect(metadata).toMatchObject({
    traceId: 'trace-reference',
    fetchedAt: 123,
    spanCount: filtered ? 1 : 2,
  });
  expect(formatTraceSummary(trace)).toContain(marker);
  expect(trace).toEqual(original);
});

describe('formatTraceSummary', () => {
  it('uses the filtered summary view without exposing complete grading evidence or insights', () => {
    const trace: TraceContextData = {
      traceId: '0123456789abcdef',
      fetchedAt: 0,
      insights: ['Hidden private operation'],
      spans: [
        {
          spanId: 'private',
          name: 'Hidden private operation',
          kind: 'internal',
          startTime: 0,
          depth: 0,
          events: [],
          attributes: {},
          status: { code: 'ok' },
        },
      ],
      summary: { spans: [], insights: [] },
    };

    expect(formatTraceSummary(trace)).toBe('No trace spans recorded during this iteration.');
    expect(trace.spans).toHaveLength(1);
  });

  it('includes Vercel AI SDK tool names in formatted spans', () => {
    const trace: TraceContextData = {
      traceId: '0123456789abcdef',
      fetchedAt: Date.now(),
      insights: ['Tool call lookup_customer via "ai.toolCall" (duration 42ms)'],
      spans: [
        {
          spanId: 'span-1',
          name: 'ai.toolCall',
          kind: 'internal',
          startTime: 0,
          endTime: 42,
          durationMs: 42,
          attributes: {
            'ai.toolCall.name': 'lookup_customer',
          },
          status: {
            code: 'ok',
          },
          depth: 0,
          events: [],
        },
      ],
    };

    const summary = formatTraceSummary(trace);

    expect(summary).toContain('tool=lookup_customer');
    expect(summary).toContain('Tool call lookup_customer via "ai.toolCall"');
  });

  it('includes OpenTelemetry GenAI model names in formatted spans', () => {
    const trace: TraceContextData = {
      traceId: '0123456789abcdef',
      fetchedAt: Date.now(),
      insights: [],
      spans: [
        {
          spanId: 'model-span',
          name: 'chat',
          kind: 'internal',
          startTime: 0,
          endTime: 42,
          durationMs: 42,
          attributes: {
            'gen_ai.operation.name': 'chat',
            'gen_ai.request.model': 'gpt-4.1-mini',
          },
          status: { code: 'ok' },
          depth: 0,
          events: [],
        },
      ],
    };

    expect(formatTraceSummary(trace)).toContain('model=gpt-4.1-mini');
  });
});
