# Media Library Re-Audit (After Latest Uncommitted Updates)

Date: 2026-03-03  
Branch: `feature/media-library-page`  
Scope: backend routes/schemas, frontend page/UI, keyboard/navigation/history, scrolling/pagination, security abuse checks, test coverage

## Executive verdict

The latest updates close key prior issues (deep-link/history bug, page-level test coverage addition, server-side eval search, touch discoverability improvement).  
Current state is close, but there is still a **material filter-state UX correctness issue** and a few medium/low quality gaps.

## Findings (ordered by severity)

### Medium

1. **Eval filter trigger can display “All Evaluations” while an eval filter is still active.**
   - Evidence:
     - Selected label is derived only from currently loaded `evals`: `src/app/src/pages/media/components/MediaFilters.tsx:85`
     - Trigger fallback text when selected eval not present: `src/app/src/pages/media/components/MediaFilters.tsx:154`
     - `evals` list is now server-search/limit constrained (`search` + `limit=501`), so selected eval can easily be absent: `src/app/src/pages/media/hooks/useMediaItems.ts:231`, `src/app/src/pages/media/hooks/useMediaItems.ts:241`
   - Why this matters:
     - Users can be actively filtered by `evalId` while UI implies unfiltered state.
     - This is a high-confusion correctness issue for filtering workflows.

2. **New `/library/evals` search behavior lacks dedicated backend tests.**
   - Evidence:
     - Route now supports `search` and `where` clause: `src/server/routes/blobs.ts:377`, `src/server/routes/blobs.ts:398`
     - Existing tests do not assert `search` behavior or limit-501 truncation semantics: `test/server/routes/blobs.test.ts:574`
   - Why this matters:
     - Search/filter logic can regress silently despite passing current suite.

### Low

3. **`Media.test.tsx` still does not exercise actual browser history stack transitions (`Back`/`Forward`) for hash-sync correctness.**
   - Evidence:
     - Tests cover click/deep-link/open/close/filter URL updates: `src/app/src/pages/media/Media.test.tsx:119`
     - No explicit back/forward transition test case in that file.
   - Why this matters:
     - URL/hash state machine is the highest-complexity part of this page; history-specific regression risk remains.

4. **Eval search can be abused with wildcard-heavy terms (`%`, `_`) to force broad LIKE scans.**
   - Evidence:
     - Search pattern built directly as `%${search}%` and passed to LIKE: `src/server/routes/blobs.ts:384`, `src/server/routes/blobs.ts:386`
   - Why this matters:
     - In OSS local mode risk is low, but in shared environments this can become a resource-abuse vector unless rate-limited/escaped/scoped.

## Previously flagged items now fixed

- Deep-link/history short-circuit issue addressed by clearing `lastResolvedDeepLinkRef` on modal navigation:
  - `src/app/src/pages/media/Media.tsx:345`
- Page-level media state-machine tests added:
  - `src/app/src/pages/media/Media.test.tsx:119`
- Eval search now server-driven with truncation detection via `limit=501`:
  - `src/app/src/pages/media/hooks/useMediaItems.ts:226`
  - `src/types/api/blobs.ts:76`
  - `src/server/routes/blobs.ts:377`
- Touch discoverability improved for card download control:
  - `src/app/src/pages/media/components/MediaCard.tsx:172`

## Checklist status

- Backend validation and response schema enforcement: **Pass**
- Backend query safety: **Pass** (parameterized)
- Backend pagination correctness: **Pass**
- Frontend deep-link and modal URL sync: **Pass** (improved)
- Keyboard shortcuts and modal navigation: **Pass**
- Scrolling/infinite pagination: **Pass**
- Eval filtering clarity and correctness: **Partial** (selected-label mismatch issue above)
- UI/UX loading/error/empty states: **Pass**
- Accessibility baseline (dialog semantics, card interactions): **Pass**
- Security hardening and abuse resistance: **Partial** (wildcard scan caveat + deployment auth model)
- Tests for changed logic: **Partial** (backend search-path assertions missing)

## Validation run

- `npm run test --prefix src/app -- src/pages/media` -> **10 files, 168 tests passed**
- `npx vitest run test/server/routes/blobs.test.ts` -> **27 tests passed**
- `npm run tsc --prefix src/app` -> passed
- `npm run tsc` -> passed

## Merge recommendation

Before merge, fix the eval-filter label correctness issue (selected eval should remain identifiable even when not in current search result window), and add backend tests for `search` + truncation behavior on `/api/blobs/library/evals`.
