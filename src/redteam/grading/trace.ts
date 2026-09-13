import { sanitizeBody } from '../../tracing/genaiTracer';
import {
  getFirstStringAttribute,
  getToolNameFromAttributes,
  TOOL_ARGUMENT_ATTRIBUTE_KEYS,
  TOOL_RESULT_ATTRIBUTE_KEYS,
} from '../../tracing/toolAttributes';

import type { TraceData } from '../../types/tracing';
import type { RedteamGradingContext } from './types';

function sanitizeToolBody(value: unknown): string | undefined {
  const body = typeof value === 'string' ? value : JSON.stringify(value);
  return body === undefined ? undefined : sanitizeBody(body);
}

function toolCallKey(span: TraceData['spans'][number]): string | undefined {
  const attributes = span.attributes;
  const id = getFirstStringAttribute(attributes, [
    'gen_ai.tool.call.id',
    'tool.call.id',
    'tool_call_id',
  ]);
  if (!id) {
    return undefined;
  }
  return JSON.stringify([
    id,
    getToolNameFromAttributes(attributes),
    // Native SDK metadata may omit the outcome while the trace marks the call incomplete.
    attributes?.['tool.incomplete'] === true ? 0 : span.statusCode,
  ]);
}

function completeToolSpan(
  traced: TraceData['spans'][number],
  native: TraceData['spans'][number],
): TraceData['spans'][number] | undefined {
  const attributes = { ...traced.attributes };
  for (const keys of [TOOL_ARGUMENT_ATTRIBUTE_KEYS, TOOL_RESULT_ATTRIBUTE_KEYS]) {
    const [partial, complete] = [traced, native].map((span) => {
      return sanitizeToolBody(
        keys.map((key) => span.attributes?.[key]).find((value) => value != null),
      );
    });
    if (partial === complete) {
      continue;
    }
    // Claude tool spans cap bodies at 4 KiB; the native receipt retains the full body.
    const suffix = '... [truncated]';
    if (!partial?.endsWith(suffix) || !complete?.startsWith(partial.slice(0, -suffix.length))) {
      return undefined;
    }
    for (const key of keys) {
      if (attributes[key] != null) {
        attributes[key] = complete;
      }
    }
  }
  return { ...traced, attributes };
}

export function getGradingTrace(
  gradingContext?: RedteamGradingContext,
): Pick<TraceData, 'traceId' | 'spans' | 'metadata'> | undefined {
  const context = gradingContext?.traceContext;
  let trace: Pick<TraceData, 'traceId' | 'spans' | 'metadata'> | undefined =
    gradingContext?.traceData ??
    (context
      ? {
          traceId: context.traceId,
          spans: context.spans.map((span) => ({
            ...span,
            statusCode: span.status.code === 'error' ? 2 : span.status.code === 'ok' ? 1 : 0,
          })),
        }
      : undefined);
  const response = gradingContext?.providerResponse;
  const metadata = response?.metadata;
  if (response) {
    const raw = response.raw;
    const calls = Array.isArray(metadata?.toolCalls) ? [...metadata.toolCalls] : [];
    const toolName = metadata?.toolName ?? raw?.toolName ?? raw?.tool;
    if (typeof toolName === 'string') {
      calls.push({
        name: toolName,
        input: metadata?.toolArgs ?? raw?.args ?? raw?.arguments,
        output: raw?.structuredContent ?? raw?.result ?? raw,
        is_error: Boolean(response.error || raw?.isError),
      });
    }
    if (calls.length) {
      const spans = [...(trace?.spans ?? [])];
      const tracedCalls = new Map<string, number[]>();
      spans.forEach((span, index) => {
        const key = toolCallKey(span);
        if (key !== undefined) {
          const indices = tracedCalls.get(key) ?? [];
          indices.push(index);
          tracedCalls.set(key, indices);
        }
      });
      const nativeSpans = calls
        .map((call, index) => ({
          spanId: `provider-tool-${index}`,
          name: 'tool.call',
          startTime: index,
          statusCode:
            call.is_error || call.error || call.isError
              ? 2
              : call.output !== undefined || call.result !== undefined
                ? 1
                : 0,
          attributes: {
            'gen_ai.tool.call.id': call.id ?? call.toolCallId ?? call.tool_call_id,
            'tool.name': call.name ?? call.function?.name,
            'tool.arguments': sanitizeToolBody(
              call.input ?? call.arguments ?? call.function?.arguments,
            ),
            'tool.output': sanitizeToolBody(call.output ?? call.result),
          },
        }))
        .filter((span) => {
          const key = toolCallKey(span);
          for (const index of key === undefined ? [] : (tracedCalls.get(key) ?? [])) {
            const completed = completeToolSpan(spans[index], span);
            if (completed) {
              spans[index] = completed;
              return false;
            }
          }
          return true;
        });
      trace = {
        ...trace,
        traceId: trace?.traceId ?? 'provider-tools',
        spans: [...spans, ...nativeSpans],
      };
    }
  }
  return trace;
}
