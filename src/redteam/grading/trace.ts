import { isDeepStrictEqual } from 'node:util';

import { TraceEvidenceError } from '../../assertions/trajectoryUtils';
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

function sanitizeNativeToolBody(value: unknown): unknown {
  const body = sanitizeToolBody(value);
  if (body === undefined) {
    return undefined;
  }
  try {
    // Keep fields available for configured redaction before deriving SQL and commands.
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function toolBodiesMatch(partial: string, complete: string | undefined): boolean {
  if (partial === complete) {
    return true;
  }
  if (complete === undefined) {
    return false;
  }
  try {
    return isDeepStrictEqual(JSON.parse(partial), JSON.parse(complete));
  } catch {
    return false;
  }
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
  return JSON.stringify([id, getToolNameFromAttributes(attributes)]);
}

function completeToolSpan(
  traced: TraceData['spans'][number],
  native: TraceData['spans'][number],
): TraceData['spans'][number] {
  if (
    traced.attributes?.['tool.incomplete'] !== true &&
    traced.statusCode &&
    native.statusCode &&
    traced.statusCode !== native.statusCode
  ) {
    throw new TraceEvidenceError('Conflicting native and traced tool outcomes.');
  }
  const attributes = { ...traced.attributes };
  for (const keys of [TOOL_ARGUMENT_ATTRIBUTE_KEYS, TOOL_RESULT_ATTRIBUTE_KEYS]) {
    const nativeKey = keys.find((key) => native.attributes?.[key] != null);
    if (!nativeKey) {
      continue;
    }
    const nativeBody = native.attributes![nativeKey];
    const complete = sanitizeToolBody(nativeBody);
    // Claude tool spans cap bodies at 4 KiB; the native receipt retains the full body.
    const suffix = '... [truncated]';
    for (const key of keys) {
      const value = traced.attributes?.[key];
      if (value == null) {
        continue;
      }
      const partial = sanitizeToolBody(value);
      if (
        partial !== undefined &&
        !toolBodiesMatch(partial, complete) &&
        (!partial.endsWith(suffix) || !complete?.startsWith(partial.slice(0, -suffix.length)))
      ) {
        throw new TraceEvidenceError('Conflicting native and traced tool arguments or results.');
      }
    }
    const existingKeys = keys.filter((key) => attributes[key] != null);
    for (const key of existingKeys.length ? existingKeys : [nativeKey]) {
      attributes[key] = nativeBody;
    }
  }
  return {
    ...traced,
    attributes,
    statusCode:
      native.statusCode && (traced.attributes?.['tool.incomplete'] === true || !traced.statusCode)
        ? native.statusCode
        : traced.statusCode,
  };
}

export function getGradingTrace(
  gradingContext?: RedteamGradingContext,
  requireCurrentEvidence = false,
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
        .map((call, index) => {
          if (
            !call ||
            typeof call !== 'object' ||
            Array.isArray(call) ||
            typeof (call.name ?? call.function?.name) !== 'string'
          ) {
            throw new TraceEvidenceError(
              'Invalid native tool receipt: expected an object with a tool name.',
            );
          }
          return {
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
              'tool.arguments': sanitizeNativeToolBody(
                call.input ?? call.arguments ?? call.function?.arguments,
              ),
              'tool.output': sanitizeNativeToolBody(call.output ?? call.result),
            },
          };
        })
        .filter((span) => {
          const key = toolCallKey(span);
          const matching = key === undefined ? [] : (tracedCalls.get(key) ?? []);
          for (const index of matching) {
            spans[index] = completeToolSpan(spans[index], span);
          }
          return matching.length === 0;
        });
      trace = {
        ...trace,
        traceId: trace?.traceId ?? 'provider-tools',
        spans: [...spans, ...nativeSpans],
      };
    }
  }
  if (response?.cached && (requireCurrentEvidence || trace)) {
    throw new TraceEvidenceError(
      'Cached responses cannot provide current execution trace evidence; rerun with --no-cache',
    );
  }
  return trace;
}
