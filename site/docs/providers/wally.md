---
title: Wally
sidebar_label: Wally
description: Configure Wally open-weight models in promptfoo using the OpenAI-compatible provider, with explicit API key selection, reasoning effort, and output limits.
---

# Wally

[Wally](https://www.runwally.com) serves open-weight models through an [OpenAI-compatible API](https://docs.runanywhere.ai/wally-cloud/api). Use promptfoo's [OpenAI provider](/docs/providers/openai/) with Wally's endpoint and API key.

## Setup

Create a key in the [RunAnywhere console](https://console.runanywhere.ai) and set `WALLY_API_KEY` in your shell, or load it from a file with `--env-file`.

```yaml
providers:
  - id: openai:chat:deepseek-v4.1-flash
    config:
      apiBaseUrl: https://inference.runanywhere.ai/v1
      apiKeyEnvar: WALLY_API_KEY
      headers:
        OpenAI-Organization: ''
      omitDefaults: true
      temperature: 0
      max_tokens: 4096
      showThinking: false
      passthrough:
        reasoning_effort: low
```

`apiBaseUrl` overrides OpenAI endpoint environment variables. `apiKeyEnvar` selects only `WALLY_API_KEY`; a missing key does not fall back to `OPENAI_API_KEY`. The empty `OpenAI-Organization` header overrides any inherited `OPENAI_ORGANIZATION` value.

## Configuration

- `omitDefaults: true` omits promptfoo's default output limit and temperature. Explicit settings and `OPENAI_MAX_TOKENS` / `OPENAI_TEMPERATURE` still apply; the example sets `temperature: 0` explicitly.
- Use `max_tokens` to cap output, including reasoning tokens. Increase it if reasoning consumes the budget before an answer appears.
- All Wally models are reasoning models. Put `reasoning_effort` under `passthrough` to send it regardless of model-name detection. DeepSeek and Kimi models accept `none` to turn reasoning off; GLM models accept `low`, `high`, or `max`.
- `showThinking: false` excludes reasoning text from the answer used by assertions.

Check `GET https://inference.runanywhere.ai/v1/models` for current model IDs, and [pricing](https://www.runwally.com/pricing) for current rates.

## Example

The [provider-wally example](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-wally) compares two chat models with the same API key.
