---
sidebar_label: Context Relevance
---

# Context relevance

The `context-relevance` assertion evaluates whether the provided context is relevant to answering the given query or question.

## Configuration

```yaml
assert:
  - type: context-relevance
    threshold: 0.8 # Score from 0 to 1
```

## Providing context

You can provide context in two ways:

### Using context variables

Include both query and context as variables in your test case:

```yaml
tests:
  - vars:
      query: 'What is the capital of France?'
      context: 'France is a country in Europe. Paris is the capital and largest city of France.'
    assert:
      - type: context-relevance
        threshold: 0.8
```

### Extracting from provider responses

If your provider returns context within the response, use `contextTransform`:

```yaml
assert:
  - type: context-relevance
    contextTransform: 'output.context'
    threshold: 0.8
```

For complex response structures:

```yaml
assert:
  - type: context-relevance
    contextTransform: 'output.retrieved_docs.map(d => d.content).join("\n")'
    threshold: 0.8
```

### How it works

The context relevance checker:

1. Analyzes the relationship between the user's query and the provided context
2. Evaluates whether the context contains information that helps answer the query
3. Returns a score from 0 to 1, where 1 means the context is highly relevant to the query

# Further reading

See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more options and the [RAG Evaluation Guide](/docs/guides/evaluate-rag) for complete examples.
