[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / AssertionInput

# Interface: AssertionInput

Defined in: [assertions/index.ts:373](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L373)

Assertion input accepted by `runAssertion()`.

This wrapper keeps the low-level assertion API docs readable while preserving
the full assertion shape used by eval configuration.

## Extends

- [`Assertion`](Assertion.md)

## Properties

### config?

> `optional` **config?**: `Record`\<`string`, `any`\>

Defined in: [types/index.ts:768](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L768)

#### Inherited from

[`Assertion`](Assertion.md).[`config`](Assertion.md#config)

---

### contextTransform?

> `optional` **contextTransform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [types/index.ts:789](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L789)

#### Inherited from

[`Assertion`](Assertion.md).[`contextTransform`](Assertion.md#contexttransform)

---

### metric?

> `optional` **metric?**: `string`

Defined in: [types/index.ts:783](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L783)

#### Inherited from

[`Assertion`](Assertion.md).[`metric`](Assertion.md#metric)

---

### provider?

> `optional` **provider?**: `any`

Defined in: [types/index.ts:777](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L777)

#### Inherited from

[`Assertion`](Assertion.md).[`provider`](Assertion.md#provider)

---

### rubricPrompt?

> `optional` **rubricPrompt?**: `string` \| `string`[] \| `object`[]

Defined in: [types/index.ts:780](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L780)

#### Inherited from

[`Assertion`](Assertion.md).[`rubricPrompt`](Assertion.md#rubricprompt)

---

### threshold?

> `optional` **threshold?**: `number`

Defined in: [types/index.ts:771](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L771)

#### Inherited from

[`Assertion`](Assertion.md).[`threshold`](Assertion.md#threshold)

---

### transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [types/index.ts:786](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L786)

#### Inherited from

[`Assertion`](Assertion.md).[`transform`](Assertion.md#transform)

---

### type

> **type**: `"regex"` \| `"moderation"` \| `` `promptfoo:redteam:${string}` `` \| `"cost"` \| `"factuality"` \| `"answer-relevance"` \| `"bleu"` \| `"classifier"` \| `"contains"` \| `"contains-all"` \| `"contains-any"` \| `"contains-html"` \| `"contains-json"` \| `"contains-sql"` \| `"contains-xml"` \| `"context-faithfulness"` \| `"context-recall"` \| `"context-relevance"` \| `"conversation-relevance"` \| `"equals"` \| `"finish-reason"` \| `"g-eval"` \| `"gleu"` \| `"guardrails"` \| `"icontains"` \| `"icontains-all"` \| `"icontains-any"` \| `"is-html"` \| `"is-json"` \| `"is-refusal"` \| `"is-sql"` \| `"is-valid-function-call"` \| `"is-valid-openai-function-call"` \| `"is-valid-openai-tools-call"` \| `"is-xml"` \| `"javascript"` \| `"latency"` \| `"levenshtein"` \| `"llm-rubric"` \| `"pi"` \| `"meteor"` \| `"model-graded-closedqa"` \| `"model-graded-factuality"` \| `"perplexity"` \| `"perplexity-score"` \| `"python"` \| `"rouge-n"` \| `"ruby"` \| `"similar"` \| `"similar:cosine"` \| `"similar:dot"` \| `"similar:euclidean"` \| `"starts-with"` \| `"tool-call-f1"` \| `"skill-used"` \| `"trajectory:goal-success"` \| `"trajectory:tool-args-match"` \| `"trajectory:step-count"` \| `"trajectory:tool-sequence"` \| `"trajectory:tool-used"` \| `"trace-error-spans"` \| `"trace-span-count"` \| `"trace-span-duration"` \| `"search-rubric"` \| `"webhook"` \| `"word-count"` \| `"not-regex"` \| `"not-moderation"` \| `"not-cost"` \| `"not-factuality"` \| `"not-answer-relevance"` \| `"not-bleu"` \| `"not-classifier"` \| `"not-contains"` \| `"not-contains-all"` \| `"not-contains-any"` \| `"not-contains-html"` \| `"not-contains-json"` \| `"not-contains-sql"` \| `"not-contains-xml"` \| `"not-context-faithfulness"` \| `"not-context-recall"` \| `"not-context-relevance"` \| `"not-conversation-relevance"` \| `"not-equals"` \| `"not-finish-reason"` \| `"not-g-eval"` \| `"not-gleu"` \| `"not-guardrails"` \| `"not-icontains"` \| `"not-icontains-all"` \| `"not-icontains-any"` \| `"not-is-html"` \| `"not-is-json"` \| `"not-is-refusal"` \| `"not-is-sql"` \| `"not-is-valid-function-call"` \| `"not-is-valid-openai-function-call"` \| `"not-is-valid-openai-tools-call"` \| `"not-is-xml"` \| `"not-javascript"` \| `"not-latency"` \| `"not-levenshtein"` \| `"not-llm-rubric"` \| `"not-pi"` \| `"not-meteor"` \| `"not-model-graded-closedqa"` \| `"not-model-graded-factuality"` \| `"not-perplexity"` \| `"not-perplexity-score"` \| `"not-python"` \| `"not-rouge-n"` \| `"not-ruby"` \| `"not-similar"` \| `"not-similar:cosine"` \| `"not-similar:dot"` \| `"not-similar:euclidean"` \| `"not-starts-with"` \| `"not-tool-call-f1"` \| `"not-skill-used"` \| `"not-trajectory:goal-success"` \| `"not-trajectory:tool-args-match"` \| `"not-trajectory:step-count"` \| `"not-trajectory:tool-sequence"` \| `"not-trajectory:tool-used"` \| `"not-trace-error-spans"` \| `"not-trace-span-count"` \| `"not-trace-span-duration"` \| `"not-search-rubric"` \| `"not-webhook"` \| `"not-word-count"` \| `"select-best"` \| `"human"` \| `"max-score"` = `AssertionTypeSchema`

Defined in: [types/index.ts:761](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L761)

#### Inherited from

[`Assertion`](Assertion.md).[`type`](Assertion.md#type)

---

### value?

> `optional` **value?**: `AssertionValue`

Defined in: [types/index.ts:764](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L764)

#### Inherited from

[`Assertion`](Assertion.md).[`value`](Assertion.md#value)

---

### weight?

> `optional` **weight?**: `number`

Defined in: [types/index.ts:774](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L774)

#### Inherited from

[`Assertion`](Assertion.md).[`weight`](Assertion.md#weight)
