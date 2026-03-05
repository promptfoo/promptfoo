# Media Library Re-Audit (Diff vs `main`)

Date: 2026-03-03  
Branch: `feature/media-library-page`  
Audit type: code + UX/a11y + keyboard/nav + pagination + security abuse review

## Executive verdict

This feature has improved substantially since the prior audit, but it is **not yet production-grade** for a brand-new top-level page. Two high-severity UX/a11y issues remain, plus several medium-risk interaction and scalability gaps.

## Re-audit findings (ordered by severity)

### High

1. **Browser Back can leave modal open when URL hash is removed.**
   - Evidence:
     - Hash-cleared path does not clear `selectedItem`: `src/app/src/pages/media/Media.tsx:218`
     - Modal open state is driven by `selectedItem`: `src/app/src/pages/media/Media.tsx:641`
   - Why this matters:
     - Deep-link/back semantics are inconsistent: URL can be `/media` while modal remains open.
     - Users can get stuck in a confusing state where browser history and UI state diverge.

2. **Media modal dialog is missing a dialog title (accessibility failure).**
   - Evidence:
     - `DialogContent` is rendered without `DialogTitle`: `src/app/src/pages/media/components/MediaModal.tsx:461`
     - Test run emits Radix accessibility warnings repeatedly for this file.
   - Why this matters:
     - Screen-reader users lose the required dialog name context.
     - This violates baseline dialog accessibility requirements for a flagship page.

### Medium

3. **Invisible-but-focusable card download control causes keyboard/touch discoverability issues.**
   - Evidence:
     - Download button is hidden via opacity unless hover: `src/app/src/pages/media/components/MediaCard.tsx:172`
     - Button remains interactive/focusable: `src/app/src/pages/media/components/MediaCard.tsx:166`
   - Why this matters:
     - Keyboard users can tab to a control with no visible affordance.
     - On touch-first devices, hover affordance does not exist, so discoverability is poor.

4. **`loadMore` is vulnerable to duplicate in-flight requests (observer + button race).**
   - Evidence:
     - Guard depends on async React state only: `src/app/src/pages/media/hooks/useMediaItems.ts:118`
     - `IntersectionObserver` and manual button can both call `onLoadMore`: `src/app/src/pages/media/components/MediaGrid.tsx:147` and `src/app/src/pages/media/components/MediaGrid.tsx:233`
   - Why this matters:
     - Under fast repeated triggers, duplicate fetches can append duplicate rows and skew offsets.

5. **Eval filter remains capped and non-paginated for large deployments.**
   - Evidence:
     - API hard cap/default: `src/types/api/blobs.ts:76`
     - UI fetches eval list once, no pagination controls: `src/app/src/pages/media/hooks/useMediaItems.ts:213`
   - Why this matters:
     - Installations with >500 evals will silently hide older evals from filtering.

6. **Coverage still misses page-level history/deep-link integration paths.**
   - Evidence:
     - New modal/component tests exist, but there is no `Media.tsx` integration test covering `searchParams`/Back behavior.
   - Why this matters:
     - The highest-risk interaction (URL sync, deep links, browser history, modal state) remains unguarded.

### Low

7. **Grid list semantics still rely on `li.contents`, which is fragile in some assistive tech/browser combinations.**
   - Evidence:
     - `className="contents"` on list items: `src/app/src/pages/media/components/MediaGrid.tsx:206`
   - Why this matters:
     - Can degrade list semantics or announcement reliability depending on platform.

8. **Auth model remains local/implicit for list endpoints (security posture note).**
   - Evidence:
     - `/library` and `/library/evals` are open in local server model: `src/server/routes/blobs.ts:78` and `src/server/routes/blobs.ts:351`
     - Only `/:hash` route has explicit OSS-vs-multi-tenant auth commentary: `src/server/routes/blobs.ts:430`
   - Why this matters:
     - If reused in shared/multi-tenant deployments, explicit authorization boundaries are required.

## Checklist audit (feature-quality rubric)

- Backend route input validation (`/library`, `/library/evals`, `/:hash`): **Pass**
- Backend response schema enforcement: **Pass**
- Query safety / injection resistance: **Pass**
- Data minimization in list payload: **Pass** (improved)
- Pagination correctness (`hasMore`, sort stability): **Partial** (race still possible client-side)
- Frontend URL/deep-link state sync: **Fail** (Back/hash-cleared inconsistency)
- Keyboard shortcuts (grid + modal): **Partial** (works broadly; page-level history sync gap remains)
- Navigation semantics (Back/Forward/permalink): **Partial**
- Scrolling/infinite loading resilience: **Partial** (manual fallback added, race remains)
- Empty/loading/error state UX: **Pass**
- Accessibility semantics and focus affordance: **Fail** (missing modal title; hidden focusable control)
- Security hardening (MIME sanitization, blob route controls): **Pass** with **deployment caveat**
- Red-team abuse resilience (resource exhaustion / large datasets): **Partial**
- Test coverage for critical user flows: **Partial**

## What was improved since prior audit

- Card no longer uses nested interactive descendants inside a button-role wrapper.
- Modal opening now pushes history for user selection.
- Manual `Load more` fallback button is present.
- List payload is trimmed (detail-only context fetched only for hash requests).
- `hasMore` now uses page hash count (not mapped row count).
- Blob route responses are parsed against Zod response schemas.
- Eval filter loading/error states are now surfaced in UI.

## Validation executed in this re-audit

- `npx vitest run test/server/routes/blobs.test.ts` -> **27/27 passed**
- `npm run test --prefix src/app -- src/pages/media` -> **161/161 passed**
  - Note: this run emits repeated Radix warning that `DialogContent` requires `DialogTitle` in `MediaModal`.
- `npm run tsc --prefix src/app` -> passed
- `npm run tsc` -> passed

## Release recommendation

Do not merge as final-quality page until both High findings are fixed and verified with page-level integration tests for:

- Back/Forward behavior across hash add/remove transitions.
- Deep-link open/close synchronization with URL.
- Modal accessibility contract (`DialogTitle` present, keyboard/focus expectations).
