# OpenTelemetry Tracing Example

This example demonstrates promptfoo's built-in OpenTelemetry tracing for LLM provider calls.

## Quick Start

1. **Set up environment variables:**

```bash
# Required for the providers you want to test
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
# Add other provider keys as needed
```

2. **Run the evaluation:**

```bash
npx promptfoo eval -c promptfooconfig.yaml
```

3. **View traces in the UI:**

```bash
npx promptfoo view
```

Navigate to the Traces tab to see detailed span information.

## Configuration

Tracing is enabled by default. Configure via environment variables:

| Variable                      | Default     | Description                            |
| ----------------------------- | ----------- | -------------------------------------- |
| `PROMPTFOO_DISABLE_TRACING`   | `false`     | Set to `true` to disable tracing       |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | -           | Export traces to external OTLP backend |
| `OTEL_SERVICE_NAME`           | `promptfoo` | Service name in traces                 |

## Viewing Traces Externally

### With Jaeger

1. Start Jaeger:

```bash
docker run -d --name jaeger \
  -e COLLECTOR_OTLP_ENABLED=true \
  -p 16686:16686 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest
```

2. Run eval with OTLP export:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 npx promptfoo eval
```

3. View at http://localhost:16686

### With Honeycomb

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=https://api.honeycomb.io \
OTEL_EXPORTER_OTLP_HEADERS="x-honeycomb-team=YOUR_API_KEY" \
npx promptfoo eval
```

## Trace Attributes

Each LLM call span includes:

### GenAI Semantic Conventions

- `gen_ai.system` - Provider system (openai, anthropic, etc.)
- `gen_ai.operation.name` - Operation type (chat, completion, embedding)
- `gen_ai.request.model` - Requested model name
- `gen_ai.request.max_tokens` - Max tokens setting
- `gen_ai.request.temperature` - Temperature setting
- `gen_ai.usage.input_tokens` - Prompt tokens used
- `gen_ai.usage.output_tokens` - Completion tokens used
- `gen_ai.usage.total_tokens` - Total tokens
- `gen_ai.usage.cached_tokens` - Cached tokens (Anthropic)
- `gen_ai.usage.reasoning_tokens` - Reasoning tokens (o1 models)
- `gen_ai.response.model` - Actual model used
- `gen_ai.response.id` - Provider response ID
- `gen_ai.response.finish_reasons` - Finish reasons

### Promptfoo Attributes

- `promptfoo.provider.id` - Provider identifier
- `promptfoo.eval.id` - Evaluation run ID
- `promptfoo.test.index` - Test case index
- `promptfoo.prompt.label` - Prompt label

## Supported Providers

All major providers are instrumented:

| Provider          | Tracing Support |
| ----------------- | --------------- |
| OpenAI            | ✓               |
| Anthropic         | ✓               |
| Azure OpenAI      | ✓               |
| AWS Bedrock       | ✓               |
| Google Vertex AI  | ✓               |
| Ollama            | ✓               |
| Mistral           | ✓               |
| Cohere            | ✓               |
| Huggingface       | ✓               |
| IBM Watsonx       | ✓               |
| HTTP              | ✓               |
| OpenRouter        | ✓               |
| Replicate         | ✓               |
| OpenAI-compatible | ✓ (inherited)   |
| Cloudflare AI     | ✓ (inherited)   |
