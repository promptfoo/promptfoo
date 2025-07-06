# auto-instrumentation

This example demonstrates automatic instrumentation for Python providers, showing the difference between manual, automatic, and hybrid approaches to OpenTelemetry tracing.

You can run this example with:

```bash
npx promptfoo@latest init --example auto-instrumentation
```

## Overview

This example compares three instrumentation approaches:

1. **Manual Instrumentation** - Explicit tracing code for full control
2. **Automatic Instrumentation** - Zero-code tracing via import
3. **Hybrid Instrumentation** - Combines auto and manual for best of both

## Features

- Zero-code instrumentation for common libraries
- Automatic tracing of HTTP calls, database queries, and LLM APIs
- Custom business logic spans with hybrid approach
- Side-by-side comparison of trace details

## Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Set Environment Variables

```bash
export OPENAI_API_KEY="your-openai-key"

# Optional: Configure OTLP endpoint
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
export OTEL_SERVICE_NAME="my-provider"
```

### 3. Run the Comparison

```bash
npx promptfoo eval
```

### 4. View Traces

```bash
npx promptfoo view
```

Click on any result's 🔎 icon to see the trace timeline.

## Understanding the Approaches

### Manual Instrumentation

```python
from tracing_utils import initialize_tracing

tracer = initialize_tracing("my-service")

with tracer.start_as_current_span("my_operation") as span:
    span.set_attribute("custom.attribute", "value")
    # Your code here
```

**Pros:**
- Full control over span names and attributes
- Can trace custom business logic
- Minimal overhead

**Cons:**
- Requires modifying code
- Easy to miss important operations
- More maintenance

### Automatic Instrumentation

```python
import auto_instrument  # That's it!

# All supported libraries are now traced automatically
import openai
import requests
import anthropic
```

**Pros:**
- Zero code changes required
- Comprehensive coverage
- Consistent span naming

**Cons:**
- Less control over span details
- May create too many spans
- Some overhead from instrumentation

### Hybrid Instrumentation

```python
import auto_instrument
from auto_instrument import traced_operation

# HTTP and LLM calls are auto-traced
# Add custom spans for business logic
with traced_operation("process_user_request") as span:
    span.set_attribute("user.tier", "premium")
    # Auto-instrumented calls happen here
```

**Pros:**
- Best of both worlds
- Auto-trace libraries, manual trace business logic
- Good balance of detail and effort

**Cons:**
- Need to understand both approaches
- Potential for duplicate spans if not careful

## Supported Auto-Instrumentation

The `auto_instrument` module automatically instruments:

### HTTP Libraries
- `requests` - HTTP requests
- `urllib3` - Lower-level HTTP
- `httpx` - Modern async HTTP

### LLM/AI Libraries
- `openai` - OpenAI API calls
- `anthropic` - Anthropic Claude API
- `langchain` - LangChain operations

### Databases
- `sqlalchemy` - SQL queries
- `redis` - Redis operations

### Cloud Services
- `boto3` / `botocore` - AWS SDK

### Coming Soon
- `transformers` - Hugging Face
- `pinecone` - Vector databases
- `chromadb` - Embeddings DB

## Trace Comparison

When you run the evaluation, you'll see different trace patterns:

### Manual Provider Traces
```
manual_provider.call_api
  └── openai.chat.completions (manual)
```
- Only explicitly traced operations appear
- Custom attributes on spans
- Precise control

### Auto Provider Traces
```
http.request (to OpenAI API)
  └── openai.chat.completions.create
      └── http.response
```
- All HTTP calls traced
- Library-specific spans
- Automatic error capture

### Hybrid Provider Traces
```
hybrid_provider.process_request
  ├── http.request (safety check)
  ├── openai.chat.completions.create
  └── hybrid_provider.enhance_response
```
- Mix of manual and auto spans
- Business logic clearly visible
- Library calls still traced

## Configuration

### Environment Variables

```bash
# OpenTelemetry configuration
OTEL_SERVICE_NAME=my-provider
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_RESOURCE_ATTRIBUTES=deployment.environment=production

# Disable specific instrumentations
OTEL_PYTHON_DISABLED_INSTRUMENTATIONS=redis,sqlalchemy

# Set trace sampling rate (0.0 to 1.0)
OTEL_TRACES_SAMPLER_ARG=0.1
```

### Selective Instrumentation

To instrument only specific libraries:

```python
# Instead of auto_instrument, manually instrument
from opentelemetry.instrumentation.openai import OpenAIInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor

OpenAIInstrumentor().instrument()
RequestsInstrumentor().instrument()
```

## Performance Considerations

1. **Overhead** - Auto-instrumentation adds ~1-5ms per operation
2. **Memory** - Each span uses ~1KB of memory
3. **Network** - Traces are batched, minimal impact
4. **Sampling** - Use sampling in production to reduce volume

## Best Practices

1. **Start with Auto** - Get immediate visibility
2. **Add Manual Spans** - For important business logic
3. **Use Attributes** - Add context to spans
4. **Handle Errors** - Record exceptions in spans
5. **Sample in Production** - Don't trace everything

## Troubleshooting

### No Traces Appearing

1. Check OTLP endpoint is reachable
2. Verify instrumentation is loaded
3. Check for errors in console

### Too Many Spans

1. Disable unwanted instrumentations
2. Use sampling
3. Filter in your observability platform

### Missing Custom Attributes

1. Ensure spans are active when setting
2. Check attribute key naming
3. Verify span is not already ended

## Next Steps

- Export traces to Jaeger, Zipkin, or cloud platforms
- Create custom instrumentations for your libraries
- Build trace-based alerts and dashboards
- Use trace data for performance optimization 