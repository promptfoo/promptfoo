# Ink CLI Results Table Filtering Plan

This document outlines the design for adding filtering capabilities to the Ink CLI results table, based on analysis of the web frontend filtering features.

## Web Frontend Filter Analysis

### Filter Modes (Simple Toggle Filters)

From `FilterModeProvider.tsx`:

- `all` - Show all results (default)
- `passes` - Show only passing results
- `failures` - Show only failing results
- `errors` - Show only results with errors
- `different` - Show results that differ across providers
- `highlights` - Show results marked as highlights

### Advanced Filters (Complex Builder)

From `FiltersForm.tsx` and `store.ts`:

**Filter Types:**

- `metric` - Filter by score/metric values
- `metadata` - Filter by test metadata fields
- `plugin` - Filter by redteam plugin type
- `strategy` - Filter by redteam strategy
- `severity` - Filter by severity level
- `policy` - Filter by policy violations

**Operators:**

- String: `equals`, `not_equals`, `contains`, `not_contains`, `exists`, `is_defined`
- Numeric: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`

### Filter State Structure

```typescript
interface ResultsFilter {
  type: 'metric' | 'metadata' | 'plugin' | 'strategy' | 'severity' | 'policy';
  field?: string;
  value?: string | number;
  operator: FilterOperator;
}
```

---

## CLI Filter Design

### Guiding Principles

1. **Simplicity First** - CLI users expect quick, keyboard-driven interactions
2. **Discoverability** - Filters should be easily discoverable via help text
3. **Progressive Complexity** - Simple filters immediately available, advanced filters for power users
4. **Vim-like Patterns** - Follow established CLI conventions (slash search, single-key shortcuts)

### Proposed Filter Features

#### Tier 1: Quick Filter Modes (Single Key)

These are the most common filters, accessible via single keystrokes:

| Key | Filter    | Description                               |
| --- | --------- | ----------------------------------------- |
| `a` | All       | Show all results (default)                |
| `p` | Passes    | Show only passing results                 |
| `f` | Failures  | Show only failing results                 |
| `e` | Errors    | Show only results with errors             |
| `d` | Different | Show results that differ across providers |

**Rationale:**

- Maps directly to web frontend's filter modes
- Single-key access is fast and memorable
- `a/p/f/e/d` are easy to remember (all/pass/fail/error/different)
- Skip `highlights` - less relevant in CLI context

#### Tier 2: Search Filter (Slash Command)

Text search across output content:

| Key   | Action            |
| ----- | ----------------- |
| `/`   | Enter search mode |
| `n`   | Next match        |
| `N`   | Previous match    |
| `Esc` | Clear search      |

**Behavior:**

- Typing `/` opens a search input at the bottom
- Results are filtered to show only rows containing search text
- Matches are highlighted in the output column
- `n`/`N` cycle through matches (vim convention)

#### Tier 3: Column Filter (Colon Command)

Filter by specific column values:

| Command                      | Example               | Description       |
| ---------------------------- | --------------------- | ----------------- |
| `:filter <col> <op> <value>` | `:filter score > 0.5` | Filter by column  |
| `:clear`                     | `:clear`              | Clear all filters |

**Supported columns:**

- `score` - Numeric score value
- `provider` - Provider name
- `latency` - Response latency in ms
- `cost` - Token cost
- `var:<name>` - Variable value

**Supported operators:**

- `=`, `!=` - Equality
- `>`, `>=`, `<`, `<=` - Numeric comparison
- `~` - Contains (regex)
- `!~` - Does not contain

**Examples:**

```
:filter score >= 0.8
:filter provider = gpt-4
:filter latency < 1000
:filter var:input ~ error
```

### UI Layout

```
╭─ Evaluation: My Test ─────────────────────────────╮
│ ✔ Complete | 24 tests | 20 pass | 3 fail | 1 err  │
│ Total: 50K tokens | $0.05 | 12.3s                 │
╰───────────────────────────────────────────────────╯

Filter: failures (3 of 24)                    [a]ll [p]ass [f]ail [e]rr

 # │ input        │ gpt-4 output      │ claude output    │
───┼──────────────┼───────────────────┼──────────────────┤
 2 │ test2...     │ ✗ wrong answer... │ ✗ also wrong...  │
 5 │ test5...     │ ✗ error: rate...  │ ✔ correct...     │
 8 │ test8...     │ ✗ timeout...      │ ✗ timeout...     │

[↑↓] navigate | [Enter] expand | [/] search | [q] quit
```

**Key UI Elements:**

1. **Filter status line** - Shows active filter and count (e.g., "failures (3 of 24)")
2. **Quick filter hints** - `[a]ll [p]ass [f]ail [e]rr` shows available shortcuts
3. **Search input** - Appears at bottom when `/` is pressed
4. **Help bar** - Updated to show filter shortcuts

### State Management

Add to `TableNavigationState`:

```typescript
interface TableFilterState {
  mode: 'all' | 'passes' | 'failures' | 'errors' | 'different';
  searchQuery: string | null;
  columnFilters: ColumnFilter[];
}

interface ColumnFilter {
  column: string;
  operator: '=' | '!=' | '>' | '>=' | '<' | '<=' | '~' | '!~';
  value: string | number;
}
```

### Implementation Plan

#### Phase 1: Quick Filter Modes

1. Add `filterMode` to navigation state
2. Add filter mode keyboard handlers (a/p/f/e/d)
3. Filter `processedRows` based on mode before rendering
4. Add filter status line to UI
5. Update help bar with filter hints

**Files to modify:**

- `src/ui/components/table/types.ts` - Add filter state types
- `src/ui/components/table/useTableNavigation.ts` - Add filter actions
- `src/ui/components/table/ResultsTable.tsx` - Filter rows, show status
- `src/ui/components/table/TableHelpText.tsx` - Update hints

#### Phase 2: Search Filter

1. Add search input component (appears on `/`)
2. Add search state to navigation
3. Filter rows by search query
4. Highlight matches in output cells
5. Add n/N for cycling matches

**New files:**

- `src/ui/components/table/SearchInput.tsx` - Search input component

**Files to modify:**

- `src/ui/components/table/useTableNavigation.ts` - Search actions
- `src/ui/components/table/ResultsTable.tsx` - Search filtering
- `src/ui/components/table/TableCell.tsx` - Match highlighting

#### Phase 3: Column Filters (Future)

1. Add command input component (appears on `:`)
2. Parse filter commands
3. Apply column filters
4. Stack with other filters (AND logic)

**Complexity:** Higher - requires command parsing, filter composition
**Priority:** Lower - most users will use quick filters

---

## Filter Logic

### Row Filtering Function

```typescript
function filterRows(rows: ProcessedRow[], filterState: TableFilterState): ProcessedRow[] {
  let filtered = rows;

  // Apply mode filter
  switch (filterState.mode) {
    case 'passes':
      filtered = filtered.filter((row) => row.cells.every((cell) => cell.status === 'pass'));
      break;
    case 'failures':
      filtered = filtered.filter((row) => row.cells.some((cell) => cell.status === 'fail'));
      break;
    case 'errors':
      filtered = filtered.filter((row) => row.cells.some((cell) => cell.status === 'error'));
      break;
    case 'different':
      filtered = filtered.filter((row) => {
        const outputs = row.cells.map((c) => c.content);
        return new Set(outputs).size > 1;
      });
      break;
  }

  // Apply search filter
  if (filterState.searchQuery) {
    const query = filterState.searchQuery.toLowerCase();
    filtered = filtered.filter((row) =>
      row.cells.some((cell) => cell.content.toLowerCase().includes(query)),
    );
  }

  // Apply column filters
  for (const filter of filterState.columnFilters) {
    filtered = filtered.filter((row) => applyColumnFilter(row, filter));
  }

  return filtered;
}
```

### Index Preservation

When filtering, we need to preserve original row indices for:

1. Displaying correct test number
2. Referencing back to original data on expand
3. Consistent navigation experience

```typescript
interface ProcessedRow {
  index: number; // Original index (preserved)
  displayIndex: number; // Current display position (changes with filter)
  // ...
}
```

---

## Edge Cases

1. **Empty filter results** - Show message: "No results match filter"
2. **Filter + navigation** - Reset selection to first row when filter changes
3. **Filter + expand** - Expanding filtered row shows full data
4. **Search escaping** - Handle regex special characters in search
5. **Multiple providers with different statuses** - Row passes if ANY cell passes? Or ALL?

### Multi-Provider Filter Logic

For rows with multiple providers:

- **passes**: All outputs pass
- **failures**: Any output fails
- **errors**: Any output has error
- **different**: Outputs differ from each other

---

## Help Text Updates

### Default Help Bar

```
[↑↓] navigate | [Enter] expand | [/] search | [q] quit
```

### With Filter Active

```
Filter: failures (3/24) | [a] all | [↑↓] nav | [Enter] expand | [q] quit
```

### In Search Mode

```
Search: ___________ | [Enter] apply | [Esc] cancel
```

---

## Accessibility Considerations

1. **Color-blind friendly** - Don't rely solely on color for filter status
2. **Screen reader** - Filter status should be announced
3. **Keyboard only** - All filters accessible without mouse (inherent in CLI)

---

## Testing Plan

1. **Unit tests** for filter logic:
   - Each filter mode correctly filters rows
   - Search query matching
   - Column filter operators
   - Index preservation

2. **Integration tests**:
   - Filter state changes update display
   - Navigation works with filtered data
   - Expand shows correct data after filtering

3. **Manual testing**:
   - Large datasets (100+ rows)
   - Various terminal widths
   - Combined filters

---

## Implementation Priority

| Priority | Feature                      | Effort | Value  |
| -------- | ---------------------------- | ------ | ------ |
| P0       | Quick filter modes (a/p/f/e) | Low    | High   |
| P0       | Filter status display        | Low    | High   |
| P1       | Different filter (d)         | Medium | Medium |
| P1       | Search filter (/)            | Medium | High   |
| P2       | Column filters (:filter)     | High   | Medium |

**Recommended MVP:** P0 features only (quick filters + status display)

---

## Open Questions

1. Should filters persist when exiting and re-entering table view?
2. Should we add a "starred" or "flagged" filter mode?
3. Is the "different" filter useful enough to include in MVP?
4. Should search highlight matches or just filter?
