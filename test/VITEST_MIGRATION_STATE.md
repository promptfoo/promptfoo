# Jest to Vitest Migration State

Last updated: 2025-11-29

## Current Progress

| Metric          | Count     | Percentage |
| --------------- | --------- | ---------- |
| Vitest tests    | 5,209     | ~60%       |
| Jest tests      | 3,500     | ~40%       |
| **Total tests** | **8,709** | 100%       |

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
15. `test/prompts/` - Prompt processing tests (16 files, 158 tests)
16. `test/python/` - Python provider tests (6 files, 48 tests) - complex `util.promisify` mocking
17. `test/logger.test.ts` - Logger tests (61 tests) - complex winston mocking with `vi.hoisted()`
18. `test/cache.test.ts` - Cache tests (16 tests) - cache-manager mocking with default exports
19. `test/config-schema.test.ts` - Config schema validation tests (12 tests)
20. `test/tracing/` - Tracing tests (5 files, 38 tests) - top-level await with `vi.mocked()` for module mocking
21. `test/util/` - Utility function tests (37 files, ~460 tests) - complex mocking including `vi.importActual()`, default exports, and `vi.doMock()` patterns
22. `test/assertions/` - Assertion tests (46 files, ~500 tests) - complex `vi.hoisted()` mocking patterns
23. `test/share.test.ts` - Share flow tests (cloud + self-hosted paths)
24. `test/envars.test.ts` - Environment variable helpers
25. `test/constants.test.ts` - Global constants
26. `test/feedback.test.ts` - Feedback flows
27. `test/rateLimit.test.ts` - Fetch retry/backoff
28. `test/googleSheets.test.ts` - Google Sheets integration helpers
29. `test/providers.slack.test.ts` - Slack provider
30. `test/account.test.ts` - Account helpers
31. `test/checkNodeVersion.test.ts` - Node version check
32. `test/csv.test.ts` - CSV helpers
33. `test/index.test.ts` - Package exports smoke test
34. `test/monkeyPatchFetch.test.ts` - Fetch monkey-patch logging
35. `test/microsoftSharepoint.test.ts` - SharePoint CSV import
36. `test/updates.test.ts` - Update checks (npm + PyPI)
37. `test/commands/generate/` - Generate command dataset/assertion tests (2 files)
38. `test/providers/bedrock/index.test.ts` - Bedrock provider tests (~164 tests)
39. `test/providers/http.test.ts` - HTTP provider tests (~213 tests) - complex HTTP mocking and template handling
40. `test/providers/azure/` - Full Azure provider directory (chat, completion, embedding, assistant, etc.)
41. `test/providers/azure.test.ts` - Azure provider main tests
42. `test/providers/anthropic/` - Full Anthropic provider directory (completion, messages, defaults, etc.)
43. `test/providers/openai/` - OpenAI provider tests (chat, image, transcription, responses, util, defaults, embedding)
44. `test/providers/google/` - Google provider tests (util, vertex)
45. `test/providers/groq/` - Groq provider tests (chat, responses, util)
46. `test/providers/hyperbolic/` - Hyperbolic provider tests (audio, chat, image)
47. `test/providers/hyperbolic.test.ts` - Hyperbolic main provider tests
48. `test/providers/mcp/` - MCP provider tests (client, transform, util)
49. `test/providers/github/` - GitHub provider tests (defaults, index, integration)
50. `test/providers/xai/` - xAI provider tests (chat, image)
51. `test/providers/` - Individual provider tests:
    - adaline.gateway, ai21, aimlapi, alibaba, browser, claude-agent-sdk, cloudflare-ai
    - cometapi, deepseek, fal, functionCallbackUtils, helicone, llama, llamaApi
    - ollama, packageParser, promptfooModel, pythonCompletion\*, replicate-image
    - rubyCompletion, scriptBasedProvider, scriptCompletion, shared, snowflake
    - togetherai, truefoundry, webhook, websocket

## Remaining Jest Directories

These directories still run with Jest (~150 test files):

- `test/commands/` (except `test/commands/generate/`)
- `test/evaluator/` + evaluator helper/progress tests
- `test/events/`
- `test/fetch.test.ts`
- `test/guardrails.test.ts`
- `test/main.test.ts`
- `test/onboarding.test.ts`
- `test/providers.test.ts`
- `test/redteam/` (large - many files)
- `test/sagemaker.test.ts`
- `test/server/`
- `test/table.test.ts`
- `test/telemetry.test.ts`
- `test/esm.test.ts`
- `test/transform/`

## Migration Pattern

When migrating a test file from Jest to Vitest:

### 1. Add Vitest imports

```typescript
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
```

### 2. Replace Jest mocking with Vitest equivalents

| Jest                         | Vitest                     |
| ---------------------------- | -------------------------- |
| `jest.mock()`                | `vi.mock()`                |
| `jest.fn()`                  | `vi.fn()`                  |
| `jest.mocked()`              | `vi.mocked()`              |
| `jest.spyOn()`               | `vi.spyOn()`               |
| `jest.resetAllMocks()`       | `vi.resetAllMocks()`       |
| `jest.clearAllMocks()`       | `vi.clearAllMocks()`       |
| `jest.useFakeTimers()`       | `vi.useFakeTimers()`       |
| `jest.useRealTimers()`       | `vi.useRealTimers()`       |
| `jest.advanceTimersByTime()` | `vi.advanceTimersByTime()` |
| `jest.getTimerCount()`       | `vi.getTimerCount()`       |
| `jest.resetModules()`        | `vi.resetModules()`        |
| `jest.doMock()`              | `vi.doMock()`              |

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

| Jest             | Vitest                         |
| ---------------- | ------------------------------ |
| `fail()`         | `expect.fail()`                |
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

### 8. Mocking `util.promisify(execFile)` pattern

When mocking Node.js `child_process.execFile` used with `util.promisify`, use the custom promisify symbol:

```typescript
// Create mock for execFileAsync - must be hoisted for vi.mock factory
const { mockExecFileAsync, mockExecFile } = vi.hoisted(() => {
  const mockExecFileAsync = vi.fn();
  // Create a mock execFile with the custom promisify symbol
  const mockExecFile = Object.assign(vi.fn(), {
    [Symbol.for('nodejs.util.promisify.custom')]: mockExecFileAsync,
  });
  return { mockExecFileAsync, mockExecFile };
});

// Mock child_process.execFile with custom promisify support
vi.mock('child_process', () => ({
  execFile: mockExecFile,
}));

// In tests, use mockExecFileAsync with Promise-style mocking
mockExecFileAsync.mockResolvedValue({ stdout: 'output', stderr: '' });
mockExecFileAsync.mockRejectedValue(new Error('Command failed'));
```

### 9. Mocking constructors (Error, classes, etc.)

When mocking constructors in Vitest, you must use `function` keyword (not arrow functions) to make them constructable:

```typescript
// Mock Error constructor with custom stack
const OriginalError = global.Error;
vi.spyOn(global, 'Error').mockImplementation(function (this: Error, message?: string) {
  const error = new OriginalError(message);
  Object.defineProperty(error, 'stack', { value: mockStack });
  return error;
} as any);

// Mock a constructor that throws
vi.mocked(SomeClass).mockImplementationOnce(function () {
  throw new Error('boom');
} as any);
```

## Commands

```bash
# Run Vitest tests only
npm run test:vitest

# Run Jest tests only
npm run test:jest

# Run both (Jest + Vitest)
npm test

# Run specific Vitest directory
npm run test:vitest -- test/matchers

# Run specific Jest directory
npm run test:jest -- test/providers
```

## Next Steps for Migration

Recommended order for next migration batch (by complexity):

1. **Medium** - Directories with moderate mocking:
   - `test/transform/`
   - `test/events/`

2. **Complex** - Large directories with heavy mocking:
   - `test/commands/`
   - `test/server/`
   - `test/evaluator/`

3. **Most Complex** - Very large with many dependencies:
   - `test/redteam/` (many files)

## Notes

- Vitest runs significantly faster than Jest for the same tests
- The migration is designed to be gradual - both runners can coexist
- Tests can be migrated directory by directory
- Always verify tests pass after migration with `npm run test:vitest -- --run`
