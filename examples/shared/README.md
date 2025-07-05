# Shared Tracing Utilities

This directory contains shared OpenTelemetry tracing utilities that can be used across different Promptfoo examples.

## Overview

The tracing utilities provide a consistent way to add OpenTelemetry instrumentation to your agent providers, making it easy to:

- Track agent execution flow
- Monitor tool usage
- Measure performance
- Debug errors
- Correlate traces with Promptfoo evaluations

## Files

- `tracing-utils.js` - JavaScript/Node.js tracing utilities
- `tracing_utils.py` - Python tracing utilities

## Installation

### JavaScript/Node.js

```bash
npm install @opentelemetry/api @opentelemetry/sdk-trace-node \
  @opentelemetry/exporter-trace-otlp-http @opentelemetry/sdk-trace-base \
  @opentelemetry/resources @opentelemetry/semantic-conventions
```

### Python

```bash
pip install opentelemetry-api opentelemetry-sdk \
  opentelemetry-exporter-otlp opentelemetry-instrumentation
```

## Usage

### JavaScript Example

```javascript
const { createTracedProvider } = require('../shared/tracing-utils');

// Your original provider function
async function myProvider(prompt, options, context) {
  // Your agent logic here
  return { output: "Response" };
}

// Export the traced version
module.exports = createTracedProvider(myProvider, {
  serviceName: 'my-agent',
  providerType: 'agent'
});
```

### Python Example

```python
from shared.tracing_utils import create_traced_provider

# Your original provider function
def my_provider(prompt, options, context):
    # Your agent logic here
    return {"output": "Response"}

# Create and use the traced version
call_api = create_traced_provider(
    my_provider,
    service_name="my-agent",
    provider_type="agent"
)
```

## Features

### 1. Automatic Provider Tracing

Wrap any provider function to automatically track:
- Prompt text and length
- Response success/failure
- Response length
- Execution time
- Errors with stack traces

### 2. Tool Function Tracing

Track individual tool calls within agents:

```javascript
const { wrapToolWithTracing, initializeTracing } = require('../shared/tracing-utils');

const tracer = initializeTracing('my-agent');

const tracedTool = wrapToolWithTracing({
  name: 'search',
  func: async (query) => {
    // Tool implementation
    return results;
  }
}, tracer);
```

### 3. Trace Context Propagation

Automatically propagates W3C trace context from Promptfoo:

```javascript
const { runWithTraceContext } = require('../shared/tracing-utils');

async function callApi(prompt, options, promptfooContext) {
  return runWithTraceContext(promptfooContext, async () => {
    // Your code runs within the trace context
  });
}
```

### 4. Custom Span Creation

Add custom spans for specific operations:

```python
from shared.tracing_utils import wrap_with_tracing, initialize_tracing

tracer = initialize_tracing("my-service")

@wrap_with_tracing("custom_operation", tracer)
def my_operation(data):
    # Your operation logic
    return process(data)
```

## Configuration

### Enable Tracing in Promptfoo

Add to your `promptfooconfig.yaml`:

```yaml
tracing:
  enabled: true
  otlp:
    http:
      enabled: true
      port: 4318  # Default OTLP HTTP port
```

### Environment Variables

You can configure the OTLP endpoint:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
export OTEL_SERVICE_NAME="my-agent"
```

## Viewing Traces

1. Run your evaluation with tracing enabled:
   ```bash
   promptfoo eval
   ```

2. View traces in the Promptfoo UI:
   ```bash
   promptfoo view
   ```

3. Click the magnifying glass icon on any test result to see the trace timeline

## Best Practices

1. **Use Semantic Names**: Use descriptive span names that follow a hierarchy (e.g., `agent.run`, `tool.search`)

2. **Add Relevant Attributes**: Include attributes that help with debugging:
   ```javascript
   span.setAttribute('user.id', userId);
   span.setAttribute('request.type', requestType);
   ```

3. **Handle Errors Properly**: Always record exceptions and set error status:
   ```python
   try:
       result = operation()
   except Exception as e:
       span.record_exception(e)
       span.set_status(StatusCode.ERROR, str(e))
       raise
   ```

4. **Avoid Sensitive Data**: Don't include passwords, API keys, or PII in traces

5. **Use Resource Attributes**: Set service-level attributes during initialization

## Integration with External Collectors

To send traces to external systems (Jaeger, Tempo, etc.), update the endpoint:

```javascript
const tracer = initializeTracing(
  'my-service',
  'http://jaeger-collector:4318/v1/traces'
);
```

Or configure forwarding in Promptfoo:

```yaml
tracing:
  enabled: true
  otlp:
    http:
      enabled: true
  forwarding:
    enabled: true
    endpoint: 'http://tempo:4318'
    headers:
      'api-key': '${OBSERVABILITY_API_KEY}'
```

## Troubleshooting

### Traces Not Appearing

1. Verify tracing is enabled in configuration
2. Check that OTLP receiver is running (port 4318)
3. Ensure trace context is being passed correctly
4. Look for errors in console output

### Performance Impact

- Tracing adds ~1-2ms overhead per span
- Use sampling for high-volume scenarios
- Consider BatchSpanProcessor for production

### Debug Logging

Enable debug logs:

```bash
# Promptfoo debug logs
DEBUG=promptfoo:* promptfoo eval

# OpenTelemetry debug logs
OTEL_LOG_LEVEL=debug promptfoo eval
``` 