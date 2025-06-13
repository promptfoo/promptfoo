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
    threshold: 0.8  # Score from 0 to 1
```

Note: This assertion requires the `context` variable to be set in your test.

## Extracting context from responses

If your provider returns the context within the response (common in RAG systems), use `contextTransform` to extract it:

```yaml
assert:
  - type: context-recall
    contextTransform: 'output.context'  # Extract from response.context
    value: 'Expected fact'
    threshold: 0.8
```

For more complex extractions (e.g., combining multiple documents):

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

### Example

```yaml
tests:
  - vars:
      context: "Paris is the capital of France. It has a population of over 2 million people."
    assert:
      - type: context-recall
        value: 'Paris is the capital of France'
        threshold: 0.8
```

The assertion will pass if the provided context contains the expected fact about Paris being France's capital.

# Further reading

See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more options.
