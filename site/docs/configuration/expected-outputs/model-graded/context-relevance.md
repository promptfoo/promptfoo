---
sidebar_label: Context Relevance
description: 'Assess RAG retrieval quality by evaluating context relevance, precision, and usefulness for answering user queries effectively'
---

# Context relevance

The `context-relevance` assertion evaluates whether the provided context is relevant to answering the given query or question.

## Configuration

```yaml
assert:
  - type: context-relevance
    threshold: 0.8 # Score from 0 to 1
```

:::note

This assertion requires `query`, context, and the LLM's output to evaluate relevance. See [Defining context](/docs/configuration/expected-outputs/model-graded#defining-context) for instructions on how to set context in your test cases.

:::

### How it works

The context relevance checker:

1. Analyzes the relationship between the user's query and the provided context
2. Evaluates whether the context contains information that helps answer the query
3. Returns a score from 0 to 1, where 1 means the context is highly relevant to the query

# Further reading

- See [Defining context](/docs/configuration/expected-outputs/model-graded#defining-context) for instructions on how to set context in your test cases.
- See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more options and the [RAG Evaluation Guide](/docs/guides/evaluate-rag) for complete examples.
