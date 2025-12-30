# Ink CLI Audit Report

**PR:** #6611 - feat(ui): add Ink-based interactive CLI for eval command
**Branch:** `feat/ink-cli-ui`
**Audit Date:** 2025-12-27
**Lines of Code:** ~14,000 (src/ui) + ~5,000 (test/ui)
**Test Status:** All 97 tests passing

---

## Executive Summary

This PR introduces a comprehensive React/Ink-based interactive CLI for the eval command. The implementation is **well-architected** with proper separation of concerns, good test coverage, and thoughtful UX. However, there are several bugs, anti-patterns, and areas for improvement that should be addressed before merging.

**Verdict:** Recommended to merge with fixes for critical issues and consideration of medium-priority items.

---

## Architecture Overview

### Strengths

1. **State Management**: Clean reducer-based state management using `useReducer` with proper action typing
2. **Separation of Concerns**: Clear separation between:
   - `EvalContext.tsx` - State management and reducer logic
   - `evalBridge.ts` - Bridge between evaluator events and UI state
   - `EvalApp.tsx` - Root app component with providers
   - Components (eval/, table/, shared/)
3. **Error Boundaries**: Proper React error boundary implementation to prevent full UI crashes
4. **Virtual Scrolling**: Efficient handling of large result sets (only renders ~25 visible rows)
5. **RingBuffer**: O(1) circular buffer for log storage preventing unbounded growth
6. **Event-Based Token Updates**: Efficient subscription pattern with debouncing

### Component Hierarchy

```
EvalApp
├── UIProvider (terminal dimensions, color mode)
├── EvalProvider (eval state, reducer)
│   ├── ErrorBoundary
│   └── EvalScreen
│       ├── TableHeader
│       ├── ProviderRow[] (memoized)
│       ├── SummaryLine
│       ├── ErrorDisplay
│       ├── LogPanel
│       └── HelpBar
└── ResultsTable (post-completion)
    ├── TableHeader
    ├── TableRow[]
    ├── SearchInput
    ├── CommandInput
    └── DetailsPanel
```

---

## Critical Issues (Must Fix)

### 1. Bug: `useState` with Function Reference Instead of Initializer

**File:** `src/ui/components/eval/EvalScreen.tsx:396`

```typescript
// CURRENT (BUG)
const [activityNow, setActivityNow] = useState(Date.now);

// SHOULD BE
const [activityNow, setActivityNow] = useState(() => Date.now());
```

**Impact:** `Date.now` (the function reference) is passed as initial state, not the result of calling it. This means `activityNow` is initially a function, not a number. React will call it once to get the initial value, but this is semantically incorrect and confusing.

**Severity:** Medium - Works by accident but is conceptually wrong and could break in edge cases.

### 2. Potential Race Condition: Debounced Updates After Unmount

**File:** `src/ui/hooks/useTokenMetrics.ts:114-118`

```typescript
debounceTimer.current = setTimeout(() => {
  flushUpdates();  // Could dispatch after unmount
  debounceTimer.current = null;
}, DEBOUNCE_MS);
```

**Impact:** If the component unmounts while a debounce timer is pending, `flushUpdates()` may dispatch to an unmounted component. The cleanup in the effect does clear the timer, but there's a race window.

**Fix:** Add a mounted ref check:
```typescript
const isMounted = useRef(true);
useEffect(() => () => { isMounted.current = false; }, []);
// Then in flushUpdates: if (!isMounted.current) return;
```

### 3. Direct `process.stdin` Usage Alongside Ink's `useInput`

**File:** `src/ui/components/eval/EvalScreen.tsx:418-450`

The component uses both `useNavigationKeys` (which internally uses Ink's `useInput`) and direct `process.stdin.on('data')` handlers. This can cause:
- Double-handling of keystrokes
- Unpredictable behavior when both handlers respond to the same key

**Recommendation:** Migrate all key handling to use the `useKeypress` hook consistently.

### 4. Blocking `execSync` for Clipboard Operations

**File:** `src/ui/utils/clipboard.ts:58`

```typescript
execSync(fullCommand, {
  input: text,
  // ...
});
```

**Impact:** For very large text (e.g., huge JSON exports), this blocks the Node.js event loop and freezes the UI.

**Fix:** Use `execFile` with async/await or a spawned process:
```typescript
const { execFile } = require('child_process');
await new Promise((resolve, reject) => {
  const child = execFile(command, args, ...);
  child.stdin.write(text);
  child.stdin.end();
  // ...
});
```

---

## Medium Priority Issues

### 5. Unused Variable with Underscore Prefix

**File:** `src/ui/components/eval/EvalScreen.tsx:390`

```typescript
const _compactMode = useCompactMode();
```

This suggests intent to use compact mode but it's currently unused. Either remove or implement.

### 6. Large Monolithic Reducer

**File:** `src/ui/contexts/EvalContext.tsx`

The reducer handles 15+ action types in a single switch statement (~200 lines). Consider splitting into:
- `providerReducer` - Provider-specific state
- `metricsReducer` - Token/cost metrics
- `uiReducer` - UI state (toggle, phase, etc.)

Then combine with a root reducer.

### 7. Overly Broad Type Casting

**File:** `src/ui/components/table/types.ts`

Several places use `any` or broad type assertions:
```typescript
output: any;  // Should be EvaluateResultOutput or similar
```

Tighten these types for better type safety.

### 8. Console-Style Terminal Title Setting in Render Path

**File:** `src/ui/utils/format.ts:170-176`

```typescript
export function setTerminalTitle(title: string): void {
  if (process.stdout.isTTY) {
    process.stdout.write(`\x1b]0;${title}\x07`);
  }
}
```

This is called from a `useEffect` which is fine, but the function writes directly to stdout which can interfere with Ink's rendering. Consider using Ink's `useStdout` or scheduling writes.

### 9. Missing Null Check in Provider ID Normalization

**File:** `src/ui/hooks/useTokenMetrics.ts:41-44`

```typescript
function normalizeProviderId(trackerId: string): string {
  const match = trackerId.match(/^(.+?)\s+\([^)]+\)$/);
  return match ? match[1] : trackerId;
}
```

If `trackerId` is empty string, the function returns empty string. This could cause issues with provider lookup. Add validation:
```typescript
if (!trackerId) return 'unknown';
```

### 10. `process.exit()` Direct Calls Skip Cleanup

**File:** `src/ui/render.ts:167, 177`

Direct `process.exit()` calls bypass normal cleanup including:
- Ink cleanup
- Logger transport removal
- Database connections

Consider using `app.exit()` from Ink and letting the process terminate naturally after cleanup.

---

## Minor Issues & Suggestions

### 11. Inconsistent Export Styles

Some files have both default and named exports:
```typescript
export function formatCost(...) { }
export default RingBuffer;  // Same file has named exports too
```

Pick one style for consistency.

### 12. `useKeyHeld` Hook Has Timeout-Based Implementation

**File:** `src/ui/hooks/useKeypress.ts:148-167`

The `useKeyHeld` hook sets a 100ms timeout to "release" the key since Ink doesn't provide key up events. This is a workaround but could cause issues for rapid key presses.

### 13. Magic Numbers

**File:** Various

Several magic numbers throughout:
- `ACTIVITY_THRESHOLD_MS = 500`
- `TICK_INTERVAL_MS = 250`
- `DEBOUNCE_MS = 100`
- `maxRows = 25`

Consider centralizing these in a config object or constants file.

### 14. Missing JSDoc on Some Public Functions

While many functions have excellent JSDoc, some public APIs lack documentation:
- `getVisibleRowRange`
- `calculateSummaryStats`
- Several component props interfaces

### 15. Test Coverage Gaps

While tests are comprehensive for utilities and reducers, there are gaps:
- No integration tests for the full Ink UI flow
- No tests for edge cases like:
  - Rapid navigation (key repeat)
  - Very large datasets (10,000+ rows)
  - Terminal resize during operation
  - Provider with special characters in name
- No tests for error scenarios in clipboard/export operations

---

## Security Considerations

### Good Practices Observed

1. **ANSI stripping in log display** (`InkUITransport.ts:65`)
2. **Proper input sanitization in search/filter**
3. **No eval() or dynamic code execution**
4. **Cross-platform clipboard uses stdio pipes, not shell injection**

### Potential Concerns

1. **Clipboard command injection** - While unlikely, if `text` contained shell metacharacters with certain edge cases:
   ```typescript
   execSync(fullCommand, { input: text, ... });
   ```
   This is generally safe because `input` is piped to stdin, not interpolated into the command. But verify edge cases.

2. **Terminal escape sequences** - The terminal title setting could theoretically be exploited if user-controlled content is passed. Currently only internal content is used.

---

## Performance Considerations

### Good Practices Observed

1. **Memoization** - `ProviderRow` uses `React.memo` with custom comparison
2. **RingBuffer** - O(1) operations for log storage
3. **Virtual scrolling** - Only 25 rows rendered at a time
4. **Debounced token updates** - Batches rapid updates

### Potential Concerns

1. **Large state updates** - Each `TEST_RESULT` action creates new provider object references, triggering re-renders
2. **Filter recalculation** - `filterRows` is called on every render (wrapped in `useMemo` but depends on processed rows)
3. **10,000 row limit** - The code has a safety limit but doesn't warn users when truncation occurs

---

## Recommendations Summary

### Before Merge (Critical)

1. Fix `useState(Date.now)` bug
2. Add mounted ref check in useTokenMetrics
3. Consolidate keyboard handling approach
4. Make clipboard operations async

### After Merge (Medium Priority)

5. Split large reducer into smaller focused reducers
6. Add integration tests for full UI flow
7. Tighten TypeScript types
8. Add constants file for magic numbers

### Consider for Future

9. Add performance benchmarks for large datasets
10. Consider React Query or similar for async state
11. Add telemetry for UI usage patterns
12. Consider accessibility (screen reader support)

---

## Testing Notes

```bash
# Run UI tests
npx vitest run test/ui/

# Manual testing
PROMPTFOO_INTERACTIVE_UI=true PROMPTFOO_FORCE_INTERACTIVE_UI=true \
  npm run local -- eval -c examples/simple/promptfooconfig.yaml --no-cache

# Test with high concurrency
PROMPTFOO_INTERACTIVE_UI=true npm run local -- eval \
  -c config.yaml --max-concurrency 20 --no-cache
```

---

## Conclusion

This is a well-implemented feature that significantly improves the CLI user experience. The architecture is sound, tests are comprehensive, and the code is generally clean. The critical issues identified are relatively minor and can be fixed with targeted changes.

The PR is recommended for merge after addressing the critical issues, with medium-priority items tracked as follow-up work.

---

## Prioritized Implementation Plan

This section provides a detailed, actionable roadmap for bug fixes, improvements, and future enhancements organized into phases with effort estimates and dependencies.

### Overview & Timeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 0          │  PHASE 1         │  PHASE 2        │  PHASE 3 & 4      │
│  Pre-Merge        │  Week 1-2        │  Week 3-4       │  Month 2+         │
│  ══════════       │  ════════        │  ════════       │  ═══════════      │
│  Critical Fixes   │  Stability       │  Refactoring    │  Enhancements     │
│  (4 tasks)        │  (8 tasks)       │  (6 tasks)      │  (10+ tasks)      │
│  ~4 hours         │  ~2-3 days       │  ~3-4 days      │  Ongoing          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Phase 0: Pre-Merge Critical Fixes

**Timeline:** Before PR merge
**Effort:** ~4 hours
**Risk:** Low - isolated fixes with clear scope

#### Task 0.1: Fix useState Initializer Bug

| Attribute | Value |
|-----------|-------|
| **Priority** | P0 - Critical |
| **Effort** | 5 minutes |
| **File** | `src/ui/components/eval/EvalScreen.tsx:396` |
| **Dependencies** | None |

**Change:**
```typescript
// Before
const [activityNow, setActivityNow] = useState(Date.now);

// After
const [activityNow, setActivityNow] = useState(() => Date.now());
```

**Acceptance Criteria:**
- [ ] Code compiles without warnings
- [ ] `activityNow` is a number on first render
- [ ] Activity indicators work correctly

---

#### Task 0.2: Add Mounted Ref Check in useTokenMetrics

| Attribute | Value |
|-----------|-------|
| **Priority** | P0 - Critical |
| **Effort** | 15 minutes |
| **File** | `src/ui/hooks/useTokenMetrics.ts` |
| **Dependencies** | None |

**Implementation:**
```typescript
export function useTokenMetrics(...) {
  // Add at top of hook
  const isMounted = useRef(true);

  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

  const flushUpdates = useCallback(() => {
    // Add guard at start of function
    if (!isMounted.current || pendingUpdates.current.size === 0) {
      return;
    }
    // ... rest of function
  }, [dispatch]);

  // ... rest of hook
}
```

**Acceptance Criteria:**
- [ ] No React warnings about unmounted component updates
- [ ] Token metrics still update correctly during evaluation
- [ ] Clean unmount with no memory leaks

---

#### Task 0.3: Consolidate Keyboard Handling

| Attribute | Value |
|-----------|-------|
| **Priority** | P0 - Critical |
| **Effort** | 1-2 hours |
| **File** | `src/ui/components/eval/EvalScreen.tsx:418-450` |
| **Dependencies** | Task 0.1 (avoid merge conflicts) |

**Current Problem:**
```typescript
// Two separate keyboard handlers running simultaneously
useNavigationKeys({ onEscape: ... });  // Uses Ink's useInput

useEffect(() => {
  process.stdin.on('data', handleInput);  // Direct stdin access
  // ...
}, []);
```

**Solution Options:**

**Option A (Recommended):** Extend `useNavigationKeys` to handle all keys
```typescript
// In useKeypress.ts - add onKey callback for arbitrary keys
export function useNavigationKeys(callbacks: {
  onUp?: () => void;
  // ... existing
  onKey?: (key: string) => void;  // Add catch-all
}, options?: KeypressOptions): void;

// In EvalScreen.tsx
useNavigationKeys({
  onEscape: () => { onExit?.(); exit(); },
  onKey: (key) => {
    switch (key.toLowerCase()) {
      case 'q': onExit?.(); exit(); break;
      case 'e': dispatch({ type: 'TOGGLE_ERROR_DETAILS' }); break;
      case 'v': /* toggle verbose */ break;
    }
  },
}, { isActive: isRawModeSupported && !inResultsPhase });
```

**Option B:** Use only `useKeypress` hook directly
```typescript
useKeypress((key) => {
  if (key.name === 'escape' || key.key === 'q') {
    onExit?.(); exit();
  }
  // ... handle all keys in one place
}, { isActive: isRawModeSupported && !inResultsPhase });
```

**Acceptance Criteria:**
- [ ] Only one keyboard handler active at a time
- [ ] All existing keyboard shortcuts still work
- [ ] No duplicate key handling
- [ ] ResultsTable keyboard navigation unaffected

---

#### Task 0.4: Make Clipboard Operations Async

| Attribute | Value |
|-----------|-------|
| **Priority** | P0 - Critical |
| **Effort** | 1-2 hours |
| **File** | `src/ui/utils/clipboard.ts` |
| **Dependencies** | None |

**Implementation:**
```typescript
import { spawn } from 'child_process';

export async function copyToClipboard(text: string): Promise<ClipboardResult> {
  const clipboardCmd = getClipboardCommand();

  if (!clipboardCmd) {
    return { success: false, error: 'Clipboard not available' };
  }

  const { command, args } = clipboardCmd;

  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });

    child.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        // Try xsel fallback on Linux
        if (process.platform === 'linux') {
          copyWithXsel(text).then(resolve);
        } else {
          resolve({ success: false, error: `Exit code ${code}` });
        }
      }
    });

    child.stdin.write(text);
    child.stdin.end();
  });
}

// Update callers to use await
// In ResultsTable.tsx:
const handleCopy = useCallback(async () => {
  const content = convertTableToFormat(data, 'json');
  const result = await copyToClipboard(content);
  // ...
}, [data]);
```

**Acceptance Criteria:**
- [ ] UI remains responsive during large clipboard operations
- [ ] Copy still works on macOS, Windows, and Linux
- [ ] Fallback to xsel on Linux works
- [ ] Error messages displayed to user on failure

---

### Phase 1: Stability & Polish

**Timeline:** Week 1-2 after merge
**Effort:** ~2-3 days
**Risk:** Low-Medium

#### Task 1.1: Remove or Implement Compact Mode

| Attribute | Value |
|-----------|-------|
| **Priority** | P1 |
| **Effort** | 30 minutes (remove) or 2-3 hours (implement) |
| **File** | `src/ui/components/eval/EvalScreen.tsx:390` |

**Decision Required:** Is compact mode needed?

**Option A: Remove (simpler)**
```typescript
// Delete this line
const _compactMode = useCompactMode();
```

**Option B: Implement**
- Use `isCompact` to adjust row layout
- Reduce column widths for narrow terminals
- Collapse provider details to summary

---

#### Task 1.2: Add Provider ID Null Check

| Attribute | Value |
|-----------|-------|
| **Priority** | P1 |
| **Effort** | 10 minutes |
| **File** | `src/ui/hooks/useTokenMetrics.ts:41-44` |

```typescript
function normalizeProviderId(trackerId: string): string {
  if (!trackerId || trackerId.trim() === '') {
    return 'unknown-provider';
  }
  const match = trackerId.match(/^(.+?)\s+\([^)]+\)$/);
  return match ? match[1] : trackerId;
}
```

**Add test:**
```typescript
it('should handle empty provider ID', () => {
  expect(normalizeProviderId('')).toBe('unknown-provider');
  expect(normalizeProviderId('  ')).toBe('unknown-provider');
});
```

---

#### Task 1.3: Graceful Exit Instead of process.exit()

| Attribute | Value |
|-----------|-------|
| **Priority** | P1 |
| **Effort** | 1-2 hours |
| **Files** | `src/ui/render.ts`, `src/ui/evalRunner.tsx` |

**Current:**
```typescript
process.exit(130);  // SIGINT
process.exit(143);  // SIGTERM
```

**Improved:**
```typescript
// In render.ts
export function createInkApp(...) {
  // Store exit handlers for graceful shutdown
  const exitHandlers: (() => Promise<void>)[] = [];

  const gracefulExit = async (code: number) => {
    // Run all cleanup handlers
    await Promise.all(exitHandlers.map(h => h().catch(() => {})));

    // Let Ink clean up
    app.unmount();

    // Then exit
    process.exitCode = code;
  };

  return {
    // ...
    onExit: (handler: () => Promise<void>) => exitHandlers.push(handler),
    exit: gracefulExit,
  };
}
```

---

#### Task 1.4: Terminal Title via Ink's useStdout

| Attribute | Value |
|-----------|-------|
| **Priority** | P2 |
| **Effort** | 30 minutes |
| **Files** | `src/ui/utils/format.ts`, `src/ui/components/eval/EvalScreen.tsx` |

```typescript
// Create a hook instead of direct function
export function useTerminalTitle(title: string | null) {
  const { stdout } = useStdout();

  useEffect(() => {
    if (!stdout?.isTTY || !title) return;

    // Use Ink's stdout reference
    stdout.write(`\x1b]0;${title}\x07`);

    return () => {
      stdout.write('\x1b]0;\x07');  // Clear on unmount
    };
  }, [stdout, title]);
}

// In EvalScreen.tsx
const titleText = isRunning
  ? `promptfoo: ${completedTests}/${state.totalTests} (${percent}%)`
  : null;
useTerminalTitle(titleText);
```

---

#### Task 1.5: Add Integration Tests

| Attribute | Value |
|-----------|-------|
| **Priority** | P1 |
| **Effort** | 4-6 hours |
| **Files** | `test/ui/integration/` (new directory) |
| **Dependencies** | Tasks 0.1-0.4 |

**Test Scenarios:**

```typescript
// test/ui/integration/evalFlow.test.ts
import { render } from 'ink-testing-library';

describe('Eval UI Integration', () => {
  it('should display progress during evaluation', async () => {
    const { lastFrame, stdin } = render(<EvalApp {...mockProps} />);

    // Simulate progress events
    mockController.init(10, ['openai:gpt-4'], 5);
    mockController.start();
    mockController.testResult({ passed: true, providerId: 'openai:gpt-4' });

    await waitFor(() => {
      expect(lastFrame()).toContain('1/10');
      expect(lastFrame()).toContain('openai:gpt-4');
    });
  });

  it('should handle keyboard navigation', async () => {
    const { lastFrame, stdin } = render(<ResultsTable {...mockData} />);

    // Press down arrow
    stdin.write('\x1B[B');
    expect(lastFrame()).toContain('Row 2/');

    // Press 'f' for fail filter
    stdin.write('f');
    expect(lastFrame()).toContain('Filter: failures');
  });

  it('should handle terminal resize', async () => {
    const { lastFrame, rerender } = render(<EvalApp {...mockProps} />);

    // Simulate resize
    process.stdout.columns = 60;
    process.stdout.emit('resize');

    await waitFor(() => {
      expect(lastFrame()).toContain('compact'); // or check layout
    });
  });
});
```

---

#### Task 1.6: Add Clipboard/Export Error Tests

| Attribute | Value |
|-----------|-------|
| **Priority** | P2 |
| **Effort** | 1-2 hours |
| **Files** | `test/ui/utils/clipboard.test.ts` (new) |

```typescript
describe('clipboard', () => {
  it('should handle missing clipboard command', async () => {
    vi.spyOn(child_process, 'spawn').mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const result = await copyToClipboard('test');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not available');
  });

  it('should try xsel fallback on Linux', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    // ... test fallback
  });
});
```

---

#### Task 1.7: Add Edge Case Tests

| Attribute | Value |
|-----------|-------|
| **Priority** | P2 |
| **Effort** | 2-3 hours |
| **Files** | Various test files |

**Test Cases to Add:**

```typescript
// Provider with special characters
it('should handle provider names with special chars', () => {
  const state = reducer(initialState, {
    type: 'INIT',
    payload: {
      totalTests: 10,
      providers: ['openai:gpt-4 (test)', 'provider/with:special@chars']
    }
  });
  expect(state.providerOrder).toHaveLength(2);
});

// Very large dataset
it('should handle 10000+ rows efficiently', () => {
  const largeData = generateMockData(10000);
  const start = performance.now();
  const result = processTableData(largeData, 250);
  const elapsed = performance.now() - start;
  expect(elapsed).toBeLessThan(1000); // < 1 second
});

// Rapid key presses
it('should debounce rapid navigation', () => {
  // Simulate 100 rapid down-arrow presses
  // Verify state only updates reasonable number of times
});
```

---

#### Task 1.8: Add JSDoc to Public APIs

| Attribute | Value |
|-----------|-------|
| **Priority** | P3 |
| **Effort** | 1-2 hours |
| **Files** | Various |

Functions needing documentation:
- `getVisibleRowRange`
- `calculateSummaryStats`
- `navigationReducer`
- Component props interfaces

---

### Phase 2: Code Quality & Refactoring

**Timeline:** Week 3-4 after merge
**Effort:** ~3-4 days
**Risk:** Medium (affects internal structure)

#### Task 2.1: Split EvalContext Reducer

| Attribute | Value |
|-----------|-------|
| **Priority** | P2 |
| **Effort** | 4-6 hours |
| **Files** | `src/ui/contexts/EvalContext.tsx` → multiple files |
| **Dependencies** | Phase 1 complete |

**New Structure:**
```
src/ui/contexts/
├── EvalContext.tsx         # Main context, combines reducers
├── reducers/
│   ├── index.ts           # Combine reducers
│   ├── phaseReducer.ts    # Phase/lifecycle state
│   ├── providerReducer.ts # Provider metrics
│   ├── metricsReducer.ts  # Token/cost aggregates
│   └── uiReducer.ts       # UI toggles (verbose, errors, etc.)
└── actions/
    └── types.ts           # Action type definitions
```

**Implementation Pattern:**
```typescript
// reducers/providerReducer.ts
export interface ProviderState {
  providers: Record<string, ProviderData>;
  providerOrder: string[];
}

export function providerReducer(
  state: ProviderState,
  action: ProviderAction
): ProviderState {
  switch (action.type) {
    case 'INIT_PROVIDERS': ...
    case 'TEST_RESULT': ...
    case 'UPDATE_TOKEN_METRICS': ...
  }
}

// reducers/index.ts
export function rootReducer(state: EvalState, action: EvalAction): EvalState {
  return {
    ...state,
    ...phaseReducer(state, action),
    ...providerReducer(state, action),
    ...metricsReducer(state, action),
    ...uiReducer(state, action),
  };
}
```

**Acceptance Criteria:**
- [ ] All existing tests pass
- [ ] Reducer logic identical (behavioral parity)
- [ ] Each sub-reducer has focused tests
- [ ] Type safety maintained

---

#### Task 2.2: Create Constants File

| Attribute | Value |
|-----------|-------|
| **Priority** | P2 |
| **Effort** | 1 hour |
| **Files** | `src/ui/constants.ts` (new) |

```typescript
// src/ui/constants.ts

/** UI Timing Constants */
export const TIMING = {
  /** Activity threshold for provider highlighting (ms) */
  ACTIVITY_THRESHOLD_MS: 500,
  /** Tick interval for elapsed time updates (ms) */
  TICK_INTERVAL_MS: 250,
  /** Debounce interval for token metric updates (ms) */
  TOKEN_DEBOUNCE_MS: 100,
  /** Notification auto-dismiss delay (ms) */
  NOTIFICATION_TIMEOUT_MS: 3000,
} as const;

/** Display Limits */
export const LIMITS = {
  /** Maximum visible rows in table */
  MAX_VISIBLE_ROWS: 25,
  /** Maximum cell content length before truncation */
  MAX_CELL_LENGTH: 250,
  /** Maximum errors to display */
  MAX_ERRORS_SHOWN: 5,
  /** Maximum rows before skipping Ink table */
  MAX_TABLE_ROWS: 10_000,
  /** Maximum log entries in RingBuffer */
  MAX_LOG_ENTRIES: 100,
} as const;

/** Column Widths */
export const COL_WIDTH = {
  status: 2,
  provider: 20,
  progress: 18,
  results: 14,
  tokens: 8,
  cost: 8,
  latency: 6,
} as const;
```

---

#### Task 2.3: Tighten TypeScript Types

| Attribute | Value |
|-----------|-------|
| **Priority** | P2 |
| **Effort** | 2-3 hours |
| **Files** | `src/ui/components/table/types.ts` and others |

**Changes:**

```typescript
// Before
output: any;

// After
import type { EvaluateResultOutput } from '../../../types';

export interface TableCellData {
  content: string;
  displayContent: string;
  status: CellStatus;
  isTruncated: boolean;
  output: EvaluateResultOutput;  // Proper type
}
```

**Files to Update:**
- `src/ui/components/table/types.ts`
- `src/ui/contexts/EvalContext.tsx` (action payloads)
- `src/ui/evalBridge.ts` (event types)

---

#### Task 2.4: Standardize Export Style

| Attribute | Value |
|-----------|-------|
| **Priority** | P3 |
| **Effort** | 1 hour |
| **Files** | All files in `src/ui/` |

**Convention:** Use named exports only (no default exports)

```typescript
// Before
export function formatCost(...) { }
export default RingBuffer;

// After
export function formatCost(...) { }
export { RingBuffer };  // or just: export class RingBuffer { }
```

---

#### Task 2.5: Extract TableRow Memoization

| Attribute | Value |
|-----------|-------|
| **Priority** | P2 |
| **Effort** | 1-2 hours |
| **File** | `src/ui/components/table/TableRow.tsx` |

Add custom comparison like `ProviderRow` has:

```typescript
export const TableRow = memo(
  function TableRow({ rowData, columns, isSelected, selectedCol }: TableRowProps) {
    // ... component
  },
  (prev, next) => {
    // Custom comparison for better performance
    if (prev.isSelected !== next.isSelected) return false;
    if (prev.selectedCol !== next.selectedCol) return false;
    if (prev.rowData.index !== next.rowData.index) return false;
    // Deep compare cells only if needed
    return prev.rowData.cells.every((cell, i) =>
      cell.status === next.rowData.cells[i].status &&
      cell.displayContent === next.rowData.cells[i].displayContent
    );
  }
);
```

---

#### Task 2.6: Add Performance Benchmarks

| Attribute | Value |
|-----------|-------|
| **Priority** | P3 |
| **Effort** | 2-3 hours |
| **Files** | `test/ui/benchmarks/` (new directory) |

```typescript
// test/ui/benchmarks/tablePerformance.bench.ts
import { bench, describe } from 'vitest';

describe('ResultsTable Performance', () => {
  bench('process 1000 rows', () => {
    processTableData(mockData1000, 250);
  });

  bench('process 10000 rows', () => {
    processTableData(mockData10000, 250);
  });

  bench('filter 10000 rows by status', () => {
    filterRows(processedData10000, { mode: 'failures', ... });
  });

  bench('filter with regex search', () => {
    filterRows(processedData, { searchQuery: '/error.*timeout/i', ... });
  });
});
```

---

### Phase 3: UX Enhancements

**Timeline:** Month 2+
**Effort:** Varies per feature
**Risk:** Low (additive features)

#### Task 3.1: Add Progress Persistence

| Attribute | Value |
|-----------|-------|
| **Priority** | P2 |
| **Effort** | 4-6 hours |

Show "Resuming from X/Y" when `--resume` is used, with visual indication of already-completed tests.

---

#### Task 3.2: Add Keyboard Shortcut Overlay

| Attribute | Value |
|-----------|-------|
| **Priority** | P3 |
| **Effort** | 2-3 hours |

Press `?` during evaluation to show full keyboard shortcuts in a modal overlay.

---

#### Task 3.3: Add Color Themes

| Attribute | Value |
|-----------|-------|
| **Priority** | P3 |
| **Effort** | 3-4 hours |

Support for different color themes via config or env var:
```yaml
ui:
  theme: dark  # or: light, high-contrast
```

---

#### Task 3.4: Add Sparkline for Latency

| Attribute | Value |
|-----------|-------|
| **Priority** | P3 |
| **Effort** | 2-3 hours |

Show latency trend as ASCII sparkline: `▁▂▃▅▆▇`

---

#### Task 3.5: Add Sound Notifications

| Attribute | Value |
|-----------|-------|
| **Priority** | P4 |
| **Effort** | 1-2 hours |

Optional terminal bell on completion/error:
```yaml
ui:
  sound: true  # Play terminal bell on completion
```

---

### Phase 4: Long-term Vision

**Timeline:** Quarter 2+
**These are exploratory and may require design discussion**

#### Task 4.1: Accessibility Support

- Screen reader compatibility
- High contrast mode
- Keyboard-only navigation improvements
- ARIA-like semantic annotations for Ink

---

#### Task 4.2: Telemetry for UI Usage

- Track which features are used
- Identify pain points
- Measure performance in real-world usage

---

#### Task 4.3: Plugin System for UI Extensions

Allow custom panels/widgets:
```typescript
// promptfooconfig.yaml
ui:
  plugins:
    - ./my-custom-panel.tsx
```

---

#### Task 4.4: Split View Mode

Side-by-side provider comparison during evaluation.

---

#### Task 4.5: Real-time Collaboration

WebSocket-based shared viewing of evaluation progress.

---

### Dependency Graph

```
Phase 0 (Pre-Merge)
├── 0.1 useState fix ─────────┐
├── 0.2 Mounted ref ──────────┼─→ Phase 1
├── 0.3 Keyboard handling ────┤
└── 0.4 Async clipboard ──────┘

Phase 1 (Stability)
├── 1.1 Compact mode ─────────┐
├── 1.2 Null check ───────────┤
├── 1.3 Graceful exit ────────┤
├── 1.4 Terminal title ───────┼─→ Phase 2
├── 1.5 Integration tests ←───┤
├── 1.6 Clipboard tests ──────┤
├── 1.7 Edge case tests ──────┤
└── 1.8 JSDoc ────────────────┘

Phase 2 (Refactoring)
├── 2.1 Split reducer ────────┐
├── 2.2 Constants file ───────┤
├── 2.3 TypeScript types ─────┼─→ Phase 3
├── 2.4 Export style ─────────┤
├── 2.5 Memoization ──────────┤
└── 2.6 Benchmarks ───────────┘

Phase 3+ (Enhancements)
└── Independent features, can be done in any order
```

---

### Risk Assessment

| Phase | Risk Level | Mitigation |
|-------|------------|------------|
| 0 | Low | Isolated fixes, easy rollback |
| 1 | Low-Medium | Feature flags for new behavior |
| 2 | Medium | Comprehensive test coverage before refactor |
| 3 | Low | Additive features, opt-in |
| 4 | High | Design review, prototyping first |

---

### Success Metrics

**Phase 0-1:**
- [ ] Zero regression in existing tests
- [ ] No new React warnings in console
- [ ] UI remains responsive with 1000+ test cases

**Phase 2:**
- [ ] Reducer test coverage > 90%
- [ ] TypeScript strict mode passes
- [ ] Bundle size unchanged (±5%)

**Phase 3+:**
- [ ] User feedback positive
- [ ] No performance regression
- [ ] Feature adoption metrics (via telemetry)

---

### Rollback Plan

Each phase can be rolled back independently:

- **Phase 0:** Revert specific commits
- **Phase 1:** Feature flags disable new behavior
- **Phase 2:** Keep old files until new ones proven stable
- **Phase 3+:** Features are opt-in, disable via config

---

### Monitoring Post-Merge

1. **Watch for issues tagged `ink-ui`**
2. **Monitor error reports in telemetry**
3. **Check CI for flaky UI tests**
4. **Gather user feedback via GitHub discussions**
