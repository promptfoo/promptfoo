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

## Integration Tests (CLI Commands)

For integration tests that execute CLI commands with `npm run local`:

```typescript
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('my integration test', () => {
  const testDir = path.join(process.cwd(), '.test-tmp', 'my-test-name');
  const configPath = path.join(testDir, 'promptfooconfig.yaml');
  const outputPath = path.join(testDir, 'output.json');

  beforeAll(() => {
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(
      configPath,
      `
description: 'Test description'
prompts:
  - 'Echo: {{message}}'
providers:
  - id: echo
    label: 'provider-a'
    config:
      output: 'Response from A: {{prompt}}'
tests:
  - vars:
      message: 'test'
`,
    );
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should run eval command', () => {
    const cmd = `npm run local -- eval -c ${configPath} --no-cache -o ${outputPath}`;
    const output = execSync(cmd, {
      encoding: 'utf-8',
      stdio: 'pipe',
      env: { ...process.env, PROMPTFOO_DISABLE_TELEMETRY: '1' },
    });

    expect(output).toContain('[provider-a]');
    expect(fs.existsSync(outputPath)).toBe(true);
  });
});
```

**Key patterns:**

- Use `.test-tmp` directory for test fixtures (auto-cleaned, not in git)
- Create config files in `beforeAll`, clean up in `afterAll`
- Execute with `npm run local -- eval` and capture output
- Set `PROMPTFOO_DISABLE_TELEMETRY: '1'` to avoid telemetry during tests
- Use `echo` provider for deterministic, zero-cost testing
- Assert on both command output and generated files

**Echo provider config for deterministic tests:**

```yaml
providers:
  - id: echo
    label: 'test-provider'
    config:
      output: 'Fixed response: {{prompt}}'
```

See `test/commands/eval/filterProviders.integration.test.ts` for reference.

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
