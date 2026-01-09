---
sidebar_label: QuiverAI
description: Configure QuiverAI for chat completions and SVG vector graphics generation with customizable styles and editing capabilities
---

# QuiverAI

[QuiverAI](https://quiver.ai) provides an OpenAI-compatible chat API and a specialized SVG generation API. The chat provider extends the [OpenAI provider](/docs/providers/openai/) and supports all standard options.

## Setup

1. Get an API key from [QuiverAI](https://quiver.ai)
2. Set `QUIVERAI_API_KEY` environment variable or specify `apiKey` in your config

## Provider Formats

| Format                      | Description                    |
| --------------------------- | ------------------------------ |
| `quiverai:model-name`       | Chat completions (default)     |
| `quiverai:chat:model-name`  | Chat completions (explicit)    |
| `quiverai:svg:model-name`   | SVG generation                 |

## Chat Provider

The chat provider uses QuiverAI's OpenAI-compatible API:

```yaml
providers:
  - id: quiverai:chat:arrow-0.5
    config:
      temperature: 0.7
      max_tokens: 4000
```

### Chat Configuration Options

All [OpenAI configuration options](/docs/providers/openai/#configuring-parameters) are supported, plus:

- `reasoning_effort` - QuiverAI-specific reasoning parameter

## SVG Provider

The SVG provider generates vector graphics from text prompts:

```yaml
providers:
  - id: quiverai:svg:arrow-0.5
    config:
      svgParams:
        mode: icon
        style: gradient
```

### SVG Configuration Options

| Option | Type | Description |
| --- | --- | --- |
| `operation` | `generate` \| `edit` | Operation type (default: `generate`) |
| `svgParams.mode` | `icon` \| `illustration` \| `logo` | Generation mode |
| `svgParams.style` | `flat` \| `outline` \| `duotone` \| `gradient` | Visual style |
| `svgParams.complexity` | number | Complexity level |
| `svgParams.viewBox` | `{width, height}` | Custom viewport dimensions |
| `sourceSvg` | string | Source SVG for edit operation |
| `sourceSvgUrl` | string | URL to source SVG for edit operation |
| `temperature` | number | Controls randomness |
| `maxOutputTokens` | number | Maximum output tokens |
| `n` | number | Number of generations |

### SVG Generation Example

```yaml
providers:
  - id: quiverai:svg:arrow-0.5
    config:
      svgParams:
        mode: icon
        style: gradient
        complexity: 3
        viewBox:
          width: 256
          height: 256

prompts:
  - 'Create an icon of: {{subject}}'

tests:
  - vars:
      subject: a rocket ship
```

### SVG Editing Example

Edit existing SVGs by providing source content:

```yaml
providers:
  - id: quiverai:svg:arrow-0.5
    config:
      operation: edit
      sourceSvg: '<svg xmlns="http://www.w3.org/2000/svg">...</svg>'

prompts:
  - 'Change the color to blue'
```

Or reference a URL:

```yaml
providers:
  - id: quiverai:svg:arrow-0.5
    config:
      operation: edit
      sourceSvgUrl: 'https://example.com/icon.svg'
```

## Environment Variables

| Variable | Description |
| --- | --- |
| `QUIVERAI_API_KEY` | API key (required) |
| `QUIVERAI_API_BASE_URL` | Custom API base URL |

## API Details

- Base URL: `https://api.quiver.ai/v1`
- Chat endpoint: OpenAI-compatible `/chat/completions`
- SVG generate endpoint: `/svg/generate`
- SVG edit endpoint: `/svg/edits`

## See Also

- [OpenAI Provider](/docs/providers/openai/) - Compatible chat configuration options
- [QuiverAI example](https://github.com/promptfoo/promptfoo/tree/main/examples/quiverai)
