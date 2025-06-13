---
sidebar_label: Context Relevance
---

# Context relevance

The `context-relevance` assertion evaluates whether the provided context is relevant to answering the given query or question.

## Configuration

```yaml
assert:
  - type: context-relevance
    threshold: 0.8  # Score from 0 to 1
```

Note: This assertion requires both `query` and `context` variables to be set in your test.

## Extracting context from responses

If your provider returns the context within the response (common in RAG systems), use `contextTransform` to extract it:

```yaml
assert:
  - type: context-relevance
    contextTransform: 'output.context'  # Extract from response.context
    threshold: 0.8
```

For more complex extractions (e.g., combining multiple documents):

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

### Example

```yaml
tests:
  - vars:
      query: "What is the capital of France?"
      context: "France is a country in Europe. Paris is the capital and largest city of France."
    assert:
      - type: context-relevance
        threshold: 0.8
```

The assertion will pass if the provided context is relevant to answering the question about France's capital.

# Further reading

See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more options.
