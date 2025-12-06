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

## Critical Test Requirements

**NEVER:**

- Increase test timeouts - fix the slow test instead
- Use `.only()` or `.skip()` in committed code
- Run watch mode in CI

## Project-Specific Testing Rules

**Mock cleanup is mandatory:**

```typescript
afterEach(() => {
  vi.resetAllMocks(); // Prevents test pollution
});
```

**Test entire objects, not individual fields:**

```typescript
// Good
expect(result).toEqual({ id: 1, name: 'test', active: true });

// Avoid
expect(result.id).toEqual(1);
expect(result.name).toEqual('test');
```

**Mock minimally** - Only mock external dependencies (APIs, databases), not code under test.

## Directory Structure

Tests mirror `src/` structure:

- `test/providers/` → `src/providers/`
- `test/redteam/` → `src/redteam/`
- etc.

## Writing Tests

### Organize with describe/it blocks

```typescript
describe('OpenAI Provider', () => {
  describe('chat completion', () => {
    it('should handle normal input correctly', () => {
      // test code
    });

    it('should handle edge cases', () => {
      // test code
    });
  });
});
```

### Mocking

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

## Provider Testing

Every provider needs tests covering:

1. Success case (normal API response)
2. Error cases (4xx, 5xx, rate limits)
3. Configuration validation
4. Token usage tracking

See `test/providers/openai.test.ts` for reference patterns.

## Test Configuration

- Config: `vitest.config.ts` (main tests) and `vitest.integration.config.ts` (integration tests)
- Setup: `vitest.setup.ts`
- Globals enabled: `describe`, `it`, `expect`, `beforeEach`, `afterEach` available without imports
- For mocking utilities, import from `vitest`: `import { vi } from 'vitest'`

## Best Practices

- Ensure all tests are independent and can run in any order
- Clean up any test data or mocks after each test
- Run the full test suite before committing changes
- Test failures should be deterministic
- For database tests, use in-memory instances or proper test fixtures
