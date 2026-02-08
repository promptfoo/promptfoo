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
| **Opt-In**              | Enable via `PROMPTFOO_ENABLE_INTERACTIVE_UI=true`     |
| **Keyboard Navigation** | Arrow keys, j/k (vim), Page Up/Down, g/G              |
| **Search**              | Press `/` to filter evals by description              |
| **Pagination**          | Auto-loads more items when scrolling                  |
| **Visual Indicators**   | Highlighted selection, relative dates, redteam badges |
| **Graceful Fallback**   | Non-TTY environments fall back to table output        |

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

```text
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

```text
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

## Environment Variable

Interactive UI is **opt-in**. Users must explicitly enable it:

| Variable                          | Default | Purpose                         |
| --------------------------------- | ------- | ------------------------------- |
| `PROMPTFOO_ENABLE_INTERACTIVE_UI` | `false` | Enable Ink-based interactive UI |

### How It Works

1. If `PROMPTFOO_ENABLE_INTERACTIVE_UI=true` → Check TTY
2. If stdout is a TTY → Use interactive UI
3. Otherwise → Use table output (non-interactive fallback)

```bash
# Enable interactive UI
PROMPTFOO_ENABLE_INTERACTIVE_UI=true promptfoo list evals

# Default behavior (table output)
promptfoo list evals
```

---

## Testing Strategy

### Unit Tests

| Test           | File                 | Coverage                             |
| -------------- | -------------------- | ------------------------------------ |
| TTY detection  | `render.test.ts`     | `canUseInteractiveUI()`              |
| Opt-in check   | `render.test.ts`     | `isInteractiveUIEnabled()`           |
| Combined check | `render.test.ts`     | `shouldUseInkUI()`                   |
| List runner    | `listRunner.test.ts` | `shouldUseInkList()`, `runInkList()` |

### Manual Testing Matrix

| Scenario                   | Command                                                        | Expected                      |
| -------------------------- | -------------------------------------------------------------- | ----------------------------- |
| Default (no env var)       | `promptfoo list evals`                                         | Table output                  |
| Interactive enabled in TTY | `PROMPTFOO_ENABLE_INTERACTIVE_UI=true promptfoo list evals`    | Interactive UI                |
| Interactive enabled, piped | `PROMPTFOO_ENABLE_INTERACTIVE_UI=true promptfoo list \| cat`   | Table output (no TTY)         |
| List prompts (enabled)     | `PROMPTFOO_ENABLE_INTERACTIVE_UI=true promptfoo list prompts`  | Interactive UI (prompts view) |
| List datasets (enabled)    | `PROMPTFOO_ENABLE_INTERACTIVE_UI=true promptfoo list datasets` | Interactive UI (datasets)     |

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

- [ ] `shouldUseInkUI()` returns `false` by default (opt-in)
- [ ] `shouldUseInkUI()` returns `true` when `PROMPTFOO_ENABLE_INTERACTIVE_UI=true` + TTY
- [ ] `renderInteractive()` dynamically imports Ink
- [ ] Signal handlers set correct exit codes (130, 143)

### List UI

- [ ] `promptfoo list evals` shows table by default
- [ ] `promptfoo list evals` with env var shows interactive UI in TTY
- [ ] `promptfoo list prompts` with env var shows interactive prompt list
- [ ] `promptfoo list datasets` with env var shows interactive dataset list
- [ ] Arrow keys / j/k navigate the list
- [ ] Enter selects an item and shows ID
- [ ] `/` activates search mode
- [ ] `q` or Escape exits
- [ ] `r` refreshes the list
- [ ] Piped output falls back to table (even with env var)

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
- Add foundation for Ink-based CLI UI (opt-in)
- Implement interactive \`promptfoo list\` command
- Support keyboard navigation, search, pagination
- Graceful fallback for non-TTY environments

## Usage
\`\`\`bash
# Enable interactive UI (opt-in)
PROMPTFOO_ENABLE_INTERACTIVE_UI=true promptfoo list evals

# Default behavior (table output)
promptfoo list evals
\`\`\`

## Environment Variable
- \`PROMPTFOO_ENABLE_INTERACTIVE_UI=true\` - Enable Ink-based interactive UI

## Test Plan
- [ ] Test with env var in iTerm2
- [ ] Test with env var in VS Code terminal
- [ ] Test piped output falls back to table
- [ ] Test default behavior (table output)
"
```

---

## Rollback Procedures

### Quick Disable (No Code Change)

Since interactive UI is opt-in, simply don't set the environment variable.
Default behavior is table output (non-interactive).

### Code Revert

```bash
# Revert the entire PR
git revert <pr1-merge-commit>

# Or revert just the list.ts changes to restore old behavior
git checkout main -- src/commands/list.ts
```

### Risk Assessment

| Risk                     | Likelihood | Impact | Mitigation                           |
| ------------------------ | ---------- | ------ | ------------------------------------ |
| Ink crashes in edge case | Low        | Low    | Falls back to table                  |
| TTY detection wrong      | Low        | Low    | Opt-in only, default is table output |
| Performance issue        | Very Low   | Medium | Non-interactive fallback             |
| Bundle size regression   | Low        | Medium | Dynamic imports                      |

---

## PR Description Template

````markdown
## Summary

Add foundation for Ink-based interactive CLI UI with a working `promptfoo list` command.

### What's Included

**Infrastructure:**

- Environment detection (TTY check)
- Opt-in via `PROMPTFOO_ENABLE_INTERACTIVE_UI=true`
- Lazy Ink/React loading (no bundle impact for library users)
- Non-interactive fallback (table output)
- Signal handling with proper exit codes

**User-Facing Feature:**

- Interactive `promptfoo list` command with keyboard navigation
- Search functionality (press `/`)
- Pagination with auto-loading
- Support for evals, prompts, and datasets views

### Usage

```bash
# Enable interactive mode (opt-in)
PROMPTFOO_ENABLE_INTERACTIVE_UI=true promptfoo list evals
PROMPTFOO_ENABLE_INTERACTIVE_UI=true promptfoo list prompts
PROMPTFOO_ENABLE_INTERACTIVE_UI=true promptfoo list datasets

# Default behavior (table output)
promptfoo list evals
```
````

### Screenshots

[Add screenshot of interactive list UI here]

### Test Plan

- [x] Unit tests for all utilities
- [x] Integration tests for list runner
- [ ] Manual test with env var in iTerm2
- [ ] Manual test with env var in VS Code terminal
- [ ] Manual test with piped output (should fall back to table)
- [ ] Manual test default behavior (table output)

### Environment Variable

| Variable                          | Default | Purpose                         |
| --------------------------------- | ------- | ------------------------------- |
| `PROMPTFOO_ENABLE_INTERACTIVE_UI` | `false` | Enable Ink-based interactive UI |

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
