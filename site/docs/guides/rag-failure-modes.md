---
title: RAG Failure Modes
sidebar_position: 3
description: Diagnose common RAG failure modes and map each one to concrete Promptfoo assertions, starter tests, and debugging hints.
---

# RAG failure modes

When a RAG system fails, the first question is usually not "did the model fail?" but "_which_ part failed?"

This guide is a practical checklist for mapping common RAG failures to Promptfoo evals. Use it alongside the main [Evaluating RAG pipelines](/docs/guides/evaluate-rag) guide.

## Quick workflow

For each failing behavior:

1. Reproduce it with a small test case
2. Decide whether the problem is retrieval, generation, or both
3. Add the narrowest assertion that would have caught it
4. Keep one or two representative examples per failure mode in regression tests

## Failure-mode checklist

### 1. Missing retrieved context

**What it looks like**

The answer is wrong or incomplete because the retriever never returned the relevant document.

**Best signals**

- `contains` / `contains-all` on retrieval output
- `context-recall`
- `context-relevance` when you also want to inspect how much returned context is actually needed

**Starter test**

```yaml
prompts:
  - '{{ query }}'
providers:
  - file://retrieve.py

tests:
  - vars:
      query: What is our parental leave policy?
    assert:
      - type: contains-all
        value:
          - parental-leave.md
          - Maternity Leave
```

**Debug hint**

Check chunking, embedding choice, top-k, filters, and query rewriting.

### 2. Irrelevant retrieved context

**What it looks like**

The retriever returns documents, but they are noisy or unrelated to the user question.

**Best signals**

- `context-relevance` as a retrieval-focus signal
- `llm-rubric` for "retrieved documents are relevant"

**Starter test**

```yaml
tests:
  - vars:
      query: What is our parental leave policy?
      context: |
        handbook.md: Expense reimbursement requires manager approval above $500.
        security.md: Passwords must be rotated every 90 days.
    assert:
      - type: context-relevance
        threshold: 0.5
```

**Debug hint**

Inspect retrieval ranking, metadata filters, and whether the query is over-broad. `context-relevance` measures how much of the returned context is minimally needed, so interpret the score alongside the retrieved chunks rather than treating a higher score as universally better.

### 3. Context contains the answer, but the model ignores it

**What it looks like**

The right passage is present, but the answer uses prior knowledge, guesses, or a weaker claim.

**Best signals**

- `factuality`
- `context-faithfulness`
- `answer-relevance`

**Starter test**

```yaml
tests:
  - vars:
      query: What is the max purchase that does not require approval?
      context: |
        Employees can expense up to $500 without manager approval.
    assert:
      - type: factuality
        value: employees can expense up to $500 without manager approval
      - type: context-faithfulness
        threshold: 0.9
```

**Debug hint**

Tighten prompt instructions, reduce context clutter, and ensure the answer step sees the retrieved context verbatim.

### 4. Answer overclaims beyond the provided context

**What it looks like**

The response sounds plausible but adds unsupported details.

**Best signals**

- `context-faithfulness`
- `factuality`
- `llm-rubric` for "answer only uses provided context"

**Starter test**

```yaml
tests:
  - vars:
      query: What benefits are covered during parental leave?
      context: |
        Eligible employees can take up to 16 weeks of parental leave.
        The policy does not describe any meal or travel stipend.
    assert:
      - type: context-faithfulness
        threshold: 0.95
```

**Debug hint**

This often means the generator prompt is rewarding completeness over groundedness.

### 5. Fabricated citation or source

**What it looks like**

The model invents a document name, link, or citation span.

**Best signals**

- `javascript` assertion that validates cited sources against an allowlist or another authoritative source map
- `contains` or `regex` only as weak format checks when you already know the exact citation token you expect to appear

**Starter test**

```yaml
assert:
  - type: javascript
    value: |
      const allowed = ['handbook.md', 'benefits.pdf'];
      const cited = Array.from(output.matchAll(/[\w.-]+\.(?:md|pdf)/g)).map((m) => m[0]);
      return cited.length > 0 && cited.every((name) => allowed.includes(name));
```

**Debug hint**

If you require citations, test them directly instead of treating them as a side effect of answer quality.

### 6. Metadata or source attribution is not preserved

**What it looks like**

The answer is mostly right, but loses document names, section ids, page numbers, or URLs needed by the UI.

**Best signals**

- `contains`
- `contains-json`
- `is-json`
- schema assertions for structured outputs

**Starter test**

```yaml
assert:
  - type: is-json
  - type: contains-json
    value:
      type: object
      required:
        - source
      properties:
        source:
          const: handbook.md
```

**Debug hint**

Structured output usually works better than asking the model to mention metadata in free text.

### 7. Conflicting context is not surfaced

**What it looks like**

Two retrieved documents disagree, but the model answers with false confidence instead of noting the conflict.

**Best signals**

- `llm-rubric`
- `factuality`
- `contains-any`

**Starter test**

```yaml
assert:
  - type: llm-rubric
    value: The answer should acknowledge conflicting evidence when the retrieved documents disagree.
```

**Debug hint**

Add explicit prompt language for uncertainty handling and conflict reporting.

### 8. Refusal despite sufficient context

**What it looks like**

The retriever found enough information, but the model says it cannot answer.

**Best signals**

- `not-is-refusal`
- `answer-relevance`
- `factuality`

**Starter test**

```yaml
tests:
  - vars:
      query: How many weeks is maternity leave?
      context: |
        Eligible employees can take up to 16 weeks of maternity leave.
    assert:
      - type: not-is-refusal
      - type: answer-relevance
        threshold: 0.8
```

**Debug hint**

This can happen when safety instructions are too broad or the answer prompt is overly conservative.

## Recommended starter matrix

If you only add a small regression suite, cover at least:

- one retrieval miss
- one irrelevant-context case
- one grounding failure
- one citation/source failure
- one refusal-with-sufficient-context case

That set catches a surprising amount of real-world RAG breakage.

## Related examples

- [Evaluating RAG pipelines](/docs/guides/evaluate-rag)
- [`examples/eval-rag`](https://github.com/promptfoo/promptfoo/tree/main/examples/eval-rag)
- [`examples/eval-rag-full`](https://github.com/promptfoo/promptfoo/tree/main/examples/eval-rag-full)
