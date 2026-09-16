/**
 * Shared resource-attribute keys used to link SDK-emitted OTEL logs back to
 * the evaluation trace. The claude-agent-sdk provider sets these via
 * `OTEL_RESOURCE_ATTRIBUTES` on the subprocess env, and the OTLP /v1/logs
 * receiver reads them to resolve the log record's parent span.
 *
 * Both producer and consumer must agree; keep these constants as the single
 * source of truth.
 */
export const PROMPTFOO_RESOURCE_ATTR_TRACE_ID = 'promptfoo.trace_id';
export const PROMPTFOO_RESOURCE_ATTR_PARENT_SPAN_ID = 'promptfoo.parent_span_id';

export function mergeResourceAttributes(
  resource: Record<string, unknown>,
  record: Record<string, unknown>,
): Record<string, unknown> {
  const overwritten = Object.fromEntries(
    Object.entries(resource).filter(
      ([key, value]) => Object.prototype.hasOwnProperty.call(record, key) && value !== record[key],
    ),
  );
  return {
    ...resource,
    ...record,
    // Keep overridden values available to ingestion and read-time redaction.
    ...(Object.keys(overwritten).length > 0
      ? {
          'otel.resource.attributes': [
            resource['otel.resource.attributes'],
            record['otel.resource.attributes'],
            overwritten,
          ].filter((value) => value !== undefined),
        }
      : {}),
  };
}
