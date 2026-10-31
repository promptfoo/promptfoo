import { createHash } from 'node:crypto';

import { tokenizer, tokTypes } from 'acorn';
import { z } from 'zod';
import cliState from '../../cliState';
import { isSensitiveTraceAttribute } from '../../tracing/sanitizeAttributes';
import {
  HOSTED_ERROR_STATUS_COMPLETE,
  HOSTED_ERROR_STATUS_VERSION,
  isSpanError,
} from '../../tracing/spanError';
import {
  HOSTED_ABSENT_TOOL_ATTRIBUTES,
  HOSTED_CHAT_MODEL_ABSENT,
  hasUncertainHostedChatName,
} from '../../tracing/spanFilter';
import { HOSTED_DURATION_NS, HOSTED_START_TIME_OFFSET_NS } from '../../tracing/spanTiming';
import { getNormalizedToolAttributes } from '../../tracing/toolAttributes';
import { isCredentialHeader, isSecretEnvVarName, looksLikeSecret } from '../../util/sanitizer';
import { hasRecognizableOpenAiCredential, hasSensitiveOpenAiCacheString } from './util';

import type { SpanData } from '../../tracing/store';

const MAX_SPANS = 1_000;
const MAX_ARGUMENT_BYTES = 64 * 1024;
// Snapshot-wide limits keep synchronous inspection bounded across tools.
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
  droppedEventsCount: wireAttributes.shape.droppedAttributesCount,
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().nullish(),
  kind: z.union([z.number(), z.string()]).nullish(),
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
class UnpublishedTraceParentError extends Error {}

function invalid(): never {
  // Wire values can include credentials. Never echo them in diagnostics.
  throw new Error('Invalid hosted OTLP trace');
}

function validInt64(value: unknown): boolean {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value);
  }
  if (typeof value !== 'string' || !/^-?\d{1,19}$/.test(value)) {
    return false;
  }
  const integer = BigInt(value);
  return integer >= -(2n ** 63n) && integer < 2n ** 63n;
}

const scalarWireTypes = new Map<string, z.ZodType>([
  ['stringValue', z.string()],
  ['boolValue', z.boolean()],
  ['intValue', z.custom(validInt64)],
  ['doubleValue', z.union([z.number(), z.enum(['NaN', 'Infinity', '-Infinity'])])],
  [
    'bytesValue',
    z.string().regex(/^(?:[a-z\d+/_-]{4})*(?:[a-z\d+/_-]{2}(?:==)?|[a-z\d+/_-]{3}=?)?$/i),
  ],
]);

// Validate only values used as evidence or for redaction. Inspect compounds iteratively
// so an untrusted nested diagnostic cannot overflow the stack or exhaust the grading budget.
function isValidWireValue(value: unknown): boolean {
  const pending = [value];
  let remaining = MAX_TRACE_ARGUMENT_VALUES;
  while (pending.length) {
    const item = pending.pop();
    if (!item || typeof item !== 'object' || Array.isArray(item) || --remaining < 0) {
      return false;
    }
    const entries = Object.entries(item);
    if (!entries.length) {
      continue; // OTLP permits an empty AnyValue.
    }
    if (entries.length !== 1) {
      return false;
    }
    const [[type, data]] = entries;
    const scalar = scalarWireTypes.get(type);
    if (scalar) {
      if (!scalar.safeParse(data).success) {
        return false;
      }
      continue;
    }
    if (
      (type !== 'arrayValue' && type !== 'kvlistValue') ||
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data) ||
      Object.keys(data).some((key) => key !== 'values')
    ) {
      return false;
    }
    const children = data.values ?? [];
    if (!Array.isArray(children) || children.length > remaining - pending.length) {
      return false;
    }
    if (type === 'arrayValue') {
      pending.push(...children);
    } else {
      const keys = new Set<string>();
      for (const pair of children) {
        if (!pair || typeof pair.key !== 'string' || keys.has(pair.key)) {
          return false;
        }
        keys.add(pair.key);
        pending.push(pair.value);
      }
    }
  }
  return true;
}

function wireString(value: Record<string, unknown> | undefined): string | undefined {
  return value && typeof value.stringValue === 'string' && Object.keys(value).length === 1
    ? value.stringValue
    : undefined;
}

function isComplete(wire: z.infer<typeof wireSpan>): boolean {
  const marker = wire.attributes?.find(
    ({ key }) => key === 'openai.managed_agents.trace.completeness',
  );
  // Some otherwise well-formed exports (including delegated turns) have no attestation.
  if (!marker) {
    return false;
  }
  const value = wireString(marker.value);
  if (typeof value !== 'string') {
    invalid();
  }
  try {
    const parsed = JSON.parse(value);
    // A duplicate status or issue list disappears during JSON.parse. Verify the
    // source before granting evidence for the absence of any calls.
    if (!roundTrips(value, parsed, { argumentValuesLeft: MAX_TRACE_ARGUMENT_VALUES })) {
      invalid();
    }
    const info = completion.parse(parsed);
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
  const paddedLength = 4 * Math.ceil(bytes / 3);
  if (value.length > paddedLength) {
    invalid();
  }
  const decoded = Buffer.from(value, 'base64');
  const encoding = /[-_]/.test(value) ? 'base64url' : 'base64';
  const canonical = decoded.toString(encoding).replace(/=+$/, '');
  if (
    decoded.length !== bytes ||
    (value !== canonical && value !== canonical.padEnd(paddedLength, '='))
  ) {
    invalid();
  }
  return decoded.toString('hex');
}

type Redact = (text: string) => string;
interface ImportPolicy {
  parentSpanId: string;
  redact: Redact;
  redactAttributes: string[];
  echoesProtectedValue: (text: string) => boolean;
  errorValues: WeakMap<object, { valid: boolean; httpStatus?: number; hasErrorType?: boolean }>;
  argumentBytesLeft: number;
  argumentValuesLeft: number;
}

type WireValue = {
  arrayValue?: { values?: WireValue[] };
  kvlistValue?: { values?: { key: string; value: WireValue }[] };
} & Record<string, unknown>;

function protectsKey(keys: string[], policy: ImportPolicy): boolean {
  return policy.redactAttributes.some((pattern) => keys.some((key) => key.includes(pattern)));
}

// This guard is shared with the JSON preflight. A credential field must contain one
// of these role words after normalization, even if punctuation splits the field name.
function mayNameCredential(text: string): boolean {
  return /auth|bearer|cert|cookie|cred|dsn|honeycomb|jwt|key|pass|pfx|pwd|secret|session|sig|token/.test(
    text.toLowerCase().replace(/[^a-z0-9]/g, ''),
  );
}

function isHostedCredentialField(key: string): boolean {
  return (
    mayNameCredential(key) &&
    isSensitiveTraceAttribute(key, (name) => {
      const leaf = name.slice(name.lastIndexOf('.') + 1);
      return isCredentialHeader(leaf, '') || isSecretEnvVarName(leaf);
    })
  );
}

// Decode JSON escapes for the same name guard. Built-in rules need not parse a large
// or malformed argument when the source cannot spell a credential field in the first place.
function mayContainCredentialField(raw: string, consumeToken: () => void): boolean {
  if (!raw.includes('\\') && !mayNameCredential(raw)) {
    return false;
  }
  if (raw.length > MAX_ARGUMENT_BYTES) {
    return true;
  }
  // Inspect the decoded token before each colon. Values such as {"cmd":"pwd"}
  // do not declare a credential, and escaped or overwritten keys still do.
  let key: string | undefined;
  try {
    JSON.parse(raw); // Only tokenize JSON, never arbitrary JavaScript.
    for (const token of tokenizer(raw, { ecmaVersion: 2022 })) {
      consumeToken();
      if (token.type === tokTypes.colon && key !== undefined && isHostedCredentialField(key)) {
        return true;
      }
      key =
        token.type === tokTypes.string && 'value' in token && typeof token.value === 'string'
          ? token.value
          : undefined;
    }
    return false;
  } catch {
    return true;
  }
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

function roundTrips(
  raw: string,
  value: unknown,
  policy: Pick<ImportPolicy, 'argumentValuesLeft'>,
): boolean {
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

// Collect leaves from every OTLP attribute carrier before projecting any span.
// Protobuf field names and JSON object keys are labels, not protected values.
function protectedEchoMatcher(policy: ImportPolicy) {
  const needles = new Set<string>();
  let nodesLeft = 32_768;
  let needleBytes = 0;
  // Bound both key matching and repeated searches in otherwise safe retained fields.
  let workLeft = 8 * 1024 * 1024;
  const chargeSearch = (text: string, count: number) => {
    workLeft -= (1 + text.length) * count;
    if (workLeft < 0) {
      invalid();
    }
  };
  const protectedKey = (key: string) => {
    chargeSearch(key, 1 + policy.redactAttributes.length);
    return protectsKey([key.toLowerCase()], policy) || isHostedCredentialField(key);
  };
  function visit(depth: number) {
    if (--nodesLeft < 0 || depth > 32) {
      invalid();
    }
  }
  function isStructuredJson(text: string): boolean {
    return /^\s*["[{]/.test(text);
  }
  function inspectJson(raw: string, hidden: boolean, depth: number) {
    if (!reserveArgumentJson(raw, policy)) {
      invalid();
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!roundTrips(raw, parsed, policy)) {
        invalid();
      }
      jsonLeaves(parsed, hidden, depth);
    } catch {
      invalid();
    }
  }
  function remember(value: unknown, depth: number) {
    if (value === null || value === undefined || value === '') {
      return;
    }
    const text = String(value);
    if (!needles.has(text)) {
      if (
        text.length > MAX_ARGUMENT_BYTES ||
        (needleBytes += Buffer.byteLength(text)) > MAX_ARGUMENT_BYTES ||
        needles.size >= 128
      ) {
        invalid();
      }
      needles.add(text);
      // A protected OTLP or JSON string may itself encode structured data. Inspect
      // it once, preserving the original text and charging the shared JSON budgets.
      if (typeof value === 'string' && isStructuredJson(text)) {
        inspectJson(text, true, depth + 1);
      }
      // The credential alone can appear in a tool or model name.
      const auth = /^(?:Bearer|Basic|Token|Api[-_]?Key)[ \t]+(\S+)$/i.exec(text.trim());
      if (auth) {
        remember(auth[1], depth);
      }
    }
  }
  function jsonLeaves(value: unknown, hidden: boolean, depth: number): void {
    visit(depth);
    if (Array.isArray(value)) {
      for (const item of value) {
        jsonLeaves(item, hidden, depth + 1);
      }
    } else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        jsonLeaves(item, hidden || protectedKey(key), depth + 1);
      }
    } else if (hidden) {
      remember(value, depth);
    }
  }
  function wireLeaves(value: WireValue, hidden: boolean, depth: number): void {
    visit(depth);
    if (value.arrayValue) {
      for (const item of value.arrayValue.values ?? []) {
        wireLeaves(item, hidden, depth + 1);
      }
    }
    if (value.kvlistValue) {
      for (const entry of value.kvlistValue.values ?? []) {
        const childHidden = hidden || protectedKey(entry.key);
        if (!hidden && childHidden && !isValidWireValue(entry.value)) {
          invalid();
        }
        wireLeaves(entry.value, childHidden, depth + 1);
      }
    } else if (hidden && !value.arrayValue) {
      // Byte sequences have no unique textual interpretation for matching echoes.
      if (value.bytesValue !== undefined) {
        invalid();
      }
      remember(value.stringValue ?? value.boolValue ?? value.doubleValue ?? value.intValue, depth);
      if (typeof value.intValue === 'string') {
        // Protobuf JSON accepts integer strings with leading zeros or a negative zero.
        remember(BigInt(value.intValue).toString(), depth);
      }
    }
  }
  function collectAttribute(key: string, value: WireValue) {
    const alias = key.toLowerCase();
    const args = alias === 'gen_ai.tool.call.arguments' || alias === 'tool.arguments';
    const hidden =
      protectedKey(key) ||
      (args && protectsKey(['tool.arguments', 'gen_ai.tool.call.arguments'], policy));
    if ((hidden || policy.redactAttributes.length > 0) && !isValidWireValue(value)) {
      invalid();
    }
    wireLeaves(value, hidden, 0);
    if (args && typeof value.stringValue === 'string') {
      const raw = value.stringValue;
      if (hidden && isStructuredJson(raw)) {
        return; // Already inspected as a protected leaf.
      }
      if (!hidden && !policy.redactAttributes.length) {
        chargeSearch(raw, 1);
        if (!mayContainCredentialField(raw, () => visit(0))) {
          return;
        }
      }
      inspectJson(raw, hidden, 0);
    }
  }
  function collect(attributes: z.infer<typeof attributeList> | undefined) {
    visit(0); // Charge empty carriers too.
    for (const { key, value } of attributes ?? []) {
      collectAttribute(key, value);
    }
  }
  function matches(text: string) {
    chargeSearch(text, needles.size);
    for (const needle of needles) {
      if (text.includes(needle)) {
        return true;
      }
    }
    return false;
  }
  return { collect, matches };
}

// A credential can follow a named component in a namespaced identifier.
function hasProtectedComponent(value: string, policy: ImportPolicy): boolean {
  const components = value.split(/[:/]/);
  const protectedLabel = (label: string) =>
    protectsKey([label.toLowerCase()], policy) || isHostedCredentialField(label);
  let checked = 0;
  return components.some((component, index) => {
    if (index < components.length - 1 && protectedLabel(component)) {
      return true;
    }
    if (!policy.redactAttributes.length && !mayNameCredential(component)) {
      return false;
    }
    // The value of a labelled identifier can contain its own separators. Bound prefix
    // checks even for paths with many components and an active custom redaction policy.
    for (const separator of component.matchAll(/[._-]+/g)) {
      if (separator.index > 0 && separator.index + separator[0].length < component.length) {
        if (++checked > 32 || protectedLabel(component.slice(0, separator.index))) {
          return true;
        }
      }
    }
    return false;
  });
}

function canRetainText(
  text: string,
  policy: ImportPolicy,
  isSensitive = hasSensitiveOpenAiCacheString,
): boolean {
  return !policy.echoesProtectedValue(text) && policy.redact(text) === text && !isSensitive(text);
}

// A namespace or file extension can surround a base64url token. Keep hyphens and
// underscores inside each component so a token cannot hide behind its own separators.
function hasOpaqueIdentifierComponent(value: string): boolean {
  return value.split(/[.:/]/).some(
    (part) =>
      looksLikeSecret(part) &&
      // Some dated model slugs exceed the opaque-token threshold using descriptive words.
      !/^(?:[a-z]{1,16}-){2,}\d{4}-\d{2}-\d{2}(?:-\d{1,8})?$/.test(part),
  );
}

function safeIdentifier(value: unknown, policy: ImportPolicy): value is string {
  return (
    typeof value === 'string' &&
    /^[\w.:-]{1,256}$/.test(value) &&
    !hasOpaqueIdentifierComponent(value) &&
    !hasProtectedComponent(value, policy) &&
    canRetainText(value, policy)
  );
}

function safeModelIdentifier(value: unknown, policy: ImportPolicy): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 256 &&
    /^(?:[\w.:-]+\/)*[\w.:-]+$/.test(value) &&
    !hasOpaqueIdentifierComponent(value) &&
    !hasProtectedComponent(value, policy) &&
    canRetainText(value, policy, hasRecognizableOpenAiCredential)
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

type HostedResource = { attributes: ReturnType<typeof attributeMap>; dropped: boolean };

function normalizeNonToolSpan(
  operation: 'chat' | 'invoke_agent',
  attrs: ReturnType<typeof attributeMap>,
  resource: HostedResource,
  spanDropped: boolean,
  policy: ImportPolicy,
) {
  const attributes: Record<string, unknown> = {};
  const intact = !spanDropped && !resource.dropped;
  // Non-tool spans can carry raw tool fields. Record their verified absence without
  // copying discarded values or making this span look like a tool trajectory step.
  if (intact && !protectsKey([HOSTED_ABSENT_TOOL_ATTRIBUTES], policy)) {
    const keys = ['gen_ai.tool.name', 'tool.name', 'gen_ai.tool.call.arguments', 'tool.arguments'];
    attributes[HOSTED_ABSENT_TOOL_ATTRIBUTES] = keys.filter(
      (key) => !attrs.has(key) && !resource.attributes.has(key) && !protectsKey([key], policy),
    );
  }
  // A dropped span attribute might have overridden a model set on the OTLP resource.
  const model =
    attrs.get('gen_ai.request.model') ??
    (!spanDropped && resource.attributes.get('gen_ai.request.model'));
  if (model) {
    const modelName = wireString(model);
    if (!safeModelIdentifier(modelName, policy)) {
      invalid();
    }
    attributes['gen_ai.request.model'] = modelName;
    return { name: operation === 'chat' ? `chat ${modelName}` : operation, attributes };
  }
  if (operation === 'chat' && intact) {
    attributes[HOSTED_CHAT_MODEL_ABSENT] = true;
  }
  return { name: operation, attributes };
}

function checkedErrorValue(value: Record<string, unknown>, policy: ImportPolicy) {
  let checked = policy.errorValues.get(value);
  if (!checked) {
    checked = { valid: isValidWireValue(value) };
    policy.errorValues.set(value, checked);
  }
  return checked;
}

// OTLP JSON exporters use integers or enum names for span kinds.
const http4xxFailure = new Map([
  ['2', false],
  ['SERVER', false],
  ['SPAN_KIND_SERVER', false],
  ['3', true],
  ['CLIENT', true],
  ['SPAN_KIND_CLIENT', true],
]);

// Both names may be emitted during an HTTP semantic-convention migration.
function hostedHttpFailure(
  wire: z.infer<typeof wireSpan>,
  attrs: ReturnType<typeof attributeMap>,
  resource: HostedResource,
  policy: ImportPolicy,
): boolean | undefined {
  const keys = ['http.response.status_code', 'http.status_code'];
  const source =
    wire.droppedAttributesCount || keys.some((key) => attrs.has(key)) ? attrs : resource.attributes;
  const dropped = source === attrs ? wire.droppedAttributesCount : resource.dropped;
  if (dropped && !keys.every((key) => source.has(key))) {
    // A missing alias could contradict the observed status on the same carrier.
    return undefined;
  }
  const verdicts = new Set<boolean | undefined>();
  for (const key of keys) {
    const value = source.get(key);
    if (!value) {
      continue;
    }
    // A resource may supply a very long decimal string to every span in the artifact.
    const checked = checkedErrorValue(value, policy);
    const scalar = value.stringValue ?? value.intValue ?? value.doubleValue;
    checked.httpStatus ??=
      checked.valid &&
      (typeof scalar === 'number' || (typeof scalar === 'string' && /^\s*\d+\s*$/.test(scalar)))
        ? Number(scalar)
        : Number.NaN;
    const code = checked.httpStatus;
    if (!Number.isInteger(code) || (code !== 0 && (code < 100 || code > 599))) {
      return undefined;
    }
    const failed = code >= 400 && code < 500 ? http4xxFailure.get(String(wire.kind)) : code >= 500;
    verdicts.add(failed);
  }
  return verdicts.size > 1 || verdicts.has(undefined) ? undefined : verdicts.has(true);
}

function normalizeSpan(
  wire: z.infer<typeof wireSpan>,
  policy: ImportPolicy,
  resource: HostedResource,
  eventFailure: boolean | undefined,
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
  const operation = wireString(attrs.get('gen_ai.operation.name'));
  if (operation !== 'execute_tool' && operation !== 'invoke_agent' && operation !== 'chat') {
    // Fail closed if the API introduces new kinds of tool telemetry.
    invalid();
  }
  if (!parentSpanId && operation !== 'invoke_agent') {
    invalid();
  }
  let name: string;
  const attributes: Record<string, unknown> = {
    'promptfoo.openai.hosted_trace': policy.parentSpanId,
    [HOSTED_DURATION_NS]: (end - start).toString(),
    'gen_ai.provider.name': 'openai',
    'gen_ai.operation.name': operation,
  };
  // Millisecond numbers can round nearby native starts to the same instant.
  const startTime = Number(start) / 1e6;
  const offsetNs: bigint = start - BigInt(Math.round(startTime * 1e6));
  if (offsetNs !== 0n) {
    attributes[HOSTED_START_TIME_OFFSET_NS] = Number(offsetNs);
  }
  if (operation === 'execute_tool') {
    const tool = wireString(attrs.get('gen_ai.tool.name'));
    if (!safeIdentifier(tool, policy)) {
      invalid();
    }
    Object.assign(attributes, getNormalizedToolAttributes(tool));
    name = `execute_tool ${tool}`;
  } else {
    const span = normalizeNonToolSpan(
      operation,
      attrs,
      resource,
      !!wire.droppedAttributesCount,
      policy,
    );
    name = span.name;
    Object.assign(attributes, span.attributes);
  }
  // Identity attributes also appear in span names and aliases. Withhold the trace
  // when the eval's policy suppresses one so absence checks cannot silently pass.
  if (protectsKey(Object.keys(attributes), policy)) {
    invalid();
  }
  // Preserve the same error verdict as an ordinary span without storing tool diagnostics.
  const code = statusCode(wire.status?.code);
  const httpFailure = hostedHttpFailure(wire, attrs, resource, policy);
  let validErrorAttributes = httpFailure !== undefined && eventFailure !== undefined;
  const failed = isSpanError(
    code,
    wire.status?.message ?? undefined,
    (key) => {
      // OTLP span attributes override resource defaults. A dropped span attribute may
      // have overridden that default, so only intact inheritance is evidence.
      const value =
        attrs.get(key) ?? (wire.droppedAttributesCount ? undefined : resource.attributes.get(key));
      if (!value) {
        return undefined;
      }
      // Every span in a resource can inherit the same compound diagnostic.
      const checked = checkedErrorValue(value, policy);
      if (!checked.valid) {
        validErrorAttributes = false;
        return undefined;
      }
      if (key === 'error.type') {
        checked.hasErrorType ??=
          typeof value.stringValue === 'string' && /\S/.test(value.stringValue);
        if (!checked.hasErrorType) {
          validErrorAttributes = false;
          return undefined;
        }
        return 'error';
      }
      return (
        value.stringValue ??
        value.boolValue ??
        value.doubleValue ??
        (value.intValue === undefined
          ? (value.kvlistValue ?? value.arrayValue)
          : Number(value.intValue))
      );
    },
    httpFailure === true,
  );
  const observedFailure = failed || eventFailure === true;
  if (!protectsKey([HOSTED_ERROR_STATUS_COMPLETE], policy)) {
    attributes[HOSTED_ERROR_STATUS_COMPLETE] =
      observedFailure || (validErrorAttributes && !wire.droppedAttributesCount && !resource.dropped)
        ? HOSTED_ERROR_STATUS_VERSION
        : false;
  }
  return {
    spanId,
    parentSpanId,
    name,
    attributes,
    statusCode: observedFailure ? 2 : code,
    startTime,
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

function wireField(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid();
  }
  return Reflect.get(value, key);
}

function collection(value: unknown, key: string): unknown[] {
  const list = wireField(value, key);
  // ProtoJSON omits empty repeated fields, including the span list in an empty scope.
  if (list === undefined) {
    return [];
  }
  if (!Array.isArray(list) || list.length > MAX_SPANS) {
    invalid();
  }
  return list;
}

function readAttributes(source: unknown) {
  collection(source, 'attributes');
  const parsed = wireAttributes.safeParse(source);
  return parsed.success ? parsed.data : invalid();
}

// Only the failure verdict is retained. Exception messages and stacks can contain secrets.
function isExceptionFailure(
  name: unknown,
  event: z.infer<typeof wireAttributes>,
): boolean | undefined {
  if (typeof name !== 'string' || !name.trim()) {
    return undefined;
  }
  if (name !== 'exception') {
    return false;
  }
  const escaped = attributeMap(event.attributes).get('exception.escaped');
  if (!escaped) {
    // Older exporters may record handled exceptions with exception.escaped=false.
    return event.droppedAttributesCount ? undefined : true;
  }
  return Object.keys(escaped).length === 1 && typeof escaped.boolValue === 'boolean'
    ? escaped.boolValue
    : undefined;
}

function collectSpanEvidence(
  value: unknown,
  wire: z.infer<typeof wireSpan>,
  echoes: ReturnType<typeof protectedEchoMatcher>,
): boolean | undefined {
  echoes.collect(wire.attributes);
  let eventFailure: boolean | undefined = wire.droppedEventsCount ? undefined : false;
  for (const event of collection(value, 'events')) {
    const eventAttrs = readAttributes(event);
    echoes.collect(eventAttrs.attributes);
    const observed = isExceptionFailure(wireField(event, 'name'), eventAttrs);
    if (eventFailure !== true && observed !== false) {
      eventFailure = observed;
    }
  }
  for (const link of collection(value, 'links')) {
    echoes.collect(readAttributes(link).attributes);
  }
  return eventFailure;
}

function* readSpans(otlp: unknown, echoes: ReturnType<typeof protectedEchoMatcher>) {
  // Bound collections before schema validation; malformed entries must not cause an
  // unbounded allocation of validation errors for a large but byte-limited response.
  let count = 0;
  for (const group of collection(otlp, 'resourceSpans')) {
    const parsedResource = readAttributes(wireField(group, 'resource') ?? {});
    echoes.collect(parsedResource.attributes);
    const resource = {
      attributes: attributeMap(parsedResource.attributes),
      dropped: !!parsedResource.droppedAttributesCount,
    };
    for (const scope of collection(group, 'scopeSpans')) {
      echoes.collect(readAttributes(wireField(scope, 'scope') ?? {}).attributes);
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
        const eventFailure = collectSpanEvidence(value, parsed.data, echoes);
        yield { wire: parsed.data, resource, eventFailure };
      }
    }
  }
}

/** Import a published turn beneath its local provider span. Persist only grading metadata. */
export function normalizeHostedTrace(
  otlp: unknown,
  parentSpanId: string,
  redact: Redact = (text) => text,
  traceRedactAttributes: string[] = [],
): { spans: SpanData[]; complete: boolean } {
  if (!/^(?!0+$)[a-f\d]{16}$/i.test(parentSpanId)) {
    invalid();
  }
  const policy: ImportPolicy = {
    parentSpanId,
    argumentBytesLeft: MAX_TRACE_ARGUMENT_BYTES,
    argumentValuesLeft: MAX_TRACE_ARGUMENT_VALUES,
    redact,
    echoesProtectedValue: () => false,
    errorValues: new WeakMap(),
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
  const echoes = protectedEchoMatcher(policy);
  const records = [...readSpans(otlp, echoes)];
  policy.echoesProtectedValue = echoes.matches;
  for (const { wire, resource, eventFailure } of records) {
    const traceId = decodeId(wire.traceId, 16);
    const node = normalizeSpan(wire, policy, resource, eventFailure);
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
  return { spans, complete: complete && !spans.some(hasUncertainHostedChatName) };
}
