# Answer Relevance

The `answer-relevance` assertion type evaluates whether the LLM's response is relevant to the input query. This metric is inspired by [RAGAS's Answer Relevance](https://docs.ragas.io/en/v0.1.21/concepts/metrics/answer_relevance.html) evaluation.

### How to use it

Add the assertion to your test configuration:

```yaml
assert:
  - type: answer-relevance
    threshold: 0.8 # Score threshold (0.0 to 1.0)
```

### How it works

Under the hood, `answer-relevance` uses both embedding and text models to:

1. Compare semantic similarity between the query and response
2. Evaluate if the response directly addresses the query's intent

The assertion requires either:

- A `query` variable in your test
- The original prompt text

Example with query variable:

```yaml
tests:
  - vars:
      query: 'What is the capital of France?'
    assert:
      - type: answer-relevance
        threshold: 0.9
```

Example using prompt text:

```yaml
prompts:
  - 'What is the capital of {{country}}?'
providers:
  - openai:gpt-4
tests:
  - vars:
      country: France
    assert:
      - type: answer-relevance
        threshold: 0.9
```

### Overriding providers

You can override both the embedding and text providers:

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

- Based on [RAGAS Answer Relevance](https://docs.ragas.io/en/v0.1.21/concepts/metrics/answer_relevance.html) methodology
- See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more configuration options
