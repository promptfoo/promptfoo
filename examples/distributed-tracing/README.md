# distributed-tracing

This example demonstrates distributed tracing across multiple microservices, showing how to propagate trace context and correlate operations across service boundaries.

You can run this example with:

```bash
npx promptfoo@latest init --example distributed-tracing
```

## Overview

This example simulates a microservices architecture with:
- **Orchestrator** - Coordinates calls to multiple services
- **Search Service** - Retrieves relevant documents
- **RAG Pipeline** - Processes and generates responses
- **Gateway** - API gateway that routes requests

## Features

- W3C Trace Context propagation between services
- Service dependency visualization
- Error tracking across service boundaries
- Performance bottleneck identification
- Cache hit/miss tracking

## Architecture

```
[Client Request]
       ↓
[API Gateway] ←→ [Auth Service]
       ↓
[Orchestrator]
    ├→ [Search Service] → [Vector DB]
    ├→ [RAG Pipeline] → [LLM Service]
    └→ [Cache Service]
```

## Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
npm install
```

### 2. Configure Services

```bash
# Set API keys
export OPENAI_API_KEY="your-key"

# Configure trace forwarding (optional)
export OTLP_COLLECTOR_ENDPOINT="http://jaeger:4318"
export OTLP_AUTH_TOKEN="your-token"
```

### 3. Run the Evaluation

```bash
npx promptfoo eval
```

### 4. View Distributed Traces

```bash
npx promptfoo view
```

Click on any result to see the full distributed trace across all services.

## Understanding Distributed Traces

### Trace Propagation

Each service extracts and propagates trace context:

```python
# Extract incoming trace context
from opentelemetry.propagate import extract
ctx = extract(request.headers)

# Create child span
with tracer.start_span("operation", context=ctx):
    # ... do work ...
    
    # Propagate to downstream service
    headers = {}
    inject(headers)
    requests.post(downstream_url, headers=headers)
```

### Service Dependencies

The trace view shows:
- Which services were called
- Call order and parallelism
- Time spent in each service
- Data flow between services

### Example Trace

```
[Gateway: 500ms]
  └─[Orchestrator: 480ms]
      ├─[Auth Check: 20ms]
      ├─[Search Service: 150ms]
      │   └─[Vector DB Query: 120ms]
      ├─[RAG Pipeline: 250ms]
      │   ├─[Context Preparation: 50ms]
      │   └─[LLM Generation: 180ms]
      └─[Cache Write: 30ms]
```

## Service Examples

### Orchestrator Service

Coordinates multiple service calls:

```python
with tracer.start_as_current_span("orchestrator.process"):
    # Call search service
    search_results = await search_service.search(query)
    
    # Call RAG with results
    response = await rag_service.generate(query, search_results)
    
    # Cache the result
    await cache_service.set(query, response)
```

### Search Service

Handles document retrieval:

```javascript
const span = tracer.startSpan('search.query');
span.setAttribute('query.terms', query.split(' ').length);

const results = await vectorDB.search(query);
span.setAttribute('results.count', results.length);
```

### Error Propagation

Errors are tracked across service boundaries:

```python
try:
    result = await downstream_service.call()
except ServiceError as e:
    span.record_exception(e)
    span.set_status(StatusCode.ERROR)
    # Error appears in all parent spans
    raise
```

## Testing Scenarios

### 1. Happy Path
Tests normal operation flow through all services.

### 2. Cache Hit
Tests behavior when results are cached.

### 3. Service Failure
Tests error handling when a service fails.

### 4. Timeout Handling
Tests behavior under slow service conditions.

## Performance Analysis

Use traces to identify:

1. **Bottlenecks** - Which service is slowest?
2. **Parallelization** - Can services be called concurrently?
3. **Caching** - Where would caching help most?
4. **Retries** - Are failed requests being retried?

## Best Practices

### 1. Consistent Service Names

```python
tracer = initialize_tracing("my-service")  # Use everywhere
```

### 2. Meaningful Span Names

```python
# Good
"database.users.find_by_id"
"cache.products.get"
"http.post./api/orders"

# Less useful
"operation"
"process"
"handle"
```

### 3. Add Service Context

```python
span.set_attributes({
    "service.version": "1.2.3",
    "deployment.environment": "production",
    "host.name": socket.gethostname()
})
```

### 4. Track Business Metrics

```python
span.set_attributes({
    "order.total": order_total,
    "user.tier": user.subscription_tier,
    "feature.flags": enabled_features
})
```

## Forwarding to External Systems

### Jaeger

```yaml
forwarding:
  enabled: true
  endpoint: 'http://jaeger:4318'
```

### Grafana Tempo

```yaml
forwarding:
  enabled: true
  endpoint: 'http://tempo:4318'
  headers:
    X-Scope-OrgID: 'your-org'
```

### DataDog

```yaml
forwarding:
  enabled: true
  endpoint: 'http://datadog-agent:4318'
  headers:
    DD-API-KEY: '${DD_API_KEY}'
```

## Troubleshooting

### Missing Service Spans

1. Verify trace context propagation
2. Check service has OTLP endpoint configured
3. Ensure headers are passed correctly

### Broken Traces

1. Check all services use same trace ID format
2. Verify time synchronization between services
3. Ensure no middleware strips headers

### Performance Impact

1. Use batch span processors in production
2. Sample traces (e.g., 10% sampling rate)
3. Limit span attributes size

## Next Steps

- Deploy services to Kubernetes with distributed tracing
- Set up Grafana dashboards from trace metrics
- Create SLO alerts based on trace data
- Build service dependency graphs
- Implement trace-based testing 