---
sidebar_position: 55
description: Calculate semantic similarity scores between actual and expected outputs using advanced embedding models and multiple distance metrics
---

# Similarity (embeddings)

The `similar` assertion checks if an embedding of the LLM's output
is semantically similar to the expected value,
using a configurable similarity or distance metric with a threshold.

By default, embeddings are computed via OpenAI's `text-embedding-3-large` model.

Example:

```yaml
assert:
  - type: similar
    value: 'The expected output'
    threshold: 0.8
```

If you provide an array of values, the test will pass if it is similar to at least one of them:

```yaml
assert:
  - type: similar
    value:
      - The expected output
      - Expected output
      - file://my_expected_output.txt
    threshold: 0.8
```

## Similarity Metrics

You can specify which metric to use by including it in the assertion type. The default is `similar` (cosine similarity).

### Cosine Similarity (default)

Measures the cosine of the angle between two vectors. Range: -1 to 1 (higher is more similar), though text embeddings typically produce values between 0 and 1.

```yaml
assert:
  # Default - uses cosine similarity
  - type: similar
    value: 'The expected output'
    threshold: 0.8

  # Explicit cosine
  - type: similar:cosine
    value: 'The expected output'
    threshold: 0.8
```

**When to use:** Best for semantic similarity where you care about the direction of the embedding vector, not its magnitude. This is the industry standard for embeddings.

### Dot Product

Computes the dot product of two vectors. Range: unbounded, but typically 0 to 1 for normalized embeddings (higher is more similar).

```yaml
assert:
  - type: similar:dot
    value: 'The expected output'
    threshold: 0.8
```

**When to use:** Useful when you want to match the metric used in your production vector database (many use dot product for performance). For normalized embeddings, dot product is nearly equivalent to cosine similarity.

### Euclidean Distance

Computes the straight-line distance between two vectors. Range: 0 to ∞ (lower is more similar).

```yaml
assert:
  - type: similar:euclidean
    value: 'The expected output'
    threshold: 0.5 # Maximum distance threshold
```

**When to use:** When you care about both the angle and magnitude differences between vectors. Note that the threshold represents the _maximum_ distance (not minimum similarity), so lower values are stricter.

**Important:** For euclidean distance, the threshold semantics are inverted - it represents the _maximum_ acceptable distance rather than minimum similarity.

## Overriding the provider

By default `similar` will use OpenAI. To specify the model that creates the embeddings, do one of the following:

1. Use `test.options` or `defaultTest.options` to override the provider across the entire test suite. For example:

   ```yaml
   defaultTest:
     options:
       provider:
         embedding:
           id: azureopenai:embedding:text-embedding-ada-002
           config:
             apiHost: xxx.openai.azure.com
   tests:
     assert:
       - type: similar
         value: Hello world
   ```

2. Set `assertion.provider` on a per-assertion basis. For example:

   ```yaml
   tests:
     assert:
       - type: similar
         value: Hello world
         provider: huggingface:sentence-similarity:sentence-transformers/all-MiniLM-L6-v2
   ```
