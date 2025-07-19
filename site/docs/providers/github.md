---
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

GitHub Models provides access to industry-leading AI models from various providers. Models are regularly updated and new ones are added frequently.

### Model Categories

**Language Models**
- OpenAI GPT series (gpt-4o, gpt-4o-mini, o1-preview, o1-mini, o3-mini)
- Anthropic Claude series (claude-3.7-sonnet, claude-3.5-sonnet)
- Google Gemini series (gemini-2.5-pro, gemini-2.0-flash)
- Meta Llama series (including Llama 4 with up to 10M context)

**Specialized Models**
- Code generation: Mistral Codestral models
- Reasoning: DeepSeek-R1, Microsoft Phi-4 series
- Multimodal: Phi-4-multimodal, Llama 4 variants
- Fast inference: Flash and mini model variants

For the most up-to-date list of available models, visit the [GitHub Models marketplace](https://github.com/marketplace/models/).

## Configuration Examples

### Basic Usage

```yaml
providers:
  - github:openai/gpt-4o
```

### With Configuration

```yaml
providers:
  - id: github:anthropic/claude-3.7-sonnet
    config:
      temperature: 0.7
      max_tokens: 4096
      apiKey: ${GITHUB_TOKEN}
```

### Multiple Models

```yaml
providers:
  - id: github-fast
    provider: github:openai/gpt-4o-mini
    config:
      temperature: 0.5
  
  - id: github-smart
    provider: github:anthropic/claude-3.7-sonnet
    config:
      temperature: 0.7
  
  - id: github-multimodal
    provider: github:google/gemini-2.0-flash
    config:
      temperature: 0.8
```

## Model Selection Guidelines

Choose models based on your specific needs:

- **Code Generation**: Look for models optimized for coding tasks (e.g., Codestral series)
- **Reasoning**: Choose models with strong reasoning capabilities (e.g., o1/o3 series, DeepSeek-R1)
- **Speed**: Select "mini" or "flash" variants for faster responses
- **Context Length**: Check model specifications for context window sizes (ranging from standard to 10M+ tokens)
- **Multimodal**: Use models that explicitly support vision, audio, or other modalities

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

**Important**: The legacy Azure endpoint (`https://models.inference.ai.azure.com`) is deprecated. Always use `https://models.github.ai`.

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
- `github:openai/gpt-4o`
- `github:anthropic/claude-3.5-sonnet`
- `github:azureml/Phi-4`
- `github:azureml-mistral/Codestral-2501`

## Example Usage in Code

```javascript
import promptfoo from 'promptfoo';

// Basic usage
const results = await promptfoo.evaluate({
  providers: ['github:openai/gpt-4o', 'github:anthropic/claude-3.7-sonnet'],
  prompts: ['Write a function to {{task}}'],
  tests: [
    {
      vars: { task: 'reverse a string' },
      assert: [{
        type: 'contains',
        value: 'function'
      }]
    }
  ]
});

// Using the latest models
const latestModels = await promptfoo.evaluate({
  providers: [
    'github:azureml-mistral/Codestral-2501',  // Best for code
    'github:azureml-deepseek/DeepSeek-R1',     // Best for reasoning
    'github:azureml/Phi-4',                    // Fast & efficient
    'github:openai/o3-mini'                    // Cost-effective
  ],
  prompts: ['Implement {{algorithm}} with optimal time complexity'],
  tests: [
    {
      vars: { algorithm: 'quicksort' },
      assert: [{
        type: 'javascript',
        value: 'output.includes("function") && output.includes("pivot")',
      }]
    }
  ]
});
```

For more information on specific models and their capabilities, refer to the [GitHub Models marketplace](https://github.com/marketplace/models/).
