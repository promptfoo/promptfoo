---
title: HopBase
sidebar_label: HopBase
description: Configure HopBase in promptfoo with the OpenAI-compatible and Anthropic Messages providers to compare GPT, Claude, GLM, and other models from one base URL.
sidebar_position: 42
---

# HopBase

[HopBase](https://hop-base.com) is an API gateway that serves GPT, Claude, Gemini, Grok, DeepSeek, GLM, Kimi, Qwen, and Doubao models from one base URL. It exposes an OpenAI-compatible API at `https://api.hop-base.com/v1` and an Anthropic Messages-compatible API at `https://api.hop-base.com`. Use promptfoo's [OpenAI provider](/docs/providers/openai/) or [Anthropic provider](/docs/providers/anthropic/) with a HopBase endpoint and API key.

## Setup

Create a key in the [HopBase console](https://api.hop-base.com/login) and set `HOPBASE_API_KEY` in your shell, or load it from a file with `--env-file`.

```yaml
providers:
  - id: openai:chat:gpt-6.1-sol
    config:
      apiBaseUrl: https://api.hop-base.com/v1
      apiKeyEnvar: HOPBASE_API_KEY
      headers:
        OpenAI-Organization: ''
      omitDefaults: true
      max_completion_tokens: 512
```

`apiKeyEnvar` selects only `HOPBASE_API_KEY`; a missing key does not fall back to `OPENAI_API_KEY`. The empty `OpenAI-Organization` header overrides any inherited `OPENAI_ORGANIZATION` value.

Each key includes one or more model groups. `GET https://api.hop-base.com/v1/models` returns the model IDs that your key can call; use those IDs after `openai:chat:`. See the [model list](https://hop-base.com/models) and [documentation](https://hop-base.com/en/docs) for details.

## Comparing models

Claude models also answer on the OpenAI-compatible endpoint, so one provider syntax covers every model. List several models to run the same prompts and assertions against each:

```yaml
providers:
  - id: openai:chat:gpt-6.1-sol
    config:
      apiBaseUrl: https://api.hop-base.com/v1
      apiKeyEnvar: HOPBASE_API_KEY
      headers:
        OpenAI-Organization: ''
      omitDefaults: true
      max_completion_tokens: 512
  - id: openai:chat:glm-5.3
    config:
      apiBaseUrl: https://api.hop-base.com/v1
      apiKeyEnvar: HOPBASE_API_KEY
      headers:
        OpenAI-Organization: ''
      omitDefaults: true
      max_tokens: 1024
      showThinking: false
  - id: openai:chat:claude-sonnet-5-5
    config:
      apiBaseUrl: https://api.hop-base.com/v1
      apiKeyEnvar: HOPBASE_API_KEY
      headers:
        OpenAI-Organization: ''
      omitDefaults: true
      max_tokens: 512
```

promptfoo treats GPT-5 and later model IDs as reasoning models and sends `max_completion_tokens` instead of `max_tokens`, so set the limit for `gpt-6.1-sol` with `max_completion_tokens`.

`glm-5.3` is also a reasoning model, but promptfoo does not detect it by name and sends `max_tokens`. Reasoning tokens count toward `max_tokens`, so a small limit can return an empty answer; keep it at 300 or more. `showThinking: false` excludes reasoning text from the answer used by assertions.

## Anthropic Messages API

To test Claude models through the native Messages API, set `apiBaseUrl` on the Anthropic provider. The base URL has no `/v1` suffix:

```yaml
providers:
  - id: anthropic:messages:claude-sonnet-5-5
    env:
      ANTHROPIC_CUSTOM_HEADERS: ''
    config:
      apiBaseUrl: https://api.hop-base.com
      apiKeyEnvar: HOPBASE_API_KEY
      max_tokens: 512
      thinking:
        type: between_tools
      showThinking: false
```

The empty `ANTHROPIC_CUSTOM_HEADERS` value keeps headers meant for another Anthropic endpoint out of HopBase requests. Claude Sonnet 5.5 thinks by default, and thinking tokens count toward `max_tokens`. `thinking: { type: between_tools }` skips up-front thinking for short, tool-free answers; to keep thinking on, remove it and raise `max_tokens`. `showThinking: false` excludes thinking text from the answer used by assertions.

## Grading

Model-graded assertions such as `llm-rubric` use OpenAI by default. To grade with a HopBase model, [set the grader](/docs/configuration/expected-outputs/model-graded/#overriding-the-llm-grader) in `defaultTest.options.provider`:

```yaml
defaultTest:
  options:
    provider:
      id: openai:chat:gpt-6.1-sol
      config:
        apiBaseUrl: https://api.hop-base.com/v1
        apiKeyEnvar: HOPBASE_API_KEY
        headers:
          OpenAI-Organization: ''
        omitDefaults: true
        max_completion_tokens: 1024
```

HopBase has no embeddings endpoint. For `similar` assertions, configure an embedding provider from another service.

## Example

The [provider-hopbase example](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-hopbase) compares GPT-6.1 Sol, GLM-5.3, and Claude Sonnet 5.5 and grades answers with a HopBase model using the same API key.
