---
sidebar_label: Voyage AI
description: "Leverage Voyage AI's domain-specific embedding models for enhanced semantic search, retrieval, and similarity comparisons"
---

# Voyage AI

[Voyage AI](https://www.voyageai.com/) is Anthropic's [recommended](https://docs.anthropic.com/en/docs/embeddings) embeddings provider. It supports [all models](https://docs.voyageai.com/docs/embeddings). Latest models include:

- voyage-3-large (state-of-the-art general-purpose, Jan 2025)
- voyage-3.5 and voyage-3.5-lite (improved quality, May 2025)
- voyage-3 and voyage-3-lite (general-purpose with 32K context)
- voyage-multimodal-3 (text + images)
- voyage-context-3 (contextualized chunks)
- voyage-code-3 (code-specific retrieval)

To use it, set the `VOYAGE_API_KEY` environment variable.

Use it like so:

```yaml
provider: voyage:voyage-3-large
```

You can enable it for every similarity comparison using the `defaultTest` property:

```yaml
defaultTest:
  options:
    provider:
      embedding: voyage:voyage-3-large
```

You can also override the API key or API base URL:

```yaml
provider:
  id: voyage:voyage-3-large
  config:
    apiKey: XXX
    apiKeyEnvar: VOYAGE_API_KEY # if set, will fetch API key from this environment variable
    apiBaseUrl: https://api.voyageai.com/v1
```
