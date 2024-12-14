# Context Faithfulness

The `context-faithfulness` assertion evaluates whether the LLM's response is faithful to the provided context, ensuring that the generated answer doesn't include information not present in the context. This metric is essential for RAG (Retrieval-Augmented Generation) applications to prevent hallucination and is inspired by [RAGAS's Faithfulness metric](https://docs.ragas.io/en/latest/concepts/metrics/available_metrics/faithfulness/).

### Requirements

The assertion requires three variables in your test:

- `query`: The user's question
- `context`: The retrieved context/documents
- `output`: The LLM's response to evaluate

### How to use it

Add the assertion to your test configuration:

```yaml
assert:
  - type: context-faithfulness
    threshold: 0.9 # Score between 0.0 and 1.0
```

### How it works

The context faithfulness checker evaluates:

1. Whether claims in the output are supported by the context
2. The degree of hallucination or fabrication in the response
3. The accuracy of information attribution

A higher threshold requires the output to be more strictly supported by the context.

### Example Configuration

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

### Customizing the Provider

You can override the default provider in several ways:

```yaml
defaultTest:
  options:
    provider:
      text:
        id: openai:gpt-4
        config:
          temperature: 0
```

Or at the assertion level:

```yaml
assert:
  - type: context-faithfulness
    threshold: 0.9
    provider: openai:gpt-4
```

### Customizing the Prompt

You can customize the evaluation prompts using `rubricPrompt`:

```yaml
defaultTest:
  options:
    rubricPrompt:
      - |
        Question: {{question}}
        Answer: {{answer}}
        Extract all factual claims from the answer, one per line.
      - |
        Context: {{context}}
        Statements: {{statements}}
        For each statement, determine if it is supported by the context.
        Answer YES if the statement is fully supported, NO if not.
```

### Further Reading

- See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more configuration options
- Learn more about [RAGAS Faithfulness metric](https://docs.ragas.io/en/latest/concepts/metrics/available_metrics/faithfulness/)
