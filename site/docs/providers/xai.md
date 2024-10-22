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

For more information on the available models and API usage, refer to the [xAI documentation](https://docs.x.ai/docs).
