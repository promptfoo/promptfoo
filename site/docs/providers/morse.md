---
title: Morse
sidebar_label: Morse
description: Evaluate open-weight models on Morse's private OpenAI-compatible API in promptfoo, setting a privacy tier per request through the built-in OpenAI provider.
sidebar_position: 42
---

# Morse

[Morse](https://trymorse.ai/inference?src=gh-promptfoo) is a private, OpenAI-compatible inference API for 80+ open-weight models. Each request runs at a privacy tier you choose per request or per API key (Private, TEE or E2EE), and a request no endpoint can meet is refused rather than sent to a lower tier. Its enclave is open source and attestable ([morse-enclave](https://github.com/trymorse/morse-enclave)). Use promptfoo's [OpenAI provider](/docs/providers/openai/) with Morse's endpoint and key.

Morse documents its data handling in its [privacy policy](https://trymorse.ai/privacy-policy?src=gh-promptfoo).

## Setup

Create a key in the [Morse console](https://console.trymorse.ai) and set `MORSE_API_KEY` in your shell, or load it from a file with `--env-file`.

```yaml
providers:
  - id: openai:chat:z-ai/glm-5.3-flash
    config:
      apiBaseUrl: https://inference.trymorse.ai/v1
      apiKeyEnvar: MORSE_API_KEY
      headers:
        OpenAI-Organization: ''
      omitDefaults: true
      max_tokens: 4096
      showThinking: false
```

`apiBaseUrl` overrides OpenAI endpoint environment variables, `apiKeyEnvar` reads the key from `MORSE_API_KEY`, and the empty `OpenAI-Organization` header clears any inherited `OPENAI_ORGANIZATION` value.

## Configuration

- Model IDs are `lab/model`. List them with `GET https://inference.trymorse.ai/v1/models` (with your key) or on the [models page](https://trymorse.ai/inference/models?src=gh-promptfoo), which also has prices.
- `omitDefaults: true` lets each model's own defaults apply; set `temperature` or `max_tokens` in `config` when you want them.
- Reasoning models return their reasoning in `reasoning_content`; `showThinking: false` keeps it out of the answer your assertions see.
- Set a privacy floor per API key in the console, or per request as described in the [Morse API docs](https://trymorse.ai/inference/docs?src=gh-promptfoo).

## Comparing models

```yaml
providers:
  - id: openai:chat:z-ai/glm-5.3-flash
    label: glm-5.3-flash
    config: &morse
      apiBaseUrl: https://inference.trymorse.ai/v1
      apiKeyEnvar: MORSE_API_KEY
      headers:
        OpenAI-Organization: ''
      omitDefaults: true
  - id: openai:chat:deepseek/deepseek-v4.1-flash
    label: deepseek-v4.1-flash
    config: *morse
```
