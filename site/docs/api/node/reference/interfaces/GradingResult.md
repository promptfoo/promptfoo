---
title: 'Interface: GradingResult'
description: 'Result returned by assertions and matcher helpers.'
---

## Import

```ts
import type { GradingResult } from 'promptfoo';
```

Defined in: [types/index.ts:758](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L758)

Result returned by assertions and matcher helpers.

## Example

```ts
const result: GradingResult = {
  pass: true,
  score: 1,
  reason: 'Matched expected text',
};
```

## Properties

### assertion?

> `optional` **assertion?**: `object`

Defined in: [types/index.ts:781](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L781)

Assertion that produced this result, when retained by the caller.

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

### comment?

> `optional` **comment?**: `string`

Defined in: [types/index.ts:784](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L784)

Optional user-authored comment attached to the result.

---

### componentResults?

> `optional` **componentResults?**: `GradingResult`[]

Defined in: [types/index.ts:778](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L778)

Component results for compound assertions such as assertion sets.

---

### metadata?

> `optional` **metadata?**: `object`

Defined in: [types/index.ts:790](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L790)

Additional assertion-specific metadata.

#### Index Signature

\[`key`: `string`\]: `any`

#### context?

> `optional` **context?**: `string` \| `string`[]

Context value used by context-related assertions.

#### contextUnits?

> `optional` **contextUnits?**: `string`[]

Normalized context fragments used by context-related assertions.

#### graderError?

> `optional` **graderError?**: `true`

Set when a grader transport or parse failure prevented a real eval.
Inverse assertions must not flip this into a pass; the field is only
meaningful when present.

#### graderOutputs?

> `optional` **graderOutputs?**: `Record`\<`string`, `string`\>

Raw textual responses returned by one or more LLM grader phases.

#### pluginId?

> `optional` **pluginId?**: `string`

Red-team plugin id associated with the result, when applicable.

#### renderedAssertionValue?

> `optional` **renderedAssertionValue?**: `string`

Rendered assertion value after variable substitution.

#### renderedGradingPrompt?

> `optional` **renderedGradingPrompt?**: `string`

Full prompt sent to the grading LLM, retained for debugging.

#### strategyId?

> `optional` **strategyId?**: `string`

Red-team strategy id associated with the result, when applicable.

---

### namedScores?

> `optional` **namedScores?**: `Record`\<`string`, `number`\>

Defined in: [types/index.ts:769](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L769)

Map of named metric values emitted by the assertion.

---

### namedScoreWeights?

> `optional` **namedScoreWeights?**: `Record`\<`string`, `number`\>

Defined in: [types/index.ts:772](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L772)

Total weight contributing to each named score.

---

### pass

> **pass**: `boolean`

Defined in: [types/index.ts:760](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L760)

Whether the test passed or failed.

---

### reason

> **reason**: `string`

Defined in: [types/index.ts:766](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L766)

Plain-text explanation suitable for logs and reports.

---

### score

> **score**: `number`

Defined in: [types/index.ts:763](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L763)

Test score, typically between 0 and 1.

---

### suggestions?

> `optional` **suggestions?**: `ResultSuggestion`[]

Defined in: [types/index.ts:787](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L787)

Follow-up suggestions produced by some graders.

---

### tokensUsed?

> `optional` **tokensUsed?**: [`TokenUsage`](TokenUsage.md)

Defined in: [types/index.ts:775](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L775)

Token usage attributed to the assertion or grader.
