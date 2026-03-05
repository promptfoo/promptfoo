# Media Library Feature Audit (Diff vs `main`)

Date: 2026-03-03
Branch: `feature/media-library-page`
Scope: backend routes + API schemas + DB migration + frontend page/components/hooks/tests + UX/a11y + keyboard/nav + scrolling/pagination + red-team checks.

## Findings (ordered by severity)

### High

1. **Media card semantics are not accessible: interactive descendants nested inside a `role="button"` container.**
   - Evidence:
     - `src/app/src/pages/media/components/MediaCard.tsx:108-134` (`div` with `role="button"`, keyboard handlers)
     - `src/app/src/pages/media/components/MediaCard.tsx:167-178` (nested download `<button>`)
     - `src/app/src/pages/media/components/MediaCard.tsx:186-197` (nested selection `<button>`)
   - Why this matters: screen readers and keyboard users can get conflicting interaction models; nested interactive controls inside a button-like parent are an a11y anti-pattern and can produce inconsistent focus/activation behavior.

2. **Browser navigation/back behavior is degraded because all URL sync uses `replace: true`, including modal hash state.**
   - Evidence:
     - `src/app/src/pages/media/Media.tsx:205` (`setSearchParams(params, { replace: true })`)
     - Modal open/close writes hash via same sync path (`src/app/src/pages/media/Media.tsx:195-206`, `320-323`)
   - Why this matters: opening an item modal does not create meaningful history state, so Back tends to leave the page instead of closing the modal / reverting filters. This is a major UX/navigation regression for a brand-new page.

### Medium

3. **List API payload is much heavier than needed (prompt text, vars, grader reasons for every grid item).**
   - Evidence:
     - Query selects prompt/test data for list endpoint: `src/server/routes/blobs.ts:191-199`
     - Transform sends prompt/variables/grader details in each list item: `src/server/routes/blobs.ts:241-303`
   - Why this matters: larger response latency, more memory pressure, and unnecessary exposure of potentially sensitive prompt/test data before a user opens details.

4. **`hasMore` is computed from mapped row count, not page hash count; pagination becomes fragile if join cardinality changes.**
   - Evidence:
     - `src/server/routes/blobs.ts:312`
   - Why this matters: if the `leftJoin(evalResultsTable, ...)` ever yields >1 row per hash context, `hasMore` can become wrong and infinite-scroll behavior will break.

5. **Infinite scroll has no manual fallback (`Load more`) and depends fully on `IntersectionObserver`.**
   - Evidence:
     - Observer-only loading: `src/app/src/pages/media/components/MediaGrid.tsx:141-147`
     - Sentinel has spinner only; no fallback action: `src/app/src/pages/media/components/MediaGrid.tsx:223-231`
   - Why this matters: observer edge cases, accessibility tooling, or browser quirks can strand users with partial results and no recovery path.

6. **“Download All” operates on currently loaded items only, not the full filtered dataset.**
   - Evidence:
     - Download source list is current `items` state: `src/app/src/pages/media/Media.tsx:362-366`
     - UI text suggests global scope (`Download All`): `src/app/src/pages/media/Media.tsx:522`
   - Why this matters: users can reasonably assume “all matching filtered items,” especially with infinite scrolling. Current behavior risks incorrect operator assumptions.

7. **Eval filter discoverability is capped without pagination.**
   - Evidence:
     - API default limit 100: `src/types/api/blobs.ts:75`
     - Hook calls endpoint without pagination controls: `src/app/src/pages/media/hooks/useMediaItems.ts:215-223`
   - Why this matters: large installations may hide older evals from filtering entirely.

8. **Media page ignores eval-list loading/error states.**
   - Evidence:
     - Hook returns `isLoading`/`error`: `src/app/src/pages/media/hooks/useMediaItems.ts:198-232`
     - Page consumes only `evals`: `src/app/src/pages/media/Media.tsx:105`
   - Why this matters: silent failure mode; filter dropdown can appear incomplete with no user explanation or retry path.

9. **Test coverage is missing for the most interaction-heavy paths.**
   - Missing tests for:
     - `src/app/src/pages/media/Media.tsx`
     - `src/app/src/pages/media/components/MediaModal.tsx`
     - `src/app/src/pages/media/components/AudioPreviewButton.tsx`
     - `src/app/src/pages/media/components/VideoHoverPreview.tsx`
   - Why this matters: keyboard shortcuts, URL/deep-link sync, modal navigation, bulk download behavior, and mobile interaction are currently unprotected by integration tests.

### Low

10. **Response schemas are defined but not enforced in route handlers.**
    - Evidence:
      - Schemas defined: `src/types/api/blobs.ts:61-91`
      - Routes send plain `res.json(...)` without `.parse(...)`: `src/server/routes/blobs.ts:169`, `307-314`, `357-364`
    - Why this matters: contract drift can slip into production undetected.

## Comprehensive Audit Checklist and Status

### Backend routes

- Input validation and coercion: **Pass** (Zod query/path schemas used).
- Query safety / injection resilience: **Pass** (enum-constrained sort/type, parameterized SQL templates).
- Authorization boundaries: **Partial** (OSS-local assumptions are explicit, but multi-tenant hardening is still needed).
- Error handling and response consistency: **Partial** (500 handling present; response schemas not enforced).
- Pagination correctness and deterministic ordering: **Partial** (stable secondary sort by hash is good; `hasMore` fragility noted).

### DB + migration

- Needed indexes for new workload: **Pass** (mime type and blob hash+created_at index added).
- Migration hygiene: **Pass** (new migration + snapshot + journal entry present).

### Frontend data/state

- API usage pattern (`callApi`): **Pass**.
- URL state sync and deep-link handling: **Partial** (works functionally; history/back semantics are weak).
- Loading/error/reset states: **Partial** (main media load handled; eval filter load/error path missing).

### UI/UX

- Empty/loading/error affordances: **Pass**.
- Mobile and desktop layout intent: **Pass** (responsive classes present).
- Action clarity (bulk download, “all” semantics): **Partial**.

### Keyboard + accessibility

- Grid keyboard navigation: **Pass** (arrow/home/end + roving tab index).
- Modal shortcuts: **Pass** (documented keys + handlers).
- ARIA/semantics correctness: **Fail** (interactive nesting issue on card).
- Focus visibility/operability of controls: **Partial** (hidden-but-focusable controls on cards).

### Scrolling / pagination

- Infinite load trigger and loading states: **Pass**.
- Fallback controls and recovery path: **Fail** (no manual load-more fallback).

### Security / red-team

- MIME header injection hardening: **Pass** (`SAFE_MIME_TYPE_REGEX`, octet-stream fallback).
- Path/URL handling in frontend media resolvers: **Pass** (external URL blocking for blob resolver paths).
- Data exposure minimization: **Partial** (list endpoint returns high-sensitivity context by default).
- Resource abuse/DoS considerations: **Partial** (offset is unbounded and list payload can become heavy).

## Validation Runs

- `npx vitest run test/server/routes/blobs.test.ts` -> passed (`26/26`)
- `npm run test --prefix src/app -- <media test files>` -> passed (`125/125`)
- `npm run tsc --prefix src/app` -> passed
- `npm run tsc` (root) -> passed

## Merge Recommendation

- **Do not treat as production-ready until High findings are addressed** (especially card accessibility semantics and browser navigation/back behavior).
- Medium findings should be scheduled before broad rollout of this page due UX and operational impact.
