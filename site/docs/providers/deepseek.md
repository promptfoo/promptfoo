# DeepSeek

[DeepSeek](https://platform.deepseek.com/) provides an OpenAI-compatible API for their language models.

The DeepSeek provider is compatible with all the options provided by the [OpenAI provider](/docs/providers/openai/).

Here's an example of how to configure the provider:

```yaml
providers:
  # Use DeepSeek-V3 model
  - id: deepseek:deepseek-chat
    config:
      temperature: 0.7
      apiKey: YOUR_DEEPSEEK_API_KEY

  # Use DeepSeek-R1 reasoning model
  - id: deepseek:deepseek-reasoner
    config:
      temperature: 0.7
```

If you prefer to use an environment variable, set `DEEPSEEK_API_KEY`.

Available models:

- `deepseek-chat` - DeepSeek-V3 model, optimized for chat interactions
- `deepseek-reasoner` - DeepSeek-R1 model, optimized for reasoning tasks

For more information on the available models and API usage, refer to the [DeepSeek API documentation](https://platform.deepseek.com/docs).
