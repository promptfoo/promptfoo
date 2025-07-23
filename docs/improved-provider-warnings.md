# Improved Provider Warning System

This document describes the enhanced provider warning and error handling system that provides better user guidance when authentication fails or providers are misconfigured.

## Overview

The improved system provides:

1. **Context-aware error messages** - Different messages for configured vs default providers
2. **Smart credential detection** - Suggests alternative providers based on available API keys
3. **Silent defaults** - No warnings when default providers work correctly
4. **Provider-specific help** - Tailored authentication instructions for each provider
5. **Scalable architecture** - Provider metadata registry for easy extensibility

## Architecture

### Provider Metadata Registry

The system uses a centralized registry (`providerMetadataRegistry`) where providers register their metadata:

```typescript
interface ProviderMetadata {
  id: string;
  name: string;
  supportedOperations: ProviderType[];
  authentication: {
    required: boolean;
    envVars?: string[];
    alternativeAuth?: string[];
    helpText?: string;
  };
  exampleConfigs?: {
    [key in ProviderType]?: string;
  };
  documentation?: {
    url?: string;
    notes?: string;
  };
}
```

### Adding New Providers

To add a new provider, simply register it in `src/providers/providerMetadataRegistry.ts`:

```typescript
providerMetadataRegistry.register('my-provider', {
  id: 'my-provider',
  name: 'My Provider',
  supportedOperations: ['text', 'embedding'],
  authentication: {
    required: true,
    envVars: ['MY_PROVIDER_API_KEY'],
    helpText: 'To use My Provider, set your API key:\n  export MY_PROVIDER_API_KEY=your-api-key',
  },
  exampleConfigs: {
    text: 'my-provider:chat-model',
    embedding: 'my-provider:embedding-model',
  },
  documentation: {
    url: 'https://example.com/docs',
  },
});
```

No changes to the matchers code are needed - the system automatically uses the registered metadata.

## Error Message Examples

### 1. No Provider Configured (Using Default)

When the default OpenAI provider fails due to missing credentials:

**Before:**

```
OpenAI API key must be set for similarity comparison
```

**After (with alternatives available):**

````
OpenAI API key must be set for similarity comparison

It looks like you have credentials for: Azure OpenAI, Voyage AI

You can use one of these providers instead:
  azure:embedding:<your-deployment-name>
  voyage:voyage-3

Example configuration:
```yaml
defaultTest:
  options:
    provider:
      embedding: azure:embedding:<your-deployment-name>
````

Or set the required credentials for the default provider.

```

**After (no alternatives):**
```

OpenAI API key must be set for similarity comparison

Available embedding providers:
openai:embedding:text-embedding-3-large
azure:embedding:<your-deployment-name>
voyage:voyage-3
cohere:embed-english-v3.0
vertex:embedding:text-embedding-005

To use a specific provider, configure it in your test:

```yaml
defaultTest:
  options:
    provider:
      embedding: provider-id-here
```

For more information on providers, see: https://promptfoo.dev/docs/providers/

```

### 2. Wrong Provider Type

When a text provider is used for embedding operations:

**Before:**
```

Provider openai:gpt-4o is not a valid embedding provider for 'is similar assertion'

```

**After:**
```

Provider "openai:gpt-4o" does not support embedding operations.
Valid embedding providers include:
openai:embedding:text-embedding-3-large
azure:embedding:<your-deployment-name>
voyage:voyage-3
cohere:embed-english-v3.0
vertex:embedding:text-embedding-005
huggingface:sentence-similarity:all-MiniLM-L6-v2
bedrock:embedding:amazon.titan-embed-text-v2:0
mistral:embedding:mistral-embed

For more information on embedding providers, see: https://promptfoo.dev/docs/providers/

```

### 3. Missing API Key (Explicitly Configured)

When a provider is explicitly configured but authentication fails:

**Before:**
```

Azure API key must be set for embedding

```

**After:**
```

Azure API key must be set for embedding

Your configured embedding provider "azure:embedding:text-embedding-ada-002" requires authentication.

To use Azure OpenAI:

Option 1: Set API Key
export AZURE_API_KEY=your-api-key
export AZURE_API_HOST=https://your-resource.openai.azure.com

Option 2: Use client credentials
export AZURE_CLIENT_ID=your-client-id
export AZURE_CLIENT_SECRET=your-client-secret
export AZURE_TENANT_ID=your-tenant-id

Option 3: Use Azure CLI
az login

Also ensure your deployment name and apiHost are correct in the provider config.

For more information, see: https://promptfoo.dev/docs/providers/azure/

```

### 4. Failed Provider Load (Explicitly Configured)

When a configured provider cannot be loaded:

**Before:**
```

No provider found for 'is similar assertion'

```

**After:**
```

Failed to load the configured embedding provider: invalid:provider

The provider "invalid:provider" may be invalid or the provider may not be installed.

Falling back to default embedding provider: openai:text-embedding-3-large

```

## Design Principles

1. **Silent when defaults work** - No warnings when using default providers successfully
2. **Context-aware messages** - Different guidance for configured vs unconfigured providers
3. **Smart credential detection** - Suggests alternatives based on available API keys
4. **Provider-specific help** - Tailored instructions for each provider's authentication
5. **Graceful fallbacks** - Falls back to defaults when configured providers fail (with warnings)
6. **Scalable architecture** - Easy to add new providers without changing core logic

## Implementation Details

The system uses several key functions:

- `getAndCheckProvider()` - Validates providers and provides appropriate warnings
- `getApiKeyErrorHelp()` - Generates context-aware authentication help
- `getProviderConfigHelp()` - Lists valid providers for a given operation type
- `providerMetadataRegistry` - Centralized registry for provider information

The registry approach makes the system highly maintainable - adding a new provider only requires registering its metadata, without touching the error handling logic.
```
