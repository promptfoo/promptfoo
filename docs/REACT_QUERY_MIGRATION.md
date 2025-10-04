# React Query Migration - Complete Guide

This document summarizes the React Query migration that replaced Zustand for server state management in the eval and model-audit pages.

## Migration Summary

**Completed:** January 2025
**Scope:** Eval page + Model-audit page
**Result:** 100% test pass rate, 0 TypeScript errors, production-ready

### Key Metrics

- **Before:** 834-line monolithic store.ts
- **After:** 115-line store.ts (86% reduction)
- **Test Coverage:** 20 integration tests added
- **Performance:** Eliminated infinite refetch bugs
- **Architecture:** Clean separation of concerns

## Architecture

### Before (Zustand Only)
```
components/store.ts (834 lines)
├── useTableStore (server + client state mixed)
├── fetchEvalData (manual API calls)
├── Utility functions (mixed with state)
└── Type definitions (mixed with logic)
```

### After (React Query + Zustand)
```
hooks/
├── useEvalTable.ts (React Query - server state)
├── useMetadataKeys.ts (React Query - server state)
├── useTableStoreCompat.ts (compatibility bridge)
├── queryKeys.ts (query key factory)
└── index.ts (central exports)

store/
└── uiStore.ts (Zustand - client state only)

utils/
└── tableUtils.ts (pure utility functions)

types.ts (type definitions)

components/
└── store.ts (115 lines - settings only)
```

## Key Patterns

### 1. Query Key Factory
Centralized, serializable query keys prevent cache pollution:

```typescript
export const evalKeys = {
  all: ['eval'] as const,
  byId: (evalId: string | null) => [...evalKeys.all, evalId] as const,
  table: (evalId: string | null, options: Required<UseEvalTableOptions>) =>
    [
      ...evalKeys.byId(evalId),
      'table',
      {
        pageIndex: options.pageIndex,
        pageSize: options.pageSize,
        filterMode: options.filterMode,
        searchText: options.searchText,
        filters: serializeFilters(options.filters), // ← Serialized!
        comparisonEvalIds: [...options.comparisonEvalIds].sort(),
      },
    ] as const,
};
```

### 2. Filter Memoization
Critical fix to prevent infinite refetches:

```typescript
const filters = React.useMemo(
  () =>
    Object.values(uiStore.filters.values).filter((filter) =>
      filter.type === 'metadata'
        ? Boolean(filter.value && filter.field)
        : Boolean(filter.value),
    ),
  [uiStore.filters.values], // ← Stable dependency
);
```

### 3. Optimistic Updates
Immediate UI updates with automatic rollback:

```typescript
const mutation = useMutation({
  mutationFn: async ({ id }) => {
    const response = await callApi(`/model-audit/scans/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete scan');
  },
  onMutate: async ({ id }) => {
    await queryClient.cancelQueries({ queryKey: modelAuditKeys.scans() });
    const previousScans = queryClient.getQueryData(modelAuditKeys.scans());
    queryClient.setQueryData(modelAuditKeys.scans(), (old) =>
      old?.filter((scan) => scan.id !== id) ?? []
    );
    return { previousScans };
  },
  onError: (err, variables, context) => {
    if (context?.previousScans) {
      queryClient.setQueryData(modelAuditKeys.scans(), context.previousScans);
    }
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: modelAuditKeys.scans() });
  },
});
```

### 4. Normalized Options
Single source of truth for defaults:

```typescript
export function normalizeEvalTableOptions(
  options: UseEvalTableOptions,
): Required<UseEvalTableOptions> {
  return {
    pageIndex: options.pageIndex ?? 0,
    pageSize: options.pageSize ?? 50,
    filterMode: options.filterMode ?? 'all',
    searchText: options.searchText ?? '',
    filters: options.filters ?? [],
    comparisonEvalIds: options.comparisonEvalIds ?? [],
  };
}
```

## Critical Fixes

### 1. Infinite Refetch Bug
**Problem:** Filter array created new reference on every render
**Solution:** React.useMemo with stable dependencies
**Impact:** Eliminated constant refetching

### 2. Cache Pollution
**Problem:** Complex objects in query keys caused unlimited cache entries
**Solution:** Serialize filters to stable strings
**Impact:** Proper cache reuse, reduced memory

### 3. Double Refetch on Mutation
**Problem:** onSuccess + invalidation caused two fetches
**Solution:** Use onSettled instead
**Impact:** 50% fewer network requests

### 4. Code Duplication
**Problem:** Same logic in useEvalTable and usePrefetchEvalTable
**Solution:** Extract normalizeEvalTableOptions
**Impact:** DRY, maintainability

## Test Coverage

### Integration Tests (20 tests total)

**useEvalTable.integration.test.tsx (8 tests)**
- Request deduplication
- Filter reference stability
- Filter content changes
- Cache behavior (staleTime)
- Error handling
- Null evalId handling
- Manual refetch
- Options normalization

**useHistoricalScans.integration.test.tsx (7 tests)**
- Request deduplication
- Cache behavior
- Error handling
- Empty/missing data
- Manual refetch
- Retry behavior

**useDeleteScan.integration.test.tsx (5 tests)**
- Optimistic updates
- Automatic rollback
- Cache invalidation timing
- Multiple simultaneous deletes
- Loading states

## Best Practices

### When to Use React Query
✅ Server state (API data)
✅ Cached data
✅ Background refetching
✅ Optimistic updates

### When to Use Zustand
✅ Client-only state
✅ UI preferences
✅ Form state
✅ Persisted settings

### Cache Configuration
```typescript
useQuery({
  queryKey: evalKeys.table(evalId, options),
  queryFn: () => fetchEvalTable(evalId, options),
  staleTime: 30 * 1000, // 30s - don't refetch fresh data
  gcTime: 5 * 60 * 1000, // 5min - keep in cache
  retry: 1, // Retry once on failure
})
```

## Migration Checklist for Future Pages

- [ ] Identify server state vs client state
- [ ] Create query key factory
- [ ] Implement React Query hooks
- [ ] Create Zustand store for client state only
- [ ] Extract utility functions to utils/
- [ ] Move types to types.ts
- [ ] Create compatibility bridge
- [ ] Write integration tests
- [ ] Migrate components gradually
- [ ] Remove compatibility bridge
- [ ] Delete old store

## File Organization

```
src/app/src/pages/[page]/
├── components/          # React components
│   └── store.ts        # Display settings only
├── hooks/              # React Query hooks
│   ├── usePageData.ts
│   ├── queryKeys.ts
│   ├── index.ts
│   └── *.integration.test.tsx
├── store/              # Client state (Zustand)
│   └── uiStore.ts
├── utils/              # Pure functions
│   └── pageUtils.ts
└── types.ts            # Type definitions
```

## Lessons Learned

### What Worked Well
1. **Compatibility bridge** - Zero-downtime migration
2. **Integration tests** - Caught critical bugs
3. **Memoization** - Fixed infinite refetch issues
4. **Query key factory** - Prevented cache pollution

### What to Avoid
1. **Complex objects in query keys** - Serialize them
2. **Creating new arrays in render** - Use useMemo
3. **onSuccess for invalidation** - Use onSettled
4. **Mixing server and client state** - Keep separate

### Performance Wins
- **Request deduplication** - Automatic with React Query
- **Background refetching** - Fresh data without loading states
- **Optimistic updates** - Instant UI feedback
- **Cache reuse** - Fewer network requests

## References

- [TanStack Query Docs](https://tanstack.com/query/latest/docs/framework/react/overview)
- [Query Key Factories](https://tkdodo.eu/blog/effective-react-query-keys#use-query-key-factories)
- [Optimistic Updates](https://tkdodo.eu/blog/optimistic-updates-in-react-query)
- [Zustand Docs](https://zustand-demo.pmnd.rs/)

## Support

For questions or issues related to this migration, refer to:
- Integration tests for examples
- This document for patterns
- React Query docs for advanced usage
