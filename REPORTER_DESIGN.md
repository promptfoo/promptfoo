# Jest-like Reporter System for Promptfoo

## Goal

Add a pluggable reporter system similar to Jest that displays real-time test results with pass/fail indicators, inline errors, grouping by plugin/strategy for red team scans, and a progress bar with running stats.

---

## Reference: Jest Reporter Documentation

When implementing, refer to these Jest resources:

### Jest Reporter Configuration

- **Config docs**: https://jestjs.io/docs/configuration#reporters-arraymodulename--modulename-options
- **Source types**: https://github.com/jestjs/jest/blob/main/packages/jest-reporters/src/types.ts
- **DefaultReporter**: https://github.com/jestjs/jest/blob/main/packages/jest-reporters/src/DefaultReporter.ts
- **BaseReporter**: https://github.com/jestjs/jest/blob/main/packages/jest-reporters/src/BaseReporter.ts

### Jest Reporter Interface (from types.ts)

```typescript
interface Reporter {
  onRunStart?(results: AggregatedResult, options: ReporterOnStartOptions): void | Promise<void>;
  onTestStart?(test: Test): void | Promise<void>;
  onTestCaseResult?(test: Test, testCaseResult: TestCaseResult): void | Promise<void>;
  onTestResult?(
    test: Test,
    testResult: TestResult,
    results: AggregatedResult,
  ): void | Promise<void>;
  onRunComplete?(testContexts: Set<TestContext>, results: AggregatedResult): void | Promise<void>;
  getLastError?(): Error | void;
}
```

### Jest Config Format

```javascript
// String format
reporters: ['default', 'jest-junit'];

// Tuple format with options
reporters: ['default', ['jest-junit', { outputDirectory: 'reports' }]];
```

### Jest Built-in Reporters

- `default` - Verbose output with progress
- `summary` - Final summary only
- `github-actions` - GitHub Actions annotations

---

## Example Output

**Red team evaluation:**

```
Prompt Injection
  ✓ Basic prompt injection attempt [openai:gpt-4o] (234ms)
  ✓ SQL injection via user input [openai:gpt-4o] (189ms)
  ✗ System prompt override [openai:gpt-4o] (312ms)
      Error: Expected refusal, got helpful response
  (2/3 passed, 67%)

Harmful Content (Base64)
  ✓ Encoded harmful request [openai:gpt-4o] (267ms)
  ✓ Multi-layer encoding [openai:gpt-4o] (298ms)
  (2/2 passed, 100%)

[========================================] 100% | 45/45 | 38 pass | 5 fail | 2 error
```

**Standard evaluation:**

```
✓ Should respond with greeting [openai:gpt-4o] (156ms)
✓ Should handle empty input [openai:gpt-4o] (134ms)
✗ Should not reveal system prompt [openai:gpt-4o] (201ms)
    Error: Response contained system prompt content
✓ Math calculation test [openai:gpt-4o] (89ms)

[========================================] 100% | 4/4 | 3 pass | 1 fail | 0 error
```

---

## Current Logging Architecture (Important Context)

### How Logging Works Now (`src/logger.ts`)

- **Winston logger** with multiple transports:
  - **Console transport**: Level controlled by `LOG_LEVEL` env or `--verbose` flag (default: 'info')
  - **Debug file transport**: Captures ALL levels to `~/.promptfoo/logs/promptfoo-debug-*.log`
  - **Error file transport**: Captures only errors to `~/.promptfoo/logs/promptfoo-error-*.log`
- **File logging is immediate** - Winston file transports write immediately, not buffered
- **`--verbose` flag** (`src/main.ts:114`): Sets console log level to 'debug' via `setLogLevel('debug')`
- **Progress bar** (`cli-progress`): Writes directly to stdout with ANSI codes
- **No console buffering**: Console output can interleave with progress bar

### The Problem

When debug logging is enabled (`--verbose`) or providers emit output, it can corrupt the progress bar display because there's no console output buffering.

### Jest's Solution (from DefaultReporter.ts)

Jest intercepts stdout/stderr with `__wrapStdio()`:

1. Replaces `process.stdout.write` with buffering function
2. Collects output chunks in an array
3. Debounces stdout flush (100ms), stderr flushes immediately
4. Before flushing: clears status, writes buffer, reprints status
5. Uses synchronized update blocks to prevent flickering

### Our Approach

- **Only buffer console output** - File transports continue writing immediately
- **Respect `--verbose` flag** - When verbose, show debug logs to console (after buffering/flush)
- **File logs are unaffected** - They already write immediately via Winston file transports
- **Console formatter** (`consoleFormatter` in logger.ts) is where console output goes - we intercept at process.stdout.write level, which is downstream of Winston

---

## Implementation Plan

### Phase 1: Create Output Controller

**New file: `src/reporters/OutputController.ts`**

Controls **console output only** (stdout/stderr) to prevent interference with reporter display.

**IMPORTANT**: This does NOT affect file logging - Winston file transports write directly to files, bypassing stdout/stderr entirely. The OutputController only intercepts `process.stdout.write` and `process.stderr.write`.

```typescript
class OutputController {
  private originalStdoutWrite: typeof process.stdout.write;
  private originalStderrWrite: typeof process.stderr.write;
  private stdoutBuffer: string[] = [];
  private stderrBuffer: string[] = [];
  private isCapturing: boolean = false;
  private flushTimeout: NodeJS.Timeout | null = null;

  // Start capturing stdout/stderr (console output only)
  startCapture(): void;

  // Stop capturing and restore original streams
  stopCapture(): void;

  // Flush buffered output (clears status first if callback provided)
  flush(clearStatus?: () => void, reprintStatus?: () => void): void;

  // Force immediate flush
  forceFlush(): void;

  // Write directly to stdout (bypasses buffer) - used by reporter for its own output
  writeToStdout(data: string): void;

  // Write directly to stderr (bypasses buffer)
  writeToStderr(data: string): void;
}
```

**Key behaviors:**

- **Only affects console output** - File transports (debug.log, error.log) write immediately and are unaffected
- stdout is debounced (100ms) to batch output
- stderr flushes immediately (errors shouldn't be lost)
- Provides hooks for clearing/reprinting status before/after flush
- Can be disabled for CI environments (no TTY)
- **Respects --verbose flag** - Debug logs still go to console when verbose is enabled, just buffered to not corrupt display

### Phase 2: Create Reporter Types and Interface

**New file: `src/reporters/types.ts`**

```typescript
import type { EvaluateResult, PromptMetrics, RunEvalOptions } from '../types/index';

export interface TestResultContext {
  result: EvaluateResult;
  evalStep: RunEvalOptions;
  metrics: PromptMetrics;
  completed: number;
  total: number;
  index: number;
}

export interface RunStartContext {
  totalTests: number;
  concurrency: number;
  isRedteam: boolean;
}

export interface EvalSummaryContext {
  successes: number;
  failures: number;
  errors: number;
  passRate: number;
  durationMs: number;
  isRedteam: boolean;
}

// All methods optional (like Jest)
export interface Reporter {
  onRunStart?(context: RunStartContext): void | Promise<void>;
  onTestStart?(evalStep: RunEvalOptions, index: number): void | Promise<void>;
  onTestResult?(context: TestResultContext): void | Promise<void>;
  onRunComplete?(context: EvalSummaryContext): void | Promise<void>;
  getLastError?(): Error | void;
}

// Config format: string or [string, options] tuple (like Jest)
export type ReporterConfig = string | [string, Record<string, unknown>];
```

### Phase 3: Create Built-in Reporters

**New file: `src/reporters/DefaultReporter.ts`**

Main reporter with Jest-like output:

```typescript
export interface DefaultReporterOptions {
  showErrors?: boolean; // Show errors inline (default: true)
  showGrouping?: boolean; // Group by plugin/strategy for redteam (default: true)
  showProgressBar?: boolean; // Show progress bar (default: true in TTY)
}

export class DefaultReporter implements Reporter {
  private outputController: OutputController;
  private progressBar: SingleBar | null = null;
  private currentGroup: string | null = null;
  private passCount = 0;
  private failCount = 0;
  private errorCount = 0;

  onRunStart(context: RunStartContext): void {
    // Start output capture if TTY
    // Initialize progress bar
  }

  onTestResult(context: TestResultContext): void {
    // Print group header if changed (for redteam)
    // Print test result line: ✓/✗ description [provider] (latency)
    // Print error inline if failed
    // Update progress bar
  }

  onRunComplete(context: EvalSummaryContext): void {
    // Print final group summary
    // Stop progress bar
    // Flush any remaining output
  }

  // Internal methods for status management
  private clearStatus(): void;
  private reprintStatus(): void;
}
```

**Display format:**

- `✓` (green) for pass
- `✗` (red) for fail
- `✗` (yellow) for error
- Indented under group headers for redteam
- Progress bar format: `[bar] percentage | completed/total | pass | fail | error`

**New file: `src/reporters/SilentReporter.ts`**

```typescript
export class SilentReporter implements Reporter {
  // All methods are no-ops
}
```

**New file: `src/reporters/JsonReporter.ts`**

```typescript
export class JsonReporter implements Reporter {
  onTestResult(context: TestResultContext): void {
    // Output NDJSON to stdout
    console.log(
      JSON.stringify({
        type: 'test-result',
        success: context.result.success,
        // ... other fields
      }),
    );
  }
}
```

**New file: `src/reporters/SummaryReporter.ts`**

```typescript
export class SummaryReporter implements Reporter {
  // Only outputs final summary, no per-test output
  onRunComplete(context: EvalSummaryContext): void {
    // Print summary stats
  }
}
```

### Phase 4: Create Reporter Manager

**New file: `src/reporters/index.ts`**

```typescript
export * from './types';
export { DefaultReporter } from './DefaultReporter';
export { SilentReporter } from './SilentReporter';
export { JsonReporter } from './JsonReporter';
export { SummaryReporter } from './SummaryReporter';
export { OutputController } from './OutputController';

const builtInReporters: Record<string, new (options?: any) => Reporter> = {
  default: DefaultReporter,
  verbose: DefaultReporter, // alias
  silent: SilentReporter,
  json: JsonReporter,
  summary: SummaryReporter,
};

export async function loadReporter(config: ReporterConfig): Promise<Reporter>;

export class ReporterManager {
  private reporters: Reporter[] = [];
  private outputController: OutputController;

  async addReporter(config: ReporterConfig): Promise<void>;
  async onRunStart(context: RunStartContext): Promise<void>;
  async onTestResult(context: TestResultContext): Promise<void>;
  async onRunComplete(context: EvalSummaryContext): Promise<void>;
}
```

### Phase 5: Add Config Schema Support

**Modify: `src/types/index.ts`**

Add to `EvaluateOptionsSchema` (~line 167):

```typescript
reporters: z.array(
  z.union([
    z.string(),
    z.tuple([z.string(), z.record(z.string(), z.any())])
  ])
).optional(),
```

### Phase 6: Wire Reporters into Evaluator

**Modify: `src/evaluator.ts`**

1. Import `ReporterManager` from `./reporters`
2. Add `reporterManager` field to `Evaluator` class
3. Replace `ProgressBarManager` usage with `ReporterManager`

**Key integration points:**

```typescript
// In _runEvaluation, after determining concurrency (~line 1437):
this.reporterManager = new ReporterManager();
// Default reporter if none specified
const reporterConfigs = this.options.reporters ?? ['default'];
for (const config of reporterConfigs) {
  await this.reporterManager.addReporter(config);
}
await this.reporterManager.onRunStart({
  totalTests: runEvalOptions.length,
  concurrency,
  isRedteam: this.testSuite.redteam != null,
});

// In processEvalStep, after addResult (~line 1234):
await this.reporterManager.onTestResult({
  result: row,
  evalStep,
  metrics,
  completed: numComplete,
  total: runEvalOptions.length,
  index: typeof index === 'number' ? index : 0,
});

// At end of _runEvaluation (~line 1826):
await this.reporterManager.onRunComplete({
  successes: this.stats.successes,
  failures: this.stats.failures,
  errors: this.stats.errors,
  passRate: totalTests > 0 ? (this.stats.successes / totalTests) * 100 : 0,
  durationMs: Date.now() - startTime,
  isRedteam: this.testSuite.redteam != null,
});
```

### Phase 7: Update Eval Command

**Modify: `src/commands/eval.ts`**

Pass reporters config to evaluate():

```typescript
const evaluateOptions: EvaluateOptions = {
  // ... existing options ...
  reporters: config.evaluateOptions?.reporters,
};
```

### Phase 8: Handle CI Environment

**Modify: `src/reporters/DefaultReporter.ts`**

Detect CI and adjust behavior:

```typescript
constructor(options: DefaultReporterOptions = {}) {
  const isTTY = process.stdout.isTTY && !isCI();
  this.options = {
    showProgressBar: options.showProgressBar ?? isTTY,
    // In CI, don't capture output (let it flow naturally)
    captureOutput: isTTY,
  };
}
```

---

## Files to Create

| File                                | Purpose                                  |
| ----------------------------------- | ---------------------------------------- |
| `src/reporters/types.ts`            | Reporter interface and context types     |
| `src/reporters/OutputController.ts` | stdout/stderr buffering for clean output |
| `src/reporters/DefaultReporter.ts`  | Jest-like verbose reporter with progress |
| `src/reporters/SilentReporter.ts`   | No-op reporter                           |
| `src/reporters/JsonReporter.ts`     | NDJSON output reporter                   |
| `src/reporters/SummaryReporter.ts`  | Summary-only reporter                    |
| `src/reporters/index.ts`            | Reporter manager, loading, and exports   |

## Files to Modify

| File                   | Changes                                         |
| ---------------------- | ----------------------------------------------- |
| `src/types/index.ts`   | Add `reporters` to EvaluateOptionsSchema        |
| `src/evaluator.ts`     | Replace ProgressBarManager with ReporterManager |
| `src/commands/eval.ts` | Pass reporters config to evaluate()             |

## Key Integration Points

| Location                                | Purpose                                         |
| --------------------------------------- | ----------------------------------------------- |
| `src/evaluator.ts:1234`                 | After `addResult` - call `onTestResult`         |
| `src/evaluator.ts:1289-1296`            | Pass/fail/error counts updated                  |
| `src/evaluator.ts:1316-1317`            | Current progress callback location              |
| `src/evaluator.ts:1437`                 | Progress bar setup - replace with reporter init |
| `src/redteam/constants/metadata.ts:195` | `displayNameOverrides` for plugin names         |

## Default Behavior

- **New reporter is the default** - Replace `ProgressBarManager` with `DefaultReporter`
- **CI detection**: In CI environments, disable output buffering and progress bar
- Users can customize with `reporters: ['silent']` or other reporters
- `showProgressBar: false` option still respected

## Config Examples

```yaml
# Default behavior (new Jest-like reporter) - no config needed

# Silent reporter (no output):
evaluateOptions:
  reporters:
    - silent

# Summary only (like Jest's summary reporter):
evaluateOptions:
  reporters:
    - summary

# Multiple reporters:
evaluateOptions:
  reporters:
    - default
    - json

# Customize default reporter:
evaluateOptions:
  reporters:
    - [default, { showErrors: false, showGrouping: false }]

# Custom reporter from file:
evaluateOptions:
  reporters:
    - file://./my-reporter.ts
```

## Logging Behavior (Critical)

### What OutputController Does

- **Intercepts**: `process.stdout.write` and `process.stderr.write` (console output only)
- **Buffers**: Console output to prevent corruption of progress display
- **Flushes**: Buffered output periodically (100ms debounce for stdout, immediate for stderr)

### What OutputController Does NOT Affect

- **File logging**: Winston file transports write directly to files, not through stdout/stderr
- **Log levels**: The `--verbose` flag still controls what gets logged
- **Debug/error log files**: Continue writing immediately to `~/.promptfoo/logs/`

### --verbose Flag Behavior

```
Without --verbose (default):
  Console: info, warn, error
  Debug file: debug, info, warn, error (ALL)
  Error file: error only

With --verbose:
  Console: debug, info, warn, error (ALL) - buffered to not corrupt display
  Debug file: debug, info, warn, error (ALL)
  Error file: error only
```

### Log File Locations

- Debug log: `~/.promptfoo/logs/promptfoo-debug-{timestamp}.log`
- Error log: `~/.promptfoo/logs/promptfoo-error-{timestamp}.log`
- Controlled by: `PROMPTFOO_LOG_DIR` env var
- Can be disabled: `PROMPTFOO_DISABLE_DEBUG_LOG=true` or `PROMPTFOO_DISABLE_ERROR_LOG=true`

---

## Testing Considerations

1. **Unit tests** for each reporter class
2. **Integration tests** for output buffering
3. **TTY vs non-TTY** behavior tests
4. **CI detection** tests
5. **Custom reporter loading** tests
6. **Verify file logging unaffected** - Logs should still write immediately to files
7. **Verify --verbose flag** - Debug logs should appear on console when enabled

## Migration Notes

- `ProgressBarManager` class will be replaced by `DefaultReporter`
- `CIProgressReporter` behavior absorbed into `DefaultReporter` with CI detection
- Existing `showProgressBar` option maps to `reporters: ['silent']` when false
