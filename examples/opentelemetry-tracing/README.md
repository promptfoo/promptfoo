# OpenTelemetry Tracing Example

This example demonstrates how to use OpenTelemetry to trace the internal operations of your LLM providers during Promptfoo evaluations.

## Overview

Promptfoo's OpenTelemetry integration allows you to:

- Trace internal operations of your providers without a custom SDK
- Use standard OpenTelemetry libraries in any language
- Send traces to any OpenTelemetry-compatible backend
- Correlate traces with specific test cases and evaluations

## How It Works

1. **OTLP receiver starts synchronously** - Promptfoo ensures the receiver is ready before evaluations begin
2. **Promptfoo generates a trace context** for each test case evaluation
3. **The trace context is passed to providers** via the `traceparent` field
4. **Providers create child spans** using standard OpenTelemetry SDKs
5. **Traces are sent to Promptfoo's OTLP endpoint** or any other collector
6. **Promptfoo correlates traces** with evaluations for analysis

## Quick Start

### 1. Install Dependencies

```bash
npm install @opentelemetry/api \
  @opentelemetry/sdk-trace-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/resources \
  @opentelemetry/semantic-conventions
```

### 2. Enable Tracing in Configuration

Add the tracing configuration to your `promptfooconfig.yaml`:

```yaml
tracing:
  enabled: true
  otlp:
    http:
      enabled: true
      port: 4318
```

### 3. Instrument Your Provider

In your provider code, extract the trace context and create child spans:

```javascript
const { trace } = require('@opentelemetry/api');

module.exports = {
  async callApi(prompt, context) {
    // Check for trace context from Promptfoo
    if (context.traceparent) {
      // Parse and use the trace context
      // ... (see provider examples)
    }

    // Your provider logic with spans
    const span = tracer.startSpan('my_operation');
    try {
      // Do work...
      span.setStatus({ code: SpanStatusCode.OK });
      return { output: result };
    } finally {
      span.end();
    }
  },
};
```

### 4. Run Evaluation

```bash
promptfoo eval
```

## Environment Variables

Configure OpenTelemetry using standard environment variables:

```bash
# Endpoint for OTLP exporter (defaults to Promptfoo's receiver)
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"

# Optional: headers for authentication
export OTEL_EXPORTER_OTLP_HEADERS="api-key=your-key"

# Service name for your provider
export OTEL_SERVICE_NAME="my-rag-application"

# Enable tracing via environment variable
export PROMPTFOO_TRACING_ENABLED=true
```

## Examples

### JavaScript Provider Examples

#### Simple Traced Provider

See `provider-simple-traced.js` for a clean example showing:

- Basic span creation with proper parent context
- Immediate span export using SimpleSpanProcessor
- Error handling and status codes
- Event logging and attributes

#### Full RAG Provider

See `provider-with-tracing.js` for a complete RAG pipeline example with:

- Document retrieval tracing
- Context preparation spans
- LLM generation monitoring
- Hierarchical span structure

### TypeScript Provider

See `provider-simple.ts` for a TypeScript example showing:

- Type-safe integration
- Helper functions for trace context
- Clean async/await patterns

## Viewing Traces

### Web UI Trace Visualization

Promptfoo now includes built-in trace visualization in the web UI:

1. Run your evaluation with tracing enabled:

   ```bash
   promptfoo eval -c test-trace-ui.yaml
   ```

2. Open the web UI:

   ```bash
   promptfoo view
   ```

3. Click on any test result's magnifying glass icon (🔎) to open the output dialog

4. Scroll down to see the "Trace Timeline" section showing:
   - Hierarchical span visualization
   - Duration bars showing relative timing
   - Status indicators (OK/ERROR)
   - Hover tooltips with detailed span information

### Trace Storage

Traces are stored in SQLite and linked to evaluations. The storage includes:

- Full span hierarchy with parent-child relationships
- Span attributes and metadata
- Timing information in nanoseconds
- Status codes and error messages

## Best Practices

1. **Use semantic conventions** for span and attribute names
2. **Set appropriate span status** (OK, ERROR) based on outcomes
3. **Include relevant attributes** but avoid sensitive data
4. **Handle errors gracefully** and record exceptions
5. **Keep span names consistent** across evaluations

## Troubleshooting

### Context Naming Conflicts

If you see errors like `context.active is not a function`, this is because the OpenTelemetry `context` API conflicts with Promptfoo's context parameter. To fix this:

1. Import OpenTelemetry context with an alias:

   ```javascript
   const { context: otelContext } = require('@opentelemetry/api');
   ```

2. Use different parameter names for Promptfoo context:
   ```javascript
   async callApi(prompt, promptfooContext) {
     // Use promptfooContext for Promptfoo's context
     // Use otelContext for OpenTelemetry's context API
   }
   ```

### Traces Not Appearing

1. Verify tracing is enabled in configuration
2. Check OTLP receiver is running (look for port 4318)
3. Ensure trace context is properly parsed
4. Check for errors in provider logs

### Performance Impact

- Tracing adds minimal overhead (~1-2ms per span)
- Use sampling for high-volume evaluations
- Batch span exports to reduce network calls

## Advanced Configuration

### Forward to External Collectors

```yaml
tracing:
  forwarding:
    enabled: true
    endpoint: 'http://jaeger:4318'
    headers:
      'api-key': '${JAEGER_API_KEY}'
```

### Custom Sampling

```javascript
// In your provider initialization
const sampler = new TraceIdRatioBasedSampler(0.1); // 10% sampling
```

## Next Steps

- Explore span attributes and events
- Add custom instrumentation for your use case
- Integrate with your existing observability stack
- Use traces to optimize provider performance
