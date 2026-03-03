# Claude Agent SDK Tracing - Test/QA Plan

## Feature Overview

This document outlines the comprehensive test and QA plan for the Claude Agent SDK tracing feature (GitHub Issue #7333). The feature enables OpenTelemetry-based observability for the `anthropic:claude-agent-sdk` provider by:

1. Adding a `/v1/logs` OTLP endpoint to receive log events from Claude Code CLI
2. Converting OTEL log events to spans for storage and visualization
3. Emitting a root span from the provider with proper trace context propagation
4. Supporting both JSON and protobuf OTLP formats

## Architecture Summary

```
┌─────────────────────┐      ┌──────────────────────┐      ┌─────────────────┐
│  promptfoo eval     │      │   Claude Code CLI    │      │  OTLP Receiver  │
│  (root span)        │─────▶│   (OTEL events)      │─────▶│  (/v1/logs)     │
│  TRACEPARENT env    │      │   TRACEPARENT        │      │  Convert to     │
│                     │      │                      │      │  spans          │
└─────────────────────┘      └──────────────────────┘      └─────────────────┘
                                                                   │
                                                                   ▼
                                                           ┌─────────────────┐
                                                           │   TraceStore    │
                                                           │   (SQLite)      │
                                                           └─────────────────┘
```

## Test Coverage

### 1. Unit Tests (Completed)

**File:** `test/tracing/otlpReceiver.test.ts`

| Test Case                        | Status | Description                                 |
| -------------------------------- | ------ | ------------------------------------------- |
| Service info for logs endpoint   | ✅     | GET /v1/logs returns service metadata       |
| Valid OTLP JSON logs conversion  | ✅     | JSON logs are parsed and converted to spans |
| Logs without trace context       | ✅     | Missing traceId/spanId are auto-generated   |
| Valid OTLP protobuf logs         | ✅     | Binary protobuf logs are decoded and stored |
| Reject unsupported content types | ✅     | Non-JSON/protobuf content types return 415  |
| Reject invalid protobuf data     | ✅     | Malformed protobuf returns 400              |
| Multiple log records             | ✅     | Batch of logs all stored correctly          |
| Store error handling             | ✅     | Database errors return 500 gracefully       |

### 2. Integration Tests (To Be Created)

**File:** `test/integration/claude-agent-sdk-tracing.test.ts`

| Test Case                      | Priority | Description                                  |
| ------------------------------ | -------- | -------------------------------------------- |
| Provider emits root span       | High     | Verify `withGenAISpan` creates parent span   |
| TRACEPARENT env propagation    | High     | Verify trace context passed to child process |
| deep_tracing config option     | High     | Verify OTEL env vars set when enabled        |
| Log events linked to root span | High     | Child events have correct parent span ID     |
| Token usage in span attributes | Medium   | Verify usage tracked in span metadata        |
| Response body in span          | Medium   | Verify output captured in span               |
| Error handling in spans        | Medium   | Verify errors captured with status           |

### 3. End-to-End Tests

**Manual Testing Procedure:**

1. **Setup Test Configuration**

   ```yaml
   # test-config.yaml
   providers:
     - id: anthropic:claude-agent-sdk
       config:
         deep_tracing: true

   prompts:
     - 'What is 2 + 2?'

   tests:
     - vars: {}
   ```

2. **Run Evaluation with Tracing**

   ```bash
   # Start OTLP receiver (should start automatically with eval)
   npm run local -- eval -c test-config.yaml --no-cache --verbose
   ```

3. **Verify Trace Data**

   ```bash
   # Check SQLite database for stored spans
   sqlite3 ~/.promptfoo/promptfoo.db "SELECT id, name, traceId, parentSpanId FROM spans ORDER BY startTime DESC LIMIT 20"
   ```

4. **View in Web UI**
   ```bash
   npm run dev
   # Navigate to http://localhost:5173 and check traces view
   ```

## Verification Checklist

### Provider Configuration

- [ ] `deep_tracing: true` enables OTEL environment variables
- [ ] `deep_tracing: false` (default) does not set OTEL vars
- [ ] Existing OTEL env vars are not overwritten
- [ ] TRACEPARENT is set when active span exists

### OTLP Receiver

- [ ] `/v1/logs` endpoint accepts JSON (application/json)
- [ ] `/v1/logs` endpoint accepts protobuf (application/x-protobuf)
- [ ] Log events converted to zero-duration spans
- [ ] Attributes preserved (event name, severity, body)
- [ ] Trace context (traceId, spanId) linked correctly
- [ ] Missing trace context generates valid UUIDs

### Span Storage

- [ ] Spans stored in SQLite database
- [ ] Parent-child relationships preserved
- [ ] Timing information accurate
- [ ] Token usage captured (if available)

### Web UI

- [ ] Traces appear in trace list
- [ ] Span hierarchy displayed correctly
- [ ] Event attributes visible in span details
- [ ] Claude Code events grouped under root span

## Edge Cases and Error Scenarios

### Network/Process Issues

| Scenario                       | Expected Behavior                          |
| ------------------------------ | ------------------------------------------ |
| OTLP receiver not running      | Log events silently dropped (no crash)     |
| Claude Code process crash      | Provider returns error, span marked failed |
| Network timeout on OTLP export | Events queued or dropped gracefully        |
| High volume of events          | Receiver handles concurrent requests       |

### Data Format Issues

| Scenario                   | Expected Behavior                   |
| -------------------------- | ----------------------------------- |
| Empty resourceLogs array   | 200 OK, no spans stored             |
| Malformed JSON             | 400 Bad Request with error message  |
| Invalid protobuf bytes     | 400 Bad Request with error message  |
| Very long attribute values | Truncated or stored as-is           |
| Missing required fields    | Fields default to empty/zero values |

### Configuration Issues

| Scenario                      | Expected Behavior                        |
| ----------------------------- | ---------------------------------------- |
| Invalid OTLP endpoint         | Claude Code logs warning, events dropped |
| Conflicting OTEL env vars     | User-provided vars take precedence       |
| deep_tracing without receiver | Events sent but not received             |

## Performance Considerations

1. **Protobuf Loading**: Proto definitions are cached after first load
2. **Batch Processing**: Multiple log records processed in single request
3. **Async Storage**: Database writes don't block HTTP response
4. **Memory Usage**: Large payloads should be streamed, not buffered

## Security Considerations

1. **Local-only Receiver**: OTLP endpoint binds to 127.0.0.1 only
2. **No Auth Required**: Local process communication assumed trusted
3. **Sensitive Data**: Log events may contain user prompts/responses
4. **Trace Context**: TRACEPARENT doesn't expose secrets

## Known Limitations

1. **Claude Code Requirement**: Requires Claude Code CLI with OTEL support
2. **Log Events Only**: Claude Code exports logs, not traces directly
3. **Zero-Duration Spans**: Converted log events don't have duration
4. **No Sampling**: All events exported (may be high volume)
5. **Local Only**: OTLP receiver doesn't support remote connections

## Smoke Test Commands

```bash
# 1. Verify OTLP receiver starts with server
npm run dev:server
curl http://127.0.0.1:4318/v1/logs -X GET

# 2. Test JSON logs ingestion
curl http://127.0.0.1:4318/v1/logs \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"resourceLogs":[{"resource":{"attributes":[]},"scopeLogs":[{"scope":{},"logRecords":[{"timeUnixNano":"1234567890000000000","body":{"stringValue":"test"},"attributes":[]}]}]}]}'

# 3. Verify spans stored
sqlite3 ~/.promptfoo/promptfoo.db "SELECT COUNT(*) FROM spans"

# 4. Run unit tests
npx vitest run test/tracing/otlpReceiver.test.ts

# 5. Run integration test (when available)
npm run test:integration -- --grep "claude-agent-sdk"
```

## Rollback Plan

If issues are discovered post-deployment:

1. **Disable Feature**: Users can omit `deep_tracing: true` from config
2. **Remove Logs Endpoint**: Revert otlpReceiver.ts changes
3. **Provider Revert**: Revert claude-agent-sdk.ts to pre-tracing version

## Sign-off Criteria

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Manual E2E testing completed successfully
- [ ] No performance regressions
- [ ] Documentation updated
- [ ] PR reviewed and approved
