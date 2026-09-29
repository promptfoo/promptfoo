import { toolSetError } from '../contracts/validators/trajectoryToolSet';
import { getToolNameFromAttributes } from '../tracing/toolAttributes';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleTrajectoryToolSet = (params: AssertionParams): GradingResult => {
  const value = params.renderedValue ?? params.assertion.value;
  const error = toolSetError(value);
  if (error) {
    throw new Error(error);
  }
  const trace = params.assertionValueContext.trace;
  if (!trace || !Array.isArray(trace.spans)) {
    throw new Error('No trace data available for trajectory:tool-set assertion');
  }
  const expected = new Set(value as string[]);
  const actual = new Set(
    trace.spans
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
      : `Tool set differs. Missing: ${missing.join(', ') || '(none)'}. Unexpected: ${extra.join(', ') || '(none)'}.`,
    assertion: params.assertion,
  };
};
