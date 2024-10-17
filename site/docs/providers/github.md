# Github

[Github Models](https://github.com/marketplace/models/) provides an interface for a handful of LLM APIs.

The Github provider is compatible with all the options provided by the [OpenAI provider](/docs/providers/openai/).

Here's an example of how to configure the provider to use the `gpt-4o-mini` model:

```yaml
providers:
  - id: github:gpt-4o-mini
    config:
      temperature: 0.5
      apiKey: YOUR_GITHUB_TOKEN
```

If you prefer to use an environment variable, set `GITHUB_TOKEN`.

For more information on the available models and API usage, refer to the [Github documentation](https://github.com/marketplace/models/) for each specific model.
