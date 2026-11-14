import {
  getToolNameFromAttributes,
  TOOL_ARGUMENT_ATTRIBUTE_KEYS,
} from '../../tracing/toolAttributes';
import { TraceContextData, TraceSpan } from '../../tracing/traceContext';

import type { RedteamGradingContext } from '../grading/types';

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
  const parts: string[] = [];
  const duration = formatDuration(span.durationMs);

  parts.push(
    `[${duration}] ${span.name}${span.kind && span.kind !== 'unspecified' ? ` (${span.kind})` : ''}`,
  );

  const tool = getToolNameFromAttributes(span.attributes);
  if (tool) {
    parts.push(`tool=${tool}`);
  }

  const model =
    span.attributes['gen_ai.request.model'] ||
    span.attributes['gen_ai.response.model'] ||
    span.attributes['ai.model.id'] ||
    span.attributes['model'] ||
    span.attributes['llm.model'];
  if (model) {
    parts.push(`model=${model}`);
  }

  if (span.status.code === 'error') {
    parts.push(`ERROR: ${span.status.message ?? 'Unknown error'}`);
  }

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

  const insights =
    trace.insights.length > 0 ? trace.insights.map((i) => `• ${i}`).join('\n') : 'None';

  return [header, '', 'Execution Flow:', formattedSpans, '', 'Key Observations:', insights].join(
    '\n',
  );
}

export function formatTraceForMetadata(trace: TraceContextData): Record<string, unknown> {
  return {
    traceId: trace.traceId,
    fetchedAt: trace.fetchedAt,
    spanCount: trace.spans.length,
    insights: trace.insights,
  };
}

function readToolArguments(
  attributes: Record<string, unknown>,
): Record<string, unknown> | null | undefined {
  const key = TOOL_ARGUMENT_ATTRIBUTE_KEYS.find((key) => attributes[key] !== undefined);
  let args = key === undefined ? undefined : attributes[key];
  if (typeof args === 'string') {
    if (args.length > 32_768) {
      return null;
    }
    try {
      args = JSON.parse(args);
    } catch {
      return null;
    }
  }
  return args && typeof args === 'object' && !Array.isArray(args)
    ? (args as Record<string, unknown>)
    : undefined;
}

function quotedEndpointKey(value: string): string | undefined {
  let end = value.length;
  while (end > 0 && '.,;)]}'.includes(value[end - 1])) {
    end--;
  }
  return endpointKey(value.slice(0, end));
}

function endpointKey(value: string): string | undefined {
  const url = URL.parse(value);
  if (url?.protocol === 'https:' || url?.protocol === 'http:') {
    return url.origin + url.pathname;
  }
  return undefined;
}

function* destinationFields(args: Record<string, unknown>) {
  for (const field of ['to', 'recipient', 'destination', 'url', 'endpoint']) {
    const value: unknown = Object.getOwnPropertyDescriptor(args, field)?.value;
    for (const dest of Array.isArray(value) ? value : [value]) {
      if (typeof dest === 'string' && dest) {
        yield { field, dest };
      }
    }
  }
}

function getQuotedEndpoints(messages: string[]): Set<string> {
  const quotedEndpoints = new Set<string>();
  for (const message of messages) {
    for (const token of message.match(/\bhttps?:\/\/[^\s<>"'`]+/gi) ?? []) {
      // Retain the exact URL as well as a version without surrounding prose punctuation.
      for (const endpoint of [endpointKey(token), quotedEndpointKey(token)]) {
        if (endpoint) {
          quotedEndpoints.add(endpoint);
        }
      }
    }
  }
  return quotedEndpoints;
}

// Compare destinations locally. The judge receives bounded boolean evidence.
export function summarizeToolDestinations(prompt: string, context?: RedteamGradingContext) {
  const spans = context?.traceData?.spans ?? context?.traceContext?.spans ?? [];
  const matched = new Set<string>();
  const unmatched = new Set<string>();
  let incomplete = false;
  const history = context?.conversationHistory ?? context?.redteamHistory ?? [];
  const peerPrompts = [prompt, ...history.map((turn) => turn.prompt)];
  const quotedEndpoints = getQuotedEndpoints(peerPrompts);
  for (const { attributes } of spans) {
    const tool = getToolNameFromAttributes(attributes);
    if (!attributes || !tool) {
      continue;
    }
    const args = readToolArguments(attributes);
    if (!args) {
      incomplete ||= args === null;
      continue;
    }
    for (const { field, dest } of destinationFields(args)) {
      if (dest.endsWith('…') || ['[REDACTED]', '<redacted>'].includes(dest)) {
        incomplete = true;
        continue;
      }
      const endpoint = /^https?:/i.test(dest) ? endpointKey(dest) : undefined;
      const quotedInPeerMessage = endpoint
        ? quotedEndpoints.has(endpoint)
        : peerPrompts.some((message) => message.includes(dest));
      const evidence = quotedInPeerMessage ? matched : unmatched;
      if (evidence.size < 12) {
        evidence.add(JSON.stringify({ tool: tool.slice(0, 128), field, quotedInPeerMessage }));
      }
    }
  }
  const items = [...matched, ...unmatched].slice(0, 12);
  return { summary: items.length ? `[${items.join(',')}]` : '', incomplete };
}
