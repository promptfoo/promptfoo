# Full Diff Re-Audit (main...HEAD) — 2026-03-03 (v6)

## Scope

- Branch: `feature/media-library-page`
- Merge base: `64597c70b8c519d3bd7f3c897ae7707051767e84`
- Diff size: 67 files, 16,323 insertions, 3,431 deletions
- Scope audited: backend routes/schemas/tests, media frontend UX + keyboard + nav + pagination/scrolling, UI primitives, routing/nav, workflow/package changes, DB migration, related non-media app changes

## Validation Performed

- `npm run test --prefix src/app -- src/pages/media` (10 files, 170 tests passed)
- `npx vitest run test/server/routes/blobs.test.ts` (30 tests passed)
- `npm run tsc --prefix src/app` (passed)
- `npm run tsc` (passed)
- `npm run tsc --prefix code-scan-action` (passed)
- `npm run build --prefix code-scan-action` (passed)
- `npm run typecheck --prefix site` (passed)
- `npm run l` (no lint errors; complexity warnings only)

## Merge-Blocking Findings

- None.

## High-Importance Findings (non-blocking, should be addressed soon)

1. Deep-link transient failures are "latched" and cannot be retried without changing URL or reloading.
   - File: `src/app/src/pages/media/Media.tsx` (deep-link effect around `lastResolvedDeepLinkRef`)
   - Behavior: network/server deep-link failures set `lastResolvedDeepLinkRef.current = hashParam`, which suppresses re-fetches for the same hash thereafter.
   - Impact: a temporary API/server hiccup can make a permalink appear permanently broken for that session.
   - Recommendation: only mark hash as resolved for `not_found`; keep retryability for `network_error`/`server_error` with explicit "Retry" action.

## Medium Findings

1. Bulk download UX can report progress without true success confirmation per file.
   - File: `src/app/src/pages/media/Media.tsx`
   - Behavior: anchor-triggered multi-download loop updates progress optimistically and cannot detect browser-blocked downloads.
   - Impact: users may think all files were downloaded when browser policy blocked some.
   - Recommendation: add a warning in UI during bulk download that browser permissions may block multiple files; optionally provide zip export server-side later for reliable delivery.

2. `parseTimestamp` assumes valid parseable strings; malformed persisted values could throw during `toISOString()`.
   - File: `src/server/routes/blobs.ts`
   - Behavior: invalid date parsing from unexpected DB values can throw and fail request.
   - Impact: defensive robustness issue under corrupted/legacy rows.
   - Recommendation: guard with `Number.isNaN(date.getTime())` fallback before `toISOString()`.

## What I Specifically Audited

- Backend:
  - `src/server/routes/blobs.ts`
  - `src/types/api/blobs.ts`
  - `test/server/routes/blobs.test.ts`
  - Security checks: hash validation, MIME safety, SQL wildcard escaping, error handling, auth assumptions
  - Performance checks: pagination semantics, join strategy, new indexes
- Frontend media page:
  - `src/app/src/pages/media/**/*`
  - Keyboard shortcuts, modal navigation/back-button behavior, deep-link resolution, selection mode, infinite scroll/manual load-more fallback
  - UI/UX and a11y sanity (focus flow, labels, controls)
- Related UI/routing:
  - `src/app/src/App.tsx`, `Navigation.tsx`, `constants/routes.ts`
  - `src/app/src/components/ui/{dialog,tabs,collapsible,copy-button,alert-dialog}.tsx`
- Non-media files in same diff:
  - workflow/dependency/tooling: `.github/workflows/main.yml`, root/app/site/code-scan package files
  - DB migration: `drizzle/*`, `src/database/tables.ts`
  - other app changes: onboarding/init/provider/test/doc updates in diff

## Final Recommendation

- Ready to merge from a blocker standpoint.
- I recommend one follow-up patch for deep-link retry behavior before/soon after merge to avoid flaky permalink UX under transient failures.
