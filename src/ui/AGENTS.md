# Terminal UI Module

Ink/React terminal UI components for promptfoo CLI's interactive mode.

## Architecture

```
src/ui/
├── index.ts              # Public exports
├── interactiveCheck.ts   # Opt-in logic for interactive UI
├── render.ts             # Ink rendering utilities
└── list/                 # Interactive list browser
    ├── ListApp.tsx       # Main list component
    ├── index.ts          # Module exports
    └── listRunner.tsx    # Entry point with dynamic imports
```

## Interactive UI: Opt-In Design

**Interactive UI is OPT-IN by default.** Users must explicitly enable it via:

- `PROMPTFOO_ENABLE_INTERACTIVE_UI=true` environment variable

**Requirements:**

- stdout must be a TTY (Ink requires this to render)

**Why opt-in?**

- Predictable behavior in scripts and CI pipelines
- No surprises when output is piped or redirected
- Backward compatibility with existing workflows
- Users choose when they want rich interactivity

**Detection logic** (`interactiveCheck.ts`):

```typescript
// Main entry point - checks opt-in AND TTY
shouldUseInkUI(): boolean {
  return isInteractiveUIEnabled() && canUseInteractiveUI();
}

// Did user opt in?
isInteractiveUIEnabled(): boolean {
  return process.env.PROMPTFOO_ENABLE_INTERACTIVE_UI === 'true';
}

// Can we physically use interactive UI?
canUseInteractiveUI(): boolean {
  return process.stdout.isTTY;
}
```

## Design Principles for CLI UI

### 1. Client-Side Filtering Over Server Round-Trips

Search and filter operations happen in-memory on already-loaded data. This provides instant feedback without network latency.

```typescript
// Good - filter loaded items locally
const filteredItems = useMemo(() => {
  if (!searchQuery.trim()) return items;
  return items.filter(
    (item) =>
      item.id.toLowerCase().includes(query) || item.description?.toLowerCase().includes(query),
  );
}, [items, searchQuery]);

// Avoid - server round-trip for each keystroke
const handleSearch = async (query) => {
  const results = await fetchFromServer(query); // Slow!
};
```

### 2. Color-Coded Status Indicators

Use consistent colors for status/severity across all components:

| Status         | Color    | Use Case                        |
| -------------- | -------- | ------------------------------- |
| Success/Good   | Green    | Pass rate ≥80%, success states  |
| Warning/Medium | Yellow   | Pass rate 50-79%, warnings      |
| Error/Bad      | Red      | Pass rate <50%, errors, redteam |
| Muted          | Gray/Dim | Secondary info, timestamps      |
| Highlight      | Cyan     | Selected items, headers         |

### 3. Rich Selection Feedback

When a user selects an item, provide actionable information:

```typescript
// Good - show details and next steps
logger.info(chalk.cyan.bold(`Eval: ${item.id}`));
logger.info(`Results: ${color(`${passRate}% passed`)}`);
logger.info(`View details: ${chalk.green(`promptfoo show eval ${item.id}`)}`);

// Avoid - minimal unhelpful output
logger.info(`Selected: ${item.id}`);
```

### 4. Responsive Terminal Layout

Components should adapt to terminal width:

```typescript
function EvalRow({ item, width }) {
  const fixedWidth = 56; // Reserved for ID, date, stats
  const descWidth = Math.max(15, width - fixedWidth);
  // ...
}
```

### 5. Virtual Scrolling with Context

Only render visible rows, but show scroll position:

```
Showing 1-10 of 150 items (more available)
```

### 6. Vim-Style Navigation

Support familiar keyboard shortcuts:

- `j/k` or `↑/↓`: Navigate
- `g/G`: Jump to start/end
- `PageUp/PageDown`: Page navigation
- `/`: Search
- `Enter`: Select
- `q` or `Esc`: Exit

## Dynamic Imports

**Critical:** Use dynamic imports for Ink/React to avoid loading them when promptfoo is used as a library:

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

// Bad - top-level import bloats library usage
import React from 'react';
import { ListApp } from './ListApp';
```

## Adding New Interactive Components

1. Create component in appropriate subdirectory (e.g., `src/ui/myfeature/`)
2. Use dynamic imports in the runner/entry point
3. Check `shouldUseInkUI()` before rendering
4. Add tests in `test/ui/`

## Testing

```bash
npx vitest run test/ui  # Run all UI tests
```

Mock environment variables to test different modes:

```typescript
beforeEach(() => {
  delete process.env.PROMPTFOO_ENABLE_INTERACTIVE_UI;
});

it('should be opt-in by default', () => {
  expect(shouldUseInkUI()).toBe(false);
});
```
