---
sidebar_label: Atlas Cloud
description: "Access Atlas Cloud's OpenAI-compatible LLM API to evaluate models from DeepSeek, Qwen, Kimi, GLM, and more through promptfoo"
---

# Atlas Cloud

[Atlas Cloud](https://www.atlascloud.ai/) is an AI API aggregation platform that provides unified access to 300+ AI models through one API key and billing account. Its LLM chat API is OpenAI-compatible, so it integrates with promptfoo using the same request shape as the OpenAI chat provider.

## Setup

1. Create an API key in the [Atlas Cloud dashboard](https://www.atlascloud.ai/docs/en/models/get-start).
2. Set the `ATLASCLOUD_API_KEY` environment variable:

```sh
export ATLASCLOUD_API_KEY=your_api_key_here
```

You can also pass `apiKey` directly in the provider config, but using an environment variable is recommended.

## Basic Configuration

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: atlascloud:deepseek-ai/DeepSeek-V3-0324
    config:
      temperature: 0.7
      max_tokens: 500

  - id: atlascloud:qwen/qwen3-32b
    config:
      temperature: 0.2

prompts:
  - 'Answer clearly and concisely: {{question}}'

tests:
  - vars:
      question: 'What is the capital of France?'
    assert:
      - type: contains
        value: 'Paris'
```

By default, the Atlas Cloud provider sends chat requests to `https://api.atlascloud.ai/v1`.

## Configuration Options

Atlas Cloud supports the standard OpenAI chat options already available in promptfoo, including:

- `temperature`
- `max_tokens`
- `top_p`
- `presence_penalty`
- `frequency_penalty`
- `stop`
- `response_format`
- `tools`
- `tool_choice`

For the full shared option set, see the [OpenAI provider documentation](/docs/providers/openai/).

## Custom Base URL or API Key Variable

If you route Atlas Cloud through a proxy or internal gateway, override `apiBaseUrl`. You can also instruct promptfoo to read the Bearer token from a different environment variable by setting `apiKeyEnvar`.

```yaml title="promptfooconfig.yaml"
providers:
  - id: atlascloud:deepseek-ai/DeepSeek-V3-0324
    config:
      apiBaseUrl: https://proxy.example.com/atlas/v1
      apiKeyEnvar: MY_ATLASCLOUD_TOKEN
      temperature: 0.7
```

Precedence is:

- `config.apiBaseUrl` if provided, otherwise Atlas Cloud's default `https://api.atlascloud.ai/v1`
- `config.apiKeyEnvar` if provided, otherwise `ATLASCLOUD_API_KEY`

## Model Examples

Atlas Cloud's catalog changes over time. You should use the exact model ID returned by `GET /v1/models`. For example, this provider was verified against live Atlas Cloud model IDs such as `deepseek-ai/DeepSeek-V3-0324` and `qwen/qwen3-32b`.

```yaml
providers:
  - atlascloud:deepseek-ai/DeepSeek-V3-0324
  - atlascloud:qwen/qwen3-32b
  - atlascloud:moonshotai/Kimi-K2-Instruct
```

Use the exact model ID shown in the Atlas Cloud model library or docs.

## Example

See the runnable example in [`examples/provider-atlascloud`](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-atlascloud).

## Additional Resources

- [Atlas Cloud Docs](https://www.atlascloud.ai/docs)
- [Atlas Cloud Get Started](https://www.atlascloud.ai/docs/en/models/get-start)
- [Atlas Cloud FAQ](https://www.atlascloud.ai/docs/faq)
