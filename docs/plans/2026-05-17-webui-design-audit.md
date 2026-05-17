# Promptfoo WebUI Design Audit

Date: 2026-05-17
Workspace: `/Users/mdangelo/.codex/worktrees/ad5a/promptfoo`

## Audit Goal

Review the React WebUI end to end for:

- Desktop readability and data visibility
- Horizontal and vertical overflow risk
- Accessibility and keyboard support
- Responsive behavior at medium and large widths
- Visual polish and consistency
- Data loading, caching, perceived performance, and efficiency
- Labels, wayfinding, and interaction clarity

This pass combined:

- Route and component inventory from `src/app/src/App.tsx`, shared route constants, and page/component directories
- Source review of page shells, data-heavy widgets, dialogs, media, reports, eval flows, and red-team setup flows
- Parallel sub-audits on route coverage, layout/data components, and accessibility/interaction patterns
- Live browser traversal at a 1440x900 desktop viewport against the local app and API

## Runtime Notes

- Frontend: `http://localhost:3000/`
- API: `http://localhost:15500`
- `npm run dev` starts the app successfully, but the watch-mode server path hit `EMFILE: too many open files, watch`
- Runtime QA used the non-watch server path instead: `npx tsx src/server/index.ts`

## Coverage Summary

### Live top-level routes visited

| Route                           | Observed state                                                 |
| ------------------------------- | -------------------------------------------------------------- |
| `/`                             | Redirected to `/eval`                                          |
| `/eval`                         | Live results page with populated eval detail                   |
| `/evals`                        | Populated evaluations table                                    |
| `/history`                      | Populated history table                                        |
| `/media`                        | Populated media library                                        |
| `/prompts`                      | Populated prompts table                                        |
| `/datasets`                     | Populated datasets table                                       |
| `/model-audit`                  | Empty-state latest page                                        |
| `/model-audits`                 | Empty-state history page                                       |
| `/model-audit/setup`            | Setup page                                                     |
| `/redteam/setup#0` through `#5` | All wizard steps visited; initial setup modal remained visible |
| `/reports`                      | Populated red-team reports index                               |
| `/reports?evalId=...`           | Live report detail page visited                                |
| `/setup`                        | Eval creation flow                                             |
| `/login`                        | Redirected to `/eval` in the current authenticated local state |
| `/does-not-exist`               | 404 page                                                       |

### Source-audited but not fully live-exercised

- `/launcher`: conditionally mounted only when `VITE_PROMPTFOO_LAUNCHER` is enabled
- Model Audit result detail with a real scan: no scans existed in this local state
- Login form itself: current app state redirected away
- Several deep modal branches and destructive flows were reviewed from source rather than opened live

### Live evidence worth keeping in mind

- `/reports` detail page rendered as a very long single-scroll report surface: document scroll height was roughly `10354px` at `1440x900`
- `/reports` index rendered `410` table body rows with an unconstrained internal table container, unlike other table pages that stayed bounded and virtualized
- `/media` eval filter trigger did not open on `ArrowDown`
- `/eval` primary search input had no explicit accessible name beyond placeholder text
- Repeated top-level route checks at `1440x900` showed no document-level horizontal overflow on the audited screens

## Addressed In This Branch

This implementation pass resolves the most actionable findings from the audit:

- `/reports` now uses a bounded flex layout so shared table virtualization stays active, with a direct regression test that renders the real reports stack against 240 rows
- `/media` evaluation filtering now has durable accessible naming, arrow-key traversal, active-descendant state, Escape handling, clear-button labeling, and click-open focus that lands directly in the search field
- Shared data-table loading, empty, and error states now expose clearer live-region semantics, while header action clusters reappear on keyboard focus as well as hover
- `/eval`, red-team setup search surfaces, and reusable search controls now provide stronger accessible names and context-aware clear-button labels
- Datasets, prompts, and model-audit history now expose explicit row-level actions instead of relying entirely on opaque whole-row activation
- Eval sticky-header math and footer sizing were hardened against banner-visible desktop layouts and nested-width overflow risk
- Result charts and red-team flow visualizations now expose labeled regions, concise non-visual summaries, and a keyboard-reachable comparison action
- The app shell now provides a focusable skip link, and Model Audit routes have route-specific page metadata

Still worth treating as follow-up work rather than hiding inside this PR:

- Broader query caching policy changes should be handled deliberately; the currently centralized production query surface is still too small to justify speculative app-wide defaults
- Model Audit dense-result QA still deserves a live pass with real scan data
- The red-team setup onboarding/modal flow, long-form report navigation, and richer desktop text-expansion behavior remain meaningful design opportunities

## Priority Findings

### P1. `/reports` loses the shared table virtualization/performance benefits

Files:

- `src/app/src/pages/redteam/report/components/ReportIndex.tsx`
- `src/app/src/pages/redteam/report/components/ReportsTable.tsx`
- `src/app/src/components/data-table/data-table.tsx`

What I observed:

- `/reports` rendered `410` table rows in the DOM at once
- The inner table scroll container measured roughly `27456px` tall
- Comparable pages such as `/evals`, `/history`, `/prompts`, and `/datasets` stayed in a bounded container and only rendered a small virtualized window

Why it matters:

- The reports index is likely slower than the other data tables as history grows
- It forfeits one of the strongest shared-system optimizations already present elsewhere
- The page behaves more like a full-document mega-table than a focused desktop work surface

Recommendations:

1. Refactor `/reports` to the same fixed/flex page shell pattern used by `/evals`, `/history`, `/prompts`, and `/datasets`
2. Constrain the table host height so virtualization can work as intended
3. Keep page-level actions and context visible while rows scroll inside the data region
4. Consider preserving search/filter/table toolbar position on long report lists

### P1. The media eval filter looks like a combobox but does not behave like one

Files:

- `src/app/src/pages/media/components/MediaFilters.tsx`
- `src/app/src/components/ui/combobox.tsx`

Live confirmation:

- The eval filter trigger stayed closed when pressed with `ArrowDown`
- The DOM surfaced `role="combobox"` with `aria-expanded="false"` and `aria-controls="eval-filter-listbox"`, but without the stronger keyboard model used by the shared combobox primitive

Why it matters:

- Keyboard expectations are broken
- Screen-reader semantics promise more than the widget delivers
- This is a dense, frequently reused filter in one of the busiest pages

Recommendations:

1. Replace the bespoke popover/listbox hybrid with the shared combobox primitive, or bring it to parity
2. Support open-on-arrow, active descendant management, Escape behavior, and predictable option selection
3. Give the trigger a real accessible name independent of current visible text
4. Add keyboard regression coverage for closed-trigger navigation, option traversal, and selection

### P1. Shared table header actions are visually hidden while still carrying important controls

Files:

- `src/app/src/components/data-table/data-table.tsx`

Live/source evidence:

- Header action clusters render with `opacity: 0` and `pointer-events: none` at desktop sizes until hover
- Live inspection on `/evals` found several action clusters in that hidden state
- Sort is visually attached to the `<th>` region rather than exposed as an always-obvious, focusable control

Why it matters:

- Keyboard discoverability suffers
- Important affordances feel mouse-first
- Dense data pages are exactly where desktop users should not have to hunt for controls

Recommendations:

1. Keep sort/filter action affordances visible on focus-within, not just hover
2. Ensure the primary sort target is keyboard-focusable and described consistently
3. Recheck whether invisible header controls can receive focus in awkward sequences
4. Consider a clearer persistent affordance for sorted/unsorted states on desktop tables

### P1. Clickable/focusable table rows act like controls but remain semantically weak

Files:

- `src/app/src/components/data-table/data-table.tsx`
- Consumers such as:
  - `src/app/src/pages/datasets/Datasets.tsx`
  - `src/app/src/pages/prompts/Prompts.tsx`
  - `src/app/src/pages/model-audit-history/ModelAuditHistory.tsx`

Observed:

- Rows are keyboard-activatable with Enter/Space and row click handlers
- Live click on the first prompts row opened the detail dialog correctly
- However, the row itself is still exposed as a table row, not a clear action object

Why it matters:

- Screen-reader users may not be told that activation exists or what it does
- Mouse, keyboard, and assistive-tech semantics drift apart

Recommendations:

1. Prefer an explicit link/button inside the primary column for the main action
2. If row activation remains, expose the action more clearly with consistent semantics and naming
3. Avoid relying on “the whole row is clickable” as the only discoverable affordance

### P1. Search and filter controls are not labeled consistently enough

Files:

- `src/app/src/components/ui/search-input.tsx`
- `src/app/src/pages/eval/components/ResultsView.tsx`
- `src/app/src/pages/media/components/MediaFilters.tsx`
- `src/app/src/pages/redteam/setup/components/PluginsTab.tsx`
- `src/app/src/pages/redteam/setup/components/Targets/ProviderTypeSelector.tsx`

Live/source evidence:

- `/eval` rendered a visible `Search...` field with no explicit accessible name beyond placeholder text
- Source review found the same shared pattern reused in multiple dense filtering surfaces
- Some icon-only clear buttons in those flows also lack clear labels

Why it matters:

- Placeholder text is not a durable label
- Voice and screen-reader navigation become ambiguous
- Dense filtering surfaces lose a lot of polish when names are inconsistent

Recommendations:

1. Make the shared search primitive require or derive a durable accessible label
2. Standardize clear buttons with contextual `aria-label`s
3. Prefer visible labels or persistent assistive names over placeholder-only meaning
4. Add form-control QA that checks both visible and accessible naming

### P2. Loading, empty, and error states are not consistently announced

Files:

- `src/app/src/components/data-table/data-table.tsx`
- Page-level async consumers across eval, report, model audit, and red-team flows

Pattern:

- Visually, many states are clear
- Programmatically, shared states often lack `role="status"`, `role="alert"`, or a region-level `aria-busy`

Why it matters:

- Sighted users see the transition immediately
- Assistive tech may not announce fetch progress, failure, or empty results

Recommendations:

1. Add region-level `aria-busy` during background refresh
2. Use polite live regions for loading and result-count changes where appropriate
3. Use alert semantics for failures that require action
4. Standardize this inside shared primitives rather than patching page by page

### P2. The eval sticky header and pagination footer have desktop fragility risks

Files:

- `src/app/src/pages/eval/components/ResultsTable.css`
- `src/app/src/pages/eval/components/ResultsTable.tsx`
- `src/app/src/components/UpdateBanner.tsx`

Findings:

- Sticky header offset accounts for nav height, but source review suggests it may not always account for the dynamic update banner height
- The pagination footer uses `w-screen -mx-4`, which did not overflow at `1440px` in the current live page, but remains a fragile sizing approach inside padded layouts

Why it matters:

- Sticky UI tends to fail only in specific banner/viewport states, then visibly overlaps
- `100vw` inside nested content often causes near-miss or 1px overflow bugs

Recommendations:

1. Compute sticky top offset from the same nav-plus-banner token used by fixed page shells
2. Replace `w-screen` with container-relative sizing where possible
3. Regression-test banner-visible eval pages and narrow desktop widths
4. Keep pagination/footer controls inside the same layout system as the rest of the results page

### P2. Charts and visualized flows need stronger non-pointer access

Files:

- `src/app/src/pages/eval/components/ResultsCharts.tsx`
- `src/app/src/pages/redteam/report/components/PluginStrategyFlow.tsx`

Concerns:

- Canvas-based charts lack obvious fallback summaries or alternate accessible representations
- The scatter comparison interaction is click-heavy
- The Sankey-like red-team flow appears pointer/hover dependent

Recommendations:

1. Provide text summaries, tabular fallbacks, or accessible data summaries adjacent to charts
2. Make chart-triggered comparison actions keyboard reachable
3. Expose meaningful labels and descriptions for chart regions
4. Give dense visual reports an alternate “data view” when the visualization is not the easiest way to inspect details

### P2. The shell lacks a skip-to-content path

Files:

- `src/app/src/components/PageShell.tsx`
- `src/app/src/components/Navigation.tsx`

Finding:

- The app has persistent sticky navigation and dense page toolbars
- There is no obvious skip link or dedicated main-content anchor

Recommendations:

1. Add a visible-on-focus skip link
2. Give `<main>` a stable target id
3. Use that same anchor for keyboard shortcuts or jump navigation where helpful

### P2. Model Audit route titles are too generic

Live observation:

- `/model-audit`
- `/model-audits`
- `/model-audit/setup`

All presented a generic document title of `promptfoo` during this pass.

Why it matters:

- Browser tabs are less useful
- Back/forward task switching gets harder
- It creates inconsistency with the rest of the app, which generally uses route-specific titles

Recommendations:

1. Add route-specific page metadata for the Model Audit surfaces
2. Align with existing `usePageMeta` usage in other sections

## Page-by-Page Design Notes

### `/eval` and `/eval/:evalId`

Strengths:

- Strong desktop density for advanced users
- Action clusters are compact and consistent
- Search, filters, columns, and table settings are all close at hand

Issues and opportunities:

- Search lacks a durable accessible label
- Results controls are dense enough that shortcut support would materially help
- Sparse result sets leave a large empty lower viewport before the sticky footer, which feels visually underused
- Charts and report toggles need stronger accessibility and keyboard review
- Consider clearer hierarchy between eval metadata, filter controls, and primary results actions

Recommendations:

- `/` to focus search
- `Shift+/` or a visible shortcut hint surface for table commands
- Better grouping of destructive or low-frequency eval actions
- Optional compact/comfortable density preset for high-information tables

### `/evals`, `/history`, `/prompts`, `/datasets`

Strengths:

- Shared fixed-shell pattern works well on desktop
- Table virtualization is doing real work
- Dialog details for prompt/dataset records are structured and bounded

Issues and opportunities:

- Shared DataTable semantics and hidden header controls affect all of them
- Repeated fixed-width columns can still hide too much useful context in desktop work
- Row-click semantics need an accessible action model
- Search/filter/column tools could be more uniform from page to page

Recommendations:

- Add column-priority defaults per page rather than one generic density profile
- Let high-value text columns grow more intelligently at wide widths
- Provide table presets such as “Compact”, “Review”, and “Export prep”
- Move export affordances to a more consistent position across list pages

### `/media`

Strengths:

- Visually polished gallery
- Dense but readable grid at 1440px
- Clear status chips and bulk-action framing

Issues and opportunities:

- Eval filter keyboard model is incomplete
- Selection controls use repeated generic names in source
- Cards can become visually repetitive when many items share similar media preview silhouettes
- Metadata is heavily truncated, which makes comparison slower on desktop

Recommendations:

- Fix combobox semantics and keyboard behavior
- Make selection labels item-specific
- Add a list/table mode for review-heavy media work
- Consider richer hover/focus reveal for secondary metadata
- Persist user-selected media sort/filter state more intentionally

### `/reports` and report detail

Strengths:

- Report detail is information-rich and serious
- The index page title and framing are strong

Issues and opportunities:

- The reports table currently misses the shared constrained-table/virtualization benefits
- Report detail becomes a very tall linear page; useful, but hard to scan
- Flow visualizations need non-pointer and non-visual fallbacks

Recommendations:

- Fix the table host layout first
- Add a sticky report outline or section jump nav on detail pages
- Consider “Findings”, “Strategies”, “Frameworks”, and “Appendix” anchors
- Add progressive disclosure for very long report sections
- Keep filters and sort state sticky while reviewing many reports

### `/redteam/setup#0..#5`

Strengths:

- Strong step structure
- Clear wizard framing
- The UI already separates target configuration, app definition, plugins, strategies, and review

Issues and opportunities:

- The first-run onboarding modal covers the active step on every hash route until dismissed
- Dense setup screens would benefit from better “where am I / what changed” feedback
- Filter-pill state needs stronger programmatic selection semantics in some source-audited areas
- Load/save flows still have visible signs of imperative state refresh patterns

Recommendations:

- Consider making first-run onboarding a more obviously one-time guided layer
- Add a reviewable change summary before run/submit
- Offer step-local shortcut hints only where they speed real work
- Avoid full-page reloads after loading config where possible

### `/model-audit`, `/model-audits`, `/model-audit/setup`

Strengths:

- Clear task framing
- Good use of setup/result empty states

Issues and opportunities:

- Route titles are too generic
- Without real scan data, detail-density QA remains incomplete
- Some status indicators are icon-heavy and deserve a final screen-reader naming pass

Recommendations:

- Add page-specific metadata
- Revisit detail screens with a real dense scan payload
- Align the fixed-shell/page-container patterns with other list-heavy areas where useful

### `/setup`

Strengths:

- Strong multi-step creation model
- UI/YAML split is a smart affordance for mixed-skill users

Issues and opportunities:

- The flow is information-dense and can feel visually heavy
- Sidebar progress and content area should continue to be checked at laptop widths
- Repeated dialog patterns are polished, but focus recovery and invalid-field focus should stay consistent

Recommendations:

- Consider a more prominent readiness summary
- Cache provider config status and other supporting fetches more deliberately
- Keep the UI/YAML state transitions very explicit so users do not feel they are editing two separate truths

### Global shell, navigation, and overlays

Recommendations:

- Add skip link support
- Audit tab order from global nav into page content
- Keep icon-only buttons consistently named and tooltipped
- Revisit fixed header/footer math whenever banners or alert rails are visible
- Standardize modal sizing and scroll-body patterns even further across the app

## Performance, Caching, and Efficiency Recommendations

### Data loading

The app mixes:

- Shared React Query usage in a few places
- Page-local `useEffect` plus manual `callApi()` fetch state across many list/report/setup surfaces

Recommendations:

1. Establish app-level `QueryClient` defaults for retry, stale time, focus refetch policy, and garbage collection tuned to this UI
2. Move stable list reads and read-mostly supporting lookups toward shared query hooks
3. Prefer background refresh that preserves prior results instead of hard loading resets on every navigation/filter refresh
4. Prefetch common follow-up surfaces:
   - Prompt/dataset detail payloads from visible rows
   - Report detail after hover/focus or first table interaction
   - Media deep-link detail on card focus
5. Add a lightweight caching policy table for major resource families:
   - history/results
   - reports
   - media library
   - scanner catalogs
   - provider config status

### Rendering

Recommendations:

1. Fix `/reports` first; it is the clearest missed virtualization win
2. Lazy-load the heaviest chart/report branches when not immediately visible
3. Keep rich dialogs mounted only when needed
4. Continue using virtualization for large tables and long media/report result sets
5. Audit expensive hover previews and media thumbnails for unnecessary eager work

### Perceived speed

Recommendations:

1. Add compact refresh-state messaging instead of blanking content
2. Preserve scroll position where users are reviewing large collections
3. Use skeletons selectively; for re-fetches, “updating” is often better than a full skeleton reset
4. Consider route-local optimistic state for small metadata edits where rollback is simple

## Keyboard and Shortcut Recommendations

Prioritize shortcuts that reduce repetitive desktop work:

- `/` focus primary page search
- `Esc` close filter popovers, detail dialogs, and media overlays consistently
- `g` then `e/h/m/r` style jump commands only if a command system already exists or is planned
- Arrow-key parity for custom grid/list navigators
- Enter/Space consistency for row and card activation
- Shortcut discoverability through tooltips or a small command palette, not inline instructional clutter

## Visual Polish Recommendations

1. Make dense pages feel less same-weight:
   - Stronger section hierarchy
   - More deliberate spacing between metadata rails and action rails
   - Slightly better contrast between “context” and “command” areas
2. Reduce over-truncation on desktop:
   - Let the most semantically important text expand when room exists
   - Offer tooltips or inline reveal only where truncation is unavoidable
3. Add scan-friendly summary rails:
   - report summaries
   - eval outcome summaries
   - media collection summaries
4. Normalize surface treatment:
   - card borders
   - header gradients
   - dialog scroll bodies
   - empty-state density
5. Recheck extremely long forms and reports with fixed/sticky aids rather than relying solely on page length

## Recommended Next Passes

1. Fix and regression-test `/reports` table containment/virtualization
2. Bring `/media` filters to real combobox semantics
3. Harden shared DataTable keyboard/focus behavior and actionable-row semantics
4. Standardize search labels, clear-button labels, and async live-region semantics
5. Audit chart accessibility and report flow visualizations with a keyboard-only pass
6. Add model-audit page titles and revisit those screens with real dense data

## Screenshot Artifacts

Saved during the live audit:

- `/private/tmp/promptfoo-webui-audit-eval.png`
- `/private/tmp/promptfoo-webui-audit-media.png`
- `/private/tmp/promptfoo-webui-audit-report-detail.png`
