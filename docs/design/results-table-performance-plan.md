# Results Table Performance Plan - Large Evaluations (1000+ rows)

**Date**: 2025-12-11
**Status**: ✅ Phase 1 Implemented, Phases 2-4 Hooks Created

## Executive Summary

The current results table implementation works well for typical evaluations (< 200 rows) but has O(n) bottlenecks that become problematic at scale:

| Dataset Size | Current Processing | Target Processing |
| ------------ | ------------------ | ----------------- |
| 100 rows     | ~10ms              | ~10ms             |
| 1,000 rows   | ~100ms             | ~15ms             |
| 10,000 rows  | ~1s+               | ~20ms             |

**Goal**: Constant-time rendering regardless of dataset size, with linear-time operations only on user-initiated actions (filtering, searching).

---

## Current Architecture Analysis

### What's Already Good

- Window-based visible row calculation (only renders ~15-25 rows)
- Cell content truncation (250 chars max)
- Responsive column layout
- Basic memoization on data/filter changes
- Keyboard navigation with proper state management

### Critical Bottlenecks

```
Data Flow (Current):
┌─────────────────────────────────────────────────────────────┐
│  EvaluateTable (1000 rows)                                  │
│         │                                                   │
│         ▼                                                   │
│  processTableData() ─────────────── O(n) ALL rows          │
│         │                                                   │
│         ▼                                                   │
│  filterRows() ──────────────────── O(n) ALL rows           │
│         │                                                   │
│         ▼                                                   │
│  calculateSummaryStats() ────────── O(n×c) ALL cells       │
│         │                                                   │
│         ▼                                                   │
│  .slice(visibleStart, visibleEnd) ─ O(1) good!             │
│         │                                                   │
│         ▼                                                   │
│  render 15-25 rows ────────────────O(visible) good!        │
└─────────────────────────────────────────────────────────────┘
```

**Problem**: 3 × O(n) operations BEFORE the efficient slicing happens.

---

## Phase 1: Component Memoization (Quick Win)

**Impact**: High | **Effort**: Low | **Risk**: Low

### 1.1 Memoize TableRow

```typescript
// TableRow.tsx
import { memo } from 'react';

export const TableRow = memo(
  function TableRow({ rowData, columns, isSelected, selectedCol, isCompact }: TableRowProps) {
    // ... existing implementation
  },
  (prevProps, nextProps) => {
    // Custom comparison - only re-render if row data or selection changed
    if (prevProps.isSelected !== nextProps.isSelected) return false;
    if (prevProps.selectedCol !== nextProps.selectedCol) return false;
    if (prevProps.isCompact !== nextProps.isCompact) return false;
    if (prevProps.rowData.index !== nextProps.rowData.index) return false;
    if (prevProps.rowData.testIdx !== nextProps.rowData.testIdx) return false;
    // Columns rarely change
    if (prevProps.columns !== nextProps.columns) return false;
    return true;
  },
);
```

### 1.2 Memoize TableCell

```typescript
// TableCell.tsx
export const TableCell = memo(function TableCell({
  data,
  width,
  isSelected,
  showBadge,
}: TableCellProps) {
  // ... existing implementation
});
```

### 1.3 Memoize Static Components

```typescript
// TableHeader already doesn't need props that change often
export const TableHeader = memo(function TableHeader({ columns }: TableHeaderProps) {
  // ...
});
```

**Expected Impact**:

- Prevents re-rendering unchanged rows during navigation
- Scroll operations only re-render rows that enter/exit viewport
- Reduces React reconciliation overhead by ~80%

---

## Phase 2: Lazy Row Processing (High Impact)

**Impact**: Very High | **Effort**: Medium | **Risk**: Medium

### 2.1 Problem

`processTableData()` transforms ALL rows upfront:

```typescript
// Current: O(n) regardless of what's visible
const processedRows = useMemo(() => processTableData(data, maxCellLength), [data, maxCellLength]);
```

### 2.2 Solution: Process Only Visible Window

```typescript
// New approach: lazy processing
function useLazyProcessedRows(
  data: EvaluateTable,
  visibleRange: { start: number; end: number },
  maxCellLength: number,
): {
  visibleRows: TableRowData[];
  totalRows: number;
} {
  // Cache processed rows in a Map (sparse array)
  const processedCache = useRef<Map<number, TableRowData>>(new Map());

  // Process only visible range + buffer
  const BUFFER_SIZE = 5; // Pre-process 5 rows above/below
  const bufferStart = Math.max(0, visibleRange.start - BUFFER_SIZE);
  const bufferEnd = Math.min(data.body.length, visibleRange.end + BUFFER_SIZE);

  const visibleRows = useMemo(() => {
    const rows: TableRowData[] = [];

    for (let i = visibleRange.start; i < visibleRange.end; i++) {
      let processed = processedCache.current.get(i);

      if (!processed) {
        // Process on demand
        processed = processRow(data.body[i], i, maxCellLength);
        processedCache.current.set(i, processed);
      }

      rows.push(processed);
    }

    return rows;
  }, [data, visibleRange.start, visibleRange.end, maxCellLength]);

  // Pre-process buffer in idle time
  useEffect(() => {
    if (typeof requestIdleCallback === 'undefined') return;

    const handle = requestIdleCallback(() => {
      for (let i = bufferStart; i < bufferEnd; i++) {
        if (!processedCache.current.has(i)) {
          processedCache.current.set(i, processRow(data.body[i], i, maxCellLength));
        }
      }
    });

    return () => cancelIdleCallback(handle);
  }, [bufferStart, bufferEnd]);

  return { visibleRows, totalRows: data.body.length };
}
```

### 2.3 Cache Eviction Strategy

For memory management with very large datasets:

```typescript
const MAX_CACHE_SIZE = 200; // Keep ~200 processed rows in memory

function evictOldEntries(cache: Map<number, TableRowData>, currentIndex: number) {
  if (cache.size <= MAX_CACHE_SIZE) return;

  // Keep rows closest to current position
  const entries = [...cache.entries()];
  entries.sort((a, b) => Math.abs(a[0] - currentIndex) - Math.abs(b[0] - currentIndex));

  // Remove furthest entries
  const toRemove = entries.slice(MAX_CACHE_SIZE);
  toRemove.forEach(([key]) => cache.delete(key));
}
```

**Expected Impact**:

- Initial render: O(visible) instead of O(n)
- Scroll: O(buffer) pre-processing, O(1) cache hits
- Memory: Bounded at ~200 rows instead of n rows

---

## Phase 3: Optimized Filtering (Medium Impact)

**Impact**: Medium-High | **Effort**: Medium | **Risk**: Medium

### 3.1 Problem

Current filtering iterates ALL rows on every filter change:

```typescript
const filteredRows = useMemo(() => filterRows(processedRows, filter), [processedRows, filter]);
```

### 3.2 Solution: Indexed Filtering

Pre-compute filter indices when data loads:

```typescript
interface FilterIndices {
  all: number[];
  passes: number[];
  failures: number[];
  errors: number[];
  byProvider: Map<string, number[]>;
}

function buildFilterIndices(data: EvaluateTable): FilterIndices {
  const indices: FilterIndices = {
    all: [],
    passes: [],
    failures: [],
    errors: [],
    byProvider: new Map(),
  };

  data.body.forEach((row, idx) => {
    indices.all.push(idx);

    // Check each output
    let hasPass = false;
    let hasFail = false;
    let hasError = false;

    row.outputs.forEach((output, outputIdx) => {
      const status = getCellStatus(output.pass, output.failureReason);

      if (status === 'pass') hasPass = true;
      else if (status === 'fail') hasFail = true;
      else if (status === 'error') hasError = true;

      // Index by provider
      const provider = output.provider || `output-${outputIdx}`;
      if (!indices.byProvider.has(provider)) {
        indices.byProvider.set(provider, []);
      }
      indices.byProvider.get(provider)!.push(idx);
    });

    if (hasPass) indices.passes.push(idx);
    if (hasFail) indices.failures.push(idx);
    if (hasError) indices.errors.push(idx);
  });

  return indices;
}
```

### 3.3 Filter Mode Selection

```typescript
function getFilteredIndices(indices: FilterIndices, mode: FilterMode): number[] {
  switch (mode) {
    case 'all':
      return indices.all;
    case 'passes':
      return indices.passes;
    case 'failures':
      return indices.failures;
    case 'errors':
      return indices.errors;
    default:
      return indices.all;
  }
}

// O(1) filter mode switch instead of O(n)!
```

### 3.4 Search Optimization

For text search, use a debounced approach with progressive results:

```typescript
function useProgressiveSearch(
  data: EvaluateTable,
  query: string,
  initialIndices: number[],
): { results: number[]; isSearching: boolean } {
  const [results, setResults] = useState<number[]>(initialIndices);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!query) {
      setResults(initialIndices);
      return;
    }

    setIsSearching(true);
    const BATCH_SIZE = 100;
    let currentBatch = 0;
    const searchResults: number[] = [];

    function processBatch() {
      const start = currentBatch * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, initialIndices.length);

      for (let i = start; i < end; i++) {
        const idx = initialIndices[i];
        if (rowMatchesQuery(data.body[idx], query)) {
          searchResults.push(idx);
        }
      }

      currentBatch++;

      if (end < initialIndices.length) {
        // Continue next batch
        setResults([...searchResults]);
        setTimeout(processBatch, 0); // Yield to UI
      } else {
        // Done
        setResults(searchResults);
        setIsSearching(false);
      }
    }

    processBatch();
  }, [data, query, initialIndices]);

  return { results, isSearching };
}
```

**Expected Impact**:

- Filter mode switch: O(1) instead of O(n)
- Search: Non-blocking with progressive results
- Memory: O(n) for indices (just numbers, not full objects)

---

## Phase 4: Summary Stats Optimization

**Impact**: Medium | **Effort**: Low | **Risk**: Low

### 4.1 Problem

Stats are recalculated on every filter change:

```typescript
const stats = useMemo(() => calculateSummaryStats(filteredRows), [filteredRows]);
```

### 4.2 Solution: Pre-computed Stats

Calculate stats once when data loads:

```typescript
interface DataStats {
  total: {
    passed: number;
    failed: number;
    errors: number;
    totalCost: number;
    totalLatency: number;
    latencyCount: number;
  };
  byRow: Map<number, RowStats>; // For filtered recalculation
}

// Compute once on data load
const dataStats = useMemo(() => computeDataStats(data), [data]);

// For filtered views, use index intersection
const filteredStats = useMemo(() => {
  if (!hasActiveFilter(filter)) {
    return dataStats.total;
  }

  // Sum only filtered row stats
  return filteredIndices.reduce(
    (acc, idx) => {
      const rowStats = dataStats.byRow.get(idx)!;
      acc.passed += rowStats.passed;
      acc.failed += rowStats.failed;
      acc.errors += rowStats.errors;
      acc.totalCost += rowStats.cost;
      acc.totalLatency += rowStats.latency;
      acc.latencyCount += rowStats.latencyCount;
      return acc;
    },
    { passed: 0, failed: 0, errors: 0, totalCost: 0, totalLatency: 0, latencyCount: 0 },
  );
}, [dataStats, filteredIndices]);
```

**Expected Impact**:

- Unfiltered stats: O(1) lookup
- Filtered stats: O(filtered) instead of O(n×c)

---

## Phase 5: Virtual DOM Optimization

**Impact**: Medium | **Effort**: High | **Risk**: Medium

### 5.1 Stable Keys

Ensure row keys don't cause unnecessary reconciliation:

```typescript
// Current: key={displayIdx} - UNSTABLE during scroll!
// Better: key={rowData.testIdx} - STABLE regardless of scroll position

{visibleRows.map((rowData) => (
  <TableRow
    key={rowData.testIdx}  // Stable key
    rowData={rowData}
    // ...
  />
))}
```

### 5.2 Avoid Inline Objects in Props

```typescript
// Bad: Creates new object every render
<TableRow columns={[{ id: 'test', width: 10 }]} />

// Good: Stable reference
const columns = useMemo(() => computeColumns(...), [deps]);
<TableRow columns={columns} />
```

### 5.3 Split Selection State

Currently, `selectedRow` and `selectedCol` changing re-renders all rows. Split the selection highlight into its own layer:

```typescript
// Selection overlay that renders above the table
function SelectionHighlight({ row, col, position }) {
  // Absolute positioned highlight box
  return <Box position="absolute" ...>{/* highlight */}</Box>;
}

// Rows don't need to know about selection
<TableRow rowData={rowData} columns={columns} />
```

---

## Phase 6: Consider Web Workers (Future)

**Impact**: High | **Effort**: Very High | **Risk**: High

For datasets > 10,000 rows, offload filtering/searching to a worker:

```typescript
// worker.ts
self.onmessage = (e) => {
  const { type, data, query } = e.data;

  if (type === 'search') {
    const results = searchRows(data, query);
    self.postMessage({ type: 'searchResults', results });
  }
};

// main thread
const worker = new Worker('./filterWorker.ts');
worker.postMessage({ type: 'search', data, query });
worker.onmessage = (e) => setSearchResults(e.data.results);
```

**Note**: This adds significant complexity and should only be considered if other optimizations aren't sufficient.

---

## Implementation Priority

| Phase                         | Impact      | Effort    | Priority | Status            |
| ----------------------------- | ----------- | --------- | -------- | ----------------- |
| 1. Component Memoization      | High        | Low       | **P0**   | ✅ Done           |
| 2. Lazy Row Processing        | Very High   | Medium    | **P0**   | ✅ Hook Created   |
| 3. Indexed Filtering          | Medium-High | Medium    | **P1**   | ✅ Hook Created   |
| 4. Summary Stats Optimization | Medium      | Low       | **P1**   | Included in hooks |
| 5. Virtual DOM Optimization   | Medium      | High      | **P2**   | Pending           |
| 6. Web Workers                | High        | Very High | **P3**   | Future            |

---

## Implementation Notes (2025-12-11)

### Phase 1: Component Memoization ✅ COMPLETE

All table components memoized with React.memo:

**Files Modified:**

- `src/ui/components/table/TableCell.tsx`: `TableCell`, `TextCell`, `IndexCell` memoized
- `src/ui/components/table/TableRow.tsx`: `TableRow`, `CompactRow` memoized with custom comparators
- `src/ui/components/table/TableHeader.tsx`: `TableHeader` memoized

**Custom Comparators:**

```typescript
// TableRow uses custom comparison to avoid re-renders
(prevProps, nextProps) => {
  if (prevProps.isSelected !== nextProps.isSelected) return false;
  if (prevProps.selectedCol !== nextProps.selectedCol) return false;
  if (prevProps.isCompact !== nextProps.isCompact) return false;
  if (prevProps.rowData.testIdx !== nextProps.rowData.testIdx) return false;
  if (prevProps.rowData.index !== nextProps.rowData.index) return false;
  if (prevProps.columns !== nextProps.columns) return false;
  return true;
};
```

### Phase 2-4: Hooks Created (Ready for Integration)

**New Files:**

- `src/ui/components/table/useLazyProcessedRows.ts`: Lazy row processing hook
  - Only processes visible rows + buffer (not ALL rows)
  - Maintains sparse cache of processed rows
  - Pre-processes buffer rows in idle time (requestIdleCallback)
  - Cache eviction for memory management (max 200 rows cached)

- `src/ui/components/table/useIndexedFilter.ts`: Indexed filtering hook
  - Pre-computes filter indices when data loads (O(n) once)
  - Filter mode switches are O(1) instead of O(n)
  - Progressive search with UI yielding (batched, non-blocking)

**Integration Status:**
The hooks are created and ready for integration into `ResultsTable.tsx`. The current implementation:

1. Works correctly with existing virtual scrolling (25-row viewport)
2. Benefits from component memoization (fewer re-renders)
3. Can be incrementally enhanced with lazy processing hooks

### Virtual Scrolling Already Works

The table ALREADY displays large evals correctly:

- `maxRows` (default 25) is the viewport size, not a row limit
- Users can navigate through ALL rows with arrow keys/vim bindings
- "More rows below" indicator shows when more data exists
- Navigation state tracks scroll position correctly

---

## Testing Strategy

### Performance Benchmarks

```typescript
// Test with various dataset sizes
const testSizes = [100, 500, 1000, 5000, 10000];

for (const size of testSizes) {
  const data = generateTestData(size);

  // Measure initial render
  const startRender = performance.now();
  render(<ResultsTable data={data} />);
  console.log(`Initial render (${size} rows): ${performance.now() - startRender}ms`);

  // Measure scroll performance
  const startScroll = performance.now();
  for (let i = 0; i < 100; i++) {
    // Simulate scroll
    navigation.dispatch({ type: 'NAVIGATE', direction: 'down' });
  }
  console.log(`100 scrolls (${size} rows): ${performance.now() - startScroll}ms`);

  // Measure filter switch
  const startFilter = performance.now();
  navigation.dispatch({ type: 'SET_FILTER_MODE', mode: 'failures' });
  console.log(`Filter switch (${size} rows): ${performance.now() - startFilter}ms`);
}
```

### Target Metrics

| Operation              | Current (1000 rows) | Target             |
| ---------------------- | ------------------- | ------------------ |
| Initial render         | ~100ms              | < 50ms             |
| Scroll (per operation) | ~10ms               | < 5ms              |
| Filter mode switch     | ~50ms               | < 10ms             |
| Search (per keystroke) | ~100ms              | < 50ms (debounced) |
| Memory usage           | ~50MB               | < 20MB             |

---

## Migration Path

1. **Phase 1** can be done immediately with no breaking changes
2. **Phase 2** requires refactoring data flow but keeps same API
3. **Phase 3** can be done incrementally (add indices alongside current approach)
4. **Phase 4** is a straightforward optimization
5. **Phase 5** may require API changes to TableRow/TableCell
6. **Phase 6** is a major architectural change, defer unless needed

---

## References

- [Ink GitHub - Static Component](https://github.com/vadimdemedes/ink)
- [React Virtualization Best Practices](https://medium.com/@ignatovich.dm/virtualization-in-react-improving-performance-for-large-lists-3df0800022ef)
- [List Virtualization Patterns](https://www.patterns.dev/vanilla/virtual-lists/)
