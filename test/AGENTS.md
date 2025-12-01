# Test Suite

**Vitest is the preferred framework for new tests.** Legacy tests use Jest and are being migrated.

## Framework Choice

| Location           | Framework  | When to Use                        |
| ------------------ | ---------- | ---------------------------------- |
| `src/app/`         | **Vitest** | All frontend tests                 |
| `test/` (new)      | **Vitest** | Preferred for new test files       |
| `test/` (existing) | Jest       | When modifying existing Jest tests |

## Running Tests

```bash
npm test                              # Run all tests
npm run test:app                      # Frontend tests (Vitest)
npx vitest run path/to/test           # Run specific Vitest test
npx jest path/to/test --coverage      # Run specific Jest test
```

## Writing Tests

**Reference files:**

- **Vitest (frontend)**: `src/app/src/hooks/usePageMeta.test.ts` - explicit imports
- **Vitest (backend)**: `test/assertions/contains.test.ts` - uses globals (no imports needed)
- **Jest (legacy)**: `test/providers/openai/completion.test.ts`

Backend Vitest tests use `globals: true` so `describe`, `it`, `expect`, `vi` are available without imports.

## Critical Rules

- **NEVER** increase test timeouts - fix the slow test
- **NEVER** use `.only()` or `.skip()` in committed code
- **ALWAYS** clean up mocks in `afterEach`
- **ALWAYS** use `--randomize` to ensure test independence

## Directory Structure

Tests mirror `src/` structure:

- `test/providers/` → `src/providers/`
- `test/redteam/` → `src/redteam/`

## Provider Testing

Every provider needs tests covering:

1. Success case
2. Error cases (4xx, 5xx, rate limits)
3. Configuration validation
4. Token usage tracking

See `test/providers/openai.test.ts` for reference.
