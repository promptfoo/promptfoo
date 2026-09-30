import { describe, expect, it } from 'vitest';
import {
  formatTraceForMetadata,
  formatTraceSummary,
} from '../../../src/redteam/providers/traceFormatting';

import type { TraceContextData } from '../../../src/tracing/traceContext';

describe('formatTraceSummary', () => {
  it.each([0, 470])('redacts credentials before truncation (prefix length: %s)', (length) => {
    const credential = 'dXNlcjpwYXNz';
    const text = 'x'.repeat(length) + ' Authorization: Basic ' + credential;
    const trace: TraceContextData = {
      traceId: '0123456789abcdef',
      fetchedAt: 0,
      insights: [text],
      spans: [
        {
          spanId: 'span',
          name: text,
          kind: text,
          startTime: 0,
          depth: 0,
          events: [],
          attributes: { 'tool.name': text, model: text },
          status: { code: 'error', message: text },
        },
      ],
    };
    const summary = formatTraceSummary(trace);
    expect(summary).not.toContain(credential);
    expect(summary).not.toContain('Basic d');
    expect(JSON.stringify(formatTraceForMetadata(trace))).not.toContain(credential);
    expect(trace.spans[0].name).toBe(text);
    expect(trace.insights[0]).toBe(text);
  });

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

  it('bounds displayed external fields without modifying the evidence', () => {
    const oversized = 'x'.repeat(1_000_000);
    const span = {
      spanId: 'span',
      name: oversized,
      kind: oversized,
      startTime: 0,
      depth: 0,
      events: [],
      attributes: { 'tool.name': oversized, model: oversized },
      status: { code: 'error' as const, message: oversized },
    };
    const trace: TraceContextData = {
      traceId: '0123456789abcdef',
      fetchedAt: 0,
      spans: [span],
      insights: Array(100).fill(oversized),
    };
    const summary = formatTraceSummary(trace, { maxSpans: 1 });
    expect(summary.length).toBeLessThan(15_000);
    expect(summary).toContain('...');
    expect(summary).toContain('tool=');
    expect(summary).toContain('model=');
    expect(summary).toContain('ERROR:');
    expect(trace.spans[0].name).toHaveLength(1_000_000);
    expect(trace.insights).toHaveLength(100);
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
