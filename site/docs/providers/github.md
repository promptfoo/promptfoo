---
title: GitHub Models Provider
description: 'Use models from the GitHub Models catalog through an OpenAI-compatible API'
keywords: [github models, llm providers, openai, llama, deepseek, ai models]
sidebar_label: GitHub Models
---

# GitHub Models

[GitHub Models](https://github.com/marketplace/models/) provides access to a catalog of models
through a unified API interface.

The GitHub Models provider is compatible with all the options provided by the [OpenAI provider](/docs/providers/openai/) as it uses the OpenAI-compatible API format.

## Key Features

- **Unified API**: Access models from multiple providers through a single endpoint
- **OpenAI-compatible**: Use familiar OpenAI SDK and API patterns
- **GitHub Actions support**: Use GITHUB_TOKEN directly in workflows

## Authentication

Set your GitHub personal access token with the `GITHUB_TOKEN` environment variable, or pass it directly in the configuration:

```bash
export GITHUB_TOKEN=your_github_token
```

## Available Models

GitHub changes the catalog independently of promptfoo. Query the catalog API with your token to
verify a model ID before adding it to a long-lived config:

```bash
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  https://models.github.ai/catalog/models
```

### Model Categories

The response includes each model's exact `id`, modalities, capabilities, limits, and rate-limit
tier. You can also browse the [GitHub Models marketplace](https://github.com/marketplace/models/).

## Configuration Examples

### Basic Usage

```yaml
providers:
  - github:openai/gpt-5
```

### With Configuration

```yaml
providers:
  - id: github:openai/gpt-5-mini # Uses GITHUB_TOKEN env var
    config:
      temperature: 0.7
      max_tokens: 4096
      # apiKey: "{{ env.GITHUB_TOKEN }}"  # optional, auto-detected
```

### Multiple Models

```yaml
providers:
  - id: github:openai/gpt-5-nano
    config:
      temperature: 0.5

  - id: github:openai/gpt-5-mini
    config:
      temperature: 0.6

  - id: github:openai/gpt-5
    config:
      temperature: 0.7

  - id: github:meta/llama-4-maverick-17b-128e-instruct-fp8
    config:
      temperature: 0.8

  - id: github:deepseek/deepseek-r1
    config:
      temperature: 0.7
```

## Model Selection Guidelines

Use the catalog response rather than a static recommendation. In particular, compare:

- `supported_input_modalities` and `supported_output_modalities`
- `capabilities`, such as streaming or tool calling
- `limits.max_input_tokens` and `limits.max_output_tokens`
- `rate_limit_tier`

Visit the [GitHub Models marketplace](https://github.com/marketplace/models/) to compare model capabilities and pricing.

## Authentication and Access

### Authentication Methods

1. **Personal Access Token (PAT)**
   - Requires `models:read` scope for fine-grained PATs
   - Set via `GITHUB_TOKEN` environment variable

2. **GitHub Actions**
   - Use built-in `GITHUB_TOKEN` in workflows
   - No additional setup required

3. **Bring Your Own Key (BYOK)**
   - Use API keys from other providers
   - Usage billed through your provider account

### Rate Limits and Pricing

Each model has specific rate limits and pricing. Check the [GitHub Models documentation](https://docs.github.com/en/github-models) for current details.

## API Information

- **Base URL**: `https://models.github.ai/inference`
- **Format**: OpenAI-compatible API
- **Endpoints**: Standard chat completions and embeddings

## Advanced Features

The GitHub Models API supports:

- Streaming and non-streaming completions
- Temperature control
- Stop sequences
- Deterministic sampling via seed
- System messages
- Function calling (for supported models)

## Model Naming

Models are accessed using the format `github:[model-id]` where `model-id` follows the naming convention used in the GitHub Models marketplace:

- Standard format: `[vendor]/[model-name]`
- Microsoft models: `azureml/[model-name]`
- Partner models: `azureml-[vendor]/[model-name]`

Examples:

- `github:openai/gpt-5`
- `github:openai/gpt-5-mini`
- `github:openai/gpt-5-nano`
- `github:anthropic/claude-4-opus`
- `github:anthropic/claude-4-sonnet`
- `github:google/gemini-2.5-pro`
- `github:xai/grok-4`
- `github:xai/grok-3`
- `github:meta/llama-4-behemoth`
- `github:meta/llama-4-scout`
- `github:meta/llama-4-maverick`
- `github:deepseek/deepseek-r1`
- `github:azureml/Phi-4`
- `github:azureml-mistral/Codestral-2501`

## Example Usage in Code

```javascript title="example.js"
import promptfoo from 'promptfoo';

// Basic usage
const evalRecord = await promptfoo.evaluate({
  providers: ['github:openai/gpt-5', 'github:anthropic/claude-4-opus'],
  prompts: ['Write a function to {{task}}'],
  tests: [
    {
      vars: { task: 'reverse a string' },
      assert: [
        {
          type: 'contains',
          value: 'function',
        },
      ],
    },
  ],
});
const results = await evalRecord.toEvaluateSummary();

// Using specialized models
const specializedModelsEvalRecord = await promptfoo.evaluate({
  providers: [
    'github:azureml-mistral/Codestral-2501', // Code generation
    'github:deepseek/deepseek-r1', // Reasoning model
    'github:xai/grok-4', // Reasoning and analysis
    'github:meta/llama-4-scout', // Extended context (10M tokens)
  ],
  prompts: ['Implement {{algorithm}} with optimal time complexity'],
  tests: [
    {
      vars: { algorithm: 'quicksort' },
      assert: [
        {
          type: 'javascript',
          value: 'output.includes("function") && output.includes("pivot")',
        },
      ],
    },
  ],
});
const specializedModels = await specializedModelsEvalRecord.toEvaluateSummary();
```

For more information on specific models and their capabilities, refer to the [GitHub Models marketplace](https://github.com/marketplace/models/).

## See Also

- [OpenAI Provider](/docs/providers/openai/) - Compatible provider with similar API format
- [Configuration Reference](/docs/configuration/guide) - General configuration options
- [Provider Options](/docs/providers/) - Overview of all available providers
- [GitHub Models Documentation](https://docs.github.com/en/github-models) - Official GitHub Models documentation
