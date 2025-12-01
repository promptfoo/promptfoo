# Provider Implementations

LLM provider integrations implementing `ApiProvider` interface to call different AI services.

## Architecture

Each provider:

- Implements `ApiProvider` interface (`src/types/providers.ts`)
- Transforms prompts → provider-specific API format
- Returns normalized `ProviderResponse`
- Handles auth, rate limits, retries, streaming

## Provider Lifecycle & Cleanup

The evaluator (`src/evaluator.ts`) manages provider lifecycle. After evaluation completes, it calls `providerRegistry.shutdownAll()` to clean up resources.

**If your provider allocates resources** (Python workers, connections, child processes):

- Implement a `cleanup()` method on your provider
- Register with `providerRegistry` for automatic cleanup
- Resources are released in the evaluator's `finally` block

**Reference implementations:**

- `openai.ts` - Most comprehensive
- `anthropic/index.ts` - Complex provider with subdirectory
- `http.ts` - Generic HTTP pattern

## Logging

See `docs/logging.md` - use logger with object context (auto-sanitized).

## Common Patterns

**OpenAI-compatible providers** extend `OpenAiChatCompletionProvider`. See `src/providers/openrouter.ts` for example.

**Config priority:** Explicit options > Environment variables > Provider defaults

## Testing Requirements

**CRITICAL: Tests must NEVER make real API calls.** Mock all HTTP requests.

Every provider needs tests in `test/providers/`:

- Mock API responses using `jest.mock` or `vi.mock`
- Test success AND error cases
- Test rate limits, timeouts, invalid configs

Run tests (check vitest.config.ts for migrated tests):

```bash
npx vitest run test/providers/my-provider  # If migrated to Vitest
npx jest test/providers/my-provider        # If still using Jest
```

## Adding a Provider

1. Implement `ApiProvider` interface
2. Add tests in `test/providers/`
3. Add docs in `site/docs/providers/`
4. Add example in `examples/`

**Reference existing providers** - 50+ implementations to learn from.
