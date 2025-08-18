---
sidebar_label: Context Recall
description: 'Quantify retrieval quality by measuring how thoroughly LLM responses incorporate all relevant context information provided'
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

:::note

This assertion requires context and the LLM's output to evaluate recall. See [Defining context](/docs/configuration/expected-outputs/model-graded#defining-context) for instructions on how to set context in your test cases.

:::

### How it works

The context recall checker:

1. Analyzes whether the provided context contains the information specified in the `value` field
2. Evaluates the completeness and accuracy of information retrieval
3. Returns a score from 0 to 1, where 1 means the context fully contains the expected information

# Further reading

- See [Defining context](/docs/configuration/expected-outputs/model-graded#defining-context) for instructions on how to set context in your test cases.
- See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more options and the [RAG Evaluation Guide](/docs/guides/evaluate-rag) for complete examples.
