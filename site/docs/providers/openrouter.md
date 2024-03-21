# OpenRouter

[OpenRouter](https://openrouter.ai/) provides a unified interface for LLM APIs.

To use OpenRouter's API within your application, override the existing OpenAI provider configuration in your YAML file.

Here's an example of how to configure the provider to use the `mistralai/mistral-medium` model from OpenRouter:

```yaml
providers:
  - id: openai:chat:mistralai/mistral-medium    # or any other chat model
    config:
      apiBaseUrl: https://openrouter.ai/api/v1
      apiKey: openrouter_api_key
```

You can also set the `OPENAI_API_KEY` and `OPENAI_API_BASE_URL` as environment variables to avoid hardcoding them into your configuration files.

For more information on the available models and API usage, refer to the [OpenRouter documentation](https://openrouter.ai/models/mistralai/mistral-medium?tab=api) for each specific model.
