# Media Library Re-Audit (After Latest Updates)

Date: 2026-03-03  
Branch: `feature/media-library-page`  
Baseline: re-audit after commits `51dc506cf` and `97c1cd764`

## Executive verdict

Quality improved and key prior blockers were fixed (modal close on Back-to-no-hash, DialogTitle a11y, loadMore race guard, `li.contents` removal).  
However, one **new high-severity navigation bug** remains in deep-link/history synchronization, and there are still medium-risk product quality gaps.

## Findings (ordered by severity)

### High

1. **Deep-link history navigation can show the wrong modal item due to stale `lastResolvedDeepLinkRef` short-circuit.**
   - Evidence:
     - Guard returns early when `lastResolvedDeepLinkRef.current === hashParam`: `src/app/src/pages/media/Media.tsx:249`
     - `lastResolvedDeepLinkRef` is set when hash resolves: `src/app/src/pages/media/Media.tsx:256` and `src/app/src/pages/media/Media.tsx:273`
     - Internal modal navigation mutates selection without updating `lastResolvedDeepLinkRef`: `src/app/src/pages/media/Media.tsx:341`
   - Repro flow (logic):
     - Open page via deep link `?hash=A` (ref becomes `A`).
     - Navigate in modal to item `B` (URL becomes `?hash=B`).
     - Browser Back to `?hash=A`.
     - Effect exits at `lastResolvedDeepLinkRef === hashParam` and does not set selected item to `A`, so modal can stay on `B` while URL says `A`.
   - Why this matters:
     - URL, browser history, and visible content can diverge on a core interaction path.

### Medium

2. **Eval filter remains hard-capped to the first 500 evals (now disclosed, but still functionally limited).**
   - Evidence:
     - API default/max limit: `src/types/api/blobs.ts:76`
     - Hook fetches a single page with no pagination: `src/app/src/pages/media/hooks/useMediaItems.ts:222`
     - UI only shows a truncation notice: `src/app/src/pages/media/components/MediaFilters.tsx:244`
   - Why this matters:
     - Users with large histories still cannot filter by older evals from this page.

3. **Critical URL/history state machine still lacks page-level integration tests.**
   - Evidence:
     - No test file for `src/app/src/pages/media/Media.tsx` (where sync and deep-link logic lives).
     - Existing tests are component-level (`MediaModal`, `MediaGrid`, `MediaCard`, etc.).
   - Why this matters:
     - Regressions in back/forward/deep-link flows are likely and hard to detect without integration coverage.

4. **Truncation message may be inaccurate when exactly 500 evals exist.**
   - Evidence:
     - Truncation inferred by `data.length >= 500`: `src/app/src/pages/media/hooks/useMediaItems.ts:230`
     - Message states “Showing first N evaluations”: `src/app/src/pages/media/components/MediaFilters.tsx:246`
   - Why this matters:
     - Can present a false truncation warning if total exactly equals the limit.

### Low

5. **Per-card download affordance is still weak on touch-first devices.**
   - Evidence:
     - Control visibility relies on hover/focus-visible: `src/app/src/pages/media/components/MediaCard.tsx:172`
   - Why this matters:
     - Functionally reachable, but discoverability remains weaker on mobile/touch.

6. **List/evals routes still rely on OSS local-trust model (documented, not enforced).**
   - Evidence:
     - Security notes are comments only: `src/server/routes/blobs.ts:71` and `src/server/routes/blobs.ts:357`
   - Why this matters:
     - Acceptable for local OSS; not sufficient if reused in shared/multi-tenant deployment without additional auth layers.

## What was fixed since the previous re-audit

- Browser Back to no-hash now closes modal: `src/app/src/pages/media/Media.tsx:223`
- Dialog now has accessible title: `src/app/src/pages/media/components/MediaModal.tsx:466`
- Download button is visible when keyboard-focused: `src/app/src/pages/media/components/MediaCard.tsx:172`
- Synchronous guard added to avoid observer/button loadMore races: `src/app/src/pages/media/hooks/useMediaItems.ts:49`
- `li.contents` removed from grid structure: `src/app/src/pages/media/components/MediaGrid.tsx:206`
- Security boundary comments added for list routes: `src/server/routes/blobs.ts:71` and `src/server/routes/blobs.ts:357`

## Comprehensive checklist status

- Backend validation/schema enforcement: **Pass**
- Backend query safety: **Pass**
- Backend pagination correctness: **Pass** (for current query model)
- Frontend modal history/back semantics: **Partial** (high bug above)
- Keyboard shortcuts and focus behavior: **Pass/Partial** (mostly good; touch discoverability still weaker)
- Scrolling/infinite pagination resilience: **Pass**
- Eval filter scalability: **Partial**
- UX state handling (loading/error/empty): **Pass**
- Accessibility baseline for dialog/cards: **Pass/Partial** (dialog title fixed)
- Security hardening and abuse resistance: **Pass with deployment caveat**
- Test coverage for critical interaction paths: **Partial**

## Validation run for this re-audit

- `npx vitest run test/server/routes/blobs.test.ts` -> passed (27/27)
- `npm run test --prefix src/app -- src/pages/media` -> passed (161/161)
- `npm run tsc --prefix src/app` -> passed
- `npm run tsc` -> passed

## Merge recommendation

Do not treat this as final-quality until the high-severity deep-link/history bug is fixed and covered with page-level integration tests for:

- deep-link open (`?hash=...`)
- in-modal navigation (next/previous)
- browser Back/Forward across hash transitions
- URL/content consistency assertions
