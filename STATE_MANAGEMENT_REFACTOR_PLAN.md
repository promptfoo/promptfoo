# State Management Refactor Plan

## Problem Statement

Currently, `eval/components/store.ts` and `model-audit/store.ts` mix server state and client state in Zustand stores. This violates best practices and causes issues:

- ❌ Manual loading/error state management
- ❌ No automatic caching or request deduplication
- ❌ No background refetching
- ❌ Can't use React Query DevTools
- ❌ Mixed concerns (hard to test/maintain)

## Solution: Separate Server State (React Query) from Client State (Zustand)

### Architecture Pattern

```
┌─────────────────────────────────────────┐
│  React Query (Server State)             │
│  - API data fetching                    │
│  - Automatic caching                    │
│  - Request deduplication                │
│  - Background refetching                │
│  - Optimistic updates                   │
└─────────────────────────────────────────┘
           ↓ provides data to
┌─────────────────────────────────────────┐
│  Components                             │
│  - Combine server + client state        │
└─────────────────────────────────────────┘
           ↓ uses
┌─────────────────────────────────────────┐
│  Zustand (Client State)                 │
│  - UI preferences (persisted)           │
│  - Form state                           │
│  - Filter selections                    │
│  - Pagination state                     │
└─────────────────────────────────────────┘
```

---

## Phase 1: Eval Store Refactor

### Current State (`eval/components/store.ts` - 834 lines)

**Two stores in one file:**

1. **`useResultsViewSettingsStore`** (line 363-406)
   - ✅ **KEEP AS-IS** - Pure UI settings, correctly using Zustand with persistence
   - Settings: maxTextLength, wordBreak, showInferenceDetails, renderMarkdown, etc.

2. **`useTableStore`** (line 422-834)
   - ❌ **NEEDS REFACTOR** - Mixes server and client state

#### Server State (Move to React Query)

| State                     | Current Location | New Location                                     |
| ------------------------- | ---------------- | ------------------------------------------------ |
| `table`                   | Zustand          | React Query: `useEvalTable(evalId, queryParams)` |
| `config`                  | Zustand          | React Query: (included in useEvalTable response) |
| `author`                  | Zustand          | React Query: (included in useEvalTable response) |
| `version`                 | Zustand          | React Query: (included in useEvalTable response) |
| `filteredResultsCount`    | Zustand          | React Query: (included in useEvalTable response) |
| `totalResultsCount`       | Zustand          | React Query: (included in useEvalTable response) |
| `highlightedResultsCount` | Zustand          | React Query: (computed from table data)          |
| `metadataKeys`            | Zustand          | React Query: `useMetadataKeys(evalId)`           |
| `fetchEvalData()`         | Zustand action   | React Query hook                                 |
| `fetchMetadataKeys()`     | Zustand action   | React Query hook                                 |

#### Client State (Keep in Zustand)

| State                       | Reason                                |
| --------------------------- | ------------------------------------- |
| `evalId`                    | Current eval being viewed (URL param) |
| `filters.values`            | User's filter selections              |
| `filterMode`                | UI state                              |
| `isStreaming`               | UI flag                               |
| `shouldHighlightSearchText` | UI flag                               |

#### Computed/Derived State

| State                       | Solution                                  |
| --------------------------- | ----------------------------------------- |
| `filters.options`           | Derive from React Query data in component |
| `filters.policyIdToNameMap` | Derive from React Query data in component |

### New File Structure

```
src/app/src/pages/eval/
├── components/
│   ├── store.ts                    # RENAME to settingsStore.ts
│   └── ... (components)
├── hooks/
│   ├── useEvalTable.ts            # NEW - React Query hook
│   ├── useMetadataKeys.ts         # NEW - React Query hook
│   └── ... (other hooks)
└── store/
    └── uiStore.ts                  # NEW - Client state only
```

### Migration Steps - Eval Store

1. ✅ Create `hooks/useEvalTable.ts`
   - Extract `fetchEvalData` logic to queryFn
   - Use filters/pagination/searchText as query key
   - Return: `{ data, isLoading, error, refetch }`

2. ✅ Create `hooks/useMetadataKeys.ts`
   - Extract `fetchMetadataKeys` logic to queryFn
   - Use evalId as query key
   - Handle abort controller via React Query's signal

3. ✅ Create `store/uiStore.ts`
   - Move client state: evalId, filters, filterMode, isStreaming, etc.
   - Keep filter management actions: addFilter, removeFilter, etc.

4. ✅ Update components (27 files affected)
   - Replace `useTableStore` with combination of:
     - `useEvalTable(evalId, queryParams)`
     - `useMetadataKeys(evalId)`
     - `useEvalUIStore()` (client state)
   - Derive filter options from table data

5. ✅ Update tests
   - Mock React Query hooks instead of Zustand
   - Use `createTestQueryClient` wrapper

6. ✅ Delete old `fetchEvalData` and `fetchMetadataKeys` from store

---

## Phase 2: Model Audit Store Refactor

### Current State (`model-audit/store.ts` - 333 lines)

#### Server State (Move to React Query)

| State                    | New Location                            |
| ------------------------ | --------------------------------------- |
| `installationStatus`     | React Query: `useInstallationCheck()`   |
| `historicalScans`        | React Query: `useHistoricalScans()`     |
| `checkInstallation()`    | React Query hook                        |
| `fetchHistoricalScans()` | React Query hook                        |
| `deleteHistoricalScan()` | React Query mutation: `useDeleteScan()` |

#### Client State (Keep in Zustand)

| State                                               | Reason                                          |
| --------------------------------------------------- | ----------------------------------------------- |
| `recentScans`                                       | localStorage-persisted recent scans             |
| `paths`                                             | Current scan paths                              |
| `scanOptions`                                       | Scan configuration                              |
| `scanResults`                                       | Results of local scan (not fetched from server) |
| `isScanning`                                        | Scanning state                                  |
| `error`                                             | Local scan error                                |
| `activeTab`, `showFilesDialog`, `showOptionsDialog` | UI state                                        |

### New File Structure

```
src/app/src/pages/model-audit/
├── hooks/
│   ├── useInstallationCheck.ts    # NEW - React Query hook
│   ├── useHistoricalScans.ts      # NEW - React Query hook
│   ├── useDeleteScan.ts           # NEW - React Query mutation
│   └── ...
└── store/
    └── uiStore.ts                  # NEW - Client state only (rename from store.ts)
```

### Migration Steps - Model Audit

1. ✅ Create `hooks/useInstallationCheck.ts`
2. ✅ Create `hooks/useHistoricalScans.ts`
3. ✅ Create `hooks/useDeleteScan.ts` (mutation)
4. ✅ Create `store/uiStore.ts` with client state only
5. ✅ Update components
6. ✅ Update tests

---

## Expected Benefits

### Performance

- ✅ Automatic request deduplication
- ✅ Intelligent caching (staleTime, gcTime)
- ✅ Background refetching
- ✅ Optimistic updates for mutations

### Developer Experience

- ✅ React Query DevTools for debugging
- ✅ Better TypeScript types
- ✅ Clearer separation of concerns
- ✅ Less boilerplate (no manual loading/error states)

### Testing

- ✅ Easier to mock server state
- ✅ Test client state independently
- ✅ Test server state with React Query testing utils

---

## Implementation Order

1. **Phase 1A**: Create eval React Query hooks (useEvalTable, useMetadataKeys)
2. **Phase 1B**: Create eval UI store
3. **Phase 1C**: Update 1-2 eval components as proof of concept
4. **Phase 1D**: Update remaining eval components
5. **Phase 1E**: Fix eval tests
6. **Phase 2A**: Create model-audit React Query hooks
7. **Phase 2B**: Create model-audit UI store
8. **Phase 2C**: Update model-audit components
9. **Phase 2D**: Fix model-audit tests
10. **Verification**: Run full test suite, verify all 1376+ tests pass

---

## Risks & Mitigation

| Risk                           | Mitigation                                      |
| ------------------------------ | ----------------------------------------------- |
| Breaking 27 components at once | Implement gradually, test after each component  |
| Complex query key management   | Start simple, optimize later                    |
| Performance regressions        | Monitor with React Query DevTools               |
| Test failures                  | Update tests incrementally alongside components |

---

## Estimated Effort

- **Phase 1 (Eval)**: 6-8 hours (27 component dependencies)
- **Phase 2 (Model Audit)**: 3-4 hours (fewer dependencies)
- **Total**: ~10-12 hours of focused work

---

## Success Criteria

- [ ] All 1376+ tests passing
- [ ] No TypeScript errors
- [ ] React Query DevTools showing proper caching
- [ ] No duplicate API requests (verified in Network tab)
- [ ] All components rendering correctly
- [ ] Filter/pagination working as before
- [ ] Comparison mode working
- [ ] Streaming mode working
