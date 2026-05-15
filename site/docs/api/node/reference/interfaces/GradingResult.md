---
title: 'Interface: GradingResult'
description: 'Result returned by assertions and matcher helpers.'
---

## Import

```ts
import type { GradingResult } from 'promptfoo';
```

Defined in: [types/index.ts:797](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L797)

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

Defined in: [types/index.ts:820](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L820)

Assertion that produced this result, when retained by the caller.

---

### comment?

> `optional` **comment?**: `string`

Defined in: [types/index.ts:823](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L823)

Optional user-authored comment attached to the result.

---

### componentResults?

> `optional` **componentResults?**: `GradingResult`[]

Defined in: [types/index.ts:817](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L817)

Component results for compound assertions such as assertion sets.

---

### metadata?

> `optional` **metadata?**: `object`

Defined in: [types/index.ts:829](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L829)

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

Defined in: [types/index.ts:808](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L808)

Map of named metric values emitted by the assertion.

---

### namedScoreWeights?

> `optional` **namedScoreWeights?**: `Record`\<`string`, `number`\>

Defined in: [types/index.ts:811](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L811)

Total weight contributing to each named score.

---

### pass

> **pass**: `boolean`

Defined in: [types/index.ts:799](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L799)

Whether the test passed or failed.

---

### reason

> **reason**: `string`

Defined in: [types/index.ts:805](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L805)

Plain-text explanation suitable for logs and reports.

---

### score

> **score**: `number`

Defined in: [types/index.ts:802](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L802)

Test score, typically between 0 and 1.

---

### suggestions?

> `optional` **suggestions?**: `ResultSuggestion`[]

Defined in: [types/index.ts:826](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L826)

Follow-up suggestions produced by some graders.

---

### tokensUsed?

> `optional` **tokensUsed?**: [`TokenUsage`](TokenUsage.md)

Defined in: [types/index.ts:814](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L814)

Token usage attributed to the assertion or grader.
