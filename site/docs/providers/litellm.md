---
sidebar_label: LiteLLM
---

# LiteLLM

[LiteLLM](https://docs.litellm.ai/docs/) provides access to 400+ LLMs through a unified OpenAI-compatible interface. As of January 2025, LiteLLM supports the latest models including DeepSeek R1, Claude 4, GPT-4.1, and many more.

You can use LiteLLM with promptfoo in three ways:

## Using the dedicated LiteLLM provider

The LiteLLM provider supports chat, completion, and embedding models:

### Chat models (default)

```yaml
providers:
  - id: litellm:<model name>
  # or explicitly:
  - id: litellm:chat:<model name>
```

For example, to use GPT-4.1:

```yaml
- id: litellm:gpt-4.1
# or
- id: litellm:chat:gpt-4.1
```

### Completion models

```yaml
providers:
  - id: litellm:completion:<model name>
```

### Embedding models

```yaml
providers:
  - id: litellm:embedding:<model name>
```

For example, to use text-embedding-3-small:

```yaml
providers:
  - id: litellm:embedding:text-embedding-3-small
```

## Recent Model Support (January 2025)

LiteLLM now supports the latest models from various providers:

### OpenAI Models
- **GPT-4.1 series**: `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`
- **O-series**: `o3`, `o3-mini`, `o3-pro`, `o4-mini`
- **Codex**: `codex-mini-latest`
- **Computer Use**: `computer-use-preview`
- **Audio models**: `gpt-4o-audio-preview`, `gpt-4o-mini-audio-preview`

### Anthropic Models
- **Claude 4 series**: `claude-4-opus-20250514`, `claude-4-sonnet-20250514`
- **Claude 3.7**: Latest Claude models with enhanced capabilities

### DeepSeek Models
- **DeepSeek R1**: The reasoning model series
  - `deepseek-r1` (671B parameters, 37B activated)
  - `deepseek-r1-zero`
  - `deepseek-r1-distill-qwen-1.5b` through `deepseek-r1-distill-qwen-32b`
  - `deepseek-r1-distill-llama-8b` and `deepseek-r1-distill-llama-70b`
- **DeepSeek V3**: `deepseek-v3`

### Google Models
- **Gemini 2.5 series**: 
  - `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`
  - `gemini-2.5-pro-preview-05-06`
  - `gemini-2.5-flash-preview-tts` (Text-to-Speech)
  - `gemini-2.0-flash-preview-image-generation`

### Other Notable Models
- **xAI**: `grok-2-latest`, `grok-3`
- **Mistral**: `mistral-medium-latest`, `magistral-medium-latest`, `magistral-small-latest`
- **Meta Llama**: Support for Llama 4 models
- **Perplexity**: `sonar-deep-research`
- **Cerebras**: `qwen-3-32b`
- **SambaNova**: DeepSeek R1 variants

## Configuration

### Basic usage

```yaml
providers:
  - id: litellm:gpt-4.1
    config:
      apiKey: ${OPENAI_API_KEY}
      apiBaseUrl: https://api.openai.com/v1
```

### Using the LiteLLM proxy server

If you're running a LiteLLM proxy server, you can configure it like this:

```yaml
providers:
  - id: litellm:gpt-4.1
    config:
      apiBaseUrl: http://localhost:4000
      apiKey: ${LITELLM_API_KEY}
```

### Advanced configuration

All LiteLLM parameters are supported:

```yaml
providers:
  - id: litellm:claude-4-sonnet-20250514
    config:
      apiKey: ${ANTHROPIC_API_KEY}
      temperature: 0.7
      max_tokens: 4096
      top_p: 0.9
      # Any other LiteLLM-supported parameters
```

## Using OpenAI or other providers directly

Since LiteLLM uses the OpenAI format, you can also use the OpenAI provider with LiteLLM's proxy:

```yaml
providers:
  - id: openai:chat:gpt-4.1
    config:
      apiBaseUrl: http://localhost:4000
      apiKey: ${LITELLM_API_KEY}
```

## Supported Parameters

All standard LiteLLM parameters are passed through:
- `temperature`
- `max_tokens`
- `top_p`
- `frequency_penalty`
- `presence_penalty`
- `stop`
- `response_format`
- `tools` / `functions`
- `seed`
- And many more provider-specific parameters

## Environment Variables

The LiteLLM provider respects standard environment variables:
- `LITELLM_API_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `AZURE_API_KEY`
- And all other provider-specific environment variables

## Example Configuration

Here's a complete example using multiple LiteLLM models:

```yaml
# promptfooconfig.yaml
providers:
  # Latest OpenAI models
  - id: litellm:gpt-4.1
  - id: litellm:o3-mini
  
  # Claude 4
  - id: litellm:claude-4-sonnet-20250514
    config:
      apiKey: ${ANTHROPIC_API_KEY}
  
  # DeepSeek R1 (reasoning model)
  - id: litellm:deepseek-r1
    config:
      temperature: 0.6  # Recommended for DeepSeek R1
  
  # Gemini 2.5
  - id: litellm:gemini-2.5-pro
  
  # Embedding model for similarity checks
  - id: litellm:embedding:text-embedding-3-small

prompts:
  - "Translate this to {{language}}: {{text}}"

tests:
  - vars:
      language: French
      text: "Hello, world!"
    assert:
      - type: contains
        value: "Bonjour"
      - type: similar
        value: "Bonjour, le monde!"
        threshold: 0.8
        provider: litellm:embedding:text-embedding-3-small
```

## Tips for Using LiteLLM

1. **Model Naming**: Use the exact model names as specified in LiteLLM's documentation
2. **API Keys**: Make sure to set the appropriate API keys for each provider
3. **Proxy Server**: For production use, consider running a LiteLLM proxy server for better control and monitoring
4. **Rate Limiting**: LiteLLM handles rate limiting across providers automatically
5. **Cost Tracking**: LiteLLM provides built-in cost tracking for supported models

## Troubleshooting

If you encounter issues:

1. Verify your API keys are correctly set
2. Check that the model name is exactly as specified by LiteLLM
3. Ensure your LiteLLM proxy server (if using one) is running and accessible
4. Check LiteLLM's documentation for provider-specific requirements

For more information, see the [LiteLLM documentation](https://docs.litellm.ai/docs/).
