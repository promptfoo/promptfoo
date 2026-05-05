[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / Assertion

# Interface: Assertion

Defined in: [types/index.ts:794](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L794)

Assertion configuration accepted by eval tests and low-level assertion APIs.

## Properties

### config?

> `optional` **config?**: `Record`\<`string`, `any`\>

Defined in: [types/index.ts:764](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L764)

---

### contextTransform?

> `optional` **contextTransform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [types/index.ts:785](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L785)

---

### metric?

> `optional` **metric?**: `string`

Defined in: [types/index.ts:779](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L779)

---

### provider?

> `optional` **provider?**: `any`

Defined in: [types/index.ts:773](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L773)

---

### rubricPrompt?

> `optional` **rubricPrompt?**: `string` \| `string`[] \| `object`[]

Defined in: [types/index.ts:776](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L776)

---

### threshold?

> `optional` **threshold?**: `number`

Defined in: [types/index.ts:767](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L767)

---

### transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [types/index.ts:782](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L782)

---

### type

> **type**: `"regex"` \| `"moderation"` \| `"answer-relevance"` \| `"bleu"` \| `"classifier"` \| `"contains"` \| `"contains-all"` \| `"contains-any"` \| `"contains-html"` \| `"contains-json"` \| `"contains-sql"` \| `"contains-xml"` \| `"context-faithfulness"` \| `"context-recall"` \| `"context-relevance"` \| `"conversation-relevance"` \| `"cost"` \| `"equals"` \| `"factuality"` \| `"finish-reason"` \| `"g-eval"` \| `"gleu"` \| `"guardrails"` \| `"icontains"` \| `"icontains-all"` \| `"icontains-any"` \| `"is-html"` \| `"is-json"` \| `"is-refusal"` \| `"is-sql"` \| `"is-valid-function-call"` \| `"is-valid-openai-function-call"` \| `"is-valid-openai-tools-call"` \| `"is-xml"` \| `"javascript"` \| `"latency"` \| `"levenshtein"` \| `"llm-rubric"` \| `"pi"` \| `"meteor"` \| `"model-graded-closedqa"` \| `"model-graded-factuality"` \| `"perplexity"` \| `"perplexity-score"` \| `"python"` \| `"rouge-n"` \| `"ruby"` \| `"similar"` \| `"similar:cosine"` \| `"similar:dot"` \| `"similar:euclidean"` \| `"starts-with"` \| `"tool-call-f1"` \| `"skill-used"` \| `"trajectory:goal-success"` \| `"trajectory:tool-args-match"` \| `"trajectory:step-count"` \| `"trajectory:tool-sequence"` \| `"trajectory:tool-used"` \| `"trace-error-spans"` \| `"trace-span-count"` \| `"trace-span-duration"` \| `"search-rubric"` \| `"webhook"` \| `"word-count"` \| `"not-regex"` \| `"not-moderation"` \| `"not-answer-relevance"` \| `"not-bleu"` \| `"not-classifier"` \| `"not-contains"` \| `"not-contains-all"` \| `"not-contains-any"` \| `"not-contains-html"` \| `"not-contains-json"` \| `"not-contains-sql"` \| `"not-contains-xml"` \| `"not-context-faithfulness"` \| `"not-context-recall"` \| `"not-context-relevance"` \| `"not-conversation-relevance"` \| `"not-cost"` \| `"not-equals"` \| `"not-factuality"` \| `"not-finish-reason"` \| `"not-g-eval"` \| `"not-gleu"` \| `"not-guardrails"` \| `"not-icontains"` \| `"not-icontains-all"` \| `"not-icontains-any"` \| `"not-is-html"` \| `"not-is-json"` \| `"not-is-refusal"` \| `"not-is-sql"` \| `"not-is-valid-function-call"` \| `"not-is-valid-openai-function-call"` \| `"not-is-valid-openai-tools-call"` \| `"not-is-xml"` \| `"not-javascript"` \| `"not-latency"` \| `"not-levenshtein"` \| `"not-llm-rubric"` \| `"not-pi"` \| `"not-meteor"` \| `"not-model-graded-closedqa"` \| `"not-model-graded-factuality"` \| `"not-perplexity"` \| `"not-perplexity-score"` \| `"not-python"` \| `"not-rouge-n"` \| `"not-ruby"` \| `"not-similar"` \| `"not-similar:cosine"` \| `"not-similar:dot"` \| `"not-similar:euclidean"` \| `"not-starts-with"` \| `"not-tool-call-f1"` \| `"not-skill-used"` \| `"not-trajectory:goal-success"` \| `"not-trajectory:tool-args-match"` \| `"not-trajectory:step-count"` \| `"not-trajectory:tool-sequence"` \| `"not-trajectory:tool-used"` \| `"not-trace-error-spans"` \| `"not-trace-span-count"` \| `"not-trace-span-duration"` \| `"not-search-rubric"` \| `"not-webhook"` \| `"not-word-count"` \| `"select-best"` \| `"human"` \| `"max-score"` \| `` `promptfoo:redteam:${string}` `` = `AssertionTypeSchema`

Defined in: [types/index.ts:757](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L757)

---

### value?

> `optional` **value?**: `AssertionValue`

Defined in: [types/index.ts:760](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L760)

---

### weight?

> `optional` **weight?**: `number`

Defined in: [types/index.ts:770](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L770)
