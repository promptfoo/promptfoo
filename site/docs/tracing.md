---
sidebar_position: 55
---

# Tracing

Promptfoo supports OpenTelemetry (OTLP) tracing to help you understand the internal operations of your LLM providers during evaluations.

This feature allows you to collect detailed performance metrics and debug complex provider implementations.

![traces in promptfoo](/img/docs/trace.png)

## Overview

Promptfoo acts as an **OpenTelemetry receiver**, collecting traces from your providers and displaying them in the web UI. This eliminates the need for external observability infrastructure during development and testing.

Tracing provides visibility into:

- **Provider execution flow**: See how your providers process requests internally
- **Performance bottlenecks**: Identify slow operations in RAG pipelines or multi-step workflows
- **Error tracking**: Trace failures to specific operations
- **Resource usage**: Monitor external API calls, database queries, and other operations

### Key Features

- **Standard OpenTelemetry support**: Use any OpenTelemetry SDK in any language
- **Built-in OTLP receiver**: No external collector required for basic usage
- **Web UI visualization**: View traces directly in the Promptfoo interface
- **Automatic correlation**: Traces are linked to specific test cases and evaluations
- **Flexible forwarding**: Send traces to Jaeger, Tempo, or any OTLP-compatible backend

## Quick Start

### 1. Enable Tracing

Add tracing configuration to your `promptfooconfig.yaml`:

```yaml
tracing:
  enabled: true # Required to send OTLP telemetry
  otlp:
    http:
      enabled: true # Required to start the built-in OTLP receiver
```

### 2. Instrument Your Provider

Promptfoo passes a W3C trace context to providers via the `traceparent` field. Use this to create child spans:

```javascript
const { trace, context, SpanStatusCode } = require('@opentelemetry/api');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');

// Initialize tracer
const provider = new NodeTracerProvider();
const exporter = new OTLPTraceExporter({
  url: 'http://localhost:4318/v1/traces',
});
provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
provider.register();

const tracer = trace.getTracer('my-provider');

module.exports = {
  async callApi(prompt, promptfooContext) {
    // Parse trace context from Promptfoo
    if (promptfooContext.traceparent) {
      const activeContext = trace.propagation.extract(context.active(), {
        traceparent: promptfooContext.traceparent,
      });

      return context.with(activeContext, async () => {
        const span = tracer.startSpan('provider.call');

        try {
          // Your provider logic here
          span.setAttribute('prompt.length', prompt.length);

          const result = await yourLLMCall(prompt);

          span.setStatus({ code: SpanStatusCode.OK });
          return { output: result };
        } catch (error) {
          span.recordException(error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message,
          });
          throw error;
        } finally {
          span.end();
        }
      });
    }

    // Fallback for when tracing is disabled
    return { output: await yourLLMCall(prompt) };
  },
};
```

### 3. View Traces

After running an evaluation, view traces in the web UI:

1. Run your evaluation:

   ```bash
   promptfoo eval
   ```

2. Open the web UI:

   ```bash
   promptfoo view
   ```

3. Click the magnifying glass (🔎) icon on any test result
4. Scroll to the "Trace Timeline" section

## Configuration Reference

### Basic Configuration

```yaml
tracing:
  enabled: true # Enable/disable tracing
  otlp:
    http:
      enabled: true # Required to start the OTLP receiver
      # port: 4318   # Optional - defaults to 4318 (standard OTLP HTTP port)
      # host: '0.0.0.0'  # Optional - defaults to '0.0.0.0'
```

### Environment Variables

You can also configure tracing via environment variables:

```bash
# Enable tracing
export PROMPTFOO_TRACING_ENABLED=true

# Configure OTLP endpoint (for providers)
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"

# Set service name
export OTEL_SERVICE_NAME="my-rag-application"

# Authentication headers (if needed)
export OTEL_EXPORTER_OTLP_HEADERS="api-key=your-key"
```

### Forwarding to External Collectors

Forward traces to external observability platforms:

```yaml
tracing:
  enabled: true
  otlp:
    http:
      enabled: true
  forwarding:
    enabled: true
    endpoint: 'http://jaeger:4318' # or Tempo, Honeycomb, etc.
    headers:
      'api-key': '${OBSERVABILITY_API_KEY}'
```

## Provider Implementation Guide

### JavaScript/TypeScript

For complete provider implementation details, see the [JavaScript Provider documentation](/docs/providers/custom-api/). For tracing-specific examples, see the [OpenTelemetry tracing example](https://github.com/promptfoo/promptfoo/tree/main/examples/opentelemetry-tracing).

Key points:

- Use `SimpleSpanProcessor` for immediate trace export
- Extract the W3C trace context from `traceparent`
- Create child spans for each operation
- Set appropriate span attributes and status

### Python

For complete provider implementation details, see the [Python Provider documentation](/docs/providers/python/).

```python
from opentelemetry import trace
from opentelemetry.propagate import extract
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

# Setup
provider = TracerProvider()
exporter = OTLPSpanExporter(endpoint="http://localhost:4318/v1/traces")
provider.add_span_processor(SimpleSpanProcessor(exporter))
trace.set_tracer_provider(provider)
tracer = trace.get_tracer(__name__)

def call_api(prompt, context):
    # Extract trace context
    if 'traceparent' in context:
        ctx = extract({"traceparent": context["traceparent"]})
        with tracer.start_as_current_span("provider.call", context=ctx) as span:
            span.set_attribute("prompt.length", len(prompt))
            # Your provider logic here
            result = your_llm_call(prompt)
            return {"output": result}

    # Fallback without tracing
    return {"output": your_llm_call(prompt)}
```

## Trace Visualization

Promptfoo includes a built-in trace viewer that displays all collected telemetry data. Since Promptfoo functions as an OTLP receiver, you can view traces directly without configuring external tools like Jaeger or Grafana Tempo.

The web UI displays traces as a hierarchical timeline showing:

- **Span hierarchy**: Parent-child relationships between operations
- **Duration bars**: Visual representation of operation timing
- **Status indicators**: Success (green), error (red), or unset (gray)
- **Hover details**: Span attributes, duration, and timestamps
- **Relative timing**: See which operations run in parallel vs. sequentially

### Understanding the Timeline

```
[Root Span: provider.call (500ms)]
  ├─[Retrieve Documents (100ms)]
  ├─[Prepare Context (50ms)]
  └─[LLM Generation (300ms)]
```

Each bar's width represents its duration relative to the total trace time. Hover over any span to see:

- Exact start and end timestamps
- Duration in milliseconds or seconds
- Custom attributes you've added
- Error messages (if any)

## Best Practices

### 1. Semantic Naming

Use descriptive, hierarchical span names:

```javascript
// Good
'rag.retrieve_documents';
'rag.rank_results';
'llm.generate_response';

// Less informative
'step1';
'process';
'call_api';
```

### 2. Add Relevant Attributes

Include context that helps debugging:

```javascript
span.setAttributes({
  'prompt.tokens': tokenCount,
  'documents.count': documents.length,
  'model.name': 'gpt-4',
  'cache.hit': false,
});
```

### 3. Handle Errors Properly

Always record exceptions and set error status:

```javascript
try {
  // Operation
} catch (error) {
  span.recordException(error);
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error.message,
  });
  throw error;
}
```

### 4. Use Appropriate Span Processors

- **SimpleSpanProcessor**: For development and testing (immediate export)
- **BatchSpanProcessor**: For production (better performance)

## Advanced Features

### Custom Trace Attributes

Add metadata that appears in the UI:

```javascript
span.setAttributes({
  'user.id': userId,
  'feature.flags': JSON.stringify(featureFlags),
  version: packageVersion,
});
```

### Trace Sampling

Reduce overhead in high-volume scenarios:

```javascript
const { TraceIdRatioBasedSampler } = require('@opentelemetry/sdk-trace-base');

const provider = new NodeTracerProvider({
  sampler: new TraceIdRatioBasedSampler(0.1), // Sample 10% of traces
});
```

### Multi-Service Tracing

Trace across multiple services:

```javascript
// Service A: Forward trace context
const headers = {};
trace.propagation.inject(context.active(), headers);
await fetch(serviceB, { headers });

// Service B: Extract and continue trace
const extractedContext = trace.propagation.extract(context.active(), request.headers);
```

## Troubleshooting

### Traces Not Appearing

1. **Check tracing is enabled**: Verify `tracing.enabled: true` in config
2. **Verify OTLP endpoint**: Ensure providers are sending to `http://localhost:4318/v1/traces`
3. **Check trace context**: Log the `traceparent` value to ensure it's being passed
4. **Review provider logs**: Look for connection errors or failed exports

### Context Naming Conflicts

If you see `context.active is not a function`, rename the OpenTelemetry import:

```javascript
// Avoid conflict with promptfoo context parameter
const { context: otelContext } = require('@opentelemetry/api');

async callApi(prompt, promptfooContext) {
  // Use otelContext for OpenTelemetry
  // Use promptfooContext for Promptfoo's context
}
```

### Performance Impact

- Tracing adds ~1-2ms overhead per span
- Use sampling for high-volume evaluations
- Consider `BatchSpanProcessor` for production use

### Debug Logging

Enable debug logs to troubleshoot:

```bash
# Promptfoo debug logs
DEBUG=promptfoo:* promptfoo eval

# OpenTelemetry debug logs
OTEL_LOG_LEVEL=debug promptfoo eval
```

## Integration Examples

### RAG Pipeline Tracing

```javascript
async function ragPipeline(query, context) {
  const span = tracer.startSpan('rag.pipeline');

  try {
    // Retrieval phase
    const retrieveSpan = tracer.startSpan('rag.retrieve', { parent: span });
    const documents = await vectorSearch(query);
    retrieveSpan.setAttribute('documents.count', documents.length);
    retrieveSpan.end();

    // Reranking phase
    const rerankSpan = tracer.startSpan('rag.rerank', { parent: span });
    const ranked = await rerank(query, documents);
    rerankSpan.setAttribute('documents.reranked', ranked.length);
    rerankSpan.end();

    // Generation phase
    const generateSpan = tracer.startSpan('llm.generate', { parent: span });
    const response = await llm.generate(query, ranked);
    generateSpan.setAttribute('response.tokens', response.tokenCount);
    generateSpan.end();

    span.setStatus({ code: SpanStatusCode.OK });
    return response;
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw error;
  } finally {
    span.end();
  }
}
```

### Multi-Model Comparison

```javascript
async function compareModels(prompt, context) {
  const span = tracer.startSpan('compare.models');

  const models = ['gpt-4', 'claude-3', 'llama-3'];
  const promises = models.map(async (model) => {
    const modelSpan = tracer.startSpan(`model.${model}`, { parent: span });
    try {
      const result = await callModel(model, prompt);
      modelSpan.setAttribute('model.name', model);
      modelSpan.setAttribute('response.latency', result.latency);
      return result;
    } finally {
      modelSpan.end();
    }
  });

  const results = await Promise.all(promises);
  span.end();
  return results;
}
```

## Next Steps

- Explore the [OpenTelemetry tracing example](https://github.com/promptfoo/promptfoo/tree/main/examples/opentelemetry-tracing)
- Set up forwarding to your observability platform
- Add custom instrumentation for your use case
- Use traces to optimize provider performance
