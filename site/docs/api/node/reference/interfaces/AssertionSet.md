---
title: 'Interface: AssertionSet'
description: 'Grouped assertions evaluated under one shared threshold.'
---

## Import

```ts
import type { AssertionSet } from 'promptfoo';
```

Defined in: [types/index.ts:994](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L994)

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

> **assert**: [`Assertion`](Assertion.md)[]

Defined in: [types/index.ts:998](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L998)

Sub-assertions to run as one grouped assertion set.

---

### config?

> `optional` **config?**: `Record`\<`string`, `any`\>

Defined in: [types/index.ts:1006](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1006)

Shared custom config passed into every assertion in the set.

---

### metric?

> `optional` **metric?**: `string`

Defined in: [types/index.ts:1002](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1002)

Optional metric name used to expose the grouped score.

---

### threshold?

> `optional` **threshold?**: `number`

Defined in: [types/index.ts:1004](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1004)

Required score for the set; without one, the set is graded pass/fail.

---

### type

> **type**: `"assert-set"`

Defined in: [types/index.ts:996](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L996)

Assertion-set discriminator.

---

### weight?

> `optional` **weight?**: `number`

Defined in: [types/index.ts:1000](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1000)

Weight of this assertion set relative to other assertions. Defaults to `1`.
