---
title: Abliteration Provider
sidebar_label: Abliteration
description: "Configure Abliteration's OpenAI-compatible chat API in Promptfoo for text, vision, and structured-output evals."
sidebar_position: 5
---

# Abliteration

[Abliteration](https://abliteration.ai/) exposes an OpenAI-compatible chat completions API, so Promptfoo can use it through a dedicated `abliteration:` provider.

## Setup

1. Get an API key from Abliteration.
2. Set the `ABLIT_KEY` environment variable or provide `apiKey` in your provider config.

You can override the API base URL with `ABLIT_API_BASE_URL` or `config.apiBaseUrl`.

## Basic Configuration

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: abliteration:abliterated-model
    config:
      temperature: 0.2
      max_tokens: 512
```

`abliteration:<model>` is the default syntax. `abliteration:chat:<model>` is also supported.

## OpenAI Compatibility

Abliteration uses the same request shape as OpenAI chat completions. Common options from the [OpenAI provider](/docs/providers/openai/) work here too, including `temperature`, `max_tokens`, `response_format`, and multimodal message content.

Abliteration responses can include `reasoning_content`. Promptfoo hides this by default so eval outputs contain only the final answer. Set `showThinking: true` in the provider config if you want to include reasoning content in outputs.

## Multimodal Example

```json title="prompt.json"
[
  {
    "role": "user",
    "content": [
      { "type": "text", "text": "{{question}}" },
      {
        "type": "image_url",
        "image_url": { "url": "https://abliteration.ai/stonehenge.jpg" }
      }
    ]
  }
]
```

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - file://prompt.json

providers:
  - id: abliteration:abliterated-model

tests:
  - vars:
      question: "What's in this image?"
    assert:
      - type: icontains
        value: stonehenge
```
