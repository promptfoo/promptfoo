import { getGraderOwnedSpanIds } from '../tracing/spanFilter';
import { TEST_CASE_SPAN_NAME } from '../tracing/spanRoles';
import { COMMAND_ATTRIBUTE_KEYS, TOOL_ARGUMENT_ATTRIBUTE_KEYS } from '../tracing/toolAttributes';
import { matchesPattern } from './traceUtils';

import type { AssertionParams, AssertionType, AssertionValue } from '../types/index';
import type { TraceSpan } from '../types/tracing';

const ARGUMENT_FILTER_KEYS = new Set<string>([
  ...COMMAND_ATTRIBUTE_KEYS,
  ...TOOL_ARGUMENT_ATTRIBUTE_KEYS,
]);

// The importer defines these attributes on normalized spans; argument coverage is checked
// separately below. Other wire attributes can be discarded, including tool results.
const NORMALIZED_HOSTED_ATTRIBUTES = new Set([
  'gen_ai.operation.name',
  'gen_ai.provider.name',
  'gen_ai.tool.name',
  'gen_ai.tool.call.arguments',
  'tool.name',
  'tool.arguments',
  'promptfoo.openai.hosted_trace',
  'promptfoo.tool.arguments_redacted',
]);

/** The hosted importer writes JSON text. Exported or redacted text must still parse as JSON. */
export function getHostedToolArguments(attributes: Record<string, unknown>): unknown {
  const json = attributes['tool.arguments'];
  const native = attributes['gen_ai.tool.call.arguments'];
  if (
    typeof json !== 'string' ||
    ((native !== undefined || attributes['promptfoo.tool.arguments_redacted']) && native !== json)
  ) {
    // Older imports only have tool.arguments. Their redacted values did not preserve
    // which fields were original, so even a positive match cannot rely on them.
    return undefined;
  }
  try {
    return JSON.parse(json) ?? undefined;
  } catch {
    return undefined;
  }
}

function isCommandMatcher(value: unknown): boolean {
  if (!value || typeof value !== 'object' || !('type' in value)) {
    return false;
  }
  return value.type === 'command' || (Array.isArray(value.type) && value.type.includes('command'));
}

function provesObservedTool(type: AssertionType, value: AssertionValue | undefined): boolean {
  if (type === 'trajectory:tool-args-match') {
    return true;
  }
  if (type !== 'trajectory:tool-used') {
    return false;
  }
  if (typeof value === 'string' || Array.isArray(value)) {
    return true;
  }
  return (
    !!value &&
    typeof value === 'object' &&
    !('max' in value) &&
    (!('min' in value) || (typeof value.min === 'number' && value.min > 0))
  );
}

function getLocalAncestors(spans: TraceSpan[], parentId: string) {
  const byId = new Map(spans.map((span) => [span.spanId, span]));
  const ancestors: TraceSpan[] = [];
  const seen = new Set<string>();
  let id: string | undefined = parentId;
  while (id && !seen.has(id)) {
    const span = byId.get(id);
    if (!span) {
      break;
    }
    seen.add(id);
    ancestors.push(span);
    id = span.parentSpanId;
  }
  return { spans: ancestors, unresolvedId: id };
}

function getArgumentCoverageError(
  { baseType, renderedValue: value, inverse }: AssertionParams,
  includeToolArguments: boolean,
): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  if (baseType === 'trajectory:tool-args-match') {
    // The matcher grades preserved fields and skips lossy candidates in exact mode.
    if (includeToolArguments && !inverse) {
      return undefined;
    }
  } else {
    const steps = Array.isArray(value) ? value : 'steps' in value ? value.steps : [value];
    const commandFilter =
      (baseType.startsWith('trajectory:') &&
        Array.isArray(steps) &&
        steps.some(isCommandMatcher)) ||
      (baseType === 'trajectory:step-count' &&
        !('type' in value) &&
        ('name' in value || 'pattern' in value));
    const attributeFilter =
      baseType.startsWith('trace-') &&
      'attributes' in value &&
      value.attributes &&
      typeof value.attributes === 'object' &&
      Object.keys(value.attributes).some((key) => ARGUMENT_FILTER_KEYS.has(key));
    if (!commandFilter && !attributeFilter) {
      return undefined;
    }
    if (
      !inverse &&
      baseType === 'trajectory:step-count' &&
      (includeToolArguments || !('type' in value)) &&
      'min' in value &&
      typeof value.min === 'number' &&
      value.min > 0 &&
      !('max' in value)
    ) {
      // Untyped patterns can match preserved span names even when arguments were never captured.
      return undefined;
    }
  }
  return includeToolArguments
    ? 'Some hosted tool arguments were unavailable or redacted. The trace cannot establish the requested argument check.'
    : 'The imported OpenAI Agents API trace excludes tool arguments. Enable includeToolArguments to grade this assertion.';
}

/** A generic target can share its trace with an OpenAI-hosted grader. */
function excludeHostedGraderEvidence({
  assertionValueContext,
  providerResponse,
}: AssertionParams): string | undefined {
  const trace = assertionValueContext.trace;
  if (!trace) {
    return undefined;
  }
  const hosted = trace.spans.filter(
    ({ attributes }) =>
      attributes?.['promptfoo.openai.hosted_trace_requested'] === true ||
      typeof attributes?.['promptfoo.openai.hosted_trace'] === 'string',
  );
  if (!hosted.length) {
    return undefined;
  }
  const graderSpans = getGraderOwnedSpanIds(trace.spans);
  if (
    !providerResponse.metadata?.hostedTrace &&
    hosted.some(
      ({ spanId, attributes }) =>
        attributes?.['promptfoo.openai.hosted_trace_requested'] === true &&
        !graderSpans.has(spanId),
    )
  ) {
    return 'The OpenAI Agents API trace capture metadata is unavailable for this assertion.';
  }
  const targetSpans = trace.spans.filter(({ spanId }) => !graderSpans.has(spanId));
  const targetIds = new Set(targetSpans.map(({ spanId }) => spanId));
  assertionValueContext.trace = {
    ...trace,
    spans: targetSpans.filter(({ attributes }) => {
      // Without its owning wrapper a detached native tool cannot be attributed to this target.
      const owner = attributes?.['promptfoo.openai.hosted_trace'];
      return typeof owner !== 'string' || targetIds.has(owner);
    }),
  };
  return undefined;
}

/** A wrapper span alone cannot establish that an action never occurred inside the hosted turn. */
export function prepareHostedTraceAssertion(params: AssertionParams): string | undefined {
  const { assertionValueContext, providerResponse, baseType, renderedValue, inverse } = params;
  if (!(baseType.startsWith('trajectory:') || baseType.startsWith('trace-'))) {
    return undefined;
  }
  const trace = assertionValueContext.trace;
  const hostedTrace = providerResponse.metadata?.hostedTrace;
  if (hostedTrace?.source !== 'openai:agents-api') {
    return excludeHostedGraderEvidence(params);
  }
  if (hostedTrace.status !== 'imported' && hostedTrace.status !== 'partial') {
    return 'The requested OpenAI Agents API trace was unavailable.';
  }
  const partial = hostedTrace.status === 'partial';
  if (partial && (inverse || !provesObservedTool(baseType, renderedValue))) {
    return 'The hosted trace is partial. It can only establish an observed tool call or matching arguments.';
  }
  const parentId = hostedTrace.parentSpanId;
  if (!trace || !parentId || !hostedTrace.spanCount) {
    return 'The imported OpenAI Agents API spans are unavailable for this assertion.';
  }
  const native = trace.spans.filter(
    (span) => span.attributes?.['promptfoo.openai.hosted_trace'] === parentId,
  );
  if (native.length !== hostedTrace.spanCount) {
    return 'The stored OpenAI Agents API spans are incomplete for this provider call.';
  }
  // Raw span assertions can inspect the local case/target/provider wrappers.
  // A sibling tool or grader in the same row cannot establish an action in this turn.
  const ancestors = baseType.startsWith('trace-')
    ? getLocalAncestors(trace.spans, parentId)
    : undefined;
  if (ancestors && !ancestors.spans.length) {
    return 'The local provider wrapper is missing from the stored OpenAI Agents API trace.';
  }
  assertionValueContext.trace = {
    ...trace,
    spans: ancestors ? [...native, ...ancestors.spans] : native,
  };
  const rawFilter =
    ancestors && renderedValue && typeof renderedValue === 'object' ? renderedValue : undefined;
  const attributeFilters =
    rawFilter && 'attributes' in rawFilter ? rawFilter.attributes : undefined;
  const pattern =
    rawFilter &&
    'pattern' in rawFilter &&
    typeof rawFilter.pattern === 'string' &&
    rawFilter.pattern
      ? rawFilter.pattern
      : '*';
  if (
    rawFilter &&
    baseType === 'trace-span-count' &&
    !inverse &&
    'min' in rawFilter &&
    typeof rawFilter.min === 'number' &&
    rawFilter.min > 0 &&
    !('max' in rawFilter)
  ) {
    // Missing spans or attributes can only raise this count. An exact raw argument
    // filter, however, must never count a truncated or partially redacted payload.
    if (
      attributeFilters &&
      Object.keys(attributeFilters).some((key) => ARGUMENT_FILTER_KEYS.has(key))
    ) {
      assertionValueContext.trace.spans = assertionValueContext.trace.spans.filter(
        ({ attributes }) =>
          !attributes ||
          attributes['promptfoo.openai.hosted_trace'] !== parentId ||
          (hostedTrace.includeToolArguments &&
            !attributes['promptfoo.tool.arguments_redacted'] &&
            getHostedToolArguments(attributes) !== undefined),
      );
    }
    return undefined;
  }
  if (
    ancestors?.unresolvedId &&
    !(
      attributeFilters &&
      typeof attributeFilters === 'object' &&
      'promptfoo.openai.hosted_trace' in attributeFilters &&
      attributeFilters['promptfoo.openai.hosted_trace'] === parentId
    ) &&
    (ancestors.unresolvedId !== trace.metadata?.testCaseSpanId ||
      matchesPattern(TEST_CASE_SPAN_NAME, pattern))
  ) {
    // The evaluator's case root remains open during live grading. Its recorded
    // identity lets a pattern excluding that name grade without waiting for itself.
    return 'A local ancestor is missing from the stored OpenAI Agents API trace.';
  }
  if (rawFilter && attributeFilters && typeof attributeFilters === 'object') {
    const candidates = native.filter((span) => matchesPattern(span.name, pattern));
    if (!candidates.length) {
      // This pattern only inspects local spans, which do not use the hosted projection.
      return undefined;
    }
    const keys = Object.keys(attributeFilters);
    if (
      keys.some(
        (key) =>
          !NORMALIZED_HOSTED_ATTRIBUTES.has(key) &&
          candidates.some(
            (span) => !Object.prototype.hasOwnProperty.call(span.attributes ?? {}, key),
          ),
      )
    ) {
      return 'A filtered attribute was not retained on the matching hosted spans. The trace cannot establish this assertion.';
    }
  }
  const coverageError = getArgumentCoverageError(params, hostedTrace.includeToolArguments);
  if (!coverageError) {
    return undefined;
  }
  // The row describes capture time. JSON export can truncate or redact a stored argument
  // without changing that row or the number of spans.
  const requiresNativeAlias =
    attributeFilters &&
    typeof attributeFilters === 'object' &&
    'gen_ai.tool.call.arguments' in attributeFilters;
  const complete =
    hostedTrace.includeToolArguments &&
    hostedTrace.toolArgumentsComplete === true &&
    native.every(({ attributes, name }) => {
      if (
        attributes?.['gen_ai.operation.name'] !== 'execute_tool' &&
        !name.startsWith('execute_tool ')
      ) {
        return true;
      }
      return (
        attributes &&
        !attributes['promptfoo.tool.arguments_redacted'] &&
        (!requiresNativeAlias || attributes['gen_ai.tool.call.arguments'] !== undefined) &&
        getHostedToolArguments(attributes) !== undefined
      );
    });
  return complete ? undefined : coverageError;
}
