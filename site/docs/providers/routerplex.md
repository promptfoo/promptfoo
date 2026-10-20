---
title: RouterPlex
sidebar_label: RouterPlex
description: Configure RouterPlex chat models in promptfoo using the OpenAI-compatible provider, so one eval can compare Claude, GPT, Gemini, and DeepSeek models with a single API key.
---

# RouterPlex

[RouterPlex](https://routerplex.com) is a hosted gateway that serves models from several vendors through an [OpenAI-compatible API](https://docs.routerplex.com/chat-completions). Use promptfoo's [OpenAI provider](/docs/providers/openai/) with RouterPlex's endpoint and API key.

RouterPlex bills from a prepaid balance at vendor list prices. Each API key can have its own USD budget, so an eval run cannot spend more than that key's cap.

## Setup

Create a key in the [RouterPlex dashboard](https://routerplex.com/dashboard) and set `ROUTERPLEX_API_KEY` in your shell, or load it from a file with `--env-file`.

```yaml
providers:
  - id: openai:chat:claude-sonnet-4-6
    config:
      apiBaseUrl: https://api.routerplex.com/v1
      apiKeyEnvar: ROUTERPLEX_API_KEY
      headers:
        OpenAI-Organization: ''
      omitDefaults: true
      max_tokens: 1024
```

`apiBaseUrl` overrides OpenAI endpoint environment variables. `apiKeyEnvar` selects only `ROUTERPLEX_API_KEY`; a missing key does not fall back to `OPENAI_API_KEY`. The empty `OpenAI-Organization` header overrides any inherited `OPENAI_ORGANIZATION` value.

## Configuration

- Use the model ID exactly as RouterPlex lists it, after `openai:chat:`. IDs are case-sensitive and have no vendor prefix, for example `claude-sonnet-4-6`, `gpt-6-sol`, `gemini-3.1-pro`, or `deepseek-v4-pro`.
- `omitDefaults: true` omits promptfoo's default output limit and temperature. Explicit settings and `OPENAI_MAX_TOKENS` / `OPENAI_TEMPERATURE` still apply.
- Use `max_tokens` to cap output, including reasoning tokens for reasoning models.
- Check the [model catalog](https://routerplex.com/api/models) or `GET https://api.routerplex.com/v1/models` for current model IDs, context windows, and prices. The catalog also lists an image generation model, which this chat provider does not use.

## Comparing models

Because every model sits behind one endpoint and one key, a single config can compare vendors:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: openai:chat:claude-sonnet-4-6
    config: &routerplex
      apiBaseUrl: https://api.routerplex.com/v1
      apiKeyEnvar: ROUTERPLEX_API_KEY
      headers:
        OpenAI-Organization: ''
      omitDefaults: true
      max_tokens: 1024
  - id: openai:chat:gpt-6-sol
    config: *routerplex
  - id: openai:chat:deepseek-v4-pro
    config: *routerplex

prompts:
  - 'Answer clearly and concisely: {{question}}'

tests:
  - vars:
      question: 'What is the capital of France?'
    assert:
      - type: contains
        value: Paris
```

## Model-graded assertions

The providers above do not configure the grader for assertions such as `llm-rubric`. [Set the grader](/docs/configuration/expected-outputs/model-graded/#overriding-the-llm-grader) in `defaultTest.options.provider` to a model RouterPlex serves:

```yaml
defaultTest:
  options:
    provider:
      id: openai:chat:claude-sonnet-4-6
      config:
        apiBaseUrl: https://api.routerplex.com/v1
        apiKeyEnvar: ROUTERPLEX_API_KEY
        headers:
          OpenAI-Organization: ''
```

## Errors

- `401`: the key is wrong or the environment variable is not set in the shell running promptfoo.
- `402`: the account balance is used up. Add credit.
- `403`: the key reached its own budget, or the model is not on its allowlist.

RouterPlex also accepts the Anthropic Messages format. See the [RouterPlex documentation](https://docs.routerplex.com/anthropic-messages) if you want to use promptfoo's Anthropic provider instead.
