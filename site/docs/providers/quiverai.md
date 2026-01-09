---
sidebar_label: QuiverAI
description: Configure QuiverAI for chat completions and SVG vector graphics generation
---

# QuiverAI

[QuiverAI](https://quiver.ai) provides an OpenAI-compatible chat API that excels at generating SVG vector graphics. The provider extends the [OpenAI provider](/docs/providers/openai/) and supports all standard options.

## Setup

1. Get an API key from [QuiverAI](https://quiver.ai)
2. Set `QUIVERAI_API_KEY` environment variable or specify `apiKey` in your config

## Provider Formats

| Format                     | Description                 |
| -------------------------- | --------------------------- |
| `quiverai:model-name`      | Chat completions (default)  |
| `quiverai:chat:model-name` | Chat completions (explicit) |

## Configuration

```yaml
providers:
  - id: quiverai:arrow-0.5
    config:
      temperature: 0.7
      max_tokens: 4096
```

### Configuration Options

All [OpenAI configuration options](/docs/providers/openai/#configuring-parameters) are supported, plus:

| Option             | Type   | Description                           |
| ------------------ | ------ | ------------------------------------- |
| `reasoning_effort` | string | QuiverAI-specific reasoning parameter |

## SVG Generation Example

QuiverAI's Arrow model is optimized for generating SVG graphics via chat:

```yaml
providers:
  - id: quiverai:arrow-0.5
    config:
      max_tokens: 4096

prompts:
  - |
    [
      {"role": "system", "content": "You are a vector graphics designer. Output valid SVG code only."},
      {"role": "user", "content": "Create an SVG of: {{subject}}"}
    ]

tests:
  - vars:
      subject: a red heart icon
    assert:
      - type: contains
        value: '<svg'
      - type: contains
        value: '</svg>'
```

## Environment Variables

| Variable                | Description         |
| ----------------------- | ------------------- |
| `QUIVERAI_API_KEY`      | API key (required)  |
| `QUIVERAI_API_BASE_URL` | Custom API base URL |

## See Also

- [OpenAI Provider](/docs/providers/openai/) - Compatible chat configuration options
- [QuiverAI example](https://github.com/promptfoo/promptfoo/tree/main/examples/quiverai)
