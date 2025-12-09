# opentelemetry-tracing-python (Python OpenTelemetry Tracing Example)

This example demonstrates how to use OpenTelemetry with Python to trace the internal operations of your LLM providers during Promptfoo evaluations. It uses the **protobuf format** for trace export, which is the default and most efficient format for the Python OpenTelemetry SDK.

## Quick Start

```bash
npx promptfoo@latest init --example opentelemetry-tracing-python
cd opentelemetry-tracing-python

# Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the evaluation
npx promptfoo@latest eval
npx promptfoo@latest view
```

## Environment Variables

This example requires no API keys - it uses a simulated provider that demonstrates tracing patterns.

## Overview

This example showcases:

- **Python OpenTelemetry SDK** - Using the official Python SDK for tracing
- **Protobuf format** - The `opentelemetry-exporter-otlp-proto-http` package sends traces in protobuf format (`application/x-protobuf`), which is more efficient than JSON
- **Distributed tracing** - Parsing W3C Trace Context from Promptfoo and creating child spans
- **Trace assertions** - Validating trace structure and performance

## How It Works

1. **Promptfoo starts the OTLP receiver** on port 4318
2. **Promptfoo generates a trace context** for each test case (W3C Trace Context format)
3. **The Python provider receives the trace context** via `promptfoo_context['traceparent']`
4. **The provider creates child spans** using the OpenTelemetry Python SDK
5. **Traces are exported in protobuf format** to Promptfoo's OTLP endpoint
6. **Promptfoo correlates traces** with test cases for analysis

## Files in This Example

| File                   | Description                                        |
| ---------------------- | -------------------------------------------------- |
| `promptfooconfig.yaml` | Evaluation config with tracing enabled             |
| `provider.py`          | Python provider with OpenTelemetry instrumentation |
| `requirements.txt`     | Python dependencies (OpenTelemetry SDK)            |

## Protobuf vs JSON

Python's OpenTelemetry SDK uses **protobuf by default** when using `opentelemetry-exporter-otlp-proto-http`:

| Format   | Content-Type             | Package                                  |
| -------- | ------------------------ | ---------------------------------------- |
| Protobuf | `application/x-protobuf` | `opentelemetry-exporter-otlp-proto-http` |
| JSON     | `application/json`       | `opentelemetry-exporter-otlp-http`       |

Protobuf is more efficient for serialization/deserialization and produces smaller payloads, making it the recommended format for production use.

## Provider Implementation

The key parts of the Python provider:

### 1. Initialize OpenTelemetry

```python
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor

resource = Resource.create({
    "service.name": "my-python-provider",
    "service.version": "1.0.0",
})

exporter = OTLPSpanExporter(
    endpoint="http://localhost:4318/v1/traces",
)

# Use SimpleSpanProcessor for synchronous export
# This ensures spans are exported before the provider returns
provider = TracerProvider(resource=resource)
provider.add_span_processor(SimpleSpanProcessor(exporter))
trace.set_tracer_provider(provider)

tracer = trace.get_tracer("my-python-provider")
```

> **Note:** This example uses `SimpleSpanProcessor` for synchronous, immediate export. This ensures spans are sent before the provider returns. For production use with higher throughput, consider `BatchSpanProcessor`, but be sure to call `processor.force_flush()` before returning from your provider.

### 2. Parse Trace Context

```python
import re
from opentelemetry.trace import SpanContext, TraceFlags

def parse_traceparent(traceparent: str) -> SpanContext | None:
    match = re.match(r"^(\d{2})-([a-f0-9]{32})-([a-f0-9]{16})-(\d{2})$", traceparent)
    if not match:
        return None

    version, trace_id, parent_id, trace_flags = match.groups()

    return SpanContext(
        trace_id=int(trace_id, 16),
        span_id=int(parent_id, 16),
        is_remote=True,
        trace_flags=TraceFlags(int(trace_flags, 16)),
    )
```

### 3. Create Child Spans

```python
from opentelemetry.trace import SpanKind, Status, StatusCode

def call_api(prompt: str, options: dict, promptfoo_context: dict) -> dict:
    traceparent = promptfoo_context.get("traceparent")

    if traceparent:
        span_context = parse_traceparent(traceparent)
        ctx = trace.set_span_in_context(trace.NonRecordingSpan(span_context))

        with tracer.start_as_current_span(
            "my_operation",
            context=ctx,
            kind=SpanKind.SERVER,
        ) as span:
            # Your provider logic here
            result = do_work()
            span.set_status(Status(StatusCode.OK))
            return {"output": result}

    return {"output": do_work()}
```

## Trace-Based Assertions

This example uses several trace assertion types:

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

Click on any test result to see the "Trace Timeline" section.

## Dependencies

| Package                                  | Version  | Purpose                       |
| ---------------------------------------- | -------- | ----------------------------- |
| `opentelemetry-api`                      | >=1.28.0 | Core tracing API              |
| `opentelemetry-sdk`                      | >=1.28.0 | SDK implementation            |
| `opentelemetry-exporter-otlp-proto-http` | >=1.28.0 | OTLP HTTP exporter (protobuf) |
| `opentelemetry-semantic-conventions`     | >=0.49b0 | Standard attribute names      |

## Troubleshooting

### Traces Not Appearing

1. Verify `tracing.enabled: true` in config
2. Check OTLP receiver is running (look for port 4318 in logs)
3. Ensure `processor.force_flush()` is called before returning
4. Check the trace context is properly parsed from `promptfoo_context['traceparent']`

### Import Errors

Make sure all dependencies are installed:

```bash
pip install -r requirements.txt
```

### Connection Refused

Ensure Promptfoo's OTLP receiver is running on port 4318. The receiver starts automatically when `tracing.enabled: true` is set in your config.

## See Also

- [OpenTelemetry Tracing (JavaScript)](../opentelemetry-tracing/) - JavaScript version using JSON format
- [Promptfoo Tracing Documentation](https://promptfoo.dev/docs/tracing/)
