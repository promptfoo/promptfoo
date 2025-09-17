# External Log Ingestion for Agent Conversation Replay

## Overview

Enable promptfoo to ingest and replay agent conversations from **external logging and tracing systems** including OpenTelemetry traces, application logs, monitoring data, and custom conversation logs.

**Key Value**: Debug production agent issues by importing real conversation data into promptfoo's replay system.

## Current Infrastructure Analysis

### Existing Capabilities
✅ **OpenTelemetry OTLP Receiver** (`src/tracing/otlpReceiver.ts`)
- Ingests OTLP traces via HTTP (port 4318)
- Stores spans in `spansTable` and `tracesTable`
- Supports full OpenTelemetry specification

✅ **Trace Storage Schema**
```typescript
// tracesTable: Links traces to evaluations
interface TraceRecord {
  traceId: string;
  evaluationId: string;
  testCaseId: string;
  metadata: Record<string, any>;
}

// spansTable: Individual operations
interface SpanRecord {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, any>;
  statusCode: number;
  statusMessage?: string;
}
```

✅ **Web UI Trace Visualization**
- Hierarchical span display
- Duration timing bars
- Attribute inspection

### Gap: Conversation Extraction
❌ Current system stores **technical spans** but doesn't extract **conversation flows**
❌ No support for **non-OpenTelemetry log formats**
❌ No **conversation reconstruction** from distributed traces

## Implementation Plan

### Phase 1: Log Format Support (Week 1)

#### 1.1 Universal Log Ingestion
**File**: `src/ingestion/logIngestion.ts`

```typescript
export class LogIngestionEngine {
  private parsers: Map<string, LogParser> = new Map();

  constructor() {
    // Register built-in parsers
    this.registerParser('otlp', new OTLPLogParser());
    this.registerParser('json', new JSONLogParser());
    this.registerParser('langchain', new LangChainLogParser());
    this.registerParser('llamaindex', new LlamaIndexLogParser());
    this.registerParser('custom', new CustomLogParser());
  }

  async ingestLogs(source: LogSource): Promise<IngestedConversation[]> {
    const parser = this.getParser(source.format);
    const rawLogs = await this.loadLogs(source);
    const conversations = await parser.extractConversations(rawLogs);

    // Store in database
    return this.storeConversations(conversations);
  }

  registerParser(format: string, parser: LogParser): void {
    this.parsers.set(format, parser);
  }
}

interface LogSource {
  format: 'otlp' | 'json' | 'langchain' | 'llamaindex' | 'custom';
  source: 'file' | 'url' | 'database' | 'stream';
  location: string;
  config?: Record<string, any>;
}

interface IngestedConversation {
  id: string;
  source: string;
  messages: Message[];
  metadata: {
    originalTraceId?: string;
    sessionId?: string;
    userId?: string;
    timestamp: Date;
    duration?: number;
    [key: string]: any;
  };
}
```

#### 1.2 OpenTelemetry Conversation Extractor
**File**: `src/ingestion/parsers/otlpParser.ts`

```typescript
export class OTLPLogParser implements LogParser {
  async extractConversations(traces: OTLPTrace[]): Promise<IngestedConversation[]> {
    const conversations: IngestedConversation[] = [];

    for (const trace of traces) {
      const conversationSpans = this.findConversationSpans(trace);

      if (conversationSpans.length > 0) {
        const messages = this.reconstructMessages(conversationSpans);

        conversations.push({
          id: `otlp-${trace.traceId}`,
          source: 'opentelemetry',
          messages,
          metadata: {
            originalTraceId: trace.traceId,
            timestamp: new Date(trace.startTime),
            duration: trace.endTime - trace.startTime,
            ...this.extractTraceMetadata(trace)
          }
        });
      }
    }

    return conversations;
  }

  private findConversationSpans(trace: OTLPTrace): SpanData[] {
    // Look for spans with conversation-related attributes
    return trace.spans.filter(span =>
      span.attributes?.['conversation.turn'] ||
      span.attributes?.['llm.request.prompt'] ||
      span.attributes?.['llm.response.content'] ||
      span.name.includes('chat') ||
      span.name.includes('conversation')
    );
  }

  private reconstructMessages(spans: SpanData[]): Message[] {
    const messages: Message[] = [];

    // Sort spans by timestamp to reconstruct conversation order
    const sortedSpans = spans.sort((a, b) => a.startTime - b.startTime);

    for (const span of sortedSpans) {
      // Extract user prompt
      const prompt = span.attributes?.['llm.request.prompt'];
      if (prompt) {
        messages.push({
          role: 'user',
          content: prompt,
          timestamp: new Date(span.startTime)
        });
      }

      // Extract assistant response
      const response = span.attributes?.['llm.response.content'];
      if (response) {
        messages.push({
          role: 'assistant',
          content: response,
          timestamp: new Date(span.endTime || span.startTime)
        });
      }

      // Handle conversation turn markers
      const turnNumber = span.attributes?.['conversation.turn'];
      if (turnNumber && span.attributes?.['conversation.message']) {
        messages.push({
          role: span.attributes['conversation.role'] || 'assistant',
          content: span.attributes['conversation.message'],
          timestamp: new Date(span.startTime)
        });
      }
    }

    return messages;
  }
}
```

#### 1.3 Custom Log Format Parsers
**File**: `src/ingestion/parsers/customParsers.ts`

```typescript
// LangChain conversation logs
export class LangChainLogParser implements LogParser {
  async extractConversations(logs: any[]): Promise<IngestedConversation[]> {
    const conversations = new Map<string, Message[]>();

    for (const log of logs) {
      // LangChain typically logs: {"type": "chain_start", "data": {"inputs": {...}}}
      if (log.type === 'chain_start' && log.data?.inputs?.input) {
        const sessionId = log.metadata?.session_id || 'default';
        if (!conversations.has(sessionId)) {
          conversations.set(sessionId, []);
        }

        conversations.get(sessionId)!.push({
          role: 'user',
          content: log.data.inputs.input,
          timestamp: new Date(log.timestamp)
        });
      }

      if (log.type === 'chain_end' && log.data?.outputs?.output) {
        const sessionId = log.metadata?.session_id || 'default';
        conversations.get(sessionId)?.push({
          role: 'assistant',
          content: log.data.outputs.output,
          timestamp: new Date(log.timestamp)
        });
      }
    }

    return Array.from(conversations.entries()).map(([sessionId, messages]) => ({
      id: `langchain-${sessionId}`,
      source: 'langchain',
      messages,
      metadata: {
        sessionId,
        timestamp: messages[0]?.timestamp || new Date()
      }
    }));
  }
}

// JSON conversation logs
export class JSONLogParser implements LogParser {
  async extractConversations(logs: any[]): Promise<IngestedConversation[]> {
    // Support multiple JSON formats
    return logs.map((log, index) => {
      let messages: Message[] = [];

      // Format 1: Direct messages array
      if (log.messages && Array.isArray(log.messages)) {
        messages = log.messages.map(msg => ({
          role: msg.role || 'user',
          content: msg.content || msg.text || msg.message,
          timestamp: new Date(msg.timestamp || log.timestamp || Date.now())
        }));
      }

      // Format 2: Conversation object
      else if (log.conversation) {
        messages = this.parseConversationObject(log.conversation);
      }

      // Format 3: Single turn logs
      else if (log.user_input && log.assistant_response) {
        messages = [
          { role: 'user', content: log.user_input, timestamp: new Date(log.timestamp) },
          { role: 'assistant', content: log.assistant_response, timestamp: new Date(log.timestamp) }
        ];
      }

      return {
        id: `json-${log.id || index}`,
        source: 'json',
        messages,
        metadata: {
          sessionId: log.session_id,
          userId: log.user_id,
          timestamp: new Date(log.timestamp || Date.now()),
          ...log.metadata
        }
      };
    });
  }
}

// Application-specific log parser
export class CustomLogParser implements LogParser {
  constructor(private config: CustomParserConfig) {}

  async extractConversations(logs: any[]): Promise<IngestedConversation[]> {
    const {
      messageField,
      roleField,
      timestampField,
      sessionIdField,
      userValue = 'user',
      assistantValue = 'assistant'
    } = this.config;

    const conversations = new Map<string, Message[]>();

    for (const log of logs) {
      const sessionId = log[sessionIdField] || 'default';
      const role = log[roleField] === userValue ? 'user' : 'assistant';
      const content = log[messageField];
      const timestamp = new Date(log[timestampField] || Date.now());

      if (!conversations.has(sessionId)) {
        conversations.set(sessionId, []);
      }

      conversations.get(sessionId)!.push({
        role,
        content,
        timestamp
      });
    }

    return Array.from(conversations.entries()).map(([sessionId, messages]) => ({
      id: `custom-${sessionId}`,
      source: 'custom',
      messages: messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()),
      metadata: {
        sessionId,
        timestamp: messages[0]?.timestamp || new Date()
      }
    }));
  }
}

interface CustomParserConfig {
  messageField: string;      // Field containing message content
  roleField: string;         // Field indicating user/assistant
  timestampField: string;    // Field with timestamp
  sessionIdField: string;    // Field grouping conversation
  userValue: string;         // Value indicating user message
  assistantValue: string;    // Value indicating assistant message
}
```

### Phase 2: CLI and Configuration (Week 2)

#### 2.1 Ingestion Commands
**File**: `src/commands/ingest.ts`

```bash
# Ingest OpenTelemetry traces
promptfoo ingest otlp --file traces.json --eval-id imported-traces

# Ingest LangChain logs
promptfoo ingest langchain --file langchain-logs.jsonl

# Ingest from OTLP endpoint
promptfoo ingest otlp --url http://jaeger:14268/api/traces

# Ingest custom JSON logs
promptfoo ingest json --file app-logs.json --config custom-parser.yaml

# Ingest from database
promptfoo ingest database --connection-string "postgresql://..." --query "SELECT * FROM conversation_logs"

# List ingested conversations
promptfoo ingest list

# Search ingested conversations
promptfoo ingest search "password reset"
```

#### 2.2 Configuration Support
**File**: Custom parser configurations

```yaml
# custom-parser.yaml
parser:
  type: custom
  config:
    messageField: "message_text"
    roleField: "sender_type"
    timestampField: "created_at"
    sessionIdField: "conversation_id"
    userValue: "user"
    assistantValue: "bot"

# Or in promptfooconfig.yaml
ingestion:
  sources:
    - name: "production-traces"
      format: "otlp"
      source: "file"
      location: "./traces/production-2024-01.json"

    - name: "langchain-logs"
      format: "langchain"
      source: "file"
      location: "./logs/langchain-*.jsonl"

    - name: "custom-app-logs"
      format: "custom"
      source: "database"
      location: "postgresql://app:password@db:5432/logs"
      config:
        query: "SELECT * FROM conversations WHERE date > '2024-01-01'"
        messageField: "content"
        roleField: "author_type"
        timestampField: "timestamp"
        sessionIdField: "session_uuid"
```

### Phase 3: Advanced Features (Week 3)

#### 3.1 Real-time Log Streaming
**File**: `src/ingestion/streaming.ts`

```typescript
export class LogStreamingService {
  async streamLogs(source: StreamingSource): Promise<void> {
    switch (source.type) {
      case 'websocket':
        return this.streamWebSocket(source);
      case 'kafka':
        return this.streamKafka(source);
      case 'file-watch':
        return this.streamFileWatch(source);
      case 'otlp-live':
        return this.streamOTLPLive(source);
    }
  }

  private async streamOTLPLive(source: StreamingSource): Promise<void> {
    // Listen to live OTLP traces and extract conversations in real-time
    const otlpReceiver = new OTLPReceiver();

    otlpReceiver.on('trace', async (trace) => {
      const conversations = await new OTLPLogParser().extractConversations([trace]);

      for (const conversation of conversations) {
        await this.storeConversation(conversation);

        // Emit to real-time replay viewers
        this.emit('conversation-update', conversation);
      }
    });
  }
}

interface StreamingSource {
  type: 'websocket' | 'kafka' | 'file-watch' | 'otlp-live';
  config: Record<string, any>;
}
```

#### 3.2 Conversation Enrichment
**File**: `src/ingestion/enrichment.ts`

```typescript
export class ConversationEnricher {
  async enrichConversation(conversation: IngestedConversation): Promise<EnrichedConversation> {
    return {
      ...conversation,
      analysis: {
        turnCount: conversation.messages.length,
        averageResponseTime: this.calculateAvgResponseTime(conversation),
        sentiment: await this.analyzeSentiment(conversation),
        topics: await this.extractTopics(conversation),
        intents: await this.classifyIntents(conversation),
        outcome: await this.classifyOutcome(conversation)
      },
      performance: {
        totalDuration: this.calculateTotalDuration(conversation),
        responseLatencies: this.calculateResponseLatencies(conversation)
      }
    };
  }

  private async analyzeSentiment(conversation: IngestedConversation): Promise<SentimentAnalysis> {
    // Use a lightweight sentiment analysis on user messages
    const userMessages = conversation.messages.filter(m => m.role === 'user');
    // Implementation using sentiment analysis library
  }

  private async extractTopics(conversation: IngestedConversation): Promise<string[]> {
    // Simple keyword extraction or topic modeling
    const text = conversation.messages.map(m => m.content).join(' ');
    // Implementation using topic extraction
  }
}
```

## Example Usage Scenarios

### Scenario 1: Debug Production Issue
```bash
# Export traces from production monitoring
curl "https://your-monitoring.com/api/traces?service=chat-agent&date=2024-01-15" > prod-traces.json

# Ingest into promptfoo
promptfoo ingest otlp --file prod-traces.json --eval-id prod-issue-2024-01-15

# Replay problematic conversation
promptfoo replay conversation --eval prod-issue-2024-01-15 --test 42 --interactive

# Compare with similar successful conversations
promptfoo analyze similarity --conversation prod-issue-2024-01-15:42 --threshold 0.8
```

### Scenario 2: Analyze Customer Support Patterns
```bash
# Ingest customer support logs
promptfoo ingest json --file support-logs.jsonl --config support-parser.yaml

# Analyze conversation patterns
promptfoo analyze patterns --eval support-logs --export patterns.json

# Find conversations about specific issues
promptfoo replay search "refund request" --limit 20
```

### Scenario 3: Monitor Live Agent Performance
```yaml
# promptfooconfig.yaml
ingestion:
  streaming:
    enabled: true
    sources:
      - name: "live-agent-traces"
        type: "otlp-live"
        endpoint: "http://production-agent:4318"

  analysis:
    real-time:
      enabled: true
      alerts:
        - condition: "response_time > 5000ms"
          action: "alert"
        - condition: "sentiment < 0.3"
          action: "flag-for-review"
```

### Scenario 4: Import from External Tools
```bash
# From Weights & Biases
promptfoo ingest wandb --project "agent-logs" --run "latest"

# From Langfuse
promptfoo ingest langfuse --api-key $LANGFUSE_KEY --project "production"

# From custom monitoring
promptfoo ingest custom --format json --file monitoring-export.json
```

## Integration Benefits

### 1. Production Debugging
- Import real production conversations that caused issues
- Step through exact interaction flows that led to problems
- Compare failed conversations with successful ones

### 2. Performance Analysis
- Analyze response times and bottlenecks from production traces
- Identify patterns in slow or failed conversations
- Monitor agent performance trends over time

### 3. Quality Assessment
- Review real user interactions to understand agent behavior
- Identify common failure patterns or edge cases
- Generate test cases from production conversations

### 4. Compliance and Auditing
- Replay conversations for compliance review
- Analyze agent responses for policy adherence
- Generate reports on agent behavior patterns

## Technical Architecture

### Data Flow
```
External Logs → LogIngestionEngine → LogParser → ConversationExtractor → Database → ReplayProvider → User
     ↓              ↓                 ↓              ↓                    ↓           ↓           ↓
1. OTLP Traces   Format           Message        Structured         SQLite     Conversation   Debug/
2. JSON Logs     Detection        Extraction     Storage            Tables     Replay         Analyze
3. Database      ↓                ↓              ↓                    ↓           ↓           ↓
4. Streaming     Parser           Conversation   Metadata           Indexing   Interactive   Export
   Logs          Selection        Reconstruction Enhancement                   Stepping
```

### Database Schema Extensions
```sql
-- Table for ingested conversations (separate from eval results)
CREATE TABLE ingested_conversations (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,        -- 'otlp', 'json', 'langchain', etc.
  source_location TEXT NOT NULL,    -- file path, URL, etc.
  session_id TEXT,
  user_id TEXT,
  original_trace_id TEXT,
  conversation_data JSON NOT NULL,  -- Full conversation with messages
  metadata JSON,                    -- Source-specific metadata
  created_at INTEGER NOT NULL,
  ingested_at INTEGER NOT NULL
);

-- Index for fast conversation search
CREATE INDEX idx_conversations_source ON ingested_conversations(source_type, session_id);
CREATE INDEX idx_conversations_search ON ingested_conversations(conversation_data);
```

This architecture enables promptfoo to become a **universal conversation replay tool** that can ingest data from any production system, not just its own evaluations.
