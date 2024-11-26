# Context Relevance

The `context-relevance` assertion type evaluates whether the retrieved context is relevant to the input query in RAG (Retrieval-Augmented Generation) applications. This metric is inspired by RAGAS's context relevancy evaluation methodology.

### How to use it

Add the assertion to your test configuration:

```yaml
assert:
  - type: context-relevance
    threshold: 0.7 # Score between 0.0 and 1.0
```

### Requirements

The assertion requires two variables in your test:

- `query`: The user's question or input
- `context`: The retrieved context/documents

### How it works

Under the hood, `context-relevance` evaluates:

1. The semantic similarity between the query and context
2. The proportion of relevant sentences in the context needed to answer the query
3. Whether the context contains information necessary to address the query

Example configuration:

```yaml
tests:
  - vars:
      query: "What is the company's maternity leave policy?"
      context: |
        The company offers comprehensive benefits including:
        - 4 months paid maternity leave
        - Flexible return-to-work schedule
        - Childcare assistance program
    assert:
      - type: context-relevance
        threshold: 0.8
```

### Overriding providers

Like other model-graded metrics, you can override both the embedding and text providers:

```yaml
defaultTest:
  options:
    provider:
      text:
        id: openai:gpt-4
      embedding:
        id: openai:text-embedding-ada-002
```

### References

- Based on RAGAS context relevancy evaluation methodology
- See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more configuration options
