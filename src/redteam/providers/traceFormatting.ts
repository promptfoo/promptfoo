import { getToolNameFromAttributes } from '../../tracing/toolAttributes';
import { TraceContextData, TraceSpan } from '../../tracing/traceContext';

const DEFAULT_MAX_SPANS = 10;

function formatDuration(durationMs: number | undefined): string {
  if (!durationMs || Number.isNaN(durationMs)) {
    return '0ms';
  }

  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`;
  }

  if (durationMs < 60_000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }

  const minutes = durationMs / 60_000;
  return `${minutes.toFixed(1)}m`;
}

function formatSpan(span: TraceSpan): string {
  const parts = [`[${formatDuration(span.durationMs)}] ${span.kind || 'unspecified'}`];

  const tool = getToolNameFromAttributes(span.attributes);
  if (tool) {
    parts.push(`tool=${tool}`);
  }

  parts.push(`status=${span.status.code}`);

  return parts.join(' | ');
}

export function formatTraceSummary(
  trace: TraceContextData,
  options: { maxSpans?: number } = {},
): string {
  if (!trace || trace.spans.length === 0) {
    return 'No trace spans recorded during this iteration.';
  }

  const maxSpans = options.maxSpans ?? DEFAULT_MAX_SPANS;
  const spans = trace.spans.slice(0, maxSpans);

  const header = `Trace ${trace.traceId.slice(0, 8)} • ${trace.spans.length} span${
    trace.spans.length === 1 ? '' : 's'
  }`;

  const formattedSpans = spans.map((span, index) => `${index + 1}. ${formatSpan(span)}`).join('\n');

  return [header, '', 'Execution Flow:', formattedSpans].join('\n');
}

export function formatTraceForMetadata(trace: TraceContextData): Record<string, unknown> {
  return {
    traceId: trace.traceId,
    fetchedAt: trace.fetchedAt,
    spanCount: trace.spans.length,
    insights: trace.insights,
  };
}
