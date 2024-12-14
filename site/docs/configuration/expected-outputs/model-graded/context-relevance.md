# Context Relevance

The `context-relevance` assertion evaluates whether the retrieved context is relevant to the input query in RAG (Retrieval-Augmented Generation) applications. This metric ensures that the retrieved information is actually useful for answering the question and is inspired by RAGAS's context relevancy evaluation methodology.

### Requirements

The assertion requires two variables in your test:

- `query`: The user's question or input
- `context`: The retrieved context/documents

### How to use it

Add the assertion to your test configuration:

```yaml
assert:
  - type: context-relevance
    threshold: 0.8 # Score between 0.0 and 1.0
```

### How it works

The context relevance checker evaluates:

1. The semantic similarity between the query and context
2. Whether the context contains information necessary to address the query
3. The relevance of each context segment to the query intent

A higher threshold requires the context to be more closely related to the query.

### Example Configuration

```yaml
tests:
  - vars:
      query: "What is the company's maternity leave policy?"
      context: |
        The company offers comprehensive benefits including:
        - 4 months paid maternity leave
        - Flexible return-to-work schedule
        - Childcare assistance program
    assert:
      - type: context-relevance
        threshold: 0.8
```

### Customizing the Provider

You can override the default provider in several ways:

```yaml
defaultTest:
  options:
    provider:
      text:
        id: openai:gpt-4
      embedding:
        id: openai:text-embedding-ada-002
```

Or at the assertion level:

```yaml
assert:
  - type: context-relevance
    threshold: 0.8
    provider: openai:gpt-4
```

### Customizing the Prompt

You can customize the evaluation prompt using `rubricPrompt`:

```yaml
defaultTest:
  options:
    rubricPrompt: |
      Context: {{context}}
      Query: {{query}}

      Break down the context into individual statements.
      For each statement, mark it as [RELEVANT] if it helps answer the query,
      or [NOT RELEVANT] if it does not.
```

### Further Reading

- See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more configuration options
