import {
  getFirstStringAttribute,
  getToolNameFromAttributes,
  TOOL_ARGUMENT_ATTRIBUTE_KEYS,
} from '../../tracing/toolAttributes';

import type { TraceData } from '../../types/tracing';
import type { RedteamGradingContext } from './types';

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
  const input = TOOL_ARGUMENT_ATTRIBUTE_KEYS.map((key) => attributes?.[key]).find(
    (value) => value !== undefined,
  );
  return JSON.stringify([
    id,
    getToolNameFromAttributes(attributes),
    ...[input, attributes?.['tool.output']].map((value) =>
      typeof value === 'string' ? value : JSON.stringify(value),
    ),
    span.statusCode,
  ]);
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
      const tracedCalls = new Set(trace?.spans.map(toolCallKey));
      trace = {
        ...trace,
        traceId: trace?.traceId ?? 'provider-tools',
        spans: [
          ...(trace?.spans ?? []),
          ...calls
            .map((call, index) => ({
              spanId: `provider-tool-${index}`,
              name: 'tool.call',
              startTime: index,
              statusCode: call.is_error || call.error || call.isError ? 2 : 1,
              attributes: {
                'gen_ai.tool.call.id': call.id ?? call.toolCallId ?? call.tool_call_id,
                'tool.name': call.name ?? call.function?.name,
                'tool.arguments': call.input ?? call.arguments ?? call.function?.arguments,
                'tool.output': call.output ?? call.result,
              },
            }))
            .filter((span) => {
              const key = toolCallKey(span);
              return key === undefined || !tracedCalls.has(key);
            }),
        ],
      };
    }
  }
  return trace;
}
