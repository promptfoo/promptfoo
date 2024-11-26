# Context Recall

The `context-recall` assertion type evaluates whether the provided context contains the necessary ground truth information. This metric is inspired by [RAGAS's Context Recall](https://docs.ragas.io/en/v0.1.21/concepts/metrics/context_recall.html) evaluation methodology.

### How to use it

Add the assertion to your test configuration:

```yaml
assert:
  - type: context-recall
    threshold: 0.7 # Score between 0.0 and 1.0
    value: 'The ground truth statement to check for'
```

### Requirements

The assertion requires:

- A `context` variable containing the retrieved documents/context
- A `value` containing the ground truth statement to check for
- A `threshold` for the minimum acceptable score

### How it works

Under the hood, `context-recall` evaluates:

1. Whether the ground truth information appears in the context
2. The semantic similarity between the ground truth and context segments
3. The completeness of information coverage

Example configuration:

```yaml
tests:
  - vars:
      context: |
        Our company policy states:
        - Maximum purchase without approval: $500
        - Purchases above $500 require manager approval
        - Emergency purchases may follow expedited process
    assert:
      - type: context-recall
        threshold: 0.9
        value: max purchase price without approval is $500
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

- Based on [RAGAS Context Recall](https://docs.ragas.io/en/v0.1.21/concepts/metrics/context_recall.html) methodology
- See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more configuration options
