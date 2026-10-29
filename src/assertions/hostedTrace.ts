import { COMMAND_ATTRIBUTE_KEYS, TOOL_ARGUMENT_ATTRIBUTE_KEYS } from '../tracing/toolAttributes';

import type { AssertionParams, AssertionType, AssertionValue } from '../types/index';
import type { TraceSpan } from '../types/tracing';

const ARGUMENT_FILTER_KEYS = new Set<string>([
  ...COMMAND_ATTRIBUTE_KEYS,
  ...TOOL_ARGUMENT_ATTRIBUTE_KEYS,
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
      includeToolArguments &&
      !inverse &&
      baseType === 'trajectory:step-count' &&
      'min' in value &&
      typeof value.min === 'number' &&
      value.min > 0 &&
      !('max' in value)
    ) {
      // An unavailable argument can hide additional commands, but cannot erase an observed one.
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
  if (!(baseType.startsWith('trajectory:') || baseType.startsWith('trace-'))) {
    return undefined;
  }
  const trace = assertionValueContext.trace;
  const hostedTrace = providerResponse.metadata?.hostedTrace;
  if (hostedTrace?.source !== 'openai:agents-api') {
    if (
      !hostedTrace &&
      trace?.spans.some(
        ({ attributes }) =>
          attributes?.['promptfoo.openai.hosted_trace_requested'] === true &&
          attributes['promptfoo.span.role'] !== 'grader',
      ) &&
      (!params.provider || /^openai:agents-api(?::|$)/.test(params.provider.id()))
    ) {
      return 'The OpenAI Agents API trace capture metadata is unavailable for this assertion.';
    }
    return undefined;
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
  assertionValueContext.trace = {
    ...trace,
    spans: ancestors
      ? [...native, ...trace.spans.filter((span) => ancestors.has(span.spanId))]
      : native,
  };
  const coverageError = getArgumentCoverageError(params, hostedTrace.includeToolArguments);
  if (!coverageError) {
    return undefined;
  }
  // The row describes capture time. JSON export can truncate or redact a stored argument
  // without changing that row or the number of spans.
  const requiresNativeAlias =
    renderedValue &&
    typeof renderedValue === 'object' &&
    'attributes' in renderedValue &&
    renderedValue.attributes &&
    typeof renderedValue.attributes === 'object' &&
    'gen_ai.tool.call.arguments' in renderedValue.attributes;
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
