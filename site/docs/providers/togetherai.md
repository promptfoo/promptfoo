# Together AI

The [Together.AI API](https://docs.together.ai/docs) offers access to [numerous models](https://docs.together.ai/docs/inference-models) such as Mistral/Mixtral, Llama, and others.

It is compatible with the [OpenAI API](/docs/providers/openai). In order to use the Together AI API in an eval, set the `apiBaseUrl` variable to `https://api.together.xyz` and `apiKey` variable to your Together AI API key.

Here's an example config that uses Mixtral provided by Together AI:

```yaml
providers:
  - id: openai:chat:mistralai/Mixtral-8x7B-Instruct-v0.1
    config:
      apiBaseUrl: https://api.together.xyz
      apiKey: xxx
```

If desired, you can instead use the `OPENAI_API_BASE_URL` and `OPENAI_API_KEY` environment variables instead of the `apiBaseUrl` and `apiKey` configs.