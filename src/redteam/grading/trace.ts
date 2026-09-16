import { isDeepStrictEqual } from 'node:util';

import {
  getConsistentToolBody,
  getConsistentToolName,
  TraceEvidenceError,
} from '../../assertions/trajectoryUtils';
import { sanitizeBody } from '../../tracing/genaiTracer';
import {
  getToolArgumentAttributeKeys,
  TOOL_NAME_ATTRIBUTE_KEYS,
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

function getToolCallId(values: unknown[]): string | undefined {
  let id: string | undefined;
  for (const value of values) {
    if (value === undefined) {
      continue;
    }
    if (typeof value !== 'string' || !value.trim()) {
      throw new TraceEvidenceError('Invalid tool call ID alias.');
    }
    if (id !== undefined && id !== value) {
      throw new TraceEvidenceError('Conflicting tool call ID aliases.');
    }
    id = value;
  }
  return id;
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
  if (
    getConsistentToolName(TOOL_NAME_ATTRIBUTE_KEYS.map((key) => traced.attributes?.[key])) !==
    getConsistentToolName(TOOL_NAME_ATTRIBUTE_KEYS.map((key) => native.attributes?.[key]))
  ) {
    throw new TraceEvidenceError('Conflicting native and traced tool names.');
  }
  const attributes = { ...traced.attributes };
  for (const [keys, nativeKeys] of [
    [
      getToolArgumentAttributeKeys(traced.attributes),
      getToolArgumentAttributeKeys(native.attributes),
    ],
    [TOOL_RESULT_ATTRIBUTE_KEYS, TOOL_RESULT_ATTRIBUTE_KEYS],
  ]) {
    const nativeKey = nativeKeys.find((key) => native.attributes?.[key] != null);
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
    const toolName = getConsistentToolName([metadata?.toolName, raw?.toolName, raw?.tool]);
    const input = getConsistentToolBody([metadata?.toolArgs, raw?.args, raw?.arguments]);
    const output =
      getConsistentToolBody([raw?.structuredContent, raw?.result]) ??
      (raw?.content === undefined ? undefined : raw);
    if (typeof toolName === 'string') {
      calls.push({
        id: getToolCallId([metadata?.toolCallId, raw?.toolCallId, raw?.tool_call_id]),
        name: toolName,
        input,
        output,
        is_error: raw?.is_error,
        isError: raw?.isError,
        error: response.error || raw?.error,
      });
    }
    if (calls.length) {
      const spans = [...(trace?.spans ?? [])];
      const tracedCalls = new Map<string, number[]>();
      spans.forEach((span, index) => {
        const key = getToolCallId([
          span.attributes?.['gen_ai.tool.call.id'],
          span.attributes?.['tool.call.id'],
          span.attributes?.['tool_call_id'],
        ]);
        if (key !== undefined) {
          const indices = tracedCalls.get(key) ?? [];
          indices.push(index);
          tracedCalls.set(key, indices);
        }
      });
      const nativeSpans: TraceData['spans'] = [];
      const nativeCalls = new Map<string, TraceData['spans'][number]>();
      for (const [index, call] of calls.entries()) {
        const name = getConsistentToolName([call?.name, call?.function?.name]);
        if (!call || typeof call !== 'object' || Array.isArray(call) || name === undefined) {
          throw new TraceEvidenceError(
            'Invalid native tool receipt: expected an object with a tool name.',
          );
        }
        const errors = [call.is_error, call.isError].filter((value) => value !== undefined);
        if (call.error !== undefined && call.error !== null && call.error !== '') {
          errors.push(typeof call.error === 'boolean' ? call.error : true);
        }
        if (errors.some((value) => typeof value !== 'boolean')) {
          throw new TraceEvidenceError('Invalid native tool outcome alias.');
        }
        if (errors.some((value) => value !== errors[0])) {
          throw new TraceEvidenceError('Conflicting native tool outcome aliases.');
        }
        const key = getToolCallId([call.id, call.toolCallId, call.tool_call_id]);
        const span = {
          spanId: `provider-tool-${index}`,
          name: 'tool.call',
          startTime: index,
          statusCode: errors[0]
            ? 2
            : call.output !== undefined || call.result !== undefined
              ? 1
              : 0,
          attributes: {
            'gen_ai.tool.call.id': key,
            'tool.name': name,
            'tool.arguments': sanitizeNativeToolBody(
              getConsistentToolBody([call.input, call.arguments, call.function?.arguments]),
            ),
            'tool.output': sanitizeNativeToolBody(
              getConsistentToolBody([call.output, call.result]),
            ),
          },
        };
        if (key !== undefined) {
          const previous = nativeCalls.get(key);
          if (previous) {
            if (
              previous.statusCode !== span.statusCode ||
              !isDeepStrictEqual(previous.attributes, span.attributes)
            ) {
              throw new TraceEvidenceError('Conflicting native tool receipts for one call ID.');
            }
            continue;
          }
          nativeCalls.set(key, span);
        }
        const matching = key === undefined ? [] : (tracedCalls.get(key) ?? []);
        for (const index of matching) {
          spans[index] = completeToolSpan(spans[index], span);
        }
        if (matching.length === 0) {
          nativeSpans.push(span);
        }
      }
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
