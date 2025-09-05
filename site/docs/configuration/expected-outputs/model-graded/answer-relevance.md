---
sidebar_label: Answer Relevance
description: 'Score LLM response relevance and completeness against user queries'
---

# Answer relevance

The `answer-relevance` assertion checks if the LLM response answers the user's question.

**What it measures**: Given a user's query and the LLM's response, it evaluates how well the response addresses what was asked. It generates potential questions the response could answer, then compares these with the original query using embedding similarity.

**Example**:

- Query: "What is the capital of France?"
- Good response (high score): "The capital of France is Paris."
- Poor response (low score): "France has excellent wine and cheese." (doesn't answer the question)

## Required fields

The answer-relevance assertion requires:

- `query` or prompt - The user's question (from test vars or prompt)
- Output - The LLM's response to evaluate
- `threshold` (optional but recommended) - Minimum relevance score from 0 to 1 (defaults to 0)

## Configuration

### Basic usage

```yaml
assert:
  - type: answer-relevance
    threshold: 0.8
```

:::warning
The default threshold is 0, which means the assertion will pass even with completely irrelevant responses. Always set an appropriate threshold value for meaningful evaluation.
:::

## How it works

The answer relevance checker:

1. Uses an LLM to generate potential questions the response could be answering
2. Compares these questions with the original query using embedding similarity
3. Returns a relevance score from 0 to 1

This approach catches responses that are topically related but don't actually answer the specific question asked.

### Complete example

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'Ensure LLM responses are relevant to user queries'

prompts:
  - 'Tell me about {{topic}}'

providers:
  - id: openai:gpt-4.1-mini

tests:
  - description: 'Test response relevance for quantum computing query'
    vars:
      topic: quantum computing
    assert:
      - type: answer-relevance
        threshold: 0.8

  - description: 'Test with explicit query variable'
    vars:
      query: 'What are the benefits of exercise?'
      topic: 'physical fitness'
    assert:
      - type: answer-relevance
        threshold: 0.85
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
        id: openai:gpt-4.1
        config:
          temperature: 0
      embedding:
        id: openai:embeddings:text-embedding-3-large
```

You can also override providers at the assertion level:

```yaml
assert:
  - type: answer-relevance
    threshold: 0.8
    provider:
      text: anthropic:messages:claude-opus-4-1-latest
      embedding: cohere:embedding:embed-english-v3.0
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

## Related assertions

- [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric) - For custom relevance criteria
- [`similar`](/docs/configuration/expected-outputs/similar) - For semantic similarity to expected answers
- [`context-faithfulness`](/docs/configuration/expected-outputs/model-graded/context-faithfulness) - When working with RAG systems

## Further reading

- [Model-graded metrics](/docs/configuration/expected-outputs/model-graded) overview
- [Getting Started](/docs/getting-started) guide
