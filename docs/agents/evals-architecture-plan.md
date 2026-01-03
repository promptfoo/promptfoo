# Evals Architecture Improvement Plan

Based on analysis comparing the Model Audit feature (newer, reference architecture) with the Evals feature (legacy patterns). This plan outlines improvements to bring Evals up to the same architectural standards.

## Executive Summary

Model Audit represents the target architecture for frontend features in promptfoo. The Evals feature predates this and uses older patterns. This plan documents the gaps and provides actionable steps to modernize Evals.

---

## Current State Analysis

### Architecture Comparison

| Aspect              | Model Audit                          | Evals                             | Gap    |
| ------------------- | ------------------------------------ | --------------------------------- | ------ |
| Error boundaries    | Per-route in App.tsx                 | None                              | High   |
| Route constants     | `MODEL_AUDIT_ROUTES` used everywhere | `EVAL_ROUTES` exists but not used | Medium |
| Type centralization | `ModelAudit.types.ts`                | Inline types in components        | Medium |
| Store architecture  | Split (Config + History stores)      | Monolithic `store.ts`             | High   |
| Server pagination   | Full support with offset/limit       | Client-only (loads all)           | High   |
| Component reuse     | Shared `model-audit/components/`     | Tightly coupled to pages          | Medium |
| Design system       | 100% Radix/Tailwind                  | 95% (MUI Tooltip remains)         | Low    |
| Directory structure | Separate dirs per page               | Nested components                 | Low    |

### File Locations

**Model Audit (Reference)**

```
src/app/src/pages/
├── model-audit/                    # Shared components & stores
│   ├── ModelAudit.types.ts         # Centralized types
│   ├── stores/
│   │   ├── useModelAuditConfigStore.ts
│   │   └── useModelAuditHistoryStore.ts
│   ├── hooks/
│   │   └── useSeverityCounts.ts
│   └── components/
│       ├── ResultsTab.tsx
│       ├── ScanResultHeader.tsx
│       ├── SecurityFindings.tsx
│       └── SeverityScorecard.tsx
├── model-audit-history/page.tsx
├── model-audit-latest/page.tsx
├── model-audit-result/page.tsx
└── model-audit-setup/page.tsx
```

**Evals (Current)**

```
src/app/src/pages/
├── eval/
│   ├── page.tsx
│   └── components/
│       ├── Eval.tsx              # Large monolithic component
│       ├── ResultsView.tsx       # Large monolithic component
│       ├── store.ts              # All state in one file
│       └── [30+ component files]
├── evals/
│   ├── page.tsx
│   └── components/
│       └── EvalsTable.tsx        # Self-contained with data fetching
└── eval-creator/
    ├── page.tsx
    └── components/
        └── EvaluateTestSuiteCreator.tsx
```

---

## Phase 1: Quick Wins (Low Risk, High Impact)

### 1.1 Add Error Boundaries to Eval Routes

**File:** `src/app/src/App.tsx`

**Current (lines 65-67):**

```tsx
<Route path="/eval" element={<EvalPage />} />
<Route path="/evals" element={<EvalsIndexPage />} />
<Route path="/eval/:evalId" element={<EvalPage />} />
```

**Target:**

```tsx
<Route
  path="/eval"
  element={
    <ErrorBoundary name="Eval">
      <EvalPage />
    </ErrorBoundary>
  }
/>
<Route
  path="/evals"
  element={
    <ErrorBoundary name="Evals">
      <EvalsIndexPage />
    </ErrorBoundary>
  }
/>
<Route
  path="/eval/:evalId"
  element={
    <ErrorBoundary name="Eval Detail">
      <EvalPage />
    </ErrorBoundary>
  }
/>
```

**Rationale:** Model Audit wraps every route in ErrorBoundary (App.tsx:76-107). This prevents full app crashes when a single page has an error.

---

### 1.2 Replace MUI Tooltip in EvalsTable

**File:** `src/app/src/pages/evals/components/EvalsTable.tsx`

**Current (line 18):**

```tsx
import { Tooltip } from '@mui/material';
```

**Target:**

```tsx
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
```

**Current usage (lines 248-261):**

```tsx
<Tooltip title={text} placement="top" arrow>
  <span className="text-sm block" style={{...}}>
    {text}
  </span>
</Tooltip>
```

**Target:**

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <span className="text-sm block truncate">{text}</span>
  </TooltipTrigger>
  <TooltipContent>{text}</TooltipContent>
</Tooltip>
```

**Rationale:** This is the last MUI component in the evals list view. Removing it completes the design system migration for this page.

---

### 1.3 Use EVAL_ROUTES Constants Consistently

**File:** `src/app/src/constants/routes.ts` already has:

```typescript
export const EVAL_ROUTES = {
  ROOT: '/eval',
  LIST: '/evals',
  DETAIL: (id: string) => `/eval/${id}`,
} as const;
```

**Files to update:**

1. `src/app/src/pages/evals/components/EvalsTable.tsx` (line 189):

   ```tsx
   // Current
   to={`/eval/${evalId}`}

   // Target
   import { EVAL_ROUTES } from '@app/constants/routes';
   to={EVAL_ROUTES.DETAIL(evalId)}
   ```

2. `src/app/src/pages/evals/page.tsx` (line 25):

   ```tsx
   // Current
   onEvalSelected={(evalId) => navigate(`/eval/${evalId}`)}

   // Target
   import { EVAL_ROUTES } from '@app/constants/routes';
   onEvalSelected={(evalId) => navigate(EVAL_ROUTES.DETAIL(evalId))}
   ```

3. Search for all `/eval/` and `/evals` hardcoded strings in `src/app/`

**Rationale:** Centralized route constants prevent typos and make refactoring easier. Model Audit uses this pattern consistently.

---

## Phase 2: Type Centralization

### 2.1 Create Eval.types.ts

**New file:** `src/app/src/pages/eval/Eval.types.ts`

Extract types currently defined inline in various files:

```typescript
// From EvalsTable.tsx:23-32
export interface EvalSummary {
  createdAt: number;
  datasetId: string;
  description: string | null;
  evalId: string;
  isRedteam: number;
  label: string;
  numTests: number;
  passRate: number;
}

// From store.ts and other files
export interface EvalResult {
  // ... extract from existing code
}

export interface EvalConfig {
  // ... extract from existing code
}

export interface ResultsFilter {
  // ... currently in store.ts
}

// Re-export for convenience
export type { EvalSummary as Eval };
```

**Files to update:**

- `src/app/src/pages/evals/components/EvalsTable.tsx` - import from types file
- `src/app/src/pages/eval/components/store.ts` - import from types file
- `src/app/src/pages/eval/components/*.tsx` - import from types file

**Rationale:** Model Audit has `ModelAudit.types.ts` with all shared types. This makes the codebase more maintainable and provides better IDE support.

---

## Phase 3: Store Architecture Refactor

### 3.1 Split Eval Stores

**Current:** Single `store.ts` file with multiple stores and all concerns mixed.

**Target:** Separate stores following Model Audit pattern:

```
src/app/src/pages/eval/stores/
├── index.ts                      # Re-exports all stores
├── useEvalListStore.ts           # For /evals list page
├── useEvalDetailStore.ts         # For /eval/:id detail page
└── useEvalSettingsStore.ts       # For user preferences (persisted)
```

#### 3.1.1 useEvalListStore.ts

Based on `useModelAuditHistoryStore.ts`:

```typescript
import { callApi } from '@app/utils/api';
import { create } from 'zustand';
import type { EvalSummary } from '../Eval.types';

interface SortModel {
  field: string;
  sort: 'asc' | 'desc';
}

interface EvalListState {
  // Data
  evals: EvalSummary[];
  isLoading: boolean;
  error: string | null;
  totalCount: number;

  // Pagination (server-side)
  pageSize: number;
  currentPage: number;
  sortModel: SortModel[];
  searchQuery: string;

  // Actions
  fetchEvals: (signal?: AbortSignal) => Promise<void>;
  deleteEvals: (ids: string[]) => Promise<void>;
  setPageSize: (size: number) => void;
  setCurrentPage: (page: number) => void;
  setSortModel: (model: SortModel[]) => void;
  setSearchQuery: (query: string) => void;
  resetFilters: () => void;
}

const DEFAULT_PAGE_SIZE = 50;

export const useEvalListStore = create<EvalListState>()((set, get) => ({
  evals: [],
  isLoading: false,
  error: null,
  totalCount: 0,
  pageSize: DEFAULT_PAGE_SIZE,
  currentPage: 0,
  sortModel: [{ field: 'createdAt', sort: 'desc' }],
  searchQuery: '',

  fetchEvals: async (signal?: AbortSignal) => {
    set({ isLoading: true, error: null });

    try {
      const { pageSize, currentPage, sortModel, searchQuery } = get();
      const offset = currentPage * pageSize;
      const sort = sortModel[0]?.field || 'createdAt';
      const order = sortModel[0]?.sort || 'desc';

      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: offset.toString(),
        sort,
        order,
      });

      if (searchQuery) {
        params.append('search', searchQuery);
      }

      const response = await callApi(`/results?${params.toString()}`, { signal });
      if (!response.ok) {
        throw new Error('Failed to fetch evals');
      }

      const data = await response.json();
      set({
        evals: data.data || [],
        totalCount: data.total || data.data?.length || 0,
        isLoading: false,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch evals',
      });
    }
  },

  deleteEvals: async (ids: string[]) => {
    // Optimistic delete
    const previousEvals = get().evals;
    const previousCount = get().totalCount;

    set((state) => ({
      evals: state.evals.filter((e) => !ids.includes(e.evalId)),
      totalCount: Math.max(0, state.totalCount - ids.length),
    }));

    try {
      const response = await callApi('/eval', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete evals');
      }
    } catch (error) {
      // Revert on failure
      set({ evals: previousEvals, totalCount: previousCount });
      throw error;
    }
  },

  setPageSize: (pageSize) => set({ pageSize, currentPage: 0 }),
  setCurrentPage: (currentPage) => set({ currentPage }),
  setSortModel: (sortModel) => set({ sortModel, currentPage: 0 }),
  setSearchQuery: (searchQuery) => set({ searchQuery, currentPage: 0 }),
  resetFilters: () =>
    set({
      pageSize: DEFAULT_PAGE_SIZE,
      currentPage: 0,
      sortModel: [{ field: 'createdAt', sort: 'desc' }],
      searchQuery: '',
    }),
}));
```

#### 3.1.2 Backend Changes Required

**File:** `src/server/routes/results.ts` (or equivalent)

Add pagination support to `/results` endpoint:

```typescript
// Query params
interface ResultsQuery {
  limit?: number; // Default: 50
  offset?: number; // Default: 0
  sort?: string; // Default: 'createdAt'
  order?: 'asc' | 'desc'; // Default: 'desc'
  search?: string; // Optional text search
}

// Response format
interface ResultsResponse {
  data: EvalSummary[];
  total: number;
  limit: number;
  offset: number;
}
```

---

## Phase 4: Server-Side Pagination

### 4.1 Update EvalsTable to Use Store

**File:** `src/app/src/pages/evals/components/EvalsTable.tsx`

**Current:** Component manages its own state and fetches all data.

**Target:** Use the new `useEvalListStore` with server-side pagination.

```tsx
import { useEffect } from 'react';
import { useEvalListStore } from '../stores';

export default function EvalsTable({ onEvalSelected, ... }) {
  const {
    evals,
    isLoading,
    error,
    totalCount,
    pageSize,
    currentPage,
    sortModel,
    fetchEvals,
    deleteEvals,
    setPageSize,
    setCurrentPage,
  } = useEvalListStore();

  useEffect(() => {
    const abortController = new AbortController();
    fetchEvals(abortController.signal);
    return () => abortController.abort();
  }, [fetchEvals, pageSize, currentPage, sortModel]);

  // ... rest of component using store state
}
```

### 4.2 Add Server-Side Pagination UI

Follow Model Audit pattern (`ModelAuditHistory.tsx:281-337`):

```tsx
{
  /* After DataTable */
}
{
  evals.length > 0 && (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border">
      <div className="text-sm text-muted-foreground">
        Showing {currentPage * pageSize + 1} to {Math.min((currentPage + 1) * pageSize, totalCount)}{' '}
        of {totalCount} evals
      </div>
      <div className="flex items-center gap-2">
        <select
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
          }}
          className="px-3 py-1.5 rounded-md border border-border bg-background text-sm"
        >
          <option value={25}>25 / page</option>
          <option value={50}>50 / page</option>
          <option value={100}>100 / page</option>
        </select>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(0)}
            disabled={currentPage === 0}
          >
            First
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(currentPage - 1)}
            disabled={currentPage === 0}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(currentPage + 1)}
            disabled={(currentPage + 1) * pageSize >= totalCount}
          >
            Next
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(Math.ceil(totalCount / pageSize) - 1)}
            disabled={(currentPage + 1) * pageSize >= totalCount}
          >
            Last
          </Button>
        </div>
      </div>
    </div>
  );
}
```

---

## Phase 5: Component Extraction (Optional)

### 5.1 Create Shared Components Directory

```
src/app/src/pages/eval/components/shared/
├── EvalStatusBadge.tsx      # Pass rate indicator
├── EvalTypeBadge.tsx        # Red Team vs Eval badge
├── PassRateDisplay.tsx      # Colored pass rate
└── index.ts                 # Re-exports
```

### 5.2 Example: PassRateDisplay

Extract from EvalsTable.tsx (lines 266-282):

```tsx
// src/app/src/pages/eval/components/shared/PassRateDisplay.tsx
import { cn } from '@app/lib/utils';

interface PassRateDisplayProps {
  rate: number;
  className?: string;
}

export function PassRateDisplay({ rate, className }: PassRateDisplayProps) {
  const colorClass =
    rate >= 90
      ? 'text-emerald-600 dark:text-emerald-400'
      : rate >= 60
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-red-600 dark:text-red-400';

  return (
    <span className={cn('font-mono text-sm tabular-nums', colorClass, className)}>
      {rate.toFixed(2)}%
    </span>
  );
}
```

---

## Implementation Order

### Immediate (Phase 1) - Can be done independently

1. [ ] Add ErrorBoundary to eval routes in App.tsx
2. [ ] Replace MUI Tooltip with Radix in EvalsTable
3. [ ] Use EVAL_ROUTES constants throughout

### Short-term (Phase 2-3) - Requires coordination

4. [ ] Create Eval.types.ts with centralized types
5. [ ] Create useEvalListStore following Model Audit pattern
6. [ ] Update EvalsTable to use new store

### Medium-term (Phase 4) - Requires backend changes

7. [ ] Add pagination support to /results API endpoint
8. [ ] Add server-side pagination UI to EvalsTable
9. [ ] Test with large datasets

### Optional (Phase 5) - Nice to have

10. [ ] Extract shared components (PassRateDisplay, etc.)
11. [ ] Reorganize directory structure to match Model Audit

---

## Testing Considerations

### Unit Tests to Add/Update

- `useEvalListStore.test.ts` - New store tests
- `EvalsTable.test.tsx` - Update for new store usage
- `PassRateDisplay.test.tsx` - New component tests

### Integration Tests

- Pagination behavior with mock API
- Delete with optimistic updates and rollback
- Error boundary recovery

### Manual Testing Checklist

- [ ] Navigate to /evals - list loads correctly
- [ ] Pagination controls work
- [ ] Sorting works
- [ ] Search/filter works
- [ ] Delete single eval works
- [ ] Delete multiple evals works
- [ ] Error states display correctly
- [ ] Empty state displays correctly
- [ ] Dark mode styling correct

---

## Success Metrics

After implementation:

| Metric                          | Before | After       |
| ------------------------------- | ------ | ----------- |
| Error boundaries on eval routes | 0      | 3           |
| MUI components in evals list    | 1      | 0           |
| Hardcoded route strings         | ~10    | 0           |
| Separate store files            | 1      | 3+          |
| Server-side pagination          | No     | Yes         |
| Type centralization             | Inline | Single file |

---

## References

### Model Audit Files (Reference Implementation)

- `src/app/src/pages/model-audit/ModelAudit.types.ts`
- `src/app/src/pages/model-audit/stores/useModelAuditHistoryStore.ts`
- `src/app/src/pages/model-audit-history/ModelAuditHistory.tsx`
- `src/app/src/App.tsx` (lines 76-109)

### Evals Files (To Be Updated)

- `src/app/src/pages/evals/page.tsx`
- `src/app/src/pages/evals/components/EvalsTable.tsx`
- `src/app/src/pages/eval/components/store.ts`
- `src/app/src/App.tsx` (lines 65-67)

### Related Documentation

- `src/app/AGENTS.md` - Frontend development guidelines
- `src/app/MIGRATION.md` - MUI to Radix migration plan
- `src/app/src/constants/routes.ts` - Route constants
