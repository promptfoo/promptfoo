# Improved Provider Warning System

This document shows the improved warning and error messages for all provider types in promptfoo.

## Key Improvements

1. **Silent when defaults work** - No warnings when using default providers successfully
2. **Generalized for all provider types** - Works for embedding, classification, moderation, and text providers
3. **Uses `dedent` for cleaner multi-line strings** - More maintainable code
4. **Smart credential detection** - Suggests alternatives based on available API keys
5. **Provider-specific guidance** - Tailored help for OpenAI, Azure, Anthropic, Vertex, etc.
6. **Context-aware errors** - Different messages for configured vs unconfigured providers

## Design Principles

### When to Stay Silent
- Using default provider and it works ✅
- No configuration provided and defaults are available ✅

### When to Warn/Error
- Explicitly configured provider fails to load ❌
- Explicitly configured provider is wrong type ❌
- Default provider fails (e.g., missing API key) ❌
- No provider available at all ❌

## Scenario 1: Default Provider Works (No Warning)

When you use an assertion without configuring a provider and the default works:

```yaml
# No provider configuration
tests:
  - assert:
      - type: similar
        value: "Expected output"
```

**Result:** Test runs successfully with default provider - no warnings or messages.

## Scenario 2: Explicitly Configured Provider Fails to Load

When you've configured a provider but it can't be loaded:

**Example:**
```yaml
defaultTest:
  options:
    provider:
      embedding:
        id: azure:embedding:my-deployment
```

**Error:**
```
Failed to load the configured embedding provider for 'similarity check'. 
Please check your provider configuration.

The provider configuration may be invalid or the provider may not be installed.
Falling back to default provider: openai:text-embedding-3-large.
```

## Scenario 3: Configured Wrong Provider Type

When you've configured a provider that doesn't support the required operations:

**Example:**
```yaml
defaultTest:
  options:
    provider:
      embedding:
        id: openai:gpt-4o  # This is a chat model, not an embedding model
```

**Error:**
```
The configured provider openai:gpt-4o does not support embedding operations for 'similarity check'.
Embedding providers compute vector representations for semantic similarity

You configured: openai:gpt-4o
But embedding providers need specific capabilities.
Valid embedding providers include: openai:embedding:text-embedding-3-large, azure:embedding:<deployment-name>, voyage:voyage-3

Falling back to default: openai:text-embedding-3-large.
```

## Scenario 4: Configured Provider Missing API Key

When you've explicitly configured a provider but haven't set up authentication:

**Example:**
```yaml
defaultTest:
  options:
    provider:
      embedding:
        id: azure:embedding:text-embedding-3-large-2
        config:
          apiHost: 'promptfoo.openai.azure.com'
```

**Error:**
```
Error: Azure API key must be set for embedding

Your configured embedding provider (azure:embedding:text-embedding-3-large-2) requires authentication.

To use Azure OpenAI, you need to:

Option 1: Set API Key
  export AZURE_API_KEY="your-api-key"

Option 2: Use client credentials
  export AZURE_CLIENT_ID="your-client-id"
  export AZURE_CLIENT_SECRET="your-client-secret"
  export AZURE_TENANT_ID="your-tenant-id"

Also ensure your deployment name and apiHost are correct in your config.
```

## Scenario 5: Default Provider Missing API Key

When no provider is configured and the default fails:

**Example with Azure credentials detected:**
```
Error: OpenAI API key must be set for similarity comparison

To fix this, you can:
1. Set the OPENAI_API_KEY environment variable
2. Configure a different embedding provider that you have credentials for

It looks like you have credentials for: Azure OpenAI, Voyage

Example configurations:

# Azure OpenAI
defaultTest:
  options:
    provider:
      embedding:
        id: azure:embedding:<your-deployment-name>
        config:
          apiHost: 'your-resource.openai.azure.com'

# Voyage
defaultTest:
  options:
    provider:
      embedding:
        id: voyage:voyage-3

Available embedding providers:
  - openai:embedding:text-embedding-3-large
  - azure:embedding:<deployment-name>
  - voyage:<model-name>
  - cohere:embedding:<model-name>
  - vertex:embedding:text-multilingual-embedding-002
```

## Benefits of the New System

1. **Reduced noise** - Only shows warnings/errors when action is needed
2. **Context-aware messages** - Different guidance for configured vs unconfigured providers
3. **Clear error hierarchy** - Uses `logger.error` for configuration issues
4. **Specific authentication help** - Tailored instructions for each provider's authentication method
5. **Smart fallbacks** - Silently uses defaults when they work
6. **Helpful recovery** - Suggests alternatives when defaults fail

## Code Structure

The implementation uses:
- `PROVIDER_CONFIG_EXAMPLES` - Central configuration for provider type information
- `getProviderConfigHelp()` - Generates help messages (only shown when needed)
- `getApiKeyErrorHelp()` - Provides error recovery suggestions
- `isExplicitlyConfigured` - Tracks whether the user configured a provider
- Silent fallbacks when defaults work properly

This approach ensures users only see messages when they need to take action, reducing unnecessary warnings while still providing helpful guidance when things go wrong. 