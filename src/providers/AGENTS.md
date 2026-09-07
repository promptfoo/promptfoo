# Provider Implementations

LLM provider integrations implementing `ApiProvider` interface to call different AI services.

## Architecture

Each provider:

- Implements `ApiProvider` interface (`src/types/providers.ts`)
- Transforms prompts → provider-specific API format
- Returns normalized `ProviderResponse`
- Handles auth, rate limits, retries, streaming

## Provider Lifecycle & Cleanup

The evaluator (`src/evaluator.ts`) manages provider lifecycle with `providerRegistry.withScope()`. Each evaluation releases only resources it owns, and shared providers remain open until all owning evaluations finish. `shutdownAll()` is reserved for process shutdown or explicit caller cleanup.

**If your provider allocates resources** (Python workers, connections, child processes):

- Implement a `cleanup()` method on your provider
- Evaluation targets exposing `cleanup()` or legacy `shutdown()` are adopted automatically
- Register dynamically created resources with `providerRegistry` before initialization and on reuse to claim the current evaluation scope
- Allow initialization after cleanup when the same provider instance is reused
- Resources are released in the evaluator's `finally` block

**Reference implementations:**

- `openai.ts` - Most comprehensive
- `anthropic/index.ts` - Complex provider with subdirectory
- `http.ts` - Generic HTTP pattern

## Logging

See `docs/agents/logging.md` - use logger with object context (auto-sanitized).

## Operation Capabilities and Wrappers

`ProviderIdentity<TConfig>` describes identity, typed configuration, and cleanup independently of a text operation. `ProviderOperations` supplies operation signatures; use `hasProviderCapability(provider, method)` before dispatching. The public `ApiProvider` keeps its legacy `callApi` shape for compatibility. Providers with inherited or explicit throwing text stubs must declare `promptfooCapabilities` so they cannot be selected as text graders. Legacy providers without a declaration are detected by callable methods.

Wrappers must preserve custom IDs, configuration, supported operations, context and options, cleanup, and function/tool validators. Bind delegated hooks to their owner. See `litellm.ts` and `test/providers/capabilities.test.ts`.

## Common Patterns

**OpenAI-compatible providers** extend `OpenAiChatCompletionProvider`. See `src/providers/quiverai.ts` for a minimal example or `src/providers/openrouter.ts` for a more complex one.

**Config priority:** Explicit options > Environment variables > Provider defaults

## Provider Routing

Prefix dispatch in `src/providers/registry.ts` is case-sensitive and meaningful. Similar
prefixes can route to different classes. When you add a new sub-type (e.g.
`:moderation`, `:embedding`, `:realtime`) to one prefix, do one of:

- Add the sub-type to every prefix it should work under, **or**
- Explicitly fail-fast (throw with a clear message) for the prefixes that should not
  support it.

Silently mapping `foo:newtype` to a class that only handles `foo:chat` is a routing
regression. Add a test in `test/providers/registry.test.ts` that asserts each
prefix/sub-type pair resolves to the expected class or throws.

## Cache Key Hygiene

Promptfoo's disk cache lives at `${getConfigDirectoryPath()}/cache` (typically
`~/.promptfoo/cache`), unless overridden with `PROMPTFOO_CACHE_PATH` or
`PROMPTFOO_CONFIG_DIR`. If an implementation stores literal cache-key strings, those
strings persist to disk; if it stores hashed keys, the hash persists.

- **Never include secrets in cache keys.** Strip `Authorization`, bearer tokens, API
  keys, tenant tokens, signed metadata, and custom auth headers before building or
  hashing a key. If those values materially change the response, use a non-secret
  tenant/account identifier, a cache namespace, or disable caching for that path; do not
  hash raw secrets into long-lived cache keys.
- **Canonicalize before hashing.** `JSON.stringify({a, b})` and `JSON.stringify({b, a})`
  produce different strings but represent the same config, so naïve stringification
  causes cache misses for semantically identical requests. Sort keys (or use a
  canonical-JSON helper) before hashing.
- Reference pattern for stable key structure and canonicalized hashing:
  `getModerationCacheKey` in `src/providers/azure/moderation.ts`.

## Caching Best Practices

Use `shouldBustProviderCache(context)` for the shared `bustCache`/legacy `debug`
precedence, including both reads and writes for manually cached SDK responses.
Use `withResponseCacheMetadata(response, cached)` after response normalization to
retain replay provenance and mark cached requests without mutating stored usage.
The helper preserves reported costs and unknown token counts; the evaluator
derives incurred usage and cost from the cache marker.

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

- `bedrock/converse.ts:1276` - Sets cached flag correctly
- `pythonCompletion.ts:62` - Sets the flag on the parsed result
- `google/vertex.ts:371` - Multiple cache points handled correctly

## Testing Requirements

**CRITICAL: Tests must NEVER make real API calls.** Mock all HTTP requests.

Every provider needs tests in `test/providers/`:

- Mock API responses using `vi.mock`
- Test success AND error cases
- Test rate limits, timeouts, invalid configs
- Run with: `npx vitest run test/providers/my-provider`

## Adding a Provider

The eligibility bar in `site/docs/contributing.md` ("Provider eligibility") applies only to dedicated provider prefixes. Before adding one, confirm authorized model access, accountable ownership, durability, clear data handling, and provider-specific value beyond what `openai` + `apiBaseUrl` can express. A service that needs only a base URL and API-key environment variable should use the generic `openai` path and contribute docs or an example instead.

**All seven items are required** before a provider is complete:

1. Implement `ApiProvider` interface
2. Add env vars to `ProviderEnvOverridesSchema` in `src/contracts/env.ts` (re-exported via `src/types/env.ts`)
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
grep -q "MYPROVIDER_API_KEY" src/contracts/env.ts && echo "env schema updated"
ls test/providers/myprovider.test.ts
ls site/docs/providers/myprovider.md
grep -q "myprovider" site/docs/providers/index.md && echo "index.md updated"
ls examples/myprovider/promptfooconfig.yaml
```

**Reference existing providers** - 50+ implementations to learn from.

## Gemini maintenance

The AI Studio, unified Google, and Vertex classes share `google/gemini.ts` for request preparation, streamed candidate parsing, and usage extraction. Keep endpoint/authentication, cache transport, pricing, and final facade response shaping in the existing classes. Add shared pipeline tests when changing Gemini tool merging or stream parsing.

The facade policy preserves AI Studio's loaded-schema handling, Vertex's context/examples and Model Armor fields, the system-instruction wire names, and legacy unknown-usage/error shapes. Do not silently unify those compatibility choices while editing shared logic. Vertex non-Gemini paths remain independent.

## Request cancellation

All operation interfaces accept optional request options with `abortSignal`. Implementations should check it before dispatch and pass it to their fetch or SDK transport, retry waits, and polling. Authentication and callback waits can use `awaitProviderOperation` from `shared.ts`; this stops waiting but cannot undo a callback already started or cancel a vendor job already accepted.

The optional interface preserves compatibility: third-party providers and legacy implementations can ignore it. Do not claim universal transport cancellation from the method signature alone. Native cancellation is covered for the migrated OpenAI, Anthropic Messages, MCP tools, Azure chat/embedding/moderation, Google, Ollama, Hugging Face, Cohere/Voyage/LocalAI embedding, and Bedrock embedding/video paths. Other implementations require their own transport-level tests before claiming support.

## Tool callbacks

Use `executeCallback` from `functionCallbackExecutor.ts` for callback loading, reference-aware caching, cancellation, and traced execution. Keep file-export policy and wire conversion in each adapter. Pass `transformOutput` when serialization is part of the tool execution so failures are recorded before the span closes. The execution record retains tool name, arguments, call ID, raw output, and the original error.

Use `normalizeMcpToolContent` from `mcp/util.ts` for MCP content blocks; keep each provider's tool-result envelope and error policy local.

## Media jobs

Bedrock Nova Reel and Luma Ray share `bedrock/videoJob.ts` for asynchronous submission, polling, and S3-to-blob storage. Each job owns and releases its SDK clients. Forward the caller signal through credential waits, SDK calls, poll delays, and body reads. Keep model validation, request fields, pricing, and output shaping in the provider classes.

Hyperbolic audio and image share `hyperbolic/transport.ts` for JSON transport, cache bypass, status errors, and cancellation. Keep modality-specific response parsing and costs in each provider.

## Creator inputs

The loader normalizes configuration and environment once; factories receive that `ProviderOptions` and a context containing the same merged environment. New creator adapters should accept `providerOptions` directly rather than nesting it under another `config`. `creator.ts` adapts the legacy nested input only at existing public creator boundaries and preserves parsed identifiers.

`families/compatible.ts` loads the Cerebras, Envoy, LiteLLM, Novita, Nscale, and TogetherAI creators on demand. These family factories run before the generic file fallback, including when a model name ends in `.js`. Keep alias/default-subtype rules inside each creator, and preserve the distinction between family load gates and factory dispatch predicates.
