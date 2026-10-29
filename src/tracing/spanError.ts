export const HOSTED_ERROR_STATUS_COMPLETE = 'promptfoo.openai.error_status_complete';

/** Classify a span before persisting, or from its decoded trace attributes during grading. */
export function isSpanError(
  statusCode: number | undefined,
  statusMessage: string | undefined,
  attribute: (key: string) => unknown,
): boolean {
  if (statusCode === 2 || (statusCode !== undefined && statusCode >= 400)) {
    return true;
  }
  for (const key of ['error', 'exception', 'failed', 'failure']) {
    const value = attribute(key);
    if (value === true || value === 'true' || (typeof value === 'object' && value !== null)) {
      return true;
    }
  }
  return (
    Number(attribute('http.status_code')) >= 400 ||
    attribute('otel.status_code') === 'ERROR' ||
    attribute('status.code') === 'ERROR' ||
    /error|failed|failure|exception|timeout|abort/i.test(statusMessage ?? '')
  );
}
