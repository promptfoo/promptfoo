# OpenRouter

[OpenRouter](https://openrouter.ai/) provides a unified interface for LLM APIs.

The OpenRouter provider is compatible with all the options provided by the [OpenAI provider](/docs/providers/openai/).

Here's an example of how to configure the provider to use the `mistralai/mistral-medium` model from OpenRouter:

```yaml
providers:
  - id: openrouter:mistralai/mistral-medium # or any other chat model
    config:
      temperature: 0.5
      apiKey: insert_your_openrouter_api_key_here
```

If you prefer to use an environment variable, set `OPENROUTER_API_KEY`.

For more information on the available models and API usage, refer to the [OpenRouter documentation](https://openrouter.ai/models/mistralai/mistral-medium?tab=api) for each specific model.
