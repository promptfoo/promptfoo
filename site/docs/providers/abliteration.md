---
title: Abliteration Provider
sidebar_label: Abliteration
description: "Evaluate Abliteration's GLM-5.3-based Large V2 model with Promptfoo. Set API keys, reasoning effort, tool calling, structured outputs, and text-only inputs."
sidebar_position: 85
---

# Abliteration

[Abliteration](https://abliteration.ai/) is a third-party service that hosts
**"abliterated"** models - open-weight LLMs where the refusal direction has
been removed from the residual stream so the model no longer declines
requests it would ordinarily refuse. It exposes an OpenAI-compatible chat
completions API, and Promptfoo ships a thin `abliteration:` wrapper around the
[OpenAI provider](/docs/providers/openai/) for it.

:::warning Safety

Abliterated models intentionally bypass the safety training of their base
models. They are primarily useful for red-teaming, jailbreak evaluation, and
safety research - not for production traffic. You are responsible for how
outputs are used and for complying with the model licenses and laws that
apply in your jurisdiction.

:::

## Setup

1. Obtain an API key from the [Abliteration console](https://abliteration.ai/console).
2. Set the `ABLIT_KEY` environment variable, or pass `apiKey` in your
   provider config.

## Environment Variables

| Variable             | Description                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `ABLIT_KEY`          | API key sent as the bearer token. Required unless `apiKey` is set in the provider config. |
| `ABLIT_API_BASE_URL` | Override for the chat-completions base URL. Defaults to `https://api.abliteration.ai/v1`. |

Provider config values take precedence over environment variables.

## Models

| Model ID                     | Input               | Context window   |
| ---------------------------- | ------------------- | ---------------- |
| `abliterated-model-large-v2` | Text                | 1,000,000 tokens |
| `abliterated-model-large`    | Text                | 1,000,000 tokens |
| `abliterated-model`          | Text, images, video | 262,144 tokens   |

Large V2 is based on GLM-5.3. Both large models reject image and video inputs;
use `abliterated-model` for multimodal evals. See Abliteration's
[model reference](https://docs.abliteration.ai/models) for current capabilities.

## Basic Configuration

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - '{{question}}'

providers:
  - id: abliteration:abliterated-model-large-v2
    config:
      reasoning_effort: low
      max_tokens: 16384

tests:
  - vars:
      question: 'Which CWE describes SQL injection? Return only the CWE identifier.'
    assert:
      - type: equals
        value: CWE-89
```

`abliteration:<model>` is the default syntax;
`abliteration:chat:<model>` is also supported.

## Reasoning

Set `reasoning_effort` to `low`, `high`, or `max` for Large V2. It defaults to
`max` when no effort is supplied. Use an explicit `max_tokens` budget for
reasoning workloads, as in the example above.

Large V2 always reasons: `reasoning_effort: none` selects low effort and hides
the reasoning trace. The base model and previous large model can disable
reasoning with `none`. See the
[reasoning guide](https://docs.abliteration.ai/capabilities/thinking) for the
other accepted effort aliases and their model-specific behavior.

Promptfoo excludes `reasoning_content` from the graded output by default. Set
`showThinking: true` to include it. This controls output display; it does not
change the model's reasoning effort. To ask the API to omit the trace, use:

```yaml
config:
  reasoning_effort: low
  passthrough:
    include_reasoning: false
```

## OpenAI Compatibility

Abliteration speaks the OpenAI chat-completions protocol, so most options
from the [OpenAI provider](/docs/providers/openai/) work here too, including
sampling options, tool calling, and structured output. Multimodal messages
require `abliterated-model`.

## Multimodal Example

This example uses the base model because Large V2 accepts text only.

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
