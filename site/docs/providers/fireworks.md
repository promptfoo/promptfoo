# Fireworks AI

[Fireworks AI](https://fireworks.ai) offers access to a diverse range of language models through an API that is fully compatible with the OpenAI interface.

The Fireworks AI provider supports all options available in the [OpenAI provider](/docs/providers/openai/).

## Example Usage

To configure the provider to use the `accounts/fireworks/models/llama-v3-8b-instruct` model, use the following YAML configuration:

```yaml
providers:
  - id: fireworks:accounts/fireworks/models/llama-v3-8b-instruct
    config:
      temperature: 0.7
      apiKey: YOUR_FIREWORKS_API_KEY
```

Alternatively, you can set the `FIREWORKS_API_KEY` environment variable to use your API key directly.

## API Details

- **Base URL**: `https://api.fireworks.ai/inference/v1`
- **API format**: OpenAI-compatible
- Full [API documentation](https://docs.fireworks.ai)
