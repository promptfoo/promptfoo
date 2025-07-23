# Using ProviderTypeMap for Different Assertion Types

This example shows how to configure different providers for different types of assertions in promptfoo.

## The Problem

When you have assertions that require different provider types (e.g., `similar` needs an embedding provider, while `answer-relevance` needs a text/LLM provider), you might encounter this error:

```
Error: Invalid provider definition for output type 'text': {
  "embedding": {
    "id": "azure:embedding:orchestrator-text-embedding-3-large",
    "config": {
      "apiHost": "https://bcg-ai-peopleapidev.openai.azure.com"
    }
  }
}
```

## The Solution

Use the **ProviderTypeMap** pattern in your `defaultTest.options.provider` configuration:

```yaml
defaultTest:
  options:
    provider:
      # Provider for text-based assertions (answer-relevance, llm-rubric, factuality, etc.)
      text:
        id: azure:chat:gpt-4o-deployment
        config:
          apiHost: 'https://your-text.openai.azure.com'
          
      # Provider for embedding-based assertions (similar)
      embedding:
        id: azure:embedding:text-embedding-3-large
        config:
          apiHost: 'https://your-embedding.openai.azure.com'
```

## What NOT to Do

Don't mix ProviderOptions pattern with type-specific overrides:

```yaml
# ❌ WRONG - This mixes two different patterns
defaultTest:
  options:
    provider:
      id: azure:chat:gpt-4o-deployment  # ProviderOptions pattern
      config:
        apiHost: 'xxxxxxx.openai.azure.com'
      embedding:  # ProviderTypeMap pattern - doesn't belong here!
        id: azure:embedding:orchestrator-text-embedding-3-large
        config:
          apiHost: 'https://bcg-ai-peopleapidev.openai.azure.com'
```

## Supported Provider Types

- `text` - For LLM/chat providers (used by answer-relevance, llm-rubric, factuality, model-graded assertions)
- `embedding` - For embedding providers (used by similarity assertions)
- `classification` - For classification providers
- `moderation` - For moderation providers (used by moderation assertions)

## Running the Example

1. Update the Azure endpoints and API keys in `promptfooconfig.yaml`
2. Set your environment variables:
   ```bash
   export AZURE_API_KEY=your-api-key
   ```
3. Run the evaluation:
   ```bash
   npx promptfoo eval
   ```

This configuration allows you to use different Azure deployments (or even different providers entirely) for different types of assertions, all within the same test suite. 