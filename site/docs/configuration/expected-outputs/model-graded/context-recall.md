---
sidebar_position: 50
description: 'Quantify retrieval quality by measuring how thoroughly LLM responses cover expected information from source materials.'
---

# Context recall

Checks if your retrieved context contains the information needed to generate a known correct answer.

**Use when**: You have ground truth answers and want to verify your retrieval finds supporting evidence.

**How it works**: Breaks the expected answer into statements and checks if each can be attributed to the context. Score = attributable statements / total statements.

**Example**:

```text
Expected: "Python was created by Guido van Rossum in 1991"
Context: "Python was released in 1991"
Score: 0.5 (year ✓, creator ✗)
```

## Configuration

```yaml
assert:
  - type: context-recall
    value: 'Python was created by Guido van Rossum in 1991'
    threshold: 1.0 # Context must support entire answer
```

### Required fields

- `value` - Expected answer/ground truth
- `context` - Retrieved text (in vars or via `contextTransform`)
- `threshold` - Minimum score 0-1 (default: 0)

### Full example

```yaml
tests:
  - vars:
      query: 'Who created Python?'
      context: 'Guido van Rossum created Python in 1991.'
    assert:
      - type: context-recall
        value: 'Python was created by Guido van Rossum in 1991'
        threshold: 1.0
```

### Dynamic context extraction

For RAG systems that return context with their response:

```yaml
# Provider returns { answer: "...", context: "..." }
assert:
  - type: context-recall
    value: 'Expected answer here'
    contextTransform: 'output.context' # Extract context field
    threshold: 0.8
```

## Limitations

- Binary attribution (no partial credit)
- Works best with factual statements
- Requires known correct answers

## Related metrics

- [`context-relevance`](/docs/configuration/expected-outputs/model-graded/context-relevance) - Is retrieved context relevant?
- [`context-faithfulness`](/docs/configuration/expected-outputs/model-graded/context-faithfulness) - Does output stay faithful to context?

## Further reading

- [Defining context in test cases](/docs/configuration/expected-outputs/model-graded#defining-context)
- [RAG Evaluation Guide](/docs/guides/evaluate-rag)
