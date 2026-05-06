---
title: 'Interface: AssertionSet'
description: 'Grouped assertions evaluated under one shared threshold.'
---

## Import

```ts
import type { AssertionSet } from 'promptfoo';
```

Defined in: [types/index.ts:950](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L950)

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

Defined in: [types/index.ts:954](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L954)

Sub-assertions to run as one grouped assertion set.

---

### config?

> `optional` **config?**: `Record`\<`string`, `any`\>

Defined in: [types/index.ts:962](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L962)

Shared custom config passed into every assertion in the set.

---

### metric?

> `optional` **metric?**: `string`

Defined in: [types/index.ts:958](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L958)

Optional metric name used to expose the grouped score.

---

### threshold?

> `optional` **threshold?**: `number`

Defined in: [types/index.ts:960](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L960)

Required score for the set; without one, the set is graded pass/fail.

---

### type

> **type**: `"assert-set"`

Defined in: [types/index.ts:952](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L952)

Assertion-set discriminator.

---

### weight?

> `optional` **weight?**: `number`

Defined in: [types/index.ts:956](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L956)

Weight of this assertion set relative to other assertions. Defaults to `1`.
