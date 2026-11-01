import { filterTargetSpans } from '../tracing/spanFilter';

import type { AssertionParams } from '../types/index';

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

/** Trace handlers require evidence from the target provider. */
export function prepareHostedTraceAssertion(params: AssertionParams): string | undefined {
  const { baseType, providerResponse } = params;
  if (!baseType.startsWith('trajectory:') && !baseType.startsWith('trace-')) {
    return undefined;
  }
  if (providerResponse.metadata?.hostedTrace?.source === 'openai:agents-api') {
    return 'Hosted trace evidence is unavailable for this assertion.';
  }
  return excludeHostedGraderEvidence(params);
}
