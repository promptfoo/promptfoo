# RAG Failure Mode Eval Examples

This example shows how to map common retrieval-augmented generation (RAG) failure modes to concrete Promptfoo eval scenarios.

Promptfoo already supports RAG evaluation through assertions such as `context-recall`, `context-relevance`, deterministic string checks, and model-graded rubrics. This example is not a new RAG framework or a new assertion type. It is a starter checklist for deciding which eval to write when a RAG system fails.

## Failure modes covered

| Failure mode                       | What it looks like                                                                    | Suggested eval pattern                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Missing retrieved context          | The retrieved context does not contain the information needed to answer the question. | Use `context-recall` or deterministic `contains-all` checks against expected source text.                |
| Irrelevant retrieved context       | The retrieved chunks are on the wrong topic or too weak to support the answer.        | Use `context-relevance` or rubric-based checks.                                                          |
| Answer ignores available context   | The context contains the answer, but the model answers incorrectly or generically.    | Check for expected answer details with `contains`, `contains-all`, or `llm-rubric`.                      |
| Answer overclaims beyond context   | The model adds details that are not present in the retrieved context.                 | Use `llm-rubric` for judgment-based checks, or deterministic `not-contains` checks for known overclaims. |
| Fabricated citation or source      | The answer cites a source ID or document that was not retrieved.                      | Use `contains`, `not-contains`, regex, or JavaScript assertions for expected source IDs.                 |
| Metadata/source not preserved      | The answer gives a plausible response but drops required source/page metadata.        | Use deterministic assertions for required metadata patterns.                                             |
| Conflicting context not surfaced   | Retrieved chunks disagree, but the answer silently chooses one.                       | Use rubric assertions requiring the answer to mention conflict or uncertainty.                           |
| Refusal despite sufficient context | The model refuses or says it lacks information even though the context is enough.     | Use `not-contains` for refusal phrases and `contains` for expected answer details.                       |

## How to run

From this directory:

```bash
promptfoo eval -c promptfooconfig.yaml
promptfoo view
```

Or from the repository root during local development:

```bash
npm run local -- eval --config examples/rag-failure-modes/promptfooconfig.yaml
```

Expected result:

```text
6 passed
2 failed
0 errors
```

The two failures are intentional. They demonstrate Promptfoo catching bad RAG cases where the retrieved context is missing or irrelevant. In a real project, these failing cases should trigger retrieval or chunking fixes before deployment.

## How to adapt this example

1. Replace the sample questions with your own RAG test cases.
2. Replace the static outputs with responses from your RAG pipeline.
3. Add expected source IDs, page numbers, or document names to `vars`.
4. Pick assertions based on the failure mode you want to catch.
5. Run this in CI to detect regressions when retrieval, chunking, prompts, or source documents change.

## Notes

- `context-recall` and `context-relevance` are useful when evaluating retrieved context quality.
- Deterministic checks such as `contains`, `contains-all`, and `not-contains` are useful for required answer strings, source IDs, or refusal phrases.
- `llm-rubric` is useful when the failure mode requires judgment, such as overclaiming beyond context or failing to surface conflicting sources.
- This example intentionally avoids adding new Promptfoo internals or new assertion semantics.
