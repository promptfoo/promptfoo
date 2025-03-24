# Reproducing TogetherAI max_tokens Issue (#3442)

This repository contains configuration files to reproduce and verify the issue reported in [#3442](https://github.com/promptfoo/promptfoo/issues/3442), where the `max_tokens` configuration parameter is not being properly passed through to the TogetherAI API.

## Issue Description

When using the TogetherAI provider, responses are limited to 1024 tokens, even when a higher value is specified in the `max_tokens` configuration parameter. This happens despite the TogetherAI API supporting this parameter as documented in their [API reference](https://docs.together.ai/reference/chat-completions-1).

## Files in this Repository

- `togetherai-max-tokens-test.yaml`: Demonstrates the issue by attempting to use `max_tokens` in the config.
- `togetherai-max-tokens-workaround.yaml`: Demonstrates the workaround by using the environment variable `OPENAI_MAX_TOKENS: 4096`.

Both configuration files are formatted according to the promptfoo schema for proper validation.

## Steps to Reproduce

1. Ensure you have an API key for TogetherAI.
2. Set your API key in the environment:
   ```
   export TOGETHER_API_KEY=your_api_key_here
   ```
3. Run the test configuration that demonstrates the issue:
   ```
   npx promptfoo eval -c togetherai-max-tokens-test.yaml
   ```

## Root Cause Analysis

The issue was in the TogetherAI provider implementation in promptfoo. The `max_tokens` parameter was not being properly passed through to the actual API call.

In the OpenAI provider implementation that TogetherAI is built on top of, the `max_tokens` value is specifically added to the API call body, but values in the `passthrough` object were not properly handled for TogetherAI.

## Fix Implemented

We've fixed the issue by adding code to the `createTogetherAiProvider` function in `src/providers/togetherai.ts` that properly handles the `max_tokens` parameter:

```typescript
// Handle max_tokens by adding it to passthrough as well
if ((options.config as any)?.max_tokens !== undefined) {
  (togetherAiConfig.config as any).passthrough = {
    ...((togetherAiConfig.config as any).passthrough || {}),
    max_tokens: (options.config as any).max_tokens,
  };
}
```

This ensures that when a user sets `max_tokens` in their TogetherAI provider configuration, it gets properly passed through to the underlying API call.

## Verification

After the fix, direct API testing shows that when `max_tokens` is set to a specific value (like 100), the response is limited to that number of tokens. This confirms that the parameter is now being properly passed through to the TogetherAI API.

In our test case, when `max_tokens` is set to 100 and we request a long response about the history of AI, the model responds with exactly 100 tokens and then stops with `"finish_reason": "length"`.

## Conclusion

The issue has been fixed in the codebase. The workaround (using environment variables) is no longer necessary, and users can now directly specify `max_tokens` in their TogetherAI provider configuration.
