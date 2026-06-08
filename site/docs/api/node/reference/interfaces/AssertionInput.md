---
title: 'Interface: AssertionInput'
description: 'Assertion input accepted by runAssertion().'
sidebar_position: 3
---

## Import

```ts
import type { AssertionInput } from 'promptfoo';
```

Defined in: [assertions/index.ts:384](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L384)

Assertion input accepted by `runAssertion()`.

This wrapper keeps the low-level assertion API docs readable while preserving
the full assertion shape used by eval configuration.

## Example

```ts
const assertion: AssertionInput = {
  type: 'contains',
  value: 'Ada',
};
```

## Extends

- [`Assertion`](Assertion.md)

## Properties

### config?

> `optional` **config?**: `Record`\<`string`, `any`\>

Defined in: [types/index.ts:973](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L973)

Arbitrary custom config exposed to assertion callbacks through `context.config`.

#### Inherited from

[`Assertion`](Assertion.md).[`config`](Assertion.md#config)

---

### contextTransform?

> `optional` **contextTransform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [types/index.ts:994](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L994)

Extract assertion-specific context from output before grading.

#### Inherited from

[`Assertion`](Assertion.md).[`contextTransform`](Assertion.md#contexttransform)

---

### metric?

> `optional` **metric?**: `string`

Defined in: [types/index.ts:988](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L988)

Optional metric name used when the assertion contributes a named score.

#### Inherited from

[`Assertion`](Assertion.md).[`metric`](Assertion.md#metric)

---

### provider?

> `optional` **provider?**: `any`

Defined in: [types/index.ts:982](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L982)

Provider override used by model-graded assertions that need one.

#### Inherited from

[`Assertion`](Assertion.md).[`provider`](Assertion.md#provider)

---

### rubricPrompt?

> `optional` **rubricPrompt?**: `string` \| `string`[] \| `object`[]

Defined in: [types/index.ts:985](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L985)

Rubric override used by model-graded assertions.

#### Inherited from

[`Assertion`](Assertion.md).[`rubricPrompt`](Assertion.md#rubricprompt)

---

### threshold?

> `optional` **threshold?**: `number`

Defined in: [types/index.ts:976](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L976)

Minimum score required by threshold-aware assertions such as `similar`.

#### Inherited from

[`Assertion`](Assertion.md).[`threshold`](Assertion.md#threshold)

---

### transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [types/index.ts:991](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L991)

Transform provider output before this assertion runs.

#### Inherited from

[`Assertion`](Assertion.md).[`transform`](Assertion.md#transform)

---

### type

> **type**: `"regex"` \| `"moderation"` \| `` `promptfoo:redteam:${string}` `` \| `"cost"` \| `"factuality"` \| `"agent-rubric"` \| `"answer-relevance"` \| `"bleu"` \| `"classifier"` \| `"contains"` \| `"contains-all"` \| `"contains-any"` \| `"contains-html"` \| `"contains-json"` \| `"contains-sql"` \| `"contains-xml"` \| `"context-faithfulness"` \| `"context-recall"` \| `"context-relevance"` \| `"conversation-relevance"` \| `"equals"` \| `"finish-reason"` \| `"g-eval"` \| `"gleu"` \| `"guardrails"` \| `"icontains"` \| `"icontains-all"` \| `"icontains-any"` \| `"is-html"` \| `"is-json"` \| `"is-refusal"` \| `"is-sql"` \| `"is-valid-function-call"` \| `"is-valid-openai-function-call"` \| `"is-valid-openai-tools-call"` \| `"is-xml"` \| `"javascript"` \| `"latency"` \| `"levenshtein"` \| `"llm-rubric"` \| `"pi"` \| `"meteor"` \| `"model-graded-closedqa"` \| `"model-graded-factuality"` \| `"perplexity"` \| `"perplexity-score"` \| `"python"` \| `"rouge-n"` \| `"ruby"` \| `"similar"` \| `"similar:cosine"` \| `"similar:dot"` \| `"similar:euclidean"` \| `"starts-with"` \| `"tool-call-f1"` \| `"skill-used"` \| `"trajectory:goal-success"` \| `"trajectory:tool-args-match"` \| `"trajectory:step-count"` \| `"trajectory:tool-sequence"` \| `"trajectory:tool-used"` \| `"trace-error-spans"` \| `"trace-span-count"` \| `"trace-span-duration"` \| `"search-rubric"` \| `"webhook"` \| `"word-count"` \| `"not-regex"` \| `"not-moderation"` \| `"not-cost"` \| `"not-factuality"` \| `"not-agent-rubric"` \| `"not-answer-relevance"` \| `"not-bleu"` \| `"not-classifier"` \| `"not-contains"` \| `"not-contains-all"` \| `"not-contains-any"` \| `"not-contains-html"` \| `"not-contains-json"` \| `"not-contains-sql"` \| `"not-contains-xml"` \| `"not-context-faithfulness"` \| `"not-context-recall"` \| `"not-context-relevance"` \| `"not-conversation-relevance"` \| `"not-equals"` \| `"not-finish-reason"` \| `"not-g-eval"` \| `"not-gleu"` \| `"not-guardrails"` \| `"not-icontains"` \| `"not-icontains-all"` \| `"not-icontains-any"` \| `"not-is-html"` \| `"not-is-json"` \| `"not-is-refusal"` \| `"not-is-sql"` \| `"not-is-valid-function-call"` \| `"not-is-valid-openai-function-call"` \| `"not-is-valid-openai-tools-call"` \| `"not-is-xml"` \| `"not-javascript"` \| `"not-latency"` \| `"not-levenshtein"` \| `"not-llm-rubric"` \| `"not-pi"` \| `"not-meteor"` \| `"not-model-graded-closedqa"` \| `"not-model-graded-factuality"` \| `"not-perplexity"` \| `"not-perplexity-score"` \| `"not-python"` \| `"not-rouge-n"` \| `"not-ruby"` \| `"not-similar"` \| `"not-similar:cosine"` \| `"not-similar:dot"` \| `"not-similar:euclidean"` \| `"not-starts-with"` \| `"not-tool-call-f1"` \| `"not-skill-used"` \| `"not-trajectory:goal-success"` \| `"not-trajectory:tool-args-match"` \| `"not-trajectory:step-count"` \| `"not-trajectory:tool-sequence"` \| `"not-trajectory:tool-used"` \| `"not-trace-error-spans"` \| `"not-trace-span-count"` \| `"not-trace-span-duration"` \| `"not-search-rubric"` \| `"not-webhook"` \| `"not-word-count"` \| `"select-best"` \| `"human"` \| `"max-score"` = `AssertionTypeSchema`

Defined in: [types/index.ts:967](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L967)

Assertion kind to run, such as `contains`, `javascript`, or `llm-rubric`.

#### Inherited from

[`Assertion`](Assertion.md).[`type`](Assertion.md#type)

---

### value?

> `optional` **value?**: `AssertionValue`

Defined in: [types/index.ts:970](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L970)

Expected value or callback consumed by assertion types that need one.

#### Inherited from

[`Assertion`](Assertion.md).[`value`](Assertion.md#value)

---

### weight?

> `optional` **weight?**: `number`

Defined in: [types/index.ts:979](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L979)

Weight of this assertion relative to the rest of the test case. Defaults to `1`.

#### Inherited from

[`Assertion`](Assertion.md).[`weight`](Assertion.md#weight)
