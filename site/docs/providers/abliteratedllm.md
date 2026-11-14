---
title: AbliteratedLLM
sidebar_label: AbliteratedLLM
description: Configure AbliteratedLLM abliterated and stock open-weight models in promptfoo using the OpenAI-compatible provider, with reasoning settings and token limits.
---

# AbliteratedLLM

[AbliteratedLLM](https://abliteratedllm.dev) serves abliterated and stock open-weight models through an [OpenAI-compatible API](https://abliteratedllm.dev/docs/chat-completions). Use promptfoo's [OpenAI provider](/docs/providers/openai/) with AbliteratedLLM's endpoint and API key.

AbliteratedLLM documents its data handling in its [privacy policy](https://abliteratedllm.dev/privacy) and [terms of service](https://abliteratedllm.dev/terms).

:::warning

Abliterated models have refusal behavior removed from their weights, so they generally answer requests that the stock model would refuse. Stock models keep the vendor's original weights. Review outputs before using them in applications, and follow the applicable model licenses. Do not rely on an abliterated model to decline unsafe requests: add safeguards outside the model and test them with [red teaming](/docs/red-team/quickstart/) and assertions such as [`moderation`](/docs/configuration/expected-outputs/moderation/) and [`is-refusal`](/docs/configuration/expected-outputs/deterministic#is-refusal).

:::

## Setup

Create a key on the [API keys page](https://abliteratedllm.dev/dashboard/keys) and set `ABLITERATEDLLM_API_KEY` in your shell, or load it from a file with `--env-file`.

```yaml
providers:
  - id: openai:chat:glm-5.3-flash-abliterated
    config:
      apiBaseUrl: https://api.abliteratedllm.dev/v1
      apiKeyEnvar: ABLITERATEDLLM_API_KEY
      headers:
        OpenAI-Organization: ''
      omitDefaults: true
      max_tokens: 2048
      showThinking: false
      passthrough:
        reasoning_effort: low
```

`apiBaseUrl` overrides OpenAI endpoint environment variables. `apiKeyEnvar` selects only `ABLITERATEDLLM_API_KEY`; a missing key does not fall back to `OPENAI_API_KEY`. The empty `OpenAI-Organization` header overrides any inherited `OPENAI_ORGANIZATION` value.

## Configuration

- `omitDefaults: true` omits promptfoo's default output limit and temperature. Explicit settings and `OPENAI_MAX_TOKENS` / `OPENAI_TEMPERATURE` still apply.
- Use `max_tokens` to cap output, including reasoning tokens. Every AbliteratedLLM model reasons; increase the limit if reasoning consumes the budget before an answer appears.
- Put `reasoning_effort` (`low`, `medium`, or `high`) under `passthrough` to send it to AbliteratedLLM regardless of model-name detection.
- `showThinking: false` stops the separate `reasoning_content` field from being prepended to the answer used by assertions. It doesn't remove reasoning that a model writes into `content` itself, which the abliterated model sometimes does at low effort. Use assertions that check the final answer, not just a substring.
- Trial accounts run one request at a time and cap output at 4,096 tokens. Use `--max-concurrency 1` with a trial key. See [rate limits](https://abliteratedllm.dev/docs/rate-limits).

Check the [models reference](https://abliteratedllm.dev/docs/models) or `GET https://api.abliteratedllm.dev/v1/models`, which needs no API key, for current model IDs, context limits, and input modalities. See [pricing](https://abliteratedllm.dev/pricing) for current rates.

## Example

The [provider-abliteratedllm example](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-abliteratedllm) compares GLM-5.3 Flash Abliterated with the stock GLM-5.3 Flash using the same API key.
