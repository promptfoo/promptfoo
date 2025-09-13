# PR Review: Model Audit UI Restructure, History/Result Pages, Navigation

This review covers the current working tree changes relative to the prior baseline (origin/main ref is unavailable/dangling). Feedback focuses on correctness, UX, accessibility, performance, security, maintainability, and tests.

## Summary

- Adds dedicated history and result pages for Model Audit, routes, and nav updates.
- Removes legacy HistoryTab; surfaces a History page with a DataGrid.
- Result page shows metadata, actions (download, refresh, delete), and reuses ResultsTab.
- Navigation gets a Model Audit dropdown with entries for New Scan and Scan History.

Overall direction is strong: separation of concerns, improved discoverability, and DataGrid usage. The items below aim to tighten correctness, consistency, a11y, and future-proofing.

---

## Major Issues (Blockers / Must Address)

1) Tests: inconsistent frameworks and expectations
- File: `src/app/src/pages/model-audit-result/ModelAuditResult.test.tsx`
  - Uses `jest.fn()` and `jest.spyOn()` inside a Vitest test suite (imports from `vitest`). Replace with `vi.fn()` and `vi.spyOn()` to avoid runtime errors.
- File: `src/app/src/pages/model-audit/ModelAudit.test.tsx`
  - Expects a preflight `callApi('/model-audit/check-path', ...)`, but the component no longer calls it. Either reintroduce preflight or update tests to reflect the current flow.
- File: `src/app/src/pages/model-audit-history/ModelAuditHistory.test.tsx`
  - Expects a specific error string (`Failed to fetch scans`) while the component displays a generic “Error loading scans” header with the underlying error message. Align expectations with actual UI output, or standardize error text in the component for stability.

2) Result page fetch lifecycle
- File: `src/app/src/pages/model-audit-result/ModelAuditResult.tsx`
  - Lacks `AbortController`. Navigating away mid-fetch may cause state updates on unmounted components. Add abort handling in the effect and on unmount.

3) Type safety gaps
- File: `src/app/src/pages/model-audit-result/ModelAuditResult.tsx`
  - `results: any`. Replace with the shared `ScanResult` type. Prefer importing a generated type from Zod schemas to keep API parity.

4) Server API parity & contracts
- File: `src/server/routes/modelAudit.ts`
  - `GET /api/model-audit/scans` does not accept pagination/sort/search parameters; UI implies large datasets. Implement `limit`, `offset`, `search`, `sort`, `order`.
  - Missing `GET /api/model-audit/scans/latest`. Add endpoint for the latest result (200 with record, 204 when none).
  - Response/Request validation via Zod not in place. Add Zod validation and return typed shapes consistently.

5) Route/link inconsistencies
- Share URL generator uses `/model-audit/scan/:id` (see `src/share.ts`). Frontend uses `/model-audit/history/:id` and will add `/model-audit/:id`. Update to `/model-audit/:id` and retain redirect compatibility for legacy URLs.

---

## High Priority

6) Store/state duplication
- File: `src/app/src/pages/model-audit/store.ts` and `src/app/src/pages/model-audit-history/ModelAuditHistory.tsx`
  - History-related state/actions live in the monolithic store while History page manages its own fetch state. Choose one: (A) introduce `useModelAuditHistoryStore` and use it in the page, or (B) remove history from the main store. Avoid dual sources of truth.

7) `/check-path` shape mismatch
- File: `src/server/routes/modelAudit.ts`
  - When path not found, API returns `{ exists: false, type: null }` but client code and planned schemas imply `'unknown'`. Standardize on `'unknown'` or update schema/client to accept `null`.

8) Security and debug leakage
- File: `src/server/routes/modelAudit.ts` (`POST /scan` error and debug responses)
  - Responds with `debug` containing `args`, `paths`, `cwd`, and possibly large `stdout`/`stderr`. In production, gate debug fields behind an environment flag and censor absolute paths and secrets. Consider truncating outputs (currently first 1000 chars is used elsewhere—apply consistently).

9) Navigation accessibility and mobile behavior
- File: `src/app/src/components/Navigation.tsx`
  - Ensure dropdown works via click (not only hover), is keyboard navigable, has proper aria attributes/roles, and closes on focus out/escape. Validate behavior in mobile breakpoints.

---

## Medium Priority

10) DataGrid UX for small screens
- File: `src/app/src/pages/model-audit-history/ModelAuditHistory.tsx`
  - Add responsive `columnVisibilityModel` for XS/SM (e.g., hide Checks) and set column `minWidth`s to prevent horizontal overflow.
  - Toolbar: On XS, show QuickFilter prominently; collapse utility buttons into a kebab menu.
  - Add `aria-label` to QuickFilter and ensure focus ring visibility.

11) Download mechanism
- File: `src/app/src/pages/model-audit-result/ModelAuditResult.tsx`
  - Use `Blob` + `URL.createObjectURL` instead of data URI for large payloads. Tests already mock `createObjectURL` so migration is straightforward.

12) Long text handling
- Files: `ModelAuditResult.tsx`, History grid link cells
  - Add tooltips for truncated model paths and breadcrumb items to improve usability.

13) ModelAudit.toJSON omissions
- File: `src/models/modelAudit.ts`
  - `toJSON()` omits `author`, `checks`, and `issues`, which exist on the record type. If the UI or API consumers need these, include them; otherwise, document the intentional omission and ensure the UI uses `results.issues` consistently.

14) SSE-based scan progress (future work)
- Add `POST /api/model-audit/scan/stream` to stream progress (`stage|progress|log|complete`). On the UI, add a stepper in Setup to show progress; fallback to `/scans/latest` polling on disconnect.

---

## Low Priority / Polish

15) Styling QA (light/dark + responsive)
- Ensure no horizontal overflow at XS; adjust margins/paddings responsively (e.g., replace `mx: 4` with `{ xs: 0, sm: 2, md: 4 }`).
- Confirm chip colors and row hover/selected states meet contrast in dark mode.
- Add safe-area padding for notched devices on tall pages.

16) Telemetry
- Emit events for history row clicks, CSV export, delete action, and result view to measure usage and surface regressions.

17) Docs
- Update docs for new routes (`/model-audit/setup`, `/model-audit`, `/model-audit/:id`), DataGrid features, and Enterprise-supported storage backends (s3/gs/az, JFrog, HF via envs).

---

## Per-file Comments (Granular)

- `src/app/src/App.tsx`
  - Routing additions for `/model-audit/history` and `/model-audit/history/:id` look consistent. Once `/model-audit` (latest) and `/model-audit/:id` are added, ensure redirects and breadcrumbs are aligned.

- `src/app/src/components/Navigation.tsx`
  - Good addition of Model Audit dropdown with history and new scan entries. Add tests to verify keyboard/hit targets and active state on nested routes. Check mobile click/tap experience.

- `src/app/src/pages/model-audit/ModelAudit.tsx`
  - Success Alert with deep link on persisted scans is a nice touch. Consider showing a brief inline status/progress indicator while scan is running (pairs well with SSE later). Reconcile tests around preflight path checks.

- `src/app/src/pages/model-audit-history/ModelAuditHistory.tsx`
  - Solid DataGrid foundation. Add responsive column visibility/min widths, QuickFilter `aria-label`, and a kebab menu for utility actions on small screens. Consider debouncing quick filter when wired to server search.

- `src/app/src/pages/model-audit-history/page.tsx`
  - Container offset height logic is good; add safe-area bottom padding. Consider passing `focusQuickFilterOnMount` based on route context for faster search.

- `src/app/src/pages/model-audit-result/ModelAuditResult.tsx`
  - Add AbortController; switch to Blob download; add tooltips for long path and breadcrumb items; ensure code blocks don’t cause horizontal scroll.

- `src/server/routes/modelAudit.ts`
  - Implement Zod validation (queries/bodies/params). Add `/scans/latest`. Extend `/scans` for pagination/sort/search. Review error responses for consistency and minimal debug leakage in production.

- `src/models/modelAudit.ts`
  - Consider including `author`, `checks`, and `issues` in `toJSON()` or document why not. Ensure `hasErrors` is computed consistently in one place.

- `src/share.ts`
  - Update share URL to `/model-audit/:id` and add redirect handling for `/model-audit/scan/:id`.

- Tests (`*.test.tsx`)
  - Replace `jest` with `vi`. Update expectations to match actual UI strings and behavior. Add navigation tests for dropdown behavior and a test for the success alert linking to history.

---

## Suggested Follow-up PR Breakdown

1) Tests + Types + A11y
- Fix jest→vi in tests, align assertions, add AbortController to result page, add tooltips and aria labels.

2) API Contracts
- Add Zod schemas, `/scans/latest`, extend `/scans` params, and wire UI to server-side pagination/sort/search (with debounce).

3) Stores + Routes
- Split config vs history stores. Add `/model-audit/setup`, `/model-audit` (latest), `/model-audit/:id` alias; update breadcrumbs and nav.

4) Styling QA
- Responsive DataGrid tweaks, safe-area padding, toolbar compaction on XS, chip/hover contrasts.

5) Security/Debug
- Gate debug payloads in `/scan` behind a flag; redact sensitive info; unify truncation.

6) Telemetry + Docs
- Add telemetry events; update documentation and screenshots for new flows and Enterprise backends.

---

If you want line-precise annotations, I can add review comments directly in a code review tool or provide patch suggestions for any of the items above.

