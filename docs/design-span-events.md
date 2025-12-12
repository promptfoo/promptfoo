# Design Doc: Span Events for LLM Tracing

**Author**: Claude Code
**Date**: December 2025
**Status**: Draft
**Related PRs**: #6536 (GenAI conventions), #5680 (TTFT)

## Table of Contents

- [Executive Summary](#executive-summary)
- [Background](#background)
- [Current State](#current-state)
- [Proposed Solution](#proposed-solution)
- [OpenTelemetry GenAI Event Conventions](#opentelemetry-genai-event-conventions)
- [LLM-Specific Events](#llm-specific-events)
- [Database Schema](#database-schema)
- [OTLP Receiver Changes](#otlp-receiver-changes)
- [Store Layer Changes](#store-layer-changes)
- [UI Changes](#ui-changes)
- [API Changes](#api-changes)
- [Implementation Plan](#implementation-plan)
- [Testing Strategy](#testing-strategy)
- [Security Considerations](#security-considerations)
- [Open Questions](#open-questions)

---

## Executive Summary

This document proposes adding **span events** support to promptfoo's tracing system. Span events capture discrete moments within a span's lifetime (e.g., "prompt truncated", "guardrail triggered", "retry attempted") that don't warrant their own span but provide valuable debugging context.

### Key Benefits

1. **Richer debugging context**: Capture "what happened" inside operations without span explosion
2. **OTel compliance**: Full compatibility with OpenTelemetry event specification
3. **GenAI conventions**: Support for `gen_ai.client.inference.operation.details` and `gen_ai.evaluation.result` events
4. **Red team insights**: Better visibility into guardrail decisions and attack detection

### Scope

- Parse and store events from incoming OTLP traces
- Emit events from built-in provider instrumentation
- Display events in trace timeline UI
- Expose events via API for external consumption

---

## Background

### What Are Span Events?

In OpenTelemetry, a **span** represents an operation with duration and nesting. A **span event** is a timestamped annotation that occurs at a specific moment within a span's lifetime.

```
Span: genai.request (2000ms)
├── Event: prompt.rendered (t=0ms)
├── Event: rate_limit.warning (t=50ms)
├── Event: first_token.received (t=200ms)  ← TTFT marker
├── Event: guardrail.triggered (t=1500ms)
└── Event: response.complete (t=2000ms)
```

### When to Use Events vs Spans

| Use Spans For                         | Use Events For                                 |
| ------------------------------------- | ---------------------------------------------- |
| Operations with duration              | Point-in-time occurrences                      |
| Nested sub-operations                 | Annotations within operations                  |
| Things you want to time independently | Things that "happened" but don't have duration |
| Tool calls, retrieval, LLM calls      | Truncation, retries, guardrail decisions       |

### OTel Event Specification

Per [OpenTelemetry Semantic Conventions for Events](https://opentelemetry.io/docs/specs/semconv/general/events/):

> An event MUST have an Event name property that uniquely identifies the event. Events can have attributes and an optional body payload.

Event structure:

```typescript
interface SpanEvent {
  name: string; // Required: unique event identifier
  timestamp: number; // Required: Unix timestamp in nanoseconds
  attributes?: Record<string, any>; // Optional: event-specific attributes
}
```

---

## Current State

### What Exists

1. **TraceEvent interface** defined in `src/tracing/traceContext.ts`:

   ```typescript
   export interface TraceEvent {
     name: string;
     timestamp: number;
     attributes: Record<string, any>;
   }
   ```

2. **TraceSpan.events** property exists but is **always empty**:

   ```typescript
   // In createTraceSpans()
   events: [],  // Line 132 - hardcoded empty array
   ```

3. **No events table** in database schema - only `spans` table

4. **OTLP receiver** does not parse events from incoming traces

### Gap Analysis

| Component | Has Interface | Has Storage | Has Parsing | Has UI |
| --------- | ------------- | ----------- | ----------- | ------ |
| Events    | Yes           | No          | No          | No     |
| Spans     | Yes           | Yes         | Yes         | Yes    |

---

## Proposed Solution

### Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        OTLP Receiver                            │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────┐    │
│  │ Parse Spans │───>│ Parse Events │───>│ Store in SQLite │    │
│  └─────────────┘    └──────────────┘    └─────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        SQLite Database                          │
│  ┌───────────┐    ┌────────────┐    ┌────────────────────────┐ │
│  │  traces   │◄───│   spans    │◄───│   span_events          │ │
│  └───────────┘    └────────────┘    │  - id                  │ │
│                                     │  - span_id (FK)        │ │
│                                     │  - name                │ │
│                                     │  - timestamp           │ │
│                                     │  - attributes (JSON)   │ │
│                                     └────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Web UI                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Trace Timeline                                          │   │
│  │  └─ Span: openai.chat (1500ms)                         │   │
│  │      ├─ [E] prompt.rendered (0ms)                      │   │
│  │      ├─ [E] first_token (200ms) ← TTFT: 200ms         │   │
│  │      ├─ [E] guardrail.check (800ms) ⚠ blocked         │   │
│  │      └─ [E] response.complete (1500ms)                 │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## OpenTelemetry GenAI Event Conventions

Per [GenAI Event Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-events/):

### Event: `gen_ai.client.inference.operation.details`

Captures completion request details including chat history and parameters.

**Required Attributes:**

- `gen_ai.operation.name` - Operation type (`chat`, `text_completion`, `embeddings`, `execute_tool`, etc.)

**Conditional/Recommended Attributes:**

| Attribute                        | Type     | Description              |
| -------------------------------- | -------- | ------------------------ |
| `gen_ai.conversation.id`         | string   | Conversation tracking ID |
| `gen_ai.request.model`           | string   | Model identifier         |
| `gen_ai.usage.input_tokens`      | int      | Input token count        |
| `gen_ai.usage.output_tokens`     | int      | Output token count       |
| `gen_ai.response.finish_reasons` | string[] | Why generation stopped   |
| `error.type`                     | string   | Error type if failed     |

**Opt-In Content Attributes** (sensitive - require explicit opt-in):

| Attribute                    | Type   | Description                    |
| ---------------------------- | ------ | ------------------------------ |
| `gen_ai.input.messages`      | JSON   | Chat history provided to model |
| `gen_ai.output.messages`     | JSON   | Model-generated responses      |
| `gen_ai.system_instructions` | string | System prompt                  |
| `gen_ai.tool.definitions`    | JSON   | Available tool definitions     |

### Event: `gen_ai.evaluation.result`

Documents evaluation outcomes for GenAI output quality.

**Required Attributes:**

- `gen_ai.evaluation.name` - Metric name (e.g., "Relevance", "Groundedness")

**Key Attributes:**

| Attribute                       | Type   | Description                  |
| ------------------------------- | ------ | ---------------------------- |
| `gen_ai.evaluation.score.value` | double | Numeric score                |
| `gen_ai.evaluation.score.label` | string | Human-readable label         |
| `gen_ai.response.id`            | string | Links to specific completion |

---

## LLM-Specific Events

Beyond OTel conventions, promptfoo should emit and display these LLM-specific events:

### Prompt Pipeline Events

| Event Name                  | When Emitted          | Key Attributes                                             |
| --------------------------- | --------------------- | ---------------------------------------------------------- |
| `prompt.template.loaded`    | Template file loaded  | `template.path`, `template.version`                        |
| `prompt.variables.rendered` | Variables substituted | `variables.count`, `variables.names`                       |
| `prompt.truncated`          | Prompt exceeded limit | `original.length`, `truncated.length`, `truncation.reason` |
| `prompt.cached`             | Prompt cache hit      | `cache.key`, `cache.age_ms`                                |

### Request/Response Events

| Event Name                 | When Emitted             | Key Attributes                        |
| -------------------------- | ------------------------ | ------------------------------------- |
| `request.sent`             | Request dispatched       | `request.size_bytes`, `request.model` |
| `response.first_token`     | First token received     | `ttft_ms`                             |
| `response.streaming.chunk` | Chunk received (sampled) | `chunk.index`, `tokens.so_far`        |
| `response.complete`        | Full response received   | `total.tokens`, `finish.reason`       |

### Error & Retry Events

| Event Name           | When Emitted           | Key Attributes                                   |
| -------------------- | ---------------------- | ------------------------------------------------ |
| `error.rate_limit`   | Rate limit hit         | `retry.after_ms`, `limit.type`                   |
| `error.timeout`      | Request timed out      | `timeout.ms`, `bytes.received`                   |
| `retry.attempted`    | Retry initiated        | `retry.number`, `retry.reason`, `retry.delay_ms` |
| `fallback.triggered` | Fallback provider used | `fallback.provider`, `original.error`            |

### Guardrail Events

| Event Name               | When Emitted         | Key Attributes                                             |
| ------------------------ | -------------------- | ---------------------------------------------------------- |
| `guardrail.input.check`  | Input guardrail ran  | `guardrail.name`, `guardrail.decision`, `guardrail.reason` |
| `guardrail.output.check` | Output guardrail ran | `guardrail.name`, `guardrail.decision`, `guardrail.reason` |
| `guardrail.blocked`      | Content blocked      | `guardrail.name`, `blocked.reason`, `blocked.content_hash` |

### RAG Events

| Event Name              | When Emitted            | Key Attributes                                         |
| ----------------------- | ----------------------- | ------------------------------------------------------ |
| `rag.query.embedded`    | Query embedding created | `embedding.model`, `embedding.dimensions`              |
| `rag.chunks.retrieved`  | Chunks returned         | `chunks.count`, `chunks.top_score`, `chunks.min_score` |
| `rag.chunks.reranked`   | Reranking complete      | `reranker.model`, `chunks.before`, `chunks.after`      |
| `rag.context.assembled` | Context built           | `context.tokens`, `context.chunks_used`                |

### Tool/Agent Events

| Event Name        | When Emitted         | Key Attributes                                      |
| ----------------- | -------------------- | --------------------------------------------------- |
| `tool.selected`   | Tool chosen by model | `tool.name`, `tool.arguments`                       |
| `tool.executed`   | Tool ran             | `tool.name`, `tool.result_type`, `tool.duration_ms` |
| `tool.failed`     | Tool errored         | `tool.name`, `error.type`, `error.message`          |
| `agent.iteration` | Agent loop iteration | `iteration.number`, `tokens.so_far`, `tools.called` |

### Evaluation Events

| Event Name              | When Emitted        | Key Attributes                                             |
| ----------------------- | ------------------- | ---------------------------------------------------------- |
| `eval.assertion.passed` | Assertion succeeded | `assertion.type`, `assertion.value`                        |
| `eval.assertion.failed` | Assertion failed    | `assertion.type`, `assertion.expected`, `assertion.actual` |
| `eval.score.computed`   | Score calculated    | `score.name`, `score.value`, `score.threshold`             |

---

## Database Schema

### New Table: `span_events`

```sql
CREATE TABLE span_events (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL REFERENCES traces(trace_id),
  span_id TEXT NOT NULL,
  name TEXT NOT NULL,
  timestamp INTEGER NOT NULL,  -- Unix ms
  attributes TEXT,  -- JSON
  created_at INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (trace_id, span_id)
    REFERENCES spans(trace_id, span_id)
);

-- Indexes for common queries
CREATE INDEX span_events_trace_id_idx ON span_events(trace_id);
CREATE INDEX span_events_span_id_idx ON span_events(span_id);
CREATE INDEX span_events_name_idx ON span_events(name);
CREATE INDEX span_events_timestamp_idx ON span_events(timestamp);
```

### Drizzle Schema

```typescript
// src/database/tables.ts

export const spanEventsTable = sqliteTable(
  'span_events',
  {
    id: text('id').primaryKey(),
    traceId: text('trace_id')
      .notNull()
      .references(() => tracesTable.traceId),
    spanId: text('span_id').notNull(),
    name: text('name').notNull(),
    timestamp: integer('timestamp').notNull(),
    attributes: text('attributes', { mode: 'json' }).$type<Record<string, any>>(),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    traceIdIdx: index('span_events_trace_id_idx').on(table.traceId),
    spanIdIdx: index('span_events_span_id_idx').on(table.spanId),
    nameIdx: index('span_events_name_idx').on(table.name),
    timestampIdx: index('span_events_timestamp_idx').on(table.timestamp),
  }),
);

export const spanEventsRelations = relations(spanEventsTable, ({ one }) => ({
  trace: one(tracesTable, {
    fields: [spanEventsTable.traceId],
    references: [tracesTable.traceId],
  }),
  span: one(spansTable, {
    fields: [spanEventsTable.spanId],
    references: [spansTable.spanId],
  }),
}));
```

### Migration

```typescript
// drizzle/migrations/XXXX_add_span_events.ts

import { sql } from 'drizzle-orm';
import type { SQLiteDatabase } from 'drizzle-orm/sqlite-core';

export async function up(db: SQLiteDatabase) {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS span_events (
      id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL,
      span_id TEXT NOT NULL,
      name TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      attributes TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      FOREIGN KEY (trace_id) REFERENCES traces(trace_id)
    )
  `);

  await db.run(sql`CREATE INDEX IF NOT EXISTS span_events_trace_id_idx ON span_events(trace_id)`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS span_events_span_id_idx ON span_events(span_id)`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS span_events_name_idx ON span_events(name)`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS span_events_timestamp_idx ON span_events(timestamp)`);
}

export async function down(db: SQLiteDatabase) {
  await db.run(sql`DROP TABLE IF EXISTS span_events`);
}
```

---

## OTLP Receiver Changes

### OTLP Event Format

The OTLP JSON format includes events in spans:

```json
{
  "resourceSpans": [
    {
      "scopeSpans": [
        {
          "spans": [
            {
              "traceId": "abc123",
              "spanId": "def456",
              "name": "genai.request",
              "events": [
                {
                  "name": "gen_ai.client.inference.operation.details",
                  "timeUnixNano": "1702000000000000000",
                  "attributes": [
                    { "key": "gen_ai.operation.name", "value": { "stringValue": "chat" } },
                    { "key": "gen_ai.usage.input_tokens", "value": { "intValue": "150" } }
                  ]
                },
                {
                  "name": "response.first_token",
                  "timeUnixNano": "1702000200000000000",
                  "attributes": [{ "key": "ttft_ms", "value": { "intValue": "200" } }]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### Parser Changes

```typescript
// src/tracing/otlpReceiver.ts

interface OTLPEvent {
  name: string;
  timeUnixNano: string;
  attributes?: OTLPAttribute[];
  droppedAttributesCount?: number;
}

interface OTLPSpan {
  // ... existing fields
  events?: OTLPEvent[];
}

interface ParsedEvent {
  name: string;
  timestamp: number;  // milliseconds
  attributes: Record<string, any>;
}

interface ParsedTrace {
  traceId: string;
  span: SpanData;
  events: ParsedEvent[];  // NEW
}

private parseOTLPJSONRequest(body: OTLPTraceRequest): ParsedTrace[] {
  const traces: ParsedTrace[] = [];

  for (const resourceSpan of body.resourceSpans) {
    for (const scopeSpan of resourceSpan.scopeSpans) {
      for (const span of scopeSpan.spans) {
        const traceId = this.convertId(span.traceId, 32);
        const spanId = this.convertId(span.spanId, 16);

        // Parse events
        const events: ParsedEvent[] = (span.events || []).map(event => ({
          name: event.name,
          timestamp: Number(event.timeUnixNano) / 1_000_000,  // nano to ms
          attributes: this.parseAttributes(event.attributes),
        }));

        traces.push({
          traceId,
          span: { /* existing span data */ },
          events,
        });
      }
    }
  }

  return traces;
}
```

---

## Store Layer Changes

### New Methods

```typescript
// src/tracing/store.ts

export interface EventData {
  name: string;
  timestamp: number;
  attributes?: Record<string, any>;
}

export interface ParsedEvent {
  traceId: string;
  spanId: string;
  event: EventData;
}

export class TraceStore {
  // ... existing methods

  async addEvents(traceId: string, spanId: string, events: EventData[]): Promise<void> {
    if (events.length === 0) return;

    const db = this.getDatabase();
    const eventRecords = events.map((event) => ({
      id: randomUUID(),
      traceId,
      spanId,
      name: event.name,
      timestamp: event.timestamp,
      attributes: event.attributes,
    }));

    await db.insert(spanEventsTable).values(eventRecords);
    logger.debug(`[TraceStore] Added ${events.length} events to span ${spanId}`);
  }

  async getEventsBySpan(spanId: string): Promise<EventData[]> {
    const db = this.getDatabase();
    const rows = await db
      .select()
      .from(spanEventsTable)
      .where(eq(spanEventsTable.spanId, spanId))
      .orderBy(asc(spanEventsTable.timestamp));

    return rows.map((row) => ({
      name: row.name,
      timestamp: row.timestamp,
      attributes: row.attributes ?? {},
    }));
  }

  async getEventsByTrace(traceId: string): Promise<Map<string, EventData[]>> {
    const db = this.getDatabase();
    const rows = await db
      .select()
      .from(spanEventsTable)
      .where(eq(spanEventsTable.traceId, traceId))
      .orderBy(asc(spanEventsTable.timestamp));

    const eventsBySpan = new Map<string, EventData[]>();
    for (const row of rows) {
      const events = eventsBySpan.get(row.spanId) || [];
      events.push({
        name: row.name,
        timestamp: row.timestamp,
        attributes: row.attributes ?? {},
      });
      eventsBySpan.set(row.spanId, events);
    }

    return eventsBySpan;
  }
}
```

### Update getSpans to Include Events

```typescript
async getSpans(traceId: string, options: TraceSpanQueryOptions = {}): Promise<SpanData[]> {
  // ... existing span query

  // Fetch events for all spans
  const eventsBySpan = await this.getEventsByTrace(traceId);

  // Attach events to spans
  for (const span of spans) {
    span.events = eventsBySpan.get(span.spanId) || [];
  }

  return spans;
}
```

---

## UI Changes

### TraceTimeline Component

Add event markers to the timeline:

```tsx
// src/app/src/components/traces/TraceTimeline.tsx

interface TraceEventMarker {
  name: string;
  timestamp: number;
  relativePosition: number; // 0-100%
  attributes: Record<string, any>;
  type: 'info' | 'warning' | 'error' | 'success';
}

function getEventType(eventName: string, attributes: Record<string, any>): EventMarkerType {
  if (eventName.includes('error') || eventName.includes('failed')) return 'error';
  if (eventName.includes('blocked') || eventName.includes('warning')) return 'warning';
  if (eventName.includes('success') || eventName.includes('complete')) return 'success';
  return 'info';
}

function EventMarker({ event, spanStart, totalDuration }: EventMarkerProps) {
  const position = ((event.timestamp - spanStart) / totalDuration) * 100;
  const theme = useTheme();

  const colors = {
    info: theme.palette.info.main,
    warning: theme.palette.warning.main,
    error: theme.palette.error.main,
    success: theme.palette.success.main,
  };

  return (
    <Tooltip
      title={
        <Box>
          <Typography variant="caption" fontWeight="bold">
            {event.name}
          </Typography>
          <Typography variant="caption" display="block">
            +{formatDuration((event.timestamp - spanStart) * 1000)}
          </Typography>
          {Object.entries(event.attributes).map(([key, value]) => (
            <Typography key={key} variant="caption" display="block" sx={{ ml: 1 }}>
              {key}: {JSON.stringify(value)}
            </Typography>
          ))}
        </Box>
      }
    >
      <Box
        sx={{
          position: 'absolute',
          left: `${position}%`,
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: colors[event.type],
          border: `2px solid ${theme.palette.background.paper}`,
          cursor: 'pointer',
          zIndex: 1,
          '&:hover': {
            transform: 'translate(-50%, -50%) scale(1.5)',
          },
        }}
      />
    </Tooltip>
  );
}
```

### Event List View

Add expandable event list below each span:

```tsx
function SpanEventList({ events }: { events: TraceEvent[] }) {
  const [expanded, setExpanded] = useState(false);

  if (events.length === 0) return null;

  return (
    <Box sx={{ ml: 4, mt: 1 }}>
      <Button
        size="small"
        onClick={() => setExpanded(!expanded)}
        startIcon={expanded ? <ExpandLess /> : <ExpandMore />}
      >
        {events.length} event{events.length > 1 ? 's' : ''}
      </Button>

      <Collapse in={expanded}>
        <List dense>
          {events.map((event, idx) => (
            <ListItem key={idx} sx={{ py: 0.5 }}>
              <EventIcon type={getEventType(event.name, event.attributes)} />
              <ListItemText
                primary={event.name}
                secondary={
                  <Box component="span" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {Object.entries(event.attributes)
                      .slice(0, 3)
                      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                      .join(', ')}
                    {Object.keys(event.attributes).length > 3 && '...'}
                  </Box>
                }
              />
            </ListItem>
          ))}
        </List>
      </Collapse>
    </Box>
  );
}
```

### TTFT Highlight

Special treatment for `response.first_token` events:

```tsx
function TTFTBadge({ event }: { event: TraceEvent }) {
  if (event.name !== 'response.first_token') return null;

  const ttft = event.attributes.ttft_ms || event.attributes['ttft.ms'];

  return (
    <Chip
      size="small"
      label={`TTFT: ${ttft}ms`}
      color={ttft < 500 ? 'success' : ttft < 1000 ? 'warning' : 'error'}
      sx={{ ml: 1 }}
    />
  );
}
```

---

## API Changes

### GET /api/traces/:traceId

Update response to include events:

```typescript
// Response shape
interface TraceResponse {
  traceId: string;
  evaluationId: string;
  testCaseId: string;
  spans: Array<{
    spanId: string;
    parentSpanId?: string;
    name: string;
    startTime: number;
    endTime?: number;
    attributes: Record<string, any>;
    statusCode?: number;
    statusMessage?: string;
    events: Array<{
      // NEW
      name: string;
      timestamp: number;
      attributes: Record<string, any>;
    }>;
  }>;
}
```

### GET /api/traces/:traceId/events

New endpoint for event-specific queries:

```typescript
// Query params
interface EventQueryParams {
  spanId?: string; // Filter to specific span
  name?: string; // Filter by event name (prefix match)
  from?: number; // Timestamp range start
  to?: number; // Timestamp range end
  limit?: number; // Max events to return
}

// Response
interface EventsResponse {
  events: Array<{
    spanId: string;
    name: string;
    timestamp: number;
    attributes: Record<string, any>;
  }>;
  total: number;
}
```

---

## Implementation Plan

### Phase 1: Foundation (1-2 days)

1. **Database schema**
   - [ ] Add `span_events` table to Drizzle schema
   - [ ] Create migration
   - [ ] Run migration on dev database
   - [ ] Add relations to spans/traces

2. **Store layer**
   - [ ] Add `addEvents()` method
   - [ ] Add `getEventsBySpan()` method
   - [ ] Add `getEventsByTrace()` method
   - [ ] Update `getSpans()` to include events

### Phase 2: OTLP Integration (1-2 days)

3. **OTLP receiver**
   - [ ] Update `OTLPSpan` interface to include events
   - [ ] Parse events in `parseOTLPJSONRequest()`
   - [ ] Store events alongside spans
   - [ ] Handle protobuf events (if #6540 merged)

4. **Tests**
   - [ ] Unit tests for event parsing
   - [ ] Integration tests for event storage
   - [ ] Test with real OTel SDK events

### Phase 3: UI (2-3 days)

5. **TraceTimeline**
   - [ ] Add event markers to span bars
   - [ ] Event tooltips with attributes
   - [ ] Color coding by event type

6. **Event list**
   - [ ] Expandable event list per span
   - [ ] Event filtering/search
   - [ ] TTFT badge for first_token events

7. **Export**
   - [ ] Include events in JSON export
   - [ ] Update export format documentation

### Phase 4: Built-in Events (2-3 days)

8. **GenAI tracer integration** (depends on #6536)
   - [ ] Emit `gen_ai.client.inference.operation.details` events
   - [ ] Emit `gen_ai.evaluation.result` events
   - [ ] Add TTFT event in streaming handler

9. **Provider events**
   - [ ] Add retry events
   - [ ] Add rate limit events
   - [ ] Add cache events

### Phase 5: Red Team Integration (1 day)

10. **Guardrail events**
    - [ ] Emit `guardrail.input.check` events
    - [ ] Emit `guardrail.output.check` events
    - [ ] Include in red team trace summaries

---

## Testing Strategy

### Unit Tests

```typescript
// test/tracing/events.test.ts

describe('SpanEvents', () => {
  describe('OTLP parsing', () => {
    it('should parse events from OTLP JSON', async () => {
      const otlpPayload = {
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: 'abc',
                    spanId: 'def',
                    events: [
                      {
                        name: 'test.event',
                        timeUnixNano: '1000000000000',
                        attributes: [{ key: 'foo', value: { stringValue: 'bar' } }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const parsed = receiver.parseOTLPJSONRequest(otlpPayload);
      expect(parsed[0].events).toHaveLength(1);
      expect(parsed[0].events[0].name).toBe('test.event');
      expect(parsed[0].events[0].attributes.foo).toBe('bar');
    });

    it('should handle spans without events', async () => {
      // ... test empty events array
    });
  });

  describe('Storage', () => {
    it('should store and retrieve events by span', async () => {
      // ... test storage roundtrip
    });

    it('should retrieve all events for a trace', async () => {
      // ... test trace-level query
    });
  });

  describe('Sanitization', () => {
    it('should redact sensitive event attributes', async () => {
      // ... test PII redaction
    });
  });
});
```

### Integration Tests

```typescript
// test/tracing/events.integration.test.ts

describe('Event Integration', () => {
  it('should receive events via OTLP and display in UI', async () => {
    // 1. Send OTLP trace with events
    // 2. Query trace via API
    // 3. Verify events are returned
  });

  it('should emit TTFT event for streaming responses', async () => {
    // 1. Run eval with streaming provider
    // 2. Query trace
    // 3. Verify response.first_token event exists
  });
});
```

---

## Security Considerations

### PII in Event Attributes

Events may contain sensitive data, especially GenAI convention events with `gen_ai.input.messages` and `gen_ai.output.messages`.

**Mitigations:**

1. **Opt-in content capture**: Message content requires explicit `tracing.captureContent: true`
2. **Attribute sanitization**: Apply same redaction as span attributes
3. **Retention policies**: Events deleted with parent traces
4. **Access control**: Same RBAC as traces

### Event Attribute Sanitization

```typescript
const SENSITIVE_EVENT_ATTRIBUTES = [
  'gen_ai.input.messages',
  'gen_ai.output.messages',
  'gen_ai.system_instructions',
  'prompt.content',
  'response.content',
  ...SENSITIVE_ATTRIBUTE_KEYS,
];

function sanitizeEventAttributes(
  attributes: Record<string, any>,
  options: { captureContent?: boolean } = {},
): Record<string, any> {
  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(attributes)) {
    const lowerKey = key.toLowerCase();

    // Redact sensitive keys unless content capture is enabled
    if (SENSITIVE_EVENT_ATTRIBUTES.some((k) => lowerKey.includes(k.toLowerCase()))) {
      if (options.captureContent) {
        sanitized[key] = truncateBody(String(value));
      } else {
        sanitized[key] = '<redacted>';
      }
      continue;
    }

    // Apply standard sanitization
    sanitized[key] = sanitizeValue(value);
  }

  return sanitized;
}
```

---

## Open Questions

### 1. Event Storage Strategy

**Question**: Store events inline in spans (JSON column) or separate table?

**Options**:

- A) **Separate table** (proposed): Better querying, indexing, but more joins
- B) **JSON in spans**: Simpler schema, but harder to query/filter events

**Recommendation**: Separate table for flexibility in future event-specific features

### 2. Event Volume Limits

**Question**: How many events per span should we store?

**Options**:

- A) Unlimited (store all)
- B) Fixed limit (e.g., 100 events per span)
- C) Configurable limit

**Recommendation**: Configurable with default of 100, warn if exceeded

### 3. Event Sampling for High-Volume Spans

**Question**: For streaming spans with many chunk events, should we sample?

**Options**:

- A) Store all chunk events
- B) Sample (e.g., every 10th chunk)
- C) Only store first/last + summary

**Recommendation**: Only store first_token, periodic checkpoints (every 100 tokens), and complete event

### 4. Backward Compatibility

**Question**: How to handle traces without events?

**Answer**: Events array defaults to empty `[]` - no breaking changes to API consumers

---

## References

- [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)
- [OpenTelemetry Events Specification](https://opentelemetry.io/docs/specs/semconv/general/events/)
- [GenAI Event Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-events/)
- [OTLP Specification](https://opentelemetry.io/docs/specs/otlp/)
- PR #6536: GenAI Semantic Conventions
- PR #5680: TTFT Measurement
