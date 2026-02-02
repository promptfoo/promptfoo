# Test Suite

**What this is:** Vitest-based test suite for core promptfoo functionality.

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npx vitest run providers/openai

# Run tests matching pattern
npx vitest run -t "should handle errors"

# Run in watch mode
npm run test:watch

# Run integration tests
npm run test:integration
```

## Critical Rules

- **NEVER** increase test timeouts - fix the slow test
- **NEVER** use `.only()` or `.skip()` in committed code
- **ALWAYS** clean up mocks in `afterEach`
- Tests run in **random order by default** (configured in vitest.config.ts)
  - Use `--sequence.shuffle=false` to disable when debugging specific failures
  - Use `--sequence.seed=12345` to reproduce a specific order

## Writing Tests

**Reference files:**

- **Vitest (frontend)**: `src/app/src/hooks/usePageMeta.test.ts` - explicit imports
- **Vitest (backend)**: `test/assertions/contains.test.ts` - explicit imports

All tests require explicit imports from vitest:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetAllMocks(); // Prevents test pollution
});
```

## Directory Structure

Tests mirror `src/` structure:

- `test/providers/` → `src/providers/`
- `test/redteam/` → `src/redteam/`

## Mocking

```typescript
import { vi } from 'vitest';

vi.mock('axios');
const axiosMock = vi.mocked(axios);
axiosMock.post.mockResolvedValue({ data: { result: 'success' } });
```

- Use Vitest's mocking utilities (`vi.mock`, `vi.fn`, `vi.spyOn`)
- Prefer shallow mocking over deep mocking
- Mock external dependencies but not the code being tested
- Reset mocks between tests to prevent test pollution

**Critical: Mock Isolation**

`vi.clearAllMocks()` only clears call history, NOT mock implementations. Use `mockReset()` for full isolation:

```typescript
beforeEach(() => {
  vi.clearAllMocks(); // Clears .mock.calls and .mock.results
  vi.mocked(myMock).mockReset(); // Also clears mockReturnValue/mockResolvedValue
});
```

For `vi.hoisted()` mocks or mocks with `mockReturnValue()`, you MUST call `mockReset()` in `beforeEach` to ensure test isolation when tests run in random order.

## Zustand Store Testing

When testing components that use Zustand stores, prefer **integration testing with real stores** over mocking.

### When to Use Real Stores vs Mocking

**Use real stores (preferred)** when:

- Testing components that modify store state
- Verifying state changes after user interactions
- Testing store action logic (merge, update, delete)

**Mock the store** only when:

- Testing pure UI components that only read from stores
- Testing isolated component logic completely unrelated to state

### Pattern: Integration Testing with Real Stores

**Reference**: `src/app/src/pages/redteam/setup/components/PluginsTab.test.tsx`

```typescript
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest';
import { useMyStore } from './useMyStore';

// Capture initial state OUTSIDE describe block
const initialState = useMyStore.getState();

describe('MyComponent', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    act(() => {
      useMyStore.setState(initialState);
    });
  });

  afterEach(() => {
    // Clean up after each test
    act(() => {
      useMyStore.setState(initialState);
    });
  });

  test('user interaction updates store correctly', async () => {
    const user = userEvent.setup();

    // Verify initial state
    expect(useMyStore.getState().items).toHaveLength(0);

    render(<MyComponent />);

    await user.click(screen.getByRole('button', { name: 'Add Item' }));

    // Assert on actual store state, not mock calls
    await waitFor(() => {
      expect(useMyStore.getState().items).toHaveLength(1);
    });
  });
});
```

### Key Patterns

1. **Capture initial state outside describe**: `const initialState = useMyStore.getState();`
2. **Reset in beforeEach AND afterEach**: Ensures test isolation
3. **Wrap setState in act()**: Required for React state batching
4. **Assert on getState()**: Verify actual store state, not that a mock was called
5. **Use waitFor for async**: Store updates may be asynchronous
6. **Mock external dependencies only**: Mock APIs, analytics, child components—NOT the store

### Anti-Pattern: Mocking the Store (avoid this)

```typescript
// ❌ AVOID: Mocking the store hook loses integration coverage
vi.mock('./useMyStore');
const mockUpdateItems = vi.fn();
(useMyStore as any).mockReturnValue({
  items: [],
  updateItems: mockUpdateItems,
});

test('clicking button calls updateItems', () => {
  render(<MyComponent />);
  fireEvent.click(button);
  // Only verifies mock was called, not that store logic works
  expect(mockUpdateItems).toHaveBeenCalled();
});
```

### Additional Store Test References

- `src/app/src/store/providersStore.test.ts` - Basic store testing
- `src/app/src/stores/evalConfig.test.ts` - Configuration state
- `src/app/src/stores/userStore.test.ts` - Async operations with act()

## Provider Testing

Every provider needs tests covering:

1. Success case
2. Error cases (4xx, 5xx, rate limits)
3. Configuration validation
4. Token usage tracking

See `test/providers/openai-codex-sdk.test.ts` for reference patterns.

## Smoke Tests

Smoke tests verify the **built CLI package** works correctly end-to-end. They test `dist/src/main.js` directly using `spawnSync`.

```bash
# Run smoke tests
npm run test:smoke

# Run specific smoke test file
npx vitest run test/smoke/cli.test.ts --config vitest.smoke.config.ts
```

**Location:** `test/smoke/` with fixtures in `test/smoke/fixtures/configs/`

**Reference pattern** (from `test/smoke/filters-and-flags.test.ts`):

```typescript
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const CLI_PATH = path.resolve(__dirname, '../../dist/src/main.js');
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures/configs');
const OUTPUT_DIR = path.resolve(__dirname, '.temp-output');

function runCli(args: string[], options: { cwd?: string } = {}) {
  const result = spawnSync('node', [CLI_PATH, ...args], {
    cwd: options.cwd || path.resolve(__dirname, '../..'),
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1' },
    timeout: 60000,
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1,
  };
}

describe('My Smoke Tests', () => {
  beforeAll(() => {
    if (!fs.existsSync(CLI_PATH)) {
      throw new Error(`Built CLI not found. Run 'npm run build' first.`);
    }
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  });

  it('runs eval with echo provider', () => {
    const configPath = path.join(FIXTURES_DIR, 'basic.yaml');
    const outputPath = path.join(OUTPUT_DIR, 'output.json');

    const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    expect(parsed.results.results[0].response.output).toContain('Hello');
  });
});
```

**Key patterns:**

- Test the **built package** (`dist/src/main.js`), not source code
- Use `spawnSync` with `node` to run the CLI directly
- Fixtures go in `test/smoke/fixtures/configs/` (committed to git)
- Temp output directories cleaned up in `afterAll`
- Use `echo` provider for deterministic, zero-cost testing
- Check exit codes AND output file contents

**Fixture example** (`test/smoke/fixtures/configs/basic.yaml`):

```yaml
providers:
  - echo

prompts:
  - 'Hello {{name}}'

tests:
  - vars:
      name: World
    assert:
      - type: contains
        value: World
```

See `docs/plans/smoke-tests.md` for the full test checklist.

## Test Configuration

- Config: `vitest.config.ts` (unit tests), `vitest.integration.config.ts` (integration tests), `vitest.smoke.config.ts` (smoke tests)
- Setup: `vitest.setup.ts`
- Globals disabled: All test utilities must be explicitly imported from `vitest`
- Import `describe`, `it`, `expect`, `beforeEach`, `afterEach`, `vi` from `vitest`

## Testing Code with Timers

When testing code that uses `setTimeout`, `setInterval`, or `Date.now()`, use **fake timers** to make tests deterministic and fast.

**Reference files:**

- `test/scheduler/slotQueue.test.ts` - Comprehensive fake timer usage
- `test/scheduler/providerRateLimitState.test.ts` - Async code with timers

### Basic Pattern

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('MyTimerCode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('handles timeout', () => {
    const callback = vi.fn();
    setTimeout(callback, 1000);

    vi.advanceTimersByTime(1000);

    expect(callback).toHaveBeenCalled();
  });
});
```

### Async Code with Timers

When testing async functions that internally use timers, you cannot simply `await` them—the promise will hang because fake timers don't advance automatically. Use this pattern:

```typescript
it('handles async retry with delay', async () => {
  // 1. Start the promise (don't await yet)
  const promise = myAsyncFunctionWithRetry();

  // 2. Run all timers to completion
  await vi.runAllTimersAsync();

  // 3. Now await the result
  const result = await promise;

  expect(result).toBe('success');
});
```

### Why Fake Timers Matter

Real timers cause flaky tests because:

- **Timer resolution varies**: Windows has ~15ms minimum resolution vs ~1-4ms on Linux/Mac
- **Race conditions**: Code checking `Date.now()` multiple times can see different values if a millisecond boundary is crossed
- **CI variability**: Tests may pass locally but fail under CI load

**Anti-pattern** (causes flaky tests):

```typescript
// ❌ AVOID: Real timers with small delays
it('retries after delay', async () => {
  const result = await functionThatRetries({ retryAfterMs: 1 }); // May timeout randomly
});
```

**Correct pattern**:

```typescript
// ✓ CORRECT: Fake timers with controlled advancement
it('retries after delay', async () => {
  vi.useFakeTimers();
  const promise = functionThatRetries({ retryAfterMs: 1000 });
  await vi.runAllTimersAsync();
  const result = await promise;
  vi.useRealTimers();
});
```

## Best Practices

- Ensure all tests are independent and can run in any order
- Clean up any test data or mocks after each test
- Run the full test suite before committing changes
- Test failures should be deterministic
- For database tests, use in-memory instances or proper test fixtures
- **Use fake timers** for any code involving `setTimeout`, `setInterval`, or timing-sensitive logic
