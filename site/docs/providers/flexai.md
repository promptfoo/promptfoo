---
title: FlexAI
sidebar_label: FlexAI
description: Configure FlexAI chat and embedding models in promptfoo using the OpenAI-compatible provider, with reasoning settings, token limits, and similarity assertions.
---

# FlexAI

[FlexAI](https://flex.ai) serves models through an [OpenAI-compatible API](https://docs.flex.ai/inference-api/reference/openai-compatibility). Use promptfoo's [OpenAI provider](/docs/providers/openai/) with FlexAI's endpoint and API key.

FlexAI documents its data handling in its [privacy policy](https://flex.ai/privacy-policy) and [terms of service](https://flex.ai/terms-of-service).

## Setup

Create a key on the [FlexAI platform](https://platform.flex.ai) and set `FLEXAI_API_KEY` in your shell, or load it from a file with `--env-file`.

```yaml
providers:
  - id: openai:chat:DeepSeek-V4-Flash-0731
    config:
      apiBaseUrl: https://api.flex.ai/v1
      apiKeyEnvar: FLEXAI_API_KEY
      headers:
        OpenAI-Organization: ''
      omitDefaults: true
      temperature: 0
      max_tokens: 4096
      showThinking: false
      passthrough:
        reasoning_effort: low
```

`apiBaseUrl` overrides OpenAI endpoint environment variables. `apiKeyEnvar` selects only `FLEXAI_API_KEY`; a missing key does not fall back to `OPENAI_API_KEY`. The empty `OpenAI-Organization` header overrides any inherited `OPENAI_ORGANIZATION` value.

## Configuration

- `omitDefaults: true` omits promptfoo's default output limit and temperature. Explicit settings and `OPENAI_MAX_TOKENS` / `OPENAI_TEMPERATURE` still apply; the example sets `temperature: 0` explicitly.
- Use `max_tokens` to cap output, including reasoning tokens. If you leave it unset and have no `OPENAI_MAX_TOKENS`, FlexAI chooses the limit. Increase it if reasoning consumes the budget before an answer appears.
- Put `reasoning_effort` under `passthrough` to send it to FlexAI regardless of model-name detection. FlexAI maps supported effort levels to each model's controls.
- `showThinking: false` excludes reasoning text from the answer used by assertions.

Check the [model catalog](https://flex.ai/models) or `GET https://api.flex.ai/v1/models` for current model IDs. See the [compatibility reference](https://docs.flex.ai/inference-api/reference/openai-compatibility) for supported parameters and [pricing](https://flex.ai/pricing) for current rates.

## Embeddings

Use FlexAI's `bge-m3` model for [similarity assertions](/docs/configuration/expected-outputs/similar/):

```yaml
defaultTest:
  options:
    provider:
      embedding:
        id: openai:embedding:bge-m3
        config:
          apiBaseUrl: https://api.flex.ai/v1
          apiKeyEnvar: FLEXAI_API_KEY
          headers:
            OpenAI-Organization: ''
```

## Example

The [provider-flexai example](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-flexai) compares two chat models and uses FlexAI embeddings for grading with the same API key.
