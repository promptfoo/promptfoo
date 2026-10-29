import {
  isMissingTraceBodyUncertain,
  isUncertainTraceAttributeMatch,
} from '../tracing/sanitizeAttributes';
import {
  filterTargetSpans,
  HOSTED_ABSENT_TOOL_ATTRIBUTES,
  HOSTED_CHAT_MODEL_ABSENT,
  hasUncertainHostedChatName,
  withoutReceivedHostedOwner,
} from '../tracing/spanFilter';
import { SPAN_ROLE_ATTRIBUTE, TEST_CASE_SPAN_NAME } from '../tracing/spanRoles';
import { matchesPattern } from './traceUtils';

import type { AssertionParams } from '../types/index';
import type { TraceSpan } from '../types/tracing';

const ARGUMENT_FILTER_KEYS = new Set(['gen_ai.tool.call.arguments', 'tool.arguments']);

function isHostedToolSpan(span: TraceSpan): boolean {
  return (
    span.attributes?.['gen_ai.operation.name'] === 'execute_tool' ||
    span.name.startsWith('execute_tool ')
  );
}

function hasIntactArguments(attributes: TraceSpan['attributes']): boolean {
  const args = attributes?.['tool.arguments'];
  const native = attributes?.['gen_ai.tool.call.arguments'];
  if (
    attributes?.['promptfoo.tool.arguments_redacted'] ||
    typeof args !== 'string' ||
    (native !== undefined && native !== args)
  ) {
    return false;
  }
  // Old captures can lack the native alias. Both versions must still contain intact JSON.
  try {
    return JSON.parse(args) !== null;
  } catch {
    return false;
  }
}

function missingArgumentsReason(includeToolArguments: boolean): string {
  return includeToolArguments
    ? 'Some hosted tool arguments were unavailable or redacted. The trace cannot establish the requested argument check.'
    : 'The imported OpenAI Agents API trace excludes tool arguments. Enable includeToolArguments to grade this assertion.';
}

/** One definite mismatch rules out a span, regardless of unknown values for its other filters. */
function getRawFilterCoverageError(
  span: TraceSpan,
  filters: [string, unknown][],
  capture: {
    native: boolean;
    includeToolArguments: boolean;
    metadata?: Record<string, unknown>;
    uncertainName: boolean;
  },
): string | undefined {
  const attrs = span.attributes ?? {};
  const absentToolAttributes = attrs[HOSTED_ABSENT_TOOL_ATTRIBUTES];
  const tool = capture.native && isHostedToolSpan(span);
  let reason = capture.uncertainName
    ? 'A local span name may have been redacted before it was stored.'
    : undefined;
  for (const [key, expected] of filters) {
    if (!capture.native && isMissingTraceBodyUncertain(key, attrs, capture.metadata)) {
      reason ??= 'A local span body used by this filter may have been stripped from the export.';
    } else if (!capture.native && isUncertainTraceAttributeMatch(attrs[key], expected)) {
      reason ??= 'A local span attribute used by this filter may have been truncated or redacted.';
    } else if (
      ARGUMENT_FILTER_KEYS.has(key) &&
      tool &&
      (!capture.includeToolArguments || !hasIntactArguments(attrs) || attrs[key] === undefined)
    ) {
      reason = missingArgumentsReason(capture.includeToolArguments);
    } else if (Object.prototype.hasOwnProperty.call(attrs, key)) {
      if (attrs[key] !== expected) {
        return undefined;
      }
    } else if (
      !capture.native ||
      key === 'promptfoo.tool.arguments_redacted' ||
      (key === 'gen_ai.request.model' && attrs[HOSTED_CHAT_MODEL_ABSENT] === true) ||
      (!tool && Array.isArray(absentToolAttributes) && absentToolAttributes.includes(key))
    ) {
      // Missing local keys and known absences in the native projection rule out this span.
      return undefined;
    } else {
      reason ??=
        'A filtered attribute was not retained on the matching hosted spans. The trace cannot establish this assertion.';
    }
  }
  return reason;
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

function couldMatchTestCaseRoot(
  pattern: string,
  filters: unknown,
  attributeKeys: unknown,
): boolean {
  if (!matchesPattern(TEST_CASE_SPAN_NAME, pattern)) {
    return false;
  }
  if (!filters || typeof filters !== 'object') {
    return true;
  }
  if (!Array.isArray(attributeKeys) || !attributeKeys.includes(SPAN_ROLE_ATTRIBUTE)) {
    return true;
  }
  return Object.entries(filters).every(([key, value]) => {
    if (key === SPAN_ROLE_ATTRIBUTE) {
      return value === 'test_case';
    }
    return attributeKeys.includes(key);
  });
}

/** A generic target can share its trace with an OpenAI-hosted grader. */
function excludeHostedGraderEvidence({
  assertionValueContext,
}: AssertionParams): string | undefined {
  const trace = assertionValueContext.trace;
  if (!trace) {
    return undefined;
  }
  const hosted = trace.spans.some(
    ({ attributes }) =>
      attributes?.['promptfoo.openai.hosted_trace_requested'] === true ||
      typeof attributes?.['promptfoo.openai.hosted_trace'] === 'string',
  );
  if (!hosted) {
    return undefined;
  }
  const targetSpans = filterTargetSpans(trace.spans);
  if (
    targetSpans.some(
      ({ attributes }) => attributes?.['promptfoo.openai.hosted_trace_requested'] === true,
    )
  ) {
    return 'The OpenAI Agents API trace capture metadata is missing or invalid for this assertion.';
  }
  assertionValueContext.trace = { ...trace, spans: targetSpans };
  return undefined;
}

/** Pass uncertain candidates to the raw handlers so they can bound the requested statistic. */
function prepareRawTraceAssertion(
  params: AssertionParams,
  parentId: string,
  unresolvedId: string | undefined,
  includeToolArguments: boolean,
): string | undefined {
  const trace = params.assertionValueContext.trace!;
  const filter = (params.renderedValue ?? params.assertion.value ?? {}) as {
    pattern?: string;
    attributes?: unknown;
  };
  const pattern = typeof filter.pattern === 'string' && filter.pattern ? filter.pattern : '*';
  const attrs = filter.attributes;
  const filters = attrs && typeof attrs === 'object' ? Object.entries(attrs) : [];
  // The case root includes grading itself and closes after the live assertions.
  // Explicit filters may select it, while default operational checks measure target work.
  const targetWorkOnly =
    (params.baseType === 'trace-span-duration' || params.baseType === 'trace-error-spans') &&
    filter.pattern === undefined &&
    filters.length === 0;
  if (targetWorkOnly) {
    trace.spans = trace.spans.filter(
      (span) =>
        span.spanId !== trace.metadata?.testCaseSpanId &&
        !(
          !span.parentSpanId &&
          span.name === TEST_CASE_SPAN_NAME &&
          span.attributes?.[SPAN_ROLE_ATTRIBUTE] === 'test_case'
        ),
    );
  }
  let possible = 0;
  let reason: string | undefined;
  if (
    unresolvedId &&
    !filters.some(([key, value]) => key === 'promptfoo.openai.hosted_trace' && value === parentId)
  ) {
    // The open evaluator root accounts for one possible span. A break elsewhere
    // in the local parent chain can hide an unknown number of ancestors.
    if (unresolvedId !== trace.metadata?.testCaseSpanId) {
      possible = Infinity;
    } else if (
      !targetWorkOnly &&
      couldMatchTestCaseRoot(pattern, attrs, trace.metadata?.testCaseSpanAttributeKeys)
    ) {
      possible = 1;
    }
    if (possible) {
      reason = 'A local ancestor is missing from the stored OpenAI Agents API trace.';
    }
  }
  const uncertain = new Set<TraceSpan>();
  const selectsAllNames = /^\*+$/.test(pattern);
  for (const span of trace.spans) {
    const native = span.attributes?.['promptfoo.openai.hosted_trace'] === parentId;
    // OTLP can replace a name that echoed a protected attribute. Its stored
    // placeholder neither witnesses nor rules out a match on the original name.
    const uncertainName = !native && !selectsAllNames && span.name.includes('[REDACTED]');
    if (!uncertainName && (!filters.length || !matchesPattern(span.name, pattern))) {
      continue;
    }
    const missing = getRawFilterCoverageError(span, filters, {
      native,
      includeToolArguments,
      metadata: trace.metadata,
      uncertainName,
    });
    if (missing) {
      reason ??= missing;
      uncertain.add(span);
    }
  }
  if (
    reason &&
    (params.baseType === 'trace-span-count' ||
      params.baseType === 'trace-error-spans' ||
      params.baseType === 'trace-span-duration')
  ) {
    // A lossy value can equal a filter in the stored JSON. Only the handler's
    // possible matches may use it when calculating the count, error or timing bounds.
    trace.spans = trace.spans.filter((span) => !uncertain.has(span));
    params.traceSpanUncertainty = { missing: possible, candidates: [...uncertain], reason };
    return undefined;
  }
  return reason;
}

/** A wrapper span alone cannot establish that an action never occurred inside the hosted turn. */
export function prepareHostedTraceAssertion(params: AssertionParams): string | undefined {
  const { assertionValueContext, providerResponse, baseType } = params;
  if (!(baseType.startsWith('trajectory:') || baseType.startsWith('trace-'))) {
    return undefined;
  }
  const trace = assertionValueContext.trace;
  const hostedTrace = providerResponse.metadata?.hostedTrace;
  if (hostedTrace?.source !== 'openai:agents-api') {
    return excludeHostedGraderEvidence(params);
  }
  if (baseType.startsWith('trajectory:')) {
    return 'Hosted trajectory evidence is unavailable for this assertion.';
  }
  if (hostedTrace.status !== 'imported' && hostedTrace.status !== 'partial') {
    return 'The requested OpenAI Agents API trace was unavailable.';
  }
  const {
    parentSpanId: parentId,
    spanCount,
    includeToolArguments,
    toolArgumentsComplete,
    errorStatusComplete,
  } = hostedTrace;
  // Responses can be imported from JSON. A truthy string cannot attest to capture.
  if (
    typeof parentId !== 'string' ||
    !parentId.trim() ||
    !Number.isSafeInteger(spanCount) ||
    spanCount <= 0 ||
    typeof includeToolArguments !== 'boolean' ||
    typeof toolArgumentsComplete !== 'boolean' ||
    (toolArgumentsComplete && !includeToolArguments) ||
    (errorStatusComplete !== undefined && typeof errorStatusComplete !== 'boolean')
  ) {
    return 'The stored OpenAI Agents API trace capture metadata is invalid for this assertion.';
  }
  if (!trace) {
    return 'The imported OpenAI Agents API spans are unavailable for this assertion.';
  }
  const native = trace.spans
    .map(withoutReceivedHostedOwner)
    .filter((span) => span.attributes?.['promptfoo.openai.hosted_trace'] === parentId);
  if (native.length !== spanCount) {
    return 'The stored OpenAI Agents API spans are incomplete for this provider call.';
  }
  if (hostedTrace.status === 'partial' || native.some(hasUncertainHostedChatName)) {
    return 'The hosted trace is partial. This assertion requires a complete trace.';
  }
  // Raw span assertions inspect the local case/target/provider wrappers, alongside
  // this turn's hosted spans. A sibling tool or grader belongs to a different call.
  const ancestors = getLocalAncestors(trace.spans, parentId);
  if (!ancestors.spans.length) {
    return 'The local provider wrapper is missing from the stored OpenAI Agents API trace.';
  }
  assertionValueContext.trace = { ...trace, spans: [...native, ...ancestors.spans] };
  return prepareRawTraceAssertion(params, parentId, ancestors.unresolvedId, includeToolArguments);
}
