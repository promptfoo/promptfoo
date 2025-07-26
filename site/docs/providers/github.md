---
title: GitHub Models Provider
description: Access OpenAI, Anthropic, Google, and xAI models through GitHub's unified API with OpenAI-compatible format
keywords:
  [github models, llm providers, openai, anthropic, claude, gemini, grok, deepseek, ai models]
sidebar_label: GitHub Models
---

# GitHub Models

[GitHub Models](https://github.com/marketplace/models/) provides access to industry-leading AI models from OpenAI, Anthropic, Google, and xAI through a unified API interface.

The GitHub Models provider is compatible with all the options provided by the [OpenAI provider](/docs/providers/openai/) as it uses the OpenAI-compatible API format.

## Key Features

- **Unified API**: Access models from multiple providers through a single endpoint
- **OpenAI-compatible**: Use familiar OpenAI SDK and API patterns
- **Enterprise-ready**: Fully supported and billable for production use
- **GitHub Actions support**: Use GITHUB_TOKEN directly in workflows

## Authentication

Set your GitHub personal access token with the `GITHUB_TOKEN` environment variable, or pass it directly in the configuration:

```bash
export GITHUB_TOKEN=your_github_token
```

## Available Models

GitHub Models provides access to industry-leading AI models from various providers. Models are regularly updated and added frequently.

### Model Categories

**Language Models**

- OpenAI GPT-4.1 series (gpt-4.1, gpt-4.1-mini, gpt-4.1-nano)
- OpenAI GPT-4o series (gpt-4o, gpt-4o-mini)
- OpenAI reasoning models (o1-preview, o1-mini, o3-mini)
- Anthropic Claude series (claude-4-opus, claude-4-sonnet, claude-3.7-sonnet, claude-3.5-sonnet, claude-3.5-haiku)
- Google Gemini series (gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash)
- Meta Llama series (llama-4-behemoth, llama-4-maverick, llama-4-scout, llama-3.3-70b-instruct)
- xAI Grok series (grok-4, grok-3, grok-3-mini)
- DeepSeek models (deepseek-r1, deepseek-v3)

**Specialized Models**

- Code generation: Mistral Codestral models
- Reasoning: DeepSeek-R1, Microsoft Phi-4 series, Grok-4 (256K context)
- Multimodal: Vision-capable models from various providers, Llama 4 series
- Fast inference: Flash and mini model variants
- Long context: Llama 4 Scout (10M tokens), Llama 4 Maverick (1M tokens), Llama 4 Behemoth

For the most up-to-date list of available models, visit the [GitHub Models marketplace](https://github.com/marketplace/models/).

## Configuration Examples

### Basic Usage

```yaml
providers:
  - github:openai/gpt-4.1
```

### With Configuration

```yaml title="promptfooconfig.yaml"
providers:
  - id: github:anthropic/claude-4-opus
    config:
      temperature: 0.7
      max_tokens: 4096
      apiKey: ${GITHUB_TOKEN}
```

### Multiple Models

```yaml title="promptfooconfig.yaml"
providers:
  - id: github-fast
    provider: github:openai/gpt-4.1-nano
    config:
      temperature: 0.5

  - id: github-balanced
    provider: github:openai/gpt-4.1-mini
    config:
      temperature: 0.6

  - id: github-smart
    provider: github:openai/gpt-4.1
    config:
      temperature: 0.7

  - id: github-multimodal
    provider: github:meta/llama-4-maverick
    config:
      temperature: 0.8

  - id: github-reasoning
    provider: github:xai/grok-4
    config:
      temperature: 0.7
```

## Model Selection Guidelines

Choose models based on your specific needs:

- **Best Overall**: GPT-4.1 or Claude 4 Opus - Superior coding, instruction following, and long-context understanding
- **Fast & Cheap**: GPT-4.1-nano - Lowest latency and cost while maintaining strong capabilities
- **Balanced**: GPT-4.1-mini or Claude 4 Sonnet - Good performance with lower cost than full models
- **Extended Context**: Llama 4 Scout (10M tokens) for processing entire codebases or multiple documents
- **Code Generation**: Codestral series for specialized code tasks
- **Reasoning**: DeepSeek-R1, o-series models, or Grok-4 for complex reasoning tasks
- **Long Context**: Models with extended context windows for processing large documents
- **Multimodal**: Vision-capable models for text and image processing, including Llama 4 series

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

- **Base URL**: `https://models.github.ai`
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

- `github:openai/gpt-4.1`
- `github:openai/gpt-4.1-mini`
- `github:openai/gpt-4.1-nano`
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
const results = await promptfoo.evaluate({
  providers: ['github:openai/gpt-4.1', 'github:anthropic/claude-4-opus'],
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

// Using specialized models
const specializedModels = await promptfoo.evaluate({
  providers: [
    'github:azureml-mistral/Codestral-2501', // Code generation
    'github:deepseek/deepseek-r1', // Advanced reasoning
    'github:xai/grok-4', // Powerful reasoning and analysis
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
```

For more information on specific models and their capabilities, refer to the [GitHub Models marketplace](https://github.com/marketplace/models/).

## See Also

- [OpenAI Provider](/docs/providers/openai/) - Compatible provider with similar API format
- [Configuration Reference](/docs/configuration/guide) - General configuration options
- [Provider Options](/docs/providers/) - Overview of all available providers
- [GitHub Models Documentation](https://docs.github.com/en/github-models) - Official GitHub Models documentation
