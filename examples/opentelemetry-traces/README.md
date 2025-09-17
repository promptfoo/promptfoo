# OpenTelemetry Traces Replay Example

This example demonstrates how to replay conversations from OpenTelemetry traces using promptfoo's custom provider system.

## Overview

This workflow allows you to:
- Replay conversations captured in OpenTelemetry traces
- Preserve trace metadata like latency, model information, and user context
- Analyze conversation quality and performance metrics from production traces

## Files

- `production-traces.json` - Sample OTLP trace data with conversation spans
- `otlp-replay-provider.js` - Custom provider that parses OTLP traces and replays conversations
- `promptfooconfig.yaml` - Configuration for OTLP trace replay evaluation
- `README.md` - This file

## Sample Data

The OTLP traces contain two realistic customer service conversations:

1. **Login Issue** (`otlp_sess_001`) - User can't access dashboard, agent troubleshoots with cache clearing and password reset
2. **Enterprise Upgrade** (`otlp_sess_002`) - Business user inquires about enterprise plan features and migration

Each trace includes rich metadata:
- LLM model used (gpt-4-turbo)
- Response latency (2800ms, etc.)
- User IDs and conversation intents
- Trace and span IDs for correlation

## OTLP Trace Structure

The traces follow OpenTelemetry format with conversation data stored as span attributes:

```json
{
  "traceId": "A1B2C3D4E5F67890123456789ABCDEF0",
  "spanId": "1234567890ABCDEF",
  "name": "conversation.turn",
  "attributes": [
    {"key": "conversation.session_id", "value": {"stringValue": "otlp_sess_001"}},
    {"key": "conversation.role", "value": {"stringValue": "user"}},
    {"key": "conversation.content", "value": {"stringValue": "message text"}},
    {"key": "llm.model", "value": {"stringValue": "gpt-4-turbo"}},
    {"key": "llm.response.latency_ms", "value": {"intValue": "2800"}}
  ]
}
```

## Running the Example

1. Install promptfoo if you haven't already:
   ```bash
   npm install -g promptfoo
   ```

2. Run the trace replay evaluation:
   ```bash
   promptfoo eval -c promptfooconfig.yaml -o results/otlp-replay.json
   ```

3. View results in web UI:
   ```bash
   promptfoo view results/otlp-replay.json
   ```

## What the Tests Check

### Conversation Quality Analysis
- **Login Troubleshooting**: Verifies agent follows logical diagnostic steps (cache clearing → password reset)
- **Enterprise Sales**: Checks for proper lead qualification and feature explanation
- **Professional Tone**: Ensures all conversations maintain helpful, professional communication

### Metadata Preservation
- **Trace Correlation**: Validates that trace IDs and span IDs are preserved
- **Performance Metrics**: Checks that latency information is captured
- **Intent Classification**: Verifies conversation intents from trace attributes

### Technical Validation
- **OTLP Parsing**: Ensures the provider correctly parses OTLP trace format
- **Turn Ordering**: Validates conversations are reconstructed in correct sequence
- **Metadata Enrichment**: Confirms additional context (models, latency) is available

## Understanding Results

In the promptfoo web UI, you'll see:
- ✅ **Quality scores** for conversation effectiveness
- 📊 **Performance data** like average response latency from traces
- 🏷️ **Metadata insights** including models used, user context, and intents
- 🔗 **Trace correlation** with original trace and span IDs

## Production Integration

To use this with your real OTLP traces:

### Step 1: Export Traces
```bash
# From Jaeger
curl "http://jaeger:16686/api/traces?service=your-agent&lookback=1h" > traces.json

# From Zipkin
curl "http://zipkin:9411/api/v2/traces?serviceName=your-agent&endTs=$(date +%s)000" > traces.json

# From Tempo/Grafana
curl "http://tempo:3200/api/traces?q={service.name=\"your-agent\"}" > traces.json
```

### Step 2: Standardize Attributes
Ensure your traces include these span attributes:
- `conversation.session_id` - Unique conversation identifier
- `conversation.role` - "user" or "assistant"
- `conversation.content` - Message text
- `conversation.turn_number` - Turn sequence number
- `llm.model` - Model name (optional)
- `llm.response.latency_ms` - Response time (optional)

### Step 3: Update Configuration
```yaml
providers:
  - file://otlp-replay-provider.js
    config:
      traceFile: './your-production-traces.json'

tests:
  - vars:
      sessionId: 'your_session_id'
    # Add your domain-specific assertions
```

## Benefits of OTLP Replay

1. **Rich Context**: Preserves performance metrics and system context
2. **Industry Standard**: Works with any OpenTelemetry-compatible system
3. **Correlation**: Links conversation quality with system performance
4. **Scalability**: Can process large volumes of trace data
5. **Integration**: Fits into existing observability workflows

## Common OTLP Attributes for Conversations

| Attribute | Purpose | Example |
|-----------|---------|---------|
| `conversation.session_id` | Group turns into conversations | `"sess_123"` |
| `conversation.turn_number` | Order messages correctly | `1, 2, 3...` |
| `conversation.role` | Identify speaker | `"user"`, `"assistant"` |
| `conversation.content` | Message text | `"How do I reset my password?"` |
| `llm.model` | Model used for response | `"gpt-4-turbo"` |
| `llm.response.latency_ms` | Response time | `2800` |
| `user.id` | User identifier | `"user_123"` |
| `conversation.intent` | Classified intent | `"password_reset"` |
| `conversation.channel` | Communication channel | `"web_chat"`, `"slack"` |

This approach leverages your existing observability infrastructure to enable powerful conversation analysis and quality assurance.