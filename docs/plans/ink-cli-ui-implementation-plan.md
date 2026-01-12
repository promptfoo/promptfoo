# Ink CLI UI Implementation Plan: 6-PR Split Strategy

## Overview

This plan breaks PR #6611 (~46,000 lines, 199 files) into 6 incremental PRs that can be landed independently with feature flags.

**Key Principles:**

- Each PR delivers a complete vertical slice
- Feature flags enable gradual rollout
- Dependencies flow in one direction
- Each PR is independently reviewable in 1-4 hours

---

## PR Dependency Graph

```text
PR 1: Foundation
    │
    ▼
PR 2: Hooks/Utils/Shared
    │
    ├───────────────┬───────────────┐
    ▼               ▼               ▼
PR 3: Eval UI   PR 4: Aux UIs   PR 6: Redteam Generate
    │
    ▼
PR 5: Init Wizard (optional dependency on PR 3 patterns)
```

---

## PR 1: Foundation + Non-Interactive Fallback

**Branch:** `ink-ui/foundation`
**Size:** ~2,500 lines | **Risk:** Low | **Review:** 1-2 hours

### Files

```text
# Source files
src/ui/constants.ts
src/ui/interactiveCheck.ts
src/ui/render.ts
src/ui/index.ts
src/ui/noninteractive/index.ts
src/ui/noninteractive/progress.ts
src/ui/noninteractive/textOutput.ts

# Config changes
src/envars.ts                    # Add PROMPTFOO_ENABLE_INTERACTIVE_UI
src/cliState.ts                  # UI state tracking

# Tests
test/ui/noninteractive.test.ts
test/ui/render.test.ts

# Build config
tsconfig.json                    # jsx settings for Ink
vitest.config.ts                 # Test configuration
package.json                     # Ink dependencies
package-lock.json
```

### Package.json Dependencies

```json
{
  "dependencies": {
    "ink": "^6.0.0",
    "ink-text-input": "^6.0.0",
    "ink-spinner": "^5.0.0",
    "react": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "ink-testing-library": "^4.0.0"
  }
}
```

### Feature Flags

```typescript
// src/envars.ts
// Interactive UI is opt-in only
PROMPTFOO_ENABLE_INTERACTIVE_UI?: boolean;
```

### Key Implementation Details

**interactiveCheck.ts** - Core logic for determining if Ink UI can be used:

```typescript
// Opt-in check
export function isInteractiveUIEnabled(): boolean {
  return getEnvBool('PROMPTFOO_ENABLE_INTERACTIVE_UI');
}

// TTY check
export function canUseInteractiveUI(): boolean {
  return process.stdout.isTTY;
}

// Combined check - opt-in AND TTY required
export function shouldUseInkUI(): boolean {
  if (!isInteractiveUIEnabled()) return false;
  if (!canUseInteractiveUI()) return false;
  return true;
}
```

**render.ts** - Dynamic import to avoid loading React/Ink when used as library:

```typescript
export async function renderInkApp<P>(Component: React.ComponentType<P>, props: P): Promise<void> {
  const { render } = await import('ink');
  const React = await import('react');
  // ...
}
```

### Acceptance Criteria

- [ ] `shouldUseInkUI()` returns false by default (flag off)
- [ ] `shouldUseInkUI()` detects non-TTY environments
- [ ] `renderInkApp()` dynamically imports Ink only when called
- [ ] Non-interactive fallback renders plain text progress
- [ ] Build succeeds, no bundle size regression for library users
- [ ] All tests pass

### Rollback

Remove the files and revert package.json changes. No user-visible impact since feature is disabled.

---

## PR 2: Hooks + Utils + Shared Components

**Branch:** `ink-ui/hooks-utils-shared`
**Depends On:** PR 1
**Size:** ~5,000 lines | **Risk:** Low | **Review:** 2-3 hours

### Files

```text
# Hooks
src/ui/hooks/index.ts
src/ui/hooks/useKeypress.ts
src/ui/hooks/useSpinnerFrame.ts
src/ui/hooks/useTerminalSize.ts
src/ui/hooks/useTerminalTitle.ts
src/ui/hooks/useTokenMetrics.ts

# Utils
src/ui/utils/index.ts
src/ui/utils/clipboard.ts
src/ui/utils/export.ts
src/ui/utils/format.ts
src/ui/utils/history.ts
src/ui/utils/InkUITransport.ts
src/ui/utils/RingBuffer.ts
src/ui/utils/sparkline.ts

# Shared Components
src/ui/components/shared/index.ts
src/ui/components/shared/Badge.tsx
src/ui/components/shared/ErrorBoundary.tsx
src/ui/components/shared/ProgressBar.tsx
src/ui/components/shared/Spinner.tsx
src/ui/components/shared/StatusMessage.tsx

# Tests
test/ui/hooks/useTokenMetrics.test.ts
test/ui/format.test.ts
test/ui/utils/clipboard.test.ts
test/ui/utils/export.test.ts
test/ui/utils/history.test.ts
test/ui/utils/RingBuffer.test.ts
```

### Key Implementation Details

**useKeypress.ts** - Cross-platform keyboard handling:

```typescript
export function useKeypress(handler: (key: string, data: KeyData) => void) {
  useInput((input, key) => {
    // Normalize key events across platforms
    handler(input, { ...key, input });
  });
}
```

**RingBuffer.ts** - Efficient circular buffer for log storage:

```typescript
export class RingBuffer<T> {
  private buffer: T[];
  private head = 0;
  private size = 0;

  constructor(private capacity: number) {
    this.buffer = new Array(capacity);
  }
  // push(), toArray(), clear()
}
```

### Acceptance Criteria

- [ ] All hooks work in isolation (testable without full UI)
- [ ] Utils have no side effects on import
- [ ] Shared components render correctly in Ink
- [ ] ErrorBoundary catches and displays React errors
- [ ] All tests pass

### Rollback

Remove files. No user-visible impact since no command integrations yet.

---

## PR 3: Eval UI Core

**Branch:** `ink-ui/eval`
**Depends On:** PR 1, PR 2
**Size:** ~12,000 lines | **Risk:** Medium | **Review:** 4-6 hours

### Files

```text
# Contexts
src/ui/contexts/index.ts
src/ui/contexts/EvalContext.tsx
src/ui/contexts/UIContext.tsx

# State Machine
src/ui/machines/evalMachine.ts

# Bridge
src/ui/evalBridge.ts

# Main App
src/ui/EvalApp.tsx
src/ui/evalRunner.tsx

# Eval Components
src/ui/components/eval/index.ts
src/ui/components/eval/CompletionSummary.tsx
src/ui/components/eval/ErrorSummary.tsx
src/ui/components/eval/EvalHeader.tsx
src/ui/components/eval/EvalHelpOverlay.tsx
src/ui/components/eval/EvalScreen.tsx
src/ui/components/eval/HelpBar.tsx
src/ui/components/eval/LogPanel.tsx
src/ui/components/eval/MetricsSummary.tsx
src/ui/components/eval/ProviderDashboard.tsx
src/ui/components/eval/ProviderStatusList.tsx

# Table Components
src/ui/components/table/index.ts
src/ui/components/table/CellDetailOverlay.tsx
src/ui/components/table/CommandInput.tsx
src/ui/components/table/DetailsPanel.tsx
src/ui/components/table/ExportMenu.tsx
src/ui/components/table/filterUtils.ts
src/ui/components/table/HelpOverlay.tsx
src/ui/components/table/HistoryBrowser.tsx
src/ui/components/table/renderResultsTable.tsx
src/ui/components/table/ResultsTable.tsx
src/ui/components/table/rowComparison.ts
src/ui/components/table/SearchInput.tsx
src/ui/components/table/StatusBadge.tsx
src/ui/components/table/TableCell.tsx
src/ui/components/table/TableHeader.tsx
src/ui/components/table/TableRow.tsx
src/ui/components/table/types.ts
src/ui/components/table/useIndexedFilter.ts
src/ui/components/table/useLazyProcessedRows.ts
src/ui/components/table/useTableLayout.ts
src/ui/components/table/useTableNavigation.ts

# Command Integration
src/commands/eval.ts
src/evaluator.ts
src/types/index.ts
src/util/tokenUsage.ts

# Tests
test/ui/eval/evalRunner.test.ts
test/ui/EvalContext.test.ts
test/ui/machines/evalMachine.test.ts
test/ui/components/eval/EvalHelpOverlay.test.tsx
test/ui/components/table/CellDetailOverlay.test.ts
test/ui/components/table/CommandInput.test.ts
test/ui/components/table/DetailsPanel.test.tsx
test/ui/components/table/filterUtils.test.ts
test/ui/components/table/HelpOverlay.test.tsx
test/ui/components/table/performance.bench.ts
test/ui/components/table/ResultsTable.test.ts
test/ui/components/table/rowComparison.test.ts
test/ui/components/table/SearchInput.test.tsx
test/ui/components/table/types.test.ts
test/ui/components/table/useTableLayout.test.ts
test/ui/components/table/useTableNavigation.test.ts
test/ui/integration/EvalScreenIntegration.test.tsx

# Example
examples/ink-ui-test/promptfooconfig.yaml
examples/ink-ui-test/README.md
```

### Key Implementation Details

**eval.ts command integration:**

```typescript
// In doEval() function
if (shouldUseInkUI()) {
  const { runEvalWithInkUI } = await import('../ui/evalRunner.js');
  await runEvalWithInkUI(config, options);
} else {
  // Existing non-interactive evaluation
  await runEvaluation(config, options);
}
```

**evalBridge.ts** - Bridge between evaluator and UI:

```typescript
export class EvalBridge extends EventEmitter {
  // Events: 'progress', 'result', 'error', 'complete'
  // Methods: start(), abort(), getResults()
}
```

**EvalContext.tsx** - React context for eval state:

```typescript
export const EvalContext = createContext<EvalContextType | null>(null);

export function EvalProvider({ children, bridge }: Props) {
  const [state, send] = useMachine(evalMachine);
  // Sync bridge events to state machine
}
```

### CLI Flag

```bash
promptfoo eval --interactive          # Opt-in flag
PROMPTFOO_EXPERIMENTAL_INK=1 promptfoo eval  # Env-based opt-in
```

### Acceptance Criteria

- [ ] `promptfoo eval --interactive` launches Ink UI
- [ ] Eval progress displays in real-time
- [ ] Results table is navigable with keyboard
- [ ] Cell details show on Enter
- [ ] Export to JSON/CSV works
- [ ] Ctrl+C cleanly aborts evaluation
- [ ] Falls back to non-interactive on non-TTY
- [ ] All tests pass

### Manual Testing Checklist

- [ ] iTerm2 on macOS
- [ ] Terminal.app on macOS
- [ ] VS Code integrated terminal
- [ ] Windows Terminal
- [ ] SSH session (non-interactive fallback)

### Rollback

1. Revert `src/commands/eval.ts` changes
2. Remove UI files
3. Feature flag ensures no impact on existing users

---

## PR 4: Auxiliary UIs (Auth, Cache, List, Menu, Share)

**Branch:** `ink-ui/auxiliary`
**Depends On:** PR 1, PR 2
**Size:** ~6,000 lines | **Risk:** Low | **Review:** 2-3 hours

### Files

```text
# Auth UI
src/ui/auth/index.ts
src/ui/auth/AuthApp.tsx
src/ui/auth/authRunner.tsx

# Cache UI
src/ui/cache/index.ts
src/ui/cache/CacheApp.tsx
src/ui/cache/cacheRunner.tsx

# List UI
src/ui/list/index.ts
src/ui/list/ListApp.tsx
src/ui/list/listRunner.tsx

# Menu UI
src/ui/menu/index.ts
src/ui/menu/MenuApp.tsx
src/ui/menu/menuRunner.tsx

# Share UI
src/ui/share/index.ts
src/ui/share/ShareApp.tsx
src/ui/share/shareRunner.tsx

# Command Integrations
src/commands/auth.ts
src/commands/cache.ts
src/commands/list.ts
src/commands/menu.ts      # New file
src/commands/share.ts
src/share.ts

src/main.ts               # Register menu command

# Tests
test/ui/auth/AuthApp.test.tsx
test/ui/auth/authRunner.test.ts
test/ui/cache/cacheRunner.test.ts
test/ui/list/listRunner.test.ts
test/ui/menu/menuRunner.test.ts
test/ui/share/shareRunner.test.ts
```

### Key Implementation Details

Each auxiliary UI follows the same pattern:

```typescript
// xxxRunner.tsx
export async function runXxxWithInkUI(options: XxxOptions): Promise<void> {
  if (!shouldUseInkUI()) {
    // Fall back to existing implementation
    return runXxxNonInteractive(options);
  }

  const { renderInkApp } = await import('../render.js');
  const { XxxApp } = await import('./XxxApp.js');
  await renderInkApp(XxxApp, { options });
}
```

**Menu command** - New interactive menu for common operations:

```typescript
// src/commands/menu.ts
export function menuCommand(program: Command) {
  program
    .command('menu')
    .description('Interactive menu for promptfoo commands')
    .action(async () => {
      const { runMenuWithInkUI } = await import('../ui/menu/menuRunner.js');
      await runMenuWithInkUI();
    });
}
```

### Acceptance Criteria

- [ ] Each UI works independently
- [ ] Menu command is registered and functional
- [ ] All UIs fall back to non-interactive on non-TTY
- [ ] All tests pass

### Note: Can Be Split Further

If desired, this PR can be split into 5 smaller PRs (one per UI). Each is ~1,200 lines.

---

## PR 5: Init Wizard

**Branch:** `ink-ui/init-wizard`
**Depends On:** PR 1, PR 2
**Size:** ~18,000 lines | **Risk:** Medium | **Review:** 6-8 hours

### Files

```text
# Init Components
src/ui/init/index.ts
src/ui/init/initRunner.tsx
src/ui/init/redteamInitRunner.tsx
src/ui/init/components/index.ts
src/ui/init/components/InitApp.tsx
src/ui/init/components/RedteamInitApp.tsx

# Shared Init Components
src/ui/init/components/shared/index.ts
src/ui/init/components/shared/FilePreview.tsx
src/ui/init/components/shared/HierarchicalSelect.tsx
src/ui/init/components/shared/MultiSelect.tsx
src/ui/init/components/shared/NavigationBar.tsx
src/ui/init/components/shared/SearchableSelect.tsx
src/ui/init/components/shared/StepIndicator.tsx
src/ui/init/components/shared/TextInput.tsx

# Step Components
src/ui/init/components/steps/index.ts
src/ui/init/components/steps/ExampleStep.tsx
src/ui/init/components/steps/LanguageStep.tsx
src/ui/init/components/steps/PathStep.tsx
src/ui/init/components/steps/PreviewStep.tsx
src/ui/init/components/steps/ProviderStep.tsx
src/ui/init/components/steps/UseCaseStep.tsx

# Redteam Step Components
src/ui/init/components/steps/redteam/index.ts
src/ui/init/components/steps/redteam/PluginModeStep.tsx
src/ui/init/components/steps/redteam/PluginStep.tsx
src/ui/init/components/steps/redteam/PurposeStep.tsx
src/ui/init/components/steps/redteam/StrategyModeStep.tsx
src/ui/init/components/steps/redteam/StrategyStep.tsx
src/ui/init/components/steps/redteam/TargetLabelStep.tsx
src/ui/init/components/steps/redteam/TargetTypeStep.tsx

# Data
src/ui/init/data/plugins.ts
src/ui/init/data/providers.ts
src/ui/init/data/strategies.ts

# State Machines
src/ui/init/machines/initMachine.ts
src/ui/init/machines/initMachine.types.ts
src/ui/init/machines/redteamInitMachine.ts

# Utils
src/ui/init/utils/index.ts
src/ui/init/utils/configGenerator.ts
src/ui/init/utils/exampleDownloader.ts
src/ui/init/utils/fileWriter.ts

# Command Integrations
src/commands/init.ts
src/redteam/commands/init.ts
src/redteam/index.ts
src/redteam/types.ts

# Tests
test/ui/init/data/providers.test.ts
test/ui/init/machines/initMachine.test.ts
test/ui/init/machines/redteamInitMachine.test.ts
test/ui/init/redteamInitRunner.test.ts
test/ui/init/utils/configGenerator.test.ts
test/ui/init/utils/exampleDownloader.test.ts
test/ui/init/utils/fileWriter.test.ts
```

### Key Implementation Details

**State Machines (XState):**

```typescript
// initMachine.ts
export const initMachine = createMachine({
  id: 'init',
  initial: 'useCase',
  context: {
    /* wizard state */
  },
  states: {
    useCase: { on: { NEXT: 'language' } },
    language: { on: { NEXT: 'provider', BACK: 'useCase' } },
    provider: { on: { NEXT: 'example', BACK: 'language' } },
    example: { on: { NEXT: 'path', BACK: 'provider' } },
    path: { on: { NEXT: 'preview', BACK: 'example' } },
    preview: { on: { CONFIRM: 'writing', BACK: 'path' } },
    writing: { on: { DONE: 'complete' } },
    complete: { type: 'final' },
  },
});
```

### CLI Flags

```bash
PROMPTFOO_EXPERIMENTAL_INIT=1 promptfoo init     # Env-based opt-in
promptfoo init --interactive                      # CLI flag
```

### Acceptance Criteria

- [ ] Init wizard walks through all steps
- [ ] Navigation (back/forward) works
- [ ] Provider selection filters by language
- [ ] Generated config is valid YAML
- [ ] File preview shows before writing
- [ ] Redteam init wizard works separately
- [ ] Falls back to existing init on non-TTY
- [ ] All tests pass

### Note: Largest Component

This is 40% of the codebase. Consider:

1. Landing it last to get feedback on earlier UIs
2. Splitting into `init` and `redteam-init` if needed

---

## PR 6: Redteam Generate UI

**Branch:** `ink-ui/redteam-generate`
**Depends On:** PR 1, PR 2
**Size:** ~1,500 lines | **Risk:** Low | **Review:** 1 hour

### Files

```text
# Source
src/ui/redteamGenerate/index.ts
src/ui/redteamGenerate/RedteamGenerateApp.tsx
src/ui/redteamGenerate/redteamGenerateRunner.tsx

# Command Integration
src/redteam/commands/generate.ts

# Tests
test/ui/redteamGenerate/redteamGenerateRunner.test.ts
```

### Key Implementation Details

```typescript
// redteamGenerateRunner.tsx
export async function runRedteamGenerateWithInkUI(options: GenerateOptions): Promise<void> {
  if (!shouldUseInkUI()) {
    return runRedteamGenerateNonInteractive(options);
  }

  const { renderInkApp } = await import('../render.js');
  const { RedteamGenerateApp } = await import('./RedteamGenerateApp.js');
  await renderInkApp(RedteamGenerateApp, { options });
}
```

### Acceptance Criteria

- [ ] Progress display during generation
- [ ] Plugin status updates in real-time
- [ ] Clean abort on Ctrl+C
- [ ] Falls back on non-TTY
- [ ] All tests pass

---

## Git Workflow

### Creating the Split Branches

```bash
# Start from the feature branch
git checkout ink-ui
git pull origin ink-ui

# Create PR 1 branch
git checkout -b ink-ui/foundation
# Cherry-pick or reset to include only PR 1 files
git push -u origin ink-ui/foundation

# After PR 1 merges, create PR 2
git checkout main && git pull
git checkout -b ink-ui/hooks-utils-shared
# Add PR 2 files on top of main (which now has PR 1)
git push -u origin ink-ui/hooks-utils-shared

# Continue for PRs 3-6...
```

### Alternative: Stacked PRs with `git-stack` or `graphite`

```bash
# Using graphite
gt create ink-ui/foundation
# ... make changes
gt create ink-ui/hooks-utils-shared  # Stacked on foundation
# ... make changes
gt create ink-ui/eval  # Stacked on hooks-utils-shared
# ...
gt submit  # Creates all PRs with proper base branches
```

---

## Testing Strategy

### Per-PR Testing

| PR  | Unit Tests | Integration Tests | Manual Testing      |
| --- | ---------- | ----------------- | ------------------- |
| 1   | Yes        | No                | Basic TTY detection |
| 2   | Yes        | No                | Component rendering |
| 3   | Yes        | Yes               | Full eval flow      |
| 4   | Yes        | Light             | Each command        |
| 5   | Yes        | Yes               | Full wizard flow    |
| 6   | Yes        | Light             | Generate flow       |

### CI Requirements

All PRs must pass:

- [ ] `npm run build`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] Node.js 20, 22

### Manual Testing Matrix

| Environment | PR 3     | PR 4     | PR 5     | PR 6     |
| ----------- | -------- | -------- | -------- | -------- |
| iTerm2      | Required | Required | Required | Required |
| VS Code     | Required | Optional | Required | Optional |
| Windows     | Required | Optional | Optional | Optional |
| CI/Non-TTY  | Required | Required | Required | Required |

---

## Rollback Procedures

### Feature Flag Rollback (Instant)

```bash
# Disable for all users
export PROMPTFOO_EXPERIMENTAL_INK=0
```

### Code Rollback

Each PR can be reverted independently:

```bash
# Revert PR 3 (Eval UI)
git revert <pr3-merge-commit>
# Users fall back to non-interactive eval automatically
```

### Emergency Rollback

If critical issues after multiple PRs:

```bash
# Nuclear option: disable feature entirely
# 1. Set PROMPTFOO_EXPERIMENTAL_INK=0 default
# 2. Release patch version
npm version patch
npm publish
```

---

## Timeline Estimate

| Week | PRs        | Milestone                      |
| ---- | ---------- | ------------------------------ |
| 1    | PR 1, PR 2 | Foundation complete            |
| 2    | PR 3       | Eval UI (core value) available |
| 3    | PR 4, PR 6 | Auxiliary UIs complete         |
| 4    | PR 5       | Init wizard complete           |

**Total:** ~4 weeks for full feature rollout

---

## Open Questions

1. **Feature flag permanence:** Keep `PROMPTFOO_EXPERIMENTAL_INK` forever, or graduate to default after stabilization?

2. **Default behavior:** After stabilization, should Ink UI be:
   - Opt-in forever (safest)
   - Default for interactive terminals (most value)
   - Default everywhere (most aggressive)

3. **Init wizard priority:** Is PR 5 critical for initial launch, or can it wait until v2?

4. **Documentation:** Update docs with each PR, or batch in a final docs PR?

5. **PR 4 granularity:** Split into 5 PRs (one per UI), or keep as single PR?

---

## Success Metrics

After full rollout:

- [ ] Zero regressions in non-interactive mode
- [ ] <100ms startup overhead when feature disabled
- [ ] Positive user feedback on eval experience
- [ ] No increase in support tickets related to terminal issues
