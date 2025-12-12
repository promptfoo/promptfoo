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

## Provider Testing

Every provider needs tests covering:

1. Success case
2. Error cases (4xx, 5xx, rate limits)
3. Configuration validation
4. Token usage tracking

See `test/providers/openai-codex-sdk.test.ts` for reference patterns.

## Test Configuration

- Config: `vitest.config.ts` (main tests) and `vitest.integration.config.ts` (integration tests)
- Setup: `vitest.setup.ts`
- Globals disabled: All test utilities must be explicitly imported from `vitest`
- Import `describe`, `it`, `expect`, `beforeEach`, `afterEach`, `vi` from `vitest`

## Best Practices

- Ensure all tests are independent and can run in any order
- Clean up any test data or mocks after each test
- Run the full test suite before committing changes
- Test failures should be deterministic
- For database tests, use in-memory instances or proper test fixtures
