# Langfuse Traces Evaluation Integration

**GitHub Issue:** #4157
**Author:** Generated with Claude Code
**Date:** 2025-12-16

## Problem Statement

Promptfoo currently integrates with Langfuse for **prompt retrieval** only (`langfuse://prompt-name@label`). Users want to evaluate **traces and sessions** stored in Langfuse - essentially using Langfuse as a source of test data and writing evaluation results back.

### User Stories

1. **Production Quality Monitoring**: "I want to sample traces from production and run them through evaluation assertions to catch quality regressions."
2. **Trace Evaluation**: "I have traces in Langfuse and want to evaluate the LLM outputs against my criteria without re-running the prompts."
3. **Score Syncing**: "I want promptfoo evaluation scores to appear in Langfuse so I can track quality trends in one place."

## Current State

### Existing Langfuse Integration (`src/integrations/langfuse.ts`)

- Only supports prompt retrieval via `langfuse://prompt-id@label:type`
- Uses Langfuse SDK's `getPrompt()` method
- Environment variables: `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`

### Langfuse API Capabilities

**Traces API** (from Langfuse docs):

```typescript
// List traces with filtering
const traces = await langfuse.api.trace.list({
  limit: 100,
  userId: 'user_123',
  sessionId: 'session_456',
  tags: ['production'],
  name: 'chat-completion',
  // Time range filters: fromTimestamp, toTimestamp
});

// Get single trace with observations and scores
const trace = await langfuse.api.trace.get('trace-id');
```

**Trace Object Structure**:

```typescript
interface LangfuseTrace {
  id: string;
  timestamp: string;
  name?: string;
  userId?: string;
  sessionId?: string;
  input?: any; // The input sent to LLM
  output?: any; // The LLM response
  metadata?: Record<string, any>;
  tags?: string[];
  release?: string;
  version?: string;
  // Extended fields when fetching single trace:
  observations?: Observation[]; // Spans, generations
  scores?: Score[];
  latency?: number;
  totalCost?: number;
}
```

**Scores API** (for writing back results):

```typescript
langfuse.score.create({
  traceId: 'trace-id',
  name: 'correctness',
  value: 0.85,
  dataType: 'NUMERIC', // or "CATEGORICAL", "BOOLEAN"
  comment: 'Promptfoo evaluation result',
});
```

## Proposed Integration Design

### Approach: Dataset Provider + Score Callback

Follow the established pattern from HuggingFace datasets integration, with an additional callback for writing scores back to Langfuse.

### URL Schema

```
langfuse://traces?<filter-params>
langfuse://sessions/<session-id>
```

**Filter Parameters:**
| Parameter | Description | Example |
|-----------|-------------|---------|
| `limit` | Max traces to fetch | `limit=100` |
| `userId` | Filter by user | `userId=user_123` |
| `sessionId` | Filter by session | `sessionId=sess_456` |
| `tags` | Filter by tags (comma-separated) | `tags=production,gpt-4` |
| `name` | Filter by trace name | `name=chat-completion` |
| `from` | Start timestamp (ISO) | `from=2024-01-01` |
| `to` | End timestamp (ISO) | `to=2024-01-31` |
| `environment` | Filter by environment | `environment=production` |

### Configuration Examples

#### Basic: Evaluate traces without re-running prompts

```yaml
# Evaluate existing LLM outputs stored in Langfuse
tests: langfuse://traces?tags=production&limit=50

# No prompts/providers needed - we're evaluating existing outputs
defaultTest:
  assert:
    - type: llm-rubric
      value: 'Response is helpful and accurate'
    - type: cost
      threshold: 0.01
    - type: latency
      threshold: 2000
```

#### With Prompt Comparison (A/B Testing)

```yaml
# Compare stored trace outputs against a new prompt version
prompts:
  - langfuse://my-prompt@production
  - langfuse://my-prompt@experiment-v2

providers:
  - openai:gpt-4o

tests: langfuse://traces?tags=production&limit=100&name=chat-completion

# Map trace fields to test variables
testTransform: |
  return tests.map(t => ({
    vars: {
      user_input: t.vars.__langfuse_input,
      context: t.vars.__langfuse_metadata?.context
    },
    metadata: {
      langfuseTraceId: t.vars.__langfuse_trace_id
    }
  }));

defaultTest:
  assert:
    - type: similar
      value: '{{__langfuse_output}}'
      threshold: 0.8
```

#### Session Evaluation

```yaml
# Evaluate an entire conversation session
tests: langfuse://sessions/sess_abc123

defaultTest:
  assert:
    - type: python
      value: file://eval_conversation.py
```

#### Score Write-back

```yaml
tests: langfuse://traces?tags=needs-review&limit=20

# Write evaluation results back to Langfuse
extensions:
  langfuse:
    writeScores: true
    scorePrefix: 'promptfoo_' # Creates scores like "promptfoo_correctness"
    aggregateScore: true # Also write overall pass/fail

defaultTest:
  assert:
    - type: llm-rubric
      value: 'Response is factually accurate'
      metric: accuracy # → Langfuse score: "promptfoo_accuracy"
```

### Data Mapping: Trace → TestCase

```typescript
interface TestCaseFromTrace {
  vars: {
    // Langfuse trace fields (prefixed to avoid collisions)
    __langfuse_trace_id: string;
    __langfuse_input: any;
    __langfuse_output: any;
    __langfuse_metadata: Record<string, any>;
    __langfuse_user_id?: string;
    __langfuse_session_id?: string;
    __langfuse_tags?: string[];
    __langfuse_latency?: number;
    __langfuse_cost?: number;

    // Also spread input fields directly for convenience
    ...flattenedInput
  };

  // For assertion-only evaluation (no re-running)
  providerOutput?: {
    output: any;
    tokenUsage?: TokenUsage;
    cost?: number;
    latency?: number;
  };

  metadata: {
    langfuseTraceId: string;
    langfuseTraceUrl: string;
  };

  description: string;  // e.g., "Trace abc123 (2024-01-15)"
}
```

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     promptfooconfig.yaml                         │
│  tests: langfuse://traces?tags=production&limit=100             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   testCaseReader.ts                              │
│  if (varsPath.startsWith('langfuse://traces'))                  │
│    return fetchLangfuseTraces(varsPath)                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              src/integrations/langfuseTraces.ts                  │
│  - Parse URL and extract filter params                          │
│  - Call Langfuse API to fetch traces                            │
│  - Convert traces to TestCase[] with providerOutput             │
│  - Handle pagination for large datasets                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Evaluator                                   │
│  - Run assertions against providerOutput (no LLM call needed)   │
│  - Or run prompts with vars from trace input                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│               Score Write-back (Optional)                        │
│  - After evaluation, call Langfuse score.create()               │
│  - Map assertion results to Langfuse scores                     │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Core Trace Fetching (MVP)

**Files to create/modify:**

1. **`src/integrations/langfuseTraces.ts`** (new)
   - `fetchLangfuseTraces(url: string): Promise<TestCase[]>`
   - URL parsing for filter parameters
   - Langfuse API client initialization (reuse existing singleton pattern)
   - Pagination handling
   - Trace → TestCase conversion

2. **`src/util/testCaseReader.ts`** (modify)
   - Add `langfuse://traces` prefix handling (similar to `huggingface://datasets`)

3. **`test/integrations/langfuseTraces.test.ts`** (new)
   - Unit tests with mocked Langfuse API

**Estimated scope:** ~300-400 lines of code

### Phase 2: Session Support

1. Add `langfuse://sessions/<id>` URL pattern
2. Fetch all traces for a session
3. Order by timestamp
4. Option to evaluate as single multi-turn conversation or individual turns

### Phase 3: Score Write-back

1. **`src/integrations/langfuseScores.ts`** (new)
   - `writeScoresToLangfuse(results: EvaluateResult[], config: LangfuseConfig)`

2. **Configuration schema** - Add `extensions.langfuse` to config type

3. **Post-evaluation hook** - Call score write-back after eval completes

### Phase 4: Documentation & Examples

1. **`site/docs/integrations/langfuse.md`** - Extend existing doc
2. **`examples/langfuse-traces/`** - Example configurations
3. **`examples/langfuse-traces/README.md`** - Usage guide

## Key Decisions Needed

### 1. Assertion-Only vs Re-run Mode

**Option A: Assertion-only by default**

- When `prompts` is empty, evaluate the stored `output` directly
- Faster, no LLM costs
- Good for: quality monitoring, trace auditing

**Option B: Re-run mode**

- Use trace `input` as test vars, run through new prompts
- Useful for: A/B testing, regression testing

**Recommendation:** Support both. Assertion-only when no prompts defined.

### 2. Variable Naming Convention

**Option A: Prefixed (`__langfuse_input`)**

- Clear separation, no collisions
- More verbose in configs

**Option B: Unprefixed with collision detection**

- Cleaner syntax (`{{input}}`, `{{output}}`)
- Risk of collisions with user vars

**Recommendation:** Use prefixed by default, allow `fieldMapping` config to customize.

### 3. Score Write-back Trigger

**Option A: Automatic (opt-out)**

- Writes scores by default when Langfuse creds present
- Could be surprising

**Option B: Explicit opt-in**

- Requires `writeScores: true` in config
- More control

**Recommendation:** Explicit opt-in via config.

### 4. Pagination Strategy

For large trace sets:

- Default limit: 100 traces
- Max limit: 1000 traces
- Show progress bar for large fetches (like HuggingFace)
- Use cursor-based pagination from Langfuse API

## Open Questions

1. **Should we support observation-level evaluation?** (e.g., evaluate individual spans within a trace)

2. **How to handle traces with missing output?** (Skip? Error? Warn?)

3. **Should we support Langfuse datasets as well?** (Langfuse has its own dataset concept separate from traces)

4. **Rate limiting considerations?** Langfuse API limits for large-scale fetches.

## Success Metrics

- Users can evaluate 100+ traces from Langfuse in a single eval run
- Scores appear in Langfuse UI within 30 seconds of eval completion
- Integration works with both Langfuse Cloud and self-hosted instances
- Documentation enables self-service adoption

## References

- [Langfuse Traces API](https://langfuse.com/docs/query-traces)
- [Langfuse Scores API](https://langfuse.com/docs/scores/custom)
- [Langfuse API Reference](https://api.reference.langfuse.com/)
- [Existing Langfuse Prompt Integration](./site/docs/integrations/langfuse.md)
- [HuggingFace Datasets Integration](./src/integrations/huggingfaceDatasets.ts) - Pattern reference
