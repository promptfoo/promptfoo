---
title: QuiverAI Provider
sidebar_label: QuiverAI
description: Generate and evaluate SVG vector graphics with QuiverAI's Arrow model in promptfoo.
sidebar_position: 42
keywords: [quiverai, svg, vector graphics, arrow, image generation]
---

# QuiverAI

The [QuiverAI](https://quiver.ai) provider generates SVG vector graphics from text prompts using the Arrow model. Output is raw SVG markup, which works with text-based assertions like `is-xml`, `contains`, and `llm-rubric`.

## Setup

1. Create an API key at [app.quiver.ai](https://app.quiver.ai/settings/api-keys)
2. Set the environment variable:

```bash
export QUIVERAI_API_KEY=your-api-key
```

## Provider Format

```text
quiverai:<model-name>
```

The default model is `arrow-preview`.

## Configuration

```yaml
providers:
  - id: quiverai:arrow-preview
    config:
      temperature: 0.7
      max_output_tokens: 8192
      instructions: 'flat design, minimal color palette'
```

With reference images:

```yaml
providers:
  - id: quiverai:arrow-preview
    config:
      references:
        - url: https://example.com/style-reference.png
      instructions: 'Match the style of the reference image'
```

### Configuration Options

| Parameter           | Type    | Default | Description                                             |
| ------------------- | ------- | ------- | ------------------------------------------------------- |
| `instructions`      | string  | —       | Style guidance separate from the prompt                 |
| `references`        | array   | —       | Up to 4 reference images: `[{ url }]` or `[{ base64 }]` |
| `temperature`       | number  | 1       | Randomness (0–2)                                        |
| `top_p`             | number  | 1       | Nucleus sampling (0–1)                                  |
| `presence_penalty`  | number  | 0       | Penalize repeated patterns (-2 to 2)                    |
| `max_output_tokens` | integer | —       | Maximum output tokens (1–131,072)                       |
| `n`                 | integer | 1       | Number of SVGs to generate (1–16)                       |
| `stream`            | boolean | true    | Set `false` to enable response caching                  |
| `apiKey`            | string  | —       | API key (overrides environment variable)                |
| `apiBaseUrl`        | string  | —       | Custom API base URL                                     |

When `n > 1`, multiple SVGs are joined with double newlines.

## Example

```yaml title="promptfooconfig.yaml"
prompts:
  - 'Create a simple SVG icon of: {{subject}}'

providers:
  - id: quiverai:arrow-preview
    config:
      max_output_tokens: 8192

tests:
  - vars:
      subject: a red heart
    assert:
      - type: is-xml
      - type: llm-rubric
        value: Contains a heart shape in red color

  - vars:
      subject: a yellow star
    assert:
      - type: is-xml
      - type: llm-rubric
        value: Contains a star shape in yellow/gold color
```

:::note
`llm-rubric` assertions require a [grading provider](/docs/configuration/expected-outputs/model-graded/#overriding-the-llm-grader). By default this uses OpenAI, so set `OPENAI_API_KEY` or configure a different grader.
:::

## Troubleshooting

| Error                  | Cause                     | Fix                                                       |
| ---------------------- | ------------------------- | --------------------------------------------------------- |
| `insufficient_credits` | Account has no credits    | Add credits at [app.quiver.ai](https://app.quiver.ai)     |
| `invalid_api_key`      | Key is missing or invalid | Check `QUIVERAI_API_KEY` is set correctly                 |
| `rate_limit_exceeded`  | Too many requests         | Reduce `--max-concurrency` or add delays between requests |
| `model_not_found`      | Invalid model name        | Use `arrow-preview` (the default)                         |

Error messages include a `request_id` for debugging with QuiverAI support.

## Environment Variables

| Variable           | Description        |
| ------------------ | ------------------ |
| `QUIVERAI_API_KEY` | API key (required) |

## See Also

- [QuiverAI example](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-quiverai)
- [Configuration Reference](/docs/configuration/reference)
