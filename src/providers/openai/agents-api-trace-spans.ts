import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import { z } from 'zod';
import cliState from '../../cliState';
import { sanitizeTraceAttributes } from '../../tracing/sanitizeAttributes';
import { getNormalizedToolAttributes } from '../../tracing/toolAttributes';
import { looksLikeSecret, sanitizeObject } from '../../util/sanitizer';
import { hasSensitiveOpenAiCacheString } from './util';

import type { SpanData } from '../../tracing/store';

const MAX_SPANS = 1_000;
const MAX_ARGUMENT_BYTES = 64 * 1024;
const nanos = z.union([z.string().regex(/^\d{1,20}$/), z.number().int().nonnegative().safe()]);
const wireSpan = z.object({
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().nullish(),
  startTimeUnixNano: nanos,
  endTimeUnixNano: nanos,
  attributes: z
    .array(z.object({ key: z.string(), value: z.record(z.string(), z.unknown()) }))
    .optional(),
  status: z.object({ code: z.union([z.number(), z.string()]).optional() }).nullish(),
});
const completion = z.object({
  status: z.enum(['complete', 'partial', 'incomplete']),
  missing_outputs: z.array(z.unknown()).optional(),
  ordering_issues: z.array(z.unknown()).optional(),
});

function invalid(): never {
  // Wire values can include credentials. Never echo them in diagnostics.
  throw new Error('Invalid hosted OTLP trace');
}

function isComplete(wire: z.infer<typeof wireSpan>): boolean {
  const marker = wire.attributes?.find(
    ({ key }) => key === 'openai.managed_agents.trace.completeness',
  );
  // Some otherwise well-formed exports (including delegated turns) have no attestation.
  if (!marker) {
    return false;
  }
  const value = marker.value.stringValue;
  if (typeof value !== 'string') {
    invalid();
  }
  try {
    const info = completion.parse(JSON.parse(value));
    return (
      info.status === 'complete' &&
      info.missing_outputs?.length === 0 &&
      info.ordering_issues?.length === 0
    );
  } catch {
    return invalid();
  }
}

/** OTLP JSON uses hex. Protobuf JSON serializers can emit these IDs as base64. */
function decodeId(value: string, bytes: number): string {
  if (value.length === bytes * 2 && /^[a-f\d]+$/i.test(value)) {
    return value.toLowerCase();
  }
  if (value.length > 4 * Math.ceil(bytes / 3)) {
    invalid();
  }
  const decoded = Buffer.from(value, 'base64');
  const canonical = decoded.toString('base64');
  if (decoded.length !== bytes || (value !== canonical && value !== canonical.replace(/=+$/, ''))) {
    invalid();
  }
  return decoded.toString('hex');
}

type Redact = (text: string) => string;
interface ImportPolicy {
  parentSpanId: string;
  includeToolArguments: boolean;
  redact: Redact;
  redactAttributes: string[];
}

function protectsKey(keys: string[], policy: ImportPolicy): boolean {
  return policy.redactAttributes.some((pattern) => keys.some((key) => key.includes(pattern)));
}

// Keep wire spelling for exact attribute filters only when every token survives parsing.
// In particular, JSON.parse silently discards duplicate keys and rounds large integers.
function roundTrips(raw: string, value: unknown): boolean {
  const canonical = JSON.stringify(value);
  if (raw === canonical) {
    return true;
  }
  // JSON.stringify normalizes string escapes and removes insignificant whitespace.
  const normalized = raw.replace(/"(?:[^"\\]|\\.)*"|\s+/g, (part) =>
    part.startsWith('"') ? JSON.stringify(JSON.parse(part)) : '',
  );
  return normalized === canonical;
}

function sensitiveText(value: string, policy: ImportPolicy): boolean {
  return (
    policy.redact(value) !== value ||
    hasSensitiveOpenAiCacheString(value) ||
    /:\/\/[^\s"'<>/@]+@/.test(value)
  );
}

// Decode JSON-valued strings only for inspection. Persist the original argument type and text.
function inspectArgument(value: unknown, policy: ImportPolicy, depth = 0): unknown {
  if (depth > 16) {
    invalid();
  }
  if (Array.isArray(value)) {
    return value.map((item) => inspectArgument(item, policy, depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        if (sensitiveText(key, policy) || protectsKey([key.toLowerCase()], policy)) {
          invalid();
        }
        return [key, inspectArgument(item, policy, depth + 1)];
      }),
    );
  }
  if (typeof value !== 'string') {
    return value;
  }
  if (sensitiveText(value, policy)) {
    invalid();
  }
  if (/^\s*[[{"]/.test(value)) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(value);
    } catch {
      return value;
    }
    if (!roundTrips(value, decoded)) {
      invalid();
    }
    return inspectArgument(decoded, policy, depth + 1);
  }
  return value;
}

function canStoreArgument(value: unknown, policy: ImportPolicy): boolean {
  try {
    const inspected = { '': inspectArgument(value, policy) };
    const filtered = sanitizeTraceAttributes(inspected, {
      redactAttributes: policy.redactAttributes,
      truncateValues: false,
    });
    return isDeepStrictEqual(
      inspected,
      sanitizeObject(filtered, { sanitizeUrls: true, throwOnError: true }),
    );
  } catch {
    return false;
  }
}

function toolAttributes(
  name: string,
  value: Record<string, unknown> | undefined,
  policy: ImportPolicy,
): Record<string, unknown> {
  const identity = getNormalizedToolAttributes(name);
  const argsKey = 'gen_ai.tool.call.arguments';
  if (!policy.includeToolArguments || !value || protectsKey([argsKey, 'tool.arguments'], policy)) {
    return identity;
  }
  const unavailable = { ...identity, 'promptfoo.tool.arguments_redacted': true };
  const raw = value.stringValue;
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_ARGUMENT_BYTES) {
    return unavailable;
  }
  try {
    const args: unknown = JSON.parse(raw);
    if (args === null || !roundTrips(raw, args)) {
      return unavailable;
    }
    // A scrubbed value is unsuitable as evidence. For objects we can still grade
    // unchanged sibling parameters when, for example, a command contained credentials.
    let captured = args;
    if (typeof args === 'object' && !Array.isArray(args)) {
      captured = Object.fromEntries(
        Object.entries(args).filter(([key, item]) => canStoreArgument({ [key]: item }, policy)),
      );
    } else if (!canStoreArgument(args, policy)) {
      return unavailable;
    }
    const intact = isDeepStrictEqual(captured, args);
    const json = intact ? raw : JSON.stringify(captured);
    if (policy.redact(json) !== json) {
      return unavailable;
    }
    return {
      ...getNormalizedToolAttributes(name, json),
      [argsKey]: json,
      ...(!intact && { 'promptfoo.tool.arguments_redacted': true }),
    };
  } catch {
    return unavailable;
  }
}

function safeIdentifier(value: unknown, redact: (text: string) => string): value is string {
  return (
    typeof value === 'string' &&
    /^[\w.:-]{1,256}$/.test(value) &&
    !looksLikeSecret(value) &&
    redact(value) === value
  );
}

function statusCode(code: number | string = 0): number {
  switch (code) {
    case 0:
    case '0':
    case 'UNSET':
    case 'STATUS_CODE_UNSET':
      return 0;
    case 1:
    case '1':
    case 'OK':
    case 'STATUS_CODE_OK':
      return 1;
    case 2:
    case '2':
    case 'ERROR':
    case 'STATUS_CODE_ERROR':
      return 2;
    default:
      return invalid();
  }
}

function normalizeSpan(wire: z.infer<typeof wireSpan>, policy: ImportPolicy): SpanData {
  const spanId = decodeId(wire.spanId, 8);
  const parent = wire.parentSpanId ? decodeId(wire.parentSpanId, 8) : undefined;
  const parentSpanId = parent && !/^0+$/.test(parent) ? parent : undefined;
  const start = BigInt(wire.startTimeUnixNano);
  const end = BigInt(wire.endTimeUnixNano);
  if (/^0+$/.test(spanId) || !start || end < start || end > 0xffffffffffffffffn) {
    invalid();
  }
  const attrs = new Map(wire.attributes?.map(({ key, value }) => [key, value]));
  if (attrs.size !== (wire.attributes?.length ?? 0)) {
    invalid();
  }
  const operation = attrs.get('gen_ai.operation.name')?.stringValue;
  if (operation !== 'execute_tool' && operation !== 'invoke_agent' && operation !== 'chat') {
    // Fail closed if the API introduces new kinds of tool telemetry.
    invalid();
  }
  if (!parentSpanId && operation !== 'invoke_agent') {
    invalid();
  }
  let name: string = operation;
  const attributes: Record<string, unknown> = {
    'promptfoo.openai.hosted_trace': policy.parentSpanId,
    'gen_ai.provider.name': 'openai',
    'gen_ai.operation.name': operation,
  };
  if (operation === 'execute_tool') {
    const tool = attrs.get('gen_ai.tool.name')?.stringValue;
    if (!safeIdentifier(tool, policy.redact)) {
      invalid();
    }
    Object.assign(
      attributes,
      toolAttributes(tool, attrs.get('gen_ai.tool.call.arguments'), policy),
    );
    name = `execute_tool ${tool}`;
  } else {
    const model = attrs.get('gen_ai.request.model')?.stringValue;
    if (safeIdentifier(model, policy.redact)) {
      attributes['gen_ai.request.model'] = model;
      if (operation === 'chat') {
        name = `chat ${model}`;
      }
    }
  }
  // Identity attributes also appear in span names and aliases. Withhold the trace
  // when the eval's policy suppresses one so absence checks cannot silently pass.
  if (
    protectsKey(
      Object.keys(attributes).filter((key) => key !== 'tool.arguments'),
      policy,
    )
  ) {
    invalid();
  }
  return {
    spanId,
    parentSpanId,
    name,
    attributes,
    statusCode: statusCode(wire.status?.code),
    startTime: Number(start) / 1e6,
    endTime: Number(end) / 1e6,
  };
}

function validateTree(nodes: Map<string, SpanData>): void {
  if ([...nodes.values()].filter((s) => !s.parentSpanId).length !== 1) {
    invalid();
  }
  const verified = new Set<string>();
  for (const id of nodes.keys()) {
    let cursor: string | undefined = id;
    const path = new Set<string>();
    while (cursor && !verified.has(cursor)) {
      if (!nodes.has(cursor) || path.has(cursor)) {
        invalid();
      }
      path.add(cursor);
      cursor = nodes.get(cursor)?.parentSpanId;
    }
    for (const ancestor of path) {
      verified.add(ancestor);
    }
  }
}

function collection(value: unknown, key: string): unknown[] {
  const list = value && typeof value === 'object' ? Reflect.get(value, key) : undefined;
  if (!Array.isArray(list) || list.length > MAX_SPANS) {
    invalid();
  }
  return list;
}

function* readSpans(otlp: unknown) {
  // Bound collections before schema validation; malformed entries must not cause an
  // unbounded allocation of validation errors for a large but byte-limited response.
  let count = 0;
  for (const resource of collection(otlp, 'resourceSpans')) {
    for (const scope of collection(resource, 'scopeSpans')) {
      for (const value of collection(scope, 'spans')) {
        if (++count > MAX_SPANS || !value || typeof value !== 'object') {
          invalid();
        }
        if ('attributes' in value) {
          collection(value, 'attributes');
        }
        const parsed = wireSpan.safeParse(value);
        if (!parsed.success) {
          invalid();
        }
        yield parsed.data;
      }
    }
  }
}

/** Import a published turn beneath its local provider span. Persist only grading metadata. */
export function normalizeHostedTrace(
  otlp: unknown,
  parentSpanId: string,
  includeToolArguments: boolean,
  redact: Redact = (text) => text,
  traceRedactAttributes: string[] = [],
): { spans: SpanData[]; complete: boolean } {
  if (!/^(?!0+$)[a-f\d]{16}$/i.test(parentSpanId)) {
    invalid();
  }
  const policy = {
    parentSpanId,
    includeToolArguments,
    redact,
    redactAttributes: [
      ...traceRedactAttributes,
      ...(cliState.requestTracingConfig?.otlp?.http?.redactAttributes ?? []),
    ]
      .map((s) => s.toLowerCase().trim())
      .filter(Boolean),
  };
  const nodes = new Map<string, SpanData>();
  let nativeTraceId: string | undefined;
  let complete = false;
  for (const wire of readSpans(otlp)) {
    const traceId = decodeId(wire.traceId, 16);
    const node = normalizeSpan(wire, policy);
    if (
      nodes.has(node.spanId) ||
      /^0+$/.test(traceId) ||
      (nativeTraceId && traceId !== nativeTraceId)
    ) {
      invalid();
    }
    if (!node.parentSpanId) {
      complete = isComplete(wire);
    }
    nativeTraceId = traceId;
    nodes.set(node.spanId, node);
  }
  if (nodes.size === 0) {
    return { spans: [], complete: false };
  }
  validateTree(nodes);
  // The same remote turn imported in two calls must never share local span IDs.
  const localId = (id: string) =>
    createHash('sha256')
      .update(`${parentSpanId}:${nativeTraceId}:${id}`)
      .digest('hex')
      .slice(0, 16);
  const spans = [...nodes.values()].map((node) => ({
    ...node,
    spanId: localId(node.spanId),
    parentSpanId: node.parentSpanId ? localId(node.parentSpanId) : parentSpanId,
  }));
  return { spans, complete };
}
