# Ink UI Phase 2b: Table Transition and Navigation Fixes

This document outlines the design considerations and fixes for the Ink CLI UI's transition from evaluation progress to results table, along with navigation improvements.

## Issues to Address

1. **Sharing blocks table display** - "Sharing to promptfoo" happens synchronously and delays the results table
2. **Help bar lingers after transition** - The eval help bar remains visible when it's no longer relevant
3. **Input cells appear clickable but aren't** - Variable columns are highlighted on selection but can't be expanded
4. **'q' stops working after navigation** - Must press Escape first after using arrow keys

---

## Issue 1: Sharing Blocks Table Display

### Current Behavior (Before Fix)
Sharing happened synchronously with blocking `await` calls and artificial delays, preventing the results table from displaying until sharing completed.

### Solution (Implemented)
Simple background sharing with silent mode - no CLI progress bar, no blocking:

```typescript
// Start sharing in background - don't block UI transition
// Pass silent: true to suppress progress bar output (Ink UI handles feedback)
if (wantsToShareInk && canShareInk) {
  pendingInkShare = createShareableUrl(evalRecord, false, { silent: true });
}

// Brief pause for UI to show completion state
await new Promise((resolve) => setTimeout(resolve, 200));

// ... cleanup and show table immediately ...

// After table closes, show share URL
if (pendingInkShare) {
  const shareUrl = await pendingInkShare;
  if (shareUrl) {
    evalRecord.shared = true;
    logger.info(`✔ Shared: ${shareUrl}`);
  }
}
```

**Implementation details:**
- Added `silent` option to `createShareableUrl()` and `sendChunkedResults()`
- When `silent: true`:
  - CLI progress bar is not created
  - "Sharing to:" log message is suppressed
  - Progress log messages are suppressed
  - Email collection prompt is skipped (background sharing)
- URL is shown after user closes the results table

**Benefits:**
- Table displays immediately after eval completes
- Sharing happens silently in background (no CLI output)
- URL shown after user closes table
- No complex timeout/race logic

---

## Issue 2: Help Bar Transition

### Current Behavior
- `EvalScreen` displays its own `HelpBar` component with "[q] quit | [v] verbose | [e] errors"
- When eval completes and transitions to `ResultsTable`, the `EvalScreen` is unmounted
- `ResultsTable` has its own `HelpText` component with different shortcuts
- The transition should be seamless with no lingering UI

### Problem
The user sees the eval help bar remain briefly visible during transition, which is confusing since those shortcuts no longer apply.

### Proposed Solution
The help bar should automatically hide when:
1. Evaluation is complete AND
2. We're about to transition to the results table

**Implementation:**
In `EvalScreen.tsx`, conditionally hide the help bar when about to transition:
```typescript
// HelpBar should hide when complete and table is pending
{showHelp && isRawModeSupported() && !isComplete && (
  <HelpBar ... />
)}
```

Or add a prop to signal transition is imminent:
```typescript
{showHelp && isRawModeSupported() && !isTransitioning && (
  <HelpBar ... />
)}
```

---

## Issue 3: Input Cells Appear Clickable But Aren't

### Current Behavior
In the results table:
- All cells (index, var, output) show cyan highlight when selected
- Pressing Enter on an output cell expands it with detailed view
- Pressing Enter on a var/input cell does nothing (no visual feedback)
- Users expect selectable cells to be actionable

### Root Cause
In `ResultsTable.tsx` lines 192-208:
```typescript
if (column.type === 'output') {
  const outputIdx = layout.columns.filter((c, i) => c.type === 'output' && i < col).length;
  cellData = rowData.cells[outputIdx];
}
```
Only output columns have expand handling. Variable columns are highlighted but have no action.

### Proposed Solutions

**Option A: Skip non-expandable columns during navigation**
- Arrow left/right skips over var columns
- Only output columns are selectable
- Index column remains visible but not selectable
- Simplest UX - user can only select things they can act on

**Option B: Differentiate visual styling**
- Output cells: Cyan highlight with inverse (current)
- Var cells: Dim underline or no highlight
- Makes it visually clear which cells are actionable

**Option C: Add var column expand view**
- Show full variable content in expanded overlay
- Useful for long input text that's truncated
- More feature complete but adds complexity

### Recommended: Option A + C hybrid
- Var columns remain selectable (for completeness)
- Pressing Enter on var column shows simple content view (no metadata, just full text)
- Different visual treatment: var cells use underline, output cells use inverse

**Implementation:**
In `CellDetailOverlay.tsx`, add handling for var columns:
```typescript
// Handle var column expansion
if (column.type === 'var') {
  return (
    <VarDetailOverlay
      content={rowData.originalRow.vars[varIdx]}
      varName={column.header}
      onClose={onClose}
    />
  );
}
```

In `ResultsTable.tsx`, update expand logic:
```typescript
if (navigation.expandedCell) {
  const { row, col } = navigation.expandedCell;
  const column = layout.columns[col];

  if (column.type === 'var') {
    // Find var index
    const varIdx = layout.columns.filter((c, i) => c.type === 'var' && i < col).length;
    const varContent = processedRows[row].originalRow.vars[varIdx];
    return (
      <VarDetailOverlay
        varName={column.header}
        content={varContent}
        onClose={() => navigation.dispatch({ type: 'CLOSE_EXPAND' })}
      />
    );
  }
  // ... existing output handling
}
```

---

## Issue 4: 'q' Stops Working After Navigation

### Observed Behavior
- User opens results table, 'q' works to quit
- User presses arrow keys to navigate
- 'q' no longer quits
- User must press Escape first, then 'q' works (or Escape itself quits)

### Root Cause Analysis

In `useTableNavigation.ts` lines 209-214:
```typescript
case 'q':
  if (!state.expandedCell && onExit) {
    onExit();
  }
  break;
```

The handler checks `state.expandedCell`, but this reference might be stale due to React closure semantics. The `useKeypress` hook captures `state` at render time, and if the callback isn't properly updated, it may reference stale state.

**Likely issue:** The `useInput` hook from Ink may be memoizing the callback and not picking up the latest state reference.

### Proposed Fix

Use a ref to track the latest state for the exit check:
```typescript
export function useTableNavigation({
  ...
}: UseTableNavigationOptions): ... {
  const [state, setState] = useState<TableNavigationState>({...});

  // Keep ref for latest state to avoid stale closures
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Use ref in keypress handler
  useKeypress(
    (keyInfo) => {
      const currentState = stateRef.current;  // Always fresh

      // ... navigation handling ...

      const lowerKey = key.toLowerCase();
      switch (lowerKey) {
        case 'q':
          if (!currentState.expandedCell && onExit) {
            onExit();
          }
          break;
        // ...
      }
    },
    { isActive: isActive && isRawModeSupported() },
  );

  return { ...state, dispatch };
}
```

Alternatively, remove the `expandedCell` check for 'q' since Escape handles closing expanded cells:
```typescript
case 'q':
  // Always allow quit - expanded cell is a different concern
  if (onExit) {
    onExit();
  }
  break;
```

---

## UI Design: Eval Box vs Results Table Separation

### Current Flow
1. Eval starts -> EvalScreen renders in bordered box
2. Progress updates with providers, tokens, cost, latency
3. Eval completes -> Brief pause -> Ink cleanup
4. Results table renders (separate Ink instance)
5. User navigates and inspects results
6. User quits -> Return to CLI

### Design Considerations

**Visual Continuity:**
- Eval box uses rounded border (`borderStyle="round"`)
- Results table has no border (columns with separators)
- This discontinuity is acceptable - they represent different phases

**Information Flow:**
- Eval box: Progress-focused (what's happening now)
- Results table: Data-focused (what happened)
- Summary stats should appear in both for consistency

**Transition UX:**
The transition from eval to table should feel like "zooming in" on the results:
1. Eval completes with summary: "24/24 passed | 1.2M tokens | $0.15"
2. Table shows same data in detail
3. Share URL appears as footer (non-blocking)

### Recommendations

1. **Consistent summary footer**: Both views should show the same summary line format
2. **No duplicate help bars**: Each view has its own contextual help
3. **Clear phase indicators**: Eval shows "Complete", table shows row count
4. **Non-blocking transitions**: Sharing and cleanup happen in background

---

## Implementation Priority

1. **HIGH: Fix 'q' quit issue** - User-facing bug, quick fix ✅
2. **HIGH: Input cell UX** - Confusing current behavior ✅
3. **MEDIUM: Sharing concurrency** - Performance improvement ✅
4. **LOW: Help bar transition** - Minor polish ✅

## Implementation Status

### Completed
- ✅ Fixed 'q' quit issue via stateRef pattern
- ✅ Added var column expansion in ResultsTable
- ✅ Background sharing with `silent: true` option
- ✅ Help bar hidden when eval completes
- ✅ Fixed duplicate sharing call (added `!pendingInkShare` check)
- ✅ Org/team context displayed in Ink UI header
- ✅ Progress bar suppressed in silent mode

### Sharing Integration in Ink UI
When sharing is enabled:
1. Org context is fetched BEFORE the Ink UI renders
2. "Sharing to: OrgName > TeamName" displays in the EvalScreen header
3. When eval completes:
   - Sharing status changes to 'sharing' (spinner appears)
   - Sharing starts in background (silent mode - no CLI progress bar)
4. When sharing completes:
   - Status changes to 'completed' with URL: "✔ Shared: <url>"
   - Or 'failed' if error: "✗ Share failed"
5. Results table displays immediately (no blocking)
6. Share URL is also shown after user closes the results table (as backup)

**Sharing Status States:**
- `idle`: Before sharing starts (just shows org/team)
- `sharing`: Sharing in progress (spinner visible)
- `completed`: Sharing done (shows green checkmark + URL)
- `failed`: Sharing failed (shows red X)

## Files Modified

- `src/commands/eval.ts` - Sharing concurrency, org context fetching, sharing status updates
- `src/share.ts` - Added `silent` option to suppress CLI output
- `src/ui/evalRunner.tsx` - Added `shareContext` to options
- `src/ui/EvalApp.tsx` - Pass `shareContext` through
- `src/ui/evalBridge.ts` - Added `setSharingStatus` to controller
- `src/ui/contexts/EvalContext.tsx` - Added `sharingStatus` state and action
- `src/ui/components/eval/EvalScreen.tsx` - Display org/team context with spinner/URL
- `src/ui/components/table/useTableNavigation.ts` - Fix 'q' quit via stateRef
- `src/ui/components/table/ResultsTable.tsx` - Var column expand
- `src/ui/components/table/TableCell.tsx` - Visual differentiation
