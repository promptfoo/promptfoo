# PR #5595: Model Audit Multi-Page Architecture - Deep Analysis

**PR URL:** https://github.com/promptfoo/promptfoo/pull/5595
**Status:** OPEN
**Branch:** `pr-2-model-audit-ui`
**Statistics:** +5454 additions, substantial architectural changes across ~45 files

---

## Executive Summary

This PR represents a comprehensive architectural transformation of the Model Audit feature from a single-page tabbed interface to a multi-page architecture. The changes introduce enterprise-grade patterns including:

- **Multi-page routing** with dedicated routes for distinct user journeys
- **Store decoupling** from monolithic state to focused, single-responsibility stores
- **Server-side pagination** for scalable data handling
- **Unified type system** integrating Model Audit alongside existing Eval and RedTeam types
- **Comprehensive API contracts** with Zod schemas for type safety

---

## 1. Product Architecture Overview

### 1.1 Route Structure

The PR transforms Model Audit from a single `/model-audit` endpoint to a multi-page architecture:

| Route                      | Page Component               | Purpose                                |
| -------------------------- | ---------------------------- | -------------------------------------- |
| `/model-audit`             | `ModelAuditResultLatestPage` | Dashboard showing latest scan results  |
| `/model-audit/setup`       | `ModelAuditSetupPage`        | Configuration and scan execution       |
| `/model-audit/history`     | `ModelAuditHistoryPage`      | Paginated list of all historical scans |
| `/model-audit/history/:id` | `ModelAuditResultPage`       | Detailed view of a specific scan       |
| `/model-audit/:id`         | `ModelAuditResultPage`       | Alias for result detail (cleaner URLs) |

**Code Reference:** `src/app/src/App.tsx:74-114`

```typescript
{/* Model Audit Routes - New structure */}
<Route path="/model-audit" element={<ModelAuditLatestPage />} />
<Route path="/model-audit/setup" element={<ModelAuditSetupPage />} />
<Route path="/model-audit/history" element={<ModelAuditHistoryPage />} />
<Route path="/model-audit/history/:id" element={<ModelAuditResultPage />} />
<Route path="/model-audit/:id" element={<ModelAuditResultPage />} />
```

### 1.2 Navigation Integration

The navigation system is enhanced with:

1. **"Create" Dropdown Enhancement** - Model Audit added as a creation option alongside Eval and Red Team
2. **Direct NavLink** - `/model-audit` accessible from top navigation
3. **Smart Active State Handling** - NavLink correctly activates for `/model-audit` and `/model-audit/:id` but not for `/model-audit/setup` or `/model-audit/history`

**Code Reference:** `src/app/src/components/Navigation.tsx:67-87`

```typescript
// Special handling for Model Audit to activate on both /model-audit and /model-audit/:id
let isActive: boolean;
if (href === '/model-audit') {
  isActive =
    location.pathname === '/model-audit' ||
    (location.pathname.startsWith('/model-audit/') &&
      !location.pathname.startsWith('/model-audit/setup') &&
      !location.pathname.startsWith('/model-audit/history'));
}
```

---

## 2. Store Architecture (State Management)

### 2.1 Store Split Design

The PR decouples the monolithic `useModelAuditStore` into two focused stores:

#### `useModelAuditConfigStore` - Configuration & Scan State

**File:** `src/app/src/pages/model-audit/stores/useModelAuditConfigStore.ts`

**Responsibilities:**

- Recent scans history (persisted to localStorage)
- Current scan configuration (paths, options)
- Scan execution state (isScanning, results, error)
- Installation status checking
- UI dialog state

**Key Features:**

- **Persistence:** Uses Zustand's `persist` middleware with localStorage
- **Migration:** Handles migration from old `model-audit-store` to new `model-audit-config-store`
- **Request Deduplication:** Singleton promise pattern for installation checks

```typescript
// Singleton promise for request deduplication
let checkInstallationPromise: Promise<{ installed: boolean; cwd: string }> | null = null;

export const useModelAuditConfigStore = create<ModelAuditConfigState>()(
  persist(
    (set, get) => ({
      // Only persist: recentScans, scanOptions
      // Transient: isScanning, scanResults, error, installationStatus, dialog states
    }),
    {
      name: 'model-audit-config-store',
      version: 2,
      skipHydration: true, // Prevents SSR issues
    },
  ),
);
```

#### `useModelAuditHistoryStore` - History & DataGrid State

**File:** `src/app/src/pages/model-audit/stores/useModelAuditHistoryStore.ts`

**Responsibilities:**

- Historical scans data
- DataGrid pagination state (pageSize, currentPage)
- Sort model management
- Filter model management
- Search query state
- Async data fetching

**Key Features:**

- **Server-Side State Sync:** Manages pagination/sort/search state that maps to API parameters
- **Transient State:** No persistence - fetches fresh data on mount
- **Query Building:** Constructs API query parameters from state

```typescript
fetchHistoricalScans: async () => {
  const { pageSize, currentPage, sortModel, searchQuery } = get();
  const params = new URLSearchParams({
    limit: normalizedPageSize.toString(),
    offset: (normalizedCurrentPage * normalizedPageSize).toString(),
  });
  if (searchQuery.trim()) params.set('search', searchQuery.trim());
  if (sortModel.length > 0) {
    params.set('sort', sortModel[0].field);
    params.set('order', sortModel[0].sort);
  }
  // ... fetch and update state
};
```

### 2.2 State Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     User Interactions                                │
└─────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────┐         ┌─────────────────┐         ┌───────────────┐
│ SetupPage     │         │ HistoryPage     │         │ LatestPage    │
│               │         │                 │         │               │
│ uses:         │         │ uses:           │         │ uses:         │
│ ConfigStore   │         │ HistoryStore    │         │ callApi()     │
└───────┬───────┘         └────────┬────────┘         └───────┬───────┘
        │                          │                          │
        │                          ▼                          │
        │                 ┌─────────────────┐                 │
        │                 │ HistoryStore    │                 │
        │                 │ - pagination    │                 │
        │                 │ - sort          │                 │
        │                 │ - search        │                 │
        │                 │ - historicalScans│                │
        │                 └─────────────────┘                 │
        ▼                          │                          ▼
┌───────────────┐                  │                  ┌───────────────┐
│ ConfigStore   │                  │                  │ Direct API    │
│ (Persisted)   │                  │                  │ /scans/latest │
│ - recentScans │                  │                  └───────────────┘
│ - scanOptions │                  │
│ - isScanning  │                  │
│ - results     │                  │
└───────┬───────┘                  │
        │                          │
        └──────────────────────────┼──────────────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────┐
                    │     Server API           │
                    │  /model-audit/scans      │
                    │  /model-audit/scans/:id  │
                    │  /model-audit/scan       │
                    └──────────────────────────┘
```

---

## 3. Page Components Deep Dive

### 3.1 ModelAuditSetupPage

**File:** `src/app/src/pages/model-audit-setup/ModelAuditSetupPage.tsx`

**Purpose:** Configuration hub for setting up and executing model security scans.

**Features:**

- Breadcrumb navigation back to `/model-audit`
- Installation status indicator (Ready/Not Installed/Checking)
- Path configuration with the existing `ConfigurationTab` component
- Advanced options dialog for scan parameters
- Scanned files dialog for reviewing scan targets
- Automatic navigation to results after persisted scan completion

**Key UX Flow:**

```
User configures paths → Clicks "Scan" → isScanning=true →
API POST /scan → Response with auditId →
Navigate to /model-audit/history/:auditId
```

**Code Reference:** `src/app/src/pages/model-audit-setup/ModelAuditSetupPage.tsx:64-106`

```typescript
const handleScan = async () => {
  // ... validation
  const response = await callApi('/model-audit/scan', {
    method: 'POST',
    body: JSON.stringify({ paths, options }),
  });
  const data = await response.json();
  setScanResults(data);
  addRecentScan(paths);

  // If scan was persisted, navigate to the result page
  if (data.persisted && data.auditId) {
    navigate(`/model-audit/history/${data.auditId}`);
  }
};
```

### 3.2 ModelAuditResultLatestPage

**File:** `src/app/src/pages/model-audit-latest/ModelAuditResultLatestPage.tsx`

**Purpose:** Dashboard landing page showing the most recent scan results.

**Features:**

- Empty state with CTAs to setup and history
- Latest scan display with summary
- Quick access to "New Scan" and "View History"
- Link to detailed view

**API Strategy:**

1. Try dedicated `/scans/latest` endpoint
2. Fallback to `/scans?limit=1` if latest endpoint unavailable
3. Handle 204 No Content for empty state

**Code Reference:** `src/app/src/pages/model-audit-latest/ModelAuditResultLatestPage.tsx:44-109`

```typescript
// Try to fetch latest scan with dedicated endpoint, fallback to scans list
let response;
try {
  response = await callApi('/model-audit/scans/latest', { ... });
  if (response.ok) {
    if (response.status === 204) {
      // No content - no scans exist
      setLatestScan(null);
      return;
    }
    const latestScanData = await response.json();
    setLatestScan(latestScanData);
    return;
  }
} catch (_err) {
  // Fallback to scans list
}
```

### 3.3 ModelAuditHistory

**File:** `src/app/src/pages/model-audit-history/ModelAuditHistory.tsx`

**Purpose:** Paginated, searchable, sortable list of all historical scans using MUI X DataGrid.

**Features:**

- **Custom Toolbar:** Columns, Filter, Density, Export buttons + QuickFilter search
- **Responsive Design:** Mobile-optimized column visibility and kebab menu
- **Server-Side Operations:** Pagination, sorting, filtering all handled server-side
- **Rich Cell Rendering:** Status chips, issue counts, check statistics

**DataGrid Configuration:**

```typescript
<DataGrid
  paginationMode="server"
  sortingMode="server"
  filterMode="server"
  paginationModel={{ page: currentPage, pageSize }}
  onPaginationModelChange={(model) => {
    setCurrentPage(model.page);
    setPageSize(model.pageSize);
  }}
  sortModel={sortModel}
  onSortModelChange={setSortModel}
  rowCount={-1} // Unknown total
  pageSizeOptions={[10, 25, 50, 100]}
/>
```

**Column Definitions:**
| Column | Description | Responsive |
|--------|-------------|------------|
| ID | Clickable link to detail view | Always |
| Created | Formatted date | Hidden on mobile |
| Name | Scan name with fallback | Always |
| Model Path | Path scanned | Hidden on mobile |
| Status | Clean/Issues Found chip | Always |
| Issues | Critical/Error/Warning counts | Hidden on mobile |
| Checks | Passed/Total | Hidden on tablet+ |

### 3.4 ModelAuditResult

**File:** `src/app/src/pages/model-audit-result/ModelAuditResult.tsx`

**Purpose:** Detailed view of a specific scan result with full actions.

**Features:**

- Breadcrumb navigation: Model Audit > History > [Scan Name]
- Scan metadata display (Created, Model Path, Author, Checks)
- Action buttons: Download JSON, Refresh, Delete
- Full ResultsTab display of scan findings
- AbortController integration for all async operations

**Memory Safety:**

```typescript
useEffect(() => {
  const abortController = new AbortController();
  // ... fetch with signal
  return () => {
    abortController.abort();
    if (deleteControllerRef.current) {
      deleteControllerRef.current.abort();
    }
  };
}, [id]);
```

---

## 4. Server-Side Architecture

### 4.1 API Endpoints

**Router:** `src/server/routes/modelAudit.ts`

| Method | Endpoint           | Purpose                           | Schema                       |
| ------ | ------------------ | --------------------------------- | ---------------------------- |
| GET    | `/check-installed` | Check ModelAudit CLI availability | `ZCheckInstalledResponse`    |
| POST   | `/check-path`      | Validate path existence and type  | `ZCheckPathRequest/Response` |
| POST   | `/scan`            | Execute a new security scan       | `ZScanRequest/Response`      |
| GET    | `/scans`           | List scans with pagination        | `ZScansQuery/Response`       |
| GET    | `/scans/latest`    | Get most recent scan              | `ScanRecord`                 |
| GET    | `/scans/:id`       | Get specific scan details         | `ScanRecord`                 |
| DELETE | `/scans/:id`       | Delete a scan                     | `ZDeleteResponse`            |

### 4.2 Zod Schema Contracts

**File:** `src/server/routes/modelAudit.schemas.ts`

The PR introduces comprehensive Zod schemas for API validation:

```typescript
// Query parameters for paginated list
export const ZScansQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().optional(),
  sort: z.enum(['createdAt', 'name', 'status']).optional().default('createdAt'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

// Scan request body
export const ZScanRequest = z.object({
  paths: z.array(z.string().min(1)).min(1),
  options: z.object({
    blacklist: z.array(z.string()),
    timeout: z
      .number()
      .int()
      .positive()
      .max(24 * 3600),
    verbose: z.boolean().optional(),
    maxSize: z.string().optional(),
    name: z.string().optional(),
    author: z.string().optional(),
    persist: z.boolean().optional(),
  }),
});
```

### 4.3 Telemetry Integration

Every API endpoint includes telemetry tracking:

```typescript
telemetry.record('webui_api', {
  event: 'model_audit_list_scans',
});

telemetry.record('webui_api', {
  event: 'model_scan',
  pathCount: paths.length,
  hasBlacklist: options.blacklist?.length > 0,
  timeout: options.timeout,
  verbose: options.verbose ?? false,
  persist,
});
```

### 4.4 Server-Side Pagination Implementation

**Code Reference:** `src/server/routes/modelAudit.ts:504-542`

```typescript
modelAuditRouter.get('/scans', async (req, res) => {
  const { limit, offset, search, sort, order } = queryResult.data;

  // Use server-side pagination for performance
  const { audits, total } = await ModelAudit.getManyWithPagination({
    limit,
    offset,
    search,
    sort,
    order,
  });

  const response = ZScansResponse.parse({
    scans: audits.map((audit) => audit.toJSON()),
    total,
  });
  res.json(response);
});
```

---

## 5. Unified Type System

### 5.1 Three-Way Type Integration

The PR unifies Model Audit with the existing Eval and Red Team types:

**Type Definition:** `src/app/src/pages/evals/components/EvalsDataGrid.tsx:58-70`

```typescript
type EvalType = 'eval' | 'redteam' | 'modelaudit';

type Eval = {
  createdAt: number;
  datasetId: string | null;
  description: string | null;
  evalId: string;
  isRedteam: number; // Legacy field for backward compatibility
  type?: EvalType; // New unified type field
  label: string;
  numTests: number;
  passRate: number;
};
```

### 5.2 Type-Aware Navigation

The EvalsDataGrid now intelligently routes based on type:

```typescript
const handleCellClick = useCallback(
  (params) => {
    const evalType = params.row.type || (params.row.isRedteam === 1 ? 'redteam' : 'eval');

    if (evalType === 'modelaudit') {
      navigate(`/model-audit/${params.row.evalId}`);
    } else {
      onEvalSelected(params.row.evalId);
    }
  },
  [navigate, onEvalSelected],
);
```

### 5.3 Visual Type Differentiation

Color-coded chips for type identification:

```typescript
const getTypeColor = (type: EvalType) => {
  switch (type) {
    case 'redteam':
      return { border: 'error.light', text: 'error.main', bg: alpha(error, 0.1) };
    case 'modelaudit':
      return { border: 'warning.light', text: 'warning.main', bg: alpha(warning, 0.1) };
    default: // eval
      return { border: grey, text: grey, bg: grey };
  }
};
```

---

## 6. Responsive Design Patterns

### 6.1 Mobile Optimizations

**Column Visibility:**

```typescript
const columnVisibilityModel = useMemo(
  () => ({
    createdAt: !isMobile,
    modelPath: !isMobile,
    issues: !isMobile,
    checks: !isTablet,
  }),
  [isMobile, isTablet],
);
```

**Toolbar Adaptation:**

- Desktop: Full button row (Columns, Filter, Density, Export)
- Mobile: Kebab menu containing all toolbar actions

**Touch Targets:**
All interactive elements meet 44px minimum touch target size:

```typescript
<IconButton sx={{ minWidth: 44, minHeight: 44 }} ... />
```

### 6.2 Safe Area Handling

For devices with notches:

```typescript
<Box sx={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
```

---

## 7. Critical Issues Identified

### 7.1 Merge Conflict Markers

**File:** `src/app/src/pages/evals/components/EvalsDataGrid.tsx`

The file contains unresolved merge conflict markers:

```typescript
<<<<<<< HEAD
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
=======
import { useEffect, useMemo, useRef, useState } from 'react';
>>>>>>> origin/main
```

And:

```typescript
<<<<<<< HEAD
            quickFilterValue,
            onQuickFilterChange: setQuickFilterValue,
            selectedCount: rowSelectionModel.length,
=======
            selectedCount: rowSelectionModel.ids.size,
>>>>>>> origin/main
```

**Severity:** Blocking - build will fail until resolved.

### 7.2 Skipped Tests

The PR temporarily skips several tests pending architecture updates:

- App routing tests (Router-in-Router issues)
- Navigation active state tests
- Model audit history tests (DataGrid config updates)
- Model audit config store tests (import path changes)

**Technical Debt:** These tests should be re-enabled before merge.

---

## 8. Feature Areas Summary

| Feature Area               | Components                 | Status                   |
| -------------------------- | -------------------------- | ------------------------ |
| **Multi-Page Routing**     | App.tsx, Navigation.tsx    | Complete                 |
| **Store Architecture**     | ConfigStore, HistoryStore  | Complete                 |
| **Setup Page**             | ModelAuditSetupPage        | Complete                 |
| **Latest Results Page**    | ModelAuditResultLatestPage | Complete                 |
| **History Page**           | ModelAuditHistory          | Complete                 |
| **Result Detail Page**     | ModelAuditResult           | Complete                 |
| **Server-Side Pagination** | modelAudit.ts routes       | Complete                 |
| **API Contracts**          | modelAudit.schemas.ts      | Complete                 |
| **Type Unification**       | EvalsDataGrid integration  | Complete (has conflicts) |
| **Navigation Integration** | CreateDropdown, NavLink    | Complete                 |
| **Responsive Design**      | All pages                  | Complete                 |
| **Telemetry**              | All API endpoints          | Complete                 |
| **Test Coverage**          | Multiple test files        | Partial (some skipped)   |

---

## 9. Recommendations

1. **Resolve merge conflicts** in `EvalsDataGrid.tsx` immediately
2. **Re-enable skipped tests** with proper fixes before merge
3. **Consider adding** E2E tests for the multi-page navigation flows
4. **Document** the store migration path for users upgrading
5. **Add loading skeletons** for better perceived performance on slow connections

---

## 10. Conclusion

PR #5595 represents a significant maturation of the Model Audit feature. The architectural decisions - particularly the store split and server-side pagination - position the feature for enterprise-scale usage. The unified type system elegantly integrates Model Audit into the existing eval ecosystem without requiring breaking changes.

The implementation demonstrates strong attention to:

- **Separation of concerns** (stores, pages, components)
- **Performance** (server-side pagination, debounced search)
- **Type safety** (Zod schemas, TypeScript interfaces)
- **Accessibility** (ARIA labels, touch targets)
- **Responsive design** (mobile-first column visibility)

The merge conflicts and skipped tests are the primary blockers to merging this PR.
