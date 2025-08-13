---
sidebar_label: Context Relevance
---

# Context relevance

The `context-relevance` assertion checks if your retrieved context is actually useful for answering the user's question.

**What it measures**: Given a user's query and some retrieved context, it evaluates what percentage of the context contains information relevant to answering that query. This helps identify when your RAG system retrieves off-topic, irrelevant, or noisy documents.

**Example**:

- Query: "What is the capital of France?"
- Good context (high score): "Paris is the capital of France, known for the Eiffel Tower."
- Poor context (low score): "France has great wine. The Pacific Ocean is large."

This metric evaluates your **retrieval quality**, not how the LLM uses the context.

## Required fields

The context-relevance assertion requires:

- `query` - The user's question (must be defined in test vars)
- `context` - The reference information to evaluate (defined via test vars or contextTransform)
- `threshold` (optional but recommended) - Minimum relevance score from 0 to 1 (defaults to 0)

## Configuration

### Basic usage

```yaml
assert:
  - type: context-relevance
    threshold: 0.8 # Require 80% relevance between context and query
```

:::warning
The default threshold is 0, which means the assertion will pass with any context (even completely irrelevant text). Always set an appropriate threshold value for meaningful evaluation.
:::

### Simple example

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json

prompts:
  - 'Answer: {{query}}'

providers:
  - id: openai:gpt-4o-mini

tests:
  # Example of relevant context (should pass)
  - vars:
      query: 'What is the capital of France?'
      context: 'Paris is the capital and largest city of France, located on the Seine River.'
    assert:
      - type: context-relevance
        threshold: 0.8 # This context is highly relevant ✓

  # Example of irrelevant context (should fail)
  - vars:
      query: 'What is the capital of France?'
      context: 'The Pacific Ocean is the largest ocean on Earth.'
    assert:
      - type: context-relevance
        threshold: 0.8 # This context is irrelevant ✗
```

### Complete RAG evaluation example

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'Evaluate both context relevance and answer quality'

prompts:
  - 'Answer based on context: {{query}}\n\nContext: {{context}}'

providers:
  - id: openai:gpt-4o-mini

tests:
  - description: 'Solar energy question with relevant context'
    vars:
      query: 'What are the main benefits of solar energy?'
      context: |
        Solar energy is renewable and sustainable. It reduces electricity bills
        by generating power from sunlight. Solar panels have low maintenance costs
        once installed. The technology helps reduce carbon emissions and combat
        climate change. Solar energy provides energy independence from the grid.
    assert:
      # First, check if the context is relevant to the question
      - type: context-relevance
        threshold: 0.75
      # Then, check if the answer uses the context appropriately
      - type: context-faithfulness
        threshold: 0.8
```

### Using contextTransform for dynamic context

When your provider returns context as part of its response (common in RAG systems), use `contextTransform` to extract it:

```yaml
# Example when your RAG system returns context in the response
providers:
  - id: file://my-rag-provider.js # Custom provider that returns { answer, context }

tests:
  - vars:
      query: 'What is the population of Tokyo?'
    assert:
      - type: context-relevance
        # highlight-next-line
        contextTransform: 'output.context' # Extract context from provider's response
        threshold: 0.8
```

### Complex contextTransform example

```yaml
# When context comes from multiple retrieved documents
assert:
  - type: context-relevance
    # highlight-next-line
    contextTransform: 'output.retrieved_docs.map(doc => doc.content).join("\n\n")'
    threshold: 0.7
```

:::note

**Understanding context-relevance**: This assertion evaluates whether your retrieved or provided context is relevant to the user's query. It does NOT check whether the LLM's answer uses the context (that's [`context-faithfulness`](/docs/configuration/expected-outputs/model-graded/context-faithfulness)).

You can provide context in two ways:

1. **Static context**: Define it directly in the `vars` section (useful for testing with predetermined context)
2. **Dynamic context**: Extract it from your RAG system's response using `contextTransform` (useful for evaluating real retrieval systems)

:::

## How it works

The context relevance checker:

1. Takes the user's query and the provided context
2. Evaluates how much of the context contains information relevant to answering the query
3. Returns a score from 0 to 1:
   - **1.0**: All context is relevant to the query
   - **0.5**: Half the context is relevant
   - **0.0**: Context contains no relevant information

This helps identify when your RAG system retrieves irrelevant or partially relevant documents.

## Related assertions

- [`context-faithfulness`](/docs/configuration/expected-outputs/model-graded/context-faithfulness) - Ensures the LLM output is grounded in the provided context
- [`context-recall`](/docs/configuration/expected-outputs/model-graded/context-recall) - Verifies that context contains expected information

## Further reading

- Learn more about [defining context in test cases](/docs/configuration/expected-outputs/model-graded#defining-context) including static and dynamic approaches
- Explore all [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for comprehensive evaluation options
- See the [RAG Evaluation Guide](/docs/guides/evaluate-rag) for a complete walkthrough of evaluating retrieval-augmented generation systems
