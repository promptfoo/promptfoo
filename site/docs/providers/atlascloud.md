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

This example uses the `deepseek-v3` chat ID from Atlas Cloud's [first-model guide](https://www.atlascloud.ai/docs/en/models/get-start). Use Atlas Cloud's model ID for your selected endpoint; native vendor IDs may differ.

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: atlascloud:deepseek-v3
    config:
      temperature: 0.7
      max_tokens: 500

prompts:
  - 'Answer clearly and concisely: {{question}}'

tests:
  - vars:
      question: 'What is the capital of France?'
    assert:
      - type: contains
        value: 'Paris'
```

The default `apiBaseUrl` is `https://api.atlascloud.ai/v1`; promptfoo appends `/chat/completions` when sending chat requests. Atlas Cloud's image and video APIs use separate endpoints and asynchronous prediction handling; the `atlascloud:` provider implements the chat API.

## Configuration Options

The provider accepts the shared OpenAI chat options below. Check your selected Atlas Cloud model's API reference for supported parameters and features:

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
  - id: atlascloud:deepseek-v3
    config:
      apiBaseUrl: https://proxy.example.com/atlas/v1
      apiKeyEnvar: MY_ATLASCLOUD_TOKEN
      temperature: 0.7
```

Precedence is:

- `config.apiBaseUrl` if provided, otherwise Atlas Cloud's default `https://api.atlascloud.ai/v1`
- `config.apiKeyEnvar` if provided, otherwise `ATLASCLOUD_API_KEY`

## Model Examples

Atlas Cloud's catalog changes over time. Use the exact chat model ID from its model library or API reference. The public first-model guide uses:

```yaml
providers:
  - atlascloud:deepseek-v3
```

The provider forwards your configured model ID unchanged. You can use any chat ID available to your Atlas Cloud account.

## Example

See the runnable example in [`examples/provider-atlascloud`](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-atlascloud).

## Additional Resources

- [Atlas Cloud Docs](https://www.atlascloud.ai/docs)
- [Atlas Cloud Get Started](https://www.atlascloud.ai/docs/en/models/get-start)
- [Atlas Cloud FAQ](https://www.atlascloud.ai/docs/faq)
