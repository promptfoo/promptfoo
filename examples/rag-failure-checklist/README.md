# RAG Failure Checklist Eval Starter

This example shows how to model a small set of common RAG and agent failure patterns as reproducible promptfoo evaluations.

The goal is not to define a full benchmarking framework.

Instead, this starter gives users a practical way to test a few high-signal failure modes that often show up in real pipelines:

- retrieval mismatch
- weak grounding
- context drift across steps
- overconfident unsupported answers
- stale context carryover

## Why this example exists

In many RAG and agent workflows, failures do not look like obvious crashes.

The system may return a fluent answer, but the answer can still be wrong because:

- retrieved context does not match the question
- the answer is not grounded in the provided evidence
- later steps drift away from the original task
- the model sounds confident without support
- old context leaks into the current turn

This example provides a small eval starter for those patterns.

## What is included

This folder contains:

- `promptfooconfig.yaml` with a small set of starter test cases
- this README with usage notes and expected interpretation

## What this example is for

Use this example if you want to:

- create a lightweight RAG reliability smoke test
- evaluate common failure patterns before shipping changes
- adapt a few starter scenarios to your own prompts, tools, or retrieval stack
- turn vague quality complaints into reproducible eval cases

## What this example is not

This example is not:

- a complete benchmark for every RAG failure mode
- tied to any specific vector database or retrieval framework
- a replacement for end-to-end system tracing
- a claim that one prompt or one assertion type is sufficient for production evaluation

It is intentionally small so that the integration path is easy to review and extend.

## Starter failure patterns

### 1. Retrieval mismatch

The question is reasonable, but the retrieved context does not actually support the expected answer.

Typical symptom:

- the model answers from the wrong passage
- the answer follows nearby but irrelevant content
- the system appears to have "retrieved something" but not the right thing

### 2. Weak grounding

The answer sounds plausible, but the retrieved context does not justify the claim.

Typical symptom:

- correct tone, weak evidence
- unsupported specifics
- answer contains details not present in the context

### 3. Context drift across steps

A later step in the workflow slowly moves away from the original task or instruction.

Typical symptom:

- the first response is acceptable
- follow-up behavior becomes less aligned
- summaries or intermediate rewrites introduce drift

### 4. Overconfident unsupported answers

The model responds with high confidence even when the context is incomplete or ambiguous.

Typical symptom:

- no hedging where uncertainty should exist
- direct answer when the evidence is missing
- strong claims without support

### 5. Stale context carryover

Context from a previous turn or task leaks into the current response.

Typical symptom:

- old facts appear in a new answer
- current question is answered using outdated assumptions
- prior state contaminates an otherwise independent task

## How to run

From the repository root:

```bash
npm install
npm run local -- eval --config examples/rag-failure-checklist/promptfooconfig.yaml
````

## What to look for in results

This starter is most useful when you inspect results pattern by pattern.

Questions to ask:

* Did the model stay grounded in the supplied context?
* Did it avoid inventing details that were not provided?
* Did it preserve the correct task boundary across steps?
* Did it express uncertainty when support was weak?
* Did prior context leak into the current response?

## How to adapt this example

The easiest way to extend this starter is to replace the sample cases with your own:

* swap in your own retrieved passages
* use your real prompts or system instructions
* add assertions that match your reliability requirements
* duplicate the existing pattern structure for new failure cases

A good next step is to turn your most common support or QA complaints into eval cases.

## Suggested extension path

If you want to expand this starter later, a practical order is:

1. add more retrieval mismatch cases
2. add harder grounding tests with partial evidence
3. add multi-turn drift scenarios
4. add tool-augmented or agent routing failures
5. add regressions from real incidents

## Verification note

This example is intentionally small and example-first.

The intended integration path is:

* keep the starter easy to run
* make failure patterns concrete
* let users replace the sample cases with their own RAG or agent workflows

If the shape is useful, it can be extended into a broader set of reusable eval templates later.
