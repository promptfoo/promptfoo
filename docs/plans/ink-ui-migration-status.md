# Ink CLI UI Migration Status

This document tracks the migration of promptfoo CLI commands to the new Ink-based interactive terminal UI.

## Overview

The Ink UI provides a rich, interactive terminal experience with features like:

- Keyboard navigation (vim-style: j/k, g/G, PageUp/PageDown)
- Real-time search/filtering
- Infinite scroll with lazy loading
- Color-coded status indicators
- Responsive terminal layouts

**Interactive UI is opt-in.** Users must explicitly enable it:

```bash
PROMPTFOO_ENABLE_INTERACTIVE_UI=true promptfoo list evals
```

## Command Migration Status

### Legend

- ✅ **Complete** - Ink UI implemented and working
- 🚧 **In Progress** - Currently being developed
- 📋 **Planned** - On roadmap for future PR
- ➖ **Not Applicable** - Command doesn't benefit from interactive UI

### Core Commands

| Command   | Subcommand | Status     | Notes                                       |
| --------- | ---------- | ---------- | ------------------------------------------- |
| `eval`    | -          | 📋 Planned | PR 3: Real-time progress, streaming results |
| `init`    | -          | 📋 Planned | PR 5: Multi-step wizard with state machine  |
| `view`    | -          | ➖ N/A     | Opens browser UI                            |
| `mcp`     | -          | ➖ N/A     | Server process                              |
| `redteam` | -          | 📋 Planned | PR 5: Uses init wizard components           |
| `share`   | -          | 📋 Planned | PR 4: Interactive share flow                |

### List Commands

| Command | Subcommand | Status      | Notes                               |
| ------- | ---------- | ----------- | ----------------------------------- |
| `list`  | `evals`    | ✅ Complete | Infinite scroll, search, pagination |
| `list`  | `prompts`  | ✅ Complete | Search, keyboard navigation         |
| `list`  | `datasets` | ✅ Complete | Search, keyboard navigation         |

### Auxiliary Commands

| Command      | Status     | Notes                                |
| ------------ | ---------- | ------------------------------------ |
| `auth`       | 📋 Planned | PR 4: Login/logout flow              |
| `cache`      | 📋 Planned | PR 4: Cache status display           |
| `code-scans` | ➖ N/A     | Analysis output                      |
| `config`     | ➖ N/A     | Simple key-value operations          |
| `debug`      | ➖ N/A     | Diagnostic output                    |
| `delete`     | ➖ N/A     | Destructive, confirmation via prompt |
| `export`     | ➖ N/A     | File output                          |
| `generate`   | 📋 Planned | PR 6: Progress during generation     |
| `feedback`   | ➖ N/A     | Simple text input                    |
| `import`     | ➖ N/A     | File input                           |
| `scan-model` | ➖ N/A     | Analysis output                      |
| `retry`      | ➖ N/A     | Batch operation                      |
| `validate`   | ➖ N/A     | Validation output                    |
| `show`       | ➖ N/A     | Display output                       |
| `help`       | ➖ N/A     | Static help text                     |

## Component Architecture

```
src/ui/
├── index.ts                    # Public exports
├── interactiveCheck.ts         # Opt-in detection logic
├── render.ts                   # Ink rendering utilities
│
├── list/                       # List browser component
│   ├── index.ts                # Module exports
│   ├── ListApp.tsx             # Main list component
│   └── listRunner.tsx          # Entry point with dynamic imports
│
└── init/                       # (Future) Init wizard components
    └── components/
        └── shared/
            └── TextInput.tsx   # Reusable text input component
```

### Core Infrastructure

| Module                | Purpose                                                            |
| --------------------- | ------------------------------------------------------------------ |
| `interactiveCheck.ts` | Determines if Ink UI should be used (opt-in check + TTY detection) |
| `render.ts`           | Ink rendering utilities, terminal size detection, cleanup handlers |
| `index.ts`            | Public API exports for command integration                         |

### List UI Components

| Component        | Purpose                                                               |
| ---------------- | --------------------------------------------------------------------- |
| `ListApp.tsx`    | Main list component with infinite scroll, search, keyboard navigation |
| `listRunner.tsx` | Entry point that handles dynamic imports and result handling          |

## Environment Variables

| Variable                          | Default | Description                     |
| --------------------------------- | ------- | ------------------------------- |
| `PROMPTFOO_ENABLE_INTERACTIVE_UI` | `false` | Enable Ink-based interactive UI |

## PR Roadmap

Based on the [PR split strategy](./ink-cli-ui-pr-split-audit.md):

| PR       | Scope                                    | Size          | Status                                                                  |
| -------- | ---------------------------------------- | ------------- | ----------------------------------------------------------------------- |
| **PR 1** | Foundation + List UI                     | ~4,500 lines  | ✅ Complete ([#6611](https://github.com/promptfoo/promptfoo/pull/6611)) |
| **PR 2** | Hooks + Utils + Shared Components        | ~5,000 lines  | 📋 Planned                                                              |
| **PR 3** | Eval UI Core (real-time progress)        | ~12,000 lines | 📋 Planned                                                              |
| **PR 4** | Auxiliary UIs (auth, cache, menu, share) | ~6,000 lines  | 📋 Planned                                                              |
| **PR 5** | Init Wizard                              | ~18,000 lines | 📋 Planned                                                              |
| **PR 6** | Redteam Generate UI                      | ~1,500 lines  | 📋 Planned                                                              |

## Design Principles

### 1. Opt-In by Default

Interactive UI requires explicit opt-in to ensure predictable behavior in scripts and CI pipelines.

### 2. Dynamic Imports

All Ink/React code is dynamically imported to prevent bundle bloat when promptfoo is used as a library:

```typescript
// Good - dynamic import
export async function runInkList(options) {
  const [React, { renderInteractive }, { ListApp }] = await Promise.all([
    import('react'),
    import('../render'),
    import('./ListApp'),
  ]);
  // ...
}
```

### 3. Graceful Fallback

Every interactive command has a non-interactive fallback (table output, plain text) for non-TTY environments.

### 4. Client-Side Filtering

Search and filter operations happen in-memory on loaded data for instant feedback without network latency.

### 5. Vim-Style Navigation

Consistent keyboard shortcuts across all interactive components:

- `j/k` or `↑/↓`: Navigate
- `g/G`: Jump to start/end
- `PageUp/PageDown`: Page navigation
- `/`: Search
- `Enter`: Select
- `q` or `Esc`: Exit

## Testing

```bash
# Enable interactive UI and test
PROMPTFOO_ENABLE_INTERACTIVE_UI=true npm run local -- list evals

# Run UI tests
npx vitest run test/ui
```

## Future Considerations

1. **Default Behavior**: After stabilization, consider making Ink UI the default for TTY environments
2. **Feature Flags**: Individual commands could have their own enable/disable flags
3. **Theming**: Support for custom color schemes
4. **Accessibility**: Screen reader support via Ink's accessibility features
