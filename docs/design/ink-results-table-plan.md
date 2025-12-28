# Ink Results Table Design Plan

## Executive Summary

This document outlines the design and implementation plan for migrating the CLI results table from `cli-table3` to a custom Ink-based React component. The goal is to provide a more flexible, testable, and visually polished table display that integrates seamlessly with the existing Ink UI infrastructure.

---

## 1. Current State Analysis

### Current Implementation (`src/table.ts`)

The existing `generateTable` function uses `cli-table3` with:

```typescript
// Key characteristics:
- Headers: variable names + prompt labels (with provider)
- Body: variable values + test outputs with PASS/FAIL/ERROR coloring
- Max 25 rows displayed
- Fixed column widths (terminal width / column count)
- Word wrapping enabled
- Text ellipsized at 250 characters per cell
```

### Data Structure (`EvaluateTable`)

```typescript
interface EvaluateTable {
  head: {
    prompts: CompletedPrompt[]; // { label, provider, id, raw, display }
    vars: string[]; // Variable column names
  };
  body: EvaluateTableRow[]; // Array of rows
}

interface EvaluateTableRow {
  outputs: EvaluateTableOutput[]; // One per prompt
  vars: string[]; // Variable values as strings
  test: AtomicTestCase;
  testIdx: number;
}

interface EvaluateTableOutput {
  pass: boolean;
  failureReason: ResultFailureReason; // ASSERT | UNKNOWN | NONE
  text: string; // The LLM output
  score: number;
  latencyMs: number;
  cost: number;
  // ... more fields
}
```

### Usage Context

The table is displayed:

1. After evaluation completes (if `--table` flag is set)
2. When `<500` total tests (performance consideration)
3. In non-debug log level

---

## 2. Design Goals

### Primary Goals

| Goal              | Description                                      | Priority |
| ----------------- | ------------------------------------------------ | -------- |
| **Visual Polish** | Colored PASS/FAIL/ERROR badges, better alignment | High     |
| **Responsive**    | Adapt to terminal width, handle narrow terminals | High     |
| **Scrollable**    | Support viewing more than 25 rows interactively  | Medium   |
| **Testable**      | Unit-testable with ink-testing-library           | High     |
| **Keyboard Nav**  | Arrow keys to navigate, Enter to expand cell     | Medium   |

### Non-Goals

- Replace the web UI's ResultsTable component
- Support complex nested data visualization
- Real-time streaming of results during eval (handled by ProviderDashboard)

---

## 3. Proposed Architecture

### Component Hierarchy

```
src/ui/components/
├── table/
│   ├── ResultsTable.tsx      # Main table component
│   ├── TableHeader.tsx       # Column headers
│   ├── TableRow.tsx          # Single data row
│   ├── TableCell.tsx         # Cell with truncation/expansion
│   ├── StatusBadge.tsx       # PASS/FAIL/ERROR badge
│   ├── ScrollableTable.tsx   # Wrapper with vertical scrolling
│   └── types.ts              # Table-specific types
```

### Key Components

#### 1. `ResultsTable` - Main Container

```tsx
interface ResultsTableProps {
  data: EvaluateTable;
  maxRows?: number; // Default: 25
  maxCellLength?: number; // Default: 250
  showIndex?: boolean; // Show row numbers
  interactive?: boolean; // Enable keyboard navigation
  onRowSelect?: (row: EvaluateTableRow) => void;
}
```

#### 2. `TableHeader` - Column Headers

```tsx
// Displays: [#] | Var1 | Var2 | ... | [Provider1] Prompt1 | [Provider2] Prompt2 | ...
// Features:
// - Blue/bold styling
// - Truncation with ellipsis
// - Responsive column widths
```

#### 3. `TableCell` - Individual Cells

```tsx
interface TableCellProps {
  content: string;
  maxWidth: number;
  type: 'var' | 'output';
  status?: 'pass' | 'fail' | 'error';
  isSelected?: boolean;
  onExpand?: () => void;
}

// Features:
// - Truncation with '...'
// - Status-based coloring
// - Expandable on selection (shows full content)
```

#### 4. `StatusBadge` - PASS/FAIL/ERROR Indicator

```tsx
// [PASS] - Green
// [FAIL] - Red
// [ERROR] - Red, bold
// Uses existing format.ts utilities
```

---

## 4. Layout Strategy

### Column Width Calculation

```typescript
function calculateColumnWidths(
  terminalWidth: number,
  varCount: number,
  promptCount: number,
  showIndex: boolean,
): { indexWidth: number; varWidths: number[]; outputWidths: number[] } {
  const totalColumns = (showIndex ? 1 : 0) + varCount + promptCount;
  const borderOverhead = totalColumns + 1; // '|' separators
  const availableWidth = terminalWidth - borderOverhead;

  // Strategy:
  // 1. Index column: fixed 4 chars (e.g., " 23 ")
  // 2. Variable columns: min 10, max 30 each
  // 3. Output columns: remaining space, distributed evenly
  // 4. If terminal too narrow, show warning and truncate aggressively
}
```

### Responsive Breakpoints

| Terminal Width | Behavior                                           |
| -------------- | -------------------------------------------------- |
| `< 60`         | Show warning, single-column mode (stacked view)    |
| `60-100`       | Compact mode: truncate aggressively, fewer columns |
| `100-160`      | Normal mode: balanced column widths                |
| `> 160`        | Wide mode: generous cell widths                    |

### Compact Mode (Narrow Terminals)

When terminal is too narrow for columns, show a stacked card view:

```
┌─ Test #1 ─────────────────────────────┐
│ Vars: question="What is 2+2?"         │
│ ──────────────────────────────────────│
│ [openai:gpt-4] [PASS]                 │
│ The answer is 4.                      │
│ ──────────────────────────────────────│
│ [anthropic:claude-3] [FAIL]           │
│ I cannot answer math questions...     │
└───────────────────────────────────────┘
```

---

## 5. Interactive Features

### Keyboard Navigation

| Key            | Action                                   |
| -------------- | ---------------------------------------- |
| `↑` / `↓`      | Navigate rows                            |
| `←` / `→`      | Navigate cells horizontally              |
| `Enter`        | Expand selected cell (show full content) |
| `Escape`       | Collapse expanded cell / exit table      |
| `q`            | Exit table view                          |
| `g` / `G`      | Go to first/last row                     |
| `Page Up/Down` | Jump 10 rows                             |

### Row Selection State

```typescript
interface TableState {
  selectedRow: number;
  selectedCol: number;
  expandedCell: { row: number; col: number } | null;
  scrollOffset: number; // For virtual scrolling
}
```

### Expanded Cell View

When a cell is expanded, show a full-screen overlay:

```
┌─ Cell Details ─────────────────────────────────────────┐
│ Provider: openai:gpt-4                                 │
│ Status: FAIL                                           │
│ Score: 0.3                                             │
│ Latency: 1.2s                                          │
│ Cost: $0.0023                                          │
│ ───────────────────────────────────────────────────────│
│ Output:                                                │
│ This is the full LLM response that was truncated in    │
│ the table view. Now you can see the complete output    │
│ without any truncation...                              │
│ ───────────────────────────────────────────────────────│
│ Assertion Results:                                     │
│ • contains "expected text" - FAILED                    │
│ • llm-rubric: Is helpful? - Score: 0.3                │
│ ───────────────────────────────────────────────────────│
│                                    [Esc] Close         │
└────────────────────────────────────────────────────────┘
```

---

## 6. Rendering Strategy

### Virtual Scrolling for Large Tables

For tables with many rows, implement virtual scrolling:

```tsx
function useVirtualScroll(
  totalRows: number,
  visibleRows: number,
  selectedRow: number,
): { startIndex: number; endIndex: number } {
  // Only render rows that are visible
  // Keep a buffer of 2-3 rows above/below viewport
}
```

### Using Ink's `<Static>` Component

For performance, use `<Static>` for rows that have scrolled past:

```tsx
<Box flexDirection="column">
  {/* Static: Rows that have scrolled past */}
  <Static items={pastRows}>{(row) => <TableRow key={row.testIdx} {...row} />}</Static>

  {/* Dynamic: Currently visible rows */}
  {visibleRows.map((row) => (
    <TableRow key={row.testIdx} {...row} isVisible />
  ))}
</Box>
```

---

## 7. Integration Plan

### Phase 1: Core Table Component (Non-Interactive)

1. Create `ResultsTable` with basic rendering
2. Implement column width calculation
3. Add `StatusBadge` with coloring
4. Support truncation and ellipsis
5. Write unit tests with ink-testing-library

### Phase 2: Responsive Layout

1. Add `useTerminalSize` hook integration
2. Implement responsive breakpoints
3. Create compact/stacked mode for narrow terminals
4. Test on various terminal sizes

### Phase 3: Interactive Features

1. Add keyboard navigation with `useKeypress`
2. Implement row/cell selection
3. Create expanded cell overlay
4. Add virtual scrolling for large tables

### Phase 4: Integration

1. Create `generateInkTable` wrapper function
2. Update `eval` command to use Ink table in interactive mode
3. Keep `cli-table3` for non-interactive/piped output
4. Add tests for integration points

---

## 8. Implementation Details

### Suggested Component: `StatusBadge`

```tsx
import { Text } from 'ink';
import React from 'react';
import { ResultFailureReason } from '../../../types';

interface StatusBadgeProps {
  pass: boolean;
  failureReason: ResultFailureReason;
}

export function StatusBadge({ pass, failureReason }: StatusBadgeProps) {
  if (pass) {
    return <Text color="green">[PASS]</Text>;
  }

  if (failureReason === ResultFailureReason.ASSERT) {
    return <Text color="red">[FAIL]</Text>;
  }

  return (
    <Text color="red" bold>
      [ERROR]
    </Text>
  );
}
```

### Suggested Component: `TableCell`

```tsx
import { Box, Text } from 'ink';
import React from 'react';
import { truncate } from '../../utils/format';

interface TableCellProps {
  content: string;
  width: number;
  align?: 'left' | 'right' | 'center';
  status?: 'pass' | 'fail' | 'error' | null;
  isSelected?: boolean;
}

export function TableCell({ content, width, align = 'left', status, isSelected }: TableCellProps) {
  const displayContent = truncate(content.replace(/\n/g, ' '), width);

  const textColor =
    status === 'pass' ? 'green' : status === 'fail' || status === 'error' ? 'red' : undefined;

  return (
    <Box
      width={width}
      borderStyle={isSelected ? 'single' : undefined}
      borderColor={isSelected ? 'cyan' : undefined}
    >
      <Text color={textColor} wrap="truncate">
        {displayContent}
      </Text>
    </Box>
  );
}
```

### Suggested Hook: `useTableNavigation`

```tsx
import { useCallback, useState } from 'react';
import { useKeypress } from '../hooks/useKeypress';

interface TableNavigationState {
  selectedRow: number;
  selectedCol: number;
  expandedCell: { row: number; col: number } | null;
}

export function useTableNavigation(rowCount: number, colCount: number, isActive: boolean) {
  const [state, setState] = useState<TableNavigationState>({
    selectedRow: 0,
    selectedCol: 0,
    expandedCell: null,
  });

  useKeypress(
    {
      onUp: () =>
        setState((s) => ({
          ...s,
          selectedRow: Math.max(0, s.selectedRow - 1),
        })),
      onDown: () =>
        setState((s) => ({
          ...s,
          selectedRow: Math.min(rowCount - 1, s.selectedRow + 1),
        })),
      onLeft: () =>
        setState((s) => ({
          ...s,
          selectedCol: Math.max(0, s.selectedCol - 1),
        })),
      onRight: () =>
        setState((s) => ({
          ...s,
          selectedCol: Math.min(colCount - 1, s.selectedCol + 1),
        })),
      onEnter: () =>
        setState((s) => ({
          ...s,
          expandedCell: s.expandedCell
            ? null
            : {
                row: s.selectedRow,
                col: s.selectedCol,
              },
        })),
      onEscape: () => setState((s) => ({ ...s, expandedCell: null })),
    },
    isActive,
  );

  return state;
}
```

---

## 9. Testing Strategy

### Unit Tests

```typescript
import { render } from 'ink-testing-library';
import { ResultsTable } from './ResultsTable';

describe('ResultsTable', () => {
  const mockData: EvaluateTable = {
    head: {
      prompts: [{ label: 'Test Prompt', provider: 'openai' }],
      vars: ['question'],
    },
    body: [{
      testIdx: 0,
      vars: ['What is 2+2?'],
      outputs: [{
        pass: true,
        text: 'The answer is 4',
        failureReason: ResultFailureReason.NONE,
        // ...
      }],
    }],
  };

  it('renders table headers', () => {
    const { lastFrame } = render(<ResultsTable data={mockData} />);
    expect(lastFrame()).toContain('question');
    expect(lastFrame()).toContain('[openai] Test Prompt');
  });

  it('shows PASS badge for passing tests', () => {
    const { lastFrame } = render(<ResultsTable data={mockData} />);
    expect(lastFrame()).toContain('[PASS]');
  });

  it('truncates long cell content', () => {
    const longData = {
      ...mockData,
      body: [{
        ...mockData.body[0],
        outputs: [{
          ...mockData.body[0].outputs[0],
          text: 'A'.repeat(300),
        }],
      }],
    };
    const { lastFrame } = render(
      <ResultsTable data={longData} maxCellLength={50} />
    );
    expect(lastFrame()).toContain('...');
  });
});
```

### Snapshot Tests

```typescript
it('matches snapshot for standard table', () => {
  const { lastFrame } = render(<ResultsTable data={mockData} />);
  expect(lastFrame()).toMatchSnapshot();
});
```

---

## 10. Migration Path

### Backward Compatibility

Keep `cli-table3` for:

- Non-interactive mode (`!process.stdout.isTTY`)
- Piped output (`| less`, `> file.txt`)
- `--no-interactive` flag

### Detection Logic

```typescript
function shouldUseInkTable(): boolean {
  return (
    process.stdout.isTTY && !process.env.CI && !cmdObj.noInteractive && getLogLevel() !== 'debug'
  );
}
```

### Gradual Rollout

1. Add `--ink-table` flag for opt-in testing
2. Gather feedback from users
3. Make Ink table the default for interactive mode
4. Keep cli-table3 for non-interactive fallback

---

## 11. Open Questions

1. **Should we support horizontal scrolling?**
   - Adds complexity but useful for many columns
   - Alternative: Allow column selection/hiding

2. **Cell editing capability?**
   - Could allow re-running single test cases
   - Significant complexity increase

3. **Export from table view?**
   - "Press E to export visible rows to CSV"
   - Useful for quick data extraction

4. **Color themes?**
   - Match user's terminal theme
   - Or provide light/dark presets

---

## 12. References

- [ink-table](https://github.com/maticzav/ink-table) - Existing Ink table component (simpler but less flexible)
- [Gemini CLI ScrollableList](https://github.com/google-gemini/gemini-cli) - Reference implementation for scrolling
- [cli-table3](https://github.com/cli-table/cli-table3) - Current implementation
- [Ink documentation](https://github.com/vadimdemedes/ink)
- [ink-ui](https://github.com/vadimdemedes/ink-ui) - Ink component library

---

## 13. Success Metrics

- **Visual Quality**: Table renders correctly on macOS Terminal, iTerm2, Windows Terminal, VS Code terminal
- **Performance**: Table with 100 rows renders in <100ms
- **Test Coverage**: >90% coverage on table components
- **User Feedback**: Positive reception on table usability
