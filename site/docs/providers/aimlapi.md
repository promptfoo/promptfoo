---
sidebar_label: AI/ML API
description: "Access 200+ open-source AI models via AIML API's unified interface with consistent pricing and simplified integration"
---

# AI/ML API

[AI/ML API](https://aimlapi.com) provides access to 300+ AI models through a unified OpenAI-compatible interface, including state-of-the-art models from OpenAI, Anthropic, Google, Meta, and more.

## OpenAI Compatibility

AI/ML API's endpoints are compatible with OpenAI's API, which means all parameters available in the [OpenAI provider](/docs/providers/openai/) work with AI/ML API.

## Setup

To use AI/ML API, you need to set the `AIML_API_KEY` environment variable or specify the `apiKey` in the provider configuration.

Example of setting the environment variable:

```sh
export AIML_API_KEY=your_api_key_here
```

Get your API key at [aimlapi.com](https://aimlapi.com/app/?utm_source=promptfoo&utm_medium=github&utm_campaign=integration).

## Provider Formats

### Chat Models

```
aimlapi:chat:<model_name>
```

### Completion Models

```
aimlapi:completion:<model_name>
```

### Embedding Models

```
aimlapi:embedding:<model_name>
```

### Shorthand Format

You can omit the type to default to chat mode:

```
aimlapi:<model_name>
```

## Configuration

Configure the provider in your promptfoo configuration file:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: aimlapi:chat:deepseek-r1
    config:
      temperature: 0.7
      max_tokens: 2000
      apiKey: ... # optional, overrides environment variable
```

### Configuration Options

All standard OpenAI parameters are supported:

| Parameter           | Description                                  |
| ------------------- | -------------------------------------------- |
| `apiKey`            | Your AI/ML API key                           |
| `temperature`       | Controls randomness (0.0 to 2.0)             |
| `max_tokens`        | Maximum number of tokens to generate         |
| `top_p`             | Nucleus sampling parameter                   |
| `frequency_penalty` | Penalizes frequent tokens                    |
| `presence_penalty`  | Penalizes new tokens based on presence       |
| `stop`              | Sequences where the API will stop generating |
| `stream`            | Enable streaming responses                   |

## Popular Models

AI/ML API offers models from multiple providers. Here are some of the most popular models by category:

### Reasoning Models

- **DeepSeek R1**: `deepseek-r1` - Advanced reasoning with chain-of-thought capabilities
- **OpenAI o3 Mini**: `openai/o3-mini` - Efficient reasoning model
- **OpenAI o4 Mini**: `openai/o4-mini` - Latest compact reasoning model
- **QwQ-32B**: `qwen/qwq-32b` - Alibaba's reasoning model

### Advanced Language Models

- **GPT-4.1**: `openai/gpt-4.1-2025-04-14` - Latest GPT with 1M token context
- **GPT-4.1 Mini**: `gpt-4.1-mini` - 83% cheaper than GPT-4o with comparable performance
- **Claude 4 Sonnet**: `anthropic/claude-4-sonnet` - Balanced speed and capability
- **Claude 4 Opus**: `anthropic/claude-4-opus` - Most capable Claude model
- **Gemini 2.5 Pro**: `google/gemini-2.5-pro-preview` - Google's versatile multimodal model
- **Gemini 2.5 Flash**: `google/gemini-2.5-flash` - Ultra-fast streaming responses
- **Grok 3 Beta**: `x-ai/grok-3-beta` - xAI's most advanced model

### Open Source Models

- **DeepSeek V3**: `deepseek-v3` - Powerful open-source alternative
- **Llama 4 Maverick**: `meta-llama/llama-4-maverick` - Latest Llama model
- **Qwen Max**: `qwen/qwen-max-2025-01-25` - Alibaba's efficient MoE model
- **Mistral Codestral**: `mistral/codestral-2501` - Specialized for coding

### Embedding Models

- **Text Embedding 3 Large**: `text-embedding-3-large` - OpenAI's latest embedding model
- **Voyage Large 2**: `voyage-large-2` - High-quality embeddings
- **BGE M3**: `bge-m3` - Multilingual embeddings

For a complete list of all 300+ available models, visit the [AI/ML API Models page](https://aimlapi.com/models?utm_source=promptfoo&utm_medium=github&utm_campaign=integration).

## Example Configurations

### Basic Example

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - aimlapi:chat:deepseek-r1
  - aimlapi:chat:gpt-4.1-mini
  - aimlapi:chat:claude-4-sonnet

prompts:
  - 'Explain {{concept}} in simple terms'

tests:
  - vars:
      concept: 'quantum computing'
    assert:
      - type: contains
        value: 'qubit'
```

### Advanced Configuration with Multiple Models

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  # Reasoning model with low temperature
  - id: aimlapi:chat:deepseek-r1
    label: 'DeepSeek R1 (Reasoning)'
    config:
      temperature: 0.1
      max_tokens: 4000

  # General purpose model
  - id: aimlapi:chat:openai/gpt-4.1-2025-04-14
    label: 'GPT-4.1'
    config:
      temperature: 0.7
      max_tokens: 2000

  # Fast, cost-effective model
  - id: aimlapi:chat:gemini-2.5-flash
    label: 'Gemini 2.5 Flash'
    config:
      temperature: 0.5
      stream: true

prompts:
  - file://prompts/coding_task.txt

tests:
  - vars:
      task: 'implement a binary search tree in Python'
    assert:
      - type: python
        value: |
          # Verify the code is valid Python
          import ast
          try:
            ast.parse(output)
            return True
          except:
            return False
      - type: llm-rubric
        value: 'The code should include insert, search, and delete methods'
```

### Embedding Example

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: aimlapi:embedding:text-embedding-3-large
    config:
      dimensions: 3072 # Optional: reduce embedding dimensions

prompts:
  - '{{text}}'

tests:
  - vars:
      text: 'The quick brown fox jumps over the lazy dog'
    assert:
      - type: is-valid-embedding
      - type: embedding-dimension
        value: 3072
```

### JSON Mode Example

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: aimlapi:chat:gpt-4.1
    config:
      response_format: { type: 'json_object' }
      temperature: 0.0

prompts:
  - |
    Extract the following information from the text and return as JSON:
    - name
    - age
    - occupation

    Text: {{text}}

tests:
  - vars:
      text: 'John Smith is a 35-year-old software engineer'
    assert:
      - type: is-json
      - type: javascript
        value: |
          const data = JSON.parse(output);
          return data.name === 'John Smith' && 
                 data.age === 35 && 
                 data.occupation === 'software engineer';
```

## Getting Started

Test your setup with working examples:

```bash
npx promptfoo@latest init --example provider-aiml-api
```

This includes tested configurations for comparing multiple models, evaluating reasoning capabilities, and measuring response quality.

## Notes

- **API Key Required**: Sign up at [aimlapi.com](https://aimlapi.com) to get your API key
- **Free Credits**: New users receive free credits to explore the platform
- **Rate Limits**: Vary by subscription tier
- **Model Updates**: New models are added regularly - check the [models page](https://aimlapi.com/models) for the latest additions
- **Unified Billing**: Pay for all models through a single account

For detailed pricing information, visit [aimlapi.com/pricing](https://aimlapi.com/pricing).
