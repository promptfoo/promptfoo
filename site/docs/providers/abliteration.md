---
title: Abliteration Provider
sidebar_label: Abliteration
description: 'Evaluate Abliteration models with Promptfoo, including GLM-5.3-based Large V2. Configure API keys, reasoning effort, token limits, and multimodal prompts.'
sidebar_position: 85
---

# Abliteration

The `abliteration:` provider connects Promptfoo to
[Abliteration's](https://abliteration.ai/) OpenAI-compatible chat-completions API.

:::warning Safety

These models are modified to reduce refusals. Review outputs before using
them in applications, and follow the applicable model licenses.

:::

## Setup

1. Create an API key in the [Abliteration console](https://abliteration.ai/console).
2. Set it in your shell:

   ```sh
   export ABLIT_KEY=your-key-here
   ```

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

Large V2 is based on GLM-5.3. Context windows include input and output tokens.
See Abliteration's [model reference](https://docs.abliteration.ai/models)
for current limits and capabilities.

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

Run the eval:

```sh
npx promptfoo@latest eval --no-cache
```

`abliteration:<model>` is the default syntax;
`abliteration:chat:<model>` is also supported.

## Reasoning

For Large V2, set `reasoning_effort` to `low`, `high`, or `max`. Omitting it
uses the API's default, `max`. Set `max_tokens` explicitly for reasoning
workloads, as in the example above.

Large V2 always reasons. `none` selects low effort and hides the trace.
On `abliterated-model` and `abliterated-model-large`, `none` disables
reasoning. See the
[reasoning guide](https://docs.abliteration.ai/capabilities/thinking) for the
other accepted effort aliases and their model-specific behavior.

Promptfoo grades only the final answer by default. Set `showThinking: true`
to include the reasoning trace in the output sent to assertions.

To omit the trace from the API response, use:

```yaml
config:
  reasoning_effort: low
  passthrough:
    include_reasoning: false
```

Hiding the trace does not reduce reasoning token usage.

## OpenAI Compatibility

Sampling parameters, tool calling, and structured output use the same
configuration as the [OpenAI provider](/docs/providers/openai/).

## Multimodal Example

Use `abliterated-model` for images and video. Both large models accept text
only. This image example disables reasoning with `none`.

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
    config:
      reasoning_effort: none
      temperature: 0.2
      max_tokens: 512

tests:
  - vars:
      question: "What's in this image?"
    assert:
      - type: icontains
        value: stonehenge
```
