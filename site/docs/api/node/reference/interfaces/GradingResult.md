---
title: 'Interface: GradingResult'
---

Defined in: [types/index.ts:741](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L741)

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

> `optional` **assertion?**: [`Assertion`](Assertion.md)

Defined in: [types/index.ts:764](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L764)

Assertion that produced this result, when retained by the caller.

---

### comment?

> `optional` **comment?**: `string`

Defined in: [types/index.ts:767](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L767)

Optional user-authored comment attached to the result.

---

### componentResults?

> `optional` **componentResults?**: `GradingResult`[]

Defined in: [types/index.ts:761](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L761)

Component results for compound assertions such as assertion sets.

---

### metadata?

> `optional` **metadata?**: `object`

Defined in: [types/index.ts:773](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L773)

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

Defined in: [types/index.ts:752](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L752)

Map of named metric values emitted by the assertion.

---

### namedScoreWeights?

> `optional` **namedScoreWeights?**: `Record`\<`string`, `number`\>

Defined in: [types/index.ts:755](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L755)

Total weight contributing to each named score.

---

### pass

> **pass**: `boolean`

Defined in: [types/index.ts:743](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L743)

Whether the test passed or failed.

---

### reason

> **reason**: `string`

Defined in: [types/index.ts:749](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L749)

Plain-text explanation suitable for logs and reports.

---

### score

> **score**: `number`

Defined in: [types/index.ts:746](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L746)

Test score, typically between 0 and 1.

---

### suggestions?

> `optional` **suggestions?**: `ResultSuggestion`[]

Defined in: [types/index.ts:770](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L770)

Follow-up suggestions produced by some graders.

---

### tokensUsed?

> `optional` **tokensUsed?**: [`TokenUsage`](TokenUsage.md)

Defined in: [types/index.ts:758](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L758)

Token usage attributed to the assertion or grader.
