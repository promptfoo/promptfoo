---
title: QuiverAI Provider
sidebar_label: QuiverAI
description: Generate and vectorize SVG vector graphics with QuiverAI's Arrow models in promptfoo.
sidebar_position: 42
keywords: [quiverai, svg, vector graphics, arrow, image generation, vectorization]
---

# QuiverAI

The [QuiverAI](https://quiver.ai) provider generates and vectorizes SVG graphics with the Arrow family of models. Output is raw SVG markup, which works with text-based assertions like `is-xml`, `contains`, and `llm-rubric`. Promptfoo also indexes valid single-SVG outputs in the Media Library while preserving the original SVG text for assertions and exports.

Two endpoints are supported:

- **Text → SVG** (`quiverai:<model>`) calls `POST /v1/svgs/generations`.
- **Image → SVG** (`quiverai:vectorize:<model>`) calls `POST /v1/svgs/vectorizations`.

## Setup

1. Create an API key at [app.quiver.ai](https://app.quiver.ai/settings/api-keys)
2. Set the environment variable:

```bash
export QUIVERAI_API_KEY=your-api-key
```

## Models

Run `GET /v1/models` for the live list. The currently released Arrow models are:

| Model         | Provider id              | Use case                                                                |
| ------------- | ------------------------ | ----------------------------------------------------------------------- |
| Arrow 1.1     | `quiverai:arrow-1.1`     | Default. Best general-purpose tradeoff between quality and credit cost. |
| Arrow 1.1 Max | `quiverai:arrow-1.1-max` | Higher fidelity for dense illustrations, logos, and technical drawings. |
| Arrow 1.0     | `quiverai:arrow-1.0`     | Previous-generation model retained for parity.                          |

The default model is `arrow-1.1`.

## Provider format

```text
quiverai:<model-name>             # text → SVG (default)
quiverai:vectorize:<model-name>   # image → SVG
quiverai:generate:<model-name>    # explicit text → SVG (alias)
```

`quiverai:chat:<model-name>` is a legacy alias for the generation endpoint.

## Text → SVG

```yaml
providers:
  - id: quiverai:arrow-1.1
    config:
      temperature: 0.7
      max_output_tokens: 8192
      instructions: 'flat design, minimal color palette'
```

With reference images (URL string shorthand or `{ url }` / `{ base64 }`):

```yaml
providers:
  - id: quiverai:arrow-1.1
    config:
      references:
        - https://example.com/style-reference.png
        - { url: https://example.com/another.png }
      instructions: 'Match the style of the reference image'
```

### Generation parameters

| Parameter           | Type    | Default | Description                                                                                                                     |
| ------------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `instructions`      | string  | —       | Style guidance separate from the prompt                                                                                         |
| `references`        | array   | —       | Reference images: URL string, `{ url }`, or `{ base64 }`. Arrow 1.1 accepts up to 4 references; Arrow 1.1 Max accepts up to 16. |
| `temperature`       | number  | 1       | Randomness (0–2)                                                                                                                |
| `top_p`             | number  | 1       | Nucleus sampling (0–1)                                                                                                          |
| `presence_penalty`  | number  | 0       | Penalize repeated patterns (-2 to 2)                                                                                            |
| `max_output_tokens` | integer | —       | Maximum output tokens (1–131,072)                                                                                               |
| `n`                 | integer | 1       | Number of SVGs to generate (1–16)                                                                                               |
| `stream`            | boolean | true    | Set `false` to enable response caching                                                                                          |
| `apiKey`            | string  | —       | API key (overrides environment variable)                                                                                        |
| `apiBaseUrl`        | string  | —       | Custom API base URL                                                                                                             |

When `n > 1`, multiple SVGs are joined with double newlines and ordered by the response's `index`.

## Image → SVG

The vectorize endpoint converts a raster image (PNG, JPEG, WebP) to SVG. The image can come from the prompt or from `config.image`.

```yaml
providers:
  - id: quiverai:vectorize:arrow-1.1
    config:
      auto_crop: true
      target_size: 1024

prompts:
  - '{{image_url}}'

tests:
  - vars:
      image_url: https://example.com/logo.png
    assert:
      - type: is-xml
```

Accepted prompt forms:

- A plain `https://...` URL
- A `data:image/...;base64,...` data URL
- A JSON object string like `{"url": "..."}` or `{"base64": "..."}`
- A raw base64 payload (treated as `{ base64: ... }`)

When using an inline data URL in a YAML config, pass it through a variable such as
`'{{image_data}}'` or set `config.image.base64`. A bare `data:` string in
`prompts:` is interpreted by Promptfoo's prompt loader before the QuiverAI
provider sees it.

You can also provide the image directly in the config and use the prompt for unrelated context:

```yaml
providers:
  - id: quiverai:vectorize:arrow-1.1
    config:
      image:
        url: https://example.com/logo.png
      auto_crop: true
```

### Vectorize parameters

| Parameter           | Type    | Default | Description                                                                |
| ------------------- | ------- | ------- | -------------------------------------------------------------------------- |
| `image`             | object  | —       | Override image input (`{ url }` or `{ base64 }`); falls back to the prompt |
| `auto_crop`         | boolean | false   | Auto-crop to the dominant subject before vectorization                     |
| `target_size`       | integer | —       | Square resize target in pixels (128–4,096)                                 |
| `temperature`       | number  | 1       | Randomness (0–2)                                                           |
| `top_p`             | number  | 1       | Nucleus sampling (0–1)                                                     |
| `presence_penalty`  | number  | 0       | Penalize repeated patterns (-2 to 2)                                       |
| `max_output_tokens` | integer | —       | Maximum output tokens (1–131,072)                                          |
| `stream`            | boolean | true    | Set `false` to enable response caching                                     |
| `apiKey`            | string  | —       | API key (overrides environment variable)                                   |
| `apiBaseUrl`        | string  | —       | Custom API base URL                                                        |

## Streaming

Streaming is on by default. The provider receives `generating`, `reasoning`, and `draft` events while the SVG is being produced and assembles the final SVG from the `content` event(s). Set `stream: false` to use the JSON endpoint and enable response caching.

## Billing and metadata

QuiverAI bills in **credits**, not USD. Each successful response surfaces credit cost on the response (top-level `credits` for non-streaming, per-output `credits` on streaming `content` events). Promptfoo exposes both fields via response metadata:

```ts
result.metadata.responseId; // server-generated request/output id
result.metadata.credits; // total credits debited for this call
```

The deprecated `usage` token block is also propagated to `tokenUsage` for backwards compatibility, even though the API now zeros those values.

## Pipeline: GPT Image → QuiverAI vectorize

Chaining a high-quality raster generator (such as OpenAI's `gpt-image-2`) into QuiverAI's vectorizer is one of the cleanest ways to produce a consistent, editable SVG icon set. Wrap the two calls in a custom JS provider so the pipeline is one provider in your eval and works with normal `is-xml`, `contains`, and `llm-rubric` assertions.

```javascript title="pipeline-provider.js"
class GptImageToQuiverPipeline {
  constructor(options = {}) {
    this.providerId = options.id || 'pipeline:gpt-image-2->quiverai-vectorize';
    this.config = options.config || {};
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt) {
    // 1. Generate raster with OpenAI gpt-image-2.
    const imgRes = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: this.config.imageModel || 'gpt-image-2',
        prompt,
        size: '1024x1024',
        quality: 'high',
        background: 'auto', // gpt-image-2 does not accept 'transparent'
        n: 1,
      }),
    });
    if (!imgRes.ok) {
      throw new Error(`OpenAI image step failed: HTTP ${imgRes.status}`);
    }
    const img = await imgRes.json();
    const rasterB64 = img.data?.[0]?.b64_json;
    if (!rasterB64) {
      throw new Error('OpenAI image step returned no image data');
    }

    // 2. Vectorize with QuiverAI Arrow.
    const svgRes = await fetch('https://api.quiver.ai/v1/svgs/vectorizations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.QUIVERAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: this.config.vectorizeModel || 'arrow-1.1',
        image: { base64: rasterB64 },
        auto_crop: true,
        target_size: 1024,
      }),
    });
    if (!svgRes.ok) {
      throw new Error(`QuiverAI vectorize step failed: HTTP ${svgRes.status}`);
    }
    const svg = await svgRes.json();
    const outputSvg = svg.data?.[0]?.svg;
    if (!outputSvg) {
      throw new Error('QuiverAI vectorize step returned no SVG data');
    }
    return {
      output: outputSvg,
      metadata: { credits: svg.credits, responseId: svg.id },
    };
  }
}

module.exports = GptImageToQuiverPipeline;
```

```yaml title="promptfooconfig.yaml"
prompts:
  - 'Centered icon of {{subject}}, flat vector illustration, bold shapes, minimal palette, clear silhouette.'

providers:
  - id: file://pipeline-provider.js
    label: 'GPT Image-2 → Arrow 1.1'
    config:
      imageModel: gpt-image-2
      vectorizeModel: arrow-1.1
  - id: file://pipeline-provider.js
    label: 'GPT Image-2 → Arrow 1.1 Max'
    config:
      imageModel: gpt-image-2
      vectorizeModel: arrow-1.1-max

tests:
  - vars:
      subject: a friendly red panda mascot facing forward
    assert:
      - type: is-xml
      - type: llm-rubric
        value: A clearly recognizable red panda face with reddish-orange fur and dark facial markings.
```

A complete working example, including red-panda-themed prompts and side-by-side Arrow 1.1 / Arrow 1.1 Max configs, lives at [`examples/provider-quiverai/promptfooconfig.pipeline.yaml`](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-quiverai). In the May 2026 verification run behind this example, Arrow 1.1 debited 15 credits per vectorize and Arrow 1.1 Max debited 20 — both surfaced via `metadata.credits` so you can budget per eval. Read the live `GET /v1/models` response for current `pricing_credits`.

:::tip
Each pipeline call hits two providers serially, so individual evaluations take longer than a pure generation run. Lower `--max-concurrency` if you start hitting QuiverAI's per-minute rate limit, and prefer `stream: false` on the vectorize step when you want response caching across re-runs.
:::

## Example

```yaml title="promptfooconfig.yaml"
prompts:
  - 'Create a simple SVG icon of: {{subject}}'

providers:
  - id: quiverai:arrow-1.1
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

| Error                   | Cause                              | Fix                                                                             |
| ----------------------- | ---------------------------------- | ------------------------------------------------------------------------------- |
| `insufficient_credits`  | Account has no credits             | Add credits at [app.quiver.ai](https://app.quiver.ai)                           |
| `invalid_api_key`       | Key is missing or invalid          | Check `QUIVERAI_API_KEY` is set correctly                                       |
| `rate_limit_exceeded`   | Per-minute rate limit hit          | Reduce `--max-concurrency` or add delays between requests                       |
| `weekly_limit_exceeded` | Org weekly quota hit               | Wait for the rolling weekly window or contact support — retries cannot recover. |
| `account_frozen`        | Account is frozen                  | Contact QuiverAI support                                                        |
| `model_not_found`       | Invalid model name                 | Use one of `arrow-1.1`, `arrow-1.1-max`, `arrow-1.0`                            |
| `upstream_error`        | Transient upstream dependency fail | Retry — this is usually transient                                               |

Error messages include a `request_id` for debugging with QuiverAI support.

## Environment Variables

| Variable           | Description        |
| ------------------ | ------------------ |
| `QUIVERAI_API_KEY` | API key (required) |

## See Also

- [QuiverAI example](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-quiverai) — generation, vectorization, and pipeline configs
- [QuiverAI API docs](https://docs.quiver.ai)
- [Custom JS providers](/docs/providers/custom-api) — the pipeline pattern
- [Configuration Reference](/docs/configuration/reference)
