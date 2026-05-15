---
title: 'Interface: EvaluateTableOutput'
description: 'One provider output cell in an eval table.'
---

## Import

```ts
import type { EvaluateTableOutput } from 'promptfoo';
```

Defined in: [types/index.ts:577](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L577)

One provider output cell in an eval table.

## Example

```ts
import { ResultFailureReason } from 'promptfoo';

const output: EvaluateTableOutput = {
  cost: 0,
  failureReason: ResultFailureReason.NONE,
  id: 'result-1',
  latencyMs: 120,
  namedScores: { mentions_name: 1 },
  pass: true,
  prompt: 'Hello {{name}}',
  score: 1,
  testCase: { vars: { name: 'Ada' } },
  text: 'Hello Ada',
};
```

## Properties

### audio?

> `optional` **audio?**: [`AudioOutput`](AudioOutput.md)

Defined in: [types/index.ts:611](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L611)

Audio attachment associated with this output, when present.

---

### cost

> **cost**: `number`

Defined in: [types/index.ts:579](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L579)

Estimated cost attributed to this provider result.

---

### error?

> `optional` **error?**: `string` \| `null`

Defined in: [types/index.ts:609](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L609)

Error message when this output failed before normal grading.

---

### failureReason

> **failureReason**: `ResultFailureReason`

Defined in: [types/index.ts:581](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L581)

Failure category used when rendering an error or failed assertion.

---

### gradingResult?

> `optional` **gradingResult?**: [`GradingResult`](GradingResult.md) \| `null`

Defined in: [types/index.ts:583](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L583)

Assertion result for this provider output, when grading has run.

---

### id

> **id**: `string`

Defined in: [types/index.ts:585](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L585)

Stable result id.

---

### images?

> `optional` **images?**: [`ImageOutput`](ImageOutput.md)[]

Defined in: [types/index.ts:615](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L615)

Image attachments associated with this output, when present.

---

### latencyMs

> **latencyMs**: `number`

Defined in: [types/index.ts:587](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L587)

Provider latency in milliseconds.

---

### metadata?

> `optional` **metadata?**: `Record`\<`string`, `any`\>

Defined in: [types/index.ts:589](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L589)

Additional result metadata preserved for advanced consumers.

---

### namedScores

> **namedScores**: `Record`\<`string`, `number`\>

Defined in: [types/index.ts:591](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L591)

Named metric scores emitted by assertions for this output.

---

### pass

> **pass**: `boolean`

Defined in: [types/index.ts:593](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L593)

Whether this output passed all configured assertions.

---

### prompt

> **prompt**: `string`

Defined in: [types/index.ts:595](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L595)

Rendered prompt associated with this provider output.

---

### provider?

> `optional` **provider?**: `string`

Defined in: [types/index.ts:597](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L597)

Provider id or label shown for this output.

---

### response?

> `optional` **response?**: [`ProviderResponse`](ProviderResponse.md)

Defined in: [types/index.ts:599](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L599)

Raw provider response returned before table normalization.

---

### score

> **score**: `number`

Defined in: [types/index.ts:601](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L601)

Aggregate score for this output.

---

### testCase

> **testCase**: [`AtomicTestCase`](AtomicTestCase.md)

Defined in: [types/index.ts:603](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L603)

Test case associated with this output.

---

### text

> **text**: `string`

Defined in: [types/index.ts:605](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L605)

Rendered output text shown in table views.

---

### tokenUsage?

> `optional` **tokenUsage?**: `Partial`\<[`TokenUsage`](TokenUsage.md)\>

Defined in: [types/index.ts:607](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L607)

Token usage attributed to this output.

---

### video?

> `optional` **video?**: [`VideoOutput`](VideoOutput.md)

Defined in: [types/index.ts:613](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L613)

Video attachment associated with this output, when present.
