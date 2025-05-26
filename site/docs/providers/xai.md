---
title: xAI (Grok) Provider
description: Configure and use xAI's Grok models with promptfoo, including Grok-3 with reasoning capabilities
keywords: [xai, grok, grok-3, grok-2, reasoning, vision, llm]
---

# xAI (Grok)

Use xAI's Grok models for text generation, reasoning, vision, and image generation with promptfoo.

## Quick Start

Set your API key and start evaluating:

```bash
export XAI_API_KEY=your_api_key_here
```

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - 'Explain {{topic}} in simple terms'

providers:
  - xai:grok-3-mini-beta

tests:
  - vars:
      topic: 'quantum computing'
```

Run your eval:

```bash
npx promptfoo eval
```

## Text Generation

### Basic Usage

Use any Grok model for text generation:

```yaml
providers:
  - xai:grok-3-beta # Latest flagship model
  - xai:grok-3-fast-beta # Faster variant
  - xai:grok-3-mini-beta # Lightweight with reasoning
  - xai:grok-2-latest # Previous generation
```

### Reasoning Models

Grok-3 mini models support reasoning for complex problems:

```yaml
providers:
  - id: xai:grok-3-mini-beta
    config:
      reasoning_effort: 'high' # 'low' or 'high'
```

Use `reasoning_effort: 'high'` for complex logic problems and `reasoning_effort: 'low'` for quick responses.

## Vision

Analyze images with vision-capable models:

```yaml title="promptfooconfig.yaml"
prompts:
  - role: user
    content:
      - type: image_url
        image_url:
          url: '{{image_url}}'
      - type: text
        text: 'What do you see in this image?'

providers:
  - xai:grok-2-vision-latest

tests:
  - vars:
      image_url: 'https://example.com/image.jpg'
```

## Image Generation

Generate images with the Grok image model:

```yaml title="promptfooconfig.yaml"
prompts:
  - 'A {{style}} painting of {{subject}}'

providers:
  - xai:image:grok-2-image

tests:
  - vars:
      style: 'impressionist'
      subject: 'a sunset over mountains'
```

### Image Generation Options

Configure image generation parameters:

```yaml
providers:
  - id: xai:image:grok-2-image
    config:
      n: 4 # Generate 1-10 images
      response_format: 'url' # 'url' or 'b64_json'
```

:::tip

To view generated images in the web interface, enable 'Render markdown' in Table Settings.

:::

## Configuration

### API Key

Set your API key using environment variables or config:

```bash
export XAI_API_KEY=your_api_key_here
```

Or in your config file:

```yaml
providers:
  - id: xai:grok-3-beta
    config:
      apiKey: your_api_key_here
```

### Regional Endpoints

Use region-specific endpoints for better performance:

```yaml
providers:
  - id: xai:grok-2-latest
    config:
      region: us-west-1
```

### Advanced Options

Configure model parameters:

```yaml
providers:
  - id: xai:grok-3-beta
    config:
      temperature: 0.7
      max_tokens: 1000
      top_p: 0.9
```

## Available Models

### Grok-3 Models

| Model                   | Context | Best For                        |
| ----------------------- | ------- | ------------------------------- |
| `grok-3-beta`           | 131K    | Enterprise tasks, deep analysis |
| `grok-3-fast-beta`      | 131K    | Same quality, faster responses  |
| `grok-3-mini-beta`      | 131K    | Reasoning, logic problems       |
| `grok-3-mini-fast-beta` | 131K    | Fast reasoning                  |

### Grok-2 Models

| Model                  | Context | Best For                |
| ---------------------- | ------- | ----------------------- |
| `grok-2-latest`        | 131K    | General text generation |
| `grok-2-vision-latest` | 32K     | Image analysis          |
| `grok-2-image-latest`  | -       | Image generation        |

:::info

All models support the same OpenAI-compatible API format.

:::

## Examples

### Reasoning Comparison

Compare reasoning capabilities across models:

```yaml title="promptfooconfig.yaml"
prompts:
  - 'Solve this step by step: {{problem}}'

providers:
  - id: xai:grok-3-mini-beta
    config:
      reasoning_effort: 'high'
  - id: xai:grok-3-beta
  - id: xai:grok-2-latest

tests:
  - vars:
      problem: 'If a train travels 120 miles in 2 hours, and then 180 miles in 3 hours, what is its average speed for the entire journey?'
```

## See Also

- [OpenAI Provider](/docs/providers/openai) - Similar API format
- [xAI Image Example](https://github.com/promptfoo/promptfoo/tree/main/examples/xai-images) - Complete image generation example
- [xAI Documentation](https://docs.x.ai/docs) - Official API documentation
