import { describe, expect, it } from 'vitest';
import { formatTraceSummary } from '../../../src/redteam/providers/traceFormatting';

import type { TraceContextData } from '../../../src/tracing/traceContext';

describe('formatTraceSummary', () => {
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
