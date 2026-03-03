---
title: QuiverAI Provider
sidebar_label: QuiverAI
description: Generate and evaluate SVG vector graphics with QuiverAI's Arrow model. Supports text-to-SVG generation with style instructions and reference images.
sidebar_position: 42
keywords: [quiverai, svg, vector graphics, arrow, image generation, vectorization]
---

# QuiverAI

[QuiverAI](https://quiver.ai) provides an API for generating SVG vector graphics from text prompts using the Arrow model. It supports text-to-SVG generation with optional reference images.

The provider outputs raw SVG markup, which can be validated with assertions like `is-xml` and `contains`.

## Setup

1. Create an API key at [app.quiver.ai](https://app.quiver.ai/settings/api-keys)
2. Set the `QUIVERAI_API_KEY` environment variable:

```bash
export QUIVERAI_API_KEY=your-api-key
```

:::note
The example config uses `llm-rubric` assertions, which require a [grading provider](/docs/configuration/expected-outputs/model-graded/#overriding-the-llm-grader). By default this uses OpenAI, so set `OPENAI_API_KEY` or configure a different grading provider.
:::

3. Run the example:

```bash
npx promptfoo@latest init --example quiverai
npx promptfoo@latest eval
```

## Provider Format

```
quiverai:<model-name>
```

The default model is `arrow-preview`.

## Configuration

Basic setup:

```yaml
providers:
  - id: quiverai:arrow-preview
```

With options:

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
| `temperature`       | number  | 1       | Randomness control (0–2)                                |
| `top_p`             | number  | 1       | Nucleus sampling (0–1)                                  |
| `presence_penalty`  | number  | 0       | Pattern exploration penalty (-2 to 2)                   |
| `max_output_tokens` | integer | —       | Token count upper bound (1–131,072)                     |
| `instructions`      | string  | —       | Style guidance separate from the prompt                 |
| `references`        | array   | —       | Up to 4 reference images: `[{ url }]` or `[{ base64 }]` |
| `n`                 | integer | 1       | Number of SVGs to generate (1–16)                       |
| `stream`            | boolean | true    | Use SSE streaming (disable with `false` for caching)    |
| `apiKey`            | string  | —       | API key (overrides environment variable)                |
| `apiBaseUrl`        | string  | —       | Custom API base URL                                     |

:::note
Streaming is enabled by default for faster response times. Set `stream: false` to enable response caching via promptfoo's cache layer.
:::

## Example

```yaml title="promptfooconfig.yaml"
description: QuiverAI SVG generation evaluation

prompts:
  - 'Create a simple SVG icon of: {{subject}}'

providers:
  - id: quiverai:arrow-preview
    label: Arrow (default)
    config:
      max_output_tokens: 8192

  - id: quiverai:arrow-preview
    label: Arrow (flat style)
    config:
      max_output_tokens: 8192
      instructions: 'Flat design with clean geometry and a minimal color palette'

defaultTest:
  options:
    rubricPrompt: |
      Evaluate if this SVG meets the criteria. Be fair - stylized interpretations are fine.
      Output JSON: {"reason": "<brief analysis>", "pass": true|false, "score": 0.0-1.0}

      SVG: {{ output }}
      Criteria: {{ value }}

tests:
  - vars:
      subject: a red heart
    assert:
      - type: is-xml
      - type: llm-rubric
        value: Contains a heart shape in red color
        threshold: 0.5

  - vars:
      subject: a yellow star
    assert:
      - type: is-xml
      - type: llm-rubric
        value: Contains a star shape in yellow/gold color
        threshold: 0.5
```

:::tip
Use the `is-xml` assertion to verify the output is valid SVG markup, and `llm-rubric` to evaluate visual quality with an LLM judge.
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

| Variable           | Description                                                       |
| ------------------ | ----------------------------------------------------------------- |
| `QUIVERAI_API_KEY` | QuiverAI API key (required)                                       |
| `OPENAI_API_KEY`   | Required for `llm-rubric` assertions (default grader uses OpenAI) |

## See Also

- [QuiverAI Documentation](https://docs.quiver.ai)
- [QuiverAI example](https://github.com/promptfoo/promptfoo/tree/main/examples/quiverai)
- [Configuration Reference](/docs/configuration/reference)
