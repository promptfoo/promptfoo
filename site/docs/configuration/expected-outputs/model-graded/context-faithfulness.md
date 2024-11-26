# Context Faithfulness

The `context-faithfulness` assertion type evaluates whether the LLM's response is faithful to the provided context, ensuring that the generated answer doesn't include information not present in the context. This metric is inspired by [RAGAS's Faithfulness metric](https://docs.ragas.io/en/latest/concepts/metrics/available_metrics/faithfulness/).

### How to use it

Add the assertion to your test configuration:

```yaml
assert:
  - type: context-faithfulness
    threshold: 0.7 # Score between 0.0 and 1.0
```

### Requirements

The assertion requires three variables in your test:

- `query`: The user's question
- `context`: The retrieved context/documents
- `output`: The LLM's response to evaluate

### How it works

Under the hood, `context-faithfulness` evaluates:

1. Whether claims in the output are supported by the context
2. The degree of hallucination or fabrication in the response
3. The accuracy of information attribution

Example configuration:

```yaml
tests:
  - vars:
      query: "What are our company's core values?"
      context: |
        Our core values are:
        1. Innovation - We embrace new ideas
        2. Integrity - We act with honesty
        3. Teamwork - We succeed together
      output: |
        The company's core values focus on innovation, integrity, and teamwork.
        Innovation means embracing new ideas, integrity represents honest actions,
        and teamwork emphasizes collective success.
    assert:
      - type: context-faithfulness
        threshold: 0.9
```

### Overriding providers

Like other model-graded metrics, you can override the text provider:

```yaml
defaultTest:
  options:
    provider:
      text:
        id: openai:gpt-4
        config:
          temperature: 0
```

### References

- Based on [RAGAS Faithfulness metric](https://docs.ragas.io/en/latest/concepts/metrics/available_metrics/faithfulness/)
- See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more configuration options
