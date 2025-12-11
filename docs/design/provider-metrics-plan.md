# Provider Metrics Plan: Real-time Pass/Fail/Error by Provider

## Executive Summary

This plan extends the Ink CLI UI to surface detailed, real-time metrics **per provider/service**, including:
- Pass/fail/error rates (test cases)
- Request counts (distinct from test cases)
- Token usage (from `TokenUsageTracker`)
- Cost tracking
- Latency statistics

## Current State Analysis

### Existing Infrastructure

**TokenUsageTracker** (`src/util/tokenUsage.ts`):
```typescript
class TokenUsageTracker {
  private providersMap: Map<string, TokenUsage>;

  trackUsage(providerId: string, usage: TokenUsage): void;
  getProviderUsage(providerId: string): TokenUsage | undefined;
  getTotalUsage(): TokenUsage;
  getProviderIds(): string[];
}
```

**TokenUsage** (`src/types/shared.ts`):
```typescript
interface TokenUsage {
  prompt?: number;
  completion?: number;
  cached?: number;
  total?: number;
  numRequests?: number;  // <-- KEY: Request count
  completionDetails?: CompletionTokenDetails;
  assertions?: { ... };  // Assertion-specific tokens
}
```

**Progress Callback** (in `src/evaluator.ts`):
```typescript
progressCallback(
  completed: number,      // Tests completed
  total: number,          // Total tests
  index: number,          // Current test index
  evalStep: RunEvalOptions,  // Contains provider info
  metrics: PromptMetrics     // Aggregate metrics
)
```

**PromptMetrics** (`src/types/index.ts`):
```typescript
interface PromptMetrics {
  score: number;
  testPassCount: number;
  testFailCount: number;
  testErrorCount: number;
  assertPassCount: number;
  assertFailCount: number;
  totalLatencyMs: number;
  tokenUsage: TokenUsage;
  cost: number;
  // ... namedScores, redteam
}
```

**EvaluateResult** (`src/types/index.ts`):
```typescript
interface EvaluateResult {
  provider: Pick<ProviderOptions, 'id' | 'label'>;
  success: boolean;
  error?: string | null;
  failureReason: ResultFailureReason;  // NONE, ASSERT, ERROR
  latencyMs: number;
  cost?: number;
  tokenUsage?: Required<TokenUsage>;
  // ... other fields
}
```

### Key Distinction: Test Cases vs Requests

| Concept | Description | Source |
|---------|-------------|--------|
| **Test Case** | One prompt + vars combination | `runEvalOptions.length` |
| **Request** | API call to provider | `TokenUsage.numRequests` |
| **Cached** | Requests served from cache | `TokenUsage.cached` (tokens) |

A single test case can generate multiple requests (retries, conversations, tool calls).

## Data Model

### Enhanced ProviderStatus

```typescript
interface ProviderMetrics {
  providerId: string;
  label: string;

  // Test case metrics
  testCases: {
    total: number;       // Assigned test cases for this provider
    completed: number;   // Completed test cases
    passed: number;      // Tests that passed all assertions
    failed: number;      // Tests that failed assertions
    errors: number;      // Tests with errors (timeout, API error)
  };

  // Request metrics (from TokenUsageTracker)
  requests: {
    total: number;       // Total API requests made
    cached: number;      // Requests with cached responses
    cacheHitRate: number; // cached / total as percentage
  };

  // Token metrics (from TokenUsageTracker)
  tokens: {
    prompt: number;
    completion: number;
    cached: number;
    total: number;
    assertions: number;  // Tokens used by model-graded assertions
  };

  // Cost metrics
  cost: {
    current: number;     // Cost so far
    estimated: number;   // Projected final cost
  };

  // Latency metrics
  latency: {
    totalMs: number;     // Sum of all latencies
    count: number;       // Number of measurements
    avgMs: number;       // totalMs / count
    minMs: number;
    maxMs: number;
    samples: number[];   // Last 100 samples for percentiles
  };

  // Status
  status: 'pending' | 'running' | 'completed' | 'error';
  currentTest?: string;
  lastError?: string;
}
```

### Aggregate Metrics

```typescript
interface EvalMetricsSummary {
  // Totals across all providers
  totalTestCases: number;
  completedTestCases: number;
  passedTestCases: number;
  failedTestCases: number;
  errorTestCases: number;

  // Request totals
  totalRequests: number;
  cachedRequests: number;
  cacheHitRate: number;

  // Token totals
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  assertionTokens: number;

  // Cost totals
  totalCost: number;
  estimatedFinalCost: number;

  // Latency aggregate
  avgLatencyMs: number;

  // Timing
  elapsedMs: number;
  estimatedRemainingMs: number;
}
```

## Architecture

### Option A: Extend EvalContext (Recommended)

**Pros:**
- Minimal new code
- Reuses existing React state management
- Single source of truth in UI

**Cons:**
- Tightly couples metrics to UI
- Polling required for `TokenUsageTracker` data

```
┌─────────────────────────────────────────────────────────────┐
│                         Evaluator                            │
├──────────────────────────────────────────────────────────────┤
│  ┌────────────────┐        ┌─────────────────────┐          │
│  │  Provider Call │───────>│ TokenUsageTracker   │          │
│  └────────────────┘        │ (singleton)         │          │
│          │                 └─────────────────────┘          │
│          v                          │                        │
│  ┌────────────────┐                 │                        │
│  │  Run Assertions│                 │                        │
│  └────────────────┘                 │                        │
│          │                          │                        │
│          v                          v                        │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Progress Callback                        │    │
│  │  (completed, total, index, evalStep, metrics)        │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
                               │
                               v
┌─────────────────────────────────────────────────────────────┐
│                        Ink UI Layer                          │
├──────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐    ┌─────────────────────────────┐ │
│  │   EvalContext       │<───│  Progress Callback Handler   │ │
│  │   (enhanced state)  │    │  - Extract provider from     │ │
│  │                     │    │    evalStep.provider         │ │
│  │ - providers: Map    │    │  - Determine pass/fail/error │ │
│  │ - aggregate metrics │    │    from result               │ │
│  │ - poll token tracker│    │  - Update provider metrics   │ │
│  └─────────────────────┘    └─────────────────────────────┘ │
│            │                                                 │
│            v                                                 │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                  UI Components                           ││
│  │  - ProviderDashboard                                     ││
│  │  - MetricsSummary                                        ││
│  │  - ProgressBar (per provider)                            ││
│  └─────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Evaluator calls provider** → `TokenUsageTracker.trackUsage(providerId, tokenUsage)`
2. **Evaluator runs assertions** → Updates `PromptMetrics`
3. **Evaluator fires progress callback** with `(completed, total, index, evalStep, metrics)`
4. **Progress callback handler** in UI:
   - Extracts `providerId` from `evalStep.provider.id()`
   - Determines result status from most recent result
   - Updates `ProviderMetrics` for that provider
   - Polls `TokenUsageTracker.getInstance().getProviderUsage(providerId)` for token data
5. **EvalContext state updates** → React re-renders UI components

## Implementation Plan

### Phase 1: Enhanced Data Collection (2-3 hours)

#### 1.1 Update ProviderStatus Interface

**File:** `src/ui/contexts/EvalContext.tsx`

```typescript
// Rename ProviderStatus to ProviderMetrics and extend
export interface ProviderMetrics {
  id: string;
  label: string;

  // Test case metrics
  testCases: {
    total: number;
    completed: number;
    passed: number;
    failed: number;
    errors: number;
  };

  // Request metrics
  requests: {
    total: number;
    cached: number;
  };

  // Token metrics
  tokens: {
    prompt: number;
    completion: number;
    cached: number;
    total: number;
  };

  // Cost
  cost: number;

  // Latency
  latency: {
    totalMs: number;
    count: number;
    minMs: number;
    maxMs: number;
  };

  // Status
  status: 'pending' | 'running' | 'completed' | 'error';
  currentTest?: string;
  lastError?: string;
}
```

#### 1.2 Update EvalState Interface

```typescript
export interface EvalState {
  phase: 'initializing' | 'loading' | 'evaluating' | 'grading' | 'completed' | 'error';

  // Aggregate test metrics
  totalTests: number;
  completedTests: number;
  passedTests: number;
  failedTests: number;
  errorCount: number;

  // Aggregate request metrics (distinct from tests)
  totalRequests: number;
  cachedRequests: number;

  // Aggregate token metrics
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;

  // Aggregate cost
  totalCost: number;
  estimatedCost: number;

  // Provider-specific metrics
  providers: Record<string, ProviderMetrics>;
  providerOrder: string[];

  // Timing
  startTime?: number;
  endTime?: number;
  elapsedMs: number;
  estimatedRemainingMs: number;

  // ... rest unchanged
}
```

#### 1.3 Add New Action Types

```typescript
export type EvalAction =
  // ... existing actions
  | {
      type: 'TEST_RESULT';
      payload: {
        providerId: string;
        passed: boolean;
        failed: boolean;
        error: boolean;
        latencyMs: number;
        cost: number;
        tokenUsage?: TokenUsage;
      };
    }
  | {
      type: 'UPDATE_TOKEN_METRICS';
      payload: {
        providerId: string;
        tokenUsage: TokenUsage;
      };
    }
  | {
      type: 'UPDATE_ESTIMATES';
      payload: {
        estimatedRemainingMs: number;
        estimatedCost: number;
      };
    };
```

#### 1.4 Update evalBridge.ts

**File:** `src/ui/evalBridge.ts`

```typescript
import { TokenUsageTracker } from '../util/tokenUsage';

export function createProgressCallback(
  dispatch: React.Dispatch<EvalAction>,
  options?: { lastResult?: EvaluateResult }
) {
  return (
    completed: number,
    total: number,
    index: number,
    evalStep: RunEvalOptions | undefined,
    metrics: PromptMetrics | undefined
  ) => {
    // Extract provider info
    const providerId = evalStep?.provider?.id?.() || 'unknown';
    const providerLabel = evalStep?.provider?.label || providerId;

    // Get token usage from TokenUsageTracker for this provider
    const tokenUsage = TokenUsageTracker.getInstance().getProviderUsage(providerId);

    // Update provider token metrics
    if (tokenUsage) {
      dispatch({
        type: 'UPDATE_TOKEN_METRICS',
        payload: { providerId, tokenUsage }
      });
    }

    // Dispatch progress update
    dispatch({
      type: 'PROGRESS',
      payload: {
        completed,
        total,
        provider: providerId,
        providerLabel,
        // ... other fields
      }
    });
  };
}
```

### Phase 2: Token Tracker Integration (1-2 hours)

#### 2.1 Create useTokenMetrics Hook

**File:** `src/ui/hooks/useTokenMetrics.ts`

```typescript
import { useEffect, useCallback } from 'react';
import { TokenUsageTracker } from '../../util/tokenUsage';
import type { EvalAction } from '../contexts/EvalContext';

export function useTokenMetrics(
  dispatch: React.Dispatch<EvalAction>,
  providerIds: string[],
  isRunning: boolean,
  pollIntervalMs: number = 500
) {
  const pollTokenUsage = useCallback(() => {
    const tracker = TokenUsageTracker.getInstance();

    for (const providerId of providerIds) {
      const usage = tracker.getProviderUsage(providerId);
      if (usage) {
        dispatch({
          type: 'UPDATE_TOKEN_METRICS',
          payload: { providerId, tokenUsage: usage }
        });
      }
    }
  }, [dispatch, providerIds]);

  useEffect(() => {
    if (!isRunning) return;

    // Poll for token updates
    const intervalId = setInterval(pollTokenUsage, pollIntervalMs);

    // Also poll immediately
    pollTokenUsage();

    return () => clearInterval(intervalId);
  }, [isRunning, pollTokenUsage, pollIntervalMs]);
}
```

#### 2.2 Integrate into EvalScreen

**File:** `src/ui/components/eval/EvalScreen.tsx`

```typescript
import { useTokenMetrics } from '../../hooks/useTokenMetrics';

export function EvalScreen() {
  const { state, dispatch } = useEval();

  // Poll TokenUsageTracker for real-time token updates
  useTokenMetrics(
    dispatch,
    state.providerOrder,
    state.phase === 'evaluating',
    500 // Poll every 500ms
  );

  // ... rest of component
}
```

### Phase 3: UI Components (2-3 hours)

#### 3.1 ProviderDashboard Component

**File:** `src/ui/components/eval/ProviderDashboard.tsx`

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import { useEvalState } from '../../contexts/EvalContext';
import { ProgressBar } from '../shared/ProgressBar';
import { formatTokens, formatCost, formatLatency } from '../../utils/format';

export function ProviderDashboard() {
  const { providers, providerOrder } = useEvalState();

  return (
    <Box flexDirection="column" borderStyle="single" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold>Providers</Text>
      </Box>

      {/* Header row */}
      <Box>
        <Box width={20}><Text dimColor>Provider</Text></Box>
        <Box width={14}><Text dimColor>Progress</Text></Box>
        <Box width={12}><Text dimColor>Pass/Fail</Text></Box>
        <Box width={10}><Text dimColor>Requests</Text></Box>
        <Box width={10}><Text dimColor>Tokens</Text></Box>
        <Box width={8}><Text dimColor>Cost</Text></Box>
        <Box width={8}><Text dimColor>Avg Lat</Text></Box>
      </Box>

      {/* Provider rows */}
      {providerOrder.map(id => {
        const p = providers[id];
        const { testCases, requests, tokens, cost, latency } = p;
        const passRate = testCases.completed > 0
          ? Math.round((testCases.passed / testCases.completed) * 100)
          : 0;
        const avgLatency = latency.count > 0
          ? latency.totalMs / latency.count
          : 0;

        return (
          <Box key={id}>
            {/* Provider name (truncated) */}
            <Box width={20}>
              <Text>{truncate(p.label, 18)}</Text>
            </Box>

            {/* Progress bar */}
            <Box width={14}>
              <ProgressBar
                percent={Math.round((testCases.completed / testCases.total) * 100)}
                width={10}
              />
            </Box>

            {/* Pass/Fail */}
            <Box width={12}>
              <Text color="green">{testCases.passed}</Text>
              <Text>/</Text>
              <Text color="red">{testCases.failed}</Text>
              {testCases.errors > 0 && (
                <>
                  <Text>/</Text>
                  <Text color="yellow">{testCases.errors}</Text>
                </>
              )}
            </Box>

            {/* Requests */}
            <Box width={10}>
              <Text>{requests.total}</Text>
              {requests.cached > 0 && (
                <Text dimColor> ({requests.cached})</Text>
              )}
            </Box>

            {/* Tokens */}
            <Box width={10}>
              <Text>{formatTokens(tokens.total)}</Text>
            </Box>

            {/* Cost */}
            <Box width={8}>
              <Text>{formatCost(cost)}</Text>
            </Box>

            {/* Avg Latency */}
            <Box width={8}>
              <Text>{formatLatency(avgLatency)}</Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
```

#### 3.2 MetricsSummary Component

**File:** `src/ui/components/eval/MetricsSummary.tsx`

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import { useEvalState } from '../../contexts/EvalContext';

export function MetricsSummary() {
  const state = useEvalState();
  const {
    completedTests,
    totalTests,
    passedTests,
    failedTests,
    errorCount,
    totalRequests,
    cachedRequests,
    totalTokens,
    totalCost,
    elapsedMs,
    estimatedRemainingMs
  } = state;

  const passRate = completedTests > 0
    ? Math.round((passedTests / completedTests) * 100)
    : 0;
  const cacheRate = totalRequests > 0
    ? Math.round((cachedRequests / totalRequests) * 100)
    : 0;

  return (
    <Box flexDirection="column" paddingY={1}>
      {/* Test summary */}
      <Box gap={2}>
        <Text>Tests: {completedTests}/{totalTests} ({Math.round(completedTests/totalTests*100)}%)</Text>
        <Text color="green">Pass: {passedTests} ({passRate}%)</Text>
        <Text color="red">Fail: {failedTests}</Text>
        {errorCount > 0 && <Text color="yellow">Error: {errorCount}</Text>}
      </Box>

      {/* Request/Token summary */}
      <Box gap={2}>
        <Text>Requests: {totalRequests}</Text>
        {cachedRequests > 0 && <Text dimColor>({cachedRequests} cached, {cacheRate}%)</Text>}
        <Text>Tokens: {formatTokens(totalTokens)}</Text>
        <Text>Cost: {formatCost(totalCost)}</Text>
      </Box>

      {/* Timing */}
      <Box gap={2}>
        <Text>Elapsed: {formatDuration(elapsedMs)}</Text>
        {estimatedRemainingMs > 0 && (
          <Text dimColor>~{formatDuration(estimatedRemainingMs)} remaining</Text>
        )}
      </Box>
    </Box>
  );
}
```

### Phase 4: Result Tracking Enhancement (1-2 hours)

#### 4.1 Track Individual Test Results

The challenge is that the progress callback gives us aggregate `PromptMetrics`, but we need per-test results to attribute pass/fail to specific providers.

**Solution:** Enhance the callback to track the delta between calls.

```typescript
// In evalBridge.ts
let lastMetrics: PromptMetrics | null = null;

export function createProgressCallback(dispatch: React.Dispatch<EvalAction>) {
  return (
    completed: number,
    total: number,
    index: number,
    evalStep: RunEvalOptions | undefined,
    metrics: PromptMetrics | undefined
  ) => {
    if (!evalStep || !metrics) return;

    const providerId = evalStep.provider?.id?.() || 'unknown';

    // Calculate deltas from last callback
    if (lastMetrics) {
      const deltaPass = metrics.testPassCount - lastMetrics.testPassCount;
      const deltaFail = metrics.testFailCount - lastMetrics.testFailCount;
      const deltaError = metrics.testErrorCount - lastMetrics.testErrorCount;
      const deltaCost = metrics.cost - lastMetrics.cost;
      const deltaLatency = metrics.totalLatencyMs - lastMetrics.totalLatencyMs;

      // This test's result
      const passed = deltaPass > 0;
      const failed = deltaFail > 0;
      const error = deltaError > 0;

      dispatch({
        type: 'TEST_RESULT',
        payload: {
          providerId,
          passed,
          failed,
          error,
          latencyMs: deltaLatency,
          cost: deltaCost,
        }
      });
    }

    lastMetrics = { ...metrics };

    // ... rest of progress update
  };
}
```

### Phase 5: UI Display Mockup

```
promptfoo eval ─────────────────────────────────────────────────────────────────
  Progress   [████████████████░░░░░░░░░░░░░░░░░░░░░░░░]  42%  84/200
             ⠋ openai:gpt-4 → "How do I reset my password?"
────────────────────────────────────────────────────────────────────────────────

┌─ Providers ────────────────────────────────────────────────────────────────────┐
│                                                                                │
│  Provider           Progress      Pass/Fail    Requests    Tokens     Cost    │
│  ─────────────────────────────────────────────────────────────────────────────│
│  openai:gpt-4       [████████░░]   45/5/2      156 reqs    12.4k    $0.35    │
│                     52/100 tests   87% pass    23 cached   avg 1.2s          │
│                                                                                │
│  anthropic:claude   [██████████]   48/2/0      142 reqs    8.2k     $0.22    │
│                     50/50 tests    96% pass    31 cached   avg 0.8s   ✓      │
│                                                                                │
│  openai:gpt-3.5     [████░░░░░░]   22/3/1      78 reqs     4.1k     $0.08    │
│                     32/50 tests    85% pass    12 cached   avg 0.5s          │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘

┌─ Summary ──────────────────────────────────────────────────────────────────────┐
│  Tests: 134/200 (67%)  │  Pass: 115 (86%)  │  Fail: 10 (7%)  │  Error: 3 (2%) │
│  Requests: 376 total   │  66 cached (18%)  │  Tokens: 24.7k  │  Cost: $0.65   │
│  Elapsed: 2m 34s       │  ~1m 48s remaining                                   │
└────────────────────────────────────────────────────────────────────────────────┘

  Press [v]erbose · [e]rrors · [p]ause · [q]uit
```

## Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `src/ui/hooks/useTokenMetrics.ts` | Hook to poll TokenUsageTracker |
| `src/ui/components/eval/ProviderDashboard.tsx` | Provider metrics table |
| `src/ui/components/eval/MetricsSummary.tsx` | Aggregate metrics summary |
| `src/ui/utils/format.ts` | Formatting utilities for tokens, cost, duration |

### Modified Files

| File | Changes |
|------|---------|
| `src/ui/contexts/EvalContext.tsx` | Extended ProviderMetrics, new actions |
| `src/ui/evalBridge.ts` | Delta tracking, TokenUsageTracker integration |
| `src/ui/components/eval/EvalScreen.tsx` | Add ProviderDashboard, MetricsSummary |

## Testing Strategy

### Unit Tests

1. **EvalContext reducer tests:**
   - `TEST_RESULT` action correctly updates provider metrics
   - `UPDATE_TOKEN_METRICS` action integrates token data
   - Aggregate metrics calculated correctly

2. **useTokenMetrics hook tests:**
   - Polls at correct interval
   - Stops polling when not running
   - Updates dispatch with correct data

3. **Format utility tests:**
   - `formatTokens(12450)` → "12.4k"
   - `formatCost(0.345)` → "$0.35"
   - `formatDuration(125000)` → "2m 5s"

### Integration Tests

1. **Full eval with metrics:**
   - Run eval with multiple providers
   - Verify per-provider metrics are correct
   - Verify aggregate metrics sum correctly
   - Verify token usage matches TokenUsageTracker

2. **Real-time updates:**
   - Verify UI updates as tests complete
   - Verify token metrics refresh during eval

## Implementation Order

1. **Phase 1:** Update data model (EvalContext types)
2. **Phase 2:** Implement delta tracking in evalBridge
3. **Phase 3:** Create useTokenMetrics hook
4. **Phase 4:** Build ProviderDashboard component
5. **Phase 5:** Build MetricsSummary component
6. **Phase 6:** Integrate into EvalScreen
7. **Phase 7:** Add formatting utilities
8. **Phase 8:** Write tests
9. **Phase 9:** Polish and edge cases

## Open Questions

1. **Polling frequency:** 500ms seems reasonable. Too fast = CPU overhead. Too slow = stale data.

2. **Memory for latency samples:** Keep last N samples for percentile calculations? Or just min/max/avg?

3. **Provider ID normalization:** The evaluator uses `provider.id()` which may include constructor name in parens. Should we normalize for display?

4. **Cost estimation:** How to estimate final cost mid-eval? Use (currentCost / completedTests) * totalTests?

## Success Criteria

- [ ] Per-provider pass/fail/error counts update in real-time
- [ ] Request counts (from TokenUsageTracker.numRequests) shown per provider
- [ ] Token counts update every ~500ms during eval
- [ ] Cost tracking accurate to within 5% of actual
- [ ] Latency stats (avg, min, max) calculated correctly
- [ ] Aggregate metrics sum correctly across providers
- [ ] No performance degradation (polling overhead < 5% CPU)
- [ ] Works correctly with concurrent provider execution
