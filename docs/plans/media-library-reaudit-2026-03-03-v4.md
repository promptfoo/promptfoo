# Media Library Re-Audit (Post-Update v4)

Date: 2026-03-03
Branch: `feature/media-library-page`
Baseline: `main...HEAD`
Primary re-audited commits: `1fc15bbd1`, `94f5222a4`

## Executive verdict

The feature is substantially improved and close to production quality. Prior critical regressions from earlier rounds are fixed.

Remaining issues are mostly in interaction correctness and resilience, not core data integrity. I would hold merge for the two medium findings below, then re-run the focused tests.

## Findings (ordered by severity)

### Medium

1. **Modal `Space` shortcut can hijack keyboard interaction on focused controls (video/audio modal).**
   - Evidence:
     - Shortcut handler intentionally skips text inputs/media elements, but not other interactive controls: [MediaModal.tsx](/Users/mdangelo/projects/pf2/src/app/src/pages/media/components/MediaModal.tsx:284)
     - `Space` playback toggle is global in dialog keydown and `preventDefault()` is applied: [MediaModal.tsx](/Users/mdangelo/projects/pf2/src/app/src/pages/media/components/MediaModal.tsx:305)
   - Impact:
     - Keyboard users focusing buttons (e.g. “Show technical details”, nav arrows, download) can trigger play/pause instead of expected button behavior.
     - This is an accessibility/usability regression in keyboard navigation.
   - Recommendation:
     - Expand the interactive-element guard to include `BUTTON`, `A`, `[role="button"]`, `[role="link"]`, and optionally use a strict “modal-root only” shortcut scope.

2. **Deep-link failure path can re-fetch the same missing hash repeatedly on subsequent state changes.**
   - Evidence:
     - Successful deep-link resolution is memoized (`lastResolvedDeepLinkRef`) and skipped later: [Media.tsx](/Users/mdangelo/projects/pf2/src/app/src/pages/media/Media.tsx:250)
     - Not-found/server/network outcomes do not set any terminal marker, so future `items`/loading transitions can re-trigger fetch for same hash: [Media.tsx](/Users/mdangelo/projects/pf2/src/app/src/pages/media/Media.tsx:276)
   - Impact:
     - Repeated unnecessary API calls and repeated error-state churn when list state changes while hash remains in URL.
   - Recommendation:
     - Track a failed hash marker (or cache negative result with TTL) and avoid repeated fetches until hash changes or user retries explicitly.

### Low

3. **Eval filter combobox semantics are not fully ARIA-compliant for assistive tech.**
   - Evidence:
     - Trigger uses `role="combobox"`: [MediaFilters.tsx](/Users/mdangelo/projects/pf2/src/app/src/pages/media/components/MediaFilters.tsx:154)
     - Popup options are plain buttons without listbox/option semantics or active-descendant pattern: [MediaFilters.tsx](/Users/mdangelo/projects/pf2/src/app/src/pages/media/components/MediaFilters.tsx:187)
   - Impact:
     - Screen-reader interaction model can be inconsistent vs expected combobox behavior.
   - Recommendation:
     - Either implement proper combobox/listbox semantics or switch to an established accessible command/listbox primitive pattern already used elsewhere in app.

4. **Test suite still lacks explicit history-stack regression coverage for browser Back/Forward through modal navigation steps.**
   - Evidence:
     - New page-level tests validate URL hash sync and deep-link opening/closing: [Media.test.tsx](/Users/mdangelo/projects/pf2/src/app/src/pages/media/Media.test.tsx:146)
     - No explicit test walking `open -> next -> back -> back` history behavior.
   - Impact:
     - URL-state machine is high complexity; history regressions can reappear despite current tests passing.
   - Recommendation:
     - Add a deterministic integration test for browser history transitions across modal item navigation.

## Previously flagged items now fixed

- Deep-link stale resolution / wrong item on browser Back fixed by resetting deep-link ref on in-modal navigation:
  - [Media.tsx](/Users/mdangelo/projects/pf2/src/app/src/pages/media/Media.tsx:345)
- Eval filter label persistence during server-side search fixed with selected description caching:
  - [MediaFilters.tsx](/Users/mdangelo/projects/pf2/src/app/src/pages/media/components/MediaFilters.tsx:84)
- LIKE wildcard sanitization added to eval search:
  - [blobs.ts](/Users/mdangelo/projects/pf2/src/server/routes/blobs.ts:384)
- Backend tests added for eval search path and query validation:
  - [blobs.test.ts](/Users/mdangelo/projects/pf2/test/server/routes/blobs.test.ts:676)

## Comprehensive audit checklist and status

1. Backend route contracts (`/library`, `/library/evals`, `/:hash`): **Pass**
2. Request validation boundaries (Zod schemas, enum/range validation): **Pass**
3. Response schema enforcement and shape stability: **Pass**
4. SQL injection/query safety (parameterization + LIKE escaping): **Pass**
5. MIME/header injection hardening on blob delivery: **Pass**
6. Frontend route registration and nav discoverability: **Pass**
7. URL state sync (filters/sort/hash) correctness: **Pass**
8. Deep-linking and modal open/close sync with URL: **Partial** (see finding #2)
9. Keyboard shortcuts and focus interaction safety: **Partial** (see finding #1)
10. Modal navigation controls and item traversal: **Pass**
11. Infinite scroll/manual pagination race handling: **Pass**
12. Bulk download flow and cancellation behavior: **Pass**
13. Loading/empty/error states and recovery UX: **Pass**
14. Mobile/touch affordances for core actions: **Pass** (noting accessibility semantics gap)
15. Accessibility semantics (combobox/listbox, keyboard parity): **Partial** (see finding #3)
16. Security red-team scenarios (fuzzing, invalid params, auth boundary assumptions): **Pass (OSS local model)**
17. Test coverage depth for high-risk state machine behavior: **Partial** (see finding #4)

## Red-team / pen-test perspective (feature-specific)

- Hash/path fuzzing against blob route: strong input validation in place (`sha256` regex).
- MIME/header abuse: explicit safe MIME regex and fallback to `application/octet-stream` on serve path.
- SQL injection via eval search: parameterized query + wildcard escaping in LIKE path.
- Data exfiltration risk in multi-tenant deployment: route comments correctly note this remains OSS-local auth model and requires tenant scoping in cloud contexts.
- UI XSS risk from eval metadata/prompt/variables: rendered as text, no HTML injection points observed.

## Validation run

- `npm run test --prefix src/app -- src/pages/media` -> passed (`10` files, `168` tests)
- `npx vitest run test/server/routes/blobs.test.ts` -> passed (`27/27`)
- `npm run tsc --prefix src/app` -> passed
- `npm run tsc` -> passed

## Merge recommendation

Address findings #1 and #2 before merge. Findings #3 and #4 can be resolved in same PR if time permits; otherwise file follow-up tasks, but #1/#2 are release quality blockers for a brand-new primary page.
