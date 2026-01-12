# Eval UI/UX Design: Excellent Developer Experience

## Current State

The current Ink UI provides:

- Title and phase indicator
- Progress bar with percentage
- Provider status with spinner
- Completion summary

This is a good start, but there's significant opportunity to improve the developer experience during evaluation runs.

## Design Principles

1. **Progressive Disclosure**: Show the right level of detail at the right time
2. **Immediate Feedback**: Surface errors and issues as they occur, not at the end
3. **Actionable Information**: Every piece of data shown should be useful
4. **Predictability**: Help developers understand what's happening and what to expect
5. **Non-Blocking**: UI should never slow down the evaluation
6. **Graceful Degradation**: Work well in CI, piped output, and limited terminals

---

## Proposed UI Layouts

### Layout 1: Compact View (Default)

```
promptfoo eval ─────────────────────────────────────────────────────────────────

  Testing: customer-support-bot v1.2

  Progress   [████████████████░░░░░░░░░░░░░░░░░░░░░░░░]  42%  21/50
             ⠋ openai:gpt-4 → "How do I reset my password?"

  Stats      21 passed · 0 failed · 0 errors · ~1m 12s remaining

  Cost       $0.23 spent · ~$0.55 total · 12,450 tokens

────────────────────────────────────────────────────────────────────────────────
  Press [v]erbose · [e]rrors · [p]ause · [q]uit
```

### Layout 2: Expanded View (Press 'v')

```
promptfoo eval ─────────────────────────────────────────────────────────────────

  Testing: customer-support-bot v1.2

  Progress   [████████████████░░░░░░░░░░░░░░░░░░░░░░░░]  42%  21/50
             ~1m 12s remaining · 0.35 tests/sec

  ┌─ Providers ────────────────────────────────────────────────────────────────┐
  │  openai:gpt-4        [████████░░]  80%   12/15   avg 1.2s   $0.18          │
  │  anthropic:claude    [██████████] 100%   15/15   avg 0.8s   $0.05  ✓       │
  │  google:gemini       [████░░░░░░]  40%    6/15   avg 1.5s   $0.02          │
  └────────────────────────────────────────────────────────────────────────────┘

  ┌─ Recent Results ───────────────────────────────────────────────────────────┐
  │  ✓ #18  "password reset"     openai:gpt-4       1.1s   contains ✓          │
  │  ✓ #19  "account locked"     anthropic:claude   0.9s   similarity: 0.94    │
  │  ✓ #20  "billing question"   google:gemini      1.4s   llm-rubric: 0.88    │
  │  ⠋ #21  "refund request"     openai:gpt-4       ...    running             │
  └────────────────────────────────────────────────────────────────────────────┘

  ┌─ Assertions ───────────────────────────────────────────────────────────────┐
  │  contains      [████████████████████]  100%   21/21                        │
  │  cost          [████████████████░░░░]   80%   17/21                        │
  │  llm-rubric    [██████████████████░░]   90%   19/21                        │
  └────────────────────────────────────────────────────────────────────────────┘

────────────────────────────────────────────────────────────────────────────────
  Press [v]erbose · [e]rrors · [p]ause · [q]uit
```

### Layout 3: Error Focus View (Press 'e' or when errors occur)

```
promptfoo eval ─────────────────────────────────────────────────────────────────

  Testing: customer-support-bot v1.2

  Progress   [████████████████████████████████░░░░░░░░]  80%  40/50

  ⚠ 3 failures detected

  ┌─ Failures ─────────────────────────────────────────────────────────────────┐
  │                                                                            │
  │  ✗ Test #23: "Write me a haiku about databases"                            │
  │    Provider: openai:gpt-4                                                  │
  │    Assertion: contains("haiku") FAILED                                     │
  │    Expected: Response contains "haiku"                                     │
  │    Received: "Here's a poem about databases: Tables store our..."          │
  │                                                                            │
  │  ✗ Test #31: "Calculate 15% tip on $45.50"                                 │
  │    Provider: anthropic:claude                                              │
  │    Assertion: equals("$6.83") FAILED                                       │
  │    Expected: "$6.83"                                                       │
  │    Received: "$6.825"                                                      │
  │                                                                            │
  │  ✗ Test #38: "Translate 'hello' to Spanish"                                │
  │    Provider: google:gemini                                                 │
  │    Assertion: cost(<0.001) FAILED                                          │
  │    Expected: cost < $0.001                                                 │
  │    Received: cost = $0.0015                                                │
  │                                                                            │
  └────────────────────────────────────────────────────────────────────────────┘

────────────────────────────────────────────────────────────────────────────────
  Press [v]erbose · [e]rrors · [p]ause · [q]uit
```

### Layout 4: Completion Summary

```
promptfoo eval ─────────────────────────────────────────────────────────────────

  ✓ Evaluation Complete: customer-support-bot v1.2

  ┌─ Results ──────────────────────────────────────────────────────────────────┐
  │                                                                            │
  │    Pass Rate     ████████████████████████████████░░░░░░░░   80%            │
  │                  40 passed · 8 failed · 2 errors                           │
  │                                                                            │
  │    Duration      2m 34s                                                    │
  │    Total Cost    $0.67 (15,230 tokens)                                     │
  │    Throughput    0.32 tests/sec                                            │
  │                                                                            │
  └────────────────────────────────────────────────────────────────────────────┘

  ┌─ Provider Comparison ──────────────────────────────────────────────────────┐
  │                        Pass Rate    Avg Latency    Cost                    │
  │  openai:gpt-4            85%          1.2s        $0.35                    │
  │  anthropic:claude        90%          0.8s        $0.22                    │
  │  google:gemini           65%          1.5s        $0.10                    │
  └────────────────────────────────────────────────────────────────────────────┘

  ┌─ Top Failures ─────────────────────────────────────────────────────────────┐
  │  3× cost assertion failures (tests #23, #31, #45)                          │
  │  2× contains assertion failures (tests #12, #38)                           │
  │  1× llm-rubric below threshold (test #41)                                  │
  └────────────────────────────────────────────────────────────────────────────┘

  View full results: https://promptfoo.app/eval/eval-abc-123
  Run `promptfoo view` to open in browser

────────────────────────────────────────────────────────────────────────────────
```

---

## Feature Specifications

### 1. Smart Progress Estimation

**What**: Show estimated time remaining based on actual performance.

**How**:

- Track rolling average of test completion times
- Account for provider-specific latencies
- Adjust for parallelism (concurrency setting)
- Show confidence interval for estimates

**Implementation**:

```typescript
interface ProgressEstimation {
  remaining: number; // Remaining tests
  avgDuration: number; // Rolling average (last 10 tests)
  concurrency: number; // Current parallelism
  estimatedRemaining: number; // Calculated ETA in ms
  confidence: 'high' | 'medium' | 'low'; // Based on variance
}
```

### 2. Live Test Results Stream

**What**: Show test results as they complete, not just a count.

**How**:

- Maintain a sliding window of recent results (last 5-10)
- Show pass/fail status, key assertion info, timing
- Highlight failures prominently
- Allow scrolling through history

**Display**:

```
Recent Results:
  ✓ #42  "password reset"     gpt-4    1.1s   contains ✓
  ✓ #43  "account locked"     claude   0.9s   similarity: 0.94
  ✗ #44  "billing question"   gemini   1.4s   cost > limit
  ⠋ #45  "refund request"     gpt-4    ...    running
```

### 3. Provider Performance Dashboard

**What**: Real-time metrics per provider.

**Metrics to track**:

- Progress (completed/total)
- Average latency
- Cost accumulated
- Error rate
- Current status (running/complete/error)

**Display**:

```
Providers:
  openai:gpt-4        [████████░░]  80%   avg: 1.2s   $0.35
  anthropic:claude    [██████████] 100%   avg: 0.8s   $0.22  ✓
  google:gemini       [████░░░░░░]  40%   avg: 1.5s   $0.10
```

### 4. Assertion Breakdown

**What**: Show which types of assertions are passing/failing.

**Why**: Helps identify systematic issues (e.g., all cost assertions failing).

**Display**:

```
Assertions:
  contains     [████████████████████]  100%   45/45
  cost         [████████████░░░░░░░░]   60%   27/45
  llm-rubric   [██████████████████░░]   90%   41/45
```

### 5. Intelligent Warnings

**What**: Surface issues proactively as they're detected.

**Warning types**:

- High latency detected (>2x average)
- Rate limiting detected
- Empty responses
- Unexpected errors
- Cost threshold approaching
- Cache miss rate high

**Display**:

```
⚠ Warnings:
  • Rate limiting detected on openai:gpt-4, backing off 5s
  • 3 tests returned empty responses
  • Cost approaching limit ($0.90 / $1.00)
```

### 6. Interactive Controls

**Key bindings**:
| Key | Action |
|-----|--------|
| `v` | Toggle verbose/compact view |
| `e` | Toggle error details view |
| `p` | Pause/resume evaluation |
| `q` | Quit (graceful cancellation) |
| `d` | Toggle debug mode |
| `↑↓` | Scroll through results |
| `?` | Show help |

### 7. Cost & Token Tracking

**What**: Real-time cost and token usage display.

**Display**:

```
Cost:  $0.45 spent · ~$0.90 estimated total
       12,450 prompt tokens · 3,200 completion tokens
       Cache hits: 30% (saves ~$0.15)
```

### 8. Phase Indicators

**What**: Show distinct phases of evaluation.

**Phases**:

1. Loading config
2. Initializing providers
3. Running tests
4. Grading results (if using LLM graders)
5. Generating report

**Display**:

```
Phase 3/5: Running tests
  [████████████████░░░░░░░░]  65%
```

---

## Adaptive Detail Levels

### Quiet Mode (`--quiet`)

```
Running evaluation...
████████████████████░░░░░░░░░░░░░░░░░░░░  50%  25/50
```

### Normal Mode (default)

Full compact view with progress, stats, cost.

### Verbose Mode (`-v` or press 'v')

Expanded view with providers, recent results, assertions.

### Debug Mode (`--debug` or press 'd')

Everything plus request/response logging.

---

## Non-Interactive Fallback (CI)

For CI environments, output milestone-based updates:

```
[promptfoo] Starting evaluation: customer-support-bot
[promptfoo] Providers: openai:gpt-4, anthropic:claude, google:gemini
[promptfoo] Running 50 tests with concurrency 4...
[promptfoo] Progress: 10/50 (20%) - 10 passed, 0 failed
[promptfoo] Progress: 25/50 (50%) - 24 passed, 1 failed
[promptfoo] Progress: 40/50 (80%) - 38 passed, 2 failed
[promptfoo] Complete: 50/50 (100%) - 47 passed, 3 failed
[promptfoo]
[promptfoo] Results: 94% pass rate (47/50)
[promptfoo] Duration: 2m 34s
[promptfoo] Cost: $0.67
[promptfoo]
[promptfoo] Failures:
[promptfoo]   - Test #23: cost assertion failed
[promptfoo]   - Test #31: equals assertion failed
[promptfoo]   - Test #38: contains assertion failed
[promptfoo]
[promptfoo] View: https://promptfoo.app/eval/eval-abc-123
```

---

## Implementation Plan

### Phase 1: Core Improvements (This PR)

- [ ] Add ETA estimation
- [ ] Add live test result count (pass/fail/error breakdown)
- [ ] Improve completion summary
- [ ] Add cost/token display

### Phase 2: Enhanced Feedback

- [ ] Provider performance dashboard
- [ ] Recent results stream
- [ ] Assertion breakdown
- [ ] Interactive key bindings

### Phase 3: Advanced Features

- [ ] Intelligent warnings
- [ ] Comparison view for multi-provider
- [ ] Timeline/history view
- [ ] Pause/resume support

---

## Technical Considerations

### Performance

- Batch UI updates (max 10 updates/sec)
- Use requestAnimationFrame equivalent for smooth animation
- Don't block evaluation on UI rendering

### Memory

- Keep only sliding window of recent results in memory
- Stream results to disk, not UI state
- Limit error storage to first N errors

### Responsiveness

- UI updates should be async
- Never await UI operations in eval loop
- Use message passing for thread safety

### Accessibility

- Support `NO_COLOR` environment variable
- Provide text alternatives for progress bars
- Ensure screen reader compatibility

---

## Open Questions

1. **How much detail by default?** Should we start verbose and let users quiet it down, or start minimal and let users expand?

2. **Streaming results**: Should individual test results stream to stdout (for piping/logging) or only show in the interactive UI?

3. **Failure handling**: Show first failure immediately, or wait for a few to detect patterns?

4. **Multi-eval support**: How to handle running multiple evals in parallel (different configs)?
