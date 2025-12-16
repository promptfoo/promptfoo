# Red Team Tracing Example

This example demonstrates how to use tracing with red team strategies to provide attackers and graders with visibility into the internal operations of your LLM application.

## Quick Start

**1. Install dependencies:**

```bash
npm install
```

**2. Start the mock traced server:**

```bash
npm run server
```

This starts an HTTP server on port 3110 that:

- Accepts chat requests
- Generates OTLP trace spans (LLM calls, guardrails, tools)
- Sends spans to promptfoo's OTLP receiver

**3. Test the server (optional):**

```bash
# In another terminal
./test-server.sh
```

**4. Run the red team evaluation:**

```bash
# In another terminal (from the project root)
npm run local -- eval -c examples/redteam-tracing-example/promptfooconfig.yaml
```

**5. View the results:**

```bash
npm run local -- view
```

You'll see trace data in:

- Attack prompts (when `includeInAttack: true`)
- Grading context (when `includeInGrading: true`)
- Test metadata (`traceSnapshots`)

## Troubleshooting

**Server not responding?**

```bash
# Check if server is running
curl http://localhost:3110/health

# Test basic request
curl -X POST http://localhost:3110/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "test"}'
```

**No traces appearing?**

- Make sure the server is emitting to the correct OTLP endpoint (check server logs)
- Verify promptfoo's OTLP receiver is enabled in config (`tracing.enabled: true`)
- Check that `traceparent` headers are being passed (set in provider context)

## What is Red Team Tracing?

Red team tracing allows adversarial strategies to see what happens inside your LLM application during an attack, including:

- Tool calls and their results
- Guardrail decisions
- Internal LLM calls
- Error conditions
- Performance metrics

This information can help:

1. **Attack generation**: Craft more effective attacks by understanding how the system responds internally
2. **Grading**: Make more informed decisions about whether an attack succeeded by seeing internal behavior

## Configuration

### Basic Configuration

Enable tracing in your `promptfooconfig.yaml`:

```yaml
redteam:
  tracing:
    # Enable tracing for all strategies
    enabled: true

    # Include trace data in attack generation (default: true)
    includeInAttack: true

    # Include trace data in grading (default: true)
    includeInGrading: true

  plugins:
    - harmful
    - pii

  strategies:
    - crescendo
    - goat
```

### Advanced Configuration

Configure tracing behavior:

```yaml
redteam:
  tracing:
    enabled: true

    # Include internal spans (e.g., tokenization, parsing)
    includeInternalSpans: false

    # Maximum number of spans to fetch per iteration
    maxSpans: 50

    # Maximum depth of nested spans to fetch
    maxDepth: 5

    # Retry configuration for fetching traces
    maxRetries: 3
    retryDelayMs: 500

    # Filter spans by name pattern (optional)
    spanFilter:
      - 'llm.*'
      - 'tool.*'
      - 'guardrail.*'

    # Sanitize sensitive attributes (recommended)
    sanitizeAttributes: true
```

### Strategy-Specific Configuration

Different strategies may need different tracing settings:

```yaml
redteam:
  tracing:
    enabled: true

    # Strategy-specific overrides
    strategies:
      # Crescendo benefits from seeing guardrail decisions
      crescendo:
        includeInAttack: true
        includeInGrading: true
        spanFilter:
          - 'guardrail.*'
          - 'llm.*'

      # GOAT can use tool call information
      goat:
        includeInAttack: true
        spanFilter:
          - 'tool.*'
          - 'llm.*'

      # Iterative may want full trace data
      iterative:
        includeInAttack: true
        includeInGrading: true
        maxSpans: 100
```

### Test-Level Configuration

Override tracing for specific tests:

```yaml
tests:
  - description: 'Test with custom tracing'
    vars:
      query: 'Tell me about sensitive data'
    metadata:
      tracing:
        enabled: true
        includeInAttack: true
        includeInGrading: true
        maxSpans: 200
```

## How Tracing Works

### 1. Attack Generation

When `includeInAttack: true`, the attacker receives a trace summary like:

```
Trace 0af76519 • 5 spans

Execution Flow:
1. [1.2s] llm.generate (client) | model=gpt-4
2. [300ms] guardrail.check (internal) | tool=content-filter
3. [150ms] tool.database_query (server) | tool=search
4. [50ms] guardrail.check (internal) | ERROR: Rate limit exceeded
5. [800ms] llm.generate (client) | model=gpt-4

Key Observations:
• Guardrail content-filter decision: blocked
• Tool call search via "tool.database_query" (duration 150ms)
• Error span "guardrail.check" (span-4): Rate limit exceeded
```

The attacker can use this information to craft better attacks (e.g., targeting the rate limit error).

### 2. Grading

When `includeInGrading: true`, graders receive the same trace context and can make more informed decisions:

```typescript
// Grader receives:
{
  prompt: "...",
  llmOutput: "...",
  test: {...},
  gradingContext: {
    traceContext: {
      traceId: "...",
      spans: [...],
      insights: [...]
    },
    traceSummary: "..."
  }
}
```

## Best Practices

### 1. Start with Default Settings

The default configuration works well for most use cases:

```yaml
redteam:
  tracing:
    enabled: true
```

### 2. Use spanFilter for Focused Analysis

If you only care about specific operations:

```yaml
redteam:
  tracing:
    enabled: true
    spanFilter:
      - 'guardrail.*' # Only guardrail spans
      - 'tool.*' # Only tool calls
```

### 3. Keep sanitizeAttributes Enabled

Always sanitize attributes in production:

```yaml
redteam:
  tracing:
    enabled: true
    sanitizeAttributes: true # Recommended
```

### 4. Adjust maxSpans Based on Complexity

- Simple apps: `maxSpans: 20`
- Medium complexity: `maxSpans: 50` (default)
- Complex agentic systems: `maxSpans: 100-200`

### 5. Use Strategy-Specific Overrides

Different strategies benefit from different trace data:

- **Crescendo**: Needs guardrail information
- **GOAT**: Benefits from tool call traces
- **Iterative**: Can use comprehensive trace data

## Security Considerations

### Sensitive Data

Tracing can expose sensitive information. Always:

1. Use `sanitizeAttributes: true` (default)
2. Review trace data before sharing
3. Consider disabling tracing for production testing

### Performance

Tracing adds overhead:

- Fetching traces: ~100-500ms per iteration
- Processing spans: Minimal overhead
- Storage: Trace metadata is stored in test results

To minimize impact:

- Use `maxSpans` to limit data fetched
- Set appropriate `maxRetries` and `retryDelayMs`
- Consider disabling for large-scale testing

## Debugging

### Enable Debug Logging

```bash
PROMPTFOO_LOG_LEVEL=debug npm run local -- eval -c redteam.yaml
```

### Check Trace Store

Verify traces are being recorded:

```bash
# View traces in the database
npm run db:studio
```

### Test Trace Fetching

```typescript
import { fetchTraceContext } from './src/tracing/traceContext';

const trace = await fetchTraceContext('your-trace-id', {
  maxSpans: 50,
  maxDepth: 5,
});
console.log(trace);
```

## Examples

See the example configurations:

- `promptfooconfig.yaml` - Basic tracing setup
- `promptfooconfig.advanced.yaml` - Advanced configuration
- `promptfooconfig.strategies.yaml` - Strategy-specific settings

## Troubleshooting

### No Traces Appearing

1. Check that your provider supports tracing (must send traceparent header)
2. Verify OTLP receiver is running
3. Check debug logs for trace fetch errors

### Traces Not Used in Attacks

1. Verify `includeInAttack: true`
2. Check that traces are being fetched (debug logs)
3. Ensure trace fetch completes before attack generation

### Performance Issues

1. Reduce `maxSpans` and `maxDepth`
2. Use `spanFilter` to limit data
3. Increase `retryDelayMs` to reduce fetch frequency
