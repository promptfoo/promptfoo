# Answer Relevance

The `answer-relevance` assertion evaluates whether an LLM's response is relevant to the input query. This metric is inspired by [RAGAS's Answer Relevance](https://docs.ragas.io/en/v0.1.21/concepts/metrics/answer_relevance.html) evaluation and uses a combination of embedding similarity and LLM evaluation.

### How to use it

Add the assertion to your test configuration:

```yaml
assert:
  - type: answer-relevance
    threshold: 0.8 # Score between 0.0 and 1.0
```

### How it works

The answer relevance checker uses both embedding and text models to:

1. Uses an LLM to generate potential questions that the output could be answering
2. Compares these questions with the original query using embedding similarity
3. Calculates a final relevance score based on semantic similarity and question matching

The assertion requires either:

- A `query` variable in your test, or
- The original prompt text

### Example Configurations

Using a query variable:

```yaml
tests:
  - vars:
      query: 'What is the capital of France?'
    assert:
      - type: answer-relevance
        threshold: 0.9
```

Using prompt text:

```yaml
prompts:
  - 'Tell me about {{topic}}'
providers:
  - openai:gpt-4
tests:
  - vars:
      topic: quantum computing
    assert:
      - type: answer-relevance
        threshold: 0.8
```

### Customizing Providers

Answer relevance uses two types of providers:

- A text provider for generating questions and evaluations
- An embedding provider for calculating similarity

You can override the providers globally:

```yaml
defaultTest:
  options:
    provider:
      text:
        id: openai:gpt-4
        config:
          temperature: 0
      embedding:
        id: openai:text-embedding-ada-002
```

Or at the assertion level:

```yaml
assert:
  - type: answer-relevance
    threshold: 0.8
    provider:
      text: anthropic:claude-2
      embedding: cohere:embed-english-v3.0
```

### Customizing the Prompt

You can customize the question generation prompt:

```yaml
defaultTest:
  options:
    rubricPrompt: |
      Given this answer: {{output}}

      Generate 3 questions that this answer would be appropriate for.
      Make the questions specific and directly related to the content.
```

### Further Reading

- See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more configuration options
- Learn more about [RAGAS Answer Relevance](https://docs.ragas.io/en/v0.1.21/concepts/metrics/answer_relevance.html) methodology
