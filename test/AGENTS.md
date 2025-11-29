# Test Suite

**What this is:** Jest-based test suite for core promptfoo functionality (NOT Vitest - that's in `src/app/`).

## Critical Test Requirements

**ALWAYS use both flags:**

```bash
npm test -- --coverage --randomize
```

- `--coverage` - Required to track test coverage
- `--randomize` - **Critical** - Ensures tests don't depend on execution order

**NEVER:**

- Increase test timeouts - fix the slow test instead
- Use `.only()` or `.skip()` in committed code
- Run watch mode in CI

## Running Tests

```bash
# Run all tests
npm test -- --coverage --randomize

# Run specific test file
npx jest providers/openai --coverage --randomize

# Run tests matching pattern
npx jest -t "should handle errors"
```

Always run tests in a single pass to ensure consistent results.

## Project-Specific Testing Rules

**Mock cleanup is mandatory:**

```typescript
afterEach(() => {
  jest.resetAllMocks(); // Prevents test pollution
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
jest.mock('axios');
const axiosMock = axios as jest.Mocked<typeof axios>;
axiosMock.post.mockResolvedValue({ data: { result: 'success' } });
```

- Use Jest's mocking utilities rather than complex custom mocks
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

## Key Differences from Frontend Tests

- This uses **Jest** (not Vitest)
- Run from project root: `npm test`
- Uses `@jest/globals` imports
- Config: `jest.config.ts` (not Vitest)

## Best Practices

- Ensure all tests are independent and can run in any order
- Clean up any test data or mocks after each test
- Run the full test suite before committing changes
- Test failures should be deterministic
- For database tests, use in-memory instances or proper test fixtures
