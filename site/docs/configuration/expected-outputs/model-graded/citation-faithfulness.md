---
sidebar_position: 50
description: 'Check citation attribution in RAG answers: does each [N] marker point to a passage that actually supports its claim?'
---

# Citation faithfulness

Checks whether every `[N]` citation marker in the answer points to a passage that actually supports the specific claim the marker is attached to.

**Use when**: Your RAG system produces answers with inline citations (`[1]`, `[2]`, ...) and you need each citation to be attributed to the right passage, not just supported by the context somewhere.

**How it works**: An LLM judge reads the question, the numbered passages, and the answer. It returns a binary verdict. An answer is `faithful` only if every claim is supported and every citation marker points to a passage that supports the claim it is attached to. It is `unfaithful` if any claim is unsupported or misattributed.

This is stricter than [`context-faithfulness`](/docs/configuration/expected-outputs/model-graded/context-faithfulness). Context-faithfulness asks whether a claim is supported by the context _anywhere_. Citation-faithfulness additionally checks that the cited passage is the one that supports the claim. It catches misattribution: a claim cited to passage `[1]` that does not support it, even when another passage `[2]` in the context would.

**Example**:

```text
Passages:
  [1] The Eiffel Tower stands 330 metres tall in Paris.
  [2] The Eiffel Tower was completed in 1889.
Answer: "The Eiffel Tower was completed in 1889 [1]."
Verdict: unfaithful (the completion-year claim is cited to [1], which only covers height)
```

`context-faithfulness` would pass this answer because the claim is supported by passage `[2]`. `citation-faithfulness` fails it because the citation points to the wrong passage.

## Configuration

```yaml
assert:
  - type: citation-faithfulness
```

### Required fields

- `query` - User's question (in test vars)
- `context` - Reference passages, provided as an array so each entry is numbered `[1]`, `[2]`, ... (in vars or via `contextTransform`)
- `threshold` - Minimum score 0-1 (default: 1). The score is `1.0` for a faithful answer and `0.0` for an unfaithful one, so the default requires a faithful verdict to pass.

The answer under test should contain `[N]` citation markers that refer to the passage numbers.

### Full example

```yaml
tests:
  - vars:
      query: 'How tall is the Eiffel Tower and when was it completed?'
      context:
        - 'The Eiffel Tower stands 330 metres tall in Paris.'
        - 'The Eiffel Tower was completed in 1889 for the World Fair.'
    assert:
      - type: citation-faithfulness
```

When `context` is an array, each entry is automatically numbered (`[1] ...`, `[2] ...`) before being shown to the judge, so the `[N]` markers in the answer resolve to the right passage. If you pass `context` as a single string, it is used as-is, so embed your own `[N]` markers in that case.

### Dynamic context extraction

For RAG systems that return their retrieved passages alongside the answer:

```yaml
# Provider returns { answer: "...", passages: ["...", "..."] }
assert:
  - type: citation-faithfulness
    # Select the answer string for grading (the check requires string output)...
    transform: 'output.answer'
    # ...while contextTransform reads the passages from the original response.
    contextTransform: 'output.passages'
```

### Custom grading

Override the default grader:

```yaml
assert:
  - type: citation-faithfulness
    provider: gpt-5 # Use a different model for grading
```

## Limitations

- Depends on judge LLM quality
- Best results when context is supplied as an array of passages that match the `[N]` markers in the answer
- Performance degrades with very long contexts

## Related metrics

- [`context-faithfulness`](/docs/configuration/expected-outputs/model-graded/context-faithfulness) - Is the output supported by context anywhere?
- [`context-relevance`](/docs/configuration/expected-outputs/model-graded/context-relevance) - Is retrieved context relevant?
- [`context-recall`](/docs/configuration/expected-outputs/model-graded/context-recall) - Does context support the expected answer?

## Further reading

- [Defining context in test cases](/docs/configuration/expected-outputs/model-graded#defining-context)
- [RAG Evaluation Guide](/docs/guides/evaluate-rag)
