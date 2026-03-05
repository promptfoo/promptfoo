# Media Library Re-Audit (Post-Update v5)

Date: 2026-03-03
Branch: `feature/media-library-page`
Scope: full media feature re-audit with emphasis on latest uncommitted updates

## Executive verdict

The latest updates materially improved quality and resolved the two prior functional blockers (deep-link refetch churn and modal `Space` hijack on focused buttons).

Current state is close to merge quality. Remaining issues are mostly accessibility/interaction polish and test-depth coverage.

## Findings (ordered by severity)

### Medium

1. **Eval filter is labeled as a combobox but does not implement full combobox/listbox semantics.**
   - Evidence:
     - Trigger advertises `role="combobox"`: [MediaFilters.tsx](/Users/mdangelo/projects/pf2/src/app/src/pages/media/components/MediaFilters.tsx:154)
     - Popup options are plain buttons, not listbox options (`role="option"`) with active-descendant semantics: [MediaFilters.tsx](/Users/mdangelo/projects/pf2/src/app/src/pages/media/components/MediaFilters.tsx:187)
   - Impact:
     - Screen-reader and keyboard interaction can be inconsistent with expected combobox behavior.
   - Recommendation:
     - Either adopt proper ARIA combobox/listbox wiring or use an existing accessible command/listbox primitive pattern.

### Low

2. **Modal shortcut scope is still narrower than the comment implies (non-button interactive targets can still trigger media shortcuts).**
   - Evidence:
     - Interactive skip list omits anchors and role-based interactive targets: [MediaModal.tsx](/Users/mdangelo/projects/pf2/src/app/src/pages/media/components/MediaModal.tsx:284)
     - `Space` override only exempts `BUTTON`: [MediaModal.tsx](/Users/mdangelo/projects/pf2/src/app/src/pages/media/components/MediaModal.tsx:299)
   - Impact:
     - Edge-case keyboard surprises remain possible when focus is on non-button interactive elements.
   - Recommendation:
     - Use a reusable `isInteractiveElement(target)` helper covering `A`, `[role="button"]`, `[role="link"]`, etc.

3. **Page-level history regression tests still don’t explicitly cover Back/Forward traversal across modal navigation steps.**
   - Evidence:
     - URL/hash tests exist, but no explicit `open -> next -> back -> back/forward` stack assertions: [Media.test.tsx](/Users/mdangelo/projects/pf2/src/app/src/pages/media/Media.test.tsx:118)
   - Impact:
     - Future history regressions in the URL state machine may slip through.

4. **New non-OK response handling in media hooks is not directly covered by tests.**
   - Evidence:
     - Added `response.ok` checks in list/evals hooks: [useMediaItems.ts](/Users/mdangelo/projects/pf2/src/app/src/pages/media/hooks/useMediaItems.ts:82), [useMediaItems.ts](/Users/mdangelo/projects/pf2/src/app/src/pages/media/hooks/useMediaItems.ts:235)
     - Existing tests focus on hash-fetch helper and UI behavior, not explicit non-OK list/evals hook paths.
   - Impact:
     - Error message regressions for HTTP failures could go undetected.

## Previously flagged blockers now resolved

- Repeated deep-link fetches for the same missing hash are now suppressed:
  - [Media.tsx](/Users/mdangelo/projects/pf2/src/app/src/pages/media/Media.tsx:281)
- `Space` no longer hijacks focused button interactions in media modal:
  - [MediaModal.tsx](/Users/mdangelo/projects/pf2/src/app/src/pages/media/components/MediaModal.tsx:297)
- Progress bar division-by-zero guard added:
  - [Media.tsx](/Users/mdangelo/projects/pf2/src/app/src/pages/media/Media.tsx:468)
- Hook-level non-OK HTTP handling added for media/evals fetches:
  - [useMediaItems.ts](/Users/mdangelo/projects/pf2/src/app/src/pages/media/hooks/useMediaItems.ts:82)
  - [useMediaItems.ts](/Users/mdangelo/projects/pf2/src/app/src/pages/media/hooks/useMediaItems.ts:235)

## Comprehensive checklist status

1. Backend route validation and response schemas: **Pass**
2. Backend pagination/sorting/filtering semantics: **Pass**
3. Backend query safety and wildcard handling: **Pass**
4. Blob serving safety (hash validation, MIME hardening): **Pass**
5. Frontend route/nav integration: **Pass**
6. URL state sync and deep-linking: **Pass**
7. Modal navigation and browser-back behavior: **Pass**
8. Keyboard shortcuts correctness: **Partial** (low edge-case scope issue)
9. Infinite scrolling/manual pagination race handling: **Pass**
10. Bulk download UX/cancellation/progress: **Pass**
11. Empty/loading/error states: **Pass**
12. Accessibility semantics: **Partial** (combobox/listbox semantics)
13. Test coverage for high-risk interactions: **Partial**
14. Security/red-team posture for OSS local model: **Pass**

## Validation run

- `npm run test --prefix src/app -- src/pages/media` -> passed (`10` files, `168` tests)
- `npx vitest run test/server/routes/blobs.test.ts` -> passed (`30/30`)
- `npm run tsc --prefix src/app` -> passed
- `npm run tsc` -> passed
- `npm run l` -> no lint errors (complexity warnings only)

## Merge recommendation

No remaining functional blockers found in this pass. Merge is reasonable after deciding whether to address the medium accessibility finding in this PR or track it as an immediate follow-up.
