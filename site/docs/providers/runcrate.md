---
title: Runcrate
sidebar_label: Runcrate
description: Configure Runcrate's open models in promptfoo using the OpenAI-compatible provider, with a live model list and token limits that cover reasoning.
---

# Runcrate

[Runcrate](https://runcrate.ai) is an AI cloud for developers and their agents. It serves open models through an OpenAI-compatible API at `https://api.runcrate.ai/v1`. Use promptfoo's [OpenAI provider](/docs/providers/openai/) with Runcrate's endpoint and API key.

## Setup

Create an API key in your Runcrate account (see the [Runcrate docs](https://www.runcrate.ai/docs)) and set `RUNCRATE_API_KEY` in your shell, or load it from a file with `--env-file`.

```yaml
providers:
  - id: openai:chat:deepseek-ai/DeepSeek-V4.1-Flash
    config:
      apiBaseUrl: https://api.runcrate.ai/v1
      apiKeyEnvar: RUNCRATE_API_KEY
      headers:
        OpenAI-Organization: ''
      temperature: 0
      max_tokens: 1024
      showThinking: false
```

`apiBaseUrl` overrides OpenAI endpoint environment variables. `apiKeyEnvar` selects only `RUNCRATE_API_KEY`; a missing key does not fall back to `OPENAI_API_KEY`. The empty `OpenAI-Organization` header overrides any inherited `OPENAI_ORGANIZATION` value.

## Configuration

- Use the model ID exactly as Runcrate lists it after `openai:chat:`, including the namespace, as in `deepseek-ai/DeepSeek-V4.1-Flash`.
- Reasoning models spend part of `max_tokens` on reasoning before the answer. Increase it if an answer comes back empty or cut short.
- `showThinking: false` keeps reasoning text out of the answer used by assertions.

## Finding model IDs

`GET https://api.runcrate.ai/v1/models` lists the current model IDs and needs no API key. Each entry has a `supported_features` array. Models that list `tools` can be used in tests that call tools.

```bash
curl https://api.runcrate.ai/v1/models
```

## Example

The [provider-runcrate example](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-runcrate) compares two chat models on the same prompt with a single `RUNCRATE_API_KEY`.
