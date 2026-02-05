# opentelemetry-tracing (OpenTelemetry Tracing Example)

This example demonstrates how to use OpenTelemetry to trace the internal operations of your LLM providers during Promptfoo evaluations.

## Quick Start

```bash
npx promptfoo@latest init --example opentelemetry-tracing
cd opentelemetry-tracing
npm install
npx promptfoo@latest eval
npx promptfoo@latest view
```

## Environment Variables

This example requires no API keys - it uses a simulated provider that demonstrates tracing patterns.

## Overview

Promptfoo's OpenTelemetry integration allows you to:

- Trace internal operations of your providers without a custom SDK
- Use standard OpenTelemetry libraries in any language
- Send traces to any OpenTelemetry-compatible backend
- Correlate traces with specific test cases and evaluations

## How It Works

1. **OTLP receiver starts automatically** - Promptfoo ensures the receiver is ready before evaluations begin
2. **Promptfoo generates a trace context** for each test case evaluation
3. **The trace context is passed to providers** via the `traceparent` field
4. **Providers create child spans** using standard OpenTelemetry SDKs
5. **Traces are sent to Promptfoo's OTLP endpoint** (port 4318 by default)
6. **Promptfoo correlates traces** with evaluations for analysis

## Files in This Example

| File                        | Description                                           |
| --------------------------- | ----------------------------------------------------- |
| `promptfooconfig.yaml`      | Evaluation config with tracing enabled and assertions |
| `provider-simple-traced.js` | Simulated RAG provider with comprehensive tracing     |
| `trace-assertions.js`       | Custom JavaScript assertion for trace validation      |
| `package.json`              | OpenTelemetry dependencies (v2.x API)                 |

## Tracing Configuration

Enable tracing in your `promptfooconfig.yaml`:

```yaml
tracing:
  enabled: true
  otlp:
    http:
      enabled: true
      port: 4318
```

## Instrumenting Your Provider

The provider receives trace context from Promptfoo via the `traceparent` field. Here's the pattern used in this example:

```javascript
const { trace, context, SpanStatusCode } = require('@opentelemetry/api');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-node');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { ATTR_SERVICE_NAME } = require('@opentelemetry/semantic-conventions');

// Initialize OpenTelemetry (v2.x API)
const exporter = new OTLPTraceExporter({
  url: 'http://localhost:4318/v1/traces',
});

const provider = new NodeTracerProvider({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'my-provider',
  }),
  spanProcessors: [new BatchSpanProcessor(exporter)],
});
provider.register();

const tracer = trace.getTracer('my-provider');

module.exports = {
  async callApi(prompt, promptfooContext) {
    // Parse trace context from Promptfoo
    if (promptfooContext?.traceparent) {
      const matches = promptfooContext.traceparent.match(
        /^(\d{2})-([a-f0-9]{32})-([a-f0-9]{16})-(\d{2})$/,
      );
      if (matches) {
        const [, , traceId, parentId, traceFlags] = matches;

        // Create parent context
        const parentCtx = trace.setSpanContext(context.active(), {
          traceId,
          spanId: parentId,
          traceFlags: parseInt(traceFlags, 16),
          isRemote: true,
        });

        // Run operations within parent context
        return context.with(parentCtx, async () => {
          const span = tracer.startSpan('my_operation');
          try {
            // Your provider logic here...
            span.setStatus({ code: SpanStatusCode.OK });
            return { output: 'result' };
          } catch (error) {
            span.recordException(error);
            span.setStatus({ code: SpanStatusCode.ERROR });
            throw error;
          } finally {
            span.end();
          }
        });
      }
    }

    return { output: 'result without tracing' };
  },
};
```

## Trace-Based Assertions

This example demonstrates several trace assertion types:

```yaml
assert:
  # Count spans matching a pattern
  - type: trace-span-count
    value:
      pattern: 'retrieve_document_*'
      min: 3
      max: 3

  # Check span duration
  - type: trace-span-duration
    value:
      pattern: 'rag_agent_workflow'
      max: 5000 # milliseconds

  # Check for error spans
  - type: trace-error-spans
    value:
      max_count: 0
```

## Viewing Traces

After running an evaluation, view traces in the web UI:

```bash
npx promptfoo@latest view
```

Click on any test result to see the "Trace Timeline" section showing:

- Hierarchical span visualization
- Duration bars showing relative timing
- Status indicators (OK/ERROR)
- Span attributes and events

## Environment Variables

Configure OpenTelemetry using standard environment variables:

```bash
# Custom endpoint (defaults to Promptfoo's receiver)
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"

# Headers for authentication with external collectors
export OTEL_EXPORTER_OTLP_HEADERS="api-key=your-key"

# Enable tracing via environment variable
export PROMPTFOO_TRACING_ENABLED=true
```

## Forward to External Collectors

Send traces to Jaeger, Honeycomb, or other OTLP-compatible backends:

```yaml
tracing:
  enabled: true
  forwarding:
    enabled: true
    endpoint: 'http://jaeger:4318'
    headers:
      'api-key': '${JAEGER_API_KEY}'
```

## Troubleshooting

### Context Naming Conflicts

If you see `context.active is not a function`, the OpenTelemetry `context` API conflicts with Promptfoo's context parameter. Rename the parameter:

```javascript
async callApi(prompt, promptfooContext) {
  // Use promptfooContext for Promptfoo's context
  // Use context from @opentelemetry/api for tracing
}
```

### Traces Not Appearing

1. Verify `tracing.enabled: true` in config
2. Check OTLP receiver is running (look for port 4318 in logs)
3. Ensure trace context is properly parsed from `promptfooContext.traceparent`
4. Call `spanProcessor.forceFlush()` before returning from provider

## Dependencies

This example uses OpenTelemetry v2.x packages:

| Package                                   | Version  | Purpose                  |
| ----------------------------------------- | -------- | ------------------------ |
| `@opentelemetry/api`                      | ^1.9.0   | Core tracing API         |
| `@opentelemetry/sdk-trace-node`           | ^2.0.0   | Node.js tracer provider  |
| `@opentelemetry/exporter-trace-otlp-http` | ^0.200.0 | OTLP HTTP exporter       |
| `@opentelemetry/resources`                | ^2.0.0   | Resource attributes      |
| `@opentelemetry/semantic-conventions`     | ^1.28.0  | Standard attribute names |
