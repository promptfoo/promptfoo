---
title: AI Stupid Level
sidebar_label: AI Stupid Level
description: Evaluate AI Stupid Level's benchmark-based routing modes in promptfoo with the OpenAI-compatible provider, using your own provider keys and a single router key.
sidebar_position: 42
---

# AI Stupid Level

[AI Stupid Level](https://aistupidlevel.info) runs coding, reasoning and tool-use benchmarks on the major models continuously. Its Smart Router is an [OpenAI-compatible API](https://aistupidlevel.info/router/docs) that sends each request to the model that currently scores best for the kind of work. Use promptfoo's [OpenAI provider](/docs/providers/openai/) with the router's endpoint and your router key.

The router calls providers (OpenAI, Anthropic, Google, DeepSeek, Moonshot, Zhipu) with the provider keys you add to your AI Stupid Level account, so each provider bills you directly. Prompt logging is off by default. See the [privacy policy](https://aistupidlevel.info/privacy) and [terms of service](https://aistupidlevel.info/terms).

## Setup

Create a router key at [aistupidlevel.info/router/keys](https://aistupidlevel.info/router/keys), add at least one provider key, and set `ASL_ROUTER_KEY` in your shell, or load it from a file with `--env-file`.

```yaml
providers:
  - id: openai:chat:auto-coding
    config:
      apiBaseUrl: https://aistupidlevel.info/v1
      apiKeyEnvar: ASL_ROUTER_KEY
      headers:
        OpenAI-Organization: ''
      omitDefaults: true
      max_tokens: 4096
      showThinking: false
```

`apiKeyEnvar` selects only `ASL_ROUTER_KEY`; a missing key does not fall back to `OPENAI_API_KEY`. The empty `OpenAI-Organization` header overrides any inherited `OPENAI_ORGANIZATION` value.

## Model IDs

The model ID is a routing mode, or a real model ID to pin one model:

| Model ID                                        | Routes to                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| `auto-coding`, `auto-reasoning`, `auto-tooling` | The model with the top score on that benchmark                       |
| `auto-best`                                     | The highest combined score                                           |
| `auto-value`, `auto-value-coding`               | The most benchmark points per measured dollar, among near-top models |
| `auto-fastest-quality`                          | The fastest model within 5 points of the best                        |
| `claude-opus-5-5`, `gpt-6-sol`, ...             | That model, without routing                                          |

`GET https://aistupidlevel.info/v1/models` lists every routing mode and model ID. The response's `model` field is the model that answered.

## Configuration

- `omitDefaults: true` leaves out promptfoo's default output limit and temperature, so each routed model uses its own defaults.
- `max_tokens` caps output, including reasoning tokens on reasoning models.
- `showThinking: false` keeps reasoning text out of the answer used by assertions.
- Tool calling (`tools`, `tool_choice`) and `response_format` work as with OpenAI. A multi-turn tool loop stays on the model that started it.

## Testing without spending

Add `X-ASL-Sandbox: 'true'` to `headers` to check a configuration: the router runs its real routing and returns a mock answer without calling any provider, and the request does not count against your plan.

## Example

The [provider-aistupidlevel example](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-aistupidlevel) compares three routing modes (`auto-coding`, `auto-value-coding` and `auto-fastest-quality`) on the same prompts.
