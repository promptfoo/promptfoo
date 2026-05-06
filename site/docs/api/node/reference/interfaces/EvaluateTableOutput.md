---
title: 'Interface: EvaluateTableOutput'
description: 'One provider output cell in an eval table.'
---

## Import

```ts
import type { EvaluateTableOutput } from 'promptfoo';
```

Defined in: [types/index.ts:576](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L576)

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

Defined in: [types/index.ts:610](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L610)

Audio attachment associated with this output, when present.

---

### cost

> **cost**: `number`

Defined in: [types/index.ts:578](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L578)

Estimated cost attributed to this provider result.

---

### error?

> `optional` **error?**: `string` \| `null`

Defined in: [types/index.ts:608](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L608)

Error message when this output failed before normal grading.

---

### failureReason

> **failureReason**: `ResultFailureReason`

Defined in: [types/index.ts:580](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L580)

Failure category used when rendering an error or failed assertion.

---

### gradingResult?

> `optional` **gradingResult?**: [`GradingResult`](GradingResult.md) \| `null`

Defined in: [types/index.ts:582](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L582)

Assertion result for this provider output, when grading has run.

---

### id

> **id**: `string`

Defined in: [types/index.ts:584](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L584)

Stable result id.

---

### images?

> `optional` **images?**: [`ImageOutput`](ImageOutput.md)[]

Defined in: [types/index.ts:614](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L614)

Image attachments associated with this output, when present.

---

### latencyMs

> **latencyMs**: `number`

Defined in: [types/index.ts:586](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L586)

Provider latency in milliseconds.

---

### metadata?

> `optional` **metadata?**: `Record`\<`string`, `any`\>

Defined in: [types/index.ts:588](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L588)

Additional result metadata preserved for advanced consumers.

---

### namedScores

> **namedScores**: `Record`\<`string`, `number`\>

Defined in: [types/index.ts:590](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L590)

Named metric scores emitted by assertions for this output.

---

### pass

> **pass**: `boolean`

Defined in: [types/index.ts:592](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L592)

Whether this output passed all configured assertions.

---

### prompt

> **prompt**: `string`

Defined in: [types/index.ts:594](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L594)

Rendered prompt associated with this provider output.

---

### provider?

> `optional` **provider?**: `string`

Defined in: [types/index.ts:596](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L596)

Provider id or label shown for this output.

---

### response?

> `optional` **response?**: [`ProviderResponse`](ProviderResponse.md)

Defined in: [types/index.ts:598](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L598)

Raw provider response returned before table normalization.

---

### score

> **score**: `number`

Defined in: [types/index.ts:600](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L600)

Aggregate score for this output.

---

### testCase

> **testCase**: [`AtomicTestCase`](AtomicTestCase.md)

Defined in: [types/index.ts:602](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L602)

Test case associated with this output.

---

### text

> **text**: `string`

Defined in: [types/index.ts:604](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L604)

Rendered output text shown in table views.

---

### tokenUsage?

> `optional` **tokenUsage?**: `Partial`\<[`TokenUsage`](TokenUsage.md)\>

Defined in: [types/index.ts:606](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L606)

Token usage attributed to this output.

---

### video?

> `optional` **video?**: [`VideoOutput`](VideoOutput.md)

Defined in: [types/index.ts:612](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L612)

Video attachment associated with this output, when present.
