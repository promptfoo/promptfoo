---
sidebar_position: 50
description: 'Measure LLM faithfulness to source context by detecting unsupported claims in responses.'
---

# Context faithfulness

Checks if the LLM's response only makes claims that are supported by the provided context.

**Use when**: You need to ensure the LLM isn't adding information beyond what was retrieved.

**How it works**: Extracts factual claims from the response, then verifies each against the context. Score = supported claims / total claims.

**Example**:

```text
Context: "Paris is the capital of France."
Response: "Paris, with 2.2 million residents, is France's capital."
Score: 0.5 (capital ✓, population ✗)
```

## Configuration

```yaml
assert:
  - type: context-faithfulness
    threshold: 0.9 # Require 90% of claims to be supported
```

### Required fields

- `query` - User's question (in test vars)
- `context` - Reference text (in vars or via `contextTransform`)
- `threshold` - Minimum score 0-1 (default: 0)

### Full example

```yaml
tests:
  - vars:
      query: 'What is the capital of France?'
      context: 'Paris is the capital and largest city of France.'
    assert:
      - type: context-faithfulness
        threshold: 0.9
```

### Dynamic context extraction

For RAG systems that return context with their response:

```yaml
# Provider returns { answer: "...", context: "..." }
assert:
  - type: context-faithfulness
    contextTransform: 'output.context' # Extract context field
    threshold: 0.9
```

### Custom grading

Override the default grader:

```yaml
assert:
  - type: context-faithfulness
    provider: openai:gpt-4 # Use a different model for grading
    threshold: 0.9
```

## Limitations

- Depends on judge LLM quality
- May miss implicit claims
- Performance degrades with very long contexts

## Related metrics

- [`context-relevance`](/docs/configuration/expected-outputs/model-graded/context-relevance) - Is retrieved context relevant?
- [`context-recall`](/docs/configuration/expected-outputs/model-graded/context-recall) - Does context support the expected answer?

## Further reading

- [Defining context in test cases](/docs/configuration/expected-outputs/model-graded#defining-context)
- [RAG Evaluation Guide](/docs/guides/evaluate-rag)
