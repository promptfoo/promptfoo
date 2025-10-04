# State Management Refactor - Current Status

## ✅ Completed (Infrastructure)

### 1. React Query Hooks Created

- ✅ `src/app/src/pages/eval/hooks/useEvalTable.ts` - Fetches eval table data with automatic caching
- ✅ `src/app/src/pages/eval/hooks/useMetadataKeys.ts` - Fetches metadata keys with timeout handling
- ✅ Both hooks handle:
  - Request deduplication
  - Automatic caching (30s and 60s staleTime)
  - Loading/error states
  - TypeScript types

### 2. Client-Only UI Store Created

- ✅ `src/app/src/pages/eval/store/uiStore.ts` - Zustand store for client state only
- Contains:
  - Filter management (addFilter, removeFilter, updateFilter, etc.)
  - Filter mode
  - UI flags (isStreaming, shouldHighlightSearchText)
  - Current evalId

### 3. Example Component Migrated

- ✅ `Eval.tsx` - Fully migrated to use new architecture
  - Uses `useEvalTable` hook for server data
  - Uses `useEvalUIStore` for client state
  - Socket updates via `queryClient.invalidateQueries`
  - 0 TypeScript errors

## 🔄 In Progress

### Components Still Using Old Store (26 files)

The old `useTableStore` in `store.ts` is still being used by:

1. ResultsView.tsx - Main results display
2. ResultsTable.tsx - Table component
3. ResultsFilters/FiltersForm.tsx - Filter UI
4. EvalOutputCell.tsx - Cell rendering
5. EvalOutputPromptDialog.tsx - Prompt dialog
6. ConfigModal.tsx - Config modal
7. CustomMetrics.tsx - Custom metrics
8. CustomMetricsDialog.tsx - Metrics dialog
9. DownloadMenu.tsx - Download functionality
10. MetricFilterSelector.tsx - Metric filters
11. CompareEvalMenuItem.tsx - Comparison menu
12. ResultsCharts.tsx - Charts display
13. MetadataPanel.tsx - Metadata panel
14. - 13 more test files

## 📋 Migration Strategy

### Option A: Full Migration (Recommended for Long-Term)

**Pros:**

- Clean separation of concerns
- Best practices architecture
- Easier to maintain

**Cons:**

- Large refactor (10-12 hours estimated)
- Touches 27 files
- Risk of introducing bugs

**Steps:**

1. Update ResultsView.tsx to use new hooks
2. Create helper hook `useEvalData()` that combines table + metadata
3. Update ResultsTable.tsx
4. Update remaining 24 components systematically
5. Update all 13 test files
6. Delete old server state from `store.ts`

### Option B: Hybrid Approach (Pragmatic for Now)

**Pros:**

- Incremental migration
- Lower risk
- Can ship improvements sooner

**Cons:**

- Temporary complexity
- Two patterns coexisting

**Steps:**

1. Keep old `useTableStore` but deprecate server state parts
2. Create bridge hook that provides old API using new React Query hooks:

```typescript
// Bridge hook for backwards compatibility
export function useTableStoreCompat() {
  const uiStore = useEvalUIStore();
  const { data: evalData, isLoading } = useEvalTable(ui Store.evalId, {...});

  return {
    // Map old API to new hooks
    table: evalData?.table ?? null,
    config: evalData?.config ?? null,
    isFetching: isLoading,
    ...uiStore,
    // Provide old methods
    fetchEvalData: () => { /* use refetch */ },
  };
}
```

3. Update components one-by-one to use new hooks directly
4. Remove bridge when all migrated

### Option C: Targeted Migration (Fastest)

**Pros:**

- Minimal changes
- Ships quickly

**Cons:**

- Doesn't fully solve the architecture issues

**Steps:**

1. Only migrate the data fetching (fetchEvalData, fetchMetadataKeys)
2. Keep the rest of the store as-is
3. Document limitations

## 🎯 Recommendation

Given the scope and impact, I recommend **Option B (Hybrid Approach)**:

1. **Phase 1** (Now - 2 hours):
   - Create compatibility bridge hook
   - Update 2-3 key components (ResultsView, ResultsTable)
   - Verify tests pass
   - Ship this as an improvement

2. **Phase 2** (Next sprint - 8 hours):
   - Systematically migrate remaining components
   - Update all tests
   - Remove bridge and old store
   - Full cleanup

This allows us to:

- ✅ Get the benefits of React Query (caching, deduplication) immediately
- ✅ Reduce risk by incremental migration
- ✅ Ship improvements sooner
- ✅ Have a clear path to full migration

## 📊 Current State

```
Infrastructure:     ████████████████████ 100% (hooks + stores created)
Example Migration:  ████████████████████ 100% (Eval.tsx done)
Full Migration:     ██░░░░░░░░░░░░░░░░░░  10% (1 of 27 files)
Tests Updated:      ░░░░░░░░░░░░░░░░░░░░   0% (0 of 13 files)
```

## Next Steps

**Immediate (if continuing now):**

1. Create bridge hook for compatibility
2. Update ResultsView.tsx
3. Run tests
4. Document remaining work

**OR**

**If stopping here:**

1. Revert Eval.tsx changes temporarily
2. Keep infrastructure (hooks, uiStore) for future
3. Plan full migration for dedicated time block
4. Update plan document with learnings

---

**Decision Point:** How should we proceed?
