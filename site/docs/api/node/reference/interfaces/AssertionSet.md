[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / AssertionSet

# Interface: AssertionSet

Defined in: [types/index.ts:953](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L953)

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

Defined in: [types/index.ts:957](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L957)

Sub-assertions to run as one grouped assertion set.

---

### config?

> `optional` **config?**: `Record`\<`string`, `any`\>

Defined in: [types/index.ts:965](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L965)

Shared custom config passed into every assertion in the set.

---

### metric?

> `optional` **metric?**: `string`

Defined in: [types/index.ts:961](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L961)

Optional metric name used to expose the grouped score.

---

### threshold?

> `optional` **threshold?**: `number`

Defined in: [types/index.ts:963](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L963)

Required score for the set; without one, the set is graded pass/fail.

---

### type

> **type**: `"assert-set"`

Defined in: [types/index.ts:955](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L955)

Assertion-set discriminator.

---

### weight?

> `optional` **weight?**: `number`

Defined in: [types/index.ts:959](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L959)

Weight of this assertion set relative to other assertions. Defaults to `1`.
