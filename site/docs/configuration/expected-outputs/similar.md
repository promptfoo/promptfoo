---
sidebar_position: 55
---

# Similarity (embeddings)

The `similar` assertion checks if an embedding of the LLM's output
is semantically similar to the expected value,
using a cosine similarity threshold.

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
