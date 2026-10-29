import { COMMAND_ATTRIBUTE_KEYS, TOOL_ARGUMENT_ATTRIBUTE_KEYS } from '../tracing/toolAttributes';

import type { AssertionParams, AssertionType, AssertionValue } from '../types/index';
import type { TraceSpan } from '../types/tracing';

const ARGUMENT_FILTER_KEYS = new Set<string>([
  ...COMMAND_ATTRIBUTE_KEYS,
  ...TOOL_ARGUMENT_ATTRIBUTE_KEYS,
]);

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

function getLocalAncestors(spans: TraceSpan[], parentId: string): Set<string> {
  const byId = new Map(spans.map((span) => [span.spanId, span]));
  const ancestors = new Set<string>();
  let id: string | undefined = parentId;
  while (id && !ancestors.has(id)) {
    ancestors.add(id);
    id = byId.get(id)?.parentSpanId;
  }
  return ancestors;
}

function getArgumentCoverageError(
  { baseType, renderedValue: value, inverse }: AssertionParams,
  includeToolArguments: boolean,
): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  if (baseType === 'trajectory:tool-args-match') {
    // Visible fields can establish a positive match even when another argument was redacted.
    if (
      includeToolArguments &&
      !inverse &&
      !/(?:\[redacted\]|<redacted>|%5bredacted%5d)/i.test(JSON.stringify(value))
    ) {
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
  }
  return includeToolArguments
    ? 'Some hosted tool arguments were unavailable or redacted. The trace cannot establish the requested argument check.'
    : 'The imported OpenAI Agents API trace excludes tool arguments. Enable includeToolArguments to grade this assertion.';
}

/** A wrapper span alone cannot establish that an action never occurred inside the hosted turn. */
export function prepareHostedTraceAssertion(params: AssertionParams): string | undefined {
  const { assertionValueContext, providerResponse, baseType, renderedValue, inverse } = params;
  const hostedTrace = providerResponse.metadata?.hostedTrace;
  if (
    hostedTrace?.source !== 'openai:agents-api' ||
    !(baseType.startsWith('trajectory:') || baseType.startsWith('trace-'))
  ) {
    return undefined;
  }
  if (hostedTrace.status === 'unavailable') {
    return 'The requested OpenAI Agents API trace was unavailable.';
  }
  const partial = hostedTrace.status === 'partial';
  if (partial && (inverse || !provesObservedTool(baseType, renderedValue))) {
    return 'The hosted trace is partial. It can only establish an observed tool call or matching arguments.';
  }
  const trace = assertionValueContext.trace;
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
  assertionValueContext.trace = {
    ...trace,
    spans: ancestors
      ? [...native, ...trace.spans.filter((span) => ancestors.has(span.spanId))]
      : native,
  };
  return hostedTrace.toolArgumentsComplete === true
    ? undefined
    : getArgumentCoverageError(params, hostedTrace.includeToolArguments);
}
