---
sidebar_position: 50
description: 'Assess RAG retrieval quality by evaluating context relevance, precision, and usefulness for answering queries.'
---

# Context relevance

Measures what fraction of retrieved context is minimally needed to answer the query.

**Use when**: You want to check if your retrieval is returning too much irrelevant content.

**How it works**: Extracts only the sentences absolutely required to answer the query. Score = required sentences / total sentences.

:::warning
This metric finds the MINIMUM needed, not all relevant content. A low score might mean good retrieval (found answer plus supporting context) or bad retrieval (lots of irrelevant content).
:::

**Example**:

```text
Query: "What is the capital of France?"
Context: "Paris is the capital. France has great wine. The Eiffel Tower is in Paris."
Score: 0.33 (only first sentence required)
```

## Configuration

```yaml
assert:
  - type: context-relevance
    threshold: 0.3 # At least 30% should be essential
```

### Required fields

- `query` - User's question (in test vars)
- `context` - Retrieved text (in vars or via `contextTransform`)
- `threshold` - Minimum score 0-1 (default: 0)

### Full example

```yaml
tests:
  - vars:
      query: 'What is the capital of France?'
      context: 'Paris is the capital of France.'
    assert:
      - type: context-relevance
        threshold: 0.8 # Most content should be essential
```

### Dynamic context extraction

For RAG systems that return context with their response:

```yaml
# Provider returns { answer: "...", context: "..." }
assert:
  - type: context-relevance
    contextTransform: 'output.context' # Extract context field
    threshold: 0.3
```

## Score interpretation

- **0.8-1.0**: Almost all content is essential (very focused or minimal retrieval)
- **0.3-0.7**: Mixed essential and supporting content (often ideal)
- **0.0-0.3**: Mostly non-essential content (may indicate poor retrieval)

## Limitations

- Only identifies minimum sufficient content
- Sentence-level granularity
- Score interpretation varies by use case

## Related metrics

- [`context-faithfulness`](/docs/configuration/expected-outputs/model-graded/context-faithfulness) - Does output stay faithful to context?
- [`context-recall`](/docs/configuration/expected-outputs/model-graded/context-recall) - Does context support expected answer?

## Further reading

- [Defining context in test cases](/docs/configuration/expected-outputs/model-graded#defining-context)
- [RAG Evaluation Guide](/docs/guides/evaluate-rag)
