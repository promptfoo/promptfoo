import { ToolNamesSchema, toolSetMessage } from '../contracts/validators/trajectoryToolSet';
import { getToolNameFromAttributes } from '../tracing/toolAttributes';

import type { AssertionParams, GradingResult } from '../types/index';

export function getToolSetEvidenceError(spans: unknown, cached?: boolean) {
  if (cached) {
    return 'A cached response has no fresh tool-set evidence. Retry without caching.';
  }
  if (!Array.isArray(spans) || spans.length === 0) {
    return 'No trace data available for trajectory:tool-set assertion';
  }
  return undefined;
}

export const handleTrajectoryToolSet = (params: AssertionParams): GradingResult => {
  const parsed = ToolNamesSchema.safeParse(params.renderedValue ?? params.assertion.value);
  if (!parsed.success) {
    throw new Error(toolSetMessage);
  }
  const spans = params.assertionValueContext.trace?.spans ?? [];
  const error = getToolSetEvidenceError(
    spans,
    params.assertionValueContext.providerResponse?.cached,
  );
  if (error) {
    throw new Error(error);
  }
  const expected = new Set(parsed.data.map((name) => name.trim()));
  const actual = new Set(
    spans
      .map((span) => getToolNameFromAttributes(span.attributes ?? {}))
      .filter((name): name is string => name !== undefined),
  );
  const missing = [...expected].filter((name) => !actual.has(name));
  const extra = [...actual].filter((name) => !expected.has(name));
  const matches = missing.length === 0 && extra.length === 0;
  const pass = matches !== params.inverse;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: matches
      ? `Observed tool set matches${params.inverse ? ', which fails the inverse assertion' : ''}.`
      : `Tool set differs. Missing: ${JSON.stringify(missing)}. Unexpected: ${JSON.stringify(extra)}.`,
    assertion: params.assertion,
  };
};
