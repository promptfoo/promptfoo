---
sidebar_label: Context Recall
---

# Context recall

The `context-recall` assertion verifies that your retrieval system found all the important information it should have found.

**What it measures**: Given some ground truth (the correct/complete answer) and the context your system retrieved, it checks how much of that ground truth appears in the context. This catches when your retrieval system misses critical information.

**Example**:

- Ground truth: "Paris is the capital of France. It has 2.2 million residents."
- Good context (high score): "Paris, capital of France, has a population of 2.2 million."
- Poor context (low score): "Paris is in France." (missing capital status and population)

This metric evaluates your **retrieval completeness** - did you find all the facts you needed?

## Required fields

The context-recall assertion requires:

- `value` - The expected information/ground truth that should appear in the context
- `context` - The retrieved context to evaluate (defined via test vars or contextTransform)
- `threshold` (optional but recommended) - Minimum recall score from 0 to 1 (defaults to 0)

## Configuration

### Basic usage

```yaml
assert:
  - type: context-recall
    value: 'Paris is the capital of France' # Ground truth to find
    threshold: 0.8 # Require 80% recall
```

:::warning
The default threshold is 0, which means the assertion will pass even if the context contains none of the expected information. Always set an appropriate threshold value for meaningful evaluation.
:::

### Complete example

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'Test retrieval system recall'

prompts:
  - 'Answer: {{query}}'

providers:
  - id: openai:gpt-4o-mini

tests:
  - description: 'Test context contains necessary information'
    vars:
      query: 'What are the main features of Python?'
      context: |
        Python is a high-level programming language known for its simplicity.
        It supports multiple programming paradigms including procedural, 
        object-oriented, and functional programming. Python has dynamic typing
        and automatic memory management.
    assert:
      - type: context-recall
        value: |
          Python is high-level, simple, supports multiple paradigms,
          has dynamic typing and automatic memory management
        threshold: 0.8 # Expect 80% of ground truth in context
```

### Using contextTransform for dynamic context

When your provider returns context as part of its response (common in RAG systems), use `contextTransform` to extract it:

```yaml
# Example when your RAG system returns context in the response
providers:
  - id: file://my-rag-provider.js # Custom provider that returns { answer, context }

tests:
  - vars:
      query: 'What is machine learning?'
    assert:
      - type: context-recall
        value: 'Machine learning is a subset of AI that enables systems to learn from data'
        # highlight-next-line
        contextTransform: 'output.context' # Extract context from provider's response
        threshold: 0.9 # High threshold for definition accuracy
```

### Complex contextTransform example

```yaml
# When context comes from multiple retrieved chunks
assert:
  - type: context-recall
    value: 'Expected comprehensive information about the topic'
    # highlight-next-line
    contextTransform: 'output.retrieved_chunks.map(chunk => chunk.content).join("\n\n")'
    threshold: 0.75
```

:::note
**Understanding context-recall**: This assertion verifies that your retrieval system found the right information. It does NOT check if the context is relevant to the query (that's [`context-relevance`](/docs/configuration/expected-outputs/model-graded/context-relevance)) or if the LLM uses the context properly (that's [`context-faithfulness`](/docs/configuration/expected-outputs/model-graded/context-faithfulness)).

You can provide context in two ways:

1. **Static context**: Define it directly in the `vars` section (useful for testing with predetermined context)
2. **Dynamic context**: Extract it from your RAG system's response using `contextTransform` (useful for evaluating real retrieval systems)
   :::

## How it works

The context recall checker:

1. Takes the expected information (ground truth) from the `value` field
2. Analyzes whether the provided context contains this information
3. Returns a score from 0 to 1:
   - **1.0**: Context contains all expected information
   - **0.5**: Context contains half the expected information
   - **0.0**: Context contains none of the expected information

This helps identify when your retrieval system misses important information.

## Related assertions

- [`context-relevance`](/docs/configuration/expected-outputs/model-graded/context-relevance) - Checks if context is relevant to the query
- [`context-faithfulness`](/docs/configuration/expected-outputs/model-graded/context-faithfulness) - Ensures the LLM output is grounded in context

## Further reading

- Learn more about [defining context in test cases](/docs/configuration/expected-outputs/model-graded#defining-context) including static and dynamic approaches
- Explore all [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for comprehensive evaluation options
- See the [RAG Evaluation Guide](/docs/guides/evaluate-rag) for a complete walkthrough of evaluating retrieval-augmented generation systems
