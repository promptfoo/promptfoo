# Ink CLI Integration: Phased Implementation Plan

> **Related Document**: [Ink CLI Exploration](./ink-cli-exploration.md)
>
> This document provides a detailed, actionable implementation plan for integrating Ink into the promptfoo CLI.

---

## Overview

### Goals

1. Modernize CLI UI with React-based declarative components
2. Enable real-time, interactive progress display during evaluations
3. Create a reusable component library for consistent UX
4. Maintain full backward compatibility with non-interactive/CI usage
5. Improve testability of CLI UI code

### Guiding Principles

- **Incremental adoption** - Never break existing functionality
- **Lazy loading** - Don't load Ink for non-interactive commands
- **Parallel paths** - Old and new UI can coexist during migration
- **Feature flags** - Allow rollback via environment variables
- **Test coverage** - Every new component has tests

### Timeline Overview

| Phase   | Focus                | Dependency |
| ------- | -------------------- | ---------- |
| Phase 0 | Infrastructure & POC | None       |
| Phase 1 | Eval Command         | Phase 0    |
| Phase 2 | Interactive Prompts  | Phase 1    |
| Phase 3 | Full Migration       | Phase 2    |
| Phase 4 | Cleanup & Polish     | Phase 3    |

---

## Phase 0: Infrastructure & Proof of Concept

### Objective

Establish the foundational infrastructure for Ink integration and validate the approach with a minimal proof of concept.

### Duration Estimate

Small scope - foundational work

### Tasks

#### 0.1 Project Setup

**0.1.1 Install Dependencies**

```bash
# Core dependencies
npm install ink@5 react@19

# Dev dependencies
npm install -D ink-testing-library @types/react
```

**0.1.2 TypeScript Configuration**

Update `tsconfig.json` to support JSX in the new UI directory:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  }
}
```

**0.1.3 Build Configuration**

Ensure `tsdown` handles `.tsx` files in `src/ui/`:

```typescript
// tsdown.config.ts updates if needed
{
  entry: ['src/index.ts', 'src/main.ts'],
  // Ensure .tsx files are included
}
```

**Acceptance Criteria:**

- [ ] `npm install` succeeds with new dependencies
- [ ] TypeScript compiles `.tsx` files without errors
- [ ] Build output includes compiled UI components

---

#### 0.2 Directory Structure

Create the foundational directory structure:

```
src/ui/
├── index.ts                    # Public exports
├── render.ts                   # Ink render utilities
├── types.ts                    # UI-specific types
│
├── components/
│   └── shared/
│       └── .gitkeep
│
├── contexts/
│   └── .gitkeep
│
├── hooks/
│   └── .gitkeep
│
└── noninteractive/
    └── index.ts                # Non-TTY output utilities
```

**0.2.1 Create Render Utility**

```typescript
// src/ui/render.ts
import type { ReactElement } from 'react';

export interface RenderOptions {
  onExit?: () => void;
  exitOnCtrlC?: boolean;
}

/**
 * Renders an Ink component for interactive CLI usage.
 * Only loads Ink when actually needed (lazy loading).
 */
export async function renderInteractive(
  element: ReactElement,
  options: RenderOptions = {},
): Promise<{ waitUntilExit: () => Promise<void>; unmount: () => void }> {
  // Validate TTY before loading Ink
  if (!process.stdout.isTTY) {
    throw new Error(
      'Interactive mode requires a TTY. ' +
        'Use --no-interactive or pipe to a file for non-interactive usage.',
    );
  }

  // Lazy load Ink to avoid bundle overhead for non-interactive commands
  const { render } = await import('ink');

  const instance = render(element, {
    exitOnCtrlC: options.exitOnCtrlC ?? false,
    patchConsole: false,
  });

  if (options.onExit) {
    instance.waitUntilExit().then(options.onExit);
  }

  return instance;
}

/**
 * Check if we should use interactive mode.
 */
export function shouldUseInteractiveUI(): boolean {
  // Respect explicit flags
  if (process.env.PROMPTFOO_DISABLE_INTERACTIVE_UI === 'true') {
    return false;
  }

  // Must have TTY
  if (!process.stdout.isTTY) {
    return false;
  }

  // CI environments default to non-interactive
  if (process.env.CI === 'true') {
    return false;
  }

  return true;
}
```

**0.2.2 Create Non-Interactive Utilities**

```typescript
// src/ui/noninteractive/index.ts
import type { WriteStream } from 'node:tty';

/**
 * Simple text output for non-interactive mode.
 * Handles EPIPE errors gracefully (when piped output closes early).
 */
export class TextOutput {
  private stdout: WriteStream | NodeJS.WriteStream;
  private lastWasNewline = true;

  constructor(stdout: WriteStream | NodeJS.WriteStream = process.stdout) {
    this.stdout = stdout;

    // Handle EPIPE errors gracefully
    this.stdout.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EPIPE') {
        process.exit(0);
      }
      throw err;
    });
  }

  write(text: string): void {
    this.stdout.write(text);
    this.lastWasNewline = text.endsWith('\n');
  }

  writeLine(text: string): void {
    this.write(text + '\n');
  }

  ensureNewline(): void {
    if (!this.lastWasNewline) {
      this.write('\n');
    }
  }
}

/**
 * Progress output for non-interactive mode.
 * Simple text-based progress that works in CI/pipes.
 */
export class NonInteractiveProgress {
  private current = 0;
  private total = 0;
  private output: TextOutput;
  private lastPercent = -1;

  constructor(output: TextOutput = new TextOutput()) {
    this.output = output;
  }

  start(total: number, message?: string): void {
    this.total = total;
    this.current = 0;
    if (message) {
      this.output.writeLine(message);
    }
  }

  update(current: number, message?: string): void {
    this.current = current;
    const percent = Math.floor((current / this.total) * 100);

    // Only log at 10% intervals to reduce noise
    if (percent >= this.lastPercent + 10 || current === this.total) {
      this.lastPercent = percent;
      const msg = message ? ` - ${message}` : '';
      this.output.writeLine(`Progress: ${current}/${this.total} (${percent}%)${msg}`);
    }
  }

  finish(message?: string): void {
    if (message) {
      this.output.writeLine(message);
    }
  }
}
```

**Acceptance Criteria:**

- [ ] Directory structure created
- [ ] `renderInteractive()` function works with simple Ink component
- [ ] `shouldUseInteractiveUI()` correctly detects TTY/CI/env vars
- [ ] `TextOutput` handles EPIPE gracefully
- [ ] Non-interactive progress logs at reasonable intervals

---

#### 0.3 Proof of Concept: Minimal Progress Component

Create a minimal progress component to validate the integration approach.

**0.3.1 Create Progress Component**

```typescript
// src/ui/components/shared/ProgressBar.tsx
import React from 'react';
import { Box, Text } from 'ink';

export interface ProgressBarProps {
  value: number;        // 0-100
  width?: number;       // Character width
  showPercentage?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  width = 40,
  showPercentage = true,
}) => {
  const clampedValue = Math.max(0, Math.min(100, value));
  const filled = Math.round((clampedValue / 100) * width);
  const empty = width - filled;

  return (
    <Box>
      <Text color="green">{'█'.repeat(filled)}</Text>
      <Text color="gray">{'░'.repeat(empty)}</Text>
      {showPercentage && (
        <Text color="cyan">{` ${Math.round(clampedValue)}%`}</Text>
      )}
    </Box>
  );
};
```

**0.3.2 Create Spinner Component**

```typescript
// src/ui/components/shared/Spinner.tsx
import React from 'react';
import { Text } from 'ink';
import { useSpinnerFrame } from '../../hooks/useSpinnerFrame.js';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export interface SpinnerProps {
  label?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ label }) => {
  const frame = useSpinnerFrame(SPINNER_FRAMES);

  return (
    <Text>
      <Text color="cyan">{frame}</Text>
      {label && <Text>{` ${label}`}</Text>}
    </Text>
  );
};
```

**0.3.3 Create Spinner Hook**

```typescript
// src/ui/hooks/useSpinnerFrame.ts
import { useState, useEffect } from 'react';

export function useSpinnerFrame(frames: string[], intervalMs = 80): string {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % frames.length);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [frames.length, intervalMs]);

  return frames[frameIndex];
}
```

**0.3.4 Create POC Eval Progress Screen**

```typescript
// src/ui/components/eval/EvalProgressPOC.tsx
import React from 'react';
import { Box, Text } from 'ink';
import { ProgressBar } from '../shared/ProgressBar.js';
import { Spinner } from '../shared/Spinner.js';

export interface EvalProgressState {
  completed: number;
  total: number;
  errors: number;
  currentProvider?: string;
  currentPrompt?: string;
  isComplete: boolean;
}

export interface EvalProgressPOCProps {
  state: EvalProgressState;
}

export const EvalProgressPOC: React.FC<EvalProgressPOCProps> = ({ state }) => {
  const { completed, total, errors, currentProvider, isComplete } = state;
  const percentage = total > 0 ? (completed / total) * 100 : 0;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="blue">promptfoo eval</Text>
      </Box>

      {/* Progress bar */}
      <Box>
        {!isComplete && <Spinner />}
        <Text>{isComplete ? '✓ ' : '  '}</Text>
        <ProgressBar value={percentage} width={30} />
        <Text>{` ${completed}/${total}`}</Text>
        {errors > 0 && <Text color="red">{` (${errors} errors)`}</Text>}
      </Box>

      {/* Current operation */}
      {!isComplete && currentProvider && (
        <Box marginTop={1}>
          <Text dimColor>
            Running: <Text color="yellow">{currentProvider}</Text>
          </Text>
        </Box>
      )}

      {/* Completion message */}
      {isComplete && (
        <Box marginTop={1}>
          <Text color="green">
            Evaluation complete! {completed} tests run.
          </Text>
        </Box>
      )}
    </Box>
  );
};
```

**Acceptance Criteria:**

- [ ] `ProgressBar` renders correctly with various values
- [ ] `Spinner` animates smoothly
- [ ] `EvalProgressPOC` displays all state fields
- [ ] Components render without console errors

---

#### 0.4 Integration Test

Create a test script to validate the POC works end-to-end.

**0.4.1 Create Test Script**

```typescript
// scripts/test-ink-poc.tsx
import React, { useState, useEffect } from 'react';
import { renderInteractive } from '../src/ui/render.js';
import { EvalProgressPOC, type EvalProgressState } from '../src/ui/components/eval/EvalProgressPOC.js';

const TestApp: React.FC = () => {
  const [state, setState] = useState<EvalProgressState>({
    completed: 0,
    total: 50,
    errors: 0,
    currentProvider: 'openai:gpt-4',
    isComplete: false,
  });

  useEffect(() => {
    // Simulate progress
    const timer = setInterval(() => {
      setState((prev) => {
        if (prev.completed >= prev.total) {
          clearInterval(timer);
          return { ...prev, isComplete: true, currentProvider: undefined };
        }

        const newCompleted = prev.completed + 1;
        const newErrors = Math.random() < 0.1 ? prev.errors + 1 : prev.errors;

        return {
          ...prev,
          completed: newCompleted,
          errors: newErrors,
          currentProvider: ['openai:gpt-4', 'anthropic:claude-3', 'ollama:llama2'][
            Math.floor(Math.random() * 3)
          ],
        };
      });
    }, 100);

    return () => clearInterval(timer);
  }, []);

  return <EvalProgressPOC state={state} />;
};

async function main() {
  console.log('Starting Ink POC test...\n');

  const { waitUntilExit } = await renderInteractive(<TestApp />);
  await waitUntilExit();

  console.log('\nTest complete!');
}

main().catch(console.error);
```

**0.4.2 Add Test Script to package.json**

```json
{
  "scripts": {
    "test:ink-poc": "tsx scripts/test-ink-poc.tsx"
  }
}
```

**Acceptance Criteria:**

- [ ] `npm run test:ink-poc` runs successfully
- [ ] Progress bar updates in real-time
- [ ] Spinner animates during progress
- [ ] Completion state displays correctly
- [ ] No memory leaks or hanging processes

---

#### 0.5 Unit Tests

**0.5.1 Test Setup**

```typescript
// src/ui/__tests__/setup.ts
import { vi } from 'vitest';

// Mock stdin/stdout for testing
export function createMockStdio() {
  return {
    stdout: {
      write: vi.fn(),
      on: vi.fn(),
      columns: 80,
      rows: 24,
      isTTY: true,
    },
    stderr: {
      write: vi.fn(),
      on: vi.fn(),
    },
    stdin: {
      on: vi.fn(),
      setRawMode: vi.fn(),
      isTTY: true,
    },
  };
}
```

**0.5.2 Component Tests**

```typescript
// src/ui/components/shared/__tests__/ProgressBar.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { ProgressBar } from '../ProgressBar.js';

describe('ProgressBar', () => {
  it('renders 0% progress', () => {
    const { lastFrame } = render(<ProgressBar value={0} width={10} />);
    expect(lastFrame()).toContain('░░░░░░░░░░');
    expect(lastFrame()).toContain('0%');
  });

  it('renders 50% progress', () => {
    const { lastFrame } = render(<ProgressBar value={50} width={10} />);
    expect(lastFrame()).toContain('█████');
    expect(lastFrame()).toContain('50%');
  });

  it('renders 100% progress', () => {
    const { lastFrame } = render(<ProgressBar value={100} width={10} />);
    expect(lastFrame()).toContain('██████████');
    expect(lastFrame()).toContain('100%');
  });

  it('clamps values below 0', () => {
    const { lastFrame } = render(<ProgressBar value={-10} width={10} />);
    expect(lastFrame()).toContain('0%');
  });

  it('clamps values above 100', () => {
    const { lastFrame } = render(<ProgressBar value={150} width={10} />);
    expect(lastFrame()).toContain('100%');
  });

  it('hides percentage when showPercentage is false', () => {
    const { lastFrame } = render(
      <ProgressBar value={50} width={10} showPercentage={false} />
    );
    expect(lastFrame()).not.toContain('%');
  });
});
```

```typescript
// src/ui/components/eval/__tests__/EvalProgressPOC.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { EvalProgressPOC } from '../EvalProgressPOC.js';

describe('EvalProgressPOC', () => {
  it('renders initial state', () => {
    const { lastFrame } = render(
      <EvalProgressPOC
        state={{
          completed: 0,
          total: 10,
          errors: 0,
          isComplete: false,
        }}
      />
    );

    expect(lastFrame()).toContain('0/10');
    expect(lastFrame()).toContain('promptfoo eval');
  });

  it('renders progress', () => {
    const { lastFrame } = render(
      <EvalProgressPOC
        state={{
          completed: 5,
          total: 10,
          errors: 0,
          currentProvider: 'openai:gpt-4',
          isComplete: false,
        }}
      />
    );

    expect(lastFrame()).toContain('5/10');
    expect(lastFrame()).toContain('openai:gpt-4');
  });

  it('renders errors', () => {
    const { lastFrame } = render(
      <EvalProgressPOC
        state={{
          completed: 5,
          total: 10,
          errors: 2,
          isComplete: false,
        }}
      />
    );

    expect(lastFrame()).toContain('2 errors');
  });

  it('renders completion state', () => {
    const { lastFrame } = render(
      <EvalProgressPOC
        state={{
          completed: 10,
          total: 10,
          errors: 0,
          isComplete: true,
        }}
      />
    );

    expect(lastFrame()).toContain('complete');
    expect(lastFrame()).toContain('10 tests');
  });
});
```

**Acceptance Criteria:**

- [ ] All unit tests pass
- [ ] Test coverage for core components > 80%
- [ ] Tests run in CI environment

---

#### 0.6 Documentation

**0.6.1 Create UI Component Guidelines**

````markdown
<!-- src/ui/README.md -->

# promptfoo CLI UI Components

This directory contains React components for the interactive CLI UI,
built with [Ink](https://github.com/vadimdemedes/ink).

## Architecture

- `components/` - Reusable UI components
- `contexts/` - React contexts for state management
- `hooks/` - Custom React hooks
- `noninteractive/` - Fallback for non-TTY environments

## Usage

Interactive UI is automatically used when:

1. stdout is a TTY
2. Not running in CI
3. `PROMPTFOO_DISABLE_INTERACTIVE_UI` is not set

## Adding New Components

1. Create component in appropriate subdirectory
2. Export from `src/ui/index.ts`
3. Add unit tests using `ink-testing-library`
4. Follow existing patterns (see `ProgressBar.tsx`)

## Testing

```bash
npm run test -- src/ui
```
````

````

**Acceptance Criteria:**
- [ ] README.md documents architecture
- [ ] Component usage patterns documented
- [ ] Testing instructions included

---

### Phase 0 Completion Checklist

- [ ] Dependencies installed and building
- [ ] Directory structure in place
- [ ] `renderInteractive()` utility working
- [ ] Non-interactive fallback utilities ready
- [ ] POC progress component rendering
- [ ] Unit tests passing
- [ ] Documentation complete
- [ ] No regressions in existing CLI functionality

---

## Phase 1: Eval Command Integration

### Objective

Integrate Ink-based progress UI into the `eval` command while maintaining full backward compatibility.

### Duration Estimate

Medium scope - core feature implementation

### Prerequisites

- Phase 0 complete
- Familiarity with `src/evaluator.ts` event system

### Tasks

#### 1.1 Eval State Management

**1.1.1 Create Eval Context**

```typescript
// src/ui/contexts/EvalContext.tsx
import React, { createContext, useContext, useReducer, type ReactNode } from 'react';

export interface TestResult {
  id: string;
  provider: string;
  prompt: string;
  status: 'pending' | 'running' | 'pass' | 'fail' | 'error';
  score?: number;
  error?: string;
  latencyMs?: number;
}

export interface EvalState {
  status: 'idle' | 'running' | 'complete' | 'error';
  startTime?: Date;
  endTime?: Date;

  // Progress
  totalTests: number;
  completedTests: number;
  passedTests: number;
  failedTests: number;
  errorCount: number;

  // Current operation
  currentProvider?: string;
  currentPrompt?: string;
  currentTestIndex?: number;

  // Results
  results: TestResult[];

  // Configuration
  configPath?: string;
  providers: string[];
}

type EvalAction =
  | { type: 'START_EVAL'; payload: { totalTests: number; providers: string[]; configPath?: string } }
  | { type: 'START_TEST'; payload: { provider: string; prompt: string; testIndex: number } }
  | { type: 'COMPLETE_TEST'; payload: TestResult }
  | { type: 'COMPLETE_EVAL' }
  | { type: 'ERROR'; payload: { error: string } }
  | { type: 'RESET' };

function evalReducer(state: EvalState, action: EvalAction): EvalState {
  switch (action.type) {
    case 'START_EVAL':
      return {
        ...state,
        status: 'running',
        startTime: new Date(),
        totalTests: action.payload.totalTests,
        providers: action.payload.providers,
        configPath: action.payload.configPath,
        completedTests: 0,
        passedTests: 0,
        failedTests: 0,
        errorCount: 0,
        results: [],
      };

    case 'START_TEST':
      return {
        ...state,
        currentProvider: action.payload.provider,
        currentPrompt: action.payload.prompt,
        currentTestIndex: action.payload.testIndex,
      };

    case 'COMPLETE_TEST': {
      const result = action.payload;
      const isPass = result.status === 'pass';
      const isFail = result.status === 'fail';
      const isError = result.status === 'error';

      return {
        ...state,
        completedTests: state.completedTests + 1,
        passedTests: state.passedTests + (isPass ? 1 : 0),
        failedTests: state.failedTests + (isFail ? 1 : 0),
        errorCount: state.errorCount + (isError ? 1 : 0),
        results: [...state.results, result],
      };
    }

    case 'COMPLETE_EVAL':
      return {
        ...state,
        status: 'complete',
        endTime: new Date(),
        currentProvider: undefined,
        currentPrompt: undefined,
        currentTestIndex: undefined,
      };

    case 'ERROR':
      return {
        ...state,
        status: 'error',
        endTime: new Date(),
      };

    case 'RESET':
      return initialEvalState;

    default:
      return state;
  }
}

const initialEvalState: EvalState = {
  status: 'idle',
  totalTests: 0,
  completedTests: 0,
  passedTests: 0,
  failedTests: 0,
  errorCount: 0,
  results: [],
  providers: [],
};

const EvalStateContext = createContext<EvalState | null>(null);
const EvalDispatchContext = createContext<React.Dispatch<EvalAction> | null>(null);

export function EvalProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(evalReducer, initialEvalState);

  return (
    <EvalStateContext.Provider value={state}>
      <EvalDispatchContext.Provider value={dispatch}>
        {children}
      </EvalDispatchContext.Provider>
    </EvalStateContext.Provider>
  );
}

export function useEvalState(): EvalState {
  const context = useContext(EvalStateContext);
  if (!context) {
    throw new Error('useEvalState must be used within EvalProvider');
  }
  return context;
}

export function useEvalDispatch(): React.Dispatch<EvalAction> {
  const context = useContext(EvalDispatchContext);
  if (!context) {
    throw new Error('useEvalDispatch must be used within EvalProvider');
  }
  return context;
}
````

**Acceptance Criteria:**

- [ ] `EvalProvider` manages eval state
- [ ] All action types update state correctly
- [ ] Context hooks work as expected

---

#### 1.2 Eval Progress Components

**1.2.1 Create Full Eval Screen**

```typescript
// src/ui/components/eval/EvalScreen.tsx
import React from 'react';
import { Box, Text, useApp } from 'ink';
import { useEvalState } from '../../contexts/EvalContext.js';
import { ProgressBar } from '../shared/ProgressBar.js';
import { Spinner } from '../shared/Spinner.js';
import { ProviderStatusList } from './ProviderStatusList.js';
import { ErrorSummary } from './ErrorSummary.js';
import { useKeypress } from '../../hooks/useKeypress.js';

export const EvalScreen: React.FC = () => {
  const state = useEvalState();
  const { exit } = useApp();

  // Handle Ctrl+C
  useKeypress((key) => {
    if (key.ctrl && key.name === 'c') {
      // TODO: Trigger cancellation via evaluator
      exit();
    }
  });

  const percentage = state.totalTests > 0
    ? (state.completedTests / state.totalTests) * 100
    : 0;

  const isRunning = state.status === 'running';
  const isComplete = state.status === 'complete';

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="blue">
          {isRunning && <Spinner />}
          {isRunning && ' '}
          promptfoo eval
        </Text>
        {state.configPath && (
          <Text dimColor>{` - ${state.configPath}`}</Text>
        )}
      </Box>

      {/* Progress Section */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <ProgressBar value={percentage} width={40} />
          <Text>
            {` ${state.completedTests}/${state.totalTests}`}
          </Text>
        </Box>

        {/* Stats row */}
        <Box gap={2}>
          <Text color="green">✓ {state.passedTests} passed</Text>
          {state.failedTests > 0 && (
            <Text color="red">✗ {state.failedTests} failed</Text>
          )}
          {state.errorCount > 0 && (
            <Text color="yellow">⚠ {state.errorCount} errors</Text>
          )}
        </Box>
      </Box>

      {/* Current operation */}
      {isRunning && state.currentProvider && (
        <Box marginBottom={1}>
          <Text dimColor>
            Testing: <Text color="cyan">{state.currentProvider}</Text>
          </Text>
        </Box>
      )}

      {/* Provider status (optional detail view) */}
      {state.providers.length > 1 && (
        <ProviderStatusList providers={state.providers} results={state.results} />
      )}

      {/* Error summary */}
      {state.errorCount > 0 && (
        <ErrorSummary results={state.results} />
      )}

      {/* Completion message */}
      {isComplete && (
        <Box marginTop={1} flexDirection="column">
          <Text color="green" bold>
            Evaluation complete!
          </Text>
          {state.startTime && state.endTime && (
            <Text dimColor>
              Duration: {formatDuration(state.endTime.getTime() - state.startTime.getTime())}
            </Text>
          )}
        </Box>
      )}

      {/* Footer hint */}
      {isRunning && (
        <Box marginTop={1}>
          <Text dimColor>Press Ctrl+C to cancel</Text>
        </Box>
      )}
    </Box>
  );
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}
```

**1.2.2 Create Supporting Components**

```typescript
// src/ui/components/eval/ProviderStatusList.tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { TestResult } from '../../contexts/EvalContext.js';

interface Props {
  providers: string[];
  results: TestResult[];
}

export const ProviderStatusList: React.FC<Props> = ({ providers, results }) => {
  const getProviderStats = (provider: string) => {
    const providerResults = results.filter((r) => r.provider === provider);
    return {
      total: providerResults.length,
      passed: providerResults.filter((r) => r.status === 'pass').length,
      failed: providerResults.filter((r) => r.status === 'fail').length,
      errors: providerResults.filter((r) => r.status === 'error').length,
    };
  };

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold dimColor>Providers:</Text>
      {providers.map((provider) => {
        const stats = getProviderStats(provider);
        return (
          <Box key={provider} paddingLeft={2}>
            <Text>
              {stats.total > 0 ? (
                stats.errors > 0 ? (
                  <Text color="yellow">◐</Text>
                ) : stats.failed > 0 ? (
                  <Text color="red">●</Text>
                ) : (
                  <Text color="green">●</Text>
                )
              ) : (
                <Text dimColor>○</Text>
              )}
              {' '}
              <Text>{provider}</Text>
              {stats.total > 0 && (
                <Text dimColor>
                  {' '}({stats.passed}/{stats.total})
                </Text>
              )}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};
```

```typescript
// src/ui/components/eval/ErrorSummary.tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { TestResult } from '../../contexts/EvalContext.js';

interface Props {
  results: TestResult[];
  maxErrors?: number;
}

export const ErrorSummary: React.FC<Props> = ({ results, maxErrors = 3 }) => {
  const errors = results
    .filter((r) => r.status === 'error' && r.error)
    .slice(0, maxErrors);

  if (errors.length === 0) return null;

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold color="red">Recent errors:</Text>
      {errors.map((error, i) => (
        <Box key={i} paddingLeft={2} flexDirection="column">
          <Text color="yellow">{error.provider}</Text>
          <Text dimColor wrap="truncate-end">
            {error.error?.slice(0, 80)}
          </Text>
        </Box>
      ))}
    </Box>
  );
};
```

**Acceptance Criteria:**

- [ ] `EvalScreen` displays all progress information
- [ ] Provider status shows per-provider breakdown
- [ ] Error summary shows recent errors
- [ ] Ctrl+C handling works

---

#### 1.3 Evaluator Integration

**1.3.1 Create Eval UI Bridge**

```typescript
// src/ui/eval/evalBridge.ts
import type { EvalState } from '../contexts/EvalContext.js';

type EvalDispatch = React.Dispatch<{
  type: string;
  payload?: unknown;
}>;

/**
 * Bridge between evaluator events and React state.
 * This connects the existing evaluator to the new UI.
 */
export function createEvalBridge(dispatch: EvalDispatch) {
  return {
    onStart(totalTests: number, providers: string[], configPath?: string) {
      dispatch({
        type: 'START_EVAL',
        payload: { totalTests, providers, configPath },
      });
    },

    onTestStart(provider: string, prompt: string, testIndex: number) {
      dispatch({
        type: 'START_TEST',
        payload: { provider, prompt, testIndex },
      });
    },

    onTestComplete(result: {
      id: string;
      provider: string;
      prompt: string;
      pass: boolean;
      score?: number;
      error?: string;
      latencyMs?: number;
    }) {
      dispatch({
        type: 'COMPLETE_TEST',
        payload: {
          ...result,
          status: result.error ? 'error' : result.pass ? 'pass' : 'fail',
        },
      });
    },

    onComplete() {
      dispatch({ type: 'COMPLETE_EVAL' });
    },

    onError(error: string) {
      dispatch({ type: 'ERROR', payload: { error } });
    },
  };
}
```

**1.3.2 Modify Eval Command**

```typescript
// src/commands/eval.ts (modifications)
import { shouldUseInteractiveUI, renderInteractive } from '../ui/render.js';

// Inside evalCommand action handler:
async function runEval(options: EvalOptions) {
  // ... existing setup code ...

  if (shouldUseInteractiveUI() && !options.noProgressBar) {
    // Use new Ink UI
    await runEvalWithInkUI(config, options);
  } else {
    // Use existing progress bar (backward compatible)
    await runEvalWithLegacyUI(config, options);
  }
}

async function runEvalWithInkUI(config: EvalConfig, options: EvalOptions) {
  const { EvalProvider, useEvalDispatch } = await import('../ui/contexts/EvalContext.js');
  const { EvalScreen } = await import('../ui/components/eval/EvalScreen.js');
  const { createEvalBridge } = await import('../ui/eval/evalBridge.js');

  // Create a component that wires up the evaluator
  const EvalApp: React.FC = () => {
    const dispatch = useEvalDispatch();
    const bridge = React.useMemo(() => createEvalBridge(dispatch), [dispatch]);

    React.useEffect(() => {
      // Run evaluation and dispatch events
      runEvaluator(config, {
        onStart: bridge.onStart,
        onTestStart: bridge.onTestStart,
        onTestComplete: bridge.onTestComplete,
        onComplete: bridge.onComplete,
        onError: bridge.onError,
      }).catch((err) => {
        bridge.onError(err.message);
      });
    }, []);

    return <EvalScreen />;
  };

  const { waitUntilExit } = await renderInteractive(
    <EvalProvider>
      <EvalApp />
    </EvalProvider>
  );

  await waitUntilExit();
}
```

**Acceptance Criteria:**

- [ ] `shouldUseInteractiveUI()` correctly selects UI mode
- [ ] Ink UI displays during interactive eval
- [ ] Legacy progress bar still works when Ink is disabled
- [ ] Events from evaluator update UI state correctly
- [ ] Ctrl+C cancels evaluation

---

#### 1.4 Feature Flag & Backward Compatibility

**1.4.1 Add Environment Variable Support**

```typescript
// src/ui/render.ts (update shouldUseInteractiveUI)
export function shouldUseInteractiveUI(): boolean {
  // Explicit disable
  if (process.env.PROMPTFOO_DISABLE_INTERACTIVE_UI === 'true') {
    return false;
  }

  // Explicit enable (for testing)
  if (process.env.PROMPTFOO_ENABLE_INTERACTIVE_UI === 'true') {
    return process.stdout.isTTY;
  }

  // Default: disabled during initial rollout
  // Change to `true` after stabilization
  const defaultEnabled = false;

  if (!defaultEnabled) {
    return false;
  }

  // Standard checks
  if (!process.stdout.isTTY) return false;
  if (process.env.CI === 'true') return false;

  return true;
}
```

**1.4.2 Add CLI Flag**

```typescript
// src/commands/eval.ts
evalCmd.option('--interactive-ui', 'Use interactive terminal UI (experimental)', false);

evalCmd.option('--no-interactive-ui', 'Disable interactive terminal UI');
```

**Acceptance Criteria:**

- [ ] `PROMPTFOO_DISABLE_INTERACTIVE_UI=true` disables Ink
- [ ] `PROMPTFOO_ENABLE_INTERACTIVE_UI=true` enables Ink
- [ ] `--interactive-ui` flag works
- [ ] `--no-interactive-ui` flag works
- [ ] Default behavior matches existing CLI

---

#### 1.5 Testing

**1.5.1 Integration Tests**

```typescript
// test/ui/eval.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { EvalProvider } from '../../src/ui/contexts/EvalContext.js';
import { EvalScreen } from '../../src/ui/components/eval/EvalScreen.js';

describe('EvalScreen Integration', () => {
  it('displays initial state', () => {
    const { lastFrame } = render(
      <EvalProvider>
        <EvalScreen />
      </EvalProvider>
    );

    expect(lastFrame()).toContain('promptfoo eval');
    expect(lastFrame()).toContain('0/0');
  });

  it('updates progress when tests complete', async () => {
    // Test with dispatch actions
  });

  it('shows completion message when done', () => {
    // Test complete state
  });
});
```

**Acceptance Criteria:**

- [ ] Unit tests for all new components
- [ ] Integration tests for eval flow
- [ ] Tests pass in CI

---

### Phase 1 Completion Checklist

- [ ] `EvalContext` managing state correctly
- [ ] `EvalScreen` rendering all information
- [ ] Evaluator bridge dispatching events
- [ ] Feature flags working
- [ ] Backward compatibility maintained
- [ ] Tests passing
- [ ] Documentation updated

---

## Phase 2: Interactive Prompts

### Objective

Replace Inquirer.js prompts with Ink components for `init`, `redteam init`, and other interactive commands.

### Prerequisites

- Phase 1 complete
- Understanding of current Inquirer usage patterns

### Tasks

#### 2.1 Prompt Components

**2.1.1 Create Select Component**

```typescript
// src/ui/components/prompts/Select.tsx
import React, { useState } from 'react';
import { Box, Text, useApp } from 'ink';
import { useKeypress } from '../../hooks/useKeypress.js';

export interface SelectOption<T = string> {
  label: string;
  value: T;
  hint?: string;
}

export interface SelectProps<T = string> {
  message: string;
  options: SelectOption<T>[];
  onSelect: (value: T) => void;
  onCancel?: () => void;
  initialIndex?: number;
}

export function Select<T = string>({
  message,
  options,
  onSelect,
  onCancel,
  initialIndex = 0,
}: SelectProps<T>) {
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const { exit } = useApp();

  useKeypress((key) => {
    if (key.name === 'up' || (key.ctrl && key.name === 'p')) {
      setSelectedIndex((i) => (i > 0 ? i - 1 : options.length - 1));
    } else if (key.name === 'down' || (key.ctrl && key.name === 'n')) {
      setSelectedIndex((i) => (i < options.length - 1 ? i + 1 : 0));
    } else if (key.name === 'return') {
      onSelect(options[selectedIndex].value);
    } else if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
      if (onCancel) {
        onCancel();
      } else {
        exit();
      }
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold color="blue">{message}</Text>
      <Box flexDirection="column" marginTop={1}>
        {options.map((option, index) => (
          <Box key={index}>
            <Text color={index === selectedIndex ? 'cyan' : undefined}>
              {index === selectedIndex ? '❯ ' : '  '}
              {option.label}
            </Text>
            {option.hint && index === selectedIndex && (
              <Text dimColor>{` - ${option.hint}`}</Text>
            )}
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>↑↓ to move, Enter to select, Esc to cancel</Text>
      </Box>
    </Box>
  );
}
```

**2.1.2 Create Confirm Component**

```typescript
// src/ui/components/prompts/Confirm.tsx
import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { useKeypress } from '../../hooks/useKeypress.js';

export interface ConfirmProps {
  message: string;
  onConfirm: (confirmed: boolean) => void;
  defaultValue?: boolean;
}

export const Confirm: React.FC<ConfirmProps> = ({
  message,
  onConfirm,
  defaultValue = false,
}) => {
  const [value, setValue] = useState(defaultValue);

  useKeypress((key) => {
    if (key.name === 'left' || key.name === 'h') {
      setValue(true);
    } else if (key.name === 'right' || key.name === 'l') {
      setValue(false);
    } else if (key.name === 'y') {
      onConfirm(true);
    } else if (key.name === 'n') {
      onConfirm(false);
    } else if (key.name === 'return') {
      onConfirm(value);
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold color="blue">{message}</Text>
      <Box marginTop={1} gap={2}>
        <Text
          color={value ? 'green' : undefined}
          bold={value}
        >
          {value ? '● ' : '○ '}Yes
        </Text>
        <Text
          color={!value ? 'red' : undefined}
          bold={!value}
        >
          {!value ? '● ' : '○ '}No
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>←→ to select, Y/N or Enter to confirm</Text>
      </Box>
    </Box>
  );
};
```

**2.1.3 Create TextInput Component**

```typescript
// src/ui/components/prompts/TextInput.tsx
import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { useKeypress } from '../../hooks/useKeypress.js';

export interface TextInputProps {
  message: string;
  onSubmit: (value: string) => void;
  onCancel?: () => void;
  placeholder?: string;
  defaultValue?: string;
  validate?: (value: string) => string | null; // Return error message or null
}

export const TextInput: React.FC<TextInputProps> = ({
  message,
  onSubmit,
  onCancel,
  placeholder,
  defaultValue = '',
  validate,
}) => {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);
  const [cursorPosition, setCursorPosition] = useState(defaultValue.length);

  useKeypress((key, input) => {
    if (key.name === 'return') {
      if (validate) {
        const validationError = validate(value);
        if (validationError) {
          setError(validationError);
          return;
        }
      }
      onSubmit(value);
    } else if (key.name === 'escape') {
      onCancel?.();
    } else if (key.name === 'backspace') {
      if (cursorPosition > 0) {
        setValue((v) => v.slice(0, cursorPosition - 1) + v.slice(cursorPosition));
        setCursorPosition((p) => p - 1);
        setError(null);
      }
    } else if (key.name === 'delete') {
      setValue((v) => v.slice(0, cursorPosition) + v.slice(cursorPosition + 1));
      setError(null);
    } else if (key.name === 'left') {
      setCursorPosition((p) => Math.max(0, p - 1));
    } else if (key.name === 'right') {
      setCursorPosition((p) => Math.min(value.length, p + 1));
    } else if (input && !key.ctrl && !key.meta) {
      setValue((v) => v.slice(0, cursorPosition) + input + v.slice(cursorPosition));
      setCursorPosition((p) => p + input.length);
      setError(null);
    }
  });

  const displayValue = value || placeholder || '';
  const showPlaceholder = !value && placeholder;

  // Render with cursor
  const beforeCursor = displayValue.slice(0, cursorPosition);
  const atCursor = displayValue[cursorPosition] || ' ';
  const afterCursor = displayValue.slice(cursorPosition + 1);

  return (
    <Box flexDirection="column">
      <Text bold color="blue">{message}</Text>
      <Box marginTop={1}>
        <Text color={showPlaceholder ? 'gray' : undefined}>
          {beforeCursor}
          <Text inverse>{atCursor}</Text>
          {afterCursor}
        </Text>
      </Box>
      {error && (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}
    </Box>
  );
};
```

**2.1.4 Create MultiSelect Component**

```typescript
// src/ui/components/prompts/MultiSelect.tsx
import React, { useState } from 'react';
import { Box, Text, useApp } from 'ink';
import { useKeypress } from '../../hooks/useKeypress.js';

export interface MultiSelectOption<T = string> {
  label: string;
  value: T;
  checked?: boolean;
}

export interface MultiSelectProps<T = string> {
  message: string;
  options: MultiSelectOption<T>[];
  onSubmit: (values: T[]) => void;
  onCancel?: () => void;
  min?: number;
  max?: number;
}

export function MultiSelect<T = string>({
  message,
  options: initialOptions,
  onSubmit,
  onCancel,
  min = 0,
  max = Infinity,
}: MultiSelectProps<T>) {
  const [focusIndex, setFocusIndex] = useState(0);
  const [options, setOptions] = useState(
    initialOptions.map((o) => ({ ...o, checked: o.checked ?? false }))
  );
  const { exit } = useApp();

  const selectedCount = options.filter((o) => o.checked).length;

  useKeypress((key) => {
    if (key.name === 'up') {
      setFocusIndex((i) => (i > 0 ? i - 1 : options.length - 1));
    } else if (key.name === 'down') {
      setFocusIndex((i) => (i < options.length - 1 ? i + 1 : 0));
    } else if (key.name === 'space') {
      setOptions((opts) =>
        opts.map((o, i) => {
          if (i !== focusIndex) return o;
          if (o.checked) return { ...o, checked: false };
          if (selectedCount >= max) return o;
          return { ...o, checked: true };
        })
      );
    } else if (key.name === 'return') {
      if (selectedCount >= min) {
        onSubmit(options.filter((o) => o.checked).map((o) => o.value));
      }
    } else if (key.name === 'escape') {
      onCancel ? onCancel() : exit();
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold color="blue">{message}</Text>
      <Box flexDirection="column" marginTop={1}>
        {options.map((option, index) => (
          <Box key={index}>
            <Text color={index === focusIndex ? 'cyan' : undefined}>
              {index === focusIndex ? '❯ ' : '  '}
              <Text color={option.checked ? 'green' : 'gray'}>
                {option.checked ? '◉' : '○'}
              </Text>
              {' '}{option.label}
            </Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          ↑↓ move, Space toggle, Enter submit ({selectedCount} selected)
        </Text>
      </Box>
    </Box>
  );
}
```

**Acceptance Criteria:**

- [ ] `Select` supports keyboard navigation
- [ ] `Confirm` supports Y/N and arrow keys
- [ ] `TextInput` supports full text editing
- [ ] `MultiSelect` supports toggle and submit
- [ ] All components handle cancel/escape

---

#### 2.2 Prompt Utility Wrapper

Create a utility that makes it easy to use prompts imperatively (like Inquirer):

```typescript
// src/ui/prompts/index.ts
import React from 'react';
import { renderInteractive } from '../render.js';
import { Select, type SelectOption } from '../components/prompts/Select.js';
import { Confirm } from '../components/prompts/Confirm.js';
import { TextInput } from '../components/prompts/TextInput.js';
import { MultiSelect, type MultiSelectOption } from '../components/prompts/MultiSelect.js';

export async function select<T = string>(options: {
  message: string;
  choices: SelectOption<T>[];
}): Promise<T> {
  return new Promise(async (resolve, reject) => {
    const { unmount } = await renderInteractive(
      <Select
        message={options.message}
        options={options.choices}
        onSelect={(value) => {
          unmount();
          resolve(value);
        }}
        onCancel={() => {
          unmount();
          reject(new Error('User cancelled'));
        }}
      />
    );
  });
}

export async function confirm(options: {
  message: string;
  default?: boolean;
}): Promise<boolean> {
  return new Promise(async (resolve) => {
    const { unmount } = await renderInteractive(
      <Confirm
        message={options.message}
        defaultValue={options.default}
        onConfirm={(value) => {
          unmount();
          resolve(value);
        }}
      />
    );
  });
}

export async function input(options: {
  message: string;
  default?: string;
  validate?: (value: string) => string | null;
}): Promise<string> {
  return new Promise(async (resolve, reject) => {
    const { unmount } = await renderInteractive(
      <TextInput
        message={options.message}
        defaultValue={options.default}
        validate={options.validate}
        onSubmit={(value) => {
          unmount();
          resolve(value);
        }}
        onCancel={() => {
          unmount();
          reject(new Error('User cancelled'));
        }}
      />
    );
  });
}

export async function multiselect<T = string>(options: {
  message: string;
  choices: MultiSelectOption<T>[];
  min?: number;
  max?: number;
}): Promise<T[]> {
  return new Promise(async (resolve, reject) => {
    const { unmount } = await renderInteractive(
      <MultiSelect
        message={options.message}
        options={options.choices}
        min={options.min}
        max={options.max}
        onSubmit={(values) => {
          unmount();
          resolve(values);
        }}
        onCancel={() => {
          unmount();
          reject(new Error('User cancelled'));
        }}
      />
    );
  });
}
```

**Acceptance Criteria:**

- [ ] `select()` returns selected value
- [ ] `confirm()` returns boolean
- [ ] `input()` returns string with validation
- [ ] `multiselect()` returns array of values
- [ ] All handle cancellation appropriately

---

#### 2.3 Migrate Init Command

**2.3.1 Update Init Command**

```typescript
// src/commands/init.ts (modifications)
import { shouldUseInteractiveUI } from '../ui/render.js';
import * as inkPrompts from '../ui/prompts/index.js';
import * as inquirerPrompts from './init-inquirer.js'; // Extract existing prompts

export async function runInit() {
  const prompts = shouldUseInteractiveUI() ? inkPrompts : inquirerPrompts;

  const projectType = await prompts.select({
    message: 'What type of project are you creating?',
    choices: [
      { label: 'Evaluation config', value: 'eval' },
      { label: 'Red team config', value: 'redteam' },
      { label: 'Custom', value: 'custom' },
    ],
  });

  // ... rest of init flow using prompts.*
}
```

**Acceptance Criteria:**

- [ ] Init command works with Ink prompts
- [ ] Init command works with Inquirer fallback
- [ ] All prompts display correctly
- [ ] Generated config is correct

---

#### 2.4 Migrate Redteam Init

Similar pattern to init command migration.

**Acceptance Criteria:**

- [ ] Redteam init works with Ink prompts
- [ ] Complex multi-step flow works correctly
- [ ] All options selectable

---

### Phase 2 Completion Checklist

- [ ] All prompt components implemented
- [ ] Prompt utility wrapper working
- [ ] Init command migrated
- [ ] Redteam init migrated
- [ ] Other interactive commands migrated
- [ ] Tests passing
- [ ] Documentation updated

---

## Phase 3: Full Migration

### Objective

Complete the migration of all remaining UI elements and remove legacy dependencies.

### Tasks

#### 3.1 Remaining Components

- [ ] Results table display
- [ ] List command output
- [ ] Show command output
- [ ] Error display improvements
- [ ] Help text formatting

#### 3.2 Remove Legacy Dependencies

Once all commands are migrated:

```bash
npm uninstall @inquirer/select @inquirer/confirm @inquirer/input @inquirer/checkbox
npm uninstall cli-progress ora
# Keep cli-table3 if still needed for non-interactive output
```

#### 3.3 Enable by Default

```typescript
// src/ui/render.ts
export function shouldUseInteractiveUI(): boolean {
  if (process.env.PROMPTFOO_DISABLE_INTERACTIVE_UI === 'true') {
    return false;
  }

  if (!process.stdout.isTTY) return false;
  if (process.env.CI === 'true') return false;

  return true; // Now enabled by default
}
```

---

## Phase 4: Cleanup & Polish

### Objective

Finalize the migration with performance optimization, documentation, and edge case handling.

### Tasks

#### 4.1 Performance Optimization

- [ ] Profile render times
- [ ] Add memoization where needed
- [ ] Implement virtualization for large lists
- [ ] Lazy load components

#### 4.2 Accessibility

- [ ] Screen reader support
- [ ] High contrast mode
- [ ] Keyboard-only navigation verification

#### 4.3 Documentation

- [ ] Component library documentation
- [ ] Migration guide for custom commands
- [ ] Troubleshooting guide

#### 4.4 Testing

- [ ] End-to-end tests
- [ ] Visual regression tests
- [ ] Cross-platform testing (macOS, Linux, Windows)

---

## Rollback Plan

If issues arise during any phase:

1. **Feature Flag**: Set `PROMPTFOO_DISABLE_INTERACTIVE_UI=true`
2. **CLI Flag**: Use `--no-interactive-ui`
3. **Revert**: Git revert the phase commits
4. **Dependencies**: Legacy dependencies remain until Phase 3 completion

---

## Success Metrics

| Metric                | Target                      |
| --------------------- | --------------------------- |
| Eval progress renders | < 50ms per update           |
| Prompt response time  | < 100ms input latency       |
| Test coverage         | > 80% for UI code           |
| No regressions        | All existing tests pass     |
| User feedback         | Positive response to new UI |

---

## References

- [Ink Documentation](https://github.com/vadimdemedes/ink)
- [Gemini CLI Source](https://github.com/google-gemini/gemini-cli)
- [ink-testing-library](https://github.com/vadimdemedes/ink-testing-library)
- [React Testing Patterns](https://testing-library.com/docs/react-testing-library/intro/)
