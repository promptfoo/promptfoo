---
sidebar_label: AI/ML API
description: "Access models through AI/ML API's unified OpenAI-compatible interface"
---

# AI/ML API

[AI/ML API](https://aimlapi.com) provides access to models from multiple developers through a
unified OpenAI-compatible interface.

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

```yaml
providers:
  - id: aimlapi:chat:deepseek/deepseek-r1
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

AI/ML API adds and retires model IDs independently of promptfoo. Use its
[model database](https://docs.aimlapi.com/api-references/model-database) as the source of truth.

### Reasoning Models

Filter the model database for models that expose reasoning controls, then copy the exact ID from
the linked API reference.

### Advanced Language Models

The model database lists the exact provider-qualified IDs accepted by the API.

### Open Source Models

Use the model database's developer and modality filters instead of copying a dated static list.

### Embedding Models

Choose an embedding model from the model database and use its exact ID after the
`aimlapi:embedding:` prefix.

You can also browse the [AI/ML API Models page](https://aimlapi.com/models?utm_source=promptfoo&utm_medium=github&utm_campaign=integration).

## Example Configurations

### Basic Example

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - aimlapi:chat:deepseek/deepseek-r1
  - aimlapi:chat:openai/gpt-5-mini-2025-08-07
  - aimlapi:chat:anthropic/claude-sonnet-4

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
  - id: aimlapi:chat:openai/gpt-5-2025-08-07
    label: 'GPT-5'
    config:
      temperature: 0.7
      max_tokens: 2000

  # Additional general-purpose model
  - id: aimlapi:chat:google/gemini-2.5-flash
    label: 'Gemini 2.5 Flash'
    config:
      temperature: 0.5
      stream: true

prompts:
  - 'Implement the following task and return only Python code: {{task}}'

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
  - echo

prompts:
  - 'The quick brown fox jumps over the lazy dog'

tests:
  - assert:
      - type: similar
        value: 'The quick brown fox jumps over the lazy dog'
        threshold: 0.9
        provider:
          id: aimlapi:embedding:text-embedding-3-large
          config:
            dimensions: 3072
```

### JSON Mode Example

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: aimlapi:chat:openai/gpt-5-2025-08-07
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
- **Rate Limits**: Vary by subscription tier
- **Model Updates**: New models are added regularly - check the [models page](https://aimlapi.com/models) for the current list
- **Unified Billing**: Pay for all models through a single account

For detailed pricing information, visit [aimlapi.com/pricing](https://aimlapi.com/pricing).
