---
title: 'Interface: Assertion'
---

Defined in: [types/index.ts:1005](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1005)

Assertion configuration accepted by eval tests and low-level assertion APIs.

## Example

```ts
const assertion: Assertion = {
  type: 'contains',
  value: 'Ada',
  metric: 'mentions_name',
};
```

## Extended by

- [`AssertionInput`](AssertionInput.md)

## Properties

### config?

> `optional` **config?**: `Record`\<`string`, `any`\>

Defined in: [types/index.ts:1011](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1011)

Arbitrary custom config exposed to assertion callbacks through `context.config`.

---

### contextTransform?

> `optional` **contextTransform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [types/index.ts:1025](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1025)

Extract assertion-specific context from output before grading.

---

### metric?

> `optional` **metric?**: `string`

Defined in: [types/index.ts:1021](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1021)

Optional metric name used when the assertion contributes a named score.

---

### provider?

> `optional` **provider?**: `any`

Defined in: [types/index.ts:1017](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1017)

Provider override used by model-graded assertions that need one.

---

### rubricPrompt?

> `optional` **rubricPrompt?**: `string` \| `string`[] \| `object`[]

Defined in: [types/index.ts:1019](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1019)

Rubric override used by model-graded assertions.

---

### threshold?

> `optional` **threshold?**: `number`

Defined in: [types/index.ts:1013](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1013)

Minimum score required by threshold-aware assertions such as `similar`.

---

### transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [types/index.ts:1023](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1023)

Transform provider output before this assertion runs.

---

### type

> **type**: `"regex"` \| `"moderation"` \| `` `promptfoo:redteam:${string}` `` \| `"cost"` \| `"factuality"` \| `"answer-relevance"` \| `"bleu"` \| `"classifier"` \| `"contains"` \| `"contains-all"` \| `"contains-any"` \| `"contains-html"` \| `"contains-json"` \| `"contains-sql"` \| `"contains-xml"` \| `"context-faithfulness"` \| `"context-recall"` \| `"context-relevance"` \| `"conversation-relevance"` \| `"equals"` \| `"finish-reason"` \| `"g-eval"` \| `"gleu"` \| `"guardrails"` \| `"icontains"` \| `"icontains-all"` \| `"icontains-any"` \| `"is-html"` \| `"is-json"` \| `"is-refusal"` \| `"is-sql"` \| `"is-valid-function-call"` \| `"is-valid-openai-function-call"` \| `"is-valid-openai-tools-call"` \| `"is-xml"` \| `"javascript"` \| `"latency"` \| `"levenshtein"` \| `"llm-rubric"` \| `"pi"` \| `"meteor"` \| `"model-graded-closedqa"` \| `"model-graded-factuality"` \| `"perplexity"` \| `"perplexity-score"` \| `"python"` \| `"rouge-n"` \| `"ruby"` \| `"similar"` \| `"similar:cosine"` \| `"similar:dot"` \| `"similar:euclidean"` \| `"starts-with"` \| `"tool-call-f1"` \| `"skill-used"` \| `"trajectory:goal-success"` \| `"trajectory:tool-args-match"` \| `"trajectory:step-count"` \| `"trajectory:tool-sequence"` \| `"trajectory:tool-used"` \| `"trace-error-spans"` \| `"trace-span-count"` \| `"trace-span-duration"` \| `"search-rubric"` \| `"webhook"` \| `"word-count"` \| `"not-regex"` \| `"not-moderation"` \| `"not-cost"` \| `"not-factuality"` \| `"not-answer-relevance"` \| `"not-bleu"` \| `"not-classifier"` \| `"not-contains"` \| `"not-contains-all"` \| `"not-contains-any"` \| `"not-contains-html"` \| `"not-contains-json"` \| `"not-contains-sql"` \| `"not-contains-xml"` \| `"not-context-faithfulness"` \| `"not-context-recall"` \| `"not-context-relevance"` \| `"not-conversation-relevance"` \| `"not-equals"` \| `"not-finish-reason"` \| `"not-g-eval"` \| `"not-gleu"` \| `"not-guardrails"` \| `"not-icontains"` \| `"not-icontains-all"` \| `"not-icontains-any"` \| `"not-is-html"` \| `"not-is-json"` \| `"not-is-refusal"` \| `"not-is-sql"` \| `"not-is-valid-function-call"` \| `"not-is-valid-openai-function-call"` \| `"not-is-valid-openai-tools-call"` \| `"not-is-xml"` \| `"not-javascript"` \| `"not-latency"` \| `"not-levenshtein"` \| `"not-llm-rubric"` \| `"not-pi"` \| `"not-meteor"` \| `"not-model-graded-closedqa"` \| `"not-model-graded-factuality"` \| `"not-perplexity"` \| `"not-perplexity-score"` \| `"not-python"` \| `"not-rouge-n"` \| `"not-ruby"` \| `"not-similar"` \| `"not-similar:cosine"` \| `"not-similar:dot"` \| `"not-similar:euclidean"` \| `"not-starts-with"` \| `"not-tool-call-f1"` \| `"not-skill-used"` \| `"not-trajectory:goal-success"` \| `"not-trajectory:tool-args-match"` \| `"not-trajectory:step-count"` \| `"not-trajectory:tool-sequence"` \| `"not-trajectory:tool-used"` \| `"not-trace-error-spans"` \| `"not-trace-span-count"` \| `"not-trace-span-duration"` \| `"not-search-rubric"` \| `"not-webhook"` \| `"not-word-count"` \| `"select-best"` \| `"human"` \| `"max-score"`

Defined in: [types/index.ts:1007](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1007)

Assertion kind to run, such as `contains`, `javascript`, or `llm-rubric`.

---

### value?

> `optional` **value?**: `AssertionValue`

Defined in: [types/index.ts:1009](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1009)

Expected value or callback consumed by assertion types that need one.

---

### weight?

> `optional` **weight?**: `number`

Defined in: [types/index.ts:1015](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1015)

Weight of this assertion relative to the rest of the test case. Defaults to `1`.
