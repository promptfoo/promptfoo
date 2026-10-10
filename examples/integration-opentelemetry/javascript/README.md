# integration-opentelemetry/javascript (OpenTelemetry Tracing Example)

This example traces a simulated retrieval workflow and checks its spans with Promptfoo assertions.

## Quick Start

```bash
npx promptfoo@latest init --example integration-opentelemetry/javascript
cd integration-opentelemetry/javascript
npm install
npx promptfoo@latest eval --no-cache -o output.json
npx promptfoo@latest view
```

The base config intentionally fails its one-second all-span duration ceiling so you can inspect a blocking trace assertion alongside passing checks. Use the trajectory variant below for a fully passing offline run.

To run the trajectory assertion variant from this directory, use:

```bash
npx promptfoo@latest eval -c promptfooconfig.trajectory.yaml --no-cache
```

The guide config adds `trajectory:goal-success`, which uses a model grader. Set `OPENAI_API_KEY` and run:

```bash
OPENAI_API_KEY="your-api-key" npx promptfoo@latest eval -c promptfooconfig.trace-guide.yaml --no-cache
```

## How It Works

Promptfoo starts the OTLP receiver and passes a trace context to each provider call. The provider uses that context to create child spans, then exports them after the root span ends. Promptfoo associates the spans with the eval row and makes them available to assertions and the trace viewer.

## Files in This Example

| File                               | Description                                           |
| ---------------------------------- | ----------------------------------------------------- |
| `promptfooconfig.yaml`             | Evaluation config with tracing enabled and assertions |
| `provider-simple-traced.js`        | Simulated RAG provider with nested spans              |
| `promptfooconfig.trajectory.yaml`  | Offline tool and step assertions                      |
| `promptfooconfig.trace-guide.yaml` | Complete trace and trajectory assertion guide config  |
| `trace-assertions.js`              | Custom JavaScript assertion for trace validation      |
| `package.json`                     | OpenTelemetry dependencies (v2.x API)                 |

## Tracing Configuration

Enable tracing in your `promptfooconfig.yaml`:

```yaml
tracing:
  enabled: true
  otlp:
    http:
      enabled: true
      port: 4318
      host: '127.0.0.1'
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
  url: 'http://127.0.0.1:4318/v1/traces',
});

const spanProcessor = new BatchSpanProcessor(exporter);
const provider = new NodeTracerProvider({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'my-provider',
  }),
  spanProcessors: [spanProcessor],
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
            await spanProcessor.forceFlush();
          }
        });
      }
    }

    return { output: 'result without tracing' };
  },
};
```

## Trace-Based Assertions

Use these assertions to check span counts, durations, and errors:

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

The trajectory-specific config at `promptfooconfig.trajectory.yaml` adds:

- `trajectory:tool-used`
- `trajectory:tool-sequence`
- `trajectory:step-count`

Promptfoo accepts generic tool span attributes such as `tool.name` and `tool.arguments`, and it also recognizes Vercel AI SDK telemetry attributes such as `ai.toolCall.name`, `ai.toolCall.args`, `ai.toolCall.arguments`, and `ai.toolCall.input`.

## Viewing Traces

After running an evaluation, view traces in the web UI:

```bash
npx promptfoo@latest view
```

Open any test result and switch to the **Traces** tab to see the timeline showing:

- Hierarchical span visualization
- Duration bars showing relative timing
- Status indicators (OK/ERROR)
- Span attributes and events

## Environment Variables

Configure OpenTelemetry using its [standard environment variables](https://opentelemetry.io/docs/specs/otel/protocol/exporter/#configuration-options):

```bash
# Generic OTLP HTTP base endpoint (the SDK appends /v1/traces)
export OTEL_EXPORTER_OTLP_ENDPOINT="http://127.0.0.1:4318"

# Or override the full trace export URL directly
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="http://127.0.0.1:4318/v1/traces"

# Headers for authentication with external collectors
export OTEL_EXPORTER_OTLP_HEADERS="api-key=your-key"

# Enable tracing via environment variable
export PROMPTFOO_TRACING_ENABLED=true
```

## Export to External Collectors

Promptfoo's built-in receiver stores traces for evals. To also send traces to Jaeger,
Honeycomb, or another OTLP-compatible backend, configure an additional exporter in
your provider SDK or route spans through a collector that fans out to both backends.

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
4. End the root span, then call `spanProcessor.forceFlush()` before returning from the provider

## Dependencies

This example uses OpenTelemetry v2.x packages:

| Package                                   | Version  | Purpose                  |
| ----------------------------------------- | -------- | ------------------------ |
| `@opentelemetry/api`                      | ^1.9.0   | Core tracing API         |
| `@opentelemetry/sdk-trace-node`           | ^2.5.0   | Node.js tracer provider  |
| `@opentelemetry/exporter-trace-otlp-http` | ^0.222.0 | OTLP HTTP exporter       |
| `@opentelemetry/resources`                | ^2.5.0   | Resource attributes      |
| `@opentelemetry/semantic-conventions`     | ^1.39.0  | Standard attribute names |
