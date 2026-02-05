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

See `docs/agents/logging.md` - use logger with object context (auto-sanitized).

## Common Patterns

**OpenAI-compatible providers** extend `OpenAiChatCompletionProvider`. See `src/providers/quiverai.ts` for a minimal example or `src/providers/openrouter.ts` for a more complex one.

**Config priority:** Explicit options > Environment variables > Provider defaults

## Caching Best Practices

When implementing caching in your provider, **ALWAYS set the `cached: true` flag** when returning a cached response:

```typescript
// ✅ CORRECT - Always set cached flag
if (cachedResponse) {
  const parsed = JSON.parse(cachedResponse as string);
  return { ...parsed, cached: true };
}

// ❌ WRONG - Missing cached flag
if (cachedResponse) {
  return JSON.parse(cachedResponse as string);
}
```

**Why this matters:**

- The `cached` flag allows downstream code to skip rate limiting delays
- Performance metrics can distinguish between fresh API calls and cache hits
- Evaluations can accurately track which responses were served from cache

**Response type compatibility:**

- `ProviderResponse` has `cached?: boolean`
- `ProviderEmbeddingResponse` has `cached?: boolean`
- `ProviderModerationResponse` has `cached?: boolean`

**Reference implementations:**

- `bedrock/converse.ts:985` - Sets cached flag correctly
- `pythonCompletion.ts:194` - Example with spread operator
- `google/vertex.ts:268` - Multiple cache points handled correctly

## Testing Requirements

**CRITICAL: Tests must NEVER make real API calls.** Mock all HTTP requests.

Every provider needs tests in `test/providers/`:

- Mock API responses using `vi.mock`
- Test success AND error cases
- Test rate limits, timeouts, invalid configs
- Run with: `npx vitest run test/providers/my-provider`

## Adding a Provider

**All seven items are required** before a provider is complete:

1. Implement `ApiProvider` interface
2. Add env vars to `src/types/env.ts` (`ProviderEnvOverridesSchema`)
3. Add env vars to `src/envars.ts` (if documenting in CLI help)
4. Add tests in `test/providers/`
5. Add docs in `site/docs/providers/<provider>.md`
6. Add entry to `site/docs/providers/index.md` table (alphabetical order)
7. Add example in `examples/<provider>/`

After updating env schema, regenerate JSON schema: `npm run jsonSchema:generate`

**Verify completeness:**

```bash
# Check all pieces exist
ls src/providers/myprovider.ts
grep -q "MYPROVIDER_API_KEY" src/types/env.ts && echo "env.ts updated"
ls test/providers/myprovider.test.ts
ls site/docs/providers/myprovider.md
grep -q "myprovider" site/docs/providers/index.md && echo "index.md updated"
ls examples/myprovider/promptfooconfig.yaml
```

**Reference existing providers** - 50+ implementations to learn from.
