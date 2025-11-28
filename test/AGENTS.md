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

## Project-Specific Testing Rules

**Mock cleanup is mandatory:**

```typescript
afterEach(() => {
  jest.resetAllMocks(); // Prevents test pollution
});
```

**Test entire objects, not individual fields:**

```typescript
// ✅ Good
expect(result).toEqual({ id: 1, name: 'test', active: true });

// ❌ Avoid
expect(result.id).toEqual(1);
expect(result.name).toEqual('test');
```

**Mock minimally** - Only mock external dependencies (APIs, databases), not code under test.

## Directory Structure

Tests mirror `src/` structure:

- `test/providers/` → `src/providers/`
- `test/redteam/` → `src/redteam/`
- etc.

## Provider Testing Pattern

Every provider needs:

1. Success case (normal API response)
2. Error cases (4xx, 5xx, rate limits)
3. Configuration validation
4. Token usage tracking

See `test/providers/openai.test.ts` for reference patterns.

## Key Differences from Frontend Tests

- This uses **Jest** (not Vitest)
- Run from project root: `npm test`
- Uses `@jest/globals` imports
- Different config: `jest.config.ts` (not Vitest)

## More Details

See `.cursor/rules/jest.mdc` for comprehensive Jest guidelines.
