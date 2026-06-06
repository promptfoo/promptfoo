---
title: 'Interface: AssertionSet'
description: 'Grouped assertions evaluated under one shared threshold.'
---

## Import

```ts
import type { AssertionSet } from 'promptfoo';
```

Defined in: [types/index.ts:962](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L962)

Grouped assertions evaluated under one shared threshold.

## Example

```ts
const assertionSet: AssertionSet = {
  type: 'assert-set',
  threshold: 0.8,
  assert: [
    { type: 'contains', value: 'Ada' },
    { type: 'llm-rubric', value: 'Answer is concise' },
  ],
};
```

## Properties

### assert

> **assert**: `object`[]

Defined in: [types/index.ts:932](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L932)

Sub-assertions to run as one grouped assertion set.

#### config?

> `optional` **config?**: `Record`\<`string`, `any`\>

Arbitrary custom config exposed to assertion callbacks through `context.config`.

#### contextTransform?

> `optional` **contextTransform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Extract assertion-specific context from output before grading.

#### metric?

> `optional` **metric?**: `string`

Optional metric name used when the assertion contributes a named score.

#### provider?

> `optional` **provider?**: `any`

Provider override used by model-graded assertions that need one.

#### rubricPrompt?

> `optional` **rubricPrompt?**: `string` \| `string`[] \| `object`[]

Rubric override used by model-graded assertions.

#### threshold?

> `optional` **threshold?**: `number`

Minimum score required by threshold-aware assertions such as `similar`.

#### transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Transform provider output before this assertion runs.

#### type

> **type**: `"regex"` \| `"moderation"` \| `` `promptfoo:redteam:${string}` `` \| `"cost"` \| `"factuality"` \| `"agent-rubric"` \| `"answer-relevance"` \| `"bleu"` \| `"classifier"` \| `"contains"` \| `"contains-all"` \| `"contains-any"` \| `"contains-html"` \| `"contains-json"` \| `"contains-sql"` \| `"contains-xml"` \| `"context-faithfulness"` \| `"context-recall"` \| `"context-relevance"` \| `"conversation-relevance"` \| `"equals"` \| `"finish-reason"` \| `"g-eval"` \| `"gleu"` \| `"guardrails"` \| `"icontains"` \| `"icontains-all"` \| `"icontains-any"` \| `"is-html"` \| `"is-json"` \| `"is-refusal"` \| `"is-sql"` \| `"is-valid-function-call"` \| `"is-valid-openai-function-call"` \| `"is-valid-openai-tools-call"` \| `"is-xml"` \| `"javascript"` \| `"latency"` \| `"levenshtein"` \| `"llm-rubric"` \| `"pi"` \| `"meteor"` \| `"model-graded-closedqa"` \| `"model-graded-factuality"` \| `"perplexity"` \| `"perplexity-score"` \| `"python"` \| `"rouge-n"` \| `"ruby"` \| `"similar"` \| `"similar:cosine"` \| `"similar:dot"` \| `"similar:euclidean"` \| `"starts-with"` \| `"tool-call-f1"` \| `"skill-used"` \| `"trajectory:goal-success"` \| `"trajectory:tool-args-match"` \| `"trajectory:step-count"` \| `"trajectory:tool-sequence"` \| `"trajectory:tool-used"` \| `"trace-error-spans"` \| `"trace-span-count"` \| `"trace-span-duration"` \| `"search-rubric"` \| `"webhook"` \| `"word-count"` \| `"not-regex"` \| `"not-moderation"` \| `"not-cost"` \| `"not-factuality"` \| `"not-agent-rubric"` \| `"not-answer-relevance"` \| `"not-bleu"` \| `"not-classifier"` \| `"not-contains"` \| `"not-contains-all"` \| `"not-contains-any"` \| `"not-contains-html"` \| `"not-contains-json"` \| `"not-contains-sql"` \| `"not-contains-xml"` \| `"not-context-faithfulness"` \| `"not-context-recall"` \| `"not-context-relevance"` \| `"not-conversation-relevance"` \| `"not-equals"` \| `"not-finish-reason"` \| `"not-g-eval"` \| `"not-gleu"` \| `"not-guardrails"` \| `"not-icontains"` \| `"not-icontains-all"` \| `"not-icontains-any"` \| `"not-is-html"` \| `"not-is-json"` \| `"not-is-refusal"` \| `"not-is-sql"` \| `"not-is-valid-function-call"` \| `"not-is-valid-openai-function-call"` \| `"not-is-valid-openai-tools-call"` \| `"not-is-xml"` \| `"not-javascript"` \| `"not-latency"` \| `"not-levenshtein"` \| `"not-llm-rubric"` \| `"not-pi"` \| `"not-meteor"` \| `"not-model-graded-closedqa"` \| `"not-model-graded-factuality"` \| `"not-perplexity"` \| `"not-perplexity-score"` \| `"not-python"` \| `"not-rouge-n"` \| `"not-ruby"` \| `"not-similar"` \| `"not-similar:cosine"` \| `"not-similar:dot"` \| `"not-similar:euclidean"` \| `"not-starts-with"` \| `"not-tool-call-f1"` \| `"not-skill-used"` \| `"not-trajectory:goal-success"` \| `"not-trajectory:tool-args-match"` \| `"not-trajectory:step-count"` \| `"not-trajectory:tool-sequence"` \| `"not-trajectory:tool-used"` \| `"not-trace-error-spans"` \| `"not-trace-span-count"` \| `"not-trace-span-duration"` \| `"not-search-rubric"` \| `"not-webhook"` \| `"not-word-count"` \| `"select-best"` \| `"human"` \| `"max-score"` = `AssertionTypeSchema`

Assertion kind to run, such as `contains`, `javascript`, or `llm-rubric`.

#### value?

> `optional` **value?**: `AssertionValue`

Expected value or callback consumed by assertion types that need one.

#### weight?

> `optional` **weight?**: `number`

Weight of this assertion relative to the rest of the test case. Defaults to `1`.

---

### config?

> `optional` **config?**: `Record`\<`string`, `any`\>

Defined in: [types/index.ts:941](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L941)

Shared custom config passed into every assertion in the set.

---

### metric?

> `optional` **metric?**: `string`

Defined in: [types/index.ts:936](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L936)

Optional metric name used to expose the grouped score.

---

### threshold?

> `optional` **threshold?**: `number`

Defined in: [types/index.ts:938](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L938)

Required score for the set; without one, the set is graded pass/fail.

---

### type

> **type**: `"assert-set"`

Defined in: [types/index.ts:930](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L930)

---

### weight?

> `optional` **weight?**: `number`

Defined in: [types/index.ts:934](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L934)

Weight of this assertion set relative to other assertions. Defaults to `1`.
