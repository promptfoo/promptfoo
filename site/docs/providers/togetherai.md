# Together AI

The [Together.AI API](https://docs.together.ai/docs) offers access to [numerous models](https://docs.together.ai/docs/inference-models) such as Mistral/Mixtral, Llama, and others.

It is compatible with the [OpenAI API](/docs/providers/openai). In order to use the Together AI API in an eval, set the `apiBaseUrl` variable to `https://api.together.xyz` and `apiKey` variable to your Together AI API key.

Here's an example config that uses Mixtral provided by Together AI:

```yaml
providers:
  - id: openai:chat:mistralai/Mixtral-8x7B-Instruct-v0.1
    config:
      apiBaseUrl: https://api.together.xyz/v1
      apiKeyEnvar: TOGETHER_API_KEY
```

If desired, you can instead use the `OPENAI_BASE_URL` environment variables instead of the `apiBaseUrl` config property.

In this example, you'd also have to set the `TOGETHER_API_KEY` environment variable (you can also enter it directly in the config using the `apiKey` property).
