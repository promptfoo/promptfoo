# External Log Format Examples for Conversation Replay

This document provides examples of how to ingest and replay conversations from various external logging and tracing systems.

## 1. OpenTelemetry Traces

### Example OTLP Trace with Conversation Data
```json
{
  "resourceSpans": [{
    "resource": {
      "attributes": [{
        "key": "service.name",
        "value": { "stringValue": "chat-agent" }
      }]
    },
    "scopeSpans": [{
      "spans": [{
        "traceId": "5B8EFFF798038103D269B633813FC60C",
        "spanId": "EEE19B7EC3C1B173",
        "name": "conversation.turn",
        "startTimeUnixNano": "1704067200000000000",
        "endTimeUnixNano": "1704067201500000000",
        "attributes": [
          {
            "key": "conversation.session_id",
            "value": { "stringValue": "sess_12345" }
          },
          {
            "key": "conversation.turn_number",
            "value": { "intValue": "1" }
          },
          {
            "key": "llm.request.prompt",
            "value": { "stringValue": "How do I reset my password?" }
          },
          {
            "key": "llm.response.content",
            "value": { "stringValue": "I can help you reset your password. Please provide your email address." }
          },
          {
            "key": "llm.model",
            "value": { "stringValue": "gpt-4" }
          },
          {
            "key": "llm.response.latency_ms",
            "value": { "intValue": "1200" }
          }
        ]
      },
      {
        "traceId": "5B8EFFF798038103D269B633813FC60C",
        "spanId": "ABC19B7EC3C1B174",
        "parentSpanId": "EEE19B7EC3C1B173",
        "name": "conversation.turn",
        "startTimeUnixNano": "1704067202000000000",
        "endTimeUnixNano": "1704067203800000000",
        "attributes": [
          {
            "key": "conversation.session_id",
            "value": { "stringValue": "sess_12345" }
          },
          {
            "key": "conversation.turn_number",
            "value": { "intValue": "2" }
          },
          {
            "key": "llm.request.prompt",
            "value": { "stringValue": "my email is john@example.com" }
          },
          {
            "key": "llm.response.content",
            "value": { "stringValue": "Thank you! I've found your account. For security, can you verify the last 4 digits of your phone number?" }
          }
        ]
      }]
    }]
  }]
}
```

### Ingestion Command
```bash
promptfoo ingest otlp --file production-traces.json --eval-id prod-password-reset
```

### Expected Extracted Conversation
```json
{
  "id": "otlp-5B8EFFF798038103D269B633813FC60C",
  "source": "opentelemetry",
  "messages": [
    {
      "role": "user",
      "content": "How do I reset my password?",
      "timestamp": "2024-01-01T12:00:00.000Z"
    },
    {
      "role": "assistant",
      "content": "I can help you reset your password. Please provide your email address.",
      "timestamp": "2024-01-01T12:00:01.500Z"
    },
    {
      "role": "user",
      "content": "my email is john@example.com",
      "timestamp": "2024-01-01T12:00:02.000Z"
    },
    {
      "role": "assistant",
      "content": "Thank you! I've found your account. For security, can you verify the last 4 digits of your phone number?",
      "timestamp": "2024-01-01T12:00:03.800Z"
    }
  ],
  "metadata": {
    "originalTraceId": "5B8EFFF798038103D269B633813FC60C",
    "sessionId": "sess_12345",
    "timestamp": "2024-01-01T12:00:00.000Z",
    "duration": 3800,
    "model": "gpt-4"
  }
}
```

## 2. LangChain Logs

### Example LangChain JSONL Logs
```jsonl
{"timestamp": "2024-01-01T12:00:00Z", "type": "chain_start", "data": {"inputs": {"input": "I need help with my order"}}, "metadata": {"session_id": "langchain_sess_789"}}
{"timestamp": "2024-01-01T12:00:01Z", "type": "llm_start", "data": {"inputs": {"prompts": ["You are a helpful customer service agent..."]}}, "metadata": {"session_id": "langchain_sess_789"}}
{"timestamp": "2024-01-01T12:00:03Z", "type": "llm_end", "data": {"outputs": {"generations": [{"text": "I'd be happy to help with your order. Can you provide your order number?"}]}}, "metadata": {"session_id": "langchain_sess_789"}}
{"timestamp": "2024-01-01T12:00:03Z", "type": "chain_end", "data": {"outputs": {"output": "I'd be happy to help with your order. Can you provide your order number?"}}, "metadata": {"session_id": "langchain_sess_789"}}
{"timestamp": "2024-01-01T12:00:10Z", "type": "chain_start", "data": {"inputs": {"input": "Order #12345"}}, "metadata": {"session_id": "langchain_sess_789"}}
{"timestamp": "2024-01-01T12:00:12Z", "type": "chain_end", "data": {"outputs": {"output": "I found your order! It's currently being processed and will ship tomorrow."}}, "metadata": {"session_id": "langchain_sess_789"}}
```

### Ingestion Command
```bash
promptfoo ingest langchain --file langchain-logs.jsonl
```

### Expected Extracted Conversation
```json
{
  "id": "langchain-langchain_sess_789",
  "source": "langchain",
  "messages": [
    {
      "role": "user",
      "content": "I need help with my order",
      "timestamp": "2024-01-01T12:00:00Z"
    },
    {
      "role": "assistant",
      "content": "I'd be happy to help with your order. Can you provide your order number?",
      "timestamp": "2024-01-01T12:00:03Z"
    },
    {
      "role": "user",
      "content": "Order #12345",
      "timestamp": "2024-01-01T12:00:10Z"
    },
    {
      "role": "assistant",
      "content": "I found your order! It's currently being processed and will ship tomorrow.",
      "timestamp": "2024-01-01T12:00:12Z"
    }
  ],
  "metadata": {
    "sessionId": "langchain_sess_789",
    "timestamp": "2024-01-01T12:00:00Z"
  }
}
```

## 3. Custom Application Logs (JSON)

### Example JSON Conversation Logs
```json
[
  {
    "conversation_id": "conv_abc123",
    "user_id": "user_456",
    "timestamp": "2024-01-01T15:30:00Z",
    "messages": [
      {
        "role": "user",
        "content": "Can you help me cancel my subscription?",
        "timestamp": "2024-01-01T15:30:00Z"
      },
      {
        "role": "assistant",
        "content": "I can help you cancel your subscription. Can you confirm your account email?",
        "timestamp": "2024-01-01T15:30:02Z"
      },
      {
        "role": "user",
        "content": "sarah@example.com",
        "timestamp": "2024-01-01T15:30:15Z"
      },
      {
        "role": "assistant",
        "content": "I've found your account. Your subscription will be canceled at the end of your billing period (Jan 31st).",
        "timestamp": "2024-01-01T15:30:18Z"
      }
    ],
    "metadata": {
      "agent_version": "v2.1.0",
      "satisfaction_score": 4.5,
      "resolution": "completed"
    }
  }
]
```

### Ingestion Command
```bash
promptfoo ingest json --file app-conversations.json
```

## 4. Custom Log Format with Parser Config

### Example CSV-like Logs
```json
[
  {
    "session_uuid": "sess_xyz789",
    "message_text": "I'm locked out of my account",
    "sender_type": "customer",
    "created_at": "2024-01-01T09:15:00Z",
    "agent_id": "agent_123"
  },
  {
    "session_uuid": "sess_xyz789",
    "message_text": "I can help you regain access. What's the email address associated with your account?",
    "sender_type": "agent",
    "created_at": "2024-01-01T09:15:05Z",
    "agent_id": "agent_123"
  },
  {
    "session_uuid": "sess_xyz789",
    "message_text": "mike@company.com",
    "sender_type": "customer",
    "created_at": "2024-01-01T09:15:20Z",
    "agent_id": "agent_123"
  }
]
```

### Custom Parser Configuration
```yaml
# custom-parser.yaml
parser:
  type: custom
  config:
    messageField: "message_text"
    roleField: "sender_type"
    timestampField: "created_at"
    sessionIdField: "session_uuid"
    userValue: "customer"
    assistantValue: "agent"
    metadata:
      - "agent_id"
      - "session_uuid"
```

### Ingestion Command
```bash
promptfoo ingest json --file support-logs.json --config custom-parser.yaml
```

## 5. Database Ingestion

### Example Database Schema
```sql
-- conversations table
CREATE TABLE conversations (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255),
  user_id VARCHAR(255),
  message_text TEXT,
  message_role VARCHAR(50), -- 'user' or 'assistant'
  timestamp TIMESTAMP,
  metadata JSONB
);

-- Sample data
INSERT INTO conversations VALUES
(1, 'session_001', 'user123', 'My order hasn''t arrived', 'user', '2024-01-01 10:00:00', '{"order_id": "ORD123"}'),
(2, 'session_001', 'user123', 'I can track your order. What''s your order number?', 'assistant', '2024-01-01 10:00:05', '{"agent_id": "agent_456"}'),
(3, 'session_001', 'user123', 'ORD123', 'user', '2024-01-01 10:00:15', '{}'),
(4, 'session_001', 'user123', 'Your order is in transit and should arrive tomorrow.', 'assistant', '2024-01-01 10:00:20', '{"tracking_number": "1Z999"}');
```

### Database Ingestion Configuration
```yaml
# database-config.yaml
ingestion:
  source: database
  connection: "postgresql://user:pass@localhost:5432/app_logs"
  query: |
    SELECT
      session_id,
      user_id,
      message_text,
      message_role,
      timestamp,
      metadata
    FROM conversations
    WHERE timestamp >= '2024-01-01'
    ORDER BY session_id, timestamp
  parser:
    messageField: "message_text"
    roleField: "message_role"
    timestampField: "timestamp"
    sessionIdField: "session_id"
    userValue: "user"
    assistantValue: "assistant"
```

### Ingestion Command
```bash
promptfoo ingest database --config database-config.yaml --eval-id db-conversations-jan2024
```

## 6. Streaming Logs (Kafka/WebSocket)

### Example Kafka Consumer Configuration
```yaml
# streaming-config.yaml
ingestion:
  streaming:
    enabled: true
    source: kafka
    config:
      brokers: ["localhost:9092"]
      topic: "agent-conversations"
      groupId: "promptfoo-ingestion"
      parser:
        format: "json"
        messageField: "message"
        roleField: "type"
        sessionIdField: "conversation_id"
```

### Example Kafka Message
```json
{
  "conversation_id": "stream_conv_123",
  "type": "user_message",
  "message": "I want to return an item",
  "timestamp": "2024-01-01T14:20:00Z",
  "user_id": "user789",
  "metadata": {
    "channel": "web_chat",
    "page": "/returns"
  }
}
```

### Streaming Command
```bash
promptfoo ingest stream --config streaming-config.yaml
```

## 7. Live OTLP Trace Monitoring

### Configuration for Live Monitoring
```yaml
# promptfooconfig.yaml
ingestion:
  otlp:
    live: true
    endpoint: "http://localhost:4318"
    filters:
      - service.name: "production-agent"
      - span.name: "conversation.*"

  analysis:
    realtime:
      enabled: true
      alerts:
        - condition: "response_time > 5000"
          action: "log"
        - condition: "conversation.turn_count > 15"
          action: "flag"
```

### Live Monitoring Command
```bash
promptfoo ingest monitor --config live-monitoring.yaml
```

## 8. Integration with External Tools

### Weights & Biases Integration
```bash
# Install W&B integration
npm install wandb

# Ingest from W&B project
promptfoo ingest wandb \
  --project "agent-evaluation" \
  --run "prod-deployment-v1.2" \
  --artifact "conversation-logs:latest"
```

### Langfuse Integration
```bash
# Ingest from Langfuse
promptfoo ingest langfuse \
  --api-key $LANGFUSE_SECRET_KEY \
  --project "production" \
  --session-filter "date >= '2024-01-01'"
```

### Datadog Logs Integration
```bash
# Export logs from Datadog and ingest
promptfoo ingest datadog \
  --api-key $DD_API_KEY \
  --app-key $DD_APP_KEY \
  --query "service:chat-agent @conversation.session_id:*" \
  --from "2024-01-01T00:00:00Z" \
  --to "2024-01-02T00:00:00Z"
```

## Usage After Ingestion

### Replay Ingested Conversations
```bash
# List ingested conversations
promptfoo ingest list

# Search for specific conversations
promptfoo ingest search "password reset"

# Replay a specific conversation
promptfoo replay conversation --eval ingested-conversations --test 5

# Interactive replay
promptfoo replay conversation --eval prod-traces --test 12 --interactive

# Export conversations for analysis
promptfoo export conversations --eval ingested-conversations --format json
```

### Analyze Patterns
```bash
# Analyze conversation patterns
promptfoo analyze patterns --eval ingested-conversations

# Compare with evaluation results
promptfoo compare --baseline ingested-conversations --current eval-abc123

# Generate test cases from successful conversations
promptfoo generate tests --from-conversations ingested-conversations --filter "success=true"
```

This external log ingestion capability transforms promptfoo into a universal conversation replay tool that can work with any production system's logs and traces.