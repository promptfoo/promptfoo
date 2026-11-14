---
title: PopNow Provider
sidebar_label: PopNow
sidebar_position: 42
description: "Evaluate Claude, GPT, Gemini, DeepSeek and Kimi chat models through PopNow's OpenAI-compatible API in promptfoo, with one API key and pay-as-you-go USD billing"
---

# PopNow

[PopNow](https://popnow.ai/api) gives developers one API key for Claude, GPT, Gemini, DeepSeek, Kimi and other chat models, billed per token in USD. Its chat API is OpenAI-compatible, so it works with promptfoo using the same request shape as the OpenAI chat provider. That makes it a convenient way to compare models from several labs in one eval.

## Setup

1. Create an API key in the [PopNow API console](https://popnow.ai/api/console/keys) and add funds to your API balance.
2. Set the `POPNOW_API_KEY` environment variable:

```sh
export POPNOW_API_KEY=your_api_key_here
```

You can also pass `apiKey` directly in the provider config, but using an environment variable is recommended.

## Basic Configuration

PopNow model IDs keep the lab and the task in the name, for example `google/gemini-3.7-flash/chat`. Use them after the `popnow:` prefix:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: popnow:google/gemini-3.7-flash/chat
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

The default `apiBaseUrl` is `https://api.popnow.ai/v1`; promptfoo appends `/chat/completions` when sending chat requests. PopNow's image, video and music models use a separate asynchronous task API; the `popnow:` provider implements the chat API.

## Comparing Models

Because every model sits behind the same key and endpoint, a side-by-side comparison only needs a list of IDs:

```yaml
providers:
  - popnow:anthropic/claude-sonnet-5.5/chat
  - popnow:openai/gpt-6.1-terra/chat
  - popnow:google/gemini-3.7-flash/chat
  - popnow:deepseek/v4.1-flash/chat
```

The full list of chat models, with per-token prices and the parameters each one accepts, is in the [PopNow chat docs](https://popnow.ai/docs/chat). `GET https://api.popnow.ai/v1/models` with your API key returns every model; chat models have `task` set to `chat`.

## Configuration Options

The provider accepts the shared OpenAI chat options below. Parameter support differs by model; the PopNow model table lists what each one accepts:

- `temperature`
- `max_tokens`
- `top_p`
- `stop`
- `reasoning_effort`
- `response_format`
- `tools`
- `tool_choice`

For the full shared option set, see the [OpenAI provider documentation](/docs/providers/openai/).

## Custom Base URL or API Key Variable

If you route PopNow through a proxy or internal gateway, override `apiBaseUrl`. You can also tell promptfoo to read the Bearer token from a different environment variable by setting `apiKeyEnvar`.

```yaml
providers:
  - id: popnow:google/gemini-3.7-flash/chat
    config:
      apiBaseUrl: https://proxy.example.com/popnow/v1
      apiKeyEnvar: MY_POPNOW_TOKEN
```

Precedence is:

- `config.apiBaseUrl` if provided, otherwise PopNow's default `https://api.popnow.ai/v1`
- `config.apiKeyEnvar` if provided, otherwise `POPNOW_API_KEY`

## Example

See the runnable example in [`examples/provider-popnow`](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-popnow).

## Additional Resources

- [PopNow API](https://popnow.ai/api)
- [PopNow chat docs](https://popnow.ai/docs/chat)
- [PopNow API docs](https://popnow.ai/docs)
