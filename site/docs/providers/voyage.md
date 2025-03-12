# Voyage AI

[Voyage AI](https://www.voyageai.com/) is Anthropic's [recommended](https://docs.anthropic.com/en/docs/embeddings) embeddings provider. It supports [all models](https://docs.voyageai.com/docs/embeddings). As of time of writing:

- voyage-large-2-instruct
- voyage-finance-2
- voyage-multilingual-2
- voyage-law-2
- voyage-code-2
- voyage-large-2
- voyage-2

To use it, set the `VOYAGE_API_KEY` environment variable.

Use it like so:

```yaml
provider: voyage:voyage-2
```

You can enable it for every similarity comparison using the `defaultTest` property:

```yaml
defaultTest:
  options:
    provider:
      embedding: voyage:voyage-2
```

You can also override the API key or API base URL:

```yaml
provider:
  id: voyage:voyage-2
  config:
    apiKey: XXX
    apiKeyEnvar: VOYAGE_API_KEY # if set, will fetch API key from this environment variable
    apiBaseUrl: https://api.voyageai.com/v1
```
