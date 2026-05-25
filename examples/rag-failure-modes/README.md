# rag-failure-modes (RAG Failure Mode Eval Examples)

This example shows how to map common retrieval-augmented generation (RAG) failure modes to concrete Promptfoo eval scenarios.

Promptfoo already supports RAG evaluation through assertions such as `context-recall`, `context-relevance`, deterministic string checks, and model-graded rubrics. This example is not a new RAG framework or a new assertion type. It is a starter checklist for deciding which eval to write when a RAG system fails.

The runnable config uses deterministic `answer` fixtures for response checks and JavaScript assertions over `context.vars.context` for retrieval checks. The `echo` prompt stays limited to the answer fixture so an assertion cannot pass just because expected evidence was echoed in the prompt.

## Failure modes covered

| Failure mode                       | What it looks like                                                                    | Suggested eval pattern                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Missing retrieved context          | The retrieved context does not contain the information needed to answer the question. | Check `context.vars.context` deterministically, or use `context-recall` with real model output.          |
| Irrelevant retrieved context       | The retrieved chunks are on the wrong topic or too weak to support the answer.        | Check retrieved source text deterministically, or use `context-relevance` with real model output.        |
| Answer ignores available context   | The context contains the answer, but the model answers incorrectly or generically.    | Check for expected answer details with `contains`, `contains-all`, or `llm-rubric`.                      |
| Answer overclaims beyond context   | The model adds details that are not present in the retrieved context.                 | Use `llm-rubric` for judgment-based checks, or deterministic `not-contains` checks for known overclaims. |
| Fabricated citation or source      | The answer cites a source ID or document that was not retrieved.                      | Use JavaScript to verify that every cited source appears in the retrieved context.                       |
| Metadata/source not preserved      | The answer gives a plausible response but drops required source/page metadata.        | Use deterministic assertions for required metadata patterns.                                             |
| Conflicting context not surfaced   | Retrieved chunks disagree, but the answer silently chooses one.                       | Require conflict language with `icontains`, or use a rubric for broader uncertainty handling.            |
| Refusal despite sufficient context | The model refuses or says it lacks information even though the context is enough.     | Use `not-icontains` for refusal phrases and `contains` for expected answer details.                      |

## How to run

Initialize the example:

```bash
npx promptfoo@latest init --example rag-failure-modes
```

From the initialized example directory:

```bash
PROMPTFOO_PASS_RATE_THRESHOLD=0 npx promptfoo@latest eval -c promptfooconfig.yaml
npx promptfoo@latest view
```

Or from the repository root during local development:

```bash
PROMPTFOO_PASS_RATE_THRESHOLD=0 npm run local -- eval -c examples/rag-failure-modes/promptfooconfig.yaml --no-cache -o output.json
```

Expected result:

```text
6 passed
2 failed
0 errors
```

The two failures are intentional. The missing and irrelevant retrieval cases run JavaScript assertions directly against `context.vars.context`, so they fail even though their answer fixtures responsibly acknowledge that evidence is absent. The remaining cases test answer behavior. In a real project, replace the fixtures with your pipeline output and consider `context-recall` or `context-relevance` when model-graded retrieval checks are appropriate.

`PROMPTFOO_PASS_RATE_THRESHOLD=0` keeps this intentional-failure demonstration from exiting nonzero before you can inspect the report. Remove it in CI when failures should fail the build.

## How to adapt this example

1. Replace the sample queries with your own RAG test cases.
2. Replace the static outputs with responses from your RAG pipeline.
3. Add expected source IDs, page numbers, or document names to `vars`.
4. Pick assertions based on the failure mode you want to catch.
5. Run this in CI to detect regressions when retrieval, chunking, prompts, or source documents change.

## Notes

- `context-recall` and `context-relevance` are useful when evaluating retrieved context quality with a configured grading provider.
- Deterministic JavaScript checks over `context.vars.context` let you validate required retrieved evidence without a grading provider.
- Deterministic checks such as `contains`, `contains-all`, and `not-icontains` are useful for required answer strings, source IDs, or refusal phrases.
- `llm-rubric` is useful when the failure mode requires judgment, such as overclaiming beyond context or failing to surface conflicting sources.
- This example intentionally avoids adding new Promptfoo internals or new assertion semantics.
