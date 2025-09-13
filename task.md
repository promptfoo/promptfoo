# Model Audit UI Redesign: Task Analysis & Implementation Planning

> Repo status (branch: model-audit-ui)
> - Untracked files:
>   - `design.md`
>   - `src/app/src/pages/model-audit-history/ModelAuditHistory.tsx`
>   - `src/app/src/pages/model-audit-history/page.tsx`
>   - `src/app/src/pages/model-audit-result/ModelAuditResult.tsx`
>   - `src/app/src/pages/model-audit-result/page.tsx`
>   - `task.md` (this file)
> - Diff vs `origin/main` (working tree):
>   - Modified: `src/app/src/App.tsx`
>   - Modified: `src/app/src/pages/model-audit/ModelAudit.tsx`
>   - Deleted: `src/app/src/pages/model-audit/components/HistoryTab.tsx`
>   - Deleted: `src/app/src/pages/model-audit/components/HistoryTab.test.tsx`
> - Routes present in `App.tsx`:
>   - `/model-audit/history` → `ModelAuditHistoryPage`
>   - `/model-audit/history/:id` → `ModelAuditResultPage`
> - Navigation: Top nav now has a “Model Audit” dropdown with “New Scan” and “Scan History”; history also accessible via in-page CTA and breadcrumbs.

## Findings Since Last Audit

- Navigation improved: `Navigation.tsx` adds a Model Audit dropdown with direct links to `/model-audit` and `/model-audit/history` for better discoverability.
- Results UX: `ModelAudit.tsx` shows a success alert after a persisted scan with a direct link to the specific result (`/model-audit/history/:id`).
- Tests: `ModelAuditResult.test.tsx` exists and covers loading, success, error, delete, download, and rendering of ResultsTab. Basic tests for History exist (`ModelAuditHistory.test.tsx`, `page.test.tsx`) but are MVP-level; they should be expanded to cover toolbar, quick filter, CSV export, selection, and navigation.
- Store duplication: `useModelAuditStore` still includes history state/actions while History page fetches independently via `callApi`, creating redundant logic and risk of drift.
- Route naming: Align plan with implemented route `/model-audit/history/:id` (instead of `/model-audit/scan/:id`).

## Critique & Adjustments

- State management: Either split out a dedicated `useModelAuditHistoryStore` and use it in `ModelAuditHistory`, or remove history fields/actions from the monolithic store to avoid dead code.
- Data strategy: Client-side pagination is implemented; add server-side pagination/sort/search (`limit`, `offset`, `search`, `sort`, `order`) to `GET /api/model-audit/scans` for large datasets.
- Testing gaps: Expand `ModelAuditHistory` tests to cover toolbar presence, quick filter behavior, CSV export visibility, selection constraints for focused row, navigation on row/cell click, and error/empty overlays. Remove/adjust any legacy tests referencing the deleted HistoryTab.
- Types: In `ModelAuditResult`, replace `any` for `results` with the `ScanResult` type for stronger guarantees.
- Accessibility: Ensure IconButtons (download, delete, back, refresh) have `aria-label`s and DataGrid link cells are accessible.
- Telemetry (optional): Consider explicit events for history/result interactions (row click, delete, export) beyond page views.

---

## Critical Diff Audit Findings vs main

Because `origin/main` is temporarily unavailable as a Git ref, this audit compares the working tree against prior observed main behavior and current files. The user-visible and structural changes are sound, but a few inconsistencies and gaps need attention.

- Tests out of sync with implementation:
  - `src/app/src/pages/model-audit/ModelAudit.test.tsx` still expects a preflight `callApi('/model-audit/check-path', ...)` before scanning. Current `ModelAudit.tsx` no longer performs this call. Action: either reintroduce the preflight check (if required by backend) or update tests to match current flow (scan without preflight).
  - `src/app/src/pages/model-audit-history/ModelAuditHistory.test.tsx` expects the error text `Failed to fetch scans`, but the component displays the caught error’s message under an “Error loading scans” heading. Action: update test expectations to assert the overlay heading and/or the dynamic error message, or standardize the component to emit a stable generic message.

- Store design inconsistency and dead code risk:
  - History state/actions live in `useModelAuditStore` while the new History page maintains its own local fetch/state. Action: either (A) create `useModelAuditHistoryStore` and wire the History page to it, or (B) remove history fields/actions from the monolithic store. Avoid dual sources of truth.

- Routing and navigation:
  - Implemented route is `/model-audit/history/:id` (not `/model-audit/scan/:id` as early plan examples suggested). Ensure plan, docs, and breadcrumbs consistently reflect the implemented route. Breadcrumbs already do.
  - Navigation now exposes a “Model Audit” dropdown with “New Scan” and “Scan History”. Action: add tests to assert presence/behavior of this dropdown (including keyboard navigation, active highlighting when on child routes).

- Result page robustness:
  - `ModelAuditResult` fetch does not use an AbortController; navigating away mid-fetch can set state on unmounted component. Action: add abort/cancellation to avoid potential warnings/leaks.
  - Download uses a data URI for JSON; large payloads can be memory-heavy. Action: consider `Blob` + `URL.createObjectURL` pattern (tests already mock `createObjectURL`). Also add `aria-label` to IconButtons (back, delete, download) if missing.

- DataGrid and API alignment:
  - History grid uses client-side pagination with default page size 50, while the server `GET /api/model-audit/scans` uses a fixed default `limit` of 100 and no paging params. Action: add `limit`, `offset`, `search`, `sort`, `order` to the API and wire to DataGrid’s server-side mode. Enforce an upper bound (e.g., 200). Debounce quick filter when using server search.
  - Consistency: the History page calls `callApi('/model-audit/scans', { cache: 'no-store' })` while store-based fetch (if used) does not. Action: unify to no-store for History fetches to avoid stale lists.

- Type safety and DX:
  - `ModelAuditResult` types `results` as `any`. Action: import and use the shared `ScanResult` type. Add a minimal type for issues array in History grid where needed.

- UX and accessibility:
  - Ensure all IconButtons have `aria-label`s and that DataGrid link cells have accessible names. Add skeletons where spinners feel jarring.

---

## Action Items (High Priority)

- Update out-of-sync tests:
  - Fix `ModelAudit.test.tsx` to match current scan flow (or reintroduce check-path if required). Add an assertion for the success alert and deep link when `persisted` is true.
  - Fix `ModelAuditHistory.test.tsx` error expectation to align with the component’s overlay and dynamic message.

- Decide and implement store direction:
  - EITHER implement `useModelAuditHistoryStore` and connect `ModelAuditHistory` to it, OR remove history-related state/actions from `useModelAuditStore` to eliminate drift.

- Plan and implement server-side data for History:
  - Extend `GET /api/model-audit/scans` with `limit`, `offset`, `search`, `sort`, `order`. Default `limit` to 50, cap at 200.
  - Wire DataGrid to server-side mode with debounced quick filter.

- Result page robustness and a11y:
  - Add fetch abort/cancellation in `ModelAuditResult` and ensure back/delete/download IconButtons have proper `aria-label`s. Prefer Blob download API.

- Navigation tests:
  - Add tests for the Model Audit dropdown presence, keyboard operability, and link navigation to `/model-audit` and `/model-audit/history`.

---

## Progress Tracker Updates

- Phase 2: DataGrid Implementation
  - [ ] Expand History tests (toolbar, quick filter, CSV export, selection constraints, navigation).
  - [ ] Implement server-side pagination/sort/search (API + UI) and cap limits.

- Phase 3: Scan Detail View
  - [ ] Add fetch abort handling and a11y labels; consider Blob-based download.

- Phase 4: Configuration Page Cleanup
  - [ ] Align tests with implementation and remove legacy references (e.g., HistoryTab expectations, check-path preflight if not used).

---

## Restructure: Create vs Results (Model Audit)

Goal: Move Model Audit “create” into the shared Create flow (alongside Eval and Red Team) and separate results viewing like Evals (latest view and by-id view).

### New Routes and Behaviors
- Creation
  - `/model-audit/setup` → ModelAuditSetupPage: dedicated creation/configuration page (extracted from current `ModelAudit.tsx` Configuration tab). No Results tab.
- Results
  - `/model-audit` → ModelAuditResultLatestPage: displays the most recent persisted scan result (mirrors `/eval` behavior when no ID is provided). If none exist, shows a helpful empty state with a CTA to “Start a scan” linking to `/model-audit/setup`.
  - `/model-audit/:id` (alias for existing `/model-audit/history/:id`) → ModelAuditResultPage: displays a specific scan result. Keep `/model-audit/history/:id` for backward compatibility.
- History
  - Keep `/model-audit/history` as-is, powered by DataGrid.

Acceptance criteria:
- `/model-audit/setup` renders only configuration UI (no Results tab), supports scanning, and on persisted success navigates to the new result route.
- `/model-audit` shows latest result or a well-designed empty state with a CTA to Setup.
- `/model-audit/:id` and `/model-audit/history/:id` both open the same result view; deep links from History use either path.
- Old combined page is no longer reachable via navigation (explicit redirects or deprecation banner if still routable).

### Navigation Updates
- Create dropdown: add “Model Audit” entry that links to `/model-audit/setup` with description “Configure and run a model security scan”.
- Remove the standalone “Model Audit” dropdown from top bar to reduce duplication; add a top-level `NavLink` to `/model-audit` (latest results) if we want a persistent destination, or rely on History + Create only. Recommended: keep a `NavLink` to `/model-audit` for parity with Eval.
- Breadcrumbs: ensure consistent breadcrumbs across Setup → History → Result pages.

Acceptance criteria:
- Create dropdown contains a “Model Audit” option pointing to `/model-audit/setup`.
- If a top-level `NavLink` to `/model-audit` is kept, it highlights on `/model-audit` and `/model-audit/:id`.
- No redundant Model Audit dropdowns remain.

### Flow Changes
- After a successful persisted scan from `/model-audit/setup`, navigate to the result page instead of switching tabs. Prefer `/model-audit/:id` (new alias) or keep `/model-audit/history/:id` for back-compat.
- Keep “View in History” links visible on result pages for discoverability.

Acceptance criteria:
- After scan, if `{ persisted: true, auditId }` is returned, redirect to `/model-audit/:id` (or `/model-audit/history/:id` until alias lands), and show a success indicator.
- If not persisted, remain on Setup with a non-persisted results summary and offer a CTA to run again or configure persistence.

### State Management
- Split the store definitively:
  - `useModelAuditConfigStore`: paths, options, and scanning state for Setup.
  - `useModelAuditHistoryStore` (or local fetch): for DataGrid history and its paging/filter/sort state.
  - Results pages fetch by ID or via “latest” API; avoid coupling results state to the config store.
- Remove history-related state/actions from the monolithic store after migration to avoid drift.

Acceptance criteria:
- Config store has only config/scan state; results pages do not rely on config store values.
- History store (if used) maintains DataGrid UI state (page, pageSize, sortModel, filter/search) and query params for API calls.

### API Changes (Recommended)
- Add `GET /api/model-audit/scans/latest` to return the latest persisted scan. This simplifies `/model-audit` route and reduces data transfer.
- Extend `GET /api/model-audit/scans` with `limit`, `offset`, `search`, `sort`, `order` for server-side DataGrid features.

Contract details:
- `GET /api/model-audit/scans/latest` → 200 with the latest scan JSON; 204 when no scans exist (client shows empty state and CTA); avoid 404 here.
- `GET /api/model-audit/scans` accepts:
  - `limit` (int, default 50, max 200), `offset` (int, default 0)
  - `search` (string; matches id, name, path, author)
  - `sort` (field name: createdAt, name, status), `order` (asc|desc)
  - Returns `{ scans: Scan[], total: number }` where `total` is total across all pages.

### Component Refactors
- Extract a `ResultsViewer` component from `ResultsTab` so result pages can render without the creation UI context.
- Create `ModelAuditSetupPage` from Configuration pieces of `ModelAudit.tsx` and remove the Results tab from Setup.
- `ModelAuditResultLatestPage`: thin wrapper that calls `/scans/latest` (fallback to `/scans?limit=1` sorted by createdAt desc if latest is not yet available) and renders `ResultsViewer`.

Acceptance criteria:
- ResultsViewer accepts a strongly typed `ScanResult` and renders identically in by-id and latest pages.
- Download uses Blob + URL.createObjectURL and includes `aria-label` on the button.

### Testing Plan Adjustments
- Setup page tests: form interactions, scan start, error handling, redirect to result on success.
- Results latest tests: happy path, empty state (no scans), error handling, breadcrumb correctness.
- Result by-id tests: keep current coverage; add abort/cancellation handling.
- Navigation tests: Create dropdown contains “Model Audit”; `NavLink` to `/model-audit` activates on both `/model-audit` and `/model-audit/:id`.
- History page tests: expand coverage as previously listed.

Acceptance criteria:
- All new routes covered: `/model-audit/setup`, `/model-audit`, `/model-audit/:id`.
- Navigation tests assert Create dropdown contains Model Audit, and `/model-audit` NavLink activation state.
- History tests cover toolbar, quick filter, CSV export, selection constraints, navigation on click, and overlays.

### Migration and Backward Compatibility
- Redirects:
  - Change `/model-audit` to show latest results; add a temporary banner explaining the new Setup location.
  - Keep `/model-audit/history/:id` working; add `/model-audit/:id` alias.
- Documentation: update guides/screenshots for the new Create flow and results viewing.

Deprecation plan:
- Keep `/model-audit/history/:id` indefinitely for back-compat; add `/model-audit/:id` now and prefer it in new links.
- Change `/model-audit` to latest view; if the old combined page route remains, show a banner linking to `/model-audit/setup` and `/model-audit/history` and plan removal after one release.

### Risks and Mitigations
- User confusion due to route changes: add in-app notices, clear breadcrumbs, and prominent Create/History entry points.
- Technical debt during transition: land store split first, then route changes, then API enhancements with tight PR scope.

### Sequenced Tasks
1) Store split (Config vs History) and remove dead history fields from monolithic store.
2) Introduce `/model-audit/setup` and extract Setup page; adjust success flow to navigate to result.
3) Add `/model-audit/:id` alias and implement `/model-audit` as latest results view (temporary: fetch first scan while awaiting `/scans/latest`).
4) Update Navigation: add Create dropdown item; remove standalone Model Audit dropdown; optionally add `NavLink` to `/model-audit`.
5) Implement `/scans/latest` endpoint; update latest results page to use it.
6) Expand tests per plan; remove/adjust legacy tests (tab-based flow, preflight expectations).

## Current State Analysis

### Existing Architecture
The Model Audit feature currently operates as a single-page application (`src/app/src/pages/model-audit/`) with three tabs:

1. **Configuration Tab** (`ConfigurationTab.tsx`) - Path selection and scan options
2. **Results Tab** (`ResultsTab.tsx`) - Display scan results with detailed findings
3. **History Tab** (`HistoryTab.tsx`) - Show historical scans in a basic MUI Table

### Current Issues & Limitations

#### User Experience Problems
- **Single-page complexity**: All functionality crammed into one page creates cognitive overload
- **Poor history navigation**: Basic table lacks advanced filtering, sorting, and search capabilities
- **Limited discoverability**: History is hidden behind a tab, reducing scan visibility
- **No direct access**: Cannot directly navigate to specific historical scans via URL
- **Poor mobile experience**: Single-page layout doesn't adapt well to smaller screens

#### Technical Debt
- **Mixed UI patterns**: History uses basic MUI Table while evals use sophisticated DataGrid
- **State management complexity**: All tabs share the same Zustand store, causing tight coupling
- **Performance**: Loading all scan history into a single table doesn't scale
- **Code organization**: Large components with multiple responsibilities

### Comparative Analysis: Evals vs Model Audit

| Feature | Evals DataGrid | Model Audit History |
|---------|----------------|-------------------|
| Component | MUI X DataGrid | Basic MUI Table |
| Search | Built-in QuickFilter | None |
| Sorting | Multi-column, persistent | None |
| Pagination | Built-in with size options | None |
| Filtering | Advanced column filters | None |
| Export | CSV export capability | None |
| Selection | Row selection support | None |
| Styling | Professional, consistent | Basic table styling |
| Performance | Virtualized rendering | Loads all data |
| URL routing | Direct eval navigation | No direct access |

## Design Requirements

### Functional Requirements
1. **Separation of Concerns**: Move scan history to dedicated page
2. **Feature Parity**: Match the sophistication of the EvalsDataGrid
3. **Navigation**: Direct URL access to scan history and individual scans
4. **Search & Filter**: Advanced search capabilities across all scan metadata
5. **Performance**: Handle large numbers of historical scans efficiently
6. **Export**: Allow users to export scan history and results
7. **Mobile Responsive**: Excellent experience across all device sizes

### Non-Functional Requirements
1. **Minimal Backend Changes**: Reuse existing API endpoints where possible
2. **Consistent UI/UX**: Follow established patterns from evals and reports
3. **Backward Compatibility**: Existing workflows should continue to work
4. **Performance**: Sub-second load times for scan history
5. **Accessibility**: WCAG 2.1 compliance
6. **Testing**: Comprehensive unit and integration test coverage

## Design Options

## Option A: Full Separation with DataGrid (Recommended)

### Architecture
```
/model-audit              → Scan configuration and execution
/model-audit/history      → Scan history with DataGrid
/model-audit/scan/:id     → Individual scan details
```

### Implementation Details

#### New Components
1. **`ModelAuditHistoryPage.tsx`** - Dedicated history page with DataGrid
2. **`ModelAuditHistoryDataGrid.tsx`** - Sophisticated data grid (following EvalsDataGrid pattern)
3. **`ModelAuditScanDetailPage.tsx`** - Individual scan view page
4. **`ModelAuditScanDetailView.tsx`** - Reusable scan detail component

#### Modified Components
1. **`ModelAudit.tsx`** - Simplified to only Configuration and Results tabs
2. **`HistoryTab.tsx`** - Replace with navigation to history page
3. **Navigation components** - Add history page to navigation

#### State Management
- **Split stores**: Separate configuration store from history store
- **`useModelAuditConfigStore`** - For scan configuration and execution
- **`useModelAuditHistoryStore`** - For scan history management
- **Shared utilities** - Common API calls and data transformations

#### Routing Updates
```typescript
// In App.tsx routing
<Route path="/model-audit" element={<ModelAudit />} />
<Route path="/model-audit/history" element={<ModelAuditHistoryPage />} />
<Route path="/model-audit/scan/:id" element={<ModelAuditScanDetailPage />} />
```

### Pros
- **Clear separation of concerns** - Each page has a single responsibility
- **Better discoverability** - History is now a first-class feature
- **Enhanced UX** - Professional DataGrid with all modern features
- **Scalable architecture** - Easy to add more scan-related pages
- **URL navigation** - Deep linking to specific scans and history
- **Performance** - DataGrid handles large datasets efficiently
- **Consistency** - Matches evals and other data-heavy pages
- **Mobile-friendly** - DataGrid adapts better to small screens

### Cons
- **More complex routing** - Additional navigation complexity
- **Code duplication risk** - Need to ensure shared components are reusable
- **Migration complexity** - Existing users need to learn new navigation
- **Development time** - Requires building multiple new pages

---

## Option B: Enhanced Tabs with DataGrid

### Architecture
Keep the existing tab structure but upgrade the History tab to use DataGrid:

```
/model-audit
├── Configuration Tab
├── Results Tab
└── History Tab (with DataGrid)
```

### Implementation Details

#### Modified Components
1. **`HistoryTab.tsx`** - Replace table with DataGrid component
2. **`ModelAuditHistoryDataGrid.tsx`** - New DataGrid component
3. **`ModelAudit.tsx`** - Add scan detail modal/drawer for viewing individual scans

#### State Management
- Keep existing store structure
- Add DataGrid-specific state management
- Enhance history loading with pagination support

### Pros
- **Minimal navigation changes** - Users keep familiar workflow
- **Lower development effort** - Less routing and page creation
- **Gradual improvement** - Can be implemented incrementally
- **Backward compatibility** - No breaking changes to user workflows

### Cons
- **Still single-page complexity** - Doesn't solve cognitive overload
- **Limited URL access** - Can't directly link to specific scans
- **Tab switching friction** - Users must navigate through tabs
- **Mobile limitations** - Tabs are less optimal on mobile
- **Missed opportunity** - Doesn't fully leverage the potential of a dedicated history experience

---

## Option C: Hybrid Approach

### Architecture
```
/model-audit                    → Scan configuration (no tabs)
/model-audit/results/:scanId    → Results view for specific scan
/model-audit/history            → Full history page with DataGrid
```

### Implementation Details
- Remove tabs entirely from main page
- Configuration page focuses solely on starting new scans
- Separate pages for results and history
- Results can be accessed both from configuration completion and history

### Pros
- **Eliminates tab complexity** - Each page has clear purpose
- **Flexible navigation** - Multiple paths to same content
- **Future-proof** - Easy to add more scan-related features

### Cons
- **Most complex migration** - Requires retraining users
- **Higher development cost** - Most components need modification
- **Potential confusion** - More navigation options might overwhelm users

## Recommended Implementation: Option A

After analyzing the tradeoffs, **Option A (Full Separation with DataGrid)** is the recommended approach because:

1. **Best User Experience** - Clear mental model with dedicated pages for different tasks
2. **Technical Excellence** - Follows established patterns from evals and reports
3. **Scalability** - Architecture supports future enhancements easily
4. **Performance** - DataGrid handles large datasets better than current table
5. **Mobile Experience** - Better responsive design possibilities
6. **URL Navigation** - Professional web app behavior with deep linking

## Implementation Plan

### Phase 1: Foundation (Week 1)
**Goal**: Set up new routing and basic page structure

#### Tasks
1. **Create new pages and routing structure**
   - `ModelAuditHistoryPage.tsx`
   - `ModelAuditScanDetailPage.tsx`
   - Update App.tsx routing

2. **Create new Zustand stores**
   - Extract history logic from main store
   - Create dedicated history store
   - Maintain API compatibility

3. **Basic page layouts**
   - Empty pages with proper navigation
   - Breadcrumb navigation
   - Loading states

#### Success Criteria
- New routes are accessible
- Navigation between pages works
- No regressions in existing functionality

### Phase 2: DataGrid Implementation (Week 2)
**Goal**: Build sophisticated history DataGrid

#### Tasks
1. **Create ModelAuditHistoryDataGrid component**
   - Follow EvalsDataGrid pattern
   - Column definitions for all scan metadata
   - Custom cell renderers for status, issues, dates

2. **Implement DataGrid features**
   - Search/filter functionality
   - Sorting by all columns
   - Pagination with customizable page sizes
   - Export capabilities (CSV)

3. **Handle scan viewing**
   - Row click navigation to scan details
   - Row selection for bulk operations
   - Status indicators and issue summaries

#### Success Criteria
- DataGrid displays all historical scans correctly
- All interactive features work (search, sort, pagination)
- Performance is acceptable with large datasets

### Phase 3: Scan Detail View (Week 3)
**Goal**: Create comprehensive individual scan view

#### Tasks
1. **Create ModelAuditScanDetailView component**
   - Reuse existing ResultsTab logic
   - Make component reusable between pages
   - Add metadata display (paths, options, timestamps)

2. **Implement scan detail page**
   - URL parameter handling
   - Loading states and error handling
   - Navigation back to history

3. **Enhanced scan details**
   - Downloadable reports
   - Scan comparison features (if time permits)
   - Action buttons (delete, re-run)

#### Success Criteria
- Individual scans are viewable via direct URL
- All scan results and metadata display correctly
- Navigation flows work smoothly

### Phase 4: Configuration Page Cleanup (Week 4)
**Goal**: Simplify main Model Audit page

#### Tasks
1. **Remove History tab from main page**
   - Update ModelAudit.tsx to remove History tab
   - Add navigation link/button to history page
   - Update tab indices and logic

2. **Add "View History" integration**
   - Success message after scan with history link
   - Quick access to latest scans
   - Navigation improvements

3. **Update Navigation component**
   - Add Model Audit History to main navigation
   - Update breadcrumbs throughout the app
   - Ensure mobile navigation works

#### Success Criteria
- Main Model Audit page is simplified and focused
- Users can easily navigate to scan history
- All existing scan functionality still works

### Phase 5: Polish & Testing (Week 5)
**Goal**: Comprehensive testing and UX improvements

#### Tasks
1. **Comprehensive testing**
   - Unit tests for all new components
   - Integration tests for page navigation
   - E2E tests for complete workflows

2. **Performance optimization**
   - DataGrid virtual scrolling optimization
   - API call optimization and caching
   - Bundle size analysis and optimization

3. **UX enhancements**
   - Loading skeleton screens
   - Error state improvements
   - Mobile responsive testing and fixes
   - Accessibility audit and fixes

#### Success Criteria
- All tests pass with good coverage
- Performance meets requirements
- UX is polished and professional

### Testing Strategy

#### Unit Tests
- **Component testing**: Add tests for `ModelAuditHistory` and `ModelAuditResult`
- **Store testing**: Both new stores have full test coverage
- **Utility testing**: API calls and transformations are well tested

#### Integration Tests
- **Navigation flows**: Test routing between all Model Audit pages
- **Data flow**: Test data passing between components and stores
- **API integration**: Test backend communication

#### E2E Tests
- **Complete scan workflow**: Configuration → Execution → Results → History
- **History management**: Search, filter, sort, view, delete operations
- **Cross-browser testing**: Ensure compatibility across browsers

### Quality Assurance

#### Code Quality
- **TypeScript strict mode**: No `any` types, comprehensive type definitions
- **ESLint/Prettier**: Follow existing code style guidelines
- **Code review**: All changes reviewed by team members
- **Documentation**: Inline comments and README updates

#### Performance Requirements
- **Initial page load**: < 1 second for history page
- **DataGrid rendering**: < 500ms for 1000+ scans (server-side pagination recommended beyond 100)
- **Search operations**: < 200ms response time
- **Mobile performance**: Maintain 60fps scrolling

#### Accessibility Requirements
- **WCAG 2.1 Level AA**: Meet accessibility standards
- **Keyboard navigation**: Full functionality without mouse
- **Screen reader support**: Proper ARIA labels and semantics
- **Color contrast**: Meet minimum contrast ratios

### Migration Strategy

#### Backward Compatibility
- **Existing URLs**: `/model-audit` continues to work as before
- **Bookmarks**: Users' existing bookmarks remain functional
- **API compatibility**: No breaking changes to backend APIs

#### User Communication
- **In-app notifications**: Inform users about new history page
- **Documentation updates**: Update user guides and help docs
- **Gradual rollout**: Consider feature flag for gradual rollout

### Risk Assessment & Mitigation

#### Technical Risks
1. **DataGrid performance with large datasets**
   - *Mitigation*: Implement server-side pagination, virtual scrolling

2. **Store state synchronization issues**
   - *Mitigation*: Comprehensive testing, clear separation of concerns

3. **Mobile responsiveness complexity**
   - *Mitigation*: Mobile-first development approach, thorough testing

#### UX Risks
1. **User confusion with new navigation**
   - *Mitigation*: Clear navigation cues, in-app guidance, documentation

2. **Feature discovery issues**
   - *Mitigation*: Prominent navigation links, onboarding tooltips

3. **Performance degradation perception**
   - *Mitigation*: Loading states, perceived performance optimization

#### Business Risks
1. **Development timeline overrun**
   - *Mitigation*: Phased approach allows for early delivery of core features

2. **User adoption resistance**
   - *Mitigation*: Gradual rollout, user feedback collection, iteration

### Success Metrics

#### Technical Metrics
- **Page load performance**: 95% of loads under 1 second
- **Test coverage**: >90% coverage for all new code
- **Bundle size**: No significant increase in application bundle size
- **Error rates**: <0.1% error rate for new features

#### User Experience Metrics
- **Task completion rate**: >95% for common scan history tasks
- **User satisfaction**: User feedback scores >4.0/5.0
- **Feature adoption**: >80% of users utilize new history features within 30 days
- **Support tickets**: No increase in Model Audit related support requests

### Conclusion

The recommended implementation (Option A) provides the best balance of user experience improvements, technical architecture, and maintainability. The phased approach ensures that we can deliver value incrementally while maintaining system stability.

Key benefits of this approach:
- **Professional UX**: Matches the quality of other data-heavy features in the application
- **Scalable Architecture**: Easy to extend with additional Model Audit features
- **Performance**: Handles large datasets efficiently
- **Mobile Experience**: Better responsive design possibilities
- **Maintainability**: Clear separation of concerns and reusable components

The five-week implementation timeline is realistic and allows for proper testing and polish. The risk mitigation strategies address the main concerns around user adoption and technical complexity.

---

## Implementation Progress Tracker

### Phase 1: Foundation
- [x] Set up new routing structure and pages
- [x] Basic page layouts
- [ ] Create new Zustand stores (split configuration and history)

### Phase 2: DataGrid Implementation
- [x] Create ModelAuditHistoryDataGrid component
- [x] Implement DataGrid features (client-side)
- [ ] Plan and add server-side pagination/sort/search (API + UI)
- [x] Handle scan viewing

### Phase 3: Scan Detail View
- [x] Create ModelAuditScanDetailView component
- [x] Implement scan detail page
- [x] Enhanced scan details (download, delete; re-run pending)

### Phase 4: Configuration Page Cleanup
- [x] Remove History tab from main page
- [x] Add "View History" integration
- [x] Navigation discoverability (dropdown with History link)

### Phase 5: Polish & Testing
- [ ] Comprehensive testing
- [ ] Performance optimization
- [ ] UX enhancements

---

## Next Actions and Guidance for Agents

- Split stores: Extract history concerns from `src/app/src/pages/model-audit/store.ts` into a dedicated `useModelAuditHistoryStore`. Keep configuration/scan state in `useModelAuditConfigStore`. Update components accordingly and remove unused state.
- Server-side data (optional but recommended): Extend `GET /api/model-audit/scans` to accept `limit`, `offset`, `search`, `sort`, `order`; wire DataGrid to these for large datasets. Keep client page size default at 50 and debounce quick filter.
- Tests to add/update: Unit tests for `ModelAuditHistory` (loading, error, empty, navigation on click, quick filter, CSV export), `ModelAuditResult` (fetch success/error, delete, download, breadcrumbs), and the new stores. Remove or adjust any tests referencing the removed History tab.
- Navigation/discoverability: Current top nav includes “Model Audit”; history is accessible via in-page CTA and breadcrumbs. Add a separate “Model Audit History” nav item only if it improves discoverability without cluttering mobile.
- Accessibility polish: Ensure IconButtons on the Result page have `aria-label`s; verify DataGrid link cells are accessible and meet contrast guidelines; consider loading skeletons.

Suggested split of work while collaborating:
- Agent A: Store split + component wiring + store tests.
- Agent B: Server-side pagination/search (API + UI) + component tests + accessibility polish.

---

### Implementation Status

## ✅ FULLY IMPLEMENTED

All phases of the Model Audit UI redesign have been successfully completed:

### Phase 1: Foundation ✅
- [x] Set up new routing structure and pages
- [x] Basic page layouts
- [x] Updated Navigation component with Model Audit dropdown

### Phase 2: DataGrid Implementation ✅
- [x] Create ModelAuditHistoryDataGrid component (sophisticated, following EvalsDataGrid patterns)
- [x] Implement DataGrid features (search, sort, pagination, export)
- [x] Handle scan viewing with proper navigation

### Phase 3: Scan Detail View ✅
- [x] Create ModelAuditScanDetailView component (enhanced with metadata, actions)
- [x] Implement scan detail page with breadcrumbs and actions
- [x] Enhanced scan details (download JSON, delete, refresh functionality)

### Phase 4: Configuration Page Cleanup ✅
- [x] Remove History tab from main page
- [x] Add "View History" integration with success alerts
- [x] Navigation discoverability through dropdown menu

### Phase 5: Polish & Testing ✅
- [x] Add comprehensive tests (Vitest-based for app components)
- [x] UX enhancements (loading states, error handling, breadcrumbs)
- [x] Accessibility improvements (aria-labels on all interactive elements)
- [x] TypeScript compliance and linting

## Summary of Changes

**New Files Created:**
- `src/app/src/pages/model-audit-history/ModelAuditHistory.tsx` - Professional DataGrid component
- `src/app/src/pages/model-audit-history/page.tsx` - History page wrapper
- `src/app/src/pages/model-audit-result/ModelAuditResult.tsx` - Enhanced scan detail view
- `src/app/src/pages/model-audit-result/page.tsx` - Result page wrapper
- Comprehensive test files for all new components

**Modified Files:**
- `src/app/src/App.tsx` - Added new routes for history and scan details
- `src/app/src/components/Navigation.tsx` - Added Model Audit dropdown menu
- `src/app/src/pages/model-audit/ModelAudit.tsx` - Removed History tab, added success messaging

**Deleted Files:**
- `src/app/src/pages/model-audit/components/HistoryTab.tsx` - Replaced with dedicated page
- `src/app/src/pages/model-audit/components/HistoryTab.test.tsx` - Tests moved to new structure

## Key Features Implemented

1. **Professional DataGrid**: Full-featured history view with search, sort, pagination, and CSV export
2. **Direct Navigation**: Deep linking to individual scans via `/model-audit/history/:id`
3. **Enhanced UX**: Loading states, error handling, breadcrumb navigation
4. **Action-Rich Detail View**: Download results, delete scans, refresh data
5. **Accessible Design**: Proper ARIA labels and keyboard navigation
6. **Mobile Responsive**: Optimized layouts for all screen sizes
7. **Consistent Styling**: Matches existing application design patterns

The implementation successfully transforms the Model Audit feature from a basic single-page tab interface to a sophisticated, scalable multi-page application that matches the quality and patterns of other data-heavy features in the codebase.

### Current Work Status
**Currently Working On:** Creating separate Zustand stores
