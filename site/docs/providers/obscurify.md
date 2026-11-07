---
title: Obscurify.ai
sidebar_label: Obscurify.ai
description: Configure Obscurify.ai chat models in Promptfoo with the OpenAI-compatible provider, a dedicated API key variable, reasoning effort, and output token limits.
---

# Obscurify.ai

[Obscurify.ai](https://obscurify.ai/?utm_source=promptfoo) is a privacy-focused AI provider with an [OpenAI-compatible API](https://obscurify.ai/api-docs). Use Promptfoo's [OpenAI provider](/docs/providers/openai/) with Obscurify.ai's endpoint and API key.

Accounts are a random account number with no email. Prompts and responses are not stored, and requests only use zero-data-retention routes. See the [privacy policy](https://obscurify.ai/privacy) and [terms](https://obscurify.ai/terms).

## Setup

Create an account on [obscurify.ai](https://obscurify.ai/?utm_source=promptfoo), click **Show API Key** on the account page, and set `OBSCURIFY_API_KEY` in your shell, or load it from a file with `--env-file`. The API works on every plan with a positive balance.

```yaml
providers:
  - id: openai:chat:deepseek/deepseek-v4-flash
    config:
      apiBaseUrl: https://obscurify.ai/v1
      apiKeyEnvar: OBSCURIFY_API_KEY
      headers:
        OpenAI-Organization: ''
      omitDefaults: true
      temperature: 0
      max_tokens: 2048
      showThinking: false
      passthrough:
        reasoning_effort: high
```

`apiBaseUrl` overrides OpenAI endpoint environment variables. `apiKeyEnvar` selects only `OBSCURIFY_API_KEY`; a missing key does not fall back to `OPENAI_API_KEY`. The empty `OpenAI-Organization` header overrides any inherited `OPENAI_ORGANIZATION` value.

## Configuration

- Model IDs use the `<lab>/<model>` form, for example `deepseek/deepseek-v4-flash`, `z-ai/glm-5.3` or `meta-llama/llama-3.3-70b-instruct`. `GET https://obscurify.ai/v1/models` lists the current IDs, context lengths and prices; the [model list](https://obscurify.ai/model_cards) shows the plan each model needs.
- `omitDefaults: true` omits Promptfoo's default output limit and temperature. Explicit settings and `OPENAI_MAX_TOKENS` / `OPENAI_TEMPERATURE` still apply.
- Use `max_tokens` to cap output, including reasoning tokens. Increase it if reasoning uses up the budget before an answer appears.
- Put `reasoning_effort` under `passthrough` to send it regardless of model-name detection. The accepted levels depend on the model; an unsupported level returns a 400 error.
- `showThinking: false` excludes reasoning text from the answer used by assertions.
- Tool calling works through the same endpoint on models that support tools; pass `tools` in the provider config as with the OpenAI provider.
