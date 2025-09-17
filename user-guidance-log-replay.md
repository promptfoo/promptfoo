# User Guide: Replaying Agent Conversations from Production Logs

## Overview

This guide shows how to use **existing promptfoo features** to replay agent conversations from production logs and traces, without modifying promptfoo's source code. The approach leverages promptfoo's custom provider system, OTLP receiver, and configuration capabilities.

**Key Principle**: Transform your external logs into formats that work with promptfoo's existing infrastructure.

## Production Log Storage Patterns

### 1. OpenTelemetry Traces (Jaeger, Tempo, etc.)
**Common Pattern**: Conversation data stored as span attributes
```json
{
  "spans": [{
    "name": "conversation.turn",
    "attributes": {
      "llm.request.prompt": "How do I reset my password?",
      "llm.response.content": "I can help you reset your password...",
      "conversation.session_id": "sess_123",
      "conversation.turn_number": 1
    }
  }]
}
```

**Best Approach**: Use promptfoo's existing OTLP receiver + custom provider

### 2. Application Database Tables
**Common Pattern**: Conversations in relational databases
```sql
CREATE TABLE conversations (
  session_id VARCHAR(255),
  role VARCHAR(20), -- 'user' or 'assistant'
  content TEXT,
  timestamp TIMESTAMP,
  metadata JSONB
);
```

**Best Approach**: Export to JSON + custom provider

### 3. LangChain/Framework Logs
**Common Pattern**: Structured logs with chain start/end events
```json
{"type": "chain_start", "data": {"inputs": {"input": "user message"}}}
{"type": "chain_end", "data": {"outputs": {"output": "assistant response"}}}
```

**Best Approach**: Transform to conversation format + custom provider

### 4. Application Logs (JSON/JSONL)
**Common Pattern**: One log entry per conversation turn
```jsonl
{"session":"s1", "role":"user", "message":"Hello", "timestamp":"2024-01-01T10:00:00Z"}
{"session":"s1", "role":"assistant", "message":"Hi there!", "timestamp":"2024-01-01T10:00:01Z"}
```

**Best Approach**: Custom provider that reads log files

### 5. Streaming Logs (Kafka, Redis)
**Common Pattern**: Real-time conversation events
```json
{"event": "user_message", "session": "live_123", "content": "Help me..."}
{"event": "agent_response", "session": "live_123", "content": "I can help..."}
```

**Best Approach**: Export snapshots + custom provider

## Implementation Strategies

### Strategy 1: Custom Provider for Log Replay

**When to use**: You have structured conversation logs (JSON, database, etc.)

**How it works**: Write a custom provider that reads your log data and replays conversations turn-by-turn.

**Example Provider** (`conversation-replay-provider.js`):
```javascript
const fs = require('fs');
const path = require('path');

class ConversationReplayProvider {
  constructor(options) {
    this.config = options.config;
    this.conversations = this.loadConversations();
  }

  id() {
    return 'conversation-replay';
  }

  loadConversations() {
    // Load your conversation data from logs/database/files
    const logFile = this.config.logFile;
    const rawData = fs.readFileSync(logFile, 'utf8');

    // Transform your log format into conversation format
    return this.parseLogData(rawData);
  }

  parseLogData(rawData) {
    // Example: Parse JSONL conversation logs
    const lines = rawData.split('\n').filter(line => line.trim());
    const conversations = {};

    for (const line of lines) {
      const entry = JSON.parse(line);
      const sessionId = entry.session_id || entry.conversation_id;

      if (!conversations[sessionId]) {
        conversations[sessionId] = [];
      }

      conversations[sessionId].push({
        role: entry.role || (entry.sender_type === 'user' ? 'user' : 'assistant'),
        content: entry.message || entry.content || entry.text,
        timestamp: entry.timestamp
      });
    }

    return conversations;
  }

  async callApi(prompt, context) {
    // Get conversation ID from test variables
    const conversationId = context?.vars?.conversationId;
    const turnIndex = context?.vars?.turnIndex || 0;

    if (!conversationId || !this.conversations[conversationId]) {
      return {
        output: `No conversation found for ID: ${conversationId}`,
        error: 'Conversation not found'
      };
    }

    const conversation = this.conversations[conversationId];

    // Replay specific turn or full conversation
    if (context?.vars?.mode === 'turn') {
      const turn = conversation[turnIndex];
      return {
        output: turn ? turn.content : 'Turn not found',
        metadata: {
          role: turn?.role,
          timestamp: turn?.timestamp,
          turnIndex,
          totalTurns: conversation.length
        }
      };
    }

    // Replay full conversation
    const conversationText = conversation
      .map((turn, idx) => `[Turn ${idx + 1}] ${turn.role}: ${turn.content}`)
      .join('\n---\n');

    return {
      output: conversationText,
      metadata: {
        conversationId,
        totalTurns: conversation.length,
        originalTimestamp: conversation[0]?.timestamp
      }
    };
  }
}

module.exports = ConversationReplayProvider;
```

**Configuration** (`promptfooconfig.yaml`):
```yaml
providers:
  - file://conversation-replay-provider.js
    config:
      logFile: './production-logs.jsonl'

tests:
  # Replay specific conversations
  - description: 'Replay password reset conversation'
    vars:
      conversationId: 'sess_12345'
      mode: 'full'
    assert:
      - type: contains
        value: 'password reset'

  # Replay specific turn
  - description: 'Replay turn 3 of support conversation'
    vars:
      conversationId: 'sess_67890'
      mode: 'turn'
      turnIndex: 2
    assert:
      - type: llm-rubric
        value: 'Does this turn provide helpful information?'

  # Test multiple conversations
  - description: 'Replay all failed conversations'
    vars:
      conversationId: '{{ item }}'
      mode: 'full'
    matrix:
      - item: ['sess_fail_1', 'sess_fail_2', 'sess_fail_3']
```

### Strategy 2: OTLP Trace Ingestion

**When to use**: Your logs are already in OpenTelemetry format or you can transform them

**How it works**: Send your traces to promptfoo's existing OTLP receiver, then use custom provider to replay.

**Step 1**: Transform your logs to OTLP format
```javascript
// trace-transformer.js
const fs = require('fs');

function transformToOTLP(conversationLogs) {
  const traces = [];

  for (const [sessionId, messages] of Object.entries(conversationLogs)) {
    const spans = messages.map((msg, idx) => ({
      traceId: Buffer.from(sessionId).toString('hex').padEnd(32, '0'),
      spanId: Buffer.from(`${sessionId}-${idx}`).toString('hex').padEnd(16, '0'),
      name: 'conversation.turn',
      startTimeUnixNano: new Date(msg.timestamp).getTime() * 1000000,
      attributes: [
        { key: 'conversation.session_id', value: { stringValue: sessionId } },
        { key: 'conversation.turn_number', value: { intValue: idx + 1 } },
        { key: 'conversation.role', value: { stringValue: msg.role } },
        { key: 'conversation.content', value: { stringValue: msg.content } }
      ]
    }));

    traces.push({
      resourceSpans: [{
        scopeSpans: [{ spans }]
      }]
    });
  }

  return traces;
}

// Usage
const logs = JSON.parse(fs.readFileSync('conversation-logs.json'));
const otlpTraces = transformToOTLP(logs);
fs.writeFileSync('otlp-traces.json', JSON.stringify(otlpTraces, null, 2));
```

**Step 2**: Send to promptfoo's OTLP receiver
```bash
# Enable OTLP receiver in promptfooconfig.yaml
tracing:
  enabled: true
  otlp:
    http:
      enabled: true
      port: 4318

# Send traces
curl -X POST http://localhost:4318/v1/traces \
  -H "Content-Type: application/json" \
  -d @otlp-traces.json
```

**Step 3**: Custom provider to query traces
```javascript
// trace-replay-provider.js
const Database = require('better-sqlite3');
const path = require('path');

class TraceReplayProvider {
  constructor(options) {
    this.config = options.config;
    // Connect to promptfoo's database
    const dbPath = this.config.dbPath || path.join(process.cwd(), '.promptfoo', 'promptfoo.db');
    this.db = new Database(dbPath, { readonly: true });
  }

  async callApi(prompt, context) {
    const sessionId = context?.vars?.sessionId;

    // Query spans from promptfoo's database
    const spans = this.db.prepare(`
      SELECT * FROM spans
      WHERE json_extract(attributes, '$.conversation_session_id') = ?
      ORDER BY start_time
    `).all(sessionId);

    const conversation = spans.map(span => {
      const attrs = JSON.parse(span.attributes);
      return {
        role: attrs['conversation.role'],
        content: attrs['conversation.content'],
        turn: attrs['conversation.turn_number']
      };
    });

    return {
      output: conversation
        .map(turn => `${turn.role}: ${turn.content}`)
        .join('\n---\n'),
      metadata: { spans: spans.length, sessionId }
    };
  }
}
```

### Strategy 3: Database Export + Custom Provider

**When to use**: Conversations stored in database tables

**Step 1**: Export conversations to JSON
```sql
-- Export conversation data
COPY (
  SELECT
    session_id,
    json_agg(
      json_build_object(
        'role', role,
        'content', message_text,
        'timestamp', timestamp
      ) ORDER BY timestamp
    ) as messages
  FROM conversations
  WHERE date >= '2024-01-01'
  GROUP BY session_id
) TO '/tmp/conversations.json';
```

**Step 2**: Custom provider to replay from JSON
```javascript
// database-replay-provider.js
class DatabaseReplayProvider {
  constructor(options) {
    this.conversations = require(options.config.conversationFile);
  }

  async callApi(prompt, context) {
    const sessionId = context?.vars?.sessionId;
    const conversation = this.conversations.find(c => c.session_id === sessionId);

    if (!conversation) {
      return { output: 'Conversation not found', error: true };
    }

    return {
      output: conversation.messages
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n---\n'),
      metadata: conversation
    };
  }
}
```

### Strategy 4: Real-time Log Monitoring

**When to use**: You want to replay conversations as they happen

**Approach**: Export recent conversations periodically and replay
```javascript
// live-replay-provider.js
class LiveReplayProvider {
  constructor(options) {
    this.config = options.config;
    this.refreshInterval = options.config.refreshInterval || 60000; // 1 minute
    this.conversations = new Map();
    this.startMonitoring();
  }

  startMonitoring() {
    setInterval(() => {
      this.refreshConversations();
    }, this.refreshInterval);
  }

  async refreshConversations() {
    // Fetch recent conversations from your monitoring system
    const recent = await this.fetchRecentConversations();
    recent.forEach(conv => {
      this.conversations.set(conv.sessionId, conv);
    });
  }

  async fetchRecentConversations() {
    // Implement your data fetching logic
    // This could be API calls, database queries, log file reading, etc.
  }

  async callApi(prompt, context) {
    const sessionId = context?.vars?.sessionId;
    const conversation = this.conversations.get(sessionId);

    return {
      output: conversation ? this.formatConversation(conversation) : 'Not found',
      metadata: {
        live: true,
        lastUpdated: new Date(),
        totalTracked: this.conversations.size
      }
    };
  }
}
```

## Production Implementation Patterns

### Pattern 1: Batch Export and Replay
```yaml
# Daily batch processing
providers:
  - file://batch-replay-provider.js
    config:
      logFiles:
        - './exports/conversations-2024-01-01.json'
        - './exports/conversations-2024-01-02.json'

tests:
  - description: 'Replay failed conversations from yesterday'
    vars:
      date: '2024-01-01'
      status: 'failed'
```

### Pattern 2: Investigation Mode
```yaml
# Debug specific issues
providers:
  - file://investigation-provider.js
    config:
      mode: 'investigation'
      traceFile: './incident-traces.json'

tests:
  - description: 'Investigate incident #1234'
    vars:
      incidentId: '1234'
      focusArea: 'authentication'
```

### Pattern 3: Compliance Audit
```yaml
# Audit conversations for compliance
providers:
  - file://audit-replay-provider.js
    config:
      auditPeriod: '2024-Q1'
      complianceRules: './compliance-rules.json'

tests:
  - description: 'Audit PII handling in conversations'
    vars:
      checkType: 'pii'
      severity: 'high'
    assert:
      - type: llm-rubric
        value: 'Does this conversation properly handle personal information?'
```

## Best Practices

### 1. Data Transformation
- **Standardize message format**: Always use `{role, content, timestamp}` structure
- **Preserve metadata**: Keep session IDs, user IDs, and other context
- **Handle edge cases**: Missing timestamps, malformed messages, partial conversations

### 2. Performance Optimization
- **Lazy loading**: Only load conversations when needed
- **Caching**: Cache frequently accessed conversations
- **Batching**: Process multiple conversations efficiently

### 3. Privacy and Security
- **Data sanitization**: Remove sensitive information before replay
- **Access controls**: Implement proper authentication for log access
- **Audit trails**: Log all replay activities for compliance

### 4. Testing Strategy
- **Smoke tests**: Verify log parsing works correctly
- **Regression tests**: Compare replayed conversations with expected outcomes
- **Performance tests**: Ensure replay doesn't impact production systems

This approach leverages promptfoo's existing powerful infrastructure while allowing users to replay any conversation data from their production systems.