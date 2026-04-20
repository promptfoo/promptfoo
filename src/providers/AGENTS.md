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

## Provider Routing

Prefix dispatch in `src/providers/registry.ts` is case-sensitive and meaningful.
`openai:`, `azureopenai:`, and `azure:` route to different classes. When you add a new
sub-type (e.g. `:moderation`, `:embedding`, `:realtime`) to one prefix, do one of:

- Add the sub-type to every prefix it should work under, **or**
- Explicitly fail-fast (throw with a clear message) for the prefixes that should not
  support it.

Silently mapping `foo:newtype` to a class that only handles `foo:chat` is a routing
regression — `azureopenai:moderation` was silently routed to `AzureModerationProvider`
even though `azureopenai:` is supposed to mean "always OpenAI". Add a test in
`test/providers/registry.test.ts` that asserts each (prefix, sub-type) pair resolves
to the expected class or throws.

## Cache Key Hygiene

Promptfoo's cache is disk-backed (`~/.cache/promptfoo`). Anything written verbatim
into a cache key is persisted to disk in plaintext.

- **Never persist secrets verbatim.** For `Authorization`, bearer tokens, tenant
  tokens, signed metadata, and any custom auth headers, either drop them before
  building the key or pass the whole header bag through a one-way hash (SHA-256 with
  truncation is fine). Do not put raw header values into the cache key.
- **Canonicalize before hashing.** `JSON.stringify({a, b})` and `JSON.stringify({b, a})`
  produce different strings but represent the same config, so naïve stringification
  causes cache misses for semantically identical requests. Sort keys (or use a
  canonical-JSON helper) before hashing.
- Reference implementation: `getModerationCacheKey` in
  `src/providers/azure/moderation.ts`.

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
