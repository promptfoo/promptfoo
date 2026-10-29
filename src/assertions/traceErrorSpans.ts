import {
  HOSTED_ERROR_STATUS_COMPLETE,
  HOSTED_ERROR_STATUS_VERSION,
  isSpanError,
} from '../tracing/spanError';
import {
  filterTraceSpans,
  finishTraceAssertion,
  withTraceAttributeFilterContext,
} from './traceUtils';

import type { AssertionParams, GradingResult } from '../types/index';
import type { TraceSpan } from '../types/tracing';
import type { TraceSpanAttributeFilter } from './traceUtils';

interface TraceErrorSpansValue {
  max_count?: number;
  max_percentage?: number;
  pattern?: string;
  attributes?: TraceSpanAttributeFilter;
}

export const handleTraceErrorSpans = (params: AssertionParams): GradingResult => {
  const { assertion, assertionValueContext, providerResponse } = params;
  if (!assertionValueContext.trace || !assertionValueContext.trace.spans) {
    throw new Error('No trace data available for trace-error-spans assertion');
  }

  const value = params.renderedValue ?? assertion.value;
  let maxCount: number | undefined;
  let maxPercentage: number | undefined;
  let pattern = '*';
  let attributes: TraceSpanAttributeFilter | undefined;

  // Handle simple number value for backwards compatibility
  if (typeof value === 'number') {
    maxCount = value;
  } else if (value && typeof value === 'object' && !Array.isArray(value)) {
    const objValue = value as TraceErrorSpansValue;
    maxCount = objValue.max_count;
    maxPercentage = objValue.max_percentage;
    pattern = objValue.pattern || '*';
    attributes = objValue.attributes;
  }

  if (maxCount === undefined && maxPercentage === undefined) {
    maxCount = 0; // Default to no errors allowed
  }

  const spans = assertionValueContext.trace.spans as TraceSpan[];

  // Filter spans by pattern
  const matchingSpans = filterTraceSpans(spans, pattern, attributes);

  const hasError = (span: TraceSpan) =>
    isSpanError(span.statusCode, span.statusMessage, (key) => span.attributes?.[key]);
  const errorSpans = matchingSpans.filter(hasError);
  const errorCount = errorSpans.length;
  const hosted = providerResponse?.metadata?.hostedTrace;
  if (hosted?.source === 'openai:agents-api') {
    // Older imports can have a known match without recording every error indicator.
    const unknownStatus = (span: TraceSpan) =>
      span.attributes?.['promptfoo.openai.hosted_trace'] === hosted.parentSpanId &&
      (span.attributes?.[HOSTED_ERROR_STATUS_COMPLETE] !== HOSTED_ERROR_STATUS_VERSION ||
        (span.statusCode !== 0 && span.statusCode !== 1));
    const unknownMatching = matchingSpans.filter(
      (span) => !hasError(span) && unknownStatus(span),
    ).length;
    const uncertainty = params.traceSpanUncertainty;
    const missing = uncertainty?.missing ?? 0;
    const optional = uncertainty?.candidates ?? [];
    // The worst case includes every optional error and omits optional healthy spans.
    // The best case does the reverse, and treats every unknown status as healthy.
    const optionalErrors =
      missing + optional.filter((span) => hasError(span) || unknownStatus(span)).length;
    const optionalHealthy = missing + optional.filter((span) => !hasError(span)).length;
    const exceedsBudget = (errors: number, total: number) => {
      const percent = errors === Infinity ? 100 : (errors / Math.max(total, 1)) * 100;
      return (
        (maxCount !== undefined && errors > maxCount) ||
        (maxPercentage !== undefined &&
          (maxPercentage === 0 ? errors > 0 : percent > maxPercentage))
      );
    };
    const couldFail = exceedsBudget(
      errorCount + unknownMatching + optionalErrors,
      matchingSpans.length + optionalErrors,
    );
    const couldPass =
      matchingSpans.length === 0 ||
      !exceedsBudget(errorCount, matchingSpans.length + optionalHealthy);
    if (couldPass && couldFail && (uncertainty || unknownMatching > 0)) {
      return {
        pass: false,
        score: 0,
        reason: withTraceAttributeFilterContext(
          uncertainty?.reason ??
            'This saved hosted trace did not preserve all error indicators. It cannot establish the requested error limit.',
          attributes,
        ),
        assertion,
      };
    }
    if (uncertainty) {
      const verdict = couldFail ? 'exceed' : 'satisfy';
      return finishTraceAssertion(
        params,
        !couldFail,
        `Observed ${errorCount} errors in ${matchingSpans.length} definite matches. All possible outcomes ${verdict} the requested error budget`,
        attributes,
      );
    }
  }

  if (matchingSpans.length === 0) {
    return finishTraceAssertion(
      params,
      true,
      `No spans found matching pattern "${pattern}"`,
      attributes,
    );
  }
  const errorPercentage = (errorCount / matchingSpans.length) * 100;

  let pass = true;
  let reason = '';

  if (maxCount !== undefined && errorCount > maxCount) {
    pass = false;
    const errorDetails = errorSpans.slice(0, 3).map((span) => {
      let detail = span.name;
      if (span.statusMessage) {
        detail += ` (${span.statusMessage})`;
      } else if (span.statusCode) {
        detail += ` (status: ${span.statusCode})`;
      }
      return detail;
    });

    reason = `Found ${errorCount} error spans, expected at most ${maxCount}. `;
    reason += `Errors: ${errorDetails.join(', ')}`;
    if (errorSpans.length > 3) {
      reason += ` and ${errorSpans.length - 3} more`;
    }
  } else if (maxPercentage !== undefined && errorPercentage > maxPercentage) {
    pass = false;
    reason = `Error rate ${errorPercentage.toFixed(1)}% exceeds threshold ${maxPercentage}% `;
    reason += `(${errorCount} errors out of ${matchingSpans.length} spans)`;
  } else if (errorCount === 0) {
    reason = `No errors found in ${matchingSpans.length} spans matching pattern "${pattern}"`;
  } else {
    reason = `Found ${errorCount} error(s) in ${matchingSpans.length} spans (${errorPercentage.toFixed(1)}%)`;
    if (maxCount !== undefined) {
      reason += `, within threshold of ${maxCount}`;
    }
    if (maxPercentage !== undefined) {
      reason += `, within threshold of ${maxPercentage}%`;
    }
  }

  return finishTraceAssertion(params, pass, reason, attributes);
};
