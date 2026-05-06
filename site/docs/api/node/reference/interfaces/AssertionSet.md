---
title: 'Interface: AssertionSet'
---

Defined in: [types/index.ts:943](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L943)

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

Defined in: [types/index.ts:947](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L947)

Sub-assertions to run as one grouped assertion set.

---

### config?

> `optional` **config?**: `Record`\<`string`, `any`\>

Defined in: [types/index.ts:955](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L955)

Shared custom config passed into every assertion in the set.

---

### metric?

> `optional` **metric?**: `string`

Defined in: [types/index.ts:951](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L951)

Optional metric name used to expose the grouped score.

---

### threshold?

> `optional` **threshold?**: `number`

Defined in: [types/index.ts:953](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L953)

Required score for the set; without one, the set is graded pass/fail.

---

### type

> **type**: `"assert-set"`

Defined in: [types/index.ts:945](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L945)

Assertion-set discriminator.

---

### weight?

> `optional` **weight?**: `number`

Defined in: [types/index.ts:949](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L949)

Weight of this assertion set relative to other assertions. Defaults to `1`.
