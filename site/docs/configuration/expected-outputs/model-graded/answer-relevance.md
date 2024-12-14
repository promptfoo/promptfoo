# Answer Relevance

The `answer-relevance` assertion evaluates whether an LLM's output is relevant to the original query. It uses a combination of embedding similarity and LLM evaluation to determine relevance.

### How to use it

To use the `answer-relevance` assertion type, add it to your test configuration like this:

```yaml
assert:
  - type: answer-relevance
    threshold: 0.7 # Score between 0 and 1
```

### How it works

The answer relevance checker:

1. Uses an LLM to generate potential questions that the output could be answering
2. Compares these questions with the original query using embedding similarity
3. Calculates a relevance score based on the similarity scores

A higher threshold requires the output to be more closely related to the original query.

### Example Configuration

Here's a complete example showing how to use answer relevance:

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

### Overriding the Providers

Answer relevance uses two types of providers:

- A text provider for generating questions
- An embedding provider for calculating similarity

You can override either or both:

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

You can also override providers at the assertion level:

```yaml
assert:
  - type: answer-relevance
    threshold: 0.8
    provider:
      text: anthropic:claude-2
      embedding: cohere:embed-english-v3.0
```

### Customizing the Prompt

You can customize the question generation prompt using the `rubricPrompt` property:

```yaml
defaultTest:
  options:
    rubricPrompt: |
      Given this answer: {{output}}

      Generate 3 questions that this answer would be appropriate for.
      Make the questions specific and directly related to the content.
```

# Further reading

See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more options.
