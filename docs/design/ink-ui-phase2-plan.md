# Ink UI Phase 2: Enhanced Feedback & Developer Experience

## Overview

This document outlines the next phase of improvements to the Ink-based CLI UI, focusing on better error visibility, logging integration, and overall developer experience enhancements.

---

## Priority 1: Core Functionality

### 1.1 Distinct Error State Display

**Problem**: Errors (API failures, timeouts) are not visually distinct from test failures (assertion failures). Users can't quickly tell if tests failed due to bad prompts or infrastructure issues.

**Current State**:
```
│ ● error-provider    [████░░░░] 4/8  0✓ 4✗     -    -    174ms │
```

**Proposed State**:
```
│ ✗ error-provider    [████░░░░] 4/8  0✓ 0✗ 4⚠   -    -    174ms │
```

**Implementation**:
1. Add `errors` count separate from `failed` in the Pass/Fail column
2. Use distinct icon: `⚠` (warning) or `!` for errors in yellow/orange
3. Update column header: "Pass/Fail" → "Results" or "P/F/E"
4. Color coding:
   - Green: passes (✓)
   - Red: failures (✗)
   - Yellow/Orange: errors (⚠ or !)
5. Provider status icon should reflect error state:
   - `✓` green = all passed
   - `✗` red = has failures
   - `⚠` yellow = has errors (no failures)
   - `!` red = has both errors and failures

**Files to modify**:
- `src/ui/components/eval/EvalScreen.tsx` - ProviderRow component
- `src/ui/contexts/EvalContext.tsx` - ensure error tracking is separate

---

### 1.2 Verbose Mode Toggle ('v' key)

**Problem**: Users can't see debug logs during evaluation without restarting with different flags. Debug information is valuable for troubleshooting.

**Proposed Behavior**:
- Press `v` to toggle verbose mode on/off
- When enabled, show a log panel below the provider table
- Display last N log lines (configurable, default 10)
- Auto-scroll as new logs arrive
- Filter levels: in verbose mode show DEBUG+, otherwise only WARN+

**UI Layout with Verbose Mode**:
```
╭──────────────────────────────────────────────────────────────────────────────╮
│ Evaluation Title                                            ⠋ Running (5.2s) │
│                                                                              │
│   Provider          Progress       Results    Tokens   Cost    Avg          │
│ ● gpt-4o-mini       [████░░░░] 4/8  3✓ 1✗     1.2k    $0.01   1.2s          │
│ ● gpt-3.5-turbo     [██░░░░░░] 2/8  2✓        890     $0.002  0.8s          │
│                                                                              │
│ ┌─ Logs (verbose) ──────────────────────────────────────────────────────────┐ │
│ │ [DEBUG] Calling openai:gpt-4o-mini with prompt...                        │ │
│ │ [DEBUG] Response received in 1.2s                                        │ │
│ │ [DEBUG] Running assertion: contains "Paris"                              │ │
│ │ [WARN]  Rate limit approaching for openai:gpt-4o-mini                    │ │
│ └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ 5/16 passed · 1 failed · 892 tokens · $0.012 · 5.2s                         │
│ Press q to quit, v to hide logs, e for errors                               │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Implementation**:
1. Add `showVerbose` state to EvalContext
2. Add `logs: LogEntry[]` array to state (ring buffer, max 100 entries)
3. Create `LogPanel` component with scrollable log display
4. Add 'v' key handler in EvalScreen
5. Create custom Winston transport to capture logs (see 1.3)
6. Update help text to show 'v' shortcut

**Files to create/modify**:
- `src/ui/components/eval/LogPanel.tsx` (new)
- `src/ui/components/eval/EvalScreen.tsx` - add LogPanel, key handler
- `src/ui/contexts/EvalContext.tsx` - add log state, TOGGLE_VERBOSE action
- `src/ui/hooks/useKeypress.ts` - ensure 'v' is handled

---

### 1.3 Capture Logger Output in Ink UI

**Problem**: Winston logger output to stdout interferes with Ink rendering, causing visual glitches. Important warnings and errors are lost or garbled.

**Proposed Solution**:
Create a custom Winston transport that routes logs to the Ink UI when active.

**Architecture**:
```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   logger    │────▶│  InkUITransport  │────▶│  EvalContext    │
│  (Winston)  │     │  (when Ink UI    │     │  (logs array)   │
└─────────────┘     │   is active)     │     └─────────────────┘
       │            └──────────────────┘              │
       │                                              ▼
       │            ┌──────────────────┐     ┌─────────────────┐
       └───────────▶│  Console/File    │     │   LogPanel      │
                    │  (fallback)      │     │   Component     │
                    └──────────────────┘     └─────────────────┘
```

**Implementation**:
1. Create `InkUITransport` class extending `Transport`
2. Transport writes to a shared buffer/callback
3. On Ink UI init, register the transport with logger
4. On Ink UI cleanup, remove the transport
5. Filter logs by level based on verbose mode:
   - Normal mode: WARN, ERROR only
   - Verbose mode: DEBUG, INFO, WARN, ERROR
6. Suppress duplicate "Cache is disabled" type messages

**Log Entry Structure**:
```typescript
interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
  meta?: Record<string, unknown>;
}
```

**Files to create/modify**:
- `src/ui/utils/InkUITransport.ts` (new)
- `src/ui/evalRunner.tsx` - register/unregister transport
- `src/ui/contexts/EvalContext.tsx` - ADD_LOG action
- `src/logger.ts` - export method to add/remove transports dynamically

---

## Priority 2: Enhanced Developer Experience

### 2.1 Keyboard Shortcuts Help Bar

**Problem**: Users don't know what keyboard shortcuts are available.

**Proposed UI**:
```
│ Press: q quit · v verbose · e errors · ↑↓ scroll · Enter details            │
```

**Implementation**:
- Add `HelpBar` component
- Show contextually relevant shortcuts
- Dim/subtle styling to not distract
- Hide in compact mode

---

### 2.2 Real-time Test Activity Feed

**Problem**: Users can't see what's currently being evaluated. The UI feels static during long-running tests.

**Proposed UI**:
```
│ Current: gpt-4o-mini › "What is the capital of France?" › contains...       │
```

**Implementation**:
- Show current provider, truncated prompt/vars, current assertion
- Update in real-time as tests progress
- Helps users understand where time is being spent

---

### 2.3 ETA / Time Remaining Estimate

**Problem**: Users don't know how long the evaluation will take.

**Proposed UI**:
```
│ Evaluation Title                              ⠋ Running (5.2s) ~2m remaining │
```

**Implementation**:
- Calculate average time per test from completed tests
- Estimate remaining time: `avg_time * remaining_tests / concurrency`
- Only show after 3+ tests complete (need data for estimate)
- Update estimate as evaluation progresses

---

### 2.4 Performance Highlighting

**Problem**: Hard to spot slow or expensive tests at a glance.

**Proposed Behavior**:
- Highlight latency in yellow if > 2x average
- Highlight latency in red if > 5x average
- Highlight cost in yellow if > expected threshold
- Show provider health indicator if error rate > 20%

**Implementation**:
- Calculate running averages
- Apply color based on thresholds
- Add subtle warning icons for problematic providers

---

### 2.5 Failure Details Quick View

**Problem**: Users must wait for completion or use separate tools to see why tests failed.

**Proposed Behavior**:
- Press `f` to show/hide failure details panel
- Shows last 3-5 failures with:
  - Provider name
  - Test variables (truncated)
  - Failed assertion type
  - Brief reason

**UI Layout**:
```
│ ┌─ Recent Failures ─────────────────────────────────────────────────────────┐ │
│ │ ✗ gpt-4o-mini | vars: {question: "What color..."} | contains "XYZNONEX…" │ │
│ │   Expected output to contain "XYZNONEXISTENT" but got "The sky is blue…" │ │
│ │ ✗ gpt-3.5-turbo | vars: {question: "Is water..."} | llm-rubric           │ │
│ │   LLM judge: Response does not claim water is dry (score: 0.1)           │ │
│ └───────────────────────────────────────────────────────────────────────────┘ │
```

---

### 2.6 Compact Mode Toggle

**Problem**: On smaller terminals, the UI may be too tall or wide.

**Proposed Behavior**:
- Auto-detect terminal size and switch to compact mode if needed
- Press `c` to manually toggle compact mode
- Compact mode:
  - Single line per provider (no empty lines between)
  - Shorter column headers
  - No help bar
  - Abbreviated numbers (1.2k instead of 1,234)

---

### 2.7 Provider Health Indicators

**Problem**: Hard to quickly see if a provider is experiencing issues.

**Proposed UI**:
```
│ ⚠ error-provider    [████░░░░] 4/8  0✓ 0✗ 4⚠   -    -    -     │
│   └─ 100% error rate - API returning 404                        │
```

**Implementation**:
- Show inline warning if error rate > 50%
- Show rate limit indicator if detected
- Collapse details after a few seconds to save space

---

## Priority 3: Polish & Edge Cases

### 3.1 Graceful Degradation

- Handle terminal resize gracefully
- Degrade to simpler UI if terminal is very small
- Fall back to non-Ink UI if Ink fails to initialize

### 3.2 Accessibility

- Ensure color is not the only indicator (use icons too)
- Support NO_COLOR environment variable
- High contrast mode option

### 3.3 Interrupt Handling

- Show confirmation on Ctrl+C: "Cancel evaluation? (y/n)"
- Allow graceful shutdown with partial results
- Show summary of completed tests on interrupt

### 3.4 Memory Management

- Cap log buffer size (100 entries max)
- Cap error/failure detail storage
- Clear old data as evaluation progresses

---

## Implementation Order

### Phase 2a (Core - This Sprint)
1. [ ] 1.1 - Distinct error state display
2. [ ] 1.3 - Logger capture (InkUITransport)
3. [ ] 1.2 - Verbose mode toggle
4. [ ] 2.1 - Help bar

### Phase 2b (Enhanced UX)
5. [ ] 2.2 - Real-time activity feed
6. [ ] 2.5 - Failure details quick view
7. [ ] 2.3 - ETA estimate

### Phase 2c (Polish)
8. [ ] 2.4 - Performance highlighting
9. [ ] 2.6 - Compact mode toggle
10. [ ] 2.7 - Provider health indicators
11. [ ] 3.1-3.4 - Edge cases and polish

---

## Technical Considerations

### State Management
The EvalContext is already handling significant state. Consider:
- Using separate contexts for UI preferences vs evaluation data
- Memoizing expensive computations (averages, ETAs)
- Debouncing rapid state updates

### Performance
- Log capture should be efficient (avoid string concatenation)
- UI updates should be batched where possible
- Consider using `useDeferredValue` for non-critical updates

### Testing
- Add tests for new keyboard handlers
- Add tests for log filtering logic
- Add visual regression tests if possible
- Test with various terminal sizes

---

## Open Questions

1. Should verbose mode persist across evaluations (save to config)?
2. Should we add sound notifications for completion/errors?
3. Should we support custom color themes?
4. Should failure details be expandable/collapsible per item?
5. Maximum number of log lines to display in verbose mode?
6. Should we add a "copy results to clipboard" feature?

---

## Success Metrics

- Users can immediately distinguish errors from failures
- Debug information is accessible without restarting
- No logger output interferes with Ink rendering
- Keyboard shortcuts are discoverable
- UI remains responsive with 100+ tests
