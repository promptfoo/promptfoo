# Plan: Fix Floating Pagination Bar on Eval Page

## Problem Statement

On the eval results page (`/eval/:id`), when the table has few rows, the pagination bar "floats" at the bottom of the viewport with a visible gap between it and the table content.

**Screenshot shows:** Table with 1 row, large gray gap, pagination bar at viewport bottom.

## Root Cause Analysis

### Current Structure (Broken)

```
PageShell
  └── Navigation (sticky top-0, h-14 = 3.5rem)
  └── UpdateBanner (normal flow, sets --update-banner-height CSS var)
  └── Outlet → Eval → ResultsView
      └── <div className="px-4 pt-4">  ← NOT a flex container
          └── Card (header with controls)
          └── ResultsTable (Fragment)
              ├── ResultsTableHeader (sticky top-3.5rem)
              ├── #results-table-container (flexGrow: 1 - INEFFECTIVE)
              │   └── table
              └── .pagination (sticky bottom-0)
```

**Issues:**

1. The `px-4 pt-4` wrapper has NO flex layout
2. `flexGrow: 1` on `#results-table-container` does nothing without a flex parent
3. `sticky bottom-0` pins pagination to viewport bottom regardless of content height
4. Comment at line 1416-1418 says "parent container is a flexbox" - **this is incorrect/outdated**

### How Other Pages Work (Correct Pattern)

Pages like Datasets, History, and Prompts use:

```tsx
<PageContainer className="fixed top-14 left-0 right-0 bottom-0 flex flex-col overflow-hidden min-h-0">
  <PageHeader>...</PageHeader>
  <div className="flex-1 min-h-0 flex flex-col p-6">
    <Card className="flex-1 min-h-0 flex flex-col">
      <DataTable /> {/* Has internal scrolling, shrink-0 pagination */}
    </Card>
  </div>
</PageContainer>
```

Key differences:

- **Fixed container** fills viewport below nav
- **Internal scrolling** (table scrolls, not document)
- **Pagination is `shrink-0`** (not sticky), always visible at bottom of flex container

---

## Proposed Solutions

### Option A: Minimal Fix (Recommended)

**Philosophy:** Fix the existing structure with minimal changes, preserving current UX.

**Changes:**

1. **Add flex layout to ResultsView wrapper** (`ResultsView.tsx` line 545):

   ```tsx
   // FROM:
   <div className="px-4 pt-4" style={{ isolation: 'isolate' }}>

   // TO:
   <div
     className="px-4 pt-4 flex flex-col"
     style={{
       isolation: 'isolate',
       minHeight: 'calc(100vh - 3.5rem - var(--update-banner-height, 0px))'
     }}
   >
   ```

2. **Ensure Card doesn't break flex layout** (same file, ~line 546):
   ```tsx
   // Verify Card has proper flex behavior or add shrink-0 if needed
   <Card className="p-4 mb-4 bg-white dark:bg-zinc-900 shrink-0">
   ```

**How it works:**

- Wrapper becomes flex column with min-height = viewport - nav - banner
- `flexGrow: 1` on `#results-table-container` now works
- For short content: container grows, pagination at wrapper bottom (= viewport bottom)
- For long content: document scrolls, `sticky bottom-0` keeps pagination visible

**Pros:**

- Minimal code changes (2-3 lines)
- Preserves sticky pagination UX for long tables
- Low risk of breaking existing functionality

**Cons:**

- Still uses document scrolling (unlike other pages)
- Table container may have scrollable empty space for short content

---

### Option B: Align with Modern Pattern

**Philosophy:** Refactor to match the pattern used by Datasets/History/Prompts pages.

**Changes:**

1. **Wrap in PageContainer with fixed positioning** (ResultsView.tsx):

   ```tsx
   <PageContainer className="fixed top-14 left-0 right-0 bottom-0 flex flex-col overflow-hidden min-h-0">
     <div className="flex-1 min-h-0 flex flex-col">
       <Card className="mx-4 mt-4 p-4 shrink-0 bg-white dark:bg-zinc-900">
         {/* Header controls */}
       </Card>
       <div className="flex-1 min-h-0 flex flex-col px-4 pb-4">
         <ResultsTable ... />
       </div>
     </div>
   </PageContainer>
   ```

2. **Change ResultsTable container to use internal scrolling** (ResultsTable.tsx):

   ```tsx
   // Wrapper
   <div className="flex flex-col flex-1 min-h-0">
     <ResultsTableHeader className="shrink-0" />
     <div id="results-table-container" className="overflow-auto flex-1 min-h-0">
       <table>...</table>
     </div>
     <div className="pagination shrink-0 ...">
       {' '}
       {/* Remove sticky bottom-0 */}
       ...
     </div>
   </div>
   ```

3. **Update sticky header offset** (ResultsTable.css):
   ```css
   .results-table-sticky {
     position: sticky;
     top: 0; /* Changed from 3.5rem - now relative to scroll container */
   }
   ```

**Pros:**

- Matches other pages in the codebase
- Cleaner layout model (internal scrolling)
- No sticky positioning complexity

**Cons:**

- More invasive changes
- Changes UX (pagination no longer sticks to viewport)
- Higher risk of regressions
- Need to verify zoom feature still works
- Need to update tests

---

## Implementation Steps (Option B - Full Refactor)

### Step 1: Modify ResultsView.tsx Layout Structure

**File:** `src/app/src/pages/eval/components/ResultsView.tsx`

Replace the current wrapper (lines 544-891) with the PageContainer pattern:

```tsx
// BEFORE (lines 544-545):
return (
  <>
    <div className="px-4 pt-4" style={{ isolation: 'isolate' }}>
      <Card className="p-4 mb-4 bg-white dark:bg-zinc-900">
        {/* Header controls */}
      </Card>
      <ResultsTable ... />
    </div>
    {/* Modals */}
  </>
);

// AFTER:
import { PageContainer } from '@app/components/layout/PageContainer';

return (
  <>
    <PageContainer
      className="fixed left-0 right-0 bottom-0 flex flex-col overflow-hidden min-h-0"
      style={{
        top: 'calc(3.5rem + var(--update-banner-height, 0px))',
        isolation: 'isolate'
      }}
    >
      {/* Header Card - shrink-0 to not participate in flex growth */}
      <div className="shrink-0 px-4 pt-4">
        <Card className="p-4 bg-white dark:bg-zinc-900">
          {/* All existing header controls remain unchanged */}
        </Card>
      </div>

      {/* Table area - flex-1 to fill remaining space, min-h-0 for internal scroll */}
      <div className="flex-1 min-h-0 px-4 pb-4">
        <ResultsTable ... />
      </div>
    </PageContainer>

    {/* Modals remain outside PageContainer */}
    <ConfigModal ... />
    {/* etc. */}
  </>
);
```

**Key changes:**

- `PageContainer` with `fixed` positioning fills viewport below nav+banner
- Header Card wrapped with `shrink-0` div to prevent flex growth
- Table area gets `flex-1 min-h-0` for proper flex behavior
- `top` uses CSS calc to account for UpdateBanner dynamically
- `mb-4` removed from Card (spacing now handled by padding)

---

### Step 2: Refactor ResultsTable.tsx Structure

**File:** `src/app/src/pages/eval/components/ResultsTable.tsx`

Change from Fragment to proper flex container with internal scrolling.

**2a. Update the return statement wrapper (line 1415-1419):**

```tsx
// BEFORE:
return (
  // NOTE: It's important that the JSX Fragment is the top-level element...
  <>{/* content */}</>
);

// AFTER:
return <div className="flex flex-col flex-1 min-h-0">{/* content */}</div>;
```

**2b. Update ResultsTableHeader (line 1428-1436):**

Add `shrink-0` to prevent header from collapsing:

```tsx
// BEFORE:
<ResultsTableHeader
  reactTable={reactTable}
  ...
/>

// AFTER:
<div className="shrink-0">
  <ResultsTableHeader
    reactTable={reactTable}
    ...
  />
</div>
```

**2c. Update the table container (lines 1438-1450):**

```tsx
// BEFORE:
<div
  id="results-table-container"
  style={{
    zoom,
    borderTop: '1px solid',
    borderColor: stickyHeader ? 'transparent' : 'var(--border-color)',
    flexGrow: 1,
    position: 'relative',
  }}
  ref={tableRef}
>

// AFTER:
<div
  id="results-table-container"
  className="flex-1 min-h-0 overflow-auto"
  style={{
    zoom,
    borderTop: '1px solid',
    borderColor: stickyHeader ? 'transparent' : 'var(--border-color)',
    position: 'relative',
  }}
  ref={tableRef}
>
```

**Key changes:**

- Removed `flexGrow: 1` (now using Tailwind `flex-1`)
- Added `min-h-0` for flex shrinking
- Added `overflow-auto` for internal scrolling (replaces CSS file)

**2d. Update pagination (line 1565):**

```tsx
// BEFORE:
<div className="pagination sticky bottom-0 z-10 flex items-center gap-4 flex-wrap justify-between bg-background border-t border-border w-screen px-4 -mx-4 shadow-lg py-2">

// AFTER:
<div className="pagination shrink-0 z-10 flex items-center gap-4 flex-wrap justify-between bg-background border-t border-border w-full py-2">
```

**Key changes:**

- Removed `sticky bottom-0` - no longer needed with flex layout
- Changed to `shrink-0` - pagination won't shrink
- Changed `w-screen px-4 -mx-4` to `w-full` - no longer needed to break out of parent
- Removed `shadow-lg` - shadow not needed when not floating

---

### Step 3: Update ResultsTable.css

**File:** `src/app/src/pages/eval/components/ResultsTable.css`

**3a. Remove conflicting overflow from container (lines 9-13):**

```css
/* BEFORE: */
#results-table-container {
  overflow: scroll;
  margin: 0 -1rem;
  padding: 0 1rem;
}

/* AFTER: */
#results-table-container {
  /* overflow handled by Tailwind class overflow-auto */
  margin: 0 -1rem;
  padding: 0 1rem;
}
```

**3b. Update sticky header positioning (lines 506-510):**

```css
/* BEFORE: */
.results-table-sticky {
  position: sticky;
  top: 3.5rem; /* Account for navigation height (h-14) */
  z-index: 10;
  ...
}

/* AFTER: */
.results-table-sticky {
  position: sticky;
  top: 0; /* Now relative to scroll container, not viewport */
  z-index: 10;
  ...
}
```

**3c. Update scroll-driven animation (lines 513-517):**

The scroll-driven animation uses `animation-timeline: scroll()` which tracks the root scroll container. With internal scrolling, this needs to reference the table container instead:

```css
/* BEFORE: */
.results-table-sticky {
  animation-name: collapseHeader;
  animation-timeline: scroll(); /* Root scroll */
  animation-duration: 0;
  animation-range: 0px 50px;
  animation-fill-mode: both;
}

/* AFTER: */
.results-table-sticky {
  animation-name: collapseHeader;
  animation-timeline: scroll(nearest); /* Nearest scrolling ancestor */
  animation-duration: 0;
  animation-range: 0px 50px;
  animation-fill-mode: both;
}
```

**Note:** `scroll(nearest)` targets the nearest scrolling ancestor, which is now `#results-table-container` instead of the document root.

---

### Step 4: Handle Scroll-to-Row Behavior

**File:** `src/app/src/pages/eval/components/ResultsTable.tsx`

The current code uses `window.scrollTo(0, 0)` in several places (e.g., line 1604 when changing page size). With internal scrolling, this needs to scroll the table container instead:

```tsx
// BEFORE (line 1604):
window.scrollTo(0, 0);

// AFTER:
tableRef.current?.scrollTo(0, 0);
```

Search for all instances of `window.scrollTo` and `document.querySelector` that scroll to rows and update them to use the container reference.

---

### Step 5: Update URL Row Navigation

**File:** `src/app/src/pages/eval/components/ResultsTable.tsx`

The `scrollToRowById` function and similar scroll logic need updates:

```tsx
// Current behavior scrolls the document
// New behavior should scroll the table container

const scrollToRow = (rowIndex: number) => {
  const container = tableRef.current;
  const row = container?.querySelector(`#row-${rowIndex}`);
  if (row && container) {
    const rowRect = row.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    container.scrollTop = row.offsetTop - containerRect.height / 2;
  }
};
```

---

### Step 6: Test Scenarios

1. **Short content (1-5 rows):** Pagination at bottom of table, no gap
2. **Long content (100+ rows):** Table scrolls internally, pagination stays visible below
3. **Sticky header:** Should stick at top=0 of scroll container (not viewport)
4. **Scroll-driven animation:** Header collapse animation still works
5. **Zoom (50%, 100%, 200%):** Layout works at all zoom levels
6. **Row navigation:** `?row=5` URL param still scrolls to correct row
7. **Page change:** Changing pages scrolls table to top
8. **UpdateBanner:** Fixed container adjusts when banner shows/hides
9. **Dark mode:** Colors/borders correct
10. **Window resize:** Layout adapts properly

---

### Step 7: Run Tests

```bash
npm run test -- src/app/src/pages/eval/components/ResultsTable.test.tsx
npm run test -- src/app/src/pages/eval/components/ResultsView.test.tsx
```

---

## Option B Risks and Mitigations

| Risk                           | Impact                                              | Mitigation                                                |
| ------------------------------ | --------------------------------------------------- | --------------------------------------------------------- |
| Scroll-driven animation breaks | Header collapse animation fails                     | Test with Chrome DevTools, fallback to JS-based animation |
| Row navigation breaks          | Users can't navigate via URL params                 | Update all scroll logic to use container ref              |
| Zoom feature breaks            | CSS zoom may interact poorly with fixed positioning | Test extensively, zoom is on inner container              |
| Tests fail                     | Existing tests expect different DOM structure       | Update test selectors, may need new test utils            |
| UX change perception           | Users used to viewport-sticky pagination            | Document change, monitor feedback                         |
| UpdateBanner timing            | CSS calc may not update smoothly                    | ResizeObserver already handles this                       |
| Third-party integrations       | External code may depend on scroll behavior         | Document breaking change if any                           |

---

## Option B Verification Checklist

- [ ] Pagination at table bottom for short content
- [ ] Internal scroll works for long content
- [ ] Sticky header sticks at top of scroll container
- [ ] Scroll-driven header animation works
- [ ] Row highlight via URL param works (`?row=5`)
- [ ] Page change scrolls table to top
- [ ] Zoom slider works at all levels
- [ ] Dark mode appearance correct
- [ ] UpdateBanner shows: layout adjusts
- [ ] UpdateBanner hides: layout adjusts
- [ ] Window resize: layout adapts
- [ ] All existing tests pass
- [ ] No console errors/warnings
- [ ] Compare with Datasets/History pages for consistency

---

## Recommendation

**Implement Option A (Minimal Fix)** because:

1. **Lower risk** - Only 2-3 lines of CSS changes
2. **Preserves UX** - Users may rely on sticky pagination for long tables
3. **Fixes the reported issue** - Pagination won't float for short content
4. **Matches the code's intent** - The comment says parent should be flexbox

Option B could be considered as a future refactor if we want to standardize all table pages.

---

## Implementation Steps (Option A)

### Step 1: Modify ResultsView.tsx

**File:** `src/app/src/pages/eval/components/ResultsView.tsx`
**Line:** ~545

```tsx
// Change from:
<div className="px-4 pt-4" style={{ isolation: 'isolate' }}>

// Change to:
<div
  className="px-4 pt-4 flex flex-col"
  style={{
    isolation: 'isolate',
    minHeight: 'calc(100vh - 3.5rem - var(--update-banner-height, 0px))'
  }}
>
```

### Step 2: Verify Card doesn't collapse

Ensure the header Card maintains its height and doesn't participate in flex growth:

```tsx
<Card className="p-4 mb-4 bg-white dark:bg-zinc-900 shrink-0">
```

### Step 3: Test scenarios

1. **Short content (1-5 rows):** Pagination should be at bottom, no floating gap
2. **Long content (100+ rows):** Pagination should stick to viewport bottom while scrolling
3. **With UpdateBanner visible:** Layout should account for banner height
4. **With zoom (50%, 100%, 200%):** Layout should work at all zoom levels
5. **Sticky header:** Should still stick at correct position (3.5rem from viewport top)
6. **Dark mode:** Verify colors/borders are correct

### Step 4: Run existing tests

```bash
npm run test -- src/app/src/pages/eval/components/ResultsTable.test.tsx
npm run test -- src/app/src/pages/eval/components/ResultsView.test.tsx
```

---

## Risks and Mitigations

| Risk                             | Mitigation                                                           |
| -------------------------------- | -------------------------------------------------------------------- |
| Sticky header breaks             | Tested: body remains scrolling ancestor, sticky top-3.5rem unchanged |
| Zoom feature breaks              | CSS zoom is on table container, unaffected by parent flex            |
| Tests fail                       | Run existing tests, update if needed                                 |
| UpdateBanner timing              | CSS variable updates dynamically via ResizeObserver                  |
| Edge case: exact viewport height | min-height handles this correctly                                    |

---

## Verification Checklist

- [ ] Short table: pagination at bottom, no gap
- [ ] Long table: pagination sticks while scrolling
- [ ] Sticky header works at scroll position
- [ ] Zoom slider works (50%, 100%, 200%)
- [ ] Dark mode appearance correct
- [ ] UpdateBanner visible: layout adjusts
- [ ] UpdateBanner dismissed: layout adjusts
- [ ] All existing tests pass
- [ ] No console errors/warnings
