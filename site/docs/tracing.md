---
sidebar_position: 55
description: Implement OpenTelemetry tracing in your LLM evaluations to monitor provider performance, debug workflows, and visualize execution traces directly in Promptfoo's web UI.
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

Promptfoo passes a W3C trace context to providers via the `traceparent` field. Use this to create child spans:

```javascript
const { trace, context, propagation, SpanStatusCode } = require('@opentelemetry/api');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { resourceFromAttributes } = require('@opentelemetry/resources');

// Initialize tracer (SDK 2.x API - pass spanProcessors to constructor)
const provider = new NodeTracerProvider({
  resource: resourceFromAttributes({ 'service.name': 'my-provider' }),
  spanProcessors: [
    new SimpleSpanProcessor(
      new OTLPTraceExporter({
        url: 'http://localhost:4318/v1/traces',
      }),
    ),
  ],
});
provider.register();

const tracer = trace.getTracer('my-provider');

module.exports = {
  async callApi(prompt, promptfooContext) {
    // Parse trace context from Promptfoo
    if (promptfooContext.traceparent) {
      const activeContext = propagation.extract(context.active(), {
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

### 4. Assert on Traced Workflows

Once traces are flowing into Promptfoo, you can evaluate what the agent actually did, not just the final answer:

```yaml
tests:
  - vars:
      order_id: '123'
    assert:
      - type: trajectory:tool-used
        value: search_orders

      - type: trajectory:tool-args-match
        value:
          name: search_orders
          args:
            order_id: '{{ order_id }}'

      - type: trajectory:tool-sequence
        value:
          steps:
            - search_orders
            - compose_reply

      - type: trajectory:goal-success
        value: 'Determine the shipping status for order {{ order_id }} and tell the user whether it has shipped'
        provider: openai:gpt-5-mini
```

Use trajectory assertions when your spans identify tools, commands, searches, reasoning steps, or messages. Promptfoo also normalizes common command-like tool spans, including OpenAI Agents SDK `exec_command` calls with `cmd` arguments and `shell` calls with `commands` arrays, into command trajectory steps. For traced tool calls, Promptfoo recognizes both generic attributes such as `tool.name` and `tool.arguments` and framework-specific ones such as Vercel AI SDK's `ai.toolCall.name`, `ai.toolCall.args`, `ai.toolCall.arguments`, and `ai.toolCall.input`. If you only need raw span counts, durations, or error detection, use [`trace-span-count`](/docs/configuration/expected-outputs/deterministic/#trace-span-count), [`trace-span-duration`](/docs/configuration/expected-outputs/deterministic/#trace-span-duration), or [`trace-error-spans`](/docs/configuration/expected-outputs/deterministic/#trace-error-spans).

Trace span assertions match a subset of spans by pattern. Empty matches pass by default for budget-style checks such as duration or error thresholds; set `requirePresence: true` when the matching work must be present. For inverse `not-trace-*` assertions, an empty default match means the positive budget was satisfied and therefore fails the inverse assertion instead of proving forbidden traced work occurred. When `requirePresence` is true, missing matching work fails both positive and inverse assertions.

### Turn marker spans {#per-llm-turn-spans}

Several first-party providers expose turn marker spans to trace assertions. Some markers correspond to internal model generations; Codex SDK and app-server markers correspond to the protocol turn exposed by those APIs. The span name and convention depend on the provider:

| Provider                         | Turn span name pattern                     | What a counted span represents                                                                                                          |
| -------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `anthropic:claude-agent-sdk`     | `gen_ai.turn *`                            | One `assistant` message from the SDK stream; an internal LLM round (includes subagent rounds — see the caveat below)                    |
| `azure:foundry-agent`            | `gen_ai.turn *`                            | One Responses API invocation in the function-call loop; an internal LLM round (cache hits emit no turn span — see the caveat below)     |
| `openai:agents` (TypeScript)     | `response *` (preferred) or `generation *` | `openai-agents-js` emits `response <id>` per LLM round; `generation *` is also produced when the SDK includes a `generation`-typed span |
| `openai-agents` Python (example) | `turn *` (preferred) or `response *`       | `promptfoo_tracing.py` emits `turn N <agent>` per LLM round, plus `response <id>`                                                       |
| Google ADK (via `google.adk`)    | `call_llm`                                 | Emitted by ADK's built-in OpenTelemetry instrumentation                                                                                 |
| `openai:codex-sdk`               | `gen_ai.turn *`                            | One SDK `thread.runStreamed()` turn, including its intermediate tool items                                                              |
| `openai:codex-app-server`        | `gen_ai.turn *`                            | One app-server `turn/start` lifecycle, including its internal model generations and tool items                                          |

For providers whose rows above identify an internal LLM round, counting these spans tells you how many model round-trips an agent took. Note that a tool-using task normally spans **at least two** rounds — one generation emits the tool calls and a later generation folds the results into the answer — so a low total turn count alone does **not** prove the tools were batched.

To assert that tools were **batched** into one generation (rather than issued across sequential rounds), check that the tool calls share a single `gen_ai.turn.index`. Every tool span for a `gen_ai.turn` provider carries that 1-based tag, so pair [`trajectory:tool-sequence`](/docs/configuration/expected-outputs/deterministic/#trajectorytool-sequence) with a JavaScript assertion:

```yaml
assert:
  - type: trajectory:tool-sequence
    value:
      mode: exact
      steps: [search_orders, search_orders]
  - type: javascript
    value: |
      // Both tool calls must have been emitted by the same LLM generation.
      const turns = context.trace.spans
        .filter((s) => s.attributes['tool.name'] && s.attributes['gen_ai.turn.index'] != null)
        .map((s) => s.attributes['gen_ai.turn.index']);
      return turns.length >= 2 && new Set(turns).size === 1;
```

This is more robust than counting total `gen_ai.turn` spans: it stays correct regardless of how many follow-up answer rounds the agent takes, and (because subagent tool spans get the subagent turn's index) it does not conflate main-agent batching with subagent activity.

Codex SDK and app-server turn markers are still useful for correlating item spans and token usage to a provider turn, but they cannot distinguish batched from sequential tool calls within that turn because those APIs do not expose internal model-generation boundaries.

:::note Caveats

- **Subagents emit their own turns.** For `anthropic:claude-agent-sdk`, every `assistant` message — including subagent rounds — emits a `gen_ai.turn` span and tags its tool spans with that subagent turn's index. Subagent turns carry `gen_ai.turn.is_subagent: true` (plus `gen_ai.turn.parent_tool_use_id` and `gen_ai.turn.subagent_type`); filter on those attributes when you need to reason about main-agent rounds only.
- **Cache hits emit no turn span.** A cached response (e.g. `azure:foundry-agent` with caching enabled) still emits the parent `chat <model>` span, but performs no LLM round and therefore emits zero `gen_ai.turn` spans. Run with `--no-cache`, or scope `min`/`max` assertions to fresh responses, when counting turns.

:::

For providers emitting `gen_ai.turn` spans, each tool span is additionally tagged with `gen_ai.turn.index` (1-based), so JavaScript assertions can group tool calls by the generation that emitted them.

External providers that wrap their own agent loops can adopt the same convention: emit one OpenTelemetry span per LLM round, with name starting `gen_ai.turn ` and the attribute `gen_ai.turn.index`.

## Configuration Reference

### Basic Configuration

```yaml
tracing:
  enabled: true # Enable/disable tracing
  # Abort the eval if the OTLP receiver can't start (default: false — log and continue without traces)
  failOnReceiverStartFailure: true
  # Extra tool names treated as command steps, merged with the built-ins (shell, exec_command, local_shell)
  commandToolNames: ['bash']
  otlp:
    http:
      enabled: true # Required to start the OTLP receiver
      # port: 4318   # Optional - defaults to 4318 (standard OTLP HTTP port)
      # host: '127.0.0.1'  # Optional - defaults to loopback
      # acceptFormats: ['json', 'protobuf']  # Optional - defaults to both
      # redactAttributes: ['tool.arguments', 'authorization']  # Replace matched values before storage
  storage:
    type: sqlite # sqlite is the only supported store
    # Remove trace and span records older than this many days
    retentionDays: 30
```

`redactAttributes` is matched case-insensitively as a **substring** of each attribute
key, so short patterns over-match: `token` also matches `gen_ai.usage.total_tokens`, and
`key` matches `monkey`. Prefer specific keys (e.g. `authorization`, `tool.arguments`).
Patterns are matched against each attribute key **at every nesting level individually**: a
nested key like `authorization` inside a `headers` object is matched by the pattern
`authorization`, but a full dotted path such as `request.headers.authorization` will **not**
match the nested leaf key — use the key's own name.
Redaction covers span **attributes** (recursively, including nested objects and arrays),
and a span `name` or `statusMessage` **only when it exactly echoes the value of a redacted
attribute**. A secret that appears solely in a span name, status/error message, or log
body — without also being a redacted attribute value — is not detected. Redaction also does
**not** scan arbitrary free text or trace `metadata` (such as test `vars`), so avoid placing
secrets in test variables when traces are retained.

:::warning Scope of `redactAttributes`

`redactAttributes` is applied by the **OTLP HTTP receiver** as spans are ingested over
`/v1/traces` and `/v1/logs`. Spans emitted by Promptfoo's **built-in provider
instrumentation** are exported in-process (not over HTTP) and are **not** filtered by
`redactAttributes`; values like `promptfoo.request.body` and request headers can therefore
be stored in the local trace DB. A built-in sanitizer still masks common credential-shaped
keys (`authorization`, `api_key`, `token`, `password`, `cookie`, …) when traces are read,
but custom keys you add to `redactAttributes` are only enforced on the HTTP ingest path.
Don't rely on `redactAttributes` alone to keep secrets out of the at-rest trace database.

:::

Trace retention (`storage.retentionDays`) prunes traces and spans older than the given number
of days from the local store at the **start of each traced eval**. The default is **30 days**,
applied only when a `storage` block is present — omit `storage` to keep traces indefinitely, or
set `retentionDays` to `0` or less to disable pruning. Pruning permanently deletes rows.

When several evaluations run in the same process (e.g. the Promptfoo server), they **share a
single OTLP receiver**: it starts on first use and stops when the last evaluation finishes. The
receiver's `host`, `port`, and `acceptFormats` are fixed at first startup, so a later overlapping
evaluation can't change them; per-evaluation `redactAttributes` and `commandToolNames`, however,
are tracked per trace so each evaluation's traces use its own policy.

For traces created by an evaluation, Promptfoo stores the evaluation's redaction and
`commandToolNames` policy with that trace so overlapping evaluations do not change one
another's results — each trace is redacted with its own policy, not the active receiver's.
Traces created only when spans arrive at the receiver (no evaluation row) use the
registered evaluation policy from `evaluation.id`, then fall back to the active receiver's
startup defaults. Similarly, `acceptFormats` configures the active HTTP receiver endpoint
and is not changed by an overlapping evaluation.

The OTLP receiver `host` defaults to loopback (`127.0.0.1`). If your exporter runs in a
different container or host and must reach the receiver over the network, set
`host: '0.0.0.0'` explicitly and restrict access to trusted networks.

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

For complete provider implementation details, see the [JavaScript Provider documentation](/docs/providers/custom-api/). For tracing-specific examples, see the [OpenTelemetry tracing example](https://github.com/promptfoo/promptfoo/tree/main/examples/integration-opentelemetry/javascript).

Key points:

- Use `SimpleSpanProcessor` for immediate trace export
- Extract the W3C trace context from `traceparent`
- Create child spans for each operation
- Set appropriate span attributes and status
- Add tool-oriented attributes like `tool.name` or `function.name` when you want to use trajectory assertions
- If you use Vercel AI SDK telemetry for tool calls, Promptfoo can normalize `ai.toolCall.name` plus the matching `ai.toolCall.args` / `ai.toolCall.arguments` / `ai.toolCall.input` attributes into trajectory tool steps

### Python

For complete provider implementation details, see the [Python Provider documentation](/docs/providers/python/). For a working example with protobuf tracing, see the [Python OpenTelemetry tracing example](https://github.com/promptfoo/promptfoo/tree/main/examples/integration-opentelemetry/python). For OpenAI Agents SDK workflows, use the built-in [JavaScript provider](/docs/providers/openai-agents) or the [Python SDK guide](/docs/guides/evaluate-openai-agents-python), depending on which SDK you are testing.

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

def call_api(prompt, options, context):
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

If you only need provider-level timing for a Python provider, enable the wrapper OTEL path by installing the Python OpenTelemetry packages and setting `PROMPTFOO_ENABLE_OTEL=true`. Add custom child spans only when you want internal workflow visibility such as tools, searches, or multi-step agent trajectories.

## Trace Visualization

Promptfoo includes a built-in trace viewer that displays all collected telemetry data. Since Promptfoo functions as an OTLP receiver, you can view traces directly without configuring external tools like Jaeger or Grafana Tempo.

The web UI displays traces as a hierarchical timeline showing:

- **Span hierarchy**: Parent-child relationships between operations
- **Duration bars**: Visual representation of operation timing
- **Status indicators**: Success (green), error (red), or unset (gray)
- **Hover details**: Span attributes, duration, and timestamps
- **Relative timing**: See which operations run in parallel vs. sequentially
- **Expandable details**: Click any span to reveal span attributes and metadata
- **Export functionality**: Download traces as JSON for external analysis

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

### Span Details Panel

Click the expand icon on any span to reveal a detailed attributes panel showing:

- **Span ID** and **Parent Span ID** for tracing relationships
- **Start** and **End** timestamps with precision
- **Duration** in a human-readable format
- **Status** (OK, ERROR, or UNSET)
- **Span attributes** including GenAI attributes, custom attributes, and Promptfoo-specific data

This is useful for inspecting the full request/response bodies (`promptfoo.request.body` and `promptfoo.response.body`) and debugging provider behavior.

Trace reads redact credential-like attribute keys such as authorization headers, cookies, API keys, tokens, secrets, and passwords before displaying or exporting spans. GenAI token counters such as `gen_ai.usage.input_tokens` remain visible. Avoid placing secrets in custom span attributes because raw attributes may still be retained in the local trace store for internal evaluation workflows.

### Exporting Traces

Click the **Export Traces** button to download all traces for the current evaluation or test case as a JSON file. The export includes:

- Evaluation ID and test case ID
- Export timestamp
- Trace data with spans and redacted attributes

The exported JSON can be imported into external tools like Jaeger, Grafana Tempo, or custom analysis scripts.

### Trace Linkage on Result Rows

When tracing is enabled, every `EvaluateResult` row carries `traceId` and `evaluationId` at the top level so external tooling can correlate result rows to traces without re-deriving the linkage:

```json
{
  "promptIdx": 0,
  "testIdx": 0,
  "success": true,
  "traceId": "b01f108667a48e148ee80deb42c7f16d",
  "evaluationId": "eval-Lie-2026-05-08T13:43:46",
  "metadata": { "...": "..." }
}
```

Use the `traceId` to look up an individual trace via `GET /api/traces/:traceId`, or pass the `evaluationId` to `GET /api/traces/evaluation/:evaluationId` to fetch every trace for the eval. Both fields are absent when tracing is not enabled for the row, so their presence is an unambiguous "this row was traced" signal.

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
// Service A: Forward trace context (import `propagation` from '@opentelemetry/api')
const headers = {};
propagation.inject(context.active(), headers);
await fetch(serviceB, { headers });

// Service B: Extract and continue trace
const extractedContext = propagation.extract(context.active(), request.headers);
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

- Explore the [OpenTelemetry tracing example (JavaScript)](https://github.com/promptfoo/promptfoo/tree/main/examples/integration-opentelemetry/javascript)
- Explore the [OpenTelemetry tracing example (Python)](https://github.com/promptfoo/promptfoo/tree/main/examples/integration-opentelemetry/python) - uses protobuf format
- Try the [red team tracing example](https://github.com/promptfoo/promptfoo/tree/main/examples/redteam-tracing-example)
- Set up forwarding to your observability platform
- Add custom instrumentation for your use case
- Use traces to optimize provider performance
