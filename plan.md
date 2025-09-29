# Real-Time Frontend Metrics Calculation Plan

## Objective

Calculate evaluation metrics dynamically on the frontend based on currently applied filters, providing users with real-time insights into how their filters affect performance metrics.

## Current State Analysis

### How Metrics Work Today

- **Server-side calculation**: Metrics are computed during evaluation and stored in `prompt.metrics`
- **Static display**: Frontend shows pre-calculated aggregated metrics
- **No filter awareness**: Metrics don't change when users apply filters
- **Limited interactivity**: Users can't see how performance varies across filtered subsets

### Available Data Structures

```typescript
// From table.body (EvaluateTableRow[])
interface EvaluateTableRow {
  outputs: Array<{
    pass: boolean; // ✅ Pass/fail per test case
    cost: number; // ✅ Cost per test case
    tokenUsage: TokenUsage; // ✅ Tokens per test case
    latencyMs?: number; // ✅ Latency per test case
    gradingResult?: {
      // ✅ Assertion results
      pass: boolean;
      componentResults: Array<{
        pass: boolean;
        reason: string;
      }>;
    };
  }>;
}

// Current aggregated metrics (prompt.metrics)
interface PromptMetrics {
  testPassCount: number;
  testFailCount: number;
  assertPassCount: number;
  assertFailCount: number;
  totalLatencyMs: number;
  cost: number;
  tokenUsage: TokenUsage;
}
```

## Feasibility Assessment

### ✅ Metrics We CAN Calculate Frontend

1. **Pass Rates**: `output.pass` per test case
2. **Test Counts**: Count of passing/failing filtered results
3. **Assert Counts**: From `gradingResult.componentResults`
4. **Average Latency**: From individual `latencyMs` values
5. **Total Cost**: Sum of individual `cost` values
6. **Token Usage**: Aggregate `tokenUsage` from filtered results

### ❓ Metrics That Need Investigation

1. **Named Scores**: Need to check if available per test case
2. **Error Counts**: Need to verify error detection logic
3. **Redteam Metrics**: Plugin/strategy specific calculations

### ❌ Limitations

1. **Historical comparisons**: Can't calculate trends without raw historical data
2. **Complex aggregations**: Some server-side business logic may be hard to replicate

## Technical Architecture

### Data Flow Design

```
Raw Results → Filter Application → Metric Calculation → Display Update
     ↓              ↓                    ↓                ↓
table.body → filteredRows → calculateMetrics() → updateUI()
```

### Hook Structure

```typescript
// New hooks to replace static ones
function useFilteredTestCounts(): number[] {
  const { table, filteredRows } = useTableStore();
  return useMemo(() => calculateTestCounts(filteredRows), [filteredRows]);
}

function useFilteredPassRates(): number[] {
  const testCounts = useFilteredTestCounts();
  const passingCounts = useFilteredPassingTestCounts();
  return useMemo(() => calculatePassRates(passingCounts, testCounts), [passingCounts, testCounts]);
}
```

### Core Calculation Engine

```typescript
interface FilteredMetrics {
  testPassCount: number;
  testFailCount: number;
  assertPassCount: number;
  assertFailCount: number;
  avgLatencyMs: number;
  totalCost: number;
  passRate: number;
}

function calculateFilteredMetrics(
  filteredRows: EvaluateTableRow[],
  promptIndex: number,
): FilteredMetrics {
  // Implementation details below
}
```

## Implementation Plan

### Phase 1: Foundation (Week 1)

1. **Audit available data**
   - Map all fields available in `EvaluateTableRow.outputs`
   - Verify what metrics can be calculated from raw data
   - Identify any missing data points

2. **Create filtered row selector**

   ```typescript
   // Add to store.ts
   const useFilteredRows = () => {
     const { table, filters, filterMode, searchText } = useTableStore();
     return useMemo(
       () => applyAllFilters(table?.body || [], filters, filterMode, searchText),
       [table?.body, filters, filterMode, searchText],
     );
   };
   ```

3. **Build metric calculation utilities**
   ```typescript
   // New file: src/pages/eval/components/calculations.ts
   export function calculateMetricsForPrompt(
     rows: EvaluateTableRow[],
     promptIndex: number,
   ): FilteredMetrics;
   ```

### Phase 2: Core Metrics (Week 2)

1. **Implement basic calculations**
   - Pass/fail counts and rates
   - Test counts
   - Average latency
   - Total cost

2. **Create filtered metric hooks**
   - Replace `usePassingTestCounts()` with `useFilteredPassingTestCounts()`
   - Replace `useTestCounts()` with `useFilteredTestCounts()`
   - Replace `usePassRates()` with `useFilteredPassRates()`

3. **Update ResultsTable display**
   - Modify the metric display to use filtered hooks
   - Add visual indicators for filtered vs. total metrics

### Phase 3: Advanced Metrics (Week 3)

1. **Assertion calculations**
   - Parse `gradingResult.componentResults`
   - Calculate assert pass/fail counts from filtered data

2. **Token usage aggregation**
   - Sum token usage across filtered results
   - Calculate average tokens per request

3. **Named scores support**
   - Investigate availability of named scores per test case
   - Implement aggregation if available

### Phase 4: UX Enhancement (Week 4)

1. **Visual differentiation**

   ```typescript
   // Show both filtered and total metrics
   <div className="metric-display">
     <strong>Pass Rate:</strong>
     <span className="filtered-metric">75%</span>
     <span className="total-metric">(was 60% total)</span>
     <span className="filtered-count">(3/4 filtered cases)</span>
   </div>
   ```

2. **Performance optimization**
   - Debounce calculations for rapid filter changes
   - Memoize expensive calculations
   - Consider virtualization for large datasets

3. **Error handling**
   - Handle edge cases (no filtered results, division by zero)
   - Graceful fallback to original metrics if calculation fails

## Risk Analysis

### Technical Risks

1. **Performance**: Recalculating on every filter change could be slow
   - _Mitigation_: Debouncing, memoization, worker threads for large datasets

2. **Accuracy**: Frontend calculations might not match server-side exactly
   - _Mitigation_: Unit tests comparing frontend vs. server calculations

3. **Memory usage**: Keeping all raw data in memory could be expensive
   - _Mitigation_: Lazy loading, data compression, pagination

### UX Risks

1. **Confusion**: Users might not understand filtered vs. total metrics
   - _Mitigation_: Clear visual design, tooltips, documentation

2. **Performance perception**: Slow recalculation could feel sluggish
   - _Mitigation_: Loading states, optimistic updates, fast fallbacks

## Success Metrics

### Technical Success

- [ ] All basic metrics calculate correctly vs. server baseline
- [ ] Performance: <100ms calculation time for 1000 test cases
- [ ] Memory: <10MB additional memory usage for typical datasets

### User Success

- [ ] Users can understand how filters affect their eval performance
- [ ] Decreased time to insight (faster analysis workflows)
- [ ] Increased filter usage (more exploratory analysis)

## Alternative Approaches

### Option A: Full Frontend Calculation (Proposed)

- **Pros**: Maximum interactivity, real-time updates
- **Cons**: Complex implementation, potential performance issues

### Option B: Server-side Filtered Metrics API

- **Pros**: Accurate calculations, less frontend complexity
- **Cons**: Network latency, server load, less interactive

### Option C: Hybrid Approach

- **Pros**: Fast basic metrics frontend, complex metrics server-side
- **Cons**: Increased complexity, potential inconsistency

## Next Steps

1. **Validate approach**: Review this plan with team
2. **Spike investigation**: 2-day spike to verify data availability and performance
3. **Create RFC**: Detailed technical specification
4. **Implementation**: Follow phased plan above

## Open Questions

1. Are latency values available per test case in the current data structure?
2. How large are typical datasets we need to handle (max rows/columns)?
3. Should we make this a feature flag initially?
4. Do we need backward compatibility with current static metrics?
5. How should we handle streaming/real-time evaluation updates?
