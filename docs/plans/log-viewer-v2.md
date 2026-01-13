# Log Viewer v2: Semantic Log Viewing

## Problem Statement

The current log viewer treats logs as plain text files, navigating line-by-line. This creates poor UX because:

1. **Stack traces dominate** - 10-line stack traces repeated 4x = 40 lines of noise
2. **No entry concept** - Can't jump between actual log events
3. **No deduplication** - Same error 50x shows 50 times
4. **Timestamps waste space** - Full ISO timestamps on every line
5. **No structure** - Can't filter by source file, parse JSON, etc.

## Design Goals

1. **Entry-centric** - Treat each timestamped log line as an "entry" with optional continuation
2. **Collapse by default** - Stack traces hidden until needed
3. **Deduplicate** - Group repeated identical messages
4. **Relative time** - "2s ago" not "2026-01-13T04:02:20.142Z"
5. **Preserve power** - All existing vim-style navigation still works

## Data Model

### Current (Line-Based)
```typescript
interface LogLine {
  index: number;
  text: string;
  level: 'error' | 'warn' | 'info' | 'debug' | 'unknown';
  inheritedLevel: 'error' | 'warn' | 'info' | 'debug' | 'unknown';
}
```

### Proposed (Entry-Based)
```typescript
interface LogEntry {
  // Identity
  id: number;                    // Entry index (not line index)
  startLine: number;             // First line number in original file
  endLine: number;               // Last line number (for stack traces)

  // Parsed fields
  timestamp: Date | null;        // Parsed from ISO string
  level: LogLevel;               // error/warn/info/debug
  source: string | null;         // e.g., "logger.ts:1" from [logger.ts:1]
  message: string;               // The log message (first line content after metadata)

  // Continuation
  continuationLines: string[];   // Stack trace, JSON body, etc.

  // Display state
  isExpanded: boolean;           // Show continuation lines?

  // Grouping
  duplicateCount: number;        // How many identical consecutive entries
  duplicateOf: number | null;    // Points to first entry if this is a duplicate
}

type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'unknown';
```

## Parsing Strategy

### Log Line Detection
A line is a **new log entry** if it matches:
```
/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z \[(?:ERROR|WARN|INFO|DEBUG)\]/
```

Example: `2026-01-13T04:02:20.142Z [DEBUG] [logger.ts:1]: Message here`

### Continuation Detection
Any line NOT matching the pattern is a continuation of the previous entry:
- Stack trace lines (`    at ...`)
- JSON bodies
- Multi-line strings
- Blank lines within an entry

### Source Extraction
```typescript
// Extract from: [DEBUG] [logger.ts:1]: message
const sourceMatch = line.match(/\[(\w+\.(?:ts|js|tsx|jsx):\d+)\]/);
const source = sourceMatch?.[1] ?? null;  // "logger.ts:1"
```

### Duplicate Detection
```typescript
function getEntryHash(entry: LogEntry): string {
  // Hash level + source + message (exclude timestamp)
  return `${entry.level}|${entry.source}|${entry.message}`;
}

// Group consecutive entries with same hash
```

## UI Changes

### Collapsed View (Default)
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ promptfoo-debug-2026-01-13.log                    16.9 KB | E:3 W:0 D:44    │
├─────────────────────────────────────────────────────────────────────────────┤
│  2s ago [DEBUG] [logger.ts:1] Attempting to import module: {resolvedPat...  │
│  2s ago [DEBUG] [logger.ts:1] Attempting ESM import from: file:///Users...  │
│▸ 2s ago [DEBUG] [logger.ts:1] Error [ERR_MODULE_NOT_FOUND]: Cannot fi... ×4 │
│  1s ago [DEBUG] [logger.ts:1] Successfully imported module                  │
│▸ 1s ago [ERROR] [eval.ts:42] Evaluation failed: Provider timeout        ×2  │
│  1s ago [INFO]  [eval.ts:50] Retrying with backoff...                       │
├─────────────────────────────────────────────────────────────────────────────┤
│ j/k:nav n/N:entry →:expand e/w/D:level s:source q:quit       1-6/12 entries │
└─────────────────────────────────────────────────────────────────────────────┘
```

Key changes:
- **▸** indicator for entries with hidden continuation lines
- **×4** badge for duplicate count
- **Relative timestamps** in fixed-width column
- **Entry count** not line count in status bar
- **n/N:entry** in help text for entry navigation

### Expanded View
```
┌─────────────────────────────────────────────────────────────────────────────┐
│▾ 2s ago [DEBUG] [logger.ts:1] Error [ERR_MODULE_NOT_FOUND]: Cannot fi... ×4 │
│      at finalizeResolution (node:internal/modules/esm/resolve:274:11)       │
│      at moduleResolve (node:internal/modules/esm/resolve:864:10)            │
│      at defaultResolve (node:internal/modules/esm/resolve:990:11)           │
│      at nextResolve (node:internal/modules/esm/hooks:748:28)                │
│      ... +6 more lines                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **▾** indicates expanded state
- Continuation lines indented
- Long stack traces truncated with "+N more lines"
- Full expansion available in detail view (Enter)

### Source Filter Panel
```
┌─ Filter by Source ──────────────────┐
│ [x] logger.ts      (44 entries)     │
│ [ ] eval.ts        (12 entries)     │
│ [ ] providers.ts   (8 entries)      │
│ [ ] cache.ts       (3 entries)      │
├─────────────────────────────────────┤
│ Space:toggle Enter:apply Esc:cancel │
└─────────────────────────────────────┘
```

## Keyboard Bindings

### Navigation (Updated)
| Key | Current | Proposed |
|-----|---------|----------|
| `j/k` | Move 1 line | Move 1 entry (collapsed) or 1 line (expanded) |
| `n/N` | (removed) | Jump to next/prev log entry |
| `→/l` | (none) | Expand entry continuation |
| `←/h` | (none) | Collapse entry continuation |
| `Enter` | Detail view | Toggle expand, or detail if already expanded |

### Filtering (Updated)
| Key | Current | Proposed |
|-----|---------|----------|
| `e/w/i/D/a` | Level filter | (unchanged) |
| `s` | (none) | Open source filter panel |
| `/` | Text search | (unchanged) |
| `c` | Clear filters | (unchanged) |

### New Features
| Key | Action |
|-----|--------|
| `x` | Toggle expand all / collapse all |
| `t` | Toggle relative/absolute timestamps |
| `f` | Toggle follow mode (live tail) |

## Implementation Plan

### Phase 1: Entry Parsing (Foundation)
**Files:** `src/ui/logs/logParser.ts` (new)

1. Create `parseLogEntries(lines: string[]): LogEntry[]`
   - Detect entry boundaries
   - Group continuation lines
   - Parse timestamp, level, source, message
   - Calculate duplicate counts

2. Update `LogViewer.tsx` to use entries instead of lines
   - Replace `logLines` with `logEntries`
   - Update filtering to work on entries
   - Keep line-based rendering initially (just grouped)

**Tests:** `test/ui/logs/logParser.test.ts`

### Phase 2: Collapsed Display
**Files:** `src/ui/logs/LogViewer.tsx`, `src/ui/logs/LogEntry.tsx` (new)

1. Create `LogEntryRow` component
   - Render collapsed entry (▸ indicator, message truncation)
   - Render expanded entry (▾ indicator, continuation lines)
   - Handle ×N duplicate badge

2. Update navigation
   - j/k moves between entries when collapsed
   - Track `expandedEntries: Set<number>` state

3. Add expand/collapse keys (→/←, Enter)

### Phase 3: Relative Timestamps
**Files:** `src/ui/logs/logParser.ts`, `src/ui/logs/LogEntry.tsx`

1. Parse ISO timestamps to Date objects
2. Add `formatRelativeTime(date: Date): string`
   - "now", "2s ago", "5m ago", "1h ago", "2d ago"
3. Fixed-width timestamp column (8 chars: "  2s ago")
4. `t` key to toggle absolute timestamps

### Phase 4: Source Filter
**Files:** `src/ui/logs/SourceFilter.tsx` (new), `src/ui/logs/LogViewer.tsx`

1. Extract unique sources from entries
2. Create `SourceFilterPanel` component
   - Checkbox list with counts
   - Space to toggle, Enter to apply
3. `s` key opens panel as modal overlay
4. Add to filter state: `sourceFilter: Set<string> | null`

### Phase 5: Live Tail Mode
**Files:** `src/ui/logs/LogViewer.tsx`, `src/ui/logs/logsRunner.tsx`

1. Pass file watcher from runner to viewer
2. Add `isLive` prop and "Live" indicator
3. `f` key toggles follow mode
4. When following: auto-append entries, auto-scroll if at bottom
5. Show "Paused" when scrolled up from bottom

### Phase 6: Polish
1. Entry count in status bar (not line count)
2. "x" to expand/collapse all
3. Detail view shows full entry with all continuation lines
4. Smoother transitions between states

## File Structure (Final)

```
src/ui/logs/
├── index.ts              # Exports
├── logsRunner.tsx        # Entry point, file reading, live watching
├── LogViewer.tsx         # Main component (updated)
├── LogEntry.tsx          # Single entry row component (new)
├── SourceFilter.tsx      # Source filter panel (new)
├── logParser.ts          # Entry parsing logic (new)
└── types.ts              # Shared types (new)

test/ui/logs/
├── logParser.test.ts     # Parser unit tests (new)
├── LogViewer.test.tsx    # Component tests (new)
└── integration.test.ts   # Full flow tests (new)
```

## Migration Strategy

1. **Backward compatible** - Old line-based code paths preserved initially
2. **Feature flag** - `PROMPTFOO_LOG_VIEWER_V2=true` enables new behavior
3. **Gradual rollout** - Each phase can be shipped independently
4. **Fallback** - If parsing fails, fall back to line-based view

## Success Metrics

1. **Reduced noise** - 40 lines of repeated stack traces → 1 collapsed entry
2. **Faster navigation** - n/N jumps between events, not lines
3. **Better filtering** - Source filter finds specific module issues quickly
4. **Time context** - "2s ago" immediately tells recency without mental math

## Open Questions

1. **Expand depth** - Show first N continuation lines, then "+M more"? Or all-or-nothing?
2. **Duplicate threshold** - Only badge if ≥2? ≥3?
3. **Cross-file dedup** - Group same error across different sources?
4. **JSON detection** - Auto-pretty-print JSON in continuation lines?

## Appendix: Regex Patterns

```typescript
// Full log entry pattern
const LOG_ENTRY_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z) \[(ERROR|WARN|INFO|DEBUG)\](?: \[([^\]]+)\])?: (.*)$/;

// Stack trace line (continuation)
const STACK_TRACE_PATTERN = /^\s+at\s+/;

// Source file reference
const SOURCE_PATTERN = /\[(\w+(?:\.\w+)*:\d+)\]/;
```
