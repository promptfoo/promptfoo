---
sidebar_label: Context Recall
---

# Context recall

The `context-recall` assertion evaluates whether the provided context contains the information needed to answer a specific question or verify a particular fact.

## Configuration

```yaml
assert:
  - type: context-recall
    value: 'Expected fact to find in context'
    threshold: 0.8 # Score from 0 to 1
```

## Providing context

You can provide context in two ways:

### Using context variables

Include the context as a variable in your test case:

```yaml
tests:
  - vars:
      context: 'Paris is the capital of France. It has a population of over 2 million people.'
    assert:
      - type: context-recall
        value: 'Paris is the capital of France'
        threshold: 0.8
```

### Extracting from provider responses

If your provider returns context within the response, use `contextTransform`:

```yaml
assert:
  - type: context-recall
    contextTransform: 'output.context'
    value: 'Expected fact'
    threshold: 0.8
```

For complex response structures:

```yaml
assert:
  - type: context-recall
    contextTransform: 'output.retrieved_docs.map(d => d.content).join("\n")'
    value: 'Expected fact'
    threshold: 0.8
```

### How it works

The context recall checker:

1. Analyzes whether the provided context contains the information specified in the `value` field
2. Evaluates the completeness and accuracy of information retrieval
3. Returns a score from 0 to 1, where 1 means the context fully contains the expected information

# Further reading

See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more options and the [RAG Evaluation Guide](/docs/guides/evaluate-rag) for complete examples.
