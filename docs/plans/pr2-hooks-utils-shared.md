# PR 2: Hooks + Utils + Shared Components

**Branch:** `ink-ui/hooks-utils-shared`
**Depends On:** PR 1 (Foundation + List UI) - ✅ Merged
**Size:** ~4,100 lines | **Risk:** Low | **Review:** 2-3 hours
**Status:** ✅ Implemented

## Overview

This PR adds the reusable building blocks for all future Ink UI components:

- **Hooks:** React hooks for keyboard input, terminal size, spinners
- **Utils:** Formatting, clipboard, export, history, ring buffer
- **Shared Components:** Badge, ErrorBoundary, ProgressBar, Spinner, StatusMessage

These are **pure additions** with no command integrations - they're leaf modules reused across all feature UIs (Eval, Init, Auth, etc.).

---

## Files to Add

### Hooks (`src/ui/hooks/`)

| File                  | Lines | Purpose                               |
| --------------------- | ----- | ------------------------------------- |
| `index.ts`            | 26    | Barrel exports                        |
| `useKeypress.ts`      | 232   | Cross-platform keyboard handling      |
| `useSpinnerFrame.ts`  | 83    | Animated spinner with multiple styles |
| `useTerminalSize.ts`  | 77    | Responsive terminal dimensions        |
| `useTerminalTitle.ts` | 54    | Set terminal window title             |
| **Total**             | 472   |                                       |

> **Note:** `useTokenMetrics.ts` was deferred to PR 3 (Eval UI Core) as it depends on `EvalContext`.

### Utils (`src/ui/utils/`)

| File                | Lines | Purpose                                    |
| ------------------- | ----- | ------------------------------------------ |
| `index.ts`          | 13    | Barrel exports                             |
| `clipboard.ts`      | 186   | Cross-platform clipboard operations        |
| `export.ts`         | 313   | Export results to JSON/CSV/HTML            |
| `format.ts`         | 236   | Format tokens, costs, latency, percentages |
| `history.ts`        | 206   | Command history with persistence           |
| `InkUITransport.ts` | 157   | Logger transport for Ink UI                |
| `RingBuffer.ts`     | 258   | Efficient circular buffer for log storage  |
| `sparkline.ts`      | 153   | Unicode sparkline charts for metrics       |
| **Total**           | 1,522 |                                            |

### Shared Components (`src/ui/components/shared/`)

| File                | Lines | Purpose                                    |
| ------------------- | ----- | ------------------------------------------ |
| `index.ts`          | 38    | Barrel exports                             |
| `Badge.tsx`         | 115   | Color-coded badges (PASS/FAIL, scores)     |
| `ErrorBoundary.tsx` | 154   | React error boundary for graceful failures |
| `ProgressBar.tsx`   | 148   | Horizontal progress bars                   |
| `Spinner.tsx`       | 90    | Animated loading spinners                  |
| `StatusMessage.tsx` | 117   | Success/error/warning messages             |
| **Total**           | 662   |                                            |

### Tests

| File                               | Lines | Coverage                    |
| ---------------------------------- | ----- | --------------------------- |
| `test/ui/format.test.ts`           | 223   | Format utilities            |
| `test/ui/utils/RingBuffer.test.ts` | 487   | Ring buffer (comprehensive) |
| `test/ui/utils/clipboard.test.ts`  | 299   | Clipboard operations        |
| `test/ui/utils/export.test.ts`     | 300   | Export functionality        |
| `test/ui/utils/history.test.ts`    | 106   | Command history             |
| **Total**                          | 1,415 |                             |

> **Note:** `useTokenMetrics.test.ts` deferred to PR 3 with the hook.

---

## Summary

| Category          | Files  | Lines      |
| ----------------- | ------ | ---------- |
| Hooks             | 5      | 472        |
| Utils             | 8      | 1,522      |
| Shared Components | 6      | 662        |
| Tests             | 5      | 1,415      |
| **Total**         | **24** | **~4,071** |

---

## Key Implementation Details

### useKeypress Hook

Cross-platform keyboard handling with vim-style key detection:

```typescript
export function useKeypress(handler: (key: KeyInfo) => void, options?: KeypressOptions): void;

interface KeyInfo {
  key: string; // The character
  raw: string; // Raw input
  ctrl: boolean; // Ctrl modifier
  meta: boolean; // Meta/Alt modifier
  shift: boolean; // Shift modifier
  name?: string; // Named keys: 'escape', 'return', etc.
}

// Higher-level hooks built on useKeypress:
export function useNavigationKeys(handlers: NavigationHandlers): void;
export function useConfirmKey(onConfirm: () => void): void;
export function useKeyHeld(targetKey: string, holdDuration: number): boolean;
```

### Format Utilities

Consistent formatting across the UI:

```typescript
formatTokens(12500); // "12.5k"
formatTokens(1500000); // "1.5M"
formatCost(0.0035); // "$0.0035"
formatCost(1.5); // "$1.50"
formatLatency(1500); // "1.5s"
formatPercent(0.847); // "84.7%"
truncate('long text', 10); // "long te..."
```

### RingBuffer

Efficient fixed-size circular buffer for log storage:

```typescript
const buffer = new RingBuffer<LogEntry>(1000);
buffer.push(entry); // O(1) - overwrites oldest if full
buffer.toArray(); // Get all entries in order
buffer.slice(-10); // Get last 10 entries
buffer.clear(); // Reset buffer
```

### Shared Components

#### Badge

```tsx
<Badge variant="success">PASS</Badge>
<Badge variant="error">FAIL</Badge>
<PassFail passed={true} />
<Score value={0.85} />
<CountBadge count={42} label="tests" />
```

#### ProgressBar

```tsx
<ProgressBar value={0.75} width={40} showPercent />
<InlineProgress current={7} total={10} />
```

#### StatusMessage

```tsx
<StatusMessage type="success">Evaluation complete!</StatusMessage>
<StatusMessage type="error">Failed to connect</StatusMessage>
<StatusMessage type="warning">Using cached results</StatusMessage>
<ErrorDisplay error={error} />
<WarningList warnings={['Warning 1', 'Warning 2']} />
```

#### Spinner

```tsx
<Spinner />
<Spinner type="dots" />
<StatusSpinner status="loading" message="Processing..." />
```

#### ErrorBoundary

```tsx
<ErrorBoundary fallback={<Text color="red">Something went wrong</Text>}>
  <MyComponent />
</ErrorBoundary>;

// Or as HOC
const SafeComponent = withErrorBoundary(MyComponent);
```

---

## Dependency Graph

```
PR 1: Foundation (merged)
├── interactiveCheck.ts
├── render.ts
└── index.ts

PR 2: Hooks/Utils/Shared (this PR)
├── hooks/
│   ├── useKeypress.ts      ← uses ink's useInput
│   ├── useSpinnerFrame.ts  ← pure React hook
│   ├── useTerminalSize.ts  ← uses render.ts
│   ├── useTerminalTitle.ts ← pure Node.js
│   └── useTokenMetrics.ts  ← pure React hook
├── utils/
│   ├── format.ts           ← pure functions
│   ├── clipboard.ts        ← Node.js APIs
│   ├── export.ts           ← Node.js fs
│   ├── history.ts          ← Node.js fs
│   ├── RingBuffer.ts       ← pure class
│   ├── sparkline.ts        ← pure functions
│   └── InkUITransport.ts   ← uses logger
└── components/shared/
    ├── Badge.tsx           ← uses ink
    ├── ErrorBoundary.tsx   ← uses React
    ├── ProgressBar.tsx     ← uses ink
    ├── Spinner.tsx         ← uses hooks/useSpinnerFrame
    └── StatusMessage.tsx   ← uses ink
```

---

## Implementation Steps

### 1. Create Branch

```bash
git checkout main && git pull origin main
git checkout -b ink-ui/hooks-utils-shared
```

### 2. Cherry-Pick/Copy from Feature Branch

```bash
# Option A: Cherry-pick if commits are clean
git cherry-pick <commit-hash>

# Option B: Copy files from feature branch
git show origin/feat/ink-cli-ui:src/ui/hooks/index.ts > src/ui/hooks/index.ts
# ... repeat for all files

# Option C: Diff and apply
git diff main..origin/feat/ink-cli-ui -- src/ui/hooks src/ui/utils src/ui/components/shared | git apply
```

### 3. Verify No Command Changes

This PR should NOT modify any files in:

- `src/commands/`
- `src/main.ts`
- `src/evaluator.ts`

### 4. Update Exports

Add exports to `src/ui/index.ts`:

```typescript
// Existing exports from PR 1
export { canUseInteractiveUI, isInteractiveUIEnabled, shouldUseInkUI } from './interactiveCheck';
export { getTerminalSize, renderInteractive, supportsColor } from './render';

// New exports from PR 2
export * from './hooks';
export * from './utils';
export * from './components/shared';
```

### 5. Run Tests

```bash
npm run build
npm run lint
npx vitest run test/ui
npm test
```

---

## Acceptance Criteria

- [ ] All hooks work in isolation (testable without full UI)
- [ ] Utils have no side effects on import
- [ ] Shared components render correctly in Ink
- [ ] ErrorBoundary catches and displays React errors gracefully
- [ ] RingBuffer handles edge cases (empty, full, overflow)
- [ ] Clipboard works on macOS, Linux, Windows (or fails gracefully)
- [ ] Export generates valid JSON/CSV
- [ ] Format functions handle edge cases (0, negative, very large numbers)
- [ ] No changes to command files
- [ ] All existing tests pass
- [ ] All new tests pass
- [ ] Build succeeds
- [ ] Lint clean

---

## Testing Checklist

### Unit Tests (Automated)

- [ ] `test/ui/format.test.ts` - Formatting edge cases
- [ ] `test/ui/hooks/useTokenMetrics.test.ts` - Token tracking
- [ ] `test/ui/utils/RingBuffer.test.ts` - Buffer operations
- [ ] `test/ui/utils/clipboard.test.ts` - Clipboard operations
- [ ] `test/ui/utils/export.test.ts` - Export formats
- [ ] `test/ui/utils/history.test.ts` - History persistence

### Manual Testing

- [ ] Components render in iTerm2
- [ ] Components render in VS Code terminal
- [ ] Spinner animates smoothly
- [ ] ProgressBar updates correctly
- [ ] Badge colors are visible

---

## Rollback

Remove files. No user-visible impact since no command integrations exist yet.

```bash
git revert <pr2-merge-commit>
```

---

## Notes

### Why These Components Together?

1. **No Dependencies Between Them:** Each hook/util/component is a leaf module
2. **Reused Everywhere:** All future UIs (Eval, Init, Auth) need these
3. **Easy to Review:** Pure additions with clear, focused functionality
4. **No User Impact:** Building blocks only - no command changes

### TextInput Location

The `TextInput` component currently lives in `src/ui/init/components/shared/` (from PR 1). It could be moved to `src/ui/components/shared/` in this PR, but since it's already functional and the init wizard will need it, we'll keep it in place. A future PR can consolidate if needed.

### Component Tests

The shared components don't have dedicated test files in the feature branch. Consider adding basic render tests:

```typescript
// test/ui/components/shared/Badge.test.tsx
describe('Badge', () => {
  it('renders with success variant', () => {
    const { lastFrame } = render(<Badge variant="success">PASS</Badge>);
    expect(lastFrame()).toContain('[PASS]');
  });
});
```

These could be added in this PR or a follow-up.

---

## PR Description Template

````markdown
## Summary

Adds reusable building blocks for the Ink-based interactive CLI:

- **Hooks**: Keyboard handling, terminal size, spinners, token metrics
- **Utils**: Formatting, clipboard, export, history, ring buffer, sparklines
- **Shared Components**: Badge, ErrorBoundary, ProgressBar, Spinner, StatusMessage

This is part of the [Ink CLI UI migration](#6611) - PR 2 of 6.

## Changes

- Add `src/ui/hooks/` - React hooks for Ink components
- Add `src/ui/utils/` - Utility functions for CLI UI
- Add `src/ui/components/shared/` - Reusable Ink components
- Add comprehensive tests for all modules

## Testing

```bash
npx vitest run test/ui
```
````

## Notes

- No command integrations - these are pure building blocks
- All modules use dynamic imports where appropriate
- Zero user-visible changes (opt-in UI not affected)

```

---

## Questions to Resolve

1. **Component tests:** Add basic render tests for shared components in this PR, or defer?
2. **Sparkline inclusion:** The sparkline util is nice-to-have - include or defer?
3. **InkUITransport:** This integrates with the logger - ensure it doesn't break anything when imported

---

## Next Steps After PR 2

With hooks, utils, and shared components in place, **PR 3 (Eval UI Core)** and **PR 4 (Auxiliary UIs)** can begin development in parallel since they both depend only on PR 1 + PR 2.
```
