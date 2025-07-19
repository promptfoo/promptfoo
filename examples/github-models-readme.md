# GitHub Models Provider

This document provides an overview of the GitHub Models provider implementation in promptfoo.

## Implementation

The GitHub Models provider is implemented as a simple wrapper around the OpenAI-compatible API, following the same pattern as DeepSeek, Fireworks, and OpenRouter providers.

### Code Location

The implementation is in `src/providers/registry.ts`:

```typescript
{
  test: (providerPath: string) => providerPath.startsWith('github:'),
  create: async (
    providerPath: string,
    providerOptions: ProviderOptions,
    context: LoadApiProviderContext,
  ) => {
    const splits = providerPath.split(':');
    const modelName = splits.slice(1).join(':') || 'openai/gpt-4o';
    return new OpenAiChatCompletionProvider(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiBaseUrl: 'https://models.github.ai',
        apiKeyEnvar: 'GITHUB_TOKEN',
      },
    });
  },
},
```

## Key Features

1. **Simple Implementation**: Uses `OpenAiChatCompletionProvider` directly without a custom class
2. **Default Model**: Falls back to `openai/gpt-4o` if no model is specified
3. **Correct Endpoint**: Uses `https://models.github.ai` (not the deprecated Azure endpoint)
4. **Authentication**: Uses `GITHUB_TOKEN` environment variable

## Usage Examples

### Basic Usage

```bash
# Set your GitHub token
export GITHUB_TOKEN=your_github_token

# Use with default model
npx promptfoo eval --providers github: --prompts "Hello world"

# Use with specific model
npx promptfoo eval --providers github:openai/gpt-4o-mini --prompts "Hello world"
```

### Configuration File

```yaml
providers:
  - github:openai/gpt-4o
  - github:anthropic/claude-3.5-sonnet
  - github:azureml/Phi-4
  - github:azureml-mistral/Codestral-2501
  
prompts:
  - "Write a function to {{task}}"
  
tests:
  - vars:
      task: "reverse a string"
```

## Available Models

GitHub Models provides access to models from:
- OpenAI (gpt-4o, o3-mini, etc.)
- Anthropic (Claude series)
- Google (Gemini series)
- Microsoft (Phi-4 series)
- Mistral (Codestral)
- DeepSeek (DeepSeek-R1)
- Meta (Llama series)
- xAI (Grok)

For the latest list, visit: https://github.com/marketplace/models/

## Authentication

Three methods are supported:

1. **Personal Access Token (PAT)**
   - Requires `models:read` scope for fine-grained PATs
   - Set via `GITHUB_TOKEN` environment variable

2. **GitHub Actions**
   - Use built-in `GITHUB_TOKEN` in workflows

3. **Bring Your Own Key (BYOK)**
   - Use API keys from other providers

## Testing

Run the integration tests:

```bash
npm test -- test/providers/github-integration.test.ts
```

Or test with the example configuration:

```bash
export GITHUB_TOKEN=your_token
npx promptfoo eval examples/github-models-test.yaml
```

## Documentation

User-facing documentation is at `site/docs/providers/github.md`

## Design Decisions

1. **No Custom Provider Class**: Unlike the initial implementation, we don't maintain a separate GitHubModelsProvider class. This follows the pattern of similar providers and reduces maintenance burden.

2. **No Hardcoded Model List**: We don't validate models against a hardcoded list, as this would require constant updates. The API itself validates models.

3. **Evergreen Documentation**: The docs focus on model categories rather than specific model versions to remain relevant as models are updated.

4. **Simple is Better**: The implementation is just 15 lines of code in the registry, making it easy to maintain and understand.