# React Query Best Practices - Implementation Guide

**Date:** 2025-10-04
**Status:** ✅ **IMPLEMENTED IN PRODUCTION**

## Overview

This document outlines the React Query best practices implemented during the eval and model-audit page migrations. These patterns should be followed for all future React Query implementations.

## 1. Query Key Factories

### ✅ What We Did

Created centralized query key factories for type safety and consistency:

**src/app/src/pages/eval/hooks/queryKeys.ts:**

```typescript
export const evalKeys = {
  all: ['eval'] as const,
  byId: (evalId: string | null) => [...evalKeys.all, evalId] as const,
  table: (evalId: string | null, options: Required<UseEvalTableOptions>) =>
    [...evalKeys.byId(evalId), 'table', options] as const,
  metadataKeys: (evalId: string | null, comparisonEvalIds: string[]) =>
    [...evalKeys.byId(evalId), 'metadata-keys', comparisonEvalIds] as const,
};
```

**src/app/src/pages/model-audit/hooks/queryKeys.ts:**

```typescript
export const modelAuditKeys = {
  all: ['model-audit'] as const,
  installation: () => [...modelAuditKeys.all, 'installation'] as const,
  scans: () => [...modelAuditKeys.all, 'scans'] as const,
  scan: (id: string) => [...modelAuditKeys.all, 'scan', id] as const,
};
```

### Benefits

- **Type safety:** Keys are typed and auto-completed
- **Consistency:** All queries use the same key structure
- **Easy invalidation:** `queryClient.invalidateQueries({ queryKey: evalKeys.all })` invalidates all eval queries
- **Documentation:** Key structure is self-documenting
- **Maintainability:** One place to update if keys need to change

### Usage

```typescript
// ✅ Good - Using query key factory
const query = useQuery({
  queryKey: evalKeys.table(evalId, normalizedOptions),
  queryFn: () => fetchEvalTable(evalId, normalizedOptions),
});

// ❌ Bad - Hardcoded keys
const query = useQuery({
  queryKey: ['eval', evalId, 'table', options],
  queryFn: () => fetchEvalTable(evalId, options),
});
```

## 2. Shared Query Functions

### ✅ What We Did

Extracted query logic into reusable functions to eliminate duplication:

**src/app/src/pages/eval/hooks/useEvalTable.ts:**

```typescript
async function fetchEvalTable(
  evalId: string,
  options: Required<UseEvalTableOptions>,
): Promise<EvalTableDTO> {
  // Single source of truth for fetching eval table data
  // Used by both useEvalTable and usePrefetchEvalTable
  const url = new URL(`/eval/${evalId}/table`, window.location.origin);
  // ... URL building logic
  const resp = await callApi(url.toString().replace(window.location.origin, ''));
  // ... error handling
  return (await resp.json()) as EvalTableDTO;
}
```

### Benefits

- **DRY principle:** Query logic defined once
- **Consistency:** Same fetch logic for regular queries and prefetching
- **Easier testing:** Single function to test
- **Easier maintenance:** Changes in one place

### Usage

```typescript
// Hook uses shared function
export function useEvalTable(evalId: string | null, options = {}) {
  const normalizedOptions = {
    /* normalize options */
  };
  const query = useQuery({
    queryKey: evalKeys.table(evalId, normalizedOptions),
    queryFn: () => fetchEvalTable(evalId, normalizedOptions), // Shared function
  });
  return {
    /* ... */
  };
}

// Prefetch uses the same shared function
export function usePrefetchEvalTable() {
  return (evalId: string, options = {}) => {
    const normalizedOptions = {
      /* normalize options */
    };
    queryClient.prefetchQuery({
      queryKey: evalKeys.table(evalId, normalizedOptions),
      queryFn: () => fetchEvalTable(evalId, normalizedOptions), // Same function
    });
  };
}
```

## 3. Proper Cache Configuration

### ✅ What We Did

Added appropriate `staleTime` and `gcTime` for all queries:

```typescript
const query = useQuery({
  queryKey: evalKeys.table(evalId, normalizedOptions),
  queryFn: () => fetchEvalTable(evalId, normalizedOptions),
  enabled: !!evalId,
  staleTime: 30 * 1000, // 30 seconds - how long data is considered fresh
  gcTime: 5 * 60 * 1000, // 5 minutes - how long to keep unused data in cache
  retry: 1, // Retry failed requests once
});
```

### Configuration Guidelines

| Data Type           | staleTime | gcTime | Reasoning                                         |
| ------------------- | --------- | ------ | ------------------------------------------------- |
| Eval table data     | 30s       | 5min   | Changes moderately, users switch evals frequently |
| Metadata keys       | 60s       | 5min   | Changes infrequently, can cache longer            |
| Installation status | 5min      | 10min  | Rarely changes, expensive to check                |
| Historical scans    | 60s       | 5min   | Updated when scans complete                       |

### Benefits

- **Performance:** Reduced unnecessary network requests
- **Fresh data:** Background refetching keeps data up-to-date
- **Memory management:** Unused data is automatically garbage collected
- **Better UX:** Instant loading from cache when data is fresh

## 4. Optimistic Updates for Mutations

### ✅ What We Did

Implemented optimistic updates with automatic rollback:

**src/app/src/pages/model-audit/hooks/useDeleteScan.ts:**

```typescript
const mutation = useMutation({
  mutationFn: async ({ id }: DeleteScanVariables) => {
    const response = await callApi(`/model-audit/scans/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to delete scan');
    }
  },
  onMutate: async ({ id }) => {
    // Cancel outgoing refetches (prevent race conditions)
    await queryClient.cancelQueries({ queryKey: modelAuditKeys.scans() });

    // Snapshot current state for rollback
    const previousScans = queryClient.getQueryData(modelAuditKeys.scans());

    // Optimistically update UI (remove scan immediately)
    queryClient.setQueryData(modelAuditKeys.scans(), (old: any[]) => {
      return old?.filter((scan) => scan.id !== id) ?? [];
    });

    return { previousScans }; // Return context for rollback
  },
  onError: (err, variables, context) => {
    // Rollback on error
    if (context?.previousScans) {
      queryClient.setQueryData(modelAuditKeys.scans(), context.previousScans);
    }
  },
  onSuccess: () => {
    // Invalidate to refetch and ensure consistency
    queryClient.invalidateQueries({ queryKey: modelAuditKeys.scans() });
  },
});
```

### Benefits

- **Instant feedback:** UI updates immediately without waiting for server
- **Automatic rollback:** Failed mutations restore previous state
- **Eventual consistency:** Success callback refetches to sync with server
- **Better UX:** App feels faster and more responsive

## 5. Option Normalization

### ✅ What We Did

Normalized optional parameters to ensure consistent cache keys:

```typescript
export function useEvalTable(evalId: string | null, options = {}) {
  // Normalize all options with defaults
  const normalizedOptions = {
    pageIndex: options.pageIndex ?? 0,
    pageSize: options.pageSize ?? 50,
    filterMode: options.filterMode ?? ('all' as EvalResultsFilterMode),
    searchText: options.searchText ?? '',
    filters: options.filters ?? [],
    comparisonEvalIds: options.comparisonEvalIds ?? [],
  };

  // Use normalized options in query key for consistency
  const query = useQuery({
    queryKey: evalKeys.table(evalId, normalizedOptions),
    // ...
  });
}
```

### Benefits

- **Consistent cache hits:** `useEvalTable(id, {})` and `useEvalTable(id)` use same cache entry
- **Predictable behavior:** Same inputs always produce same cache key
- **Type safety:** `Required<UseEvalTableOptions>` ensures all fields present

## 6. Error Handling

### ✅ What We Did

Proper error handling with typed errors:

```typescript
queryFn: async () => {
  if (!evalId) {
    return null; // Early return for disabled queries
  }

  const resp = await callApi(url.toString());

  if (!resp.ok) {
    // Throw with descriptive message
    throw new Error(`Failed to fetch eval data: ${resp.status} ${resp.statusText}`);
  }

  return (await resp.json()) as EvalTableDTO;
},
```

### Benefits

- **Clear error messages:** Easier debugging
- **Proper error propagation:** React Query's error handling kicks in
- **Type safety:** Return types are enforced

## 7. Conditional Queries (enabled)

### ✅ What We Did

Used `enabled` option to prevent unnecessary requests:

```typescript
const query = useQuery({
  queryKey: evalKeys.table(evalId, normalizedOptions),
  queryFn: async () => {
    if (!evalId) {
      return null; // Safety check (shouldn't reach here)
    }
    return fetchEvalTable(evalId, normalizedOptions);
  },
  enabled: !!evalId, // Don't run query if evalId is null/undefined
});
```

### Benefits

- **Efficiency:** No wasted network requests
- **Clean code:** No need for multiple conditional checks
- **Automatic refetch:** Query automatically runs when `enabled` becomes true

## 8. DevTools Integration

### ✅ What We Did

React Query DevTools are automatically available in development:

- Press **F12** → **React Query** tab
- See all queries, their status, and cached data
- Manually trigger refetches
- Inspect query timings

### Benefits

- **Debugging:** See exactly what's cached and when
- **Performance monitoring:** Track query timing
- **Development:** Test refetch behavior manually

## 9. Compatibility Bridges

### ✅ What We Did

Created compatibility layers for zero-downtime migration:

```typescript
export function useTableStoreCompat() {
  const uiStore = useEvalUIStore(); // Zustand for client state
  const { data, isLoading, error } = useEvalTable(evalId, options); // React Query for server state

  // Bridge old API to new implementation
  return {
    // Server state from React Query
    table: data?.table ?? null,
    config: data?.config ?? {},
    // Client state from Zustand
    filters: uiStore.filters,
    // ... all other properties/methods
  };
}
```

### Benefits

- **Zero breaking changes:** All components work without modification
- **Gradual migration:** Can migrate components to direct React Query usage over time
- **Safety:** Test new implementation with existing components

## 10. Separation of Concerns

### ✅ What We Did

Strict separation between server state and client state:

**React Query (Server State):**

- API data (eval tables, scans, metadata)
- Loading states
- Error states
- Caching, refetching, invalidation

**Zustand (Client State):**

- UI flags (dialogs open/closed)
- Filters
- Search text
- Sort state
- User preferences

### Benefits

- **Clear responsibilities:** Each tool does what it's best at
- **Easier reasoning:** No confusion about where state lives
- **Better performance:** React Query handles caching, Zustand handles ephemeral state

## Summary Checklist

When creating a new React Query hook, ensure:

- [ ] Created query key factory in `queryKeys.ts`
- [ ] Extracted shared query function if used in multiple places
- [ ] Added appropriate `staleTime` and `gcTime`
- [ ] Normalized all optional parameters
- [ ] Used `enabled` for conditional queries
- [ ] Implemented proper error handling with descriptive messages
- [ ] Added optimistic updates for mutations
- [ ] Separated server state (React Query) from client state (Zustand)
- [ ] Created compatibility bridge if migrating existing code
- [ ] Tested with React Query DevTools

## References

- [React Query Documentation](https://tanstack.com/query/latest)
- [Query Key Factories Blog](https://tkdodo.eu/blog/effective-react-query-keys)
- [Optimistic Updates Guide](https://tanstack.com/query/latest/docs/react/guides/optimistic-updates)
