# xAI (Grok)

[xAI](https://x.ai/) provides access to the Grok language model through an API compatible with OpenAI's interface.

The xAI provider is compatible with all the options provided by the [OpenAI provider](/docs/providers/openai/).

Here's an example of how to configure the provider to use the `grok-beta` model:

```yaml
providers:
  - id: xai:grok-beta
    config:
      temperature: 0.7
      apiKeyEnvar: XAI_API_KEY
```

If you prefer to use an environment variable directly, set `XAI_API_KEY`.

You can specify different Grok models:

```yaml
providers:
  - id: xai:grok-2
  - id: xai:grok-2-mini
```

For more information on the available models and API usage, refer to the [xAI documentation](https://x.ai/docs).

## Vision and Function Calling Example

Here's an example of how to use xAI's vision and function calling capabilities in a promptfoo config:

```yaml
providers:
  - id: xai:grok-2

prompts:
  - name: Image Analysis
    prompt: Analyze this image and describe what you see.
    variables:
      image_url: https://example.com/image.jpg

  - name: Weather Function
    prompt: What's the weather like in {{city}} today?
    functions:
      - name: get_weather
        description: Get the current weather for a location
        parameters:
          type: object
          properties:
            location:
              type: string
              description: The city and state, e.g. San Francisco, CA
            unit:
              type: string
              enum: [celsius, fahrenheit]
          required: [location]

tests:
  - description: Analyze an image
    prompt: Image Analysis
    vars:
      image_url: https://example.com/sunset.jpg
    assert:
      - type: contains
        value: sunset

  - description: Get weather using function calling
    prompt: Weather Function
    vars:
      city: New York
    assert:
      - type: function_call
        value:
          name: get_weather
          arguments:
            location: New York
            unit: celsius
```

This example demonstrates how to use xAI's vision capabilities to analyze an image and how to use function calling to get weather information. Make sure to replace the `image_url` with a valid image URL for testing.
