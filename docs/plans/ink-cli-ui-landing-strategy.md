# Incremental Landing Strategy: Ink CLI UI (PR #6611)

## Overview

PR #6611 introduces a comprehensive Ink-based interactive CLI UI system (+45,663 lines). This document outlines a strategy to land this large feature incrementally while minimizing risk and ensuring code quality.

## Current State

- **Branch**: `feat/ink-cli-ui`
- **Size**: +45,663 lines (33 new files in `src/ui/`)
- **Status**: All tests passing (11,545 tests), build passing, lint passing
- **Dependencies**: Ink v6, XState (both already in main)

## Architecture Summary

The UI system is well-architected with clear separation:

```
src/ui/
├── auth/              # Authentication flows
├── cache/             # Cache management
├── commands/          # Command infrastructure
├── components/        # Shared components (table, status bar, etc.)
├── hooks/             # React hooks (clipboard, keypress, terminal size)
├── init/              # promptfoo init wizard
│   ├── machines/      # XState state machines
│   ├── components/    # Step components
│   └── data/          # Plugin/strategy catalogs
├── list/              # Eval/prompt/dataset browser
├── redteamGenerate/   # Redteam generation progress
├── share/             # Share functionality
└── utils/             # Formatting, clipboard utilities
```

## Landing Options

### Option A: Single Large PR (Current Approach)

**Pros:**

- Feature is complete and cohesive
- Already reviewed and tested as a unit
- Avoids merge conflicts between incremental PRs

**Cons:**

- Large PR is harder to review thoroughly
- All-or-nothing - harder to roll back partially
- Risk of introducing multiple issues at once

**Recommendation:** This is acceptable given the PR is well-tested and the UI code is isolated. The dynamic import pattern means the UI code only loads when explicitly invoked.

### Option B: Phased Landing (Recommended)

Split into logical phases, each as a separate PR:

#### Phase 1: Core Infrastructure (Week 1)

```
src/ui/
├── hooks/             # useKeypress, useTerminalSize, useClipboard
├── utils/             # format.ts, clipboard.ts, colors.ts
└── commands/          # Command registry infrastructure
```

**Rationale:** These are foundational utilities with no user-facing changes. Low risk.

**PR Size:** ~3,000 lines

#### Phase 2: Shared Components (Week 1-2)

```
src/ui/components/
├── common/            # StatusBadge, ProgressBar
├── table/             # Table primitives, navigation hook
└── shared/            # TextInput, NavigationBar, StepIndicator
```

**Rationale:** Reusable components can be landed without enabling any features.

**PR Size:** ~8,000 lines

#### Phase 3: Init Wizard (Week 2)

```
src/ui/init/
├── machines/          # State machines for init flows
├── components/        # Step components
└── data/              # Plugin/strategy catalogs
```

**Feature Flag:** Can hide behind `PROMPTFOO_EXPERIMENTAL_INIT=1`

**PR Size:** ~15,000 lines

#### Phase 4: View Command Enhancement (Week 3)

```
src/ui/
├── list/              # Interactive browser
├── components/table/  # Full table with navigation
└── share/             # Share functionality
```

**Feature Flag:** Can use `--interactive` flag or `PROMPTFOO_INTERACTIVE=1`

**PR Size:** ~12,000 lines

#### Phase 5: Specialized UIs (Week 4)

```
src/ui/
├── auth/              # Auth flows
├── cache/             # Cache management
├── redteamGenerate/   # Generation progress
```

**PR Size:** ~7,000 lines

## Feature Flag Strategy

```typescript
// src/util/config.ts
export const EXPERIMENTAL_FLAGS = {
  INK_INIT: process.env.PROMPTFOO_EXPERIMENTAL_INIT === '1',
  INK_VIEW: process.env.PROMPTFOO_INTERACTIVE === '1' || process.argv.includes('--interactive'),
};
```

This allows:

1. Merging code without enabling features
2. Opt-in testing by users
3. Gradual rollout with easy rollback

## Risk Mitigation

### 1. Dynamic Imports

The UI uses dynamic imports throughout:

```typescript
// Good: Only loads Ink/React when needed
const { renderInk } = await import('../ui/render.js');
```

This ensures:

- Zero performance impact on library usage
- No bundle size increase for non-interactive use
- Graceful degradation if terminal doesn't support raw mode

### 2. Fallback Behavior

All new UIs should have non-interactive fallbacks:

```typescript
if (!isRawModeSupported() || !process.stdout.isTTY) {
  // Fall back to existing non-interactive behavior
  return runLegacyCommand();
}
```

### 3. Testing Strategy

- **Unit tests**: Already exist for components
- **Integration tests**: Add tests for command flows
- **Manual testing**: Test on different terminal emulators (iTerm2, Terminal.app, VSCode, Windows Terminal)

### 4. Rollback Plan

Each feature can be individually disabled:

```bash
# Emergency rollback
export PROMPTFOO_DISABLE_INK=1
```

## Recommended Approach

Given the current state (all tests passing, code well-isolated), I recommend:

1. **Land Phase 1 + 2 immediately** as a single "infrastructure" PR
   - No user-facing changes
   - Low risk
   - Establishes foundation

2. **Land Phase 3 (Init Wizard)** with feature flag
   - Most valuable feature
   - Well-tested state machines
   - Can be opt-in initially

3. **Land Phases 4-5** after gathering feedback from Phase 3

## Migration Checklist

Before each phase lands:

- [ ] All tests passing
- [ ] Lint clean
- [ ] Build successful
- [ ] Documentation updated
- [ ] Feature flag in place (if applicable)
- [ ] Fallback behavior verified
- [ ] Tested on major terminals

## Long-term Maintenance

After full landing:

1. Add Ink v6 to peerDependencies documentation
2. Create contribution guide for UI components
3. Add Storybook-like tool for component development
4. Consider extracting shared components to separate package

## Timeline Estimate

| Phase | Scope               | Risk   | Effort |
| ----- | ------------------- | ------ | ------ |
| 1     | Core Infrastructure | Low    | 2 days |
| 2     | Shared Components   | Low    | 3 days |
| 3     | Init Wizard         | Medium | 1 week |
| 4     | View Enhancement    | Medium | 1 week |
| 5     | Specialized UIs     | Low    | 3 days |

**Total: ~4 weeks** for incremental landing with thorough testing.

## Conclusion

The Ink CLI UI is well-architected and ready for landing. The phased approach provides safety while the single PR approach is also viable given the isolation. The key factors are:

1. **Code is isolated** - Dynamic imports prevent any impact on non-UI code paths
2. **Feature flags available** - Easy to disable if issues arise
3. **Comprehensive testing** - 11,545 tests all passing
4. **Clean architecture** - Clear separation of concerns

**Immediate next step**: Decide on single PR vs. phased approach and begin landing process.
