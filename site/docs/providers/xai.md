# xAI (Grok)

The `xai` provider supports [xAI's Grok models](https://x.ai/) through an API interface compatible with OpenAI's format. The provider supports both text and vision capabilities depending on the model used.

## Setup

To use xAI's API, set the `XAI_API_KEY` environment variable or specify via `apiKey` in the configuration file.

```sh
export XAI_API_KEY=your_api_key_here
```

## Provider Format

The xAI provider includes support for the following model formats:

- `xai:grok-2-latest` - Latest Grok-2 model (131K context)
- `xai:grok-2-vision-latest` - Latest Grok-2 vision model (32K context)
- `xai:grok-2-vision-1212`
- `xai:grok-2-1212`
- `xai:grok-beta` - Beta version (131K context)
- `xai:grok-vision-beta` - Vision beta version (8K context)
- As well as grok-3 variants whenever they become generally available

You can also use specific versioned models:

- `xai:grok-2-1212`
- `xai:grok-2-vision-1212`

## Configuration

The provider supports all [OpenAI provider](/docs/providers/openai) configuration options. Example usage:

```yaml
providers:
  - id: xai:grok-2-latest
    config:
      temperature: 0.7
      apiKey: your_api_key_here # Alternative to XAI_API_KEY
```

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

```yaml
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

```yaml
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
