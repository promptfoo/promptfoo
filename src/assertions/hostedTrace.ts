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
import { getHostedToolArguments, hasUnresolvedHostedCommand } from './trajectoryUtils';

import type { AssertionParams, AssertionType, AssertionValue } from '../types/index';
import type { TraceSpan } from '../types/tracing';

const ARGUMENT_FILTER_KEYS = new Set(['gen_ai.tool.call.arguments', 'tool.arguments']);

function isCommandMatcher(value: unknown): boolean {
  if (!value || typeof value !== 'object' || !('type' in value)) {
    return false;
  }
  return value.type === 'command' || (Array.isArray(value.type) && value.type.includes('command'));
}

function isHostedToolSpan(span: TraceSpan): boolean {
  return (
    span.attributes?.['gen_ai.operation.name'] === 'execute_tool' ||
    span.name.startsWith('execute_tool ')
  );
}

function hasIntactArguments(attributes: TraceSpan['attributes']): boolean {
  return (
    !!attributes &&
    !attributes['promptfoo.tool.arguments_redacted'] &&
    getHostedToolArguments(attributes) !== undefined
  );
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
  capture: { native: boolean; includeToolArguments: boolean; metadata?: Record<string, unknown> },
): string | undefined {
  const attrs = span.attributes ?? {};
  const absentToolAttributes = attrs[HOSTED_ABSENT_TOOL_ATTRIBUTES];
  const tool = capture.native && isHostedToolSpan(span);
  let reason: string | undefined;
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

// Use the count defaults from the trajectory handlers. A bare tool matcher requires one call.
function hasPositiveMinimum(value: object, defaultMin: number): boolean {
  const min = 'min' in value && typeof value.min === 'number' ? value.min : defaultMin;
  return min > 0 && !('max' in value && typeof value.max === 'number');
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
  return !!value && typeof value === 'object' && hasPositiveMinimum(value, 1);
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
    const untypedStep = baseType === 'trajectory:step-count' && !('type' in value && value.type);
    const commandFilter =
      (baseType.startsWith('trajectory:') &&
        Array.isArray(steps) &&
        steps.some(isCommandMatcher)) ||
      (untypedStep && ('name' in value || 'pattern' in value));
    if (!commandFilter) {
      return undefined;
    }
    if (
      !inverse &&
      (includeToolArguments || untypedStep) &&
      (provesObservedTool(baseType, value) ||
        (baseType === 'trajectory:step-count' && hasPositiveMinimum(value, 0)))
    ) {
      // Untyped patterns can match preserved span names even when arguments were never captured.
      return undefined;
    }
  }
  return missingArgumentsReason(includeToolArguments);
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
    !providerResponse.metadata?.hostedTrace &&
    targetSpans.some(
      ({ attributes }) => attributes?.['promptfoo.openai.hosted_trace_requested'] === true,
    )
  ) {
    return 'The OpenAI Agents API trace capture metadata is unavailable for this assertion.';
  }
  assertionValueContext.trace = { ...trace, spans: targetSpans };
  return undefined;
}

/** Count assertions can use the bounds of missing evidence. Other raw checks need every candidate. */
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
  if (filters.length) {
    for (const span of trace.spans) {
      if (matchesPattern(span.name, pattern)) {
        const missing = getRawFilterCoverageError(span, filters, {
          native: span.attributes?.['promptfoo.openai.hosted_trace'] === parentId,
          includeToolArguments,
          metadata: trace.metadata,
        });
        if (missing) {
          reason ??= missing;
          uncertain.add(span);
        }
      }
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
  const parentId = hostedTrace.parentSpanId;
  if (!trace || !parentId || !hostedTrace.spanCount) {
    return 'The imported OpenAI Agents API spans are unavailable for this assertion.';
  }
  const native = trace.spans
    .map(withoutReceivedHostedOwner)
    .filter((span) => span.attributes?.['promptfoo.openai.hosted_trace'] === parentId);
  if (native.length !== hostedTrace.spanCount) {
    return 'The stored OpenAI Agents API spans are incomplete for this provider call.';
  }
  const partial = hostedTrace.status === 'partial' || native.some(hasUncertainHostedChatName);
  if (partial && (inverse || !provesObservedTool(baseType, renderedValue))) {
    return 'The hosted trace is partial. It can only establish an observed tool call or matching arguments.';
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
  if (ancestors) {
    return prepareRawTraceAssertion(
      params,
      parentId,
      ancestors.unresolvedId,
      hostedTrace.includeToolArguments,
    );
  }
  const coverageError = getArgumentCoverageError(params, hostedTrace.includeToolArguments);
  if (!coverageError) {
    return undefined;
  }
  // The row describes capture time. JSON export can truncate or redact a stored argument
  // without changing that row or the number of spans.
  const complete =
    hostedTrace.includeToolArguments &&
    hostedTrace.toolArgumentsComplete === true &&
    native.every((span) => !isHostedToolSpan(span) || hasIntactArguments(span.attributes)) &&
    ((baseType === 'trajectory:tool-args-match' && !isCommandMatcher(renderedValue)) ||
      !hasUnresolvedHostedCommand(assertionValueContext.trace));
  return complete ? undefined : coverageError;
}
