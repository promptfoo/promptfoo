---
sidebar_label: Voyage AI
description: "Leverage Voyage AI's domain-specific embedding models for enhanced semantic search, retrieval, and similarity comparisons"
---

# Voyage AI

[Voyage AI](https://www.voyageai.com/) is Anthropic's [recommended](https://docs.anthropic.com/en/docs/embeddings) embeddings provider. Promptfoo uses Voyage's text embeddings endpoint. Current text models include:

- `voyage-4-large` (highest-quality general-purpose and multilingual retrieval)
- `voyage-4` (general-purpose and multilingual retrieval)
- `voyage-4-lite` (latency- and cost-optimized retrieval)
- `voyage-code-3` (code retrieval)
- `voyage-finance-2` (finance retrieval and RAG)
- `voyage-law-2` (legal retrieval and RAG)

See Voyage's [current text model table](https://docs.voyageai.com/docs/embeddings) for context
windows, dimensions, and older models that remain available.

To use it, set the `VOYAGE_API_KEY` environment variable.

Use it like so:

```yaml
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
provider:
  id: voyage:voyage-4-large
  config:
    apiKey: XXX
    apiKeyEnvar: VOYAGE_API_KEY # if set, will fetch API key from this environment variable
    apiBaseUrl: https://api.voyageai.com/v1
```
