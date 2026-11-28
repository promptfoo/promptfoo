---
title: Oathbreaker
sidebar_label: Oathbreaker
description: Configure Oathbreaker's abliterated GLM, DeepSeek and Kimi models in promptfoo using the OpenAI-compatible provider, with reasoning effort and output limits.
---

# Oathbreaker

[Oathbreaker](https://oathbreaker.ai) serves abliterated versions of open-weight models through an [OpenAI-compatible API](https://oathbreaker.ai/docs). Use promptfoo's [OpenAI provider](/docs/providers/openai/) with Oathbreaker's endpoint and API key.

Oathbreaker is operated by Formacha LLC and documents its data handling in its [privacy policy](https://oathbreaker.ai/privacy) and [terms of service](https://oathbreaker.ai/terms).

:::warning

Abliterated models have had their refusal behavior weakened. Review outputs before using them in an application, and follow the model licenses and Oathbreaker's terms.

:::

## Setup

Create an API key and add prepaid credit in the [Oathbreaker console](https://oathbreaker.ai). Set `OATHBREAKER_API_KEY` in your shell, or load it from a file with `--env-file`.

```yaml
providers:
  - id: openai:chat:oathbreaker-glm-5.3-flash
    config:
      apiBaseUrl: https://oathbreaker.ai/v1
      apiKeyEnvar: OATHBREAKER_API_KEY
      headers:
        OpenAI-Organization: ''
      temperature: 0
      max_tokens: 4096
      showThinking: false
      passthrough:
        reasoning_effort: low
```

`apiBaseUrl` overrides OpenAI endpoint environment variables; change it if you route requests through your own gateway. `apiKeyEnvar` selects only `OATHBREAKER_API_KEY`; a missing key does not fall back to `OPENAI_API_KEY`. The empty `OpenAI-Organization` header overrides any inherited `OPENAI_ORGANIZATION` value.

## Models

| Model ID                               | Model                                         | Max output tokens |
| -------------------------------------- | --------------------------------------------- | ----------------- |
| `oathbreaker-glm-5.3`                  | GLM-5.3 Abliterated                           | 32,768            |
| `oathbreaker-glm-5.3-flash`            | GLM-5.3 Flash Abliterated                     | 32,768            |
| `oathbreaker-deepseek-v4.1-flash`      | DeepSeek V4.1 Flash Abliterated               | 32,768            |
| `oathbreaker-deepseek-v4.1-flash-fast` | DeepSeek V4.1 Flash Abliterated, faster route | 32,768            |
| `oathbreaker-kimi-k3.1-pro`            | Kimi K3.1 Pro Abliterated                     | 24,576            |

All models take text input, reason before answering, and support tool calling. Reasoning tokens count toward the output limit.

The GLM models have a 131,072-token context window shared by input and requested output. The DeepSeek and Kimi models admit requests against a 131,072-unit budget that counts UTF-8 input bytes, message framing and requested output tokens. A token is usually several bytes, so plan for about 32,768 tokens of input on those models.

Check the [API reference](https://oathbreaker.ai/docs) or `GET https://oathbreaker.ai/v1/models` for current model IDs and limits, and [pricing](https://oathbreaker.ai/pricing) for current rates.

## Configuration

- Put `reasoning_effort` under `passthrough` so it is sent regardless of model-name detection. Oathbreaker accepts `low`, `high` and `max`. GLM and Kimi use `low` when the field is omitted.
- Use `max_tokens` to cap output, including reasoning. A value above a model's maximum is lowered to that maximum. Increase it if reasoning uses the budget before an answer appears.
- `showThinking: false` excludes the `reasoning_content` trace from the answer used by assertions.
- Oathbreaker rejects requests that contain unsupported top-level fields with HTTP 400 before any credit is reserved. It accepts `temperature`, `top_p`, `max_tokens` or `max_completion_tokens` (not both), `reasoning_effort`, `response_format`, `tools`, `tool_choice` and `parallel_tool_calls`. Don't set `seed`, `stop`, `presence_penalty`, `frequency_penalty`, `user` or `metadata`, or the `OPENAI_PRESENCE_PENALTY` and `OPENAI_FREQUENCY_PENALTY` environment variables. Assertions that need log probabilities, such as `perplexity`, are not supported.
- Tool definitions use the same `tools` and `tool_choice` configuration as the [OpenAI provider](/docs/providers/openai/#using-tools). If you receive HTTP 429, lower `--max-concurrency`.

## Red teaming

To generate [red team](/docs/red-team/) test cases with an Oathbreaker model instead of promptfoo's remote generation service, set it as the red team provider and set `PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION=true`. See [changing the model](/docs/red-team/configuration/#changing-the-model) for details.

```yaml
redteam:
  provider:
    id: openai:chat:oathbreaker-glm-5.3
    config:
      apiBaseUrl: https://oathbreaker.ai/v1
      apiKeyEnvar: OATHBREAKER_API_KEY
      headers:
        OpenAI-Organization: ''
      max_tokens: 8192
      showThinking: false
      passthrough:
        reasoning_effort: low
```

Only test applications you own or have written permission to test. Oathbreaker's terms limit security testing to such systems, and you remain responsible for complying with applicable law.

## Example

The [provider-oathbreaker example](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-oathbreaker) compares two Oathbreaker models with the same API key.
