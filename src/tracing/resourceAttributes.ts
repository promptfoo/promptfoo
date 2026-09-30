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
