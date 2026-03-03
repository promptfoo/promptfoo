---
name: search-params
description: URL search param and hash state management. Use when adding or modifying URL search params, working with useSearchParams, setSearchParams, useSearchParamState, or navigate() with query strings or hash fragments, or fixing browser back/forward button issues.
---

# URL Search Param State Management

## Decision Framework

When updating the URL (search params or hash), choose between **replace** and **push** based on whether the change represents in-page state or a user-navigable step:

| Change type        | Examples                                                | History behavior                                    |
| ------------------ | ------------------------------------------------------- | --------------------------------------------------- |
| **In-page state**  | Filters, sort, pagination, tab switches, search queries | `replace` — don't pollute history                   |
| **Navigable step** | Wizard progression, multi-step forms                    | `push` — back button should return to previous step |
| **Unsure?**        |                                                         | **Ask the developer** before choosing               |

**Why this matters:** Pushing in-page state changes clutters the browser history. Users clicking "back" expect to leave the page, not undo a filter toggle. This is the #1 cause of "back button is broken" bugs.

## Correct Patterns

### Single search param — use `useSearchParamState` (preferred)

This hook validates with Zod and **always uses `replace: true` internally**, so you get correct history behavior for free.

```tsx
import { useSearchParamState } from '@app/hooks/useSearchParamState';
import { z } from 'zod';

const TabSchema = z.enum(['overview', 'details', 'settings']);
const [activeTab, setActiveTab] = useSearchParamState('tab', TabSchema, 'overview');
```

**Key file:** `src/app/src/hooks/useSearchParamState.ts`

### Multiple search params — use `setSearchParams` with `replace: true`

When updating multiple params at once, use `setSearchParams` directly but always pass `{ replace: true }` for in-page state:

```tsx
const [searchParams, setSearchParams] = useSearchParams();

// Updating filters (in-page state → replace)
setSearchParams(
  (params) => {
    params.set('status', 'active');
    params.set('sort', 'name');
    return params;
  },
  { replace: true },
);
```

### Hash-based navigation — `navigate()` with replace or push

For wizard/multi-step flows where back button should traverse steps, use **push** (the default):

```tsx
// Wizard step navigation — push so back button works between steps
// See: src/app/src/pages/redteam/setup/page.tsx
const updateHash = (newStep: string) => {
  navigate(`#${newStep}`); // push (default) — intentional
};
```

For hash changes that represent in-page state, use replace:

```tsx
// Tab switch on a detail page — replace to avoid history clutter
navigate(`#${section}`, { replace: true });
```

### URL normalization after save

When the URL needs to be updated to include a new ID after a create/save operation (not a user action), use replace:

```tsx
// After first save, update URL to include new ID without adding history entry
navigate(`/evals/${newConfigId}`, { replace: true });
```

## Anti-Patterns

### Pushing in-page state changes (breaks back button)

```tsx
// WRONG — every filter change adds a history entry
setSearchParams((params) => {
  params.set('filter', value);
  return params;
});

// WRONG — navigate without replace for state change
navigate(`?tab=${newTab}`);
```

### Using raw `useSearchParams` for a single param without validation

```tsx
// WRONG — no validation, easy to forget { replace: true }
const [searchParams, setSearchParams] = useSearchParams();
const tab = searchParams.get('tab');
const setTab = (v: string) => {
  setSearchParams((p) => {
    p.set('tab', v);
    return p;
  });
};

// RIGHT — use the hook instead
const [tab, setTab] = useSearchParamState('tab', TabSchema, 'overview');
```

### Using empty strings instead of null

```tsx
// WRONG — useSearchParamState will throw an invariant error
setTab('');

// RIGHT — use null to clear a param
setTab(null);
```

## Key Files

- `src/app/src/hooks/useSearchParamState.ts` — primary hook (uses replace internally)
- `src/app/src/pages/eval/components/ResultsView.tsx` — example of correct `{ replace: true }` usage
- `src/app/src/pages/redteam/setup/page.tsx` — example of intentional push for wizard steps
