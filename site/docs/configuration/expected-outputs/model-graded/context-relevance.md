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

## Defining context

Context can be defined in one of two ways: statically using test case variables or dynamically from the provider's response.

### Statically using a test case variable

Set `query` and `context` as variables in your test case:

```yaml
tests:
  - vars:
      query: 'What is the capital of France?'
      context: 'France is a country in Europe. Paris is the capital and largest city of France.'
    assert:
      - type: context-relevance
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
  - type: context-relevance
    contextTransform: 'output.citations'
    threshold: 0.8
```

Or to use the retrieved documents:

```yaml
assert:
  - type: context-relevance
    contextTransform: 'output.retrieved_docs.map(d => d.content).join("\n")'
    threshold: 0.8
```

See the [Context Transform reference](/docs/configuration/reference#context-transforms) for more details.

### How it works

The context relevance checker:

1. Analyzes the relationship between the user's query and the provided context
2. Evaluates whether the context contains information that helps answer the query
3. Returns a score from 0 to 1, where 1 means the context is highly relevant to the query

# Further reading

See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more options and the [RAG Evaluation Guide](/docs/guides/evaluate-rag) for complete examples.
