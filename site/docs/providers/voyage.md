---
sidebar_label: Voyage AI
description: 'Use Voyage AI text embedding models for semantic search, retrieval, and similarity assertions in Promptfoo.'
---

# Voyage AI

[Voyage AI](https://www.voyageai.com/) provides [text embeddings](https://docs.voyageai.com/docs/embeddings). Promptfoo calls its `/embeddings` endpoint for similarity assertions. Examples include `voyage-4-large`, `voyage-4`, `voyage-4-lite`, and `voyage-code-4`. The provider does not call Voyage's separate multimodal or contextualized embedding endpoints.

To use it, set the `VOYAGE_API_KEY` environment variable.

To select it for one assertion:

```yaml
assert:
  - type: similar
    value: The expected output
    provider: voyage:voyage-4-large
```

You can enable it for every similarity comparison using the `defaultTest` property:

```yaml
defaultTest:
  options:
    provider:
      embedding: voyage:voyage-4-large
```

You can also override the API key or API base URL:

```yaml
defaultTest:
  options:
    provider:
      embedding:
        id: voyage:voyage-4-large
        config:
          apiKeyEnvar: MY_VOYAGE_KEY
          apiBaseUrl: https://api.voyageai.com/v1
          headers:
            X-Custom-Header: value
```

`apiBaseUrl` can also be set with the `VOYAGE_API_BASE_URL` environment variable.
