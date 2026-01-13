# Ink UI Components - Usage Guide

Practical examples for using the hooks, utils, and shared components from PR 2.

## Quick Reference

```typescript
// Hooks
import { useKeypress, useNavigationKeys, useConfirmKey } from './hooks';
import { useSpinnerFrame, useSpinner, SPINNER_FRAMES } from './hooks';
import { useTerminalSize, getStaticTerminalSize } from './hooks';
import { useTerminalTitle } from './hooks';

// Utils
import { formatTokens, formatCost, formatLatency, formatPercent, truncate } from './utils';
import { RingBuffer } from './utils';
import { copyToClipboard, isClipboardAvailable } from './utils/clipboard';
import { exportTableToFile, EXPORT_FORMATS } from './utils/export';

// Components
import { Badge, PassFail, Score, CountBadge } from './components/shared';
import { ProgressBar, InlineProgress } from './components/shared';
import { Spinner, StatusSpinner } from './components/shared';
import { ErrorBoundary, withErrorBoundary } from './components/shared';
import { StatusMessage, ErrorDisplay, WarningList } from './components/shared';
```

---

## Hooks

### useKeypress - Keyboard Input

Handle keyboard input with vim-style key detection.

```tsx
import { useKeypress, useNavigationKeys, useConfirmKey } from '../hooks';
import { Box, Text } from 'ink';
import { useState } from 'react';

// Basic keypress handling
function KeyDemo() {
  const [lastKey, setLastKey] = useState('');

  useKeypress((key) => {
    if (key.name === 'escape') {
      process.exit(0);
    }
    if (key.ctrl && key.key === 'c') {
      process.exit(0);
    }
    setLastKey(key.name || key.key);
  });

  return <Text>Last key: {lastKey}</Text>;
}

// Navigation keys (simpler API)
function NavigableList() {
  const [index, setIndex] = useState(0);
  const items = ['Item 1', 'Item 2', 'Item 3'];

  useNavigationKeys({
    onUp: () => setIndex(i => Math.max(0, i - 1)),
    onDown: () => setIndex(i => Math.min(items.length - 1, i + 1)),
    onEnter: () => console.log(`Selected: ${items[index]}`),
    onEscape: () => process.exit(0),
  });

  return (
    <Box flexDirection="column">
      {items.map((item, i) => (
        <Text key={i} color={i === index ? 'cyan' : undefined}>
          {i === index ? '▶ ' : '  '}{item}
        </Text>
      ))}
    </Box>
  );
}

// Yes/No confirmation
function ConfirmDialog({ onConfirm }: { onConfirm: (yes: boolean) => void }) {
  useConfirmKey(onConfirm);

  return <Text>Continue? (y/n)</Text>;
}
```

**Key properties:**
- `key.name` - Named key: `'up'`, `'down'`, `'return'`, `'escape'`, `'tab'`, `'space'`, etc.
- `key.key` - Character for printable keys
- `key.ctrl`, `key.meta`, `key.shift` - Modifier states

---

### useSpinnerFrame - Animated Spinners

Create animated loading indicators.

```tsx
import { useSpinnerFrame, useSpinner, SPINNER_FRAMES } from '../hooks';
import { Text } from 'ink';

// Basic spinner
function Loading() {
  const frame = useSpinnerFrame({ type: 'dots' });
  return <Text color="cyan">{frame} Loading...</Text>;
}

// Different spinner styles
function SpinnerDemo() {
  const dots = useSpinnerFrame({ type: 'dots' });    // ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏
  const line = useSpinnerFrame({ type: 'line' });    // -\|/
  const circle = useSpinnerFrame({ type: 'circle' }); // ◐◓◑◒
  const arc = useSpinnerFrame({ type: 'arc' });       // ◜◠◝◞◡◟

  return (
    <Box flexDirection="column">
      <Text>{dots} Dots spinner</Text>
      <Text>{line} Line spinner</Text>
      <Text>{circle} Circle spinner</Text>
      <Text>{arc} Arc spinner</Text>
    </Box>
  );
}

// Controllable spinner
function UploadProgress() {
  const { frame, isSpinning, start, stop } = useSpinner({ type: 'dots' });

  return (
    <Box>
      {isSpinning && <Text color="cyan">{frame} </Text>}
      <Text>Uploading...</Text>
    </Box>
  );
}

// Custom frames
function CustomSpinner() {
  const frame = useSpinnerFrame({
    frames: ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'],
    interval: 150,
  });
  return <Text>{frame} Moon phase</Text>;
}
```

**Available types:** `'dots'`, `'line'`, `'arc'`, `'circle'`, `'square'`, `'bounce'`, `'clock'`

---

### useTerminalSize - Responsive Layouts

Track terminal dimensions for responsive UIs.

```tsx
import { useTerminalSize, getStaticTerminalSize } from '../hooks';
import { Box, Text } from 'ink';

function ResponsiveList({ items }: { items: string[] }) {
  const { width, height } = useTerminalSize();

  // Adjust layout based on terminal size
  const columns = width > 100 ? 3 : width > 60 ? 2 : 1;
  const maxVisible = height - 4; // Leave room for header/footer

  return (
    <Box flexDirection="column">
      <Text dimColor>Terminal: {width}x{height}</Text>
      {items.slice(0, maxVisible).map((item, i) => (
        <Text key={i}>{truncate(item, Math.floor(width / columns) - 2)}</Text>
      ))}
    </Box>
  );
}

// Outside React (e.g., for initial calculations)
const { width, height } = getStaticTerminalSize();
```

---

### useTerminalTitle - Window Titles

Set the terminal window/tab title.

```tsx
import { useTerminalTitle } from '../hooks';

function EvalRunner({ evalId }: { evalId: string }) {
  // Set title while component is mounted, restore on unmount
  useTerminalTitle(`promptfoo eval - ${evalId}`);

  return <Text>Running evaluation...</Text>;
}
```

---

## Utils

### Format Functions

Human-readable formatting for numbers.

```typescript
import {
  formatTokens,
  formatCost,
  formatLatency,
  formatDuration,
  formatPercent,
  truncate,
  calculateETA,
  formatETA
} from '../utils/format';

// Token counts
formatTokens(500);        // "500"
formatTokens(12500);      // "12.5k"
formatTokens(1500000);    // "1.5M"

// Costs
formatCost(0.0035);       // "$0.0035"
formatCost(0.50);         // "$0.50"
formatCost(1.50);         // "$1.50"
formatCost(150);          // "$150"

// Latency (for API response times)
formatLatency(234);       // "234ms"
formatLatency(1500);      // "1.5s"
formatLatency(12000);     // "12s"

// Duration (for elapsed time)
formatDuration(500);      // "500ms"
formatDuration(5000);     // "5.0s"
formatDuration(125000);   // "2m 5s"
formatDuration(7380000);  // "2h 3m"

// Percentages
formatPercent(85, 100);   // "85%"
formatPercent(17, 20);    // "85%"

// Truncation (Unicode-safe)
truncate('Hello World', 8);  // "Hello W…"
truncate('Hello', 10);       // "Hello"

// ETA calculation
const eta = calculateETA(50, 100, 30000);  // 50 of 100 done in 30s
formatETA(eta);  // "~30s left"
```

---

### RingBuffer - Efficient Log Storage

Fixed-size circular buffer for logs (O(1) push, no array copying).

```typescript
import { RingBuffer } from '../utils/RingBuffer';

// Create buffer with max 1000 entries
const logs = new RingBuffer<string>(1000);

// Add entries (overwrites oldest when full)
logs.push('[INFO] Starting...');
logs.push('[DEBUG] Processing...');
logs.push('[ERROR] Failed!');

// Properties
logs.size;      // 3
logs.capacity;  // 1000
logs.isEmpty;   // false
logs.isFull;    // false

// Access items (0 = oldest)
logs.get(0);           // '[INFO] Starting...'
logs.newest();         // '[ERROR] Failed!'
logs.oldest();         // '[INFO] Starting...'

// Get arrays
logs.toArray();        // All items, oldest first
logs.last(10);         // Last 10 items

// Find and filter
logs.find(log => log.includes('ERROR'));  // First error
logs.filter(log => log.includes('DEBUG')); // All debug logs

// Iterate
for (const log of logs) {
  console.log(log);
}

logs.forEach((log, index) => {
  console.log(`${index}: ${log}`);
});

// Map
const timestamps = logs.map(log => log.slice(1, 6)); // Extract level

// Clear
logs.clear();
```

**Use case:** Store the last N log entries without memory growth.

---

### Clipboard

Cross-platform clipboard operations.

```typescript
import { copyToClipboard, isClipboardAvailable } from '../utils/clipboard';

// Check if clipboard is available
if (await isClipboardAvailable()) {
  const result = await copyToClipboard('Hello, clipboard!');
  if (result.success) {
    console.log('Copied!');
  } else {
    console.error('Failed:', result.error);
  }
}
```

**Platform support:** macOS (pbcopy), Linux (xclip/xsel), Windows (clip)

---

### Export

Export data to various formats.

```typescript
import {
  exportTableToFile,
  convertTableToFormat,
  EXPORT_FORMATS,
  generateDefaultFilename
} from '../utils/export';

const data = {
  headers: ['ID', 'Score', 'Status'],
  rows: [
    { id: 'test-1', score: 0.95, status: 'pass' },
    { id: 'test-2', score: 0.42, status: 'fail' },
  ],
  summary: { total: 2, passed: 1, failed: 1 }
};

// Export to file
await exportTableToFile(data, 'json', './results.json');
await exportTableToFile(data, 'csv', './results.csv');
await exportTableToFile(data, 'yaml', './results.yaml');

// Convert to string (for clipboard, etc.)
const json = convertTableToFormat(data, 'json');
const csv = convertTableToFormat(data, 'csv');

// Generate timestamped filename
const filename = generateDefaultFilename('json'); // "promptfoo-export-2024-01-15-143022.json"

// Available formats
Object.keys(EXPORT_FORMATS); // ['j', 'json', 'c', 'csv', 'y', 'yaml', 't', 'txt']
```

---

## Shared Components

### Badge - Status Indicators

Color-coded badges for status display.

```tsx
import { Badge, PassFail, Score, CountBadge } from '../components/shared';

function ResultsSummary({ passed, failed, score }) {
  return (
    <Box flexDirection="column">
      {/* Basic badges */}
      <Badge variant="success">PASS</Badge>   {/* [PASS] in green */}
      <Badge variant="error">FAIL</Badge>     {/* [FAIL] in red */}
      <Badge variant="warning">WARN</Badge>   {/* [WARN] in yellow */}
      <Badge variant="info">INFO</Badge>      {/* [INFO] in blue */}

      {/* Pass/fail shorthand */}
      <PassFail passed={true} />              {/* [PASS] */}
      <PassFail passed={false} />             {/* [FAIL] */}

      {/* Score with auto-coloring */}
      <Score value={0.95} />                  {/* 95% in green */}
      <Score value={0.55} />                  {/* 55% in yellow */}
      <Score value={0.25} />                  {/* 25% in red */}

      {/* Count with label */}
      <CountBadge count={42} label="tests" color="cyan" />
    </Box>
  );
}
```

---

### ProgressBar - Progress Indicators

Horizontal progress bars.

```tsx
import { ProgressBar, InlineProgress } from '../components/shared';

function EvalProgress({ completed, total }) {
  return (
    <Box flexDirection="column">
      {/* Full progress bar */}
      <ProgressBar
        value={completed}
        max={total}
        label="Progress"
        showPercentage
        color="green"
      />
      {/* Output: Progress [████████████░░░░░░░░░░░░] 50% */}

      {/* With count display */}
      <ProgressBar
        value={completed}
        max={total}
        showCount
        showPercentage={false}
      />
      {/* Output: [████████████░░░░░░░░░░░░] 50/100 */}

      {/* Custom characters */}
      <ProgressBar
        value={75}
        filledChar="="
        emptyChar="-"
      />
      {/* Output: [==================------] 75% */}

      {/* Compact inline version */}
      <InlineProgress value={50} max={100} format="both" colorByProgress />
      {/* Output: 50/100 (50%) in yellow */}
    </Box>
  );
}
```

---

### Spinner - Loading States

Animated spinners with status support.

```tsx
import { Spinner, StatusSpinner } from '../components/shared';

function LoadingDemo() {
  return (
    <Box flexDirection="column">
      {/* Basic spinner */}
      <Spinner text="Loading..." />
      {/* Output: ⠋ Loading... */}

      {/* Custom type and color */}
      <Spinner type="circle" color="green" text="Processing" />

      {/* Status spinner (loading → success/error) */}
      <StatusSpinner
        status="loading"  // or 'success', 'error', 'warning'
        text="Connecting..."
        successText="Connected!"
        errorText="Connection failed"
      />
      {/* When loading: ⠋ Connecting... */}
      {/* When success: ✓ Connected! */}
      {/* When error:   ✗ Connection failed */}
    </Box>
  );
}
```

---

### StatusMessage - Alerts

Success, error, and warning messages.

```tsx
import { StatusMessage, ErrorDisplay, WarningList } from '../components/shared';

function Notifications({ error, warnings }) {
  return (
    <Box flexDirection="column">
      {/* Status messages */}
      <StatusMessage type="success">Evaluation complete!</StatusMessage>
      <StatusMessage type="error">Failed to connect to API</StatusMessage>
      <StatusMessage type="warning">Using cached results</StatusMessage>
      <StatusMessage type="info">Tip: Use --verbose for more details</StatusMessage>

      {/* Error with details */}
      <ErrorDisplay error={error} showStack />

      {/* Warning list */}
      <WarningList warnings={warnings} />
    </Box>
  );
}
```

---

### ErrorBoundary - Error Handling

Catch React errors gracefully.

```tsx
import { ErrorBoundary, withErrorBoundary } from '../components/shared';

// Wrap components
function App() {
  return (
    <ErrorBoundary
      fallback={<Text color="red">Something went wrong</Text>}
      onError={(error) => console.error('UI Error:', error)}
    >
      <MyRiskyComponent />
    </ErrorBoundary>
  );
}

// Or use HOC
const SafeComponent = withErrorBoundary(MyRiskyComponent, {
  fallback: <Text color="red">Error loading component</Text>
});
```

---

## Complete Example: Interactive Eval Viewer

```tsx
import { Box, Text, useApp } from 'ink';
import { useState, useEffect } from 'react';

import { useKeypress, useTerminalSize, useSpinnerFrame } from '../hooks';
import { Badge, ProgressBar, StatusSpinner, Score } from '../components/shared';
import { formatTokens, formatCost, formatLatency, truncate } from '../utils';
import { RingBuffer } from '../utils/RingBuffer';

interface EvalResult {
  id: string;
  passed: boolean;
  latencyMs: number;
  tokens: number;
  cost: number;
}

function EvalViewer({ results, isRunning }: { results: EvalResult[], isRunning: boolean }) {
  const { exit } = useApp();
  const { width } = useTerminalSize();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const logs = useState(() => new RingBuffer<string>(100))[0];

  // Handle keyboard navigation
  useKeypress((key) => {
    if (key.name === 'up' || key.key === 'k') {
      setSelectedIndex(i => Math.max(0, i - 1));
    }
    if (key.name === 'down' || key.key === 'j') {
      setSelectedIndex(i => Math.min(results.length - 1, i + 1));
    }
    if (key.name === 'escape' || key.key === 'q') {
      exit();
    }
  });

  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold>Eval Results </Text>
        {isRunning ? (
          <StatusSpinner status="loading" text="Running..." />
        ) : (
          <Badge variant={passed === total ? 'success' : 'warning'}>
            {passed}/{total} passed
          </Badge>
        )}
      </Box>

      {/* Progress */}
      <ProgressBar value={total} max={100} label="Progress" showPercentage />

      {/* Results list */}
      <Box flexDirection="column" marginTop={1}>
        {results.map((result, i) => (
          <Box key={result.id}>
            <Text color={i === selectedIndex ? 'cyan' : undefined}>
              {i === selectedIndex ? '▶ ' : '  '}
            </Text>
            <Badge variant={result.passed ? 'success' : 'error'}>
              {result.passed ? 'PASS' : 'FAIL'}
            </Badge>
            <Text> {truncate(result.id, 20)} </Text>
            <Text dimColor>
              {formatLatency(result.latencyMs)} · {formatTokens(result.tokens)} · {formatCost(result.cost)}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>↑/k up · ↓/j down · q quit</Text>
      </Box>
    </Box>
  );
}
```

---

## Best Practices

1. **Use `useNavigationKeys` for simple navigation** instead of raw `useKeypress`
2. **Use `RingBuffer` for logs** to prevent memory growth
3. **Use format functions** for consistent number display
4. **Use `StatusSpinner`** for operations that can succeed/fail
5. **Wrap components in `ErrorBoundary`** to prevent crashes
6. **Use `useTerminalSize`** for responsive layouts
7. **Dynamic import** these modules in runners to avoid bundle bloat

```typescript
// In your runner file (e.g., evalRunner.tsx)
export async function runEvalWithInkUI(config: EvalConfig) {
  // Dynamic imports to avoid loading React/Ink when not needed
  const [React, { renderInteractive }, { EvalViewer }] = await Promise.all([
    import('react'),
    import('../render'),
    import('./EvalViewer'),
  ]);

  await renderInteractive(<EvalViewer config={config} />);
}
```
