# Ink UI Command Integration Plan

This document maps PR 2 components (hooks, utils, shared components) to CLI commands that can be enhanced with interactive terminal UIs.

## Component → Command Mapping

### High-Impact Integrations

| Command | Current State | Ink UI Enhancement | Components Used |
|---------|--------------|-------------------|-----------------|
| **eval** | ora spinner, chalk output | Live progress dashboard | ProgressBar, Spinner, Badge, format utils, sparkline |
| **list** | Table output + basic Ink | Enhanced interactive browser | useKeypress, useTerminalSize, Badge, clipboard |
| **redteam run** | Progress bar, text output | Attack progress dashboard | ProgressBar, StatusSpinner, Badge, RingBuffer |
| **logs** | Static text dump | Interactive log viewer | useKeypress, RingBuffer, useTerminalSize, format |
| **show** | Table output | Detail viewer with navigation | useKeypress, Badge, PassFail, clipboard |

### Medium-Impact Integrations

| Command | Current State | Ink UI Enhancement | Components Used |
|---------|--------------|-------------------|-----------------|
| **validate** | Checkmarks + text | Provider status dashboard | StatusSpinner, PassFail, StatusMessage |
| **init** | inquirer prompts | Ink-based wizard | Spinner, StatusMessage, ProgressBar |
| **generate dataset** | ora + file output | Generation progress | Spinner, ProgressBar, StatusMessage |
| **generate assertions** | ora + file output | Generation progress | Spinner, ProgressBar, StatusMessage |
| **auth login** | Browser + inquirer | Team selector UI | useKeypress, Badge, StatusMessage |
| **retry** | Text output | Retry progress dashboard | ProgressBar, StatusSpinner, Badge |

### Lower-Impact (Still Valuable)

| Command | Current State | Ink UI Enhancement | Components Used |
|---------|--------------|-------------------|-----------------|
| **share** | Text URL | Copy-to-clipboard + status | clipboard, StatusMessage |
| **cache clear** | Text output | Animated clear | Spinner, StatusMessage |
| **delete** | Confirm prompt | Ink confirmation | StatusMessage, useConfirmKey |
| **export** | File write | Export progress | ProgressBar, StatusMessage, export util |
| **modelScan** | ora spinner | Scan progress | ProgressBar, StatusSpinner |

---

## Detailed Integration Plans

### 1. `eval` Command - Live Eval Dashboard

**Current:** `ora` spinner with periodic text updates

**Enhanced UI:**
```
┌─────────────────────────────────────────────────────────────┐
│ Evaluating: my-test-suite                                   │
├─────────────────────────────────────────────────────────────┤
│ Progress: ████████████░░░░░░░░ 62% (31/50)                 │
│                                                             │
│ Provider      Pass    Fail   Latency    Tokens    Cost     │
│ ─────────────────────────────────────────────────────────── │
│ gpt-4         [14]    [2]    1.2s       12.5k     $0.42    │
│ claude-3      [12]    [3]    0.8s       10.2k     $0.31    │
│                                                             │
│ Recent: ▁▂▃▅▇█▅▃▂▁ (pass rate trend)                       │
│                                                             │
│ ⏱ ETA: 45s | ⚡ 2.1 tests/sec | 💰 $0.73 total            │
└─────────────────────────────────────────────────────────────┘
```

**Components:**
- `ProgressBar` - Overall progress
- `Badge` / `PassFail` - Pass/fail counts per provider
- `format.formatTokens()` - Token counts
- `format.formatCost()` - Cost display
- `format.formatLatency()` - Latency display
- `format.calculateETA()` - Time remaining
- `sparkline.generateSparkline()` - Trend visualization
- `useTerminalSize` - Responsive layout
- `StatusSpinner` - Loading states

**PR Target:** PR 3 (Eval UI Core)

---

### 2. `list` Command - Interactive Browser

**Current:** Basic table + optional Ink list (PR 1)

**Enhanced UI:**
```
┌─────────────────────────────────────────────────────────────┐
│ Evaluations (150 total)                    [/] Search       │
├─────────────────────────────────────────────────────────────┤
│ > eval-abc123  gpt-4,claude  [92%] PASS   2 min ago        │
│   eval-def456  gpt-4         [45%] FAIL   1 hour ago       │
│   eval-ghi789  gemini        [78%] WARN   yesterday        │
│   ...                                                       │
├─────────────────────────────────────────────────────────────┤
│ ↑/↓:nav  Enter:view  c:copy  e:export  d:delete  q:quit   │
└─────────────────────────────────────────────────────────────┘
```

**Components:**
- `useKeypress` / `useNavigationKeys` - Vim-style navigation
- `useTerminalSize` - Responsive rows
- `Badge` / `Score` - Pass rate badges
- `format.formatPercent()` - Score display
- `clipboard.copyToClipboard()` - Copy eval ID
- `export.exportResults()` - Quick export

**PR Target:** PR 3 (Eval UI Core) - extends existing list

---

### 3. `logs` Command - Interactive Log Viewer

**Current:** Static `tail -n` style output with syntax highlighting

**Enhanced UI:**
```
┌─────────────────────────────────────────────────────────────┐
│ Logs: promptfoo-debug.log (1.2MB)          [/] Filter       │
├─────────────────────────────────────────────────────────────┤
│ 10:23:45 [INFO]  Starting evaluation...                    │
│ 10:23:46 [DEBUG] Loading provider gpt-4                    │
│ 10:23:47 [ERROR] Rate limit exceeded                       │
│ 10:23:48 [WARN]  Retrying in 5s...                         │
│ 10:23:53 [INFO]  Provider initialized                      │
│                                     ▼ (more below)          │
├─────────────────────────────────────────────────────────────┤
│ j/k:scroll  g/G:top/bottom  /:search  f:follow  q:quit     │
└─────────────────────────────────────────────────────────────┘
```

**Components:**
- `RingBuffer` - Efficient log storage for large files
- `useKeypress` - Vim navigation
- `useTerminalSize` - Dynamic row count
- `InkUITransport` - Live log streaming
- `StatusMessage` - Level-specific coloring
- `format.truncate()` - Long line handling

**PR Target:** PR 4 (Auxiliary UIs)

---

### 4. `redteam run` Command - Attack Dashboard

**Current:** Progress bar with text updates

**Enhanced UI:**
```
┌─────────────────────────────────────────────────────────────┐
│ 🔴 Red Team: helpdesk-agent                                 │
├─────────────────────────────────────────────────────────────┤
│ Phase 1: Generating attacks                                 │
│ ████████████████████░░░░ 80% (160/200)                     │
│                                                             │
│ Plugin           Generated   Status                         │
│ ─────────────────────────────────────────────────────────── │
│ harmful:hate     [25]        ✓ Complete                     │
│ pii:direct       [20]        ⟳ Running                      │
│ jailbreak        [0]         ○ Pending                      │
│                                                             │
│ Phase 2: Testing attacks                                    │
│ ░░░░░░░░░░░░░░░░░░░░░░░░ 0% (waiting)                      │
├─────────────────────────────────────────────────────────────┤
│ Vulnerabilities Found: [3] Critical  [7] High  [12] Medium │
└─────────────────────────────────────────────────────────────┘
```

**Components:**
- `ProgressBar` - Phase progress
- `StatusSpinner` - Per-plugin status
- `Badge` with variants - Vulnerability counts
- `CountBadge` - Plugin counts
- `format.formatPercent()` - Completion
- `useTerminalSize` - Layout adaptation

**PR Target:** PR 4 (Auxiliary UIs) or PR 5 (Redteam UI)

---

### 5. `validate` Command - Provider Health Check

**Current:** Sequential checkmarks with text

**Enhanced UI:**
```
┌─────────────────────────────────────────────────────────────┐
│ Validating providers...                                     │
├─────────────────────────────────────────────────────────────┤
│ openai:gpt-4         ✓ Connected    245ms   $0.03/1k       │
│ anthropic:claude-3   ✓ Connected    312ms   $0.015/1k      │
│ ollama:llama3        ⟳ Testing...                          │
│ azure:gpt-4          ✗ Auth failed                         │
├─────────────────────────────────────────────────────────────┤
│ 2 passed, 1 testing, 1 failed                              │
└─────────────────────────────────────────────────────────────┘
```

**Components:**
- `StatusSpinner` - Per-provider status
- `PassFail` - Success/failure indicator
- `format.formatLatency()` - Response time
- `format.formatCost()` - Token pricing
- `StatusMessage` - Error display
- `ErrorDisplay` - Detailed error info

**PR Target:** PR 4 (Auxiliary UIs)

---

### 6. `show` Command - Detail Viewer

**Current:** Static table dump

**Enhanced UI:**
```
┌─────────────────────────────────────────────────────────────┐
│ Evaluation: eval-abc123                     [c] Copy ID     │
├─────────────────────────────────────────────────────────────┤
│ Created: Jan 12, 2026 10:30 AM                             │
│ Provider: gpt-4                                             │
│ Tests: 50 total | Pass: 46 (92%) | Fail: 4 (8%)           │
│                                                             │
│ Test Results (↑/↓ to navigate)                             │
│ ─────────────────────────────────────────────────────────── │
│ > Test 1: "Hello world"           [PASS]  0.8s   1.2k tok  │
│   Test 2: "Summarize article"     [FAIL]  1.2s   2.1k tok  │
│   Test 3: "Code review"           [PASS]  2.1s   4.5k tok  │
├─────────────────────────────────────────────────────────────┤
│ Enter:expand  e:export  s:share  q:back                    │
└─────────────────────────────────────────────────────────────┘
```

**Components:**
- `useKeypress` - Navigation
- `Badge` / `PassFail` - Test results
- `format.*` - All formatting utilities
- `clipboard.copyToClipboard()` - Copy functionality
- `export.exportResults()` - Export action
- `useTerminalSize` - Dynamic layout

**PR Target:** PR 3 (Eval UI Core)

---

## Utility Usage Across Commands

### Format Utilities

| Function | Commands Using It |
|----------|------------------|
| `formatTokens()` | eval, show, list, redteam |
| `formatCost()` | eval, show, list, validate |
| `formatLatency()` | eval, show, validate |
| `formatPercent()` | eval, list, show, redteam |
| `formatDuration()` | eval, logs, redteam |
| `truncate()` | list, logs, show |
| `calculateETA()` | eval, redteam run, generate |

### Clipboard Utility

| Action | Commands |
|--------|----------|
| Copy ID | list, show |
| Copy URL | share |
| Copy results | show, export |

### Export Utility

| Format | Commands |
|--------|----------|
| JSON | list (selection), show |
| CSV | list (bulk), show |
| YAML | generate dataset, generate assertions |

### RingBuffer

| Use Case | Commands |
|----------|----------|
| Log storage | logs (viewer) |
| Event history | eval (recent results) |
| Metric buffering | eval (trend sparklines) |

---

## Implementation Phases

### PR 3: Eval UI Core
- Enhanced `list` command with full interactivity
- Enhanced `show` command with navigation
- Live `eval` progress dashboard
- Eval-specific components (EvalRow, ResultDetail, etc.)

### PR 4: Auxiliary UIs
- `logs` interactive viewer
- `validate` provider dashboard
- `init` wizard enhancement
- `auth` team selector

### PR 5: Redteam UI (if separate)
- `redteam run` attack dashboard
- `redteam report` interactive viewer
- Vulnerability browser

---

## Quick Wins (Minimal Effort)

These can be added with just a few lines using existing components:

1. **`share` command** - Add clipboard copy after URL generation:
   ```typescript
   import { copyToClipboard } from '../ui/utils/clipboard';
   await copyToClipboard(shareUrl);
   logger.info(chalk.green('✓ URL copied to clipboard'));
   ```

2. **`delete` command** - Use StatusMessage for confirmation:
   ```typescript
   // After successful delete
   <StatusMessage type="success">Deleted {count} evaluations</StatusMessage>
   ```

3. **`cache clear` command** - Animated clearing:
   ```typescript
   <StatusSpinner status="loading" message="Clearing cache..." />
   // then
   <StatusSpinner status="success" message="Cache cleared" />
   ```

4. **Any command with errors** - ErrorDisplay for detailed errors:
   ```typescript
   <ErrorDisplay error={error} />
   ```

---

## Non-Interactive Enhancement

Even without full interactive UI, commands benefit from:

1. **Better formatting** - Use `format.*` utilities for consistent output
2. **Sparklines** - Add trend charts to summary outputs
3. **Badges** - Color-coded status in table output (already works with chalk)
4. **Status messages** - Consistent success/error/warning styling

Example for non-interactive eval summary:
```typescript
import { formatTokens, formatCost, formatPercent } from '../ui/utils/format';
import { generateSparkline } from '../ui/utils/sparkline';

logger.info(`Pass rate: ${formatPercent(passed, total)}`);
logger.info(`Tokens: ${formatTokens(totalTokens)}`);
logger.info(`Cost: ${formatCost(totalCost)}`);
logger.info(`Trend: ${generateSparkline(passRates)}`);
```

---

## Environment Check Pattern

All interactive enhancements should follow this pattern:

```typescript
import { shouldUseInkUI } from '../ui';

// In command action handler:
if (shouldUseInkUI()) {
  // Render interactive Ink UI
  const { waitUntilExit } = await renderInteractive(<MyInteractiveUI {...props} />);
  await waitUntilExit();
} else {
  // Fall back to static output
  logger.info(wrapTable(data));
}
```

This ensures:
- Interactive UI is opt-in (requires `PROMPTFOO_ENABLE_INTERACTIVE_UI=true`)
- CI/scripts always get predictable text output
- Users choose when they want rich interactivity
