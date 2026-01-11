# PR 1: Foundation + List UI (Revised Plan)

## Executive Summary

**Original PR 1:** Infrastructure-only, no user-facing value
**Revised PR 1:** Infrastructure + working `promptfoo list` command with Ink UI

| Metric       | Original  | Revised                 | Delta   |
| ------------ | --------- | ----------------------- | ------- |
| Source Lines | ~1,070    | ~2,050                  | +980    |
| Test Lines   | ~294      | ~470                    | +176    |
| Total Lines  | ~1,364    | ~2,520                  | +1,156  |
| User Value   | None      | **Interactive list UI** | +++     |
| Risk Level   | Low       | Low                     | =       |
| Review Time  | 1-2 hours | 2-3 hours               | +1 hour |

---

## User Experience After PR 1

### Before (Current Main Branch)

```bash
$ promptfoo list

┌──────────────────────────────────┬───────────────────────────┬────────────┬──────────────┐
│ eval id                          │ description               │ prompts    │ vars         │
├──────────────────────────────────┼───────────────────────────┼────────────┼──────────────┤
│ eval-2024-01-15T10:30:00         │ API testing               │ a1b2c3     │ query, model │
│ eval-2024-01-14T15:45:00         │ Prompt comparison         │ d4e5f6     │ input        │
└──────────────────────────────────┴───────────────────────────┴────────────┴──────────────┘

Run promptfoo show eval <id> to see details of a specific evaluation.
```

### After PR 1 (Interactive UI)

```bash
$ promptfoo list

┌─────────────────────────────────────────────────────────────────────────────────┐
│ Evaluations (42 items)                                                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│ Search: (press / to search)                                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│ ▶ eval-2024-01-15T10:30  API testing for new endpoints      today               │
│   eval-2024-01-14T15:45  Prompt comparison study            yesterday           │
│   eval-2024-01-13T09:00  Redteam security scan              2d ago      redteam │
│   eval-2024-01-12T14:20  Model benchmarking                 3d ago              │
│   eval-2024-01-11T11:00  Customer support prompts           4d ago              │
│   ...                                                                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│ Showing 1-10 of 42 (more available)                                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│ ↑↓/jk: navigate | Enter: select | /: search | r: refresh | q: quit             │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Key Features

| Feature                 | Description                                           |
| ----------------------- | ----------------------------------------------------- |
| **Keyboard Navigation** | Arrow keys, j/k (vim), Page Up/Down, g/G              |
| **Search**              | Press `/` to filter evals by description              |
| **Pagination**          | Auto-loads more items when scrolling                  |
| **Visual Indicators**   | Highlighted selection, relative dates, redteam badges |
| **Graceful Fallback**   | `--no-interactive` or pipe to disable                 |

---

## File Inventory

### Foundation Files (Original PR 1)

| File                                  | Lines     | Purpose                    |
| ------------------------------------- | --------- | -------------------------- |
| `src/ui/constants.ts`                 | 270       | UI configuration constants |
| `src/ui/interactiveCheck.ts`          | 96        | TTY/CI detection           |
| `src/ui/render.ts`                    | 216       | Lazy Ink rendering         |
| `src/ui/index.ts`                     | 116       | Module barrel exports      |
| `src/ui/noninteractive/index.ts`      | 14        | Non-interactive exports    |
| `src/ui/noninteractive/progress.ts`   | 176       | Plain-text progress        |
| `src/ui/noninteractive/textOutput.ts` | 151       | Structured text output     |
| `src/cliState.ts`                     | 31        | CLI state tracking         |
| **Subtotal**                          | **1,070** |                            |

### List UI Files (New for Option 2)

| File                                          | Lines   | Purpose                     |
| --------------------------------------------- | ------- | --------------------------- |
| `src/ui/list/ListApp.tsx`                     | 485     | Main List React component   |
| `src/ui/list/listRunner.tsx`                  | 115     | Runner with dynamic imports |
| `src/ui/list/index.ts`                        | 24      | Module exports              |
| `src/ui/init/components/shared/TextInput.tsx` | 184     | Shared text input component |
| **Subtotal**                                  | **808** |                             |

### Command Integration

| File                   | Lines Changed | Purpose            |
| ---------------------- | ------------- | ------------------ |
| `src/commands/list.ts` | +170          | Ink UI integration |
| **Subtotal**           | **170**       |                    |

### Test Files

| File                              | Lines   | Purpose               |
| --------------------------------- | ------- | --------------------- |
| `test/ui/render.test.ts`          | 112     | Render utility tests  |
| `test/ui/noninteractive.test.ts`  | 182     | Non-interactive tests |
| `test/ui/list/listRunner.test.ts` | 173     | List runner tests     |
| **Subtotal**                      | **467** |                       |

### Config Changes

| File                | Change                      |
| ------------------- | --------------------------- |
| `src/envars.ts`     | Add 3 environment variables |
| `tsconfig.json`     | Add `"jsx": "react-jsx"`    |
| `vitest.config.ts`  | Add `.tsx` file support     |
| `package.json`      | Add Ink/React dependencies  |
| `package-lock.json` | Dependency tree             |

---

## Complete File List for PR 1

```
# Foundation (Core Infrastructure)
src/ui/constants.ts
src/ui/interactiveCheck.ts
src/ui/render.ts
src/ui/index.ts
src/ui/noninteractive/index.ts
src/ui/noninteractive/progress.ts
src/ui/noninteractive/textOutput.ts
src/cliState.ts

# List UI (User-Facing Feature)
src/ui/list/ListApp.tsx
src/ui/list/listRunner.tsx
src/ui/list/index.ts
src/ui/init/components/shared/TextInput.tsx

# Command Integration
src/commands/list.ts

# Tests
test/ui/render.test.ts
test/ui/noninteractive.test.ts
test/ui/list/listRunner.test.ts

# Config
src/envars.ts
tsconfig.json
vitest.config.ts
package.json
package-lock.json

# Total: 18 files, ~2,520 lines
```

---

## Architecture

### Dependency Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    src/commands/list.ts                         │
│                           │                                     │
│                           ▼                                     │
│              ┌────────────────────────┐                         │
│              │   src/ui/list/         │                         │
│              │   ├── listRunner.tsx   │ ← Dynamic import entry  │
│              │   ├── ListApp.tsx      │ ← React component       │
│              │   └── index.ts         │                         │
│              └────────────┬───────────┘                         │
│                           │                                     │
│              ┌────────────┴───────────┐                         │
│              ▼                        ▼                         │
│  ┌─────────────────────┐  ┌──────────────────────────┐          │
│  │ src/ui/render.ts    │  │ src/ui/init/components/  │          │
│  │ (lazy Ink loading)  │  │ shared/TextInput.tsx     │          │
│  └─────────┬───────────┘  └──────────────────────────┘          │
│            │                                                    │
│            ▼                                                    │
│  ┌─────────────────────────────────┐                            │
│  │ src/ui/interactiveCheck.ts      │                            │
│  │ (TTY/CI detection)              │                            │
│  └─────────────────────────────────┘                            │
│                                                                 │
│  ┌─────────────────────────────────┐                            │
│  │ src/ui/constants.ts             │ ← Used by all components   │
│  └─────────────────────────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

### Dynamic Import Pattern

The key pattern that prevents bundle bloat:

```typescript
// src/ui/list/listRunner.tsx
export async function runInkList(options: ListRunnerOptions): Promise<ListResult> {
  // Dynamic imports - only loaded when called
  const [React, { renderInteractive }, { ListApp }] = await Promise.all([
    import('react'),
    import('../render'),
    import('./ListApp'),
  ]);

  // ... render the component
}
```

### Command Integration Pattern

```typescript
// src/commands/list.ts
import { runInkList, shouldUseInkList } from '../ui/list';

.action(async (cmdObj) => {
  // Check if Ink UI should be used
  if (cmdObj.interactive && shouldUseInkList()) {
    // Transform data for Ink UI
    const items: EvalItem[] = evals.map(evl => ({ ... }));

    // Run interactive UI
    const result = await runInkList({
      resourceType: 'evals',
      items,
    });

    // Handle selection
    if (result.selectedItem) {
      logger.info(`Selected: ${result.selectedItem.id}`);
    }
    return;
  }

  // Fall back to table output
  logger.info(wrapTable(tableData, columnWidths));
});
```

---

## CLI Flags and Environment Variables

### New CLI Option

```bash
# Disable interactive UI explicitly
promptfoo list --no-interactive

# Interactive UI is ON by default in TTY
promptfoo list
```

### Environment Variables

| Variable                           | Default | Purpose                        |
| ---------------------------------- | ------- | ------------------------------ |
| `PROMPTFOO_DISABLE_INTERACTIVE_UI` | `false` | Force non-interactive mode     |
| `PROMPTFOO_FORCE_INTERACTIVE_UI`   | `false` | Force interactive (even in CI) |

### Priority Order

1. `--no-interactive` flag → Disable
2. `PROMPTFOO_FORCE_INTERACTIVE_UI=true` → Enable (even in CI)
3. CI environment detected → Disable
4. `PROMPTFOO_DISABLE_INTERACTIVE_UI=true` → Disable
5. Default in TTY → Enable
6. Default when piped → Disable

---

## Testing Strategy

### Unit Tests

| Test                     | File                     | Coverage                             |
| ------------------------ | ------------------------ | ------------------------------------ |
| TTY detection            | `render.test.ts`         | `shouldUseInteractiveUI()`           |
| CI detection             | `render.test.ts`         | `shouldUseInkUI()`                   |
| Force flags              | `render.test.ts`         | `isInteractiveUIForced()`            |
| Color support            | `render.test.ts`         | `supportsColor()`                    |
| Non-interactive progress | `noninteractive.test.ts` | `NonInteractiveProgress`             |
| Non-interactive spinner  | `noninteractive.test.ts` | `NonInteractiveSpinner`              |
| Text output              | `noninteractive.test.ts` | `TextOutput`                         |
| List runner              | `listRunner.test.ts`     | `shouldUseInkList()`, `runInkList()` |

### Manual Testing Matrix

| Scenario                | Command                                              | Expected                       |
| ----------------------- | ---------------------------------------------------- | ------------------------------ |
| TTY terminal            | `promptfoo list`                                     | Interactive UI                 |
| Piped output            | `promptfoo list \| cat`                              | Table output                   |
| CI environment          | `CI=true promptfoo list`                             | Table output                   |
| Force interactive in CI | `PROMPTFOO_FORCE_INTERACTIVE_UI=true promptfoo list` | Interactive UI                 |
| Explicit disable        | `promptfoo list --no-interactive`                    | Table output                   |
| List prompts            | `promptfoo list prompts`                             | Interactive UI (prompts view)  |
| List datasets           | `promptfoo list datasets`                            | Interactive UI (datasets view) |

### Terminal Compatibility

| Terminal                    | Status          |
| --------------------------- | --------------- |
| iTerm2 (macOS)              | Required        |
| Terminal.app (macOS)        | Required        |
| VS Code integrated terminal | Required        |
| Windows Terminal            | Recommended     |
| SSH session                 | Should fallback |
| tmux/screen                 | Should work     |

---

## Acceptance Criteria

### Infrastructure

- [ ] `shouldUseInkUI()` returns `false` by default (in CI)
- [ ] `shouldUseInkUI()` returns `true` in TTY terminals
- [ ] `shouldUseInkUI()` respects `PROMPTFOO_FORCE_INTERACTIVE_UI`
- [ ] `renderInteractive()` dynamically imports Ink
- [ ] `NonInteractiveProgress` outputs at threshold intervals
- [ ] Signal handlers set correct exit codes (130, 143)

### List UI

- [ ] `promptfoo list` shows interactive eval list in TTY
- [ ] `promptfoo list prompts` shows interactive prompt list
- [ ] `promptfoo list datasets` shows interactive dataset list
- [ ] Arrow keys / j/k navigate the list
- [ ] Enter selects an item and shows ID
- [ ] `/` activates search mode
- [ ] `q` or Escape exits
- [ ] `r` refreshes the list
- [ ] `--no-interactive` falls back to table
- [ ] Piped output falls back to table
- [ ] CI environment falls back to table

### Build & Test

- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] No bundle size regression for library users

---

## Git Commands to Create PR 1

```bash
# Start from the feature branch
git checkout ink-ui
git pull origin ink-ui

# Create PR 1 branch
git checkout -b ink-ui/foundation-with-list

# If using cherry-pick approach, cherry-pick relevant commits
# Or use git reset/checkout to include only PR 1 files

# Verify files match the inventory
git diff --name-only origin/main...HEAD

# Run tests
npm run build && npm test

# Push branch
git push -u origin ink-ui/foundation-with-list

# Create PR
gh pr create --title "feat(ui): Add Ink-based interactive list UI" \
  --body "## Summary
- Add foundation for Ink-based CLI UI
- Implement interactive \`promptfoo list\` command
- Support keyboard navigation, search, pagination
- Graceful fallback for CI/non-TTY environments

## Usage
\`\`\`bash
# Interactive mode (default in TTY)
promptfoo list

# Non-interactive mode
promptfoo list --no-interactive
\`\`\`

## Feature Flags
- \`PROMPTFOO_FORCE_INTERACTIVE_UI=true\` - Force interactive in CI
- \`PROMPTFOO_DISABLE_INTERACTIVE_UI=true\` - Disable everywhere

## Test Plan
- [ ] Test in iTerm2
- [ ] Test in VS Code terminal
- [ ] Test piped output falls back
- [ ] Test --no-interactive flag
"
```

---

## Rollback Procedures

### Quick Disable (No Code Change)

```bash
# Users can disable immediately via environment variable
export PROMPTFOO_DISABLE_INTERACTIVE_UI=true
```

### Code Revert

```bash
# Revert the entire PR
git revert <pr1-merge-commit>

# Or revert just the list.ts changes to restore old behavior
git checkout main -- src/commands/list.ts
```

### Risk Assessment

| Risk                     | Likelihood | Impact | Mitigation               |
| ------------------------ | ---------- | ------ | ------------------------ |
| Ink crashes in edge case | Low        | Low    | Falls back to table      |
| TTY detection wrong      | Low        | Low    | `--no-interactive` flag  |
| Performance issue        | Very Low   | Medium | Non-interactive fallback |
| Bundle size regression   | Low        | Medium | Dynamic imports          |

---

## PR Description Template

````markdown
## Summary

Add foundation for Ink-based interactive CLI UI with a working `promptfoo list` command.

### What's Included

**Infrastructure:**

- Environment detection (TTY, CI, feature flags)
- Lazy Ink/React loading (no bundle impact for library users)
- Non-interactive fallback utilities
- Signal handling with proper exit codes

**User-Facing Feature:**

- Interactive `promptfoo list` command with keyboard navigation
- Search functionality (press `/`)
- Pagination with auto-loading
- Support for evals, prompts, and datasets views

### Usage

```bash
# Interactive mode (default in TTY)
promptfoo list
promptfoo list prompts
promptfoo list datasets

# Non-interactive mode
promptfoo list --no-interactive
```
````

### Screenshots

[Add screenshot of interactive list UI here]

### Test Plan

- [x] Unit tests for all utilities
- [x] Integration tests for list runner
- [ ] Manual test in iTerm2
- [ ] Manual test in VS Code terminal
- [ ] Manual test with piped output
- [ ] Manual test with --no-interactive

### Feature Flags

| Variable                           | Default | Purpose                 |
| ---------------------------------- | ------- | ----------------------- |
| `PROMPTFOO_DISABLE_INTERACTIVE_UI` | `false` | Force table output      |
| `PROMPTFOO_FORCE_INTERACTIVE_UI`   | `false` | Force interactive in CI |

```

---

## What's Left for Future PRs

After PR 1 merges, remaining PRs can build on this foundation:

| PR | What It Adds | Dependencies |
|----|-------------|--------------|
| PR 2 | Hooks, Utils, Shared Components | PR 1 |
| PR 3 | Eval UI (core feature) | PR 1, PR 2 |
| PR 4 | Auth, Cache, Menu, Share UIs | PR 1, PR 2 |
| PR 5 | Init Wizard | PR 1, PR 2 |
| PR 6 | Redteam Generate UI | PR 1, PR 2 |

**Note:** TextInput.tsx is placed in `src/ui/init/components/shared/` in the current branch. After PR 1 merges, PR 5 (Init Wizard) will use this component as-is. No duplication needed.
```
