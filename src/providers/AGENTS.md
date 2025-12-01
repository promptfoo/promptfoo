# Provider Implementations

**What this is:** LLM provider integrations that implement a standardized interface to call different AI services (OpenAI, Anthropic, AWS Bedrock, etc.).

## Architecture

Each provider:

- Implements `ApiProvider` interface (see `src/types/providers.ts`)
- Transforms promptfoo prompts → provider-specific API format
- Returns normalized `ProviderResponse` for evaluation
- Handles auth, rate limits, retries, streaming

**Key reference implementations:**

- `openai.ts` - Most comprehensive, handles chat/completions/embeddings
- `anthropic/index.ts` - Complex provider with subdirectory structure
- `http.ts` - Generic HTTP provider pattern

## Critical: Sanitization Required

**ALWAYS sanitize logs** to prevent leaking API keys:

```typescript
// Correct - Second param auto-sanitized
logger.debug('[Provider] API call', {
  headers: requestHeaders, // apiKey/authorization auto-redacted
  config: providerConfig,
});

// WRONG - Exposes secrets
logger.debug(`Calling API with config: ${JSON.stringify(config)}`);
```

See root AGENTS.md for complete sanitization field list.

## Common Patterns

**OpenAI-compatible providers** - Many providers inherit from `OpenAiChatCompletionProvider`:

```typescript
export class MyProvider extends OpenAiChatCompletionProvider {
  constructor(options: any) {
    super('model-name', {
      config: { apiBaseUrl: 'https://api.myprovider.com/v1', ...options.config },
    });
  }
}
```

**Configuration priority:**

1. Explicit config options
2. Environment variables (`PROVIDER_API_KEY`)
3. Provider defaults

## Testing Requirements

Every provider MUST have tests in `test/providers/`:

- Mock API responses (don't call real APIs)
- Test success AND error cases
- Test rate limits, timeouts, invalid configs
- Run with: `npx jest providers/my-provider --coverage --randomize`

## When Adding a Provider

1. Implement `ApiProvider` interface
2. Add tests in `test/providers/`
3. Add docs in `site/docs/providers/`
4. Add example in `examples/`
5. Update types if needed

**Reference existing providers** - Don't reinvent patterns. The codebase has 50+ provider implementations to learn from.
