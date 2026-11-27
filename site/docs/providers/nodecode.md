---
title: Nodecode
sidebar_label: Nodecode
description: Configure Nodecode's Cyber v1 security model in promptfoo with the OpenAI-compatible provider, including reasoning effort, token limits, and a runnable example.
---

# Nodecode

[Nodecode](https://nodecode.ai) serves [Cyber v1](https://nodecode.ai/cyber) (`nodecode-cyber-v1`), a DeepSeek V4.1 Flash derivative for security work such as pentesting, red teaming, and exploit development, through an [OpenAI-compatible API](https://nodecode.ai/docs/cyber). Use promptfoo's [OpenAI provider](/docs/providers/openai/) with Nodecode's endpoint and API key.

:::warning

Cyber v1 is modified to refuse fewer security requests than its base model. Review outputs before using them in applications.

:::

Nodecode is run by Foresight Labs, a Dutch company. Its [privacy policy](https://nodecode.ai/privacy) states that API prompts and outputs are not stored, logged, or used for training; see also the [terms of service](https://nodecode.ai/terms).

## Setup

Create a key at [nodecode.ai/account/keys](https://nodecode.ai/account/keys) and set `NODECODE_API_KEY` in your shell, or load it from a file with `--env-file`.

```yaml
providers:
  - id: openai:chat:nodecode-cyber-v1
    config:
      apiBaseUrl: https://api.nodecode.ai/v1
      apiKeyEnvar: NODECODE_API_KEY
      headers:
        OpenAI-Organization: ''
      omitDefaults: true
      temperature: 0
      max_tokens: 300
      showThinking: false
      passthrough:
        reasoning_effort: low
```

`apiBaseUrl` overrides OpenAI endpoint environment variables. `apiKeyEnvar` selects only `NODECODE_API_KEY`; a missing key does not fall back to `OPENAI_API_KEY`. The empty `OpenAI-Organization` header overrides any inherited `OPENAI_ORGANIZATION` value.

## Configuration

- Cyber v1 is a reasoning model, and `max_tokens` covers its reasoning tokens as well as the answer. A response that runs out of budget comes back with empty content and `finish_reason: length`. The 300 above suits short answers; raise it for longer tasks (up to 131,072 output tokens).
- Put `reasoning_effort` under `passthrough` to send it to Nodecode regardless of model-name detection. `low` keeps reasoning short, and `none` turns it off.
- `showThinking: false` excludes reasoning text from the answer used by assertions.
- The context window is 1,048,576 tokens. See [pricing](https://nodecode.ai/docs/pricing) for current rates.

`GET https://api.nodecode.ai/v1/models` lists the available model IDs. Nodecode has no embeddings endpoint, so use another provider for [similarity assertions](/docs/configuration/expected-outputs/similar/).

## Example

The [provider-nodecode example](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-nodecode) asks Cyber v1 two short security questions and checks the answers with string assertions.
