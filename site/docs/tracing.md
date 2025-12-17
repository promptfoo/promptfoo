---
sidebar_position: 55
description: Implement OpenTelemetry tracing in your LLM evaluations to monitor provider performance, debug workflows, and visualize execution traces directly in Promptfoo's web UI.
---

# Tracing

Promptfoo acts as an OpenTelemetry receiver, collecting traces from your LLM providers and displaying them in the web UI. Use any OpenTelemetry SDK in any language—no external collector required.

![traces in promptfoo](/img/docs/trace.png)

Tracing helps you debug RAG pipelines, identify slow operations, trace errors to specific steps, and monitor external API calls. Traces are automatically linked to test cases, and you can forward them to Jaeger, Tempo, or any OTLP-compatible backend.

## Built-in Provider Instrumentation

Promptfoo automatically instruments its built-in providers with OpenTelemetry spans following [GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/). When tracing is enabled, every provider call creates spans with standardized attributes.

### Supported Providers

The following providers have built-in instrumentation:

| Provider                                       | Automatic Tracing |
| ---------------------------------------------- | ----------------- |
| OpenAI                                         | ✓                 |
| Anthropic                                      | ✓                 |
| Azure OpenAI                                   | ✓                 |
| AWS Bedrock                                    | ✓                 |
| Google Vertex AI                               | ✓                 |
| Ollama                                         | ✓                 |
| Mistral                                        | ✓                 |
| Cohere                                         | ✓                 |
| Huggingface                                    | ✓                 |
| IBM Watsonx                                    | ✓                 |
| HTTP                                           | ✓                 |
| OpenRouter                                     | ✓                 |
| Replicate                                      | ✓                 |
| OpenAI-compatible (Deepseek, Perplexity, etc.) | ✓ (inherited)     |
| Cloudflare AI                                  | ✓ (inherited)     |

### GenAI Span Attributes

Each provider call creates a span with these attributes:

**Request Attributes:**

- `gen_ai.system` - Provider system (e.g., "openai", "anthropic", "azure", "bedrock")
- `gen_ai.operation.name` - Operation type ("chat", "completion", "embedding")
- `gen_ai.request.model` - Model name
- `gen_ai.request.max_tokens` - Max tokens setting
- `gen_ai.request.temperature` - Temperature setting
- `gen_ai.request.top_p` - Top-p setting
- `gen_ai.request.stop_sequences` - Stop sequences

**Response Attributes:**

- `gen_ai.usage.input_tokens` - Input/prompt token count
- `gen_ai.usage.output_tokens` - Output/completion token count
- `gen_ai.usage.total_tokens` - Total token count
- `gen_ai.usage.cached_tokens` - Cached token count (if applicable)
- `gen_ai.usage.reasoning_tokens` - Reasoning token count (for o1, DeepSeek-R1)
- `gen_ai.response.finish_reasons` - Finish/stop reasons

**Promptfoo-specific Attributes:**

- `promptfoo.provider.id` - Provider identifier
- `promptfoo.test.index` - Test case index
- `promptfoo.prompt.label` - Prompt label
- `promptfoo.cache_hit` - Whether the response was served from cache
- `promptfoo.request.body` - The request body sent to the provider (truncated to 4KB)
- `promptfoo.response.body` - The response body from the provider (truncated to 4KB)

### Example Trace Output

When calling OpenAI's GPT-4:

```
Span: chat gpt-4
├─ gen_ai.system: openai
├─ gen_ai.operation.name: chat
├─ gen_ai.request.model: gpt-4
├─ gen_ai.request.max_tokens: 1000
├─ gen_ai.request.temperature: 0.7
├─ gen_ai.usage.input_tokens: 150
├─ gen_ai.usage.output_tokens: 85
├─ gen_ai.usage.total_tokens: 235
├─ gen_ai.response.finish_reasons: ["stop"]
├─ promptfoo.provider.id: openai:chat:gpt-4
└─ promptfoo.test.index: 0
```

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

Promptfoo passes a W3C trace context via `traceparent`. Extract it to create child spans:

```javascript
const { trace, context } = require('@opentelemetry/api');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { resourceFromAttributes } = require('@opentelemetry/resources');

// highlight-start
// Initialize OpenTelemetry (runs once at module load)
const provider = new NodeTracerProvider({
  resource: resourceFromAttributes({ 'service.name': 'my-provider' }),
  spanProcessors: [new SimpleSpanProcessor(new OTLPTraceExporter({
    url: 'http://localhost:4318/v1/traces',
  }))],
});
provider.register();
const tracer = trace.getTracer('my-provider');
// highlight-end

module.exports = {
  async callApi(prompt, promptfooContext) {
    // Extract Promptfoo's trace context
    const ctx = trace.propagation.extract(context.active(), {
      traceparent: promptfooContext.traceparent,
    });

    return context.with(ctx, async () => {
      const span = tracer.startSpan('provider.call');
      span.setAttribute('prompt.length', prompt.length);

      const result = await yourLLMCall(prompt);

      span.end();
      return { output: result };
    });
  },
};
```

For complete examples with error handling and advanced patterns, see the [OpenTelemetry tracing example](https://github.com/promptfoo/promptfoo/tree/main/examples/opentelemetry-tracing).

### 3. View Traces

Run your evaluation and open the web UI:

```bash
promptfoo eval
promptfoo view
```

In the results table, click the **magnifying glass icon** (🔎) on any test result to open the details panel, then scroll to **Trace Timeline**.

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
      # acceptFormats: ['json', 'protobuf']  # Optional - defaults to both
```

### Supported Formats

Promptfoo's OTLP receiver accepts traces in both **JSON** and **protobuf** formats:

| Format   | Content-Type             | Use Case                                        |
| -------- | ------------------------ | ----------------------------------------------- |
| JSON     | `application/json`       | JavaScript/TypeScript (default)                 |
| Protobuf | `application/x-protobuf` | Python (default), Go, Java, and other languages |

Protobuf is more efficient for serialization and produces smaller payloads. Python's OpenTelemetry SDK uses protobuf by default.

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
      'api-key': '{{ env.OBSERVABILITY_API_KEY }}'
```

## Provider Implementation Guide

### JavaScript/TypeScript

See the [Quick Start](#2-instrument-your-provider) above and the [OpenTelemetry tracing example](https://github.com/promptfoo/promptfoo/tree/main/examples/opentelemetry-tracing) for complete implementations.

### Python

For complete provider implementation details, see the [Python Provider documentation](/docs/providers/python/). For a working example with protobuf tracing, see the [Python OpenTelemetry tracing example](https://github.com/promptfoo/promptfoo/tree/main/examples/opentelemetry-tracing-python).

:::note

Python's `opentelemetry-exporter-otlp-proto-http` package uses **protobuf format** by default (`application/x-protobuf`), which is more efficient than JSON.

:::

```python
from opentelemetry import trace
from opentelemetry.propagate import extract
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

# Setup - uses protobuf format by default
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

The web UI displays traces as a hierarchical timeline. Each span shows its duration as a horizontal bar, with width proportional to execution time. Status is color-coded: green (success), red (error), gray (unset).

```
[Root Span: provider.call (500ms)]
  ├─[Retrieve Documents (100ms)]
  ├─[Prepare Context (50ms)]
  └─[LLM Generation (300ms)]
```

Hover over any span to see timestamps, duration, and attributes. Click the expand icon to open the details panel with full span metadata, including `promptfoo.request.body` and `promptfoo.response.body` for debugging.

Click **Export Traces** to download traces as JSON for import into Jaeger, Grafana Tempo, or custom analysis tools.

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

For complete working examples, see the [OpenTelemetry tracing example](https://github.com/promptfoo/promptfoo/tree/main/examples/opentelemetry-tracing) which demonstrates:

- **RAG pipeline tracing**: Query analysis → document retrieval → context augmentation → reasoning → response generation
- **Nested spans**: Parent-child relationships for complex workflows
- **Custom attributes**: Token counts, document relevance scores, processing times
- **Parallel operations**: Tracing concurrent document retrievals

## Red Team Tracing

When running [red team tests](/docs/red-team/), tracing provides a powerful capability: **traces from your application's internal operations can be fed back to adversarial attack strategies**, allowing them to craft more sophisticated attacks based on what they observe.

This creates a feedback loop where:

1. Attack strategy sends a prompt to your application
2. Your application processes the request, emitting trace spans (LLM calls, guardrails, tool executions, errors)
3. Promptfoo captures these traces
4. **Traces are formatted and fed back to the attack strategy** for the next iteration
5. The attack strategy uses this information to craft a better attack

### What Attackers Can See

When red team tracing is enabled, adversarial strategies receive visibility into:

- **Guardrail decisions**: Which content filters triggered and why
- **Tool executions**: Which tools were called with what timing
- **Error conditions**: Rate limits, parsing errors, validation failures
- **LLM operations**: Which models were used and when
- **Performance patterns**: Timing information that could reveal DoS vectors

Example trace summary provided to an attacker:

```
Trace 0af76519 • 5 spans

Execution Flow:
1. [1.2s] llm.generate (client) | model=gpt-4
2. [300ms] guardrail.check (internal) | tool=content-filter
3. [150ms] tool.database_query (server) | tool=search
4. [50ms] guardrail.check (internal) | ERROR: Rate limit exceeded

Key Observations:
• Guardrail content-filter decision: blocked
• Tool call search via "tool.database_query"
• Error span "guardrail.check": Rate limit exceeded
```

The attacker can now craft a follow-up attack that:

- Avoids triggering the `content-filter` guardrail
- Targets the rate limit error condition
- Exploits the specific tool execution pattern observed

### Configuration

Enable red team tracing in your `promptfooconfig.yaml`:

```yaml
tracing:
  enabled: true
  otlp:
    http:
      enabled: true

redteam:
  tracing:
    enabled: true
    # Feed traces to attack generation (default: true)
    includeInAttack: true
    # Feed traces to grading (default: true)
    includeInGrading: true
    # Filter which spans to include
    spanFilter:
      - 'llm.*'
      - 'guardrail.*'
      - 'tool.*'
  plugins:
    - harmful
  strategies:
    - jailbreak # Iterative strategy that benefits from trace feedback
```

### Strategy-Specific Configuration

Different attack strategies can use different tracing settings:

```yaml
redteam:
  tracing:
    enabled: true
    strategies:
      # Jailbreak benefits from seeing all internal operations
      jailbreak:
        includeInAttack: true
        maxSpans: 100
      # Crescendo focuses on guardrail decisions
      crescendo:
        includeInAttack: true
        spanFilter:
          - 'guardrail.*'
```

### Example

See the [red team tracing example](https://github.com/promptfoo/promptfoo/tree/main/examples/redteam-tracing-example) for a complete working implementation.

For more details on red team testing with tracing, see [How to Red Team LLM Agents](/docs/red-team/agents#trace-based-testing-glass-box).

## Next Steps

- Explore the [OpenTelemetry tracing example (JavaScript)](https://github.com/promptfoo/promptfoo/tree/main/examples/opentelemetry-tracing)
- Explore the [OpenTelemetry tracing example (Python)](https://github.com/promptfoo/promptfoo/tree/main/examples/opentelemetry-tracing-python) - uses protobuf format
- Try the [red team tracing example](https://github.com/promptfoo/promptfoo/tree/main/examples/redteam-tracing-example)
- Set up forwarding to your observability platform
- Add custom instrumentation for your use case
- Use traces to optimize provider performance
