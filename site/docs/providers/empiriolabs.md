---
title: EmpirioLabs
description: Connect promptfoo to EmpirioLabs' OpenAI-compatible chat and embedding APIs, configure credential isolation, and evaluate routed models with test cases.
sidebar_position: 42
---

# EmpirioLabs

[EmpirioLabs](https://empiriolabs.ai/) exposes OpenAI-compatible chat, Responses, and embedding
endpoints for models from multiple families. Promptfoo connects to those endpoints through its
existing [OpenAI provider](/docs/providers/openai/) with a custom base URL; there is no separate
`empiriolabs:` provider prefix.

## Setup

1. Create an API key in the
   [EmpirioLabs dashboard](https://platform.empiriolabs.ai/dashboard/api-keys).
2. Export it as `EMPIRIOLABS_API_KEY`:

   ```bash
   export EMPIRIOLABS_API_KEY=your_api_key_here
   ```

## Chat completions

Use `https://api.empiriolabs.ai/v1` as the API root. Promptfoo appends
`/chat/completions` for `openai:chat` providers.

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Compare EmpirioLabs chat models

prompts:
  - 'Answer in one sentence: {{question}}'

providers:
  - id: openai:chat:qwen3-7-plus
    label: Qwen 3.7 Plus via EmpirioLabs
    config:
      apiBaseUrl: https://api.empiriolabs.ai/v1
      apiKeyEnvar: EMPIRIOLABS_API_KEY
      max_tokens: 1000

  - id: openai:chat:deepseek-v4-flash
    label: DeepSeek V4 Flash via EmpirioLabs
    config:
      apiBaseUrl: https://api.empiriolabs.ai/v1
      apiKeyEnvar: EMPIRIOLABS_API_KEY
      max_tokens: 1000

tests:
  - vars:
      question: What is the time complexity of binary search?
    assert:
      - type: icontains
        value: log
```

Setting `apiKeyEnvar` keeps EmpirioLabs authentication separate from `OPENAI_API_KEY`. The explicit
`apiBaseUrl` also takes precedence over OpenAI endpoint environment variables, so an unrelated
OpenAI proxy cannot redirect these requests.

## Embeddings

Use EmpirioLabs embeddings as the provider for similarity assertions:

```yaml
defaultTest:
  options:
    provider:
      embedding:
        id: openai:embedding:text-embedding-v4
        config:
          apiBaseUrl: https://api.empiriolabs.ai/v1
          apiKeyEnvar: EMPIRIOLABS_API_KEY
          passthrough:
            dimensions: 1024

tests:
  - assert:
      - type: similar
        value: The expected answer
        threshold: 0.8
```

Promptfoo sends this provider to `/v1/embeddings`. Check the selected model's documentation before
setting `dimensions` or other model-specific fields.

## Transcription

EmpirioLabs exposes OpenAI-compatible audio transcription. Use the `openai:transcription:<model>`
provider format with the EmpirioLabs base URL, and pass the path to an audio file as the prompt:

```yaml title="promptfooconfig.yaml"
prompts:
  - file://sample-audio.mp3

providers:
  - id: openai:transcription:whisper-large-v3-turbo
    config:
      apiBaseUrl: https://api.empiriolabs.ai/v1
      apiKeyEnvar: EMPIRIOLABS_API_KEY

  - id: openai:transcription:openai-whisper-1
    config:
      apiBaseUrl: https://api.empiriolabs.ai/v1
      apiKeyEnvar: EMPIRIOLABS_API_KEY

  - id: openai:transcription:deepgram-nova-3
    config:
      apiBaseUrl: https://api.empiriolabs.ai/v1
      apiKeyEnvar: EMPIRIOLABS_API_KEY

tests:
  - assert:
      - type: contains
        value: expected transcript content
```

Promptfoo sends this provider to `/v1/audio/transcriptions`. Transcription models charge per minute
of audio, so confirm the current rate with `GET https://api.empiriolabs.ai/v1/models/<model>` before
using cost as a release gate.

## Model-specific request fields

EmpirioLabs models expose different reasoning and tool controls. Use `passthrough` for fields that
are not part of Promptfoo's shared OpenAI configuration, and only send fields listed for the exact
model. For example, DeepSeek V4 Flash accepts `reasoning_effort`:

```yaml
providers:
  - id: openai:chat:deepseek-v4-flash
    config:
      apiBaseUrl: https://api.empiriolabs.ai/v1
      apiKeyEnvar: EMPIRIOLABS_API_KEY
      passthrough:
        reasoning_effort: low
```

## Cost estimates

EmpirioLabs publishes live per-model pricing through its model catalog. Promptfoo accepts per-token
overrides for model IDs that are not in its built-in OpenAI pricing table:

```yaml
providers:
  - id: openai:chat:deepseek-v4-flash
    config:
      apiBaseUrl: https://api.empiriolabs.ai/v1
      apiKeyEnvar: EMPIRIOLABS_API_KEY
      inputCost: 0.00000014
      outputCost: 0.00000028
```

The values above correspond to $0.14 input and $0.28 output per million tokens. Verify current rates
with `GET https://api.empiriolabs.ai/v1/models/deepseek-v4-flash` before using cost as a release
gate.

## Example

Initialize the runnable example:

```bash
npx promptfoo@latest init --example provider-empiriolabs
cd provider-empiriolabs
npx promptfoo@latest eval --no-cache
```

## Additional resources

- [EmpirioLabs API documentation](https://docs.empiriolabs.ai/welcome)
- [EmpirioLabs model catalog](https://empiriolabs.ai/models)
- [EmpirioLabs privacy policy](https://empiriolabs.ai/policy/privacy-policy)
- [EmpirioLabs terms of service](https://empiriolabs.ai/policy/terms-of-service)
- [OpenAI provider configuration](/docs/providers/openai/)
