---
title: xAI (Grok) Provider
description: Configure and use xAI's Grok models with promptfoo, including Grok-3 with reasoning capabilities
keywords: [xai, grok, grok-3, grok-2, reasoning, vision, llm]
---

# xAI (Grok)

The `xai` provider supports [xAI's Grok models](https://x.ai/) through an API interface compatible with OpenAI's format. The provider supports both text and vision capabilities depending on the model used.

## Setup

To use xAI's API, set the `XAI_API_KEY` environment variable or specify via `apiKey` in the configuration file.

```sh
export XAI_API_KEY=your_api_key_here
```

## Provider Format

The xAI provider includes support for the following model formats:

### Grok-3 Models

- `xai:grok-3-beta` - Latest flagship model for enterprise tasks (131K context)
- `xai:grok-3-fast-beta` - Faster variant of grok-3-beta (131K context)
- `xai:grok-3-mini-beta` - Lightweight reasoning model (131K context)
- `xai:grok-3-mini-fast-beta` - Faster variant of grok-3-mini with reasoning (131K context)

### Grok-2 and previous Models

- `xai:grok-2-latest` - Latest Grok-2 model (131K context)
- `xai:grok-2-vision-latest` - Latest Grok-2 vision model (32K context)
- `xai:grok-2-vision-1212`
- `xai:grok-2-1212`
- `xai:grok-beta` - Beta version (131K context)
- `xai:grok-vision-beta` - Vision beta version (8K context)

You can also use specific versioned models:

- `xai:grok-2-1212`
- `xai:grok-2-vision-1212`

## Configuration

The provider supports all [OpenAI provider](/docs/providers/openai) configuration options plus Grok-specific options. Example usage:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: xai:grok-3-mini-beta
    config:
      temperature: 0.7
      reasoning_effort: 'high' # Only for grok-3-mini models
      apiKey: your_api_key_here # Alternative to XAI_API_KEY
```

### Reasoning Support

Grok-3 introduces reasoning capabilities for specific models. The `grok-3-mini-beta` and `grok-3-mini-fast-beta` models support reasoning through the `reasoning_effort` parameter:

- `reasoning_effort: "low"` - Minimal thinking time, using fewer tokens for quick responses
- `reasoning_effort: "high"` - Maximum thinking time, leveraging more tokens for complex problems

:::info

Reasoning is only available for the mini variants. The standard `grok-3-beta` and `grok-3-fast-beta` models do not support reasoning.

:::

### Region Support

You can specify a region to use a region-specific API endpoint:

```yaml
providers:
  - id: xai:grok-2-latest
    config:
      region: us-west-1 # Will use https://us-west-1.api.x.ai/v1
```

This is equivalent to setting `base_url="https://us-west-1.api.x.ai/v1"` in the Python client.

### Vision Support

For models with vision capabilities, you can include images in your prompts using the same format as OpenAI. Create a `prompt.yaml` file:

```yaml title="prompt.yaml"
- role: user
  content:
    - type: image_url
      image_url:
        url: '{{image_url}}'
        detail: 'high'
    - type: text
      text: '{{question}}'
```

Then reference it in your promptfoo config:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - file://prompt.yaml

providers:
  - id: xai:grok-2-vision-latest

tests:
  - vars:
      image_url: 'https://example.com/image.jpg'
      question: "What's in this image?"
```

For more information on the available models and API usage, refer to the [xAI documentation](https://docs.x.ai/docs).

## See Also

- [OpenAI Provider](/docs/providers/openai)
