import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import { tokenizer, tokTypes } from 'acorn';
import { z } from 'zod';
import cliState from '../../cliState';
import { sanitizeTraceAttributes } from '../../tracing/sanitizeAttributes';
import { HOSTED_ERROR_STATUS_COMPLETE, isSpanError } from '../../tracing/spanError';
import { getNormalizedToolAttributes } from '../../tracing/toolAttributes';
import { isCredentialHeader, isSecretEnvVarName, sanitizeObject } from '../../util/sanitizer';
import { hasRecognizableOpenAiCredential, hasSensitiveOpenAiCacheString } from './util';

import type { SpanData } from '../../tracing/store';

const MAX_SPANS = 1_000;
const MAX_ARGUMENT_BYTES = 64 * 1024;
// Snapshot-wide limits keep synchronous inspection bounded across tools and JSON-encoded values.
const MAX_TRACE_ARGUMENT_BYTES = 256 * 1024;
const MAX_TRACE_ARGUMENT_VALUES = 4_096;
const nanos = z.union([z.string().regex(/^\d{1,20}$/), z.number().int().nonnegative().safe()]);
const attributeList = z.array(
  z.object({ key: z.string(), value: z.record(z.string(), z.unknown()) }),
);
const wireAttributes = z.object({
  attributes: attributeList.optional(),
  droppedAttributesCount: z
    .union([
      z.number(),
      z
        .string()
        .regex(/^\d{1,10}$/)
        .transform(Number),
    ])
    .pipe(z.number().int().min(0).max(0xffffffff))
    .nullish(),
});
const wireSpan = wireAttributes.extend({
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().nullish(),
  startTimeUnixNano: nanos,
  endTimeUnixNano: nanos,
  status: z
    .object({
      code: z.union([z.number(), z.string()]).optional(),
      message: z.string().nullish(),
    })
    .nullish(),
});
const completion = z.object({
  status: z.enum(['complete', 'partial', 'incomplete']),
  missing_outputs: z.array(z.unknown()).optional(),
  ordering_issues: z.array(z.unknown()).optional(),
});

/** The exporter can publish children before publishing their parent. */
export class UnpublishedTraceParentError extends Error {}

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
  argumentBytesLeft: number;
  argumentValuesLeft: number;
}

function protectsKey(keys: string[], policy: ImportPolicy): boolean {
  return policy.redactAttributes.some((pattern) => keys.some((key) => key.includes(pattern)));
}

// Acorn returns unsigned number tokens. Compare their decimal digits and scale so
// 1.0 and 1e0 match 1, while a fraction rounded by JSON.parse remains unavailable.
function decimalSpelling(literal: string): string {
  const [mantissa, exponent = '0'] = literal.toLowerCase().split('e');
  const [integer, fraction = ''] = mantissa.split('.');
  const digits = (integer + fraction).replace(/^0+/, '');
  if (!digits) {
    return '0';
  }
  let end = digits.length;
  while (digits[end - 1] === '0') {
    end--;
  }
  return `${digits.slice(0, end)}e${Number(exponent) - fraction.length + digits.length - end}`;
}

function reserveArgumentJson(raw: string, policy: ImportPolicy): boolean {
  const limit = Math.min(MAX_ARGUMENT_BYTES, policy.argumentBytesLeft);
  if (policy.argumentValuesLeft < 1 || raw.length > limit) {
    return false;
  }
  const bytes = Buffer.byteLength(raw);
  if (bytes > limit) {
    return false;
  }
  policy.argumentBytesLeft -= bytes;
  policy.argumentValuesLeft--; // The root value. Charge each container's children in roundTrips.
  return true;
}

function roundTrips(raw: string, value: unknown, policy: ImportPolicy): boolean {
  let members = 0;
  let safeNumbers = true;
  const canonical = JSON.stringify(value, (_key, item) => {
    if (item && typeof item === 'object') {
      const children = Array.isArray(item) ? item.length : Object.keys(item).length;
      if (children > policy.argumentValuesLeft) {
        invalid();
      }
      policy.argumentValuesLeft -= children;
      if (!Array.isArray(item)) {
        members += children;
      }
    } else if (
      typeof item === 'number' &&
      (!Number.isFinite(item) || (Number.isInteger(item) && !Number.isSafeInteger(item)))
    ) {
      safeNumbers = false;
    }
    return item;
  });
  if (!safeNumbers || raw === canonical) {
    return safeNumbers;
  }

  // The input already passed JSON.parse. Every overwritten key removes at least one
  // member; integer-key reordering, string escaping, and whitespace preserve the count.
  for (const token of tokenizer(raw, { ecmaVersion: 2022 })) {
    if (token.type === tokTypes.colon) {
      members--;
    } else if (token.type === tokTypes.num) {
      const literal = raw.slice(token.start, token.end);
      if (decimalSpelling(literal) !== decimalSpelling(String(Number(literal)))) {
        return false;
      }
    }
  }
  return members === 0;
}

function protectsValueName(name: string, policy: ImportPolicy, header: boolean): boolean {
  return (
    protectsKey([name.toLowerCase()], policy) ||
    (header ? isCredentialHeader(name, '') : isSecretEnvVarName(name.replace(/-/g, '_')))
  );
}

// Some tools receive environment entries or headers as { name, value } or { key, value }.
function protectsPairValue(record: object, policy: ImportPolicy): boolean {
  return (
    Object.prototype.hasOwnProperty.call(record, 'value') &&
    ['name', 'key'].some((key) => {
      const field = Reflect.get(record, key);
      return (
        typeof field === 'string' &&
        (protectsValueName(field, policy, false) ||
          // A bare uppercase env name such as MONKEY can end in KEY without naming a key.
          (!/^[A-Z]+KEY$/.test(field) && isCredentialHeader(field, '')))
      );
    })
  );
}

// Inspect names at token boundaries, so a long token without a delimiter is scanned once.
// This also catches quoted JSON keys in a command body and credential options in argv arrays.
function hasProtectedAssignment(value: string, policy: ImportPolicy): boolean {
  const fields = value.matchAll(
    /(?<![\w.-])(?:(--[\w.-]+)(?=(?:\\*["'])?(?:\s|$))|([\w.-]+)(\\*["'])?\s*([:=])(?=\s*\S))/g,
  );
  for (const [, flag, field, quote, separator] of fields) {
    const name = (flag ?? field).replace(/^--/, '');
    const header = separator === ':' && (!quote || name.includes('-'));
    if (protectsValueName(name, policy, header)) {
      return true;
    }
  }
  return false;
}

function sensitiveText(value: string, policy: ImportPolicy): boolean {
  return (
    policy.redact(value) !== value ||
    hasProtectedAssignment(value, policy) ||
    hasSensitiveOpenAiCacheString(value) ||
    /:\/\/[^\s"'<>/@]+@/.test(value)
  );
}

const COMMAND_FIELDS = new Set(['cmd', 'command', 'commands', 'argv', 'script', 'shell_command']);
const SHELL_TOOLS = new Set(['command_execution', 'exec_command', 'local_shell', 'shell']);
const INSPECTION_FLAGS = new Map([
  ['pwd', /^-[LP]$/],
  ['ls', /^-[aAhl1]+$/],
  ['cat', /^-[bn]+$/],
  ['wc', /^-[clmw]+$/],
  ['head', /^-(?:[nc]\d*|\d+)$/],
  ['tail', /^-(?:[nc]\d*|\d+)$/],
]);
const BIN_PREFIX = /^\/(?:usr\/)?bin\//;

// Keep filenames available to grading without interpreting arbitrary shell, flag values or scripts.
function isInspectionCommand(value: unknown): boolean {
  let words: string[];
  if (typeof value === 'string') {
    const text = value.trim();
    const wrapper = /^(?:\/(?:usr\/)?bin\/)?(?:bash|sh)[ \t]+-l?c[ \t]+(['"])([^\r\n]*)\1$/.exec(
      text,
    );
    words = (wrapper?.[2] ?? text).split(/[ \t]+/);
  } else if (Array.isArray(value) && value.every((word) => typeof word === 'string')) {
    if (
      value.length === 3 &&
      /^(?:\/(?:usr\/)?bin\/)?(?:bash|sh)$/.test(value[0]) &&
      /^-l?c$/.test(value[1])
    ) {
      words = value[2].trim().split(/[ \t]+/);
    } else {
      words = value;
    }
  } else {
    return false;
  }
  const command = words[0]?.replace(BIN_PREFIX, '');
  const flags = INSPECTION_FLAGS.get(command);
  if (!flags) {
    return false;
  }
  let needsCount = false;
  for (const word of words.slice(1)) {
    if (needsCount) {
      if (!/^\d+$/.test(word)) {
        return false;
      }
      needsCount = false;
    } else if ((command === 'head' || command === 'tail') && /^-[nc]$/.test(word)) {
      needsCount = true;
    } else if (
      word !== '--' &&
      !flags.test(word) &&
      (command === 'pwd' || !/^[\p{L}\p{N}_./][\p{L}\p{N}_./-]*$/u.test(word))
    ) {
      return false;
    }
  }
  return !needsCount;
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
    if (protectsPairValue(value, policy)) {
      invalid();
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        const field = key.toLowerCase();
        if (
          sensitiveText(key, policy) ||
          (field === 'key'
            ? protectsKey([field], policy)
            : protectsValueName(key, policy, false)) ||
          (COMMAND_FIELDS.has(field) &&
            !(field === 'commands' && Array.isArray(item)
              ? item.every(isInspectionCommand)
              : isInspectionCommand(item)))
        ) {
          invalid();
        }
        return [key, inspectArgument(item, policy, depth + 1)];
      }),
    );
  }
  if (typeof value !== 'string') {
    // The sanitizer JSON-serializes its input and would turn -0 into +0.
    return Object.is(value, -0) ? 0 : value;
  }
  if (sensitiveText(value, policy)) {
    invalid();
  }
  if (/^\s*[[{"]/.test(value)) {
    if (!reserveArgumentJson(value, policy)) {
      invalid();
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(value);
    } catch {
      return value;
    }
    if (!roundTrips(value, decoded, policy)) {
      invalid();
    }
    return inspectArgument(decoded, policy, depth + 1);
  }
  return value;
}

function sanitizeArgumentProjection(value: unknown, policy: ImportPolicy): unknown {
  const filtered = sanitizeTraceAttributes(
    { '': value },
    {
      redactAttributes: policy.redactAttributes,
      truncateValues: false,
    },
  );
  return sanitizeObject(filtered, { sanitizeUrls: true, throwOnError: true })[''];
}

function captureObjectArguments(args: object, policy: ImportPolicy): object {
  const protectedValue = protectsPairValue(args, policy);
  const inspected = new Map<string, unknown>();
  for (const [key, item] of Object.entries(args)) {
    if (protectedValue && key === 'value') {
      continue;
    }
    try {
      const field = inspectArgument({ [key]: item }, policy) as Record<string, unknown>;
      inspected.set(key, field[key]);
    } catch {
      // Withhold this whole field. Its unchanged siblings can still support a subset assertion.
    }
  }
  // Run the shared sanitizers once, then compare fields so their replacements never become evidence.
  const sanitized = sanitizeArgumentProjection(Object.fromEntries(inspected), policy);
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) {
    invalid();
  }
  return Object.fromEntries(
    Object.entries(args).filter(
      ([key]) =>
        inspected.has(key) &&
        Object.prototype.hasOwnProperty.call(sanitized, key) &&
        isDeepStrictEqual(inspected.get(key), Reflect.get(sanitized, key)),
    ),
  );
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
  if (typeof raw !== 'string' || !reserveArgumentJson(raw, policy)) {
    return unavailable;
  }
  try {
    const args: unknown = JSON.parse(raw);
    if (args === null || !roundTrips(raw, args, policy)) {
      return unavailable;
    }
    // A scrubbed value is unsuitable as evidence. For objects we can still grade
    // unchanged sibling parameters when, for example, a command contained credentials.
    let captured = args;
    if (typeof args === 'object' && !Array.isArray(args)) {
      captured = captureObjectArguments(args, policy);
    } else {
      if (SHELL_TOOLS.has(name) && !isInspectionCommand(args)) {
        return unavailable;
      }
      const inspected = inspectArgument(args, policy);
      if (!isDeepStrictEqual(inspected, sanitizeArgumentProjection(inspected, policy))) {
        return unavailable;
      }
    }
    const intact = isDeepStrictEqual(captured, args);
    if (!intact && typeof captured === 'object') {
      // Retained fields now need fresh JSON. Omit a field if serializing it would
      // change the evidence, for example a nested -0 that JSON.stringify writes as 0.
      captured = Object.fromEntries(
        Object.entries(captured).filter(([, item]) =>
          isDeepStrictEqual(item, JSON.parse(JSON.stringify(item))),
        ),
      );
    }
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

function safeIdentifier(value: unknown, policy: ImportPolicy): value is string {
  return (
    typeof value === 'string' && /^[\w.:-]{1,256}$/.test(value) && !sensitiveText(value, policy)
  );
}

function safeModelIdentifier(value: unknown, policy: ImportPolicy): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 256 &&
    /^(?:[\w.:-]+\/)*[\w.:-]+$/.test(value) &&
    policy.redact(value) === value &&
    !hasProtectedAssignment(value, policy) &&
    !hasRecognizableOpenAiCredential(value) &&
    // Preserve dated, fine-tuned and namespaced IDs. A single long opaque token is ambiguous.
    !/(?:^|\/)[a-z\d_]{64,}(?:\/|$)/i.test(value)
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

function attributeMap(attributes: z.infer<typeof attributeList> | undefined) {
  const result = new Map(attributes?.map(({ key, value }) => [key, value]));
  if (result.size !== (attributes?.length ?? 0)) {
    invalid();
  }
  return result;
}

function normalizeSpan(
  wire: z.infer<typeof wireSpan>,
  policy: ImportPolicy,
  resource: { attributes: ReturnType<typeof attributeMap>; dropped: boolean },
): SpanData {
  const spanId = decodeId(wire.spanId, 8);
  const parent = wire.parentSpanId ? decodeId(wire.parentSpanId, 8) : undefined;
  const parentSpanId = parent && !/^0+$/.test(parent) ? parent : undefined;
  const start = BigInt(wire.startTimeUnixNano);
  const end = BigInt(wire.endTimeUnixNano);
  if (/^0+$/.test(spanId) || !start || end < start || end > 0xffffffffffffffffn) {
    invalid();
  }
  const attrs = attributeMap(wire.attributes);
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
    if (!safeIdentifier(tool, policy)) {
      invalid();
    }
    Object.assign(
      attributes,
      toolAttributes(tool, attrs.get('gen_ai.tool.call.arguments'), policy),
    );
    name = `execute_tool ${tool}`;
  } else {
    const model = attrs.get('gen_ai.request.model');
    if (model) {
      if (!safeModelIdentifier(model.stringValue, policy)) {
        invalid();
      }
      attributes['gen_ai.request.model'] = model.stringValue;
      if (operation === 'chat') {
        name = `chat ${model.stringValue}`;
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
  // Preserve the same error verdict as an ordinary span without storing tool diagnostics.
  const code = statusCode(wire.status?.code);
  const failed = isSpanError(code, wire.status?.message ?? undefined, (key) => {
    // OTLP span attributes override resource defaults. A dropped span attribute may
    // have overridden that default, so only intact inheritance is evidence.
    const value =
      attrs.get(key) ?? (wire.droppedAttributesCount ? undefined : resource.attributes.get(key));
    if (!value) {
      return undefined;
    }
    if (key === 'http.status_code' && (value.kvlistValue || value.arrayValue)) {
      // A compound HTTP status cannot establish a numeric status code.
      return invalid();
    }
    return (
      value.stringValue ??
      value.boolValue ??
      value.doubleValue ??
      (value.intValue === undefined
        ? (value.kvlistValue ?? value.arrayValue)
        : Number(value.intValue))
    );
  });
  if (!protectsKey([HOSTED_ERROR_STATUS_COMPLETE], policy)) {
    attributes[HOSTED_ERROR_STATUS_COMPLETE] =
      failed || (!wire.droppedAttributesCount && !resource.dropped);
  }
  return {
    spanId,
    parentSpanId,
    name,
    attributes,
    statusCode: failed ? 2 : code,
    startTime: Number(start) / 1e6,
    endTime: Number(end) / 1e6,
  };
}

function validateTree(nodes: Map<string, SpanData>): void {
  if ([...nodes.values()].filter((s) => !s.parentSpanId).length > 1) {
    invalid();
  }
  const visited = new Set<string>();
  let missingParent = false;
  for (const id of nodes.keys()) {
    let cursor: string | undefined = id;
    const path = new Set<string>();
    while (cursor && !visited.has(cursor)) {
      if (path.has(cursor)) {
        invalid();
      }
      const span = nodes.get(cursor);
      if (!span) {
        missingParent = true;
        break;
      }
      path.add(cursor);
      cursor = span.parentSpanId;
    }
    for (const ancestor of path) {
      visited.add(ancestor);
    }
  }
  if (missingParent) {
    throw new UnpublishedTraceParentError('Hosted trace parent not published');
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
  for (const group of collection(otlp, 'resourceSpans')) {
    const data =
      group && typeof group === 'object' && 'resource' in group ? group.resource : undefined;
    if (data && typeof data === 'object' && 'attributes' in data) {
      collection(data, 'attributes');
    }
    const parsedResource = wireAttributes.safeParse(data ?? {});
    if (!parsedResource.success) {
      invalid();
    }
    const resource = {
      attributes: attributeMap(parsedResource.data.attributes),
      dropped: !!parsedResource.data.droppedAttributesCount,
    };
    for (const scope of collection(group, 'scopeSpans')) {
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
        yield { wire: parsed.data, resource };
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
    argumentBytesLeft: MAX_TRACE_ARGUMENT_BYTES,
    argumentValuesLeft: MAX_TRACE_ARGUMENT_VALUES,
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
  for (const { wire, resource } of readSpans(otlp)) {
    const traceId = decodeId(wire.traceId, 16);
    const node = normalizeSpan(wire, policy, resource);
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
