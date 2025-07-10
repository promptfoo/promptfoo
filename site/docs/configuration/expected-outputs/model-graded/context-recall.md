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

## Defining context

Context can be defined in one of two ways: statically using test case variables or dynamically from the provider's response.

### Statically using a test case variable

Set `context` as a variable in your test case:

```yaml
tests:
  - vars:
      context: 'Paris is the capital of France. It has a population of over 2 million people.'
    assert:
      - type: context-recall
        value: 'Paris is the capital of France'
        threshold: 0.8
```

### Dynamically from the provider's response

If your provider returns context within the response, use `contextTransform` to extract it. For example:

```typescript
interface Output {
  content: string;
  citations: string;
  retrieved_docs: {
    content: string;
  }[];
}
```

```yaml
assert:
  - type: context-recall
    contextTransform: 'output.citations'
    value: 'Expected source'
    threshold: 0.8
```

Or to use the retrieved documents:

```yaml
assert:
  - type: context-recall
    contextTransform: 'output.retrieved_docs.map(d => d.content).join("\n")'
    value: 'Expected document'
    threshold: 0.8
```

See the [Context Transform reference](/docs/configuration/expected-outputs/model-graded#context-transform) for more details.

### How it works

The context recall checker:

1. Analyzes whether the provided context contains the information specified in the `value` field
2. Evaluates the completeness and accuracy of information retrieval
3. Returns a score from 0 to 1, where 1 means the context fully contains the expected information

# Further reading

See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more options and the [RAG Evaluation Guide](/docs/guides/evaluate-rag) for complete examples.
