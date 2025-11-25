# Jest to Vitest Migration State

Last updated: 2025-11-24

## Current Progress

| Metric | Count | Percentage |
|--------|-------|------------|
| Vitest tests | 902 | 10.6% |
| Jest tests | 7,573 | 89.4% |
| **Total tests** | **8,475** | 100% |

## Migrated Directories (Vitest)

These directories have been fully migrated to Vitest and are listed in `vitest.config.ts`:

1. `test/codeScans/` - Code scanning tests
2. `test/matchers/` - Matcher tests
3. `test/database/` - Database tests
4. `test/site/` - Site/documentation tests
5. `test/testCase/` - Test case tests
6. `test/validators/` - Validator tests
7. `test/utils/` - Utility tests
8. `test/models/` - Model tests
9. `test/app/` - App tests
10. `test/globalConfig/` - Global config tests
11. `test/integrations/` - Integration tests (including langfuse with proper class mocking)
12. `test/external/` - External assertion/matcher tests
13. `test/progress/` - Progress reporter tests
14. `test/types/` - Type validation tests

## Remaining Jest Directories

These directories still run with Jest (415 test files):

- `test/assertions/`
- `test/commands/`
- `test/evaluator/`
- `test/events/`
- `test/prompts/`
- `test/providers/` (large - 150+ files)
- `test/redteam/` (large - many files)
- `test/server/`
- `test/share/`
- `test/transform/`
- `test/tracing/`
- `test/python/`
- `test/logger.test.ts`
- `test/cache.test.ts`
- `test/config.test.ts`
- And more...

## Migration Pattern

When migrating a test file from Jest to Vitest:

### 1. Add Vitest imports
```typescript
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
```

### 2. Replace Jest mocking with Vitest equivalents
| Jest | Vitest |
|------|--------|
| `jest.mock()` | `vi.mock()` |
| `jest.fn()` | `vi.fn()` |
| `jest.mocked()` | `vi.mocked()` |
| `jest.spyOn()` | `vi.spyOn()` |
| `jest.resetAllMocks()` | `vi.resetAllMocks()` |
| `jest.clearAllMocks()` | `vi.clearAllMocks()` |
| `jest.useFakeTimers()` | `vi.useFakeTimers()` |
| `jest.useRealTimers()` | `vi.useRealTimers()` |
| `jest.advanceTimersByTime()` | `vi.advanceTimersByTime()` |
| `jest.getTimerCount()` | `vi.getTimerCount()` |
| `jest.resetModules()` | `vi.resetModules()` |
| `jest.doMock()` | `vi.doMock()` |

### 3. Handle `jest.requireActual()` (async in Vitest)
```typescript
// Jest
jest.mock('module', () => ({
  ...jest.requireActual('module'),
  someFunction: jest.fn(),
}));

// Vitest
vi.mock('module', async () => {
  const actual = await vi.importActual('module');
  return {
    ...actual,
    someFunction: vi.fn(),
  };
});
```

### 4. Replace Jest globals
| Jest | Vitest |
|------|--------|
| `fail()` | `expect.fail()` |
| `jest.Mock` type | `vi.Mock` or use `vi.mocked()` |

### 5. Mock default exports (different pattern)
```typescript
// Jest
jest.mock('../../src/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

// Vitest (for default exports)
vi.mock('../../src/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));
```

### 6. Update config files
- Add directory to `vitest.config.ts` include array
- Add directory to `jest.config.ts` testPathIgnorePatterns array

### 7. Mocking uninstalled/optional dependencies (vi.hoisted with class)
When mocking packages that aren't installed (like optional dependencies), use `vi.hoisted()` with a proper class mock:
```typescript
// Create mocks using vi.hoisted() - these are available in vi.mock() factories
const mocks = vi.hoisted(() => {
  const mockMethod = vi.fn();
  const constructorCalls: any[] = [];

  // Create a proper class mock
  class MockClass {
    method: typeof mockMethod;

    constructor(params: any) {
      constructorCalls.push(params);
      this.method = mockMethod;
    }
  }

  return { mockMethod, MockClass, constructorCalls };
});

// Use the hoisted class in vi.mock()
vi.mock('optional-package', () => ({
  SomeClass: mocks.MockClass,
}));

// In tests, use mocks.mockMethod and mocks.constructorCalls
```

## Commands

```bash
# Run Vitest tests only
npm run test:vitest

# Run Jest tests only
npm test

# Run both
npm run test:vitest && npm test

# Run specific Vitest directory
npm run test:vitest -- --run test/matchers

# Run specific Jest directory
npm test -- test/providers
```

## Next Steps for Migration

Recommended order for next migration batch (by complexity):

1. **Easy** - Single file tests with minimal mocking:
   - `test/logger.test.ts`
   - `test/cache.test.ts`
   - `test/config.test.ts`

2. **Medium** - Directories with moderate mocking:
   - `test/transform/`
   - `test/share/`
   - `test/events/`

3. **Complex** - Large directories with heavy mocking:
   - `test/assertions/`
   - `test/commands/`
   - `test/server/`

4. **Most Complex** - Very large with many dependencies:
   - `test/providers/` (~150+ files)
   - `test/redteam/` (many files)

## Notes

- Vitest runs significantly faster than Jest for the same tests
- The migration is designed to be gradual - both runners can coexist
- Tests can be migrated directory by directory
- Always verify tests pass after migration with `npm run test:vitest -- --run`
