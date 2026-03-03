# Test Case Native Implementation Plan

> **Goal**: Make test cases first-class entities with stable identity, cross-eval search, history tracking, and improved trace correlation.

## Executive Summary

This plan transforms Promptfoo from an eval-centric to a test-case-native experience. Based on codebase exploration, we identified:

1. **Current State**: Test cases are embedded in `eval_results.testCase` JSON with only index-based identity (`testIdx`)
2. **Key Problem**: No stable test case identity across evals; trace correlation uses inconsistent formats
3. **Solution**: Add `test_cases` table with content-based fingerprinting, fix trace correlation, add UI views

---

## Phase 1: Data Model Foundation (MVP)

### 1.1 Add `test_cases` Table

**File**: `src/database/tables.ts`

```typescript
export const testCasesTable = sqliteTable(
  'test_cases',
  {
    // Primary key: content-based hash (SHA256 of canonical JSON)
    id: text('id').primaryKey(),

    // Canonical fingerprint (SHA256 hex) - alternative lookup
    fingerprint: text('fingerprint').notNull().unique(),

    // Core fields
    description: text('description'),
    varsJson: text('vars_json', { mode: 'json' }).$type<Record<string, unknown>>(),
    assertsJson: text('asserts_json', { mode: 'json' }).$type<Assertion[]>(),
    metadataJson: text('metadata_json', { mode: 'json' }).$type<Record<string, unknown>>(),

    // Source tracking
    sourceType: text('source_type'), // 'inline' | 'csv' | 'json' | 'yaml' | 'hf' | 'generator'
    sourceRef: text('source_ref'), // file path / dataset name / generator path
    sourceRow: integer('source_row'), // for CSV/XLSX

    // Timestamps
    createdAt: integer('created_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: integer('updated_at')
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    fingerprintIdx: uniqueIndex('test_cases_fingerprint_idx').on(table.fingerprint),
    descriptionIdx: index('test_cases_description_idx').on(table.description),
    sourceTypeIdx: index('test_cases_source_type_idx').on(table.sourceType),
    createdAtIdx: index('test_cases_created_at_idx').on(table.createdAt),
  }),
);
```

**Fingerprint Algorithm** (`src/util/testCaseFingerprint.ts`):

```typescript
import { sha256 } from './createHash';

interface TestCaseFingerprintInput {
  vars?: Record<string, unknown>;
  assert?: Assertion[];
  description?: string;
  // Exclude: provider, options, metadata (not part of identity)
}

export function computeTestCaseFingerprint(testCase: TestCaseFingerprintInput): string {
  // Canonical JSON: sorted keys, no whitespace
  const canonical = JSON.stringify(
    {
      assert: testCase.assert || [],
      description: testCase.description || '',
      vars: sortKeys(testCase.vars || {}),
    },
    sortedReplacer,
  );

  return sha256(canonical);
}

export function computeTestCaseId(fingerprint: string): string {
  // Use UUID v5 namespace for deterministic IDs
  return uuidv5(fingerprint, PROMPTFOO_TEST_CASE_NAMESPACE);
}
```

### 1.2 Add `test_case_id` to `eval_results`

**Migration**: `drizzle/0023_test_cases.sql`

```sql
-- Create test_cases table
CREATE TABLE `test_cases` (
  `id` text PRIMARY KEY NOT NULL,
  `fingerprint` text NOT NULL UNIQUE,
  `description` text,
  `vars_json` text,
  `asserts_json` text,
  `metadata_json` text,
  `source_type` text,
  `source_ref` text,
  `source_row` integer,
  `created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Add indexes
CREATE UNIQUE INDEX `test_cases_fingerprint_idx` ON `test_cases` (`fingerprint`);
CREATE INDEX `test_cases_description_idx` ON `test_cases` (`description`);
CREATE INDEX `test_cases_source_type_idx` ON `test_cases` (`source_type`);
CREATE INDEX `test_cases_created_at_idx` ON `test_cases` (`created_at`);

-- Add test_case_id column to eval_results
ALTER TABLE `eval_results` ADD COLUMN `test_case_id` text REFERENCES `test_cases`(`id`);

-- Add index for test_case_id lookups
CREATE INDEX `eval_result_test_case_id_idx` ON `eval_results` (`test_case_id`);
CREATE INDEX `eval_result_test_case_id_eval_idx` ON `eval_results` (`test_case_id`, `eval_id`);
```

### 1.3 Backfill Existing Data

**Script**: `src/migrate/backfillTestCases.ts`

```typescript
export async function backfillTestCases(): Promise<void> {
  const db = getDb();

  // Get all eval_results with testCase JSON but no test_case_id
  const results = await db
    .select({ id: evalResultsTable.id, testCase: evalResultsTable.testCase })
    .from(evalResultsTable)
    .where(isNull(evalResultsTable.testCaseId));

  for (const result of results) {
    const fingerprint = computeTestCaseFingerprint(result.testCase);
    const testCaseId = computeTestCaseId(fingerprint);

    // Upsert test_case
    await db
      .insert(testCasesTable)
      .values({
        id: testCaseId,
        fingerprint,
        description: result.testCase.description,
        varsJson: result.testCase.vars,
        assertsJson: result.testCase.assert,
        metadataJson: result.testCase.metadata,
        sourceType: 'backfill',
      })
      .onConflictDoNothing();

    // Update eval_result
    await db.update(evalResultsTable).set({ testCaseId }).where(eq(evalResultsTable.id, result.id));
  }
}
```

### 1.4 Update Evaluator to Compute Test Case ID

**File**: `src/evaluator.ts` (around line 1200)

```typescript
// After generateVarCombinations, before pushing to runEvalOptions:
const testCaseForFingerprint = {
  vars,
  assert: test.assert,
  description: test.description,
};
const fingerprint = computeTestCaseFingerprint(testCaseForFingerprint);
const testCaseId = computeTestCaseId(fingerprint);

// Upsert test case to DB
await upsertTestCase({
  id: testCaseId,
  fingerprint,
  description: test.description,
  varsJson: vars,
  assertsJson: test.assert,
  metadataJson: test.metadata,
  sourceType: inferSourceType(test),
  sourceRef: test.__sourceFile,
  sourceRow: test.__sourceRow,
});

runEvalOptions.push({
  testIdx,
  promptIdx,
  testCaseId, // NEW: stable ID
  test: { ...test, vars },
  // ...
});
```

---

## Phase 2: Fix Trace Correlation

### 2.1 The Current Problem

From exploration of `src/tracing/evaluatorTracing.ts:183`:

```typescript
// CURRENT: Falls back to composed format "testIdx-promptIdx"
const testCaseId = test.metadata?.testCaseId || (test as any).id || `${testIdx}-${promptIdx}`;
```

**Issue**: Traces use `"3-1"` format while results have separate `testIdx`/`promptIdx` fields.

### 2.2 Add `eval_result_id` as Primary Correlation Key

**Update**: `src/tracing/evaluatorTracing.ts`

```typescript
export async function generateTraceContextIfNeeded(
  test: AtomicTestCase,
  evaluateOptions: EvaluateOptions,
  testIdx: number,
  promptIdx: number,
  testSuite: TestSuite,
  evalResultId: string, // NEW: pass the result ID
  testCaseId: string, // NEW: pass the stable test case ID
): Promise<TraceContext | null> {
  if (!evaluateOptions.tracing?.enabled) {
    return null;
  }

  const traceId = generateTraceId();
  const spanId = generateSpanId();
  const traceparent = generateTraceparent(traceId, spanId, true);
  const evaluationId = testSuite.evalId;

  await traceStore.createTrace({
    traceId,
    evaluationId: evaluationId || '',
    testCaseId, // Use stable ID
    evalResultId, // NEW: link to specific result
    metadata: {
      testIdx,
      promptIdx,
      vars: test.vars,
    },
  });

  return { traceparent, evaluationId, testCaseId, evalResultId };
}
```

### 2.3 Update OTEL Attributes

**File**: `src/tracing/genaiTracer.ts`

Add new attributes to root spans:

```typescript
export const PromptfooAttributes = {
  // Existing
  PROVIDER_ID: 'promptfoo.provider.id',
  EVAL_ID: 'promptfoo.eval.id',
  TEST_INDEX: 'promptfoo.test.index',
  PROMPT_LABEL: 'promptfoo.prompt.label',

  // NEW: Primary keys for correlation
  EVAL_RESULT_ID: 'promptfoo.eval_result.id', // Links trace to specific cell
  TEST_CASE_ID: 'promptfoo.test_case.id', // Stable test case identity

  // Keep for compatibility
  CACHE_HIT: 'promptfoo.cache_hit',
  REQUEST_BODY: 'promptfoo.request.body',
  RESPONSE_BODY: 'promptfoo.response.body',
};
```

### 2.4 Update `traces` Table Schema

**Migration**: Add `eval_result_id` column

```sql
-- Add eval_result_id to traces table
ALTER TABLE `traces` ADD COLUMN `eval_result_id` text REFERENCES `eval_results`(`id`);

-- Add index for efficient lookups
CREATE INDEX `traces_eval_result_id_idx` ON `traces` (`eval_result_id`);
```

### 2.5 Update TraceView Component

**File**: `src/app/src/components/traces/TraceView.tsx`

Replace the 3-tier fallback with direct lookup:

```typescript
// BEFORE: Complicated fallback logic
const isComposedId = (id: unknown): id is string => typeof id === 'string' && /^\d+-\d+$/.test(id);

// AFTER: Direct filtering by evalResultId
const filteredTraces = useMemo(() => {
  if (!traces || traces.length === 0) return [];

  // Primary: filter by evalResultId if available
  if (evalResultId) {
    return traces.filter((trace) => trace.evalResultId === evalResultId);
  }

  // Fallback: filter by testCaseId (stable ID)
  if (testCaseId) {
    return traces.filter((trace) => trace.testCaseId === testCaseId);
  }

  // Legacy fallback: composed format for old data
  if (testIndex !== undefined && promptIndex !== undefined) {
    return traces.filter((trace) => matchesIndices(trace.testCaseId, testIndex, promptIndex));
  }

  return traces;
}, [traces, evalResultId, testCaseId, testIndex, promptIndex]);
```

---

## Phase 3: Full-Text Search (FTS5)

### 3.1 Create FTS5 Virtual Table

**Migration**: `drizzle/0024_test_cases_fts.sql`

```sql
-- Create FTS5 virtual table for test case search
CREATE VIRTUAL TABLE test_cases_fts USING fts5(
  test_case_id UNINDEXED,
  description,
  vars_text,
  asserts_text,
  metadata_text,
  content='test_cases',
  content_rowid='rowid'
);

-- Trigger to keep FTS in sync on INSERT
CREATE TRIGGER test_cases_ai AFTER INSERT ON test_cases BEGIN
  INSERT INTO test_cases_fts(
    rowid, test_case_id, description, vars_text, asserts_text, metadata_text
  ) VALUES (
    new.rowid,
    new.id,
    new.description,
    flatten_vars_for_fts(new.vars_json),
    flatten_asserts_for_fts(new.asserts_json),
    flatten_metadata_for_fts(new.metadata_json)
  );
END;

-- Trigger for UPDATE
CREATE TRIGGER test_cases_au AFTER UPDATE ON test_cases BEGIN
  INSERT INTO test_cases_fts(
    test_cases_fts, rowid, test_case_id, description, vars_text, asserts_text, metadata_text
  ) VALUES (
    'delete', old.rowid, old.id, old.description,
    flatten_vars_for_fts(old.vars_json),
    flatten_asserts_for_fts(old.asserts_json),
    flatten_metadata_for_fts(old.metadata_json)
  );
  INSERT INTO test_cases_fts(
    rowid, test_case_id, description, vars_text, asserts_text, metadata_text
  ) VALUES (
    new.rowid,
    new.id,
    new.description,
    flatten_vars_for_fts(new.vars_json),
    flatten_asserts_for_fts(new.asserts_json),
    flatten_metadata_for_fts(new.metadata_json)
  );
END;

-- Trigger for DELETE
CREATE TRIGGER test_cases_ad AFTER DELETE ON test_cases BEGIN
  INSERT INTO test_cases_fts(
    test_cases_fts, rowid, test_case_id, description, vars_text, asserts_text, metadata_text
  ) VALUES (
    'delete', old.rowid, old.id, old.description,
    flatten_vars_for_fts(old.vars_json),
    flatten_asserts_for_fts(old.asserts_json),
    flatten_metadata_for_fts(old.metadata_json)
  );
END;
```

**Note**: SQLite FTS5 triggers require custom SQL functions. Alternative approach: populate FTS table in application code.

### 3.2 Implement FTS Population in Application Code

**File**: `src/database/testCaseFts.ts`

```typescript
export function flattenVarsForFts(vars: Record<string, unknown> | null): string {
  if (!vars) return '';
  return Object.entries(vars)
    .map(([key, value]) => `${key}:${String(value)} ${String(value)}`)
    .join(' ');
}

export function flattenAssertsForFts(asserts: Assertion[] | null): string {
  if (!asserts) return '';
  return asserts.map((a) => `${a.type} ${a.value || ''} ${a.threshold || ''}`).join(' ');
}

export function flattenMetadataForFts(metadata: Record<string, unknown> | null): string {
  if (!metadata) return '';
  return Object.entries(metadata)
    .map(([key, value]) => `${key}:${String(value)}`)
    .join(' ');
}

export async function populateFtsForTestCase(testCaseId: string): Promise<void> {
  const db = getDb();
  const testCase = await db
    .select()
    .from(testCasesTable)
    .where(eq(testCasesTable.id, testCaseId))
    .get();

  if (!testCase) return;

  await db.run(sql`
    INSERT OR REPLACE INTO test_cases_fts(
      test_case_id, description, vars_text, asserts_text, metadata_text
    ) VALUES (
      ${testCase.id},
      ${testCase.description || ''},
      ${flattenVarsForFts(testCase.varsJson)},
      ${flattenAssertsForFts(testCase.assertsJson)},
      ${flattenMetadataForFts(testCase.metadataJson)}
    )
  `);
}
```

### 3.3 Search API Endpoint

**File**: `src/server/routes/testCases.ts`

```typescript
import { Router } from 'express';

const testCasesRouter = Router();

// GET /api/test-cases/search?q=...&limit=...&offset=...
testCasesRouter.get('/search', async (req, res) => {
  const { q, limit = 50, offset = 0, source, metadata } = req.query;

  const db = getDb();
  let results;

  if (q) {
    // FTS5 search
    results = await db.all(sql`
      SELECT tc.*, fts.rank
      FROM test_cases tc
      JOIN test_cases_fts fts ON tc.id = fts.test_case_id
      WHERE test_cases_fts MATCH ${q}
      ORDER BY fts.rank
      LIMIT ${limit} OFFSET ${offset}
    `);
  } else {
    // Regular query with filters
    results = await db
      .select()
      .from(testCasesTable)
      .orderBy(desc(testCasesTable.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));
  }

  // Augment with aggregate stats
  const withStats = await Promise.all(
    results.map(async (tc) => ({
      ...tc,
      stats: await getTestCaseStats(tc.id),
    })),
  );

  res.json({ testCases: withStats });
});

// GET /api/test-cases/:id
testCasesRouter.get('/:id', async (req, res) => {
  const { id } = req.params;
  const testCase = await getTestCaseWithHistory(id);
  res.json(testCase);
});

// GET /api/test-cases/:id/history
testCasesRouter.get('/:id/history', async (req, res) => {
  const { id } = req.params;
  const { limit = 100, offset = 0 } = req.query;

  const history = await db
    .select({
      evalId: evalResultsTable.evalId,
      evalCreatedAt: evalsTable.createdAt,
      success: evalResultsTable.success,
      score: evalResultsTable.score,
      latencyMs: evalResultsTable.latencyMs,
      cost: evalResultsTable.cost,
      provider: evalResultsTable.provider,
      promptIdx: evalResultsTable.promptIdx,
    })
    .from(evalResultsTable)
    .innerJoin(evalsTable, eq(evalResultsTable.evalId, evalsTable.id))
    .where(eq(evalResultsTable.testCaseId, id))
    .orderBy(desc(evalsTable.createdAt))
    .limit(Number(limit))
    .offset(Number(offset));

  res.json({ history });
});

export default testCasesRouter;
```

---

## Phase 4: Trace Summaries & Filtering

### 4.1 Add Summary Columns to `traces` Table

**Migration**: `drizzle/0025_trace_summaries.sql`

```sql
-- Add summary columns for efficient filtering
ALTER TABLE `traces` ADD COLUMN `duration_ms` integer;
ALTER TABLE `traces` ADD COLUMN `span_count` integer;
ALTER TABLE `traces` ADD COLUMN `error_span_count` integer;
ALTER TABLE `traces` ADD COLUMN `input_tokens` integer;
ALTER TABLE `traces` ADD COLUMN `output_tokens` integer;
ALTER TABLE `traces` ADD COLUMN `total_tokens` integer;
ALTER TABLE `traces` ADD COLUMN `summary_json` text;

-- Add indexes for filtering
CREATE INDEX `traces_duration_ms_idx` ON `traces` (`duration_ms`);
CREATE INDEX `traces_error_span_count_idx` ON `traces` (`error_span_count`);
CREATE INDEX `traces_test_case_id_idx` ON `traces` (`test_case_id`);
```

### 4.2 Compute Summaries on Trace Completion

**File**: `src/tracing/store.ts`

```typescript
export async function computeAndStoreTraceSummary(traceId: string): Promise<void> {
  const db = getDb();

  // Get all spans for this trace
  const spans = await db.select().from(spansTable).where(eq(spansTable.traceId, traceId));

  if (spans.length === 0) return;

  // Compute summary metrics
  const startTimes = spans.map((s) => s.startTime).filter(Boolean);
  const endTimes = spans.map((s) => s.endTime).filter(Boolean);
  const minStart = Math.min(...startTimes);
  const maxEnd = Math.max(...endTimes);
  const durationMs = maxEnd - minStart;

  const spanCount = spans.length;
  const errorSpanCount = spans.filter((s) => isErrorSpan(s)).length;

  // Extract token usage from gen_ai spans
  const tokenUsage = spans.reduce(
    (acc, span) => {
      const attrs = span.attributes || {};
      return {
        input: acc.input + (attrs['gen_ai.usage.input_tokens'] || 0),
        output: acc.output + (attrs['gen_ai.usage.output_tokens'] || 0),
      };
    },
    { input: 0, output: 0 },
  );

  // Build summary JSON
  const slowestSpans = spans
    .filter((s) => s.endTime && s.startTime)
    .map((s) => ({
      spanId: s.spanId,
      name: s.name,
      durationMs: s.endTime - s.startTime,
    }))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 5);

  const errorSpans = spans
    .filter(isErrorSpan)
    .map((s) => ({
      spanId: s.spanId,
      name: s.name,
      message: s.statusMessage?.slice(0, 200),
    }))
    .slice(0, 5);

  // Update trace record
  await db
    .update(tracesTable)
    .set({
      durationMs,
      spanCount,
      errorSpanCount,
      inputTokens: tokenUsage.input,
      outputTokens: tokenUsage.output,
      totalTokens: tokenUsage.input + tokenUsage.output,
      summaryJson: JSON.stringify({ slowestSpans, errorSpans }),
    })
    .where(eq(tracesTable.traceId, traceId));
}
```

### 4.3 Aggregate Stats for Test Case View

**File**: `src/server/routes/testCases.ts`

```typescript
async function getTestCaseTraceStats(testCaseId: string): Promise<TraceStats> {
  const db = getDb();

  // Get all traces for this test case
  const stats = await db.get(sql`
    SELECT
      COUNT(*) as total_traces,
      AVG(duration_ms) as avg_duration_ms,
      percentile(duration_ms, 0.95) as p95_duration_ms,
      SUM(CASE WHEN error_span_count > 0 THEN 1 ELSE 0 END) as traces_with_errors,
      AVG(span_count) as avg_span_count,
      SUM(input_tokens) as total_input_tokens,
      SUM(output_tokens) as total_output_tokens
    FROM traces
    WHERE test_case_id = ${testCaseId}
  `);

  return {
    totalTraces: stats.total_traces,
    avgDurationMs: stats.avg_duration_ms,
    p95DurationMs: stats.p95_duration_ms,
    errorRate: stats.traces_with_errors / stats.total_traces,
    avgSpanCount: stats.avg_span_count,
    totalInputTokens: stats.total_input_tokens,
    totalOutputTokens: stats.total_output_tokens,
  };
}
```

---

## Phase 5: UI Implementation

### 5.1 Add Routes

**File**: `src/app/src/App.tsx`

```typescript
// Add to routes
<Route path="/test-cases" element={<TestCasesListPage />} />
<Route path="/test-cases/:id" element={<TestCaseDetailPage />} />
```

**File**: `src/app/src/constants/routes.ts`

```typescript
export const TEST_CASE_ROUTES = {
  LIST: '/test-cases',
  DETAIL: (id: string) => `/test-cases/${id}`,
};
```

### 5.2 Test Cases List Page

**File**: `src/app/src/pages/test-cases/TestCasesListPage.tsx`

Key features:

- FTS search bar with debounced input
- Filter facets: source type, metadata keys, status (failing/flaky/passing)
- Trace health filters: has errors, p95 duration, span count
- Results table with columns: description, vars summary, metadata chips, pass rate, trace health
- Click row → detail page

### 5.3 Test Case Detail Page

**File**: `src/app/src/pages/test-cases/TestCaseDetailPage.tsx`

Three-panel layout:

1. **Definition Panel**
   - Description
   - Vars (pretty JSON with syntax highlighting)
   - Assertions list
   - Metadata chips
   - Source info (file, row)

2. **History Panel**
   - Table of eval_results for this test case
   - Group by: eval, provider, prompt
   - Columns: pass/fail, score, latency, cost, trace badges
   - Click row → opens EvalOutputPromptDialog

3. **Traces Tab**
   - Latest N traces sortable by duration/errors
   - Mini-histograms: duration over time, error rate, span count
   - Click trace → existing TraceTimeline viewer

### 5.4 Entry Points from Existing UI

Add "View test case" links in:

1. **EvalOutputCell.tsx** - Add icon button in action bar
2. **EvalOutputPromptDialog.tsx** - Add link in header
3. **ResultsTable.tsx** - Add test case column with link
4. **TraceView.tsx** - Add "Jump to test case" link

---

## Phase 6: Structured Assertion Evidence

### 6.1 Extend Trace Assertion Return Type

**File**: `src/assertions/traceSpanDuration.ts` (and siblings)

```typescript
interface TraceAssertionEvidence {
  traceId: string;
  pattern: string;
  percentile?: number;
  computedMs?: number;
  thresholdMs?: number;
  evidenceSpans: Array<{
    spanId: string;
    name: string;
    durationMs?: number;
    statusCode?: number;
    statusMessage?: string;
  }>;
}

export async function handleTraceSpanDuration(params: AssertionParams): Promise<GradingResult> {
  // ... existing logic ...

  const evidence: TraceAssertionEvidence = {
    traceId,
    pattern,
    percentile,
    computedMs: actualDuration,
    thresholdMs: maxDuration,
    evidenceSpans: slowestSpans.map((s) => ({
      spanId: s.spanId,
      name: s.name,
      durationMs: s.duration,
    })),
  };

  return {
    pass,
    score: pass ? 1 : 0,
    reason: `${percentile}th percentile duration was ${actualDuration}ms (threshold: ${maxDuration}ms)`,
    metadata: {
      traceEvidence: evidence, // NEW: structured evidence
    },
  };
}
```

### 6.2 Assertions Overlay in Trace Viewer

**File**: `src/app/src/components/traces/AssertionsOverlay.tsx`

```tsx
interface AssertionsOverlayProps {
  assertions: GradingResult[];
  onHighlightSpans: (spanIds: string[]) => void;
}

export function AssertionsOverlay({ assertions, onHighlightSpans }: AssertionsOverlayProps) {
  const traceAssertions = assertions.filter((a) => a.assertion?.type?.startsWith('trace-'));

  return (
    <div className="assertions-overlay">
      <h4>Trace Assertions</h4>
      {traceAssertions.map((assertion, i) => (
        <AssertionCard
          key={i}
          assertion={assertion}
          onClick={() => {
            const evidence = assertion.metadata?.traceEvidence;
            if (evidence?.evidenceSpans) {
              onHighlightSpans(evidence.evidenceSpans.map((s) => s.spanId));
            }
          }}
        />
      ))}
    </div>
  );
}
```

---

## Implementation Roadmap

### Sprint 1: Data Foundation (Week 1-2)

- [ ] Add `test_cases` table schema
- [ ] Implement fingerprinting algorithm
- [ ] Update evaluator to compute test case IDs
- [ ] Add `test_case_id` to `eval_results`
- [ ] Write backfill migration script
- [ ] Add basic API endpoints

### Sprint 2: Trace Correlation Fix (Week 2-3)

- [ ] Add `eval_result_id` to traces
- [ ] Update OTEL attributes
- [ ] Fix `evaluatorTracing.ts` to use stable IDs
- [ ] Update TraceView filtering logic
- [ ] Add migration for existing data

### Sprint 3: FTS & Search (Week 3-4)

- [ ] Create FTS5 virtual table
- [ ] Implement FTS population logic
- [ ] Build search API endpoint
- [ ] Create test cases list page
- [ ] Add filter facets

### Sprint 4: UI Polish (Week 4-5)

- [ ] Build test case detail page
- [ ] Add history panel
- [ ] Implement trace stats aggregation
- [ ] Add entry points from existing UI
- [ ] Polish and test

### Sprint 5: Assertion Evidence (Week 5-6)

- [ ] Extend trace assertion return types
- [ ] Add structured evidence to grading results
- [ ] Build assertions overlay component
- [ ] Implement span highlighting
- [ ] End-to-end testing

---

## Key Design Decisions

1. **Content-based fingerprinting** (SHA256 of canonical JSON)
   - Stable across evals as long as test case content is unchanged
   - No user-supplied IDs required initially
   - Can add user-supplied `id` field later as enhancement

2. **`eval_result_id` as primary trace correlation key**
   - Eliminates format mismatch issues
   - One-to-one mapping between result cell and trace
   - Keeps `testCaseId` for cross-eval history

3. **FTS5 for search** (not vector search)
   - SQLite native, no external dependencies
   - Fast for keyword/phrase search
   - Can add embedding-based search later if needed

4. **Trace summaries in indexed columns**
   - Enables fast filtering by trace health
   - Computed on trace completion (or lazily)
   - Avoids scanning JSON on every query

5. **Structured assertion evidence**
   - Enables "click to highlight" UX
   - Stored in existing `gradingResult.metadata`
   - Backwards compatible

---

## Files to Modify

| File                                          | Changes                                         |
| --------------------------------------------- | ----------------------------------------------- |
| `src/database/tables.ts`                      | Add `testCasesTable`, update `evalResultsTable` |
| `src/evaluator.ts`                            | Compute test case ID, upsert test cases         |
| `src/tracing/evaluatorTracing.ts`             | Use stable IDs, add `evalResultId`              |
| `src/tracing/store.ts`                        | Compute trace summaries                         |
| `src/tracing/genaiTracer.ts`                  | Add new OTEL attributes                         |
| `src/server/routes/`                          | Add `testCases.ts` router                       |
| `src/app/src/App.tsx`                         | Add test case routes                            |
| `src/app/src/pages/`                          | Add test case pages                             |
| `src/app/src/components/traces/TraceView.tsx` | Fix filtering logic                             |
| `src/assertions/trace*.ts`                    | Add structured evidence                         |

---

## Open Questions

1. **User-supplied test case IDs**: Should we support explicit `id:` field in YAML/CSV now or defer?
2. **Backfill strategy**: Run on startup? Background job? CLI command?
3. **FTS population**: Triggers vs. application code?
4. **Trace summary computation**: Sync vs. async? Lazy vs. eager?
5. **History retention**: How many results per test case to keep?

---

## Success Metrics

- Test cases searchable across all evals
- Trace viewer shows traces for correct result (no more filtering issues)
- Test case detail page shows history with pass rate trends
- Trace assertions highlight relevant spans
- Search latency < 200ms for 10k test cases
