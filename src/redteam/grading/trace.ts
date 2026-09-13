import type { TraceData } from '../../types/tracing';
import type { RedteamGradingContext } from './types';

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
  if (!trace && response) {
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
      trace = {
        traceId: 'provider-tools',
        spans: calls.map((call, index) => ({
          spanId: `provider-tool-${index}`,
          name: 'tool.call',
          startTime: index,
          statusCode: call.is_error || call.error || call.isError ? 2 : 1,
          attributes: {
            'tool.name': call.name,
            'tool.arguments': call.input ?? call.arguments,
            'tool.output': call.output ?? call.result,
          },
        })),
      };
    }
  }
  return trace;
}
