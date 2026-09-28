---
sidebar_label: AI/ML API
description: 'Configure AI/ML API chat, completion, and embedding models in Promptfoo using model IDs from the provider catalog.'
---

# AI/ML API

[AI/ML API](https://aimlapi.com) hosts models from OpenAI, Anthropic, Google, Meta, and other providers behind an OpenAI-compatible API.

## OpenAI Compatibility

Promptfoo uses the [OpenAI provider](/docs/providers/openai/) request format. Supported parameters depend on the model and endpoint.

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
  - id: aimlapi:chat:google/gemini-3-5-flash
    config:
      temperature: 0.7
      max_tokens: 2000
```

### Configuration Options

Common OpenAI parameters include:

| Parameter           | Description                                  |
| ------------------- | -------------------------------------------- |
| `apiKey`            | Your AI/ML API key                           |
| `temperature`       | Controls randomness (0.0 to 2.0)             |
| `max_tokens`        | Maximum number of tokens to generate         |
| `top_p`             | Nucleus sampling parameter                   |
| `frequency_penalty` | Penalizes frequent tokens                    |
| `presence_penalty`  | Penalizes new tokens based on presence       |
| `stop`              | Sequences where the API will stop generating |

Promptfoo requests complete responses; this provider does not support streaming.

## Popular Models

Use the model ID shown in the [AI/ML API catalog](https://aimlapi.com/models), including its publisher prefix. Examples:

### Reasoning Models

- [GPT-5.6 Luna](https://aimlapi.com/models/gpt-5-6-luna): `openai/gpt-5.6-luna`

### Advanced Language Models

- [Claude Sonnet 5](https://aimlapi.com/models/claude-sonnet-5): `anthropic/claude-sonnet-5`
- [Gemini 3.5 Flash](https://aimlapi.com/models/gemini-3-5-flash): `google/gemini-3-5-flash`

### Open Source Models

- [DeepSeek V4 Pro](https://aimlapi.com/models/deepseek-v4-pro): `deepseek/deepseek-v4-pro`

### Embedding Models

- [Text Embedding 3 Large](https://aimlapi.com/models/text-embedding-3-large): `openai/text-embedding-3-large`

## Example Configurations

### Basic Example

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - aimlapi:chat:deepseek/deepseek-v4-pro
  - aimlapi:chat:openai/gpt-5.6-luna
  - aimlapi:chat:anthropic/claude-sonnet-5

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
  - id: aimlapi:chat:deepseek/deepseek-v4-pro
    label: 'DeepSeek V4 Pro'
    config:
      max_tokens: 4000

  - id: aimlapi:chat:openai/gpt-5.6-luna
    label: 'GPT-5.6 Luna'

  - id: aimlapi:chat:google/gemini-3-5-flash
    label: 'Gemini 3.5 Flash'
    config:
      temperature: 0.5

prompts:
  - 'Write Python code to {{task}}. Return only the code, without Markdown fences.'

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
          except SyntaxError:
            return False
      - type: llm-rubric
        value: 'The code should include insert, search, and delete methods'
```

### Embedding Example

Embedding models back the [`similar` assertion](/docs/configuration/expected-outputs/similar/). Set them under `defaultTest.options.provider.embedding`; an embedding model cannot be used as a top-level eval provider. Extra request fields such as `dimensions` go under `config.passthrough`.

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - aimlapi:chat:openai/gpt-5.6-luna

defaultTest:
  options:
    provider:
      embedding:
        id: aimlapi:embedding:openai/text-embedding-3-large
        config:
          passthrough:
            dimensions: 1024 # Optional: reduce embedding dimensions

prompts:
  - 'Describe {{topic}} in one sentence.'

tests:
  - vars:
      topic: 'a fox jumping over a dog'
    assert:
      - type: similar
        value: 'The quick brown fox jumps over the lazy dog'
        threshold: 0.7
```

### JSON Mode Example

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: aimlapi:chat:openai/gpt-5.6-luna
    config:
      response_format: { type: 'json_object' }

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

## Notes

Check [AI/ML API pricing](https://aimlapi.com/ai-ml-api-pricing) for rates and account limits.
